/**
 * Fix script: Create missing GL tables and fix online order finalization
 */
require('dotenv').config()
const db = require('./src/models/index')

async function fix() {
    console.log('═══ Fix 1: Create missing GL tables ═══')

    // Check which GL tables exist
    const qi = db.sequelize.getQueryInterface()
    const tables = await qi.showAllTables()
    console.log('Existing tables:', tables.filter(t => t.startsWith('gl_')).join(', ') || 'NONE')

    // Sync only GL-related models
    const glModels = ['JournalEntry', 'JournalLine', 'JournalAttachment', 'GLAuditLog', 'CashDrawer']
    for (const name of glModels) {
        const model = db[name]
        if (!model) { console.log(`  ⚠️ Model ${name} not found in db exports`); continue }
        try {
            await model.sync({ alter: true })
            console.log(`  ✅ ${name} (${model.tableName}) synced`)
        } catch (e) {
            console.log(`  ❌ ${name} sync error: ${e.message.substring(0, 80)}`)
        }
    }

    // Verify
    const tablesAfter = await qi.showAllTables()
    const glTables = tablesAfter.filter(t => t.startsWith('gl_'))
    console.log('GL tables after sync:', glTables.join(', '))

    console.log('\n═══ Fix 2: Test online order finalization ═══')
    // Create a test online order and try to finalize it
    const axios = require('axios')
    const BASE = 'http://localhost:3001/api'

    try {
        // Login first
        const login = await axios.post(`${BASE}/auth/login`, { username: 'admin', password: 'admin123' })
        const TOKEN = login.data.token
        const h = { headers: { Authorization: `Bearer ${TOKEN}` } }

        // Get menu items
        const menu = await axios.get(`${BASE}/menu`, h)
        const items = (menu.data.data || []).slice(0, 1).map(m => ({ menu_id: m.id, quantity: 1 }))

        // Create online order
        const onOrder = await axios.post(`${BASE}/orders`, {
            order_type: 'online', items, payment_method: 'online',
            customer_phone: '0500009999', customer_name: 'Fix Test'
        })
        const oid = onOrder.data.data?.id
        console.log(`  Created online order: ${oid}`)

        // Flow: pending → approve → preparing → ready → handoff → complete
        await axios.post(`${BASE}/orders/${oid}/approve`, {}, h)
        console.log('  ✅ Approved')
        await axios.put(`${BASE}/orders/${oid}/status`, { status: 'preparing' }, h)
        console.log('  ✅ Preparing')
        await axios.put(`${BASE}/orders/${oid}/status`, { status: 'ready' }, h)
        console.log('  ✅ Ready')
        await axios.post(`${BASE}/orders/${oid}/handoff`, {}, h)
        console.log('  ✅ Handoff')

        // Try finalize
        try {
            const idem = `fix-online-${Date.now()}`
            const fin = await axios.post(`${BASE}/orders/${oid}/complete`, { payment_method: 'online' }, {
                headers: { ...h.headers, 'X-Idempotency-Key': idem }
            })
            console.log(`  ✅ Finalized! status=${fin.data.data?.status}`)
        } catch (finErr) {
            console.log(`  ❌ Finalize failed: ${finErr.response?.data?.message || finErr.message}`)
            // Get more details
            if (finErr.response?.data) {
                console.log(`  Error details:`, JSON.stringify(finErr.response.data).substring(0, 200))
            }

            // Check if the error is from stock deduction (unit conversion)
            const errMsg = finErr.response?.data?.message || finErr.message || ''
            if (errMsg.includes('STOCK') || errMsg.includes('INCOMPATIBLE') || errMsg.includes('خصم')) {
                console.log('  🔍 Root cause: Stock deduction issue - checking menu ingredients...')

                // Find which item has the problem
                const [ingredients] = await db.sequelize.query(
                    `SELECT mi.menu_id, mi.ingredient_menu_id, mi.quantity, mi.unit,
                            m1.name_ar AS parent_name, m1.unit_of_measure AS parent_uom,
                            m2.name_ar AS ingredient_name, m2.unit_of_measure AS ingredient_uom
                     FROM menu_ingredients mi
                     JOIN menus m1 ON m1.id = mi.menu_id
                     JOIN menus m2 ON m2.id = mi.ingredient_menu_id
                     WHERE mi.menu_id = :menuId`,
                    { replacements: { menuId: items[0].menu_id } }
                )
                console.log('  Ingredients:', JSON.stringify(ingredients, null, 2))
            }

            if (errMsg.includes('فشل إكمال الطلب')) {
                // Check server logs for the real error
                console.log('  🔍 Generic error - checking order state...')
                const [orderState] = await db.sequelize.query(
                    `SELECT id, status, payment_status, order_type, shift_id, user_id, branch_id FROM orders WHERE id = :id`,
                    { replacements: { id: oid } }
                )
                console.log('  Order state:', JSON.stringify(orderState, null, 2))
            }
        }
    } catch (e) {
        console.log(`  ❌ Test error: ${e.response?.data?.message || e.message}`)
    }

    console.log('\nDone!')
    process.exit(0)
}

fix().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
