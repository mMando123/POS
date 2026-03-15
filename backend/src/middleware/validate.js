const { validationResult } = require('express-validator');
const { sanitizeString, escapeHtml } = require('./sanitize');

/**
 * Express-validator error handler middleware
 * Collects validation errors and returns a formatted response
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'خطأ في البيانات المدخلة',
            errors: errors.array().map(e => ({
                field: e.path,
                message: e.msg,
                value: typeof e.value === 'string' ? escapeHtml(e.value?.substring(0, 50)) : undefined
            }))
        });
    }
    next();
};

/**
 * Custom validation error formatter
 * Use this for consistent error messages across the API
 */
const formatValidationError = (field, message) => ({
    field,
    message
});

/**
 * Creates a validation chain that rejects if value looks malicious
 * @param {string} fieldName - The field to validate
 * @returns {function} - Express middleware
 */
const rejectMaliciousInput = (fieldName) => (req, res, next) => {
    const value = req.body?.[fieldName] || req.query?.[fieldName] || req.params?.[fieldName];

    if (typeof value === 'string') {
        // Check for obvious attack patterns
        const dangerousPatterns = [
            /<script>/i,
            /javascript:/i,
            /onerror=/i,
            /onload=/i,
            /eval\(/i,
            /document\./i,
            /window\./i
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(value)) {
                return res.status(400).json({
                    success: false,
                    message: 'تم رفض الإدخال لأسباب أمنية',
                    field: fieldName
                });
            }
        }
    }

    next();
};

module.exports = {
    validate,
    formatValidationError,
    rejectMaliciousInput,
    sanitizeString
};
