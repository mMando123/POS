const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * PurchaseOrderItem Model - Line items for purchase orders
 */
const PurchaseOrderItem = sequelize.define('PurchaseOrderItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    purchase_order_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Product being ordered'
    },
    quantity_ordered: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    quantity_received: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    remaining_quantity: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        comment: 'quantity_ordered - quantity_received'
    },
    unit_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    tax_rate: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0,
        comment: 'Tax percentage (e.g., 15 for 15%)'
    },
    tax_amount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    discount_rate: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0
    },
    discount_amount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    line_total: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: 'quantity * unit_cost + tax - discount'
    },
    batch_number: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    production_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    expiry_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    notes: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    tableName: 'purchase_order_items',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            fields: ['purchase_order_id'],
            name: 'poi_order_idx'
        },
        {
            fields: ['menu_id'],
            name: 'poi_menu_idx'
        }
    ]
})

module.exports = PurchaseOrderItem
