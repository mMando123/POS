const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Customer = sequelize.define('Customer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true
    },
    name: {
        type: DataTypes.STRING(100)
    },
    email: {
        type: DataTypes.STRING(255)
    },
    address: {
        type: DataTypes.TEXT
    },
    total_orders: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    total_spent: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0
    },
    loyalty_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'customers'
})

module.exports = Customer
