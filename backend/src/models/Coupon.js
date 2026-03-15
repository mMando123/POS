const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * Coupon Model
 * Lightweight pricing engine entry for POS (promo code support).
 */
const Coupon = sequelize.define('Coupon', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    name: {
        type: DataTypes.STRING(120),
        allowNull: false
    },
    discount_type: {
        type: DataTypes.ENUM('percent', 'fixed'),
        allowNull: false,
        defaultValue: 'percent'
    },
    discount_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    min_order_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    max_discount_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    starts_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    ends_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    usage_limit: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    used_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'coupons',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['code'], name: 'coupons_code_idx', unique: true },
        { fields: ['branch_id'], name: 'coupons_branch_idx' },
        { fields: ['is_active'], name: 'coupons_active_idx' },
        { fields: ['starts_at', 'ends_at'], name: 'coupons_window_idx' }
    ]
})

module.exports = Coupon

