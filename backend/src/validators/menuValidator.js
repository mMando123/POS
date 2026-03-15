const { body } = require('express-validator')

const ALLOWED_UOM = ['piece', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'portion']
const CUSTOM_UOM_REGEX = /^[\p{L}\p{N}_\-/\s]+$/u

const isValidUomValue = (value, maxLength = 20) => {
    const raw = String(value || '').trim()
    if (!raw) return false
    if (raw.length > maxLength) return false
    if (ALLOWED_UOM.includes(raw)) return true
    return CUSTOM_UOM_REGEX.test(raw)
}

const validateUomField = (field, maxLength, message) =>
    body(field)
        .optional()
        .custom((value) => {
            if (!isValidUomValue(value, maxLength)) {
                throw new Error(message)
            }
            return true
        })

exports.createMenuValidator = [
    body('name_ar')
        .trim()
        .notEmpty().withMessage('اسم العنصر بالعربية مطلوب')
        .isLength({ max: 100 }).withMessage('الاسم طويل جداً'),

    body('price')
        .isFloat({ min: 0 }).withMessage('السعر يجب أن يكون رقمًا موجبًا أو صفر'),

    body('cost_price')
        .optional()
        .isFloat({ min: 0 }).withMessage('سعر التكلفة يجب أن يكون رقمًا موجبًا أو صفر'),

    body('category_id')
        .notEmpty().withMessage('التصنيف مطلوب')
        .isUUID().withMessage('معرف التصنيف غير صالح'),

    body('is_available')
        .optional()
        .isBoolean().withMessage('حالة التوفر غير صالحة'),

    validateUomField('unit_of_measure', 20, 'وحدة القياس غير صالحة'),

    body('ingredients')
        .optional()
        .isArray().withMessage('ingredients يجب أن تكون مصفوفة'),

    body('ingredients.*.ingredient_menu_id')
        .optional()
        .isUUID().withMessage('ingredient_menu_id غير صالح'),

    body('ingredients.*.quantity')
        .optional()
        .isFloat({ min: 0.001 }).withMessage('كمية المكون يجب أن تكون أكبر من صفر'),

    validateUomField('ingredients.*.unit', 30, 'وحدة قياس المكون غير صالحة'),

    body('composite_mode')
        .optional()
        .isIn(['on_sale', 'on_build']).withMessage('وضع الصنف التجميعي غير صالح')
]

exports.updateMenuValidator = [
    body('name_ar')
        .optional()
        .trim()
        .notEmpty().withMessage('اسم العنصر بالعربية لا يمكن أن يكون فارغًا'),

    body('price')
        .optional()
        .isFloat({ min: 0 }).withMessage('السعر يجب أن يكون رقمًا موجبًا أو صفر'),

    body('cost_price')
        .optional()
        .isFloat({ min: 0 }).withMessage('سعر التكلفة يجب أن يكون رقمًا موجبًا أو صفر'),

    body('category_id')
        .optional()
        .isUUID().withMessage('معرف التصنيف غير صالح'),

    validateUomField('unit_of_measure', 20, 'وحدة القياس غير صالحة'),

    body('ingredients')
        .optional()
        .isArray().withMessage('ingredients يجب أن تكون مصفوفة'),

    body('ingredients.*.ingredient_menu_id')
        .optional()
        .isUUID().withMessage('ingredient_menu_id غير صالح'),

    body('ingredients.*.quantity')
        .optional()
        .isFloat({ min: 0.001 }).withMessage('كمية المكون يجب أن تكون أكبر من صفر'),

    validateUomField('ingredients.*.unit', 30, 'وحدة قياس المكون غير صالحة'),

    body('composite_mode')
        .optional()
        .isIn(['on_sale', 'on_build']).withMessage('وضع الصنف التجميعي غير صالح')
]
