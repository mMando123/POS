/**
 * Global Input Sanitization Middleware
 * Prevents XSS attacks and sanitizes all incoming data
 * Works automatically on all requests without breaking existing functionality
 */

const sanitizeHtml = require('sanitize-html');
const validator = require('validator');

// Configuration for sanitize-html (allows basic formatting, removes scripts)
const sanitizeConfig = {
    allowedTags: ['b', 'i', 'em', 'strong', 'br'],
    allowedAttributes: {},
    disallowedTagsMode: 'escape'
};

/**
 * Recursively sanitize a value
 * @param {any} value - The value to sanitize
 * @param {string} key - The key name (for special handling)
 * @returns {any} - Sanitized value
 */
function sanitizeValue(value, key = '') {
    // Skip null/undefined
    if (value === null || value === undefined) {
        return value;
    }

    // Handle strings
    if (typeof value === 'string') {
        // Skip password fields (they need special characters)
        if (key.toLowerCase().includes('password')) {
            return value;
        }

        // Skip token fields
        if (key.toLowerCase().includes('token')) {
            return value;
        }

        // Trim whitespace
        let sanitized = value.trim();

        // Remove null bytes (SQL injection technique)
        sanitized = sanitized.replace(/\0/g, '');

        // Sanitize HTML to prevent XSS
        sanitized = sanitizeHtml(sanitized, sanitizeConfig);

        // Escape special HTML entities that might have been missed
        // but only for display-oriented fields, not for data fields

        return sanitized;
    }

    // Handle arrays
    if (Array.isArray(value)) {
        return value.map((item, index) => sanitizeValue(item, `${key}[${index}]`));
    }

    // Handle objects
    if (typeof value === 'object') {
        const sanitized = {};
        for (const [k, v] of Object.entries(value)) {
            sanitized[k] = sanitizeValue(v, k);
        }
        return sanitized;
    }

    // Numbers, booleans, etc. - return as-is
    return value;
}

/**
 * Validate common patterns to reject obviously malicious input
 * @param {any} value - Value to check
 * @param {string} key - Field name
 * @returns {object} - { valid: boolean, reason: string }
 */
function validateInput(value, key = '') {
    if (typeof value !== 'string') {
        return { valid: true };
    }

    // Skip validation for password and token fields
    if (key.toLowerCase().includes('password') || key.toLowerCase().includes('token')) {
        return { valid: true };
    }

    // Check for SQL injection patterns (extra layer - Sequelize already handles this)
    const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b.*\b(FROM|INTO|TABLE|DATABASE)\b)/i,
        /('|")\s*(OR|AND)\s*('|"|\d)/i,
        /--\s*$/,
        /;\s*(DROP|DELETE|UPDATE|INSERT)/i
    ];

    for (const pattern of sqlPatterns) {
        if (pattern.test(value)) {
            return { valid: false, reason: `Suspicious SQL pattern detected in field: ${key}` };
        }
    }

    // Check for script injection
    if (/<script[\s\S]*?>[\s\S]*?<\/script>/i.test(value)) {
        return { valid: false, reason: `Script injection detected in field: ${key}` };
    }

    // Check for event handlers
    if (/\bon\w+\s*=/i.test(value)) {
        return { valid: false, reason: `Event handler injection detected in field: ${key}` };
    }

    return { valid: true };
}

/**
 * Recursively validate all values in an object
 * @param {any} obj - Object to validate
 * @param {string} prefix - Key prefix for nested objects
 * @returns {object} - { valid: boolean, errors: array }
 */
function validateObject(obj, prefix = '') {
    const errors = [];

    if (typeof obj === 'string') {
        const result = validateInput(obj, prefix);
        if (!result.valid) {
            errors.push(result.reason);
        }
        return { valid: errors.length === 0, errors };
    }

    if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            const result = validateObject(item, `${prefix}[${index}]`);
            errors.push(...result.errors);
        });
        return { valid: errors.length === 0, errors };
    }

    if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const result = validateObject(value, fullKey);
            errors.push(...result.errors);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Express middleware for sanitizing all incoming requests
 */
const sanitizeMiddleware = (req, res, next) => {
    try {
        // Validate body first (reject malicious input)
        if (req.body && typeof req.body === 'object') {
            const validation = validateObject(req.body, 'body');
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: 'تم رفض الطلب لأسباب أمنية',
                    errors: validation.errors
                });
            }
            req.body = sanitizeValue(req.body);
        }

        // Validate and sanitize query params
        if (req.query && typeof req.query === 'object') {
            const validation = validateObject(req.query, 'query');
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: 'تم رفض الطلب لأسباب أمنية',
                    errors: validation.errors
                });
            }
            req.query = sanitizeValue(req.query);
        }

        // Validate and sanitize URL params
        if (req.params && typeof req.params === 'object') {
            const validation = validateObject(req.params, 'params');
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: 'تم رفض الطلب لأسباب أمنية',
                    errors: validation.errors
                });
            }
            req.params = sanitizeValue(req.params);
        }

        next();
    } catch (error) {
        console.error('Sanitization error:', error);
        // Don't break the request on sanitization error
        next();
    }
};

/**
 * Utility function to manually sanitize a string
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return sanitizeHtml(str.trim(), sanitizeConfig);
};

/**
 * Utility function to validate email
 */
const isValidEmail = (email) => {
    return validator.isEmail(email || '');
};

/**
 * Utility function to validate phone number
 */
const isValidPhone = (phone) => {
    // Accept various phone formats
    return validator.isMobilePhone(phone || '', 'any', { strictMode: false });
};

/**
 * Utility function to validate UUID
 */
const isValidUUID = (uuid) => {
    return validator.isUUID(uuid || '');
};

/**
 * Utility function to escape HTML for safe display
 */
const escapeHtml = (str) => {
    if (typeof str !== 'string') return str;
    return validator.escape(str);
};

module.exports = {
    sanitizeMiddleware,
    sanitizeValue,
    sanitizeString,
    validateInput,
    isValidEmail,
    isValidPhone,
    isValidUUID,
    escapeHtml
};
