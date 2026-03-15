const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AccountDefault = sequelize.define('AccountDefault', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    key: {
        type: DataTypes.STRING(60),
        allowNull: false,
        comment: 'e.g. default_cash_account, default_income_account'
    },
    account_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Must be a ledger account (is_group=false)'
    }
}, {
    tableName: 'acm_account_defaults',
    indexes: [
        { unique: true, fields: ['key', 'company_id'] },
        { fields: ['company_id'] },
        { fields: ['account_id'] }
    ]
});

module.exports = AccountDefault;
