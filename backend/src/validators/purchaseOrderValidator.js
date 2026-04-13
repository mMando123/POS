const { body } = require('express-validator');

exports.createPOValidator = [
    body('supplier_id')
        .isUUID().withMessage('Ù…Ø¹Ø±Ù Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± ØµØ§Ù„Ø­'),

    body('warehouse_id')
        .isUUID().withMessage('Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ ØºÙŠØ± ØµØ§Ù„Ø­'),

    body('items')
        .isArray({ min: 1 }).withMessage('ÙŠØ¬Ø¨ Ø¥Ø¶Ø§ÙØ© Ù…Ù†ØªØ¬ ÙˆØ§Ø­Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„'),

    body('items.*.menu_id')
        .isUUID().withMessage('Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ù†ØªØ¬ ØºÙŠØ± ØµØ§Ù„Ø­'),

    body('items.*.quantity_ordered')
        .isFloat({ min: 0.01 }).withMessage('Ø§Ù„ÙƒÙ…ÙŠØ© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±'),

    body('items.*.unit_cost')
        .isFloat({ min: 0 }).withMessage('Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø© ØºÙŠØ± ØµØ§Ù„Ø­'),

    body('items.*.tax_rate')
        .optional()
        .isFloat({ min: 0, max: 100 }).withMessage('Line item tax rate must be between 0 and 100'),

    body('expected_date')
        .optional()
        .isISO8601().withMessage('ØªØ§Ø±ÙŠØ® Ø§Ù„ØªÙˆÙ‚Ø¹ ØºÙŠØ± ØµØ§Ù„Ø­'),

    body('notes')
        .optional()
        .isString().withMessage('Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ù†ØµØ§Ù‹')
];

exports.receivePOValidator = [
    body('items')
        .isArray().withMessage('ÙŠØ¬Ø¨ ØªØ­Ø¯ÙŠØ¯ Ø§Ù„ÙƒÙ…ÙŠØ§Øª Ø§Ù„Ù…Ø³ØªÙ„Ù…Ø©'),

    body('items.*.id')
        .isUUID().withMessage('Ù…Ø¹Ø±Ù Ø§Ù„Ø¨Ù†Ø¯ ØºÙŠØ± ØµØ§Ù„Ø­'),

    body('items.*.quantity_received')
        .isFloat({ min: 0 }).withMessage('Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø³ØªÙ„Ù…Ø© ØºÙŠØ± ØµØ§Ù„Ø­Ø©'),

    body('items.*.batch_number')
        .optional()
        .isString().withMessage('Ø±Ù‚Ù… Ø§Ù„Ø¯ÙØ¹Ø© ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ù†ØµØ§Ù‹'),

    body('items.*.production_date')
        .optional()
        .isISO8601().withMessage('تاريخ الإنتاج غير صالح'),

    body('items.*.expiry_date')
        .optional()
        .isISO8601().withMessage('ØªØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© ØºÙŠØ± ØµØ§Ù„Ø­')
];

