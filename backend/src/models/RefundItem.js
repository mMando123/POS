const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * RefundItem Model - Individual items in a refund
 * Used for partial refunds where only some items are returned
 */
const RefundItem = sequelize.define('RefundItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    refund_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    order_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Reference to original OrderItem'
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Product being refunded'
    },
    // Quantity tracking
    original_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Original quantity in order'
    },
    refund_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Quantity being refunded'
    },
    // Price snapshot (immutable)
    unit_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Price per unit at time of original order'
    },
    refund_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Total refund for this item (qty * unit_price)'
    },
    // Stock restoration
    stock_restored: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    warehouse_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Warehouse where stock was restored'
    },
    // Reason specific to this item (optional)
    item_reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Specific reason for this item refund'
    }
}, {
    tableName: 'refund_items',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['refund_id'], name: 'refund_items_refund_idx' },
        { fields: ['order_item_id'], name: 'refund_items_order_item_idx' },
        { fields: ['menu_id'], name: 'refund_items_menu_idx' }
    ]
})

module.exports = RefundItem
