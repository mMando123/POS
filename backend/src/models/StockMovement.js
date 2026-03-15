const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * StockMovement Model - Immutable ledger for all stock changes
 * Never delete or modify - only insert new records
 */
const StockMovement = sequelize.define('StockMovement', {
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
    movement_type: {
        type: DataTypes.ENUM('IN', 'OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUST', 'RESERVE', 'RELEASE'),
        allowNull: false
    },
    quantity: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Positive for IN, negative for OUT'
    },
    remaining_quantity: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        comment: 'Remaining quantity for FIFO cost tracking (for IN movements)'
    },
    unit_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Cost per unit at time of movement'
    },
    total_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    balance_after: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Stock balance after this movement'
    },
    source_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'order, purchase, transfer, adjustment, manual'
    },
    source_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Reference to the source document'
    },
    reference: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Human-readable reference (invoice number, order number, etc.)'
    },
    batch_number: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    expiry_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'stock_movements',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            fields: ['menu_id'],
            name: 'movement_menu_idx'
        },
        {
            fields: ['warehouse_id'],
            name: 'movement_warehouse_idx'
        },
        {
            fields: ['movement_type'],
            name: 'movement_type_idx'
        },
        {
            fields: ['source_type', 'source_id'],
            name: 'movement_source_idx'
        },
        {
            fields: ['created_at'],
            name: 'movement_date_idx'
        }
    ]
})

module.exports = StockMovement
