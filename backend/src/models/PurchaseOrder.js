const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * PurchaseOrder Model - Purchase order management
 */
const PurchaseOrder = sequelize.define('PurchaseOrder', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    po_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    supplier_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    warehouse_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Target warehouse for received goods'
    },
    order_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    expected_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'Expected delivery date'
    },
    status: {
        type: DataTypes.ENUM('draft', 'confirmed', 'partial', 'received', 'cancelled'),
        defaultValue: 'draft'
    },
    subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0
    },
    tax_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0
    },
    discount_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0
    },
    total_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0
    },
    paid_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0
    },
    payment_status: {
        type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
        defaultValue: 'unpaid'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: false
    },
    confirmed_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true
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
    tableName: 'purchase_orders',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['po_number'],
            name: 'po_number_unique'
        },
        {
            fields: ['supplier_id'],
            name: 'po_supplier_idx'
        },
        {
            fields: ['warehouse_id'],
            name: 'po_warehouse_idx'
        },
        {
            fields: ['status'],
            name: 'po_status_idx'
        },
        {
            fields: ['order_date'],
            name: 'po_date_idx'
        }
    ]
})

module.exports = PurchaseOrder
