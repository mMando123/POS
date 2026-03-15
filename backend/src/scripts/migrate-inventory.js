/**
 * Migration script to add inventory columns to menu table
 * Run this once to update the database schema
 */

const { sequelize } = require('../config/database')

async function migrate() {
    console.log('🚀 Starting inventory migration...')

    try {
        // Check if columns already exist
        const [menuColumns] = await sequelize.query(`PRAGMA table_info(menu);`)
        const existingColumns = menuColumns.map(c => c.name)

        console.log('Existing columns:', existingColumns)

        // Add missing columns to menu table
        const columnsToAdd = [
            { name: 'sku', sql: `ALTER TABLE menu ADD COLUMN sku VARCHAR(50);` },
            { name: 'barcode', sql: `ALTER TABLE menu ADD COLUMN barcode VARCHAR(50);` },
            { name: 'cost_price', sql: `ALTER TABLE menu ADD COLUMN cost_price DECIMAL(10,2) DEFAULT 0;` },
            { name: 'track_stock', sql: `ALTER TABLE menu ADD COLUMN track_stock TINYINT(1) DEFAULT 0;` },
            { name: 'costing_method', sql: `ALTER TABLE menu ADD COLUMN costing_method TEXT DEFAULT 'avg';` },
            { name: 'allow_negative_stock', sql: `ALTER TABLE menu ADD COLUMN allow_negative_stock TINYINT(1) DEFAULT 0;` }
        ]

        for (const col of columnsToAdd) {
            if (!existingColumns.includes(col.name)) {
                console.log(`Adding column: ${col.name}`)
                await sequelize.query(col.sql)
                console.log(`✅ Added ${col.name}`)
            } else {
                console.log(`⏭️  Column ${col.name} already exists`)
            }
        }

        // Clean up any leftover backup tables from failed migrations
        const [tables] = await sequelize.query(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_backup';`)
        for (const table of tables) {
            console.log(`🧹 Cleaning up backup table: ${table.name}`)
            await sequelize.query(`DROP TABLE IF EXISTS "${table.name}";`)
        }

        console.log('✅ Migration completed successfully!')
        process.exit(0)
    } catch (error) {
        console.error('❌ Migration failed:', error)
        process.exit(1)
    }
}

migrate()
