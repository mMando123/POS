/**
 * Migration: Add email column to users table
 * Supports both MySQL and SQLite
 */
require('dotenv').config()
const { sequelize, getDialect } = require('../config/database')

async function migrate() {
    try {
        const dialect = getDialect()
        console.log(`Database dialect: ${dialect}`)
        console.log('Adding email column to users table...')

        if (dialect === 'mysql') {
            // MySQL: Check if column exists
            const [results] = await sequelize.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = '${process.env.DB_NAME || 'pos_restaurant'}' 
                AND TABLE_NAME = 'users' 
                AND COLUMN_NAME = 'email'
            `)

            if (results.length > 0) {
                console.log('Column email already exists, skipping...')
            } else {
                await sequelize.query(`
                    ALTER TABLE users 
                    ADD COLUMN email VARCHAR(255) NULL AFTER name_en
                `)
                console.log('✅ Column email added successfully!')
            }
        } else {
            // SQLite: Try to add column, ignore if exists
            try {
                await sequelize.query(`
                    ALTER TABLE users 
                    ADD COLUMN email VARCHAR(255) NULL
                `)
                console.log('✅ Column email added successfully!')
            } catch (err) {
                if (err.message.includes('duplicate column')) {
                    console.log('Column email already exists, skipping...')
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
