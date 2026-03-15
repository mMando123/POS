const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Branch = sequelize.define('Branch', {
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
    address: {
        type: DataTypes.TEXT
    },
    phone: {
        type: DataTypes.STRING(20)
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    // ============ Multi-Company ============
    company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Company this branch belongs to — NULL only during migration'
    }
}, {
    tableName: 'branches'
})

module.exports = Branch
