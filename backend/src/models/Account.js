/**
 * Account Model — Chart of Accounts (ERPNext-Style)
 * 
 * ACCOUNTING LAYER — ERPNext-Style Architecture
 * 
 * Represents a single account in the Chart of Accounts (COA).
 * 
 * KEY DESIGN (ERPNext pattern):
 *   root_type    → Classification: asset, liability, equity, income, expense
 *   account_type → Granular type: Cash, Bank, Receivable, Payable, Tax, Stock, etc.
 *   is_group     → Group accounts (folders) vs Ledger accounts (postable)
 * 
 * RULES:
 *   1. is_group=true  → Cannot receive journal entries (folder only)
 *   2. is_group=false → Ledger account, can receive journal entries
 *   3. Child inherits root_type and normal_balance from parent
 *   4. Code is unique within a company
 *   5. Cannot delete accounts with journal history — only deactivate
 * 
 * Account codes follow a hierarchical structure:
 *   1xxx    = Assets
 *   2xxx    = Liabilities
 *   3xxx    = Equity
 *   4xxx    = Income
 *   5xxx    = Expenses
 *   xxxx-xx = Sub-accounts (unlimited depth)
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Account = sequelize.define('Account', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // Account code — hierarchical (e.g., 1002-01-01)
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Hierarchical account code, unique within company'
    },
    name_ar: {
        type: DataTypes.STRING(200),
        allowNull: false
    },
    name_en: {
        type: DataTypes.STRING(200),
        allowNull: false
    },

    // ============ ERPNext-Style Classification ============

    // Root type — the fundamental classification (was: account_type)
    root_type: {
        type: DataTypes.ENUM('asset', 'liability', 'equity', 'income', 'expense'),
        allowNull: false,
        comment: 'Root classification — inherited from parent, never changes after creation'
    },
    // Account type — granular sub-classification (NEW)
    account_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Granular type: Cash, Bank, Receivable, Payable, Tax, Stock, Cost of Goods Sold, Income Account, Expense Account, Equity, Depreciation, Fixed Asset'
    },
    // Normal balance side
    normal_balance: {
        type: DataTypes.ENUM('debit', 'credit'),
        allowNull: false,
        comment: 'Assets & Expenses = debit, Liabilities & Equity & Income = credit'
    },

    // ============ Hierarchy ============

    // Parent for sub-accounts (recursive tree — unlimited depth)
    parent_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Parent account ID for hierarchical COA'
    },
    // Group vs Ledger
    is_group: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Group accounts (is_group=true) cannot receive journal entries — only ledger accounts can'
    },

    // ============ Company Scope ============

    company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Company this account belongs to — NULL only during migration'
    },

    // ============ Status & Metadata ============

    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    // System accounts cannot be deleted/renamed
    is_system: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'System accounts are seeded by the app and cannot be deleted'
    },
    // Cached running balance (updated on each journal entry)
    current_balance: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
        comment: 'Cached running balance in natural terms'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'gl_accounts',
    timestamps: true,
    underscored: true,
    indexes: [
        // Code unique within company (was: globally unique)
        { unique: true, fields: ['code', 'company_id'], name: 'gl_accounts_code_company_unique' },
        { fields: ['root_type'], name: 'gl_accounts_root_type_idx' },
        { fields: ['account_type'], name: 'gl_accounts_account_type_idx' },
        { fields: ['parent_id'], name: 'gl_accounts_parent_idx' },
        { fields: ['company_id'], name: 'gl_accounts_company_idx' },
        { fields: ['is_active'], name: 'gl_accounts_active_idx' },
        { fields: ['is_group'], name: 'gl_accounts_group_idx' }
    ]
})

module.exports = Account
