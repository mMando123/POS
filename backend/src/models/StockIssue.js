const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * StockIssue Model — إذن صرف بضاعة من المخزن
 * 
 * Statuses:
 *   draft      → مسودة (قابل للتعديل)
 *   approved   → معتمد (بانتظار الصرف)
 *   issued     → تم الصرف (خُصم من المخزون)
 *   cancelled  → ملغي
 */
const StockIssue = sequelize.define('StockIssue', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    issue_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'رقم إذن الصرف التسلسلي'
    },
    warehouse_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'المستودع المصدر'
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'الفرع'
    },
    issue_type: {
        type: DataTypes.ENUM('kitchen', 'branch_transfer', 'department', 'customer', 'waste', 'other'),
        defaultValue: 'kitchen',
        comment: 'نوع الصرف: مطبخ، تحويل فرع، إدارة، عميل، هدر، أخرى'
    },
    recipient_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: 'اسم المستلم / الجهة'
    },
    recipient_department: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: 'القسم المستلم'
    },
    status: {
        type: DataTypes.ENUM('draft', 'approved', 'issued', 'cancelled'),
        defaultValue: 'draft'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    total_items: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'عدد الأصناف'
    },
    total_quantity: {
        type: DataTypes.DECIMAL(15, 4),
        defaultValue: 0,
        comment: 'إجمالي الكميات'
    },
    total_cost: {
        type: DataTypes.DECIMAL(15, 4),
        defaultValue: 0,
        comment: 'إجمالي التكلفة'
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'المستخدم المنشئ'
    },
    approved_by: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'المعتمد'
    },
    approved_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    issued_by: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'أمين المستودع الذي نفّذ الصرف'
    },
    issued_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    cancelled_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    cancel_reason: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'stock_issues',
    timestamps: true,
    underscored: true,
    indexes: [
        { unique: true, fields: ['issue_number'], name: 'stock_issue_number_unique' },
        { fields: ['status'], name: 'stock_issue_status_idx' },
        { fields: ['warehouse_id'], name: 'stock_issue_warehouse_idx' },
        { fields: ['branch_id'], name: 'stock_issue_branch_idx' },
        { fields: ['issue_type'], name: 'stock_issue_type_idx' },
        { fields: ['created_at'], name: 'stock_issue_date_idx' }
    ]
})

module.exports = StockIssue
