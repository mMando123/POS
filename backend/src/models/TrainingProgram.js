const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const TrainingProgram = sequelize.define('TrainingProgram', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    program_name_ar: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    program_name_en: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    duration_days: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    trainer: {
        type: DataTypes.UUID,
        allowNull: true
    },
    budget: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('planned', 'in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'planned'
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    }
}, {
    tableName: 'training_programs',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['status'], name: 'training_programs_status_idx' },
        { fields: ['start_date'], name: 'training_programs_start_date_idx' }
    ]
})

module.exports = TrainingProgram
