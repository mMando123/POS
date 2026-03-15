const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * Stock Model - Real-time inventory levels per product per warehouse
 * This is the source of truth for current stock quantities
 */
const Stock = sequelize.define('Stock', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    warehouse_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    quantity: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Total physical quantity in stock'
    },
    reserved_qty: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Quantity reserved for pending orders'
    },
    min_stock: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        comment: 'Minimum stock level for alerts'
    },
    max_stock: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Maximum stock level for overstock alerts'
    },
    avg_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Weighted average cost per unit'
    },
    last_restock_date: {
        type: DataTypes.DATE,
        allowNull: true
    },
    last_sold_date: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'stock',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['menu_id', 'warehouse_id'],
            name: 'stock_menu_warehouse_unique'
        },
        {
            fields: ['warehouse_id'],
            name: 'stock_warehouse_idx'
        }
    ],
    // Virtual field for available quantity
    getterMethods: {
        available_qty() {
            return parseFloat(this.quantity || 0) - parseFloat(this.reserved_qty || 0)
        }
    }
})

module.exports = Stock
