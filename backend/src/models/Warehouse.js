const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Warehouse = sequelize.define('Warehouse', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    name_en: {
        type: DataTypes.STRING(100)
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    location: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    manager_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active'
    },
    is_default: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'warehouses',
    timestamps: true,
    underscored: true
})

module.exports = Warehouse
