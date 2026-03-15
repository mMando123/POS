const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * Supplier Model - Vendor/Supplier management
 */
const Supplier = sequelize.define('Supplier', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Supplier code (e.g., SUP-001)'
    },
    name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    name_en: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    contact_person: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    email: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    address: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    tax_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'VAT/Tax registration number'
    },
    payment_terms: {
        type: DataTypes.INTEGER,
        defaultValue: 30,
        comment: 'Payment terms in days'
    },
    credit_limit: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0
    },
    current_balance: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        comment: 'Outstanding balance'
    },
    rating: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 1, max: 5 }
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive', 'blocked'),
        defaultValue: 'active'
    }
}, {
    tableName: 'suppliers',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['code'],
            name: 'supplier_code_unique'
        },
        {
            fields: ['status'],
            name: 'supplier_status_idx'
        },
        {
            fields: ['name_ar'],
            name: 'supplier_name_idx'
        }
    ]
})

module.exports = Supplier
