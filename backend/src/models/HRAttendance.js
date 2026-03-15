const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const HRAttendance = sequelize.define('HRAttendance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    employee_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    attendance_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    check_in: {
        type: DataTypes.TIME,
        allowNull: true
    },
    check_out: {
        type: DataTypes.TIME,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('present', 'absent', 'late', 'half_day', 'leave'),
        allowNull: false,
        defaultValue: 'present'
    },
    working_hours: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    recorded_by: {
        type: DataTypes.UUID,
        allowNull: true
    }
}, {
    tableName: 'hr_attendance',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            fields: ['employee_id', 'attendance_date'],
            unique: true,
            name: 'hr_attendance_employee_date_unique'
        },
        { fields: ['branch_id'], name: 'hr_attendance_branch_idx' },
        { fields: ['status'], name: 'hr_attendance_status_idx' }
    ]
})

module.exports = HRAttendance
