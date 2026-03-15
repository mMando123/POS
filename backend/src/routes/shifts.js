const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const { validate } = require('../middleware/validate')
const { authenticate, authorize, requirePermission, PERMISSIONS } = require('../middleware/auth')
const { Shift, Order, User, sequelize } = require('../models')
const { Op } = require('sequelize')
const ShiftService = require('../services/shiftService')
const OrderPaymentService = require('../services/orderPaymentService')
const AuditService = require('../services/auditService')

// Validate shift status (lightweight check for frontend)
router.get('/validate', authenticate, async (req, res) => {
    try {
        const result = await ShiftService.validateShift(req.user.userId)
        res.json(result)
    } catch (error) {
        console.error('Validate shift error:', error)
        res.status(500).json({
            valid: false,
            hasShift: false,
            message: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„ÙˆØ±Ø¯ÙŠØ©'
        })
    }
})

/**
 * Resume or Open Shift (Primary POS initialization endpoint)
 * This is the RECOMMENDED endpoint for POS clients
 * 
 * Behavior:
 * - If user has an open shift â†’ resume it (return existing shift)
 * - If no open shift AND starting_cash provided â†’ open new shift
 * - If no open shift AND no starting_cash â†’ return action: 'request_opening'
 * 
 * This ensures:
 * - Only ONE open shift per user at any time
 * - No race conditions (uses atomic operations)
 * - Seamless POS experience across devices/sessions
 */
router.post('/resume-or-open', authenticate, requirePermission(PERMISSIONS.PAYMENT_PROCESS), [
    body('starting_cash').optional().isFloat({ min: 0 }).withMessage('Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø±Ù‚Ù…Ø§Ù‹ Ù…ÙˆØ¬Ø¨Ø§Ù‹'),
    validate
], async (req, res) => {
    try {
        const { starting_cash } = req.body

        const result = await ShiftService.resumeOrOpen(
            req.user.userId,
            req.user.branchId,
            starting_cash
        )

        if (!result.success) {
            // Special case: need to open new shift
            if (result.error === 'STARTING_CASH_REQUIRED') {
                return res.status(200).json({
                    success: false,
                    action: 'request_opening',
                    message: result.message,
                    requiresStartingCash: true
                })
            }
            return res.status(400).json(result)
        }

        // Audit log based on action taken
        if (result.action === 'opened') {
            AuditService.logShiftOpened(req, result.shift)
        }
        // For 'resumed' action, no audit needed (just returning existing shift)

        res.json({
            success: true,
            action: result.action,
            message: result.message,
            data: result.shift
        })
    } catch (error) {
        console.error('Resume or open shift error:', error)
        res.status(500).json({
            success: false,
            message: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ø³ØªØ¦Ù†Ø§Ù Ø£Ùˆ ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©'
        })
    }
})

// Get all open shifts (Admin dashboard)
router.get('/open', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const shifts = await ShiftService.getAllOpenShifts()
        res.json({ data: shifts })
    } catch (error) {
        console.error('Get open shifts error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø§Ù„ÙˆØ±Ø¯ÙŠØ§Øª Ø§Ù„Ù…ÙØªÙˆØ­Ø©' })
    }
})

// Get cashier performance report (Admin only)
router.get('/performance', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { date, user_id } = req.query

        // Default to today if no date provided
        const targetDate = date ? new Date(date) : new Date()
        const startOfDay = new Date(targetDate)
        startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(targetDate)
        endOfDay.setHours(23, 59, 59, 999)

        // Build query conditions
        const shiftWhere = {
            start_time: { [Op.between]: [startOfDay, endOfDay] }
        }
        if (user_id) shiftWhere.user_id = user_id

        // Get all shifts for the date
        const shifts = await Shift.findAll({
            where: shiftWhere,
            include: [{
                model: User,
                attributes: ['id', 'username', 'name_ar', 'last_login']
            }],
            order: [['start_time', 'ASC']]
        })

        // Calculate performance metrics per cashier
        const performanceData = []
        const cashierMap = new Map()

        for (const shift of shifts) {
            const userId = shift.user_id
            if (!cashierMap.has(userId)) {
                cashierMap.set(userId, {
                    cashier_id: userId,
                    cashier_name: shift.User?.name_ar || 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ',
                    username: shift.User?.username,
                    last_login: shift.User?.last_login,
                    shifts: [],
                    total_working_minutes: 0,
                    total_orders: 0,
                    total_sales: 0,
                    cash_sales: 0,
                    card_sales: 0
                })
            }

            const cashierData = cashierMap.get(userId)

            // Calculate shift duration in minutes
            const startTime = new Date(shift.start_time)
            const endTime = shift.end_time ? new Date(shift.end_time) : new Date()
            const durationMinutes = Math.floor((endTime - startTime) / (1000 * 60))

            // Get orders for this shift
            const orders = await Order.findAll({
                where: {
                    shift_id: shift.id,
                    status: { [Op.ne]: 'cancelled' }
                }
            })

            const paymentTotals = await OrderPaymentService.getShiftTotals(shift.id)
            const cashSales = Math.round(parseFloat(paymentTotals.cash || 0) * 100) / 100
            const cardSales = Math.round((parseFloat(paymentTotals.card || 0) + parseFloat(paymentTotals.online || 0)) * 100) / 100
            const totalSales = Math.round((cashSales + cardSales) * 100) / 100

            cashierData.shifts.push({
                shift_id: shift.id,
                start_time: shift.start_time,
                end_time: shift.end_time,
                status: shift.status,
                duration_minutes: durationMinutes,
                order_count: orders.length,
                total_sales: totalSales,
                cash_sales: cashSales,
                card_sales: cardSales,
                avg_order_value: orders.length > 0 ? Math.round(totalSales / orders.length * 100) / 100 : 0
            })

            cashierData.total_working_minutes += durationMinutes
            cashierData.total_orders += orders.length
            cashierData.total_sales += totalSales
            cashierData.cash_sales += cashSales
            cashierData.card_sales += cardSales
        }

        // Convert map to array and calculate averages
        for (const [_, data] of cashierMap) {
            data.avg_order_value = data.total_orders > 0
                ? data.total_sales / data.total_orders
                : 0
            data.working_hours = Math.floor(data.total_working_minutes / 60)
            data.working_minutes = data.total_working_minutes % 60
            data.formatted_working_time = `${data.working_hours}Ø³ ${data.working_minutes}Ø¯`
            performanceData.push(data)
        }

        // Sort by total sales descending
        performanceData.sort((a, b) => b.total_sales - a.total_sales)

        res.json({
            data: performanceData,
            date: targetDate.toISOString().split('T')[0],
            total_cashiers: performanceData.length
        })
    } catch (error) {
        console.error('Get performance error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ø£Ø¯Ø§Ø¡' })
    }
})

// Get current active shift for user
router.get('/current', authenticate, async (req, res) => {
    try {
        const shift = await Shift.findOne({
            where: {
                user_id: req.user.userId,
                status: 'open'
            }
        })

        if (!shift) {
            return res.json({ data: null })
        }

        // Calculate current totals on the fly - include ALL order types
        const orders = await Order.findAll({
            where: {
                shift_id: shift.id,
                status: { [Op.ne]: 'cancelled' }
            }
        })

        // Count PAID orders for actual revenue (not just completed)
        const paidOrders = orders.filter(o => o.payment_status === 'paid')

        // Breakdown by order type
        const posOrders = paidOrders.filter(o => o.order_type !== 'online')
        const onlineOrders = paidOrders.filter(o => o.order_type === 'online')

        const paymentTotals = await OrderPaymentService.getShiftTotals(shift.id)
        const cashSales = Math.round(parseFloat(paymentTotals.cash || 0) * 100) / 100
        const cardSales = Math.round(parseFloat(paymentTotals.card || 0) * 100) / 100
        const onlinePayments = Math.round(parseFloat(paymentTotals.online || 0) * 100) / 100

        // Update sales in DB to keep sync
        await shift.update({
            cash_sales: cashSales,
            card_sales: Math.round((cardSales + onlinePayments) * 100) / 100,
            order_count: paidOrders.length
        })

        const expectedCash = Math.round((parseFloat(shift.starting_cash) + cashSales) * 100) / 100

        res.json({
            data: shift,
            live_summary: {
                total_orders: paidOrders.length,
                pending_orders: orders.filter(o => !['completed', 'cancelled'].includes(o.status)).length,
                pos_orders: posOrders.length,
                pos_revenue: Math.round(posOrders.reduce((sum, o) => sum + parseFloat(o.total), 0) * 100) / 100,
                online_orders: onlineOrders.length,
                online_revenue: Math.round(onlineOrders.reduce((sum, o) => sum + parseFloat(o.total), 0) * 100) / 100,
                cash_sales: Math.round(cashSales * 100) / 100,
                card_sales: Math.round(cardSales * 100) / 100,
                online_payments: Math.round(onlinePayments * 100) / 100,
                total_revenue: Math.round((cashSales + cardSales + onlinePayments) * 100) / 100,
                expected_cash: expectedCash,
                starting_cash: parseFloat(shift.starting_cash)
            }
        })
    } catch (error) {
        console.error('Get current shift error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' })
    }
})

// Start new shift (uses atomic operation to prevent race conditions)
router.post('/start', authenticate, requirePermission(PERMISSIONS.PAYMENT_PROCESS), [
    body('starting_cash').isFloat({ min: 0 }).withMessage('Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø±Ù‚Ù…Ø§Ù‹ Ù…ÙˆØ¬Ø¨Ø§Ù‹'),
    validate
], async (req, res) => {
    try {
        const { starting_cash } = req.body

        // Use ShiftService for atomic operation
        const result = await ShiftService.startShift(
            req.user.userId,
            req.user.branchId,
            starting_cash
        )

        if (!result.success) {
            // If shift already exists, return it for resumption
            if (result.error === 'SHIFT_EXISTS' || result.action === 'resumed') {
                return res.status(200).json({
                    message: result.message,
                    action: 'resumed',
                    data: result.shift
                })
            }
            return res.status(400).json({ message: result.message })
        }

        // Audit log - shift opened (non-blocking)
        AuditService.logShiftOpened(req, result.shift)

        res.status(201).json({
            message: result.message,
            action: result.action || 'opened',
            data: result.shift
        })
    } catch (error) {
        console.error('Start shift error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©' })
    }
})

// End shift
router.post('/end', authenticate, requirePermission(PERMISSIONS.PAYMENT_PROCESS), [
    body('ending_cash').isFloat({ min: 0 }).withMessage('Ending cash must be a positive number'),
    validate
], async (req, res) => {
    try {
        const { ending_cash, notes } = req.body
        const result = await ShiftService.endShift(req.user.userId, ending_cash, notes || '')

        if (!result.success) {
            const statusCode = result.error === 'NO_SHIFT' ? 404 : 400
            return res.status(statusCode).json({ message: result.message || 'Unable to close shift' })
        }

        // Audit log - shift closed (non-blocking)
        AuditService.logShiftClosed(req, result.shift, {
            cash_sales: result.summary.cashSales,
            card_sales: result.summary.cardSales,
            order_count: result.summary.orderCount,
            variance: result.summary.difference
        })

        res.json({
            message: result.message,
            data: {
                shift: result.shift,
                summary: {
                    expected: result.summary.expected,
                    actual: result.summary.actual,
                    difference: result.summary.difference,
                    cash_sales: result.summary.cashSales,
                    card_sales: result.summary.cardSales,
                    order_count: result.summary.orderCount
                }
            }
        })
    } catch (error) {
        console.error('End shift error:', error)
        res.status(500).json({ message: 'Server error while closing shift' })
    }
})

// End specific shift (Admin only)
router.post('/:id/end', authenticate, authorize('admin'), [
    body('ending_cash').isFloat({ min: 0 }).withMessage('Ending cash must be a positive number'),
    validate
], async (req, res) => {
    try {
        const { ending_cash, notes } = req.body
        const shiftId = req.params.id

        const result = await ShiftService.forceCloseShift(
            shiftId,
            ending_cash,
            req.user.userId,
            notes || ''
        )

        if (!result.success) {
            const statusCode = result.error === 'NO_SHIFT' ? 404 : 400
            return res.status(statusCode).json({ message: result.message || 'Unable to close shift' })
        }

        res.json({
            message: result.message,
            data: {
                shift: result.shift,
                summary: {
                    expected: result.summary.expected,
                    actual: result.summary.actual,
                    difference: result.summary.difference,
                    cash_sales: result.summary.cashSales,
                    card_sales: result.summary.cardSales,
                    order_count: result.summary.orderCount
                }
            }
        })
    } catch (error) {
        console.error('Force close shift error:', error)
        res.status(500).json({ message: 'Server error while force closing shift' })
    }
})

// Get shift history (Admin/Manager only)
router.get('/history', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { limit = 50, offset = 0, status, review_status } = req.query

        const where = {}
        if (status) where.status = status
        if (review_status) where.review_status = review_status

        const { count, rows: shifts } = await Shift.findAndCountAll({
            where,
            include: [{
                model: User,
                attributes: ['id', 'username', 'name_ar']
            }],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        })

        const processedShifts = shifts.map(shift => {
            const shiftJSON = shift.toJSON()
            if (!shiftJSON.User) {
                shiftJSON.User = {
                    id: shift.user_id,
                    username: 'deleted_user',
                    name_ar: 'Ù…ÙˆØ¸Ù Ù…Ø­Ø°ÙˆÙ'
                }
            }
            return shiftJSON
        })

        res.json({
            data: processedShifts,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        })
    } catch (error) {
        console.error('Get shift history error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø§Ù„Ø³Ø¬Ù„' })
    }
})

// Get detailed shift report
router.get('/:id/report', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const shift = await Shift.findByPk(req.params.id, {
            include: [{
                model: User,
                attributes: ['id', 'username', 'name_ar']
            }]
        })

        if (!shift) {
            return res.status(404).json({ message: 'Ø§Ù„ÙˆØ±Ø¯ÙŠØ© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' })
        }

        // Get orders for this shift
        const orders = await Order.findAll({
            where: {
                shift_id: shift.id,
                status: { [Op.ne]: 'cancelled' }
            }
        })

        const paymentTotals = await OrderPaymentService.getShiftTotals(shift.id)
        const cashSales = Math.round(parseFloat(paymentTotals.cash || 0) * 100) / 100
        const cardSales = Math.round(parseFloat(paymentTotals.card || 0) * 100) / 100
        const onlineSales = Math.round(parseFloat(paymentTotals.online || 0) * 100) / 100
        const totalSales = Math.round((cashSales + cardSales + onlineSales) * 100) / 100
        const expectedCash = parseFloat(shift.starting_cash) + cashSales
        const difference = shift.ending_cash ? parseFloat(shift.ending_cash) - expectedCash : null

        // Calculate shift duration
        const startTime = new Date(shift.start_time)
        const endTime = shift.end_time ? new Date(shift.end_time) : new Date()
        const durationMs = endTime - startTime
        const durationHours = Math.floor(durationMs / (1000 * 60 * 60))
        const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))

        const report = {
            shift_id: shift.id,
            cashier: shift.User,
            status: shift.status,
            review_status: shift.review_status,
            start_time: shift.start_time,
            end_time: shift.end_time,
            duration: {
                hours: durationHours,
                minutes: durationMinutes,
                formatted: `${durationHours}Ø³ ${durationMinutes}Ø¯`
            },
            financials: {
                starting_cash: parseFloat(shift.starting_cash),
                cash_sales: cashSales,
                card_sales: cardSales,
                online_sales: onlineSales,
                total_sales: totalSales,
                expected_cash: expectedCash,
                ending_cash: shift.ending_cash ? parseFloat(shift.ending_cash) : null,
                difference: difference,
                difference_status: difference === null ? 'open' :
                    difference === 0 ? 'balanced' :
                        difference > 0 ? 'excess' : 'shortage'
            },
            order_count: orders.length,
            notes: shift.notes,
            review: {
                status: shift.review_status,
                reviewed_by: shift.reviewed_by,
                reviewed_at: shift.reviewed_at,
                notes: shift.review_notes
            }
        }

        res.json({ data: report })
    } catch (error) {
        console.error('Get shift report error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø§Ù„ØªÙ‚Ø±ÙŠØ±' })
    }
})

// Admin review/approve shift
router.post('/:id/review', authenticate, authorize('admin', 'manager'), [
    body('status').isIn(['approved', 'flagged']).withMessage('Ø­Ø§Ù„Ø© ØºÙŠØ± ØµØ§Ù„Ø­Ø©'),
    validate
], async (req, res) => {
    try {
        const { status, notes } = req.body

        const shift = await Shift.findByPk(req.params.id)
        if (!shift) {
            return res.status(404).json({ message: 'Ø§Ù„ÙˆØ±Ø¯ÙŠØ© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' })
        }

        if (shift.status !== 'closed') {
            return res.status(400).json({ message: 'Ù„Ø§ ÙŠÙ…ÙƒÙ† Ù…Ø±Ø§Ø¬Ø¹Ø© ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø©' })
        }

        await shift.update({
            review_status: status,
            reviewed_by: req.user.userId,
            reviewed_at: new Date(),
            review_notes: notes
        })

        res.json({
            message: status === 'approved' ? 'ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©' : 'ØªÙ… ØªØ¹Ù„ÙŠÙ… Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ù„Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©',
            data: shift
        })
    } catch (error) {
        console.error('Review shift error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„ÙˆØ±Ø¯ÙŠØ©' })
    }
})

// Export shift report
router.get('/:id/export', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { format = 'json' } = req.query

        const shift = await Shift.findByPk(req.params.id, {
            include: [{
                model: User,
                attributes: ['id', 'username', 'name_ar']
            }]
        })

        if (!shift) {
            return res.status(404).json({ message: 'Ø§Ù„ÙˆØ±Ø¯ÙŠØ© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' })
        }

        const orders = await Order.findAll({
            where: { shift_id: shift.id, status: { [Op.ne]: 'cancelled' } }
        })

        const paymentTotals = await OrderPaymentService.getShiftTotals(shift.id)
        const cashSales = Math.round(parseFloat(paymentTotals.cash || 0) * 100) / 100
        const cardSales = Math.round((parseFloat(paymentTotals.card || 0) + parseFloat(paymentTotals.online || 0)) * 100) / 100
        const expectedCash = parseFloat(shift.starting_cash) + cashSales

        if (format === 'csv') {
            const csvData = [
                ['ØªÙ‚Ø±ÙŠØ± Ø§Ù„ÙˆØ±Ø¯ÙŠØ©'],
                ['Ø§Ù„ÙƒØ§Ø´ÙŠØ±', shift.User?.name_ar || 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ'],
                ['ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¨Ø¯Ø¡', shift.start_time],
                ['ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡', shift.end_time || 'Ù…ÙØªÙˆØ­Ø©'],
                [''],
                ['Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ©'],
                ['Ù…Ø¨Ù„Øº Ø§Ù„Ø¨Ø¯Ø§ÙŠØ©', shift.starting_cash],
                ['Ù…Ø¨ÙŠØ¹Ø§Øª Ù†Ù‚Ø¯ÙŠØ©', cashSales],
                ['Ù…Ø¨ÙŠØ¹Ø§Øª Ø´Ø¨ÙƒØ©', cardSales],
                ['Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª', cashSales + cardSales],
                ['Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…ØªÙˆÙ‚Ø¹', expectedCash],
                ['Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„ÙØ¹Ù„ÙŠ', shift.ending_cash || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'],
                ['Ø§Ù„ÙØ±Ù‚', shift.ending_cash ? parseFloat(shift.ending_cash) - expectedCash : 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'],
                [''],
                ['Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª', orders.length],
                ['Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©', shift.review_status]
            ].map(row => row.join(',')).join('\n')

            res.setHeader('Content-Type', 'text/csv; charset=utf-8')
            res.setHeader('Content-Disposition', `attachment; filename=shift_${shift.id}_report.csv`)
            return res.send('\uFEFF' + csvData) // BOM for Arabic support
        }

        // Default: JSON
        res.json({
            data: {
                shift,
                orders_count: orders.length,
                cash_sales: cashSales,
                card_sales: cardSales,
                expected_cash: expectedCash
            }
        })
    } catch (error) {
        console.error('Export shift error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ ØªØµØ¯ÙŠØ± Ø§Ù„ØªÙ‚Ø±ÙŠØ±' })
    }
})

module.exports = router


