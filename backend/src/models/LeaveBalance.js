const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const LeaveBalance = sequelize.define('LeaveBalance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    employee_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    leave_type: {
        type: DataTypes.ENUM('annual', 'sick', 'unpaid', 'maternity', 'compassionate'),
        allowNull: false
    },
    financial_year: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    opening_balance: {
        type: DataTypes.DECIMAL(7, 2),
        allowNull: false,
        defaultValue: 0
    },
    allocated: {
        type: DataTypes.DECIMAL(7, 2),
        allowNull: false,
        defaultValue: 0
    },
    used: {
        type: DataTypes.DECIMAL(7, 2),
        allowNull: false,
        defaultValue: 0
    },
    remaining: {
        type: DataTypes.DECIMAL(7, 2),
        allowNull: false,
        defaultValue: 0
    },
    carried_forward: {
        type: DataTypes.DECIMAL(7, 2),
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'leave_balances',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            fields: ['employee_id', 'leave_type', 'financial_year'],
            unique: true,
            name: 'leave_balances_employee_type_year_unique'
        },
        { fields: ['financial_year'], name: 'leave_balances_year_idx' }
    ]
})

module.exports = LeaveBalance
