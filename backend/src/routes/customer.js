const express = require('express')
const router = express.Router()
const { body, param, query } = require('express-validator')
const { Op } = require('sequelize')
const { validate } = require('../middleware/validate')
const { Customer, Order, sequelize } = require('../models')
const { orderLimiter } = require('../middleware/rateLimiter')
const { authenticate } = require('../middleware/auth')

const parseSortField = (raw) => {
    const allowed = new Set(['created_at', 'total_spent', 'total_orders', 'loyalty_points', 'name', 'phone'])
    return allowed.has(raw) ? raw : 'created_at'
}

const parseDirection = (raw) => {
    const normalized = String(raw || '').toUpperCase()
    return normalized === 'ASC' ? 'ASC' : 'DESC'
}

// List customers (for management UI)
router.get('/', authenticate, [
    query('search').optional().isLength({ max: 100 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
    query('sort').optional().isString(),
    query('direction').optional().isIn(['asc', 'desc', 'ASC', 'DESC']),
    validate
], async (req, res) => {
    try {
        const search = String(req.query.search || '').trim()
        const limit = parseInt(req.query.limit || 50, 10)
        const offset = parseInt(req.query.offset || 0, 10)
        const sort = parseSortField(String(req.query.sort || 'created_at'))
        const direction = parseDirection(req.query.direction)

        const where = {}
        if (search) {
            where[Op.or] = [
                { phone: { [Op.like]: `%${search}%` } },
                { name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } }
            ]
        }

        const [rows, total] = await Promise.all([
            Customer.findAll({
                where,
                order: [[sort, direction]],
                limit,
                offset
            }),
            Customer.count({ where })
        ])

        const summary = await Customer.findOne({
            where,
            raw: true,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'total_customers'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_orders')), 0), 'total_orders'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_spent')), 0), 'total_spent'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('loyalty_points')), 0), 'total_loyalty_points']
            ]
        })

        res.json({
            data: rows,
            meta: {
                total,
                limit,
                offset,
                has_more: offset + rows.length < total
            },
            summary: {
                total_customers: parseInt(summary?.total_customers || 0, 10),
                total_orders: parseInt(summary?.total_orders || 0, 10),
                total_spent: parseFloat(summary?.total_spent || 0),
                total_loyalty_points: parseInt(summary?.total_loyalty_points || 0, 10)
            }
        })
    } catch (error) {
        console.error('List customers error:', error)
        res.status(500).json({ message: 'Failed to load customers' })
    }
})

// Get customer by phone (legacy helper endpoint)
router.get('/phone/:phone', [
    param('phone')
        .notEmpty().withMessage('Phone is required')
        .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone format')
        .isLength({ min: 8, max: 20 }).withMessage('Phone must be between 8 and 20 chars'),
    validate
], async (req, res) => {
    try {
        const customer = await Customer.findOne({
            where: { phone: req.params.phone }
        })

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' })
        }

        res.json({ data: customer })
    } catch (error) {
        console.error('Get customer by phone error:', error)
        res.status(500).json({ message: 'Server error' })
    }
})

// Get customer by id
router.get('/:id', authenticate, [
    param('id').isUUID().withMessage('Invalid customer id'),
    validate
], async (req, res) => {
    try {
        const customer = await Customer.findByPk(req.params.id)
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' })
        }
        res.json({ data: customer })
    } catch (error) {
        console.error('Get customer by id error:', error)
        res.status(500).json({ message: 'Server error' })
    }
})

// Get customer recent orders
router.get('/:id/orders', authenticate, [
    param('id').isUUID().withMessage('Invalid customer id'),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    validate
], async (req, res) => {
    try {
        const customerId = req.params.id
        const limit = parseInt(req.query.limit || 30, 10)

        const customer = await Customer.findByPk(customerId)
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' })
        }

        const orders = await Order.findAll({
            where: { customer_id: customerId },
            attributes: [
                'id',
                'order_number',
                'order_type',
                'status',
                'payment_method',
                'payment_status',
                'subtotal',
                'discount',
                'tax',
                'total',
                'created_at',
                'completed_at'
            ],
            order: [['created_at', 'DESC']],
            limit
        })

        res.json({ data: orders })
    } catch (error) {
        console.error('Get customer orders error:', error)
        res.status(500).json({ message: 'Failed to load customer orders' })
    }
})

// Create or update customer
router.post('/', orderLimiter, [
    body('phone')
        .notEmpty().withMessage('Phone is required')
        .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone format')
        .isLength({ min: 8, max: 20 }).withMessage('Phone must be between 8 and 20 chars'),
    body('name')
        .optional()
        .isLength({ max: 100 }).withMessage('Name cannot exceed 100 chars')
        .trim(),
    body('email')
        .optional()
        .isEmail().withMessage('Invalid email')
        .normalizeEmail(),
    body('address')
        .optional()
        .isLength({ max: 500 }).withMessage('Address cannot exceed 500 chars')
        .trim(),
    validate
], async (req, res) => {
    try {
        const { phone, name, email, address } = req.body

        const [customer, created] = await Customer.findOrCreate({
            where: { phone },
            defaults: { phone, name, email, address }
        })

        if (!created) {
            await customer.update({
                name: name || customer.name,
                email: email || customer.email,
                address: address || customer.address
            })
        }

        res.json({ data: customer, created })
    } catch (error) {
        console.error('Create/update customer error:', error)
        res.status(500).json({ message: 'Server error' })
    }
})

module.exports = router

