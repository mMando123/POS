const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
    const PrintJob = sequelize.define('PrintJob', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        device_id: {
            type: DataTypes.INTEGER,
            allowNull: true, // null = auto-select based on purpose
        },
        purpose: {
            type: DataTypes.ENUM('receipt', 'kitchen', 'invoice', 'label', 'admin', 'report'),
            allowNull: false,
        },
        // Job details
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        content_type: {
            type: DataTypes.ENUM('escpos', 'html', 'pdf', 'text', 'raw'),
            defaultValue: 'escpos',
        },
        content: {
            type: DataTypes.TEXT('long'),
            allowNull: false,
        },
        // Related entity
        entity_type: {
            type: DataTypes.STRING, // 'order', 'invoice', 'report', etc.
            allowNull: true,
        },
        entity_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        // Status tracking
        status: {
            type: DataTypes.ENUM('pending', 'printing', 'completed', 'failed', 'cancelled'),
            defaultValue: 'pending',
        },
        retry_count: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        max_retries: {
            type: DataTypes.INTEGER,
            defaultValue: 3,
        },
        // Timestamps
        scheduled_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        started_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        // Error tracking
        error_message: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Metadata
        copies: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
        },
        priority: {
            type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
            defaultValue: 'normal',
        },
        branch_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        created_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    }, {
        tableName: 'print_jobs',
        timestamps: true,
        underscored: true,
    })

    return PrintJob
}
