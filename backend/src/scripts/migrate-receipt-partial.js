/**
 * Migration: Add partial receiving support
 * - Add quantity_received column to purchase_receipt_items
 * - Add 'partial' to status ENUM in purchase_receipts (MySQL only)
 * 
 * Run: node src/scripts/migrate-receipt-partial.js
 */

const { sequelize } = require('../config/database')

async function migrate() {
    const dialect = sequelize.getDialect()
    console.log(`📦 Running partial receipt migration (${dialect})...`)

    try {
        // 1. Add quantity_received to purchase_receipt_items
        if (dialect === 'mysql' || dialect === 'mariadb') {
            // Check if column exists
            const [columns] = await sequelize.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'purchase_receipt_items' 
                AND COLUMN_NAME = 'quantity_received'
            `)

            if (columns.length === 0) {
                await sequelize.query(`
                    ALTER TABLE purchase_receipt_items 
                    ADD COLUMN quantity_received DECIMAL(10,2) NOT NULL DEFAULT 0
                    AFTER quantity
                `)
                console.log('✅ Added quantity_received column to purchase_receipt_items')
            } else {
                console.log('⏭️ quantity_received column already exists')
            }

            // 2. Update status ENUM to include 'partial'
            try {
                await sequelize.query(`
                    ALTER TABLE purchase_receipts 
                    MODIFY COLUMN status ENUM('draft', 'partial', 'received', 'cancelled') DEFAULT 'draft'
                `)
                console.log('✅ Updated status ENUM to include "partial"')
            } catch (e) {
                if (e.message.includes('already')) {
                    console.log('⏭️ Status ENUM already includes "partial"')
                } else {
                    console.log('⚠️ Status ENUM update:', e.message)
                }
            }
        } else {
            // SQLite - simpler approach
            try {
                await sequelize.query(`
                    ALTER TABLE purchase_receipt_items 
                    ADD COLUMN quantity_received DECIMAL(10,2) NOT NULL DEFAULT 0
                `)
                console.log('✅ Added quantity_received column')
            } catch (e) {
                if (e.message.includes('duplicate') || e.message.includes('already')) {
                    console.log('⏭️ quantity_received column already exists')
                } else {
                    throw e
                }
            }
            // SQLite doesn't enforce ENUM, so no change needed for status
            console.log('ℹ️ SQLite: status column accepts any text (no ENUM constraint)')
        }

        console.log('🎉 Migration complete!')
        process.exit(0)
    } catch (error) {
        console.error('❌ Migration error:', error)
        process.exit(1)
    }
}

migrate()
