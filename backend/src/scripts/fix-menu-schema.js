const { sequelize } = require('../config/database')
const { DataTypes } = require('sequelize')

async function fixMenuSchema() {
    const queryInterface = sequelize.getQueryInterface()

    try {
        console.log('🔄 Checking Menu Table Schema...')
        const table = await queryInterface.describeTable('menu')

        const changes = []

        if (!table.item_type) {
            changes.push(() => queryInterface.addColumn('menu', 'item_type', {
                type: DataTypes.STRING, // SQLite doesn't strictly enforce ENUM
                defaultValue: 'sellable'
            }))
        }

        if (!table.unit_of_measure) {
            changes.push(() => queryInterface.addColumn('menu', 'unit_of_measure', {
                type: DataTypes.STRING(20),
                defaultValue: 'piece'
            }))
        }

        if (!table.allow_negative_stock) {
            changes.push(() => queryInterface.addColumn('menu', 'allow_negative_stock', {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            }))
        }

        if (!table.costing_method) {
            changes.push(() => queryInterface.addColumn('menu', 'costing_method', {
                type: DataTypes.STRING,
                defaultValue: 'avg'
            }))
        }

        if (!table.track_stock) {
            changes.push(() => queryInterface.addColumn('menu', 'track_stock', {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            }))
        }

        if (!table.cost_price) {
            changes.push(() => queryInterface.addColumn('menu', 'cost_price', {
                type: DataTypes.DECIMAL(10, 2),
                defaultValue: 0
            }))
        }

        if (!table.sku) {
            changes.push(() => queryInterface.addColumn('menu', 'sku', {
                type: DataTypes.STRING(50),
                allowNull: true
            }))
        }

        if (!table.barcode) {
            changes.push(() => queryInterface.addColumn('menu', 'barcode', {
                type: DataTypes.STRING(50),
                allowNull: true
            }))
        }

        if (changes.length === 0) {
            console.log('✅ Menu Schema is up to date.')
        } else {
            console.log(`⚠️ Found ${changes.length} missing columns. Migrating...`)
            for (const change of changes) {
                await change()
            }
            console.log('✅ Menu Schema updated successfully.')
        }

    } catch (error) {
        console.error('❌ Schema Fix Failed:', error)
    } finally {
        await sequelize.close()
    }
}

fixMenuSchema()
