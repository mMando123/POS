const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * PriceListItem Model
 * Defines per-item override prices inside a price list.
 */
const PriceListItem = sequelize.define('PriceListItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    price_list_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    min_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    }
}, {
    tableName: 'price_list_items',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['price_list_id'], name: 'price_list_items_list_idx' },
        { fields: ['menu_id'], name: 'price_list_items_menu_idx' },
        { fields: ['is_active'], name: 'price_list_items_active_idx' },
        { fields: ['price_list_id', 'menu_id', 'min_quantity'], name: 'price_list_items_unique_tier', unique: true }
    ]
})

module.exports = PriceListItem

