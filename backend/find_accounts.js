require('dotenv').config()
const db = require('./src/models/index')

async function main() {
    // Find bank-like accounts
    const accs = await db.sequelize.query(
        `SELECT code, name_ar FROM gl_accounts WHERE is_group=false AND is_active=true AND (code LIKE '1002%' OR code LIKE '1003%') ORDER BY code LIMIT 10`,
        { type: db.sequelize.QueryTypes.SELECT }
    )
    console.log('Bank accounts:', JSON.stringify(accs, null, 2))

    // Check cash account too
    const cash = await db.sequelize.query(
        `SELECT code, name_ar FROM gl_accounts WHERE is_group=false AND is_active=true AND code LIKE '1001%' ORDER BY code LIMIT 10`,
        { type: db.sequelize.QueryTypes.SELECT }
    )
    console.log('Cash accounts:', JSON.stringify(cash, null, 2))

    // Check existing defaults
    const defaults = await db.sequelize.query(
        `SELECT account_key, account_id FROM gl_account_defaults WHERE is_active=true ORDER BY account_key`,
        { type: db.sequelize.QueryTypes.SELECT }
    )
    console.log('\nExisting default keys:')
    defaults.forEach(d => console.log(`  ${d.account_key} → ${d.account_id.substring(0, 8)}`))

    // Check what keys are missing
    const existingKeys = defaults.map(d => d.account_key)
    const needed = ['default_bank_account', 'default_cash_account', 'default_receivable_account', 'default_cogs_account', 'default_delivery_income_account']
    const missing = needed.filter(k => !existingKeys.includes(k))
    console.log('\nMissing keys:', missing)

    process.exit(0)
}

main().catch(e => { console.error(e.message); process.exit(1) })
