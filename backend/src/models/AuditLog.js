/**
 * Audit Log Model
 * Tracks all financial and inventory actions for compliance and security
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const AuditLog = sequelize.define('AuditLog', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // User who performed the action (null for system actions)
    user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        index: true
    },
    // Username snapshot (in case user is deleted later)
    username: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    // Action category for grouping
    category: {
        type: DataTypes.ENUM('order', 'shift', 'inventory', 'auth', 'settings', 'system'),
        allowNull: false,
        index: true
    },
    // Specific action performed
    action: {
        type: DataTypes.STRING(100),
        allowNull: false,
        index: true
    },
    // Entity type affected (Order, Shift, Stock, etc.)
    entity_type: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    // Entity ID affected
    entity_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    // Previous state (JSON stringified)
    old_value: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        get() {
            const raw = this.getDataValue('old_value')
            if (!raw) return null
            try {
                return JSON.parse(raw)
            } catch {
                return raw
            }
        },
        set(value) {
            if (value === null || value === undefined) {
                this.setDataValue('old_value', null)
            } else if (typeof value === 'object') {
                this.setDataValue('old_value', JSON.stringify(value))
            } else {
                this.setDataValue('old_value', String(value))
            }
        }
    },
    // New state (JSON stringified)
    new_value: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        get() {
            const raw = this.getDataValue('new_value')
            if (!raw) return null
            try {
                return JSON.parse(raw)
            } catch {
                return raw
            }
        },
        set(value) {
            if (value === null || value === undefined) {
                this.setDataValue('new_value', null)
            } else if (typeof value === 'object') {
                this.setDataValue('new_value', JSON.stringify(value))
            } else {
                this.setDataValue('new_value', String(value))
            }
        }
    },
    // Client IP address
    ip_address: {
        type: DataTypes.STRING(45), // IPv6 compatible
        allowNull: true
    },
    // User agent for additional context
    user_agent: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    // Branch context
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    // Additional metadata
    metadata: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
            const raw = this.getDataValue('metadata')
            if (!raw) return null
            try {
                return JSON.parse(raw)
            } catch {
                return raw
            }
        },
        set(value) {
            if (value === null || value === undefined) {
                this.setDataValue('metadata', null)
            } else if (typeof value === 'object') {
                this.setDataValue('metadata', JSON.stringify(value))
            } else {
                this.setDataValue('metadata', String(value))
            }
        }
    },
    // Timestamp (automatic via Sequelize but explicit for clarity)
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        index: true
    }
}, {
    tableName: 'audit_logs',
    timestamps: false, // We use our own timestamp field
    indexes: [
        { fields: ['timestamp'] },
        { fields: ['user_id'] },
        { fields: ['category'] },
        { fields: ['action'] },
        { fields: ['entity_type', 'entity_id'] },
        { fields: ['category', 'timestamp'] }
    ]
})

module.exports = AuditLog
