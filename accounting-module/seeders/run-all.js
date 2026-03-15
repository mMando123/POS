const { sequelize, Company } = require('../models');
const seedCompany = require('./seed-company');
const seedChartOfAccounts = require('./seed-full-coa');
const seedDefaults = require('./seed-defaults');

async function runAllSeeds() {
    console.log('--- Starting Accounting Module Seed ---');

    // CRITICAL FIX: Use alter instead of force to prevent data loss in production
    await sequelize.sync({ alter: true });
    console.log('Database synced (alter: true — safe for existing data)...');

    try {
        // Check if a company already exists (idempotent)
        const existingCompany = await Company.findOne();
        if (existingCompany) {
            console.log(`Company already exists: ${existingCompany.name}. Skipping seed.`);
            console.log('--- Seed skipped (already seeded) ---');
            process.exit(0);
            return;
        }

        // 1. Create Company, Fiscal Year, Period, Cost Center
        const company = await seedCompany();

        // 2. Build full Chart of Accounts
        await seedChartOfAccounts(company.id);

        // 3. Connect default mappings
        await seedDefaults(company.id);

        console.log('--- Seeding Completed Successfully ---');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

runAllSeeds();
