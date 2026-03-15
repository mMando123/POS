const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const EmployeeSalary = sequelize.define('EmployeeSalary', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    employee_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    salary_period: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    base_salary: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    gross_salary: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    net_salary: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('draft', 'processing', 'approved', 'paid', 'rejected'),
        allowNull: false,
        defaultValue: 'draft'
    },
    approved_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    approved_date: {
        type: DataTypes.DATE,
        allowNull: true
    },
    paid_date: {
        type: DataTypes.DATE,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    }
}, {
    tableName: 'employee_salaries',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['employee_id'], name: 'employee_salaries_employee_idx' },
        { fields: ['salary_period'], name: 'employee_salaries_period_idx' },
        { fields: ['status'], name: 'employee_salaries_status_idx' },
        {
            fields: ['employee_id', 'salary_period'],
            unique: true,
            name: 'employee_salaries_employee_period_unique'
        }
    ]
})

module.exports = EmployeeSalary

