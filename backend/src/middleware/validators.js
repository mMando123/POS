/**
 * Common Validators for Express Routes
 * Centralized validation rules using express-validator
 * Use these in routes to ensure consistent validation
 */

const { body, param, query } = require('express-validator');
const validator = require('validator');
const { getAllRoles } = require('../config/permissions');

const USER_ALLOWED_ROLES = getAllRoles();

/**
 * Common validation rules for reuse across routes
 */
const commonValidators = {
    // ID validators
    id: param('id')
        .notEmpty().withMessage('المعرف مطلوب')
        .custom((value) => {
            // Accept both UUID and numeric IDs
            return validator.isUUID(value) || validator.isInt(value + '');
        }).withMessage('صيغة المعرف غير صالحة'),

    // UUID specific
    uuid: (field) => body(field)
        .optional()
        .isUUID().withMessage(`${field} يجب أن يكون UUID صالح`),

    // Pagination
    page: query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('رقم الصفحة يجب أن يكون رقماً موجباً')
        .toInt(),

    limit: query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('عدد النتائج يجب أن يكون بين 1 و 100')
        .toInt(),

    // Date validators
    date: (field, message) => body(field)
        .optional()
        .isISO8601().withMessage(message || `${field} يجب أن يكون تاريخاً صالحاً`),

    dateRequired: (field, message) => body(field)
        .notEmpty().withMessage(`${field} مطلوب`)
        .isISO8601().withMessage(message || `${field} يجب أن يكون تاريخاً صالحاً`),

    // String validators
    stringRequired: (field, message, options = {}) => {
        const chain = body(field)
            .notEmpty().withMessage(message || `${field} مطلوب`)
            .isString().withMessage(`${field} يجب أن يكون نصاً`)
            .trim();

        if (options.min) {
            chain.isLength({ min: options.min }).withMessage(`${field} يجب أن يكون ${options.min} أحرف على الأقل`);
        }
        if (options.max) {
            chain.isLength({ max: options.max }).withMessage(`${field} يجب ألا يتجاوز ${options.max} حرف`);
        }

        return chain;
    },

    stringOptional: (field, options = {}) => {
        const chain = body(field)
            .optional()
            .isString().withMessage(`${field} يجب أن يكون نصاً`)
            .trim();

        if (options.max) {
            chain.isLength({ max: options.max }).withMessage(`${field} يجب ألا يتجاوز ${options.max} حرف`);
        }

        return chain;
    },

    // Numeric validators
    number: (field, message) => body(field)
        .optional()
        .isNumeric().withMessage(message || `${field} يجب أن يكون رقماً`),

    numberRequired: (field, message) => body(field)
        .notEmpty().withMessage(`${field} مطلوب`)
        .isNumeric().withMessage(message || `${field} يجب أن يكون رقماً`),

    positiveNumber: (field, message) => body(field)
        .optional()
        .isFloat({ min: 0 }).withMessage(message || `${field} يجب أن يكون رقماً موجباً`),

    positiveNumberRequired: (field, message) => body(field)
        .notEmpty().withMessage(`${field} مطلوب`)
        .isFloat({ min: 0 }).withMessage(message || `${field} يجب أن يكون رقماً موجباً`),

    integer: (field, message) => body(field)
        .optional()
        .isInt().withMessage(message || `${field} يجب أن يكون رقماً صحيحاً`)
        .toInt(),

    integerRequired: (field, message) => body(field)
        .notEmpty().withMessage(`${field} مطلوب`)
        .isInt().withMessage(message || `${field} يجب أن يكون رقماً صحيحاً`)
        .toInt(),

    // Price validator (common in POS)
    price: body('price')
        .notEmpty().withMessage('السعر مطلوب')
        .isFloat({ min: 0 }).withMessage('السعر يجب أن يكون رقماً موجباً'),

    priceOptional: body('price')
        .optional()
        .isFloat({ min: 0 }).withMessage('السعر يجب أن يكون رقماً موجباً'),

    // Quantity validator
    quantity: (field = 'quantity') => body(field)
        .notEmpty().withMessage('الكمية مطلوبة')
        .isFloat({ min: 0 }).withMessage('الكمية يجب أن تكون رقماً موجباً'),

    quantityOptional: (field = 'quantity') => body(field)
        .optional()
        .isFloat({ min: 0 }).withMessage('الكمية يجب أن تكون رقماً موجباً'),

    // Email validator
    email: body('email')
        .optional()
        .isEmail().withMessage('البريد الإلكتروني غير صالح')
        .normalizeEmail(),

    emailRequired: body('email')
        .notEmpty().withMessage('البريد الإلكتروني مطلوب')
        .isEmail().withMessage('البريد الإلكتروني غير صالح')
        .normalizeEmail(),

    // Phone validator
    phone: body('phone')
        .optional()
        .matches(/^[\d\s\-\+\(\)]+$/).withMessage('رقم الهاتف غير صالح')
        .isLength({ min: 8, max: 20 }).withMessage('رقم الهاتف يجب أن يكون بين 8 و 20 رقم'),

    phoneRequired: body('phone')
        .notEmpty().withMessage('رقم الهاتف مطلوب')
        .matches(/^[\d\s\-\+\(\)]+$/).withMessage('رقم الهاتف غير صالح')
        .isLength({ min: 8, max: 20 }).withMessage('رقم الهاتف يجب أن يكون بين 8 و 20 رقم'),

    // Boolean validator
    boolean: (field) => body(field)
        .optional()
        .isBoolean().withMessage(`${field} يجب أن يكون قيمة منطقية (true/false)`),

    booleanRequired: (field) => body(field)
        .notEmpty().withMessage(`${field} مطلوب`)
        .isBoolean().withMessage(`${field} يجب أن يكون قيمة منطقية (true/false)`),

    // Enum validator
    enum: (field, values, message) => body(field)
        .optional()
        .isIn(values).withMessage(message || `${field} يجب أن يكون أحد القيم: ${values.join(', ')}`),

    enumRequired: (field, values, message) => body(field)
        .notEmpty().withMessage(`${field} مطلوب`)
        .isIn(values).withMessage(message || `${field} يجب أن يكون أحد القيم: ${values.join(', ')}`),

    // URL validator
    url: (field) => body(field)
        .optional()
        .isURL().withMessage('الرابط غير صالح'),

    // Array validator
    array: (field) => body(field)
        .optional()
        .isArray().withMessage(`${field} يجب أن يكون مصفوفة`),

    arrayRequired: (field) => body(field)
        .notEmpty().withMessage(`${field} مطلوب`)
        .isArray().withMessage(`${field} يجب أن يكون مصفوفة`),

    arrayNotEmpty: (field) => body(field)
        .notEmpty().withMessage(`${field} مطلوب`)
        .isArray({ min: 1 }).withMessage(`${field} يجب أن يحتوي على عنصر واحد على الأقل`),

    // JSON validator
    json: (field) => body(field)
        .optional()
        .custom((value) => {
            if (typeof value === 'object') return true;
            try {
                JSON.parse(value);
                return true;
            } catch {
                return false;
            }
        }).withMessage(`${field} يجب أن يكون JSON صالح`),

    // Password validator
    password: body('password')
        .notEmpty().withMessage('كلمة المرور مطلوبة')
        .isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),

    newPassword: body('newPassword')
        .notEmpty().withMessage('كلمة المرور الجديدة مطلوبة')
        .isLength({ min: 6 }).withMessage('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'),

    // Username validator
    username: body('username')
        .notEmpty().withMessage('اسم المستخدم مطلوب')
        .isLength({ min: 3, max: 50 }).withMessage('اسم المستخدم يجب أن يكون بين 3 و 50 حرف')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('اسم المستخدم يجب أن يحتوي على أحرف وأرقام و _ فقط')
        .trim(),

    // Arabic name validators
    nameAr: body('name_ar')
        .notEmpty().withMessage('الاسم بالعربية مطلوب')
        .isLength({ min: 2, max: 100 }).withMessage('الاسم يجب أن يكون بين 2 و 100 حرف')
        .trim(),

    nameArOptional: body('name_ar')
        .optional()
        .isLength({ min: 2, max: 100 }).withMessage('الاسم يجب أن يكون بين 2 و 100 حرف')
        .trim(),

    nameEn: body('name_en')
        .optional()
        .isLength({ max: 100 }).withMessage('الاسم يجب ألا يتجاوز 100 حرف')
        .trim(),

    // Notes/description validator
    notes: body('notes')
        .optional()
        .isLength({ max: 1000 }).withMessage('الملاحظات يجب ألا تتجاوز 1000 حرف')
        .trim(),

    description: (field = 'description') => body(field)
        .optional()
        .isLength({ max: 2000 }).withMessage('الوصف يجب ألا يتجاوز 2000 حرف')
        .trim(),

    // Address validator
    address: body('address')
        .optional()
        .isLength({ max: 500 }).withMessage('العنوان يجب ألا يتجاوز 500 حرف')
        .trim()
};

/**
 * Route-specific validation chains
 */
const routeValidators = {
    // Auth routes
    login: [
        body('username').notEmpty().withMessage('اسم المستخدم مطلوب').trim(),
        body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
    ],

    // Menu routes
    createMenuItem: [
        commonValidators.nameAr,
        commonValidators.nameEn,
        commonValidators.price,
        commonValidators.uuid('category_id'),
        commonValidators.description('description_ar'),
        commonValidators.description('description_en'),
        commonValidators.url('image_url'),
        commonValidators.integer('display_order'),
        commonValidators.boolean('is_available')
    ],

    // Order routes
    createOrder: [
        commonValidators.enumRequired('order_type', ['walkin', 'online', 'delivery', 'dine_in', 'takeaway'], 'نوع الطلب غير صالح'),
        commonValidators.arrayNotEmpty('items'),
        body('items.*.menu_id').notEmpty().withMessage('معرف العنصر مطلوب'),
        body('items.*.quantity').isInt({ min: 1 }).withMessage('الكمية يجب أن تكون رقماً موجباً')
    ],

    // Customer routes
    createCustomer: [
        commonValidators.phoneRequired,
        body('name').optional().isLength({ max: 100 }).trim(),
        commonValidators.email,
        commonValidators.address
    ],

    // User routes
    createUser: [
        commonValidators.username,
        commonValidators.password,
        commonValidators.nameAr,
        commonValidators.nameEn,
        commonValidators.enumRequired('role', USER_ALLOWED_ROLES, 'الدور غير صالح'),
        commonValidators.uuid('branch_id')
    ]
};

module.exports = {
    commonValidators,
    routeValidators,
    body,
    param,
    query
};
