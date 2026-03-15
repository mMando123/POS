const jwt = require('jsonwebtoken')
const { User } = require('../models')
const { hasPermission, getPermissions, PERMISSIONS } = require('../config/permissions')

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'غير مصرح - يرجى تسجيل الدخول'
            })
        }

        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        // Get user from database
        const user = await User.findOne({
            where: { id: decoded.userId, is_active: true },
            attributes: ['id', 'username', 'role', 'name_ar', 'branch_id', 'default_warehouse_id']
        })

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود'
            })
        }

        // Attach user info and permissions to request
        req.user = {
            userId: user.id,
            username: user.username,
            role: user.role,
            branchId: user.branch_id,
            defaultWarehouseId: user.default_warehouse_id,
            permissions: getPermissions(user.role)
        }
        next()
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'انتهت صلاحية الجلسة',
                code: 'TOKEN_EXPIRED'
            })
        }
        return res.status(401).json({
            success: false,
            message: 'رمز غير صالح'
        })
    }
}

/**
 * Role-based authorization (legacy - kept for compatibility)
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بهذا الإجراء'
            })
        }
        next()
    }
}

/**
 * Permission-based authorization
 * Checks if user has required permission(s)
 * @param {...string} requiredPermissions - Required permission(s)
 * @returns {Function} Express middleware
 * 
 * Usage:
 *   router.post('/orders', authenticate, requirePermission(PERMISSIONS.ORDERS_CREATE), handler)
 *   router.delete('/menu/:id', authenticate, requirePermission(PERMISSIONS.MENU_DELETE), handler)
 */
const requirePermission = (...requiredPermissions) => {
    return (req, res, next) => {
        // User must be authenticated first
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'غير مصرح - يرجى تسجيل الدخول'
            })
        }

        const userRole = req.user.role

        // Check if user has ALL required permissions
        const hasAllPermissions = requiredPermissions.every(permission =>
            hasPermission(userRole, permission)
        )

        if (!hasAllPermissions) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية للقيام بهذا الإجراء',
                required: requiredPermissions,
                userRole: userRole
            })
        }

        next()
    }
}

/**
 * Check if user has ANY of the specified permissions
 * @param {...string} permissions - Permissions to check (OR logic)
 */
const requireAnyPermission = (...permissions) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'غير مصرح - يرجى تسجيل الدخول'
            })
        }

        const userRole = req.user.role
        const hasAnyPermission = permissions.some(permission =>
            hasPermission(userRole, permission)
        )

        if (!hasAnyPermission) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية للقيام بهذا الإجراء'
            })
        }

        next()
    }
}

/**
 * Optional authentication - doesn't fail if no token
 * Useful for routes that work differently for authenticated vs anonymous users
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            req.user = null
            return next()
        }

        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        const user = await User.findOne({
            where: { id: decoded.userId, is_active: true },
            attributes: ['id', 'username', 'role', 'name_ar', 'branch_id', 'default_warehouse_id']
        })

        if (user) {
            req.user = {
                userId: user.id,
                username: user.username,
                role: user.role,
                branchId: user.branch_id,
                defaultWarehouseId: user.default_warehouse_id,
                permissions: getPermissions(user.role)
            }
        } else {
            req.user = null
        }

        next()
    } catch (error) {
        req.user = null
        next()
    }
}

module.exports = {
    authenticate,
    authorize,
    requirePermission,
    requireAnyPermission,
    optionalAuth,
    hasPermission, // Re-export for direct usage in routes
    PERMISSIONS // Re-export for convenience
}
