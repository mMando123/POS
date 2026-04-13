/**
 * Stock Transfer API Routes
 * Handle transfers between warehouses
 */

const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const StockService = require('../services/stockService')
const {
    StockTransfer,
    StockTransferItem,
    Stock,
    Menu,
    Warehouse,
    Branch,
    sequelize
} = require('../models')
const { Op } = require('sequelize')

/**
 * GET /api/transfers
 * List stock transfers
 */
router.get('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { warehouse_id, status, limit = 50, offset = 0 } = req.query

        const where = {}
        if (warehouse_id) {
            where[Op.or] = [
                { from_warehouse_id: warehouse_id },
                { to_warehouse_id: warehouse_id }
            ]
        }
        if (status) where.status = status

        const { rows, count } = await StockTransfer.findAndCountAll({
            where,
            include: [
                { model: Warehouse, as: 'fromWarehouse', attributes: ['id', 'name_ar'] },
                { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name_ar'] },
                {
                    model: StockTransferItem,
                    as: 'items',
                    include: [{ model: Menu, attributes: ['id', 'name_ar', 'sku'] }]
                }
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
        console.error('Get transfers error:', error)
        res.status(500).json({ message: 'خطأ في جلب التحويلات' })
    }
})

/**
 * GET /api/transfers/reports/summary
 * Get summarized transfer report with date filters
 */
router.get('/reports/summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { warehouse_id, branch_id, status, start_date, end_date, limit = 500, offset = 0 } = req.query

        const where = {}
        const andConditions = []

        if (warehouse_id) {
            andConditions.push({
                [Op.or]: [
                    { from_warehouse_id: warehouse_id },
                    { to_warehouse_id: warehouse_id }
                ]
            })
        }

        if (status) {
            andConditions.push({ status })
        }

        if (branch_id) {
            const branchWarehouses = await Warehouse.findAll({
                where: { branch_id },
                attributes: ['id']
            })
            const branchWarehouseIds = branchWarehouses.map((warehouse) => warehouse.id)

            if (!branchWarehouseIds.length) {
                return res.json({
                    data: [],
                    summary: {
                        total_transfers: 0,
                        completed_transfers: 0,
                        pending_transfers: 0,
                        cancelled_transfers: 0,
                        total_items: 0,
                        total_quantity: 0
                    },
                    by_route: [],
                    pagination: { total: 0, limit: parseInt(limit, 10), offset: parseInt(offset, 10) }
                })
            }

            andConditions.push({
                [Op.or]: [
                    { from_warehouse_id: { [Op.in]: branchWarehouseIds } },
                    { to_warehouse_id: { [Op.in]: branchWarehouseIds } }
                ]
            })
        }

        if (start_date || end_date) {
            const createdAt = {}
            if (start_date) createdAt[Op.gte] = new Date(start_date)
            if (end_date) createdAt[Op.lte] = new Date(end_date)
            andConditions.push({ created_at: createdAt })
        }

        if (req.user?.role !== 'admin') {
            const scopedWarehouses = await Warehouse.findAll({
                where: { branch_id: req.user?.branchId || null },
                attributes: ['id']
            })
            const scopedWarehouseIds = scopedWarehouses.map((warehouse) => warehouse.id)

            if (!scopedWarehouseIds.length) {
                return res.json({
                    data: [],
                    summary: {
                        total_transfers: 0,
                        completed_transfers: 0,
                        pending_transfers: 0,
                        cancelled_transfers: 0,
                        total_items: 0,
                        total_quantity: 0
                    },
                    by_route: [],
                    pagination: { total: 0, limit: parseInt(limit, 10), offset: parseInt(offset, 10) }
                })
            }

            andConditions.push({
                [Op.or]: [
                    { from_warehouse_id: { [Op.in]: scopedWarehouseIds } },
                    { to_warehouse_id: { [Op.in]: scopedWarehouseIds } }
                ]
            })
        }

        if (andConditions.length === 1) {
            Object.assign(where, andConditions[0])
        } else if (andConditions.length > 1) {
            where[Op.and] = andConditions
        }

        const { rows, count } = await StockTransfer.findAndCountAll({
            where,
            include: [
                {
                    model: Warehouse,
                    as: 'fromWarehouse',
                    attributes: ['id', 'name_ar', 'branch_id'],
                    include: [{ model: Branch, attributes: ['id', 'name_ar', 'name_en'], required: false }]
                },
                {
                    model: Warehouse,
                    as: 'toWarehouse',
                    attributes: ['id', 'name_ar', 'branch_id'],
                    include: [{ model: Branch, attributes: ['id', 'name_ar', 'name_en'], required: false }]
                },
                {
                    model: StockTransferItem,
                    as: 'items',
                    attributes: ['id', 'menu_id', 'quantity']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10)
        })

        const routeMap = new Map()
        const data = rows.map((transfer) => {
            const itemsCount = Array.isArray(transfer.items) ? transfer.items.length : 0
            const totalQuantity = Array.isArray(transfer.items)
                ? transfer.items.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0)
                : 0
            const fromBranchName =
                transfer.fromWarehouse?.Branch?.name_ar ||
                transfer.fromWarehouse?.Branch?.name_en ||
                'بدون فرع'
            const toBranchName =
                transfer.toWarehouse?.Branch?.name_ar ||
                transfer.toWarehouse?.Branch?.name_en ||
                'بدون فرع'

            const routeKey = `${transfer.fromWarehouse?.branch_id || 'unassigned'}->${transfer.toWarehouse?.branch_id || 'unassigned'}`
            if (!routeMap.has(routeKey)) {
                routeMap.set(routeKey, {
                    route_key: routeKey,
                    from_branch_id: transfer.fromWarehouse?.branch_id || null,
                    from_branch_name: fromBranchName,
                    to_branch_id: transfer.toWarehouse?.branch_id || null,
                    to_branch_name: toBranchName,
                    transfers_count: 0,
                    total_items: 0,
                    total_quantity: 0,
                    completed_transfers: 0,
                    pending_transfers: 0,
                    cancelled_transfers: 0
                })
            }

            const routeSummary = routeMap.get(routeKey)
            routeSummary.transfers_count += 1
            routeSummary.total_items += itemsCount
            routeSummary.total_quantity += totalQuantity
            if (transfer.status === 'completed') routeSummary.completed_transfers += 1
            if (transfer.status === 'pending') routeSummary.pending_transfers += 1
            if (transfer.status === 'cancelled') routeSummary.cancelled_transfers += 1

            return {
                id: transfer.id,
                transfer_number: transfer.transfer_number,
                status: transfer.status,
                notes: transfer.notes || '',
                created_at: transfer.created_at,
                completed_at: transfer.completed_at,
                items_count: itemsCount,
                total_quantity: Math.round(totalQuantity * 100) / 100,
                from_warehouse_id: transfer.from_warehouse_id,
                from_warehouse_name: transfer.fromWarehouse?.name_ar || '—',
                from_branch_id: transfer.fromWarehouse?.branch_id || null,
                from_branch_name: fromBranchName,
                to_warehouse_id: transfer.to_warehouse_id,
                to_warehouse_name: transfer.toWarehouse?.name_ar || '—',
                to_branch_id: transfer.toWarehouse?.branch_id || null,
                to_branch_name: toBranchName
            }
        })

        const summary = data.reduce((acc, transfer) => {
            acc.total_transfers += 1
            acc.total_items += transfer.items_count
            acc.total_quantity += transfer.total_quantity
            if (transfer.status === 'completed') acc.completed_transfers += 1
            if (transfer.status === 'pending') acc.pending_transfers += 1
            if (transfer.status === 'cancelled') acc.cancelled_transfers += 1
            return acc
        }, {
            total_transfers: 0,
            completed_transfers: 0,
            pending_transfers: 0,
            cancelled_transfers: 0,
            total_items: 0,
            total_quantity: 0
        })

        summary.total_quantity = Math.round(summary.total_quantity * 100) / 100

        const byRoute = Array.from(routeMap.values())
            .map((row) => ({
                ...row,
                total_quantity: Math.round(row.total_quantity * 100) / 100
            }))
            .sort((a, b) => b.total_quantity - a.total_quantity)

        res.json({
            data,
            summary,
            by_route: byRoute,
            pagination: {
                total: count,
                limit: parseInt(limit, 10),
                offset: parseInt(offset, 10)
            }
        })
    } catch (error) {
        console.error('Get transfer summary error:', error)
        res.status(500).json({ message: 'خطأ في جلب ملخص التحويلات' })
    }
})

/**
 * GET /api/transfers/:id
 * Get transfer details by ID
 */
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const transfer = await StockTransfer.findByPk(req.params.id, {
            include: [
                { model: Warehouse, as: 'fromWarehouse', attributes: ['id', 'name_ar'] },
                { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name_ar'] },
                {
                    model: StockTransferItem,
                    as: 'items',
                    include: [{ model: Menu, attributes: ['id', 'name_ar', 'sku'] }]
                }
            ]
        })

        if (!transfer) {
            return res.status(404).json({ message: 'التحويل غير موجود' })
        }

        res.json({ data: transfer })
    } catch (error) {
        console.error('Get transfer details error:', error)
        res.status(500).json({ message: 'خطأ في جلب تفاصيل التحويل' })
    }
})

/**
 * POST /api/transfers
 * Create a new stock transfer
 */
router.post('/',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('from_warehouse_id').isUUID().withMessage('معرف المستودع المصدر غير صالح'),
        body('to_warehouse_id').isUUID().withMessage('معرف المستودع المستهدف غير صالح'),
        body('items').isArray({ min: 1 }).withMessage('يجب إضافة منتج واحد على الأقل'),
        body('items.*.menu_id').isUUID().withMessage('معرف المنتج غير صالح'),
        body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('الكمية غير صالحة')
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const transaction = await sequelize.transaction()

        try {
            const { from_warehouse_id, to_warehouse_id, items, notes } = req.body

            if (from_warehouse_id === to_warehouse_id) {
                await transaction.rollback()
                return res.status(400).json({ message: 'لا يمكن التحويل لنفس المستودع' })
            }

            // Verify stock availability
            for (const item of items) {
                const stock = await Stock.findOne({
                    where: { menu_id: item.menu_id, warehouse_id: from_warehouse_id },
                    transaction
                })

                const available = stock ? parseFloat(stock.quantity) - parseFloat(stock.reserved_qty) : 0

                if (available < item.quantity) {
                    const menu = await Menu.findByPk(item.menu_id, { transaction })
                    await transaction.rollback()
                    return res.status(400).json({
                        message: `الكمية المتاحة من "${menu?.name_ar}" غير كافية. المتاح: ${available}`
                    })
                }
            }

            // Generate transfer number
            const count = await StockTransfer.count({ transaction })
            const transferNumber = `TRF-${Date.now()}-${count + 1}`

            // Create transfer
            const transfer = await StockTransfer.create({
                transfer_number: transferNumber,
                from_warehouse_id,
                to_warehouse_id,
                status: 'pending',
                notes,
                transferred_by: req.user.userId
            }, { transaction })

            // Create items
            await Promise.all(items.map(item =>
                StockTransferItem.create({
                    transfer_id: transfer.id,
                    menu_id: item.menu_id,
                    quantity: item.quantity,
                    batch_number: item.batch_number,
                    expiry_date: item.expiry_date
                }, { transaction })
            ))

            await transaction.commit()

            // Reload with includes
            const result = await StockTransfer.findByPk(transfer.id, {
                include: [
                    { model: Warehouse, as: 'fromWarehouse', attributes: ['id', 'name_ar'] },
                    { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name_ar'] },
                    { model: StockTransferItem, as: 'items', include: [{ model: Menu, attributes: ['id', 'name_ar', 'sku'] }] }
                ]
            })

            res.status(201).json({
                message: 'تم إنشاء طلب التحويل بنجاح',
                data: result
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Create transfer error:', error)
            res.status(500).json({ message: 'خطأ في إنشاء طلب التحويل' })
        }
    }
)

/**
 * POST /api/transfers/:id/complete
 * Complete a transfer (move stock)
 */
router.post('/:id/complete',
    authenticate,
    authorize('admin', 'manager'),
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const transfer = await StockTransfer.findByPk(req.params.id, {
                include: [
                    { model: StockTransferItem, as: 'items' },
                    { model: Warehouse, as: 'fromWarehouse' },
                    { model: Warehouse, as: 'toWarehouse' }
                ],
                transaction
            })

            if (!transfer) {
                await transaction.rollback()
                return res.status(404).json({ message: 'طلب التحويل غير موجود' })
            }

            if (transfer.status === 'completed') {
                await transaction.rollback()
                return res.status(400).json({ message: 'تم إتمام هذا التحويل مسبقاً' })
            }

            if (transfer.status === 'cancelled') {
                await transaction.rollback()
                return res.status(400).json({ message: 'تم إلغاء هذا التحويل' })
            }

            let totalTransferCost = 0

            // Process each item
            for (const item of transfer.items) {
                // Deduct from source warehouse
                await StockService.deductStock({
                    menuId: item.menu_id,
                    warehouseId: transfer.from_warehouse_id,
                    quantity: parseFloat(item.quantity),
                    sourceType: 'transfer',
                    sourceId: transfer.id,
                    userId: req.user.userId
                }, { transaction, reference: transfer.transfer_number })

                // Get unit cost from source for FIFO tracking
                const sourceStock = await Stock.findOne({
                    where: { menu_id: item.menu_id, warehouse_id: transfer.from_warehouse_id },
                    transaction
                })
                const unitCost = sourceStock ? parseFloat(sourceStock.avg_cost) : 0
                totalTransferCost += unitCost * parseFloat(item.quantity)

                // Add to destination warehouse
                await StockService.addStock({
                    menuId: item.menu_id,
                    warehouseId: transfer.to_warehouse_id,
                    quantity: parseFloat(item.quantity),
                    unitCost,
                    sourceType: 'transfer',
                    sourceId: transfer.id,
                    userId: req.user.userId
                }, {
                    transaction,
                    reference: transfer.transfer_number,
                    batchNumber: item.batch_number,
                    expiryDate: item.expiry_date
                })
            }

            // FIX-11: Record Accounting Entries for Inter-Branch Transfer
            const AccountingService = require('../services/accountingService')
            await AccountingService.recordStockTransfer(transfer, {
                fromBranchId: transfer.fromWarehouse?.branch_id,
                toBranchId: transfer.toWarehouse?.branch_id,
                totalCost: totalTransferCost,
                userId: req.user.userId,
                transaction
            })

            // Update transfer status
            await transfer.update({
                status: 'completed',
                completed_at: new Date()
            }, { transaction })

            await transaction.commit()

            res.json({
                message: 'تم إتمام التحويل بنجاح',
                data: transfer
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Complete transfer error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إتمام التحويل' })
        }
    }
)

/**
 * POST /api/transfers/:id/cancel
 * Cancel a pending transfer
 */
router.post('/:id/cancel',
    authenticate,
    authorize('admin', 'manager'),
    async (req, res) => {
        try {
            const transfer = await StockTransfer.findByPk(req.params.id)

            if (!transfer) {
                return res.status(404).json({ message: 'طلب التحويل غير موجود' })
            }

            if (transfer.status !== 'pending') {
                return res.status(400).json({ message: 'لا يمكن إلغاء تحويل تم إتمامه' })
            }

            await transfer.update({ status: 'cancelled' })

            res.json({ message: 'تم إلغاء طلب التحويل' })
        } catch (error) {
            console.error('Cancel transfer error:', error)
            res.status(500).json({ message: 'خطأ في إلغاء التحويل' })
        }
    }
)

module.exports = router
