const { GLAuditLog } = require('../models')

/**
 * GL Audit Service
 *
 * Independent, structured audit log for accounting-critical events.
 * This service is intentionally blocking in accounting workflows so
 * accounting state and audit evidence stay consistent.
 */
class GLAuditService {
    static async log({
        eventType,
        journalEntryId = null,
        entryNumber = null,
        sourceType = null,
        sourceId = null,
        fiscalPeriod = null,
        createdBy = null,
        branchId = null,
        payload = null
    } = {}, { transaction = null } = {}) {
        if (!eventType) {
            throw new Error('GL_AUDIT_ERROR: eventType is required')
        }

        return GLAuditLog.create({
            event_type: eventType,
            journal_entry_id: journalEntryId,
            entry_number: entryNumber,
            source_type: sourceType,
            source_id: sourceId,
            fiscal_period: fiscalPeriod,
            created_by: createdBy,
            branch_id: branchId,
            payload
        }, transaction ? { transaction } : {})
    }
}

module.exports = GLAuditService
