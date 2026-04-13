/**
 * Purchase Orders API Routes
 * Full PO lifecycle management
 */

const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { createPOValidator, receivePOValidator } = require('../validators/purchaseOrderValidator')
const AuditService = require('../services/auditService')

const {
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseReceipt,
    PurchaseReceiptItem,
    Supplier,
    Warehouse,
    Menu,
    User,
    sequelize
} = require('../models')
const StockService = require('../services/stockService')
const AccountingHooks = require('../services/accountingHooks')
const { loadSettings } = require('./settings')
const { Op } = require('sequelize')

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

const buildPurchaseOrderTotals = (items = [], defaultTaxRate = 0) => {
    let subtotal = 0
    let totalTax = 0
    let totalDiscount = 0

    const itemsData = (Array.isArray(items) ? items : []).map((item) => {
        const quantityOrdered = parseFloat(item.quantity_ordered || 0)
        const unitCost = parseFloat(item.unit_cost || 0)
        const safeDiscountRate = Number.isFinite(parseFloat(item.discount_rate)) ? parseFloat(item.discount_rate) : 0
        const rawTaxRate = (item.tax_rate === null || item.tax_rate === undefined || item.tax_rate === '')
            ? defaultTaxRate
            : parseFloat(item.tax_rate)
        const taxRate = Number.isFinite(rawTaxRate) && rawTaxRate >= 0 ? rawTaxRate : defaultTaxRate

        const lineSubtotal = quantityOrdered * unitCost
        const taxAmount = lineSubtotal * taxRate / 100
        const discountAmount = lineSubtotal * safeDiscountRate / 100
        const lineTotal = lineSubtotal + taxAmount - discountAmount

        subtotal += lineSubtotal
        totalTax += taxAmount
        totalDiscount += discountAmount

        return {
            menu_id: item.menu_id,
            quantity_ordered: quantityOrdered,
            unit_cost: unitCost,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            discount_rate: safeDiscountRate,
            discount_amount: discountAmount,
            line_total: lineTotal
        }
    })

    return {
        itemsData,
        subtotal,
        totalTax,
        totalDiscount,
        totalAmount: subtotal + totalTax - totalDiscount
    }
}

/**
 * @swagger
 * components:
 *   schemas:
 *     PurchaseOrderItem:
 *       type: object
 *       properties:
 *         menu_id:
 *           type: string
 *           format: uuid
 *         quantity_ordered:
 *           type: number
 *         unit_cost:
 *           type: number
 *         tax_rate:
 *           type: number
 *         discount_rate:
 *           type: number
 *     
 *     PurchaseOrder:
 *       type: object
 *       required:
 *         - supplier_id
 *         - warehouse_id
 *         - items
 *       properties:
 *         supplier_id:
 *           type: string
 *           format: uuid
 *         warehouse_id:
 *           type: string
 *           format: uuid
 *         expected_date:
 *           type: string
 *           format: date
 *         notes:
 *           type: string
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PurchaseOrderItem'
 */

/**
 * @swagger
 * tags:
 *   name: PurchaseOrders
 *   description: Management of Purchase Orders
 */

/**
 * @swagger
 * /api/purchase-orders:
 *   get:
 *     summary: Retrieve a list of purchase orders
 *     tags: [PurchaseOrders]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, confirmed, partial, received, cancelled]
 *       - in: query
 *         name: supplier_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: A list of purchase orders
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { status, supplier_id, warehouse_id, from_date, to_date, q, page = 1, limit = 50 } = req.query
        const where = {}

        if (status) where.status = status
        if (supplier_id) where.supplier_id = supplier_id
        if (warehouse_id) where.warehouse_id = warehouse_id
        if (from_date) where.order_date = { ...where.order_date, [Op.gte]: from_date }
        if (to_date) where.order_date = { ...where.order_date, [Op.lte]: to_date }
        if (q && String(q).trim()) {
            const search = `%${String(q).trim()}%`
            where[Op.or] = [
                { po_number: { [Op.like]: search } },
                { notes: { [Op.like]: search } }
            ]
        }

        const offset = (page - 1) * limit
        const { count, rows } = await PurchaseOrder.findAndCountAll({
            where,
            include: [
                { model: Supplier, attributes: ['id', 'name_ar', 'code'] },
                { model: Warehouse, attributes: ['id', 'name_ar'] }
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
        console.error('Get purchase orders error:', error)
        res.status(500).json({ message: 'خطأ في جلب أوامر الشراء' })
    }
})

/**
 * @swagger
 * /api/purchase-orders/{id}:
 *   get:
 *     summary: Get a purchase order by ID
 *     tags: [PurchaseOrders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Purchase order details
 *       404:
 *         description: Purchase order not found
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const po = await PurchaseOrder.findByPk(req.params.id, {
            include: [
                { model: Supplier },
                { model: Warehouse },
                { model: User, as: 'createdBy', attributes: ['id', 'name_ar'] },
                { model: User, as: 'confirmedBy', attributes: ['id', 'name_ar'] },
                { model: User, as: 'receivedBy', attributes: ['id', 'name_ar'] },
                {
                    model: PurchaseOrderItem,
                    as: 'items',
                    include: [{ model: Menu, attributes: ['id', 'name_ar', 'name_en', 'sku'] }]
                }
            ]
        })

        if (!po) {
            return res.status(404).json({ message: 'أمر الشراء غير موجود' })
        }

        res.json({ data: po })
    } catch (error) {
        console.error('Get purchase order error:', error)
        res.status(500).json({ message: 'خطأ في جلب أمر الشراء' })
    }
})

/**
 * @swagger
 * /api/purchase-orders:
 *   post:
 *     summary: Create a new purchase order
 *     tags: [PurchaseOrders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PurchaseOrder'
 *     responses:
 *       201:
 *         description: Created successfully
 */
router.post('/',
    authenticate,
    authorize('admin', 'manager'),
    createPOValidator,
    validate,
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const { supplier_id, warehouse_id, expected_date, notes, items } = req.body

            // Generate PO number
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
            const count = await PurchaseOrder.count({ transaction })
            const po_number = `PO-${today}-${String(count + 1).padStart(4, '0')}`

            // Calculate totals
            const settings = loadSettings()
            const configuredTaxRate = Number(settings?.store?.taxRate)
            const defaultTaxRate = Number.isFinite(configuredTaxRate) && configuredTaxRate >= 0
                ? configuredTaxRate
                : 0

            const { itemsData, subtotal, totalTax, totalDiscount, totalAmount } = buildPurchaseOrderTotals(items, defaultTaxRate)

            // Create Purchase Order
            const po = await PurchaseOrder.create({
                po_number,
                supplier_id,
                warehouse_id,
                expected_date,
                notes,
                subtotal,
                tax_amount: totalTax,
                discount_amount: totalDiscount,
                total_amount: totalAmount,
                created_by: req.user.userId,
                status: 'draft'
            }, { transaction })

            // Create items
            await PurchaseOrderItem.bulkCreate(
                itemsData.map(item => ({
                    ...item,
                    purchase_order_id: po.id
                })),
                { transaction }
            )

            await transaction.commit()

            // Fetch complete PO with relations
            const completePO = await PurchaseOrder.findByPk(po.id, {
                include: [
                    { model: Supplier, attributes: ['id', 'name_ar'] },
                    { model: PurchaseOrderItem, as: 'items', include: [{ model: Menu, attributes: ['id', 'name_ar'] }] }
                ]
            })

            res.status(201).json({
                message: 'تم إنشاء أمر الشراء بنجاح',
                data: completePO
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Create PO error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إنشاء أمر الشراء' })
        }
    }
)

/**
 * Update a draft purchase order before confirmation
 */
router.put('/:id',
    authenticate,
    authorize('admin', 'manager'),
    createPOValidator,
    validate,
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const { supplier_id, warehouse_id, expected_date, notes, items } = req.body

            const po = await PurchaseOrder.findByPk(req.params.id, {
                include: [{ model: PurchaseOrderItem, as: 'items' }],
                transaction,
                lock: transaction.LOCK.UPDATE
            })

            if (!po) {
                await transaction.rollback()
                return res.status(404).json({ message: 'أمر الشراء غير موجود' })
            }

            if (po.status !== 'draft') {
                await transaction.rollback()
                return res.status(400).json({ message: 'يمكن تعديل أوامر الشراء المسودة فقط' })
            }

            const settings = loadSettings()
            const configuredTaxRate = Number(settings?.store?.taxRate)
            const defaultTaxRate = Number.isFinite(configuredTaxRate) && configuredTaxRate >= 0
                ? configuredTaxRate
                : 0

            const { itemsData, subtotal, totalTax, totalDiscount, totalAmount } = buildPurchaseOrderTotals(items, defaultTaxRate)

            await po.update({
                supplier_id,
                warehouse_id,
                expected_date,
                notes,
                subtotal,
                tax_amount: totalTax,
                discount_amount: totalDiscount,
                total_amount: totalAmount
            }, { transaction })

            await PurchaseOrderItem.destroy({
                where: { purchase_order_id: po.id },
                transaction
            })

            await PurchaseOrderItem.bulkCreate(
                itemsData.map((item) => ({
                    ...item,
                    purchase_order_id: po.id
                })),
                { transaction }
            )

            await transaction.commit()

            const completePO = await PurchaseOrder.findByPk(po.id, {
                include: [
                    { model: Supplier, attributes: ['id', 'name_ar'] },
                    { model: Warehouse, attributes: ['id', 'name_ar'] },
                    { model: PurchaseOrderItem, as: 'items', include: [{ model: Menu, attributes: ['id', 'name_ar'] }] }
                ]
            })

            return res.json({
                message: 'تم تحديث أمر الشراء بنجاح',
                data: completePO
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Update PO error:', error)
            return res.status(500).json({ message: error.message || 'خطأ في تحديث أمر الشراء' })
        }
    }
)

/**
 * @swagger
 * /api/purchase-orders/{id}/confirm:
 *   post:
 *     summary: Confirm a purchase order
 *     tags: [PurchaseOrders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Confirmed successfully
 */
router.post('/:id/confirm',
    authenticate,
    authorize('admin', 'manager'),
    async (req, res) => {
        const transaction = await sequelize.transaction()
        try {
            const po = await PurchaseOrder.findByPk(req.params.id, {
                include: [
                    { model: PurchaseOrderItem, as: 'items' },
                    { model: Supplier }
                ],
                transaction
            })
            if (!po) {
                await transaction.rollback()
                return res.status(404).json({ message: 'أمر الشراء غير موجود' })
            }

            if (po.status !== 'draft') {
                await transaction.rollback()
                return res.status(400).json({ message: 'لا يمكن تأكيد أمر شراء غير مسودة' })
            }

            // 1. Update PO status to confirmed
            await po.update({
                status: 'confirmed',
                confirmed_by: req.user.userId,
                confirmed_at: new Date()
            }, { transaction })

            // 2. Auto-create a linked PurchaseReceipt (draft = pending delivery)
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
            const receiptCount = await PurchaseReceipt.count({ transaction })
            const receiptNumber = `REC-${today}-${String(receiptCount + 1).padStart(4, '0')}`

            const receiptSubtotal = po.items.reduce((sum, item) => {
                return sum + (parseFloat(item.quantity_ordered) * parseFloat(item.unit_cost))
            }, 0)
            const receiptTaxAmount = po.items.reduce((sum, item) => {
                const sub = parseFloat(item.quantity_ordered) * parseFloat(item.unit_cost)
                return sum + (sub * (parseFloat(item.tax_rate) || 0) / 100)
            }, 0)

            const receipt = await PurchaseReceipt.create({
                receipt_number: receiptNumber,
                supplier_name: po.Supplier?.name_ar || 'مورد غير معروف',
                supplier_contact: po.Supplier?.phone,
                supplier_id: po.supplier_id,
                warehouse_id: po.warehouse_id,
                purchase_order_id: po.id,
                invoice_number: po.po_number,
                invoice_date: new Date(),
                status: 'draft', // Pending delivery — user will do Goods Receipt from invoices page
                subtotal: receiptSubtotal,
                tax_amount: receiptTaxAmount,
                total_cost: receiptSubtotal + receiptTaxAmount,
                notes: `فاتورة مورد تلقائية من أمر الشراء ${po.po_number} — في انتظار استلام البضاعة`,
                created_by: req.user.userId
            }, { transaction })

            // 3. Create receipt items matching PO items
            await Promise.all(po.items.map(item =>
                PurchaseReceiptItem.create({
                    receipt_id: receipt.id,
                    menu_id: item.menu_id,
                    quantity: parseFloat(item.quantity_ordered),
                    unit_cost: parseFloat(item.unit_cost),
                    total_cost: parseFloat(item.quantity_ordered) * parseFloat(item.unit_cost)
                }, { transaction })
            ))

            await transaction.commit()

            res.json({
                message: 'تم تأكيد أمر الشراء وإنشاء فاتورة المورد',
                data: po,
                receipt: {
                    id: receipt.id,
                    receipt_number: receipt.receipt_number
                }
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Confirm PO error:', error)
            res.status(500).json({ message: 'خطأ في تأكيد أمر الشراء' })
        }
    }
)

/**
 * @swagger
 * /api/purchase-orders/{id}/receive:
 *   post:
 *     summary: Receive items against a purchase order
 *     tags: [PurchaseOrders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Purchase Order Item ID
 *                     quantity_received:
 *                       type: number
 *                     batch_number:
 *                       type: string
 *                     production_date:
 *                       type: string
 *                       format: date
 *                     expiry_date:
 *                       type: string
 *                       format: date
 *     responses:
 *       200:
 *         description: Items received successfully
 */
router.post('/:id/receive',
    authenticate,
    authorize('admin', 'manager'),
    receivePOValidator,
    validate,
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const po = await PurchaseOrder.findByPk(req.params.id, {
                include: [{ model: PurchaseOrderItem, as: 'items' }],
                transaction,
                lock: transaction.LOCK.UPDATE
            })

            if (!po) {
                await transaction.rollback()
                return res.status(404).json({ message: 'أمر الشراء غير موجود' })
            }

            if (!['confirmed', 'partial'].includes(po.status)) {
                await transaction.rollback()
                return res.status(400).json({ message: 'يجب تأكيد أمر الشراء أولاً' })
            }
            const receivedItems = Array.isArray(req.body.items)
                ? req.body.items.map((item) => ({
                    ...item,
                    ...sanitizeInventoryDateFields(item)
                }))
                : []
            let allReceived = true
            let anyReceived = false
            let receiptSubtotal = 0
            let receiptTaxAmount = 0
            const receiptItemsData = []
            const poItemsById = new Map(po.items.map((line) => [String(line.id), line]))

            for (const received of receivedItems) {
                if (!poItemsById.has(String(received.id))) {
                    await transaction.rollback()
                    return res.status(400).json({ message: `Received line item does not belong to this PO: ${received.id}` })
                }
            }

            for (const item of po.items) {
                const received = receivedItems.find((entry) => String(entry.id) === String(item.id))
                const requestedQty = parseFloat(received?.quantity_received || 0)
                const orderedQty = parseFloat(item.quantity_ordered || 0)
                const alreadyReceivedQty = parseFloat(item.quantity_received || 0)
                const remainingQty = Math.max(0, orderedQty - alreadyReceivedQty)
                const qtyToReceive = Math.min(Math.max(0, requestedQty), remainingQty)
                const newReceivedQty = alreadyReceivedQty + qtyToReceive

                if (qtyToReceive > 0) {
                    anyReceived = true

                    await item.update({
                        quantity_received: newReceivedQty,
                        remaining_quantity: Math.max(0, orderedQty - newReceivedQty),
                        batch_number: received?.batch_number || item.batch_number,
                        production_date: received?.production_date || item.production_date,
                        expiry_date: received?.expiry_date || item.expiry_date
                    }, { transaction })

                    const itemSubtotal = parseFloat(qtyToReceive) * parseFloat(item.unit_cost)
                    const itemTax = itemSubtotal * (parseFloat(item.tax_rate) || 0) / 100
                    receiptSubtotal += itemSubtotal
                    receiptTaxAmount += itemTax

                    receiptItemsData.push({
                        menu_id: item.menu_id,
                        quantity: qtyToReceive,
                        unit_cost: item.unit_cost,
                        total_cost: itemSubtotal,
                        batch_number: received?.batch_number,
                        production_date: received?.production_date,
                        expiry_date: received?.expiry_date
                    })

                    await StockService.addStock({
                        menuId: item.menu_id,
                        warehouseId: po.warehouse_id,
                        quantity: qtyToReceive,
                        unitCost: item.unit_cost,
                        sourceType: 'purchase',
                        sourceId: po.id,
                        userId: req.user.userId
                    }, {
                        transaction,
                        batchNumber: received?.batch_number,
                        productionDate: received?.production_date,
                        expiryDate: received?.expiry_date,
                        notes: `Receive from PO ${po.po_number}`
                    })
                }

                if (newReceivedQty < orderedQty) {
                    allReceived = false
                }
            }

            if (!anyReceived) {
                await transaction.rollback()
                return res.status(400).json({ message: 'No valid quantity selected for receiving' })
            }

            // Create linked PurchaseReceipt if any items were received
            let createdReceipt = null
            if (anyReceived && receiptItemsData.length > 0) {
                // Generate receipt number
                const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
                const receiptCount = await PurchaseReceipt.count({ transaction })
                const receiptNumber = `REC-${today}-${String(receiptCount + 1).padStart(4, '0')}`

                // Get supplier info
                const supplier = await Supplier.findByPk(po.supplier_id, { transaction })

                // Create receipt
                createdReceipt = await PurchaseReceipt.create({
                    receipt_number: receiptNumber,
                    supplier_name: supplier?.name_ar || 'مورد غير معروف',
                    supplier_contact: supplier?.phone,
                    supplier_id: po.supplier_id,
                    warehouse_id: po.warehouse_id,
                    purchase_order_id: po.id,
                    invoice_number: po.po_number,
                    invoice_date: new Date(),
                    status: 'received',
                    subtotal: receiptSubtotal,
                    tax_amount: receiptTaxAmount,
                    total_cost: receiptSubtotal + receiptTaxAmount,
                    notes: `سند استلام تلقائي من أمر الشراء ${po.po_number}`,
                    created_by: req.user.userId,
                    received_by: req.user.userId,
                    received_at: new Date()
                }, { transaction })

                // Create receipt items
                await Promise.all(receiptItemsData.map(itemData =>
                    PurchaseReceiptItem.create({
                        receipt_id: createdReceipt.id,
                        ...itemData
                    }, { transaction })
                ))
            }

            // Update PO status
            const newStatus = allReceived ? 'received' : (anyReceived ? 'partial' : po.status)
            await po.update({
                status: newStatus,
                received_by: req.user.userId,
                received_at: allReceived ? new Date() : null
            }, { transaction })

            // FIX C-03: Record GL entry INSIDE transaction (atomic)
            if (createdReceipt) {
                await AccountingHooks.onPurchaseReceived(createdReceipt, { transaction })
            }

            await transaction.commit()

            res.json({
                message: allReceived ? 'تم استلام أمر الشراء بالكامل' : 'تم استلام جزء من أمر الشراء',
                data: await PurchaseOrder.findByPk(po.id, {
                    include: [{ model: PurchaseOrderItem, as: 'items' }]
                }),
                receipt: createdReceipt ? {
                    id: createdReceipt.id,
                    receipt_number: createdReceipt.receipt_number
                } : null
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Receive PO error:', error)
            if (error.statusCode === 400) {
                return res.status(400).json({ message: error.message })
            }
            res.status(500).json({ message: error.message || 'خطأ في استلام أمر الشراء' })
        }
    }
)

/**
 * @swagger
 * /api/purchase-orders/{id}/cancel:
 *   post:
 *     summary: Cancel a purchase order
 *     tags: [PurchaseOrders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order cancelled
 */
router.post('/:id/cancel',
    authenticate,
    authorize('admin'),
    async (req, res) => {
        try {
            const po = await PurchaseOrder.findByPk(req.params.id)
            if (!po) {
                return res.status(404).json({ message: 'أمر الشراء غير موجود' })
            }

            if (['received', 'cancelled'].includes(po.status)) {
                return res.status(400).json({ message: 'لا يمكن إلغاء أمر شراء مستلم أو ملغى' })
            }

            await po.update({ status: 'cancelled' })

            res.json({
                message: 'تم إلغاء أمر الشراء',
                data: po
            })
        } catch (error) {
            console.error('Cancel PO error:', error)
            res.status(500).json({ message: 'خطأ في إلغاء أمر الشراء' })
        }
    }
)

/**
 * @swagger
 * /api/purchase-orders/{id}:
 *   delete:
 *     summary: Delete a draft purchase order
 *     tags: [PurchaseOrders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted successfully
 */
router.delete('/:id',
    authenticate,
    authorize('admin'),
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const po = await PurchaseOrder.findByPk(req.params.id)
            if (!po) {
                await transaction.rollback()
                return res.status(404).json({ message: 'أمر الشراء غير موجود' })
            }

            if (po.status !== 'draft') {
                await transaction.rollback()
                return res.status(400).json({ message: 'يمكن حذف أوامر الشراء المسودة فقط' })
            }


            // Soft delete - just cancel
            await po.update({
                status: 'cancelled',
                notes: po.notes ? po.notes + '\n[Cancelled by ' + req.user.username + ']' : '[Cancelled by ' + req.user.username + ']'
            }, { transaction })

            // Log audit
            await AuditService.log({
                userId: req.user.userId,
                branchId: req.user.branchId,
                category: 'purchasing',
                action: 'cancel_po',
                entity: 'PurchaseOrder',
                entityId: po.id,
                oldValue: { status: 'draft' },
                newValue: { status: 'cancelled' },
                metadata: { reason: 'User requested deletion' }
            })

            await transaction.commit()

            res.json({ message: 'تم إلغاء أمر الشراء بنجاح' })
        } catch (error) {
            await transaction.rollback()
            console.error('Delete PO error:', error)
            res.status(500).json({ message: 'خطأ في حذف أمر الشراء' })
        }
    }
)

module.exports = router
