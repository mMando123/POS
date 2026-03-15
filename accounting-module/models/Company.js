const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Company = sequelize.define('Company', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    name_ar: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Arabic name for ZATCA compliance and bilingual reports'
    },
    abbr: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true
    },
    tax_id: {
        type: DataTypes.STRING(30),
        allowNull: true,
        comment: 'VAT/Tax Registration Number (e.g. ZATCA VAT number)'
    },
    currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'SAR'
    },
    fiscal_year_start_month: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '1=January. Some companies start fiscal year in April, July, etc.'
    },
    address: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    parent_company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'For subsidiary/parent company hierarchy'
    },
    default_cost_center_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Default cost center for this company'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'acm_companies'
});

module.exports = Company;
