const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * StockTransfer Model - For moving inventory between warehouses
 */
const StockTransfer = sequelize.define('StockTransfer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    transfer_number: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    from_warehouse_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    to_warehouse_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'in_transit', 'completed', 'cancelled'),
        defaultValue: 'pending'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    transferred_by: {
        type: DataTypes.UUID,
        allowNull: false
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'stock_transfers',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['transfer_number'],
            name: 'transfer_number_unique'
        },
        {
            fields: ['status'],
            name: 'transfer_status_idx'
        },
        {
            fields: ['from_warehouse_id'],
            name: 'transfer_from_idx'
        },
        {
            fields: ['to_warehouse_id'],
            name: 'transfer_to_idx'
        }
    ]
})

module.exports = StockTransfer
