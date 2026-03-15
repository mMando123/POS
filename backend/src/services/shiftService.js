/**
 * Centralized Shift Service
 * Single source of truth for shift management
 * Provides unified logic for checking, creating, and validating shifts
 * 
 * IMPORTANT: Enforces single open shift per user
 * Uses atomic operations to prevent race conditions
 */

const { Shift,
    Order,
    User,
    Refund,
    POSOpeningEntry,
    POSClosingEntry,
    sequelize
} = require('../models')
const { Op } = require('sequelize')


const AccountingHooks = require('./accountingHooks')
const OrderPaymentService = require('./orderPaymentService')
const logger = require('./logger')

class ShiftService {
    /**
     * Get current active shift for a user
     * @param {string} userId - User ID
     * @param {Object} options - Query options (transaction, lock)
     * @returns {Promise<Shift|null>} Active shift or null
     */
    static async getCurrentShift(userId, options = {}) {
        if (!userId) return null

        const queryOptions = {
            where: {
                user_id: userId,
                status: 'open'
            },
            include: [{
                model: User,
                attributes: ['id', 'username', 'name_ar']
            }]
        }

        // Add transaction and lock if provided (for atomic operations)
        if (options.transaction) {
            queryOptions.transaction = options.transaction
        }
        if (options.lock) {
            queryOptions.lock = options.lock
        }

        const shift = await Shift.findOne(queryOptions)
        return shift
    }

    /**
     * Check if user has an active shift (lightweight check)
     * @param {string} userId - User ID
     * @returns {Promise<boolean>}
     */
    static async hasActiveShift(userId) {
        if (!userId) return false

        const count = await Shift.count({
            where: {
                user_id: userId,
                status: 'open'
            }
        })

        return count > 0
    }

    /**
     * Validate and return shift status for a user
     * Returns a standardized response for frontend consumption
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Validation result
     */
    static async validateShift(userId) {
        if (!userId) {
            return {
                valid: false,
                hasShift: false,
                shift: null,
                message: 'User ID required',
                action: 'login'
            }
        }

        const shift = await this.getCurrentShift(userId)

        if (shift) {
            // Calculate current stats for the shift
            const stats = await this.getShiftStats(shift.id)

            return {
                valid: true,
                hasShift: true,
                shift: {
                    id: shift.id,
                    startTime: shift.start_time,
                    startingCash: parseFloat(shift.starting_cash),
                    status: shift.status,
                    userId: shift.user_id,
                    branchId: shift.branch_id,
                    duration: this.calculateDuration(shift.start_time),
                    stats
                },
                message: 'Active shift found',
                action: 'continue'
            }
        }

        return {
            valid: true,
            hasShift: false,
            shift: null,
            message: 'No active shift',
            action: 'open_shift'
        }
    }

    /**
     * Resume existing shift or open a new one (atomic operation)
     * This is the PRIMARY method for POS initialization
     * Prevents race conditions and ensures only one open shift per user
     * 
     * @param {string} userId - User ID
     * @param {string} branchId - Branch ID
     * @param {number} startingCash - Starting cash (only used if opening new)
     * @returns {Promise<Object>} Result with shift and action taken
     */
    static async resumeOrOpen(userId, branchId, startingCash = 0) {
        if (!userId) {
            return {
                success: false,
                error: 'INVALID_USER',
                message: 'معرف المستخدم مطلوب'
            }
        }

        // Use transaction with row-level locking to prevent race conditions
        const transaction = await sequelize.transaction()

        try {
            // Check for existing open shift with lock
            const existingShift = await Shift.findOne({
                where: {
                    user_id: userId,
                    status: 'open'
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            })

            if (existingShift) {
                await POSOpeningEntry.findOrCreate({
                    where: { shift_id: existingShift.id },
                    defaults: {
                        shift_id: existingShift.id,
                        branch_id: existingShift.branch_id,
                        user_id: existingShift.user_id,
                        opening_cash: parseFloat(existingShift.starting_cash || 0),
                        status: 'open',
                        opened_at: existingShift.start_time || new Date(),
                        notes: 'Auto-created for resumed shift'
                    },
                    transaction
                })

                // Resume existing shift
                await transaction.commit()

                const stats = await this.getShiftStats(existingShift.id)

                return {
                    success: true,
                    action: 'resumed',
                    message: 'تم استئناف الوردية الحالية',
                    shift: {
                        id: existingShift.id,
                        startTime: existingShift.start_time,
                        startingCash: parseFloat(existingShift.starting_cash),
                        status: existingShift.status,
                        userId: existingShift.user_id,
                        branchId: existingShift.branch_id,
                        duration: this.calculateDuration(existingShift.start_time),
                        stats
                    }
                }
            }

            // No existing shift - create new one
            if (startingCash === undefined || startingCash === null) {
                await transaction.rollback()
                return {
                    success: false,
                    error: 'STARTING_CASH_REQUIRED',
                    action: 'request_opening',
                    message: 'يجب تحديد المبلغ الافتتاحي لفتح وردية جديدة'
                }
            }

            // Double-check no shift was created by another request
            const doubleCheck = await Shift.count({
                where: {
                    user_id: userId,
                    status: 'open'
                },
                transaction
            })

            if (doubleCheck > 0) {
                await transaction.rollback()
                return {
                    success: false,
                    error: 'RACE_CONDITION',
                    message: 'تم فتح وردية من جهة أخرى. يرجى تحديث الصفحة.'
                }
            }

            const newShift = await Shift.create({
                user_id: userId,
                branch_id: branchId,
                start_time: new Date(),
                starting_cash: startingCash,
                status: 'open'
            }, { transaction })

            await POSOpeningEntry.findOrCreate({
                where: { shift_id: newShift.id },
                defaults: {
                    shift_id: newShift.id,
                    branch_id: branchId,
                    user_id: userId,
                    opening_cash: parseFloat(startingCash || 0),
                    status: 'open',
                    opened_at: newShift.start_time || new Date(),
                    notes: 'Created from shift opening'
                },
                transaction
            })

            await transaction.commit()

            // GL Hook: Create opening CashDrawer (fire-and-forget)
            // This initializes the accounting side of the shift
            try {
                await AccountingHooks.onShiftOpened(newShift)
            } catch (hookErr) {
                logger.error('Failed to open cash drawer hook:', hookErr)
            }

            return {
                success: true,
                action: 'opened',
                message: 'تم فتح وردية جديدة بنجاح',
                shift: {
                    id: newShift.id,
                    startTime: newShift.start_time,
                    startingCash: parseFloat(newShift.starting_cash),
                    status: newShift.status,
                    userId: newShift.user_id,
                    branchId: newShift.branch_id,
                    duration: { hours: 0, minutes: 0, formatted: '0س 0د', totalMinutes: 0 },
                    stats: { orderCount: 0, cashSales: 0, cardSales: 0, totalSales: 0 }
                }
            }
        } catch (error) {
            await transaction.rollback()
            throw error
        }
    }

    /**
     * Get real-time stats for a shift
     * @param {number} shiftId - Shift ID
     * @returns {Promise<Object>} Shift statistics
     */
    static async getShiftStats(shiftId) {
        const orders = await Order.findAll({
            where: {
                shift_id: shiftId,
                payment_status: { [Op.in]: ['paid', 'refunded', 'partially_refunded'] },
                status: { [Op.ne]: 'cancelled' }
            }
        })

        const paymentTotals = await OrderPaymentService.getShiftTotals(shiftId)
        const cashSales = Math.round(parseFloat(paymentTotals.cash || 0) * 100) / 100
        const cardSales = Math.round((parseFloat(paymentTotals.card || 0) + parseFloat(paymentTotals.online || 0)) * 100) / 100

        return {
            orderCount: orders.length,
            cashSales,
            cardSales,
            totalSales: Math.round((cashSales + cardSales) * 100) / 100
        }
    }

    /**
     * Start a new shift for user
     * Prevents duplicates by checking existing shifts first
     * @param {string} userId - User ID
     * @param {string} branchId - Branch ID
     * @param {number} startingCash - Starting cash amount
     * @returns {Promise<Object>} Result with shift or error
     */
    static async startShift(userId, branchId, startingCash) {
        // Use resumeOrOpen for atomic operation
        return this.resumeOrOpen(userId, branchId, startingCash)
    }

    /**
     * End (close) a shift with atomic operation
     * @param {string} userId - User ID
     * @param {number} endingCash - Ending cash amount
     * @param {string} notes - Optional notes
     * @returns {Promise<Object>} Result with summary or error
     */
    static async endShift(userId, endingCash, notes = '') {
        const transaction = await sequelize.transaction()

        try {
            // Lock the shift to prevent concurrent modifications
            const shift = await Shift.findOne({
                where: {
                    user_id: userId,
                    status: 'open'
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            })

            if (!shift) {
                await transaction.rollback()
                return {
                    success: false,
                    error: 'NO_SHIFT',
                    message: 'لا توجد وردية مفتوحة'
                }
            }

            // Calculate totals
            const orders = await Order.findAll({
                where: {
                    shift_id: shift.id,
                    payment_status: { [Op.in]: ['paid', 'refunded', 'partially_refunded'] },
                    status: { [Op.ne]: 'cancelled' }
                },
                transaction
            })

            const paymentTotals = await OrderPaymentService.getShiftTotals(shift.id, { transaction })
            const cashSales = Math.round(parseFloat(paymentTotals.cash || 0) * 100) / 100
            const cardSales = Math.round(parseFloat(paymentTotals.card || 0) * 100) / 100
            const onlineSales = Math.round(parseFloat(paymentTotals.online || 0) * 100) / 100
            const nonCashSales = Math.round((cardSales + onlineSales) * 100) / 100

            // Calculate Refunds for this shift
            const refunds = await Refund.findAll({
                where: {
                    refund_shift_id: shift.id,
                    status: 'completed' // Only completed refunds affect cash
                },
                include: [{
                    model: Order,
                    attributes: ['payment_method'],
                    required: true
                }],
                transaction
            })

            const cashRefunds = Math.round(refunds
                .filter(r => r.Order && r.Order.payment_method === 'cash')
                .reduce((sum, r) => sum + parseFloat(r.refund_amount), 0) * 100) / 100

            const cardRefunds = Math.round(refunds
                .filter(r => r.Order && r.Order.payment_method === 'card')
                .reduce((sum, r) => sum + parseFloat(r.refund_amount), 0) * 100) / 100

            // Net Expected Cash = Starting + Cash Sales - Cash Refunds
            const expectedCash = Math.round((parseFloat(shift.starting_cash) + cashSales - cashRefunds) * 100) / 100

            // Append refund info to notes automatically
            const refundNote = (cashRefunds > 0 || cardRefunds > 0)
                ? `\n[Refunds: Cash ${cashRefunds}, Card ${cardRefunds}]`
                : ''

            await shift.update({
                end_time: new Date(),
                status: 'closed',
                ending_cash: endingCash,
                expected_cash: expectedCash,
                cash_sales: cashSales,
                card_sales: nonCashSales,
                order_count: orders.length,
                notes: (notes || '') + refundNote
            }, { transaction })

            const [openingEntry] = await POSOpeningEntry.findOrCreate({
                where: { shift_id: shift.id },
                defaults: {
                    shift_id: shift.id,
                    branch_id: shift.branch_id,
                    user_id: shift.user_id,
                    opening_cash: parseFloat(shift.starting_cash || 0),
                    status: 'open',
                    opened_at: shift.start_time || new Date(),
                    notes: 'Auto-created during close'
                },
                transaction
            })

            await openingEntry.update({ status: 'closed' }, { transaction })

            const [closingEntry] = await POSClosingEntry.findOrCreate({
                where: { shift_id: shift.id },
                defaults: {
                    shift_id: shift.id,
                    opening_entry_id: openingEntry.id,
                    branch_id: shift.branch_id,
                    closed_by: shift.user_id,
                    expected_cash: expectedCash,
                    actual_cash: endingCash,
                    variance: Math.round((endingCash - expectedCash) * 100) / 100,
                    gross_sales: Math.round((cashSales + cardSales + onlineSales) * 100) / 100,
                    cash_sales: cashSales,
                    card_sales: cardSales,
                    online_sales: onlineSales,
                    order_count: orders.length,
                    closed_at: new Date(),
                    notes: notes || null
                },
                transaction
            })

            await closingEntry.update({
                opening_entry_id: openingEntry.id,
                expected_cash: expectedCash,
                actual_cash: endingCash,
                variance: Math.round((endingCash - expectedCash) * 100) / 100,
                gross_sales: Math.round((cashSales + cardSales + onlineSales) * 100) / 100,
                cash_sales: cashSales,
                card_sales: cardSales,
                online_sales: onlineSales,
                order_count: orders.length,
                closed_at: new Date(),
                notes: notes || null
            }, { transaction })

            await transaction.commit()

            // GL Hook: Close CashDrawer & Record Variance
            try {
                const closedShift = await Shift.findByPk(shift.id)
                if (closedShift) await AccountingHooks.onShiftClosed(closedShift)
            } catch (hookErr) {
                logger.error('Failed to close cash drawer hook:', hookErr)
            }

            return {
                success: true,
                message: 'تم إغلاق الوردية بنجاح',
                shift,
                summary: {
                    expected: expectedCash,
                    actual: endingCash,
                    difference: Math.round((endingCash - expectedCash) * 100) / 100,
                    cashSales,
                    cardSales: nonCashSales,
                    onlineSales,
                    orderCount: orders.length
                }
            }
        } catch (error) {
            await transaction.rollback()
            throw error
        }
    }

    /**
     * Force close a shift (Admin only)
     * @param {number} shiftId - Shift ID
     * @param {number} endingCash - Ending cash
     * @param {string} adminUserId - Admin user ID
     * @param {string} notes - Notes
     * @returns {Promise<Object>} Result
     */
    static async forceCloseShift(shiftId, endingCash, adminUserId, notes = '') {
        const transaction = await sequelize.transaction()

        try {
            const shift = await Shift.findOne({
                where: {
                    id: shiftId,
                    status: 'open'
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            })

            if (!shift) {
                await transaction.rollback()
                return {
                    success: false,
                    error: 'NO_SHIFT',
                    message: 'الوردية غير موجودة أو مغلقة بالفعل'
                }
            }

            // Calculate totals
            const orders = await Order.findAll({
                where: {
                    shift_id: shift.id,
                    payment_status: 'paid',
                    status: { [Op.ne]: 'cancelled' }
                },
                transaction
            })

            const paymentTotals = await OrderPaymentService.getShiftTotals(shift.id, { transaction })
            const cashSales = Math.round(parseFloat(paymentTotals.cash || 0) * 100) / 100
            const cardSales = Math.round(parseFloat(paymentTotals.card || 0) * 100) / 100
            const onlineSales = Math.round(parseFloat(paymentTotals.online || 0) * 100) / 100
            const nonCashSales = Math.round((cardSales + onlineSales) * 100) / 100

            // Calculate Refunds for this shift
            const refunds = await Refund.findAll({
                where: {
                    refund_shift_id: shift.id,
                    status: 'completed'
                },
                include: [{
                    model: Order,
                    attributes: ['payment_method'],
                    required: true
                }],
                transaction
            })

            const cashRefunds = Math.round(refunds
                .filter(r => r.Order && r.Order.payment_method === 'cash')
                .reduce((sum, r) => sum + parseFloat(r.refund_amount), 0) * 100) / 100

            const cardRefunds = Math.round(refunds
                .filter(r => r.Order && r.Order.payment_method === 'card')
                .reduce((sum, r) => sum + parseFloat(r.refund_amount), 0) * 100) / 100

            // Net Expected Cash = Starting + Cash Sales - Cash Refunds
            const expectedCash = Math.round((parseFloat(shift.starting_cash) + cashSales - cashRefunds) * 100) / 100

            // Append refund info to notes
            const refundNote = (cashRefunds > 0 || cardRefunds > 0)
                ? `\n[Refunds: Cash ${cashRefunds}, Card ${cardRefunds}]`
                : ''

            const baseNote = `[إغلاق بواسطة المدير] ${notes}`.trim()

            await shift.update({
                end_time: new Date(),
                status: 'closed',
                ending_cash: endingCash,
                expected_cash: expectedCash,
                cash_sales: cashSales,
                card_sales: nonCashSales,
                order_count: orders.length,
                notes: baseNote + refundNote,
                reviewed_by: adminUserId
            }, { transaction })

            const [openingEntry] = await POSOpeningEntry.findOrCreate({
                where: { shift_id: shift.id },
                defaults: {
                    shift_id: shift.id,
                    branch_id: shift.branch_id,
                    user_id: shift.user_id,
                    opening_cash: parseFloat(shift.starting_cash || 0),
                    status: 'open',
                    opened_at: shift.start_time || new Date(),
                    notes: 'Auto-created during admin close'
                },
                transaction
            })

            await openingEntry.update({ status: 'closed' }, { transaction })

            const [closingEntry] = await POSClosingEntry.findOrCreate({
                where: { shift_id: shift.id },
                defaults: {
                    shift_id: shift.id,
                    opening_entry_id: openingEntry.id,
                    branch_id: shift.branch_id,
                    closed_by: adminUserId,
                    expected_cash: expectedCash,
                    actual_cash: endingCash,
                    variance: Math.round((endingCash - expectedCash) * 100) / 100,
                    gross_sales: Math.round((cashSales + cardSales + onlineSales) * 100) / 100,
                    cash_sales: cashSales,
                    card_sales: cardSales,
                    online_sales: onlineSales,
                    order_count: orders.length,
                    closed_at: new Date(),
                    notes: baseNote
                },
                transaction
            })

            await closingEntry.update({
                opening_entry_id: openingEntry.id,
                closed_by: adminUserId,
                expected_cash: expectedCash,
                actual_cash: endingCash,
                variance: Math.round((endingCash - expectedCash) * 100) / 100,
                gross_sales: Math.round((cashSales + cardSales + onlineSales) * 100) / 100,
                cash_sales: cashSales,
                card_sales: cardSales,
                online_sales: onlineSales,
                order_count: orders.length,
                closed_at: new Date(),
                notes: baseNote
            }, { transaction })

            await transaction.commit()

            // FIX-20: GL Hook — record cash variance for admin-forced close
            try {
                const closedShift = await Shift.findByPk(shift.id)
                if (closedShift) await AccountingHooks.onShiftClosed(closedShift)
            } catch (hookErr) {
                logger.error('FIX-20: Failed to close cash drawer hook (forceClose):', hookErr)
            }

            return {
                success: true,
                message: 'تم إغلاق الوردية بواسطة المدير',
                shift,
                summary: {
                    expected: expectedCash,
                    actual: endingCash,
                    difference: Math.round((endingCash - expectedCash) * 100) / 100,
                    cashSales,
                    cardSales: nonCashSales,
                    onlineSales,
                    orderCount: orders.length
                }
            }
        } catch (error) {
            await transaction.rollback()
            throw error
        }
    }

    /**
     * Get all open shifts (for admin dashboard)
     * @returns {Promise<Array>} List of open shifts
     */
    static async getAllOpenShifts() {
        const shifts = await Shift.findAll({
            where: { status: 'open' },
            include: [{
                model: User,
                attributes: ['id', 'username', 'name_ar']
            }],
            order: [['start_time', 'ASC']]
        })

        const result = []
        for (const shift of shifts) {
            const stats = await this.getShiftStats(shift.id)
            result.push({
                id: shift.id,
                userId: shift.user_id,
                userName: shift.User?.name_ar || shift.User?.username,
                branchId: shift.branch_id,
                startTime: shift.start_time,
                startingCash: parseFloat(shift.starting_cash),
                duration: this.calculateDuration(shift.start_time),
                stats
            })
        }

        return result
    }

    /**
     * Clean up orphaned shifts (shifts left open for too long)
     * @param {number} maxHours - Maximum hours a shift can be open
     * @returns {Promise<number>} Number of shifts cleaned
     */
    static async cleanupOrphanedShifts(maxHours = 24) {
        const cutoffTime = new Date()
        cutoffTime.setHours(cutoffTime.getHours() - maxHours)

        const orphanedShifts = await Shift.findAll({
            where: {
                status: 'open',
                start_time: { [Op.lt]: cutoffTime }
            }
        })

        let cleanedCount = 0
        for (const shift of orphanedShifts) {
            try {
                const stats = await this.getShiftStats(shift.id)
                await shift.update({
                    end_time: new Date(),
                    status: 'closed',
                    ending_cash: 0,
                    expected_cash: parseFloat(shift.starting_cash) + stats.cashSales,
                    cash_sales: stats.cashSales,
                    card_sales: stats.cardSales,
                    order_count: stats.orderCount,
                    notes: `[إغلاق تلقائي - وردية متروكة لأكثر من ${maxHours} ساعة]`
                })

                // FIX-21: GL Hook — record cash variance for auto-closed orphaned shifts
                try {
                    const closedShift = await Shift.findByPk(shift.id)
                    if (closedShift) await AccountingHooks.onShiftClosed(closedShift)
                } catch (hookErr) {
                    logger.error(`FIX-21: Failed to close cash drawer hook (orphan cleanup) for shift ${shift.id}:`, hookErr)
                }

                cleanedCount++
            } catch (err) {
                console.error(`Failed to cleanup shift ${shift.id}:`, err)
            }
        }

        return cleanedCount
    }

    /**
     * Calculate shift duration
     * @param {Date} startTime - Shift start time
     * @returns {Object} Duration object
     */
    static calculateDuration(startTime) {
        const start = new Date(startTime)
        const now = new Date()
        const diffMs = now - start
        const hours = Math.floor(diffMs / (1000 * 60 * 60))
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

        return {
            hours,
            minutes,
            formatted: `${hours}س ${minutes}د`,
            totalMinutes: hours * 60 + minutes
        }
    }
}

module.exports = ShiftService
