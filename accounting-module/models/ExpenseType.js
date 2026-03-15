const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExpenseType = sequelize.define('ExpenseType', {
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
        comment: 'e.g., Rent, Utilities, Payroll'
    },
    account_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'MUST link to an Expense ledger account'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'acm_expense_types',
    indexes: [
        { unique: true, fields: ['name', 'company_id'] },
        { fields: ['company_id'] },
        { fields: ['account_id'] }
    ]
});

module.exports = ExpenseType;
