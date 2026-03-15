const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const SalaryComponent = sequelize.define('SalaryComponent', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    salary_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    component_type: {
        type: DataTypes.ENUM('allowance', 'deduction', 'bonus'),
        allowNull: false
    },
    component_name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    component_name_en: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'salary_components',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['salary_id'], name: 'salary_components_salary_idx' },
        { fields: ['component_type'], name: 'salary_components_type_idx' }
    ]
})

module.exports = SalaryComponent

