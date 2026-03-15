const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * PurchaseReturn Model - Return items to supplier
 */
const PurchaseReturn = sequelize.define('PurchaseReturn', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    return_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    purchase_order_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Source Purchase Order'
    },
    supplier_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    warehouse_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Warehouse where items are removed from'
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Branch derived from warehouse'
    },
    return_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    status: {
        type: DataTypes.ENUM('draft', 'completed', 'cancelled'),
        defaultValue: 'draft'
    },
    total_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        comment: 'Value of returned items (Credit Note Amount)'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: false
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'purchase_returns',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['return_number'],
            name: 'return_number_unique'
        },
        {
            fields: ['purchase_order_id'],
            name: 'return_po_idx'
        },
        {
            fields: ['supplier_id'],
            name: 'return_supplier_idx'
        },
        {
            fields: ['branch_id'],
            name: 'return_branch_idx'
        },
        {
            fields: ['status'],
            name: 'return_status_idx'
        }
    ]
})

module.exports = PurchaseReturn
