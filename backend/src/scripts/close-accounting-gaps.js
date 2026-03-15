#!/usr/bin/env node
/**
 * Close critical accounting migration gaps in-place (idempotent).
 *
 * Usage:
 *   node src/scripts/close-accounting-gaps.js
 */

require('dotenv').config()

const { Op, DataTypes } = require('sequelize')
const {
    sequelize,
    Company,
    Branch,
    Account,
    JournalEntry,
    JournalLine,
    FiscalPeriod,
    CostCenter,
    AccountDefault,
    GLAuditLog
} = require('../models')

const DETAIL_TYPE_RULES = [
    { prefix: '1001', expected: 'Cash' },
    { prefix: '1002', expected: 'Bank' },
    { prefix: '1003', expected: 'Receivable' },
    { prefix: '1100', expected: 'Stock' },
    { prefix: '1300', expected: 'Tax' },
    { prefix: '2002', expected: 'Payable' },
    { prefix: '2100', expected: 'Tax' }
]

function toBool(v) {
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v === 1
    if (typeof v === 'string') return ['1', 'true', 't'].includes(v.trim().toLowerCase())
    return false
}

async function findPostingByPrefix(prefix, companyId, transaction) {
    const whereBase = {
        code: { [Op.like]: `${prefix}-%` },
        is_active: true,
        is_group: false
    }

    let account = await Account.findOne({
        where: { ...whereBase, company_id: companyId },
        order: [['code', 'ASC']],
        transaction
    })
    if (account) return account

    account = await Account.findOne({
        where: { ...whereBase, company_id: null },
        order: [['code', 'ASC']],
        transaction
    })
    return account
}

async function resolveReceivablePosting(companyId, transaction) {
    let exact = await Account.findOne({
        where: {
            code: '1003',
            is_active: true,
            is_group: false,
            company_id: companyId
        },
        transaction
    })
    if (exact) return exact

    exact = await Account.findOne({
        where: {
            code: '1003',
            is_active: true,
            is_group: false,
            company_id: null
        },
        transaction
    })
    if (exact) return exact

    return findPostingByPrefix('1003', companyId, transaction)
}

async function ensureDefaultReceivable(companyId, transaction) {
    const receivable = await resolveReceivablePosting(companyId, transaction)
    if (!receivable) {
        return { ensured: false, reason: 'No posting receivable account found under 1003' }
    }

    const existing = await AccountDefault.findOne({
        where: {
            account_key: 'default_receivable_account',
            company_id: null,
            branch_id: null
        },
        order: [['created_at', 'DESC']],
        transaction
    })

    if (!existing) {
        await AccountDefault.create({
            account_key: 'default_receivable_account',
            account_id: receivable.id,
            company_id: null,
            branch_id: null,
            description: 'Auto-created by close-accounting-gaps',
            is_active: true
        }, { transaction })
        return { ensured: true, action: 'created', account_code: receivable.code }
    }

    await existing.update({
        account_id: receivable.id,
        is_active: true
    }, { transaction })
    return { ensured: true, action: 'updated', account_code: receivable.code }
}

async function main() {
    const transaction = await sequelize.transaction()
    const summary = {
        company: null,
        backfill: {},
        costCentersCreated: 0,
        accountTypesNormalized: 0,
        parentsMarkedGroup: 0,
        groupLinesReclassified: 0,
        groupLinesUnresolved: 0,
        receivableDefault: null,
        droppedIsHeaderColumn: false
    }

    try {
        // 1) Ensure at least one company exists
        let company = await Company.findOne({
            where: { is_active: true },
            order: [['created_at', 'ASC']],
            transaction
        })

        if (!company) {
            company = await Company.create({
                name_ar: 'الشركة الرئيسية',
                name_en: 'Main Company',
                abbr: 'HQ',
                country: 'مصر',
                currency: 'EGP',
                fiscal_year_start: '01-01',
                is_active: true
            }, { transaction })
        }
        summary.company = { id: company.id, abbr: company.abbr }

        // 1.1) Ensure warning-level columns exist
        const qi = sequelize.getQueryInterface()

        const jlDesc = await qi.describeTable('gl_journal_lines')
        if (!jlDesc.company_id) {
            await qi.addColumn('gl_journal_lines', 'company_id', {
                type: DataTypes.UUID,
                allowNull: true
            }, { transaction })
        }

        const ccDesc = await qi.describeTable('cost_centers')
        if (!ccDesc.branch_id) {
            await qi.addColumn('cost_centers', 'branch_id', {
                type: DataTypes.UUID,
                allowNull: true
            }, { transaction })
        }

        // 2) Backfill company_id on key tables
        const [branchesUpdated] = await Branch.update(
            { company_id: company.id },
            { where: { company_id: null }, transaction }
        )
        const [accountsUpdated] = await Account.update(
            { company_id: company.id },
            { where: { company_id: null }, transaction }
        )
        const [entriesUpdated] = await JournalEntry.update(
            { company_id: company.id },
            { where: { company_id: null }, transaction }
        )
        const [periodsUpdated] = await FiscalPeriod.update(
            { company_id: company.id },
            { where: { company_id: null }, transaction }
        )

        // Backfill company_id on journal lines from journal entries
        const dialect = sequelize.getDialect()
        if (dialect === 'sqlite') {
            await sequelize.query(`
                UPDATE gl_journal_lines
                SET company_id = (
                    SELECT je.company_id
                    FROM gl_journal_entries je
                    WHERE je.id = gl_journal_lines.journal_entry_id
                )
                WHERE company_id IS NULL
            `, { transaction })
        } else {
            await sequelize.query(`
                UPDATE gl_journal_lines jl
                INNER JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
                SET jl.company_id = je.company_id
                WHERE jl.company_id IS NULL
            `, { transaction })
        }

        const [lineCompanyBackfill] = await sequelize.query(
            `SELECT COUNT(*) AS c FROM gl_journal_lines WHERE company_id IS NULL`,
            { transaction }
        )

        summary.backfill = {
            branches_company_id: branchesUpdated,
            accounts_company_id: accountsUpdated,
            journal_entries_company_id: entriesUpdated,
            fiscal_periods_company_id: periodsUpdated,
            journal_lines_company_id_remaining_null: Number(lineCompanyBackfill?.[0]?.c || 0)
        }

        // 3) Ensure cost center root + branch cost centers
        const [rootCC] = await CostCenter.findOrCreate({
            where: { code: 'CC-ROOT', company_id: company.id },
            defaults: {
                code: 'CC-ROOT',
                name_ar: 'مراكز التكلفة - الجذر',
                name_en: 'Cost Centers - Root',
                is_group: true,
                company_id: company.id,
                is_active: true,
                description: 'Auto-created root cost center'
            },
            transaction
        })

        const branches = await Branch.findAll({
            where: { is_active: true },
            order: [['name_ar', 'ASC']],
            transaction
        })

        for (const branch of branches) {
            const code = `CC-BR-${String(branch.id).replace(/-/g, '').slice(0, 6).toUpperCase()}`
            const [cc, created] = await CostCenter.findOrCreate({
                where: { code, company_id: company.id },
                defaults: {
                    code,
                    name_ar: `مركز تكلفة - ${branch.name_ar}`,
                    name_en: `Cost Center - ${branch.name_en || branch.name_ar}`,
                    parent_id: rootCC.id,
                    is_group: false,
                    company_id: company.id,
                    branch_id: branch.id,
                    is_active: true,
                    description: `Auto-linked for branch ${branch.id}`
                },
                transaction
            })

            if (!created) {
                await cc.update({
                    parent_id: rootCC.id,
                    branch_id: branch.id,
                    is_active: true
                }, { transaction })
            } else {
                summary.costCentersCreated += 1
            }
        }

        // 4) Normalize detailed account_type for key families
        const allAccounts = await Account.findAll({
            attributes: ['id', 'code', 'account_type'],
            transaction
        })
        for (const acc of allAccounts) {
            const code = String(acc.code || '')
            for (const rule of DETAIL_TYPE_RULES) {
                if (code === rule.prefix || code.startsWith(`${rule.prefix}-`)) {
                    if (String(acc.account_type || '').toLowerCase() !== rule.expected.toLowerCase()) {
                        await acc.update({ account_type: rule.expected }, { transaction })
                        summary.accountTypesNormalized += 1
                    }
                    break
                }
            }
        }

        // 5) Ensure all non-leaf accounts are marked as groups
        const hierarchyRows = await Account.findAll({
            attributes: ['id', 'parent_id', 'is_group'],
            transaction
        })
        const parentIds = new Set(hierarchyRows.filter(r => r.parent_id).map(r => r.parent_id))
        for (const acc of hierarchyRows) {
            if (parentIds.has(acc.id) && !toBool(acc.is_group)) {
                await acc.update({ is_group: true }, { transaction })
                summary.parentsMarkedGroup += 1
            }
        }

        // 6) Reclass historical journal lines posted to group accounts
        const groupLines = await JournalLine.findAll({
            include: [{
                model: Account,
                as: 'account',
                attributes: ['id', 'code', 'is_group']
            }],
            transaction
        })

        const targetByGroupCode = new Map()

        for (const jl of groupLines) {
            if (!jl.account || !toBool(jl.account.is_group)) continue
            const groupCode = jl.account.code

            if (!targetByGroupCode.has(groupCode)) {
                const target = await findPostingByPrefix(groupCode, company.id, transaction)
                targetByGroupCode.set(groupCode, target || null)
            }

            const target = targetByGroupCode.get(groupCode)
            if (!target) {
                summary.groupLinesUnresolved += 1
                continue
            }

            if (jl.account_id !== target.id) {
                await jl.update({ account_id: target.id }, { transaction })
                summary.groupLinesReclassified += 1
            }
        }

        // 7) Ensure default_receivable_account exists and points to posting account
        summary.receivableDefault = await ensureDefaultReceivable(company.id, transaction)

        // 8) Drop legacy column is_header if still present
        const accountDesc = await qi.describeTable('gl_accounts')
        if (accountDesc.is_header) {
            await qi.removeColumn('gl_accounts', 'is_header', { transaction })
            summary.droppedIsHeaderColumn = true
        }

        // 9) Audit log marker for migration verification
        await GLAuditLog.create({
            event_type: 'migration_gap_closure',
            source_type: 'migration',
            source_id: `close-accounting-gaps-${Date.now()}`,
            payload: summary
        }, { transaction })

        await transaction.commit()

        console.log('✅ close-accounting-gaps completed')
        console.log(JSON.stringify(summary, null, 2))
    } catch (error) {
        await transaction.rollback()
        console.error('❌ close-accounting-gaps failed:', error.message)
        console.error(error.stack)
        process.exit(1)
    } finally {
        await sequelize.close()
    }
}

main()
