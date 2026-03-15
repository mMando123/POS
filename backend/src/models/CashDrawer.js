/**
 * CashDrawer Model — Accounting-Aware Cash Shift Reconciliation
 * 
 * ACCOUNTING LAYER (Phase 2)
 * 
 * Links to the existing Shift model WITHOUT modifying it.
 * Provides the accounting layer for cash reconciliation:
 *   - Tracks opening/closing balances
 *   - Computes expected balance from journal entries
 *   - Records variance and links to variance journal entries
 *   - Accounts for cash refunds (which the existing Shift model misses)
 * 
 * One CashDrawer record per Shift.
 * The existing Shift model continues to work unchanged.
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const CashDrawer = sequelize.define('CashDrawer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // Link to existing Shift (without modifying Shift table)
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: 'References shifts.id (existing table, NOT modified)'
    },
    // Branch
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    // User who operated the drawer
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    // Opening balance (cash counted at shift start)
    opening_balance: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    // --- Transaction Totals (computed from actual transactions) ---
    cash_sales_total: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
        comment: 'Total cash received from sales'
    },
    card_sales_total: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
        comment: 'Total card payments (does not affect cash drawer)'
    },
    online_sales_total: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
        comment: 'Total online payments (does not affect cash drawer)'
    },
    cash_refunds_total: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
        comment: 'Total cash refunds paid out (reduces cash in drawer)'
    },
    cash_in_total: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
        comment: 'Manual cash additions (e.g., change float top-up)'
    },
    cash_out_total: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
        comment: 'Manual cash removals (e.g., petty cash withdrawal)'
    },
    // --- Calculated Fields ---
    expected_balance: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
        comment: 'opening + cash_sales - cash_refunds + cash_in - cash_out'
    },
    actual_balance: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        comment: 'Physical cash counted at shift end'
    },
    variance: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        comment: 'actual_balance - expected_balance (positive = overage, negative = shortage)'
    },
    // --- Status ---
    status: {
        type: DataTypes.ENUM('open', 'closed', 'reconciled', 'flagged'),
        defaultValue: 'open'
    },
    // --- Journal Entry Links ---
    opening_journal_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Journal entry for opening balance'
    },
    closing_journal_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Journal entry for closing/reconciliation'
    },
    variance_journal_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Journal entry for cash variance (shortage/overage)'
    },
    // Order count
    order_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    refund_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    // Timestamps
    opened_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    closed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    reconciled_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'gl_cash_drawers',
    timestamps: true,
    underscored: true,
    indexes: [
        { unique: true, fields: ['shift_id'], name: 'gl_cd_shift_unique' },
        { fields: ['user_id'], name: 'gl_cd_user_idx' },
        { fields: ['branch_id'], name: 'gl_cd_branch_idx' },
        { fields: ['status'], name: 'gl_cd_status_idx' },
        { fields: ['opened_at'], name: 'gl_cd_opened_idx' }
    ]
})

module.exports = CashDrawer
