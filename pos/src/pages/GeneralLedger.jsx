import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    CircularProgress,
    FormControl,
    FormControlLabel,
    Grid,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material'
import {
    AccountBalance as LedgerIcon,
    Download as DownloadIcon,
    OpenInNew as OpenInNewIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { accountingAPI, branchAPI } from '../services/api'
import { useThemeConfig } from '../contexts/ThemeContext'

const formatDateInput = (date) => {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const startOfWeek = (date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday as start
    return new Date(d.setDate(diff))
}

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1)

const flattenAccounts = (nodes = [], acc = [], seen = new Set()) => {
    for (const node of nodes) {
        const key = node?.id || node?.code
        if (!key) {
            acc.push(node)
        } else if (!seen.has(key)) {
            acc.push(node)
            seen.add(key)
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
            flattenAccounts(node.children, acc, seen)
        }
    }
    return acc
}

const GeneralLedger = () => {
    const navigate = useNavigate()
    const { user } = useSelector((state) => state.auth)
    const { formatCurrency, currencyCode } = useThemeConfig()

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const [accounts, setAccounts] = useState([])
    const [branches, setBranches] = useState([])

    const [accountCode, setAccountCode] = useState('')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [branchId, setBranchId] = useState('')
    const [includeChildren, setIncludeChildren] = useState(false)

    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(50)

    const [ledger, setLedger] = useState(null)

    const selectedAccount = useMemo(
        () => accounts.find((a) => a.code === accountCode) || null,
        [accounts, accountCode]
    )

    const selectedBranch = useMemo(
        () => branches.find((b) => b.id === branchId) || null,
        [branches, branchId]
    )
    const effectiveIncludeChildren = Boolean(selectedAccount?.is_group || includeChildren)

    const rows = ledger?.entries || []
    const pagination = ledger?.pagination || { page: 1, limit, total: 0 }

    const pageDebitTotal = useMemo(
        () => rows.reduce((sum, r) => sum + (parseFloat(r.debit || 0) || 0), 0),
        [rows]
    )
    const pageCreditTotal = useMemo(
        () => rows.reduce((sum, r) => sum + (parseFloat(r.credit || 0) || 0), 0),
        [rows]
    )

    const loadMasterData = useCallback(async () => {
        try {
            const [coaRes, branchRes] = await Promise.all([
                accountingAPI.getChartOfAccounts(),
                branchAPI.getAll()
            ])

            const coaTree = coaRes?.data?.data || []
            const flat = flattenAccounts(coaTree, [])
            const activeAccounts = flat
                .filter((a) => a?.is_active !== false)
                .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
            setAccounts(activeAccounts)

            const branchRows = branchRes?.data?.data || []
            setBranches(Array.isArray(branchRows) ? branchRows : [])
        } catch (err) {
            setError(err?.response?.data?.error || err.message || 'تعذر تحميل بيانات دفتر الأستاذ')
        }
    }, [])

    const loadLedger = useCallback(async ({
        nextPage = page,
        nextLimit = limit
    } = {}) => {
        if (!accountCode) {
            setError('يرجى اختيار حساب لعرض دفتر الأستاذ')
            return
        }

        if (fromDate && toDate && fromDate > toDate) {
            setError('نطاق التاريخ غير صحيح: تاريخ البداية أكبر من تاريخ النهاية')
            return
        }

        setLoading(true)
        setError(null)
        try {
            const params = {
                page: nextPage,
                limit: nextLimit
            }
            if (fromDate) params.fromDate = fromDate
            if (toDate) params.toDate = toDate
            if (branchId) params.branchId = branchId
            if (effectiveIncludeChildren) params.includeChildren = true

            const res = await accountingAPI.getGeneralLedger(accountCode, params)
            if (!res?.data?.success) {
                throw new Error(res?.data?.error || 'فشل تحميل دفتر الأستاذ')
            }
            setLedger(res.data.data || null)
        } catch (err) {
            setLedger(null)
            setError(err?.response?.data?.error || err.message || 'فشل تحميل دفتر الأستاذ')
        } finally {
            setLoading(false)
        }
    }, [accountCode, branchId, effectiveIncludeChildren, fromDate, limit, page, toDate])

    useEffect(() => {
        loadMasterData()
    }, [loadMasterData])

    const applyQuickRange = (range) => {
        const now = new Date()
        if (range === 'today') {
            const d = formatDateInput(now)
            setFromDate(d)
            setToDate(d)
            return
        }
        if (range === 'week') {
            setFromDate(formatDateInput(startOfWeek(now)))
            setToDate(formatDateInput(now))
            return
        }
        if (range === 'month') {
            setFromDate(formatDateInput(startOfMonth(now)))
            setToDate(formatDateInput(now))
        }
    }

    const handleSearch = () => {
        setPage(1)
        loadLedger({ nextPage: 1, nextLimit: limit })
    }

    const clearFilters = () => {
        setAccountCode('')
        setFromDate('')
        setToDate('')
        setBranchId('')
        setIncludeChildren(false)
        setPage(1)
        setLedger(null)
        setError(null)
    }

    const handleChangePage = (_, newPageZeroBased) => {
        const newPage = newPageZeroBased + 1
        setPage(newPage)
        loadLedger({ nextPage: newPage, nextLimit: limit })
    }

    const handleChangeRowsPerPage = (event) => {
        const newLimit = parseInt(event.target.value, 10) || 50
        setLimit(newLimit)
        setPage(1)
        loadLedger({ nextPage: 1, nextLimit: newLimit })
    }

    const exportCurrentRowsCsv = () => {
        if (!rows.length) {
            setError('لا توجد بيانات لتصديرها')
            return
        }

        const header = [
            'التاريخ',
            'رقم القيد',
            'البيان',
            'المصدر',
            'الحساب',
            'مدين',
            'دائن',
            'الرصيد الجاري'
        ]

        const lines = rows.map((row) => ([
            row.date || '',
            row.entry_number || '',
            row.description || '',
            row.source || '',
            row?.account?.code ? `${row.account.code} - ${row.account.name_ar || row.account.name_en || ''}` : accountCode,
            parseFloat(row.debit || 0).toFixed(2),
            parseFloat(row.credit || 0).toFixed(2),
            parseFloat(row.balance || 0).toFixed(2)
        ]))

        const summaryRows = [
            [],
            ['الرصيد الافتتاحي', parseFloat(ledger?.opening_balance || 0).toFixed(2)],
            ['إجمالي المدين', parseFloat(ledger?.period_debit || 0).toFixed(2)],
            ['إجمالي الدائن', parseFloat(ledger?.period_credit || 0).toFixed(2)],
            ['الرصيد الختامي', parseFloat(ledger?.closing_balance || ledger?.closingBalance || 0).toFixed(2)]
        ]

        const csvEscape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`
        const csv = [header, ...lines, ...summaryRows]
            .map((row) => row.map(csvEscape).join(','))
            .join('\n')

        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `general-ledger-${accountCode || 'account'}-${fromDate || 'all'}-${toDate || 'all'}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const emptyReason = useMemo(() => {
        if (!accountCode) return 'اختر حسابًا ثم اضغط تحديث'
        if (fromDate && toDate && fromDate > toDate) return 'نطاق التاريخ غير صحيح'
        let msg = 'لا توجد حركات ضمن الفلاتر المختارة'
        if (fromDate || toDate) msg += ' (الفترة الزمنية)'
        if (branchId) msg += ` (الفرع: ${selectedBranch?.name_ar || selectedBranch?.name_en || ''})`
        return msg
    }, [accountCode, branchId, fromDate, selectedBranch, toDate])

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <LedgerIcon color="primary" fontSize="large" />
                <Typography variant="h4" fontWeight="bold">
                    دفتر الأستاذ العام
                </Typography>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={4}>
                            <Autocomplete
                                options={accounts}
                                value={selectedAccount}
                                onChange={(_, value) => {
                                    setAccountCode(value?.code || '')
                                    // For group accounts, default to aggregated view.
                                    if (value?.is_group) setIncludeChildren(true)
                                }}
                                getOptionLabel={(opt) => `${opt.code} - ${opt.name_ar || opt.name_en || ''}`}
                                renderInput={(params) => (
                                    <TextField {...params} label="الحساب" size="small" />
                                )}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={2}>
                            <TextField
                                fullWidth
                                size="small"
                                type="date"
                                label="من تاريخ"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={2}>
                            <TextField
                                fullWidth
                                size="small"
                                type="date"
                                label="إلى تاريخ"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <FormControl fullWidth size="small">
                                <InputLabel>الفرع</InputLabel>
                                <Select
                                    value={branchId}
                                    label="الفرع"
                                    onChange={(e) => setBranchId(e.target.value)}
                                    disabled={user?.role === 'manager'}
                                >
                                    <MenuItem value="">الكل</MenuItem>
                                    {branches.map((b) => (
                                        <MenuItem key={b.id} value={b.id}>
                                            {b.name_ar || b.name_en}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <Stack direction="row" spacing={1}>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    startIcon={<RefreshIcon />}
                                    onClick={handleSearch}
                                    disabled={loading || !accountCode}
                                >
                                    تحديث
                                </Button>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    onClick={clearFilters}
                                >
                                    مسح
                                </Button>
                            </Stack>
                        </Grid>

                        <Grid item xs={12}>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                                <Button size="small" variant="text" onClick={() => applyQuickRange('today')}>
                                    اليوم
                                </Button>
                                <Button size="small" variant="text" onClick={() => applyQuickRange('week')}>
                                    هذا الأسبوع
                                </Button>
                                <Button size="small" variant="text" onClick={() => applyQuickRange('month')}>
                                    هذا الشهر
                                </Button>
                            </Stack>
                        </Grid>

                        <Grid item xs={12}>
                            <FormControlLabel
                                control={(
                                    <Checkbox
                                        checked={effectiveIncludeChildren}
                                        onChange={(e) => setIncludeChildren(e.target.checked)}
                                        disabled={Boolean(selectedAccount?.is_group)}
                                    />
                                )}
                                label="تجميع الحسابات الفرعية تحت الحساب المختار"
                            />
                            {selectedAccount?.is_group && (
                                <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                                    الحساب المختار تجميعي. سيتم عرض إجمالي الحركات من الحسابات الفرعية.
                                </Typography>
                            )}
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="text.secondary">الرصيد الافتتاحي</Typography>
                            <Typography variant="h6" fontWeight="bold">
                                {formatCurrency(parseFloat(ledger?.opening_balance || 0))}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="text.secondary">إجمالي المدين</Typography>
                            <Typography variant="h6" fontWeight="bold" color="success.main">
                                {formatCurrency(parseFloat(ledger?.period_debit || 0))}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="text.secondary">إجمالي الدائن</Typography>
                            <Typography variant="h6" fontWeight="bold" color="error.main">
                                {formatCurrency(parseFloat(ledger?.period_credit || 0))}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="text.secondary">الرصيد الختامي</Typography>
                            <Typography variant="h6" fontWeight="bold">
                                {formatCurrency(parseFloat(ledger?.closing_balance || ledger?.closingBalance || 0))}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {selectedAccount?.is_group && Array.isArray(ledger?.group_summary) && ledger.group_summary.length > 0 && (
                <Card sx={{ mb: 2 }}>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 1 }}>
                            إجمالي الحسابات الفرعية داخل المجموعة
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell><strong>الحساب الفرعي</strong></TableCell>
                                        <TableCell align="right"><strong>رصيد افتتاحي</strong></TableCell>
                                        <TableCell align="right"><strong>مدين الفترة</strong></TableCell>
                                        <TableCell align="right"><strong>دائن الفترة</strong></TableCell>
                                        <TableCell align="right"><strong>رصيد ختامي</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {ledger.group_summary.map((row) => (
                                        <TableRow key={row.account_id}>
                                            <TableCell>{`${row.code} - ${row.name_ar || row.name_en || ''}`}</TableCell>
                                            <TableCell align="right">{formatCurrency(parseFloat(row.opening_balance || 0))}</TableCell>
                                            <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>
                                                {formatCurrency(parseFloat(row.period_debit || 0))}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
                                                {formatCurrency(parseFloat(row.period_credit || 0))}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 800 }}>
                                                {formatCurrency(parseFloat(row.closing_balance || 0))}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </CardContent>
                </Card>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    العملة الحالية: {currencyCode}
                </Typography>
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={exportCurrentRowsCsv}
                    disabled={!rows.length}
                >
                    تصدير CSV
                </Button>
            </Box>

            <Paper>
                {loading ? (
                    <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell><strong>التاريخ</strong></TableCell>
                                        <TableCell><strong>رقم القيد</strong></TableCell>
                                        <TableCell><strong>البيان</strong></TableCell>
                                        <TableCell><strong>المصدر</strong></TableCell>
                                        <TableCell><strong>الحساب</strong></TableCell>
                                        <TableCell align="right"><strong>مدين</strong></TableCell>
                                        <TableCell align="right"><strong>دائن</strong></TableCell>
                                        <TableCell align="right"><strong>الرصيد الجاري</strong></TableCell>
                                        <TableCell align="center"><strong>إجراء</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.length === 0 ? (
                                        <>
                                            {ledger && accountCode && (
                                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                    <TableCell>{fromDate || toDate || '-'}</TableCell>
                                                    <TableCell>-</TableCell>
                                                    <TableCell>رصيد افتتاحي</TableCell>
                                                    <TableCell>-</TableCell>
                                                    <TableCell>
                                                        {selectedAccount?.code
                                                            ? `${selectedAccount.code} - ${selectedAccount.name_ar || selectedAccount.name_en || ''}`
                                                            : accountCode}
                                                    </TableCell>
                                                    <TableCell align="right">-</TableCell>
                                                    <TableCell align="right">-</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 800 }}>
                                                        {formatCurrency(parseFloat(ledger?.opening_balance || 0))}
                                                    </TableCell>
                                                    <TableCell align="center">-</TableCell>
                                                </TableRow>
                                            )}
                                            <TableRow>
                                                <TableCell colSpan={9} align="center">
                                                    <Typography color="text.secondary">{emptyReason}</Typography>
                                                </TableCell>
                                            </TableRow>
                                        </>
                                    ) : (
                                        <>
                                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                <TableCell>{fromDate || rows[0]?.date || '-'}</TableCell>
                                                <TableCell>-</TableCell>
                                                <TableCell>رصيد افتتاحي</TableCell>
                                                <TableCell>-</TableCell>
                                                <TableCell>
                                                    {selectedAccount?.code
                                                        ? `${selectedAccount.code} - ${selectedAccount.name_ar || selectedAccount.name_en || ''}`
                                                        : accountCode}
                                                </TableCell>
                                                <TableCell align="right">-</TableCell>
                                                <TableCell align="right">-</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 800 }}>
                                                    {formatCurrency(parseFloat(ledger?.opening_balance || 0))}
                                                </TableCell>
                                                <TableCell align="center">-</TableCell>
                                            </TableRow>
                                            {rows.map((row) => (
                                                <TableRow key={row.id} hover>
                                                    <TableCell>{row.date || '-'}</TableCell>
                                                    <TableCell>{row.entry_number || '-'}</TableCell>
                                                    <TableCell>{row.description || '-'}</TableCell>
                                                    <TableCell>{row.source || '-'}</TableCell>
                                                    <TableCell>
                                                        {row?.account?.code
                                                            ? `${row.account.code} - ${row.account.name_ar || row.account.name_en || ''}`
                                                            : accountCode}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>
                                                        {formatCurrency(parseFloat(row.debit || 0))}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
                                                        {formatCurrency(parseFloat(row.credit || 0))}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                                        {formatCurrency(parseFloat(row.balance || 0))}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Tooltip title="فتح القيد من دفتر اليومية">
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                startIcon={<OpenInNewIcon fontSize="small" />}
                                                                onClick={() => {
                                                                    if (row.journal_entry_id) {
                                                                        navigate(`/journal-entries?entryId=${row.journal_entry_id}`)
                                                                    } else {
                                                                        navigate('/journal-entries')
                                                                    }
                                                                }}
                                                            >
                                                                عرض
                                                            </Button>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                <TableCell colSpan={5}><strong>إجمالي الصفحة</strong></TableCell>
                                                <TableCell align="right" sx={{ color: 'success.main', fontWeight: 800 }}>
                                                    {formatCurrency(pageDebitTotal)}
                                                </TableCell>
                                                <TableCell align="right" sx={{ color: 'error.main', fontWeight: 800 }}>
                                                    {formatCurrency(pageCreditTotal)}
                                                </TableCell>
                                                <TableCell colSpan={2} />
                                            </TableRow>
                                        </>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <TablePagination
                            component="div"
                            count={pagination.total || 0}
                            page={Math.max((pagination.page || 1) - 1, 0)}
                            onPageChange={handleChangePage}
                            rowsPerPage={pagination.limit || limit}
                            onRowsPerPageChange={handleChangeRowsPerPage}
                            rowsPerPageOptions={[25, 50, 100, 200]}
                            labelRowsPerPage="عدد الصفوف:"
                            labelDisplayedRows={({ from, to, count }) => `${from}-${to} من ${count !== -1 ? count : `أكثر من ${to}`}`}
                        />
                    </>
                )}
            </Paper>
        </Box>
    )
}

export default GeneralLedger
