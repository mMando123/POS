/**
 * Check orders table schema
 */

const { sequelize } = require('./src/config/database')

async function checkSchema() {
    try {
        const [columns] = await sequelize.query(`PRAGMA table_info(orders)`)

        console.log('=== ORDERS TABLE SCHEMA ===')
        console.log('Columns:')
        columns.forEach(col => {
            console.log(`  ${col.name}: ${col.type} (nullable: ${col.notnull === 0})`)
        })

        // Check for user_id specifically
        const hasUserId = columns.some(col => col.name === 'user_id')
        console.log('\nuser_id column exists:', hasUserId)

        // Check recent orders
        const [orders] = await sequelize.query(`
            SELECT id, order_number, user_id, shift_id, created_at 
            FROM orders 
            ORDER BY created_at DESC 
            LIMIT 5
        `)

        console.log('\n=== RECENT ORDERS ===')
        orders.forEach(o => {
            console.log(`Order ${o.order_number}: user_id=${o.user_id}, shift_id=${o.shift_id}`)
        })

    } catch (error) {
        console.error('Error:', error)
    }

    process.exit(0)
}

checkSchema()
