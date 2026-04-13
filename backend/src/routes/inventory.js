/**
 * Inventory API Routes
 * Handles stock operations, adjustments, and queries
 */

const express = require('express')
const router = express.Router()
const { body, query, validationResult } = require('express-validator')
const { v4: uuidv4 } = require('uuid')
const { authenticate, authorize } = require('../middleware/auth')
const StockService = require('../services/stockService')
const {
    Stock,
    StockMovement,
    StockAdjustment,
    MenuIngredient,
    Menu,
    Warehouse,
    Branch,
    Notification,
    sequelize
} = require('../models')
const { Op } = require('sequelize')
const AuditService = require('../services/auditService')
const AccountingService = require('../services/accountingService')
const UnitConversionService = require('../services/unitConversionService')
const { normalizeSkuInput, assertSkuAvailable, generateUniqueSku } = require('../utils/sku')

const CORE_UOM_SET = new Set(['piece', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'portion'])
const normalizeUomInput = (value, fallback = 'piece') => {
    const raw = String(value || '').trim()
    if (!raw) return fallback

    const normalized = UnitConversionService.normalizeUnit(raw)
    if (CORE_UOM_SET.has(normalized)) {
        return normalized
    }
    return raw
}

const normalizeDateOnlyInput = (value) => {
    if (value === undefined || value === null || value === '') return null
    const raw = String(value).trim()
    const normalized = raw.includes('T') ? raw.slice(0, 10) : raw
    const parsed = new Date(`${normalized}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) {
        const error = new Error('تاريخ الإنتاج أو الانتهاء غير صالح')
        error.statusCode = 400
        throw error
    }
    return normalized
}

const sanitizeInventoryDateFields = (item = {}) => {
    const batchNumber = item.batch_number === undefined || item.batch_number === null || item.batch_number === ''
        ? null
        : String(item.batch_number).trim()
    const productionDate = normalizeDateOnlyInput(item.production_date)
    const expiryDate = normalizeDateOnlyInput(item.expiry_date)

    if (productionDate && expiryDate && expiryDate < productionDate) {
        const error = new Error('تاريخ الانتهاء يجب أن يكون بعد أو مساويًا لتاريخ الإنتاج')
        error.statusCode = 400
        throw error
    }

    return {
        batch_number: batchNumber,
        production_date: productionDate,
        expiry_date: expiryDate
    }
}

// ==================== STOCK QUERIES ====================

/**
 * GET /api/inventory/stock
 * List all stock levels with filters
 */
router.get('/stock', authenticate, async (req, res) => {
    try {
        const { warehouse_id, category_id, search, low_stock_only } = req.query

        const where = {}
        const menuWhere = { track_stock: true }

        if (warehouse_id) where.warehouse_id = warehouse_id
        if (search) {
            menuWhere[Op.or] = [
                { name_ar: { [Op.like]: `%${search}%` } },
                { name_en: { [Op.like]: `%${search}%` } },
                { sku: { [Op.like]: `%${search}%` } },
                { barcode: { [Op.like]: `%${search}%` } }
            ]
        }
        if (category_id) menuWhere.category_id = category_id

        let stocks = await Stock.findAll({
            where,
            include: [
                {
                    model: Menu,
                    where: menuWhere,
                    attributes: ['id', 'name_ar', 'name_en', 'sku', 'barcode', 'price', 'cost_price', 'category_id', 'image_url']
                },
                {
                    model: Warehouse,
                    attributes: ['id', 'name_ar', 'name_en']
                }
            ],
            order: [[Menu, 'name_ar', 'ASC']]
        })

        // Filter low stock if requested
        if (low_stock_only === 'true') {
            stocks = stocks.filter(s => parseFloat(s.quantity) <= parseFloat(s.min_stock || 0))
        }

        const formattedStocks = stocks.map(s => ({
            id: s.id,
            menuId: s.menu_id,
            productName: s.Menu?.name_ar,
            productNameEn: s.Menu?.name_en,
            sku: s.Menu?.sku,
            barcode: s.Menu?.barcode,
            price: parseFloat(s.Menu?.price || 0),
            costPrice: parseFloat(s.Menu?.cost_price || 0),
            imageUrl: s.Menu?.image_url,
            warehouseId: s.warehouse_id,
            warehouseName: s.Warehouse?.name_ar, quantity: parseFloat(s.quantity)||0, minStock: parseFloat(s.Menu?.minStock)||0,
            quantity: parseFloat(s.quantity),
            reserved: parseFloat(s.reserved_qty),
            available: parseFloat(s.quantity) - parseFloat(s.reserved_qty),
            minStock: parseFloat(s.min_stock || 0),
            maxStock: s.max_stock ? parseFloat(s.max_stock) : null,
            avgCost: parseFloat(s.avg_cost),
            totalValue: parseFloat(s.quantity) * parseFloat(s.avg_cost),
            isLowStock: parseFloat(s.quantity) <= parseFloat(s.min_stock || 0),
            lastRestockDate: s.last_restock_date,
            lastSoldDate: s.last_sold_date
        }))

        res.json({
            data: formattedStocks,
            summary: {
                totalProducts: formattedStocks.length,
                totalValue: formattedStocks.reduce((sum, s) => sum + s.totalValue, 0),
                lowStockCount: formattedStocks.filter(s => s.isLowStock).length
            }
        })
    } catch (error) {
        console.error('Get stock error:', error)
        res.status(500).json({ message: 'خطأ في جلب بيانات المخزون' })
    }
})

/**
 * GET /api/inventory/branch-summary
 * Get aggregated stock report by branch
 */
router.get('/branch-summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { branch_id, warehouse_id, search } = req.query

        const stockWhere = {}
        const menuWhere = { track_stock: true }
        const warehouseWhere = {}

        if (warehouse_id) stockWhere.warehouse_id = warehouse_id
        if (search) {
            menuWhere[Op.or] = [
                { name_ar: { [Op.like]: `%${search}%` } },
                { name_en: { [Op.like]: `%${search}%` } },
                { sku: { [Op.like]: `%${search}%` } },
                { barcode: { [Op.like]: `%${search}%` } }
            ]
        }

        if (req.user?.role !== 'admin') {
            warehouseWhere.branch_id = req.user?.branchId || null
        } else if (branch_id) {
            warehouseWhere.branch_id = branch_id
        }

        const stocks = await Stock.findAll({
            where: stockWhere,
            include: [
                {
                    model: Menu,
                    where: menuWhere,
                    attributes: ['id', 'name_ar', 'name_en', 'sku', 'barcode']
                },
                {
                    model: Warehouse,
                    where: warehouseWhere,
                    attributes: ['id', 'name_ar', 'branch_id'],
                    include: [
                        {
                            model: Branch,
                            attributes: ['id', 'name_ar', 'name_en'],
                            required: false
                        }
                    ]
                }
            ],
            order: [
                [Warehouse, 'branch_id', 'ASC'],
                [Warehouse, 'name_ar', 'ASC'],
                [Menu, 'name_ar', 'ASC']
            ]
        })

        const branchMap = new Map()

        for (const stockEntry of stocks) {
            const warehouse = stockEntry.Warehouse
            const branchId = warehouse?.branch_id || 'unassigned'
            const branchName = warehouse?.Branch?.name_ar || warehouse?.Branch?.name_en || 'بدون فرع'
            const quantity = parseFloat(stockEntry.quantity || 0)
            const reserved = parseFloat(stockEntry.reserved_qty || 0)
            const available = quantity - reserved
            const avgCost = parseFloat(stockEntry.avg_cost || 0)
            const minStock = parseFloat(stockEntry.min_stock || 0)

            if (!branchMap.has(branchId)) {
                branchMap.set(branchId, {
                    branch_id: warehouse?.branch_id || null,
                    branch_name: branchName,
                    warehouse_ids: new Set(),
                    warehouse_names: new Set(),
                    product_lines: 0,
                    total_quantity: 0,
                    total_available: 0,
                    total_reserved: 0,
                    total_value: 0,
                    low_stock_count: 0,
                    out_of_stock_count: 0
                })
            }

            const branchRow = branchMap.get(branchId)
            branchRow.warehouse_ids.add(warehouse?.id || `warehouse-${branchId}`)
            branchRow.warehouse_names.add(warehouse?.name_ar || 'مستودع غير مسمى')
            branchRow.product_lines += 1
            branchRow.total_quantity += quantity
            branchRow.total_available += available
            branchRow.total_reserved += reserved
            branchRow.total_value += quantity * avgCost
            if (quantity <= minStock) branchRow.low_stock_count += 1
            if (quantity <= 0) branchRow.out_of_stock_count += 1
        }

        const rows = Array.from(branchMap.values())
            .map((row) => ({
                branch_id: row.branch_id,
                branch_name: row.branch_name,
                warehouse_count: row.warehouse_ids.size,
                warehouse_names: Array.from(row.warehouse_names),
                product_lines: row.product_lines,
                total_quantity: Math.round(row.total_quantity * 100) / 100,
                total_available: Math.round(row.total_available * 100) / 100,
                total_reserved: Math.round(row.total_reserved * 100) / 100,
                total_value: Math.round(row.total_value * 100) / 100,
                low_stock_count: row.low_stock_count,
                out_of_stock_count: row.out_of_stock_count
            }))
            .sort((a, b) => a.branch_name.localeCompare(b.branch_name, 'ar'))

        const summary = rows.reduce((acc, row) => {
            acc.total_branches += 1
            acc.total_warehouses += row.warehouse_count
            acc.total_product_lines += row.product_lines
            acc.total_quantity += row.total_quantity
            acc.total_available += row.total_available
            acc.total_reserved += row.total_reserved
            acc.total_value += row.total_value
            acc.low_stock_count += row.low_stock_count
            acc.out_of_stock_count += row.out_of_stock_count
            return acc
        }, {
            total_branches: 0,
            total_warehouses: 0,
            total_product_lines: 0,
            total_quantity: 0,
            total_available: 0,
            total_reserved: 0,
            total_value: 0,
            low_stock_count: 0,
            out_of_stock_count: 0
        })

        summary.total_quantity = Math.round(summary.total_quantity * 100) / 100
        summary.total_available = Math.round(summary.total_available * 100) / 100
        summary.total_reserved = Math.round(summary.total_reserved * 100) / 100
        summary.total_value = Math.round(summary.total_value * 100) / 100

        res.json({ data: rows, summary })
    } catch (error) {
        console.error('Get branch inventory summary error:', error)
        res.status(500).json({ message: 'خطأ في جلب ملخص المخزون حسب الفرع' })
    }
})

/**
 * GET /api/inventory/stock/:menuId
 * Get stock details for a specific product
 */
router.get('/stock/:menuId', authenticate, async (req, res) => {
    try {
        const stockLevel = await StockService.getStockLevel(req.params.menuId)
        res.json({ data: stockLevel })
    } catch (error) {
        console.error('Get stock level error:', error)
        res.status(500).json({ message: 'خطأ في جلب مستوى المخزون' })
    }
})

/**
 * GET /api/inventory/alerts
 * Get stock alerts (low stock, out of stock, expiring)
 */
router.get('/alerts', authenticate, async (req, res) => {
    try {
        const { warehouse_id } = req.query
        const expiryAlertDays = Math.max(0, parseInt(req.query.expiry_days, 10) || 30)

        // Low stock items
        const lowStock = await StockService.getLowStockItems(warehouse_id)
        const { expired, expiringSoon } = await StockService.getExpiryAlerts(warehouse_id, expiryAlertDays)

        // Out of stock items
        const outOfStock = await Stock.findAll({
            where: {
                quantity: { [Op.lte]: 0 },
                ...(warehouse_id && { warehouse_id })
            },
            include: [
                { model: Menu, where: { track_stock: true }, attributes: ['id', 'name_ar', 'sku'] },
                { model: Warehouse, attributes: ['id', 'name_ar', 'branch_id'] }
            ]
        })

        // Create notification for low stock items with stronger dedupe to avoid spam.
        // Keep a wider window and do not require "unread" to suppress repeat noise.
        const duplicateWindowStart = new Date(Date.now() - (6 * 60 * 60 * 1000))

        const notificationService = req.app.get('notificationService')
        const lowStockTargetRoles = ['admin', 'manager']

        const sendInventoryNotification = async ({
            type = 'low_stock',
            entityId,
            title,
            message,
            priority = 'high',
            icon = '⚠️',
            branchId = null
        }) => {
            for (const role of lowStockTargetRoles) {
                const existingNotification = await Notification.findOne({
                    where: {
                        type,
                        target_role: role,
                        title,
                        entity_id: String(entityId),
                        created_at: { [Op.gt]: duplicateWindowStart },
                        ...(branchId ? { branch_id: branchId } : {})
                    }
                })

                if (!existingNotification && notificationService) {
                    await notificationService.send({
                        type,
                        title,
                        message,
                        target_role: role,
                        entity_type: 'product',
                        entity_id: String(entityId),
                        icon,
                        priority,
                        action_url: '/inventory',
                        branch_id: branchId
                    })
                }
            }
        }

        for (const item of lowStock) {
            await sendInventoryNotification({
                entityId: item.menuId,
                title: 'تنبيه: مخزون منخفض',
                message: `المنتج "${item.productName}" وصل إلى ${item.quantity} قطعة. (الحد الأدنى: ${item.minStock})`,
                priority: 'high',
                icon: '⚠️',
                branchId: item.branchId || null
            })
        }

        // Also for out of stock
        for (const s of outOfStock) {
            await sendInventoryNotification({
                entityId: s.menu_id,
                title: 'تنبيه: نفاذ المخزون!',
                message: `المنتج "${s.Menu?.name_ar}" انتهى تماماً من مستودع ${s.Warehouse?.name_ar}`,
                priority: 'urgent',
                icon: '🚫',
                branchId: s.Warehouse?.branch_id || null
            })
        }

        for (const item of expired) {
            await sendInventoryNotification({
                type: 'system',
                entityId: item.movementId,
                title: 'تنبيه: منتج منتهي الصلاحية',
                message: `المنتج "${item.productName}"${item.batchNumber ? ` - تشغيلة ${item.batchNumber}` : ''} انتهت صلاحيته بتاريخ ${item.expiryDate}.`,
                priority: 'urgent',
                icon: '🧪',
                branchId: item.branchId || null
            })
        }

        for (const item of expiringSoon) {
            await sendInventoryNotification({
                type: 'system',
                entityId: item.movementId,
                title: 'تنبيه: قرب انتهاء الصلاحية',
                message: `المنتج "${item.productName}"${item.batchNumber ? ` - تشغيلة ${item.batchNumber}` : ''} سينتهي خلال ${item.daysRemaining} يوم.`,
                priority: item.daysRemaining <= 7 ? 'high' : 'normal',
                icon: '⏰',
                branchId: item.branchId || null
            })
        }

        res.json({
            data: {
                lowStock: lowStock,
                outOfStock: outOfStock.map(s => ({
                    menuId: s.menu_id,
                    productName: s.Menu?.name_ar,
                    sku: s.Menu?.sku,
                    warehouseId: s.warehouse_id,
                    warehouseName: s.Warehouse?.name_ar,
                    branchId: s.Warehouse?.branch_id || null,
                    quantity: parseFloat(s.quantity || 0),
                    minStock: parseFloat(s.min_stock || 0)
                })),
                expired,
                expiringSoon,
                summary: {
                    lowStockCount: lowStock.length,
                    outOfStockCount: outOfStock.length,
                    expiredCount: expired.length,
                    expiringSoonCount: expiringSoon.length
                }
            }
        })
    } catch (error) {
        console.error('Get alerts error:', error)
        res.status(500).json({ message: 'خطأ في جلب التنبيهات' })
    }
})

/**
 * GET /api/inventory/valuation
 * Get inventory valuation report
 */
router.get('/valuation', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { warehouse_id } = req.query
        const valuation = await StockService.getInventoryValuation(warehouse_id)

        // Debug logging
        console.log('[inventory] valuation response:', {
            total_value: valuation.total_value,
            total_items: valuation.total_items,
            by_warehouse_count: valuation.by_warehouse?.length,
            by_category_count: valuation.by_category?.length,
            by_warehouse: valuation.by_warehouse,
            by_category: valuation.by_category
        })

        res.json({ data: valuation })
    } catch (error) {
        console.error('Get valuation error:', error)
        res.status(500).json({ message: 'خطأ في حساب تقييم المخزون' })
    }
})

// ==================== STOCK MOVEMENTS ====================

/**
 * GET /api/inventory/movements
 * Get stock movement history
 */
router.get('/movements', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { menu_id, warehouse_id, type, start_date, end_date, limit = 100, offset = 0 } = req.query

        const result = await StockService.getMovementHistory({
            menuId: menu_id,
            warehouseId: warehouse_id,
            type,
            startDate: start_date,
            endDate: end_date,
            limit: parseInt(limit),
            offset: parseInt(offset)
        })

        res.json({
            data: result.movements,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset
            }
        })
    } catch (error) {
        console.error('Get movements error:', error)
        res.status(500).json({ message: 'خطأ في جلب سجل الحركات' })
    }
})

// ==================== STOCK ADJUSTMENTS ====================

/**
 * POST /api/inventory/adjust
 * Create a stock adjustment
 */
router.post('/adjust',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('menu_id').isUUID().withMessage('معرف المنتج غير صالح'),
        body('warehouse_id').isUUID().withMessage('معرف المستودع غير صالح'),
        body('adjustment_type').isIn(['damage', 'loss', 'theft', 'count', 'expired', 'other']).withMessage('نوع التعديل غير صالح'),
        body('quantity_change').isFloat({ min: -10000, max: 10000 }).withMessage('الكمية غير صالحة أو خارج النطاق المسموح'),
        body('unit_cost').optional().isFloat({ min: 0, max: 1000000 }).withMessage('تكلفة الوحدة غير صالحة'),
        body('reason').notEmpty().withMessage('السبب مطلوب').isLength({ max: 500 }).withMessage('السبب يجب ألا يتجاوز 500 حرف').trim(),
        body('batch_number').optional({ nullable: true }).isString().withMessage('رقم التشغيلة يجب أن يكون نصًا'),
        body('production_date').optional({ nullable: true }).isISO8601().withMessage('تاريخ الإنتاج غير صالح'),
        body('expiry_date').optional({ nullable: true }).isISO8601().withMessage('تاريخ الانتهاء غير صالح')
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const transaction = await sequelize.transaction()

        try {
            const { menu_id, warehouse_id, adjustment_type, quantity_change, unit_cost, reason } = req.body
            const dateFields = sanitizeInventoryDateFields(req.body)

            // Get current stock
            const stock = await Stock.findOne({
                where: { menu_id, warehouse_id },
                transaction
            })

            const quantityBefore = stock ? parseFloat(stock.quantity) : 0
            const quantityAfter = quantityBefore + parseFloat(quantity_change)

            // Check for negative
            if (quantityAfter < 0) {
                const menu = await Menu.findByPk(menu_id, { transaction })
                if (!menu?.allow_negative_stock) {
                    await transaction.rollback()
                    return res.status(400).json({ message: 'لا يمكن أن يصبح المخزون سالباً' })
                }
            }

            // Generate adjustment number
            const count = await StockAdjustment.count({ transaction })
            const adjustmentNumber = `ADJ-${Date.now()}-${count + 1}`

            // Create adjustment record
            const adjustment = await StockAdjustment.create({
                adjustment_number: adjustmentNumber,
                warehouse_id,
                menu_id,
                adjustment_type,
                quantity_before: quantityBefore,
                quantity_change: parseFloat(quantity_change),
                quantity_after: quantityAfter,
                reason,
                status: 'approved', // Auto-approve for now
                created_by: req.user.userId,
                approved_by: req.user.userId,
                approved_at: new Date()
            }, { transaction })

            // Use provided unit cost for gains when available, otherwise use current avg cost.
            const currentAvgCost = stock ? parseFloat(stock.avg_cost || 0) : 0
            const parsedUnitCost = unit_cost === undefined || unit_cost === null || unit_cost === ''
                ? NaN
                : parseFloat(unit_cost)
            const unitCostForGain = Number.isFinite(parsedUnitCost) ? parsedUnitCost : currentAvgCost
            let adjustmentValue = 0

            // Apply the adjustment
            if (quantity_change > 0) {
                // Stock Gain
                await StockService.addStock({
                    menuId: menu_id,
                    warehouseId: warehouse_id,
                    quantity: Math.abs(quantity_change),
                    unitCost: parseFloat(unitCostForGain),
                    sourceType: 'adjustment',
                    sourceId: adjustment.id,
                    userId: req.user.userId
                }, {
                    transaction,
                    notes: reason,
                    batchNumber: dateFields.batch_number,
                    productionDate: dateFields.production_date,
                    expiryDate: dateFields.expiry_date
                })

                adjustmentValue = Math.abs(quantity_change) * parseFloat(unitCostForGain)
            } else {
                // Stock Loss
                const result = await StockService.deductStock({
                    menuId: menu_id,
                    warehouseId: warehouse_id,
                    quantity: Math.abs(quantity_change),
                    sourceType: 'adjustment',
                    sourceId: adjustment.id,
                    userId: req.user.userId
                }, { transaction, notes: reason })

                // Use actual COGS calculated by FIFO/Avg logic
                adjustmentValue = -1 * (result.cogs || (Math.abs(quantity_change) * parseFloat(currentAvgCost)))
            }

            // Record accounting entry (Shrinkage / Inventory)
            await AccountingService.recordStockAdjustment({
                ...adjustment.toJSON(),
                adjustment_value: adjustmentValue
            }, { transaction })

            await transaction.commit()

            // Audit log - stock adjustment (non-blocking)
            AuditService.logStockAdjustment(req, adjustment, quantityBefore, quantityBefore + quantity_change)

            res.status(201).json({
                message: 'تم تعديل المخزون بنجاح',
                data: adjustment
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Adjustment error:', error)
            if (error.statusCode === 400) {
                return res.status(400).json({ message: error.message })
            }
            res.status(500).json({ message: error.message || 'خطأ في تعديل المخزون' })
        }
    }
)

/**
 * POST /api/inventory/assemble
 * Manufacture a composite item by consuming its ingredients and increasing finished stock.
 */
router.post('/assemble',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('menu_id').isUUID().withMessage('معرف الصنف غير صالح'),
        body('warehouse_id').isUUID().withMessage('معرف المستودع غير صالح'),
        body('quantity').isFloat({ min: 0.001, max: 1000000 }).withMessage('الكمية غير صالحة'),
        body('notes').optional({ nullable: true }).isLength({ max: 500 }).withMessage('الملاحظات طويلة جداً'),
        body('batch_number').optional({ nullable: true }).isString().withMessage('رقم التشغيلة يجب أن يكون نصًا'),
        body('production_date').optional({ nullable: true }).isISO8601().withMessage('تاريخ الإنتاج غير صالح'),
        body('expiry_date').optional({ nullable: true }).isISO8601().withMessage('تاريخ الانتهاء غير صالح')
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const transaction = await sequelize.transaction()

        try {
            const { menu_id, warehouse_id, quantity, notes } = req.body
            const dateFields = sanitizeInventoryDateFields(req.body)
            const productionQty = parseFloat(quantity)
            const sourceId = uuidv4()
            const userId = req.user?.userId || req.user?.id || null

            const product = await Menu.findByPk(menu_id, {
                attributes: ['id', 'name_ar', 'track_stock'],
                transaction
            })

            if (!product) {
                await transaction.rollback()
                return res.status(404).json({ message: 'الصنف غير موجود' })
            }

            if (!product.track_stock) {
                await transaction.rollback()
                return res.status(400).json({
                    message: 'الصنف غير مفعّل كمخزني. فعّل تتبع المخزون للصنف التجميعي أولاً.'
                })
            }

            const recipeLines = await MenuIngredient.findAll({
                where: { menu_id },
                include: [{ model: Menu, as: 'ingredient', attributes: ['id', 'name_ar', 'track_stock'] }],
                transaction
            })

            if (!recipeLines.length) {
                await transaction.rollback()
                return res.status(400).json({ message: 'لا يمكن التصنيع بدون تعريف مكونات للصنف' })
            }

            const invalidIngredient = recipeLines.find((line) => !line.ingredient?.track_stock)
            if (invalidIngredient) {
                await transaction.rollback()
                return res.status(400).json({
                    message: `المكون ${invalidIngredient.ingredient?.name_ar || invalidIngredient.ingredient_menu_id} غير مفعّل كمخزني`
                })
            }

            let totalConsumedCost = 0
            const consumedIngredients = []

            for (const line of recipeLines) {
                const qtyPerUnit = parseFloat(line.quantity || 0)
                const consumeQty = qtyPerUnit * productionQty
                if (!(consumeQty > 0)) continue

                const result = await StockService.deductStock({
                    menuId: line.ingredient_menu_id,
                    warehouseId: warehouse_id,
                    quantity: consumeQty,
                    sourceType: 'assembly_consume',
                    sourceId,
                    userId: userId || 'system',
                    notes: notes || `Assembly consume for ${product.name_ar}`
                }, { transaction })

                const lineCost = parseFloat(result.cogs || 0)
                totalConsumedCost += lineCost

                consumedIngredients.push({
                    ingredient_menu_id: line.ingredient_menu_id,
                    ingredient_name: line.ingredient?.name_ar || null,
                    quantity: consumeQty,
                    unit: line.unit,
                    total_cost: Math.round(lineCost * 100) / 100
                })
            }

            if (!consumedIngredients.length) {
                await transaction.rollback()
                return res.status(400).json({ message: 'المكونات المعرفة لا تحتوي على كميات صالحة للتصنيع' })
            }

            const unitCost = totalConsumedCost / productionQty

            await StockService.addStock({
                menuId: menu_id,
                warehouseId: warehouse_id,
                quantity: productionQty,
                unitCost: Number.isFinite(unitCost) ? unitCost : 0,
                sourceType: 'assembly_produce',
                sourceId,
                userId: userId || 'system'
            }, {
                transaction,
                batchNumber: dateFields.batch_number,
                productionDate: dateFields.production_date,
                expiryDate: dateFields.expiry_date,
                notes: notes || `Assembly produce for ${product.name_ar}`
            })

            await transaction.commit()

            return res.status(201).json({
                message: 'تم تصنيع الصنف بنجاح',
                data: {
                    source_id: sourceId,
                    menu_id,
                    menu_name: product.name_ar,
                    warehouse_id,
                    quantity: productionQty,
                    unit_cost: Math.round((Number.isFinite(unitCost) ? unitCost : 0) * 100) / 100,
                    total_cost: Math.round(totalConsumedCost * 100) / 100,
                    consumed_ingredients: consumedIngredients
                }
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Assembly error:', error)
            if (error.statusCode === 400) {
                return res.status(400).json({ message: error.message })
            }
            return res.status(500).json({ message: error.message || 'خطأ في عملية التصنيع' })
        }
    }
)

/**
 * GET /api/inventory/adjustments
 * List stock adjustments
 */
router.get('/adjustments', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { warehouse_id, status, limit = 50, offset = 0 } = req.query

        const where = {}
        if (warehouse_id) where.warehouse_id = warehouse_id
        if (status) where.status = status

        const { rows, count } = await StockAdjustment.findAndCountAll({
            where,
            include: [
                { model: Menu, attributes: ['id', 'name_ar', 'sku'] },
                { model: Warehouse, attributes: ['id', 'name_ar'] }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        })

        res.json({
            data: rows,
            pagination: { total: count, limit: parseInt(limit), offset: parseInt(offset) }
        })
    } catch (error) {
        console.error('Get adjustments error:', error)
        res.status(500).json({ message: 'خطأ في جلب سجل التعديلات' })
    }
})

// ==================== STOCK LEVELS UPDATE ====================

/**
 * PUT /api/inventory/stock/:menuId/settings
 * Update stock settings (min/max levels)
 */
router.put('/stock/:menuId/settings',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('warehouse_id').isUUID().withMessage('معرف المستودع غير صالح'),
        body('min_stock').optional().isFloat({ min: 0 }).withMessage('الحد الأدنى غير صالح'),
        body('max_stock').optional().isFloat({ min: 0 }).withMessage('الحد الأقصى غير صالح')
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        try {
            const { warehouse_id, min_stock, max_stock } = req.body

            const [stock, created] = await Stock.findOrCreate({
                where: { menu_id: req.params.menuId, warehouse_id },
                defaults: {
                    menu_id: req.params.menuId,
                    warehouse_id,
                    quantity: 0,
                    reserved_qty: 0,
                    min_stock: min_stock || 0,
                    max_stock: max_stock || null
                }
            })

            if (!created) {
                await stock.update({
                    min_stock: min_stock ?? stock.min_stock,
                    max_stock: max_stock ?? stock.max_stock
                })
            }

            res.json({
                message: 'تم تحديث إعدادات المخزون',
                data: stock
            })
        } catch (error) {
            console.error('Update stock settings error:', error)
            res.status(500).json({ message: 'خطأ في تحديث الإعدادات' })
        }
    }
)
// ==================== QUICK PRODUCT CREATION ====================

/**
 * POST /api/inventory/quick-product
 * Create a raw material or inventory-only product quickly
 * Used when creating purchase receipts for new items
 */
router.post('/quick-product',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('name_ar').notEmpty().withMessage('اسم المنتج بالعربية مطلوب'),
        body('item_type').optional().isIn(['raw_material', 'consumable']).withMessage('نوع المنتج غير صالح'),
        body('sku').optional(),
        body('barcode').optional(),
        body('cost_price').optional().isFloat({ min: 0 }),
        body('selling_price').optional().isFloat({ min: 0 }),
        body('category_id').optional(),
        body('unit_of_measure')
            .optional()
            .custom((value) => {
                const normalized = normalizeUomInput(value, '')
                if (!normalized || String(normalized).length > 20) {
                    throw new Error('وحدة القياس غير صالحة')
                }
                return true
            })
    ],
    async (req, res) => {
        const transaction = await sequelize.transaction()
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                await transaction.rollback()
                return res.status(400).json({ errors: errors.array() })
            }

            const {
                name_ar,
                name_en,
                sku,
                barcode,
                cost_price,
                selling_price,
                category_id,
                item_type = 'raw_material',
                unit_of_measure = 'piece',
                min_stock = 0
            } = req.body
            const normalizedUnitOfMeasure = normalizeUomInput(unit_of_measure, 'piece')
            const requestedSku = normalizeSkuInput(sku)
            const finalSku = requestedSku
                ? await assertSkuAvailable(Menu, requestedSku, { transaction })
                : await generateUniqueSku(Menu, { itemType, transaction })

            // Check if barcode already exists
            if (barcode) {
                const existingBarcode = await Menu.findOne({ where: { barcode } })
                if (existingBarcode) {
                    await transaction.rollback()
                    return res.status(400).json({ message: 'الباركود موجود بالفعل' })
                }
            }

            // Resolve target branch with safe fallbacks:
            // manager branch -> explicit branch_id from request -> first active branch
            let targetBranchId = req.user.branchId || req.user.branch_id || req.body.branch_id || null
            if (!targetBranchId) {
                const fallbackBranch = await Branch.findOne({
                    where: { is_active: true },
                    order: [['created_at', 'ASC']],
                    transaction
                })
                targetBranchId = fallbackBranch?.id || null
            }

            const branch = targetBranchId ? await Branch.findOne({
                where: { id: targetBranchId, is_active: true },
                transaction
            }) : null
            if (!branch) {
                await transaction.rollback()
                return res.status(400).json({ message: 'لا توجد فروع مسجلة' })
            }

            // Create the product
            const product = await Menu.create({
                name_ar,
                name_en: name_en || name_ar,
                sku: finalSku,
                barcode,
                price: selling_price || 0,
                cost_price: cost_price || 0,
                category_id: category_id || null,
                branch_id: branch.id,
                is_available: selling_price > 0, // Available in POS if has selling price
                track_stock: true,
                item_type,
                unit_of_measure: normalizedUnitOfMeasure,
                allow_negative_stock: false
            }, { transaction })

            // Create initial stock entry if min_stock is set
            // Find branch warehouse (prefer default, then first active warehouse)
            let warehouse = await Warehouse.findOne({
                where: { branch_id: branch.id, is_default: true, status: 'active' },
                transaction
            })
            if (!warehouse) {
                warehouse = await Warehouse.findOne({
                    where: { branch_id: branch.id, status: 'active' },
                    order: [['created_at', 'ASC']],
                    transaction
                })
            }

            if (warehouse) {
                await Stock.create({
                    menu_id: product.id,
                    warehouse_id: warehouse.id,
                    quantity: 0,
                    min_stock: min_stock || 0,
                    avg_cost: cost_price || 0
                }, { transaction })
            }

            await transaction.commit()

            res.status(201).json({
                message: 'تم إنشاء المنتج بنجاح',
                data: product
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Quick product creation error:', error)
            res.status(500).json({ message: 'خطأ في إنشاء المنتج' })
        }
    }
)

/**
 * GET /api/inventory/products
 * Get products for purchase receipts
 * By default shows all products (sellable + raw materials)
 * ?track_stock=true to filter only trackable items
 */
router.get('/products', authenticate, async (req, res) => {
    try {
        const { item_type, search, track_stock } = req.query

        const where = {}

        // Only filter by track_stock if explicitly requested
        if (track_stock === 'true') {
            where.track_stock = true
        }

        if (item_type) {
            where.item_type = item_type
        }

        if (search) {
            where[Op.or] = [
                { name_ar: { [Op.like]: `%${search}%` } },
                { name_en: { [Op.like]: `%${search}%` } },
                { sku: { [Op.like]: `%${search}%` } },
                { barcode: { [Op.like]: `%${search}%` } }
            ]
        }

        const products = await Menu.findAll({
            where,
            attributes: ['id', 'name_ar', 'name_en', 'sku', 'barcode', 'cost_price', 'item_type', 'track_stock'],
            order: [['name_ar', 'ASC']]
        })

        res.json({ data: products })
    } catch (error) {
        console.error('Get inventory products error:', error)
        res.status(500).json({ message: 'خطأ في جلب المنتجات' })
    }
})

module.exports = router
