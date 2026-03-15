import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Box,
    Typography,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    Grid,
    Card,
    CardContent,
    Chip,
    IconButton,
    Alert,
    Snackbar,
    CircularProgress,
    Tooltip,
    InputAdornment
} from '@mui/material'
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material'
import { expenseAPI } from '../services/api'

const EXPENSE_CATEGORIES = {
    rent: { name_ar: 'إيجار', icon: '🏠' },
    utilities: { name_ar: 'خدمات (كهرباء/ماء)', icon: '💡' },
    salaries: { name_ar: 'رواتب', icon: '👥' },
    maintenance: { name_ar: 'صيانة', icon: '🔧' },
    marketing: { name_ar: 'تسويق وإعلان', icon: '📢' },
    supplies: { name_ar: 'مستلزمات', icon: '📦' },
    transport: { name_ar: 'نقل ومواصلات', icon: '🚚' },
    insurance: { name_ar: 'تأمين', icon: '🛡️' },
    cleaning: { name_ar: 'نظافة', icon: '🧹' },
    taxes: { name_ar: 'ضرائب ورسوم', icon: '📋' },
    other: { name_ar: 'أخرى', icon: '📝' }
}

const PAYMENT_METHODS = [
    { value: 'cash', label: 'نقدي' },
    { value: 'bank_transfer', label: 'تحويل بنكي' },
    { value: 'check', label: 'شيك' },
    { value: 'card', label: 'بطاقة' }
]

const INITIAL_FORM = {
    amount: '',
    description: '',
    category: 'other',
    payment_method: 'cash',
    payment_account_code: '',
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '',
    receipt_number: '',
    notes: ''
}

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState([])
    const [summary, setSummary] = useState({ total_expenses: 0, total_amount: 0, by_category: [] })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [openCreate, setOpenCreate] = useState(false)
    const [creating, setCreating] = useState(false)
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

    const [filters, setFilters] = useState({
        from_date: '',
        to_date: '',
        category: ''
    })

    const [form, setForm] = useState(INITIAL_FORM)
    const [paymentAccounts, setPaymentAccounts] = useState([])
    const [loadingPaymentAccounts, setLoadingPaymentAccounts] = useState(false)

    const paymentLabelByValue = useMemo(() => {
        const map = {}
        for (const method of PAYMENT_METHODS) {
            map[method.value] = method.label
        }
        return map
    }, [])

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ar-SA', {
            style: 'currency',
            currency: 'SAR',
            minimumFractionDigits: 2
        }).format(Number(amount) || 0)
    }

    const formatDate = (date) => {
        if (!date) return '-'
        return new Date(date).toLocaleDateString('en-GB')
    }

    const fetchExpenses = useCallback(async () => {
        try {
            setLoading(true)
            const params = {}
            if (filters.from_date) params.from_date = filters.from_date
            if (filters.to_date) params.to_date = filters.to_date
            if (filters.category) params.category = filters.category

            const response = await expenseAPI.getAll(params)
            setExpenses(response.data.data || [])
            setError(null)
        } catch (err) {
            console.error('Error fetching expenses:', err)
            setError('حدث خطأ في جلب المصروفات')
        } finally {
            setLoading(false)
        }
    }, [filters])

    const fetchSummary = useCallback(async () => {
        try {
            const params = {}
            if (filters.from_date) params.from_date = filters.from_date
            if (filters.to_date) params.to_date = filters.to_date

            const response = await expenseAPI.getSummary(params)
            setSummary(response.data.data || { total_expenses: 0, total_amount: 0, by_category: [] })
        } catch (err) {
            console.error('Error fetching summary:', err)
        }
    }, [filters])

    const fetchPaymentAccounts = useCallback(async (paymentMethod) => {
        try {
            setLoadingPaymentAccounts(true)
            const response = await expenseAPI.getPaymentAccounts(paymentMethod)
            const accounts = response.data?.data || []
            const defaultAccountCode = response.data?.default_account_code || ''
            setPaymentAccounts(accounts)
            setForm(prev => {
                const stillValid = accounts.some(a => a.code === prev.payment_account_code)
                const nextCode = stillValid
                    ? prev.payment_account_code
                    : (defaultAccountCode || accounts[0]?.code || '')
                return { ...prev, payment_account_code: nextCode }
            })
        } catch (err) {
            console.error('Error fetching payment accounts:', err)
            setPaymentAccounts([])
            setForm(prev => ({ ...prev, payment_account_code: '' }))
            setSnackbar({
                open: true,
                message: err.response?.data?.message || 'تعذر تحميل حسابات السداد',
                severity: 'error'
            })
        } finally {
            setLoadingPaymentAccounts(false)
        }
    }, [])

    useEffect(() => {
        fetchExpenses()
        fetchSummary()
    }, [fetchExpenses, fetchSummary])

    useEffect(() => {
        if (!openCreate) return
        fetchPaymentAccounts(form.payment_method)
    }, [openCreate, form.payment_method, fetchPaymentAccounts])

    const handleOpenCreate = () => {
        setForm(INITIAL_FORM)
        setPaymentAccounts([])
        setOpenCreate(true)
    }

    const handleCloseCreate = () => {
        setOpenCreate(false)
        setForm(INITIAL_FORM)
        setPaymentAccounts([])
    }

    const handleCreateExpense = async () => {
        if (!form.amount || parseFloat(form.amount) <= 0) {
            setSnackbar({ open: true, message: 'يرجى إدخال مبلغ صحيح', severity: 'warning' })
            return
        }

        if (!form.description.trim()) {
            setSnackbar({ open: true, message: 'يرجى إدخال وصف المصروف', severity: 'warning' })
            return
        }

        if (!form.payment_account_code) {
            setSnackbar({ open: true, message: 'يرجى اختيار حساب السداد', severity: 'warning' })
            return
        }

        try {
            setCreating(true)
            await expenseAPI.create({
                amount: parseFloat(form.amount),
                description: form.description,
                category: form.category,
                payment_method: form.payment_method,
                payment_account_code: form.payment_account_code,
                expense_date: form.expense_date,
                vendor: form.vendor || undefined,
                receipt_number: form.receipt_number || undefined,
                notes: form.notes || undefined
            })

            handleCloseCreate()
            await Promise.all([fetchExpenses(), fetchSummary()])
            setSnackbar({ open: true, message: 'تم تسجيل المصروف بنجاح', severity: 'success' })
        } catch (err) {
            console.error('Error creating expense:', err)
            setSnackbar({
                open: true,
                message: err.response?.data?.message || 'حدث خطأ في تسجيل المصروف',
                severity: 'error'
            })
        } finally {
            setCreating(false)
        }
    }

    const handleDeleteExpense = async (id) => {
        if (!window.confirm('هل أنت متأكد من حذف هذا المصروف؟ سيتم إنشاء قيد عكسي.')) return

        try {
            await expenseAPI.delete(id)
            await Promise.all([fetchExpenses(), fetchSummary()])
            setSnackbar({ open: true, message: 'تم إلغاء المصروف بنجاح', severity: 'success' })
        } catch (err) {
            console.error('Error deleting expense:', err)
            setSnackbar({
                open: true,
                message: err.response?.data?.message || 'حدث خطأ في حذف المصروف',
                severity: 'error'
            })
        }
    }

    const selectedPaymentAccount = paymentAccounts.find(acc => acc.code === form.payment_account_code)

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold" gutterBottom>
                        المصروفات التشغيلية
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        تسجيل ومتابعة المصروفات، مع ترحيل محاسبي تلقائي
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={() => {
                            fetchExpenses()
                            fetchSummary()
                        }}
                    >
                        تحديث
                    </Button>

                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleOpenCreate}
                    >
                        مصروف جديد
                    </Button>
                </Box>
            </Box>

            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
                        <CardContent>
                            <Typography variant="subtitle2">إجمالي المصروفات</Typography>
                            <Typography variant="h4">{summary.total_expenses}</Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                        <CardContent>
                            <Typography variant="subtitle2">قيمة المصروفات</Typography>
                            <Typography variant="h5" dir="ltr">{formatCurrency(summary.total_amount)}</Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {summary.by_category?.slice(0, 2).map((cat) => (
                    <Grid item xs={12} sm={6} md={3} key={cat.category}>
                        <Card>
                            <CardContent>
                                <Typography variant="subtitle2">
                                    {EXPENSE_CATEGORIES[cat.category]?.icon} {EXPENSE_CATEGORIES[cat.category]?.name_ar || cat.name_ar}
                                </Typography>
                                <Typography variant="h5" dir="ltr">{formatCurrency(cat.amount)}</Typography>
                                <Typography variant="caption" color="text.secondary">{cat.count} عملية</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={3}>
                        <TextField
                            fullWidth
                            type="date"
                            label="من تاريخ"
                            value={filters.from_date}
                            onChange={(e) => setFilters(prev => ({ ...prev, from_date: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                            size="small"
                        />
                    </Grid>

                    <Grid item xs={12} sm={3}>
                        <TextField
                            fullWidth
                            type="date"
                            label="إلى تاريخ"
                            value={filters.to_date}
                            onChange={(e) => setFilters(prev => ({ ...prev, to_date: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                            size="small"
                        />
                    </Grid>

                    <Grid item xs={12} sm={3}>
                        <TextField
                            fullWidth
                            select
                            label="الفئة"
                            value={filters.category}
                            onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                            size="small"
                        >
                            <MenuItem value="">الكل</MenuItem>
                            {Object.entries(EXPENSE_CATEGORIES).map(([key, val]) => (
                                <MenuItem key={key} value={key}>{val.icon} {val.name_ar}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={3}>
                        <Button
                            variant="outlined"
                            onClick={() => setFilters({ from_date: '', to_date: '', category: '' })}
                            fullWidth
                        >
                            مسح الفلاتر
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>رقم القيد</TableCell>
                            <TableCell>التاريخ</TableCell>
                            <TableCell>الوصف</TableCell>
                            <TableCell>الفئة</TableCell>
                            <TableCell>المبلغ</TableCell>
                            <TableCell>طريقة الدفع</TableCell>
                            <TableCell>حساب السداد</TableCell>
                            <TableCell>الحالة</TableCell>
                            <TableCell>إجراءات</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                    <CircularProgress />
                                </TableCell>
                            </TableRow>
                        ) : expenses.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">لا توجد مصروفات مسجلة</Typography>
                                </TableCell>
                            </TableRow>
                        ) : expenses.map((expense) => (
                            <TableRow key={expense.id} hover>
                                <TableCell>
                                    <Typography variant="body2" fontWeight="bold">
                                        {expense.entry_number}
                                    </Typography>
                                </TableCell>

                                <TableCell sx={{ direction: 'ltr', textAlign: 'right' }}>
                                    {formatDate(expense.date)}
                                </TableCell>

                                <TableCell>
                                    <Tooltip title={expense.vendor ? `المورد: ${expense.vendor}` : ''}>
                                        <Typography variant="body2">{expense.description}</Typography>
                                    </Tooltip>
                                </TableCell>

                                <TableCell>
                                    <Chip
                                        label={`${EXPENSE_CATEGORIES[expense.category]?.icon || '📝'} ${EXPENSE_CATEGORIES[expense.category]?.name_ar || expense.category}`}
                                        size="small"
                                        variant="outlined"
                                    />
                                </TableCell>

                                <TableCell>
                                    <Typography color="error.main" fontWeight="bold" sx={{ direction: 'ltr', textAlign: 'right' }}>
                                        {formatCurrency(expense.amount)}
                                    </Typography>
                                </TableCell>

                                <TableCell>{paymentLabelByValue[expense.payment_method] || expense.payment_method}</TableCell>
                                <TableCell>{expense.payment_account_code || '-'}</TableCell>

                                <TableCell>
                                    <Chip
                                        label={expense.status === 'posted' ? 'مسجل' : expense.status === 'reversed' ? 'ملغى' : expense.status}
                                        color={expense.status === 'posted' ? 'success' : expense.status === 'reversed' ? 'error' : 'default'}
                                        size="small"
                                    />
                                </TableCell>

                                <TableCell>
                                    {expense.status === 'posted' && (
                                        <Tooltip title="إلغاء المصروف">
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => handleDeleteExpense(expense.id)}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={openCreate} onClose={handleCloseCreate} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
                    <AddIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    تسجيل مصروف جديد
                </DialogTitle>

                <DialogContent sx={{ mt: 2 }}>
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="المبلغ *"
                                type="number"
                                value={form.amount}
                                onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">ر.س</InputAdornment>
                                }}
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                type="date"
                                label="التاريخ"
                                value={form.expense_date}
                                onChange={(e) => setForm(prev => ({ ...prev, expense_date: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="وصف المصروف *"
                                value={form.description}
                                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="مثال: إيجار الشهر، فاتورة كهرباء..."
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                select
                                label="الفئة *"
                                value={form.category}
                                onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                            >
                                {Object.entries(EXPENSE_CATEGORIES).map(([key, val]) => (
                                    <MenuItem key={key} value={key}>{val.icon} {val.name_ar}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                select
                                label="طريقة الدفع *"
                                value={form.payment_method}
                                onChange={(e) => {
                                    const nextMethod = e.target.value
                                    setForm(prev => ({
                                        ...prev,
                                        payment_method: nextMethod,
                                        payment_account_code: ''
                                    }))
                                }}
                            >
                                {PAYMENT_METHODS.map(method => (
                                    <MenuItem key={method.value} value={method.value}>{method.label}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                select
                                label="حساب السداد *"
                                value={form.payment_account_code}
                                onChange={(e) => setForm(prev => ({ ...prev, payment_account_code: e.target.value }))}
                                disabled={loadingPaymentAccounts || paymentAccounts.length === 0}
                                helperText={loadingPaymentAccounts
                                    ? 'جارٍ تحميل الحسابات...'
                                    : (paymentAccounts.length === 0 ? 'لا توجد حسابات فرعية متاحة لهذه الطريقة' : '')}
                            >
                                {paymentAccounts.map(account => (
                                    <MenuItem key={account.id} value={account.code}>
                                        {account.code} - {account.name_ar || account.name_en}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="اسم الجهة / المورد"
                                value={form.vendor}
                                onChange={(e) => setForm(prev => ({ ...prev, vendor: e.target.value }))}
                                placeholder="اختياري"
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="رقم الفاتورة / الإيصال"
                                value={form.receipt_number}
                                onChange={(e) => setForm(prev => ({ ...prev, receipt_number: e.target.value }))}
                                placeholder="اختياري"
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="ملاحظات"
                                value={form.notes}
                                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                                multiline
                                rows={2}
                                placeholder="اختياري"
                            />
                        </Grid>
                    </Grid>

                    <Alert severity="info" sx={{ mt: 2 }}>
                        سيتم إنشاء قيد تلقائي: مدين {EXPENSE_CATEGORIES[form.category]?.name_ar || 'مصروفات عامة'}،
                        دائن {selectedPaymentAccount ? `${selectedPaymentAccount.code} - ${selectedPaymentAccount.name_ar || selectedPaymentAccount.name_en}` : '—'}
                    </Alert>
                </DialogContent>

                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={handleCloseCreate}>إلغاء</Button>
                    <Button
                        variant="contained"
                        onClick={handleCreateExpense}
                        disabled={creating || !form.amount || !form.description || !form.payment_account_code}
                        startIcon={creating ? <CircularProgress size={16} /> : <AddIcon />}
                    >
                        {creating ? 'جارٍ الحفظ...' : 'تسجيل المصروف'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                    severity={snackbar.severity}
                    variant="filled"
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    )
}
