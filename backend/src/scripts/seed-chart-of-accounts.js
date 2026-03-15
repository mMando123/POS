/**
 * Chart of Accounts Seed Script
 * 
 * ACCOUNTING LAYER (Phase 2)
 * 
 * Seeds the default Chart of Accounts (COA) following standard
 * accounting classifications. This script is IDEMPOTENT — safe to
 * run multiple times. Existing accounts are not overwritten.
 * 
 * Account Code Structure:
 *   1xxx = Assets
 *   2xxx = Liabilities
 *   3xxx = Equity
 *   4xxx = Income (Revenue)
 *   5xxx = Expenses
 * 
/**
 * Chart of Accounts Seed Script
 * 
 * ACCOUNTING LAYER (Phase 2)
 * 
 * Seeds the default Chart of Accounts (COA) following standard
 * accounting classifications. This script is IDEMPOTENT — safe to
 * run multiple times. Existing accounts are not overwritten.
 * 
 * Account Code Structure:
 *   1xxx = Assets
 *   2xxx = Liabilities
 *   3xxx = Equity
 *   4xxx = Income (Revenue)
 *   5xxx = Expenses
 * 
 * Usage: node src/scripts/seed-chart-of-accounts.js
 */

const { Account, sequelize } = require('../models')
const logger = require('../services/logger')

const DEFAULT_ACCOUNTS = [
    // ==================== ASSETS (1xxx) ====================
    { code: '1000', name_ar: 'الأصول', name_en: 'Assets', root_type: 'asset', normal_balance: 'debit', is_group: true, is_system: true },
    { code: '1001', name_ar: 'الصندوق (نقدي)', name_en: 'Cash', root_type: 'asset', account_type: 'Cash', normal_balance: 'debit', parent_code: '1000', is_system: true },
    { code: '1002', name_ar: 'البنك', name_en: 'Bank', root_type: 'asset', account_type: 'Bank', normal_balance: 'debit', parent_code: '1000', is_system: true },
    { code: '1003', name_ar: 'العملاء (مدينون)', name_en: 'Accounts Receivable', root_type: 'asset', account_type: 'Receivable', normal_balance: 'debit', parent_code: '1000', is_system: true },
    { code: '1005', name_ar: 'عهدة صندوق (صرفية)', name_en: 'Cash Drawer Float', root_type: 'asset', account_type: 'Cash', normal_balance: 'debit', parent_code: '1000', is_system: true, description: 'Opening float for shifts — FIX-13' },
    { code: '1105', name_ar: 'وسيط تحويلات بين الفروع', name_en: 'Inter-branch Clearing', root_type: 'asset', normal_balance: 'debit', parent_code: '1000', is_system: true, description: 'Reciprocal account for stock transfers — FIX-11' },
    { code: '1100', name_ar: 'المخزون', name_en: 'Inventory', root_type: 'asset', account_type: 'Stock', normal_balance: 'debit', parent_code: '1000', is_system: true },
    // FIX-04: Input VAT — ضريبة المدخلات القابلة للاسترداد
    { code: '1300', name_ar: 'ضريبة القيمة المضافة (مدخلات)', name_en: 'Input VAT', root_type: 'asset', account_type: 'Tax', normal_balance: 'debit', parent_code: '1000', is_system: true, description: 'Recoverable input VAT on purchases — FIX-04' },
    // FIX-10: Advance Payments to Suppliers
    { code: '1400', name_ar: 'دفعات مقدمة للموردين', name_en: 'Advance Payments to Suppliers', root_type: 'asset', normal_balance: 'debit', parent_code: '1000', is_system: false, description: 'Prepayments to suppliers — FIX-10' },

    // ==================== LIABILITIES (2xxx) ====================
    { code: '2000', name_ar: 'الالتزامات', name_en: 'Liabilities', root_type: 'liability', normal_balance: 'credit', is_group: true, is_system: true },
    { code: '2001', name_ar: 'ودائع العملاء', name_en: 'Customer Deposits', root_type: 'liability', normal_balance: 'credit', parent_code: '2000', is_system: true },
    { code: '2002', name_ar: 'الذمم الدائنة للموردين', name_en: 'Accounts Payable', root_type: 'liability', account_type: 'Payable', normal_balance: 'credit', parent_code: '2000', is_system: true },
    { code: '2100', name_ar: 'ضريبة القيمة المضافة مستحقة (مخرجات)', name_en: 'Output VAT Payable', root_type: 'liability', account_type: 'Tax', normal_balance: 'credit', parent_code: '2000', is_system: true, description: 'VAT collected from customers, payable to tax authority' },
    // FIX-10: Accrued Salaries Payable
    { code: '2200', name_ar: 'رواتب مستحقة الدفع', name_en: 'Accrued Salaries Payable', root_type: 'liability', normal_balance: 'credit', parent_code: '2000', is_system: false, description: 'Salaries earned but not yet paid — FIX-10' },

    // ==================== EQUITY (3xxx) ====================
    { code: '3000', name_ar: 'حقوق الملكية', name_en: 'Equity', root_type: 'equity', normal_balance: 'credit', is_group: true, is_system: true },
    { code: '3001', name_ar: 'رأس مال المالك', name_en: 'Owner Capital', root_type: 'equity', account_type: 'Equity', normal_balance: 'credit', parent_code: '3000', is_system: true },
    { code: '3002', name_ar: 'الأرباح المحتجزة', name_en: 'Retained Earnings', root_type: 'equity', account_type: 'Equity', normal_balance: 'credit', parent_code: '3000', is_system: true },

    // ==================== INCOME / REVENUE (4xxx) ====================
    { code: '4000', name_ar: 'الإيرادات', name_en: 'Income', root_type: 'income', normal_balance: 'credit', is_group: true, is_system: true },
    { code: '4001', name_ar: 'إيرادات المبيعات', name_en: 'Sales Revenue', root_type: 'income', account_type: 'Income Account', normal_balance: 'credit', parent_code: '4000', is_system: true },
    { code: '4002', name_ar: 'الخصومات الممنوحة', name_en: 'Discounts Given', root_type: 'income', account_type: 'Income Account', normal_balance: 'debit', parent_code: '4000', is_system: true, description: 'Contra-revenue account' },
    // FIX-08: Other Income
    { code: '4100', name_ar: 'إيرادات أخرى', name_en: 'Other Income', root_type: 'income', account_type: 'Income Account', normal_balance: 'credit', parent_code: '4000', is_system: true, description: 'Cash overages, non-operating income — FIX-08' },

    // ==================== EXPENSES (5xxx) ====================
    { code: '5000', name_ar: 'المصروفات', name_en: 'Expenses', root_type: 'expense', normal_balance: 'debit', is_group: true, is_system: true },
    { code: '5001', name_ar: 'تكلفة البضاعة المباعة', name_en: 'Cost of Goods Sold', root_type: 'expense', account_type: 'Cost of Goods Sold', normal_balance: 'debit', parent_code: '5000', is_system: true },
    { code: '5002', name_ar: 'خسائر المرتجعات', name_en: 'Refund Losses', root_type: 'expense', account_type: 'Expense Account', normal_balance: 'debit', parent_code: '5000', is_system: true },
    { code: '5003', name_ar: 'عجز الصندوق', name_en: 'Cash Shortage/Overage', root_type: 'expense', account_type: 'Expense Account', normal_balance: 'debit', parent_code: '5000', is_system: true },
    { code: '5004', name_ar: 'هبوط المخزون', name_en: 'Inventory Shrinkage', root_type: 'expense', account_type: 'Expense Account', normal_balance: 'debit', parent_code: '5000', is_system: true },
    { code: '5100', name_ar: 'مصروفات عامة وإدارية', name_en: 'General & Administrative Expenses', root_type: 'expense', account_type: 'Expense Account', normal_balance: 'debit', parent_code: '5000', is_system: true },
    // FIX-10: Detailed expense sub-accounts
    { code: '5101', name_ar: 'مصروف الرواتب والأجور', name_en: 'Salaries & Wages Expense', root_type: 'expense', account_type: 'Expense Account', normal_balance: 'debit', parent_code: '5000', is_system: false },
    { code: '5102', name_ar: 'مصروف الإيجار', name_en: 'Rent Expense', root_type: 'expense', account_type: 'Expense Account', normal_balance: 'debit', parent_code: '5000', is_system: false },
    { code: '5103', name_ar: 'مصروف الخدمات (كهرباء / ماء)', name_en: 'Utilities Expense', root_type: 'expense', account_type: 'Expense Account', normal_balance: 'debit', parent_code: '5000', is_system: false },
    { code: '5104', name_ar: 'مصروف التسويق والإعلان', name_en: 'Marketing & Advertising Expense', root_type: 'expense', account_type: 'Expense Account', normal_balance: 'debit', parent_code: '5000', is_system: false },
    { code: '5105', name_ar: 'مصروف الصيانة', name_en: 'Maintenance & Repairs Expense', root_type: 'expense', account_type: 'Expense Account', normal_balance: 'debit', parent_code: '5000', is_system: false },
]

async function seedChartOfAccounts() {
    const transaction = await sequelize.transaction()

    try {
        let created = 0
        let skipped = 0
        const createdCodes = new Set()

        // First pass: create accounts without parent links
        const accountMap = {}
        for (const acct of DEFAULT_ACCOUNTS) {
            const [account, wasCreated] = await Account.findOrCreate({
                where: { code: acct.code },
                defaults: {
                    name_ar: acct.name_ar,
                    name_en: acct.name_en,
                    root_type: acct.root_type,
                    account_type: acct.account_type || null,
                    normal_balance: acct.normal_balance,
                    is_group: acct.is_group || false,
                    is_system: acct.is_system || false,
                    is_active: true,
                    current_balance: 0,
                    description: acct.description || null
                },
                transaction
            })

            accountMap[acct.code] = account
            if (wasCreated) {
                created++
                createdCodes.add(acct.code)
                console.log(`  ✅ Created: ${acct.code} — ${acct.name_en} (${acct.name_ar})`)
            } else {
                skipped++
            }
        }

        // Second pass: link parent accounts.
        // Preserve custom hierarchy for existing accounts.
        // Only set parent when account was created now, or parent is still null.
        for (const acct of DEFAULT_ACCOUNTS) {
            if (acct.parent_code && accountMap[acct.parent_code]) {
                const child = accountMap[acct.code]
                const parent = accountMap[acct.parent_code]
                const shouldLinkParent = createdCodes.has(acct.code) || !child.parent_id
                if (shouldLinkParent && child.parent_id !== parent.id) {
                    await child.update({ parent_id: parent.id }, { transaction })
                }
            }
        }

        await transaction.commit()
        console.log(`\n📊 Chart of Accounts Seed Complete: ${created} created, ${skipped} already existed`)
        return { created, skipped }

    } catch (error) {
        await transaction.rollback()
        console.error('❌ Failed to seed Chart of Accounts:', error.message)
        throw error
    }
}

// Run directly or export
if (require.main === module) {
    seedChartOfAccounts()
        .then(() => process.exit(0))
        .catch(() => process.exit(1))
}

module.exports = { seedChartOfAccounts, DEFAULT_ACCOUNTS }
