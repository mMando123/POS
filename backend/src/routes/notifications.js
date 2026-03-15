const express = require('express')
const router = express.Router()
const { Notification } = require('../models')
const { authenticate, authorize } = require('../middleware/auth')
const { Op } = require('sequelize')
const { getAllRoles } = require('../config/permissions')

const SYSTEM_ROLES = getAllRoles()

const buildNotificationScope = (user) => ({
    [Op.or]: [
        { target_role: 'all' },
        { target_role: user.role },
        { target_user_id: user.userId },
    ]
})

/**
 * Get notifications for the current user
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { unread_only, limit = 50, offset = 0 } = req.query

        const where = buildNotificationScope(req.user)
        if (unread_only === 'true') {
            where.is_read = false
        }

        const notifications = await Notification.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
        })

        const unreadCount = await Notification.count({
            where: {
                ...where,
                is_read: false,
            }
        })

        res.json({
            data: notifications,
            unread_count: unreadCount,
        })
    } catch (error) {
        console.error('Get notifications error:', error)
        res.status(500).json({ message: 'Failed to load notifications' })
    }
})

/**
 * Mark notification as read (scoped to current user visibility)
 */
router.put('/:id/read', authenticate, authorize(...SYSTEM_ROLES), async (req, res) => {
    try {
        const { id } = req.params

        const notification = await Notification.findOne({
            where: {
                id,
                ...buildNotificationScope(req.user)
            }
        })

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' })
        }

        await notification.update({
            is_read: true,
            read_at: new Date(),
        })

        res.json({ message: 'Notification updated', data: notification })
    } catch (error) {
        console.error('Mark notification read error:', error)
        res.status(500).json({ message: 'Failed to update notification' })
    }
})

/**
 * Mark all visible notifications as read
 */
router.put('/read-all', authenticate, authorize(...SYSTEM_ROLES), async (req, res) => {
    try {
        await Notification.update(
            { is_read: true, read_at: new Date() },
            {
                where: {
                    is_read: false,
                    ...buildNotificationScope(req.user)
                }
            }
        )

        res.json({ message: 'All notifications marked as read' })
    } catch (error) {
        console.error('Mark all notifications read error:', error)
        res.status(500).json({ message: 'Failed to update notifications' })
    }
})

/**
 * Delete old notifications (admin only)
 */
router.delete('/cleanup', authenticate, authorize('admin'), async (req, res) => {
    try {
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        const deleted = await Notification.destroy({
            where: {
                created_at: { [Op.lt]: thirtyDaysAgo },
                is_read: true,
            }
        })

        res.json({ message: `Deleted ${deleted} old notifications` })
    } catch (error) {
        console.error('Cleanup notifications error:', error)
        res.status(500).json({ message: 'Failed to cleanup notifications' })
    }
})

module.exports = router
