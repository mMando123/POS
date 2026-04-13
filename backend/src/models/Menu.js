const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Menu = sequelize.define('Menu', {
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
    description_ar: {
        type: DataTypes.TEXT
    },
    description_en: {
        type: DataTypes.TEXT
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    image_url: {
        type: DataTypes.STRING(500)
    },
    category_id: {
        type: DataTypes.UUID
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    is_available: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    display_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    // Inventory tracking fields
    sku: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    barcode: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    cost_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    track_stock: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'If true, inventory will be tracked for this item'
    },
    costing_method: {
        type: DataTypes.ENUM('fifo', 'lifo', 'avg'),
        defaultValue: 'avg'
    },
    allow_negative_stock: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // Product type: sellable (appears in POS) or raw_material (inventory only)
    item_type: {
        type: DataTypes.ENUM('sellable', 'raw_material', 'consumable'),
        defaultValue: 'sellable',
        comment: 'sellable: appears in POS, raw_material: inventory only, consumable: supplies'
    },
    unit_of_measure: {
        type: DataTypes.STRING(20),
        defaultValue: 'piece',
        comment: 'e.g., kg, liter, piece, box'
    },
    option_groups: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: 'Modifiers / variants configuration for POS ordering'
    }
}, {
    tableName: 'menu',
    timestamps: true,
    underscored: true
})

module.exports = Menu
