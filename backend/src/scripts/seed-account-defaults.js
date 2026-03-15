/**
 * Seed Account Defaults â€” Maps functional keys to existing COA accounts
 * 
 * ACCOUNTING LAYER (Phase 3) â€” ERP-Ready Infrastructure
 * 
 * This script populates the gl_account_defaults table with global defaults
 * based on the existing Chart of Accounts. It bridges the old hard-coded
 * ACCOUNTS constant with the new dynamic AccountResolver system.
 * 
 * IDEMPOTENT: Safe to run multiple times. Existing mappings are not overwritten.
 * 
 * Usage: node src/scripts/seed-account-defaults.js
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { Account, AccountDefault, sequelize } = require('../models')
const { ACCOUNT_KEYS, LEGACY_ACCOUNTS } = require('../services/accountResolver')
const logger = require('../services/logger')

// Human-readable descriptions for each key
const KEY_DESCRIPTIONS = {
    'default_cash_account': 'Ø­Ø³Ø§Ø¨ Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ â€” ÙŠÙØ³ØªØ®Ø¯Ù… Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ù…Ù‚Ø¨ÙˆØ¶Ø§Øª ÙˆØ§Ù„Ù…Ø¯ÙÙˆØ¹Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©',
    'default_bank_account': 'Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ â€” ÙŠÙØ³ØªØ®Ø¯Ù… Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ù…Ø¯ÙÙˆØ¹Ø§Øª Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠØ© ÙˆØ§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª',
    'default_receivable_account': 'Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ (Ø§Ù„Ù…Ø¯ÙŠÙ†ÙˆÙ†) â€” Ø£Ø±ØµØ¯Ø© Ù…Ø³ØªØ­Ù‚Ø© Ù…Ù† Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡',
    'default_drawer_float_account': 'Ø­Ø³Ø§Ø¨ Ø¹Ù‡Ø¯Ø© Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ â€” Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ Ù„Ù„ÙˆØ±Ø¯ÙŠØ§Øª',
    'default_clearing_account': 'Ø­Ø³Ø§Ø¨ ÙˆØ³ÙŠØ· Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª Ø¨ÙŠÙ† Ø§Ù„ÙØ±ÙˆØ¹ â€” Ù„Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª Ø§Ù„Ø¯Ø§Ø®Ù„ÙŠØ©',
    'default_stock_in_hand_account': 'Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† â€” Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© Ø§Ù„Ù…ØªØ§Ø­Ø© Ù„Ù„Ø¨ÙŠØ¹',
    'default_input_vat_account': 'Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù…Ø¯Ø®Ù„Ø§Øª â€” VAT Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„Ø§Ø³ØªØ±Ø¯Ø§Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª',
    'default_advance_payment_account': 'Ø¯ÙØ¹Ø§Øª Ù…Ù‚Ø¯Ù…Ø© Ù„Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† â€” Ù…Ø¨Ø§Ù„Øº Ù…Ø¯ÙÙˆØ¹Ø© Ù‚Ø¨Ù„ Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø©',
    'default_customer_deposit_account': 'ÙˆØ¯Ø§Ø¦Ø¹ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ â€” Ù…Ø¨Ø§Ù„Øº Ù…Ø³ØªÙ„Ù…Ø© Ù…Ù‚Ø¯Ù…Ø§Ù‹ Ù…Ù† Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡',
    'default_payable_account': 'Ø§Ù„Ø°Ù…Ù… Ø§Ù„Ø¯Ø§Ø¦Ù†Ø© â€” Ù…Ø¨Ø§Ù„Øº Ù…Ø³ØªØ­Ù‚Ø© Ù„Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†',
    'default_output_vat_account': 'Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù…Ø®Ø±Ø¬Ø§Øª â€” VAT Ù…Ø­ØµÙ„Ø© Ù…Ù† Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆÙ…Ø³ØªØ­Ù‚Ø© Ù„Ù„Ù‡ÙŠØ¦Ø©',
    'default_capital_account': 'Ø±Ø£Ø³ Ù…Ø§Ù„ Ø§Ù„Ù…Ø§Ù„Ùƒ â€” Ø­Ù‚ÙˆÙ‚ Ù…Ù„ÙƒÙŠØ© Ø§Ù„Ù…Ø§Ù„Ùƒ',
    'default_retained_earnings_account': 'Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø­ØªØ¬Ø²Ø© â€” Ø£Ø±Ø¨Ø§Ø­ Ù…Ø±Ø­Ù‘Ù„Ø© Ù…Ù† Ø³Ù†ÙˆØ§Øª Ø³Ø§Ø¨Ù‚Ø©',
    'default_income_account': 'Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª â€” Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª',
    'default_discount_account': 'Ø§Ù„Ø®ØµÙˆÙ…Ø§Øª Ø§Ù„Ù…Ù…Ù†ÙˆØ­Ø© â€” Ø­Ø³Ø§Ø¨ Ù…Ù‚Ø§Ø¨Ù„ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª (contra-revenue)',
    'default_other_income_account': 'Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø£Ø®Ø±Ù‰ â€” ÙÙˆØ§Ø¦Ø¶ Ù†Ù‚Ø¯ÙŠØ© ÙˆØ¥ÙŠØ±Ø§Ø¯Ø§Øª ØºÙŠØ± ØªØ´ØºÙŠÙ„ÙŠØ©',
    'default_cogs_account': 'ØªÙƒÙ„ÙØ© Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© Ø§Ù„Ù…Ø¨Ø§Ø¹Ø© (COGS) â€” ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª Ø§Ù„Ù…Ø¨Ø§Ø¹Ø©',
    'default_refund_expense_account': 'Ø®Ø³Ø§Ø¦Ø± Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§Øª â€” ØªÙƒÙ„ÙØ© Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© Ø§Ù„Ù…ÙØ±Ø¬Ø¹Ø©',
    'default_cash_shortage_account': 'Ø¹Ø¬Ø²/ÙØ§Ø¦Ø¶ Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ â€” ÙØ±ÙˆÙ‚Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ Ø¹Ù†Ø¯ Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©',
    'default_shrinkage_account': 'Ù‡Ø¨ÙˆØ· Ø§Ù„Ù…Ø®Ø²ÙˆÙ† â€” ØªÙ„Ù Ø£Ùˆ Ø³Ø±Ù‚Ø© Ø£Ùˆ ÙÙ‚Ø¯Ø§Ù† Ø¨Ø¶Ø§Ø¹Ø©',
    'default_general_expense_account': 'Ù…ØµØ±ÙˆÙØ§Øª Ø¹Ø§Ù…Ø© ÙˆØ¥Ø¯Ø§Ø±ÙŠØ© â€” Ù…ØµØ±ÙˆÙØ§Øª ØºÙŠØ± Ù…ØµÙ†ÙØ©',
    'default_salaries_expense_account': 'Ù…ØµØ±ÙˆÙ Ø§Ù„Ø±ÙˆØ§ØªØ¨ ÙˆØ§Ù„Ø£Ø¬ÙˆØ±',
    'default_rent_expense_account': 'Ù…ØµØ±ÙˆÙ Ø§Ù„Ø¥ÙŠØ¬Ø§Ø±',
    'default_utilities_expense_account': 'Ù…ØµØ±ÙˆÙ Ø§Ù„Ø®Ø¯Ù…Ø§Øª (ÙƒÙ‡Ø±Ø¨Ø§Ø¡/Ù…Ø§Ø¡/Ø§Ù†ØªØ±Ù†Øª)',
    'default_marketing_expense_account': 'Ù…ØµØ±ÙˆÙ Ø§Ù„ØªØ³ÙˆÙŠÙ‚ ÙˆØ§Ù„Ø¥Ø¹Ù„Ø§Ù†',
    'default_maintenance_expense_account': 'Ù…ØµØ±ÙˆÙ Ø§Ù„ØµÙŠØ§Ù†Ø© ÙˆØ§Ù„Ø¥ØµÙ„Ø§Ø­Ø§Øª',
}

async function seedAccountDefaults() {
    const transaction = await sequelize.transaction()

    try {
        let created = 0
        let skipped = 0
        let corrected = 0
        let errors = 0

        console.log('\nðŸ“’ Seeding Account Defaults (Phase 3 â€” ERP-Ready)...\n')

        // Build a map of all existing accounts by code
        const accounts = await Account.findAll({
            where: { is_active: true },
            transaction
        })
        const accountByCode = {}
        for (const acc of accounts) {
            accountByCode[acc.code] = acc
        }

        const resolvePreferredAccount = (legacyCode) => {
            const direct = accountByCode[legacyCode]
            if (direct && direct.is_active && !direct.is_group) {
                return direct
            }

            const familyPrefix = `${legacyCode}-`
            const candidates = accounts
                .filter(a => a.code.startsWith(familyPrefix) && a.is_active && !a.is_group)
                .sort((a, b) => a.code.localeCompare(b.code))
            return candidates[0] || null
        }

        // Iterate through all ACCOUNT_KEYS and create/repair global defaults
        for (const [keyName, accountKey] of Object.entries(ACCOUNT_KEYS)) {
            const legacyCode = LEGACY_ACCOUNTS[accountKey]

            if (!legacyCode) {
                console.log(`  âš ï¸  SKIP: ${keyName} (${accountKey}) â€” no legacy code defined`)
                errors++
                continue
            }

            const account = resolvePreferredAccount(legacyCode)
            if (!account) {
                console.log(`  âš ï¸  SKIP: ${keyName} â†’ ${legacyCode} â€” no active posting account found in COA`)
                errors++
                continue
            }

            // Ensure global default (company=null, branch=null) exists and is valid.
            // FIX H-03: We now CORRECT invalid existing mappings (e.g., header account).
            const existing = await AccountDefault.findOne({
                where: {
                    account_key: accountKey,
                    company_id: null,
                    branch_id: null
                },
                include: [{ model: Account, as: 'account', attributes: ['id', 'code', 'is_group', 'is_active'] }],
                transaction
            })

            if (!existing) {
                await AccountDefault.create({
                    account_key: accountKey,
                    account_id: account.id,
                    company_id: null,
                    branch_id: null,
                    description: KEY_DESCRIPTIONS[accountKey] || `Default: ${keyName}`,
                    is_active: true
                }, { transaction })
                created++
                console.log(`  âœ… CREATED ${keyName.padEnd(25)} â†’ ${account.code} (${account.name_ar})`)
                continue
            }

            const mappedAccount = existing.account
            const isInvalidTarget =
                !mappedAccount ||
                mappedAccount.is_group ||
                !mappedAccount.is_active

            // Keep valid existing custom mappings.
            // Only repair if mapping target is invalid/inactive.
            const needsUpdate =
                isInvalidTarget ||
                existing.is_active !== true

            if (needsUpdate) {
                await existing.update({
                    account_id: account.id,
                    description: KEY_DESCRIPTIONS[accountKey] || existing.description,
                    is_active: true
                }, { transaction })
                corrected++
                console.log(`  ðŸ”§ CORRECTED ${keyName.padEnd(25)} â†’ ${account.code} (${account.name_ar})`)
            } else {
                skipped++
            }
        }

        await transaction.commit()

        console.log(`\nðŸ“Š Account Defaults Seed Complete:`)
        console.log(`   âœ… Created: ${created}`)
        console.log(`   ðŸ”§ Corrected: ${corrected}`)
        console.log(`   â­ï¸  Skipped: ${skipped} (already existed)`)
        if (errors > 0) {
            console.log(`   âš ï¸  Errors:  ${errors}`)
        }
        console.log(`\nðŸ’¡ The system will now use dynamic account resolution.`)
        console.log(`   Legacy hard-coded accounts remain as fallback.\n`)

        return { created, corrected, skipped, errors }

    } catch (error) {
        await transaction.rollback()
        console.error('âŒ Failed to seed Account Defaults:', error.message)
        throw error
    }
}

// Run directly or export
if (require.main === module) {
    seedAccountDefaults()
        .then(() => process.exit(0))
        .catch(() => process.exit(1))
}

module.exports = { seedAccountDefaults }

