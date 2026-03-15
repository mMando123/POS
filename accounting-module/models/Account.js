const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Account = sequelize.define('Account', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    code: {
        type: DataTypes.STRING(30),
        allowNull: false
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'English name'
    },
    name_ar: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Arabic name for bilingual reports and ZATCA compliance'
    },
    parent_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    is_group: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    root_type: {
        type: DataTypes.ENUM('Asset', 'Liability', 'Equity', 'Income', 'Expense'),
        allowNull: false
    },
    account_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Cash, Bank, Receivable, Payable, Stock, Tax, Equity, Income, Expense, Depreciation, Fixed Asset'
    },
    normal_balance: {
        type: DataTypes.ENUM('debit', 'credit'),
        allowNull: false
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'acm_accounts',
    indexes: [
        { unique: true, fields: ['code', 'company_id'], name: 'acm_account_code_company_unq' },
        { fields: ['company_id'] },
        { fields: ['parent_id'] },
        { fields: ['root_type'] },
        { fields: ['is_group'] }
    ]
});

module.exports = Account;
