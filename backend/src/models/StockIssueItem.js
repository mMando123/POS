const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * StockIssueItem Model — بنود إذن الصرف
 */
const StockIssueItem = sequelize.define('StockIssueItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    issue_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'رقم إذن الصرف'
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'الصنف'
    },
    requested_quantity: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: false,
        comment: 'الكمية المطلوبة'
    },
    issued_quantity: {
        type: DataTypes.DECIMAL(15, 4),
        defaultValue: 0,
        comment: 'الكمية المصروفة فعلياً'
    },
    unit_cost: {
        type: DataTypes.DECIMAL(15, 4),
        defaultValue: 0,
        comment: 'تكلفة الوحدة وقت الصرف'
    },
    total_cost: {
        type: DataTypes.DECIMAL(15, 4),
        defaultValue: 0,
        comment: 'إجمالي تكلفة البند'
    },
    unit: {
        type: DataTypes.STRING(30),
        defaultValue: 'piece',
        comment: 'وحدة القياس'
    },
    notes: {
        type: DataTypes.STRING(500),
        allowNull: true
    }
}, {
    tableName: 'stock_issue_items',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['issue_id'], name: 'stock_issue_item_issue_idx' },
        { fields: ['menu_id'], name: 'stock_issue_item_menu_idx' }
    ]
})

module.exports = StockIssueItem
