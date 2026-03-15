const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * PurchaseReceiptItem Model - Line items in a purchase receipt
 */
const PurchaseReceiptItem = sequelize.define('PurchaseReceiptItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    receipt_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    quantity: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    quantity_received: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    unit_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    total_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    batch_number: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    expiry_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    }
}, {
    tableName: 'purchase_receipt_items',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            fields: ['receipt_id'],
            name: 'purchase_item_receipt_idx'
        },
        {
            fields: ['menu_id'],
            name: 'purchase_item_menu_idx'
        }
    ]
})

module.exports = PurchaseReceiptItem
