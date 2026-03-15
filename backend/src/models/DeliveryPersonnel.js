const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * DeliveryPersonnel Model
 * Tracks delivery riders/drivers assigned to delivery orders
 */
const DeliveryPersonnel = sequelize.define('DeliveryPersonnel', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'اسم الديليفري بالعربي'
    },
    name_en: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'اسم الديليفري بالإنجليزي'
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'رقم الهاتف'
    },
    vehicle_type: {
        type: DataTypes.STRING(20),
        defaultValue: 'motorcycle',
        comment: 'motorcycle | car | bicycle | foot'
    },
    vehicle_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'رقم اللوحة أو المركبة'
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'available',
        comment: 'available | busy | offline'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    employee_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'ربط موظف التوصيل بسجل الموارد البشرية'
    }
}, {
    tableName: 'delivery_personnel',
    timestamps: true,
    underscored: true
})

module.exports = DeliveryPersonnel
