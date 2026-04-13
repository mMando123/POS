const { Op } = require('sequelize')
const { OrderPayment, Order } = require('../models')

class OrderPaymentService {
    static _round2(v) {
        return Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100
    }

    static _normalizeReportMethod(method = '') {
        const m = String(method || '').trim().toLowerCase()
        if (['cash', 'card', 'online'].includes(m)) return m
        if (m === 'multi') return 'card'
        return null
    }

    static _sanitizeMethod(method = '') {
        const m = String(method || '').trim().toLowerCase()
        if (!['cash', 'card', 'online'].includes(m)) {
            throw new Error(`PAYMENT_BREAKDOWN_INVALID_METHOD: ${method}`)
        }
        return m
    }

    /**
     * Normalize incoming payment breakdown.
     * - If explicit breakdown is provided, validate and return grouped rows.
     * - Else return a single-row breakdown based on paymentMethod and total.
     */
    static normalizeBreakdown({ paymentMethod, paymentBreakdown = null, totalAmount }) {
        const total = this._round2(totalAmount)
        if (total <= 0) {
            throw new Error('PAYMENT_BREAKDOWN_INVALID_TOTAL')
        }

        if (Array.isArray(paymentBreakdown) && paymentBreakdown.length > 0) {
            const grouped = { cash: 0, card: 0, online: 0 }
            for (const row of paymentBreakdown) {
                const method = this._sanitizeMethod(row?.method)
                const amount = this._round2(row?.amount)
                if (amount <= 0) throw new Error('PAYMENT_BREAKDOWN_INVALID_AMOUNT')
                grouped[method] = this._round2(grouped[method] + amount)
            }

            const rows = Object.entries(grouped)
                .filter(([, amount]) => amount > 0)
                .map(([method, amount]) => ({ method, amount }))

            const sum = this._round2(rows.reduce((s, r) => s + r.amount, 0))
            if (sum !== total) {
                throw new Error(`PAYMENT_BREAKDOWN_SUM_MISMATCH: expected ${total}, got ${sum}`)
            }

            return rows
        }

        const normalizedMethod = String(paymentMethod || '').trim().toLowerCase()
        if (normalizedMethod === 'multi') {
            throw new Error('PAYMENT_BREAKDOWN_REQUIRED_FOR_MULTI')
        }

        const method = this._sanitizeMethod(normalizedMethod || 'cash')
        return [{ method, amount: total }]
    }

    /**
     * Replace all payment rows for an order with a normalized breakdown.
     */
    static async replaceOrderPayments(order, normalizedRows, { transaction = null, processedBy = null, notes = null } = {}) {
        if (!order?.id) throw new Error('ORDER_REQUIRED_FOR_PAYMENTS')
        if (!Array.isArray(normalizedRows) || normalizedRows.length === 0) {
            throw new Error('PAYMENT_BREAKDOWN_EMPTY')
        }

        await OrderPayment.destroy({
            where: { order_id: order.id },
            ...(transaction ? { transaction } : {})
        })

        const rows = normalizedRows.map(r => ({
            order_id: order.id,
            shift_id: order.shift_id || null,
            branch_id: order.branch_id,
            payment_method: r.method,
            amount: this._round2(r.amount),
            processed_by: processedBy || order.user_id || null,
            notes: notes || null
        }))

        await OrderPayment.bulkCreate(rows, transaction ? { transaction } : {})
        return rows
    }

    /**
     * Ensure at least one payment row exists for a paid order.
     */
    static async ensureRowsForPaidOrder(order, { transaction = null, processedBy = null, notes = null } = {}) {
        if (!order?.id) return
        if (order.payment_status !== 'paid') return

        const count = await OrderPayment.count({
            where: { order_id: order.id },
            ...(transaction ? { transaction } : {})
        })
        if (count > 0) return

        const total = this._round2(order.total)
        const method = ['cash', 'card', 'online'].includes(order.payment_method)
            ? order.payment_method
            : 'cash'

        await OrderPayment.create({
            order_id: order.id,
            shift_id: order.shift_id || null,
            branch_id: order.branch_id,
            payment_method: method,
            amount: total,
            processed_by: processedBy || order.user_id || null,
            notes: notes || 'Auto-created payment row for paid order'
        }, transaction ? { transaction } : {})
    }

    /**
     * Resolve totals from payment rows, with fallback for paid orders that
     * are missing order_payments rows.
     */
    static async calculateTotalsForOrders(orders = [], { transaction = null } = {}) {
        const totals = { cash: 0, card: 0, online: 0 }
        const normalizedOrders = Array.isArray(orders)
            ? orders.filter(o => o?.id)
            : []

        const orderIds = normalizedOrders.map(o => o.id)
        if (!orderIds.length) return totals

        const rows = await OrderPayment.findAll({
            where: { order_id: { [Op.in]: orderIds } },
            attributes: [
                'order_id',
                'payment_method',
                [OrderPayment.sequelize.fn('SUM', OrderPayment.sequelize.col('amount')), 'amount']
            ],
            group: ['order_id', 'payment_method'],
            ...(transaction ? { transaction } : {})
        })

        const ordersWithRows = new Set()
        rows.forEach(r => {
            const method = this._normalizeReportMethod(r.payment_method)
            if (!method) return

            ordersWithRows.add(String(r.order_id))
            totals[method] = this._round2(totals[method] + this._round2(r.get('amount')))
        })

        normalizedOrders.forEach(o => {
            if (ordersWithRows.has(String(o.id))) return

            const method = this._normalizeReportMethod(o.payment_method)
            if (!method) return

            totals[method] = this._round2(totals[method] + this._round2(o.total))
        })

        return totals
    }

    /**
     * Payment totals for a specific shift.
     */
    static async getShiftTotals(shiftId, { transaction = null } = {}) {
        const orders = await Order.findAll({
            where: {
                shift_id: shiftId,
                payment_status: 'paid',
                status: { [Op.ne]: 'cancelled' }
            },
            attributes: ['id', 'payment_method', 'total'],
            ...(transaction ? { transaction } : {})
        })
        return this.calculateTotalsForOrders(orders, { transaction })
    }

    /**
     * Payment totals for a date range.
     */
    static async getDateRangeTotals({ startDate, endDate, branchId = null, transaction = null } = {}) {
        const where = {
            created_at: { [Op.between]: [startDate, endDate] }
        }
        if (branchId) where.branch_id = branchId

        const rows = await OrderPayment.findAll({
            where,
            attributes: [
                'payment_method',
                [OrderPayment.sequelize.fn('SUM', OrderPayment.sequelize.col('amount')), 'amount']
            ],
            group: ['payment_method'],
            ...(transaction ? { transaction } : {})
        })

        const totals = { cash: 0, card: 0, online: 0 }
        rows.forEach(r => {
            const m = String(r.payment_method)
            totals[m] = this._round2(r.get('amount'))
        })
        return totals
    }

    /**
     * Payment mix for one order.
     */
    static async getOrderTotals(orderId, { transaction = null } = {}) {
        const rows = await OrderPayment.findAll({
            where: { order_id: orderId },
            attributes: ['payment_method', 'amount'],
            ...(transaction ? { transaction } : {})
        })
        if (!rows.length) return []

        const grouped = { cash: 0, card: 0, online: 0 }
        rows.forEach(r => {
            grouped[r.payment_method] = this._round2(grouped[r.payment_method] + this._round2(r.amount))
        })

        return Object.entries(grouped)
            .filter(([, amount]) => amount > 0)
            .map(([method, amount]) => ({ method, amount }))
    }
}

module.exports = OrderPaymentService
