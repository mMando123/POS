/**
 * Stock Issue Routes — إذن صرف بضاعة من المخزن
 *
 * Lifecycle:  draft → approved → issued → (closed)
 *                 ↘ cancelled
 *
 * Endpoints:
 *   GET    /api/stock-issues           — قائمة أذونات الصرف
 *   GET    /api/stock-issues/:id       — تفاصيل إذن صرف
 *   POST   /api/stock-issues           — إنشاء إذن صرف (مسودة)
 *   PUT    /api/stock-issues/:id       — تعديل إذن صرف (مسودة فقط)
 *   POST   /api/stock-issues/:id/approve   — اعتماد
 *   POST   /api/stock-issues/:id/issue     — تنفيذ الصرف (خصم مخزون)
 *   POST   /api/stock-issues/:id/cancel    — إلغاء
 */

const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const StockService = require('../services/stockService')
const AccountingService = require('../services/accountingService')
const {
    StockIssue,
    StockIssueItem,
    Warehouse,
    Branch,
    Menu,
    User,
    Stock,
    sequelize
} = require('../models')
const { Op } = require('sequelize')

// ==================== LIST ====================

/**
 * GET /api/stock-issues
 * List stock issue notes with filters
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { status, issue_type, warehouse_id, start_date, end_date, limit = 50, offset = 0 } = req.query

        const where = {}

        // Branch isolation
        if (req.user?.role !== 'admin') {
            where.branch_id = req.user?.branchId || null
        }

        if (status) where.status = status
        if (issue_type) where.issue_type = issue_type
        if (warehouse_id) where.warehouse_id = warehouse_id

        if (start_date || end_date) {
            where.created_at = {}
            if (start_date) where.created_at[Op.gte] = new Date(start_date)
            if (end_date) where.created_at[Op.lte] = new Date(end_date + 'T23:59:59')
        }

        const { rows, count } = await StockIssue.findAndCountAll({
            where,
            include: [
                { model: Warehouse, attributes: ['id', 'name_ar', 'name_en'] },
                { model: Branch, attributes: ['id', 'name_ar', 'name_en'] },
                { model: User, as: 'createdBy', attributes: ['id', 'name_ar'] },
                { model: User, as: 'approvedBy', attributes: ['id', 'name_ar'] },
                { model: User, as: 'issuedBy', attributes: ['id', 'name_ar'] }
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
        console.error('List stock issues error:', error)
        res.status(500).json({ message: 'خطأ في جلب أذونات الصرف' })
    }
})

// ==================== GET ONE ====================

/**
 * GET /api/stock-issues/:id
 * Get stock issue details with items
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const issue = await StockIssue.findByPk(req.params.id, {
            include: [
                { model: Warehouse, attributes: ['id', 'name_ar', 'name_en'] },
                { model: Branch, attributes: ['id', 'name_ar', 'name_en'] },
                { model: User, as: 'createdBy', attributes: ['id', 'name_ar'] },
                { model: User, as: 'approvedBy', attributes: ['id', 'name_ar'] },
                { model: User, as: 'issuedBy', attributes: ['id', 'name_ar'] },
                {
                    model: StockIssueItem,
                    as: 'items',
                    include: [{ model: Menu, attributes: ['id', 'name_ar', 'name_en', 'sku', 'unit_of_measure'] }]
                }
            ]
        })

        if (!issue) {
            return res.status(404).json({ message: 'إذن الصرف غير موجود' })
        }

        // Branch check
        if (req.user?.role !== 'admin' && req.user?.branchId && issue.branch_id !== req.user.branchId) {
            return res.status(403).json({ message: 'غير مصرح لك بعرض إذن صرف خارج فرعك' })
        }

        res.json({ data: issue })
    } catch (error) {
        console.error('Get stock issue error:', error)
        res.status(500).json({ message: 'خطأ في جلب تفاصيل إذن الصرف' })
    }
})

// ==================== CREATE ====================

/**
 * POST /api/stock-issues
 * Create a new stock issue note (draft)
 */
router.post('/',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('warehouse_id').isUUID().withMessage('معرف المستودع غير صالح'),
        body('issue_type').isIn(['kitchen', 'branch_transfer', 'department', 'customer', 'waste', 'other']).withMessage('نوع الصرف غير صالح'),
        body('recipient_name').optional().isLength({ max: 200 }),
        body('recipient_department').optional().isLength({ max: 200 }),
        body('notes').optional().isLength({ max: 2000 }),
        body('items').isArray({ min: 1 }).withMessage('يجب إضافة صنف واحد على الأقل'),
        body('items.*.menu_id').isUUID().withMessage('معرف الصنف غير صالح'),
        body('items.*.requested_quantity').isFloat({ min: 0.001 }).withMessage('الكمية المطلوبة غير صالحة'),
        body('items.*.notes').optional().isLength({ max: 500 })
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const transaction = await sequelize.transaction()

        try {
            const { warehouse_id, issue_type, recipient_name, recipient_department, notes, items } = req.body

            // Resolve branch
            const branchId = req.user?.branchId || req.body.branch_id
            if (!branchId) {
                await transaction.rollback()
                return res.status(400).json({ message: 'لا يمكن تحديد الفرع' })
            }

            // Verify warehouse exists
            const warehouse = await Warehouse.findByPk(warehouse_id, { transaction })
            if (!warehouse) {
                await transaction.rollback()
                return res.status(404).json({ message: 'المستودع غير موجود' })
            }

            // Generate issue number
            const count = await StockIssue.count({ transaction })
            const issueNumber = `ISS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`

            // Create issue header
            const issue = await StockIssue.create({
                issue_number: issueNumber,
                warehouse_id,
                branch_id: branchId,
                issue_type,
                recipient_name: recipient_name || null,
                recipient_department: recipient_department || null,
                notes: notes || null,
                status: 'draft',
                total_items: items.length,
                created_by: req.user.userId
            }, { transaction })

            // Create items
            let totalQuantity = 0
            for (const item of items) {
                const menu = await Menu.findByPk(item.menu_id, { transaction })
                if (!menu) {
                    await transaction.rollback()
                    return res.status(404).json({ message: `الصنف ${item.menu_id} غير موجود` })
                }

                // Get current stock cost
                const stock = await Stock.findOne({
                    where: { menu_id: item.menu_id, warehouse_id },
                    transaction
                })

                const unitCost = stock ? parseFloat(stock.avg_cost || 0) : parseFloat(menu.cost_price || 0)

                await StockIssueItem.create({
                    issue_id: issue.id,
                    menu_id: item.menu_id,
                    requested_quantity: parseFloat(item.requested_quantity),
                    unit_cost: unitCost,
                    total_cost: parseFloat(item.requested_quantity) * unitCost,
                    unit: menu.unit_of_measure || 'piece',
                    notes: item.notes || null
                }, { transaction })

                totalQuantity += parseFloat(item.requested_quantity)
            }

            // Update totals
            await issue.update({
                total_items: items.length,
                total_quantity: totalQuantity,
                total_cost: 0 // will be calculated on issue
            }, { transaction })

            await transaction.commit()

            // Fetch with includes
            const result = await StockIssue.findByPk(issue.id, {
                include: [
                    { model: Warehouse, attributes: ['id', 'name_ar'] },
                    { model: User, as: 'createdBy', attributes: ['id', 'name_ar'] },
                    {
                        model: StockIssueItem,
                        as: 'items',
                        include: [{ model: Menu, attributes: ['id', 'name_ar', 'sku'] }]
                    }
                ]
            })

            res.status(201).json({
                message: 'تم إنشاء إذن الصرف بنجاح',
                data: result
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Create stock issue error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إنشاء إذن الصرف' })
        }
    }
)

// ==================== UPDATE (Draft only) ====================

/**
 * PUT /api/stock-issues/:id
 * Update a draft stock issue
 */
router.put('/:id',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('issue_type').optional().isIn(['kitchen', 'branch_transfer', 'department', 'customer', 'waste', 'other']),
        body('recipient_name').optional().isLength({ max: 200 }),
        body('recipient_department').optional().isLength({ max: 200 }),
        body('notes').optional().isLength({ max: 2000 }),
        body('items').optional().isArray({ min: 1 }),
        body('items.*.menu_id').optional().isUUID(),
        body('items.*.requested_quantity').optional().isFloat({ min: 0.001 })
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const transaction = await sequelize.transaction()

        try {
            const issue = await StockIssue.findByPk(req.params.id, { transaction })

            if (!issue) {
                await transaction.rollback()
                return res.status(404).json({ message: 'إذن الصرف غير موجود' })
            }

            if (issue.status !== 'draft') {
                await transaction.rollback()
                return res.status(400).json({ message: 'لا يمكن تعديل إذن الصرف إلا في حالة المسودة' })
            }

            const { issue_type, recipient_name, recipient_department, notes, items } = req.body

            // Update header
            await issue.update({
                issue_type: issue_type ?? issue.issue_type,
                recipient_name: recipient_name ?? issue.recipient_name,
                recipient_department: recipient_department ?? issue.recipient_department,
                notes: notes ?? issue.notes
            }, { transaction })

            // Replace items if provided
            if (items && items.length > 0) {
                await StockIssueItem.destroy({ where: { issue_id: issue.id }, transaction })

                let totalQuantity = 0
                for (const item of items) {
                    const menu = await Menu.findByPk(item.menu_id, { transaction })
                    if (!menu) {
                        await transaction.rollback()
                        return res.status(404).json({ message: `الصنف ${item.menu_id} غير موجود` })
                    }

                    const stock = await Stock.findOne({
                        where: { menu_id: item.menu_id, warehouse_id: issue.warehouse_id },
                        transaction
                    })

                    const unitCost = stock ? parseFloat(stock.avg_cost || 0) : parseFloat(menu.cost_price || 0)

                    await StockIssueItem.create({
                        issue_id: issue.id,
                        menu_id: item.menu_id,
                        requested_quantity: parseFloat(item.requested_quantity),
                        unit_cost: unitCost,
                        total_cost: parseFloat(item.requested_quantity) * unitCost,
                        unit: menu.unit_of_measure || 'piece',
                        notes: item.notes || null
                    }, { transaction })

                    totalQuantity += parseFloat(item.requested_quantity)
                }

                await issue.update({
                    total_items: items.length,
                    total_quantity: totalQuantity
                }, { transaction })
            }

            await transaction.commit()

            const result = await StockIssue.findByPk(issue.id, {
                include: [
                    { model: Warehouse, attributes: ['id', 'name_ar'] },
                    { model: User, as: 'createdBy', attributes: ['id', 'name_ar'] },
                    {
                        model: StockIssueItem,
                        as: 'items',
                        include: [{ model: Menu, attributes: ['id', 'name_ar', 'sku'] }]
                    }
                ]
            })

            res.json({ message: 'تم تحديث إذن الصرف', data: result })
        } catch (error) {
            await transaction.rollback()
            console.error('Update stock issue error:', error)
            res.status(500).json({ message: 'خطأ في تحديث إذن الصرف' })
        }
    }
)

// ==================== APPROVE ====================

/**
 * POST /api/stock-issues/:id/approve
 * Approve a draft issue
 */
router.post('/:id/approve',
    authenticate,
    authorize('admin', 'manager'),
    async (req, res) => {
        try {
            const issue = await StockIssue.findByPk(req.params.id)

            if (!issue) {
                return res.status(404).json({ message: 'إذن الصرف غير موجود' })
            }

            if (issue.status !== 'draft') {
                return res.status(400).json({ message: `لا يمكن اعتماد إذن الصرف في حالة "${issue.status}"` })
            }

            await issue.update({
                status: 'approved',
                approved_by: req.user.userId,
                approved_at: new Date()
            })

            res.json({ message: 'تم اعتماد إذن الصرف', data: issue })
        } catch (error) {
            console.error('Approve stock issue error:', error)
            res.status(500).json({ message: 'خطأ في اعتماد إذن الصرف' })
        }
    }
)

// ==================== ISSUE (Execute — deduct stock) ====================

/**
 * POST /api/stock-issues/:id/issue
 * Execute the issue: deduct stock from warehouse
 */
router.post('/:id/issue',
    authenticate,
    authorize('admin', 'manager'),
    async (req, res) => {
        const transaction = await sequelize.transaction()

        try {
            const issue = await StockIssue.findByPk(req.params.id, {
                include: [{
                    model: StockIssueItem,
                    as: 'items',
                    include: [{ model: Menu, attributes: ['id', 'name_ar', 'track_stock', 'allow_negative_stock'] }]
                }],
                transaction
            })

            if (!issue) {
                await transaction.rollback()
                return res.status(404).json({ message: 'إذن الصرف غير موجود' })
            }

            if (issue.status !== 'approved') {
                await transaction.rollback()
                return res.status(400).json({ message: `لا يمكن تنفيذ الصرف إلا بعد الاعتماد. الحالة الحالية: "${issue.status}"` })
            }

            let totalCost = 0

            // Deduct stock for each item
            for (const item of issue.items) {
                const qty = parseFloat(item.requested_quantity)

                // Check available stock
                const stock = await Stock.findOne({
                    where: { menu_id: item.menu_id, warehouse_id: issue.warehouse_id },
                    transaction
                })

                const available = stock ? parseFloat(stock.quantity) : 0
                const allowNegative = item.Menu?.allow_negative_stock || false

                if (available < qty && !allowNegative) {
                    await transaction.rollback()
                    return res.status(400).json({
                        message: `الكمية المتاحة من "${item.Menu?.name_ar}" (${available}) أقل من المطلوبة (${qty})`
                    })
                }

                // Deduct
                const result = await StockService.deductStock({
                    menuId: item.menu_id,
                    warehouseId: issue.warehouse_id,
                    quantity: qty,
                    sourceType: 'stock_issue',
                    sourceId: issue.id,
                    userId: req.user.userId
                }, { transaction, notes: `إذن صرف ${issue.issue_number}` })

                const itemCost = result.cogs || (qty * parseFloat(item.unit_cost || 0))

                await item.update({
                    issued_quantity: qty,
                    unit_cost: stock ? parseFloat(stock.avg_cost || 0) : parseFloat(item.unit_cost),
                    total_cost: Math.round(itemCost * 100) / 100
                }, { transaction })

                totalCost += itemCost
            }

            // Update issue header
            await issue.update({
                status: 'issued',
                issued_by: req.user.userId,
                issued_at: new Date(),
                total_cost: Math.round(totalCost * 100) / 100
            }, { transaction })

            // Record accounting entry
            try {
                await AccountingService.recordStockAdjustment({
                    id: issue.id,
                    warehouse_id: issue.warehouse_id,
                    adjustment_type: issue.issue_type === 'waste' ? 'damage' : 'loss',
                    adjustment_value: -totalCost,
                    reason: `إذن صرف ${issue.issue_number} — ${issue.recipient_name || issue.issue_type}`
                }, { transaction })
            } catch (accErr) {
                console.warn('Accounting entry for stock issue skipped:', accErr.message)
            }

            await transaction.commit()

            // Fetch final
            const result = await StockIssue.findByPk(issue.id, {
                include: [
                    { model: Warehouse, attributes: ['id', 'name_ar'] },
                    { model: User, as: 'createdBy', attributes: ['id', 'name_ar'] },
                    { model: User, as: 'approvedBy', attributes: ['id', 'name_ar'] },
                    { model: User, as: 'issuedBy', attributes: ['id', 'name_ar'] },
                    {
                        model: StockIssueItem,
                        as: 'items',
                        include: [{ model: Menu, attributes: ['id', 'name_ar', 'sku'] }]
                    }
                ]
            })

            res.json({ message: 'تم تنفيذ الصرف وخصم المخزون بنجاح', data: result })
        } catch (error) {
            await transaction.rollback()
            console.error('Execute stock issue error:', error)
            res.status(500).json({ message: error.message || 'خطأ في تنفيذ الصرف' })
        }
    }
)

// ==================== CANCEL ====================

/**
 * POST /api/stock-issues/:id/cancel
 */
router.post('/:id/cancel',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('reason').notEmpty().withMessage('سبب الإلغاء مطلوب').isLength({ max: 500 })
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        try {
            const issue = await StockIssue.findByPk(req.params.id)

            if (!issue) {
                return res.status(404).json({ message: 'إذن الصرف غير موجود' })
            }

            if (issue.status === 'issued') {
                return res.status(400).json({ message: 'لا يمكن إلغاء إذن صرف تم تنفيذه بالفعل' })
            }

            if (issue.status === 'cancelled') {
                return res.status(400).json({ message: 'إذن الصرف ملغي بالفعل' })
            }

            await issue.update({
                status: 'cancelled',
                cancelled_by: req.user.userId,
                cancelled_at: new Date(),
                cancel_reason: req.body.reason
            })

            res.json({ message: 'تم إلغاء إذن الصرف', data: issue })
        } catch (error) {
            console.error('Cancel stock issue error:', error)
            res.status(500).json({ message: 'خطأ في إلغاء إذن الصرف' })
        }
    }
)

module.exports = router
