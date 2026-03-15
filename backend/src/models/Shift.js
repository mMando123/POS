const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Shift = sequelize.define('Shift', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    start_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    end_time: {
        type: DataTypes.DATE,
        allowNull: true
    },
    starting_cash: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    ending_cash: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    expected_cash: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    cash_sales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    card_sales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('open', 'closed'),
        allowNull: false,
        defaultValue: 'open'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    order_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    reviewed_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    review_status: {
        type: DataTypes.ENUM('pending', 'approved', 'flagged'),
        allowNull: false,
        defaultValue: 'pending'
    },
    review_notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'shifts',
    timestamps: true,
    underscored: true
})

module.exports = Shift
