const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * MenuIngredient (Recipe/BOM)
 * Defines ingredient lines for a composite sellable item.
 */
const MenuIngredient = sequelize.define('MenuIngredient', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    menu_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    ingredient_menu_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    quantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 1
    },
    unit: {
        type: DataTypes.STRING(30),
        allowNull: true,
        defaultValue: 'piece'
    },
    notes: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    tableName: 'menu_ingredients',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['menu_id'], name: 'menu_ingredients_menu_idx' },
        { fields: ['ingredient_menu_id'], name: 'menu_ingredients_ingredient_idx' },
        { unique: true, fields: ['menu_id', 'ingredient_menu_id'], name: 'menu_ingredients_unique_line' }
    ]
})

module.exports = MenuIngredient

