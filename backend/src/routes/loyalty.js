const express = require('express')
const { body, param } = require('express-validator')
const { validate } = require('../middleware/validate')
const { authenticate, authorize, requirePermission, PERMISSIONS } = require('../middleware/auth')
const { sequelize } = require('../models')
const LoyaltyService = require('../services/loyaltyService')

const router = express.Router()

router.get('/by-phone/:phone',
    authenticate,
    requirePermission(PERMISSIONS.ORDERS_CREATE, PERMISSIONS.ORDERS_VIEW_OWN),
    async (req, res) => {
        try {
            const summary = await LoyaltyService.getCustomerSummaryByPhone(req.params.phone)
            if (!summary) return res.status(404).json({ message: 'Customer not found' })
            res.json({ data: summary })
        } catch (error) {
            res.status(500).json({ message: error.message || 'Failed to load loyalty summary' })
        }
    }
)

router.get('/customer/:customerId',
    authenticate,
    param('customerId').isUUID(),
    validate,
    async (req, res) => {
        try {
            const summary = await LoyaltyService.getCustomerSummary(req.params.customerId)
            if (!summary) return res.status(404).json({ message: 'Customer not found' })
            res.json({ data: summary })
        } catch (error) {
            res.status(500).json({ message: error.message || 'Failed to load loyalty summary' })
        }
    }
)

router.post('/adjust',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('customer_id').isUUID().withMessage('Invalid customer_id'),
        body('points').isInt({ min: -100000, max: 100000 }).withMessage('Invalid points amount'),
        body('notes').optional().isLength({ max: 500 }),
        validate
    ],
    async (req, res) => {
        const transaction = await sequelize.transaction()
        try {
            const result = await LoyaltyService.adjustPoints({
                customerId: req.body.customer_id,
                points: req.body.points,
                notes: req.body.notes || null,
                branchId: req.user.branchId,
                createdBy: req.user.userId,
                transaction
            })

            await transaction.commit()
            res.status(201).json({
                message: 'Loyalty points adjusted successfully',
                data: {
                    customer_id: result.customer.id,
                    old_balance: result.oldBalance,
                    new_balance: result.newBalance,
                    ledger_entry: result.ledger
                }
            })
        } catch (error) {
            if (!transaction.finished) await transaction.rollback()
            const status = error.message && error.message.startsWith('LOYALTY_') ? 400 : 500
            res.status(status).json({ message: error.message || 'Failed to adjust loyalty points' })
        }
    }
)

module.exports = router

