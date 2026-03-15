const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Department = sequelize.define('Department', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    code: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    name_en: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    manager_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    budget: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active'
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    }
}, {
    tableName: 'hr_departments',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['code'], unique: true, name: 'hr_departments_code_unique' },
        { fields: ['status'], name: 'hr_departments_status_idx' },
        { fields: ['branch_id'], name: 'hr_departments_branch_idx' }
    ]
})

module.exports = Department

