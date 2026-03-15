const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })
const { Account, sequelize } = require('../models')
const logger = require('../services/logger')

const AUDIT_ACCOUNTS = [
    { code: '2002', name_ar: 'الموردين (دائنون)', name_en: 'Accounts Payable', account_type: 'liability', normal_balance: 'credit', parent_code: '2000', is_system: true },
    { code: '5004', name_ar: 'خسائر المخزون', name_en: 'Inventory Shrinkage', account_type: 'expense', normal_balance: 'debit', parent_code: '5000', is_system: true }
]

async function seedAuditAccounts() {
    const transaction = await sequelize.transaction()

    try {
        let created = 0
        const accountsToUpdateParents = []

        // Find parent headers first
        const liabilityHeader = await Account.findOne({ where: { code: '2000' }, transaction })
        const expenseHeader = await Account.findOne({ where: { code: '5000' }, transaction })

        const parentMap = {
            '2000': liabilityHeader ? liabilityHeader.id : null,
            '5000': expenseHeader ? expenseHeader.id : null
        }

        for (const acct of AUDIT_ACCOUNTS) {
            const [account, wasCreated] = await Account.findOrCreate({
                where: { code: acct.code },
                defaults: {
                    name_ar: acct.name_ar,
                    name_en: acct.name_en,
                    account_type: acct.account_type,
                    normal_balance: acct.normal_balance,
                    is_group: false,
                    is_system: true,
                    is_active: true,
                    current_balance: 0,
                    parent_id: parentMap[acct.parent_code]
                },
                transaction
            })

            if (wasCreated) {
                created++
                console.log(`✅ Created: ${acct.code} — ${acct.name_en} (${acct.name_ar})`)
            } else {
                console.log(`ℹ️ Exists: ${acct.code}`)
            }
        }

        await transaction.commit()
        console.log(`\n📊 Audit Accounts Seed Complete: ${created} created`)

    } catch (error) {
        await transaction.rollback()
        console.error('❌ Failed to seed Audit Accounts:', error.message)
        process.exit(1)
    }
}

// Run directly
if (require.main === module) {
    seedAuditAccounts()
        .then(() => process.exit(0))
        .catch(() => process.exit(1))
}
