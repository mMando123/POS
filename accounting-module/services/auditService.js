const { AuditLog } = require('../models');

class AuditService {
    /**
     * Record an audit log entry.
     * @param {Object} params
     * @param {string} params.companyId
     * @param {string} params.entityType - e.g. 'JournalEntry', 'Account'
     * @param {string} params.entityId
     * @param {string} params.action - 'create', 'update', 'post', 'cancel', 'delete', 'deactivate'
     * @param {string|null} params.userId - who performed the action
     * @param {Object|null} params.oldValues - previous state (for updates)
     * @param {Object|null} params.newValues - new state
     * @param {string|null} params.description
     * @param {Object|null} transaction - Sequelize transaction
     */
    static async log({ companyId, entityType, entityId, action, userId = null, oldValues = null, newValues = null, description = null }, transaction = null) {
        return AuditLog.create({
            company_id: companyId,
            entity_type: entityType,
            entity_id: entityId,
            action,
            user_id: userId,
            old_values: oldValues ? JSON.stringify(oldValues) : null,
            new_values: newValues ? JSON.stringify(newValues) : null,
            description
        }, { transaction });
    }
}

module.exports = AuditService;
