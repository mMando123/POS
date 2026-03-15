const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const OrderItem = sequelize.define('OrderItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    order_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    item_name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    item_name_en: {
        type: DataTypes.STRING(100)
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    unit_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    total_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    batch_number: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT
    }
}, {
    tableName: 'order_items',
    timestamps: true,
    underscored: true
})

module.exports = OrderItem
