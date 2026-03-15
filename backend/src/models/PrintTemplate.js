const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
    const PrintTemplate = sequelize.define('PrintTemplate', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM('receipt', 'kitchen_ticket', 'invoice', 'label', 'report', 'refund'),
            allowNull: false,
        },
        // Template content
        template_html: {
            type: DataTypes.TEXT('long'),
            allowNull: true,
        },
        template_escpos: {
            type: DataTypes.TEXT('long'), // JSON format for ESC/POS commands
            allowNull: true,
        },
        // Header/Footer
        header_logo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        header_text: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        footer_text: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        // Settings
        paper_width: {
            type: DataTypes.ENUM('58mm', '80mm', 'A4', 'A5'),
            defaultValue: '80mm',
        },
        language: {
            type: DataTypes.ENUM('ar', 'en', 'ar-en'),
            defaultValue: 'ar',
        },
        font_size: {
            type: DataTypes.ENUM('small', 'normal', 'large'),
            defaultValue: 'normal',
        },
        // Features
        show_logo: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        show_qr: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        show_barcode: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        qr_content: {
            type: DataTypes.STRING, // 'order_id', 'order_url', 'custom'
            defaultValue: 'order_id',
        },
        // Status
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        branch_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    }, {
        tableName: 'print_templates',
        timestamps: true,
        underscored: true,
    })

    return PrintTemplate
}
