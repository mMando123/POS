/**
 * COA Header/Subaccount Migration Script
 *
 * Safe by default:
 *   - Dry-run unless --apply is provided
 *   - Optional header promotion via --promote-headers
 *   - Optional defaults remap via --remap-defaults
 *
 * Usage examples:
 *   node src/scripts/migrate-coa-header-subaccounts.js
 *   node src/scripts/migrate-coa-header-subaccounts.js --apply
 *   node src/scripts/migrate-coa-header-subaccounts.js --apply --promote-headers --remap-defaults
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize, Account, AccountDefault } = require('../models')
const { ACCOUNT_KEYS } = require('../services/accountResolver')

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const PROMOTE_HEADERS = args.has('--promote-headers')
const REMAP_DEFAULTS = args.has('--remap-defaults')

const TARGET_ACCOUNTS = [
    // Assets
    { code: '1001', name_ar: 'الصندوق', name_en: 'Cash', account_type: 'asset', normal_balance: 'debit', parent_code: '1000', is_header: true },
    { code: '1001-01', name_ar: 'صندوق الفرع الرئيسي', name_en: 'Main Branch Cash', account_type: 'asset', normal_balance: 'debit', parent_code: '1001' },
    { code: '1001-02', name_ar: 'صندوق فرع 2', name_en: 'Branch 2 Cash', account_type: 'asset', normal_balance: 'debit', parent_code: '1001' },
    { code: '1001-03', name_ar: 'عهدة الوردية', name_en: 'Drawer Float', account_type: 'asset', normal_balance: 'debit', parent_code: '1001' },

    { code: '1002', name_ar: 'البنوك', name_en: 'Banks', account_type: 'asset', normal_balance: 'debit', parent_code: '1000', is_header: true },
    { code: '1002-01', name_ar: 'بنك CIB', name_en: 'CIB Bank', account_type: 'asset', normal_balance: 'debit', parent_code: '1002' },
    { code: '1002-02', name_ar: 'البنك الأهلي', name_en: 'NBE Bank', account_type: 'asset', normal_balance: 'debit', parent_code: '1002' },
    { code: '1002-03', name_ar: 'بنك الراجحي', name_en: 'Al Rajhi Bank', account_type: 'asset', normal_balance: 'debit', parent_code: '1002' },
    { code: '1002-04', name_ar: 'بنك القاهرة', name_en: 'Banque du Caire', account_type: 'asset', normal_balance: 'debit', parent_code: '1002' },

    { code: '1105', name_ar: 'مقاصة تحويلات الفروع', name_en: 'Inter-branch Clearing', account_type: 'asset', normal_balance: 'debit', parent_code: '1000', is_header: true },
    { code: '1105-01', name_ar: 'مقاصة صادرة', name_en: 'Outgoing Clearing', account_type: 'asset', normal_balance: 'debit', parent_code: '1105' },
    { code: '1105-02', name_ar: 'مقاصة واردة', name_en: 'Incoming Clearing', account_type: 'asset', normal_balance: 'debit', parent_code: '1105' },

    { code: '1300', name_ar: 'ضريبة المدخلات', name_en: 'Input VAT', account_type: 'asset', normal_balance: 'debit', parent_code: '1000', is_header: true },
    { code: '1300-01', name_ar: 'ضريبة مشتريات محلية', name_en: 'Local Purchase VAT', account_type: 'asset', normal_balance: 'debit', parent_code: '1300' },
    { code: '1300-02', name_ar: 'ضريبة استيراد', name_en: 'Import VAT', account_type: 'asset', normal_balance: 'debit', parent_code: '1300' },

    { code: '1400', name_ar: 'دفعات مقدمة للموردين', name_en: 'Advance Payments to Suppliers', account_type: 'asset', normal_balance: 'debit', parent_code: '1000', is_header: true },
    { code: '1400-01', name_ar: 'دفعة مقدمة - مورد', name_en: 'Supplier Advance', account_type: 'asset', normal_balance: 'debit', parent_code: '1400' },

    // Liabilities
    { code: '2100', name_ar: 'ضريبة المخرجات المستحقة', name_en: 'Output VAT Payable', account_type: 'liability', normal_balance: 'credit', parent_code: '2000', is_header: true },
    { code: '2100-01', name_ar: 'VAT مبيعات محلية', name_en: 'Local Sales VAT', account_type: 'liability', normal_balance: 'credit', parent_code: '2100' },
    { code: '2100-02', name_ar: 'VAT خدمات', name_en: 'Services VAT', account_type: 'liability', normal_balance: 'credit', parent_code: '2100' },

    { code: '2300', name_ar: 'دفعات مقدمة وودائع العملاء', name_en: 'Customer Advances and Deposits', account_type: 'liability', normal_balance: 'credit', parent_code: '2000', is_header: true },
    { code: '2300-01', name_ar: 'عربون عميل', name_en: 'Customer Advance', account_type: 'liability', normal_balance: 'credit', parent_code: '2300' },
    { code: '2300-02', name_ar: 'وديعة عميل', name_en: 'Customer Deposit', account_type: 'liability', normal_balance: 'credit', parent_code: '2300' },

    // Income
    { code: '4001', name_ar: 'إيراد المبيعات', name_en: 'Sales Revenue', account_type: 'income', normal_balance: 'credit', parent_code: '4000', is_header: true },
    { code: '4001-01', name_ar: 'مبيعات نقدية', name_en: 'Cash Sales', account_type: 'income', normal_balance: 'credit', parent_code: '4001' },
    { code: '4001-02', name_ar: 'مبيعات آجلة', name_en: 'Credit Sales', account_type: 'income', normal_balance: 'credit', parent_code: '4001' },

    { code: '4002', name_ar: 'الخصومات الممنوحة', name_en: 'Discounts Given', account_type: 'income', normal_balance: 'debit', parent_code: '4000', is_header: true },
    { code: '4002-01', name_ar: 'خصومات نقدية', name_en: 'Cash Discounts', account_type: 'income', normal_balance: 'debit', parent_code: '4002' },
    { code: '4002-02', name_ar: 'خصومات ترويجية', name_en: 'Promotional Discounts', account_type: 'income', normal_balance: 'debit', parent_code: '4002' },
    { code: '4002-03', name_ar: 'خصومات موظفين', name_en: 'Staff Discounts', account_type: 'income', normal_balance: 'debit', parent_code: '4002' },

    { code: '4100', name_ar: 'إيرادات أخرى', name_en: 'Other Income', account_type: 'income', normal_balance: 'credit', parent_code: '4000', is_header: true },
    { code: '4100-01', name_ar: 'فوائض نقدية', name_en: 'Cash Overages', account_type: 'income', normal_balance: 'credit', parent_code: '4100' },
    { code: '4100-02', name_ar: 'إيرادات متنوعة', name_en: 'Miscellaneous Income', account_type: 'income', normal_balance: 'credit', parent_code: '4100' },

    // Expenses
    { code: '5001', name_ar: 'تكلفة البضاعة المباعة', name_en: 'COGS', account_type: 'expense', normal_balance: 'debit', parent_code: '5000', is_header: true },
    { code: '5001-01', name_ar: 'تكلفة مبيعات - غذائية', name_en: 'COGS - Food', account_type: 'expense', normal_balance: 'debit', parent_code: '5001' },
    { code: '5001-02', name_ar: 'تكلفة مبيعات - إلكترونيات', name_en: 'COGS - Electronics', account_type: 'expense', normal_balance: 'debit', parent_code: '5001' },
    { code: '5001-03', name_ar: 'خسائر المرتجعات', name_en: 'Refund Losses', account_type: 'expense', normal_balance: 'debit', parent_code: '5001' },

    { code: '5100', name_ar: 'مصروفات تشغيلية', name_en: 'Operating Expenses', account_type: 'expense', normal_balance: 'debit', parent_code: '5000', is_header: true },
    { code: '5100-01', name_ar: 'مصروفات تشغيلية عامة', name_en: 'General Operating Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5100' },
    { code: '5101', name_ar: 'مصروف الرواتب والأجور', name_en: 'Salaries and Wages', account_type: 'expense', normal_balance: 'debit', parent_code: '5100' },
    { code: '5102', name_ar: 'مصروف الإيجار', name_en: 'Rent Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5100' },
    { code: '5103', name_ar: 'مصروف الخدمات', name_en: 'Utilities Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5100' },
    { code: '5104', name_ar: 'مصروف التسويق والإعلان', name_en: 'Marketing Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5100' },
    { code: '5105', name_ar: 'مصروف الصيانة', name_en: 'Maintenance Expense', account_type: 'expense', normal_balance: 'debit', parent_code: '5100' },

    { code: '5200', name_ar: 'مصروفات صندوق وهبوط مخزون', name_en: 'Cash and Shrinkage Expenses', account_type: 'expense', normal_balance: 'debit', parent_code: '5000', is_header: true },
    { code: '5200-01', name_ar: 'عجز الصندوق', name_en: 'Cash Shortage', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' },
    { code: '5200-02', name_ar: 'هبوط المخزون', name_en: 'Inventory Shrinkage', account_type: 'expense', normal_balance: 'debit', parent_code: '5200' }
]

const DEFAULT_REMAP = {
    [ACCOUNT_KEYS.CASH]: '1001-01',
    [ACCOUNT_KEYS.BANK]: '1002-01',
    [ACCOUNT_KEYS.DRAWER_FLOAT]: '1001-03',
    [ACCOUNT_KEYS.INTER_BRANCH_CLEARING]: '1105-01',
    [ACCOUNT_KEYS.INPUT_VAT]: '1300-01',
    [ACCOUNT_KEYS.ADVANCE_PAYMENTS]: '1400-01',
    [ACCOUNT_KEYS.TAXES_PAYABLE]: '2100-01',
    [ACCOUNT_KEYS.CUSTOMER_DEPOSITS]: '2300-02',
    [ACCOUNT_KEYS.SALES_REVENUE]: '4001-01',
    [ACCOUNT_KEYS.DISCOUNTS_GIVEN]: '4002-01',
    [ACCOUNT_KEYS.OTHER_INCOME]: '4100-02',
    [ACCOUNT_KEYS.COGS]: '5001-01',
    [ACCOUNT_KEYS.REFUND_LOSSES]: '5001-03',
    [ACCOUNT_KEYS.CASH_SHORTAGE]: '5200-01',
    [ACCOUNT_KEYS.INVENTORY_SHRINKAGE]: '5200-02',
    [ACCOUNT_KEYS.GENERAL_EXPENSE]: '5100-01',
    [ACCOUNT_KEYS.SALARIES_EXPENSE]: '5101',
    [ACCOUNT_KEYS.RENT_EXPENSE]: '5102',
    [ACCOUNT_KEYS.UTILITIES_EXPENSE]: '5103',
    [ACCOUNT_KEYS.MARKETING_EXPENSE]: '5104',
    [ACCOUNT_KEYS.MAINTENANCE_EXPENSE]: '5105'
}

function byDepthThenCode(a, b) {
    const da = (a.parent_code ? a.parent_code.split('-').length : 0) + a.code.split('-').length
    const db = (b.parent_code ? b.parent_code.split('-').length : 0) + b.code.split('-').length
    if (da !== db) return da - db
    return a.code.localeCompare(b.code)
}

async function migrateCOA() {
    const tx = await sequelize.transaction()
    try {
        const actions = []
        const accountByCode = {}
        const existing = await Account.findAll({ transaction: tx })
        for (const acc of existing) accountByCode[acc.code] = acc

        const targets = [...TARGET_ACCOUNTS].sort(byDepthThenCode)

        for (const target of targets) {
            const parent = target.parent_code ? accountByCode[target.parent_code] : null
            const desiredParentId = parent ? parent.id : null
            const current = accountByCode[target.code]

            if (!current) {
                actions.push({ type: 'create', code: target.code, parent: target.parent_code || null })
                if (APPLY) {
                    const created = await Account.create({
                        code: target.code,
                        name_ar: target.name_ar,
                        name_en: target.name_en,
                        account_type: target.account_type,
                        normal_balance: target.normal_balance,
                        parent_id: desiredParentId,
                        is_header: !!target.is_header,
                        is_system: false,
                        is_active: true,
                        current_balance: 0
                    }, { transaction: tx })
                    accountByCode[target.code] = created
                }
                continue
            }

            const patch = {}
            if (current.name_ar !== target.name_ar) patch.name_ar = target.name_ar
            if (current.name_en !== target.name_en) patch.name_en = target.name_en
            if (current.parent_id !== desiredParentId) patch.parent_id = desiredParentId

            if (PROMOTE_HEADERS && target.is_header === true && current.is_header !== true) {
                patch.is_header = true
            }

            if (Object.keys(patch).length > 0) {
                actions.push({ type: 'update', code: target.code, patch })
                if (APPLY) await current.update(patch, { transaction: tx })
            }
        }

        if (REMAP_DEFAULTS) {
            for (const [key, code] of Object.entries(DEFAULT_REMAP)) {
                const targetAccount = accountByCode[code] || await Account.findOne({ where: { code }, transaction: tx })
                if (!targetAccount) {
                    actions.push({ type: 'default_skip_missing_account', key, code })
                    continue
                }
                if (!targetAccount.is_active || targetAccount.is_header) {
                    actions.push({ type: 'default_skip_non_posting', key, code })
                    continue
                }

                const [mapping, created] = await AccountDefault.findOrCreate({
                    where: { account_key: key, company_id: null, branch_id: null },
                    defaults: {
                        account_id: targetAccount.id,
                        is_active: true,
                        description: `Auto remap during COA hierarchy migration: ${code}`
                    },
                    transaction: tx
                })

                if (created) {
                    actions.push({ type: 'default_create', key, code })
                } else if (mapping.account_id !== targetAccount.id || mapping.is_active !== true) {
                    actions.push({ type: 'default_update', key, code })
                    if (APPLY) {
                        await mapping.update({
                            account_id: targetAccount.id,
                            is_active: true,
                            description: `Auto remap during COA hierarchy migration: ${code}`
                        }, { transaction: tx })
                    }
                }
            }
        }

        if (APPLY) {
            await tx.commit()
        } else {
            await tx.rollback()
        }

        const summary = {
            mode: APPLY ? 'APPLY' : 'DRY_RUN',
            promoteHeaders: PROMOTE_HEADERS,
            remapDefaults: REMAP_DEFAULTS,
            totalActions: actions.length
        }

        console.log('\n=== COA Header/Subaccount Migration ===')
        console.log(JSON.stringify(summary, null, 2))
        for (const action of actions) {
            console.log(JSON.stringify(action))
        }
        console.log('=== End ===\n')

        return { summary, actions }
    } catch (error) {
        await tx.rollback()
        console.error('Migration failed:', error.message)
        throw error
    }
}

if (require.main === module) {
    migrateCOA()
        .then(() => process.exit(0))
        .catch(() => process.exit(1))
}

module.exports = { migrateCOA, TARGET_ACCOUNTS, DEFAULT_REMAP }
