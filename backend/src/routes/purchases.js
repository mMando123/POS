/**
 * Purchase Receipt API Routes
 * Handle purchase orders and inventory receiving
 */

const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const StockService = require('../services/stockService')
const AccountingService = require('../services/accountingService')
const AccountingHooks = require('../services/accountingHooks')
const { loadSettings } = require('./settings')
const {
    PurchaseReceipt,
    PurchaseReceiptItem,
    PurchaseOrder,
    PurchaseOrderItem,
    Supplier,
    Menu,
    Warehouse,
    sequelize
} = require('../models')
const { Op } = require('sequelize')

/**
 * GET /api/purchases
 * List purchase receipts
 */
router.get('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { warehouse_id, supplier_id, status, start_date, end_date, q, limit = 50, offset = 0 } = req.query

        const where = {}
        if (warehouse_id) where.warehouse_id = warehouse_id
        if (supplier_id) where.supplier_id = supplier_id
        if (status) where.status = status
        if (start_date || end_date) {
            where.created_at = {}
            if (start_date) where.created_at[Op.gte] = start_date
            if (end_date) where.created_at[Op.lte] = end_date
        }
        if (q && String(q).trim()) {
            const search = `%${String(q).trim()}%`
            where[Op.or] = [
                { receipt_number: { [Op.like]: search } },
                { invoice_number: { [Op.like]: search } },
                { supplier_name: { [Op.like]: search } },
                { supplier_contact: { [Op.like]: search } }
            ]
        }

        const { rows, count } = await PurchaseReceipt.findAndCountAll({
            where,
            include: [
                { model: Warehouse, attributes: ['id', 'name_ar'] },
                { model: Supplier, attributes: ['id', 'name_ar'], required: false },
                { model: PurchaseOrder, as: 'purchaseOrder', attributes: ['id', 'po_number', 'status'], required: false },
                { model: PurchaseReceiptItem, as: 'items', include: [{ model: Menu, attributes: ['id', 'name_ar', 'sku'] }] }
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
        console.error('Get purchases error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø´Ø±Ø§Ø¡' })
    }
})

/**
 * GET /api/purchases/:id
 * Get purchase receipt details
 */
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const receipt = await PurchaseReceipt.findByPk(req.params.id, {
            include: [
                { model: Warehouse, attributes: ['id', 'name_ar', 'name_en'] },
                {
                    model: PurchaseReceiptItem,
                    as: 'items',
                    include: [{ model: Menu, attributes: ['id', 'name_ar', 'name_en', 'sku', 'barcode'] }]
                }
            ]
        })

        if (!receipt) {
            return res.status(404).json({ message: 'Ø³Ù†Ø¯ Ø§Ù„Ø¥Ø³ØªÙ„Ø§Ù… ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
        }

        res.json({ data: receipt })
    } catch (error) {
        console.error('Get purchase error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø³Ù†Ø¯ Ø§Ù„Ø¥Ø³ØªÙ„Ø§Ù…' })
    }
})

/**
 * POST /api/purchases
 * Create a new purchase receipt (draft)
 */
router.post('/',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('supplier_name').notEmpty().withMessage('Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ±Ø¯ Ù…Ø·Ù„ÙˆØ¨'),
        body('warehouse_id').isUUID().withMessage('Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ ØºÙŠØ± ØµØ§Ù„Ø­'),
        body('items').isArray({ min: 1 }).withMessage('ÙŠØ¬Ø¨ Ø¥Ø¶Ø§ÙØ© Ù…Ù†ØªØ¬ ÙˆØ§Ø­Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„'),
        body('items.*.menu_id').isUUID().withMessage('Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ù†ØªØ¬ ØºÙŠØ± ØµØ§Ù„Ø­'),
        body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Ø§Ù„ÙƒÙ…ÙŠØ© ØºÙŠØ± ØµØ§Ù„Ø­Ø©'),
        body('items.*.unit_cost').isFloat({ min: 0 }).withMessage('Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø© ØºÙŠØ± ØµØ§Ù„Ø­'),
        body('items.*.tax_rate').optional().isFloat({ min: 0, max: 100 }).withMessage('Line tax rate must be between 0 and 100')
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const transaction = await sequelize.transaction()

        try {
            const { supplier_name, supplier_contact, supplier_id, warehouse_id, invoice_number, invoice_date, items, notes, payment_method, payment_account_code } = req.body

            // Resolve warehouse and branch upfront (mandatory for branch-aware accounting)
            const warehouse = await Warehouse.findByPk(warehouse_id, {
                attributes: ['id', 'branch_id'],
                transaction
            })
            if (!warehouse) {
                await transaction.rollback()
                return res.status(400).json({ message: 'Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„Ù…Ø­Ø¯Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
            }

            // Resolve supplier_id from name if not provided
            let resolvedSupplierId = supplier_id || null
            if (!resolvedSupplierId && supplier_name) {
                const supplier = await Supplier.findOne({
                    where: { name_ar: supplier_name },
                    transaction
                })
                if (supplier) resolvedSupplierId = supplier.id
            }

            // Generate receipt number
            const count = await PurchaseReceipt.count({ transaction })
            const receiptNumber = `PUR-${Date.now()}-${count + 1}`

            // Calculate totals (default VAT from settings, overridable per line via items[].tax_rate)
            const settings = loadSettings()
            const configuredTaxRate = Number(settings?.store?.taxRate)
            const defaultTaxRate = Number.isFinite(configuredTaxRate) && configuredTaxRate >= 0
                ? configuredTaxRate
                : 0

            const normalizedItems = items.map((item) => {
                const quantity = parseFloat(item.quantity) || 0
                const unitCost = parseFloat(item.unit_cost) || 0
                const lineSubtotal = quantity * unitCost
                const rawLineTaxRate = item.tax_rate
                const lineTaxRate = (rawLineTaxRate === null || rawLineTaxRate === undefined || rawLineTaxRate === '')
                    ? defaultTaxRate
                    : parseFloat(rawLineTaxRate)
                const safeLineTaxRate = Number.isFinite(lineTaxRate) && lineTaxRate >= 0
                    ? lineTaxRate
                    : defaultTaxRate
                const lineTaxAmount = (lineSubtotal * safeLineTaxRate) / 100

                return {
                    ...item,
                    quantity,
                    unit_cost: unitCost,
                    line_subtotal: lineSubtotal,
                    line_tax_amount: lineTaxAmount
                }
            })

            const subtotal = normalizedItems.reduce((sum, item) => sum + item.line_subtotal, 0)
            const taxAmount = normalizedItems.reduce((sum, item) => sum + item.line_tax_amount, 0)
            const totalCost = subtotal + taxAmount

            // Create receipt
            const receipt = await PurchaseReceipt.create({
                receipt_number: receiptNumber,
                supplier_name,
                supplier_contact,
                supplier_id: resolvedSupplierId,
                warehouse_id,
                branch_id: warehouse.branch_id || null,
                invoice_number,
                invoice_date,
                status: 'draft',
                payment_method: payment_method || 'credit',
                payment_account_code: payment_account_code || null,
                subtotal,
                tax_amount: taxAmount,
                total_cost: totalCost,
                notes,
                created_by: req.user.userId
            }, { transaction })

            // Create items
            const receiptItems = await Promise.all(normalizedItems.map(item =>
                PurchaseReceiptItem.create({
                    receipt_id: receipt.id,
                    menu_id: item.menu_id,
                    quantity: item.quantity,
                    unit_cost: item.unit_cost,
                    total_cost: item.line_subtotal,
                    batch_number: item.batch_number,
                    expiry_date: item.expiry_date
                }, { transaction })
            ))

            await transaction.commit()

            res.status(201).json({
                message: 'ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø³Ù†Ø¯ Ø§Ù„Ø¥Ø³ØªÙ„Ø§Ù… Ø¨Ù†Ø¬Ø§Ø­',
                data: {
                    ...receipt.toJSON(),
                    items: receiptItems
                }
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Create purchase error:', error)
            res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¥Ù†Ø´Ø§Ø¡ Ø³Ù†Ø¯ Ø§Ù„Ø¥Ø³ØªÙ„Ø§Ù…' })
        }
    }
)

/**
 * POST /api/purchases/:id/receive
 * Goods receipt â€” receive items (supports partial receiving)
 * Body: { items: [{ id: receiptItemId, quantity_received: number }] }
 * If no items body is sent, receive ALL items in full (backwards compat)
 */
router.post('/:id/receive',
    authenticate,
    authorize('admin', 'manager'),
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const receipt = await PurchaseReceipt.findByPk(req.params.id, {
                include: [
                    { model: PurchaseReceiptItem, as: 'items', include: [{ model: Menu, attributes: ['id', 'name_ar'] }] },
                    {
                        model: PurchaseOrder,
                        as: 'purchaseOrder',
                        required: false,
                        include: [{ model: PurchaseOrderItem, as: 'items' }]
                    }
                ],
                transaction,
                lock: transaction.LOCK.UPDATE
            })

            if (!receipt) {
                await transaction.rollback()
                return res.status(404).json({ message: 'ÙØ§ØªÙˆØ±Ø© Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' })
            }

            if (receipt.status === 'received') {
                await transaction.rollback()
                return res.status(400).json({ message: 'ØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ù‡Ø°Ù‡ Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ù…Ø³Ø¨Ù‚Ø§Ù‹' })
            }

            if (receipt.status === 'cancelled') {
                await transaction.rollback()
                return res.status(400).json({ message: 'Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ø³ØªÙ„Ø§Ù… ÙØ§ØªÙˆØ±Ø© Ù…Ù„ØºØ§Ø©' })
            }

            if (req.body.items !== undefined && !Array.isArray(req.body.items)) {
                await transaction.rollback()
                return res.status(400).json({ message: 'items must be an array' })
            }

            const receivedItemsInput = Array.isArray(req.body.items) ? req.body.items : null
            let allFullyReceived = true
            let anyReceived = false
            const receivedByMenuId = new Map()
            const receiptItemsById = new Map((receipt.items || []).map((line) => [String(line.id), line]))

            if (receivedItemsInput) {
                for (const received of receivedItemsInput) {
                    if (!receiptItemsById.has(String(received.id))) {
                        await transaction.rollback()
                        return res.status(400).json({
                            message: `Received line item does not belong to this receipt: ${received.id}`
                        })
                    }
                }
            }

            for (const item of receipt.items) {
                // Determine how much to receive for this item
                let qtyToReceive = 0
                const alreadyReceived = parseFloat(item.quantity_received || 0)
                const totalOrdered = parseFloat(item.quantity)

                if (receivedItemsInput) {
                    // Partial receive mode â€” look for this item in the request
                    const inputItem = receivedItemsInput.find((ri) => String(ri.id) === String(item.id))
                    if (inputItem && parseFloat(inputItem.quantity_received) > 0) {
                        qtyToReceive = Math.min(
                            parseFloat(inputItem.quantity_received),
                            totalOrdered - alreadyReceived  // Don't exceed remaining
                        )
                    }
                } else {
                    // Full receive mode (backwards compat) â€” receive everything remaining
                    qtyToReceive = totalOrdered - alreadyReceived
                }

                if (qtyToReceive > 0) {
                    anyReceived = true

                    // Enable track_stock for this product automatically
                    await Menu.update(
                        { track_stock: true },
                        { where: { id: item.menu_id }, transaction }
                    )

                    // Add to stock
                    await StockService.addStock({
                        menuId: item.menu_id,
                        warehouseId: receipt.warehouse_id,
                        quantity: qtyToReceive,
                        unitCost: parseFloat(item.unit_cost),
                        sourceType: 'purchase',
                        sourceId: receipt.id,
                        userId: req.user.userId
                    }, {
                        transaction,
                        reference: receipt.receipt_number,
                        batchNumber: item.batch_number,
                        expiryDate: item.expiry_date,
                        notes: `Ø§Ø³ØªÙ„Ø§Ù… Ù…Ù† Ø§Ù„Ù…ÙˆØ±Ø¯: ${receipt.supplier_name}`
                    })

                    // Update the receipt item's received quantity
                    const newReceived = alreadyReceived + qtyToReceive
                    await item.update({
                        quantity_received: newReceived
                    }, { transaction })

                    const menuKey = String(item.menu_id)
                    const alreadyAdded = parseFloat(receivedByMenuId.get(menuKey) || 0)
                    receivedByMenuId.set(menuKey, alreadyAdded + qtyToReceive)

                    // Check if fully received
                    if (newReceived < totalOrdered) {
                        allFullyReceived = false
                    }
                } else {
                    // Item not touched â€” check if it was previously fully received
                    if (alreadyReceived < totalOrdered) {
                        allFullyReceived = false
                    }
                }
            }

            if (!anyReceived) {
                await transaction.rollback()
                return res.status(400).json({ message: 'Ù„Ù… ÙŠØªÙ… ØªØ­Ø¯ÙŠØ¯ Ø£ÙŠ ÙƒÙ…ÙŠØ© Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù…' })
            }

            // Keep linked PO items synchronized with the received quantities.
            if (receipt.purchase_order_id && receipt.purchaseOrder && receivedByMenuId.size > 0) {
                const poItems = Array.isArray(receipt.purchaseOrder.items) ? receipt.purchaseOrder.items : []

                for (const [menuId, receivedQtyRaw] of receivedByMenuId.entries()) {
                    let remainingToAllocate = parseFloat(receivedQtyRaw || 0)
                    if (!(remainingToAllocate > 0)) continue

                    const matchingLines = poItems
                        .filter((line) => String(line.menu_id) === String(menuId))
                        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

                    for (const poLine of matchingLines) {
                        if (remainingToAllocate <= 0) break

                        const orderedQty = parseFloat(poLine.quantity_ordered || 0)
                        const lineReceived = parseFloat(poLine.quantity_received || 0)
                        const lineRemaining = Math.max(0, orderedQty - lineReceived)
                        if (!(lineRemaining > 0)) continue

                        const allocateQty = Math.min(lineRemaining, remainingToAllocate)
                        const newLineReceived = lineReceived + allocateQty
                        const newLineRemaining = Math.max(0, orderedQty - newLineReceived)

                        await poLine.update({
                            quantity_received: newLineReceived,
                            remaining_quantity: newLineRemaining
                        }, { transaction })

                        poLine.quantity_received = newLineReceived
                        poLine.remaining_quantity = newLineRemaining
                        remainingToAllocate -= allocateQty
                    }

                    if (remainingToAllocate > 0.000001) {
                        await transaction.rollback()
                        return res.status(400).json({
                            message: `الكمية المستلمة للصنف ${menuId} تتجاوز المتبقي في أمر الشراء`
                        })
                    }
                }
            }

            // Update receipt status
            const newStatus = allFullyReceived ? 'received' : 'partial'
            await receipt.update({
                status: newStatus,
                received_by: req.user.userId,
                received_at: allFullyReceived ? new Date() : null
            }, { transaction })

            // Update linked PO status if exists
            if (receipt.purchase_order_id && receipt.purchaseOrder) {
                const poItems = Array.isArray(receipt.purchaseOrder.items) ? receipt.purchaseOrder.items : []
                const allPOItemsReceived = poItems.length > 0 && poItems.every((line) => {
                    const orderedQty = parseFloat(line.quantity_ordered || 0)
                    const lineReceived = parseFloat(line.quantity_received || 0)
                    return lineReceived >= orderedQty
                })
                const anyPOItemsReceived = poItems.some((line) => parseFloat(line.quantity_received || 0) > 0)
                const poStatus = allPOItemsReceived ? 'received' : (anyPOItemsReceived ? 'partial' : receipt.purchaseOrder.status)

                await receipt.purchaseOrder.update({
                    status: poStatus,
                    received_by: req.user.userId,
                    received_at: allPOItemsReceived ? new Date() : null
                }, { transaction })
            }

            // Ensure branch dimension is populated before posting GL
            if (!receipt.branch_id) {
                const receiptWarehouse = await Warehouse.findByPk(receipt.warehouse_id, {
                    attributes: ['branch_id'],
                    transaction
                })
                if (receiptWarehouse?.branch_id) {
                    await receipt.update({ branch_id: receiptWarehouse.branch_id }, { transaction })
                }
            }

            // Post GL only once when the receipt becomes fully received.
            // This avoids overstating AP/Inventory on first partial receive.
            if (allFullyReceived) {
                await AccountingHooks.onPurchaseReceived(receipt, { transaction })
            }

            await transaction.commit()

            res.json({
                message: allFullyReceived
                    ? 'ØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ ÙˆØ¥Ø¶Ø§ÙØªÙ‡Ø§ Ù„Ù„Ù…Ø®Ø²ÙˆÙ† âœ…'
                    : 'ØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ø¬Ø²Ø¡ Ù…Ù† Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© ÙˆØ¥Ø¶Ø§ÙØªÙ‡ Ù„Ù„Ù…Ø®Ø²ÙˆÙ† ðŸ“¦',
                data: await PurchaseReceipt.findByPk(receipt.id, {
                    include: [
                        { model: PurchaseReceiptItem, as: 'items', include: [{ model: Menu, attributes: ['id', 'name_ar', 'sku'] }] },
                        { model: PurchaseOrder, as: 'purchaseOrder', attributes: ['id', 'po_number', 'status'], required: false }
                    ]
                })
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Receive purchase error:', error)
            res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø©' })
        }
    }
)

/**
 * DELETE /api/purchases/:id
 * Cancel / void a purchase receipt.
 * 
 * FIX-05: Now reverses the GL entry if the receipt was already posted.
 * 
 * Rules:
 *  - Draft receipts: can be cancelled freely (no GL entry existed)
 *  - Received/Partial receipts: require admin + creates GL reversal entry
 *    to cancel the Inventory debit and AP credit that were already posted.
 */
router.delete('/:id',
    authenticate,
    authorize('admin'),
    async (req, res) => {
        const transaction = await sequelize.transaction()
        try {
            const receipt = await PurchaseReceipt.findByPk(req.params.id, {
                include: [{ model: PurchaseReceiptItem, as: 'items' }],
                transaction
            })

            if (!receipt) {
                await transaction.rollback()
                return res.status(404).json({ message: 'Ø³Ù†Ø¯ Ø§Ù„Ø¥Ø³ØªÙ„Ø§Ù… ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
            }

            if (receipt.status === 'draft') {
                // Draft: no GL entry was created, simple cancel
                await receipt.update({ status: 'cancelled' }, { transaction })
                await transaction.commit()
                return res.json({ message: 'ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø³Ù†Ø¯ Ø§Ù„Ø¥Ø³ØªÙ„Ø§Ù… (Ù…Ø³ÙˆØ¯Ø©)' })
            }

            if (!['received', 'partial'].includes(receipt.status)) {
                await transaction.rollback()
                return res.status(400).json({ message: `Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥Ù„ØºØ§Ø¡ Ø³Ù†Ø¯ Ø¨Ø­Ø§Ù„Ø©: ${receipt.status}` })
            }

            // FIX-05: Received/Partial â€” must reverse the GL entry
            // Reverse stock impact first; if stock was consumed, block cancellation.
            for (const item of (receipt.items || [])) {
                const qtyReceived = parseFloat(item.quantity_received || item.quantity || 0)
                if (qtyReceived <= 0) continue

                try {
                    await StockService.deductStock({
                        menuId: item.menu_id,
                        warehouseId: receipt.warehouse_id,
                        quantity: qtyReceived,
                        sourceType: 'purchase_cancel',
                        sourceId: receipt.id,
                        userId: req.user.userId,
                        notes: `Ø¥Ù„ØºØ§Ø¡ Ø³Ù†Ø¯ Ø§Ø³ØªÙ„Ø§Ù… ${receipt.receipt_number || receipt.id}`
                    }, { transaction })
                } catch (stockError) {
                    throw new Error(`Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø³Ù†Ø¯ Ù„Ø£Ù† Ø¬Ø²Ø¡Ù‹Ø§ Ù…Ù† Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø³ØªÙ„Ù…Ø© Ù‚Ø¯ ØªÙ… Ø§Ø³ØªÙ‡Ù„Ø§ÙƒÙ‡ Ø¨Ø§Ù„ÙØ¹Ù„. ${stockError.message}`)
                }
            }

            // Step 1: Find and reverse the accounting entry
            await AccountingService.reversePurchaseReceipt(receipt.id, {
                reason: `Ø¥Ù„ØºØ§Ø¡ Ø³Ù†Ø¯ Ø§Ø³ØªÙ„Ø§Ù… ${receipt.receipt_number || receipt.id} Ø¨ÙˆØ§Ø³Ø·Ø© Ø§Ù„Ù…Ø¯ÙŠØ±`,
                createdBy: req.user.userId,
                transaction
            })

            // Step 2: Cancel the receipt record
            await receipt.update({
                status: 'cancelled',
                notes: `[Ø¥Ù„ØºØ§Ø¡ Ø¨ÙˆØ§Ø³Ø·Ø© Ø§Ù„Ù…Ø¯ÙŠØ± - ${new Date().toISOString()}] ${receipt.notes || ''}`
            }, { transaction })

            await transaction.commit()

            res.json({
                message: 'ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø³Ù†Ø¯ Ø§Ù„Ø¥Ø³ØªÙ„Ø§Ù… ÙˆØ¹ÙƒØ³ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ø¨Ù†Ø¬Ø§Ø­ âœ…',
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Cancel purchase error:', error)
            res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø³Ù†Ø¯' })
        }
    }
)

module.exports = router

