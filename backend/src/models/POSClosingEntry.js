const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * POS Closing Entry
 * Formal closing artifact for POS sessions (mapped to a shift).
 */
const POSClosingEntry = sequelize.define('POSClosingEntry', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    },
    opening_entry_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    closed_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    expected_cash: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    actual_cash: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    variance: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    gross_sales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    cash_sales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    card_sales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    online_sales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    order_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    closed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'pos_closing_entries',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['shift_id'], name: 'pos_close_shift_idx', unique: true },
        { fields: ['branch_id'], name: 'pos_close_branch_idx' },
        { fields: ['closed_by'], name: 'pos_close_user_idx' }
    ]
})

module.exports = POSClosingEntry

