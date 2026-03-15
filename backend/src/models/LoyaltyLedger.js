const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * LoyaltyLedger Model
 * Immutable point movements for each customer.
 */
const LoyaltyLedger = sequelize.define('LoyaltyLedger', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    customer_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    order_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    entry_type: {
        type: DataTypes.ENUM('earn', 'redeem', 'adjust'),
        allowNull: false
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Positive for earn, negative for redeem/negative adjustments'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'loyalty_ledger',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['customer_id'], name: 'loyalty_ledger_customer_idx' },
        { fields: ['order_id'], name: 'loyalty_ledger_order_idx' },
        { fields: ['branch_id'], name: 'loyalty_ledger_branch_idx' },
        { fields: ['entry_type'], name: 'loyalty_ledger_type_idx' },
        { fields: ['created_at'], name: 'loyalty_ledger_created_idx' }
    ]
})

module.exports = LoyaltyLedger

