const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Category = sequelize.define('Category', {
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
    display_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    }
}, {
    tableName: 'categories',
    timestamps: true,
    underscored: true
})

module.exports = Category
