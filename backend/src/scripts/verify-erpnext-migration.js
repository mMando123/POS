#!/usr/bin/env node
/**
 * ERPNext-Style Migration Verifier
 */

const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize } = require('../models')

const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
}

const STATUS = {
    PASS: 'PASS',
    WARN: 'WARN',
    FAIL: 'FAIL'
}

const ICON = {
    PASS: '✅',
    WARN: '⚠️',
    FAIL: '❌'
}

const REQUIRED_DEFAULT_KEYS = [
    'default_cash_account',
    'default_bank_account',
    'default_receivable_account',
    'default_payable_account',
    'default_income_account',
    'default_cogs_account',
    'default_stock_in_hand_account',
    'default_input_vat_account',
    'default_output_vat_account',
    'default_discount_account',
    'default_cash_shortage_account',
    'default_shrinkage_account',
    'default_clearing_account',
    'default_drawer_float_account',
    'default_retained_earnings_account'
]

const ROOT_TYPE_BY_PREFIX = {
    '1': 'asset',
    '2': 'liability',
    '3': 'equity',
    '4': 'income',
    '5': 'expense'
}

const DETAIL_TYPE_RULES = [
    { prefix: '1001', expected: 'Cash' },
    { prefix: '1002', expected: 'Bank' },
    { prefix: '1003', expected: 'Receivable' },
    { prefix: '1100', expected: 'Stock' },
    { prefix: '1300', expected: 'Tax' },
    { prefix: '2002', expected: 'Payable' },
    { prefix: '2100', expected: 'Tax' }
]

const CODE_SCAN_IGNORE_DIRS = new Set([
    '.git',
    '.idea',
    '.vscode',
    'scripts',
    'node_modules',
    'dist',
    'build',
    'coverage',
    'run-logs',
    'logs',
    'reports'
])

function paint(color, text) {
    return `${COLORS[color] || ''}${text}${COLORS.reset}`
}

function pad2(n) {
    return String(n).padStart(2, '0')
}

function timestampForFile() {
    const d = new Date()
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

function normalizeTableName(entry) {
    if (!entry) return ''
    if (typeof entry === 'string') return entry
    return entry.tableName || entry.TABLE_NAME || Object.values(entry)[0]
}

function toNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

function round2(value) {
    return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100
}

function lower(value) {
    return String(value || '').trim().toLowerCase()
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\s\-_]+/g, '')
        .trim()
}

function isGroupAccount(account) {
    if (!account) return false
    if (typeof account.is_group === 'boolean') return account.is_group
    if (typeof account.is_group === 'number') return account.is_group === 1
    if (typeof account.is_group === 'string') {
        const v = account.is_group.trim().toLowerCase()
        return v === '1' || v === 'true' || v === 't'
    }
    return !!account.is_header
}

function statusColor(status) {
    if (status === STATUS.PASS) return 'green'
    if (status === STATUS.WARN) return 'yellow'
    return 'red'
}

class Verifier {
    constructor() {
        this.checks = []
        this.qi = sequelize.getQueryInterface()
        this.tables = new Set()
        this.columnCache = new Map()
        this.dialect = sequelize.getDialect()
        this.startedAt = new Date().toISOString()
        this.repoRoot = path.resolve(__dirname, '../../..')
    }

    async init() {
        await sequelize.authenticate()
        const tablesRaw = await this.qi.showAllTables()
        this.tables = new Set(tablesRaw.map(normalizeTableName))
    }

    async query(sql, replacements = {}) {
        const [rows] = await sequelize.query(sql, { replacements })
        return rows
    }

    async getColumns(tableName) {
        if (this.columnCache.has(tableName)) return this.columnCache.get(tableName)
        if (!this.tables.has(tableName)) {
            this.columnCache.set(tableName, null)
            return null
        }
        try {
            const desc = await this.qi.describeTable(tableName)
            this.columnCache.set(tableName, desc)
            return desc
        } catch {
            this.columnCache.set(tableName, null)
            return null
        }
    }

    async hasColumn(tableName, columnName) {
        const cols = await this.getColumns(tableName)
        return !!(cols && cols[columnName])
    }

    hasTable(tableName) {
        return this.tables.has(tableName)
    }

    addCheck(id, title, status, details = {}, fix = '') {
        const row = {
            id,
            title,
            status,
            icon: ICON[status],
            details,
            fix
        }
        this.checks.push(row)

        const color = statusColor(status)
        const summary = details.summary ? ` — ${details.summary}` : ''
        console.log(`${paint(color, `${ICON[status]} [${id}] ${title}${summary}`)}`)
    }

    getSummary() {
        const passed = this.checks.filter((c) => c.status === STATUS.PASS).length
        const warnings = this.checks.filter((c) => c.status === STATUS.WARN).length
        const failed = this.checks.filter((c) => c.status === STATUS.FAIL).length
        return {
            total: this.checks.length,
            passed,
            warnings,
            failed
        }
    }

    getPriorityFixes() {
        const failed = this.checks
            .filter((c) => c.status === STATUS.FAIL)
            .map((c) => ({ id: c.id, title: c.title, fix: c.fix || 'No remediation provided.' }))
        const warned = this.checks
            .filter((c) => c.status === STATUS.WARN)
            .map((c) => ({ id: c.id, title: c.title, fix: c.fix || 'No remediation provided.' }))

        return {
            critical: failed,
            warnings: warned
        }
    }
}

function detectParentLoops(nodes) {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const state = new Map()
    const loops = []
    const chain = []

    const dfs = (id) => {
        const currentState = state.get(id) || 0
        if (currentState === 1) {
            const idx = chain.indexOf(id)
            if (idx >= 0) loops.push(chain.slice(idx).concat(id))
            return
        }
        if (currentState === 2) return

        state.set(id, 1)
        chain.push(id)
        const parentId = byId.get(id)?.parent_id
        if (parentId && byId.has(parentId)) dfs(parentId)
        chain.pop()
        state.set(id, 2)
    }

    for (const node of nodes) {
        if (!state.get(node.id)) dfs(node.id)
    }

    const dedup = new Map()
    for (const cycle of loops) {
        const key = cycle.slice().sort().join('|')
        if (!dedup.has(key)) dedup.set(key, cycle)
    }
    return Array.from(dedup.values())
}

function walkFiles(rootDir, exts = new Set(['.js', '.jsx'])) {
    const files = []
    const stack = [rootDir]

    while (stack.length > 0) {
        const current = stack.pop()
        if (!current) continue

        let stat
        try {
            stat = fs.statSync(current)
        } catch {
            continue
        }

        if (stat.isDirectory()) {
            const base = path.basename(current)
            if (CODE_SCAN_IGNORE_DIRS.has(base)) continue
            let entries = []
            try {
                entries = fs.readdirSync(current)
            } catch {
                continue
            }
            for (const entry of entries) {
                stack.push(path.join(current, entry))
            }
            continue
        }

        const ext = path.extname(current).toLowerCase()
        if (!exts.has(ext)) continue
        if (stat.size > 3 * 1024 * 1024) continue
        files.push(current)
    }

    return files
}

function scanPatternInFiles(files, matcher) {
    const hits = []
    for (const filePath of files) {
        let content
        try {
            content = fs.readFileSync(filePath, 'utf8')
        } catch {
            continue
        }
        const lines = content.split(/\r?\n/)
        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i]
            if (matcher(line)) {
                hits.push({
                    file: filePath,
                    line: i + 1,
                    snippet: line.trim().slice(0, 220)
                })
            }
        }
    }
    return hits
}

async function run() {
    const verifier = new Verifier()
    console.log(paint('cyan', '\nERPNext-Style Migration Verification Started'))
    console.log(paint('gray', `Database Dialect: ${verifier.dialect}`))

    try {
        await verifier.init()
    } catch (error) {
        console.error(paint('red', `Database connection failed: ${error.message}`))
        process.exitCode = 1
        return
    }

    const table = (name) => name

    // -----------------------
    // Section 1: Database
    // -----------------------
    {
        const hasIsGroup = await verifier.hasColumn(table('gl_accounts'), 'is_group')
        const hasIsHeader = await verifier.hasColumn(table('gl_accounts'), 'is_header')
        const pass = hasIsGroup && !hasIsHeader
        verifier.addCheck(
            '1',
            'gl_accounts has is_group and does not have is_header',
            pass ? STATUS.PASS : STATUS.FAIL,
            {
                has_is_group: hasIsGroup,
                has_is_header: hasIsHeader,
                summary: `is_group=${hasIsGroup}, is_header=${hasIsHeader}`
            },
            'Run ERPNext migration for Account schema and remove legacy is_header references.'
        )
    }

    {
        const hasRootType = await verifier.hasColumn(table('gl_accounts'), 'root_type')
        verifier.addCheck(
            '2',
            'gl_accounts has root_type column',
            hasRootType ? STATUS.PASS : STATUS.FAIL,
            {
                has_root_type: hasRootType,
                summary: `root_type=${hasRootType}`
            },
            'Add root_type column and backfill from old classification.'
        )
    }

    {
        const requiredTables = ['gl_accounts', 'gl_journal_entries', 'branches', 'gl_fiscal_periods']
        const optionalTable = 'gl_journal_lines'
        const matrix = {}
        let failed = 0

        for (const t of requiredTables) {
            const exists = verifier.hasTable(t)
            const hasCompanyId = exists ? await verifier.hasColumn(t, 'company_id') : false
            matrix[t] = { table_exists: exists, has_company_id: hasCompanyId, required: true }
            if (!exists || !hasCompanyId) failed += 1
        }

        const optionalExists = verifier.hasTable(optionalTable)
        const optionalHas = optionalExists ? await verifier.hasColumn(optionalTable, 'company_id') : false
        matrix[optionalTable] = { table_exists: optionalExists, has_company_id: optionalHas, required: false }

        const status = failed > 0 ? STATUS.FAIL : (optionalExists && !optionalHas ? STATUS.WARN : STATUS.PASS)
        verifier.addCheck(
            '3',
            'company_id exists in required accounting tables',
            status,
            {
                ...matrix,
                summary: `required_failures=${failed}, optional_gl_journal_lines_has_company_id=${optionalHas}`
            },
            'Add company_id to missing tables and backfill existing rows with default company.'
        )
    }

    {
        const targets = ['gl_journal_entries', 'gl_journal_lines']
        const details = {}
        let failed = 0
        for (const t of targets) {
            const has = verifier.hasTable(t) ? await verifier.hasColumn(t, 'cost_center_id') : false
            details[t] = { table_exists: verifier.hasTable(t), has_cost_center_id: has }
            if (!has) failed += 1
        }
        verifier.addCheck(
            '4',
            'cost_center_id exists in journal entry and journal line',
            failed === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                ...details,
                summary: `missing=${failed}`
            },
            'Add cost_center_id to journal tables and index it for reporting.'
        )
    }

    {
        const exists = verifier.hasTable('companies')
        let count = 0
        if (exists) {
            const rows = await verifier.query('SELECT COUNT(*) AS c FROM companies')
            count = toNumber(rows?.[0]?.c)
        }
        verifier.addCheck(
            '5',
            'companies table exists and has at least one record',
            exists && count > 0 ? STATUS.PASS : STATUS.FAIL,
            {
                table_exists: exists,
                company_count: count,
                summary: `companies=${count}`
            },
            'Create companies table and seed at least one active company.'
        )
    }

    {
        const exists = verifier.hasTable('cost_centers')
        let count = 0
        if (exists) {
            const rows = await verifier.query('SELECT COUNT(*) AS c FROM cost_centers')
            count = toNumber(rows?.[0]?.c)
        }
        verifier.addCheck(
            '6',
            'cost_centers table exists and has data',
            exists && count > 0 ? STATUS.PASS : STATUS.FAIL,
            {
                table_exists: exists,
                cost_center_count: count,
                summary: `cost_centers=${count}`
            },
            'Seed root and branch-level cost centers.'
        )
    }

    // Load account snapshot once for later checks
    let accounts = []
    if (verifier.hasTable('gl_accounts')) {
        accounts = await verifier.query(`
            SELECT
                id, code, name_ar, name_en, root_type, account_type, normal_balance,
                parent_id, is_group, company_id, is_active
            FROM gl_accounts
        `)
    }

    // -----------------------
    // Section 2: Data integrity
    // -----------------------
    {
        const nullCount = accounts.filter((a) => !a.root_type).length
        verifier.addCheck(
            '7',
            'All accounts have root_type',
            nullCount === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                account_count: accounts.length,
                null_root_type_count: nullCount,
                summary: `null_root_type=${nullCount}`
            },
            'Backfill root_type for NULL rows and enforce NOT NULL.'
        )
    }

    {
        const nullCount = accounts.filter((a) => !a.company_id).length
        verifier.addCheck(
            '8',
            'All accounts have company_id',
            nullCount === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                account_count: accounts.length,
                null_company_id_count: nullCount,
                summary: `null_company_id=${nullCount}`
            },
            'Backfill company_id on gl_accounts and enforce non-null policy post-cutover.'
        )
    }

    {
        const byId = new Map(accounts.map((a) => [a.id, a]))
        const mismatches = []
        const missingParent = []
        for (const child of accounts) {
            if (!child.parent_id) continue
            const parent = byId.get(child.parent_id)
            if (!parent) {
                missingParent.push({ child_id: child.id, child_code: child.code, parent_id: child.parent_id })
                continue
            }
            if (lower(parent.root_type) !== lower(child.root_type)) {
                mismatches.push({
                    child_code: child.code,
                    child_root_type: child.root_type,
                    parent_code: parent.code,
                    parent_root_type: parent.root_type
                })
            }
        }
        const fail = mismatches.length > 0 || missingParent.length > 0
        verifier.addCheck(
            '9',
            'Child accounts inherit root_type from parent',
            fail ? STATUS.FAIL : STATUS.PASS,
            {
                mismatch_count: mismatches.length,
                missing_parent_count: missingParent.length,
                mismatch_sample: mismatches.slice(0, 20),
                missing_parent_sample: missingParent.slice(0, 20),
                summary: `mismatches=${mismatches.length}, missing_parent=${missingParent.length}`
            },
            'Fix parent-child root_type consistency and orphaned parent_id references.'
        )
    }

    {
        let violatingCount = 0
        let sample = []
        if (verifier.hasTable('gl_journal_lines') && verifier.hasTable('gl_accounts')) {
            const rows = await verifier.query(`
                SELECT
                    jl.journal_entry_id,
                    a.code,
                    a.name_ar,
                    a.name_en
                FROM gl_journal_lines jl
                INNER JOIN gl_accounts a ON a.id = jl.account_id
                WHERE a.is_group = 1
                LIMIT 50
            `)
            sample = rows
            const countRows = await verifier.query(`
                SELECT COUNT(*) AS c
                FROM gl_journal_lines jl
                INNER JOIN gl_accounts a ON a.id = jl.account_id
                WHERE a.is_group = 1
            `)
            violatingCount = toNumber(countRows?.[0]?.c)
        }

        verifier.addCheck(
            '10',
            'No direct journal lines posted to group accounts',
            violatingCount === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                violating_line_count: violatingCount,
                sample,
                summary: `group_lines=${violatingCount}`
            },
            'Reclass lines to posting accounts only and block posting to is_group=true in service validation.'
        )
    }

    {
        let invalidCount = 0
        let sample = []
        if (verifier.hasTable('gl_account_defaults') && verifier.hasTable('gl_accounts')) {
            const rows = await verifier.query(`
                SELECT
                    ad.id,
                    ad.account_key,
                    ad.account_id,
                    a.code,
                    a.is_group,
                    a.is_active
                FROM gl_account_defaults ad
                LEFT JOIN gl_accounts a ON a.id = ad.account_id
                WHERE ad.is_active = 1
                  AND (a.id IS NULL OR a.is_group = 1)
                LIMIT 50
            `)
            sample = rows
            const countRows = await verifier.query(`
                SELECT COUNT(*) AS c
                FROM gl_account_defaults ad
                LEFT JOIN gl_accounts a ON a.id = ad.account_id
                WHERE ad.is_active = 1
                  AND (a.id IS NULL OR a.is_group = 1)
            `)
            invalidCount = toNumber(countRows?.[0]?.c)
        }

        verifier.addCheck(
            '11',
            'All active account_defaults map to posting accounts (is_group=false)',
            invalidCount === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                invalid_mapping_count: invalidCount,
                sample,
                summary: `invalid_defaults=${invalidCount}`
            },
            'Update defaults to ledger accounts and prevent selecting group accounts in UI/API.'
        )
    }

    {
        let invalidCount = 0
        let sample = []
        if (verifier.hasTable('gl_account_defaults') && verifier.hasTable('gl_accounts')) {
            const rows = await verifier.query(`
                SELECT
                    ad.id,
                    ad.account_key,
                    a.code,
                    a.is_active
                FROM gl_account_defaults ad
                LEFT JOIN gl_accounts a ON a.id = ad.account_id
                WHERE ad.is_active = 1
                  AND (a.id IS NULL OR a.is_active = 0)
                LIMIT 50
            `)
            sample = rows
            const countRows = await verifier.query(`
                SELECT COUNT(*) AS c
                FROM gl_account_defaults ad
                LEFT JOIN gl_accounts a ON a.id = ad.account_id
                WHERE ad.is_active = 1
                  AND (a.id IS NULL OR a.is_active = 0)
            `)
            invalidCount = toNumber(countRows?.[0]?.c)
        }
        verifier.addCheck(
            '12',
            'All active account_defaults map to active accounts',
            invalidCount === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                invalid_mapping_count: invalidCount,
                sample,
                summary: `inactive_or_missing_defaults=${invalidCount}`
            },
            'Repoint defaults to active accounts and deactivate stale mappings.'
        )
    }

    {
        let duplicates = []
        if (verifier.hasTable('gl_accounts')) {
            duplicates = await verifier.query(`
                SELECT
                    code,
                    COALESCE(company_id, '__NULL__') AS company_scope,
                    COUNT(*) AS duplicate_count
                FROM gl_accounts
                GROUP BY code, COALESCE(company_id, '__NULL__')
                HAVING COUNT(*) > 1
                ORDER BY duplicate_count DESC, code ASC
            `)
        }

        verifier.addCheck(
            '13',
            'Account code is unique within same company (code + company_id)',
            duplicates.length === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                duplicate_group_count: duplicates.length,
                duplicates,
                summary: `duplicate_groups=${duplicates.length}`
            },
            'Deduplicate account codes per company and enforce unique index on (code, company_id).'
        )
    }

    {
        const loops = detectParentLoops(accounts.map((a) => ({ id: a.id, parent_id: a.parent_id })))
        verifier.addCheck(
            '14',
            'No loops in account hierarchy',
            loops.length === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                loop_count: loops.length,
                loop_sample: loops.slice(0, 20),
                summary: `loops=${loops.length}`
            },
            'Break parent loops and enforce loop protection in account move/update logic.'
        )
    }

    {
        let nullCount = 0
        if (verifier.hasTable('gl_journal_entries')) {
            const rows = await verifier.query(`
                SELECT COUNT(*) AS c
                FROM gl_journal_entries
                WHERE company_id IS NULL
            `)
            nullCount = toNumber(rows?.[0]?.c)
        }
        verifier.addCheck(
            '15',
            'All journal entries have company_id',
            nullCount === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                null_company_id_entries: nullCount,
                summary: `null_company_id_entries=${nullCount}`
            },
            'Backfill company_id for legacy entries and block posting without company context.'
        )
    }

    // -----------------------
    // Section 3: Account defaults coverage
    // -----------------------
    {
        let activeKeys = []
        if (verifier.hasTable('gl_account_defaults')) {
            const rows = await verifier.query(`
                SELECT account_key, COUNT(*) AS c
                FROM gl_account_defaults
                WHERE is_active = 1
                GROUP BY account_key
            `)
            activeKeys = rows.map((r) => r.account_key)
        }

        const missing = REQUIRED_DEFAULT_KEYS.filter((k) => !activeKeys.includes(k))
        verifier.addCheck(
            '16',
            'Required default account keys exist in account_defaults',
            missing.length === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                required_key_count: REQUIRED_DEFAULT_KEYS.length,
                found_key_count: REQUIRED_DEFAULT_KEYS.length - missing.length,
                missing_keys: missing,
                summary: `missing_keys=${missing.length}`
            },
            'Run seed-account-defaults script and manually map missing keys.'
        )
    }

    // -----------------------
    // Section 4: Account tree rules
    // -----------------------
    {
        const rootAccounts = accounts.filter((a) => !a.parent_id)
        const mismatches = []
        for (const acc of rootAccounts) {
            const code = String(acc.code || '').trim()
            const expected = ROOT_TYPE_BY_PREFIX[code.charAt(0)]
            if (!expected) continue
            if (lower(acc.root_type) !== expected) {
                mismatches.push({
                    code: acc.code,
                    root_type: acc.root_type,
                    expected_root_type: expected
                })
            }
        }
        verifier.addCheck(
            '17',
            'Root account codes (1xxx..5xxx) match expected root_type',
            mismatches.length === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                root_account_count: rootAccounts.length,
                checked_count: rootAccounts.filter((a) => ROOT_TYPE_BY_PREFIX[String(a.code || '').charAt(0)]).length,
                mismatch_count: mismatches.length,
                mismatches,
                summary: `mismatches=${mismatches.length}`
            },
            'Correct root_type for mismatched root accounts by prefix policy.'
        )
    }

    {
        const childCountByParent = new Map()
        for (const a of accounts) {
            if (!a.parent_id) continue
            childCountByParent.set(a.parent_id, (childCountByParent.get(a.parent_id) || 0) + 1)
        }

        const violating = accounts
            .filter((a) => (childCountByParent.get(a.id) || 0) > 0 && !isGroupAccount(a))
            .map((a) => ({
                code: a.code,
                name_ar: a.name_ar,
                children: childCountByParent.get(a.id) || 0,
                is_group: !!a.is_group
            }))

        verifier.addCheck(
            '18',
            'Every account with children is marked as is_group=true',
            violating.length === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                violating_count: violating.length,
                sample: violating.slice(0, 50),
                summary: `violations=${violating.length}`
            },
            'Set is_group=true for non-leaf accounts that have active child nodes.'
        )
    }

    {
        const childCountByParent = new Map()
        for (const a of accounts) {
            if (!a.parent_id) continue
            childCountByParent.set(a.parent_id, (childCountByParent.get(a.parent_id) || 0) + 1)
        }

        const violating = accounts
            .filter((a) => (childCountByParent.get(a.id) || 0) === 0 && isGroupAccount(a))
            .map((a) => ({
                code: a.code,
                name_ar: a.name_ar,
                is_group: !!a.is_group
            }))

        verifier.addCheck(
            '19',
            'Every leaf account is marked as posting (is_group=false)',
            violating.length === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                violating_count: violating.length,
                sample: violating.slice(0, 50),
                summary: `violations=${violating.length}`
            },
            'Convert leaf group accounts to posting accounts or create proper children.'
        )
    }

    {
        const mismatches = []
        const missingFamilies = []
        for (const rule of DETAIL_TYPE_RULES) {
            const family = accounts.filter((a) => {
                const code = String(a.code || '')
                if (code === rule.prefix || code.startsWith(`${rule.prefix}-`)) return !isGroupAccount(a)
                return false
            })

            if (family.length === 0) {
                missingFamilies.push(rule.prefix)
                continue
            }

            for (const acc of family) {
                if (lower(acc.account_type) !== lower(rule.expected)) {
                    mismatches.push({
                        code: acc.code,
                        account_type: acc.account_type,
                        expected: rule.expected,
                        rule_prefix: rule.prefix
                    })
                }
            }
        }

        const status = mismatches.length > 0 ? STATUS.FAIL : (missingFamilies.length > 0 ? STATUS.WARN : STATUS.PASS)
        verifier.addCheck(
            '20',
            'Detailed account_type classification matches family rules',
            status,
            {
                mismatch_count: mismatches.length,
                mismatch_sample: mismatches.slice(0, 80),
                missing_families: missingFamilies,
                summary: `mismatches=${mismatches.length}, missing_families=${missingFamilies.length}`
            },
            'Normalize account_type by family prefix (Cash/Bank/Receivable/Stock/Tax/Payable).'
        )
    }

    // -----------------------
    // Section 5: Cost centers
    // -----------------------
    let costCenters = []
    if (verifier.hasTable('cost_centers')) {
        costCenters = await verifier.query(`
            SELECT id, code, name_ar, name_en, parent_id, is_group, company_id, is_active
            FROM cost_centers
        `)
    }

    {
        if (!verifier.hasTable('branches') || !verifier.hasTable('cost_centers')) {
            verifier.addCheck(
                '21',
                'Each branch has a corresponding cost center',
                STATUS.FAIL,
                {
                    branches_table_exists: verifier.hasTable('branches'),
                    cost_centers_table_exists: verifier.hasTable('cost_centers'),
                    summary: 'required table missing'
                },
                'Create required tables and establish branch-to-cost-center mapping.'
            )
        } else {
            const hasDirectFk = await verifier.hasColumn('cost_centers', 'branch_id')
            const branches = await verifier.query(`
                SELECT id, name_ar, name_en, is_active
                FROM branches
                WHERE COALESCE(is_active, 1) = 1
            `)

            if (hasDirectFk) {
                const rows = await verifier.query(`
                    SELECT b.id, b.name_ar, b.name_en
                    FROM branches b
                    LEFT JOIN cost_centers cc ON cc.branch_id = b.id
                    WHERE COALESCE(b.is_active, 1) = 1
                    GROUP BY b.id, b.name_ar, b.name_en
                    HAVING COUNT(cc.id) = 0
                `)
                verifier.addCheck(
                    '21',
                    'Each branch has a corresponding cost center',
                    rows.length === 0 ? STATUS.PASS : STATUS.FAIL,
                    {
                        matching_mode: 'direct_fk(branch_id)',
                        active_branch_count: branches.length,
                        unmatched_branch_count: rows.length,
                        unmatched_branches: rows,
                        summary: `unmatched=${rows.length}`
                    },
                    'Create missing cost centers for unmatched branches.'
                )
            } else {
                const ccSearch = costCenters.map((c) => ({
                    id: c.id,
                    code: normalizeText(c.code),
                    name_ar: normalizeText(c.name_ar),
                    name_en: normalizeText(c.name_en)
                }))

                const unmatched = []
                for (const b of branches) {
                    const ar = normalizeText(b.name_ar)
                    const en = normalizeText(b.name_en)
                    const matched = ccSearch.some((cc) => {
                        const source = `${cc.code} ${cc.name_ar} ${cc.name_en}`.trim()
                        const arHit = ar && ar.length > 2 && source.includes(ar)
                        const enHit = en && en.length > 2 && source.includes(en)
                        return arHit || enHit
                    })
                    if (!matched) unmatched.push({ id: b.id, name_ar: b.name_ar, name_en: b.name_en })
                }

                const status = unmatched.length === 0 ? STATUS.WARN : STATUS.FAIL
                verifier.addCheck(
                    '21',
                    'Each branch has a corresponding cost center',
                    status,
                    {
                        matching_mode: 'heuristic(name/code) because cost_centers.branch_id does not exist',
                        active_branch_count: branches.length,
                        unmatched_branch_count: unmatched.length,
                        unmatched_branches: unmatched,
                        summary: `unmatched=${unmatched.length} (heuristic mode)`
                    },
                    'Add branch_id FK to cost_centers (or bridge table) for strict branch-cost-center integrity.'
                )
            }
        }
    }

    {
        const loops = detectParentLoops(costCenters.map((c) => ({ id: c.id, parent_id: c.parent_id })))
        verifier.addCheck(
            '22',
            'No loops in cost center hierarchy',
            loops.length === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                loop_count: loops.length,
                loop_sample: loops.slice(0, 20),
                summary: `loops=${loops.length}`
            },
            'Break cost center parent loops and enforce loop validation on move/update.'
        )
    }

    {
        const nullCount = costCenters.filter((c) => !c.company_id).length
        verifier.addCheck(
            '23',
            'All cost centers have company_id',
            nullCount === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                cost_center_count: costCenters.length,
                null_company_id_count: nullCount,
                summary: `null_company_id=${nullCount}`
            },
            'Backfill company_id in cost_centers and enforce non-null policy.'
        )
    }

    // -----------------------
    // Section 6: Audit
    // -----------------------
    let auditTableUsed = null
    const auditCandidates = ['gl_account_audit_log', 'gl_account_audit_logs', 'gl_audit_logs']
    for (const t of auditCandidates) {
        if (verifier.hasTable(t)) {
            auditTableUsed = t
            break
        }
    }

    {
        if (!auditTableUsed) {
            verifier.addCheck(
                '24',
                'Audit log table contains migration records',
                STATUS.FAIL,
                {
                    available_candidates: auditCandidates.filter((t) => verifier.hasTable(t)),
                    summary: 'no audit log table found'
                },
                'Create/restore accounting audit table and log migration events.'
            )
        } else {
            const cols = await verifier.getColumns(auditTableUsed)
            const searchable = ['event_type', 'source_type', 'payload', 'action', 'notes', 'message', 'description']
                .filter((c) => cols && cols[c])

            let migrationCount = 0
            if (searchable.length > 0) {
                const where = searchable.map((c) => `LOWER(COALESCE(${c}, '')) LIKE :term`).join(' OR ')
                const rows = await verifier.query(`SELECT COUNT(*) AS c FROM ${auditTableUsed} WHERE ${where}`, { term: '%migrat%' })
                migrationCount = toNumber(rows?.[0]?.c)
            }

            verifier.addCheck(
                '24',
                'Audit log table contains migration records',
                migrationCount > 0 ? STATUS.PASS : STATUS.FAIL,
                {
                    audit_table: auditTableUsed,
                    searchable_columns: searchable,
                    migration_record_count: migrationCount,
                    summary: `migration_records=${migrationCount}`
                },
                'Write migration events to audit log (event_type/source_type/payload include migration marker).'
            )
        }
    }

    {
        if (!auditTableUsed) {
            verifier.addCheck(
                '25',
                'Audit log has records (count > 0)',
                STATUS.FAIL,
                {
                    audit_table: null,
                    count: 0,
                    summary: 'audit table missing'
                },
                'Create audit table and ensure accounting hooks write audit entries.'
            )
        } else {
            const rows = await verifier.query(`SELECT COUNT(*) AS c FROM ${auditTableUsed}`)
            const count = toNumber(rows?.[0]?.c)
            verifier.addCheck(
                '25',
                'Audit log has records (count > 0)',
                count > 0 ? STATUS.PASS : STATUS.FAIL,
                {
                    audit_table: auditTableUsed,
                    count,
                    summary: `count=${count}`
                },
                'Investigate audit hook pipeline and ensure events are persisted.'
            )
        }
    }

    // -----------------------
    // Section 7: Accounting balance
    // -----------------------
    {
        if (!verifier.hasTable('gl_journal_lines')) {
            verifier.addCheck(
                '26',
                'Total debits equal total credits',
                STATUS.FAIL,
                { summary: 'gl_journal_lines table missing' },
                'Create/recover gl_journal_lines table.'
            )
        } else {
            const rows = await verifier.query(`
                SELECT
                    COALESCE(SUM(debit_amount), 0) AS total_debit,
                    COALESCE(SUM(credit_amount), 0) AS total_credit
                FROM gl_journal_lines
            `)
            const debit = round2(rows?.[0]?.total_debit)
            const credit = round2(rows?.[0]?.total_credit)
            const diff = round2(debit - credit)
            verifier.addCheck(
                '26',
                'Total debits equal total credits',
                Math.abs(diff) < 0.005 ? STATUS.PASS : STATUS.FAIL,
                {
                    total_debit: debit,
                    total_credit: credit,
                    difference: diff,
                    summary: `diff=${diff}`
                },
                'Investigate unbalanced lines and post correcting journal entries.'
            )
        }
    }

    {
        if (!verifier.hasTable('gl_journal_lines')) {
            verifier.addCheck(
                '27',
                'No singleton journal entries (minimum 2 lines per entry)',
                STATUS.FAIL,
                { summary: 'gl_journal_lines table missing' },
                'Create/recover gl_journal_lines table.'
            )
        } else {
            const violating = await verifier.query(`
                SELECT journal_entry_id, COUNT(*) AS line_count
                FROM gl_journal_lines
                GROUP BY journal_entry_id
                HAVING COUNT(*) < 2
                ORDER BY line_count ASC
            `)
            verifier.addCheck(
                '27',
                'No singleton journal entries (minimum 2 lines per entry)',
                violating.length === 0 ? STATUS.PASS : STATUS.FAIL,
                {
                    violating_entry_count: violating.length,
                    sample: violating.slice(0, 80),
                    summary: `singletons=${violating.length}`
                },
                'Recover/add missing counterpart lines so every journal entry is double-entry compliant.'
            )
        }
    }

    // -----------------------
    // Section 8: Code references
    // -----------------------
    const scanRoot = verifier.repoRoot
    const codeFiles = walkFiles(scanRoot, new Set(['.js', '.jsx']))

    {
        const hits = scanPatternInFiles(codeFiles, (line) => line.includes('is_header'))
        verifier.addCheck(
            '28',
            'No code references to legacy field is_header',
            hits.length === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                scanned_file_count: codeFiles.length,
                hit_count: hits.length,
                hits,
                summary: `hits=${hits.length}`
            },
            'Replace legacy is_header references with is_group (keep compatibility adapters only where strictly necessary).'
        )
    }

    {
        const legacyRegex = /account_type\s*={2,3}\s*['"](asset|liability|equity|income|expense)['"]/i
        const hits = scanPatternInFiles(codeFiles, (line) => legacyRegex.test(line))
        verifier.addCheck(
            '29',
            'No legacy root classification comparisons on account_type',
            hits.length === 0 ? STATUS.PASS : STATUS.FAIL,
            {
                scanned_file_count: codeFiles.length,
                hit_count: hits.length,
                hits,
                summary: `hits=${hits.length}`
            },
            'Use root_type for main classification and keep account_type for detailed subtype only.'
        )
    }

    // -----------------------
    // Save report
    // -----------------------
    const summary = verifier.getSummary()
    const report = {
        generated_at: new Date().toISOString(),
        started_at: verifier.startedAt,
        finished_at: new Date().toISOString(),
        dialect: verifier.dialect,
        db: {
            host: process.env.DB_HOST || null,
            name: process.env.DB_NAME || null,
            user: process.env.DB_USER || null,
            dialect: process.env.DB_DIALECT || verifier.dialect
        },
        summary,
        checks: verifier.checks,
        fixes_by_priority: verifier.getPriorityFixes()
    }

    const reportsDir = path.join(__dirname, 'reports')
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })

    const stamp = timestampForFile()
    const reportPath = path.join(reportsDir, `verification-report-${stamp}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

    console.log('')
    console.log(paint('cyan', 'Verification Summary'))
    console.log(paint('green', `Passed: ${summary.passed}`))
    console.log(paint('yellow', `Warnings: ${summary.warnings}`))
    console.log(paint('red', `Failed: ${summary.failed}`))
    console.log(paint('cyan', `Total: ${summary.total}`))
    console.log(paint('gray', `Report saved: ${reportPath}`))

    if (summary.failed > 0) process.exitCode = 2
}

run()
    .catch((error) => {
        console.error(paint('red', `Fatal verification error: ${error.stack || error.message}`))
        process.exitCode = 1
    })
    .finally(async () => {
        try {
            await sequelize.close()
        } catch {
            // ignore close errors
        }
    })
