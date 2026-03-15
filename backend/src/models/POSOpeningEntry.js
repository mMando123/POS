const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * POS Opening Entry
 * Formal opening artifact for POS sessions (mapped to a shift).
 */
const POSOpeningEntry = sequelize.define('POSOpeningEntry', {
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
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    opening_cash: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('open', 'closed'),
        allowNull: false,
        defaultValue: 'open'
    },
    opened_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'pos_opening_entries',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['shift_id'], name: 'pos_open_shift_idx', unique: true },
        { fields: ['branch_id'], name: 'pos_open_branch_idx' },
        { fields: ['user_id'], name: 'pos_open_user_idx' }
    ]
})

module.exports = POSOpeningEntry

