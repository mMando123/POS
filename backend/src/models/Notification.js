const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
    const Notification = sequelize.define('Notification', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        type: {
            type: DataTypes.ENUM(
                'order_new',           // طلب جديد
                'order_pending',       // طلب أونلاين بانتظار الموافقة
                'order_approved',      // تمت الموافقة
                'order_preparing',     // قيد التحضير
                'order_ready',         // جاهز
                'order_completed',     // مكتمل
                'order_cancelled',     // ملغي
                'shift_alert',         // تنبيه وردية
                'low_stock',           // مخزون منخفض
                'system'               // نظام
            ),
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        // Target audience
        target_role: {
            type: DataTypes.ENUM('all', 'admin', 'manager', 'cashier', 'chef', 'supervisor', 'accountant'),
            defaultValue: 'all',
        },
        target_user_id: {
            type: DataTypes.UUID,
            allowNull: true, // null = broadcast to role
        },
        // Related entity
        entity_type: {
            type: DataTypes.STRING, // 'order', 'shift', etc.
            allowNull: true,
        },
        entity_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Navigation
        action_url: {
            type: DataTypes.STRING,
            allowNull: true, // e.g., '/orders/123'
        },
        // Status
        is_read: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        read_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        // Metadata
        icon: {
            type: DataTypes.STRING,
            defaultValue: '🔔',
        },
        priority: {
            type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
            defaultValue: 'normal',
        },
        // Sound
        play_sound: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
    }, {
        tableName: 'notifications',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    })

    return Notification
}
