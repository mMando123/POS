/**
 * Fix DEF-002: Add missing GL account defaults
 *  - default_bank_account
 *  - default_delivery_income_account
 */
require('dotenv').config()
const { v4: uuidv4 } = require('uuid')
const db = require('./src/models/index')

async function fix() {
    const qi = db.sequelize.getQueryInterface()

    // ═══ Step 1: Create bank account (1002) if it doesn't exist ═══
    console.log('═══ Step 1: Ensure bank account exists ═══')
    const [bankAcc] = await db.sequelize.query(
        `SELECT id, code, name_ar FROM gl_accounts WHERE code = '1002' LIMIT 1`,
        { type: db.sequelize.QueryTypes.SELECT }
    ).then(r => [r[0]])

    let bankAccountId
    if (bankAcc) {
        bankAccountId = bankAcc.id
        console.log(`  ✅ Bank account already exists: ${bankAcc.code} - ${bankAcc.name_ar} (${bankAcc.id.substring(0, 8)})`)

        // Make sure it's not a group and is active
        await db.sequelize.query(
            `UPDATE gl_accounts SET is_group = false, is_active = true WHERE id = :id`,
            { replacements: { id: bankAccountId } }
        )
    } else {
        // Find the parent account for bank (1xxx assets)
        const [parent] = await db.sequelize.query(
            `SELECT id FROM gl_accounts WHERE code = '1000' LIMIT 1`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).then(r => [r[0]])

        bankAccountId = uuidv4()
        const [company] = await db.sequelize.query(
            `SELECT id FROM companies LIMIT 1`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).then(r => [r[0]])

        await db.sequelize.query(
            `INSERT INTO gl_accounts (id, code, name_ar, name_en, root_type, account_type, normal_balance, parent_id, is_group, company_id, is_active, is_system, current_balance, description, created_at, updated_at)
             VALUES (:id, '1002', 'البنك', 'Bank', 'asset', 'bank', 'debit', :parentId, false, :companyId, true, true, 0, 'حساب البنك الرئيسي للمدفوعات الإلكترونية', NOW(), NOW())`,
            { replacements: { id: bankAccountId, parentId: parent?.id || null, companyId: company?.id || null } }
        )
        console.log(`  ✅ Created bank account: 1002 - البنك (${bankAccountId.substring(0, 8)})`)
    }

    // ═══ Step 2: Create delivery income account (4002) if needed ═══
    console.log('\n═══ Step 2: Ensure delivery income account exists ═══')
    const [deliveryAcc] = await db.sequelize.query(
        `SELECT id, code, name_ar FROM gl_accounts WHERE code = '4002' LIMIT 1`,
        { type: db.sequelize.QueryTypes.SELECT }
    ).then(r => [r[0]])

    let deliveryAccountId
    if (deliveryAcc) {
        deliveryAccountId = deliveryAcc.id
        console.log(`  ✅ Delivery income account exists: ${deliveryAcc.code} - ${deliveryAcc.name_ar} (${deliveryAcc.id.substring(0, 8)})`)
        await db.sequelize.query(
            `UPDATE gl_accounts SET is_group = false, is_active = true WHERE id = :id`,
            { replacements: { id: deliveryAccountId } }
        )
    } else {
        const [parent] = await db.sequelize.query(
            `SELECT id FROM gl_accounts WHERE code = '4000' LIMIT 1`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).then(r => [r[0]])

        const [company] = await db.sequelize.query(
            `SELECT id FROM companies LIMIT 1`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).then(r => [r[0]])

        deliveryAccountId = uuidv4()
        await db.sequelize.query(
            `INSERT INTO gl_accounts (id, code, name_ar, name_en, root_type, account_type, normal_balance, parent_id, is_group, company_id, is_active, is_system, current_balance, description, created_at, updated_at)
             VALUES (:id, '4002', 'إيرادات التوصيل', 'Delivery Income', 'income', 'income', 'credit', :parentId, false, :companyId, true, true, 0, 'إيرادات رسوم التوصيل', NOW(), NOW())`,
            { replacements: { id: deliveryAccountId, parentId: parent?.id || null, companyId: company?.id || null } }
        )
        console.log(`  ✅ Created delivery income account: 4002 - إيرادات التوصيل (${deliveryAccountId.substring(0, 8)})`)
    }

    // ═══ Step 3: Add default_bank_account mapping ═══
    console.log('\n═══ Step 3: Add missing default mappings ═══')

    const mappings = [
        { key: 'default_bank_account', accountId: bankAccountId, desc: 'حساب البنك الافتراضي للمدفوعات الإلكترونية' },
        { key: 'default_delivery_income_account', accountId: deliveryAccountId, desc: 'حساب إيرادات التوصيل الافتراضي' }
    ]

    for (const m of mappings) {
        const [existing] = await db.sequelize.query(
            `SELECT id FROM gl_account_defaults WHERE account_key = :key LIMIT 1`,
            { replacements: { key: m.key }, type: db.sequelize.QueryTypes.SELECT }
        ).then(r => [r[0]])

        if (existing) {
            await db.sequelize.query(
                `UPDATE gl_account_defaults SET account_id = :accountId, is_active = true, updated_at = NOW() WHERE account_key = :key`,
                { replacements: { accountId: m.accountId, key: m.key } }
            )
            console.log(`  🔄 Updated ${m.key} → ${m.accountId.substring(0, 8)}`)
        } else {
            await db.sequelize.query(
                `INSERT INTO gl_account_defaults (id, account_key, account_id, company_id, branch_id, description, is_active, created_at, updated_at)
                 VALUES (:id, :key, :accountId, NULL, NULL, :desc, true, NOW(), NOW())`,
                { replacements: { id: uuidv4(), key: m.key, accountId: m.accountId, desc: m.desc } }
            )
            console.log(`  ✅ Added ${m.key} → ${m.accountId.substring(0, 8)}`)
        }
    }

    // ═══ Step 4: Verify ═══
    console.log('\n═══ Step 4: Verify all defaults ═══')
    const allDefaults = await db.sequelize.query(
        `SELECT d.account_key, a.code, a.name_ar 
         FROM gl_account_defaults d 
         JOIN gl_accounts a ON a.id = d.account_id 
         WHERE d.is_active = true 
         ORDER BY d.account_key`,
        { type: db.sequelize.QueryTypes.SELECT }
    )
    allDefaults.forEach(d => console.log(`  ${d.account_key} → ${d.code} (${d.name_ar})`))

    // ═══ Step 5: Test online order finalize again ═══
    console.log('\n═══ Step 5: Re-test online order finalization ═══')
    const axios = require('axios')
    const BASE = 'http://localhost:3001/api'

    try {
        const login = await axios.post(`${BASE}/auth/login`, { username: 'admin', password: 'admin123' })
        const TOKEN = login.data.token
        const h = { headers: { Authorization: `Bearer ${TOKEN}` } }

        const menu = await axios.get(`${BASE}/menu`, h)
        const items = (menu.data.data || []).slice(0, 1).map(m => ({ menu_id: m.id, quantity: 1 }))

        const onOrder = await axios.post(`${BASE}/orders`, {
            order_type: 'online', items, payment_method: 'online',
            customer_phone: '0500009999', customer_name: 'Fix Verify Test'
        })
        const oid = onOrder.data.data?.id
        console.log(`  Created online order: ${oid?.substring(0, 8)}`)

        await axios.post(`${BASE}/orders/${oid}/approve`, {}, h)
        await axios.put(`${BASE}/orders/${oid}/status`, { status: 'preparing' }, h)
        await axios.put(`${BASE}/orders/${oid}/status`, { status: 'ready' }, h)
        await axios.post(`${BASE}/orders/${oid}/handoff`, {}, h)
        console.log('  ✅ Status flow complete (approve→preparing→ready→handoff)')

        const idem = `fix-verify-${Date.now()}`
        const fin = await axios.post(`${BASE}/orders/${oid}/complete`, { payment_method: 'online' }, {
            headers: { ...h.headers, 'X-Idempotency-Key': idem }
        })
        console.log(`  ✅ FINALIZED! status=${fin.data.data?.status}, payment=${fin.data.data?.payment_status}`)

        // Check journal entry was created
        const je = await db.sequelize.query(
            `SELECT je.entry_number, je.description, je.total_amount, je.source_type, je.source_id
             FROM gl_journal_entries je 
             WHERE je.source_type = 'order' AND je.source_id = :id`,
            { replacements: { id: oid }, type: db.sequelize.QueryTypes.SELECT }
        )
        if (je.length > 0) {
            console.log(`  ✅ Journal Entry created: ${je[0].entry_number} — ${je[0].description.substring(0, 40)}`)
        } else {
            console.log(`  ⚠️ No journal entry found (check if accounting is non-blocking)`)
        }
    } catch (e) {
        console.log(`  ❌ Still failing: ${e.response?.data?.message || e.message}`)
        if (e.response?.data) console.log(`  Details:`, JSON.stringify(e.response.data).substring(0, 200))
    }

    console.log('\n✅ All fixes applied!')
    process.exit(0)
}

fix().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
