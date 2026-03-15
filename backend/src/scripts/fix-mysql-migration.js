/**
 * Fix Migration: Add partial receiving support for MySQL
 * Force execute MySQL commands
 */

require('dotenv').config()
const { sequelize } = require('../config/database')


async function migrate() {
    console.log(`📦 Running FIX migration for MySQL...`)

    try {
        // 1. Add quantity_received to purchase_receipt_items
        try {
            await sequelize.query(`
                ALTER TABLE purchase_receipt_items 
                ADD COLUMN quantity_received DECIMAL(10,2) NOT NULL DEFAULT 0
                AFTER quantity
            `)
            console.log('✅ Added quantity_received column to purchase_receipt_items')
        } catch (e) {
            if (e.original && e.original.code === 'ER_DUP_FIELDNAME') {
                console.log('⏭️ quantity_received column already exists')
            } else {
                console.log('⚠️ Error adding column (might exist):', e.message)
            }
        }

        // 2. Update status ENUM to include 'partial'
        try {
            await sequelize.query(`
                ALTER TABLE purchase_receipts 
                MODIFY COLUMN status ENUM('draft', 'partial', 'received', 'cancelled') DEFAULT 'draft'
            `)
            console.log('✅ Updated status ENUM to include "partial"')
        } catch (e) {
            console.log('⚠️ Error updating status ENUM:', e.message)
        }

        // 3. Update purchase_orders status ENUM to ensure 'partial' exists
        try {
            await sequelize.query(`
                ALTER TABLE purchase_orders 
                MODIFY COLUMN status ENUM('draft', 'confirmed', 'partial', 'received', 'cancelled') DEFAULT 'draft'
            `)
            console.log('✅ Updated purchase_orders status ENUM')
        } catch (e) {
            console.log('⚠️ Error updating purchase_orders status ENUM:', e.message)
        }


        console.log('🎉 Migration complete!')
        process.exit(0)
    } catch (error) {
        console.error('❌ Migration error:', error)
        process.exit(1)
    }
}

migrate()
