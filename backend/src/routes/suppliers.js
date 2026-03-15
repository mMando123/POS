/**
 * Suppliers API Routes
 * CRUD operations for supplier management
 */

const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const { Supplier, PurchaseOrder, SupplierPayment, Warehouse, sequelize } = require('../models')
const { Op } = require('sequelize')
const AuditService = require('../services/auditService')
const AccountingHooks = require('../services/accountingHooks')

// ==================== GET ALL SUPPLIERS ====================
router.get('/', authenticate, async (req, res) => {
    try {
        const { status, search, page = 1, limit = 50 } = req.query
        const where = {}

        if (status) where.status = status
        if (search) {
            where[Op.or] = [
                { name_ar: { [Op.like]: `%${search}%` } },
                { name_en: { [Op.like]: `%${search}%` } },
                { code: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } }
            ]
        }

        const offset = (page - 1) * limit
        const { count, rows } = await Supplier.findAndCountAll({
            where,
            order: [['name_ar', 'ASC']],
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
        console.error('Get suppliers error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†' })
    }
})

// ==================== RECONCILE ALL SUPPLIERS (FIX-06) ====================
/**
 * GET  /api/suppliers/reconcile  â†’ Report only (no changes)
 * POST /api/suppliers/reconcile  â†’ Report + auto-fix discrepancies
 * 
 * FIX-06: Runs across all suppliers, compares current_balance with GL,
 * and optionally corrects mismatches.
 */
router.get('/reconcile', authenticate, authorize('admin'), async (req, res) => {
    try {
        const AccountingService = require('../services/accountingService')
        const report = await AccountingService.reconcileAllSuppliers({ autoFix: false })
        res.json({ message: 'ØªÙ‚Ø±ÙŠØ± ØªØ³ÙˆÙŠØ© Ø£Ø±ØµØ¯Ø© Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† (Ø¨Ø¯ÙˆÙ† ØªØ¹Ø¯ÙŠÙ„)', data: report })
    } catch (error) {
        console.error('Reconcile error:', error)
        res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ ØªÙ‚Ø±ÙŠØ± Ø§Ù„ØªØ³ÙˆÙŠØ©' })
    }
})

router.post('/reconcile', authenticate, authorize('admin'), async (req, res) => {
    try {
        const AccountingService = require('../services/accountingService')
        const report = await AccountingService.reconcileAllSuppliers({ autoFix: true })
        res.json({
            message: `ØªÙ… Ø§Ù„ØªØ³ÙˆÙŠØ©: ${report.matched} Ù…ØªØ·Ø§Ø¨Ù‚ØŒ ${report.corrected} ØªÙ… ØªØ¹Ø¯ÙŠÙ„Ù‡ âœ…`,
            data: report
        })
    } catch (error) {
        console.error('Reconcile+fix error:', error)
        res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ ØªØ³ÙˆÙŠØ© Ø£Ø±ØµØ¯Ø© Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†' })
    }
})

// ==================== AP AGING / PAYABLES SUMMARY ====================
/**
 * GET /api/suppliers/payables/aging
 * 
 * GL-based AP aging report for all suppliers (authoritative).
 */
router.get('/payables/aging', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const AccountingService = require('../services/accountingService')
        const includeZero = String(req.query.include_zero || '').toLowerCase() === 'true'
        const includeInactive = String(req.query.include_inactive || '').toLowerCase() !== 'false'

        const data = await AccountingService.getSuppliersAPAging({
            asOfDate: req.query.as_of_date || req.query.asOfDate || null,
            branchId: req.query.branch_id || req.query.branchId || null,
            includeZero,
            includeInactive
        })

        res.json({ data })
    } catch (error) {
        console.error('AP aging error:', error)
        res.status(500).json({ message: error.message || 'خطأ في تقرير أعمار الدائنين' })
    }
})

/**
 * GET /api/suppliers/payables/summary
 * 
 * Returns same AP aging payload; useful alias for summary dashboards.
 */
router.get('/payables/summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const AccountingService = require('../services/accountingService')
        const includeZero = String(req.query.include_zero || '').toLowerCase() === 'true'
        const includeInactive = String(req.query.include_inactive || '').toLowerCase() !== 'false'

        const data = await AccountingService.getSuppliersAPAging({
            asOfDate: req.query.as_of_date || req.query.asOfDate || null,
            branchId: req.query.branch_id || req.query.branchId || null,
            includeZero,
            includeInactive
        })

        res.json({ data })
    } catch (error) {
        console.error('AP summary error:', error)
        res.status(500).json({ message: error.message || 'خطأ في ملخص الدائنين' })
    }
})

// ==================== GET SINGLE SUPPLIER ====================
router.get('/:id', authenticate, async (req, res) => {
    try {
        const supplier = await Supplier.findByPk(req.params.id, {
            include: [{
                model: PurchaseOrder,
                attributes: ['id', 'po_number', 'total_amount', 'status', 'order_date'],
                limit: 10,
                order: [['order_date', 'DESC']]
            }]
        })

        if (!supplier) {
            return res.status(404).json({ message: 'Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
        }

        res.json({ data: supplier })
    } catch (error) {
        console.error('Get supplier error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯' })
    }
})

// ==================== SUPPLIER GL STATEMENT ====================
/**
 * GET /api/suppliers/:id/statement
 * 
 * GL-based supplier statement:
 * - opening balance
 * - period movements
 * - closing balance
 */
router.get('/:id/statement', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const supplier = await Supplier.findByPk(req.params.id)
        if (!supplier) {
            return res.status(404).json({ message: 'المورد غير موجود' })
        }

        const AccountingService = require('../services/accountingService')
        const statement = await AccountingService.getSupplierStatement(supplier.id, {
            fromDate: req.query.from_date || req.query.fromDate || null,
            toDate: req.query.to_date || req.query.toDate || null,
            branchId: req.query.branch_id || req.query.branchId || null
        })

        res.json({
            data: {
                supplier: {
                    id: supplier.id,
                    code: supplier.code,
                    name_ar: supplier.name_ar,
                    status: supplier.status,
                    payment_terms: supplier.payment_terms
                },
                statement
            }
        })
    } catch (error) {
        console.error('Supplier statement error:', error)
        res.status(500).json({ message: error.message || 'خطأ في كشف حساب المورد' })
    }
})

// ==================== CREATE SUPPLIER ====================
router.post('/',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('name_ar').notEmpty().withMessage('Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ±Ø¯ Ø¨Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ù…Ø·Ù„ÙˆØ¨').trim(),
        body('phone').optional().trim(),
        body('email').optional().isEmail().withMessage('Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ ØºÙŠØ± ØµØ­ÙŠØ­'),
        body('payment_terms').optional().isInt({ min: 0 }).withMessage('Ø´Ø±ÙˆØ· Ø§Ù„Ø¯ÙØ¹ ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø±Ù‚Ù… ØµØ­ÙŠØ­')
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        try {
            // Generate supplier code
            const count = await Supplier.count()
            const code = `SUP-${String(count + 1).padStart(4, '0')}`

            const supplier = await Supplier.create({
                ...req.body,
                code
            })

            res.status(201).json({
                message: 'ØªÙ… Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…ÙˆØ±Ø¯ Ø¨Ù†Ø¬Ø§Ø­',
                data: supplier
            })
        } catch (error) {
            console.error('Create supplier error:', error)
            res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…ÙˆØ±Ø¯' })
        }
    }
)

// ==================== UPDATE SUPPLIER ====================
router.put('/:id',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('name_ar').optional().notEmpty().withMessage('Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ±Ø¯ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø£Ù† ÙŠÙƒÙˆÙ† ÙØ§Ø±ØºØ§Ù‹').trim(),
        body('email').optional().isEmail().withMessage('Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ ØºÙŠØ± ØµØ­ÙŠØ­'),
        body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Ø§Ù„ØªÙ‚ÙŠÙŠÙ… ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø¨ÙŠÙ† 1 Ùˆ 5')
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        try {
            const supplier = await Supplier.findByPk(req.params.id)
            if (!supplier) {
                return res.status(404).json({ message: 'Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
            }

            // Don't allow changing the code
            delete req.body.code

            await supplier.update(req.body)

            res.json({
                message: 'ØªÙ… ØªØ­Ø¯ÙŠØ« Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯',
                data: supplier
            })
        } catch (error) {
            console.error('Update supplier error:', error)
            res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…ÙˆØ±Ø¯' })
        }
    }
)

// ==================== DELETE SUPPLIER ====================
router.delete('/:id',
    authenticate,
    authorize('admin'),
    async (req, res) => {
        try {
            const supplier = await Supplier.findByPk(req.params.id)
            if (!supplier) {
                return res.status(404).json({ message: 'Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
            }


            // Soft delete - just deactivate
            await supplier.update({ status: 'inactive' })

            // Log audit
            await AuditService.log({
                userId: req.user.userId,
                branchId: req.user.branchId,
                category: 'inventory',
                action: 'deactivate_supplier',
                entity: 'Supplier',
                entityId: supplier.id,
                oldValue: { status: supplier.status || 'active' },
                newValue: { status: 'inactive' },
                metadata: { reason: 'User requested deletion' }
            })

            res.json({ message: 'ØªÙ… ØªØ¹Ø·ÙŠÙ„ Ø§Ù„Ù…ÙˆØ±Ø¯ Ø¨Ù†Ø¬Ø§Ø­' })
        } catch (error) {
            console.error('Delete supplier error:', error)
            res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø­Ø°Ù Ø§Ù„Ù…ÙˆØ±Ø¯' })
        }
    }
)

// ==================== ADD SUPPLIER PAYMENT ====================
router.post('/:id/payments',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('amount').isFloat({ min: 0.01 }).withMessage('Ø§Ù„Ù…Ø¨Ù„Øº ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø£ÙƒØ¨Ø± Ù…Ù† 0'),
        body('payment_method').isIn(['cash', 'bank_transfer', 'check', 'card']).withMessage('Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø¯ÙØ¹ ØºÙŠØ± ØµØ­ÙŠØ­Ø©'),
        body('payment_date').optional().isDate(),
        body('purchase_order_id').optional().isUUID(),
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const t = await sequelize.transaction()
        try {
            const supplier = await Supplier.findByPk(req.params.id, { transaction: t })
            if (!supplier) {
                await t.rollback()
                return res.status(404).json({ message: 'Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
            }

            const { amount, payment_method, payment_date, reference, notes, purchase_order_id, payment_account_code } = req.body

            // Resolve branch dimension for AP posting:
            // 1) PO warehouse branch (if payment linked to PO)
            // 2) current user branch as fallback
            let resolvedBranchId = req.user.branchId || req.user.branch_id || null
            if (purchase_order_id) {
                const po = await PurchaseOrder.findByPk(purchase_order_id, {
                    attributes: ['id', 'warehouse_id'],
                    transaction: t
                })
                if (!po) {
                    await t.rollback()
                    return res.status(400).json({ message: 'أمر الشراء المرتبط بالدفعة غير موجود' })
                }
                if (po.warehouse_id) {
                    const poWarehouse = await Warehouse.findByPk(po.warehouse_id, {
                        attributes: ['branch_id'],
                        transaction: t
                    })
                    if (poWarehouse?.branch_id) {
                        resolvedBranchId = poWarehouse.branch_id
                    }
                }
            }

            // Generate payment number
            const count = await SupplierPayment.count({ transaction: t })
            const payment_number = `PAY-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`

            // Create Payment
            const payment = await SupplierPayment.create({
                payment_number,
                supplier_id: supplier.id,
                purchase_order_id: purchase_order_id || null,
                amount,
                payment_method,
                payment_date: payment_date || new Date(),
                reference,
                notes,
                branch_id: resolvedBranchId,
                created_by: req.user.userId,
                status: 'completed'
            }, { transaction: t })
            // FIX C-03: Keep business + accounting atomic
            await AccountingHooks.onSupplierPayment(payment, { transaction: t })

            await t.commit()

            res.status(201).json({
                message: 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹Ø© Ø¨Ù†Ø¬Ø§Ø­',
                data: payment
            })

        } catch (error) {
            await t.rollback()
            console.error('Create payment error:', error)
            res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹Ø©' })
        }
    }
)

// ==================== GET SUPPLIER GL BALANCE (FIX-06) ====================
/**
 * GET /api/suppliers/:id/gl-balance
 * 
 * FIX-06: Returns the AUTHORITATIVE supplier balance computed directly
 * from the General Ledger (Accounts Payable account 2002 movements).
 * 
 * This is the single source of truth â€” use this for financial reports.
 * The supplier.current_balance field is now a cache only.
 */
router.get('/:id/gl-balance', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const supplier = await Supplier.findByPk(req.params.id)
        if (!supplier) {
            return res.status(404).json({ message: 'Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
        }

        const AccountingService = require('../services/accountingService')
        const glData = await AccountingService.getSupplierGLBalance(supplier.id)

        res.json({
            data: {
                supplier_id: supplier.id,
                supplier_code: supplier.code,
                supplier_name: supplier.name_ar,
                // FIX-06: GL balance is the authoritative source
                gl_balance: glData.glBalance,
                // Cache comparison
                cached_balance: parseFloat(supplier.current_balance || 0),
                difference: Math.round((glData.glBalance - parseFloat(supplier.current_balance || 0)) * 100) / 100,
                in_sync: Math.abs(glData.glBalance - parseFloat(supplier.current_balance || 0)) <= 0.01,
                // Breakdown
                total_purchases_ap: glData.totalPurchases,
                total_payments_ap: glData.totalPayments,
                transactions: glData.breakdown
            }
        })
    } catch (error) {
        console.error('GL balance error:', error)
        res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ Ø­Ø³Ø§Ø¨ Ø±ØµÙŠØ¯ Ø§Ù„Ù…ÙˆØ±Ø¯ Ù…Ù† Ø§Ù„Ø¯ÙØªØ±' })
    }
})

// ==================== SYNC SUPPLIER BALANCE (FIX-06) ====================
/**
 * POST /api/suppliers/:id/sync-balance
 * 
 * FIX-06: Forces a sync of Supplier.current_balance with the GL.
 * Admin-only. Use after manual journal corrections or discrepancies.
 */
router.post('/:id/sync-balance', authenticate, authorize('admin'), async (req, res) => {
    try {
        const supplier = await Supplier.findByPk(req.params.id)
        if (!supplier) {
            return res.status(404).json({ message: 'Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' })
        }

        const AccountingService = require('../services/accountingService')
        const result = await AccountingService.syncSupplierBalance(supplier.id)

        res.json({
            message: result.difference === 0
                ? 'Ø§Ù„Ø±ØµÙŠØ¯ Ù…ØªÙˆØ§ÙÙ‚ Ù…Ø¹ Ø§Ù„Ø¯ÙØªØ±ØŒ Ù„Ø§ ØªØ¹Ø¯ÙŠÙ„ Ù…Ø·Ù„ÙˆØ¨ âœ…'
                : `ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø±ØµÙŠØ¯ Ù…Ù† ${result.oldBalance} Ø¥Ù„Ù‰ ${result.newBalance} ðŸ”§`,
            data: result
        })
    } catch (error) {
        console.error('Sync balance error:', error)
        res.status(500).json({ message: error.message || 'Ø®Ø·Ø£ ÙÙŠ Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„Ø±ØµÙŠØ¯' })
    }
})


module.exports = router

