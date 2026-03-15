const AccountService = require('../services/accountService');

async function seedChartOfAccounts(companyId) {
    console.log('Seeding Full ERPNext-Style Chart of Accounts (with Arabic)...');

    // ========== ROOT ACCOUNTS ==========
    const roots = [
        { code: '1000', name: 'Assets', name_ar: 'الأصول', is_group: true, root_type: 'Asset', normal_balance: 'debit' },
        { code: '2000', name: 'Liabilities', name_ar: 'الخصوم', is_group: true, root_type: 'Liability', normal_balance: 'credit' },
        { code: '3000', name: 'Equity', name_ar: 'حقوق الملكية', is_group: true, root_type: 'Equity', normal_balance: 'credit' },
        { code: '4000', name: 'Income', name_ar: 'الإيرادات', is_group: true, root_type: 'Income', normal_balance: 'credit' },
        { code: '5000', name: 'Expenses', name_ar: 'المصروفات', is_group: true, root_type: 'Expense', normal_balance: 'debit' }
    ];

    const rootDocs = {};
    for (const data of roots) {
        rootDocs[data.code] = await AccountService.createAccount(data, companyId);
    }

    // ========== 1. ASSETS ==========
    const currentAssets = await AccountService.createAccount({ code: '1100', name: 'Current Assets', name_ar: 'الأصول المتداولة', is_group: true, parent_id: rootDocs['1000'].id }, companyId);

    // Cash & Bank
    const cashAndBank = await AccountService.createAccount({ code: '1110', name: 'Cash and Bank Balances', name_ar: 'النقدية والبنوك', is_group: true, parent_id: currentAssets.id }, companyId);
    await AccountService.createAccount({ code: '1111', name: 'Cash on Hand', name_ar: 'الصندوق', is_group: false, account_type: 'Cash', parent_id: cashAndBank.id }, companyId);
    await AccountService.createAccount({ code: '1112', name: 'Main Bank Account', name_ar: 'الحساب البنكي الرئيسي', is_group: false, account_type: 'Bank', parent_id: cashAndBank.id }, companyId);
    await AccountService.createAccount({ code: '1113', name: 'POS Drawer Cash', name_ar: 'نقدية درج الكاشير', is_group: false, account_type: 'Cash', parent_id: cashAndBank.id }, companyId);

    // Receivables
    const receivables = await AccountService.createAccount({ code: '1120', name: 'Accounts Receivable', name_ar: 'الذمم المدينة', is_group: true, parent_id: currentAssets.id }, companyId);
    await AccountService.createAccount({ code: '1121', name: 'Customers (Debtors)', name_ar: 'العملاء (المدينون)', is_group: false, account_type: 'Receivable', parent_id: receivables.id }, companyId);
    await AccountService.createAccount({ code: '1122', name: 'Advance Paid to Suppliers', name_ar: 'دفعات مقدمة للموردين', is_group: false, account_type: 'Receivable', parent_id: receivables.id }, companyId);

    // Inventory
    const inventory = await AccountService.createAccount({ code: '1130', name: 'Stock Assets', name_ar: 'المخزون', is_group: true, parent_id: currentAssets.id }, companyId);
    await AccountService.createAccount({ code: '1131', name: 'Finished Goods Inventory', name_ar: 'مخزون البضاعة الجاهزة', is_group: false, account_type: 'Stock', parent_id: inventory.id }, companyId);
    await AccountService.createAccount({ code: '1132', name: 'Raw Materials Inventory', name_ar: 'مخزون المواد الخام', is_group: false, account_type: 'Stock', parent_id: inventory.id }, companyId);

    // Fixed Assets
    const fixedAssets = await AccountService.createAccount({ code: '1200', name: 'Fixed Assets', name_ar: 'الأصول الثابتة', is_group: true, parent_id: rootDocs['1000'].id }, companyId);
    await AccountService.createAccount({ code: '1210', name: 'Furniture & Equipment', name_ar: 'الأثاث والمعدات', is_group: false, account_type: 'Fixed Asset', parent_id: fixedAssets.id }, companyId);
    await AccountService.createAccount({ code: '1220', name: 'Vehicles', name_ar: 'السيارات', is_group: false, account_type: 'Fixed Asset', parent_id: fixedAssets.id }, companyId);
    await AccountService.createAccount({ code: '1230', name: 'Accumulated Depreciation', name_ar: 'مجمع الإهلاك', is_group: false, account_type: 'Depreciation', parent_id: fixedAssets.id }, companyId);

    // ========== 2. LIABILITIES ==========
    const currentLiabs = await AccountService.createAccount({ code: '2100', name: 'Current Liabilities', name_ar: 'الخصوم المتداولة', is_group: true, parent_id: rootDocs['2000'].id }, companyId);

    // Payables
    const payables = await AccountService.createAccount({ code: '2110', name: 'Accounts Payable', name_ar: 'الذمم الدائنة', is_group: true, parent_id: currentLiabs.id }, companyId);
    await AccountService.createAccount({ code: '2111', name: 'Suppliers (Creditors)', name_ar: 'الموردون (الدائنون)', is_group: false, account_type: 'Payable', parent_id: payables.id }, companyId);
    await AccountService.createAccount({ code: '2112', name: 'Advance Received from Customers', name_ar: 'دفعات مقدمة من العملاء', is_group: false, account_type: 'Payable', parent_id: payables.id }, companyId);

    // Taxes
    const taxes = await AccountService.createAccount({ code: '2120', name: 'Duties and Taxes', name_ar: 'الضرائب والرسوم', is_group: true, parent_id: currentLiabs.id }, companyId);
    await AccountService.createAccount({ code: '2121', name: 'VAT Output (Collected)', name_ar: 'ضريبة القيمة المضافة - مستحقة', is_group: false, account_type: 'Tax', parent_id: taxes.id }, companyId);
    await AccountService.createAccount({ code: '2122', name: 'VAT Input (Paid)', name_ar: 'ضريبة القيمة المضافة - مدفوعة', is_group: false, account_type: 'Tax', parent_id: taxes.id }, companyId);

    // Employee Benefits
    const empLiabs = await AccountService.createAccount({ code: '2130', name: 'Employee Benefits Payable', name_ar: 'مستحقات الموظفين', is_group: true, parent_id: currentLiabs.id }, companyId);
    await AccountService.createAccount({ code: '2131', name: 'Salaries Payable', name_ar: 'رواتب مستحقة', is_group: false, account_type: 'Payable', parent_id: empLiabs.id }, companyId);
    await AccountService.createAccount({ code: '2132', name: 'End of Service Benefits', name_ar: 'مكافأة نهاية الخدمة', is_group: false, account_type: 'Payable', parent_id: empLiabs.id }, companyId);

    // Long-Term Liabilities
    const longTermLiabs = await AccountService.createAccount({ code: '2200', name: 'Long-Term Liabilities', name_ar: 'الخصوم طويلة الأجل', is_group: true, parent_id: rootDocs['2000'].id }, companyId);
    await AccountService.createAccount({ code: '2210', name: 'Bank Loans', name_ar: 'قروض بنكية', is_group: false, account_type: 'Payable', parent_id: longTermLiabs.id }, companyId);

    // ========== 3. EQUITY ==========
    await AccountService.createAccount({ code: '3100', name: 'Capital Account', name_ar: 'رأس المال', is_group: false, account_type: 'Equity', parent_id: rootDocs['3000'].id }, companyId);
    await AccountService.createAccount({ code: '3200', name: 'Retained Earnings', name_ar: 'الأرباح المُبقاة', is_group: false, account_type: 'Equity', parent_id: rootDocs['3000'].id }, companyId);
    await AccountService.createAccount({ code: '3300', name: 'Owner Withdrawals', name_ar: 'المسحوبات الشخصية', is_group: false, account_type: 'Equity', parent_id: rootDocs['3000'].id }, companyId);

    // ========== 4. INCOME ==========
    const directIncome = await AccountService.createAccount({ code: '4100', name: 'Direct Income', name_ar: 'الإيرادات المباشرة', is_group: true, parent_id: rootDocs['4000'].id }, companyId);
    await AccountService.createAccount({ code: '4110', name: 'Sales Revenue', name_ar: 'إيراد المبيعات', is_group: false, account_type: 'Income', parent_id: directIncome.id }, companyId);
    await AccountService.createAccount({ code: '4120', name: 'Service Revenue', name_ar: 'إيراد الخدمات', is_group: false, account_type: 'Income', parent_id: directIncome.id }, companyId);

    const indirectIncome = await AccountService.createAccount({ code: '4200', name: 'Indirect Income', name_ar: 'الإيرادات غير المباشرة', is_group: true, parent_id: rootDocs['4000'].id }, companyId);
    await AccountService.createAccount({ code: '4210', name: 'Discount Received', name_ar: 'خصم مكتسب', is_group: false, account_type: 'Income', parent_id: indirectIncome.id }, companyId);
    await AccountService.createAccount({ code: '4220', name: 'Other Income', name_ar: 'إيرادات أخرى', is_group: false, account_type: 'Income', parent_id: indirectIncome.id }, companyId);
    await AccountService.createAccount({ code: '4230', name: 'Exchange Gain', name_ar: 'أرباح فروقات العملة', is_group: false, account_type: 'Income', parent_id: indirectIncome.id }, companyId);

    // ========== 5. EXPENSES ==========
    const directExpense = await AccountService.createAccount({ code: '5100', name: 'Direct Expenses', name_ar: 'المصروفات المباشرة', is_group: true, parent_id: rootDocs['5000'].id }, companyId);
    await AccountService.createAccount({ code: '5110', name: 'Cost of Goods Sold (COGS)', name_ar: 'تكلفة البضاعة المباعة', is_group: false, account_type: 'Expense', parent_id: directExpense.id }, companyId);
    await AccountService.createAccount({ code: '5120', name: 'Purchase Discount Given', name_ar: 'خصم ممنوح', is_group: false, account_type: 'Expense', parent_id: directExpense.id }, companyId);

    const oprExpense = await AccountService.createAccount({ code: '5200', name: 'Operating Expenses', name_ar: 'المصاريف التشغيلية', is_group: true, parent_id: rootDocs['5000'].id }, companyId);
    await AccountService.createAccount({ code: '5210', name: 'Rent Expense', name_ar: 'مصروف الإيجار', is_group: false, account_type: 'Expense', parent_id: oprExpense.id }, companyId);
    await AccountService.createAccount({ code: '5220', name: 'Salary & Payroll', name_ar: 'الرواتب والأجور', is_group: false, account_type: 'Expense', parent_id: oprExpense.id }, companyId);
    await AccountService.createAccount({ code: '5230', name: 'Utility & Electricity', name_ar: 'الكهرباء والمياه', is_group: false, account_type: 'Expense', parent_id: oprExpense.id }, companyId);
    await AccountService.createAccount({ code: '5240', name: 'Depreciation Expense', name_ar: 'مصروف الإهلاك', is_group: false, account_type: 'Expense', parent_id: oprExpense.id }, companyId);
    await AccountService.createAccount({ code: '5250', name: 'Insurance Expense', name_ar: 'مصروف التأمين', is_group: false, account_type: 'Expense', parent_id: oprExpense.id }, companyId);
    await AccountService.createAccount({ code: '5260', name: 'Marketing & Advertising', name_ar: 'التسويق والإعلان', is_group: false, account_type: 'Expense', parent_id: oprExpense.id }, companyId);
    await AccountService.createAccount({ code: '5270', name: 'Maintenance & Repairs', name_ar: 'الصيانة والإصلاحات', is_group: false, account_type: 'Expense', parent_id: oprExpense.id }, companyId);

    const adminExpense = await AccountService.createAccount({ code: '5300', name: 'Administrative Expenses', name_ar: 'المصاريف الإدارية', is_group: true, parent_id: rootDocs['5000'].id }, companyId);
    await AccountService.createAccount({ code: '5310', name: 'Office Supplies', name_ar: 'مستلزمات مكتبية', is_group: false, account_type: 'Expense', parent_id: adminExpense.id }, companyId);
    await AccountService.createAccount({ code: '5320', name: 'Internet & Communication', name_ar: 'الإنترنت والاتصالات', is_group: false, account_type: 'Expense', parent_id: adminExpense.id }, companyId);
    await AccountService.createAccount({ code: '5330', name: 'Legal & Professional Fees', name_ar: 'الرسوم القانونية والمهنية', is_group: false, account_type: 'Expense', parent_id: adminExpense.id }, companyId);
    await AccountService.createAccount({ code: '5340', name: 'Bank Charges', name_ar: 'عمولات بنكية', is_group: false, account_type: 'Expense', parent_id: adminExpense.id }, companyId);

    const otherExpense = await AccountService.createAccount({ code: '5400', name: 'Other Expenses', name_ar: 'مصروفات أخرى', is_group: true, parent_id: rootDocs['5000'].id }, companyId);
    await AccountService.createAccount({ code: '5410', name: 'Write Off', name_ar: 'إعدام ديون', is_group: false, account_type: 'Expense', parent_id: otherExpense.id }, companyId);
    await AccountService.createAccount({ code: '5420', name: 'Exchange Loss', name_ar: 'خسائر فروقات العملة', is_group: false, account_type: 'Expense', parent_id: otherExpense.id }, companyId);
    await AccountService.createAccount({ code: '5430', name: 'Rounding Adjustment', name_ar: 'فروقات التقريب', is_group: false, account_type: 'Expense', parent_id: otherExpense.id }, companyId);

    console.log(`✅ Seeded Full Chart of Accounts (55+ accounts) for Company: ${companyId}`);
}

module.exports = seedChartOfAccounts;
