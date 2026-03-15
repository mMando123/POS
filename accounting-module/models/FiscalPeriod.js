const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FiscalPeriod = sequelize.define('FiscalPeriod', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    fiscal_year_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    period_name: {
        type: DataTypes.STRING(30),
        allowNull: false // e.g. "January 2023", "Q1-2023"
    },
    start_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    end_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    is_closed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'If true, no new entries can be posted within this period'
    }
}, {
    tableName: 'acm_fiscal_periods',
    indexes: [
        { unique: true, fields: ['period_name', 'company_id'] },
        { fields: ['fiscal_year_id'] },
        { fields: ['company_id'] }
    ]
});

module.exports = FiscalPeriod;
