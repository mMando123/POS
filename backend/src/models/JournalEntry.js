/**
 * JournalEntry Model — General Ledger Header
 * 
 * ACCOUNTING LAYER (Phase 2)
 * 
 * Each JournalEntry is the header for a balanced double-entry transaction.
 * It contains metadata (date, description, source) while the actual
 * debit/credit lines are in JournalLine.
 * 
 * IMMUTABILITY RULE:
 * Once posted, a journal entry can NEVER be edited or deleted.
 * Corrections are made via REVERSING entries (new entry with opposite debits/credits).
 * 
 * BALANCE RULE:
 * Sum of all debit lines MUST equal sum of all credit lines.
 * The accounting service enforces this atomically before committing.
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const JournalEntry = sequelize.define('JournalEntry', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // Sequential entry number for human reference (JE-2026-00001)
    entry_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true
    },
    // Transaction date (may differ from created_at for backdated entries)
    entry_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    // Description of the financial event
    description: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    // Source linking — what triggered this entry
    source_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'order, refund, shift, expense, adjustment, opening_balance, manual'
    },
    source_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'UUID or ID of the source document'
    },
    // Total amount (sum of debit side = sum of credit side)
    total_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    // Entry status
    status: {
        type: DataTypes.ENUM('draft', 'posted', 'reversed'),
        defaultValue: 'posted',
        comment: 'draft = not yet affecting balances, posted = finalized, reversed = corrected via reversal'
    },
    // If this entry reverses another
    reversal_of: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'If this entry is a reversal, references the original entry ID'
    },
    // If this entry has been reversed
    reversed_by: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'If this entry was reversed, references the reversing entry ID'
    },
    // Fiscal period (YYYY-MM format for easy period locking)
    fiscal_period: {
        type: DataTypes.STRING(7),
        allowNull: false,
        comment: 'YYYY-MM format, e.g. 2026-02'
    },
    // Who created this entry
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    // Branch
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    // ============ Multi-Company ============
    company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Company this entry belongs to — NULL only for legacy entries'
    },
    // ============ Cost Center ============
    cost_center_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Default cost center for this entry — can be overridden per line'
    },
    // Optional direct supplier link for AP-related entries
    supplier_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Direct supplier reference for AP entries (purchase receipt/payment/return)'
    },
    // Notes
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'gl_journal_entries',
    timestamps: true,
    underscored: true,
    indexes: [
        { unique: true, fields: ['entry_number'], name: 'gl_je_number_unique' },
        { fields: ['entry_date'], name: 'gl_je_date_idx' },
        { fields: ['source_type', 'source_id'], name: 'gl_je_source_idx' },
        { fields: ['fiscal_period'], name: 'gl_je_period_idx' },
        { fields: ['status'], name: 'gl_je_status_idx' },
        { fields: ['branch_id'], name: 'gl_je_branch_idx' },
        { fields: ['company_id'], name: 'gl_je_company_idx' },
        { fields: ['cost_center_id'], name: 'gl_je_cost_center_idx' },
        { fields: ['supplier_id'], name: 'gl_je_supplier_idx' },
        { fields: ['reversal_of'], name: 'gl_je_reversal_idx' }
    ]
})

module.exports = JournalEntry
