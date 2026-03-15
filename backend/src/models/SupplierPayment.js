const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * SupplierPayment Model - Tracks payments made to suppliers
 */
const SupplierPayment = sequelize.define('SupplierPayment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    payment_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    supplier_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Branch of payment transaction'
    },
    purchase_order_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Optional link to specific PO'
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: { min: 0 }
    },
    payment_account_code: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    payment_method: {
        type: DataTypes.ENUM('cash', 'bank_transfer', 'check', 'card'),
        allowNull: false
    },
    payment_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    reference: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Check number, transfer reference, etc.'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
        defaultValue: 'completed'
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: false
    }
}, {
    tableName: 'supplier_payments',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['payment_number'],
            name: 'supplier_payment_number_unique'
        },
        {
            fields: ['supplier_id'],
            name: 'supplier_payment_supplier_idx'
        },
        {
            fields: ['branch_id'],
            name: 'supplier_payment_branch_idx'
        },
        {
            fields: ['payment_date'],
            name: 'supplier_payment_date_idx'
        }
    ]
})

module.exports = SupplierPayment
