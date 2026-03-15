const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * PurchaseReceipt Model - For receiving inventory from suppliers
 */
const PurchaseReceipt = sequelize.define('PurchaseReceipt', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    receipt_number: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    supplier_name: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    supplier_contact: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    warehouse_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Branch derived from target warehouse'
    },
    // Link to purchase order (optional - for receipts created from PO)
    purchase_order_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    // Link to supplier (optional - can use supplier_name for manual entries)
    supplier_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    invoice_number: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    invoice_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    payment_method: {
        type: DataTypes.ENUM('credit', 'cash', 'bank_transfer', 'check', 'card'),
        allowNull: false,
        defaultValue: 'credit'
    },
    payment_account_code: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('draft', 'partial', 'received', 'cancelled'),
        defaultValue: 'draft'
    },
    subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    tax_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    total_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: false
    },
    received_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    received_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'purchase_receipts',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['receipt_number'],
            name: 'purchase_receipt_number_unique'
        },
        {
            fields: ['status'],
            name: 'purchase_status_idx'
        },
        {
            fields: ['warehouse_id'],
            name: 'purchase_warehouse_idx'
        },
        {
            fields: ['branch_id'],
            name: 'purchase_branch_idx'
        },
        {
            fields: ['purchase_order_id'],
            name: 'purchase_order_link_idx'
        }
    ]
})

module.exports = PurchaseReceipt
