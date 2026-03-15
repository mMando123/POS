const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
    const Device = sequelize.define('Device', {
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
            type: DataTypes.ENUM('thermal', 'receipt', 'kitchen', 'a4', 'label'),
            allowNull: false,
            defaultValue: 'thermal',
        },
        connection_type: {
            type: DataTypes.ENUM('usb', 'network', 'bluetooth', 'serial'),
            allowNull: false,
            defaultValue: 'network',
        },
        // Connection details
        ip_address: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        port: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 9100, // Standard ESC/POS port
        },
        usb_vendor_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        usb_product_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        bluetooth_address: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        serial_port: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Assignment
        purpose: {
            type: DataTypes.ENUM('receipt', 'kitchen', 'invoice', 'label', 'admin', 'report'),
            allowNull: false,
            defaultValue: 'receipt',
        },
        branch_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        // Capabilities
        paper_width: {
            type: DataTypes.ENUM('58mm', '80mm', 'A4', 'A5'),
            defaultValue: '80mm',
        },
        supports_arabic: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        supports_logo: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        supports_qr: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        supports_barcode: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        supports_cut: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        supports_cash_drawer: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
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
        status: {
            type: DataTypes.ENUM('online', 'offline', 'error', 'busy'),
            defaultValue: 'offline',
        },
        last_seen: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        last_error: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Settings
        print_copies: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
        },
        auto_cut: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        open_drawer_on_print: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        beep_on_print: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'devices',
        timestamps: true,
        underscored: true,
    })

    return Device
}
