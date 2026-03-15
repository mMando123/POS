/**
 * AccountResolver â€” Dynamic Account Resolution Service
 * 
 * ACCOUNTING LAYER (Phase 3) â€” ERP-Ready Infrastructure
 * 
 * This service is the BRIDGE between business logic and the Chart of Accounts.
 * 
 * THE GOLDEN RULE:
 *   Code knows WHAT it needs      â†’ "default_cash_account"
 *   Code does NOT know WHERE      â†’ NOT "1001"
 *   This service resolves the gap â†’ "1001" (or "1111" for branch Riyadh)
 * 
 * USAGE:
 *   // Old way (hard-coded):
 *   { accountCode: ACCOUNTS.CASH, debit: amount }
 * 
 *   // New way (dynamic):
 *   const cashCode = await AccountResolver.resolve(ACCOUNT_KEYS.CASH, { branchId })
 *   { accountCode: cashCode, debit: amount }
 * 
 * RESOLUTION PRIORITY:
 *   1. Branch + Company specific â†’ most specific
 *   2. Company-wide only        â†’ mid specificity
 *   3. Global default           â†’ fallback
 * 
 * CACHING:
 *   Results are cached in-memory for 5 minutes to avoid DB hits on every transaction.
 *   Cache is cleared when account defaults are updated via the API.
 * 
 * BACKWARD COMPATIBILITY:
 *   If no AccountDefault is found, falls back to the legacy ACCOUNTS constant.
 *   This ensures zero breakage during migration.
 */

const logger = require('./logger')
const { Op } = require('sequelize')

// ==================== ACCOUNT KEYS (Functional Constants) ====================
// These are what the code references â€” they NEVER change.
// They map to configurable accounts via the gl_account_defaults table.
const ACCOUNT_KEYS = {
    // Assets
    CASH: 'default_cash_account',
    BANK: 'default_bank_account',
    ACCOUNTS_RECEIVABLE: 'default_receivable_account',
    DRAWER_FLOAT: 'default_drawer_float_account',
    INTER_BRANCH_CLEARING: 'default_clearing_account',
    INVENTORY: 'default_stock_in_hand_account',
    INPUT_VAT: 'default_input_vat_account',
    ADVANCE_PAYMENTS: 'default_advance_payment_account',
    FIXED_ASSETS: 'default_fixed_assets_account',
    ACCUMULATED_DEPRECIATION: 'default_accumulated_depreciation_account',

    // Liabilities
    CUSTOMER_DEPOSITS: 'default_customer_deposit_account',
    ACCOUNTS_PAYABLE: 'default_payable_account',
    TAXES_PAYABLE: 'default_output_vat_account',
    ACCRUED_EXPENSES: 'default_accrued_expenses_account',

    // Equity
    OWNER_CAPITAL: 'default_capital_account',
    RETAINED_EARNINGS: 'default_retained_earnings_account',
    OWNER_DRAWINGS: 'default_owner_drawings_account',

    // Income
    SALES_REVENUE: 'default_income_account',
    DISCOUNTS_GIVEN: 'default_discount_account',
    OTHER_INCOME: 'default_other_income_account',
    EXCHANGE_GAIN: 'default_exchange_gain_account',

    // Expenses
    COGS: 'default_cogs_account',
    REFUND_LOSSES: 'default_refund_expense_account',
    CASH_SHORTAGE: 'default_cash_shortage_account',
    INVENTORY_SHRINKAGE: 'default_shrinkage_account',
    GENERAL_EXPENSE: 'default_general_expense_account',
    SALARIES_EXPENSE: 'default_salaries_expense_account',
    RENT_EXPENSE: 'default_rent_expense_account',
    UTILITIES_EXPENSE: 'default_utilities_expense_account',
    MARKETING_EXPENSE: 'default_marketing_expense_account',
    MAINTENANCE_EXPENSE: 'default_maintenance_expense_account',
    DEPRECIATION_EXPENSE: 'default_depreciation_expense_account',
    EXCHANGE_LOSS: 'default_exchange_loss_account',
    WRITE_OFF: 'default_write_off_account',
    ROUNDING: 'default_rounding_account',
    ADMIN_EXPENSE: 'default_admin_expense_account',
}

// Legacy fallback: the old hard-coded ACCOUNTS constant
// Used ONLY when no AccountDefault exists in DB (backward compatibility)
const LEGACY_ACCOUNTS = {
    'default_cash_account': '1001',
    'default_bank_account': '1002',
    'default_receivable_account': '1003',
    'default_drawer_float_account': '1005',
    'default_clearing_account': '1105',
    'default_stock_in_hand_account': '1100',
    'default_input_vat_account': '1300',
    'default_advance_payment_account': '1400',
    'default_fixed_assets_account': '1500',
    'default_accumulated_depreciation_account': '1510',
    'default_customer_deposit_account': '2001',
    'default_payable_account': '2002',
    'default_output_vat_account': '2100',
    'default_accrued_expenses_account': '2200',
    'default_capital_account': '3001',
    'default_retained_earnings_account': '3002',
    'default_owner_drawings_account': '3100',
    'default_income_account': '4001',
    'default_discount_account': '4002',
    'default_other_income_account': '4100',
    'default_exchange_gain_account': '4200',
    'default_cogs_account': '5001',
    'default_refund_expense_account': '5002',
    'default_cash_shortage_account': '5003',
    'default_shrinkage_account': '5004',
    'default_general_expense_account': '5100',
    'default_salaries_expense_account': '5101',
    'default_rent_expense_account': '5102',
    'default_utilities_expense_account': '5103',
    'default_marketing_expense_account': '5104',
    'default_maintenance_expense_account': '5105',
    'default_depreciation_expense_account': '5106',
    'default_exchange_loss_account': '5107',
    'default_write_off_account': '5108',
    'default_rounding_account': '5109',
    'default_admin_expense_account': '5110',
}

class AccountResolver {

    // ============ IN-MEMORY CACHE ============
    static _cache = new Map()
    static _cacheExpiry = 5 * 60 * 1000  // 5 minutes
    static _initialized = false

    static _isStrictDefaultsMode() {
        const value = String(
            process.env.ACCOUNTING_STRICT_DEFAULTS ||
            process.env.ACCOUNTING_STRICT_MODE ||
            ''
        ).toLowerCase()
        return value === '1' || value === 'true' || value === 'yes'
    }

    static _isAutoRemapEnabled() {
        if (this._isStrictDefaultsMode()) return false
        const value = process.env.ACCOUNTING_AUTO_REMAP_POSTING
        if (value == null) return true
        const normalized = String(value).toLowerCase()
        return normalized === '1' || normalized === 'true' || normalized === 'yes'
    }

    static _isAutoSeedDefaultsEnabled() {
        const value = process.env.ACCOUNTING_AUTO_SEED_DEFAULTS
        if (value == null) return true
        const normalized = String(value).toLowerCase()
        return normalized === '1' || normalized === 'true' || normalized === 'yes'
    }

    static async _findPreferredPostingAccountCode(legacyCode) {
        if (!legacyCode) return null
        const { Account } = require('../models')

        const direct = await Account.findOne({
            where: { code: legacyCode, is_active: true },
            attributes: ['code', 'is_group']
        })
        if (direct && !direct.is_group) return direct.code

        const child = await Account.findOne({
            where: {
                code: { [Op.like]: `${legacyCode}-%` },
                is_active: true,
                is_group: false
            },
            attributes: ['code'],
            order: [['code', 'ASC']]
        })
        return child?.code || null
    }

    static async _autoSeedMissingDefault(accountKey) {
        if (!this._isAutoSeedDefaultsEnabled()) return null

        const legacyCode = LEGACY_ACCOUNTS[accountKey]
        if (!legacyCode) return null

        const preferredCode = await this._findPreferredPostingAccountCode(legacyCode)
        if (!preferredCode) return null

        const { AccountDefault, Account } = require('../models')
        const target = await Account.findOne({
            where: { code: preferredCode, is_active: true, is_group: false },
            attributes: ['id', 'code']
        })
        if (!target) return null

        const existing = await AccountDefault.findOne({
            where: {
                account_key: accountKey,
                company_id: null,
                branch_id: null
            }
        })

        if (!existing) {
            await AccountDefault.create({
                account_key: accountKey,
                account_id: target.id,
                company_id: null,
                branch_id: null,
                description: `Auto-seeded mapping for ${accountKey}`,
                is_active: true
            })
            logger.warn(`AccountResolver: auto-seeded "${accountKey}" -> "${target.code}"`)
        } else if (!existing.is_active || existing.account_id !== target.id) {
            await existing.update({
                account_id: target.id,
                is_active: true,
                description: existing.description || `Auto-seeded mapping for ${accountKey}`
            })
            logger.warn(`AccountResolver: repaired "${accountKey}" -> "${target.code}"`)
        }

        this.clearCache()
        return target.code
    }

    /**
     * Resolve a single account key to an account code.
     * 
     * @param {string} accountKey - Functional key from ACCOUNT_KEYS (e.g. 'default_cash_account')
     * @param {Object} [context] - Scope context
     * @param {string} [context.branchId] - Branch UUID for branch-specific account
     * @param {string} [context.companyId] - Company UUID for company-specific account (future)
     * @returns {Promise<string>} Account code (e.g. '1001')
     */
    static async resolve(accountKey, { branchId = null, companyId = null } = {}) {
        // Build cache key
        const cacheKey = `${accountKey}|${branchId || '*'}|${companyId || '*'}`

        // Check cache first
        const cached = this._cache.get(cacheKey)
        if (cached && (Date.now() - cached.ts) < this._cacheExpiry) {
            return cached.code
        }

        // Lazy-load models to avoid circular dependency
        const { AccountDefault, Account } = require('../models')

        let accountCode = null

        // Priority 1: Branch + Company specific
        if (branchId && companyId) {
            const mapping = await AccountDefault.findOne({
                where: { account_key: accountKey, branch_id: branchId, company_id: companyId, is_active: true },
                include: [{ model: Account, as: 'account', attributes: ['code'] }]
            })
            if (mapping?.account) accountCode = mapping.account.code
        }

        // Priority 2: Branch-only (no company filter)
        if (!accountCode && branchId) {
            const mapping = await AccountDefault.findOne({
                where: { account_key: accountKey, branch_id: branchId, company_id: null, is_active: true },
                include: [{ model: Account, as: 'account', attributes: ['code'] }]
            })
            if (mapping?.account) accountCode = mapping.account.code
        }

        // Priority 3: Company-only (no branch filter)
        if (!accountCode && companyId) {
            const mapping = await AccountDefault.findOne({
                where: { account_key: accountKey, company_id: companyId, branch_id: null, is_active: true },
                include: [{ model: Account, as: 'account', attributes: ['code'] }]
            })
            if (mapping?.account) accountCode = mapping.account.code
        }

        // Priority 4: Global default
        if (!accountCode) {
            const mapping = await AccountDefault.findOne({
                where: { account_key: accountKey, company_id: null, branch_id: null, is_active: true },
                include: [{ model: Account, as: 'account', attributes: ['code'] }]
            })
            if (mapping?.account) accountCode = mapping.account.code
        }

        // Auto-heal: create missing global mapping from legacy family when possible.
        if (!accountCode) {
            accountCode = await this._autoSeedMissingDefault(accountKey)
        }

        // Priority 5: Legacy fallback (backward compatibility)
        if (!accountCode) {
            if (this._isStrictDefaultsMode()) {
                throw new Error(
                    `ACCOUNTING_CONFIG_ERROR: No account mapped for key "${accountKey}" in strict mode. ` +
                    `Configure gl_account_defaults explicitly for this key.`
                )
            }
            accountCode = LEGACY_ACCOUNTS[accountKey]
            if (accountCode) {
                logger.debug(`ðŸ“’ AccountResolver: Using legacy fallback for "${accountKey}" â†’ ${accountCode}`)
            }
        }

        // No mapping found at all
        if (!accountCode) {
            throw new Error(
                `ACCOUNTING_CONFIG_ERROR: No account mapped for key "${accountKey}". ` +
                `Run the account defaults seed script or configure via Settings.`
            )
        }

        accountCode = await this._ensurePostingAccountCode(accountCode, accountKey)

        // Store in cache
        this._cache.set(cacheKey, { code: accountCode, ts: Date.now() })

        return accountCode
    }

    /**
     * Resolve multiple account keys at once (reduces DB round-trips).
     * 
     * @param {Object} keyMap - Object of { alias: ACCOUNT_KEY } pairs
     * @param {Object} [context] - Scope context { branchId, companyId }
     * @returns {Promise<Object>} Object of { alias: accountCode } pairs
     * 
     * @example
     *   const accounts = await AccountResolver.resolveMany({
     *       cash: ACCOUNT_KEYS.CASH,
     *       bank: ACCOUNT_KEYS.BANK,
     *       revenue: ACCOUNT_KEYS.SALES_REVENUE
     *   }, { branchId: order.branch_id })
     *   
     *   // accounts.cash â†’ '1001'
     *   // accounts.bank â†’ '1002'
     *   // accounts.revenue â†’ '4001'
     */
        static async resolveMany(keyMap, context = {}) {
        const results = {}
        const keysToResolve = []

        // Check which keys are cached
        for (const [alias, accountKey] of Object.entries(keyMap)) {
            const cacheKey = `${accountKey}|${context.branchId || '*'}|${context.companyId || '*'}`
            const cached = this._cache.get(cacheKey)

            if (cached && (Date.now() - cached.ts) < this._cacheExpiry) {
                results[alias] = cached.code
            } else {
                keysToResolve.push({ alias, accountKey })
            }
        }

        // Resolve uncached keys
        if (keysToResolve.length > 0) {
            // Batch-load all defaults for the required keys in one query
            const { AccountDefault, Account } = require('../models')

            const allKeys = keysToResolve.map(k => k.accountKey)

            // Fetch all matching defaults sorted by specificity
            const defaults = await AccountDefault.findAll({
                where: {
                    account_key: { [Op.in]: allKeys },
                    is_active: true,
                    [Op.or]: [
                        // Global defaults
                        { company_id: null, branch_id: null },
                        // Company-specific
                        ...(context.companyId ? [{ company_id: context.companyId, branch_id: null }] : []),
                        // Branch-specific
                        ...(context.branchId ? [{ branch_id: context.branchId, company_id: null }] : []),
                        // Branch + Company specific
                        ...(context.branchId && context.companyId
                            ? [{ branch_id: context.branchId, company_id: context.companyId }]
                            : [])
                    ]
                },
                include: [{ model: Account, as: 'account', attributes: ['code'] }]
            })

            // Build a lookup with priority resolution
            const resolved = {}
            for (const def of defaults) {
                const key = def.account_key
                const priority = this._getPriority(def, context)
                if (!resolved[key] || priority > resolved[key].priority) {
                    resolved[key] = { code: def.account.code, priority }
                }
            }

            // Assign results
            for (const { alias, accountKey } of keysToResolve) {
                if (resolved[accountKey]) {
                    results[alias] = resolved[accountKey].code
                } else {
                    const autoSeeded = await this._autoSeedMissingDefault(accountKey)
                    if (autoSeeded) {
                        results[alias] = autoSeeded
                    } else if (LEGACY_ACCOUNTS[accountKey]) {
                        if (this._isStrictDefaultsMode()) {
                            throw new Error(
                                `ACCOUNTING_CONFIG_ERROR: No account mapped for key "${accountKey}" in strict mode. ` +
                                `Configure gl_account_defaults explicitly for this key.`
                            )
                        }
                        // Legacy fallback
                        results[alias] = LEGACY_ACCOUNTS[accountKey]
                        logger.debug(`AccountResolver: Using legacy fallback for "${accountKey}" -> ${LEGACY_ACCOUNTS[accountKey]}`)
                    } else {
                        throw new Error(
                            `ACCOUNTING_CONFIG_ERROR: No account mapped for key "${accountKey}". ` +
                            `Run the account defaults seed script or configure via Settings.`
                        )
                    }
                }

                results[alias] = await this._ensurePostingAccountCode(results[alias], accountKey)

                // Cache the result
                const cacheKey = `${accountKey}|${context.branchId || '*'}|${context.companyId || '*'}`
                this._cache.set(cacheKey, { code: results[alias], ts: Date.now() })
            }
        }

        return results
    }
    static _getPriority(accountDefault, context) {
        let priority = 0
        if (accountDefault.branch_id && accountDefault.branch_id === context.branchId) priority += 2
        if (accountDefault.company_id && accountDefault.company_id === context.companyId) priority += 1
        return priority
    }

    /**
     * Ensure resolved code points to an active posting account.
     * If mapped to header/legacy root code, fallback to first active child.
     */
    static async _ensurePostingAccountCode(accountCode, accountKey = null) {
        const { Account } = require('../models')
        const normalizedCode = String(accountCode || '').trim()
        const rootCode = normalizedCode.split('-')[0]

        const account = await Account.findOne({
            where: { code: normalizedCode },
            attributes: ['code', 'is_group', 'is_active']
        })

        if (account && account.is_active && !account.is_group) {
            return account.code
        }

        if (!this._isAutoRemapEnabled()) {
            if (!account) {
                throw new Error(`ACCOUNTING_CONFIG_ERROR: Account code "${normalizedCode}" not found.`)
            }
            throw new Error(
                `ACCOUNTING_CONFIG_ERROR: Account "${normalizedCode}" is not a valid posting account ` +
                `(active=${account.is_active}, is_group=${account.is_group}). ` +
                `Auto-remap is disabled; map this key to a direct posting account.`
            )
        }

        const child = await Account.findOne({
            where: {
                code: { [Op.like]: `${rootCode}-%` },
                is_active: true,
                is_group: false
            },
            attributes: ['code'],
            order: [['code', 'ASC']]
        })

        if (child) {
            logger.warn(
                `AccountResolver: remapped non-posting account "${normalizedCode}"` +
                `${accountKey ? ` for key "${accountKey}"` : ''} to "${child.code}".`
            )
            return child.code
        }

        if (!account) {
            throw new Error(`ACCOUNTING_CONFIG_ERROR: Account code "${normalizedCode}" not found.`)
        }

        throw new Error(
            `ACCOUNTING_CONFIG_ERROR: Account "${normalizedCode}" is not a valid posting account ` +
            `(active=${account.is_active}, is_group=${account.is_group}) and has no posting child.`
        )
    }

    /**
     * Clear the entire cache.
     * Call this when Account Defaults are updated via API.
     */
    static clearCache() {
        this._cache.clear()
        logger.info('ðŸ“’ AccountResolver: Cache cleared')
    }

    /**
     * Get all configured account defaults (for admin UI).
     */
    static async getAllDefaults({ companyId = null, branchId = null } = {}) {
        const { AccountDefault, Account } = require('../models')

        const where = { is_active: true }
        if (companyId) where.company_id = companyId
        if (branchId) where.branch_id = branchId

        return AccountDefault.findAll({
            where,
            include: [{
                model: Account,
                as: 'account',
                attributes: ['code', 'name_ar', 'name_en', 'root_type', 'account_type', 'is_group', 'is_active']
            }],
            order: [['account_key', 'ASC']]
        })
    }

    /**
     * Set or update an account default mapping.
     * 
     * @param {string} accountKey - Functional key
     * @param {string} accountId - Account UUID
     * @param {Object} [scope] - { companyId, branchId }
     */
    static async setDefault(accountKey, accountId, { companyId = null, branchId = null, description = null } = {}) {
        const { AccountDefault, Account } = require('../models')

        const account = await Account.findByPk(accountId, {
            attributes: ['id', 'code', 'is_active', 'is_group']
        })
        if (!account) {
            throw new Error(`ACCOUNTING_CONFIG_ERROR: Account not found: ${accountId}`)
        }
        if (!account.is_active) {
            throw new Error(`ACCOUNTING_CONFIG_ERROR: Cannot map inactive account: ${account.code}`)
        }
        if (account.is_group) {
            throw new Error(
                `ACCOUNTING_CONFIG_ERROR: Cannot map group account "${account.code}". ` +
                `Map to a posting/ledger account instead.`
            )
        }

        const [mapping, created] = await AccountDefault.findOrCreate({
            where: {
                account_key: accountKey,
                company_id: companyId,
                branch_id: branchId
            },
            defaults: {
                account_id: accountId,
                description,
                is_active: true
            }
        })

        if (!created) {
            await mapping.update({ account_id: accountId, description, is_active: true })
        }

        // Clear cache for this key
        this.clearCache()

        logger.info(`ðŸ“’ AccountDefault ${created ? 'created' : 'updated'}: ${accountKey} â†’ account ${accountId} (branch: ${branchId || 'global'})`)
        return mapping
    }

    /**
     * Get all available ACCOUNT_KEYS for the admin UI.
     * Returns the keys with their descriptions and current mapped account.
     */
    static getAvailableKeys() {
        // Explicit category mapping for accurate classification
        const KEY_CATEGORY_MAP = {
            'default_cash_account': 'asset',
            'default_bank_account': 'asset',
            'default_receivable_account': 'asset',
            'default_drawer_float_account': 'asset',
            'default_clearing_account': 'asset',
            'default_stock_in_hand_account': 'asset',
            'default_input_vat_account': 'asset',
            'default_advance_payment_account': 'asset',
            'default_fixed_assets_account': 'asset',
            'default_accumulated_depreciation_account': 'asset',
            'default_customer_deposit_account': 'liability',
            'default_payable_account': 'liability',
            'default_output_vat_account': 'liability',
            'default_accrued_expenses_account': 'liability',
            'default_capital_account': 'equity',
            'default_retained_earnings_account': 'equity',
            'default_owner_drawings_account': 'equity',
            'default_income_account': 'income',
            'default_discount_account': 'income',
            'default_other_income_account': 'income',
            'default_exchange_gain_account': 'income',
        }

        return Object.entries(ACCOUNT_KEYS).map(([name, key]) => ({
            name,
            key,
            legacyCode: LEGACY_ACCOUNTS[key] || null,
            category: KEY_CATEGORY_MAP[key] || 'expense'
        }))
    }
}

module.exports = { AccountResolver, ACCOUNT_KEYS, LEGACY_ACCOUNTS }


