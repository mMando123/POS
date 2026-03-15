/**
 * Discount Control Middleware
 * 
 * CRITICAL FINANCIAL SAFETY COMPONENT
 * 
 * Prevents discount abuse by enforcing:
 * 1. Role-based maximum discount percentages
 * 2. Mandatory reason logging for all discounts
 * 3. Admin approval requirement for discounts above threshold
 * 4. Full audit trail for every discount application
 * 
 * Without this middleware, a cashier could apply a 99.99% discount
 * and effectively give away products. This is the #1 fraud vector in POS.
 */

const AuditService = require('../services/auditService')
const logger = require('../services/logger')

/**
 * Role-based discount limits (percentage of subtotal)
 * These can be overridden via system settings in the future
 */
const DISCOUNT_LIMITS = {
    cashier: 10,      // Max 10% discount
    supervisor: 20,   // Max 20% discount  
    manager: 30,      // Max 30% discount
    admin: 100         // Admin can apply any discount
}

/**
 * Threshold above which manager/admin approval is required (percentage)
 */
const APPROVAL_THRESHOLD = 15

/**
 * Validate and control discount on order creation/modification
 * 
 * Expects req.body to contain:
 *   - discount (number, optional) — the discount amount
 *   - discount_reason (string, required if discount > 0) — why the discount is applied
 *   - discount_approved_by (string, optional) — manager/admin userId who approved
 * 
 * Expects req.user to contain:
 *   - userId, role
 * 
 * This middleware MUST be placed AFTER authenticate middleware.
 */
function validateDiscount(req, res, next) {
    try {
        const discount = parseFloat(req.body.discount) || 0
        const subtotal = parseFloat(req.body._calculated_subtotal) || 0

        // No discount applied — pass through
        if (discount <= 0) {
            req.body.discount = 0
            return next()
        }

        // Negative discount is forbidden (would add to total)
        if (discount < 0) {
            return res.status(400).json({
                success: false,
                message: 'قيمة الخصم لا يمكن أن تكون سالبة',
                code: 'NEGATIVE_DISCOUNT'
            })
        }

        const userRole = req.user?.role || 'cashier'
        const maxDiscountPercent = DISCOUNT_LIMITS[userRole] || DISCOUNT_LIMITS.cashier

        // Calculate discount as percentage of subtotal
        let discountPercent = 0
        if (subtotal > 0) {
            discountPercent = (discount / subtotal) * 100
        }

        // Check role-based ceiling
        if (discountPercent > maxDiscountPercent) {
            return res.status(403).json({
                success: false,
                message: `صلاحيتك تسمح بخصم حتى ${maxDiscountPercent}% فقط. الخصم المطلوب: ${discountPercent.toFixed(1)}%`,
                code: 'DISCOUNT_EXCEEDS_ROLE_LIMIT',
                details: {
                    requested_percent: discountPercent.toFixed(1),
                    max_allowed_percent: maxDiscountPercent,
                    role: userRole
                }
            })
        }

        // Discount cannot exceed subtotal
        if (discount > subtotal && subtotal > 0) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن أن يتجاوز الخصم إجمالي المبلغ الفرعي',
                code: 'DISCOUNT_EXCEEDS_SUBTOTAL'
            })
        }

        // Require reason for any discount
        const discountReason = req.body.discount_reason || ''
        if (discount > 0 && (!discountReason || discountReason.trim().length < 3)) {
            return res.status(400).json({
                success: false,
                message: 'يجب تحديد سبب الخصم (3 أحرف على الأقل)',
                code: 'DISCOUNT_REASON_REQUIRED'
            })
        }

        // Check if manager/admin approval is needed
        if (discountPercent > APPROVAL_THRESHOLD && userRole === 'cashier') {
            const approvedBy = req.body.discount_approved_by
            if (!approvedBy) {
                return res.status(403).json({
                    success: false,
                    message: `الخصم أعلى من ${APPROVAL_THRESHOLD}% يتطلب موافقة المدير`,
                    code: 'DISCOUNT_APPROVAL_REQUIRED',
                    details: {
                        requested_percent: discountPercent.toFixed(1),
                        approval_threshold: APPROVAL_THRESHOLD
                    }
                })
            }
            // Store approval info for audit
            req._discountApproval = {
                approvedBy,
                approvedAt: new Date()
            }
        }

        // Attach validated discount info to request for downstream use
        req._validatedDiscount = {
            amount: Math.round(discount * 100) / 100,
            percent: Math.round(discountPercent * 100) / 100,
            reason: discountReason.trim(),
            appliedBy: req.user?.userId,
            appliedByRole: userRole,
            approvedBy: req.body.discount_approved_by || null
        }

        // Audit log the discount (fire-and-forget)
        AuditService.log({
            userId: req.user?.userId,
            branchId: req.user?.branchId,
            category: 'order',
            action: 'discount_applied',
            entityType: 'Order',
            entityId: null, // Will be filled after order creation
            metadata: {
                discount_amount: discount,
                discount_percent: discountPercent.toFixed(1),
                discount_reason: discountReason.trim(),
                applied_by_role: userRole,
                approved_by: req.body.discount_approved_by || null,
                subtotal: subtotal,
                ip_address: req.ip || req.connection?.remoteAddress
            }
        })

        next()
    } catch (error) {
        logger.error('Discount validation error:', error)
        // On error, block the discount for safety
        return res.status(500).json({
            success: false,
            message: 'خطأ في التحقق من الخصم',
            code: 'DISCOUNT_VALIDATION_ERROR'
        })
    }
}

module.exports = { validateDiscount, DISCOUNT_LIMITS, APPROVAL_THRESHOLD }
