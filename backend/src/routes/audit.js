/**
 * Audit Log API Routes
 * Provides read-only access to audit logs for admin users
 */

const express = require('express')
const router = express.Router()
const { query } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const AuditService = require('../services/auditService')
const { AuditLog } = require('../models')
const { Op } = require('sequelize')

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
