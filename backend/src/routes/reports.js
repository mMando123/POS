const express = require('express')
const router = express.Router()
const { Op, fn, col, literal } = require('sequelize')
const { Order, OrderItem, OrderPayment, Menu, Refund, AuditLog, sequelize } = require('../models')
const { authenticate, requirePermission, PERMISSIONS } = require('../middleware/auth')
const { AccountResolver, ACCOUNT_KEYS } = require('../services/accountResolver')

// Daily sales report - requires REPORTS_VIEW permission
router.get('/daily', authenticate, requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res) => {
    try {
        const { date } = req.query
        const targetDate = date ? new Date(date) : new Date()

        const startOfDay = new Date(targetDate)
        startOfDay.setHours(0, 0, 0, 0)

        const endOfDay = new Date(targetDate)
        endOfDay.setHours(23, 59, 59, 999)

        // Get all orders for the day
        const orders = await Order.findAll({
            where: {
                created_at: {
                    [Op.between]: [startOfDay, endOfDay]
                }
            },
            include: [{ model: OrderItem, as: 'items' }]
        })

        // Calculate statistics
        const completedOrders = orders.filter(o => o.status !== 'cancelled')
        const cancelledOrders = orders.filter(o => o.status === 'cancelled')

        const totalSales = Math.round(completedOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0) * 100) / 100
        const totalTax = Math.round(completedOrders.reduce((sum, o) => sum + parseFloat(o.tax || 0), 0) * 100) / 100
        const completedOrderIds = completedOrders.map(o => o.id)
        let cashSales = 0
        let cardSales = 0
        let onlineSales = 0

        if (completedOrderIds.length > 0) {
            const paymentRows = await OrderPayment.findAll({
                where: { order_id: { [Op.in]: completedOrderIds } },
                attributes: [
                    'payment_method',
                    [fn('SUM', col('amount')), 'amount']
                ],
                group: ['payment_method']
            })

            paymentRows.forEach((row) => {
                const amount = Math.round(parseFloat(row.get('amount') || 0) * 100) / 100
                if (row.payment_method === 'cash') cashSales = amount
                else if (row.payment_method === 'card') cardSales = amount
                else if (row.payment_method === 'online') onlineSales = amount
            })
        } else {
            cashSales = Math.round(completedOrders.filter(o => o.payment_method === 'cash').reduce((sum, o) => sum + parseFloat(o.total || 0), 0) * 100) / 100
            cardSales = Math.round(completedOrders.filter(o => ['card', 'multi'].includes(o.payment_method)).reduce((sum, o) => sum + parseFloat(o.total || 0), 0) * 100) / 100
        }
        const cancelledAmount = Math.round(cancelledOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0) * 100) / 100

        // Get refunds for the day (CRITICAL: Net Revenue = Gross - Refunds)
        const refunds = await Refund.findAll({
            where: {
                created_at: { [Op.between]: [startOfDay, endOfDay] },
                status: 'completed'
            }
        })
        const totalRefunds = Math.round(refunds.reduce((sum, r) => sum + parseFloat(r.refund_amount || 0), 0) * 100) / 100
        const refundCount = refunds.length

        // Top selling items
        const itemCounts = {}
        completedOrders.forEach(order => {
            order.items?.forEach(item => {
                const name = item.item_name_ar || 'غير معروف'
                if (!itemCounts[name]) {
                    itemCounts[name] = { name, quantity: 0, revenue: 0 }
                }
                itemCounts[name].quantity += item.quantity
                itemCounts[name].revenue = Math.round((itemCounts[name].revenue + parseFloat(item.total_price || 0)) * 100) / 100
            })
        })
        const topItems = Object.values(itemCounts)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5)

        // Hourly breakdown
        const hourlyBreakdown = Array(24).fill(0).map((_, hour) => ({
            hour,
            orders: 0,
            revenue: 0
        }))
        completedOrders.forEach(order => {
            const hour = new Date(order.created_at).getHours()
            hourlyBreakdown[hour].orders++
            hourlyBreakdown[hour].revenue = Math.round((hourlyBreakdown[hour].revenue + parseFloat(order.total || 0)) * 100) / 100
        })

        res.json({
            data: {
                date: targetDate.toISOString().split('T')[0],
                summary: {
                    totalOrders: completedOrders.length,
                    cancelledOrders: cancelledOrders.length,
                    totalSales: totalSales.toFixed(2),
                    totalTax: totalTax.toFixed(2),
                    netSales: (totalSales - totalTax).toFixed(2),
                    cashSales: cashSales.toFixed(2),
                    cardSales: cardSales.toFixed(2),
                    onlineSales: onlineSales.toFixed(2),
                    nonCashSales: (cardSales + onlineSales).toFixed(2),
                    cancelledAmount: cancelledAmount.toFixed(2),
                    // Refunds (CRITICAL for accurate financials)
                    refundCount: refundCount,
                    refundAmount: totalRefunds.toFixed(2),
                    // Net Revenue = Gross Sales - Refunds
                    netRevenue: (totalSales - totalRefunds).toFixed(2),
                    averageOrderValue: completedOrders.length > 0
                        ? (totalSales / completedOrders.length).toFixed(2)
                        : '0.00'
                },
                topItems,
                hourlyBreakdown: hourlyBreakdown.filter(h => h.orders > 0),
                orders: completedOrders.map(o => ({
                    id: o.id,
                    order_number: o.order_number,
                    total: o.total,
                    payment_method: o.payment_method,
                    status: o.status,
                    created_at: o.created_at
                }))
            }
        })
    } catch (error) {
        console.error('Daily report error:', error)
        res.status(500).json({ message: 'خطأ في إنشاء التقرير' })
    }
})

// Daily reconciliation: POS vs Gateway vs GL
router.get('/reconciliation/daily', authenticate, requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res) => {
    try {
        const date = req.query.date ? new Date(req.query.date) : new Date()
        const branchId = req.query.branch_id || req.user?.branchId || null

        const start = new Date(date)
        start.setHours(0, 0, 0, 0)
        const end = new Date(date)
        end.setHours(23, 59, 59, 999)

        const orderWhere = {
            created_at: { [Op.between]: [start, end] },
            status: { [Op.ne]: 'cancelled' },
            payment_status: 'paid'
        }
        if (branchId) orderWhere.branch_id = branchId

        const orders = await Order.findAll({
            where: orderWhere,
            attributes: ['id', 'total']
        })
        const orderIds = orders.map((x) => x.id)

        let posCash = 0
        let posCard = 0
        let posOnline = 0
        if (orderIds.length) {
            const rows = await OrderPayment.findAll({
                where: { order_id: { [Op.in]: orderIds } },
                attributes: ['payment_method', [fn('SUM', col('amount')), 'amount']],
                group: ['payment_method']
            })
            rows.forEach((row) => {
                const amount = Number(row.get('amount') || 0)
                if (row.payment_method === 'cash') posCash = amount
                else if (row.payment_method === 'card') posCard = amount
                else if (row.payment_method === 'online') posOnline = amount
            })
        }

        const posGross = Number(orders.reduce((sum, o) => sum + Number(o.total || 0), 0).toFixed(2))
        const posNonCash = Number((posCard + posOnline).toFixed(2))

        const auditWhere = {
            category: 'order',
            action: 'payment_confirmed_webhook',
            timestamp: { [Op.between]: [start, end] }
        }
        if (branchId) auditWhere.branch_id = branchId

        const gatewayAuditRows = await AuditLog.findAll({
            where: auditWhere,
            attributes: ['metadata']
        })
        const gatewayTotal = Number(gatewayAuditRows.reduce((sum, row) => {
            const metadata = row.metadata || {}
            const fromCents = metadata.amountCents ? Number(metadata.amountCents) / 100 : 0
            const fromTotal = metadata.order_total ? Number(metadata.order_total) : 0
            const amount = fromCents || fromTotal || 0
            return sum + amount
        }, 0).toFixed(2))

        const targetDate = start.toISOString().slice(0, 10)
        const resolvedBankCode = await AccountResolver.resolve(ACCOUNT_KEYS.BANK, { branchId })
        const bankRootCode = String(resolvedBankCode).split('-')[0]
        const replacement = {
            targetDate,
            bankCode: resolvedBankCode,
            bankRootCode,
            bankFamilyPattern: `${bankRootCode}-%`
        }
        let branchFilter = ''
        if (branchId) {
            branchFilter = 'AND je.branch_id = :branchId'
            replacement.branchId = branchId
        }

        const [bankRows] = await sequelize.query(`
            SELECT COALESCE(SUM(jl.debit_amount), 0) AS bank_debit
            FROM gl_journal_entries je
            JOIN gl_journal_lines jl ON jl.journal_entry_id = je.id
            JOIN gl_accounts a ON a.id = jl.account_id
            WHERE je.status = 'posted'
              AND je.source_type = 'order'
              AND je.entry_date = :targetDate
              AND (a.code = :bankCode OR a.code = :bankRootCode OR a.code LIKE :bankFamilyPattern)
              ${branchFilter}
        `, { replacements: replacement })

        const glBankDebit = Number(parseFloat(bankRows?.[0]?.bank_debit || 0).toFixed(2))
        const gatewayVsPosVariance = Number((gatewayTotal - posNonCash).toFixed(2))
        const glVsPosVariance = Number((glBankDebit - posNonCash).toFixed(2))
        const gatewayVsGlVariance = Number((gatewayTotal - glBankDebit).toFixed(2))

        res.json({
            data: {
                date: targetDate,
                branch_id: branchId,
                pos: {
                    gross_sales: posGross.toFixed(2),
                    cash: Number(posCash.toFixed(2)).toFixed(2),
                    card: Number(posCard.toFixed(2)).toFixed(2),
                    online: Number(posOnline.toFixed(2)).toFixed(2),
                    non_cash_total: posNonCash.toFixed(2),
                    paid_orders_count: orders.length
                },
                gateway: {
                    webhook_confirmed_total: gatewayTotal.toFixed(2),
                    confirmations_count: gatewayAuditRows.length
                },
                gl: {
                    bank_debit_from_order_entries: glBankDebit.toFixed(2)
                },
                variances: {
                    gateway_vs_pos_non_cash: gatewayVsPosVariance.toFixed(2),
                    gl_vs_pos_non_cash: glVsPosVariance.toFixed(2),
                    gateway_vs_gl: gatewayVsGlVariance.toFixed(2)
                }
            }
        })
    } catch (error) {
        console.error('Daily reconciliation report error:', error)
        res.status(500).json({ message: 'Failed to generate daily reconciliation report' })
    }
})

// Date range report - requires REPORTS_VIEW permission
router.get('/range', authenticate, requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res) => {
    try {
        const { start_date, end_date } = req.query

        if (!start_date || !end_date) {
            return res.status(400).json({ message: 'يجب تحديد تاريخ البداية والنهاية' })
        }

        const startDate = new Date(start_date)
        startDate.setHours(0, 0, 0, 0)

        const endDate = new Date(end_date)
        endDate.setHours(23, 59, 59, 999)

        const orders = await Order.findAll({
            where: {
                created_at: { [Op.between]: [startDate, endDate] },
                status: { [Op.ne]: 'cancelled' }
            }
        })

        // Daily breakdown
        const dailyBreakdown = {}
        orders.forEach(order => {
            const date = new Date(order.created_at).toISOString().split('T')[0]
            if (!dailyBreakdown[date]) {
                dailyBreakdown[date] = { date, orders: 0, revenue: 0 }
            }
            dailyBreakdown[date].orders++
            dailyBreakdown[date].revenue = Math.round((dailyBreakdown[date].revenue + parseFloat(order.total || 0)) * 100) / 100
        })

        const totalSales = orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0)

        res.json({
            data: {
                startDate: start_date,
                endDate: end_date,
                totalOrders: orders.length,
                totalSales: totalSales.toFixed(2),
                averageDaily: (totalSales / Object.keys(dailyBreakdown).length || 1).toFixed(2),
                dailyBreakdown: Object.values(dailyBreakdown).sort((a, b) => a.date.localeCompare(b.date))
            }
        })
    } catch (error) {
        console.error('Range report error:', error)
        res.status(500).json({ message: 'خطأ في إنشاء التقرير' })
    }
})

// Best sellers - requires REPORTS_VIEW permission
router.get('/best-sellers', authenticate, requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res) => {
    try {
        const { limit = 10, days = 30 } = req.query

        const startDate = new Date()
        startDate.setDate(startDate.getDate() - parseInt(days))

        const orders = await Order.findAll({
            where: {
                created_at: { [Op.gte]: startDate },
                status: { [Op.ne]: 'cancelled' }
            },
            include: [{ model: OrderItem, as: 'items' }]
        })

        const itemStats = {}
        orders.forEach(order => {
            order.items?.forEach(item => {
                const id = item.menu_id
                if (!itemStats[id]) {
                    itemStats[id] = {
                        menu_id: id,
                        name_ar: item.item_name_ar,
                        quantity: 0,
                        revenue: 0,
                        orders: 0
                    }
                }
                itemStats[id].quantity += item.quantity
                itemStats[id].revenue = Math.round((itemStats[id].revenue + parseFloat(item.total_price || 0)) * 100) / 100
                itemStats[id].orders++
            })
        })

        const bestSellers = Object.values(itemStats)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, parseInt(limit))

        res.json({ data: bestSellers })
    } catch (error) {
        console.error('Best sellers error:', error)
        res.status(500).json({ message: 'خطأ في جلب الأكثر مبيعاً' })
    }
})

// Staff performance report
router.get('/staff-performance', authenticate, requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res) => {
    try {
        const { start_date, end_date } = req.query

        const startDate = start_date ? new Date(start_date) : new Date(new Date().setDate(new Date().getDate() - 30))
        startDate.setHours(0, 0, 0, 0)

        const endDate = end_date ? new Date(end_date) : new Date()
        endDate.setHours(23, 59, 59, 999)

        const { User } = require('../models')

        const orders = await Order.findAll({
            where: {
                created_at: { [Op.between]: [startDate, endDate] },
                status: { [Op.ne]: 'cancelled' },
                user_id: { [Op.ne]: null } // Only orders by users
            },
            include: [{
                model: User,
                attributes: ['id', 'name_ar', 'name_en', 'username']
            }]
        })

        const staffStats = {}

        orders.forEach(order => {
            let userId = order.user_id
            let userName = 'موظف محذوف' // Default for missing users

            if (order.User) {
                userName = order.User.name_ar || order.User.name_en || order.User.username
            } else {
                // If user is missing but user_id exists, group them under "unknown" or keep their ID
                // For better UX, let's group all deleted users or show "Deleted User"
                userId = 'unknown'
            }

            if (!staffStats[userId]) {
                staffStats[userId] = {
                    id: userId,
                    name: userName,
                    ordersCount: 0,
                    totalSales: 0
                }
            }

            staffStats[userId].ordersCount++
            staffStats[userId].totalSales = Math.round((staffStats[userId].totalSales + parseFloat(order.total || 0)) * 100) / 100
        })

        const result = Object.values(staffStats).sort((a, b) => b.totalSales - a.totalSales)

        res.json({ data: result })

    } catch (error) {
        console.error('Staff performance error:', error)
        res.status(500).json({ message: 'خطأ في جلب تقرير الموظفين' })
    }
})

module.exports = router
