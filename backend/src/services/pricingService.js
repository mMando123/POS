const { Op } = require('sequelize')
const { Menu, PriceList, PriceListItem, PromotionRule, Coupon } = require('../models')
const { loadSettings } = require('../routes/settings')
const { resolveSelectedOptions, composeItemNotes } = require('../utils/menuOptions')

class PricingService {
    static round2(value) {
        return Math.round((parseFloat(value || 0) + Number.EPSILON) * 100) / 100
    }

    static normalizeCouponCode(value) {
        const raw = String(value || '').trim().replace(/\s+/g, '')
        if (!raw) return ''

        const ARABIC_INDIC_ZERO = 0x0660
        const EASTERN_ARABIC_ZERO = 0x06f0

        const normalizedDigits = raw.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (char) => {
            const code = char.charCodeAt(0)
            if (code >= 0x0660 && code <= 0x0669) {
                return String(code - ARABIC_INDIC_ZERO)
            }
            if (code >= 0x06f0 && code <= 0x06f9) {
                return String(code - EASTERN_ARABIC_ZERO)
            }
            return char
        })

        return normalizedDigits.toUpperCase()
    }

    static isTrueValue(value, defaultValue = false) {
        if (value == null) return defaultValue
        const normalized = String(value).trim().toLowerCase()
        return normalized === '1' || normalized === 'true' || normalized === 'yes'
    }

    static activeWindowFilter(now = new Date()) {
        return {
            [Op.and]: [
                {
                    [Op.or]: [
                        { starts_at: null },
                        { starts_at: { [Op.lte]: now } }
                    ]
                },
                {
                    [Op.or]: [
                        { ends_at: null },
                        { ends_at: { [Op.gte]: now } }
                    ]
                }
            ]
        }
    }

    static calcDiscount(baseAmount, discountType, discountValue) {
        const base = this.round2(baseAmount)
        const value = this.round2(discountValue)
        if (base <= 0 || value <= 0) return 0

        let discount = 0
        if (discountType === 'percent') {
            discount = this.round2((base * value) / 100)
        } else {
            discount = value
        }
        return Math.min(base, Math.max(0, this.round2(discount)))
    }

    static getLoyaltyConfig() {
        const settings = loadSettings()
        const loyalty = settings?.store?.loyalty || {}

        const pointValue = Number(loyalty.pointValue ?? settings?.store?.loyaltyPointValue ?? 0.1)
        const earnRate = Number(loyalty.earnRate ?? settings?.store?.loyaltyEarnRate ?? 0.05)
        const maxRedeemPercent = Number(loyalty.maxRedeemPercent ?? settings?.store?.loyaltyMaxRedeemPercent ?? 50)

        return {
            pointValue: Number.isFinite(pointValue) && pointValue > 0 ? pointValue : 0.1,
            earnRate: Number.isFinite(earnRate) && earnRate >= 0 ? earnRate : 0.05,
            maxRedeemPercent: Number.isFinite(maxRedeemPercent) && maxRedeemPercent > 0
                ? Math.min(100, maxRedeemPercent)
                : 50
        }
    }

    static estimateEarnPoints(netAmount) {
        const { earnRate } = this.getLoyaltyConfig()
        return Math.max(0, Math.floor(this.round2(netAmount) * earnRate))
    }

    static calculateLoyaltyRedemption({ customer, requestedPoints, subtotalAvailable }) {
        const requested = Math.max(0, parseInt(requestedPoints || 0, 10))
        if (!requested) {
            return { requestedPoints: 0, pointsUsed: 0, discount: 0, pointValue: this.getLoyaltyConfig().pointValue }
        }
        if (!customer) {
            throw new Error('LOYALTY_CUSTOMER_REQUIRED')
        }

        const customerBalance = parseInt(customer.loyalty_points || 0, 10)
        if (customerBalance < requested) {
            throw new Error('LOYALTY_POINTS_INSUFFICIENT')
        }

        const availableSubtotal = this.round2(subtotalAvailable)
        if (availableSubtotal <= 0) {
            return { requestedPoints: requested, pointsUsed: 0, discount: 0, pointValue: this.getLoyaltyConfig().pointValue }
        }

        const { pointValue, maxRedeemPercent } = this.getLoyaltyConfig()
        const maxAllowedByPercent = this.round2((availableSubtotal * maxRedeemPercent) / 100)
        const requestedValue = this.round2(requested * pointValue)
        const allowedValue = this.round2(Math.min(availableSubtotal, maxAllowedByPercent, requestedValue))

        const pointsUsed = Math.min(requested, Math.floor(allowedValue / pointValue))
        const discount = this.round2(pointsUsed * pointValue)

        return {
            requestedPoints: requested,
            pointsUsed,
            discount,
            pointValue
        }
    }

    static async resolveCouponDiscount({ couponCode, subtotal, branchId, now = new Date(), transaction = null }) {
        if (!couponCode) return { coupon: null, discount: 0 }

        const code = this.normalizeCouponCode(couponCode)
        if (!code) return { coupon: null, discount: 0 }

        const allowCrossBranchFallback = this.isTrueValue(process.env.COUPON_ALLOW_CROSS_BRANCH_FALLBACK, true)
        const branchScope = branchId ? [{ branch_id: null }, { branch_id: branchId }] : [{ branch_id: null }]

        let coupon = await Coupon.findOne({
            where: {
                code,
                is_active: true,
                [Op.or]: branchScope
            },
            ...(transaction ? { transaction } : {})
        })

        if (!coupon) {
            const activeCouponAnyBranch = await Coupon.findOne({
                where: {
                    code,
                    is_active: true
                },
                ...(transaction ? { transaction } : {})
            })

            if (!activeCouponAnyBranch) throw new Error('COUPON_NOT_FOUND')

            const hasBranchMismatch =
                branchId &&
                activeCouponAnyBranch.branch_id &&
                String(activeCouponAnyBranch.branch_id) !== String(branchId)

            if (hasBranchMismatch && !allowCrossBranchFallback) {
                throw new Error('COUPON_BRANCH_MISMATCH')
            }

            coupon = activeCouponAnyBranch
        }

        if (coupon.starts_at && now < new Date(coupon.starts_at)) throw new Error('COUPON_NOT_STARTED')
        if (coupon.ends_at && now > new Date(coupon.ends_at)) throw new Error('COUPON_EXPIRED')

        const minOrderAmount = this.round2(coupon.min_order_amount || 0)
        if (minOrderAmount > 0 && this.round2(subtotal) < minOrderAmount) {
            throw new Error('COUPON_MIN_ORDER_NOT_MET')
        }
        if (coupon.usage_limit && Number(coupon.used_count || 0) >= Number(coupon.usage_limit)) {
            throw new Error('COUPON_USAGE_LIMIT_REACHED')
        }

        let discount = this.calcDiscount(subtotal, coupon.discount_type, coupon.discount_value)
        if (coupon.max_discount_amount) {
            discount = this.round2(Math.min(discount, this.round2(coupon.max_discount_amount)))
        }
        if (discount <= 0) throw new Error('COUPON_DISCOUNT_ZERO')

        return { coupon, discount }
    }

    static async resolveLinePrice({
        menuItem,
        quantity,
        branchId,
        priceListId = null,
        now = new Date(),
        transaction = null
    }) {
        const basePrice = this.round2(menuItem.price)

        const priceListWhere = {
            is_active: true,
            ...this.activeWindowFilter(now),
            [Op.or]: [{ branch_id: null }, { branch_id: branchId }]
        }
        if (priceListId) {
            priceListWhere.id = priceListId
        }

        const item = await PriceListItem.findOne({
            where: {
                menu_id: menuItem.id,
                is_active: true,
                min_quantity: { [Op.lte]: Math.max(1, parseInt(quantity || 1, 10)) }
            },
            include: [{
                model: PriceList,
                as: 'priceList',
                where: priceListWhere,
                required: true
            }],
            order: [
                [{ model: PriceList, as: 'priceList' }, 'priority', 'DESC'],
                ['min_quantity', 'DESC'],
                ['updated_at', 'DESC']
            ],
            ...(transaction ? { transaction } : {})
        })

        if (!item) {
            return {
                unitPrice: basePrice,
                basePrice,
                source: 'menu',
                priceListId: null,
                priceListName: null,
                priceListItemId: null
            }
        }

        const unitPrice = this.round2(item.price)
        return {
            unitPrice,
            basePrice,
            source: 'price_list',
            priceListId: item.price_list_id,
            priceListName: item.priceList?.name || null,
            priceListItemId: item.id
        }
    }

    static async calculatePromotionDiscount({
        branchId,
        orderItems,
        subtotal,
        now = new Date(),
        transaction = null
    }) {
        const promotions = await PromotionRule.findAll({
            where: {
                is_active: true,
                ...this.activeWindowFilter(now),
                [Op.or]: [{ branch_id: null }, { branch_id: branchId }]
            },
            order: [['priority', 'DESC'], ['created_at', 'ASC']],
            ...(transaction ? { transaction } : {})
        })

        let runningBase = this.round2(subtotal)
        let totalDiscount = 0
        const appliedPromotions = []

        for (const promo of promotions) {
            if (runningBase <= 0) break

            let discount = 0
            const minOrderAmount = this.round2(promo.min_order_amount || 0)
            if (runningBase < minOrderAmount) continue

            if (promo.applies_to === 'order') {
                discount = this.calcDiscount(runningBase, promo.discount_type, promo.discount_value)
            } else {
                for (const item of orderItems) {
                    const qty = parseInt(item.quantity || 0, 10)
                    if (qty <= 0) continue
                    if (promo.menu_id && item.menu_id !== promo.menu_id) continue
                    if (qty < parseInt(promo.min_quantity || 1, 10)) continue

                    discount = this.round2(discount + this.calcDiscount(
                        this.round2(item.total_price),
                        promo.discount_type,
                        promo.discount_value
                    ))
                }
            }

            if (promo.max_discount_amount) {
                discount = Math.min(discount, this.round2(promo.max_discount_amount))
            }

            discount = this.round2(Math.min(discount, runningBase))
            if (discount <= 0) continue

            runningBase = this.round2(runningBase - discount)
            totalDiscount = this.round2(totalDiscount + discount)
            appliedPromotions.push({
                id: promo.id,
                name: promo.name,
                applies_to: promo.applies_to,
                discount_type: promo.discount_type,
                discount_value: this.round2(promo.discount_value),
                discount_amount: discount
            })

            if (!promo.stackable) break
        }

        return {
            discount: this.round2(totalDiscount),
            appliedPromotions
        }
    }

    static async buildOrderDraft({
        branchId,
        items,
        manualDiscount = 0,
        couponCode = null,
        customer = null,
        redeemPoints = 0,
        priceListId = null,
        now = new Date(),
        transaction = null
    }) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('ORDER_ITEMS_REQUIRED')
        }

        const orderItems = []
        const appliedPriceLists = []
        let subtotal = 0
        let priceListSavings = 0

        for (const inputItem of items) {
            const menuItem = await Menu.findByPk(
                inputItem.menu_id,
                transaction ? { transaction } : {}
            )
            if (!menuItem) {
                throw new Error(`MENU_ITEM_NOT_FOUND:${inputItem.menu_id}`)
            }

            const quantity = Math.max(1, parseInt(inputItem.quantity || 1, 10))
            const optionsResolution = resolveSelectedOptions(menuItem.option_groups, inputItem.selected_options)
            const linePricing = await this.resolveLinePrice({
                menuItem,
                quantity,
                branchId,
                priceListId,
                now,
                transaction
            })

            const unitPrice = this.round2(linePricing.unitPrice + optionsResolution.priceDelta)
            const lineTotal = this.round2(unitPrice * quantity)
            const baseLineTotal = this.round2((this.round2(menuItem.price) + optionsResolution.priceDelta) * quantity)
            const lineSaving = this.round2(Math.max(0, baseLineTotal - lineTotal))

            subtotal = this.round2(subtotal + lineTotal)
            priceListSavings = this.round2(priceListSavings + lineSaving)

            if (linePricing.priceListId) {
                appliedPriceLists.push({
                    id: linePricing.priceListId,
                    name: linePricing.priceListName
                })
            }

            orderItems.push({
                menu_id: menuItem.id,
                item_name_ar: menuItem.name_ar,
                item_name_en: menuItem.name_en,
                quantity,
                unit_price: unitPrice,
                total_price: lineTotal,
                batch_number: inputItem.batch_number || null,
                selected_options: optionsResolution.selectedOptions,
                options_summary: optionsResolution.summaryText,
                option_price_delta: this.round2(optionsResolution.priceDelta),
                notes: composeItemNotes(inputItem.notes || null, optionsResolution.summaryText),
                pricing_source: linePricing.source,
                base_price: this.round2(menuItem.price),
                track_stock: Boolean(menuItem.track_stock)
            })
        }

        const promotionResult = await this.calculatePromotionDiscount({
            branchId,
            orderItems,
            subtotal,
            now,
            transaction
        })
        const promotionDiscount = this.round2(promotionResult.discount)

        const manual = this.round2(Math.max(0, manualDiscount))
        const manualApplied = this.round2(Math.min(manual, Math.max(0, subtotal - promotionDiscount)))
        const afterPromotionAndManual = this.round2(Math.max(0, subtotal - promotionDiscount - manualApplied))

        const couponResult = await this.resolveCouponDiscount({
            couponCode,
            subtotal: afterPromotionAndManual,
            branchId,
            now,
            transaction
        })
        const couponDiscount = this.round2(couponResult.discount || 0)

        const afterCoupon = this.round2(Math.max(0, afterPromotionAndManual - couponDiscount))
        const loyaltyResult = this.calculateLoyaltyRedemption({
            customer,
            requestedPoints: redeemPoints,
            subtotalAvailable: afterCoupon
        })
        const loyaltyDiscount = this.round2(loyaltyResult.discount || 0)

        const totalDiscount = this.round2(promotionDiscount + manualApplied + couponDiscount + loyaltyDiscount)
        const discountedSubtotal = this.round2(Math.max(0, subtotal - totalDiscount))

        const settings = loadSettings()
        const configuredTaxRate = Number(settings?.store?.taxRate)
        const taxRatePercent = Number.isFinite(configuredTaxRate) && configuredTaxRate >= 0
            ? configuredTaxRate
            : 15
        const taxRate = taxRatePercent / 100
        const tax = this.round2(discountedSubtotal * taxRate)
        const total = this.round2(discountedSubtotal + tax)

        const uniquePriceLists = Array.from(new Map(appliedPriceLists.map((x) => [x.id, x])).values())
        const resolvedPriceListId = priceListId || uniquePriceLists[0]?.id || null
        const estimatedEarnPoints = this.estimateEarnPoints(discountedSubtotal)

        return {
            orderItems,
            subtotal,
            discount: totalDiscount,
            discountedSubtotal,
            taxRate,
            tax,
            total,
            priceListId: resolvedPriceListId,
            couponEntity: couponResult.coupon || null,
            components: {
                priceListSavings,
                promotionDiscount,
                manualDiscount: manualApplied,
                couponDiscount,
                loyaltyDiscount
            },
            applied: {
                priceLists: uniquePriceLists,
                promotions: promotionResult.appliedPromotions,
                coupon: couponResult.coupon
                    ? {
                        id: couponResult.coupon.id,
                        code: couponResult.coupon.code,
                        name: couponResult.coupon.name
                    }
                    : null,
                loyalty: {
                    requestedPoints: loyaltyResult.requestedPoints,
                    pointsUsed: loyaltyResult.pointsUsed,
                    pointValue: loyaltyResult.pointValue,
                    estimatedEarnPoints
                }
            }
        }
    }
}

module.exports = PricingService
