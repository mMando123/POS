const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * PromotionRule Model
 * Flexible order-level or item-level promotions.
 */
const PromotionRule = sequelize.define('PromotionRule', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(120),
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'NULL = global promotion'
    },
    applies_to: {
        type: DataTypes.ENUM('order', 'item'),
        allowNull: false,
        defaultValue: 'order'
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Required when applies_to = item for item-specific rule'
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
    min_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    max_discount_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    stackable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    starts_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    ends_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    }
}, {
    tableName: 'promotion_rules',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['branch_id'], name: 'promotion_rules_branch_idx' },
        { fields: ['menu_id'], name: 'promotion_rules_menu_idx' },
        { fields: ['is_active'], name: 'promotion_rules_active_idx' },
        { fields: ['priority'], name: 'promotion_rules_priority_idx' },
        { fields: ['starts_at', 'ends_at'], name: 'promotion_rules_window_idx' }
    ]
})

module.exports = PromotionRule

