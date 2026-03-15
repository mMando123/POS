/**
 * Accounting Routes â€” /api/accounting/*
 * 
 * ACCOUNTING LAYER (Phase 2)
 * 
 * All accounting endpoints live under /api/accounting/.
 * Requires authentication and appropriate permissions.
 * 
 * Endpoints:
 *   GET  /coa                    â€” Chart of Accounts
 *   GET  /ledger/:accountCode    â€” Account Ledger
 *   GET  /journal-entries        â€” List journal entries
 *   GET  /journal-entries/:id    â€” Single journal entry with lines
 *   POST /journal-entries        â€” Create manual journal entry
 *   POST /journal-entries/:id/reverse â€” Reverse a journal entry
 *   GET  /reports/trial-balance  â€” Trial Balance
 *   GET  /reports/profit-loss    â€” Profit & Loss
 *   GET  /reports/balance-sheet  â€” Balance Sheet
 *   GET  /reports/cash-flow      â€” Cash Flow Statement
 *   POST /periods/:period/close  â€” Close fiscal period
 *   POST /periods/:period/reopen â€” Reopen fiscal period
 *   GET  /periods                â€” List fiscal periods
 *   POST /drawer/open            â€” Open cash drawer
 *   POST /drawer/close           â€” Close cash drawer
 *   POST /drawer/cash-in         â€” Record cash in
 *   POST /drawer/cash-out        â€” Record cash out
 *   GET  /drawer/:shiftId        â€” Get drawer status
 *   POST /hooks/order-completed  â€” Manual trigger: record sale
 *   POST /hooks/refund-approved  â€” Manual trigger: record refund
 *   POST /backfill               â€” Backfill historical orders
 */

const express = require('express')
const router = express.Router()
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')
const { body, param, query, validationResult } = require('express-validator')
const { Op } = require('sequelize')
const { authenticate, authorize, requirePermission, PERMISSIONS } = require('../middleware/auth')
const AccountingService = require('../services/accountingService')
const { ACCOUNTS } = require('../services/accountingService')
const CashDrawerService = require('../services/cashDrawerService')
const AccountingHooks = require('../services/accountingHooks')
const COAManagementService = require('../services/coaManagementService')
const GLAuditService = require('../services/glAuditService')
const {
    Account,
    JournalEntry,
    JournalLine,
    JournalAttachment,
    FiscalPeriod,
    Order,
    Refund,
    GLAuditLog,
    User,
    sequelize
} = require('../models')

// All accounting routes require authentication
router.use(authenticate)

// Enforce branch scope for manager role at API level.
// Admin/accountant keep explicit query-based scope as-is.
function resolveBranchScope(req, requestedBranchId = null) {
    if (req.user?.role === 'manager' && req.user?.branchId) {
        return req.user.branchId
    }
    return requestedBranchId || null
}

const JOURNAL_ATTACHMENTS_ROOT = path.join(__dirname, '../../uploads/journal-attachments')
if (!fs.existsSync(JOURNAL_ATTACHMENTS_ROOT)) {
    fs.mkdirSync(JOURNAL_ATTACHMENTS_ROOT, { recursive: true })
}

const allowedAttachmentMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
])

const normalizeExt = (originalName = '', mimeType = '') => {
    const byName = path.extname(String(originalName || '')).toLowerCase()
    if (byName) return byName

    const byMime = {
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'text/csv': '.csv',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp'
    }
    return byMime[mimeType] || ''
}

const journalAttachmentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const now = new Date()
        const year = String(now.getFullYear())
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const dir = path.join(JOURNAL_ATTACHMENTS_ROOT, year, month)
        fs.mkdirSync(dir, { recursive: true })
        cb(null, dir)
    },
    filename: (req, file, cb) => {
        const ext = normalizeExt(file.originalname, file.mimetype)
        cb(null, `${crypto.randomUUID()}${ext}`)
    }
})

const journalAttachmentUpload = multer({
    storage: journalAttachmentStorage,
    limits: {
        fileSize: 15 * 1024 * 1024,
        files: 10
    },
    fileFilter: (req, file, cb) => {
        if (allowedAttachmentMimeTypes.has(file.mimetype)) {
            cb(null, true)
            return
        }
        cb(new Error('Unsupported attachment type'))
    }
})

const mapAttachmentDto = (entryId, att) => {
    const normalizedPath = String(att.file_path || '').replace(/^\/+/, '')
    const viewUrl = normalizedPath ? `/uploads/${encodeURI(normalizedPath)}` : null
    return {
        id: att.id,
        journal_entry_id: att.journal_entry_id,
        original_name: att.original_name,
        mime_type: att.mime_type,
        file_size: att.file_size,
        uploaded_by: att.uploaded_by,
        created_at: att.created_at,
        view_url: viewUrl,
        open_url: viewUrl,
        download_url: `/api/accounting/journal-entries/${entryId}/attachments/${att.id}/download`
    }
}

async function getScopedJournalEntry(req, entryId) {
    const entry = await JournalEntry.findByPk(entryId, {
        attributes: ['id', 'entry_number', 'status', 'fiscal_period', 'source_type', 'source_id', 'branch_id', 'company_id']
    })
    if (!entry) return { error: 'Entry not found', status: 404, entry: null }

    if (req.user.role === 'manager' && req.user.branchId && entry.branch_id && entry.branch_id !== req.user.branchId) {
        return { error: 'غير مصرح بالوصول لهذا القيد', status: 403, entry: null }
    }

    return { entry, status: 200, error: null }
}

// ==================== CHART OF ACCOUNTS ====================

/**
 * GET /coa â€” Get full Chart of Accounts
 */
router.get('/coa',
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
        try {
            const accounts = await AccountingService.getChartOfAccounts()
            res.json({
                success: true,
                data: accounts,
                accountCodes: ACCOUNTS
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * GET /coa/tree â€” Get hierarchical Chart of Accounts tree
 */
router.get('/coa/tree',
    authorize('admin', 'manager'),
    async (req, res) => {
        try {
            const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true'
            const tree = await COAManagementService.getTree({ includeInactive })
            res.json({ success: true, data: tree })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * GET /coa/flat â€” Get flat COA list (for admin forms)
 */
router.get('/coa/flat',
    authorize('admin', 'manager'),
    async (req, res) => {
        try {
            const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true'
            const rows = await COAManagementService.listAccounts({ includeInactive })
            res.json({ success: true, data: rows })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /coa/accounts â€” Create account (header or detail)
 */
router.post('/coa/accounts',
    authorize('admin'),
    body('code').notEmpty().withMessage('code is required'),
    body('name_ar').notEmpty().withMessage('name_ar is required'),
    body('name_en').notEmpty().withMessage('name_en is required'),
    body('root_type').isIn(['asset', 'liability', 'equity', 'income', 'expense']),
    body('account_type').optional({ nullable: true }).isString(),
    body('normal_balance').isIn(['debit', 'credit']),
    body('parent_id').optional({ nullable: true }).isUUID(),
    body('is_group').optional().isBoolean(),
    body('is_active').optional().isBoolean(),
    body('company_id').optional({ nullable: true }).isUUID(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

            const account = await COAManagementService.createAccount(req.body, {
                userId: req.user.userId,
                branchId: req.user.branchId || null
            })

            res.status(201).json({ success: true, data: account })
        } catch (error) {
            const status = error.message.startsWith('COA_ERROR') ? 400 : 500
            res.status(status).json({ success: false, error: error.message })
        }
    }
)

/**
 * PUT /coa/accounts/:id â€” Update account metadata/structure
 */
router.put('/coa/accounts/:id',
    authorize('admin'),
    param('id').isUUID(),
    body('code').optional().notEmpty(),
    body('name_ar').optional().notEmpty(),
    body('name_en').optional().notEmpty(),
    body('root_type').optional().isIn(['asset', 'liability', 'equity', 'income', 'expense']),
    body('account_type').optional({ nullable: true }).isString(),
    body('normal_balance').optional().isIn(['debit', 'credit']),
    body('parent_id').optional({ nullable: true }).isUUID(),
    body('is_group').optional().isBoolean(),
    body('is_active').optional().isBoolean(),
    body('company_id').optional({ nullable: true }).isUUID(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

            const account = await COAManagementService.updateAccount(req.params.id, req.body, {
                userId: req.user.userId,
                branchId: req.user.branchId || null
            })

            res.json({ success: true, data: account })
        } catch (error) {
            const status = error.message.startsWith('COA_ERROR') ? 400 : 500
            res.status(status).json({ success: false, error: error.message })
        }
    }
)

/**
 * PATCH /coa/accounts/:id/move â€” Move account under a different parent
 */
router.patch('/coa/accounts/:id/move',
    authorize('admin'),
    param('id').isUUID(),
    body('parent_id').optional({ nullable: true }).isUUID(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

            const account = await COAManagementService.moveAccount(
                req.params.id,
                Object.prototype.hasOwnProperty.call(req.body, 'parent_id') ? req.body.parent_id : null,
                { userId: req.user.userId, branchId: req.user.branchId || null }
            )

            res.json({ success: true, data: account })
        } catch (error) {
            const status = error.message.startsWith('COA_ERROR') ? 400 : 500
            res.status(status).json({ success: false, error: error.message })
        }
    }
)

/**
 * PATCH /coa/accounts/:id/status â€” Activate/deactivate account
 */
router.patch('/coa/accounts/:id/status',
    authorize('admin'),
    param('id').isUUID(),
    body('is_active').isBoolean().withMessage('is_active is required and must be boolean'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

            const account = await COAManagementService.setAccountStatus(
                req.params.id,
                req.body.is_active,
                { userId: req.user.userId, branchId: req.user.branchId || null }
            )

            res.json({ success: true, data: account })
        } catch (error) {
            const status = error.message.startsWith('COA_ERROR') ? 400 : 500
            res.status(status).json({ success: false, error: error.message })
        }
    }
)

/**
 * GET /ledger/:accountCode â€” Account Ledger
 */
router.get('/ledger/:accountCode',
    param('accountCode').notEmpty(),
    query('periodFrom').optional().matches(/^\d{4}-\d{2}$/),
    query('periodTo').optional().matches(/^\d{4}-\d{2}$/),
    query('fromDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('toDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('branchId').optional().isUUID(),
    query('companyId').optional().isUUID(),
    query('costCenterId').optional().isUUID(),
    query('sourceType').optional().isString(),
    query('sourceId').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('includeChildren').optional().isIn(['true', 'false', '1', '0']),
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })
            const scopedBranchId = resolveBranchScope(req, req.query.branchId)
            const includeChildren = ['true', '1'].includes(String(req.query.includeChildren || '').toLowerCase())

            const ledger = await AccountingService.getAccountLedger(
                req.params.accountCode,
                {
                    periodFrom: req.query.periodFrom,
                    periodTo: req.query.periodTo,
                    fromDate: req.query.fromDate,
                    toDate: req.query.toDate,
                    branchId: scopedBranchId,
                    companyId: req.query.companyId || null,
                    costCenterId: req.query.costCenterId || null,
                    sourceType: req.query.sourceType || null,
                    sourceId: req.query.sourceId || null,
                    page: parseInt(req.query.page, 10) || 1,
                    limit: parseInt(req.query.limit, 10) || 100,
                    includeChildren
                }
            )

            res.json({ success: true, data: ledger })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

// ==================== JOURNAL ENTRIES ====================

/**
 * GET /journal-entries â€” List journal entries
 */
router.get('/journal-entries',
    query('periodFrom').optional().matches(/^\d{4}-\d{2}$/),
    query('periodTo').optional().matches(/^\d{4}-\d{2}$/),
    query('sourceType').optional(),
    query('branchId').optional().isUUID(),
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
        try {
            const where = { status: { [Op.ne]: 'draft' } }

            if (req.query.periodFrom) {
                where.fiscal_period = { ...where.fiscal_period, [Op.gte]: req.query.periodFrom }
            }
            if (req.query.periodTo) {
                where.fiscal_period = { ...where.fiscal_period, [Op.lte]: req.query.periodTo }
            }
            if (req.query.sourceType) {
                where.source_type = req.query.sourceType
            }
            const scopedBranchId = resolveBranchScope(req, req.query.branchId)
            if (scopedBranchId) {
                where.branch_id = scopedBranchId
            }

            const page = parseInt(req.query.page) || 1
            const limit = Math.min(parseInt(req.query.limit) || 50, 200)
            const offset = (page - 1) * limit

            const { count, rows } = await JournalEntry.findAndCountAll({
                where,
                include: [{
                    model: JournalLine, as: 'lines',
                    include: [{ model: Account, as: 'account', attributes: ['code', 'name_ar', 'name_en'] }]
                }],
                order: [['entry_date', 'DESC'], ['entry_number', 'DESC']],
                limit,
                offset
            })

            res.json({
                success: true,
                data: rows,
                pagination: {
                    total: count,
                    page,
                    limit,
                    totalPages: Math.ceil(count / limit)
                }
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * GET /journal-entries/:id â€” Single entry with lines
 */
router.get('/journal-entries/:id',
    param('id').isUUID(),
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
        try {
            const scoped = await getScopedJournalEntry(req, req.params.id)
            if (!scoped.entry) {
                return res.status(scoped.status).json({ success: false, error: scoped.error })
            }

            const entry = await JournalEntry.findByPk(req.params.id, {
                include: [{
                    model: JournalLine, as: 'lines',
                    include: [{ model: Account, as: 'account' }]
                }, {
                    model: JournalAttachment,
                    as: 'attachments',
                    where: { is_deleted: false },
                    required: false
                }]
            })

            if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' })
            const dto = entry.toJSON()
            dto.attachments = (dto.attachments || []).map((att) => mapAttachmentDto(entry.id, att))
            res.json({ success: true, data: dto })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * GET /journal-entries/:id/attachments - List journal attachments
 */
router.get('/journal-entries/:id/attachments',
    authorize('admin', 'manager', 'accountant'),
    param('id').isUUID(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

            const scoped = await getScopedJournalEntry(req, req.params.id)
            if (!scoped.entry) {
                return res.status(scoped.status).json({ success: false, error: scoped.error })
            }

            const rows = await JournalAttachment.findAll({
                where: {
                    journal_entry_id: req.params.id,
                    is_deleted: false
                },
                order: [['created_at', 'DESC']]
            })

            res.json({
                success: true,
                data: rows.map((row) => mapAttachmentDto(req.params.id, row))
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /journal-entries/:id/attachments - Upload journal attachments
 */
router.post('/journal-entries/:id/attachments',
    authorize('admin', 'manager'),
    param('id').isUUID(),
    (req, res, next) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })
        next()
    },
    (req, res, next) => {
        journalAttachmentUpload.array('files', 10)(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ success: false, error: 'حجم الملف كبير. الحد الأقصى 15MB لكل ملف' })
                }
                return res.status(400).json({ success: false, error: err.message })
            }
            if (err) return res.status(400).json({ success: false, error: err.message || 'فشل رفع المرفق' })
            next()
        })
    },
    async (req, res) => {
        const uploadedPaths = []
        try {
            const scoped = await getScopedJournalEntry(req, req.params.id)
            if (!scoped.entry) {
                return res.status(scoped.status).json({ success: false, error: scoped.error })
            }

            const files = Array.isArray(req.files) ? req.files : []
            if (!files.length) {
                return res.status(400).json({ success: false, error: 'لم يتم رفع أي ملف' })
            }

            const createdRows = await sequelize.transaction(async (transaction) => {
                const result = []
                for (const file of files) {
                    const fileBuffer = fs.readFileSync(file.path)
                    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
                    const relativePath = path.relative(path.join(__dirname, '../../uploads'), file.path).replace(/\\/g, '/')
                    uploadedPaths.push(file.path)

                    const row = await JournalAttachment.create({
                        journal_entry_id: scoped.entry.id,
                        original_name: file.originalname,
                        stored_name: file.filename,
                        file_path: relativePath,
                        mime_type: file.mimetype,
                        file_size: file.size,
                        file_hash: hash,
                        uploaded_by: req.user.userId,
                        branch_id: scoped.entry.branch_id || null,
                        company_id: scoped.entry.company_id || null
                    }, { transaction })
                    result.push(row)
                }

                await GLAuditService.log({
                    eventType: 'journal_attachment_uploaded',
                    journalEntryId: scoped.entry.id,
                    entryNumber: scoped.entry.entry_number,
                    sourceType: scoped.entry.source_type || 'manual',
                    sourceId: scoped.entry.source_id || scoped.entry.id,
                    fiscalPeriod: scoped.entry.fiscal_period,
                    createdBy: req.user.userId,
                    branchId: scoped.entry.branch_id || null,
                    payload: {
                        files: result.map((it) => ({
                            id: it.id,
                            original_name: it.original_name,
                            mime_type: it.mime_type,
                            file_size: it.file_size
                        }))
                    }
                }, { transaction })

                return result
            })

            res.status(201).json({
                success: true,
                data: createdRows.map((row) => mapAttachmentDto(scoped.entry.id, row))
            })
        } catch (error) {
            for (const p of uploadedPaths) {
                try {
                    if (fs.existsSync(p)) fs.unlinkSync(p)
                } catch (_) { /* noop */ }
            }
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * GET /journal-entries/:id/attachments/:attachmentId/download - Download one attachment
 */
router.get('/journal-entries/:id/attachments/:attachmentId/download',
    authorize('admin', 'manager', 'accountant'),
    param('id').isUUID(),
    param('attachmentId').isUUID(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

            const scoped = await getScopedJournalEntry(req, req.params.id)
            if (!scoped.entry) {
                return res.status(scoped.status).json({ success: false, error: scoped.error })
            }

            const att = await JournalAttachment.findOne({
                where: {
                    id: req.params.attachmentId,
                    journal_entry_id: req.params.id,
                    is_deleted: false
                }
            })
            if (!att) return res.status(404).json({ success: false, error: 'المرفق غير موجود' })

            const fullPath = path.join(path.join(__dirname, '../../uploads'), att.file_path)
            if (!fs.existsSync(fullPath)) {
                return res.status(404).json({ success: false, error: 'ملف المرفق غير موجود على الخادم' })
            }

            res.download(fullPath, att.original_name)
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * DELETE /journal-entries/:id/attachments/:attachmentId - Soft delete journal attachment
 */
router.delete('/journal-entries/:id/attachments/:attachmentId',
    authorize('admin', 'manager'),
    param('id').isUUID(),
    param('attachmentId').isUUID(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() })

            const scoped = await getScopedJournalEntry(req, req.params.id)
            if (!scoped.entry) {
                return res.status(scoped.status).json({ success: false, error: scoped.error })
            }

            const att = await JournalAttachment.findOne({
                where: {
                    id: req.params.attachmentId,
                    journal_entry_id: req.params.id,
                    is_deleted: false
                }
            })
            if (!att) return res.status(404).json({ success: false, error: 'المرفق غير موجود' })

            await sequelize.transaction(async (transaction) => {
                await att.update({
                    is_deleted: true,
                    deleted_at: new Date(),
                    deleted_by: req.user.userId
                }, { transaction })

                await GLAuditService.log({
                    eventType: 'journal_attachment_deleted',
                    journalEntryId: scoped.entry.id,
                    entryNumber: scoped.entry.entry_number,
                    sourceType: scoped.entry.source_type || 'manual',
                    sourceId: scoped.entry.source_id || scoped.entry.id,
                    fiscalPeriod: scoped.entry.fiscal_period,
                    createdBy: req.user.userId,
                    branchId: scoped.entry.branch_id || null,
                    payload: {
                        attachment_id: att.id,
                        original_name: att.original_name
                    }
                }, { transaction })
            })

            res.json({ success: true, message: 'تم حذف المرفق (حذف منطقي)' })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /journal-entries - Create manual journal entry (admin/accountant only)
 */
router.post('/journal-entries',
    authorize('admin', 'manager'),
    body('description').notEmpty().withMessage('Description is required'),
    body('lines').isArray({ min: 2 }).withMessage('At least 2 lines required'),
    body('lines.*.accountCode').notEmpty(),
    body('lines.*.debit').optional().isFloat({ min: 0 }),
    body('lines.*.credit').optional().isFloat({ min: 0 }),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const entry = await AccountingService.createJournalEntry({
                description: req.body.description,
                sourceType: 'manual',
                sourceId: null,
                lines: req.body.lines,
                entryDate: req.body.entryDate || null,
                branchId: req.user.branchId || req.body.branchId,
                createdBy: req.user.userId,
                notes: req.body.notes
            })

            res.status(201).json({ success: true, data: entry })
        } catch (error) {
            const status = error.message.startsWith('ACCOUNTING_ERROR') ? 400 : 500
            res.status(status).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /journal-entries/:id/reverse â€” Reverse a journal entry
 */
router.post('/journal-entries/:id/reverse',
    authorize('admin'),
    param('id').isUUID(),
    body('reason').notEmpty().withMessage('Reversal reason is required'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const reversal = await AccountingService.reverseJournalEntry(
                req.params.id,
                {
                    reason: req.body.reason,
                    createdBy: req.user.userId
                }
            )

            res.status(201).json({ success: true, data: reversal })
        } catch (error) {
            const status = error.message.startsWith('ACCOUNTING_ERROR') ? 400 : 500
            res.status(status).json({ success: false, error: error.message })
        }
    }
)

/**
 * GET /audit-logs â€” Independent accounting audit trail
 */
router.get('/audit-logs',
    authorize('admin', 'manager'),
    query('dateFrom').optional().isISO8601().withMessage('dateFrom must be YYYY-MM-DD'),
    query('dateTo').optional().isISO8601().withMessage('dateTo must be YYYY-MM-DD'),
    query('periodFrom').optional().matches(/^\d{4}-\d{2}$/),
    query('periodTo').optional().matches(/^\d{4}-\d{2}$/),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const where = {}
            if (req.query.eventType) where.event_type = req.query.eventType
            if (req.query.sourceType) where.source_type = req.query.sourceType
            if (req.query.sourceId) where.source_id = req.query.sourceId
            const scopedBranchId = resolveBranchScope(req, req.query.branchId)
            if (scopedBranchId) where.branch_id = scopedBranchId
            if (req.query.journalEntryId) where.journal_entry_id = req.query.journalEntryId

            // Daily filtering (created_at) when date range is provided.
            if (req.query.dateFrom || req.query.dateTo) {
                where.created_at = {}
                if (req.query.dateFrom) {
                    where.created_at[Op.gte] = `${req.query.dateFrom} 00:00:00`
                }
                if (req.query.dateTo) {
                    where.created_at[Op.lte] = `${req.query.dateTo} 23:59:59`
                }
            }

            // Monthly filtering (fiscal period), kept for compatibility.
            if (req.query.periodFrom) {
                where.fiscal_period = { ...where.fiscal_period, [Op.gte]: req.query.periodFrom }
            }
            if (req.query.periodTo) {
                where.fiscal_period = { ...where.fiscal_period, [Op.lte]: req.query.periodTo }
            }

            const page = parseInt(req.query.page, 10) || 1
            const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200)
            const offset = (page - 1) * limit

            const { count, rows } = await GLAuditLog.findAndCountAll({
                where,
                include: [{
                    model: JournalEntry,
                    as: 'journalEntry',
                    attributes: ['id', 'entry_number', 'entry_date', 'description', 'status', 'source_type', 'source_id']
                }, {
                    model: User,
                    as: 'createdByUser',
                    attributes: ['id', 'username', 'name_ar', 'name_en'],
                    required: false
                }],
                order: [['created_at', 'DESC']],
                limit,
                offset
            })

            res.json({
                success: true,
                data: rows,
                pagination: {
                    total: count,
                    page,
                    limit,
                    totalPages: Math.ceil(count / limit)
                }
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

// ==================== FINANCIAL REPORTS ====================

/**
 * GET /reports/trial-balance
 */
router.get('/reports/trial-balance',
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
    try {
        const scopedBranchId = resolveBranchScope(req, req.query.branchId)
        const includeHierarchy = String(req.query.includeHierarchy || '').toLowerCase() === 'true'
        const includeZeroHierarchy = String(req.query.includeZeroHierarchy || '').toLowerCase() === 'true'

        const report = await AccountingService.getTrialBalance({
            periodFrom: req.query.periodFrom,
            periodTo: req.query.periodTo,
            branchId: scopedBranchId,
            sourceType: req.query.sourceType,
            sourceId: req.query.sourceId || req.query.projectId || null,
            accountCode: req.query.accountCode || null,
            accountCodePrefix: req.query.accountCodePrefix || null,
            includeHierarchy,
            hierarchyParentCode: req.query.hierarchyParentCode || null,
            includeZeroHierarchy
        })
        res.json({ success: true, data: report })
    } catch (error) {
        res.status(500).json({ success: false, error: error.message })
    }
    }
)

/**
 * GET /reports/profit-loss
 */
router.get('/reports/profit-loss',
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
    try {
        const scopedBranchId = resolveBranchScope(req, req.query.branchId)
        const includeHierarchy = String(req.query.includeHierarchy || '').toLowerCase() === 'true'
        const includeZeroHierarchy = String(req.query.includeZeroHierarchy || '').toLowerCase() === 'true'

        const report = await AccountingService.getProfitAndLoss({
            periodFrom: req.query.periodFrom,
            periodTo: req.query.periodTo,
            branchId: scopedBranchId,
            sourceType: req.query.sourceType,
            sourceId: req.query.sourceId || req.query.projectId || null,
            accountCode: req.query.accountCode || null,
            accountCodePrefix: req.query.accountCodePrefix || null,
            includeHierarchy,
            includeZeroHierarchy
        })
        res.json({ success: true, data: report })
    } catch (error) {
        res.status(500).json({ success: false, error: error.message })
    }
    }
)

/**
 * GET /reports/balance-sheet
 */
router.get('/reports/balance-sheet',
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
    try {
        const scopedBranchId = resolveBranchScope(req, req.query.branchId)
        const includeHierarchy = String(req.query.includeHierarchy || '').toLowerCase() === 'true'
        const includeZeroHierarchy = String(req.query.includeZeroHierarchy || '').toLowerCase() === 'true'

        const report = await AccountingService.getBalanceSheet({
            asOfDate: req.query.asOfDate,
            branchId: scopedBranchId,
            sourceType: req.query.sourceType,
            sourceId: req.query.sourceId || req.query.projectId || null,
            accountCode: req.query.accountCode || null,
            accountCodePrefix: req.query.accountCodePrefix || null,
            includeHierarchy,
            includeZeroHierarchy
        })
        res.json({ success: true, data: report })
    } catch (error) {
        res.status(500).json({ success: false, error: error.message })
    }
    }
)

/**
 * GET /reports/cash-flow
 */
router.get('/reports/cash-flow',
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
    try {
        const scopedBranchId = resolveBranchScope(req, req.query.branchId)
        const report = await AccountingService.getCashFlow({
            periodFrom: req.query.periodFrom,
            periodTo: req.query.periodTo,
            branchId: scopedBranchId,
            sourceType: req.query.sourceType,
            sourceId: req.query.sourceId || req.query.projectId || null
        })
        res.json({ success: true, data: report })
    } catch (error) {
        res.status(500).json({ success: false, error: error.message })
    }
    }
)

// ==================== FISCAL PERIOD MANAGEMENT ====================

/**
 * GET /periods â€” List all fiscal periods
 */
router.get('/periods',
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
    try {
        const periods = await FiscalPeriod.findAll({
            order: [['period', 'DESC']]
        })
        res.json({ success: true, data: periods })
    } catch (error) {
        res.status(500).json({ success: false, error: error.message })
    }
    }
)

/**
 * POST /periods/:period/close â€” Close a fiscal period
 */
router.post('/periods/:period/close',
    authorize('admin'),
    param('period').matches(/^\d{4}-\d{2}$/).withMessage('Format: YYYY-MM'),
    body('permanent').optional().isBoolean(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const fp = await AccountingService.lockPeriod(
                req.params.period,
                {
                    userId: req.user.userId,
                    permanent: req.body.permanent || false
                }
            )

            res.json({ success: true, data: fp, message: `Period ${req.params.period} closed` })
        } catch (error) {
            res.status(400).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /periods/:period/reopen â€” Reopen a fiscal period
 */
router.post('/periods/:period/reopen',
    authorize('admin'),
    param('period').matches(/^\d{4}-\d{2}$/).withMessage('Format: YYYY-MM'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const fp = await AccountingService.reopenPeriod(
                req.params.period,
                { userId: req.user.userId }
            )

            res.json({ success: true, data: fp, message: `Period ${req.params.period} reopened` })
        } catch (error) {
            res.status(400).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /periods/year-end-close â€” Automated year-end close
 */
router.post('/periods/year-end-close',
    authorize('admin'),
    body('fiscalYear').isInt({ min: 2000, max: 2100 }).withMessage('fiscalYear must be YYYY'),
    body('branchId').optional({ nullable: true }).isUUID(),
    body('lockAllPeriods').optional().isBoolean(),
    body('permanentLock').optional().isBoolean(),
    body('notes').optional().isString(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const result = await AccountingService.performYearEndClose({
                fiscalYear: req.body.fiscalYear,
                userId: req.user.userId,
                branchId: req.body.branchId || req.user.branchId || null,
                lockAllPeriods: req.body.lockAllPeriods !== false,
                permanentLock: req.body.permanentLock !== false,
                notes: req.body.notes || null
            })

            res.json({
                success: true,
                data: result,
                message: `Year-end close completed for ${req.body.fiscalYear}`
            })
        } catch (error) {
            res.status(400).json({ success: false, error: error.message })
        }
    }
)

// ==================== CASH DRAWER ====================

/**
 * POST /drawer/open â€” Open cash drawer for current shift
 */
router.post('/drawer/open',
    requirePermission(PERMISSIONS.PAYMENT_PROCESS),
    body('shiftId').notEmpty().withMessage('Shift ID required'),
    body('openingBalance').isFloat({ min: 0 }).withMessage('Opening balance required'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const drawer = await CashDrawerService.openDrawer({
                shiftId: req.body.shiftId,
                userId: req.user.userId,
                branchId: req.user.branchId || req.body.branchId,
                openingBalance: req.body.openingBalance
            })

            res.status(201).json({ success: true, data: drawer })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /drawer/close â€” Close cash drawer
 */
router.post('/drawer/close',
    requirePermission(PERMISSIONS.PAYMENT_PROCESS),
    body('shiftId').notEmpty().withMessage('Shift ID required'),
    body('actualBalance').isFloat({ min: 0 }).withMessage('Actual balance required'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const result = await CashDrawerService.closeDrawer({
                shiftId: req.body.shiftId,
                actualBalance: req.body.actualBalance,
                userId: req.user.userId,
                notes: req.body.notes || ''
            })

            res.json({ success: true, data: result })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /drawer/cash-in
 */
router.post('/drawer/cash-in',
    requirePermission(PERMISSIONS.PAYMENT_PROCESS),
    body('shiftId').notEmpty(),
    body('amount').isFloat({ min: 0.01 }),
    body('reason').notEmpty().withMessage('Reason required'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const drawer = await CashDrawerService.recordCashIn({
                shiftId: req.body.shiftId,
                amount: req.body.amount,
                reason: req.body.reason,
                userId: req.user.userId
            })

            res.json({ success: true, data: drawer })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /drawer/cash-out
 */
router.post('/drawer/cash-out',
    requirePermission(PERMISSIONS.PAYMENT_PROCESS),
    body('shiftId').notEmpty(),
    body('amount').isFloat({ min: 0.01 }),
    body('reason').notEmpty().withMessage('Reason required'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const drawer = await CashDrawerService.recordCashOut({
                shiftId: req.body.shiftId,
                amount: req.body.amount,
                reason: req.body.reason,
                userId: req.user.userId
            })

            res.json({ success: true, data: drawer })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * GET /drawer/:shiftId â€” Drawer status
 */
router.get('/drawer/:shiftId', async (req, res) => {
    try {
        const drawer = await CashDrawerService.getDrawerStatus(req.params.shiftId)
        if (!drawer) return res.status(404).json({ success: false, error: 'Drawer not found' })
        res.json({ success: true, data: drawer })
    } catch (error) {
        res.status(500).json({ success: false, error: error.message })
    }
})

// ==================== ACCOUNTING HOOKS (Manual Triggers) ====================

/**
 * POST /hooks/order-completed â€” Manually record a sale
 */
router.post('/hooks/order-completed',
    authorize('admin', 'manager'),
    body('orderId').isUUID(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const order = await Order.findByPk(req.body.orderId)
            if (!order) return res.status(404).json({ success: false, error: 'Order not found' })
            if (order.status !== 'completed') return res.status(400).json({ success: false, error: 'Order is not completed' })

            // Check if JE already exists
            const existingJE = await JournalEntry.findOne({
                where: { source_type: 'order', source_id: order.id }
            })
            if (existingJE) {
                return res.status(409).json({
                    success: false,
                    error: 'Journal entry already exists for this order',
                    journalEntryId: existingJE.id
                })
            }

            await AccountingHooks.onOrderCompleted(order)
            res.json({ success: true, message: 'Sale recorded in GL' })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /hooks/refund-approved â€” Manually record a refund
 */
router.post('/hooks/refund-approved',
    authorize('admin', 'manager'),
    body('refundId').isUUID(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const refund = await Refund.findByPk(req.body.refundId)
            if (!refund) return res.status(404).json({ success: false, error: 'Refund not found' })

            const order = await Order.findByPk(refund.order_id)
            if (!order) return res.status(404).json({ success: false, error: 'Original order not found' })

            // Check if JE already exists
            const existingJE = await JournalEntry.findOne({
                where: { source_type: 'refund', source_id: refund.id }
            })
            if (existingJE) {
                return res.status(409).json({
                    success: false,
                    error: 'Journal entry already exists for this refund',
                    journalEntryId: existingJE.id
                })
            }

            await AccountingHooks.onRefundApproved(refund, order)
            res.json({ success: true, message: 'Refund recorded in GL' })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /integrity/orders/reconcile â€” Fix completed+pending order state
 */
router.post('/integrity/orders/reconcile',
    authorize('admin'),
    body('limit').optional().isInt({ min: 1, max: 10000 }),
    body('dryRun').optional().isBoolean(),
    body('strategy').optional().isIn(['reopen_order', 'mark_paid']),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const result = await AccountingHooks.reconcileCompletedPendingOrders({
                branchId: req.query.branchId,
                limit: req.body.limit || 1000,
                dryRun: req.body.dryRun === true,
                strategy: req.body.strategy || 'reopen_order'
            })

            res.json({ success: true, data: result })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /backfill â€” Backfill journal entries for historical orders
 */
router.post('/backfill',
    authorize('admin'),
    body('limit').optional().isInt({ min: 1, max: 1000 }),
    body('estimateMissingCOGS').optional().isBoolean(),
    body('fixCompletedPending').optional().isBoolean(),
    body('orderIntegrityStrategy').optional().isIn(['reopen_order', 'mark_paid']),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            let integrity = null
            if (req.body.fixCompletedPending !== false) {
                integrity = await AccountingHooks.reconcileCompletedPendingOrders({
                    branchId: req.query.branchId,
                    limit: req.body.limit || 1000,
                    dryRun: false,
                    strategy: req.body.orderIntegrityStrategy || 'reopen_order'
                })
            }

            const result = await AccountingHooks.backfillOrders({
                branchId: req.query.branchId,
                limit: req.body.limit || 100,
                estimateMissingCOGS: req.body.estimateMissingCOGS === true
            })

            res.json({
                success: true,
                data: {
                    integrity,
                    backfill: result
                }
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

// ==================== ACCOUNT DEFAULTS (Phase 3 â€” ERP-Ready) ====================
// Dynamic account mapping management endpoints
// Allows admins to change which accounts are used for each business operation.

const { AccountResolver, ACCOUNT_KEYS } = require('../services/accountResolver')
const { AccountDefault } = require('../models')

/**
 * GET /defaults â€” List all account default mappings
 * 
 * Query params:
 *   ?branchId=UUID  â€” filter by branch
 *   ?companyId=UUID â€” filter by company (future)
 */
router.get('/defaults',
    authorize('admin', 'manager'),
    async (req, res) => {
        try {
            const defaults = await AccountResolver.getAllDefaults({
                branchId: req.query.branchId || null,
                companyId: req.query.companyId || null
            })

            res.json({
                success: true,
                data: defaults,
                count: defaults.length
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * GET /defaults/keys â€” List all available account keys with their current mapping
 * 
 * Used by the frontend to show a form with all possible account types
 * and what they are currently mapped to.
 */
router.get('/defaults/keys',
    authorize('admin', 'manager'),
    async (req, res) => {
        try {
            const keys = AccountResolver.getAvailableKeys()

            // Enrich with current mappings
            const defaults = await AccountResolver.getAllDefaults()
            const mappingByKey = {}
            for (const def of defaults) {
                if (!mappingByKey[def.account_key]) {
                    mappingByKey[def.account_key] = []
                }
                mappingByKey[def.account_key].push({
                    id: def.id,
                    accountId: def.account_id,
                    accountCode: def.account?.code,
                    accountName: def.account?.name_ar || def.account?.name_en,
                    branchId: def.branch_id,
                    companyId: def.company_id,
                    description: def.description
                })
            }

            const enrichedKeys = keys.map(k => ({
                ...k,
                mappings: mappingByKey[k.key] || []
            }))

            res.json({
                success: true,
                data: enrichedKeys,
                count: enrichedKeys.length
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * PUT /defaults â€” Set or update an account default mapping
 * 
 * Body:
 *   accountKey: string  â€” functional key (e.g. 'default_cash_account')
 *   accountId: UUID     â€” the account to map to
 *   branchId?: UUID     â€” optional: branch-specific override
 *   companyId?: UUID    â€” optional: company-specific override (future)
 *   description?: string
 */
router.put('/defaults',
    authorize('admin'),
    body('accountKey').notEmpty().withMessage('accountKey is required'),
    body('accountId').isUUID().withMessage('accountId must be a valid UUID'),
    body('branchId').optional({ nullable: true }).isUUID(),
    body('companyId').optional({ nullable: true }).isUUID(),
    body('description').optional().isString(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const { accountKey, accountId, branchId, companyId, description } = req.body

            // Validate that the accountKey is a known key
            const validKeys = Object.values(ACCOUNT_KEYS)
            if (!validKeys.includes(accountKey)) {
                return res.status(400).json({
                    success: false,
                    error: `Unknown account key: "${accountKey}". Valid keys: ${validKeys.join(', ')}`
                })
            }

            // Validate that the account exists
            const account = await Account.findByPk(accountId)
            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: `Account not found: ${accountId}`
                })
            }
            if (!account.is_active) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot map inactive account: ${account.code}`
                })
            }
            if (account.is_group) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot map group account "${account.code}" as default. Use a posting (ledger) account.`
                })
            }

            const mapping = await AccountResolver.setDefault(accountKey, accountId, {
                branchId: branchId || null,
                companyId: companyId || null,
                description: description || null
            })

            res.json({
                success: true,
                data: mapping,
                message: `Account default "${accountKey}" â†’ ${account.code} (${account.name_ar}) updated successfully`
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * DELETE /defaults/:id â€” Remove a specific account default mapping
 * 
 * This soft-deletes (is_active=false) a mapping.
 * The system will fall back to the next-priority mapping or the legacy constant.
 */
router.delete('/defaults/:id',
    authorize('admin'),
    param('id').isUUID(),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

            const mapping = await AccountDefault.findByPk(req.params.id)
            if (!mapping) {
                return res.status(404).json({ success: false, error: 'Account default not found' })
            }

            // Soft delete
            await mapping.update({ is_active: false })

            // Clear cache
            AccountResolver.clearCache()

            res.json({
                success: true,
                message: `Account default "${mapping.account_key}" deactivated. Legacy fallback will be used.`
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /defaults/reseed â€” Re-seed account defaults from current COA
 * 
 * Useful after modifying the Chart of Accounts. Only creates missing mappings.
 */
router.post('/defaults/reseed',
    authorize('admin'),
    async (req, res) => {
        try {
            const { seedAccountDefaults } = require('../scripts/seed-account-defaults')
            const result = await seedAccountDefaults()
            res.json({
                success: true,
                data: result,
                message: `Reseeded account defaults: ${result.created} created, ${result.skipped} skipped`
            })
        } catch (error) {
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

/**
 * POST /defaults/clear-cache â€” Force clear the AccountResolver cache
 * 
 * Useful after direct DB edits or debugging.
 */
router.post('/defaults/clear-cache',
    authorize('admin'),
    (req, res) => {
        AccountResolver.clearCache()
        res.json({ success: true, message: 'Account resolver cache cleared' })
    }
)

/**
 * GET /dashboard/stats â€” Accounting Dashboard Statistics
 * 
 * Provides a high-level summary of the accounting system including total KPI sums by root type,
 * recent journal entries, cash and bank balances, and a 6-month revenue vs expense trend.
 */
router.get('/dashboard/stats',
    authorize('admin', 'manager', 'accountant'),
    async (req, res) => {
        try {
            const scopedBranchId = resolveBranchScope(req, req.query.branchId)
            const trialBalance = await AccountingService.getTrialBalance({
                branchId: scopedBranchId
            })
            const accounts = trialBalance.accounts || []

            const summary = {
                assets: 0,
                liabilities: 0,
                equity: 0,
                revenue: 0,
                expenses: 0,
                netIncome: 0
            }

            accounts.forEach(acc => {
                const bal = parseFloat(acc.balance || 0)
                if (acc.root_type === 'asset') summary.assets += bal
                else if (acc.root_type === 'liability') summary.liabilities += bal
                else if (acc.root_type === 'equity') summary.equity += bal
                else if (acc.root_type === 'income') summary.revenue += bal
                else if (acc.root_type === 'expense') summary.expenses += bal
            })

            summary.netIncome = summary.revenue - summary.expenses

            // 2. Extract Cash and Bank specific accounts for liquidity view
            const cashBankAccounts = accounts.filter(acc =>
                String(acc.code).startsWith('1001') || String(acc.code).startsWith('1002')
            ).map(acc => ({
                id: acc.id || acc.code,
                code: acc.code,
                name_ar: acc.name_ar,
                name_en: acc.name_en,
                balance: parseFloat(acc.balance || 0)
            })).sort((a, b) => b.balance - a.balance)

            // 3. Recent Journal Entries
            const recentEntriesWhere = {}
            if (scopedBranchId) {
                recentEntriesWhere.branch_id = scopedBranchId
            }
            const recentEntries = await JournalEntry.findAll({
                where: recentEntriesWhere,
                order: [['created_at', 'DESC']],
                limit: 10,
                attributes: [
                    'id',
                    'entry_number',
                    'description',
                    'total_amount',
                    [sequelize.col('JournalEntry.total_amount'), 'total_debit'],
                    [sequelize.col('JournalEntry.total_amount'), 'total_credit'],
                    'created_at',
                    'status'
                ]
            })

            // 4. 6-Month Income vs Expense Trend
            // Creating baseline months array
            const trend = {}
            for (let i = 5; i >= 0; i--) {
                const d = new Date()
                d.setMonth(d.getMonth() - i)
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                trend[monthKey] = { month: monthKey, income: 0, expense: 0 }
            }

            const sixMonthsAgo = new Date()
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
            sixMonthsAgo.setDate(1)
            sixMonthsAgo.setHours(0, 0, 0, 0)

            const trendEntryWhere = {
                status: 'posted',
                entry_date: { [Op.gte]: sixMonthsAgo }
            }
            if (scopedBranchId) {
                trendEntryWhere.branch_id = scopedBranchId
            }

            // Calculate trends from Journal Lines + JournalEntry scope
            const trendRows = await JournalLine.findAll({
                attributes: [
                    [sequelize.fn('DATE_FORMAT', sequelize.col('JournalEntry.entry_date'), '%Y-%m'), 'monthKey'],
                    [sequelize.col('account.root_type'), 'type'],
                    [sequelize.fn('SUM', sequelize.col('credit_amount')), 'credit_sum'],
                    [sequelize.fn('SUM', sequelize.col('debit_amount')), 'debit_sum']
                ],
                include: [{
                    model: Account,
                    as: 'account',
                    attributes: [],
                    where: { root_type: { [Op.in]: ['income', 'expense'] } }
                }, {
                    model: JournalEntry,
                    attributes: [],
                    where: trendEntryWhere
                }],
                group: ['monthKey', 'type'],
                raw: true
            })

            trendRows.forEach(row => {
                const mk = row.monthKey
                if (trend[mk]) {
                    if (row.type === 'income') {
                        trend[mk].income += (parseFloat(row.credit_sum || 0) - parseFloat(row.debit_sum || 0))
                    } else if (row.type === 'expense') {
                        trend[mk].expense += (parseFloat(row.debit_sum || 0) - parseFloat(row.credit_sum || 0))
                    }
                }
            })

            res.json({
                success: true,
                data: {
                    summary,
                    cashBankAccounts,
                    recentEntries,
                    trend: Object.values(trend)
                }
            })
        } catch (error) {
            console.error('Dashboard Stats Error:', error)
            res.status(500).json({ success: false, error: error.message })
        }
    }
)

module.exports = router

