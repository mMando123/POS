const express = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')
const { param, validationResult } = require('express-validator')
const { sequelize, Order, PurchaseReceipt, PurchaseOrder, Refund, PurchaseReturn, SupplierPayment, Warehouse, EntityAttachment } = require('../models')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

router.use(authenticate)

const ATTACHMENTS_ROOT = path.join(__dirname, '../../uploads/entity-attachments')
if (!fs.existsSync(ATTACHMENTS_ROOT)) {
    fs.mkdirSync(ATTACHMENTS_ROOT, { recursive: true })
}

const allowedMimeTypes = new Set([
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

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const now = new Date()
        const year = String(now.getFullYear())
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const entityType = req.attachmentScope?.entityType || 'misc'
        const dir = path.join(ATTACHMENTS_ROOT, entityType, year, month)
        fs.mkdirSync(dir, { recursive: true })
        cb(null, dir)
    },
    filename: (req, file, cb) => {
        const ext = normalizeExt(file.originalname, file.mimetype)
        cb(null, `${crypto.randomUUID()}${ext}`)
    }
})

const upload = multer({
    storage,
    limits: {
        fileSize: 15 * 1024 * 1024,
        files: 10
    },
    fileFilter: (req, file, cb) => {
        if (allowedMimeTypes.has(file.mimetype)) {
            cb(null, true)
            return
        }
        cb(new Error('Unsupported attachment type'))
    }
})

function normalizeEntityType(rawType = '') {
    const cleaned = String(rawType || '').trim().toLowerCase()
    const aliases = {
        order: 'order',
        orders: 'order',
        purchase: 'purchase_receipt',
        purchases: 'purchase_receipt',
        purchase_receipt: 'purchase_receipt',
        'purchase-receipt': 'purchase_receipt',
        purchase_order: 'purchase_order',
        purchase_orders: 'purchase_order',
        'purchase-order': 'purchase_order',
        'purchase-orders': 'purchase_order',
        refund: 'refund',
        refunds: 'refund',
        purchase_return: 'purchase_return',
        purchase_returns: 'purchase_return',
        'purchase-return': 'purchase_return',
        'purchase-returns': 'purchase_return',
        supplier_payment: 'supplier_payment',
        supplier_payments: 'supplier_payment',
        'supplier-payment': 'supplier_payment',
        'supplier-payments': 'supplier_payment'
    }
    return aliases[cleaned] || null
}

function mapAttachmentDto(entityType, entityId, att) {
    const normalizedPath = String(att.file_path || '').replace(/^\/+/, '')
    return {
        id: att.id,
        entity_type: att.entity_type,
        entity_id: att.entity_id,
        original_name: att.original_name,
        mime_type: att.mime_type,
        file_size: att.file_size,
        uploaded_by: att.uploaded_by,
        created_at: att.created_at,
        view_url: normalizedPath ? `/uploads/${encodeURI(normalizedPath)}` : null,
        open_url: normalizedPath ? `/uploads/${encodeURI(normalizedPath)}` : null,
        download_url: `/api/entity-attachments/${entityType}/${entityId}/${att.id}/download`
    }
}

async function resolveAttachmentScope(req) {
    const entityType = normalizeEntityType(req.params.entityType)
    if (!entityType) {
        return { error: 'نوع الكيان غير مدعوم', status: 400 }
    }

    const entityId = req.params.entityId

    const defs = {
        order: {
            roles: new Set(['admin', 'manager', 'cashier', 'supervisor']),
            load: async () => {
                const record = await Order.findByPk(entityId, { attributes: ['id', 'branch_id'] })
                return { record, branchId: record?.branch_id || null, companyId: null }
            }
        },
        purchase_receipt: {
            roles: new Set(['admin', 'manager']),
            load: async () => {
                const record = await PurchaseReceipt.findByPk(entityId, { attributes: ['id', 'branch_id'] })
                return { record, branchId: record?.branch_id || null, companyId: null }
            }
        },
        purchase_order: {
            roles: new Set(['admin', 'manager']),
            load: async () => {
                const record = await PurchaseOrder.findByPk(entityId, { attributes: ['id', 'warehouse_id'] })
                let branchId = null
                if (record?.warehouse_id) {
                    const warehouse = await Warehouse.findByPk(record.warehouse_id, { attributes: ['id', 'branch_id'] })
                    branchId = warehouse?.branch_id || null
                }
                return { record, branchId, companyId: null }
            }
        },
        refund: {
            roles: new Set(['admin', 'manager', 'supervisor']),
            load: async () => {
                const record = await Refund.findByPk(entityId, { attributes: ['id', 'branch_id'] })
                return { record, branchId: record?.branch_id || null, companyId: null }
            }
        },
        purchase_return: {
            roles: new Set(['admin', 'manager']),
            load: async () => {
                const record = await PurchaseReturn.findByPk(entityId, { attributes: ['id', 'branch_id'] })
                return { record, branchId: record?.branch_id || null, companyId: null }
            }
        },
        supplier_payment: {
            roles: new Set(['admin', 'manager']),
            load: async () => {
                const record = await SupplierPayment.findByPk(entityId, { attributes: ['id', 'branch_id'] })
                return { record, branchId: record?.branch_id || null, companyId: null }
            }
        }
    }

    const def = defs[entityType]
    if (!def.roles.has(req.user.role)) {
        return { error: 'غير مصرح بالوصول', status: 403 }
    }

    const loaded = await def.load()
    if (!loaded.record) {
        return { error: 'السجل غير موجود', status: 404 }
    }

    if (req.user.role === 'manager' && req.user.branchId && loaded.branchId && loaded.branchId !== req.user.branchId) {
        return { error: 'غير مصرح بالوصول لهذا الفرع', status: 403 }
    }

    return {
        entityType,
        entityId,
        branchId: loaded.branchId || null,
        companyId: loaded.companyId || null
    }
}

async function loadScope(req, res, next) {
    try {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() })
        }

        const scope = await resolveAttachmentScope(req)
        if (scope.error) {
            return res.status(scope.status).json({ success: false, message: scope.error })
        }

        req.attachmentScope = scope
        next()
    } catch (error) {
        return res.status(500).json({ success: false, message: 'فشل التحقق من صلاحيات المرفقات' })
    }
}

router.get('/:entityType/:entityId',
    param('entityType').notEmpty(),
    param('entityId').isUUID(),
    loadScope,
    async (req, res) => {
        try {
            const { entityType, entityId } = req.attachmentScope
            const items = await EntityAttachment.findAll({
                where: {
                    entity_type: entityType,
                    entity_id: entityId,
                    is_deleted: false
                },
                order: [['created_at', 'DESC']]
            })
            res.json({
                success: true,
                data: items.map((item) => mapAttachmentDto(entityType, entityId, item))
            })
        } catch (error) {
            res.status(500).json({ success: false, message: 'فشل جلب المرفقات', error: error.message })
        }
    }
)

router.post('/:entityType/:entityId',
    param('entityType').notEmpty(),
    param('entityId').isUUID(),
    loadScope,
    (req, res, next) => {
        upload.array('files', 10)(req, res, (err) => {
            if (!err) return next()
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ success: false, message: err.message })
            }
            return res.status(400).json({ success: false, message: err.message || 'فشل رفع المرفق' })
        })
    },
    async (req, res) => {
        const uploadedPaths = []
        const tx = await sequelize.transaction()
        try {
            const files = Array.isArray(req.files) ? req.files : []
            if (!files.length) {
                await tx.rollback()
                return res.status(400).json({ success: false, message: 'لم يتم اختيار ملفات للرفع' })
            }

            const { entityType, entityId, branchId, companyId } = req.attachmentScope
            const created = []
            for (const file of files) {
                const hash = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex')
                const relativePath = path.relative(path.join(__dirname, '../../uploads'), file.path).replace(/\\/g, '/')
                uploadedPaths.push(file.path)

                const row = await EntityAttachment.create({
                    entity_type: entityType,
                    entity_id: entityId,
                    original_name: file.originalname,
                    stored_name: file.filename,
                    file_path: relativePath,
                    mime_type: file.mimetype,
                    file_size: file.size,
                    file_hash: hash,
                    uploaded_by: req.user.userId,
                    branch_id: branchId || null,
                    company_id: companyId || null
                }, { transaction: tx })

                created.push(row)
            }

            await tx.commit()
            res.status(201).json({
                success: true,
                message: 'تم رفع المرفقات بنجاح',
                data: created.map((item) => mapAttachmentDto(entityType, entityId, item))
            })
        } catch (error) {
            await tx.rollback()
            for (const p of uploadedPaths) {
                try {
                    if (fs.existsSync(p)) fs.unlinkSync(p)
                } catch (_) {
                    // no-op
                }
            }
            res.status(500).json({ success: false, message: 'فشل رفع المرفقات', error: error.message })
        }
    }
)

router.get('/:entityType/:entityId/:attachmentId/download',
    param('entityType').notEmpty(),
    param('entityId').isUUID(),
    param('attachmentId').isUUID(),
    loadScope,
    async (req, res) => {
        try {
            const { entityType, entityId } = req.attachmentScope
            const att = await EntityAttachment.findOne({
                where: {
                    id: req.params.attachmentId,
                    entity_type: entityType,
                    entity_id: entityId,
                    is_deleted: false
                }
            })

            if (!att) {
                return res.status(404).json({ success: false, message: 'المرفق غير موجود' })
            }

            const fullPath = path.join(path.join(__dirname, '../../uploads'), att.file_path)
            if (!fs.existsSync(fullPath)) {
                return res.status(404).json({ success: false, message: 'الملف غير موجود على القرص' })
            }
            return res.download(fullPath, att.original_name)
        } catch (error) {
            res.status(500).json({ success: false, message: 'فشل تنزيل المرفق', error: error.message })
        }
    }
)

router.delete('/:entityType/:entityId/:attachmentId',
    param('entityType').notEmpty(),
    param('entityId').isUUID(),
    param('attachmentId').isUUID(),
    loadScope,
    async (req, res) => {
        const tx = await sequelize.transaction()
        try {
            const { entityType, entityId } = req.attachmentScope
            const att = await EntityAttachment.findOne({
                where: {
                    id: req.params.attachmentId,
                    entity_type: entityType,
                    entity_id: entityId,
                    is_deleted: false
                },
                transaction: tx
            })

            if (!att) {
                await tx.rollback()
                return res.status(404).json({ success: false, message: 'المرفق غير موجود' })
            }

            await att.update({
                is_deleted: true,
                deleted_at: new Date(),
                deleted_by: req.user.userId
            }, { transaction: tx })

            await tx.commit()
            return res.json({ success: true, message: 'تم حذف المرفق' })
        } catch (error) {
            await tx.rollback()
            return res.status(500).json({ success: false, message: 'فشل حذف المرفق', error: error.message })
        }
    }
)

module.exports = router
