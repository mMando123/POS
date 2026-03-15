const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * StockTransferItem Model - Line items in a stock transfer
 */
const StockTransferItem = sequelize.define('StockTransferItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    transfer_id: {
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
    batch_number: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    expiry_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    }
}, {
    tableName: 'stock_transfer_items',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            fields: ['transfer_id'],
            name: 'transfer_item_transfer_idx'
        },
        {
            fields: ['menu_id'],
            name: 'transfer_item_menu_idx'
        }
    ]
})

module.exports = StockTransferItem
