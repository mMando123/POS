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
