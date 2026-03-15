/**
 * FiscalPeriod Model — Period Locking
 * 
 * ACCOUNTING LAYER (Phase 2)
 * 
 * Controls which fiscal periods are open for posting.
 * Once a period is locked (closed), no new journal entries can be posted
 * into that period. This is essential for:
 *   - Month-end closing procedures
 *   - Audit compliance (cannot alter closed months)
 *   - Financial statement integrity
 * 
 * IMMUTABILITY: A closed period can only be reopened by an admin,
 * and the reopen action is itself audit-logged.
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const FiscalPeriod = sequelize.define('FiscalPeriod', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // Period identifier (YYYY-MM)
    period: {
        type: DataTypes.STRING(7),
        allowNull: false,
        unique: true,
        comment: 'YYYY-MM format, e.g. 2026-02'
    },
    // Status
    status: {
        type: DataTypes.ENUM('open', 'closed', 'locked'),
        defaultValue: 'open',
        comment: 'open = accepting entries, closed = soft close (admin can reopen), locked = permanent (cannot reopen)'
    },
    // Who closed this period
    closed_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    closed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Reopened tracking
    reopened_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    reopened_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Snapshot of trial balance at close time (for verification)
    closing_balance_snapshot: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        get() {
            const raw = this.getDataValue('closing_balance_snapshot')
            if (!raw) return null
            try { return JSON.parse(raw) } catch { return raw }
        },
        set(value) {
            this.setDataValue('closing_balance_snapshot',
                value ? JSON.stringify(value) : null)
        }
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    // ============ Multi-Company ============
    company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Company-scoped fiscal period — NULL only during migration'
    }
}, {
    tableName: 'gl_fiscal_periods',
    timestamps: true,
    underscored: true,
    indexes: [
        { unique: true, fields: ['period', 'company_id'], name: 'gl_fp_period_company_unique' },
        { fields: ['status'], name: 'gl_fp_status_idx' },
        { fields: ['company_id'], name: 'gl_fp_company_idx' }
    ]
})

module.exports = FiscalPeriod
