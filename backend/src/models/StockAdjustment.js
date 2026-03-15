const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * StockAdjustment Model - For manual inventory corrections
 */
const StockAdjustment = sequelize.define('StockAdjustment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    adjustment_number: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    warehouse_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    adjustment_type: {
        type: DataTypes.ENUM('damage', 'loss', 'theft', 'count', 'expired', 'other'),
        allowNull: false
    },
    quantity_before: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    quantity_change: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Positive for increase, negative for decrease'
    },
    quantity_after: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: false
    },
    approved_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    approved_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'stock_adjustments',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['adjustment_number'],
            name: 'adjustment_number_unique'
        },
        {
            fields: ['warehouse_id'],
            name: 'adjustment_warehouse_idx'
        },
        {
            fields: ['menu_id'],
            name: 'adjustment_menu_idx'
        },
        {
            fields: ['status'],
            name: 'adjustment_status_idx'
        }
    ]
})

module.exports = StockAdjustment
