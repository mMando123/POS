/**
 * Migration: Add purchase_order_id and supplier_id to purchase_receipts
 * Links purchase receipts to purchase orders for integrated workflow
 * Auto-detects database type (MySQL or SQLite)
 */

require('dotenv').config()
const { sequelize, getDialect } = require('../config/database')

async function up() {
    const dialect = getDialect()
    console.log(`🔄 Adding columns to purchase_receipts (${dialect.toUpperCase()})...`)

    try {
        if (dialect === 'mysql') {
            // ==================== MySQL ====================
            const [columns] = await sequelize.query(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = 'purchase_receipts' 
                 AND COLUMN_NAME IN ('purchase_order_id', 'supplier_id')`
            )

            const existingColumns = columns.map(col => col.COLUMN_NAME)

            if (!existingColumns.includes('purchase_order_id')) {
                await sequelize.query(`
                    ALTER TABLE purchase_receipts 
                    ADD COLUMN purchase_order_id CHAR(36) NULL
                `)
                console.log('✅ Added purchase_order_id column')
            } else {
                console.log('⏭️ purchase_order_id column already exists')
            }

            if (!existingColumns.includes('supplier_id')) {
                await sequelize.query(`
                    ALTER TABLE purchase_receipts 
                    ADD COLUMN supplier_id CHAR(36) NULL
                `)
                console.log('✅ Added supplier_id column')
            } else {
                console.log('⏭️ supplier_id column already exists')
            }

            // Check if index exists
            const [indexes] = await sequelize.query(`
                SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'purchase_receipts' 
                AND INDEX_NAME = 'purchase_order_link_idx'
            `)

            if (indexes.length === 0) {
                await sequelize.query(`
                    CREATE INDEX purchase_order_link_idx 
                    ON purchase_receipts(purchase_order_id)
                `)
                console.log('✅ Added index for purchase_order_id')
            } else {
                console.log('⏭️ Index already exists')
            }
        } else {
            // ==================== SQLite ====================
            const tableInfo = await sequelize.query(
                `PRAGMA table_info(purchase_receipts)`,
                { type: sequelize.QueryTypes.SELECT }
            )

            const existingColumns = tableInfo.map(col => col.name)

            if (!existingColumns.includes('purchase_order_id')) {
                await sequelize.query(`
                    ALTER TABLE purchase_receipts 
                    ADD COLUMN purchase_order_id TEXT
                `)
                console.log('✅ Added purchase_order_id column')
            } else {
                console.log('⏭️ purchase_order_id column already exists')
            }

            if (!existingColumns.includes('supplier_id')) {
                await sequelize.query(`
                    ALTER TABLE purchase_receipts 
                    ADD COLUMN supplier_id TEXT
                `)
                console.log('✅ Added supplier_id column')
            } else {
                console.log('⏭️ supplier_id column already exists')
            }

            try {
                await sequelize.query(`
                    CREATE INDEX IF NOT EXISTS purchase_order_link_idx 
                    ON purchase_receipts(purchase_order_id)
                `)
                console.log('✅ Added index for purchase_order_id')
            } catch (e) {
                console.log('⏭️ Index exists or failed:', e.message)
            }
        }

        console.log('✅ Migration completed successfully!')
    } catch (error) {
        console.error('❌ Migration failed:', error.message)
        throw error
    }
}

// Run migration if called directly
if (require.main === module) {
    up()
        .then(() => {
            console.log('Done!')
            process.exit(0)
        })
        .catch((err) => {
            console.error(err)
            process.exit(1)
        })
}

module.exports = { up }
