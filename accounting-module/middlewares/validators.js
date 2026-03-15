/**
 * Input Validation Middleware
 * Prevents malicious or malformed data from reaching services.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate that :companyId param is a valid UUID
 */
function validateCompanyId(req, res, next) {
    const { companyId } = req.params;
    if (!companyId || !UUID_REGEX.test(companyId)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid companyId format. Must be a valid UUID.'
        });
    }
    next();
}

/**
 * Validate Journal Entry creation payload
 */
function validateJournalEntry(req, res, next) {
    const { entry_date, lines } = req.body;
    const errors = [];

    // entry_date
    if (!entry_date) {
        errors.push('entry_date is required.');
    } else if (!DATE_REGEX.test(entry_date)) {
        errors.push('entry_date must be in YYYY-MM-DD format.');
    } else {
        const d = new Date(entry_date);
        if (isNaN(d.getTime())) errors.push('entry_date is not a valid date.');
    }

    // lines
    if (!lines || !Array.isArray(lines)) {
        errors.push('lines must be an array.');
    } else if (lines.length < 2) {
        errors.push('At least 2 lines are required for double-entry.');
    } else {
        lines.forEach((line, idx) => {
            if (!line.account_id || !UUID_REGEX.test(line.account_id)) {
                errors.push(`Line ${idx + 1}: account_id must be a valid UUID.`);
            }
            const debit = parseFloat(line.debit);
            const credit = parseFloat(line.credit);
            if (isNaN(debit) || debit < 0) errors.push(`Line ${idx + 1}: debit must be a non-negative number.`);
            if (isNaN(credit) || credit < 0) errors.push(`Line ${idx + 1}: credit must be a non-negative number.`);
            if (line.cost_center_id && !UUID_REGEX.test(line.cost_center_id)) {
                errors.push(`Line ${idx + 1}: cost_center_id must be a valid UUID.`);
            }
            if (line.party_type && !['Customer', 'Supplier', 'Employee'].includes(line.party_type)) {
                errors.push(`Line ${idx + 1}: party_type must be Customer, Supplier, or Employee.`);
            }
            if (line.party_type && (!line.party_id || !UUID_REGEX.test(line.party_id))) {
                errors.push(`Line ${idx + 1}: party_id is required when party_type is specified.`);
            }
        });
    }

    // status whitelist (prevent mass assignment of arbitrary statuses)
    if (req.body.status && !['draft', 'posted'].includes(req.body.status)) {
        errors.push('status must be either "draft" or "posted".');
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }
    next();
}

/**
 * Validate Account creation/update payload
 */
function validateAccount(req, res, next) {
    const { code, name } = req.body;
    const errors = [];

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
        errors.push('code is required.');
    } else if (code.length > 30) {
        errors.push('code must be 30 characters or less.');
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        errors.push('name is required.');
    }

    if (req.body.root_type && !['Asset', 'Liability', 'Equity', 'Income', 'Expense'].includes(req.body.root_type)) {
        errors.push('root_type must be Asset, Liability, Equity, Income, or Expense.');
    }

    if (req.body.normal_balance && !['debit', 'credit'].includes(req.body.normal_balance)) {
        errors.push('normal_balance must be debit or credit.');
    }

    if (req.body.parent_id && !UUID_REGEX.test(req.body.parent_id)) {
        errors.push('parent_id must be a valid UUID.');
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }
    next();
}

/**
 * Sanitize body: strip any unknown/dangerous fields
 */
function sanitizeBody(allowedFields) {
    return (req, res, next) => {
        if (req.body && typeof req.body === 'object') {
            const sanitized = {};
            for (const key of allowedFields) {
                if (req.body[key] !== undefined) {
                    sanitized[key] = req.body[key];
                }
            }
            req.body = sanitized;
        }
        next();
    };
}

module.exports = {
    validateCompanyId,
    validateJournalEntry,
    validateAccount,
    sanitizeBody
};
