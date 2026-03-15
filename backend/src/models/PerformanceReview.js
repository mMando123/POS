const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const PerformanceReview = sequelize.define('PerformanceReview', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    employee_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    review_period_start: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    review_period_end: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    reviewer_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    overall_rating: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: true
    },
    comments: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    strengths: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    areas_for_improvement: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    goals_for_next_period: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('draft', 'completed', 'reviewed'),
        allowNull: false,
        defaultValue: 'draft'
    },
    review_date: {
        type: DataTypes.DATE,
        allowNull: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true
    }
}, {
    tableName: 'performance_reviews',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['employee_id'], name: 'performance_reviews_employee_idx' },
        { fields: ['reviewer_id'], name: 'performance_reviews_reviewer_idx' },
        { fields: ['status'], name: 'performance_reviews_status_idx' }
    ]
})

module.exports = PerformanceReview
