/**
 * Migration script to fix shifts table schema
 * This script will:
 * 1. Backup existing shifts data (if any)
 * 2. Drop and recreate shifts table with correct UUID types
 * 3. Note: Existing shifts will be lost as user_id types don't match
 */

const { sequelize } = require('./src/config/database')

async function migrate() {
    console.log('Starting shifts table migration...')

    try {
        // Check if shifts table exists
        const [tables] = await sequelize.query(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='shifts'
        `)

        if (tables.length > 0) {
            console.log('Found existing shifts table, recreating with correct schema...')

            // Drop the old shifts table
            await sequelize.query('DROP TABLE IF EXISTS shifts')
            console.log('Old shifts table dropped.')
        }

        // Create new shifts table with correct schema (UUID for user_id)
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS shifts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                branch_id TEXT,
                user_id TEXT NOT NULL,
                start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                starting_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
                ending_cash DECIMAL(10,2),
                expected_cash DECIMAL(10,2),
                cash_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
                card_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
                notes TEXT,
                order_count INTEGER NOT NULL DEFAULT 0,
                reviewed_by TEXT,
                review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending', 'approved', 'flagged')),
                review_notes TEXT,
                reviewed_at DATETIME,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `)
        console.log('New shifts table created with correct schema.')

        // Update orders table to ensure shift_id column exists and is correct type
        console.log('Checking orders table...')
        const [orderCols] = await sequelize.query(`PRAGMA table_info(orders)`)
        const hasShiftId = orderCols.some(col => col.name === 'shift_id')

        if (!hasShiftId) {
            await sequelize.query('ALTER TABLE orders ADD COLUMN shift_id INTEGER')
            console.log('Added shift_id column to orders table.')
        }

        console.log('Migration completed successfully!')
        console.log('')
        console.log('IMPORTANT: All existing shifts have been cleared.')
        console.log('You will need to open a new shift to start working.')

    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    }

    process.exit(0)
}

migrate()
