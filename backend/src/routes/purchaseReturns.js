const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const {
    PurchaseReturn,
    PurchaseReturnItem,
    PurchaseOrder,
    PurchaseOrderItem,
    Supplier,
    Warehouse,
    Menu,
    User,
    sequelize
} = require('../models')
const { Op } = require('sequelize')
const StockService = require('../services/stockService')
const AccountingHooks = require('../services/accountingHooks')
const logger = require('../services/logger')

// Utility: Generate Return Number
const generateReturnNumber = async (transaction) => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const count = await PurchaseReturn.count({ transaction })
    return `RET-${today}-${String(count + 1).padStart(4, '0')}`
}

/**
 * GET / - List Purchase Returns
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { purchase_order_id, supplier_id, status, page = 1, limit = 50 } = req.query
        const where = {}
        if (purchase_order_id) where.purchase_order_id = purchase_order_id
        if (supplier_id) where.supplier_id = supplier_id
        if (status) where.status = status

        const offset = (page - 1) * limit
        const { count, rows } = await PurchaseReturn.findAndCountAll({
            where,
            include: [
                { model: Supplier, attributes: ['id', 'name_ar'] },
                { model: PurchaseOrder, attributes: ['id', 'po_number'] },
                { model: User, as: 'creator', attributes: ['id', 'name_ar'] }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        })

        res.json({
            data: rows,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        })
    } catch (error) {
        console.error('Get returns error:', error)
        res.status(500).json({ message: 'خطأ في جلب المرتجعات' })
    }
})

/**
 * GET /:id - Get Return Details
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const pReturn = await PurchaseReturn.findByPk(req.params.id, {
            include: [
                { model: Supplier },
                { model: Warehouse },
                { model: User, as: 'creator', attributes: ['id', 'name_ar'] },
                { model: PurchaseOrder },
                {
                    model: PurchaseReturnItem,
                    as: 'items',
                    include: [{ model: Menu, attributes: ['id', 'name_ar', 'sku'] }]
                }
            ]
        })

        if (!pReturn) return res.status(404).json({ message: 'مرتجع الشراء غير موجود' })
        res.json({ data: pReturn })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
})

/**
 * POST / - Create Draft Return
 */
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
    const transaction = await sequelize.transaction()
    try {
        const { purchase_order_id, items, notes } = req.body

        // 1. Validate PO
        const po = await PurchaseOrder.findByPk(purchase_order_id, {
            include: [
                { model: PurchaseOrderItem, as: 'items' },
                { model: Warehouse, attributes: ['id', 'branch_id'] }
            ],
            transaction
        })
        if (!po) throw new Error('أمر الشراء غير موجود')

        // 2. Prepare Return Data
        const returnNumber = await generateReturnNumber(transaction)
        let totalAmount = 0
        const returnItemsData = []

        for (const item of items) {
            // Validate against PO items
            const poItem = po.items.find(i => i.menu_id === item.menu_id)
            if (!poItem) throw new Error(`المنتج ${item.menu_id} غير موجود في أمر الشراء هذا`)

            const unitCost = parseFloat(poItem.unit_cost)
            const lineTotal = parseFloat(item.quantity) * unitCost

            // Validate quantity against Purchase Order received quantity
            const receivedQty = parseFloat(poItem.quantity_received || 0)

            // Check previous returns for this specific item (excluding cancelled returns)
            const previousReturns = await PurchaseReturnItem.findAll({
                include: [{
                    model: PurchaseReturn,
                    where: {
                        purchase_order_id,
                        status: { [Op.ne]: 'cancelled' }
                    }
                }],
                where: {
                    menu_id: item.menu_id,
                    purchase_order_item_id: poItem.id
                },
                transaction
            })

            const totalPreviouslyReturned = previousReturns.reduce((sum, r) => sum + parseFloat(r.quantity_returned), 0)
            const availableToReturn = receivedQty - totalPreviouslyReturned

            if (item.quantity > availableToReturn) {
                throw new Error(`الكمية المراد إرجاعها للمنتج ${item.menu_id} (${item.quantity}) تتجاوز الكمية المتاحة للإرجاع (${availableToReturn}). المستلم: ${receivedQty}، تم إرجاعه سابقاً: ${totalPreviouslyReturned}`)
            }

            totalAmount += lineTotal

            returnItemsData.push({
                menu_id: item.menu_id,
                purchase_order_item_id: poItem.id,
                quantity_returned: item.quantity,
                unit_cost: unitCost,
                total_cost: lineTotal,
                reason: item.reason
            })
        }

        // 3. Create Return Header
        const pReturn = await PurchaseReturn.create({
            return_number: returnNumber,
            purchase_order_id,
            supplier_id: po.supplier_id,
            warehouse_id: po.warehouse_id,
            branch_id: po.Warehouse?.branch_id || req.user.branchId || req.user.branch_id || null,
            return_date: new Date(),
            status: 'draft',
            total_amount: totalAmount,
            notes,
            created_by: req.user.userId
        }, { transaction })

        // 4. Create Items
        for (const data of returnItemsData) {
            await PurchaseReturnItem.create({
                purchase_return_id: pReturn.id,
                ...data
            }, { transaction })
        }

        await transaction.commit()
        res.status(201).json({ message: 'تم إنشاء مسودة المرتجع', data: pReturn })

    } catch (error) {
        await transaction.rollback()
        console.error('Create return error:', error)
        res.status(500).json({ message: error.message })
    }
})

/**
 * POST /:id/confirm - Process Return
 */
router.post('/:id/confirm', authenticate, authorize('admin', 'manager'), async (req, res) => {
    const transaction = await sequelize.transaction()
    try {
        const pReturn = await PurchaseReturn.findByPk(req.params.id, {
            include: [{ model: PurchaseReturnItem, as: 'items' }]
        })

        if (!pReturn) throw new Error('المرتجع غير موجود')
        if (pReturn.status !== 'draft') throw new Error('المرتجع تم تأكيده مسبقاً')

        // 1. Deduct Stock (Specific PO Layers)
        for (const item of pReturn.items) {
            await StockService.returnToSupplier({
                menuId: item.menu_id,
                warehouseId: pReturn.warehouse_id,
                quantity: item.quantity_returned,
                poId: pReturn.purchase_order_id,
                userId: req.user.userId,
                notes: `Purchase Return ${pReturn.return_number}`
            }, { transaction })
        }

        // 2. FIX-06: GL entry is recorded via AccountingHooks.onPurchaseReturn (below).
        //    After it's posted, syncSupplierBalance reads the GL and sets the correct balance.
        //    The old manual subtraction is REMOVED to prevent dual-source drift.

        // 3. Update Return Status
        await pReturn.update({
            status: 'completed',
            completed_at: new Date()
        }, { transaction })

        // Ensure branch dimension is populated before posting GL
        if (!pReturn.branch_id) {
            const returnWarehouse = await Warehouse.findByPk(pReturn.warehouse_id, {
                attributes: ['branch_id'],
                transaction
            })
            if (returnWarehouse?.branch_id) {
                await pReturn.update({ branch_id: returnWarehouse.branch_id }, { transaction })
            }
        }

        // FIX C-03: Record GL Journal Entry INSIDE transaction (atomic)
        await AccountingHooks.onPurchaseReturn(pReturn, { transaction })

        await transaction.commit()

        res.json({ message: 'تم تأكيد المرتجع وخصم المخزون', data: pReturn })

    } catch (error) {
        await transaction.rollback()
        console.error('Confirm return error:', error)
        res.status(500).json({ message: error.message })
    }
})

module.exports = router
