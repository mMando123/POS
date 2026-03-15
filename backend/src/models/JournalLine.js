/**
 * JournalLine Model — Individual Debit/Credit Lines
 * 
 * ACCOUNTING LAYER (Phase 2)
 * 
 * Each line in a journal entry represents either a DEBIT or CREDIT
 * to a specific account. The fundamental rule of double-entry accounting:
 * 
 *   Sum(debit_amount) = Sum(credit_amount) for every JournalEntry
 * 
 * This is enforced at the service layer, not the model layer,
 * because SQLite doesn't support CHECK constraints across rows.
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const JournalLine = sequelize.define('JournalLine', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // Parent journal entry
    journal_entry_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    // Which account is affected
    account_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    // Debit amount (0 if this is a credit line)
    debit_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Debit amount. One of debit/credit must be > 0, the other must be 0'
    },
    // Credit amount (0 if this is a debit line)
    credit_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Credit amount. One of debit/credit must be > 0, the other must be 0'
    },
    // Line description (optional, for extra detail)
    description: {
        type: DataTypes.STRING(300),
        allowNull: true
    },
    // Line number within the entry (for display ordering)
    line_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    // ============ Cost Center ============
    cost_center_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Cost center for this specific line — overrides entry-level default'
    },
    // ============ Company ============
    company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Company scope for this line (denormalized from journal entry for faster filtering)'
    }
}, {
    tableName: 'gl_journal_lines',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['journal_entry_id'], name: 'gl_jl_entry_idx' },
        { fields: ['account_id'], name: 'gl_jl_account_idx' },
        { fields: ['cost_center_id'], name: 'gl_jl_cost_center_idx' },
        { fields: ['company_id'], name: 'gl_jl_company_idx' }
    ]
})

module.exports = JournalLine
