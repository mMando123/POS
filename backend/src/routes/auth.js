const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const { body } = require('express-validator')
const { validate } = require('../middleware/validate')
const { authenticate, optionalAuth } = require('../middleware/auth')
const { User, Branch, RefreshToken, Warehouse } = require('../models')
const { authLimiter } = require('../middleware/rateLimiter')
const logger = require('../services/logger')
const AuditService = require('../services/auditService')

const logAuthEvent = ({ req, action, user = null, username = null, metadata = null }) => {
    AuditService.log({
        req,
        category: 'auth',
        action,
        entityType: 'User',
        entityId: user?.id || null,
        userId: user?.id || null,
        username: user?.username || username || null,
        branchId: user?.branch_id || null,
        metadata
    })
}

// Login
router.post('/login', authLimiter, [
    body('username').notEmpty().withMessage('اسم المستخدم مطلوب'),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة'),
    validate
], async (req, res) => {
    try {
        const { username, password } = req.body

        const user = await User.findOne({
            where: { username, is_active: true },
            include: [
                { model: Branch, attributes: ['id', 'name_ar'] },
                { model: Warehouse, as: 'defaultWarehouse', attributes: ['id', 'name_ar', 'name_en', 'branch_id'], required: false }
            ]
        })

        if (!user) {
            logger.warn(`[AUTH FAILURE] Login failed for username: ${username} from IP: ${req.ip} - User not found`)
            logAuthEvent({
                req,
                action: 'login_failed_user_not_found',
                username,
                metadata: { attempted_username: username, reason: 'user_not_found' }
            })
            return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' })
        }

        const isValid = await user.validatePassword(password)
        if (!isValid) {
            logger.warn(`[AUTH FAILURE] Login failed for username: ${username} from IP: ${req.ip} - Invalid password`)
            logAuthEvent({
                req,
                action: 'login_failed_invalid_password',
                user,
                metadata: { attempted_username: username, reason: 'invalid_password' }
            })
            return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' })
        }

        const loginTime = new Date()
        await user.update({ last_login: loginTime })

        logAuthEvent({
            req,
            action: 'login_success',
            user,
            metadata: {
                role: user.role,
                login_time: loginTime
            }
        })

        // Generate Access Token (Short-lived)
        const accessToken = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                role: user.role,
                branchId: user.branch_id,
                defaultWarehouseId: user.default_warehouse_id || null
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
        )

        // Generate Refresh Token (Long-lived)
        const { token: refreshToken, expiresAt } = await RefreshToken.createForUser(
            user.id,
            req.headers['user-agent'],
            req.ip
        )

        res.json({
            message: 'تم تسجيل الدخول بنجاح',
            token: accessToken, // Backward compatibility
            accessToken,
            refreshToken,
            expiresIn: process.env.JWT_EXPIRES_IN || '15m',
            refreshTokenExpiresAt: expiresAt,
            user: {
                id: user.id,
                username: user.username,
                name_ar: user.name_ar,
                role: user.role,
                branch_id: user.branch_id,
                default_warehouse_id: user.default_warehouse_id || null,
                defaultWarehouse: user.defaultWarehouse || null,
                branch: user.Branch
            }
        })
    } catch (error) {
        logger.error('Login error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// Refresh Token
router.post('/refresh-token', [
    body('refreshToken').notEmpty().withMessage('Refresh Token مطلوب'),
    validate
], async (req, res) => {
    try {
        const { refreshToken } = req.body

        const { valid, error, refreshToken: tokenDoc } = await RefreshToken.validateToken(refreshToken)

        if (!valid) {
            logAuthEvent({
                req,
                action: 'refresh_token_failed',
                metadata: { reason: error || 'invalid_refresh_token' }
            })
            return res.status(401).json({ message: 'جلسة غير صالحة', error })
        }

        const user = await User.findByPk(tokenDoc.user_id)
        if (!user || !user.is_active) {
            logAuthEvent({
                req,
                action: 'refresh_token_failed_inactive_user',
                metadata: { user_id: tokenDoc.user_id }
            })
            return res.status(401).json({ message: 'المستخدم غير نشط' })
        }

        // Generate new Access Token
        const newAccessToken = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                role: user.role,
                branchId: user.branch_id,
                defaultWarehouseId: user.default_warehouse_id || null
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
        )

        logAuthEvent({
            req,
            action: 'refresh_token_success',
            user
        })

        res.json({
            token: newAccessToken,
            accessToken: newAccessToken,
            expiresIn: process.env.JWT_EXPIRES_IN || '15m'
        })

    } catch (error) {
        logger.error('Refresh token error:', error)
        res.status(500).json({ message: 'خطأ في تجديد الجلسة' })
    }
})

// Logout
router.post('/logout', optionalAuth, async (req, res) => {
    try {
        const { refreshToken } = req.body
        if (refreshToken) {
            await RefreshToken.revokeToken(refreshToken)
        }

        logAuthEvent({
            req,
            action: 'logout',
            user: req.user
                ? { id: req.user.userId, username: req.user.username, branch_id: req.user.branchId }
                : null,
            metadata: { has_refresh_token: Boolean(refreshToken) }
        })

        res.json({ message: 'تم تسجيل الخروج بنجاح' })
    } catch (error) {
        logger.error('Logout error:', error)
        res.status(500).json({ message: 'خطأ في تسجيل الخروج' })
    }
})

// Get current user
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.userId, {
            attributes: ['id', 'username', 'name_ar', 'name_en', 'email', 'role', 'branch_id', 'default_warehouse_id'],
            include: [
                { model: Branch, attributes: ['id', 'name_ar'] },
                { model: Warehouse, as: 'defaultWarehouse', attributes: ['id', 'name_ar', 'name_en', 'branch_id'], required: false }
            ]
        })

        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' })
        }

        res.json({ data: user })
    } catch (error) {
        logger.error('Get user error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// Update own profile (any authenticated user)
router.put('/update-profile', authenticate, [
    body('name_ar').optional().trim().notEmpty().withMessage('الاسم بالعربية لا يمكن أن يكون فارغًا'),
    body('name_en').optional().trim().notEmpty().withMessage('الاسم بالإنجليزية لا يمكن أن يكون فارغًا'),
    body('email').optional().isEmail().withMessage('البريد الإلكتروني غير صحيح'),
    validate
], async (req, res) => {
    try {
        const user = await User.findByPk(req.user.userId)
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' })
        }

        const { name_ar, name_en, email } = req.body

        const oldValue = {
            name_ar: user.name_ar,
            name_en: user.name_en,
            email: user.email
        }

        // Only allow updating safe fields (not role, branch, password, etc.)
        if (name_ar !== undefined) user.name_ar = name_ar
        if (name_en !== undefined) user.name_en = name_en
        if (email !== undefined) user.email = email

        await user.save()

        logAuthEvent({
            req,
            action: 'profile_updated',
            user,
            metadata: {
                old_value: oldValue,
                new_value: {
                    name_ar: user.name_ar,
                    name_en: user.name_en,
                    email: user.email
                }
            }
        })

        // Return updated user
        const updatedUser = await User.findByPk(user.id, {
            attributes: ['id', 'username', 'name_ar', 'name_en', 'email', 'role', 'branch_id', 'default_warehouse_id'],
            include: [
                { model: Branch, attributes: ['id', 'name_ar'] },
                { model: Warehouse, as: 'defaultWarehouse', attributes: ['id', 'name_ar', 'name_en', 'branch_id'], required: false }
            ]
        })

        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح',
            data: updatedUser
        })
    } catch (error) {
        logger.error('Update profile error:', error)
        res.status(500).json({ message: 'خطأ في تحديث الملف الشخصي' })
    }
})

// Change password
router.put('/change-password', authenticate, [
    body('currentPassword').notEmpty().withMessage('كلمة المرور الحالية مطلوبة'),
    body('newPassword').isLength({ min: 6 }).withMessage('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'),
    validate
], async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body

        const user = await User.findByPk(req.user.userId)
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' })
        }

        const isValid = await user.validatePassword(currentPassword)
        if (!isValid) {
            return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' })
        }

        user.password_hash = newPassword
        await user.save()

        logAuthEvent({
            req,
            action: 'password_changed',
            user,
            metadata: { changed_by_self: true }
        })

        res.json({ message: 'تم تغيير كلمة المرور بنجاح' })
    } catch (error) {
        logger.error('Change password error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

module.exports = router
