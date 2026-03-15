const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * JournalAttachment - Supporting documents for GL journal entries.
 *
 * Stores file metadata for accounting evidence:
 * invoices, receipts, PDFs, Word/Excel docs, images.
 */
const JournalAttachment = sequelize.define('JournalAttachment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    journal_entry_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    original_name: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    stored_name: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    file_path: {
        type: DataTypes.STRING(600),
        allowNull: false,
        comment: 'Relative path under backend/uploads'
    },
    mime_type: {
        type: DataTypes.STRING(120),
        allowNull: false
    },
    file_size: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
    },
    file_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'SHA-256 hash for integrity verification'
    },
    uploaded_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    deleted_by: {
        type: DataTypes.UUID,
        allowNull: true
    }
}, {
    tableName: 'gl_journal_attachments',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['journal_entry_id'], name: 'gl_ja_entry_idx' },
        { fields: ['uploaded_by'], name: 'gl_ja_uploaded_by_idx' },
        { fields: ['branch_id'], name: 'gl_ja_branch_idx' },
        { fields: ['company_id'], name: 'gl_ja_company_idx' },
        { fields: ['is_deleted'], name: 'gl_ja_deleted_idx' },
        { fields: ['created_at'], name: 'gl_ja_created_idx' }
    ]
})

module.exports = JournalAttachment
