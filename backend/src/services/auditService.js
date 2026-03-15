/**
 * Audit Service
 * Provides async, non-blocking audit logging for all financial and inventory operations
 * 
 * IMPORTANT: This service is designed to be non-blocking and fail-safe.
 * Audit logging failures should NEVER affect the main business logic.
 */

const AuditLog = require('../models/AuditLog')
const logger = require('./logger')

class AuditService {
    static SENSITIVE_KEYS = new Set([
        'password',
        'password_hash',
        'currentpassword',
        'newpassword',
        'token',
        'refreshtoken',
        'authorization',
        'secret',
        'api_key',
        'apikey',
        'credit_card',
        'card_number',
        'cvv',
        'pin'
    ])

    /**
     * Log an audit event asynchronously (fire-and-forget)
     * @param {Object} params - Audit log parameters
     */
    static log(params) {
        // Fire and forget - don't await, don't block
        this._logAsync(params).catch(err => {
            // Only log to console, never throw
            logger.error('Audit log error (non-blocking):', err.message)
        })
    }

    /**
     * Internal async logging method
     * @private
     */
    static async _logAsync({
        userId = null,
        username = null,
        category,
        action,
        entityType = null,
        entityId = null,
        oldValue = null,
        newValue = null,
        ipAddress = null,
        userAgent = null,
        branchId = null,
        metadata = null,
        req = null // Optional Express request object
    }) {
        try {
            // Extract info from request if provided
            if (req) {
                userId = userId || req.user?.userId || null
                username = username || req.user?.username || null
                branchId = branchId || req.user?.branchId || null
                ipAddress = ipAddress || this._getClientIp(req)
                userAgent = userAgent || req.get('User-Agent')?.substring(0, 500) || null
            }

            await AuditLog.create({
                user_id: userId,
                username,
                category,
                action,
                entity_type: entityType,
                entity_id: entityId ? String(entityId) : null,
                old_value: this.sanitizeValue(oldValue),
                new_value: this.sanitizeValue(newValue),
                ip_address: ipAddress,
                user_agent: userAgent,
                branch_id: branchId,
                metadata: this.sanitizeValue(metadata),
                timestamp: new Date()
            })
        } catch (error) {
            // Log error but never throw - audit failures must not affect business logic
            logger.error('Failed to create audit log:', error.message)
        }
    }

    /**
     * Extract client IP from request
     * @private
     */
    static _getClientIp(req) {
        if (!req) return null

        // Check various headers for proxy scenarios
        const forwardedFor = req.headers['x-forwarded-for']
        if (forwardedFor) {
            return forwardedFor.split(',')[0].trim()
        }

        return req.headers['x-real-ip'] ||
            req.connection?.remoteAddress ||
            req.socket?.remoteAddress ||
            req.ip ||
            null
    }

    /**
     * Sanitize sensitive data from values before logging
     * @private
     */
    static sanitizeValue(value) {
        if (value === null || value === undefined) return value

        if (typeof value === 'string') {
            return value.length > 2000 ? `${value.slice(0, 2000)}...[TRUNCATED]` : value
        }

        if (typeof value !== 'object') return value

        if (Array.isArray(value)) {
            return value.slice(0, 100).map((item) => this.sanitizeValue(item))
        }

        const sanitized = {}
        for (const [rawKey, rawVal] of Object.entries(value)) {
            const key = String(rawKey || '')
            const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
            if (this.SENSITIVE_KEYS.has(normalized)) {
                sanitized[key] = '[REDACTED]'
            } else {
                sanitized[key] = this.sanitizeValue(rawVal)
            }
        }

        return sanitized
    }

    // ==================== ORDER AUDIT METHODS ====================

    /**
     * Log order creation
     */
    static logOrderCreated(req, order, items) {
        const orderData = {
            id: order.id,
            order_number: order.order_number,
            order_type: order.order_type,
            status: order.status,
            payment_method: order.payment_method,
            payment_status: order.payment_status,
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            items_count: items?.length || 0,
            customer_id: order.customer_id,
            shift_id: order.shift_id
        }

        this.log({
            req,
            category: 'order',
            action: 'order_created',
            entityType: 'Order',
            entityId: order.id,
            oldValue: null,
            newValue: orderData,
            metadata: { order_number: order.order_number }
        })
    }

    /**
     * Log order status change
     */
    static logOrderStatusChanged(req, order, oldStatus, newStatus) {
        this.log({
            req,
            category: 'order',
            action: 'order_status_changed',
            entityType: 'Order',
            entityId: order.id,
            oldValue: { status: oldStatus },
            newValue: { status: newStatus },
            metadata: { order_number: order.order_number }
        })
    }

    /**
     * Log order modification
     */
    static logOrderModified(req, order, changes) {
        this.log({
            req,
            category: 'order',
            action: 'order_modified',
            entityType: 'Order',
            entityId: order.id,
            oldValue: changes.before,
            newValue: changes.after,
            metadata: { order_number: order.order_number, fields_changed: Object.keys(changes.after || {}) }
        })
    }

    /**
     * Log order cancelled
     */
    static logOrderCancelled(req, order, reason = null) {
        this.log({
            req,
            category: 'order',
            action: 'order_cancelled',
            entityType: 'Order',
            entityId: order.id,
            oldValue: { status: order.status },
            newValue: { status: 'cancelled', reason },
            metadata: { order_number: order.order_number }
        })
    }

    /**
     * Log payment status change
     */
    static logPaymentStatusChanged(req, order, oldStatus, newStatus, paymentDetails = null) {
        this.log({
            req,
            category: 'order',
            action: 'payment_status_changed',
            entityType: 'Order',
            entityId: order.id,
            oldValue: { payment_status: oldStatus },
            newValue: { payment_status: newStatus, ...paymentDetails },
            metadata: { order_number: order.order_number, total: order.total }
        })
    }

    // ==================== SHIFT AUDIT METHODS ====================

    /**
     * Log shift opened
     */
    static logShiftOpened(req, shift) {
        this.log({
            req,
            category: 'shift',
            action: 'shift_opened',
            entityType: 'Shift',
            entityId: shift.id,
            oldValue: null,
            newValue: {
                starting_cash: shift.starting_cash,
                start_time: shift.start_time,
                branch_id: shift.branch_id
            }
        })
    }

    /**
     * Log shift closed
     */
    static logShiftClosed(req, shift, summary) {
        this.log({
            req,
            category: 'shift',
            action: 'shift_closed',
            entityType: 'Shift',
            entityId: shift.id,
            oldValue: {
                starting_cash: shift.starting_cash,
                status: 'open'
            },
            newValue: {
                ending_cash: shift.ending_cash,
                end_time: shift.end_time,
                status: 'closed',
                cash_sales: summary?.cash_sales,
                card_sales: summary?.card_sales,
                order_count: summary?.order_count,
                variance: summary?.variance
            }
        })
    }

    // ==================== INVENTORY AUDIT METHODS ====================

    /**
     * Log stock adjustment
     */
    static logStockAdjustment(req, adjustment, stockBefore, stockAfter) {
        this.log({
            req,
            category: 'inventory',
            action: 'stock_adjusted',
            entityType: 'Stock',
            entityId: adjustment.menu_id,
            oldValue: {
                quantity: stockBefore,
                adjustment_number: adjustment.adjustment_number
            },
            newValue: {
                quantity: stockAfter,
                adjustment_type: adjustment.adjustment_type,
                quantity_change: adjustment.quantity_change,
                reason: adjustment.reason
            },
            metadata: {
                warehouse_id: adjustment.warehouse_id,
                adjustment_id: adjustment.id
            }
        })
    }

    /**
     * Log stock received (purchase)
     */
    static logStockReceived(req, receipt, items) {
        this.log({
            req,
            category: 'inventory',
            action: 'stock_received',
            entityType: 'PurchaseReceipt',
            entityId: receipt.id,
            oldValue: null,
            newValue: {
                receipt_number: receipt.receipt_number,
                supplier: receipt.supplier,
                total_cost: receipt.total_cost,
                items_count: items?.length || 0
            },
            metadata: {
                warehouse_id: receipt.warehouse_id
            }
        })
    }

    /**
     * Log stock transfer
     */
    static logStockTransfer(req, transfer, items) {
        this.log({
            req,
            category: 'inventory',
            action: 'stock_transferred',
            entityType: 'StockTransfer',
            entityId: transfer.id,
            oldValue: { from_warehouse: transfer.from_warehouse_id },
            newValue: {
                to_warehouse: transfer.to_warehouse_id,
                transfer_number: transfer.transfer_number,
                items_count: items?.length || 0,
                status: transfer.status
            }
        })
    }

    /**
     * Log stock deduction (from order)
     */
    static logStockDeducted(req, menuId, warehouseId, quantity, orderId) {
        this.log({
            req,
            category: 'inventory',
            action: 'stock_deducted',
            entityType: 'Stock',
            entityId: menuId,
            oldValue: null,
            newValue: {
                quantity_deducted: quantity,
                source: 'order',
                order_id: orderId
            },
            metadata: { warehouse_id: warehouseId }
        })
    }

    // ==================== QUERY METHODS ====================

    /**
     * Get audit logs with filters
     */
    static async getLogs({
        category = null,
        action = null,
        userId = null,
        entityType = null,
        entityId = null,
        startDate = null,
        endDate = null,
        limit = 100,
        offset = 0
    }) {
        const where = {}

        if (category) where.category = category
        if (action) where.action = action
        if (userId) where.user_id = userId
        if (entityType) where.entity_type = entityType
        if (entityId) where.entity_id = entityId

        if (startDate || endDate) {
            const { Op } = require('sequelize')
            where.timestamp = {}
            if (startDate) where.timestamp[Op.gte] = new Date(startDate)
            if (endDate) where.timestamp[Op.lte] = new Date(endDate)
        }

        const logs = await AuditLog.findAndCountAll({
            where,
            order: [['timestamp', 'DESC']],
            limit: Math.min(limit, 1000),
            offset
        })

        return {
            data: logs.rows,
            total: logs.count,
            limit,
            offset
        }
    }
}

module.exports = AuditService
