/**
 * AccountDefault Model — Dynamic Account Mapping
 * 
 * ACCOUNTING LAYER (Phase 3) — ERP-Ready Infrastructure
 * 
 * This model replaces the hard-coded ACCOUNTS constant in accountingService.js
 * with a dynamic, configurable mapping system — inspired by ERPNext's approach.
 * 
 * Instead of:
 *   ACCOUNTS.CASH = '1001'  (hard-coded, same for all branches/companies)
 * 
 * The system now resolves:
 *   AccountResolver.resolve('default_cash', { branchId }) → '1111' (branch-specific)
 * 
 * RESOLUTION PRIORITY (most specific wins):
 *   1. Branch + Company specific mapping
 *   2. Company-wide mapping
 *   3. Global default mapping
 * 
 * This enables:
 *   - Different cash accounts per branch
 *   - Different inventory accounts per warehouse
 *   - Multi-company support (future)
 *   - User-customizable Chart of Accounts without code changes
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const AccountDefault = sequelize.define('AccountDefault', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },

    // ============ FUNCTIONAL KEY ============
    // This is what the code references (never changes)
    account_key: {
        type: DataTypes.STRING(60),
        allowNull: false,
        comment: 'Functional key used in code, e.g. "default_cash_account", "default_income_account"'
    },

    // ============ ACTUAL ACCOUNT ============
    // This is what the user configures (can change)
    account_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'References gl_accounts.id — the actual account in the Chart of Accounts'
    },

    // ============ SCOPE ============
    // NULL = global default, UUID = scoped to specific entity
    company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'NULL = global default, UUID = company-specific (multi-company future)'
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'NULL = all branches, UUID = branch-specific override'
    },

    // ============ METADATA ============
    description: {
        type: DataTypes.STRING(300),
        allowNull: true,
        comment: 'Human-readable description of what this mapping is for'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'gl_account_defaults',
    timestamps: true,
    underscored: true,
    indexes: [
        // Unique: one mapping per key + scope combination
        {
            unique: true,
            fields: ['account_key', 'company_id', 'branch_id'],
            name: 'gl_ad_key_scope_unique',
            where: { is_active: true }
        },
        { fields: ['account_key'], name: 'gl_ad_key_idx' },
        { fields: ['account_id'], name: 'gl_ad_account_idx' },
        { fields: ['branch_id'], name: 'gl_ad_branch_idx' },
        { fields: ['company_id'], name: 'gl_ad_company_idx' }
    ]
})

module.exports = AccountDefault
