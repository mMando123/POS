/**
 * Pre-Migration Backup — Phase 0 (MANDATORY)
 * 
 * Creates a complete snapshot of the current accounting state:
 *   1. COA structure (all accounts)
 *   2. Journal entry summary (count per source_type)
 *   3. Account defaults mapping
 *   4. Fiscal periods state
 * 
 * Output: backend/data/pre-migration-snapshot.json
 * 
 * Run: node src/scripts/backup-before-migration.js
 */

const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { Account, JournalEntry, JournalLine, AccountDefault, FiscalPeriod, Branch, sequelize } = require('../models')
const logger = require('../services/logger')

async function createPreMigrationBackup() {
    console.log('\n🔒 Phase 0: Creating Pre-Migration Backup...\n')

    const snapshot = {
        created_at: new Date().toISOString(),
        migration_type: 'erpnext-style-restructure',
        database_dialect: sequelize.getDialect(),
    }

    try {
        // ────── 1. COA Snapshot ──────
        const accounts = await Account.findAll({
            order: [['code', 'ASC']],
            raw: true
        })
        snapshot.accounts = {
            total: accounts.length,
            active: accounts.filter(a => a.is_active).length,
            groups: accounts.filter(a => a.is_group).length,
            ledgers: accounts.filter(a => !a.is_group).length,
            by_type: {},
            data: accounts.map(a => ({
                id: a.id,
                code: a.code,
                name_ar: a.name_ar,
                name_en: a.name_en,
                account_type: a.account_type,
                normal_balance: a.normal_balance,
                is_group: a.is_group,
                is_active: a.is_active,
                is_system: a.is_system,
                parent_id: a.parent_id,
                current_balance: a.current_balance,
            }))
        }
        // Count by type
        for (const acc of accounts) {
            snapshot.accounts.by_type[acc.account_type] = (snapshot.accounts.by_type[acc.account_type] || 0) + 1
        }
        console.log(`  📊 Accounts: ${snapshot.accounts.total} total (${snapshot.accounts.groups} groups, ${snapshot.accounts.ledgers} ledgers)`)

        // ────── 2. Journal Entries Summary ──────
        const jeCount = await JournalEntry.count()
        const jeSummary = await JournalEntry.findAll({
            attributes: [
                'source_type',
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
            ],
            group: ['source_type', 'status'],
            raw: true
        })
        snapshot.journal_entries = {
            total: jeCount,
            by_source_and_status: jeSummary
        }
        console.log(`  📊 Journal Entries: ${jeCount} total`)

        // ────── 3. Account Defaults ──────
        const defaults = await AccountDefault.findAll({
            include: [{ model: Account, as: 'account', attributes: ['code', 'name_ar'] }],
            raw: true,
            nest: true
        })
        snapshot.account_defaults = {
            total: defaults.length,
            data: defaults.map(d => ({
                account_key: d.account_key,
                account_id: d.account_id,
                account_code: d.account?.code,
                account_name: d.account?.name_ar,
                company_id: d.company_id,
                branch_id: d.branch_id,
                is_active: d.is_active,
            }))
        }
        console.log(`  📊 Account Defaults: ${snapshot.account_defaults.total} mappings`)

        // ────── 4. Fiscal Periods ──────
        const periods = await FiscalPeriod.findAll({ raw: true })
        snapshot.fiscal_periods = {
            total: periods.length,
            data: periods.map(p => ({
                period: p.period,
                status: p.status,
            }))
        }
        console.log(`  📊 Fiscal Periods: ${snapshot.fiscal_periods.total}`)

        // ────── 5. Branches ──────
        const branches = await Branch.findAll({ raw: true })
        snapshot.branches = {
            total: branches.length,
            data: branches.map(b => ({
                id: b.id,
                name_ar: b.name_ar,
                name_en: b.name_en,
                is_active: b.is_active,
            }))
        }
        console.log(`  📊 Branches: ${snapshot.branches.total}`)

        // ────── 6. Journal Lines Count ──────
        const jlCount = await JournalLine.count()
        snapshot.journal_lines = { total: jlCount }
        console.log(`  📊 Journal Lines: ${jlCount}`)

        // ────── Save Snapshot ──────
        const outputDir = path.join(__dirname, '../../data')
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `pre-migration-snapshot-${timestamp}.json`
        const outputPath = path.join(outputDir, filename)

        fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf8')

        // Also write a "latest" symlink/copy
        const latestPath = path.join(outputDir, 'pre-migration-snapshot.json')
        fs.writeFileSync(latestPath, JSON.stringify(snapshot, null, 2), 'utf8')

        console.log(`\n✅ Backup saved to:`)
        console.log(`   📁 ${outputPath}`)
        console.log(`   📁 ${latestPath} (latest)`)
        console.log(`\n💡 Verify this backup before proceeding with migration.`)
        console.log(`   Total records backed up:`)
        console.log(`     Accounts:        ${snapshot.accounts.total}`)
        console.log(`     Journal Entries:  ${snapshot.journal_entries.total}`)
        console.log(`     Journal Lines:    ${snapshot.journal_lines.total}`)
        console.log(`     Defaults:         ${snapshot.account_defaults.total}`)
        console.log(`     Fiscal Periods:   ${snapshot.fiscal_periods.total}`)
        console.log(`     Branches:         ${snapshot.branches.total}`)

        return { outputPath, snapshot }

    } catch (error) {
        console.error('❌ Backup failed:', error.message)
        console.error(error.stack)
        throw error
    }
}

// Run directly or export
if (require.main === module) {
    createPreMigrationBackup()
        .then(() => process.exit(0))
        .catch(() => process.exit(1))
}

module.exports = { createPreMigrationBackup }
