/**
 * Notification Service
 * Centralized service for creating and broadcasting notifications
 */

const { Notification } = require('../models')
const logger = require('./logger')
const { loadSettings } = require('../routes/settings')

const CURRENCY_SYMBOLS = {
    SAR: 'ر.س',
    USD: '$',
    EUR: '€',
    GBP: '£',
    AED: 'د.إ',
    KWD: 'د.ك',
    QAR: 'ر.ق',
    BHD: 'د.ب',
    OMR: 'ر.ع',
    EGP: 'ج.م',
    JOD: 'د.أ'
}

const resolveCurrencySymbol = (currencyCode, fallbackSymbol = '') => {
    const code = String(currencyCode || '').trim().toUpperCase()
    if (CURRENCY_SYMBOLS[code]) return CURRENCY_SYMBOLS[code]
    const fallback = String(fallbackSymbol || '').trim()
    return fallback || code || 'ر.س'
}

const formatAmountWithCurrency = (amount) => {
    const settings = loadSettings()
    const currencyCode = settings?.system?.currency
    const currencySymbol = resolveCurrencySymbol(currencyCode, settings?.system?.currencySymbol)
    const numeric = Number.parseFloat(amount || 0)
    const safeAmount = Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'
    return `${safeAmount} ${currencySymbol}`
}

class NotificationService {
    constructor(io) {
        this.io = io
    }

    /**
     * Create and broadcast a notification
     * @param {Object} data - Notification data
     * @param {string} data.type - Notification type
     * @param {string} data.title - Notification title
     * @param {string} data.message - Notification message
     * @param {string} data.target_role - Target role (all, admin, cashier, chef)
     * @param {string} data.entity_type - Related entity type (order, shift)
     * @param {string} data.entity_id - Related entity ID
     * @param {string} data.action_url - URL to navigate when clicked
     * @param {string} data.icon - Emoji icon
     * @param {string} data.priority - Priority level
     * @param {boolean} data.play_sound - Whether to play sound
     * @param {string} data.branch_id - Branch ID
     */
    async send(data) {
        try {
            // Create notification in database
            const notification = await Notification.create({
                type: data.type,
                title: data.title,
                message: data.message || '',
                target_role: data.target_role || 'all',
                target_user_id: data.target_user_id || null,
                entity_type: data.entity_type || null,
                entity_id: data.entity_id || null,
                action_url: data.action_url || null,
                icon: data.icon || this.getDefaultIcon(data.type),
                priority: data.priority || 'normal',
                play_sound: data.play_sound !== false,
                branch_id: data.branch_id || null,
            })

            // Prepare notification payload for socket
            const payload = {
                id: notification.id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                icon: notification.icon,
                priority: notification.priority,
                play_sound: notification.play_sound,
                action_url: notification.action_url,
                entity_type: notification.entity_type,
                entity_id: notification.entity_id,
                created_at: notification.created_at,
            }

            // Broadcast based on target
            this.broadcast(payload, data.target_role, data.branch_id)

            return notification
        } catch (error) {
            console.error('Failed to send notification:', error)
            throw error
        }
    }

    /**
     * Broadcast notification via Socket.io
     */
    broadcast(payload, targetRole, branchId) {
        // Global notification event
        const event = 'notification:new'

        logger.debug(`📢 Broadcasting notification: ${payload.title} to ${targetRole}`)

        if (targetRole === 'all') {
            // Broadcast to everyone
            this.io.emit(event, payload)
        } else if (targetRole === 'chef') {
            // Broadcast to KDS
            this.io.to(`kds:${branchId || 'all'}`).emit(event, payload)
            this.io.to('kds:all').emit(event, payload)
        } else {
            // Broadcast to specific role room
            this.io.to(`role:${targetRole}`).emit(event, payload)
            // Also broadcast to branch
            if (branchId) {
                this.io.to(`branch:${branchId}`).emit(event, payload)
            }
        }
    }

    /**
     * Get default icon for notification type
     */
    getDefaultIcon(type) {
        const icons = {
            'order_new': '🛒',
            'order_pending': '🌍',
            'order_approved': '✅',
            'order_preparing': '🍳',
            'order_ready': '🔔',
            'order_completed': '✔️',
            'order_cancelled': '❌',
            'shift_alert': '⏰',
            'low_stock': '📦',
            'system': 'ℹ️',
        }
        return icons[type] || '🔔'
    }

    // ==================== Order Notification Helpers ====================

    /**
     * New online order (pending approval)
     */
    async orderPending(order) {
        return this.send({
            type: 'order_pending',
            title: 'طلب أونلاين جديد',
            message: `طلب #${order.order_number} - ${formatAmountWithCurrency(order.total)}`,
            target_role: 'all', // Admin + Cashier
            entity_type: 'order',
            entity_id: order.id,
            action_url: `/pending-orders`,
            icon: '🌍',
            priority: 'high',
            play_sound: true,
            branch_id: order.branch_id,
        })
    }

    /**
     * Order approved and sent to kitchen
     */
    async orderApproved(order) {
        const settings = loadSettings()
        const kdsEnabled = settings?.hardware?.enableKitchenDisplay === true
        const printKitchenReceipt = settings?.workflow?.printKitchenReceipt !== false

        return this.send({
            type: 'order_approved',
            title: 'تمت الموافقة على الطلب',
            message: kdsEnabled
                ? `طلب #${order.order_number} تم إرساله للمطبخ`
                : (printKitchenReceipt
                    ? `طلب #${order.order_number} تمت الموافقة عليه وطباعة أمر المطبخ`
                    : `طلب #${order.order_number} تمت الموافقة عليه وينتظر المتابعة من شاشة الطلبات`),
            target_role: kdsEnabled ? 'chef' : 'cashier',
            entity_type: 'order',
            entity_id: order.id,
            action_url: kdsEnabled ? `/kitchen` : `/orders`,
            icon: kdsEnabled ? '✅' : '🧾',
            priority: 'high',
            play_sound: true,
            branch_id: order.branch_id,
        })
    }

    /**
     * New order for kitchen (POS direct order)
     */
    async orderNew(order) {
        return this.send({
            type: 'order_new',
            title: 'طلب جديد للمطبخ',
            message: `طلب #${order.order_number} - ${order.order_type}`,
            target_role: 'chef',
            entity_type: 'order',
            entity_id: order.id,
            action_url: `/kitchen`,
            icon: '🛒',
            priority: 'high',
            play_sound: true,
            branch_id: order.branch_id,
        })
    }

    /**
     * Order is being prepared
     */
    async orderPreparing(order) {
        return this.send({
            type: 'order_preparing',
            title: 'بدأ تحضير الطلب',
            message: `طلب #${order.order_number} قيد التحضير`,
            target_role: 'cashier',
            entity_type: 'order',
            entity_id: order.id,
            action_url: `/orders`,
            icon: '🍳',
            priority: 'normal',
            play_sound: false,
            branch_id: order.branch_id,
        })
    }

    /**
     * Order is ready for pickup/delivery
     */
    async orderReady(order) {
        return this.send({
            type: 'order_ready',
            title: 'الطلب جاهز!',
            message: `طلب #${order.order_number} جاهز للتسليم`,
            target_role: 'cashier',
            entity_type: 'order',
            entity_id: order.id,
            action_url: `/cashier-queue`,
            icon: '🔔',
            priority: 'high',
            play_sound: true,
            branch_id: order.branch_id,
        })
    }

    /**
     * Order cancelled
     */
    async orderCancelled(order, reason) {
        return this.send({
            type: 'order_cancelled',
            title: 'تم إلغاء الطلب',
            message: `طلب #${order.order_number} - ${reason || 'بدون سبب'}`,
            target_role: 'all',
            entity_type: 'order',
            entity_id: order.id,
            action_url: `/orders`,
            icon: '❌',
            priority: 'high',
            play_sound: true,
            branch_id: order.branch_id,
        })
    }
}

// Singleton instance
let notificationService = null

const initNotificationService = (io) => {
    notificationService = new NotificationService(io)
    return notificationService
}

const getNotificationService = () => {
    if (!notificationService) {
        throw new Error('NotificationService not initialized. Call initNotificationService(io) first.')
    }
    return notificationService
}

module.exports = {
    NotificationService,
    initNotificationService,
    getNotificationService,
}
