const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const PaymentGateway = sequelize.define('PaymentGateway', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true // e.g., 'stripe', 'moyasar', 'geidea'
    },
    display_name_ar: {
        type: DataTypes.STRING,
        allowNull: false
    },
    display_name_en: {
        type: DataTypes.STRING,
        allowNull: false
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    is_sandbox: { // Test mode
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    settings: { // JSON field to store API keys, secrets, webhooks, etc.
        type: DataTypes.JSON,
        defaultValue: {}
    },
    supported_methods: { // e.g., ['card', 'apple_pay', 'stc_pay']
        type: DataTypes.JSON,
        defaultValue: []
    }
}, {
    timestamps: true
})

module.exports = PaymentGateway
