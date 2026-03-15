const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * PurchaseReturnItem Model - Line items for purchase return
 */
const PurchaseReturnItem = sequelize.define('PurchaseReturnItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    purchase_return_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    purchase_order_item_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Link to original PO line item'
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    quantity_returned: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    unit_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Cost credited by supplier (usually same as PO cost)'
    },
    total_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    reason: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    tableName: 'purchase_return_items',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            fields: ['purchase_return_id'],
            name: 'return_item_return_idx'
        },
        {
            fields: ['menu_id'],
            name: 'return_item_menu_idx'
        }
    ]
})

module.exports = PurchaseReturnItem
