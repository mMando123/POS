const { Customer, LoyaltyLedger, Order } = require('../models')
const PricingService = require('./pricingService')

class LoyaltyService {
    static async getCustomerSummaryByPhone(phone, { transaction = null } = {}) {
        const customer = await Customer.findOne({
            where: { phone },
            ...(transaction ? { transaction } : {})
        })
        if (!customer) return null
        return this.getCustomerSummary(customer.id, { transaction })
    }

    static async getCustomerSummary(customerId, { transaction = null } = {}) {
        const customer = await Customer.findByPk(customerId, {
            ...(transaction ? { transaction } : {})
        })
        if (!customer) return null

        const rows = await LoyaltyLedger.findAll({
            where: { customer_id: customerId },
            order: [['created_at', 'DESC']],
            limit: 100,
            ...(transaction ? { transaction } : {})
        })

        const earned = rows
            .filter((x) => parseInt(x.points || 0, 10) > 0)
            .reduce((sum, x) => sum + parseInt(x.points || 0, 10), 0)
        const redeemed = rows
            .filter((x) => parseInt(x.points || 0, 10) < 0)
            .reduce((sum, x) => sum + Math.abs(parseInt(x.points || 0, 10)), 0)

        return {
            customer: {
                id: customer.id,
                phone: customer.phone,
                name: customer.name,
                loyalty_points: parseInt(customer.loyalty_points || 0, 10)
            },
            totals: {
                earned_points: earned,
                redeemed_points: redeemed,
                balance_points: parseInt(customer.loyalty_points || 0, 10)
            },
            ledger: rows
        }
    }

    static async adjustPoints({
        customerId,
        points,
        notes = null,
        branchId = null,
        createdBy = null,
        transaction = null
    }) {
        const adjustment = parseInt(points || 0, 10)
        if (!adjustment) throw new Error('LOYALTY_ADJUSTMENT_REQUIRED')

        const customer = await Customer.findByPk(customerId, {
            ...(transaction ? { transaction } : {})
        })
        if (!customer) throw new Error('CUSTOMER_NOT_FOUND')

        const current = parseInt(customer.loyalty_points || 0, 10)
        const next = current + adjustment
        if (next < 0) throw new Error('LOYALTY_NEGATIVE_BALANCE')

        await customer.update(
            { loyalty_points: next },
            transaction ? { transaction } : {}
        )

        const ledger = await LoyaltyLedger.create({
            customer_id: customer.id,
            order_id: null,
            branch_id: branchId,
            entry_type: 'adjust',
            points: adjustment,
            notes: notes || `Manual loyalty adjustment: ${adjustment}`,
            created_by: createdBy
        }, transaction ? { transaction } : {})

        return { customer, ledger, oldBalance: current, newBalance: next }
    }

    static async applyLoyaltyOnOrderCompletion(order, { userId = null, transaction = null } = {}) {
        if (!order?.customer_id) {
            return {
                redeemedPoints: 0,
                earnedPoints: 0,
                customerBalance: null
            }
        }

        const customer = await Customer.findByPk(order.customer_id, {
            ...(transaction ? { transaction } : {})
        })
        if (!customer) throw new Error('CUSTOMER_NOT_FOUND')

        const existing = await LoyaltyLedger.findAll({
            where: { order_id: order.id, customer_id: order.customer_id },
            ...(transaction ? { transaction } : {})
        })

        const hasRedeem = existing.some((x) => x.entry_type === 'redeem')
        const hasEarn = existing.some((x) => x.entry_type === 'earn')

        const redeemPoints = Math.max(0, parseInt(order.loyalty_points_redeemed || 0, 10))
        let earnedPoints = Math.max(0, parseInt(order.loyalty_points_earned || 0, 10))
        if (!earnedPoints) {
            earnedPoints = PricingService.estimateEarnPoints(order.total)
        }

        let balance = parseInt(customer.loyalty_points || 0, 10)

        if (redeemPoints > 0 && !hasRedeem) {
            if (balance < redeemPoints) {
                throw new Error('LOYALTY_POINTS_INSUFFICIENT_AT_FINALIZATION')
            }
            balance -= redeemPoints
            await customer.update({ loyalty_points: balance }, transaction ? { transaction } : {})
            await LoyaltyLedger.create({
                customer_id: customer.id,
                order_id: order.id,
                branch_id: order.branch_id,
                entry_type: 'redeem',
                points: -redeemPoints,
                notes: `Redeemed on order ${order.order_number}`,
                created_by: userId
            }, transaction ? { transaction } : {})
        }

        if (earnedPoints > 0 && !hasEarn) {
            balance += earnedPoints
            await customer.update({ loyalty_points: balance }, transaction ? { transaction } : {})
            await LoyaltyLedger.create({
                customer_id: customer.id,
                order_id: order.id,
                branch_id: order.branch_id,
                entry_type: 'earn',
                points: earnedPoints,
                notes: `Earned from order ${order.order_number}`,
                created_by: userId
            }, transaction ? { transaction } : {})

            await Order.update({
                loyalty_points_earned: earnedPoints
            }, {
                where: { id: order.id },
                ...(transaction ? { transaction } : {})
            })
        }

        return {
            redeemedPoints: hasRedeem ? 0 : redeemPoints,
            earnedPoints: hasEarn ? 0 : earnedPoints,
            customerBalance: balance
        }
    }
}

module.exports = LoyaltyService

