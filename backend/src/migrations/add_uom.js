/**
 * Migration: Add unit_of_measure column to menu table
 * Supports both MySQL and SQLite
 */
require('dotenv').config()
const { sequelize, getDialect } = require('../config/database')

async function migrate() {
    try {
        const dialect = getDialect()
        console.log(`Database dialect: ${dialect}`)
        console.log('Adding unit_of_measure column to menu table...')

        if (dialect === 'mysql') {
            // MySQL: Check if column exists
            const [results] = await sequelize.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = '${process.env.DB_NAME || 'pos_restaurant'}' 
                AND TABLE_NAME = 'menu' 
                AND COLUMN_NAME = 'unit_of_measure'
            `)

            if (results.length > 0) {
                console.log('Column unit_of_measure already exists, skipping...')
            } else {
                await sequelize.query(`
                    ALTER TABLE menu 
                    ADD COLUMN unit_of_measure VARCHAR(20) DEFAULT 'piece'
                `)
                console.log('✅ Column unit_of_measure added successfully!')
            }
        } else {
            // SQLite: Try to add column, ignore if exists
            try {
                await sequelize.query(`
                    ALTER TABLE menu 
                    ADD COLUMN unit_of_measure VARCHAR(20) DEFAULT 'piece'
                `)
                console.log('✅ Column unit_of_measure added successfully!')
            } catch (err) {
                if (err.message.includes('duplicate column')) {
                    console.log('Column unit_of_measure already exists, skipping...')
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
