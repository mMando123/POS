const { Company, FiscalYear, FiscalPeriod, CostCenter } = require('../models');

async function seedCompany() {
    console.log('Seeding Default Company...');

    const company = await Company.create({
        name: 'Main Restaurant Company',
        abbr: 'MAIN',
        currency: 'SAR',
        is_active: true
    });

    console.log(`Created Company: ${company.name} (ID: ${company.id})`);

    // Create current Fiscal Year
    const currentYear = new Date().getFullYear();
    const fiscalYear = await FiscalYear.create({
        company_id: company.id,
        year_name: `${currentYear}`,
        start_date: `${currentYear}-01-01`,
        end_date: `${currentYear}-12-31`,
        is_closed: false
    });

    // Create 12 Fiscal Periods (Months)
    for (let month = 1; month <= 12; month++) {
        const monthStr = month.toString().padStart(2, '0');
        const nextMonthStr = (month === 12 ? 1 : month + 1).toString().padStart(2, '0');
        const yearOffset = month === 12 ? currentYear + 1 : currentYear;

        // Simple logic to get last day of month
        const nextMonthDate = new Date(`${yearOffset}-${nextMonthStr}-01`);
        nextMonthDate.setDate(nextMonthDate.getDate() - 1);
        const lastDay = nextMonthDate.getDate().toString().padStart(2, '0');

        await FiscalPeriod.create({
            company_id: company.id,
            fiscal_year_id: fiscalYear.id,
            period_name: `${currentYear}-${monthStr}`,
            start_date: `${currentYear}-${monthStr}-01`,
            end_date: `${currentYear}-${monthStr}-${lastDay}`,
            is_closed: false
        });
    }
    console.log(`Created Fiscal Year ${fiscalYear.year_name} with 12 open periods.`);

    // Create Default Cost Center
    const costCenter = await CostCenter.create({
        company_id: company.id,
        name: 'Main Branch',
        code: 'MAIN-CC',
        is_group: false
    });
    console.log(`Created Default Cost Center: ${costCenter.name}`);

    return company;
}

module.exports = seedCompany;
