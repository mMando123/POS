const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const JournalEntry = sequelize.define('JournalEntry', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    fiscal_year_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Linked to FiscalYear for period control'
    },
    entry_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: 'Sequential: JV-2026-00001'
    },
    entry_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    reference: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'External reference (invoice number, payment id, POS order)'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('draft', 'posted', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
    },
    total_debit: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    total_credit: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    // === Accountability Fields (Audit Fix) ===
    created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'User who created the entry'
    },
    posted_by: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'User who posted/approved the entry'
    },
    posted_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    cancelled_by: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'User who cancelled/reversed the entry'
    },
    cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'acm_journal_entries',
    indexes: [
        { unique: true, fields: ['entry_number', 'company_id'] },
        { fields: ['company_id', 'entry_date'] },
        { fields: ['status'] },
        { fields: ['reference'] },
        { fields: ['created_by'] }
    ]
});

module.exports = JournalEntry;
