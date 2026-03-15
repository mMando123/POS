const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Employee = sequelize.define('Employee', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    employee_code: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    first_name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    last_name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    first_name_en: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    last_name_en: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    email: {
        type: DataTypes.STRING(150),
        allowNull: true,
        validate: { isEmail: true }
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    date_of_birth: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    gender: {
        type: DataTypes.ENUM('M', 'F'),
        allowNull: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    department_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    designation_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    employment_type: {
        type: DataTypes.ENUM('full_time', 'part_time', 'contract', 'temporary'),
        allowNull: false,
        defaultValue: 'full_time'
    },
    date_of_joining: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    date_of_leaving: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive', 'on_leave', 'terminated'),
        allowNull: false,
        defaultValue: 'active'
    },
    address_ar: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    address_en: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    city: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    state: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    country: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    postal_code: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    bank_name: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    account_number: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    iban: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'ربط الموظف بحساب مستخدم في النظام'
    }
}, {
    tableName: 'employees',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['employee_code'], unique: true, name: 'employees_code_unique' },
        { fields: ['email'], unique: true, name: 'employees_email_unique' },
        { fields: ['status'], name: 'employees_status_idx' },
        { fields: ['department_id'], name: 'employees_department_idx' },
        { fields: ['designation_id'], name: 'employees_designation_idx' },
        { fields: ['branch_id'], name: 'employees_branch_idx' },
        { fields: ['user_id'], unique: true, name: 'employees_user_unique' }
    ]
})

module.exports = Employee

