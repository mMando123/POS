/**
 * Audit Log API Routes
 * Provides read-only access to audit logs for admin users
 */

const express = require('express')
const router = express.Router()
const { query } = require('express-validator')
const { authenticate, authorize, requireAnyPermission, PERMISSIONS } = require('../middleware/auth')
const AuditService = require('../services/auditService')
const { AuditLog } = require('../models')
const { Op } = require('sequelize')

const DEFAULT_FEED_LIMIT = 8
const FEED_FETCH_MULTIPLIER = 10
const FEED_DEDUPE_WINDOW_MS = 60000

const IMPORTANT_EXPLICIT_ACTIONS = new Set([
    'order_created',
    'order_status_changed',
    'order_cancelled',
    'payment_status_changed',
    'payment_confirmed_webhook',
    'payment_confirmed_callback',
    'payment_failed_webhook',
    'shift_opened',
    'shift_closed',
    'stock_adjusted',
    'stock_received',
    'stock_transferred',
    'deactivate_supplier',
    'cancel_po'
])

const IMPORTANT_GENERIC_ROUTE_PREFIXES = [
    '/api/orders',
    '/api/payments',
    '/api/purchases',
    '/api/purchase-orders',
    '/api/suppliers',
    '/api/inventory',
    '/api/transfers',
    '/api/settings',
    '/api/users',
    '/api/branches',
    '/api/menu',
    '/api/categories'
]

const isGenericAuditAction = (action = '') => String(action || '').startsWith('api_')

const shouldIncludeFeedEntry = (row) => {
    const item = row?.toJSON ? row.toJSON() : row
    const action = String(item?.action || '')
    const metadata = item?.metadata || {}
    const route = String(metadata?.route || metadata?.path || '').toLowerCase()
    const method = String(metadata?.method || '').toUpperCase()
    const actorPresent = Boolean(item?.username || item?.user_id)

    if (IMPORTANT_EXPLICIT_ACTIONS.has(action)) {
        return actorPresent
    }

    if (!isGenericAuditAction(action)) {
        return false
    }

    if (!actorPresent) return false
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false
    if (route.startsWith('/api/auth')) return false
    if (!IMPORTANT_GENERIC_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix))) return false

    return true
}

const dedupeFeedEntries = (rows = []) => {
    const kept = []
    const seenEntities = new Set()
    const seenLooseKeys = new Set()

    for (const row of rows) {
        const current = row?.toJSON ? row.toJSON() : row
        if (!shouldIncludeFeedEntry(current)) continue

        const currentTimestamp = new Date(current?.timestamp || 0).getTime()
        const entityKey = current?.entity_type && current?.entity_id
            ? `${String(current.entity_type).toLowerCase()}:${String(current.entity_id).toLowerCase()}`
            : null

        if (entityKey && seenEntities.has(entityKey)) continue

        const duplicateGeneric = isGenericAuditAction(current?.action) && kept.some((existing) => {
            if (isGenericAuditAction(existing?.action)) return false
            if (existing?.category !== current?.category) return false
            if (existing?.user_id !== current?.user_id) return false

            const existingTimestamp = new Date(existing?.timestamp || 0).getTime()
            if (!Number.isFinite(existingTimestamp) || !Number.isFinite(currentTimestamp)) return false
            if (Math.abs(existingTimestamp - currentTimestamp) > FEED_DEDUPE_WINDOW_MS) return false

            if (current?.entity_id && existing?.entity_id) {
                return current.entity_id === existing.entity_id
            }

            return true
        })

        if (duplicateGeneric) continue

        const metadata = current?.metadata || {}
        const route = String(metadata?.route || metadata?.path || '').toLowerCase()
        const looseKey = [
            current?.username || current?.user_id || 'system',
            current?.action || 'action',
            route || current?.category || 'category'
        ].join('|')

        const hasLooseDuplicate = kept.some((existing) => {
            const existingMetadata = existing?.metadata || {}
            const existingRoute = String(existingMetadata?.route || existingMetadata?.path || '').toLowerCase()
            const existingKey = [
                existing?.username || existing?.user_id || 'system',
                existing?.action || 'action',
                existingRoute || existing?.category || 'category'
            ].join('|')

            if (existingKey !== looseKey) return false

            const existingTimestamp = new Date(existing?.timestamp || 0).getTime()
            if (!Number.isFinite(existingTimestamp) || !Number.isFinite(currentTimestamp)) return false
            return Math.abs(existingTimestamp - currentTimestamp) <= FEED_DEDUPE_WINDOW_MS
        })

        if (hasLooseDuplicate || seenLooseKeys.has(looseKey)) continue

        kept.push(current)
        seenLooseKeys.add(looseKey)
        if (entityKey) seenEntities.add(entityKey)
    }

    return kept
}

/**
 * GET /api/audit/feed
 * Lightweight activity feed for dashboard/timelines
 * Branch-scoped for non-admin users
 */
router.get('/feed', authenticate, requireAnyPermission(PERMISSIONS.REPORTS_VIEW, PERMISSIONS.USERS_VIEW), [
    query('category').optional().isIn(['order', 'shift', 'inventory', 'auth', 'settings', 'system']),
    query('user_id').optional().isUUID(),
    query('entity_type').optional().isString(),
    query('entity_id').optional().isString(),
    query('branch_id').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit || DEFAULT_FEED_LIMIT, 10), 1), 50)
        const where = {
            [Op.or]: [
                { action: { [Op.notLike]: 'api_%' } },
                { action: { [Op.like]: 'api_post_%' } },
                { action: { [Op.like]: 'api_put_%' } },
                { action: { [Op.like]: 'api_patch_%' } },
                { action: { [Op.like]: 'api_delete_%' } }
            ]
        }

        if (req.query.category) where.category = req.query.category
        if (req.query.user_id) where.user_id = req.query.user_id
        if (req.query.entity_type) where.entity_type = req.query.entity_type
        if (req.query.entity_id) where.entity_id = req.query.entity_id

        if (req.user.role === 'admin') {
            if (req.query.branch_id) where.branch_id = req.query.branch_id
        } else if (req.user.branchId) {
            where.branch_id = req.user.branchId
        } else {
            where.user_id = req.user.userId
        }

        const rows = await AuditLog.findAll({
            where,
            order: [['timestamp', 'DESC']],
            limit: limit * FEED_FETCH_MULTIPLIER
        })

        const data = dedupeFeedEntries(rows).slice(0, limit)

        res.json({ data })
    } catch (error) {
        console.error('Get audit feed error:', error)
        res.status(500).json({ message: 'خطأ في جلب سجل النشاط' })
    }
})

/**
 * GET /api/audit
 * List audit logs with filters
 * Admin only
 */
router.get('/', authenticate, authorize('admin'), [
    query('category').optional().isIn(['order', 'shift', 'inventory', 'auth', 'settings', 'system']),
    query('action').optional().isString(),
    query('user_id').optional().isUUID(),
    query('entity_type').optional().isString(),
    query('entity_id').optional().isString(),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('offset').optional().isInt({ min: 0 })
], async (req, res) => {
    try {
        const {
            category,
            action,
            user_id,
            entity_type,
            entity_id,
            start_date,
            end_date,
            limit = 100,
            offset = 0
        } = req.query

        const result = await AuditService.getLogs({
            category,
            action,
            userId: user_id,
            entityType: entity_type,
            entityId: entity_id,
            startDate: start_date,
            endDate: end_date,
            limit: parseInt(limit),
            offset: parseInt(offset)
        })

        res.json({
            data: result.data,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset,
                hasMore: result.offset + result.data.length < result.total
            }
        })
    } catch (error) {
        console.error('Get audit logs error:', error)
        res.status(500).json({ message: 'خطأ في جلب سجلات المراجعة' })
    }
})

/**
 * GET /api/audit/actions
 * Get list of available actions for filtering
 */
router.get('/actions', authenticate, authorize('admin'), async (req, res) => {
    try {
        const actions = await AuditLog.findAll({
            attributes: [[require('sequelize').fn('DISTINCT', require('sequelize').col('action')), 'action']],
            raw: true
        })

        res.json({
            data: actions.map(a => a.action).filter(Boolean)
        })
    } catch (error) {
        console.error('Get actions error:', error)
        res.status(500).json({ message: 'خطأ في جلب قائمة الإجراءات' })
    }
})

/**
 * GET /api/audit/entity/:type/:id
 * Get audit trail for specific entity
 */
router.get('/entity/:type/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { type, id } = req.params
        const { limit = 50 } = req.query

        const logs = await AuditLog.findAll({
            where: {
                entity_type: type,
                entity_id: id
            },
            order: [['timestamp', 'DESC']],
            limit: parseInt(limit)
        })

        res.json({ data: logs })
    } catch (error) {
        console.error('Get entity audit error:', error)
        res.status(500).json({ message: 'خطأ في جلب سجل الكيان' })
    }
})

/**
 * GET /api/audit/user/:userId
 * Get audit trail for specific user
 */
router.get('/user/:userId', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { userId } = req.params
        const { limit = 50, category } = req.query

        const where = { user_id: userId }
        if (category) where.category = category

        const logs = await AuditLog.findAll({
            where,
            order: [['timestamp', 'DESC']],
            limit: parseInt(limit)
        })

        res.json({ data: logs })
    } catch (error) {
        console.error('Get user audit error:', error)
        res.status(500).json({ message: 'خطأ في جلب سجل المستخدم' })
    }
})

/**
 * GET /api/audit/summary
 * Get audit summary statistics
 */
router.get('/summary', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query

        const where = {}
        if (start_date || end_date) {
            where.timestamp = {}
            if (start_date) where.timestamp[Op.gte] = new Date(start_date)
            if (end_date) where.timestamp[Op.lte] = new Date(end_date)
        }

        // Get counts by category
        const categoryCounts = await AuditLog.findAll({
            attributes: [
                'category',
                [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
            ],
            where,
            group: ['category'],
            raw: true
        })

        // Get counts by action (top 10)
        const actionCounts = await AuditLog.findAll({
            attributes: [
                'action',
                [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
            ],
            where,
            group: ['action'],
            order: [[require('sequelize').literal('count'), 'DESC']],
            limit: 10,
            raw: true
        })

        // Total count
        const totalCount = await AuditLog.count({ where })

        res.json({
            data: {
                total: totalCount,
                byCategory: categoryCounts.reduce((acc, c) => {
                    acc[c.category] = parseInt(c.count)
                    return acc
                }, {}),
                topActions: actionCounts.map(a => ({
                    action: a.action,
                    count: parseInt(a.count)
                }))
            }
        })
    } catch (error) {
        console.error('Get audit summary error:', error)
        res.status(500).json({ message: 'خطأ في جلب ملخص المراجعة' })
    }
})

module.exports = router
