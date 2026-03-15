/**
 * AccountingService — Core Double-Entry Accounting Engine
 * 
 * ACCOUNTING LAYER (Phase 2) — THE HEART OF THE GENERAL LEDGER
 * 
 * This service is the SINGLE AUTHORITY for all financial record-keeping.
 * Every financial event in the system (sale, refund, cash movement, discount)
 * flows through this service to create balanced journal entries.
 * 
 * FUNDAMENTAL RULES:
 * 1. Every journal entry MUST balance: sum(debits) = sum(credits)
 * 2. Journal entries are IMMUTABLE once posted — corrections via reversal only
 * 3. No posting allowed to locked fiscal periods
 * 4. Account balances are updated atomically with journal entries
 * 5. All amounts are in the smallest currency unit precision (2 decimal places)
 */

const { Account, JournalEntry, JournalLine, FiscalPeriod, sequelize } = require('../models')
const { Op } = require('sequelize')
const logger = require('./logger')
const { AccountResolver, ACCOUNT_KEYS } = require('./accountResolver')
const GLAuditService = require('./glAuditService')

// ==================== Account Code Constants ====================
// These are the system account codes from the Chart of Accounts
const ACCOUNTS = {
    // Assets (1xxx)
    CASH: '1001',
    BANK: '1002',
    ACCOUNTS_RECEIVABLE: '1003',
    DRAWER_FLOAT: '1005',        // FIX-13: عهدة صندوق (صرفية للمحل)
    INTER_BRANCH_CLEARING: '1105', // FIX-11: وسيط تحويلات بين الفروع
    INVENTORY: '1100',
    INPUT_VAT: '1300',          // FIX-04: ضريبة المدخلات (قابلة للاسترداد)
    ADVANCE_PAYMENTS: '1400',   // FIX-10: دفعات مقدمة للموردين

    // Liabilities (2xxx)
    CUSTOMER_DEPOSITS: '2001',
    ACCOUNTS_PAYABLE: '2002',
    TAXES_PAYABLE: '2100',      // Output VAT / ضريبة المخرجات

    // Equity (3xxx)
    OWNER_CAPITAL: '3001',
    RETAINED_EARNINGS: '3002',

    // Income (4xxx)
    SALES_REVENUE: '4001',
    DISCOUNTS_GIVEN: '4002',    // Contra-revenue (debit-normal)
    OTHER_INCOME: '4100',       // FIX-08: إيرادات أخرى (فوائض، غيرها)

    // Expenses (5xxx)
    COGS: '5001',
    REFUND_LOSSES: '5002',
    CASH_SHORTAGE: '5003',
    INVENTORY_SHRINKAGE: '5004',
    GENERAL_EXPENSE: '5100',
    SALARIES_EXPENSE: '5101',   // FIX-10: مصروف الرواتب
    RENT_EXPENSE: '5102',       // FIX-10: مصروف الإيجار
    UTILITIES_EXPENSE: '5103',  // FIX-10: مصروف الخدمات
    MARKETING_EXPENSE: '5104',  // FIX-10: مصروف التسويق
    MAINTENANCE_EXPENSE: '5105',// FIX-10: مصروف الصيانة
}

class AccountingService {

    // ==================== JOURNAL ENTRY CREATION ====================

    /**
     * Create a balanced journal entry with lines
     * 
     * This is the core method. All other methods delegate to this.
     * 
     * @param {Object} params
     * @param {string} params.description - Human-readable description
     * @param {string} params.sourceType - 'order', 'refund', 'shift', 'expense', 'manual'
     * @param {string} params.sourceId - UUID of source document
     * @param {Array<Object>} params.lines - Array of { accountCode, debit, credit, description }
     * @param {string} [params.entryDate] - Date override (defaults to today)
     * @param {string} [params.branchId] - Branch UUID
     * @param {string} [params.createdBy] - User UUID
     * @param {string} [params.notes] - Additional notes
     * @param {Object} [params.transaction] - Sequelize transaction (optional, creates own if not provided)
     * @returns {Promise<JournalEntry>} The created journal entry with lines
     */
    static async createJournalEntry(params) {
        const {
            description,
            sourceType = 'manual',
            sourceId = null,
            lines = [],
            entryDate = null,
            branchId = null,
            companyId = null,
            supplierId = null,
            createdBy = null,
            notes = null,
            transaction: externalTransaction = null
        } = params

        // Use external transaction or create our own
        const transaction = externalTransaction || await sequelize.transaction()
        const isOwnTransaction = !externalTransaction
        let ownTransactionCommitted = false

        try {
            // 1. Validate we have lines
            if (!lines || lines.length < 2) {
                throw new Error('ACCOUNTING_ERROR: Journal entry must have at least 2 lines (debit and credit)')
            }

            // 2. Calculate totals and validate balance
            let totalDebit = 0
            let totalCredit = 0

            for (const line of lines) {
                const debit = Math.round(parseFloat(line.debit || 0) * 100) / 100
                const credit = Math.round(parseFloat(line.credit || 0) * 100) / 100

                if (debit < 0 || credit < 0) {
                    throw new Error('ACCOUNTING_ERROR: Debit and credit amounts must be non-negative')
                }
                if (debit > 0 && credit > 0) {
                    throw new Error('ACCOUNTING_ERROR: A line cannot have both debit and credit amounts')
                }
                if (debit === 0 && credit === 0) {
                    throw new Error('ACCOUNTING_ERROR: A line must have either a debit or credit amount')
                }

                totalDebit = Math.round((totalDebit + debit) * 100) / 100
                totalCredit = Math.round((totalCredit + credit) * 100) / 100
            }

            // 3. ENFORCE BALANCE (the golden rule of double-entry)
            if (totalDebit !== totalCredit) {
                throw new Error(
                    `ACCOUNTING_ERROR: Entry does not balance! ` +
                    `Debits: ${totalDebit}, Credits: ${totalCredit}, ` +
                    `Difference: ${Math.round((totalDebit - totalCredit) * 100) / 100}`
                )
            }

            // 4. Resolve company scope, then determine fiscal period and check if locked
            const resolvedCompanyId = await this._resolveCompanyId({
                companyId,
                branchId,
                transaction
            })

            const date = entryDate ? new Date(entryDate) : new Date()
            const fiscalPeriod = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

            const period = await FiscalPeriod.findOne({
                where: {
                    period: fiscalPeriod,
                    ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {})
                },
                transaction
            })

            if (period && (period.status === 'closed' || period.status === 'locked')) {
                throw new Error(`ACCOUNTING_ERROR: Fiscal period ${fiscalPeriod} is ${period.status} — cannot post entries`)
            }

            // 5. Resolve account codes to IDs
            const accountCodes = lines.map(l => l.accountCode)
            const accountMap = {}

            // Prefer company-scoped accounts when company is known
            if (resolvedCompanyId) {
                const companyScoped = await Account.findAll({
                    where: { code: { [Op.in]: accountCodes }, is_active: true, company_id: resolvedCompanyId },
                    transaction
                })
                for (const acc of companyScoped) {
                    accountMap[acc.code] = acc
                }
            }

            // Fallback to legacy/global accounts (company_id IS NULL) for missing codes
            const missingCodes = accountCodes.filter(code => !accountMap[code])
            if (missingCodes.length > 0) {
                const allowGlobalFallback = !resolvedCompanyId || ['1', 'true', 'yes'].includes(
                    String(process.env.ACCOUNTING_ALLOW_GLOBAL_FALLBACK ?? 'true').toLowerCase()
                )

                if (!allowGlobalFallback) {
                    throw new Error(
                        `ACCOUNTING_ERROR: Missing company-scoped account codes: ${missingCodes.join(', ')}. ` +
                        `Global fallback is disabled by ACCOUNTING_ALLOW_GLOBAL_FALLBACK.`
                    )
                }

                const globalFallback = await Account.findAll({
                    where: { code: { [Op.in]: missingCodes }, is_active: true, company_id: null },
                    transaction
                })
                for (const acc of globalFallback) {
                    accountMap[acc.code] = acc
                }
            }

            // Verify all accounts exist
            for (const code of accountCodes) {
                if (!accountMap[code]) {
                    throw new Error(`ACCOUNTING_ERROR: Account code "${code}" not found or inactive`)
                }
                if (accountMap[code].is_group) {
                    throw new Error(`ACCOUNTING_ERROR: Cannot post to group account "${code}" — use a ledger account`)
                }
            }

            // 6. Generate entry number and create record (with modern retry logic for race conditions)
            let journalEntry = null
            let entryNumber = null  // FIX C-01: Declare outside while scope so it's available for logging
            let retryCount = 0
            const maxRetries = 3

            while (retryCount < maxRetries) {
                try {
                    // Generate entry number based on CURRENT latest in DB
                    entryNumber = await this._generateEntryNumber(date, transaction)

                    // 7. Create journal entry header
                    journalEntry = await JournalEntry.create({
                        entry_number: entryNumber,
                        entry_date: date.toISOString().split('T')[0],
                        description,
                        source_type: sourceType,
                        source_id: sourceId,
                        total_amount: totalDebit,
                        status: 'posted',
                        fiscal_period: fiscalPeriod,
                        created_by: createdBy,
                        branch_id: branchId,
                        company_id: resolvedCompanyId,
                        supplier_id: supplierId,
                        notes
                    }, { transaction })

                    // If we reach here, record is created!
                    break;
                } catch (err) {
                    if (err.name === 'SequelizeUniqueConstraintError' && retryCount < maxRetries - 1) {
                        retryCount++
                        logger.warn(`📒 Accounting: Entry number collision detected. Retrying ${retryCount}/${maxRetries}...`)
                        // Small random delay to stagger retries
                        await new Promise(resolve => setTimeout(resolve, Math.random() * 100))
                        continue
                    }
                    throw err // Re-throw if not a collision or max retries reached
                }
            }

            // 8. Create journal lines
            const journalLines = []
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                const account = accountMap[line.accountCode]
                const debit = Math.round(parseFloat(line.debit || 0) * 100) / 100
                const credit = Math.round(parseFloat(line.credit || 0) * 100) / 100

                const jl = await JournalLine.create({
                    journal_entry_id: journalEntry.id,
                    account_id: account.id,
                    debit_amount: debit,
                    credit_amount: credit,
                    description: line.description || null,
                    line_number: i + 1,
                    company_id: resolvedCompanyId
                }, { transaction })

                journalLines.push(jl)

                // 9. Update account running balance
                await this._updateAccountBalance(account, debit, credit, transaction)
            }

            // M-02: Independent accounting audit trail (blocking, inside same transaction)
            await GLAuditService.log({
                eventType: 'journal_created',
                journalEntryId: journalEntry.id,
                entryNumber,
                sourceType,
                sourceId,
                fiscalPeriod,
                branchId,
                createdBy,
                payload: {
                    description,
                    total_debit: totalDebit,
                    total_credit: totalCredit,
                    lines: lines.map((line, idx) => ({
                        line_number: idx + 1,
                        account_code: line.accountCode,
                        debit: Math.round(parseFloat(line.debit || 0) * 100) / 100,
                        credit: Math.round(parseFloat(line.credit || 0) * 100) / 100,
                        description: line.description || null
                    }))
                }
            }, { transaction })

            if (isOwnTransaction) {
                await transaction.commit()
                ownTransactionCommitted = true
            }

            // Reload with lines
            const result = await JournalEntry.findByPk(journalEntry.id, {
                include: [{ model: JournalLine, as: 'lines', include: [{ model: Account, as: 'account' }] }],
                ...(externalTransaction ? { transaction: externalTransaction } : {})
            })

            logger.info(`📒 Journal Entry ${entryNumber || journalEntry?.entry_number} posted: ${description} | Amount: ${totalDebit}`)
            return result

        } catch (error) {
            if (isOwnTransaction && !ownTransactionCommitted && !transaction.finished) {
                try {
                    await transaction.rollback()
                } catch (rollbackError) {
                    logger.error('Accounting rollback error:', rollbackError.message)
                }
            }
            logger.error('Accounting error:', error.message)
            throw error
        }
    }

    /**
     * Reverse a journal entry (for corrections)
     * Creates a new entry with all debits/credits swapped
     */
    static async reverseJournalEntry(entryId, { reason, createdBy, transaction: extTxn = null }) {
        const transaction = extTxn || await sequelize.transaction()
        const isOwnTxn = !extTxn

        try {
            const original = await JournalEntry.findByPk(entryId, {
                include: [{ model: JournalLine, as: 'lines', include: [{ model: Account, as: 'account' }] }],
                transaction
            })

            if (!original) throw new Error('ACCOUNTING_ERROR: Journal entry not found')
            if (original.status === 'reversed') throw new Error('ACCOUNTING_ERROR: Entry already reversed')

            // Create reversal lines (swap debit/credit)
            const reversalLines = original.lines.map(line => ({
                accountCode: line.account.code,
                debit: parseFloat(line.credit_amount),
                credit: parseFloat(line.debit_amount),
                description: `Reversal: ${line.description || ''}`
            }))

            const reversal = await this.createJournalEntry({
                description: `REVERSAL: ${original.description} — ${reason}`,
                sourceType: original.source_type,
                sourceId: original.source_id,
                lines: reversalLines,
                branchId: original.branch_id,
                supplierId: original.supplier_id || null,
                createdBy,
                notes: `Reverses entry ${original.entry_number}`,
                transaction
            })

            if (!reversal || !reversal.id) {
                throw new Error('ACCOUNTING_ERROR: Reversal entry creation failed')
            }

            // Update original entry status
            await original.update({
                status: 'reversed',
                reversed_by: reversal.id
            }, { transaction })

            // Update reversal entry
            await reversal.update({
                reversal_of: original.id
            }, { transaction })

            // M-02: Independent accounting audit trail
            await GLAuditService.log({
                eventType: 'journal_reversed',
                journalEntryId: reversal.id,
                entryNumber: reversal.entry_number,
                sourceType: reversal.source_type,
                sourceId: reversal.source_id,
                fiscalPeriod: reversal.fiscal_period,
                branchId: reversal.branch_id,
                createdBy,
                payload: {
                    reason,
                    original_entry_id: original.id,
                    original_entry_number: original.entry_number,
                    reversal_entry_id: reversal.id,
                    reversal_entry_number: reversal.entry_number
                }
            }, { transaction })

            if (isOwnTxn) await transaction.commit()

            logger.info(`🔄 Reversed JE ${original.entry_number} → ${reversal.entry_number}`)
            return reversal

        } catch (error) {
            if (isOwnTxn) await transaction.rollback()
            throw error
        }
    }

    // ==================== FINANCIAL EVENT JOURNAL ENTRIES ====================

    /**
     * Record a completed sale
     * 
     * FIX-01: Idempotency guard added — prevents duplicate revenue entries
     * if the same order is processed twice (e.g. via two completion paths).
     * 
     * Accounting entry:
     *   DR Cash/Bank      (total)             ← money IN
     *   CR Sales Revenue  (subtotal net tax)  ← income earned
     *   CR Taxes Payable  (tax)               ← output VAT liability
     */
    static async recordSale(order, { transaction = null } = {}) {
        // FIX-01 — IDEMPOTENCY GUARD
        const existingRevEntry = await JournalEntry.findOne({
            where: { source_type: 'order', source_id: order.id },
            ...(transaction ? { transaction } : {})
        })
        if (existingRevEntry) {
            logger.info(`📒 recordSale SKIPPED — duplicate guard triggered for order ${order.order_number} (JE already exists: ${existingRevEntry.entry_number})`)
            return existingRevEntry
        }

        const total = parseFloat(order.total)
        const tax = parseFloat(order.tax || 0)
        const subtotalAfterDiscount = Math.round((total - tax) * 100) / 100

        const { OrderPayment } = require('../models')
        const paymentRows = await OrderPayment.findAll({
            where: { order_id: order.id },
            ...(transaction ? { transaction } : {})
        })

        let cashAmount = 0
        let bankAmount = 0

        if (paymentRows.length > 0) {
            for (const row of paymentRows) {
                const amount = Math.round(parseFloat(row.amount || 0) * 100) / 100
                if (amount <= 0) continue

                if (row.payment_method === 'cash') {
                    cashAmount = Math.round((cashAmount + amount) * 100) / 100
                } else {
                    bankAmount = Math.round((bankAmount + amount) * 100) / 100
                }
            }
        } else {
            if (order.payment_method === 'cash') cashAmount = total
            else bankAmount = total
        }

        // Phase 3: Dynamic account resolution (payment-aware)
        // In strict mode, resolve only the payment accounts that are actually needed.
        // This avoids blocking cash-only orders when bank mapping is intentionally unset.
        const ctx = { branchId: order.branch_id }
        const requiredAccounts = {
            revenue: ACCOUNT_KEYS.SALES_REVENUE,
            tax: ACCOUNT_KEYS.TAXES_PAYABLE
        }
        if (cashAmount > 0) requiredAccounts.cash = ACCOUNT_KEYS.CASH
        if (bankAmount > 0) requiredAccounts.bank = ACCOUNT_KEYS.BANK
        const accts = await AccountResolver.resolveMany(requiredAccounts, ctx)

        const lines = []
        if (cashAmount > 0) {
            lines.push({
                accountCode: accts.cash,
                debit: cashAmount,
                credit: 0,
                description: `Cash payment: ${order.order_number}`
            })
        }
        if (bankAmount > 0) {
            lines.push({
                accountCode: accts.bank,
                debit: bankAmount,
                credit: 0,
                description: `Non-cash payment: ${order.order_number}`
            })
        }

        // Safety fallback for any rounding/missing split discrepancy
        const debitTotal = Math.round(lines.reduce((sum, line) => sum + parseFloat(line.debit || 0), 0) * 100) / 100
        const debitDiff = Math.round((total - debitTotal) * 100) / 100
        if (debitDiff !== 0) {
            if (lines.length === 0) {
                const fallbackPaymentAccount = order.payment_method === 'cash'
                    ? accts.cash
                    : (accts.bank || accts.cash)
                if (!fallbackPaymentAccount) {
                    throw new Error('ACCOUNTING_CONFIG_ERROR: No payment account mapped for sale fallback')
                }
                lines.push({
                    accountCode: fallbackPaymentAccount,
                    debit: total,
                    credit: 0,
                    description: `Payment fallback: ${order.order_number}`
                })
            } else {
                lines[lines.length - 1].debit = Math.round((parseFloat(lines[lines.length - 1].debit || 0) + debitDiff) * 100) / 100
            }
        }

        // Sales revenue (net of discount / net of tax)
        if (subtotalAfterDiscount > 0) {
            lines.push({
                accountCode: accts.revenue,
                debit: 0, credit: subtotalAfterDiscount,
                description: `Sales: ${order.order_number}`
            })
        }

        // Output VAT payable (if any)
        if (tax > 0) {
            lines.push({
                accountCode: accts.tax,
                debit: 0, credit: tax,
                description: `Output VAT: ${order.order_number}`
            })
        }

        return this.createJournalEntry({
            description: `مبيعات طلب رقم ${order.order_number}`,
            sourceType: 'order',
            sourceId: order.id,
            lines,
            branchId: order.branch_id,
            createdBy: order.user_id,
            transaction
        })
    }

    /**
     * Record Cost of Goods Sold (COGS) for a completed order
     * 
     * This is the CRITICAL missing piece identified by the financial audit.
     * Without this, the P&L shows revenue but no cost — gross profit is fiction.
     * 
     * Accounting entry:
     *   DR COGS (5001)              (total_cost)  ← expense recognized
     *   CR Inventory Asset (1100)   (total_cost)  ← asset reduced
     * 
     * The cost is derived from StockMovement records created during
     * order finalization (source_type='order', movement_type='OUT').
     * This ensures we use the ACTUAL cost at the time of sale,
     * not a stale or estimated cost.
     * 
     * @param {Object} order - The completed order (needs id, order_number, branch_id, user_id)
     * @param {Object} options - { transaction }
     * @returns {Promise<JournalEntry|null>} The created journal entry, or null if no cost
     */
    static async recordCOGS(
        order,
        {
            transaction = null,
            allowEstimate = false,
            estimationMethod = 'menu_cost_price_then_stock_avg_then_last_purchase'
        } = {}
    ) {
        const { StockMovement, JournalEntry, OrderItem, Menu } = require('../models')

        // Idempotency: Check if COGS entry already exists
        const existingEntry = await JournalEntry.findOne({
            where: {
                source_type: 'order_cogs',
                source_id: order.id
            },
            ...(transaction ? { transaction } : {})
        })

        if (existingEntry) {
            logger.info(`Accounting: COGS entry skipped for order ${order.order_number}: already exists`)
            return existingEntry
        }

        // Query stock movements created during this order's finalization
        const movements = await StockMovement.findAll({
            where: {
                source_type: 'order',
                source_id: order.id,
                movement_type: 'OUT'
            },
            ...(transaction ? { transaction } : {})
        })

        // Determine if this order actually contains stock-tracked items.
        // If yes, missing stock OUT movements is a hard integrity error in live flow.
        const trackedOrderItems = await OrderItem.findAll({
            where: { order_id: order.id },
            attributes: ['menu_id'],
            include: [{
                model: Menu,
                attributes: [],
                required: true,
                where: { track_stock: true }
            }],
            raw: true,
            ...(transaction ? { transaction } : {})
        })

        const trackedMenuIds = [...new Set((trackedOrderItems || []).map(i => i.menu_id).filter(Boolean))]
        const movementMenuIds = [...new Set((movements || []).map(m => m.menu_id).filter(Boolean))]
        const missingTrackedMenuIds = trackedMenuIds.filter(menuId => !movementMenuIds.includes(menuId))

        let totalCOGS = 0
        let cogsNotes = null

        if (!movements || movements.length === 0) {
            if (!allowEstimate) {
                // For stock-tracked items without movements, this is a control failure
                if (trackedMenuIds.length > 0) {
                    throw new Error(
                        `ACCOUNTING_ERROR: COGS traceability failure for order ${order.order_number}. ` +
                        `Tracked stock items exist but no stock OUT movements were recorded.`
                    )
                }
                // DEF-003 FIX: Try cost_price fallback for non-tracked items (no stock movements)
                const { OrderItem: _OI, Menu: _M } = require('../models')
                const nonTrackedItems = await _OI.findAll({
                    where: { order_id: order.id },
                    include: [{ model: _M, attributes: ['id', 'cost_price', 'track_stock'], required: true }],
                    ...(transaction ? { transaction } : {})
                })
                let costPriceCOGS = 0
                for (const item of nonTrackedItems) {
                    const costPrice = parseFloat(item.Menu?.cost_price || 0)
                    const qty = parseFloat(item.quantity || 0)
                    if (costPrice > 0 && qty > 0) {
                        costPriceCOGS = Math.round((costPriceCOGS + costPrice * qty) * 100) / 100
                    }
                }
                if (costPriceCOGS <= 0) {
                    logger.info(`Accounting: COGS skipped for order ${order.order_number}: no cost_price found`)
                    return null
                }
                totalCOGS = costPriceCOGS
                cogsNotes = JSON.stringify({ cogs_estimated: true, estimation_method: 'cost_price_fallback' })
                logger.info(`Accounting: COGS from cost_price for order ${order.order_number}: ${totalCOGS}`)
            } else {
                // Historical fallback for pre-fix orders where stock OUT movements do not exist.
                const estimate = await this._estimateHistoricalCOGS(order, {
                    transaction,
                    estimationMethod
                })

                if (!estimate || estimate.totalCOGS <= 0) {
                    logger.warn(
                        `COGS BACKFILL WARNING: Order ${order.order_number} has no stock movements ` +
                        `and no usable historical cost. No COGS journal entry created.`
                    )
                    return null
                }

                totalCOGS = estimate.totalCOGS
                cogsNotes = JSON.stringify({
                    cogs_estimated: true,
                    estimation_method: estimate.method,
                    costed_items: estimate.costedItems,
                    missing_cost_items: estimate.missingCostItems,
                    reason: 'Historical order with missing stock OUT movements'
                })

                logger.warn(
                    `Accounting: COGS estimated for order ${order.order_number}: ${totalCOGS} ` +
                    `(costed items: ${estimate.costedItems}, missing-cost items: ${estimate.missingCostItems})`
                )
            }
        } else {
            if (!allowEstimate && missingTrackedMenuIds.length > 0) {
                throw new Error(
                    `ACCOUNTING_ERROR: COGS traceability failure for order ${order.order_number}. ` +
                    `Missing stock OUT movements for tracked menu items: ${missingTrackedMenuIds.join(', ')}`
                )
            }

            // Sum total cost from all stock movements for this order
            totalCOGS = Math.round(
                movements.reduce((sum, m) => sum + Math.abs(parseFloat(m.total_cost || 0)), 0) * 100
            ) / 100

            cogsNotes = JSON.stringify({
                cogs_estimated: false,
                stock_movement_count: movements.length,
                tracked_menu_count: trackedMenuIds.length,
                traced_menu_count: movementMenuIds.length,
                missing_tracked_menu_ids: missingTrackedMenuIds
            })
        }

        if (totalCOGS <= 0) {
            logger.warn(
                `COGS WARNING: Order ${order.order_number} has zero COGS. ` +
                `This may indicate items were sold with no purchase cost recorded (avg_cost=0). ` +
                `Verify stock layers for this order. No journal entry created.`
            )
            return null
        }

        // Phase 3: Dynamic account resolution
        const ctx = { branchId: order.branch_id }
        const accts = await AccountResolver.resolveMany({
            cogs: ACCOUNT_KEYS.COGS,
            inventory: ACCOUNT_KEYS.INVENTORY,
        }, ctx)

        return this.createJournalEntry({
            description: `COGS for order ${order.order_number}`,
            sourceType: 'order_cogs',
            sourceId: order.id,
            lines: [
                { accountCode: accts.cogs, debit: totalCOGS, credit: 0, description: `COGS: ${order.order_number}` },
                { accountCode: accts.inventory, debit: 0, credit: totalCOGS, description: `Inventory sold: ${order.order_number}` }
            ],
            branchId: order.branch_id,
            createdBy: order.user_id,
            notes: cogsNotes,
            transaction
        })
    }

    /**
     * Estimate historical COGS for legacy orders where stock OUT movements are missing.
     *
     * Method:
     * 1) Use Menu.cost_price if available.
     * 2) Fallback to stock avg_cost (weighted across warehouses).
     * 3) Fallback to last received purchase unit_cost before order date.
     */
    static async _estimateHistoricalCOGS(order, { transaction = null, estimationMethod = 'menu_cost_price_then_stock_avg_then_last_purchase' } = {}) {
        const { OrderItem, Menu, Stock } = require('../models')

        const orderItems = await OrderItem.findAll({
            where: { order_id: order.id },
            include: [{
                model: Menu,
                attributes: ['id', 'track_stock', 'cost_price']
            }],
            ...(transaction ? { transaction } : {})
        })

        if (!orderItems || orderItems.length === 0) {
            return { totalCOGS: 0, costedItems: 0, missingCostItems: 0, method: estimationMethod }
        }

        const menuIds = [...new Set(orderItems.map(i => i.menu_id).filter(Boolean))]
        const stockRows = menuIds.length > 0
            ? await Stock.findAll({
                where: { menu_id: { [Op.in]: menuIds } },
                attributes: ['menu_id', 'avg_cost', 'quantity'],
                ...(transaction ? { transaction } : {})
            })
            : []

        const stockCostByMenu = {}
        const stockAgg = {}

        for (const row of stockRows) {
            const menuId = row.menu_id
            const avgCost = parseFloat(row.avg_cost || 0)
            const qty = Math.max(parseFloat(row.quantity || 0), 0)
            if (!(avgCost > 0)) continue

            if (!stockAgg[menuId]) {
                stockAgg[menuId] = {
                    weightedCostSum: 0,
                    qtySum: 0,
                    avgCostSum: 0,
                    rowCount: 0
                }
            }

            if (qty > 0) {
                stockAgg[menuId].weightedCostSum += qty * avgCost
                stockAgg[menuId].qtySum += qty
            }
            stockAgg[menuId].avgCostSum += avgCost
            stockAgg[menuId].rowCount += 1
        }

        for (const [menuId, agg] of Object.entries(stockAgg)) {
            if (agg.qtySum > 0) {
                stockCostByMenu[menuId] = Math.round((agg.weightedCostSum / agg.qtySum) * 100) / 100
            } else if (agg.rowCount > 0) {
                stockCostByMenu[menuId] = Math.round((agg.avgCostSum / agg.rowCount) * 100) / 100
            }
        }

        // Third fallback: infer cost from latest received purchase unit_cost before order completion.
        const purchaseCostByMenu = {}
        if (menuIds.length > 0) {
            const cutoffDate = order.completed_at || order.updated_at || order.created_at || new Date()
            const purchaseRows = await sequelize.query(
                `
                SELECT pri.menu_id, pri.unit_cost, pr.created_at
                FROM purchase_receipt_items pri
                JOIN purchase_receipts pr ON pr.id = pri.receipt_id
                WHERE pri.menu_id IN (:menuIds)
                  AND pri.unit_cost > 0
                  AND pr.status IN ('received','partial')
                  AND pr.created_at <= :cutoffDate
                ORDER BY pr.created_at DESC, pri.created_at DESC
                `,
                {
                    replacements: { menuIds, cutoffDate },
                    type: sequelize.QueryTypes.SELECT,
                    ...(transaction ? { transaction } : {})
                }
            )

            for (const row of purchaseRows) {
                if (!purchaseCostByMenu[row.menu_id]) {
                    const unitCost = parseFloat(row.unit_cost || 0)
                    if (unitCost > 0) purchaseCostByMenu[row.menu_id] = unitCost
                }
            }
        }

        let totalCOGS = 0
        let costedItems = 0
        let missingCostItems = 0

        for (const item of orderItems) {
            const qty = parseFloat(item.quantity || 0)
            if (!(qty > 0)) continue

            const menu = item.Menu
            if (menu && menu.track_stock === false) {
                // Service/non-stock items do not participate in COGS.
                continue
            }

            let unitCost = parseFloat(menu?.cost_price || 0)
            if (!(unitCost > 0)) {
                unitCost = parseFloat(stockCostByMenu[item.menu_id] || 0)
            }
            if (!(unitCost > 0)) {
                unitCost = parseFloat(purchaseCostByMenu[item.menu_id] || 0)
            }

            if (!(unitCost > 0)) {
                missingCostItems++
                continue
            }

            totalCOGS = Math.round((totalCOGS + (qty * unitCost)) * 100) / 100
            costedItems++
        }

        return {
            totalCOGS,
            costedItems,
            missingCostItems,
            method: estimationMethod
        }
    }
    /**
     * Record a discount (when discount is applied separately from sale)
     * 
     * Accounting entry:
     *   DR Discounts Given   (discount_amount)  ← contra-revenue
     *   CR Cash/Bank         (discount_amount)  ← money forgone
     * 
     * Note: In our system, discounts are already netted into the total,
     * so this is only used if we want to track discounts separately.
     */
    static async recordDiscount(order, discountAmount, { transaction = null } = {}) {
        if (discountAmount <= 0) return null

        // Phase 3: Dynamic account resolution
        const ctx = { branchId: order.branch_id }
        const accts = await AccountResolver.resolveMany({
            cash: ACCOUNT_KEYS.CASH,
            bank: ACCOUNT_KEYS.BANK,
            discount: ACCOUNT_KEYS.DISCOUNTS_GIVEN,
        }, ctx)

        const paymentAccount = order.payment_method === 'cash' ? accts.cash : accts.bank

        return this.createJournalEntry({
            description: `خصم على طلب رقم ${order.order_number}`,
            sourceType: 'discount',
            sourceId: order.id,
            lines: [
                { accountCode: accts.discount, debit: discountAmount, credit: 0, description: 'Discount given' },
                { accountCode: paymentAccount, debit: 0, credit: discountAmount, description: 'Cash/card forgone for discount' }
            ],
            branchId: order.branch_id,
            createdBy: order.user_id,
            transaction
        })
    }

    /**
     * Record a refund
     * 
     * FIX-15: Idempotency guard added.
     * 
     * Accounting entry:
     *   DR Refund Losses / Sales Revenue   (refund_amount)   ← reduce income
     *   CR Cash/Bank                       (refund_amount)   ← money OUT
     */
    static async recordRefund(refund, order, { transaction = null } = {}) {
        // FIX-15 — IDEMPOTENCY GUARD
        const existingEntry = await JournalEntry.findOne({
            where: { source_type: 'refund', source_id: refund.id },
            ...(transaction ? { transaction } : {})
        })
        if (existingEntry) {
            logger.info(`📒 recordRefund SKIPPED — duplicate guard triggered for refund ${refund.refund_number || refund.id}`)
            return existingEntry
        }

        const refundAmount = parseFloat(refund.total_amount || refund.refund_amount)
        const paymentMethod = order.payment_method || 'cash'

        // Phase 3: Dynamic account resolution
        const ctx = { branchId: order.branch_id }
        const accts = await AccountResolver.resolveMany({
            cash: ACCOUNT_KEYS.CASH,
            bank: ACCOUNT_KEYS.BANK,
            refundLosses: ACCOUNT_KEYS.REFUND_LOSSES,
        }, ctx)

        const paymentAccount = paymentMethod === 'cash' ? accts.cash : accts.bank

        return this.createJournalEntry({
            description: `مرتجعات — استرداد رقم ${refund.refund_number || refund.id}`,
            sourceType: 'refund',
            sourceId: refund.id,
            lines: [
                { accountCode: accts.refundLosses, debit: refundAmount, credit: 0, description: 'Refund expense' },
                { accountCode: paymentAccount, debit: 0, credit: refundAmount, description: 'Cash/card refunded' }
            ],
            branchId: order.branch_id,
            transaction
        })
    }

    /**
     * Record COGS reversal when a refund restores stock
     * 
     * When stock is restored to inventory on refund, the original COGS
     * entry should be partially or fully reversed:
     *   DR Inventory Asset (1100)   (cost_of_returned_items)  ← asset restored
     *   CR COGS (5001)              (cost_of_returned_items)  ← expense reversed
     * 
     * The cost is derived from stock movements created during the original
     * order's finalization. For full refunds, we reverse the entire COGS.
     * For partial refunds, we calculate cost proportionally.
     * 
     * @param {Object} refund - The refund record (needs order_id, refund_type)
     * @param {Object} order - The original order
     * @param {Object} options - { transaction }
     */
    static async recordRefundCOGSReversal(refund, order, { transaction = null } = {}) {
        const { StockMovement, JournalEntry } = require('../models')

        // Idempotency: Check if COGS reversal already exists
        const existingEntry = await JournalEntry.findOne({
            where: {
                source_type: 'refund_cogs',
                source_id: refund.id
            },
            ...(transaction ? { transaction } : {})
        })

        if (existingEntry) {
            logger.info(`📒 COGS reversal skipped for refund ${refund.refund_number || refund.id}: Already exists`)
            return existingEntry
        }

        // Get original stock movements for this order
        const movements = await StockMovement.findAll({
            where: {
                source_type: 'order',
                source_id: order.id,
                movement_type: 'OUT'
            },
            ...(transaction ? { transaction } : {})
        })

        // FIX-09: Accurate COGS Reversal Calculation
        // Instead of estimating based on sales price ratio, we sum the actual 
        // costs recorded in StockMovement when stock was restored.
        const refundMovements = await StockMovement.findAll({
            where: {
                source_type: 'refund',
                source_id: refund.id,
                movement_type: 'IN'
            },
            ...(transaction ? { transaction } : {})
        })

        if (!refundMovements || refundMovements.length === 0) {
            logger.info(`📒 COGS reversal skipped for refund ${refund.refund_number || refund.id}: No stock restored`)
            return null
        }

        // Exact total cost to restore to inventory
        const reversalCost = Math.round(
            refundMovements.reduce((sum, m) => sum + Math.abs(parseFloat(m.total_cost || 0)), 0) * 100
        ) / 100

        if (reversalCost <= 0) return null

        // Phase 3: Dynamic account resolution
        const ctx = { branchId: order.branch_id }
        const accts = await AccountResolver.resolveMany({
            inventory: ACCOUNT_KEYS.INVENTORY,
            cogs: ACCOUNT_KEYS.COGS,
        }, ctx)

        return this.createJournalEntry({
            description: `تعديل تكلفة مبيعات — مرتجع رقم ${refund.refund_number || refund.id}`,
            sourceType: 'refund_cogs',
            sourceId: refund.id,
            lines: [
                { accountCode: accts.inventory, debit: reversalCost, credit: 0, description: `Inventory restored: Refund ${refund.refund_number || refund.id}` },
                { accountCode: accts.cogs, debit: 0, credit: reversalCost, description: `COGS reversed: Refund ${refund.refund_number || refund.id}` }
            ],
            branchId: order.branch_id,
            createdBy: refund.processed_by,
            transaction
        })
    }

    /**
     * Record a purchase receipt (goods received)
     * 
     * FIX-04: Input VAT is now separated from Inventory cost.
     * 
     * Correct accounting entry:
     *   DR Inventory Asset (1100)   (cost_before_tax)    ← asset at cost
     *   DR Input VAT       (1300)   (tax_amount)         ← recoverable tax
     *   CR Accounts Payable (2002)  (total_incl_tax)     ← total liability
     * 
     * If no tax is provided, falls back to full amount as inventory (backward-compatible).
     * 
     * Idempotency guard added to prevent duplicate GL entries on retry.
     */
    static async recordPurchaseReceipt(receipt, { transaction = null } = {}) {
        const totalCost = parseFloat(receipt.total_cost || 0)
        if (totalCost <= 0) return null

        // Idempotency guard
        const existingEntry = await JournalEntry.findOne({
            where: { source_type: 'purchase_receipt', source_id: receipt.id },
            ...(transaction ? { transaction } : {})
        })
        if (existingEntry) {
            logger.info(`📒 recordPurchaseReceipt SKIPPED — already posted (${existingEntry.entry_number}) for receipt ${receipt.receipt_number || receipt.id}`)
            return existingEntry
        }

        const taxAmount = parseFloat(receipt.tax_amount || 0)
        const costBeforeTax = Math.round((totalCost - taxAmount) * 100) / 100

        let resolvedBranchId = receipt.branch_id || null
        if (!resolvedBranchId && receipt.warehouse_id) {
            resolvedBranchId = await this._resolveBranchIdFromWarehouse(receipt.warehouse_id, { transaction })
        }
        if (!resolvedBranchId && receipt.purchase_order_id) {
            resolvedBranchId = await this._resolveBranchIdFromPurchaseOrder(receipt.purchase_order_id, { transaction })
        }

        // Phase 3: Dynamic account resolution
        const ctx = { branchId: resolvedBranchId }
        const accts = await AccountResolver.resolveMany({
            inventory: ACCOUNT_KEYS.INVENTORY,
            inputVat: ACCOUNT_KEYS.INPUT_VAT,
            payable: ACCOUNT_KEYS.ACCOUNTS_PAYABLE,
        }, ctx)

        const lines = []

        if (taxAmount > 0 && costBeforeTax > 0) {
            // FIX-04: Split inventory cost and Input VAT
            lines.push({ accountCode: accts.inventory, debit: costBeforeTax, credit: 0, description: `Inventory received (ex-tax): ${receipt.receipt_number || receipt.id}` })
            lines.push({ accountCode: accts.inputVat, debit: taxAmount, credit: 0, description: `Input VAT recoverable: ${receipt.receipt_number || receipt.id}` })
        } else {
            // No tax separation (backward-compatible)
            lines.push({ accountCode: accts.inventory, debit: totalCost, credit: 0, description: `Inventory received: ${receipt.receipt_number || receipt.id}` })
        }

        if (receipt.payment_method && receipt.payment_method !== 'credit' && receipt.payment_account_code) {
            lines.push({ accountCode: receipt.payment_account_code, debit: 0, credit: totalCost, description: `Direct payment (${receipt.payment_method}): ${receipt.receipt_number || receipt.id}` })
        } else {
            lines.push({ accountCode: accts.payable, debit: 0, credit: totalCost, description: `Liability to supplier: ${receipt.receipt_number || receipt.id}` })
        }

        // FIX-06: Embed supplier_id in notes for GL-based balance queries
        const supplierId = receipt.supplier_id ||
            (receipt.purchase_order_id
                ? (await require('../models').PurchaseOrder.findByPk(receipt.purchase_order_id, { attributes: ['supplier_id'], ...(transaction ? { transaction } : {}) }))?.supplier_id
                : null)

        const receiptNotes = JSON.stringify({
            supplier_id: supplierId || null,
            receipt_number: receipt.receipt_number || receipt.id,
            purchase_order_id: receipt.purchase_order_id || null,
            _meta: 'supplier_ap_entry'
        })

        return this.createJournalEntry({
            description: `استلام بضاعة — إيصال رقم ${receipt.receipt_number || receipt.id}`,
            sourceType: 'purchase_receipt',
            sourceId: receipt.id,
            lines,
            branchId: resolvedBranchId,
            supplierId: supplierId || null,
            createdBy: receipt.received_by || receipt.created_by || null,
            notes: receiptNotes,
            transaction
        })
    }

    /**
     * Reverse a purchase receipt journal entry (FIX-05)
     * 
     * Called when a received purchase is cancelled or voided by admin.
     * Creates a full reversal entry:
     *   DR Accounts Payable  (total_cost)   ← cancel liability
     *   CR Inventory        (cost_ex_tax)   ← remove from stock value
     *   CR Input VAT        (tax_amount)    ← cancel recoverable tax (if any)
     * 
     * This ensures the GL stays consistent when a receipt is reversed.
     */
    static async reversePurchaseReceipt(receiptId, { reason = 'إلغاء استلام', createdBy = null, transaction = null } = {}) {
        // Find the original GL entry
        const originalEntry = await JournalEntry.findOne({
            where: { source_type: 'purchase_receipt', source_id: receiptId },
            ...(transaction ? { transaction } : {})
        })

        if (!originalEntry) {
            logger.warn(`📒 reversePurchaseReceipt: No GL entry found for receipt ${receiptId} — nothing to reverse`)
            return null
        }

        if (originalEntry.status === 'reversed') {
            logger.info(`📒 reversePurchaseReceipt: Entry ${originalEntry.entry_number} already reversed`)
            return null
        }

        return this.reverseJournalEntry(originalEntry.id, { reason, createdBy, transaction })
    }

    // FIX C-05: REMOVED DUPLICATE recordSupplierPayment (v1)
    // The authoritative version with idempotency guard, supplier_id metadata,
    // and proper branch handling is defined below (was at line ~855).

    /**
     * Record a stock adjustment (shrinkage/gain)
     * 
     * FIX-18: Idempotency guard added.
     * 
     * Accounting entry (Loss):
     *   DR Inventory Shrinkage (value)
     *   CR Inventory Asset     (value)
     * 
     * Accounting entry (Gain):
     *   DR Inventory Asset     (value)
     *   CR Inventory Shrinkage (value)
     */
    static async recordStockAdjustment(adjustment, { transaction = null } = {}) {
        // FIX-18 — IDEMPOTENCY GUARD
        const existingEntry = await JournalEntry.findOne({
            where: { source_type: 'stock_adjustment', source_id: adjustment.id },
            ...(transaction ? { transaction } : {})
        })
        if (existingEntry) {
            logger.info(`📒 recordStockAdjustment SKIPPED — duplicate guard for adjustment ${adjustment.id}`)
            return existingEntry
        }

        const value = Math.abs(parseFloat(adjustment.adjustment_value || 0))
        if (value === 0) return null

        const isLoss = parseFloat(adjustment.adjustment_value) < 0

        // Phase 3: Dynamic account resolution
        const ctx = { branchId: adjustment.branch_id }
        const accts = await AccountResolver.resolveMany({
            inventory: ACCOUNT_KEYS.INVENTORY,
            shrinkage: ACCOUNT_KEYS.INVENTORY_SHRINKAGE,
        }, ctx)

        return this.createJournalEntry({
            description: `تعديل مخزون — تسوية رقم ${adjustment.id}`,
            sourceType: 'stock_adjustment',
            sourceId: adjustment.id,
            lines: isLoss ? [
                { accountCode: accts.shrinkage, debit: value, credit: 0, description: 'Inventory loss/shrinkage' },
                { accountCode: accts.inventory, debit: 0, credit: value, description: 'Inventory reduction' }
            ] : [
                { accountCode: accts.inventory, debit: value, credit: 0, description: 'Inventory gain' },
                { accountCode: accts.shrinkage, debit: 0, credit: value, description: 'Inventory reversal' }
            ],
            branchId: adjustment.branch_id,
            transaction
        })
    }

    /**
     * Record a payment made to a supplier.
     * 
     * FIX C-05: Unified single version (was duplicated).
     * FIX-06: supplier_id is now stored in entry notes as JSON metadata
     * so we can compute the GL balance per-supplier directly.
     * FIX H-02: Uses payment.branch_id instead of null.
     * 
     * Accounting entry:
     *   DR Accounts Payable (2002)   (amount)
     *   CR Cash (1001) or Bank (1002)  (amount)
     */
    static async recordSupplierPayment(payment, { transaction = null } = {}) {
        const { payment_method, amount, payment_number, created_by } = payment
        const parsedAmount = parseFloat(amount || 0)
        if (parsedAmount <= 0) return null

        let resolvedBranchId = payment.branch_id || null
        if (!resolvedBranchId && payment.purchase_order_id) {
            resolvedBranchId = await this._resolveBranchIdFromPurchaseOrder(payment.purchase_order_id, { transaction })
        }

        // Phase 3: Dynamic account resolution
        const accts = await AccountResolver.resolveMany({
            cash: ACCOUNT_KEYS.CASH,
            bank: ACCOUNT_KEYS.BANK,
            payable: ACCOUNT_KEYS.ACCOUNTS_PAYABLE,
        }, { branchId: resolvedBranchId })

        // Determine credit account
        let creditAccount
        switch (payment_method) {
            case 'cash': creditAccount = accts.cash; break;
            case 'bank_transfer':
            case 'check':
            case 'card': creditAccount = accts.bank; break;
            default: creditAccount = accts.bank;
        }

        // Idempotency guard — prevent duplicate GL entries
        const existingEntry = await JournalEntry.findOne({
            where: {
                source_type: 'supplier_payment',
                source_id: payment.id
            },
            ...(transaction ? { transaction } : {})
        })

        if (existingEntry) {
            logger.info(`📒 recordSupplierPayment SKIPPED — duplicate guard for ${payment_number}`)
            return existingEntry
        }

        // FIX-06: Embed supplier_id in entry notes for GL-based balance queries
        const entryNotes = JSON.stringify({
            supplier_id: payment.supplier_id,
            payment_number,
            purchase_order_id: payment.purchase_order_id || null,
            _meta: 'supplier_ap_entry'
        })

        return this.createJournalEntry({
            description: `دفع للمورد — دفعة رقم ${payment_number}`,
            sourceType: 'supplier_payment',
            sourceId: payment.id,
            lines: [
                { accountCode: accts.payable, debit: parsedAmount, credit: 0, description: `Payment to Supplier: ${payment_number}` },
                { accountCode: creditAccount, debit: 0, credit: parsedAmount, description: `Payment Out (${payment_method}): ${payment_number}` }
            ],
            branchId: resolvedBranchId || null,
            supplierId: payment.supplier_id || null,
            createdBy: created_by,
            notes: entryNotes,
            transaction
        })
    }

    /**
     * Record a purchase return (goods returned to supplier)
     * 
     * FIX-06: supplier_id stored in entry notes metadata.
     * 
     * Accounting entry:
     *   DR Accounts Payable (2002)   (total_amount) ← reduce liability to supplier
     *   CR Inventory Asset  (1100)   (total_amount) ← reduce inventory (goods leaving)
     * 
     * This is the reverse of recordPurchaseReceipt.
     */
    static async recordPurchaseReturn(purchaseReturn, { transaction = null } = {}) {
        const totalAmount = parseFloat(purchaseReturn.total_amount || 0)
        if (totalAmount <= 0) return null

        let resolvedBranchId = purchaseReturn.branch_id || null
        if (!resolvedBranchId && purchaseReturn.warehouse_id) {
            resolvedBranchId = await this._resolveBranchIdFromWarehouse(purchaseReturn.warehouse_id, { transaction })
        }
        if (!resolvedBranchId && purchaseReturn.purchase_order_id) {
            resolvedBranchId = await this._resolveBranchIdFromPurchaseOrder(purchaseReturn.purchase_order_id, { transaction })
        }

        // Check for duplicate GL entry
        const { JournalEntry } = require('../models')
        const existingEntry = await JournalEntry.findOne({
            where: {
                source_type: 'purchase_return',
                source_id: purchaseReturn.id
            },
            ...(transaction ? { transaction } : {})
        })

        if (existingEntry) {
            logger.info(`📒 Accounting: Skipping duplicate purchase return entry for ${purchaseReturn.return_number}`)
            return existingEntry
        }

        // FIX-06: Embed supplier_id in notes for GL-based balance queries
        const returnNotes = JSON.stringify({
            supplier_id: purchaseReturn.supplier_id || null,
            return_number: purchaseReturn.return_number,
            purchase_order_id: purchaseReturn.purchase_order_id || null,
            _meta: 'supplier_ap_entry'
        })

        // Phase 3: Dynamic account resolution
        const ctx = { branchId: resolvedBranchId }
        const accts = await AccountResolver.resolveMany({
            payable: ACCOUNT_KEYS.ACCOUNTS_PAYABLE,
            inventory: ACCOUNT_KEYS.INVENTORY,
        }, ctx)

        return this.createJournalEntry({
            description: `مرتجع شراء — ${purchaseReturn.return_number}`,
            sourceType: 'purchase_return',
            sourceId: purchaseReturn.id,
            lines: [
                { accountCode: accts.payable, debit: totalAmount, credit: 0, description: `Purchase Return: ${purchaseReturn.return_number} — Reduce Supplier Liability` },
                { accountCode: accts.inventory, debit: 0, credit: totalAmount, description: `Purchase Return: ${purchaseReturn.return_number} — Inventory Out` }
            ],
            branchId: resolvedBranchId || null,
            supplierId: purchaseReturn.supplier_id || null,
            createdBy: purchaseReturn.created_by,
            notes: returnNotes,
            transaction
        })
    }


    /**
     * Record stock transfer between warehouses (FIX-11)
     * 
     * If warehouses belong to DIFFERENT branches:
     *   Branch A (Source): DR Inter-branch (1105) / CR Inventory (1100)
     *   Branch B (Dest):   DR Inventory (1100) / CR Inter-branch (1105)
     */
    static async recordStockTransfer(transfer, { fromBranchId, toBranchId, totalCost, userId, transaction = null } = {}) {
        if (!fromBranchId || !toBranchId || totalCost <= 0) return null

        if (fromBranchId === toBranchId) {
            logger.info(`📒 Stock Transfer ${transfer.transfer_number}: Same branch, skipping GL entries.`)
            return null
        }

        // FIX H-01 + AUDIT-FIX — IDEMPOTENCY GUARD: Prevent duplicate transfer GL entries
        // Uses distinct source_types ('stock_transfer_out' / 'stock_transfer_in') so each entry
        // has its own idempotency check. Legacy entries with 'stock_transfer' are also detected.
        const existingOutEntry = await JournalEntry.findOne({
            where: {
                source_type: { [Op.in]: ['stock_transfer_out', 'stock_transfer', 'transfer'] },
                source_id: transfer.id,
                branch_id: fromBranchId
            },
            ...(transaction ? { transaction } : {})
        })
        const existingInEntry = await JournalEntry.findOne({
            where: {
                source_type: { [Op.in]: ['stock_transfer_in', 'stock_transfer', 'transfer'] },
                source_id: transfer.id,
                branch_id: toBranchId
            },
            ...(transaction ? { transaction } : {})
        })

        if (existingOutEntry && existingInEntry) {
            logger.info(`📒 recordStockTransfer SKIPPED — both entries already exist for transfer ${transfer.id}`)
            return existingInEntry
        }

        // Phase 3: Dynamic — resolve per-branch accounts
        const fromAccts = await AccountResolver.resolveMany({
            clearing: ACCOUNT_KEYS.INTER_BRANCH_CLEARING,
            inventory: ACCOUNT_KEYS.INVENTORY,
        }, { branchId: fromBranchId })

        const toAccts = await AccountResolver.resolveMany({
            inventory: ACCOUNT_KEYS.INVENTORY,
            clearing: ACCOUNT_KEYS.INTER_BRANCH_CLEARING,
        }, { branchId: toBranchId })

        // 1. Entry for Source Branch (only if not already created)
        if (!existingOutEntry) {
            await this.createJournalEntry({
                description: `تحويل بضاعة صادرة — إلى فرع ${toBranchId}`,
                sourceType: 'stock_transfer_out',
                sourceId: transfer.id,
                lines: [
                    { accountCode: fromAccts.clearing, debit: totalCost, credit: 0, description: 'Inter-branch Outbound' },
                    { accountCode: fromAccts.inventory, debit: 0, credit: totalCost, description: 'Inventory Out (Transfer)' }
                ],
                branchId: fromBranchId,
                createdBy: userId,
                transaction
            })
        }

        // 2. Entry for Destination Branch (only if not already created)
        if (!existingInEntry) {
            return this.createJournalEntry({
                description: `تحويل بضاعة واردة — من فرع ${fromBranchId}`,
                sourceType: 'stock_transfer_in',
                sourceId: transfer.id,
                lines: [
                    { accountCode: toAccts.inventory, debit: totalCost, credit: 0, description: 'Inventory In (Transfer)' },
                    { accountCode: toAccts.clearing, debit: 0, credit: totalCost, description: 'Inter-branch Inbound' }
                ],
                branchId: toBranchId,
                createdBy: userId,
                transaction
            })
        }

        return existingInEntry
    }


    /**
     * Record cash drawer opening (FIX-13 + FIX-16)
     * 
     * FIX-13: Uses Drawer Float (1005) instead of Owner Capital.
     * FIX-16: Idempotency guard added.
     * 
     * Accounting entry:
     *   DR Cash (1001)          (opening_amount)
     *   CR Drawer Float (1005)  (opening_amount)
     */
    static async recordDrawerOpening(shiftId, openingAmount, { branchId, userId, transaction = null } = {}) {
        if (openingAmount <= 0) return null

        // FIX-16 — IDEMPOTENCY GUARD
        const existingEntry = await JournalEntry.findOne({
            where: { source_type: 'shift', source_id: String(shiftId), description: { [Op.like]: '%افتتاحي%' } },
            ...(transaction ? { transaction } : {})
        })
        if (existingEntry) {
            logger.info(`📒 recordDrawerOpening SKIPPED — duplicate guard for shift ${shiftId}`)
            return existingEntry
        }

        // Phase 3: Dynamic account resolution
        const ctx = { branchId }
        const accts = await AccountResolver.resolveMany({
            cash: ACCOUNT_KEYS.CASH,
            drawerFloat: ACCOUNT_KEYS.DRAWER_FLOAT,
        }, ctx)

        return this.createJournalEntry({
            description: `فتح وردية — رصيد افتتاحي`,
            sourceType: 'shift',
            sourceId: String(shiftId),
            lines: [
                { accountCode: accts.cash, debit: openingAmount, credit: 0, description: 'Opening float (Cash in drawer)' },
                { accountCode: accts.drawerFloat, debit: 0, credit: openingAmount, description: 'Transfer from drawer float/safe — FIX-13' }
            ],
            branchId,
            createdBy: userId,
            transaction
        })
    }

    /**
     * Record cash variance (shortage or overage) at shift close
     * 
     * Shortage (negative variance):
     *   DR Cash Shortage (5003)  (abs_variance)
     *   CR Cash (1001)           (abs_variance)
     * 
     * Overage (positive variance):
     *   DR Cash (1001)           (variance)
     *   CR Other Income (4100)   (variance)  ← FIX-08: NOT Sales Revenue
     * 
     * FIX-08: Cash overages are NOT sales revenue. Mixing them distorts
     * the revenue line on the Income Statement. They belong in Other Income.
     */
    static async recordCashVariance(shiftId, variance, { branchId, userId, transaction = null } = {}) {
        if (variance === 0) return null

        // FIX-17 — IDEMPOTENCY GUARD
        const existingEntry = await JournalEntry.findOne({
            where: { source_type: 'shift', source_id: String(shiftId), description: { [Op.like]: '%نقدي في الوردية%' } },
            ...(transaction ? { transaction } : {})
        })
        if (existingEntry) {
            logger.info(`📒 recordCashVariance SKIPPED — duplicate guard for shift ${shiftId}`)
            return existingEntry
        }

        const absVariance = Math.round(Math.abs(variance) * 100) / 100

        // Phase 3: Dynamic account resolution
        const ctx = { branchId }
        const accts = await AccountResolver.resolveMany({
            cash: ACCOUNT_KEYS.CASH,
            shortage: ACCOUNT_KEYS.CASH_SHORTAGE,
            otherIncome: ACCOUNT_KEYS.OTHER_INCOME,
        }, ctx)

        if (variance < 0) {
            // SHORTAGE — money is missing
            return this.createJournalEntry({
                description: `عجز نقدي في الوردية`,
                sourceType: 'shift',
                sourceId: String(shiftId),
                lines: [
                    { accountCode: accts.shortage, debit: absVariance, credit: 0, description: 'Cash shortage' },
                    { accountCode: accts.cash, debit: 0, credit: absVariance, description: 'Missing cash' }
                ],
                branchId,
                createdBy: userId,
                transaction
            })
        } else {
            // FIX-08: OVERAGE → Other Income, NOT Sales Revenue
            return this.createJournalEntry({
                description: `فائض نقدي في الوردية`,
                sourceType: 'shift',
                sourceId: String(shiftId),
                lines: [
                    { accountCode: accts.cash, debit: absVariance, credit: 0, description: 'Extra cash found' },
                    { accountCode: accts.otherIncome, debit: 0, credit: absVariance, description: 'Cash overage — Other Income (not Sales)' }
                ],
                branchId,
                createdBy: userId,
                transaction
            })
        }
    }

    // ==================== SUPPLIER GL BALANCE (FIX-06) ====================

    static _extractSupplierIdFromEntry(entry) {
        if (entry?.supplier_id) return entry.supplier_id
        const notes = typeof entry?.notes === 'string' ? entry.notes.trim() : ''
        if (!notes) return null

        try {
            const parsed = JSON.parse(notes)
            if (parsed && typeof parsed === 'object' && parsed.supplier_id) {
                return parsed.supplier_id
            }
        } catch (_) {
            // Ignore parse errors; fallback to regex below
        }

        const match = notes.match(/"supplier_id"\s*:\s*"([^"]+)"/)
        return match ? match[1] : null
    }

    static _normalizeDateInput(dateValue) {
        if (!dateValue) return null
        const d = new Date(dateValue)
        if (Number.isNaN(d.getTime())) return null
        return d.toISOString().split('T')[0]
    }

    static _startOfDay(dateLike) {
        const d = new Date(dateLike)
        d.setHours(0, 0, 0, 0)
        return d
    }

    static _daysBetween(fromDate, toDate) {
        const from = this._startOfDay(fromDate)
        const to = this._startOfDay(toDate)
        const diff = Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
        return Math.max(0, diff)
    }

    static _agingBucket(ageDays) {
        if (ageDays <= 30) return 'bucket_0_30'
        if (ageDays <= 60) return 'bucket_31_60'
        if (ageDays <= 90) return 'bucket_61_90'
        return 'bucket_91_plus'
    }

    static async _fetchSupplierAPMovements({
        supplierId = null,
        fromDate = null,
        toDate = null,
        branchId = null,
        transaction = null
    } = {}) {
        const apAccounts = await this._findAccountsByCodeFamily(ACCOUNTS.ACCOUNTS_PAYABLE, { transaction })
        if (!apAccounts.length) {
            throw new Error('ACCOUNTING_ERROR: Accounts Payable account family (2002*) not found in Chart of Accounts')
        }

        const apAccountIds = apAccounts.map(a => a.id)
        const apCodeById = {}
        for (const acc of apAccounts) apCodeById[acc.id] = acc.code

        const { Op } = require('sequelize')

        const supplierLinkWhere = supplierId
            ? [
                { supplier_id: supplierId },
                { notes: { [Op.like]: `%"supplier_id":"${supplierId}"%` } }
            ]
            : [
                { supplier_id: { [Op.ne]: null } },
                { notes: { [Op.like]: '%"supplier_id":"%' } }
            ]

        const where = {
            status: 'posted',
            [Op.or]: supplierLinkWhere
        }

        const normalizedFrom = this._normalizeDateInput(fromDate)
        const normalizedTo = this._normalizeDateInput(toDate)

        if (normalizedFrom || normalizedTo) {
            where.entry_date = {}
            if (normalizedFrom) where.entry_date[Op.gte] = normalizedFrom
            if (normalizedTo) where.entry_date[Op.lte] = normalizedTo
        }
        if (branchId) {
            where.branch_id = branchId
        }

        const entries = await JournalEntry.findAll({
            where,
            attributes: [
                'id',
                'entry_number',
                'entry_date',
                'source_type',
                'source_id',
                'supplier_id',
                'description',
                'notes',
                'branch_id',
                'created_at'
            ],
            include: [{
                model: JournalLine,
                as: 'lines',
                attributes: ['id', 'account_id', 'debit_amount', 'credit_amount'],
                where: { account_id: { [Op.in]: apAccountIds } },
                required: true
            }],
            order: [['entry_date', 'ASC'], ['created_at', 'ASC'], ['entry_number', 'ASC']],
            ...(transaction ? { transaction } : {})
        })

        const movements = []
        for (const entry of entries) {
            const resolvedSupplierId = this._extractSupplierIdFromEntry(entry)
            if (!resolvedSupplierId) continue
            if (supplierId && resolvedSupplierId !== supplierId) continue

            for (const line of entry.lines || []) {
                const debit = parseFloat(line.debit_amount || 0)
                const credit = parseFloat(line.credit_amount || 0)
                const effect = this._round2(credit - debit) // +ve => increases payable liability

                movements.push({
                    supplier_id: resolvedSupplierId,
                    journal_entry_id: entry.id,
                    entry_number: entry.entry_number,
                    entry_date: entry.entry_date,
                    source_type: entry.source_type,
                    source_id: entry.source_id,
                    description: entry.description,
                    account_code: apCodeById[line.account_id] || null,
                    debit,
                    credit,
                    effect,
                    branch_id: entry.branch_id || null
                })
            }
        }

        return movements.sort((a, b) => {
            const dateCmp = String(a.entry_date).localeCompare(String(b.entry_date))
            if (dateCmp !== 0) return dateCmp
            const numCmp = String(a.entry_number || '').localeCompare(String(b.entry_number || ''))
            if (numCmp !== 0) return numCmp
            return String(a.journal_entry_id).localeCompare(String(b.journal_entry_id))
        })
    }

    static _computeAPAgingFromMovements(movements, asOfDate) {
        const openPurchases = []
        let totalPurchases = 0
        let totalSettlements = 0
        let unappliedCredits = 0

        for (const m of movements) {
            if (m.effect > 0) {
                totalPurchases = this._round2(totalPurchases + m.effect)
                openPurchases.push({
                    ...m,
                    remaining: this._round2(m.effect)
                })
                continue
            }

            if (m.effect < 0) {
                let settleAmount = this._round2(Math.abs(m.effect))
                totalSettlements = this._round2(totalSettlements + settleAmount)

                for (const purchase of openPurchases) {
                    if (settleAmount <= 0) break
                    if (purchase.remaining <= 0) continue

                    const applied = Math.min(purchase.remaining, settleAmount)
                    purchase.remaining = this._round2(purchase.remaining - applied)
                    settleAmount = this._round2(settleAmount - applied)
                }

                if (settleAmount > 0) {
                    // Supplier has net credit (we paid more than outstanding invoices)
                    unappliedCredits = this._round2(unappliedCredits + settleAmount)
                }
            }
        }

        const buckets = {
            bucket_0_30: 0,
            bucket_31_60: 0,
            bucket_61_90: 0,
            bucket_91_plus: 0
        }

        const openItems = []
        for (const purchase of openPurchases) {
            if (purchase.remaining <= 0) continue
            const ageDays = this._daysBetween(purchase.entry_date, asOfDate)
            const bucket = this._agingBucket(ageDays)
            buckets[bucket] = this._round2(buckets[bucket] + purchase.remaining)

            openItems.push({
                ...purchase,
                age_days: ageDays,
                aging_bucket: bucket
            })
        }

        const totalOutstandingPayable = this._round2(openItems.reduce((sum, it) => sum + it.remaining, 0))
        const netBalance = this._round2(totalOutstandingPayable - unappliedCredits)

        return {
            totalPurchases: this._round2(totalPurchases),
            totalSettlements: this._round2(totalSettlements),
            totalOutstandingPayable,
            creditBalance: this._round2(unappliedCredits),
            netBalance,
            buckets,
            openItems
        }
    }

    /**
     * FIX-06: Get a supplier's TRUE balance directly from the General Ledger.
     * 
     * This is the AUTHORITATIVE balance — derived from posted journal entries.
     * It replaces complete reliance on Supplier.current_balance which can
     * drift out of sync if any update fails.
     * 
     * Logic:
     *   - Scans all posted GL entries linked to supplier_id
     *     (and falls back to legacy notes metadata for historical rows)
     *   - For each entry touching account 2002 (Accounts Payable):
     *       CREDIT lines = increase in liability (purchases received)
     *       DEBIT  lines = decrease in liability (payments, returns)
     *   - Net balance = total credits - total debits on AP account per supplier
     * 
     * @param {string} supplierId - UUID of the supplier
     * @returns {Object} { glBalance, breakdown }
     */
    static async getSupplierGLBalance(supplierId, { transaction = null } = {}) {
        const { JournalEntry, JournalLine, Account } = require('../models')

        // Resolve Accounts Payable account family (e.g., 2002 and 2002-xx)
        const apAccounts = await this._findAccountsByCodeFamily(ACCOUNTS.ACCOUNTS_PAYABLE, { transaction })
        if (!apAccounts.length) {
            throw new Error('ACCOUNTING_ERROR: Accounts Payable account family (2002*) not found in Chart of Accounts')
        }
        const apAccountIds = apAccounts.map(a => a.id)
        const apCodeById = {}
        for (const acc of apAccounts) {
            apCodeById[acc.id] = acc.code
        }

        // Fetch all posted entries for this supplier.
        // Primary source: journal_entries.supplier_id
        // Legacy fallback: notes JSON fragment.
        const { Op } = require('sequelize')
        const entries = await JournalEntry.findAll({
            where: {
                status: 'posted',
                [Op.or]: [
                    { supplier_id: supplierId },
                    { notes: { [Op.like]: `%"supplier_id":"${supplierId}"%` } }
                ]
            },
            include: [{
                model: JournalLine,
                as: 'lines',
                where: { account_id: { [Op.in]: apAccountIds } },
                required: true
            }],
            ...(transaction ? { transaction } : {})
        })

        let totalCredit = 0  // Purchases increase liability (AP credit)
        let totalDebit = 0   // Payments/Returns decrease liability (AP debit)
        const breakdown = []

        for (const entry of entries) {
            for (const line of entry.lines) {
                const credit = parseFloat(line.credit_amount || 0)  // FIX C-04: Use actual DB column name
                const debit = parseFloat(line.debit_amount || 0)    // FIX C-04: Use actual DB column name
                totalCredit = Math.round((totalCredit + credit) * 100) / 100
                totalDebit = Math.round((totalDebit + debit) * 100) / 100

                breakdown.push({
                    entry_number: entry.entry_number,
                    entry_date: entry.entry_date,
                    source_type: entry.source_type,
                    description: entry.description,
                    account_code: apCodeById[line.account_id] || null,
                    debit,
                    credit,
                    running_effect: credit - debit  // positive = increases liability
                })
            }
        }

        // Net AP balance for this supplier (Credit Normal: credit > debit = liability)
        const glBalance = Math.round((totalCredit - totalDebit) * 100) / 100

        return {
            supplierId,
            glBalance,       // Authoritative GL balance
            totalPurchases: totalCredit,
            totalPayments: totalDebit,
            breakdown: breakdown.sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date))
        }
    }

    /**
     * Supplier Statement (GL-based)
     * 
     * Returns a full AP movement statement for a supplier:
     * - Opening balance (before fromDate)
     * - Period movements (debit/credit/effect)
     * - Running and closing balances
     */
    static async getSupplierStatement(supplierId, {
        fromDate = null,
        toDate = null,
        branchId = null,
        transaction = null
    } = {}) {
        const normalizedFrom = this._normalizeDateInput(fromDate)
        const normalizedTo = this._normalizeDateInput(toDate)

        let openingBalance = 0
        if (normalizedFrom) {
            const dayBefore = new Date(normalizedFrom)
            dayBefore.setDate(dayBefore.getDate() - 1)

            const openingMovements = await this._fetchSupplierAPMovements({
                supplierId,
                toDate: dayBefore,
                branchId,
                transaction
            })
            openingBalance = this._round2(openingMovements.reduce((sum, m) => sum + m.effect, 0))
        }

        const periodMovements = await this._fetchSupplierAPMovements({
            supplierId,
            fromDate: normalizedFrom,
            toDate: normalizedTo,
            branchId,
            transaction
        })

        let running = openingBalance
        const movementsWithRunning = periodMovements.map(m => {
            running = this._round2(running + m.effect)
            return { ...m, running_balance: running }
        })

        const periodDebit = this._round2(periodMovements.reduce((sum, m) => sum + m.debit, 0))
        const periodCredit = this._round2(periodMovements.reduce((sum, m) => sum + m.credit, 0))
        const periodNet = this._round2(periodCredit - periodDebit)
        const closingBalance = this._round2(openingBalance + periodNet)

        return {
            supplierId,
            from_date: normalizedFrom,
            to_date: normalizedTo,
            opening_balance: openingBalance,
            period_debit: periodDebit,
            period_credit: periodCredit,
            period_net_change: periodNet,
            closing_balance: closingBalance,
            movement_count: movementsWithRunning.length,
            movements: movementsWithRunning
        }
    }

    /**
     * Accounts Payable Aging Report (GL-based, all suppliers)
     * 
     * Aging buckets:
     * - 0-30
     * - 31-60
     * - 61-90
     * - 91+
     */
    static async getSuppliersAPAging({
        asOfDate = null,
        branchId = null,
        includeZero = false,
        includeInactive = true,
        transaction = null
    } = {}) {
        const { Supplier } = require('../models')
        const normalizedAsOfDate = this._normalizeDateInput(asOfDate) || this._normalizeDateInput(new Date())
        const { Op } = require('sequelize')

        const supplierWhere = includeInactive
            ? { status: { [Op.in]: ['active', 'inactive', 'blocked'] } }
            : { status: 'active' }

        const suppliers = await Supplier.findAll({
            where: supplierWhere,
            attributes: ['id', 'code', 'name_ar', 'payment_terms', 'status', 'current_balance'],
            order: [['name_ar', 'ASC']],
            ...(transaction ? { transaction } : {})
        })

        const movements = await this._fetchSupplierAPMovements({
            toDate: normalizedAsOfDate,
            branchId,
            transaction
        })

        const bySupplier = new Map()
        for (const m of movements) {
            if (!bySupplier.has(m.supplier_id)) bySupplier.set(m.supplier_id, [])
            bySupplier.get(m.supplier_id).push(m)
        }

        const rows = []
        for (const supplier of suppliers) {
            const supplierMovements = bySupplier.get(supplier.id) || []
            const aging = this._computeAPAgingFromMovements(supplierMovements, normalizedAsOfDate)
            const cache = parseFloat(supplier.current_balance || 0)

            const row = {
                supplier_id: supplier.id,
                supplier_code: supplier.code,
                supplier_name: supplier.name_ar,
                payment_terms: supplier.payment_terms,
                supplier_status: supplier.status,
                total_purchases_ap: aging.totalPurchases,
                total_settlements_ap: aging.totalSettlements,
                outstanding_payable: aging.totalOutstandingPayable,
                credit_balance: aging.creditBalance,
                net_balance: aging.netBalance,
                bucket_0_30: aging.buckets.bucket_0_30,
                bucket_31_60: aging.buckets.bucket_31_60,
                bucket_61_90: aging.buckets.bucket_61_90,
                bucket_91_plus: aging.buckets.bucket_91_plus,
                open_items_count: aging.openItems.length,
                cache_balance: this._round2(cache),
                cache_difference: this._round2(aging.netBalance - cache)
            }

            if (includeZero || Math.abs(row.net_balance) > 0.009 || Math.abs(row.outstanding_payable) > 0.009) {
                rows.push(row)
            }
        }

        const summary = rows.reduce((acc, row) => {
            acc.total_outstanding_payables = this._round2(acc.total_outstanding_payables + row.outstanding_payable)
            acc.total_credit_balances = this._round2(acc.total_credit_balances + row.credit_balance)
            acc.net_payables = this._round2(acc.net_payables + row.net_balance)
            acc.bucket_0_30 = this._round2(acc.bucket_0_30 + row.bucket_0_30)
            acc.bucket_31_60 = this._round2(acc.bucket_31_60 + row.bucket_31_60)
            acc.bucket_61_90 = this._round2(acc.bucket_61_90 + row.bucket_61_90)
            acc.bucket_91_plus = this._round2(acc.bucket_91_plus + row.bucket_91_plus)
            return acc
        }, {
            suppliers_count: rows.length,
            total_outstanding_payables: 0,
            total_credit_balances: 0,
            net_payables: 0,
            bucket_0_30: 0,
            bucket_31_60: 0,
            bucket_61_90: 0,
            bucket_91_plus: 0
        })

        return {
            as_of_date: normalizedAsOfDate,
            branch_id: branchId || null,
            include_zero: !!includeZero,
            rows,
            summary
        }
    }

    /**
     * FIX-06: Sync Supplier.current_balance with the GL authoritative balance.
     * 
     * This should be called:
     *   - On demand via admin endpoint
     *   - After any manual journal entry correction
     *   - As a scheduled nightly job
     * 
     * The sync ONLY updates current_balance — it does NOT create journal entries.
     * current_balance now becomes a CACHE of the GL balance, not the source of truth.
     * 
     * @param {string} supplierId - UUID of the supplier
     * @returns {Object} { supplierId, oldBalance, newBalance, difference }
     */
    static async syncSupplierBalance(supplierId, { transaction = null } = {}) {
        const { Supplier } = require('../models')

        const supplier = await Supplier.findByPk(
            supplierId,
            transaction ? { transaction } : {}
        )
        if (!supplier) throw new Error(`Supplier ${supplierId} not found`)

        const { glBalance } = await this.getSupplierGLBalance(supplierId, { transaction })
        const oldBalance = parseFloat(supplier.current_balance || 0)
        const difference = Math.round((glBalance - oldBalance) * 100) / 100

        if (Math.abs(difference) > 0.001) {
            await supplier.update(
                { current_balance: glBalance },
                transaction ? { transaction } : {}
            )
            logger.info(
                `📒 FIX-06 Sync: Supplier ${supplier.code} balance corrected: ` +
                `${oldBalance} → ${glBalance} (diff: ${difference})`
            )
        } else {
            logger.info(`📒 FIX-06 Sync: Supplier ${supplier.code} balance OK (${oldBalance}) — no correction needed`)
        }

        return { supplierId, supplierCode: supplier.code, oldBalance, newBalance: glBalance, difference }
    }

    /**
     * FIX-06: Reconcile ALL suppliers — find and report any discrepancies
     * between Supplier.current_balance and the GL.
     * 
     * Returns a reconciliation report showing:
     *   - Suppliers with matching balances ✅
     *   - Suppliers with discrepancies ⚠️ (and auto-corrects them)
     * 
     * @param {boolean} autoFix - If true, updates current_balance to match GL
     * @returns {Object} reconciliation report
     */
    static async reconcileAllSuppliers({ autoFix = false, transaction = null } = {}) {
        const { Supplier, Op } = { ...require('../models'), Op: require('sequelize').Op }

        const suppliers = await Supplier.findAll({
            where: { status: { [Op.in]: ['active', 'inactive'] } },
            attributes: ['id', 'code', 'name_ar', 'current_balance'],
            ...(transaction ? { transaction } : {})
        })

        const results = []
        let matched = 0
        let discrepancies = 0
        let corrected = 0

        for (const supplier of suppliers) {
            try {
                const { glBalance } = await this.getSupplierGLBalance(supplier.id, { transaction })
                const storedBalance = parseFloat(supplier.current_balance || 0)
                const difference = Math.round((glBalance - storedBalance) * 100) / 100
                const hasDiscrepancy = Math.abs(difference) > 0.01

                const record = {
                    supplier_id: supplier.id,
                    supplier_code: supplier.code,
                    supplier_name: supplier.name_ar,
                    stored_balance: storedBalance,
                    gl_balance: glBalance,
                    difference,
                    status: hasDiscrepancy ? '⚠️ DISCREPANCY' : '✅ OK'
                }

                if (hasDiscrepancy) {
                    discrepancies++
                    if (autoFix) {
                        await supplier.update(
                            { current_balance: glBalance },
                            transaction ? { transaction } : {}
                        )
                        record.status = '🔧 CORRECTED'
                        record.action = `Updated ${storedBalance} → ${glBalance}`
                        corrected++
                        logger.warn(
                            `📒 Reconcile: Supplier ${supplier.code} corrected ` +
                            `${storedBalance} → ${glBalance} (diff: ${difference})`
                        )
                    }
                } else {
                    matched++
                }

                results.push(record)
            } catch (err) {
                logger.error(`📒 Reconcile failed for supplier ${supplier.code}:`, err.message)
                results.push({
                    supplier_id: supplier.id,
                    supplier_code: supplier.code,
                    status: '❌ ERROR',
                    error: err.message
                })
            }
        }

        return {
            total: suppliers.length,
            matched,
            discrepancies,
            corrected,
            autoFix,
            results
        }
    }

    // ==================== FINANCIAL REPORTS ====================

    static _isCodeOrChild(code, rootCode) {
        if (!code || !rootCode) return false
        return code === rootCode || code.startsWith(`${rootCode}-`)
    }

    static async _findAccountsByCodeFamily(rootCode, { transaction = null } = {}) {
        return Account.findAll({
            where: {
                [Op.or]: [
                    { code: rootCode },
                    { code: { [Op.like]: `${rootCode}-%` } }
                ]
            },
            attributes: ['id', 'code'],
            ...(transaction ? { transaction } : {})
        })
    }

    static _round2(value) {
        return Math.round((parseFloat(value || 0) || 0) * 100) / 100
    }

    /**
     * Build hierarchical account report (header + children) from flat balances.
     * Keeps backward compatibility by exposing this only as an extra field.
     */
    static async _buildHierarchyReport({
        trialAccounts = [],
        accountType = null,
        parentCode = null,
        includeZero = false
    } = {}) {
        const where = { is_active: true }
        if (accountType) where.root_type = accountType

        const chart = await Account.findAll({
            where,
            attributes: ['id', 'code', 'name_ar', 'name_en', 'root_type', 'account_type', 'normal_balance', 'is_group', 'parent_id'],
            order: [['code', 'ASC']]
        })

        const trialMap = new Map(trialAccounts.map(acc => [acc.code, acc]))
        const nodeById = new Map()
        const nodeByCode = new Map()

        for (const acc of chart) {
            const trial = trialMap.get(acc.code)
            const node = {
                id: acc.id,
                code: acc.code,
                name_ar: acc.name_ar,
                name_en: acc.name_en,
                root_type: acc.root_type,
                account_type: acc.account_type,
                normal_balance: acc.normal_balance,
                is_group: !!acc.is_group,
                total_debit: this._round2(trial?.total_debit || 0),
                total_credit: this._round2(trial?.total_credit || 0),
                balance: this._round2(trial?.balance || 0),
                children: []
            }
            nodeById.set(acc.id, node)
            nodeByCode.set(acc.code, node)
        }

        const roots = []
        for (const acc of chart) {
            const node = nodeById.get(acc.id)
            if (acc.parent_id && nodeById.has(acc.parent_id)) {
                nodeById.get(acc.parent_id).children.push(node)
            } else {
                roots.push(node)
            }
        }

        const aggregate = (node) => {
            let childDebit = 0
            let childCredit = 0
            let childBalance = 0

            for (const child of node.children) {
                aggregate(child)
                childDebit = this._round2(childDebit + child.total_debit)
                childCredit = this._round2(childCredit + child.total_credit)
                childBalance = this._round2(childBalance + child.balance)
            }

            node.total_debit = this._round2(node.total_debit + childDebit)
            node.total_credit = this._round2(node.total_credit + childCredit)
            node.balance = this._round2(node.balance + childBalance)
        }

        const prune = (node) => {
            node.children = node.children.map(prune).filter(Boolean)

            if (includeZero) return node

            const hasAmount =
                Math.abs(node.total_debit) > 0.0009 ||
                Math.abs(node.total_credit) > 0.0009 ||
                Math.abs(node.balance) > 0.0009

            if (hasAmount || node.children.length > 0) return node
            return null
        }

        for (const root of roots) aggregate(root)

        let selectedRoots = roots
        if (parentCode) {
            const parent = nodeByCode.get(parentCode)
            selectedRoots = parent ? [parent] : []
        }

        return selectedRoots.map(prune).filter(Boolean)
    }

    /**
     * Trial Balance — Sum of all account balances
     * 
     * This is the foundational report. If debits ≠ credits, the books are broken.
     */
    static async getTrialBalance({
        periodFrom,
        periodTo,
        companyId,
        branchId,
        sourceType = null,
        sourceId = null,
        accountCode = null,
        accountCodePrefix = null,
        includeHierarchy = false,
        hierarchyParentCode = null,
        includeZeroHierarchy = false
    } = {}) {
        const where = { status: 'posted' }
        if (periodFrom) where.fiscal_period = { ...where.fiscal_period, [Op.gte]: periodFrom }
        if (periodTo) where.fiscal_period = { ...where.fiscal_period, [Op.lte]: periodTo }
        if (companyId) where.company_id = companyId
        if (branchId) where.branch_id = branchId
        if (sourceType) where.source_type = sourceType
        if (sourceId) where.source_id = sourceId

        const entries = await JournalEntry.findAll({
            where,
            include: [{
                model: JournalLine,
                as: 'lines',
                include: [{ model: Account, as: 'account' }]
            }],
            order: [['entry_date', 'ASC']]
        })

        // Aggregate by account
        const accountBalances = {}

        for (const entry of entries) {
            for (const line of entry.lines) {
                const code = line.account.code
                if (!accountBalances[code]) {
                    accountBalances[code] = {
                        code: line.account.code,
                        name_ar: line.account.name_ar,
                        name_en: line.account.name_en,
                        root_type: line.account.root_type,
                        account_type: line.account.account_type,
                        normal_balance: line.account.normal_balance,
                        total_debit: 0,
                        total_credit: 0,
                        balance: 0
                    }
                }

                accountBalances[code].total_debit = Math.round(
                    (accountBalances[code].total_debit + parseFloat(line.debit_amount)) * 100) / 100
                accountBalances[code].total_credit = Math.round(
                    (accountBalances[code].total_credit + parseFloat(line.credit_amount)) * 100) / 100
            }
        }

        // Calculate balances
        let totalDebits = 0
        let totalCredits = 0

        for (const code of Object.keys(accountBalances)) {
            const acc = accountBalances[code]
            if (acc.normal_balance === 'debit') {
                acc.balance = this._round2(acc.total_debit - acc.total_credit)
            } else {
                acc.balance = this._round2(acc.total_credit - acc.total_debit)
            }
            totalDebits = this._round2(totalDebits + acc.total_debit)
            totalCredits = this._round2(totalCredits + acc.total_credit)
        }

        const allAccounts = Object.values(accountBalances).sort((a, b) => a.code.localeCompare(b.code))

        const scopedAccounts = allAccounts.filter((a) => {
            if (accountCode && !(a.code === accountCode || a.code.startsWith(`${accountCode}-`))) return false
            if (accountCodePrefix && !a.code.startsWith(accountCodePrefix)) return false
            return true
        })

        const scopedDebits = this._round2(scopedAccounts.reduce((sum, a) => sum + a.total_debit, 0))
        const scopedCredits = this._round2(scopedAccounts.reduce((sum, a) => sum + a.total_credit, 0))

        const response = {
            accounts: scopedAccounts,
            totals: { totalDebits: scopedDebits, totalCredits: scopedCredits },
            balanced: scopedDebits === scopedCredits,
            globalTotals: { totalDebits, totalCredits },
            globalBalanced: totalDebits === totalCredits,
            filters: {
                periodFrom: periodFrom || null,
                periodTo: periodTo || null,
                companyId: companyId || null,
                branchId: branchId || null,
                sourceType: sourceType || null,
                sourceId: sourceId || null,
                accountCode: accountCode || null,
                accountCodePrefix: accountCodePrefix || null
            },
            generatedAt: new Date().toISOString()
        }

        if (includeHierarchy) {
            response.hierarchy = await this._buildHierarchyReport({
                trialAccounts: scopedAccounts,
                parentCode: hierarchyParentCode || accountCode || null,
                includeZero: includeZeroHierarchy
            })
        }

        return response
    }

    /**
     * Profit & Loss Statement (Income Statement)
     * 
     * Revenue - COGS = Gross Profit
     * Gross Profit - Operating Expenses = Net Income/Loss
     */
    static async getProfitAndLoss({
        periodFrom,
        periodTo,
        companyId,
        branchId,
        sourceType = null,
        sourceId = null,
        accountCode = null,
        accountCodePrefix = null,
        includeHierarchy = false,
        includeZeroHierarchy = false,
        _trialBalance
    } = {}) {
        const trialBalance = _trialBalance || await this.getTrialBalance({
            periodFrom,
            periodTo,
            companyId,
            branchId,
            sourceType,
            sourceId,
            accountCode,
            accountCodePrefix
        })

        // Separate revenue from contra-revenue (Discounts Given 4002 is income type but debit-normal)
        const allIncomeAccounts = trialBalance.accounts.filter(a => a.root_type === 'income')
        const revenueAccounts = allIncomeAccounts.filter(a => a.normal_balance === 'credit')
        const contraRevenueAccounts = allIncomeAccounts.filter(a => a.normal_balance === 'debit')

        const allExpenses = trialBalance.accounts.filter(a => a.root_type === 'expense')

        // Separate COGS from other operating expenses
        const cogsAccounts = allExpenses.filter(a => this._isCodeOrChild(a.code, ACCOUNTS.COGS))
        const operatingExpenses = allExpenses.filter(a => !this._isCodeOrChild(a.code, ACCOUNTS.COGS))

        // Revenue is credit-normal (positive balance = revenue earned)
        const totalRevenue = revenueAccounts.reduce((sum, a) => Math.round((sum + a.balance) * 100) / 100, 0)
        // Contra-revenue is debit-normal (positive balance = revenue reduced)
        const totalContraRevenue = contraRevenueAccounts.reduce((sum, a) => Math.round((sum + a.balance) * 100) / 100, 0)
        // Net income = Revenue - Contra-Revenue
        const totalIncome = Math.round((totalRevenue - totalContraRevenue) * 100) / 100

        const totalCOGS = cogsAccounts.reduce((sum, a) => Math.round((sum + a.balance) * 100) / 100, 0)
        const grossProfit = Math.round((totalIncome - totalCOGS) * 100) / 100
        const totalOperatingExpenses = operatingExpenses.reduce((sum, a) => Math.round((sum + a.balance) * 100) / 100, 0)
        const netIncome = Math.round((grossProfit - totalOperatingExpenses) * 100) / 100
        const grossMargin = totalIncome > 0 ? Math.round((grossProfit / totalIncome) * 10000) / 100 : 0

        const response = {
            period: { from: periodFrom, to: periodTo },
            income: {
                accounts: revenueAccounts,
                contraAccounts: contraRevenueAccounts,
                totalRevenue,
                totalContraRevenue,
                total: totalIncome
            },
            cogs: { accounts: cogsAccounts, total: totalCOGS },
            grossProfit,
            grossMargin, // percentage
            operatingExpenses: { accounts: operatingExpenses, total: totalOperatingExpenses },
            // Keep backward compatibility
            expenses: { accounts: allExpenses, total: totalCOGS + totalOperatingExpenses },
            netIncome,
            profitable: netIncome > 0,
            generatedAt: new Date().toISOString()
        }

        if (includeHierarchy) {
            response.hierarchy = {
                income: await this._buildHierarchyReport({
                    trialAccounts: allIncomeAccounts,
                    accountType: 'income',
                    includeZero: includeZeroHierarchy
                }),
                expenses: await this._buildHierarchyReport({
                    trialAccounts: allExpenses,
                    accountType: 'expense',
                    includeZero: includeZeroHierarchy
                })
            }
        }

        return response
    }

    /**
     * Balance Sheet
     * 
     * Assets = Liabilities + Equity
     */
    static async getBalanceSheet({
        asOfDate,
        companyId,
        branchId,
        sourceType = null,
        sourceId = null,
        accountCode = null,
        accountCodePrefix = null,
        includeHierarchy = false,
        includeZeroHierarchy = false
    } = {}) {
        const periodTo = asOfDate || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
        const trialBalance = await this.getTrialBalance({
            periodTo,
            companyId,
            branchId,
            sourceType,
            sourceId,
            accountCode,
            accountCodePrefix
        })

        const assets = trialBalance.accounts.filter(a => a.root_type === 'asset')
        const liabilities = trialBalance.accounts.filter(a => a.root_type === 'liability')
        const equity = trialBalance.accounts.filter(a => a.root_type === 'equity')

        const totalAssets = assets.reduce((sum, a) => Math.round((sum + a.balance) * 100) / 100, 0)
        const totalLiabilities = liabilities.reduce((sum, a) => Math.round((sum + a.balance) * 100) / 100, 0)
        const totalEquity = equity.reduce((sum, a) => Math.round((sum + a.balance) * 100) / 100, 0)

        // Add retained earnings from P&L — reuse same trial balance to avoid duplicate queries
        const pnl = await this.getProfitAndLoss({
            periodTo,
            companyId,
            branchId,
            sourceType,
            sourceId,
            accountCode,
            accountCodePrefix,
            _trialBalance: trialBalance
        })

        // FIX-14: Professional Retained Earnings breakdown (Prior Years vs Current Year)
        // 1. Determine start of current year
        const year = parseInt(periodTo.split('-')[0])
        const currentYearStart = `${year}-01`

        // 2. Calculate Current Year Net Income
        // We run a sub-P&L for the period from Jan 1st of the current year to periodTo
        const currentYearPnl = await this.getProfitAndLoss({
            periodFrom: currentYearStart,
            periodTo,
            companyId,
            branchId,
            sourceType,
            sourceId,
            accountCode,
            accountCodePrefix
        })
        const currentYearNetIncome = currentYearPnl.netIncome

        // 3. Total Net Income from day 1 (already calculated in 'pnl' variable above)
        const totalLifeToDateNetIncome = pnl.netIncome

        // 4. Prior Years Retained Earnings (Calculated)
        // This is everything before Jan 1st of the current year that hasn't been moved to 3002 yet.
        const priorYearsCalculated = Math.round((totalLifeToDateNetIncome - currentYearNetIncome) * 100) / 100

        // 5. Stored Retained Earnings (Account 3002)
        // Check if account 3002 has a balance from manual/historical entries or prior closings
        const retainedAccounts = trialBalance.accounts.filter(a => this._isCodeOrChild(a.code, ACCOUNTS.RETAINED_EARNINGS))
        const storedRetainedEarnings = retainedAccounts.reduce((sum, a) => Math.round((sum + a.balance) * 100) / 100, 0)

        // Total Equity in BS should be:
        // Other Equity Accounts (like Capital) + Stored RE + Prior Years Calc + Current Year Net Income
        // But wait: totalEquity already includes storedRetainedEarnings!
        // We want to return a breakdown.

        const otherEquityAccounts = equity.filter(a => !this._isCodeOrChild(a.code, ACCOUNTS.RETAINED_EARNINGS))
        const totalOtherEquity = otherEquityAccounts.reduce((sum, a) => Math.round((sum + a.balance) * 100) / 100, 0)

        const totalRetainedEarnings = Math.round((storedRetainedEarnings + priorYearsCalculated + currentYearNetIncome) * 100) / 100

        const response = {
            asOfDate: periodTo,
            assets: { accounts: assets, total: totalAssets },
            liabilities: { accounts: liabilities, total: totalLiabilities },
            equity: {
                accounts: otherEquityAccounts,
                totalOtherEquity,
                // Breakdown for professional reporting
                retainedEarnings: {
                    stored: storedRetainedEarnings,             // From account 3002
                    priorPeriodsCalculated: priorYearsCalculated, // Undistributed income from prior years
                    currentYearNetIncome: currentYearNetIncome,   // Income from current year (since Jan 1)
                    total: totalRetainedEarnings
                },
                total: Math.round((totalOtherEquity + totalRetainedEarnings) * 100) / 100
            },
            totalLiabilitiesAndEquity: Math.round((totalLiabilities + totalOtherEquity + totalRetainedEarnings) * 100) / 100,
            balanced: totalAssets === Math.round((totalLiabilities + totalOtherEquity + totalRetainedEarnings) * 100) / 100,
            generatedAt: new Date().toISOString()
        }

        if (includeHierarchy) {
            response.hierarchy = {
                assets: await this._buildHierarchyReport({
                    trialAccounts: assets,
                    accountType: 'asset',
                    includeZero: includeZeroHierarchy
                }),
                liabilities: await this._buildHierarchyReport({
                    trialAccounts: liabilities,
                    accountType: 'liability',
                    includeZero: includeZeroHierarchy
                }),
                equity: await this._buildHierarchyReport({
                    trialAccounts: equity,
                    accountType: 'equity',
                    includeZero: includeZeroHierarchy
                })
            }
        }

        return response
    }

    /**
     * Cash Flow Statement (simplified — derived from cash account movements)
     */
    static async getCashFlow({ periodFrom, periodTo, branchId, sourceType = null, sourceId = null } = {}) {
        const where = { status: 'posted' }
        if (periodFrom) where.fiscal_period = { ...where.fiscal_period, [Op.gte]: periodFrom }
        if (periodTo) where.fiscal_period = { ...where.fiscal_period, [Op.lte]: periodTo }
        if (branchId) where.branch_id = branchId
        if (sourceType) where.source_type = sourceType
        if (sourceId) where.source_id = sourceId

        // Get cash account family (e.g., 1001 and 1001-xx)
        const cashAccounts = await this._findAccountsByCodeFamily(ACCOUNTS.CASH)
        if (!cashAccounts.length) return { error: 'Cash account family not found' }
        const cashAccountIds = cashAccounts.map(a => a.id)

        // Get all cash-related journal lines
        const lines = await JournalLine.findAll({
            where: { account_id: { [Op.in]: cashAccountIds } },
            include: [{
                model: JournalEntry,
                where,
                include: []
            }],
            order: [[JournalEntry, 'entry_date', 'ASC']]
        })

        // Categorize cash flows
        const flows = {
            operating: { inflows: 0, outflows: 0, items: [] },
            total_inflow: 0,
            total_outflow: 0
        }

        for (const line of lines) {
            const entry = line.JournalEntry
            const debit = parseFloat(line.debit_amount)
            const credit = parseFloat(line.credit_amount)

            if (debit > 0) {
                flows.operating.inflows = Math.round((flows.operating.inflows + debit) * 100) / 100
                flows.total_inflow = Math.round((flows.total_inflow + debit) * 100) / 100
            }
            if (credit > 0) {
                flows.operating.outflows = Math.round((flows.operating.outflows + credit) * 100) / 100
                flows.total_outflow = Math.round((flows.total_outflow + credit) * 100) / 100
            }

            flows.operating.items.push({
                date: entry.entry_date,
                description: entry.description,
                source: entry.source_type,
                inflow: debit,
                outflow: credit,
                net: Math.round((debit - credit) * 100) / 100
            })
        }

        flows.operating.net = Math.round((flows.operating.inflows - flows.operating.outflows) * 100) / 100
        flows.netCashFlow = Math.round((flows.total_inflow - flows.total_outflow) * 100) / 100

        return {
            period: { from: periodFrom, to: periodTo },
            scope: { branchId: branchId || null, sourceType: sourceType || null, sourceId: sourceId || null },
            ...flows,
            generatedAt: new Date().toISOString()
        }
    }

    // ==================== ACCOUNT MANAGEMENT ====================

    /**
     * Get account by code
     */
    static async getAccountByCode(code) {
        return Account.findOne({ where: { code, is_active: true } })
    }

    /**
     * Get full Chart of Accounts
     */
    static async getChartOfAccounts() {
        return Account.findAll({
            where: { is_active: true },
            order: [['code', 'ASC']],
            include: [{ model: Account, as: 'children', where: { is_active: true }, required: false }]
        })
    }

    /**
     * Get account ledger (all journal lines for an account)
     */
    static async getAccountLedger(accountCode, {
        periodFrom = null,
        periodTo = null,
        fromDate = null,
        toDate = null,
        branchId = null,
        companyId = null,
        costCenterId = null,
        sourceType = null,
        sourceId = null,
        page = 1,
        limit = 100,
        includeChildren = false
    } = {}) {
        const normalizePeriodStart = (period) => {
            if (!period || !/^\d{4}-\d{2}$/.test(period)) return null
            return `${period}-01`
        }

        const normalizePeriodEnd = (period) => {
            if (!period || !/^\d{4}-\d{2}$/.test(period)) return null
            const [year, month] = period.split('-').map(Number)
            const lastDay = new Date(Date.UTC(year, month, 0))
            return lastDay.toISOString().split('T')[0]
        }

        const normalizedFrom = this._normalizeDateInput(fromDate) || normalizePeriodStart(periodFrom)
        const normalizedTo = this._normalizeDateInput(toDate) || normalizePeriodEnd(periodTo)
        const safePage = Math.max(parseInt(page, 10) || 1, 1)
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)
        const offset = (safePage - 1) * safeLimit

        // Prefer company-scoped chart when company/branch context is available.
        const preferredCompanyId = companyId || await this._resolveCompanyId({ branchId })
        let account = null

        if (preferredCompanyId) {
            account = await Account.findOne({
                where: { code: accountCode, company_id: preferredCompanyId }
            })
        }

        if (!account) {
            account = await Account.findOne({ where: { code: accountCode, company_id: null } })
        }

        if (!account) {
            account = await Account.findOne({ where: { code: accountCode } })
        }

        if (!account) throw new Error(`Account ${accountCode} not found`)

        // Real ledger behavior: group accounts should always aggregate descendants.
        // Using tree traversal by parent_id is more accurate than code prefix matching.
        const shouldAggregateTree = Boolean(includeChildren || account.is_group)
        let accountIds = [account.id]
        let scopedAccounts = [{
            id: account.id,
            parent_id: account.parent_id,
            is_group: account.is_group,
            code: account.code,
            name_ar: account.name_ar,
            name_en: account.name_en,
            normal_balance: account.normal_balance
        }]
        if (shouldAggregateTree) {
            const companyScopeWhere = account.company_id === null
                ? { company_id: null }
                : { company_id: account.company_id }

            scopedAccounts = await Account.findAll({
                attributes: ['id', 'parent_id', 'is_group', 'code', 'name_ar', 'name_en', 'normal_balance'],
                where: companyScopeWhere,
                raw: true
            })

            const childMap = new Map()
            for (const acc of scopedAccounts) {
                const key = acc.parent_id || '__root__'
                if (!childMap.has(key)) childMap.set(key, [])
                childMap.get(key).push(acc.id)
            }

            const visited = new Set([account.id])
            const queue = [account.id]
            while (queue.length > 0) {
                const current = queue.shift()
                const children = childMap.get(current) || []
                for (const childId of children) {
                    if (visited.has(childId)) continue
                    visited.add(childId)
                    queue.push(childId)
                }
            }

            accountIds = Array.from(visited)
        }

        const baseEntryWhere = { status: 'posted' }
        if (branchId) baseEntryWhere.branch_id = branchId
        if (companyId) baseEntryWhere.company_id = companyId
        if (sourceType) baseEntryWhere.source_type = sourceType
        if (sourceId) baseEntryWhere.source_id = sourceId

        const periodEntryWhere = { ...baseEntryWhere }
        if (normalizedFrom || normalizedTo) {
            periodEntryWhere.entry_date = {}
            if (normalizedFrom) periodEntryWhere.entry_date[Op.gte] = normalizedFrom
            if (normalizedTo) periodEntryWhere.entry_date[Op.lte] = normalizedTo
        }

        const lineWhere = {
            account_id: accountIds.length === 1 ? accountIds[0] : { [Op.in]: accountIds }
        }
        if (costCenterId) lineWhere.cost_center_id = costCenterId

        const totalRows = await JournalLine.count({
            where: lineWhere,
            include: [{
                model: JournalEntry,
                where: periodEntryWhere,
                attributes: []
            }]
        })

        const periodTotalsRow = await JournalLine.findOne({
            attributes: [
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('debit_amount')), 0), 'period_debit'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('credit_amount')), 0), 'period_credit']
            ],
            where: lineWhere,
            include: [{
                model: JournalEntry,
                where: periodEntryWhere,
                attributes: []
            }],
            raw: true
        })

        const periodDebit = this._round2(parseFloat(periodTotalsRow?.period_debit || 0))
        const periodCredit = this._round2(parseFloat(periodTotalsRow?.period_credit || 0))
        const periodNetChange = account.normal_balance === 'debit'
            ? this._round2(periodDebit - periodCredit)
            : this._round2(periodCredit - periodDebit)

        let openingBalance = 0
        let openingEntryWhere = null
        if (normalizedFrom) {
            openingEntryWhere = {
                ...baseEntryWhere,
                entry_date: { [Op.lt]: normalizedFrom }
            }

            const openingTotalsRow = await JournalLine.findOne({
                attributes: [
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('debit_amount')), 0), 'opening_debit'],
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('credit_amount')), 0), 'opening_credit']
                ],
                where: lineWhere,
                include: [{
                    model: JournalEntry,
                    where: openingEntryWhere,
                    attributes: []
                }],
                raw: true
            })

            const openingDebit = this._round2(parseFloat(openingTotalsRow?.opening_debit || 0))
            const openingCredit = this._round2(parseFloat(openingTotalsRow?.opening_credit || 0))
            openingBalance = account.normal_balance === 'debit'
                ? this._round2(openingDebit - openingCredit)
                : this._round2(openingCredit - openingDebit)
        }

        let groupSummary = []
        if (shouldAggregateTree && accountIds.length > 1) {
            const accountById = new Map(scopedAccounts.map((acc) => [acc.id, acc]))
            const postingAccounts = accountIds
                .map((id) => accountById.get(id))
                .filter((acc) => acc && !acc.is_group)

            const postingIds = postingAccounts.map((acc) => acc.id)
            if (postingIds.length > 0) {
                const periodSummaryWhere = {
                    ...lineWhere,
                    account_id: { [Op.in]: postingIds }
                }

                const periodSummaryRows = await JournalLine.findAll({
                    attributes: [
                        'account_id',
                        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('debit_amount')), 0), 'period_debit'],
                        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('credit_amount')), 0), 'period_credit']
                    ],
                    where: periodSummaryWhere,
                    include: [{
                        model: JournalEntry,
                        where: periodEntryWhere,
                        attributes: []
                    }],
                    group: ['account_id'],
                    raw: true
                })

                const openingSummaryRows = openingEntryWhere
                    ? await JournalLine.findAll({
                        attributes: [
                            'account_id',
                            [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('debit_amount')), 0), 'opening_debit'],
                            [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('credit_amount')), 0), 'opening_credit']
                        ],
                        where: periodSummaryWhere,
                        include: [{
                            model: JournalEntry,
                            where: openingEntryWhere,
                            attributes: []
                        }],
                        group: ['account_id'],
                        raw: true
                    })
                    : []

                const periodMap = new Map(periodSummaryRows.map((row) => [row.account_id, row]))
                const openingMap = new Map(openingSummaryRows.map((row) => [row.account_id, row]))

                groupSummary = postingAccounts
                    .map((acc) => {
                        const periodRow = periodMap.get(acc.id)
                        const openingRow = openingMap.get(acc.id)

                        const periodDebitAcc = this._round2(parseFloat(periodRow?.period_debit || 0))
                        const periodCreditAcc = this._round2(parseFloat(periodRow?.period_credit || 0))
                        const openingDebitAcc = this._round2(parseFloat(openingRow?.opening_debit || 0))
                        const openingCreditAcc = this._round2(parseFloat(openingRow?.opening_credit || 0))

                        const openingAcc = acc.normal_balance === 'debit'
                            ? this._round2(openingDebitAcc - openingCreditAcc)
                            : this._round2(openingCreditAcc - openingDebitAcc)

                        const periodNetAcc = acc.normal_balance === 'debit'
                            ? this._round2(periodDebitAcc - periodCreditAcc)
                            : this._round2(periodCreditAcc - periodDebitAcc)

                        const closingAcc = this._round2(openingAcc + periodNetAcc)

                        return {
                            account_id: acc.id,
                            code: acc.code,
                            name_ar: acc.name_ar,
                            name_en: acc.name_en,
                            opening_balance: openingAcc,
                            period_debit: periodDebitAcc,
                            period_credit: periodCreditAcc,
                            closing_balance: closingAcc
                        }
                    })
                    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
            }
        }

        let prePageBalance = openingBalance
        if (offset > 0) {
            const priorLines = await JournalLine.findAll({
                where: lineWhere,
                include: [{
                    model: JournalEntry,
                    where: periodEntryWhere,
                    attributes: ['entry_date']
                }],
                attributes: ['debit_amount', 'credit_amount', 'line_number', 'id'],
                order: [[JournalEntry, 'entry_date', 'ASC'], ['line_number', 'ASC'], ['id', 'ASC']],
                limit: offset
            })

            for (const line of priorLines) {
                const debit = parseFloat(line.debit_amount || 0)
                const credit = parseFloat(line.credit_amount || 0)
                if (account.normal_balance === 'debit') {
                    prePageBalance = this._round2(prePageBalance + debit - credit)
                } else {
                    prePageBalance = this._round2(prePageBalance + credit - debit)
                }
            }
        }

        const lines = await JournalLine.findAll({
            where: lineWhere,
            include: [
                {
                    model: JournalEntry,
                    where: periodEntryWhere,
                    attributes: ['id', 'entry_number', 'entry_date', 'description', 'source_type', 'source_id', 'fiscal_period', 'branch_id']
                },
                {
                    model: Account,
                    as: 'account',
                    attributes: ['id', 'code', 'name_ar', 'name_en']
                }
            ],
            order: [[JournalEntry, 'entry_date', 'ASC'], ['line_number', 'ASC'], ['id', 'ASC']],
            limit: safeLimit,
            offset
        })

        let runningBalance = prePageBalance
        const ledgerEntries = lines.map(line => {
            const debit = this._round2(parseFloat(line.debit_amount || 0))
            const credit = this._round2(parseFloat(line.credit_amount || 0))

            if (account.normal_balance === 'debit') {
                runningBalance = this._round2(runningBalance + debit - credit)
            } else {
                runningBalance = this._round2(runningBalance + credit - debit)
            }

            return {
                id: line.id,
                date: line.JournalEntry?.entry_date || null,
                entry_number: line.JournalEntry?.entry_number || null,
                journal_entry_id: line.JournalEntry?.id || null,
                description: line.description || line.JournalEntry?.description || null,
                source: line.JournalEntry?.source_type || null,
                source_id: line.JournalEntry?.source_id || null,
                fiscal_period: line.JournalEntry?.fiscal_period || null,
                branch_id: line.JournalEntry?.branch_id || null,
                line_number: line.line_number,
                account: line.account ? {
                    id: line.account.id,
                    code: line.account.code,
                    name_ar: line.account.name_ar,
                    name_en: line.account.name_en
                } : null,
                debit,
                credit,
                balance: runningBalance
            }
        })

        const closingBalance = this._round2(openingBalance + periodNetChange)
        const totalPages = Math.max(Math.ceil(totalRows / safeLimit), 1)

        return {
            account: {
                id: account.id,
                code: account.code,
                name_ar: account.name_ar,
                name_en: account.name_en,
                normal_balance: account.normal_balance,
                is_group: account.is_group
            },
            filters: {
                periodFrom,
                periodTo,
                from_date: normalizedFrom,
                to_date: normalizedTo,
                branch_id: branchId || null,
                company_id: companyId || null,
                cost_center_id: costCenterId || null,
                source_type: sourceType || null,
                source_id: sourceId || null,
                include_children: shouldAggregateTree
            },
            opening_balance: openingBalance,
            period_debit: periodDebit,
            period_credit: periodCredit,
            period_net_change: periodNetChange,
            closing_balance: closingBalance,
            entries_count: totalRows,
            group_summary: groupSummary,
            pagination: {
                page: safePage,
                limit: safeLimit,
                total: totalRows,
                total_pages: totalPages,
                has_next: safePage < totalPages,
                has_prev: safePage > 1
            },
            entries: ledgerEntries,
            // Backward compatibility
            closingBalance
        }
    }

    // ==================== PERIOD MANAGEMENT ====================

    /**
     * Lock a fiscal period
     */
    static async lockPeriod(period, { userId, permanent = false, companyId = null } = {}) {
        const resolvedCompanyId = await this._resolveCompanyId({ companyId })
        const [fp, created] = await FiscalPeriod.findOrCreate({
            where: {
                period,
                ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {})
            },
            defaults: {
                status: permanent ? 'locked' : 'closed',
                closed_by: userId,
                closed_at: new Date(),
                company_id: resolvedCompanyId
            }
        })

        if (!created) {
            if (fp.status === 'locked') {
                throw new Error(`Period ${period} is permanently locked and cannot be modified`)
            }
            await fp.update({
                status: permanent ? 'locked' : 'closed',
                closed_by: userId,
                closed_at: new Date()
            })
        }

        // Take trial balance snapshot
        const snapshot = await this.getTrialBalance({ periodTo: period, companyId: resolvedCompanyId })
        await fp.update({ closing_balance_snapshot: snapshot })

        await GLAuditService.log({
            eventType: 'period_closed',
            fiscalPeriod: period,
            createdBy: userId,
            payload: {
                permanent,
                created,
                status: fp.status,
                balanced: snapshot?.balanced ?? null,
                total_debits: snapshot?.totals?.totalDebits ?? null,
                total_credits: snapshot?.totals?.totalCredits ?? null
            }
        })

        logger.info(`Fiscal period ${period} ${permanent ? 'permanently locked' : 'closed'}`)
        return fp
    }

    /**
     * Reopen a fiscal period (admin only, not if permanently locked)
     */
    static async reopenPeriod(period, { userId, companyId = null } = {}) {
        const resolvedCompanyId = await this._resolveCompanyId({ companyId })
        const fp = await FiscalPeriod.findOne({
            where: {
                period,
                ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {})
            }
        })
        if (!fp) throw new Error(`Period ${period} not found`)
        if (fp.status === 'locked') throw new Error(`Period ${period} is permanently locked`)

        const previousStatus = fp.status

        await fp.update({
            status: 'open',
            reopened_by: userId,
            reopened_at: new Date()
        })

        await GLAuditService.log({
            eventType: 'period_reopened',
            fiscalPeriod: period,
            createdBy: userId,
            payload: {
                previous_status: previousStatus
            }
        })

        logger.info(`Fiscal period ${period} reopened by ${userId}`)
        return fp
    }

    /**
     * Perform automated year-end close.
     *
     * Steps:
     * 1) Build closing entry for all income/expense accounts of the fiscal year.
     * 2) Push net result into retained earnings.
     * 3) Optionally lock all 12 fiscal periods of that year.
     */
    static async performYearEndClose({
        fiscalYear,
        userId,
        branchId = null,
        lockAllPeriods = true,
        permanentLock = true,
        notes = null
    } = {}) {
        const year = String(fiscalYear || '').trim()
        if (!/^\d{4}$/.test(year)) {
            throw new Error('ACCOUNTING_ERROR: fiscalYear must be in YYYY format')
        }

        const sourceId = `${year}:${branchId || 'all'}`
        const periodFrom = `${year}-01`
        const periodTo = `${year}-12`
        const entryDate = `${year}-12-31`

        const transaction = await sequelize.transaction()

        try {
            const existingClose = await JournalEntry.findOne({
                where: {
                    source_type: 'year_end_close',
                    source_id: sourceId,
                    status: { [Op.ne]: 'draft' }
                },
                transaction
            })

            if (existingClose) {
                throw new Error(
                    `ACCOUNTING_ERROR: Year-end close already exists for ${sourceId} ` +
                    `(entry ${existingClose.entry_number})`
                )
            }

            const trialBalance = await this.getTrialBalance({ periodFrom, periodTo, branchId })
            const closingAccounts = trialBalance.accounts.filter(acc =>
                ['income', 'expense'].includes(acc.root_type) &&
                Math.abs(parseFloat(acc.balance || 0)) > 0.009
            )

            const lines = []
            let totalDebit = 0
            let totalCredit = 0

            for (const acc of closingAccounts) {
                const rawBalance = Math.round(parseFloat(acc.balance || 0) * 100) / 100
                if (Math.abs(rawBalance) <= 0.009) continue

                const absBalance = Math.round(Math.abs(rawBalance) * 100) / 100
                const normal = acc.normal_balance
                const isPositive = rawBalance > 0

                // Standard close:
                // - Credit-normal accounts: debit to close positive balance.
                // - Debit-normal accounts: credit to close positive balance.
                // For negative balances, invert the direction.
                let debit = 0
                let credit = 0

                if (normal === 'credit') {
                    debit = isPositive ? absBalance : 0
                    credit = isPositive ? 0 : absBalance
                } else {
                    debit = isPositive ? 0 : absBalance
                    credit = isPositive ? absBalance : 0
                }

                lines.push({
                    accountCode: acc.code,
                    debit,
                    credit,
                    description: `Year-end close ${acc.code} (${year})`
                })

                totalDebit = Math.round((totalDebit + debit) * 100) / 100
                totalCredit = Math.round((totalCredit + credit) * 100) / 100
            }

            const diff = Math.round((totalDebit - totalCredit) * 100) / 100

            let closeEntry = null
            if (lines.length > 0 && Math.abs(diff) > 0.009) {
                const retainedEarningsCode = await AccountResolver.resolve(
                    ACCOUNT_KEYS.RETAINED_EARNINGS,
                    { branchId }
                )

                // Balance into retained earnings.
                if (diff > 0) {
                    lines.push({
                        accountCode: retainedEarningsCode,
                        debit: 0,
                        credit: diff,
                        description: `Transfer to retained earnings (${year})`
                    })
                } else {
                    lines.push({
                        accountCode: retainedEarningsCode,
                        debit: Math.abs(diff),
                        credit: 0,
                        description: `Transfer loss to retained earnings (${year})`
                    })
                }

                closeEntry = await this.createJournalEntry({
                    description: `Year-end close ${year}`,
                    sourceType: 'year_end_close',
                    sourceId,
                    lines,
                    entryDate,
                    branchId,
                    createdBy: userId,
                    notes: notes || `Automated year-end close for ${year}`,
                    transaction
                })
            }

            const pnl = await this.getProfitAndLoss({ periodFrom, periodTo, branchId })

            await GLAuditService.log({
                eventType: 'year_end_closed',
                journalEntryId: closeEntry?.id || null,
                entryNumber: closeEntry?.entry_number || null,
                sourceType: 'year_end_close',
                sourceId,
                fiscalPeriod: periodTo,
                branchId,
                createdBy: userId,
                payload: {
                    fiscal_year: year,
                    lock_all_periods: lockAllPeriods,
                    permanent_lock: permanentLock,
                    net_income: pnl.netIncome,
                    closing_accounts_count: closingAccounts.length,
                    closing_lines_count: lines.length
                }
            }, { transaction })

            await transaction.commit()

            const lockedPeriods = []
            const lockErrors = []

            if (lockAllPeriods) {
                for (let month = 1; month <= 12; month++) {
                    const p = `${year}-${String(month).padStart(2, '0')}`
                    try {
                        await this.lockPeriod(p, { userId, permanent: permanentLock })
                        lockedPeriods.push(p)
                    } catch (err) {
                        lockErrors.push({ period: p, error: err.message })
                    }
                }
            }

            return {
                fiscalYear: year,
                sourceId,
                journalEntry: closeEntry ? {
                    id: closeEntry.id,
                    entry_number: closeEntry.entry_number
                } : null,
                netIncome: pnl.netIncome,
                closedAccounts: closingAccounts.length,
                lockAllPeriods,
                permanentLock,
                lockedPeriods,
                lockErrors
            }
        } catch (error) {
            await transaction.rollback()
            throw error
        }
    }

    // ==================== INTERNAL HELPERS ====================

    /**
     * Resolve company_id for posting.
     * Priority:
     * 1) explicit companyId
     * 2) company of branchId
     * 3) first active company
     */
    static async _resolveCompanyId({ companyId = null, branchId = null, transaction = null } = {}) {
        if (companyId) return companyId

        const { Branch, Company } = require('../models')

        if (branchId) {
            const branch = await Branch.findByPk(branchId, {
                attributes: ['company_id'],
                ...(transaction ? { transaction } : {})
            })
            if (branch?.company_id) return branch.company_id
        }

        const defaultCompany = await Company.findOne({
            where: { is_active: true },
            attributes: ['id'],
            order: [['created_at', 'ASC']],
            ...(transaction ? { transaction } : {})
        })

        return defaultCompany?.id || null
    }

    /**
     * Resolve branch_id from warehouse_id.
     */
    static async _resolveBranchIdFromWarehouse(warehouseId, { transaction = null } = {}) {
        if (!warehouseId) return null
        const { Warehouse } = require('../models')
        const warehouse = await Warehouse.findByPk(
            warehouseId,
            {
                attributes: ['id', 'branch_id'],
                ...(transaction ? { transaction } : {})
            }
        )
        return warehouse?.branch_id || null
    }

    /**
     * Resolve branch_id from purchase_order_id using PO warehouse.
     */
    static async _resolveBranchIdFromPurchaseOrder(purchaseOrderId, { transaction = null } = {}) {
        if (!purchaseOrderId) return null
        const { PurchaseOrder } = require('../models')
        const po = await PurchaseOrder.findByPk(
            purchaseOrderId,
            {
                attributes: ['id', 'warehouse_id'],
                ...(transaction ? { transaction } : {})
            }
        )
        if (!po?.warehouse_id) return null
        return this._resolveBranchIdFromWarehouse(po.warehouse_id, { transaction })
    }

    /**
     * Generate sequential entry number: JE-2026-00001
     */
    static async _generateEntryNumber(date, transaction) {
        const year = date.getFullYear()
        const prefix = `JE-${year}-`

        const lastEntry = await JournalEntry.findOne({
            where: {
                entry_number: { [Op.like]: `${prefix}%` }
            },
            order: [['entry_number', 'DESC']],
            transaction
        })

        let seq = 1
        if (lastEntry) {
            const lastSeq = parseInt(lastEntry.entry_number.replace(prefix, ''))
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }

        return `${prefix}${String(seq).padStart(6, '0')}`
    }

    /**
     * Update account running balance
     */
    static async _updateAccountBalance(account, debit, credit, transaction) {
        let balanceChange = 0

        if (account.normal_balance === 'debit') {
            // Debit increases, credit decreases
            balanceChange = debit - credit
        } else {
            // Credit increases, debit decreases
            balanceChange = credit - debit
        }

        const newBalance = Math.round(
            (parseFloat(account.current_balance) + balanceChange) * 100
        ) / 100

        await account.update({ current_balance: newBalance }, { transaction })
    }
}

// Export both the service and account code constants
module.exports = AccountingService
module.exports.ACCOUNTS = ACCOUNTS

