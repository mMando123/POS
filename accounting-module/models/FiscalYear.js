const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FiscalYear = sequelize.define('FiscalYear', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    year_name: {
        type: DataTypes.STRING(20),
        allowNull: false, // e.g., "2023", "2023-2024"
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
        comment: 'If true, no new entries can be posted within this year'
    }
}, {
    tableName: 'acm_fiscal_years',
    indexes: [
        { unique: true, fields: ['year_name', 'company_id'] },
        { fields: ['company_id'] }
    ]
});

module.exports = FiscalYear;
