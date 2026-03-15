require('dotenv').config()
const db = require('./src/models/index')

async function fix() {
    // Fix: orders with delivery_personnel_id but null delivery_status → set to 'assigned'
    const [, meta] = await db.sequelize.query(
        `UPDATE orders 
         SET delivery_status = 'assigned', 
             delivery_assigned_at = COALESCE(delivery_assigned_at, updated_at)
         WHERE delivery_personnel_id IS NOT NULL 
           AND (delivery_status IS NULL OR delivery_status = '')`,
        { type: db.sequelize.QueryTypes.RAW }
    )
    console.log('Fixed rows:', meta?.affectedRows || meta || 'done')

    // Verify
    const rows = await db.sequelize.query(
        'SELECT id, order_number, delivery_status, delivery_personnel_id FROM orders WHERE delivery_personnel_id IS NOT NULL LIMIT 5',
        { type: db.sequelize.QueryTypes.SELECT }
    )
    console.log('After fix:', JSON.stringify(rows, null, 2))
    process.exit(0)
}

fix().catch(e => { console.error(e.message); process.exit(1) })
