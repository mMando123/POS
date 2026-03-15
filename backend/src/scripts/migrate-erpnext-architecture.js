/**
 * ERPNext Architecture Migration Script
 * 
 * This script migrates the existing accounting data to the ERPNext-style architecture:
 * 
 * Phase 1: Create new tables (companies, cost_centers)
 * Phase 2: Add new columns to existing tables (company_id, cost_center_id, root_type, is_group)
 * Phase 3: Migrate data (is_header → is_group, account_type → root_type + granular account_type)
 * Phase 4: Create default company and link all existing data
 * Phase 5: Audit log all changes via GLAuditService
 * 
 * IMPORTANT: Run backup-before-migration.js BEFORE running this script!
 * 
 * Usage: node src/scripts/migrate-erpnext-architecture.js
 */

require('dotenv').config()
const { sequelize } = require('../models')
const GLAuditService = require('../services/glAuditService')
const logger = require('../services/logger')
const { QueryTypes } = require('sequelize')

// Map old account_type values to root_type
const ACCOUNT_TYPE_TO_ROOT_TYPE = {
    'asset': 'asset',
    'liability': 'liability',
    'equity': 'equity',
    'income': 'income',
    'expense': 'expense'
}

// Infer granular account_type from account code and name
function inferGranularAccountType(code, nameEn, oldAccountType) {
    const c = String(code).trim()
    const name = (nameEn || '').toLowerCase()

    // Cash accounts
    if (name.includes('cash') || name.includes('drawer') || name.includes('float')) return 'Cash'
    if (name.includes('bank')) return 'Bank'
    if (name.includes('receivable') || name.includes('customer') && oldAccountType === 'asset') return 'Receivable'
    if (name.includes('inventory') || name.includes('stock')) return 'Stock'
    if (name.includes('vat') || name.includes('tax')) return 'Tax'
    if (name.includes('payable') || (name.includes('supplier') && oldAccountType === 'liability')) return 'Payable'
    if (name.includes('capital') || name.includes('retained') || name.includes('equity')) return 'Equity'
    if (name.includes('cost of goods') || name.includes('cogs')) return 'Cost of Goods Sold'
    if (oldAccountType === 'income') return 'Income Account'
    if (oldAccountType === 'expense') return 'Expense Account'

    return null // Will remain null for generic accounts
}

async function migrate() {
    const transaction = await sequelize.transaction()
    const dialect = sequelize.getDialect()
    const isSQLite = dialect === 'sqlite'

    console.log('🚀 ERPNext Architecture Migration')
    console.log(`   Database dialect: ${dialect}`)
    console.log('   ⚠️  Ensure backup-before-migration.js was run first!\n')

    try {
        // ─── Phase 1: Create new tables ───────────────────────────────────
        console.log('📋 Phase 1: Creating new tables...')

        // Check if companies table exists
        const tablesQuery = isSQLite
            ? `SELECT name FROM sqlite_master WHERE type='table' AND name='companies'`
            : `SELECT table_name FROM information_schema.tables WHERE table_name='companies' AND table_schema=DATABASE()`

        const existingCompanies = await sequelize.query(tablesQuery, { type: QueryTypes.SELECT, transaction })

        if (existingCompanies.length === 0) {
            // Create companies table
            const createCompaniesSQL = isSQLite
                ? `CREATE TABLE IF NOT EXISTS companies (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    abbreviation TEXT NOT NULL UNIQUE,
                    currency TEXT NOT NULL DEFAULT 'SAR',
                    fiscal_year_start TEXT DEFAULT '01-01',
                    tax_id TEXT,
                    parent_company_id TEXT REFERENCES companies(id),
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                )`
                : `CREATE TABLE IF NOT EXISTS companies (
                    id CHAR(36) PRIMARY KEY,
                    name VARCHAR(200) NOT NULL UNIQUE,
                    abbreviation VARCHAR(10) NOT NULL UNIQUE,
                    currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
                    fiscal_year_start VARCHAR(5) DEFAULT '01-01',
                    tax_id VARCHAR(50),
                    parent_company_id CHAR(36) REFERENCES companies(id),
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`
            await sequelize.query(createCompaniesSQL, { transaction })
            console.log('   ✅ Created companies table')
        } else {
            console.log('   ⏭️  companies table already exists')
        }

        // Check if cost_centers table exists
        const costCenterQuery = isSQLite
            ? `SELECT name FROM sqlite_master WHERE type='table' AND name='cost_centers'`
            : `SELECT table_name FROM information_schema.tables WHERE table_name='cost_centers' AND table_schema=DATABASE()`

        const existingCostCenters = await sequelize.query(costCenterQuery, { type: QueryTypes.SELECT, transaction })

        if (existingCostCenters.length === 0) {
            const createCostCentersSQL = isSQLite
                ? `CREATE TABLE IF NOT EXISTS cost_centers (
                    id TEXT PRIMARY KEY,
                    code TEXT NOT NULL,
                    name_ar TEXT NOT NULL,
                    name_en TEXT NOT NULL,
                    parent_id TEXT REFERENCES cost_centers(id),
                    is_group INTEGER NOT NULL DEFAULT 0,
                    company_id TEXT REFERENCES companies(id),
                    is_active INTEGER NOT NULL DEFAULT 1,
                    description TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(code, company_id)
                )`
                : `CREATE TABLE IF NOT EXISTS cost_centers (
                    id CHAR(36) PRIMARY KEY,
                    code VARCHAR(20) NOT NULL,
                    name_ar VARCHAR(200) NOT NULL,
                    name_en VARCHAR(200) NOT NULL,
                    parent_id CHAR(36) REFERENCES cost_centers(id),
                    is_group TINYINT(1) NOT NULL DEFAULT 0,
                    company_id CHAR(36) REFERENCES companies(id),
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    description TEXT,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE(code, company_id)
                )`
            await sequelize.query(createCostCentersSQL, { transaction })
            console.log('   ✅ Created cost_centers table')
        } else {
            console.log('   ⏭️  cost_centers table already exists')
        }

        // ─── Phase 2: Add new columns to existing tables ──────────────────
        console.log('\n📋 Phase 2: Adding new columns...')

        // Helper to check if column exists
        async function columnExists(tableName, columnName) {
            try {
                if (isSQLite) {
                    const cols = await sequelize.query(`PRAGMA table_info(${tableName})`, { type: QueryTypes.SELECT, transaction })
                    return cols.some(c => c.name === columnName)
                } else {
                    const cols = await sequelize.query(
                        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${tableName}' AND COLUMN_NAME='${columnName}' AND TABLE_SCHEMA=DATABASE()`,
                        { type: QueryTypes.SELECT, transaction }
                    )
                    return cols.length > 0
                }
            } catch (e) {
                return false
            }
        }

        // Helper to add column
        async function addColumn(tableName, columnName, definition) {
            if (await columnExists(tableName, columnName)) {
                console.log(`   ⏭️  ${tableName}.${columnName} already exists`)
                return false
            }
            await sequelize.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`, { transaction })
            console.log(`   ✅ Added ${tableName}.${columnName}`)
            return true
        }

        // Add root_type to gl_accounts
        const textType = isSQLite ? 'TEXT' : 'VARCHAR(20)'
        const uuidType = isSQLite ? 'TEXT' : 'CHAR(36)'
        const boolType = isSQLite ? 'INTEGER DEFAULT 0' : 'TINYINT(1) DEFAULT 0'

        await addColumn('gl_accounts', 'root_type', textType)
        await addColumn('gl_accounts', 'is_group', boolType)
        await addColumn('gl_accounts', 'company_id', uuidType)

        // Add company_id to other tables
        await addColumn('branches', 'company_id', uuidType)
        await addColumn('gl_fiscal_periods', 'company_id', uuidType)
        await addColumn('gl_journal_entries', 'company_id', uuidType)
        await addColumn('gl_journal_entries', 'cost_center_id', uuidType)
        await addColumn('gl_journal_lines', 'cost_center_id', uuidType)

        // ─── Phase 3: Migrate existing data ───────────────────────────────
        console.log('\n📋 Phase 3: Migrating data...')

        // 3a. Migrate is_header → is_group
        if (await columnExists('gl_accounts', 'is_header')) {
            await sequelize.query(
                `UPDATE gl_accounts SET is_group = is_header WHERE is_group IS NULL OR is_group = 0`,
                { transaction }
            )
            console.log('   ✅ Migrated is_header → is_group')
        } else {
            console.log('   ⏭️  is_header column not found (already migrated?)')
        }

        // 3b. Migrate account_type → root_type  
        const accounts = await sequelize.query(
            `SELECT id, code, name_en, account_type FROM gl_accounts WHERE root_type IS NULL`,
            { type: QueryTypes.SELECT, transaction }
        )

        let migratedCount = 0
        for (const acc of accounts) {
            const rootType = ACCOUNT_TYPE_TO_ROOT_TYPE[acc.account_type]
            const granularType = inferGranularAccountType(acc.code, acc.name_en, acc.account_type)

            if (rootType) {
                await sequelize.query(
                    `UPDATE gl_accounts SET root_type = :rootType, account_type = :accountType WHERE id = :id`,
                    {
                        replacements: { rootType, accountType: granularType, id: acc.id },
                        transaction
                    }
                )
                migratedCount++
            }
        }
        console.log(`   ✅ Migrated ${migratedCount} accounts: account_type → root_type + granular account_type`)

        // ─── Phase 4: Create default company and link data ────────────────
        console.log('\n📋 Phase 4: Creating default company...')

        const { v4: uuidv4 } = require('uuid')
        const defaultCompanyId = uuidv4()

        // Check if a default company already exists
        const existingDefault = await sequelize.query(
            `SELECT id FROM companies LIMIT 1`,
            { type: QueryTypes.SELECT, transaction }
        )

        let companyId
        if (existingDefault.length > 0) {
            companyId = existingDefault[0].id
            console.log(`   ⏭️  Default company already exists: ${companyId}`)
        } else {
            await sequelize.query(
                `INSERT INTO companies (id, name, abbreviation, currency, fiscal_year_start, is_active, created_at, updated_at)
                 VALUES (:id, :name, :abbr, :currency, :fiscal, 1, ${isSQLite ? "datetime('now')" : 'NOW()'}, ${isSQLite ? "datetime('now')" : 'NOW()'})`,
                {
                    replacements: {
                        id: defaultCompanyId,
                        name: 'الشركة الافتراضية',
                        abbr: 'DEF',
                        currency: 'SAR',
                        fiscal: '01-01'
                    },
                    transaction
                }
            )
            companyId = defaultCompanyId
            console.log(`   ✅ Created default company: ${companyId}`)
        }

        // Link all unlinked data to default company
        const linkTables = [
            'gl_accounts',
            'branches',
            'gl_fiscal_periods',
            'gl_journal_entries'
        ]

        for (const table of linkTables) {
            if (await columnExists(table, 'company_id')) {
                const [, meta] = await sequelize.query(
                    `UPDATE ${table} SET company_id = :companyId WHERE company_id IS NULL`,
                    { replacements: { companyId }, transaction }
                )
                const affected = isSQLite ? meta : (meta?.affectedRows || 0)
                console.log(`   ✅ Linked ${table} → company (${affected} rows)`)
            }
        }

        // Create default cost center
        const existingCC = await sequelize.query(
            `SELECT id FROM cost_centers LIMIT 1`,
            { type: QueryTypes.SELECT, transaction }
        )

        if (existingCC.length === 0) {
            const costCenterId = uuidv4()
            await sequelize.query(
                `INSERT INTO cost_centers (id, code, name_ar, name_en, is_group, company_id, is_active, created_at, updated_at)
                 VALUES (:id, :code, :nameAr, :nameEn, 1, :companyId, 1, ${isSQLite ? "datetime('now')" : 'NOW()'}, ${isSQLite ? "datetime('now')" : 'NOW()'})`,
                {
                    replacements: {
                        id: costCenterId,
                        code: 'CC-MAIN',
                        nameAr: 'المركز الرئيسي',
                        nameEn: 'Main Cost Center',
                        companyId
                    },
                    transaction
                }
            )
            console.log(`   ✅ Created default cost center: CC-MAIN`)
        } else {
            console.log('   ⏭️  Cost centers already exist')
        }

        // ─── Phase 5: Audit log ───────────────────────────────────────────
        console.log('\n📋 Phase 5: Audit logging...')

        await GLAuditService.log({
            eventType: 'erpnext_architecture_migration',
            sourceType: 'system',
            sourceId: companyId,
            payload: {
                migration: 'erpnext-architecture',
                phases: ['tables_created', 'columns_added', 'data_migrated', 'company_linked'],
                accounts_migrated: migratedCount,
                default_company_id: companyId,
                dialect,
                timestamp: new Date().toISOString()
            }
        }, { transaction })

        console.log('   ✅ Migration audited')

        // ─── Commit ───────────────────────────────────────────────────────
        await transaction.commit()
        console.log('\n🎉 ERPNext Architecture Migration COMPLETE!')
        console.log('   Next steps:')
        console.log('   1. Run: node src/scripts/seed-chart-of-accounts.js (to update COA with new fields)')
        console.log('   2. Run: node src/scripts/seed-account-defaults.js')
        console.log('   3. Restart the server')

    } catch (error) {
        await transaction.rollback()
        console.error('\n❌ Migration FAILED — all changes rolled back')
        console.error('   Error:', error.message)
        console.error(error.stack)
        process.exit(1)
    } finally {
        await sequelize.close()
    }
}

// Run
migrate().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
})
