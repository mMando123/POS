const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const JournalLine = sequelize.define('JournalLine', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    journal_entry_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    account_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Must be is_group=false AND is_active=true'
    },
    debit: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    credit: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    cost_center_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    // === Party Sub-Ledger (Audit Fix) ===
    party_type: {
        type: DataTypes.ENUM('Customer', 'Supplier', 'Employee'),
        allowNull: true,
        comment: 'Links line to a third-party for sub-ledger tracking'
    },
    party_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'ID of the specific customer/supplier/employee'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'acm_journal_lines',
    indexes: [
        { fields: ['journal_entry_id'] },
        { fields: ['account_id'] },
        { fields: ['cost_center_id'] },
        { fields: ['party_type', 'party_id'] }
    ]
});

module.exports = JournalLine;
