const { Account, AccountDefault } = require('../models');

async function seedDefaults(companyId) {
    console.log('Seeding All Default Account Mappings...');

    const keys = [
        // Core operational defaults
        { key: 'default_cash_account', code: '1111' },
        { key: 'default_bank_account', code: '1112' },
        { key: 'default_receivable_account', code: '1121' },
        { key: 'default_inventory_account', code: '1131' },
        { key: 'default_payable_account', code: '2111' },
        { key: 'default_income_account', code: '4110' },
        { key: 'default_cogs_account', code: '5110' },

        // Tax defaults
        { key: 'default_tax_output_account', code: '2121' },
        { key: 'default_tax_input_account', code: '2122' },

        // Advance payments
        { key: 'default_advance_paid_account', code: '1122' },
        { key: 'default_advance_received_account', code: '2112' },

        // Discounts
        { key: 'default_sales_discount_account', code: '4210' },
        { key: 'default_purchase_discount_account', code: '5120' },

        // Other
        { key: 'default_write_off_account', code: '5410' },
        { key: 'default_exchange_gain_account', code: '4230' },
        { key: 'default_exchange_loss_account', code: '5420' },
        { key: 'default_rounding_account', code: '5430' },
        { key: 'default_depreciation_account', code: '5240' },
        { key: 'default_retained_earnings_account', code: '3200' }
    ];

    let created = 0;
    for (const mapping of keys) {
        const account = await Account.findOne({ where: { code: mapping.code, company_id: companyId } });
        if (!account) {
            console.warn(`⚠️ Account ${mapping.code} not found, skipping default: ${mapping.key}`);
            continue;
        }

        const exists = await AccountDefault.findOne({
            where: { key: mapping.key, company_id: companyId }
        });
        if (exists) continue; // idempotent

        await AccountDefault.create({
            company_id: companyId,
            key: mapping.key,
            account_id: account.id
        });
        created++;
    }

    console.log(`✅ Seeded ${created} default account mappings (${keys.length} total keys).`);
}

module.exports = seedDefaults;
