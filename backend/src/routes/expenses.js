/**
 * Expense Routes - /api/expenses
 *
 * Operational expense tracking with GL integration.
 * Every approved expense creates a journal entry:
 *   DR Expense account
 *   CR Cash/Bank account
 */

const express = require('express')
const router = express.Router()
const { body, param, query, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const { AuditLog } = require('../models')
const { Op } = require('sequelize')
const AccountingService = require('../services/accountingService')
const { AccountResolver, ACCOUNT_KEYS } = require('../services/accountResolver')
const logger = require('../services/logger')

const EXPENSE_CATEGORIES = {
    rent: { name_ar: 'إيجار', name_en: 'Rent', accountKey: ACCOUNT_KEYS.RENT_EXPENSE },
    utilities: { name_ar: 'خدمات (كهرباء/ماء)', name_en: 'Utilities', accountKey: ACCOUNT_KEYS.UTILITIES_EXPENSE },
    salaries: { name_ar: 'رواتب', name_en: 'Salaries', accountKey: ACCOUNT_KEYS.SALARIES_EXPENSE },
    maintenance: { name_ar: 'صيانة', name_en: 'Maintenance', accountKey: ACCOUNT_KEYS.MAINTENANCE_EXPENSE },
    marketing: { name_ar: 'تسويق وإعلان', name_en: 'Marketing', accountKey: ACCOUNT_KEYS.MARKETING_EXPENSE },
    supplies: { name_ar: 'مستلزمات', name_en: 'Office Supplies', accountKey: ACCOUNT_KEYS.GENERAL_EXPENSE },
    transport: { name_ar: 'نقل ومواصلات', name_en: 'Transportation', accountKey: ACCOUNT_KEYS.GENERAL_EXPENSE },
    insurance: { name_ar: 'تأمين', name_en: 'Insurance', accountKey: ACCOUNT_KEYS.GENERAL_EXPENSE },
    cleaning: { name_ar: 'نظافة', name_en: 'Cleaning', accountKey: ACCOUNT_KEYS.GENERAL_EXPENSE },
    taxes: { name_ar: 'ضرائب ورسوم', name_en: 'Taxes & Fees', accountKey: ACCOUNT_KEYS.GENERAL_EXPENSE },
    other: { name_ar: 'أخرى', name_en: 'Other', accountKey: ACCOUNT_KEYS.GENERAL_EXPENSE }
}

const PAYMENT_METHODS = {
    cash: 'نقدي',
    bank_transfer: 'تحويل بنكي',
    check: 'شيك',
    card: 'بطاقة'
}

const PAYMENT_METHOD_ACCOUNT_KEY = {
    cash: ACCOUNT_KEYS.CASH,
    bank_transfer: ACCOUNT_KEYS.BANK,
    check: ACCOUNT_KEYS.BANK,
    card: ACCOUNT_KEYS.BANK
}

function parseMetadata(notes) {
    try {
        const parsed = JSON.parse(notes || '{}')
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (_) {
        return {}
    }
}

function maybeDecodeMojibake(value) {
    if (typeof value !== 'string' || !value) return value
    if (!/[ØÃÂï¿½]/.test(value)) return value

    try {
        const decoded = Buffer.from(value, 'latin1').toString('utf8')
        const decodedArabic = (decoded.match(/[\u0600-\u06FF]/g) || []).length
        const sourceArabic = (value.match(/[\u0600-\u06FF]/g) || []).length
        const decodedMojibake = (decoded.match(/[ØÃÂï¿½]/g) || []).length
        const sourceMojibake = (value.match(/[ØÃÂï¿½]/g) || []).length

        if ((decodedArabic > sourceArabic) || (decodedMojibake < sourceMojibake)) {
            return decoded
        }
    } catch (_) {
        // ignore
    }

    return value
}

function normalizeExpenseDescription(entryDescription, metadata = {}) {
    const fromMetadata = maybeDecodeMojibake(metadata.raw_description || '').trim()
    if (fromMetadata) return fromMetadata

    let desc = maybeDecodeMojibake(entryDescription || '')
    desc = String(desc).trim()
    if (!desc) return ''

    // Remove standard prefixes for expense journal descriptions
    desc = desc.replace(/^(مصروف|expense)\s*[:：\-]\s*/i, '')

    // Remove legacy mojibake prefix if present and we still have a delimiter
    if (/[ØÃÂï¿½]/.test(desc) && desc.includes(':')) {
        const afterColon = desc.split(':').slice(1).join(':').trim()
        if (afterColon) return maybeDecodeMojibake(afterColon)
    }

    return desc
}

function getPaymentAccountKey(paymentMethod) {
    return PAYMENT_METHOD_ACCOUNT_KEY[paymentMethod] || ACCOUNT_KEYS.BANK
}

const ACCOUNT_KEY_AR_LABELS = {
    default_cash_account: 'حساب النقدية الافتراضي',
    default_bank_account: 'حساب البنك الافتراضي',
    default_general_expense_account: 'حساب المصروفات العامة الافتراضي',
    default_rent_expense_account: 'حساب مصروف الإيجار الافتراضي',
    default_utilities_expense_account: 'حساب مصروف الخدمات الافتراضي',
    default_salaries_expense_account: 'حساب مصروف الرواتب الافتراضي',
    default_marketing_expense_account: 'حساب مصروف التسويق الافتراضي',
    default_maintenance_expense_account: 'حساب مصروف الصيانة الافتراضي',
    default_admin_expense_account: 'حساب المصروفات الإدارية الافتراضي'
}

function normalizeExpenseErrorForUser(error, fallbackMessage) {
    const rawMessage = String(error?.message || '').trim()
    if (!rawMessage) return fallbackMessage

    if (rawMessage.startsWith('ACCOUNTING_ERROR:')) {
        return rawMessage.replace(/^ACCOUNTING_ERROR:\s*/i, '').trim() || fallbackMessage
    }

    if (rawMessage.startsWith('ACCOUNTING_CONFIG_ERROR')) {
        const keyMatch = rawMessage.match(/No account mapped for key "([^"]+)"/i)
        if (keyMatch?.[1]) {
            const key = keyMatch[1]
            const keyLabel = ACCOUNT_KEY_AR_LABELS[key] || `الحساب الافتراضي (${key})`
            return `الإعدادات المحاسبية غير مكتملة: لم يتم ربط ${keyLabel}. يرجى فتح "إعدادات الحسابات الافتراضية" وربط هذا المفتاح بحساب ترحيل نشط.`
        }

        if (/Account code \"([^\"]+)\" not found/i.test(rawMessage)) {
            const code = rawMessage.match(/Account code \"([^\"]+)\" not found/i)?.[1]
            return `الإعدادات المحاسبية غير صحيحة: كود الحساب ${code || ''} غير موجود في دليل الحسابات.`.trim()
        }

        if (/No payment account mapped for sale fallback/i.test(rawMessage)) {
            return 'الإعدادات المحاسبية غير مكتملة: لا يوجد حساب سداد افتراضي مرتبط. يرجى ربط حساب نقدي أو بنكي من إعدادات الحسابات الافتراضية.'
        }

        return 'الإعدادات المحاسبية غير مكتملة. يرجى مراجعة صفحة "إعدادات الحسابات الافتراضية" وربط الحسابات المطلوبة.'
    }

    return rawMessage
}

async function getPaymentPostingAccountsForMethod({ paymentMethod, branchId = null }) {
    const { Account } = require('../models')
    const accountKey = getPaymentAccountKey(paymentMethod)
    const defaultAccountCode = await AccountResolver.resolve(accountKey, { branchId })
    const normalizeId = (value) => (value === null || value === undefined ? null : String(value))
    const isTrueFlag = (value) => {
        if (value === true || value === 1) return true
        if (Buffer.isBuffer(value)) return value.length > 0 && value[0] === 1
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()
            return normalized === '1' || normalized === 'true' || normalized === '\u0001'
        }
        return false
    }
    const isPostingAccount = (account) => {
        // If is_active wasn't selected by mistake, trust the SQL where clause (is_active=true).
        const isActive = typeof account?.is_active === 'undefined'
            ? true
            : isTrueFlag(account?.is_active)
        return isActive && !isTrueFlag(account?.is_group)
    }

    const accounts = await Account.findAll({
        where: { is_active: true },
        attributes: ['id', 'code', 'name_ar', 'name_en', 'parent_id', 'is_group', 'is_active', 'root_type', 'account_type'],
        raw: true
    })

    const normalizedAccounts = accounts.map(acc => ({
        ...acc,
        id: normalizeId(acc.id),
        parent_id: normalizeId(acc.parent_id),
        code: String(acc.code || '').trim()
    }))

    const accountById = new Map(normalizedAccounts.map(acc => [acc.id, acc]))
    const baseAccount = normalizedAccounts.find(acc => acc.code === defaultAccountCode)

    if (!baseAccount) {
        throw new Error(`ACCOUNTING_ERROR: الحساب الافتراضي (${defaultAccountCode}) غير موجود في شجرة الحسابات`)
    }

    const expectedPrefix = accountKey === ACCOUNT_KEYS.CASH ? '1001' : '1002'
    const expectedTypePattern = accountKey === ACCOUNT_KEYS.CASH
        ? /(cash|drawer|petty|نقد|صندوق)/i
        : /(bank|check|cheque|card|بنك|شيك|بطاق)/i

    const matchesPaymentFamily = (account) => {
        const code = String(account?.code || '')
        if (code.startsWith(expectedPrefix)) return true
        const searchable = `${account?.account_type || ''} ${account?.name_ar || ''} ${account?.name_en || ''}`
        return expectedTypePattern.test(searchable)
    }

    // Scope to the nearest logical group (parent of posting account), not the top root (1000).
    let rootAccount = baseAccount
    if (!isTrueFlag(baseAccount.is_group) && baseAccount.parent_id) {
        const parent = accountById.get(baseAccount.parent_id)
        if (parent) rootAccount = parent
    }

    const childrenByParent = new Map()
    for (const account of normalizedAccounts) {
        if (!account.parent_id) continue
        if (!childrenByParent.has(account.parent_id)) childrenByParent.set(account.parent_id, [])
        childrenByParent.get(account.parent_id).push(account)
    }

    const treeIds = new Set()
    const stack = [rootAccount.id]
    while (stack.length > 0) {
        const currentId = stack.pop()
        if (treeIds.has(currentId)) continue
        treeIds.add(currentId)
        const children = childrenByParent.get(currentId) || []
        for (const child of children) stack.push(child.id)
    }

    const postingAccounts = normalizedAccounts
        .filter(account => treeIds.has(account.id) && isPostingAccount(account))
        .sort((a, b) => a.code.localeCompare(b.code))

    // Prefer accounts matching the selected payment family (cash/bank).
    let finalAccounts = postingAccounts.filter(matchesPaymentFamily)

    // If scoped subtree has no family hints, use subtree posting accounts as-is.
    if (finalAccounts.length === 0 && postingAccounts.length > 0) {
        finalAccounts = postingAccounts
    }

    // Fallback for legacy/flat COA where parent-child links may be incomplete.
    // We fallback to a safe code-family search across all active posting accounts.
    if (finalAccounts.length === 0) {
        finalAccounts = normalizedAccounts
            .filter(account => {
                if (!isPostingAccount(account)) return false
                return matchesPaymentFamily(account)
            })
            .sort((a, b) => a.code.localeCompare(b.code))

        // Secondary fallback: use the default family root (1001/1002) if available.
        if (finalAccounts.length === 0) {
            const defaultRootCode = String(defaultAccountCode || '').split('-')[0]

            finalAccounts = normalizedAccounts
                .filter(account => (
                    isPostingAccount(account) &&
                    defaultRootCode &&
                    String(account.code || '').startsWith(defaultRootCode)
                ))
                .sort((a, b) => a.code.localeCompare(b.code))
        }
    }

    // Last fallback: use the resolved default if it is already posting and active.
    if (finalAccounts.length === 0 && baseAccount && isPostingAccount(baseAccount)) {
        finalAccounts = [baseAccount]
    }

    if (finalAccounts.length === 0) {
        throw new Error(
            `ACCOUNTING_ERROR: لا توجد حسابات فرعية صالحة للترحيل تحت الحساب ${rootAccount.code}. ` +
            `يرجى ربط الحساب الافتراضي على حساب فرعي أو إنشاء حسابات فرعية مناسبة.`
        )
    }

    return {
        accountKey,
        defaultAccountCode,
        rootAccountCode: rootAccount.code,
        accounts: finalAccounts
    }
}

router.get('/', authenticate, authorize('admin', 'manager', 'supervisor'), async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            status,
            payment_method,
            from_date,
            to_date
        } = req.query

        const { JournalEntry, JournalLine, Account } = require('../models')

        const where = { source_type: 'expense' }
        if (from_date || to_date) {
            where.entry_date = {}
            if (from_date) where.entry_date[Op.gte] = from_date
            if (to_date) where.entry_date[Op.lte] = to_date
        }
        if (status) where.status = status

        const pageNum = parseInt(page, 10) || 1
        const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 20, 200))

        const { count, rows } = await JournalEntry.findAndCountAll({
            where,
            include: [{
                model: JournalLine,
                as: 'lines',
                include: [{ model: Account, as: 'account', attributes: ['code', 'name_ar', 'name_en'] }]
            }],
            order: [['entry_date', 'DESC'], ['entry_number', 'DESC']],
            limit: limitNum,
            offset: (pageNum - 1) * limitNum
        })

        let expenses = rows.map(entry => {
            const metadata = parseMetadata(entry.notes)
            const categoryKey = metadata.category || 'other'
            const description = normalizeExpenseDescription(entry.description, metadata)

            return {
                id: entry.id,
                entry_number: entry.entry_number,
                date: entry.entry_date,
                description,
                amount: parseFloat(entry.total_amount || 0),
                category: categoryKey,
                category_name: EXPENSE_CATEGORIES[categoryKey]?.name_ar || 'أخرى',
                payment_method: metadata.payment_method || 'cash',
                payment_account_code: metadata.payment_account_code || null,
                vendor: maybeDecodeMojibake(metadata.vendor || null),
                receipt_number: metadata.receipt_number || null,
                status: entry.status,
                created_by: entry.created_by,
                lines: entry.lines,
                created_at: entry.createdAt
            }
        })

        if (category) {
            expenses = expenses.filter(e => e.category === category)
        }
        if (payment_method) {
            expenses = expenses.filter(e => e.payment_method === payment_method)
        }

        res.json({
            success: true,
            data: expenses,
            categories: EXPENSE_CATEGORIES,
            payment_methods: PAYMENT_METHODS,
            pagination: {
                total: count,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(count / limitNum)
            }
        })
    } catch (error) {
        console.error('List expenses error:', error)
        res.status(500).json({ success: false, message: 'خطأ في جلب المصروفات' })
    }
})

router.get('/categories', authenticate, async (_req, res) => {
    res.json({
        success: true,
        data: Object.entries(EXPENSE_CATEGORIES).map(([value, meta]) => ({ value, ...meta }))
    })
})

router.get('/payment-accounts',
    authenticate,
    authorize('admin', 'manager', 'supervisor'),
    query('payment_method').isIn(Object.keys(PAYMENT_METHODS)).withMessage('طريقة الدفع غير صالحة'),
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, errors: errors.array() })
            }

            const paymentMethod = String(req.query.payment_method || '').trim()
            const branchId = req.user.branchId || null
            const options = await getPaymentPostingAccountsForMethod({
                paymentMethod,
                branchId
            })

            res.json({
                success: true,
                payment_method: paymentMethod,
                payment_method_label: PAYMENT_METHODS[paymentMethod] || paymentMethod,
                account_key: options.accountKey,
                root_account_code: options.rootAccountCode,
                default_account_code: options.defaultAccountCode,
                data: options.accounts
            })
        } catch (error) {
            console.error('Get expense payment accounts error:', error)
            const rawMessage = String(error?.message || '')
            const isAccountingError = rawMessage.startsWith('ACCOUNTING_ERROR') || rawMessage.startsWith('ACCOUNTING_CONFIG_ERROR')
            const status = isAccountingError ? 400 : 500
            res.status(status).json({
                success: false,
                message: normalizeExpenseErrorForUser(error, 'تعذر جلب حسابات السداد')
            })
        }
    }
)

router.get('/summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { from_date, to_date } = req.query
        const { JournalEntry } = require('../models')

        const where = { source_type: 'expense', status: 'posted' }
        if (from_date || to_date) {
            where.entry_date = {}
            if (from_date) where.entry_date[Op.gte] = from_date
            if (to_date) where.entry_date[Op.lte] = to_date
        }

        const entries = await JournalEntry.findAll({ where })

        let totalAmount = 0
        const byCategory = {}

        for (const entry of entries) {
            const amount = parseFloat(entry.total_amount || 0)
            totalAmount += amount

            const metadata = parseMetadata(entry.notes)
            const cat = metadata.category || 'other'

            if (!byCategory[cat]) {
                byCategory[cat] = {
                    category: cat,
                    name_ar: EXPENSE_CATEGORIES[cat]?.name_ar || 'أخرى',
                    count: 0,
                    amount: 0
                }
            }

            byCategory[cat].count += 1
            byCategory[cat].amount += amount
        }

        res.json({
            success: true,
            data: {
                total_expenses: entries.length,
                total_amount: Math.round(totalAmount * 100) / 100,
                by_category: Object.values(byCategory)
            }
        })
    } catch (error) {
        console.error('Expense summary error:', error)
        res.status(500).json({ success: false, message: 'خطأ في ملخص المصروفات' })
    }
})

router.post('/',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('amount').isFloat({ gt: 0 }).withMessage('المبلغ يجب أن يكون أكبر من صفر'),
        body('description').notEmpty().withMessage('وصف المصروف مطلوب'),
        body('category').isIn(Object.keys(EXPENSE_CATEGORIES)).withMessage('فئة المصروف غير صالحة'),
        body('payment_method').isIn(Object.keys(PAYMENT_METHODS)).withMessage('طريقة الدفع غير صالحة'),
        body('payment_account_code').optional({ nullable: true }).isString().withMessage('حساب السداد غير صالح'),
        body('expense_date').optional().isISO8601().withMessage('تاريخ المصروف غير صالح'),
        body('vendor').optional().isString(),
        body('receipt_number').optional().isString()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() })
            }

            const {
                amount,
                description,
                category,
                payment_method,
                payment_account_code,
                expense_date,
                vendor,
                receipt_number,
                notes
            } = req.body

            const normalizedDescription = String(description || '').trim()
            const parsedAmount = Math.round(parseFloat(amount) * 100) / 100

            const resolvedAccounts = await AccountResolver.resolveMany({
                expense: EXPENSE_CATEGORIES[category]?.accountKey || ACCOUNT_KEYS.GENERAL_EXPENSE
            }, { branchId: req.user.branchId || null })

            const expenseAccountCode = resolvedAccounts.expense
            const paymentAccountOptions = await getPaymentPostingAccountsForMethod({
                paymentMethod: payment_method,
                branchId: req.user.branchId || null
            })
            const validPaymentCodes = new Set(paymentAccountOptions.accounts.map(acc => acc.code))

            let paymentAccountCode = paymentAccountOptions.defaultAccountCode
            const selectedPaymentCode = String(payment_account_code || '').trim()
            if (selectedPaymentCode) {
                if (!validPaymentCodes.has(selectedPaymentCode)) {
                    throw new Error(
                        `ACCOUNTING_ERROR: الحساب ${selectedPaymentCode} غير صالح لطريقة الدفع ` +
                        `"${PAYMENT_METHODS[payment_method] || payment_method}"`
                    )
                }
                paymentAccountCode = selectedPaymentCode
            }

            const metadata = JSON.stringify({
                category,
                payment_method,
                payment_account_code: paymentAccountCode,
                vendor: vendor || null,
                receipt_number: receipt_number || null,
                raw_description: normalizedDescription,
                user_notes: notes || null
            })

            const entry = await AccountingService.createJournalEntry({
                description: `مصروف: ${normalizedDescription}`,
                sourceType: 'expense',
                sourceId: null,
                lines: [
                    {
                        accountCode: expenseAccountCode,
                        debit: parsedAmount,
                        credit: 0,
                        description: `${EXPENSE_CATEGORIES[category]?.name_ar}: ${normalizedDescription}`
                    },
                    {
                        accountCode: paymentAccountCode,
                        debit: 0,
                        credit: parsedAmount,
                        description: `دفع مصروف (${PAYMENT_METHODS[payment_method] || payment_method})`
                    }
                ],
                entryDate: expense_date || null,
                branchId: req.user.branchId || null,
                createdBy: req.user.userId,
                notes: metadata
            })

            try {
                await AuditLog.create({
                    user_id: req.user.userId,
                    branch_id: req.user.branchId,
                    category: 'accounting',
                    action: 'expense_created',
                    entity_type: 'expense',
                    entity_id: entry.id,
                    new_value: JSON.stringify({
                        amount: parsedAmount,
                        category,
                        description: normalizedDescription,
                        payment_method,
                        payment_account_code: paymentAccountCode
                    }),
                    ip_address: req.ip
                })
            } catch (_) {
                // Do not fail expense creation if audit insert fails
            }

            logger.info(`Expense recorded: ${normalizedDescription} - ${parsedAmount} (${category})`)

            res.status(201).json({
                success: true,
                message: 'تم تسجيل المصروف بنجاح',
                data: {
                    id: entry.id,
                    entry_number: entry.entry_number,
                    amount: parsedAmount,
                    category,
                    description: normalizedDescription,
                    date: entry.entry_date,
                    payment_method,
                    payment_account_code: paymentAccountCode,
                    vendor,
                    receipt_number
                }
            })
        } catch (error) {
            console.error('Create expense error:', error)
            const rawMessage = String(error?.message || '')
            const isAccountingError = rawMessage.startsWith('ACCOUNTING_ERROR') || rawMessage.startsWith('ACCOUNTING_CONFIG_ERROR')
            const status = isAccountingError ? 400 : 500
            res.status(status).json({
                success: false,
                message: normalizeExpenseErrorForUser(error, 'خطأ في تسجيل المصروف')
            })
        }
    }
)

router.delete('/:id',
    authenticate,
    authorize('admin'),
    param('id').isUUID(),
    async (req, res) => {
        try {
            const { JournalEntry } = require('../models')
            const entry = await JournalEntry.findByPk(req.params.id)

            if (!entry) {
                return res.status(404).json({ success: false, message: 'المصروف غير موجود' })
            }

            if (entry.source_type !== 'expense') {
                return res.status(400).json({ success: false, message: 'هذا القيد ليس مصروفاً' })
            }

            const reversal = await AccountingService.reverseJournalEntry(entry.id, {
                reason: 'إلغاء مصروف',
                createdBy: req.user.userId
            })

            res.json({
                success: true,
                message: 'تم إلغاء المصروف بنجاح (قيد عكسي)',
                data: reversal
            })
        } catch (error) {
            console.error('Delete expense error:', error)
            res.status(500).json({ success: false, message: error.message || 'خطأ في حذف المصروف' })
        }
    }
)

module.exports = router
