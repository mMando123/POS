import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    Grid,
    IconButton,
    InputAdornment,
    InputLabel,
    LinearProgress,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material'
import {
    AccountBalance,
    AccountTree,
    Assignment,
    CheckCircle,
    CheckCircleOutline,
    ClearAll,
    Close as CloseIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Error as ErrorIcon,
    ExpandLess,
    ExpandMore,
    FilterList,
    InfoOutlined,
    KeyboardArrowDown,
    Link as LinkIcon,
    LinkOff,
    Refresh as RefreshIcon,
    Restore,
    Save as SaveIcon,
    Search as SearchIcon,
    Settings as SettingsIcon,
    Store as BranchIcon,
    Tune,
    Warning as WarningIcon
} from '@mui/icons-material'
import { useTranslation } from '../contexts/ThemeContext'
import { accountingAPI, branchAPI } from '../services/api'

// ── Constants ────────────────────────────────────────────────

const KEY_CATEGORIES = {
    'الأصول': {
        keys: [
            'default_cash_account',
            'default_bank_account',
            'default_receivable_account',
            'default_drawer_float_account',
            'default_clearing_account',
            'default_stock_in_hand_account',
            'default_input_vat_account',
            'default_advance_payment_account',
            'default_fixed_assets_account',
            'default_accumulated_depreciation_account'
        ],
        color: '#1976d2',
        gradient: 'linear-gradient(135deg, #1976d2, #42a5f5)',
        icon: '💰'
    },
    'الخصوم': {
        keys: [
            'default_customer_deposit_account',
            'default_payable_account',
            'default_output_vat_account',
            'default_accrued_expenses_account'
        ],
        color: '#d32f2f',
        gradient: 'linear-gradient(135deg, #d32f2f, #ef5350)',
        icon: '📋'
    },
    'حقوق الملكية': {
        keys: [
            'default_capital_account',
            'default_retained_earnings_account',
            'default_owner_drawings_account'
        ],
        color: '#7b1fa2',
        gradient: 'linear-gradient(135deg, #7b1fa2, #ab47bc)',
        icon: '🏛️'
    },
    'الإيرادات': {
        keys: [
            'default_income_account',
            'default_discount_account',
            'default_other_income_account',
            'default_exchange_gain_account'
        ],
        color: '#2e7d32',
        gradient: 'linear-gradient(135deg, #2e7d32, #66bb6a)',
        icon: '📈'
    },
    'المصروفات': {
        keys: [
            'default_cogs_account',
            'default_refund_expense_account',
            'default_cash_shortage_account',
            'default_shrinkage_account',
            'default_general_expense_account',
            'default_salaries_expense_account',
            'default_rent_expense_account',
            'default_utilities_expense_account',
            'default_marketing_expense_account',
            'default_maintenance_expense_account',
            'default_depreciation_expense_account',
            'default_exchange_loss_account',
            'default_write_off_account',
            'default_rounding_account',
            'default_admin_expense_account'
        ],
        color: '#e65100',
        gradient: 'linear-gradient(135deg, #e65100, #ff9800)',
        icon: '💸'
    }
}

const KEY_LABELS = {
    default_cash_account: { label: 'حساب الصندوق (النقدية)', desc: 'يفضل ربطه لكل فرع بحساب صندوق مستقل', critical: true },
    default_bank_account: { label: 'حساب البنك', desc: 'حساب البنك الرئيسي — ربط فرعي مستحسن', critical: true },
    default_receivable_account: { label: 'العملاء (مدينون)', desc: 'الذمم المدينة — المستحقة من العملاء', critical: true },
    default_drawer_float_account: { label: 'عهدة الوردية', desc: 'عهدة فتح صندوق نقطة البيع' },
    default_clearing_account: { label: 'المقاصة بين الفروع', desc: 'تسويات بين فروع المؤسسة' },
    default_stock_in_hand_account: { label: 'المخزون', desc: 'قيمة البضاعة في المخازن', critical: true },
    default_input_vat_account: { label: 'ضريبة مدخلات', desc: 'ضريبة القيمة المضافة على المشتريات' },
    default_advance_payment_account: { label: 'دفعات مقدمة', desc: 'مبالغ مدفوعة مقدماً للموردين' },
    default_fixed_assets_account: { label: 'الأصول الثابتة', desc: 'معدات، أثاث، أجهزة' },
    default_accumulated_depreciation_account: { label: 'مجمع الإهلاك', desc: 'إجمالي الإهلاك المتراكم' },
    default_customer_deposit_account: { label: 'عربون العميل', desc: 'مبالغ مسبقة من العملاء' },
    default_payable_account: { label: 'الموردين (دائنون)', desc: 'المبالغ المستحقة للموردين', critical: true },
    default_output_vat_account: { label: 'ضريبة مخرجات', desc: 'ضريبة القيمة المضافة على المبيعات' },
    default_accrued_expenses_account: { label: 'مصروفات مستحقة', desc: 'مصاريف تمت ولم تُدفع' },
    default_capital_account: { label: 'رأس المال', desc: 'رأس مال المؤسسة' },
    default_retained_earnings_account: { label: 'الأرباح المحتجزة', desc: 'أرباح السنوات السابقة' },
    default_owner_drawings_account: { label: 'مسحوبات المالك', desc: 'مبالغ سحبها المالك' },
    default_income_account: { label: 'إيرادات المبيعات', desc: 'الإيراد الرئيسي', critical: true },
    default_discount_account: { label: 'الخصومات الممنوحة', desc: 'خصومات تجارية للعملاء' },
    default_other_income_account: { label: 'إيرادات أخرى', desc: 'إيرادات غير رئيسية' },
    default_exchange_gain_account: { label: 'أرباح فروق عملة', desc: 'أرباح ناتجة عن تحويل العملات' },
    default_cogs_account: { label: 'تكلفة البضاعة المباعة', desc: 'التكلفة المباشرة للبضاعة', critical: true },
    default_refund_expense_account: { label: 'مصروف المرتجعات', desc: 'المال المسترجع للعملاء' },
    default_cash_shortage_account: { label: 'عجز صندوق', desc: 'فرق الرصيد الفعلي والنظري' },
    default_shrinkage_account: { label: 'هالك مخزون', desc: 'المخزون المفقود أو التالف' },
    default_general_expense_account: { label: 'مصروفات عمومية', desc: 'مصاريف عامة' },
    default_salaries_expense_account: { label: 'الرواتب', desc: 'رواتب وأجور الموظفين' },
    default_rent_expense_account: { label: 'الإيجار', desc: 'إيجار المحل/المكتب' },
    default_utilities_expense_account: { label: 'الخدمات', desc: 'كهرباء، ماء، إنترنت' },
    default_marketing_expense_account: { label: 'التسويق', desc: 'إعلانات ودعاية' },
    default_maintenance_expense_account: { label: 'الصيانة', desc: 'صيانة معدات ومرافق' },
    default_depreciation_expense_account: { label: 'مصروف الإهلاك', desc: 'قسط الإهلاك الدوري' },
    default_exchange_loss_account: { label: 'خسائر فروق عملة', desc: 'خسائر تحويل العملات' },
    default_write_off_account: { label: 'ديون معدومة', desc: 'ديون لا يمكن تحصيلها' },
    default_rounding_account: { label: 'فروق التقريب', desc: 'فروقات تقريب المبالغ' },
    default_admin_expense_account: { label: 'مصروفات إدارية', desc: 'مصاريف إدارية ومكتبية' }
}

const isPostingAccount = (account) => {
    if (!account) return false
    if (account.is_active === false) return false
    const isGroup = typeof account.is_group === 'boolean'
        ? account.is_group
        : (typeof account.is_group === 'number'
            ? account.is_group === 1
            : (typeof account.is_group === 'string'
                ? ['1', 'true', 't'].includes(account.is_group.trim().toLowerCase())
                : false))
    return !isGroup
}


// ── Coverage Ring Component ─────────────────────────────────

const CoverageRing = ({ mapped, total, color, size = 70 }) => {
    const percentage = total > 0 ? Math.round((mapped / total) * 100) : 0
    const strokeWidth = 5
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (percentage / 100) * circumference

    return (
        <Box sx={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                    stroke="rgba(0,0,0,0.08)" strokeWidth={strokeWidth} />
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                    stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
            </svg>
            <Box sx={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <Typography variant="caption" fontWeight="bold" fontSize="0.75rem" color={color}>
                    {percentage}%
                </Typography>
            </Box>
        </Box>
    )
}


// ── Main Component ──────────────────────────────────────────

const AccountDefaults = () => {
    const { language } = useTranslation()
    const isRtl = language === 'ar'

    // Data state
    const [keysData, setKeysData] = useState([])
    const [accounts, setAccounts] = useState([])
    const [allAccounts, setAllAccounts] = useState([])
    const [branches, setBranches] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // UI state
    const [searchTerm, setSearchTerm] = useState('')
    const [filterMode, setFilterMode] = useState('all') // all | mapped | unmapped | critical
    const [expandedCategories, setExpandedCategories] = useState({})
    const [expandedRows, setExpandedRows] = useState({})

    // Edit dialog
    const [editDialog, setEditDialog] = useState(false)
    const [editingKey, setEditingKey] = useState(null)
    const [mappingScope, setMappingScope] = useState('global')
    const [selectedBranchId, setSelectedBranchId] = useState('')
    const [selectedAccountId, setSelectedAccountId] = useState('')
    const [editDescription, setEditDescription] = useState('')
    const [saving, setSaving] = useState(false)
    const [accountSearch, setAccountSearch] = useState('')

    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

    // ── Helpers ───────────────────────────────────────────

    const getKeyLabel = useCallback((key) =>
        KEY_LABELS[key]?.label || key.replace('default_', '').replace(/_account$/, '').replace(/_/g, ' '), [])

    const getKeyDescription = useCallback((key) => KEY_LABELS[key]?.desc || '', [])

    const isCritical = useCallback((key) => KEY_LABELS[key]?.critical === true, [])

    const getCategoryForKey = useCallback((key) => {
        for (const [cat, cfg] of Object.entries(KEY_CATEGORIES)) {
            if (cfg.keys.includes(key)) return cat
        }
        return 'أخرى'
    }, [])

    const getBranchName = useCallback((branchId) => {
        const branch = branches.find(b => b.id === branchId)
        return branch ? (branch.name_ar || branch.name_en || branch.code) : branchId
    }, [branches])

    const resolveScopeMapping = useCallback((keyItem, scope, branchId) => {
        if (!keyItem) return null
        if (scope === 'global') return keyItem.mappings?.find(m => !m.branchId && !m.companyId) || null
        if (scope === 'branch' && branchId)
            return keyItem.mappings?.find(m => m.branchId === branchId && !m.companyId) || null
        return null
    }, [])

    // ── Load Data ────────────────────────────────────────

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [keysRes, coaRes, branchesRes] = await Promise.all([
                accountingAPI.getAccountDefaultKeys(),
                accountingAPI.getChartOfAccounts(),
                branchAPI.getAll()
            ])

            if (keysRes.data?.success) setKeysData(keysRes.data.data || [])
            if (coaRes.data?.success) {
                const all = coaRes.data.data || []
                setAllAccounts(all)
                setAccounts(all.filter(isPostingAccount).sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''))))
            }
            setBranches(branchesRes.data?.data || [])
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'حدث خطأ')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { loadData() }, [loadData])

    // Initialize expanded categories
    useEffect(() => {
        if (keysData.length > 0 && Object.keys(expandedCategories).length === 0) {
            const exp = {}
            Object.keys(KEY_CATEGORIES).forEach(cat => { exp[cat] = true })
            setExpandedCategories(exp)
        }
    }, [keysData])

    // ── Edit dialog sync ─────────────────────────────────

    const selectedScopedMapping = useMemo(() => {
        if (!editingKey) return null
        return resolveScopeMapping(editingKey, mappingScope, mappingScope === 'branch' ? selectedBranchId : null)
    }, [editingKey, mappingScope, selectedBranchId, resolveScopeMapping])

    const selectedAccount = useMemo(
        () => accounts.find(acc => acc.id === selectedAccountId) || null,
        [accounts, selectedAccountId]
    )

    useEffect(() => {
        if (!editDialog || !editingKey) return
        if (mappingScope === 'branch' && !selectedBranchId && branches.length > 0) {
            setSelectedBranchId(branches[0].id)
            return
        }
        setSelectedAccountId(selectedScopedMapping?.accountId || '')
        setEditDescription(selectedScopedMapping?.description || editingKey.description || '')
    }, [editDialog, editingKey, mappingScope, selectedBranchId, branches, selectedScopedMapping])

    useEffect(() => {
        if (!editDialog || !editingKey) return
        const freshKey = keysData.find(k => k.key === editingKey.key)
        if (freshKey && freshKey !== editingKey) setEditingKey(freshKey)
    }, [keysData, editDialog, editingKey])

    // ── Filtered + Grouped ──────────────────────────────

    const filteredKeys = useMemo(() => {
        let list = keysData
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            list = list.filter(k => {
                const label = getKeyLabel(k.key).toLowerCase()
                const desc = getKeyDescription(k.key).toLowerCase()
                return k.key.toLowerCase().includes(term) || label.includes(term) || desc.includes(term)
            })
        }
        if (filterMode === 'mapped') list = list.filter(k => k.mappings?.length > 0)
        if (filterMode === 'unmapped') list = list.filter(k => !k.mappings?.length)
        if (filterMode === 'critical') list = list.filter(k => isCritical(k.key))
        return list
    }, [keysData, searchTerm, filterMode, getKeyLabel, getKeyDescription, isCritical])

    const groupedKeys = useMemo(() => {
        const out = {}
        for (const item of filteredKeys) {
            const category = getCategoryForKey(item.key)
            if (!out[category]) out[category] = []
            out[category].push(item)
        }
        return out
    }, [filteredKeys, getCategoryForKey])

    // ── Stats ───────────────────────────────────────────

    const stats = useMemo(() => {
        const total = keysData.length
        const mapped = keysData.filter(k => k.mappings?.length > 0).length
        const unmapped = total - mapped
        const critical = keysData.filter(k => isCritical(k.key)).length
        const criticalMapped = keysData.filter(k => isCritical(k.key) && k.mappings?.length > 0).length
        return { total, mapped, unmapped, critical, criticalMapped }
    }, [keysData, isCritical])

    const categoryStats = useMemo(() => {
        const out = {}
        for (const [cat, cfg] of Object.entries(KEY_CATEGORIES)) {
            const catKeys = keysData.filter(k => cfg.keys.includes(k.key))
            const mapped = catKeys.filter(k => k.mappings?.length > 0).length
            out[cat] = { total: catKeys.length, mapped }
        }
        return out
    }, [keysData])

    // ── Handlers ─────────────────────────────────────────

    const handleEdit = (keyItem) => {
        setEditingKey(keyItem)
        setMappingScope('global')
        setSelectedBranchId('')
        setAccountSearch('')
        const globalMapping = resolveScopeMapping(keyItem, 'global', null)
        setSelectedAccountId(globalMapping?.accountId || '')
        setEditDescription(globalMapping?.description || keyItem.description || '')
        setEditDialog(true)
    }

    const handleSave = async () => {
        if (!editingKey || !selectedAccountId) return
        if (mappingScope === 'branch' && !selectedBranchId) {
            setSnackbar({ open: true, message: 'اختر الفرع أولاً', severity: 'error' })
            return
        }
        if (!selectedAccount) {
            setSnackbar({ open: true, message: 'يرجى اختيار حساب ترحيل نشط', severity: 'error' })
            return
        }
        setSaving(true)
        try {
            const res = await accountingAPI.setAccountDefault({
                accountKey: editingKey.key,
                accountId: selectedAccountId,
                branchId: mappingScope === 'branch' ? selectedBranchId : null,
                description: editDescription
            })
            if (res.data?.success) {
                setSnackbar({
                    open: true,
                    message: `✓ تم ربط "${getKeyLabel(editingKey.key)}" بنجاح`,
                    severity: 'success'
                })
                await loadData()
                setEditDialog(false)
            }
        } catch (err) {
            setSnackbar({
                open: true,
                message: err.response?.data?.error || 'حدث خطأ أثناء الحفظ',
                severity: 'error'
            })
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteMapping = async (mapping, keyName) => {
        if (!mapping?.id) return
        const scopeLabel = mapping.branchId ? `الفرع: ${getBranchName(mapping.branchId)}` : 'عام'
        if (!window.confirm(`حذف الربط (${scopeLabel}) للمفتاح "${keyName}"؟`)) return
        try {
            const res = await accountingAPI.deleteAccountDefault(mapping.id)
            if (res.data?.success) {
                setSnackbar({ open: true, message: 'تم حذف الربط', severity: 'info' })
                await loadData()
            }
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'تعذر حذف الربط', severity: 'error' })
        }
    }

    const handleReseed = async () => {
        if (!window.confirm('سيتم إعادة زرع الإعدادات المفقودة فقط. متابعة؟')) return
        try {
            const res = await accountingAPI.reseedDefaults()
            if (res.data?.success) {
                setSnackbar({ open: true, message: res.data.message || 'تمت إعادة الزرع', severity: 'success' })
                await loadData()
            }
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'حدث خطأ', severity: 'error' })
        }
    }

    const handleClearCache = async () => {
        try {
            const res = await accountingAPI.clearDefaultsCache()
            setSnackbar({ open: true, message: res.data?.message || 'تم مسح الكاش', severity: 'info' })
        } catch {
            setSnackbar({ open: true, message: 'فشل مسح الكاش', severity: 'error' })
        }
    }

    const toggleCategory = (cat) => {
        setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))
    }

    const toggleRow = (key) => {
        setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const filteredAccountsForDropdown = useMemo(() => {
        if (!accountSearch) return accounts
        const term = accountSearch.toLowerCase()
        return accounts.filter(a =>
            a.code?.toLowerCase().includes(term) ||
            a.name_ar?.toLowerCase().includes(term) ||
            a.name_en?.toLowerCase().includes(term)
        )
    }, [accounts, accountSearch])

    // ── Render ────────────────────────────────────────────

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress size={48} />
            </Box>
        )
    }

    return (
        <Box sx={{ p: { xs: 1.5, md: 3 } }}>
            {/* ═══════ HEADER ═══════ */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{
                        width: 56, height: 56, borderRadius: 3,
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(102,126,234,0.4)'
                    }}>
                        <Tune sx={{ color: 'white', fontSize: 30 }} />
                    </Box>
                    <Box>
                        <Typography variant="h4" fontWeight="bold" sx={{ lineHeight: 1.2 }}>
                            إعدادات الحسابات الافتراضية
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            ربط كل عملية محاسبية بالحساب الصحيح — مع دعم النطاق العام والفرعي
                        </Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button variant="outlined" startIcon={<Restore />} onClick={handleReseed} size="small">إعادة زرع</Button>
                    <Button variant="outlined" startIcon={<ClearAll />} onClick={handleClearCache} size="small" color="secondary">مسح الكاش</Button>
                    <Button variant="contained" startIcon={<RefreshIcon />} onClick={loadData} size="small">تحديث</Button>
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* ═══════ STATS CARDS ═══════ */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {/* Overall progress */}
                <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <CoverageRing mapped={stats.mapped} total={stats.total} color="#667eea" size={80} />
                            <Box>
                                <Typography variant="h6" fontWeight="bold">التغطية الكلية</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {stats.mapped} من {stats.total} مفتاح مربوط
                                </Typography>
                                {stats.unmapped > 0 && (
                                    <Chip label={`${stats.unmapped} غير مربوط`} size="small"
                                        color="warning" variant="outlined" sx={{ mt: 0.5, fontSize: '0.7rem' }} />
                                )}
                            </Box>
                        </Box>
                    </Paper>
                </Grid>

                {/* Critical keys */}
                <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{
                        p: 2.5, borderRadius: 3, height: '100%',
                        borderColor: stats.criticalMapped < stats.critical ? 'error.main' : 'success.main',
                        borderWidth: stats.criticalMapped < stats.critical ? 2 : 1
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <CoverageRing mapped={stats.criticalMapped} total={stats.critical}
                                color={stats.criticalMapped < stats.critical ? '#d32f2f' : '#2e7d32'} size={80} />
                            <Box>
                                <Typography variant="h6" fontWeight="bold">المفاتيح الحرجة</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {stats.criticalMapped} من {stats.critical} مربوط
                                </Typography>
                                {stats.criticalMapped < stats.critical && (
                                    <Chip icon={<ErrorIcon />} label="يوجد مفاتيح حرجة غير مربوطة!"
                                        size="small" color="error" variant="filled" sx={{ mt: 0.5, fontSize: '0.65rem' }} />
                                )}
                            </Box>
                        </Box>
                    </Paper>
                </Grid>

                {/* Category mini rings */}
                <Grid item xs={12} md={4}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>التغطية بالفئة</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 0.5 }}>
                            {Object.entries(KEY_CATEGORIES).map(([cat, cfg]) => {
                                const cs = categoryStats[cat] || { total: 0, mapped: 0 }
                                return (
                                    <Box key={cat} sx={{ textAlign: 'center' }}>
                                        <CoverageRing mapped={cs.mapped} total={cs.total} color={cfg.color} size={48} />
                                        <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', mt: 0.3 }}>
                                            {cat}
                                        </Typography>
                                    </Box>
                                )
                            })}
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* ═══════ CONTROLS BAR ═══════ */}
            <Paper variant="outlined" sx={{ mb: 2.5, p: 1.5, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        size="small" placeholder="🔍 بحث بالاسم أو المفتاح..."
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        sx={{ minWidth: 220, flex: 1 }}
                        InputProps={{
                            endAdornment: searchTerm && (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setSearchTerm('')}>
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                </InputAdornment>
                            )
                        }}
                    />
                    <Divider orientation="vertical" flexItem />
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {[
                            { val: 'all', label: 'الكل', icon: null },
                            { val: 'mapped', label: 'مربوط', icon: <CheckCircleOutline fontSize="small" /> },
                            { val: 'unmapped', label: 'غير مربوط', icon: <LinkOff fontSize="small" /> },
                            { val: 'critical', label: 'حرج', icon: <ErrorIcon fontSize="small" /> }
                        ].map(f => (
                            <Chip
                                key={f.val} label={f.label} icon={f.icon} size="small"
                                variant={filterMode === f.val ? 'filled' : 'outlined'}
                                color={filterMode === f.val ? 'primary' : 'default'}
                                onClick={() => setFilterMode(f.val)}
                                sx={{ cursor: 'pointer', fontSize: '0.75rem' }}
                            />
                        ))}
                    </Box>
                </Box>
            </Paper>

            {/* ═══════ CATEGORY SECTIONS ═══════ */}
            {Object.entries(KEY_CATEGORIES).map(([category, cfg]) => {
                const items = groupedKeys[category]
                if (!items || items.length === 0) return null
                const cs = categoryStats[category] || { total: 0, mapped: 0 }
                const isExpanded = expandedCategories[category] !== false

                return (
                    <Card key={category} sx={{ mb: 2, overflow: 'visible', borderRadius: 2 }}>
                        {/* Category Header */}
                        <Box
                            onClick={() => toggleCategory(category)}
                            sx={{
                                px: 2.5, py: 1.5, cursor: 'pointer',
                                background: cfg.gradient, color: 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                borderRadius: isExpanded ? '8px 8px 0 0' : 2,
                                transition: 'border-radius 0.3s',
                                '&:hover': { filter: 'brightness(1.1)' }
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Typography fontSize="1.3rem">{cfg.icon}</Typography>
                                <Typography variant="subtitle1" fontWeight="bold">{category}</Typography>
                                <Chip
                                    label={`${cs.mapped}/${cs.total}`} size="small"
                                    sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}
                                />
                                {cs.mapped < cs.total && (
                                    <Chip label={`${cs.total - cs.mapped} ناقص`} size="small"
                                        sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', fontSize: '0.65rem' }} />
                                )}
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <LinearProgress
                                    variant="determinate"
                                    value={cs.total > 0 ? (cs.mapped / cs.total) * 100 : 0}
                                    sx={{
                                        width: 80, height: 6, borderRadius: 3,
                                        bgcolor: 'rgba(255,255,255,0.2)',
                                        '& .MuiLinearProgress-bar': { bgcolor: 'white', borderRadius: 3 }
                                    }}
                                />
                                {isExpanded ? <ExpandLess /> : <ExpandMore />}
                            </Box>
                        </Box>

                        {/* Category Table */}
                        <Collapse in={isExpanded}>
                            <TableContainer>
                                <Table size="small" sx={{ '& .MuiTableCell-root': { py: 1 } }}>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                                            <TableCell sx={{ fontWeight: 'bold', width: '3%' }} />
                                            <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>المفتاح الوظيفي</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '12%' }}>الرمز</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>الحساب المرتبط</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>النطاق</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '15%' }} align="center">إجراء</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {items.map(keyItem => {
                                            const globalMapping = keyItem.mappings?.find(m => !m.branchId)
                                            const branchMappings = (keyItem.mappings || []).filter(m => m.branchId)
                                            const primaryMapping = globalMapping || branchMappings[0]
                                            const hasMapping = (keyItem.mappings?.length || 0) > 0
                                            const critical = isCritical(keyItem.key)
                                            const isRowExpanded = expandedRows[keyItem.key]

                                            return (
                                                <React.Fragment key={keyItem.key}>
                                                    <TableRow
                                                        hover
                                                        sx={{
                                                            ...(!hasMapping ? {
                                                                bgcolor: critical ? 'rgba(211,47,47,0.04)' : 'rgba(255,152,0,0.04)',
                                                                borderRight: critical ? `3px solid #d32f2f` : 'none'
                                                            } : {}),
                                                            '&:hover .action-buttons': { opacity: 1 }
                                                        }}
                                                    >
                                                        {/* Expand toggle */}
                                                        <TableCell sx={{ px: 0.5 }}>
                                                            {branchMappings.length > 0 ? (
                                                                <IconButton size="small" onClick={() => toggleRow(keyItem.key)} sx={{ p: 0.3 }}>
                                                                    {isRowExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                                                                </IconButton>
                                                            ) : (
                                                                <Box sx={{ width: 28 }} />
                                                            )}
                                                        </TableCell>

                                                        {/* Key info */}
                                                        <TableCell>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                {critical && (
                                                                    <Tooltip title="مفتاح حرج — يجب ربطه">
                                                                        <ErrorIcon fontSize="small" color={hasMapping ? 'disabled' : 'error'} sx={{ fontSize: 16 }} />
                                                                    </Tooltip>
                                                                )}
                                                                <Box>
                                                                    <Typography variant="body2" fontWeight="bold" sx={{ lineHeight: 1.3 }}>
                                                                        {getKeyLabel(keyItem.key)}
                                                                    </Typography>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                                                                        {getKeyDescription(keyItem.key)}
                                                                    </Typography>
                                                                    <Typography variant="caption" sx={{
                                                                        fontFamily: 'monospace', fontSize: '0.6rem',
                                                                        color: 'text.disabled', display: 'block'
                                                                    }}>
                                                                        {keyItem.key}
                                                                    </Typography>
                                                                </Box>
                                                            </Box>
                                                        </TableCell>

                                                        {/* Code chip */}
                                                        <TableCell>
                                                            {primaryMapping ? (
                                                                <Chip
                                                                    label={primaryMapping.accountCode} size="small" variant="outlined"
                                                                    color="primary"
                                                                    sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}
                                                                />
                                                            ) : (
                                                                <Chip label="—" size="small" variant="outlined"
                                                                    color="default" sx={{ borderStyle: 'dashed' }} />
                                                            )}
                                                        </TableCell>

                                                        {/* Account name */}
                                                        <TableCell>
                                                            {primaryMapping ? (
                                                                <Typography variant="body2">
                                                                    {primaryMapping.accountName || '—'}
                                                                </Typography>
                                                            ) : (
                                                                <Typography variant="body2" color="warning.main" sx={{ fontStyle: 'italic' }}>
                                                                    غير معيّن
                                                                </Typography>
                                                            )}
                                                        </TableCell>

                                                        {/* Scope */}
                                                        <TableCell>
                                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                                {globalMapping && (
                                                                    <Chip label="عام" size="small" color="success"
                                                                        variant="filled" icon={<CheckCircle />}
                                                                        sx={{ fontSize: '0.65rem', height: 22 }} />
                                                                )}
                                                                {branchMappings.length > 0 && (
                                                                    <Chip label={`فرعي (${branchMappings.length})`} size="small"
                                                                        color="info" variant="outlined"
                                                                        icon={<BranchIcon />}
                                                                        sx={{ fontSize: '0.65rem', height: 22 }} />
                                                                )}
                                                                {!hasMapping && (
                                                                    <Chip label="لم يُربط" size="small" color="warning"
                                                                        variant="outlined" icon={<LinkOff />}
                                                                        sx={{ fontSize: '0.65rem', height: 22 }} />
                                                                )}
                                                            </Box>
                                                        </TableCell>

                                                        {/* Actions */}
                                                        <TableCell align="center">
                                                            <Box className="action-buttons" sx={{
                                                                display: 'flex', gap: 0.5, justifyContent: 'center',
                                                                opacity: hasMapping ? 0 : 0.8, transition: 'opacity 0.2s'
                                                            }}>
                                                                <Tooltip title="ربط / تعديل">
                                                                    <IconButton size="small" color="primary" onClick={() => handleEdit(keyItem)}>
                                                                        {hasMapping ? <EditIcon fontSize="small" /> : <LinkIcon fontSize="small" />}
                                                                    </IconButton>
                                                                </Tooltip>
                                                                {globalMapping && (
                                                                    <Tooltip title="حذف الربط العام">
                                                                        <IconButton size="small" color="error"
                                                                            onClick={() => handleDeleteMapping(globalMapping, getKeyLabel(keyItem.key))}>
                                                                            <DeleteIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                            </Box>
                                                        </TableCell>
                                                    </TableRow>

                                                    {/* ★ Expanded branch mappings */}
                                                    {isRowExpanded && branchMappings.map(bm => (
                                                        <TableRow key={bm.id} sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                                                            <TableCell />
                                                            <TableCell sx={{ pl: 4 }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <BranchIcon fontSize="small" color="info" />
                                                                    <Typography variant="body2" color="info.main">
                                                                        فرع: {getBranchName(bm.branchId)}
                                                                    </Typography>
                                                                </Box>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Chip label={bm.accountCode} size="small" variant="outlined"
                                                                    color="info" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }} />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2">{bm.accountName}</Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Chip label="فرعي" size="small" color="info" variant="filled"
                                                                    sx={{ fontSize: '0.65rem', height: 22 }} />
                                                            </TableCell>
                                                            <TableCell align="center">
                                                                <Tooltip title="حذف ربط الفرع">
                                                                    <IconButton size="small" color="error"
                                                                        onClick={() => handleDeleteMapping(bm, getKeyLabel(keyItem.key))}>
                                                                        <DeleteIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </React.Fragment>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Collapse>
                    </Card>
                )
            })}

            {/* ═══════ SUMMARY FOOTER ═══════ */}
            <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                        <Typography variant="h4" color="primary" fontWeight="bold">{stats.total}</Typography>
                        <Typography variant="body2" color="text.secondary">إجمالي المفاتيح</Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem />
                    <Box>
                        <Typography variant="h4" color="success.main" fontWeight="bold">{stats.mapped}</Typography>
                        <Typography variant="body2" color="text.secondary">مربوطة</Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem />
                    <Box>
                        <Typography variant="h4" color="warning.main" fontWeight="bold">{stats.unmapped}</Typography>
                        <Typography variant="body2" color="text.secondary">غير مربوطة</Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem />
                    <Box>
                        <Typography variant="h4" color={stats.criticalMapped < stats.critical ? 'error' : 'success.main'} fontWeight="bold">
                            {stats.criticalMapped}/{stats.critical}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">حرجة مربوطة</Typography>
                    </Box>
                </Box>
            </Paper>

            {/* ═══════ EDIT DIALOG ═══════ */}
            <Dialog open={editDialog} onClose={() => !saving && setEditDialog(false)} maxWidth="sm" fullWidth dir={isRtl ? 'rtl' : 'ltr'}>
                <DialogTitle sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white'
                }}>
                    <LinkIcon />
                    <Box>
                        <Typography variant="h6" fontWeight="bold">ربط الحساب الافتراضي</Typography>
                        {editingKey && (
                            <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                {getKeyLabel(editingKey.key)}
                            </Typography>
                        )}
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    {editingKey && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
                            {/* Key info card */}
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'grey.50' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {isCritical(editingKey.key) && (
                                        <Chip label="حرج" size="small" color="error" icon={<ErrorIcon />} />
                                    )}
                                    <Box>
                                        <Typography variant="subtitle1" fontWeight="bold">{getKeyLabel(editingKey.key)}</Typography>
                                        <Typography variant="body2" color="text.secondary">{getKeyDescription(editingKey.key)}</Typography>
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.disabled' }}>{editingKey.key}</Typography>
                                    </Box>
                                </Box>
                            </Paper>

                            {/* Scope selector */}
                            <FormControl fullWidth size="small">
                                <InputLabel>نطاق الربط</InputLabel>
                                <Select value={mappingScope} label="نطاق الربط" onChange={e => setMappingScope(e.target.value)}>
                                    <MenuItem value="global">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <CheckCircle fontSize="small" color="success" />
                                            عام (كل الفروع)
                                        </Box>
                                    </MenuItem>
                                    <MenuItem value="branch">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <BranchIcon fontSize="small" color="info" />
                                            فرع محدد (Override)
                                        </Box>
                                    </MenuItem>
                                </Select>
                            </FormControl>

                            {/* Branch selector */}
                            {mappingScope === 'branch' && (
                                <FormControl fullWidth size="small">
                                    <InputLabel>الفرع</InputLabel>
                                    <Select value={selectedBranchId} label="الفرع" onChange={e => setSelectedBranchId(e.target.value)}>
                                        {branches.map(branch => (
                                            <MenuItem key={branch.id} value={branch.id}>
                                                {branch.name_ar || branch.name_en || branch.code}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}

                            {/* Current mapping status */}
                            <Alert severity={selectedScopedMapping ? 'success' : 'warning'} icon={selectedScopedMapping ? <CheckCircle /> : <InfoOutlined />}>
                                {selectedScopedMapping
                                    ? `الربط الحالي: ${selectedScopedMapping.accountCode} — ${selectedScopedMapping.accountName}`
                                    : 'لا يوجد ربط لهذا النطاق. سيتم إنشاء ربط جديد.'}
                            </Alert>

                            {/* Account selector with search */}
                            <Box>
                                <TextField
                                    fullWidth size="small" placeholder="🔍 ابحث عن حساب بالكود أو الاسم..."
                                    value={accountSearch} onChange={e => setAccountSearch(e.target.value)}
                                    sx={{ mb: 1 }}
                                />
                                <FormControl fullWidth size="small">
                                    <InputLabel>اختر الحساب</InputLabel>
                                    <Select
                                        value={selectedAccountId} label="اختر الحساب"
                                        onChange={e => setSelectedAccountId(e.target.value)}
                                        MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}
                                    >
                                        {filteredAccountsForDropdown.map(acc => (
                                            <MenuItem key={acc.id} value={acc.id}>
                                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: '100%' }}>
                                                    <Chip label={acc.code} size="small" variant="outlined"
                                                        sx={{ fontFamily: 'monospace', minWidth: 60, fontWeight: 'bold' }} />
                                                    <Typography variant="body2" sx={{ flex: 1 }}>
                                                        {isRtl ? (acc.name_ar || acc.name_en) : (acc.name_en || acc.name_ar)}
                                                    </Typography>
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>

                            {/* Description */}
                            <TextField
                                fullWidth size="small" label="الوصف (اختياري)"
                                value={editDescription} onChange={e => setEditDescription(e.target.value)}
                                multiline rows={2}
                            />

                            {/* Existing mappings */}
                            {(editingKey.mappings || []).length > 0 && (
                                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                                        الربوط الحالية ({editingKey.mappings.length})
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        {editingKey.mappings.map(mapping => (
                                            <Box key={mapping.id} sx={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                gap: 1, p: 1, borderRadius: 1, bgcolor: 'grey.50'
                                            }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Chip label={mapping.accountCode} size="small" variant="outlined"
                                                        sx={{ fontFamily: 'monospace', fontWeight: 'bold' }} />
                                                    <Box>
                                                        <Typography variant="body2">{mapping.accountName}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {mapping.branchId ? `فرع: ${getBranchName(mapping.branchId)}` : 'عام'}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                                <IconButton size="small" color="error"
                                                    onClick={() => handleDeleteMapping(mapping, editingKey.key)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        ))}
                                    </Box>
                                </Paper>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setEditDialog(false)} disabled={saving}>إلغاء</Button>
                    <Button
                        variant="contained" onClick={handleSave}
                        disabled={!selectedAccountId || !selectedAccount || saving || (mappingScope === 'branch' && !selectedBranchId)}
                        startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                        sx={{
                            background: 'linear-gradient(135deg, #667eea, #764ba2)',
                            '&:hover': { background: 'linear-gradient(135deg, #5a6fd6, #6a4198)' }
                        }}
                    >
                        {saving ? 'جارٍ الحفظ...' : 'حفظ الربط'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ═══════ SNACKBAR ═══════ */}
            <Snackbar
                open={snackbar.open} autoHideDuration={4000}
                onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled">
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    )
}

export default AccountDefaults
