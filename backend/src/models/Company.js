/**
 * Company Model — Multi-Company Foundation
 * 
 * ACCOUNTING LAYER — ERPNext-Style Architecture
 * 
 * Each company is an independent accounting entity with its own:
 *   - Chart of Accounts
 *   - Journal Entries
 *   - Fiscal Periods
 *   - Account Defaults
 *   - Cost Centers
 * 
 * Branches belong to a Company.
 * Accounts, JournalEntries, FiscalPeriods are scoped to a Company.
 * 
 * For consolidated reporting, companies may have a parent_company.
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Company = sequelize.define('Company', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name_ar: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: 'اسم الشركة بالعربية'
    },
    name_en: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: 'Company name in English'
    },
    abbr: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
        comment: 'Short abbreviation, e.g. "HQ", "BR1" — used in reports and account codes'
    },
    country: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: 'مصر',
        comment: 'Country of incorporation'
    },
    currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'EGP',
        comment: 'Default currency code (ISO 4217)'
    },
    fiscal_year_start: {
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: '01-01',
        comment: 'MM-DD format — start of fiscal year'
    },
    tax_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'الرقم الضريبي — Tax identification number'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    // For consolidated reporting (multi-company groups)
    parent_company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Parent company for consolidated reporting'
    }
}, {
    tableName: 'companies',
    timestamps: true,
    underscored: true,
    indexes: [
        { unique: true, fields: ['abbr'], name: 'companies_abbr_unique' },
        { fields: ['is_active'], name: 'companies_active_idx' },
        { fields: ['parent_company_id'], name: 'companies_parent_idx' }
    ]
})

module.exports = Company
