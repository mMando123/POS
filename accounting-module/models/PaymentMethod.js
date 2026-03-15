const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PaymentMethod = sequelize.define('PaymentMethod', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'e.g., Ahli Bank, STC Pay, Cash'
    },
    payment_type: {
        type: DataTypes.ENUM('cash', 'bank', 'digital', 'other'),
        allowNull: false,
        defaultValue: 'bank'
    },
    account_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'MUST link to a ledger account (Asset)'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'acm_payment_methods',
    indexes: [
        { unique: true, fields: ['name', 'company_id'] },
        { fields: ['company_id'] },
        { fields: ['account_id'] }
    ]
});

module.exports = PaymentMethod;
