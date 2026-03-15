const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * GLAuditLog - Independent accounting audit trail
 *
 * Stores immutable event records for critical accounting operations
 * (journal posting/reversal, period close/reopen, year-end close).
 */
const GLAuditLog = sequelize.define('GLAuditLog', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    event_type: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    journal_entry_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    entry_number: {
        type: DataTypes.STRING(30),
        allowNull: true
    },
    source_type: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    source_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    fiscal_period: {
        type: DataTypes.STRING(7),
        allowNull: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    payload: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        get() {
            const raw = this.getDataValue('payload')
            if (!raw) return null
            try { return JSON.parse(raw) } catch { return raw }
        },
        set(value) {
            this.setDataValue('payload', value ? JSON.stringify(value) : null)
        }
    }
}, {
    tableName: 'gl_audit_logs',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['event_type'], name: 'gl_audit_event_idx' },
        { fields: ['journal_entry_id'], name: 'gl_audit_je_idx' },
        { fields: ['source_type', 'source_id'], name: 'gl_audit_source_idx' },
        { fields: ['fiscal_period'], name: 'gl_audit_period_idx' },
        { fields: ['created_by'], name: 'gl_audit_user_idx' },
        { fields: ['branch_id'], name: 'gl_audit_branch_idx' },
        { fields: ['created_at'], name: 'gl_audit_created_idx' }
    ]
})

module.exports = GLAuditLog
