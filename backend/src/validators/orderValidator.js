const { body } = require('express-validator')

exports.createOrderValidator = [
    body('order_type')
        .isIn(['online', 'walkin', 'delivery', 'dine_in', 'takeaway']).withMessage('Invalid order type'),

    body('items')
        .isArray({ min: 1 }).withMessage('At least one item is required'),

    body('items.*.menu_id')
        .notEmpty().withMessage('Menu item id is required')
        .isUUID().withMessage('Invalid menu item id'),

    body('items.*.quantity')
        .isInt({ min: 1, max: 100 }).withMessage('Quantity must be between 1 and 100'),

    body('items.*.notes')
        .optional()
        .isString()
        .isLength({ max: 500 }).withMessage('Item notes must not exceed 500 characters'),

    body('customer_phone')
        .optional()
        .matches(/^[\d\s\-\+\(\)]*$/).withMessage('Invalid phone format'),

    body('customer_name')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Customer name must not exceed 100 characters'),

    body('customer_address')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Customer address must not exceed 500 characters'),

    body('notes')
        .optional()
        .trim()
        .isLength({ max: 1000 }).withMessage('Notes must not exceed 1000 characters'),

    body('payment_method')
        .optional()
        .isIn(['cash', 'card', 'online', 'multi']).withMessage('Invalid payment method'),

    body('payment_breakdown')
        .optional()
        .isArray({ min: 1, max: 5 }).withMessage('Invalid payment breakdown'),

    body('payment_breakdown.*.method')
        .optional()
        .isIn(['cash', 'card', 'online']).withMessage('Invalid breakdown payment method'),

    body('payment_breakdown.*.amount')
        .optional()
        .isFloat({ gt: 0 }).withMessage('Breakdown amount must be greater than zero'),

    body('price_list_id')
        .optional()
        .isUUID().withMessage('Invalid price list id'),

    body('redeem_points')
        .optional()
        .isInt({ min: 0, max: 100000 }).withMessage('Invalid redeem points'),

    body('items.*.batch_number')
        .optional()
        .isString()
        .isLength({ max: 50 }).withMessage('Invalid batch number'),

    body('coupon_code')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 }).withMessage('Invalid coupon code'),

    body('client_reference')
        .optional()
        .trim()
        .isLength({ min: 6, max: 100 }).withMessage('Invalid client reference')
]

exports.updateOrderStatusValidator = [
    body('status')
        .isIn([
            'pending', 'approved', 'new', 'confirmed',
            'preparing', 'ready', 'handed_to_cashier', 'completed', 'cancelled'
        ]).withMessage('Invalid order status'),

    body('delivery_person')
        .optional()
        .trim()
]
