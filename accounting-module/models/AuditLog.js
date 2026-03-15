const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    entity_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'e.g. JournalEntry, Account, FiscalYear'
    },
    entity_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    action: {
        type: DataTypes.ENUM('create', 'update', 'post', 'cancel', 'delete', 'deactivate'),
        allowNull: false
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Who performed the action (null = system)'
    },
    old_values: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON stringified old values'
    },
    new_values: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON stringified new values'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'acm_audit_logs',
    updatedAt: false, // Audit logs are immutable, no updated_at needed
    indexes: [
        { fields: ['company_id'] },
        { fields: ['entity_type', 'entity_id'] },
        { fields: ['user_id'] },
        { fields: ['action'] },
        { fields: ['created_at'] }
    ]
});

module.exports = AuditLog;
