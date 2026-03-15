const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const LeaveRequest = sequelize.define('LeaveRequest', {
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
    leave_type: {
        type: DataTypes.ENUM('annual', 'sick', 'unpaid', 'maternity', 'compassionate'),
        allowNull: false
    },
    start_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    end_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    number_of_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
    },
    approved_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    approved_date: {
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
    tableName: 'leave_requests',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['employee_id'], name: 'leave_requests_employee_idx' },
        { fields: ['branch_id'], name: 'leave_requests_branch_idx' },
        { fields: ['status'], name: 'leave_requests_status_idx' },
        { fields: ['start_date'], name: 'leave_requests_start_date_idx' }
    ]
})

module.exports = LeaveRequest
