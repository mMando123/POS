const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * PriceList Model
 * Supports branch-scoped and global price lists with activation windows.
 */
const PriceList = sequelize.define('PriceList', {
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
        comment: 'NULL = global list, UUID = branch-specific list'
    },
    priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    auto_apply: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
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
    tableName: 'price_lists',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['branch_id'], name: 'price_lists_branch_idx' },
        { fields: ['is_active'], name: 'price_lists_active_idx' },
        { fields: ['priority'], name: 'price_lists_priority_idx' },
        { fields: ['starts_at', 'ends_at'], name: 'price_lists_window_idx' }
    ]
})

module.exports = PriceList

