const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const EntityAttachment = sequelize.define('EntityAttachment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    entity_type: {
        type: DataTypes.STRING(40),
        allowNull: false
    },
    entity_id: {
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
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'Relative path under backend/uploads'
    },
    mime_type: {
        type: DataTypes.STRING(150),
        allowNull: false
    },
    file_size: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
    },
    file_hash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    uploaded_by: {
        type: DataTypes.UUID,
        allowNull: false
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
    tableName: 'entity_attachments',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['entity_type', 'entity_id'], name: 'entity_att_entity_idx' },
        { fields: ['uploaded_by'], name: 'entity_att_uploaded_by_idx' },
        { fields: ['branch_id'], name: 'entity_att_branch_idx' },
        { fields: ['company_id'], name: 'entity_att_company_idx' },
        { fields: ['is_deleted'], name: 'entity_att_is_deleted_idx' },
        { fields: ['created_at'], name: 'entity_att_created_at_idx' }
    ]
})

module.exports = EntityAttachment
