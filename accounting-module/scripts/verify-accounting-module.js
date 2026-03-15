const { sequelize, Company, Account, AuditLog, Sequence, AccountDefault } = require('../models');
const JournalService = require('../services/journalService');
const AccountResolver = require('../services/accountResolver');

async function runTests() {
    console.log('=== Full Accounting Module Verification (Phase 2+3) ===\n');

    await sequelize.sync({ force: true });

    // Seed
    const seedCompany = require('../seeders/seed-company');
    const seedCOA = require('../seeders/seed-full-coa');
    const seedDefaults = require('../seeders/seed-defaults');
    const company = await seedCompany();
    await seedCOA(company.id);
    await seedDefaults(company.id);

    const accounts = await Account.findAll({ where: { company_id: company.id } });
    const acctMap = new Map(accounts.map(a => [a.code, a]));

    const cash = acctMap.get('1111');
    const bank = acctMap.get('1112');
    const sales = acctMap.get('4110');
    const cogs = acctMap.get('5110');
    const inventory = acctMap.get('1131');
    const assetsGroup = acctMap.get('1000');
    const depreciation = acctMap.get('5240');
    const writeOff = acctMap.get('5410');

    let passed = 0;
    let failed = 0;
    const today = new Date().toISOString().split('T')[0];

    const test = (name, ok) => {
        if (ok) { console.log(`  ✅ ${name}`); passed++; }
        else { console.error(`  ❌ ${name}`); failed++; }
    };

    // =============================================
    // 1. COA Completeness
    // =============================================
    console.log('--- 1. Chart of Accounts Completeness ---');
    const totalAccounts = accounts.length;
    test(`Total accounts created: ${totalAccounts} (should be >= 50)`, totalAccounts >= 50);
    test('Has Fixed Assets (1200)', !!acctMap.get('1200'));
    test('Has Accumulated Depreciation (1230)', !!acctMap.get('1230'));
    test('Has Long-Term Liabilities (2200)', !!acctMap.get('2200'));
    test('Has Administrative Expenses (5300)', !!acctMap.get('5300'));
    test('Has Write Off (5410)', !!writeOff);
    test('Has Exchange Loss (5420)', !!acctMap.get('5420'));
    test('Has Rounding Adjustment (5430)', !!acctMap.get('5430'));

    // =============================================
    // 2. Arabic Names
    // =============================================
    console.log('\n--- 2. Arabic Name Support ---');
    test(`Assets name_ar = الأصول`, acctMap.get('1000').name_ar === 'الأصول');
    test(`Cash name_ar = الصندوق`, cash.name_ar === 'الصندوق');
    test(`COGS name_ar = تكلفة البضاعة المباعة`, cogs.name_ar === 'تكلفة البضاعة المباعة');

    // =============================================
    // 3. Account Defaults Completeness
    // =============================================
    console.log('\n--- 3. Account Defaults (19 keys) ---');
    const defaultCount = await AccountDefault.count({ where: { company_id: company.id } });
    test(`Default keys seeded: ${defaultCount} (should be >= 19)`, defaultCount >= 19);

    // =============================================
    // 4. AccountResolver Fallback Strategy
    // =============================================
    console.log('\n--- 4. AccountResolver Fallback ---');
    try {
        // Fallback: No specific PaymentMethod → should resolve to default_cash_account
        const fallbackId = await AccountResolver.resolvePaymentMethod(null, company.id);
        test('Payment fallback to default_cash_account', fallbackId === cash.id);
    } catch (e) {
        test('Payment fallback to default_cash_account', false);
    }

    try {
        // Batch resolve for POS sale
        const resolved = await AccountResolver.resolveForPOSSale(company.id);
        test('POS batch resolver returns cashOrBankAccount', !!resolved.cashOrBankAccount);
        test('POS batch resolver returns incomeAccount', !!resolved.incomeAccount);
        test('POS batch resolver returns cogsAccount', !!resolved.cogsAccount);
        test('POS batch resolver returns inventoryAccount', !!resolved.inventoryAccount);
        test('POS batch resolver returns taxOutputAccount', !!resolved.taxOutputAccount);
    } catch (e) {
        test('POS batch resolver', false);
        console.error('  Error:', e.message);
    }

    // =============================================
    // 5. Core Double Entry (Critical Fixes Retained)
    // =============================================
    console.log('\n--- 5. Core Double Entry Validations ---');

    // Unbalanced
    try {
        await JournalService.createJournalEntry({
            entry_date: today, lines: [
                { account_id: cash.id, debit: 100, credit: 0 },
                { account_id: sales.id, debit: 0, credit: 50 },
            ]
        }, company.id);
        test('Reject unbalanced entry', false);
    } catch (e) {
        test('Reject unbalanced entry', e.message.includes('unbalanced'));
    }

    // Group account
    try {
        await JournalService.createJournalEntry({
            entry_date: today, lines: [
                { account_id: assetsGroup.id, debit: 100, credit: 0 },
                { account_id: sales.id, debit: 0, credit: 100 },
            ]
        }, company.id);
        test('Reject group account posting', false);
    } catch (e) {
        test('Reject group account posting', e.message.includes('group'));
    }

    // Deactivated account
    await bank.update({ is_active: false });
    try {
        await JournalService.createJournalEntry({
            entry_date: today, lines: [
                { account_id: bank.id, debit: 100, credit: 0 },
                { account_id: sales.id, debit: 0, credit: 100 },
            ]
        }, company.id);
        test('Reject deactivated account', false);
    } catch (e) {
        test('Reject deactivated account', e.message.includes('deactivated'));
    }
    await bank.update({ is_active: true });

    // =============================================
    // 6. Sequential + Audit + Precision
    // =============================================
    console.log('\n--- 6. Sequential Numbering + Audit + Float Precision ---');

    const e1 = await JournalService.createJournalEntry({
        entry_date: today, status: 'posted', description: 'Sale 1',
        lines: [
            { account_id: cash.id, debit: 1000, credit: 0 },
            { account_id: sales.id, debit: 0, credit: 1000 },
        ]
    }, company.id, { userId: 'admin-001' });

    const e2 = await JournalService.createJournalEntry({
        entry_date: today, status: 'posted', description: 'Sale 2',
        lines: [
            { account_id: bank.id, debit: 500, credit: 0 },
            { account_id: sales.id, debit: 0, credit: 500 },
        ]
    }, company.id, { userId: 'admin-001' });

    test(`Sequential: ${e1.entry_number} → ${e2.entry_number}`, e1.entry_number.endsWith('00001') && e2.entry_number.endsWith('00002'));
    test('created_by stored', e1.created_by === 'admin-001');

    const auditCount = await AuditLog.count({ where: { company_id: company.id } });
    test(`Audit logs created: ${auditCount} (should be >= 2)`, auditCount >= 2);

    // Float precision
    const ep = await JournalService.createJournalEntry({
        entry_date: today, description: 'Precision test',
        lines: [
            { account_id: cash.id, debit: 0.1, credit: 0 },
            { account_id: cash.id, debit: 0.2, credit: 0 },
            { account_id: sales.id, debit: 0, credit: 0.3 },
        ]
    }, company.id);
    test('Float precision (0.1+0.2=0.3) OK', !!ep);

    // =============================================
    // 7. Reversal + Trial Balance
    // =============================================
    console.log('\n--- 7. Reversal + Reports ---');
    const cancelResult = await JournalService.cancelEntry(e1.id, company.id, { userId: 'manager-001' });
    test(`Reversal created: ${cancelResult.reversalEntry.entry_number}`, !!cancelResult.reversalEntry);

    const ReportService = require('../services/reportService');
    const tb = await ReportService.getTrialBalance(company.id, '2020-01-01', today);
    test(`Trial Balance balanced: ${tb.totals.is_balanced}`, tb.totals.is_balanced);

    // =============================================
    // SUMMARY
    // =============================================
    console.log(`\n========================================`);
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log(`========================================`);
    if (failed === 0) {
        console.log('✅✅✅ ALL VERIFICATION TESTS PASSED 100% ✅✅✅');
    } else {
        console.log('❌❌❌ SOME TESTS FAILED — REVIEW REQUIRED ❌❌❌');
    }
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error('CRASH:', err); process.exit(1); });
