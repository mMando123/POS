const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')
const crypto = require('crypto')

const RefreshToken = sequelize.define('RefreshToken', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    token: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false
    },
    is_revoked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // Track device/session info for security
    device_info: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
    },
    last_used_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'refresh_tokens',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['token'] },
        { fields: ['user_id'] },
        { fields: ['expires_at'] }
    ]
})

/**
 * Generate a cryptographically secure refresh token
 */
RefreshToken.generateToken = () => {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * Create a new refresh token for a user
 */
RefreshToken.createForUser = async (userId, deviceInfo = null, ipAddress = null) => {
    // Get refresh token expiry from env (default 7 days)
    const expiryDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 7
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiryDays)

    const token = RefreshToken.generateToken()

    const refreshToken = await RefreshToken.create({
        token,
        user_id: userId,
        expires_at: expiresAt,
        device_info: deviceInfo,
        ip_address: ipAddress
    })

    return {
        token,
        expiresAt,
        id: refreshToken.id
    }
}

/**
 * Validate and get refresh token
 */
RefreshToken.validateToken = async (token) => {
    const refreshToken = await RefreshToken.findOne({
        where: {
            token,
            is_revoked: false
        }
    })

    if (!refreshToken) {
        return { valid: false, error: 'Token not found or revoked' }
    }

    if (new Date() > new Date(refreshToken.expires_at)) {
        return { valid: false, error: 'Token expired' }
    }

    // Update last used timestamp
    await refreshToken.update({ last_used_at: new Date() })

    return { valid: true, refreshToken }
}

/**
 * Revoke all tokens for a user (logout from all devices)
 */
RefreshToken.revokeAllForUser = async (userId) => {
    await RefreshToken.update(
        { is_revoked: true },
        { where: { user_id: userId, is_revoked: false } }
    )
}

/**
 * Revoke a specific token
 */
RefreshToken.revokeToken = async (token) => {
    await RefreshToken.update(
        { is_revoked: true },
        { where: { token } }
    )
}

/**
 * Clean up expired tokens (run periodically)
 */
RefreshToken.cleanupExpired = async () => {
    const { Op } = require('sequelize')
    const deleted = await RefreshToken.destroy({
        where: {
            [Op.or]: [
                { expires_at: { [Op.lt]: new Date() } },
                { is_revoked: true }
            ]
        }
    })
    return deleted
}

module.exports = RefreshToken
