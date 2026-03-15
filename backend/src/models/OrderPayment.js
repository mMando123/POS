const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * OrderPayment Model
 * Stores payment lines per order to support split tender (cash + card + online).
 */
const OrderPayment = sequelize.define('OrderPayment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    order_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    payment_method: {
        type: DataTypes.ENUM('cash', 'card', 'online'),
        allowNull: false
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    reference: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    processed_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'order_payments',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['order_id'], name: 'order_payments_order_idx' },
        { fields: ['shift_id'], name: 'order_payments_shift_idx' },
        { fields: ['branch_id'], name: 'order_payments_branch_idx' },
        { fields: ['payment_method'], name: 'order_payments_method_idx' },
        { fields: ['created_at'], name: 'order_payments_created_idx' }
    ]
})

module.exports = OrderPayment

