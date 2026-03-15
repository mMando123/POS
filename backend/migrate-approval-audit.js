/**
 * Migration: Add approved_by and approved_at columns to orders table
 * For audit logging of who approved online orders
 */

const { sequelize } = require('./src/config/database')

async function migrate() {
    console.log('Starting migration: Add approval audit fields...')

    try {
        // Check if columns already exist
        const [results] = await sequelize.query(`PRAGMA table_info(orders)`)
        const columns = results.map(r => r.name)

        if (!columns.includes('approved_by')) {
            console.log('Adding approved_by column...')
            await sequelize.query(`ALTER TABLE orders ADD COLUMN approved_by TEXT`)
        } else {
            console.log('approved_by column already exists')
        }

        if (!columns.includes('approved_at')) {
            console.log('Adding approved_at column...')
            await sequelize.query(`ALTER TABLE orders ADD COLUMN approved_at DATETIME`)
        } else {
            console.log('approved_at column already exists')
        }

        console.log('✅ Migration completed successfully!')
        console.log('')
        console.log('Online Order Approval Flow:')
        console.log('  Website Order → status: pending')
        console.log('  Admin/Cashier Approval → status: approved (logged with approved_by + approved_at)')
        console.log('  Kitchen receives order → can now start preparing')
        console.log('')

    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    }

    process.exit(0)
}

migrate()
