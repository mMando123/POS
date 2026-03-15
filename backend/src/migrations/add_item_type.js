/**
 * Migration: Add item_type column to menu table
 * Supports both MySQL and SQLite
 */
require('dotenv').config()
const { sequelize, getDialect } = require('../config/database')

async function migrate() {
    try {
        const dialect = getDialect()
        console.log(`Database dialect: ${dialect}`)
        console.log('Adding item_type column to menu table...')

        if (dialect === 'mysql') {
            // MySQL: Check if column exists
            const [results] = await sequelize.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = '${process.env.DB_NAME || 'pos_restaurant'}' 
                AND TABLE_NAME = 'menu' 
                AND COLUMN_NAME = 'item_type'
            `)

            if (results.length > 0) {
                console.log('Column item_type already exists, skipping...')
            } else {
                await sequelize.query(`
                    ALTER TABLE menu 
                    ADD COLUMN item_type ENUM('sellable', 'raw_material', 'consumable') 
                    DEFAULT 'sellable'
                `)
                console.log('✅ Column item_type added successfully!')
            }
        } else {
            // SQLite: Try to add column, ignore if exists
            try {
                await sequelize.query(`
                    ALTER TABLE menu 
                    ADD COLUMN item_type VARCHAR(20) DEFAULT 'sellable'
                `)
                console.log('✅ Column item_type added successfully!')
            } catch (err) {
                if (err.message.includes('duplicate column')) {
                    console.log('Column item_type already exists, skipping...')
                } else {
                    throw err
                }
            }
        }

        process.exit(0)
    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    }
}

migrate()
