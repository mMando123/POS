const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CostCenter = sequelize.define('CostCenter', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    name_ar: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Arabic name'
    },
    code: {
        type: DataTypes.STRING(30),
        allowNull: true
    },
    is_group: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    parent_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'acm_cost_centers',
    indexes: [
        { unique: true, fields: ['name', 'company_id'] },
        { fields: ['company_id'] },
        { fields: ['parent_id'] },
        { fields: ['is_group'] }
    ]
});

module.exports = CostCenter;
