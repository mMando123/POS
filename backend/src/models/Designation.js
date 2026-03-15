const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Designation = sequelize.define('Designation', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    code: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    title_ar: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    title_en: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    level: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    department_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    base_salary: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active'
    }
}, {
    tableName: 'hr_designations',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['code'], unique: true, name: 'hr_designations_code_unique' },
        { fields: ['department_id'], name: 'hr_designations_department_idx' },
        { fields: ['branch_id'], name: 'hr_designations_branch_idx' }
    ]
})

module.exports = Designation

