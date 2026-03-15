import { useState, useEffect, useCallback } from 'react'
import {
    Box,
    Typography,
    Paper,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    Chip,
    InputAdornment,
    CircularProgress,
    Alert,
    Rating
} from '@mui/material'
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Search as SearchIcon,
    Phone as PhoneIcon,
    Email as EmailIcon,
    Business as BusinessIcon,
    Paid as PaidIcon,
    ReceiptLong as StatementIcon,
    Assessment as AgingIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material'
import { supplierAPI, expenseAPI, entityAttachmentAPI } from '../services/api'
import { useForm, Controller } from 'react-hook-form'
import FileAttachmentsField from '../components/FileAttachmentsField'

export default function Suppliers() {
    const [suppliers, setSuppliers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [openDialog, setOpenDialog] = useState(false)
    const [editingSupplier, setEditingSupplier] = useState(null)
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [paymentDialog, setPaymentDialog] = useState(null)
    
    // Payment Accounts
    const [paymentAccounts, setPaymentAccounts] = useState([])
    const [loadingPaymentAccounts, setLoadingPaymentAccounts] = useState(false)
 // { supplier: null, open: false }
    const [paymentLoading, setPaymentLoading] = useState(false)
    const [paymentPendingFiles, setPaymentPendingFiles] = useState([])
    const [statementDialog, setStatementDialog] = useState({ open: false, supplier: null })
    const [statementData, setStatementData] = useState(null)
    const [statementLoading, setStatementLoading] = useState(false)
    const [statementFilters, setStatementFilters] = useState({ from_date: '', to_date: '' })
    const [agingDialogOpen, setAgingDialogOpen] = useState(false)
    const [agingDate, setAgingDate] = useState(new Date().toISOString().split('T')[0])
    const [agingLoading, setAgingLoading] = useState(false)
    const [agingReport, setAgingReport] = useState(null)

    // Payment Form
    const {
        control: paymentControl,
        handleSubmit: handlePaymentSubmit,
        reset: resetPayment,
        watch: watchPayment,
        setValue: setPaymentValue,
        formState: { errors: paymentErrors }
    } = useForm({
        defaultValues: {
            amount: '',
            payment_method: 'cash',
            payment_account_code: '',
            reference: '',
            notes: '',
            payment_date: new Date().toISOString().split('T')[0]
        }
    })

    const watchPaymentMethod = watchPayment('payment_method')

    const fetchPaymentAccounts = useCallback(async (method) => {
        if (!method) {
            setPaymentAccounts([])
            return
        }
        try {
            setLoadingPaymentAccounts(true)
            const response = await expenseAPI.getPaymentAccounts(method)
            setPaymentAccounts(response.data.data || [])
            if (response.data.data?.length === 1) {
                setPaymentValue('payment_account_code', response.data.data[0].code)
            } else if (response.data.data?.length > 0) {
                setPaymentValue('payment_account_code', '')
            }
        } catch (err) {
            console.error('Failed to fetch payment accounts:', err)
        } finally {
            setLoadingPaymentAccounts(false)
        }
    }, [setPaymentValue])

    useEffect(() => {
        if (paymentDialog) {
            fetchPaymentAccounts(watchPaymentMethod)
        }
    }, [watchPaymentMethod, paymentDialog, fetchPaymentAccounts])

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        defaultValues: {
            name_ar: '',
            name_en: '',
            contact_person: '',
            phone: '',
            email: '',
            address: '',
            tax_number: '',
            payment_terms: 30,
            credit_limit: 0,
            notes: '',
            status: 'active',
            rating: 0
        }
    })

    const fetchSuppliers = useCallback(async () => {
        try {
            setLoading(true)
            const params = {}
            if (search) params.search = search
            if (statusFilter) params.status = statusFilter

            const response = await supplierAPI.getAll(params)
            setSuppliers(response.data.data || [])
            setError(null)
        } catch (err) {
            console.error('Error fetching suppliers:', err)
            setError('حدث خطأ في جلب بيانات الموردين')
        } finally {
            setLoading(false)
        }
    }, [search, statusFilter])

    useEffect(() => {
        fetchSuppliers()
    }, [fetchSuppliers])

    const handleOpenDialog = (supplier = null) => {
        if (supplier) {
            setEditingSupplier(supplier)
            reset({
                name_ar: supplier.name_ar || '',
                name_en: supplier.name_en || '',
                contact_person: supplier.contact_person || '',
                phone: supplier.phone || '',
                email: supplier.email || '',
                address: supplier.address || '',
                tax_number: supplier.tax_number || '',
                payment_terms: supplier.payment_terms || 30,
                credit_limit: supplier.credit_limit || 0,
                notes: supplier.notes || '',
                status: supplier.status || 'active',
                rating: supplier.rating || 0
            })
        } else {
            setEditingSupplier(null)
            reset({
                name_ar: '',
                name_en: '',
                contact_person: '',
                phone: '',
                email: '',
                address: '',
                tax_number: '',
                payment_terms: 30,
                credit_limit: 0,
                notes: '',
                status: 'active',
                rating: 0
            })
        }
        setOpenDialog(true)
    }

    const handleCloseDialog = () => {
        setOpenDialog(false)
        setEditingSupplier(null)
    }

    const onSubmit = async (data) => {
        try {
            if (editingSupplier) {
                await supplierAPI.update(editingSupplier.id, data)
            } else {
                await supplierAPI.create(data)
            }
            handleCloseDialog()
            fetchSuppliers()
        } catch (err) {
            console.error('Error saving supplier:', err)
            setError(err.response?.data?.message || 'حدث خطأ في حفظ المورد')
        }
    }

    const handleDelete = async (id) => {
        try {
            await supplierAPI.delete(id)
            setDeleteConfirm(null)
            fetchSuppliers()
        } catch (err) {
            console.error('Error deleting supplier:', err)
            setError(err.response?.data?.message || 'حدث خطأ في حذف المورد')
        }
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'active': return 'success'
            case 'inactive': return 'default'
            case 'blocked': return 'error'
            default: return 'default'
        }
    }

    const getStatusLabel = (status) => {
        switch (status) {
            case 'active': return 'نشط'
            case 'inactive': return 'غير نشط'
            case 'blocked': return 'محظور'
            default: return status
        }
    }

    const formatMoney = (value) => parseFloat(value || 0).toFixed(2)

    const fetchSupplierStatement = useCallback(async (supplierId, filters = {}) => {
        try {
            setStatementLoading(true)
            const params = {}
            if (filters.from_date) params.from_date = filters.from_date
            if (filters.to_date) params.to_date = filters.to_date

            const response = await supplierAPI.getStatement(supplierId, params)
            setStatementData(response.data.data || null)
        } catch (err) {
            console.error('Statement Error:', err)
            setError(err.response?.data?.message || 'Failed to load supplier statement')
            setStatementData(null)
        } finally {
            setStatementLoading(false)
        }
    }, [])

    const openSupplierStatement = async (supplier) => {
        setStatementDialog({ open: true, supplier })
        setStatementData(null)
        await fetchSupplierStatement(supplier.id, statementFilters)
    }

    const fetchAgingReport = useCallback(async (asOfDate) => {
        try {
            setAgingLoading(true)
            const response = await supplierAPI.getPayablesAging({
                as_of_date: asOfDate,
                include_zero: false
            })
            setAgingReport(response.data.data || null)
        } catch (err) {
            console.error('Aging Error:', err)
            setError(err.response?.data?.message || 'Failed to load AP aging report')
            setAgingReport(null)
        } finally {
            setAgingLoading(false)
        }
    }, [])

    const openAgingReportDialog = async () => {
        setAgingDialogOpen(true)
        await fetchAgingReport(agingDate)
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" fontWeight="bold">
                    <BusinessIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    إدارة الموردين
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
    <Button
        variant="outlined"
        startIcon={<AgingIcon />}
        onClick={openAgingReportDialog}
    >
        أعمار الدائنين
    </Button>
    <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={() => handleOpenDialog()}
    >
        إضافة مورد
    </Button>
</Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        placeholder="بحث..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            )
                        }}
                        sx={{ minWidth: 250 }}
                    />
                    <TextField
                        size="small"
                        select
                        label="الحالة"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        sx={{ minWidth: 150 }}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        <MenuItem value="active">نشط</MenuItem>
                        <MenuItem value="inactive">غير نشط</MenuItem>
                        <MenuItem value="blocked">محظور</MenuItem>
                    </TextField>
                </Box>
            </Paper>

            {/* Suppliers Table */}
            <TableContainer component={Paper}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>الكود</TableCell>
                                <TableCell>اسم المورد</TableCell>
                                <TableCell>جهة الاتصال</TableCell>
                                <TableCell>الهاتف</TableCell>
                                <TableCell>شروط الدفع</TableCell>
                                <TableCell>الرصيد المستحق</TableCell>
                                <TableCell>التقييم</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell align="center">إجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {suppliers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} align="center">
                                        لا يوجد موردين
                                    </TableCell>
                                </TableRow>
                            ) : (
                                suppliers.map((supplier) => (
                                    <TableRow key={supplier.id} hover>
                                        <TableCell>{supplier.code}</TableCell>
                                        <TableCell>
                                            <Typography fontWeight="bold">{supplier.name_ar}</Typography>
                                            {supplier.name_en && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {supplier.name_en}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>{supplier.contact_person || '-'}</TableCell>
                                        <TableCell>
                                            {supplier.phone && (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <PhoneIcon fontSize="small" color="action" />
                                                    {supplier.phone}
                                                </Box>
                                            )}
                                        </TableCell>
                                        <TableCell>{supplier.payment_terms} يوم</TableCell>
                                        <TableCell>
                                            <Typography
                                                fontWeight="bold"
                                                color={parseFloat(supplier.current_balance) > 0 ? 'error.main' : 'success.main'}
                                            >
                                                {parseFloat(supplier.current_balance || 0).toFixed(2)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Rating value={supplier.rating || 0} readOnly size="small" />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={getStatusLabel(supplier.status)}
                                                color={getStatusColor(supplier.status)}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleOpenDialog(supplier)}
                                                color="primary"
                                            >
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() => setDeleteConfirm(supplier)}
                                                color="error"
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() => {
                                                    setPaymentDialog(supplier)
                                                    setPaymentPendingFiles([])
                                                    resetPayment({
                                                        amount: '',
                                                        payment_method: 'cash',
                                                        payment_account_code: '',
                                                        reference: '',
                                                        notes: '',
                                                        payment_date: new Date().toISOString().split('T')[0]
                                                    })
                                                }}
                                                color="success"
                                                title="تسجيل دفعة"
                                            >
                                                <PaidIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() => openSupplierStatement(supplier)}
                                                color="info"
                                                title="كشف حساب المورد">
                                                <StatementIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>

            {/* Add/Edit Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
                <DialogTitle>
                    {editingSupplier ? 'تعديل مورد' : 'إضافة مورد جديد'}
                </DialogTitle>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <DialogContent>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
                            <Controller
                                name="name_ar"
                                control={control}
                                rules={{ required: 'اسم المورد بالعربية مطلوب' }}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="اسم المورد (عربي)"
                                        error={!!errors.name_ar}
                                        helperText={errors.name_ar?.message}
                                        required
                                    />
                                )}
                            />
                            <Controller
                                name="name_en"
                                control={control}
                                render={({ field }) => (
                                    <TextField {...field} label="اسم المورد (إنجليزي)" />
                                )}
                            />
                            <Controller
                                name="contact_person"
                                control={control}
                                render={({ field }) => (
                                    <TextField {...field} label="جهة الاتصال" />
                                )}
                            />
                            <Controller
                                name="phone"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="الهاتف"
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <PhoneIcon />
                                                </InputAdornment>
                                            )
                                        }}
                                    />
                                )}
                            />
                            <Controller
                                name="email"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="البريد الإلكتروني"
                                        type="email"
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <EmailIcon />
                                                </InputAdornment>
                                            )
                                        }}
                                    />
                                )}
                            />
                            <Controller
                                name="tax_number"
                                control={control}
                                render={({ field }) => (
                                    <TextField {...field} label="الرقم الضريبي" />
                                )}
                            />
                            <Controller
                                name="payment_terms"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="شروط الدفع (أيام)"
                                        type="number"
                                        inputProps={{ min: 0 }}
                                    />
                                )}
                            />
                            <Controller
                                name="credit_limit"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="حد الائتمان"
                                        type="number"
                                        inputProps={{ min: 0 }}
                                    />
                                )}
                            />
                            <Controller
                                name="status"
                                control={control}
                                render={({ field }) => (
                                    <TextField {...field} label="الحالة" select>
                                        <MenuItem value="active">نشط</MenuItem>
                                        <MenuItem value="inactive">غير نشط</MenuItem>
                                        <MenuItem value="blocked">محظور</MenuItem>
                                    </TextField>
                                )}
                            />
                            <Controller
                                name="rating"
                                control={control}
                                render={({ field }) => (
                                    <Box>
                                        <Typography variant="body2" color="text.secondary" gutterBottom>
                                            التقييم
                                        </Typography>
                                        <Rating
                                            {...field}
                                            value={Number(field.value)}
                                            onChange={(e, newValue) => field.onChange(newValue)}
                                        />
                                    </Box>
                                )}
                            />
                            <Controller
                                name="address"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="العنوان"
                                        multiline
                                        rows={2}
                                        sx={{ gridColumn: 'span 2' }}
                                    />
                                )}
                            />
                            <Controller
                                name="notes"
                                control={control}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="ملاحظات"
                                        multiline
                                        rows={2}
                                        sx={{ gridColumn: 'span 2' }}
                                    />
                                )}
                            />
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>إلغاء</Button>
                        <Button type="submit" variant="contained">
                            {editingSupplier ? 'حفظ التعديلات' : 'إضافة'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
                <DialogTitle>تأكيد الحذف</DialogTitle>
                <DialogContent>
                    <Typography>
                        هل أنت متأكد من حذف المورد "{deleteConfirm?.name_ar}"؟
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
                    <Button
                        onClick={() => handleDelete(deleteConfirm?.id)}
                        color="error"
                        variant="contained"
                    >
                        حذف
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Payment Dialog */}
            <Dialog open={!!paymentDialog} onClose={() => { setPaymentDialog(null); setPaymentPendingFiles([]) }} maxWidth="sm" fullWidth>
                <DialogTitle>تسجيل سداد للمورّد: {paymentDialog?.name_ar}</DialogTitle>
                <form onSubmit={handlePaymentSubmit(async (data) => {
                    try {
                        setPaymentLoading(true)
                        const paymentRes = await supplierAPI.recordPayment(paymentDialog.id, data)
                        const createdPaymentId = paymentRes?.data?.data?.id
                        let attachmentWarning = null

                        if (createdPaymentId && paymentPendingFiles.length > 0) {
                            try {
                                await entityAttachmentAPI.upload('supplier_payment', createdPaymentId, paymentPendingFiles)
                            } catch (uploadErr) {
                                attachmentWarning = uploadErr?.response?.data?.message || 'تم تسجيل السداد لكن فشل رفع بعض المرفقات'
                            }
                        }

                        if (attachmentWarning) {
                            setError(attachmentWarning)
                        }

                        setPaymentPendingFiles([])
                        setPaymentDialog(null)
                        fetchSuppliers()
                    } catch (err) {
                        console.error('Payment Error:', err)
                        setError(err.response?.data?.message || 'فشل تسجيل السداد')
                    } finally {
                        setPaymentLoading(false)
                    }
                })}>
                    <DialogContent>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            الرصيد الحالي المستحق: <strong>{parseFloat(paymentDialog?.current_balance || 0).toFixed(2)}</strong>
                        </Alert>
                        <Box sx={{ display: 'grid', gap: 2 }}>
                            <Controller
                                name="amount"
                                control={paymentControl}
                                rules={{
                                    required: 'المبلغ مطلوب',
                                    min: { value: 1, message: 'المبلغ يجب أن يكون أكبر من 0' }
                                }}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="مبلغ السداد"
                                        type="number"
                                        fullWidth
                                        required
                                        error={!!paymentErrors.amount}
                                        helperText={paymentErrors.amount?.message}
                                        InputProps={{
                                            startAdornment: <InputAdornment position="start">ر.س</InputAdornment>
                                        }}
                                    />
                                )}
                            />
                            <Controller
                                name="payment_method"
                                control={paymentControl}
                                rules={{ required: true }}
                                render={({ field }) => (
                                    <TextField {...field} select label="طريقة الدفع" fullWidth>
                                        <MenuItem value="cash">نقدي (Cash)</MenuItem>
                                        <MenuItem value="bank_transfer">تحويل بنكي</MenuItem>
                                        <MenuItem value="check">شيك</MenuItem>
                                        <MenuItem value="card">بطاقة</MenuItem>
                                    </TextField>
                                )}
                            />
                            {watchPaymentMethod && (
                                <Controller
                                    name="payment_account_code"
                                    control={paymentControl}
                                    rules={{ required: 'حساب الدفع مطلوب' }}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            select
                                            label="حساب الدفع"
                                            fullWidth
                                            required
                                            disabled={loadingPaymentAccounts}
                                            error={!!paymentErrors.payment_account_code}
                                            helperText={paymentErrors.payment_account_code?.message}
                                            sx={{ mt: 1 }}
                                        >
                                            {loadingPaymentAccounts ? (
                                                <MenuItem disabled>جاري التحميل...</MenuItem>
                                            ) : paymentAccounts.length === 0 ? (
                                                <MenuItem disabled>لا يوجد حسابات متاحة</MenuItem>
                                            ) : (
                                                paymentAccounts.map(acc => (
                                                    <MenuItem key={acc.code} value={acc.code}>
                                                        {acc.name_ar} {acc.balance ? `(${parseFloat(acc.balance).toFixed(2)})` : ''}
                                                    </MenuItem>
                                                ))
                                            )}
                                        </TextField>
                                    )}
                                />
                            )}
                            <Controller
                                name="payment_date"
                                control={paymentControl}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        label="تاريخ السداد"
                                        type="date"
                                        fullWidth
                                        InputLabelProps={{ shrink: true }}
                                    />
                                )}
                            />
                            <Controller
                                name="reference"
                                control={paymentControl}
                                render={({ field }) => (
                                    <TextField {...field} label="رقم المرجع (شيك/تحويل)" fullWidth />
                                )}
                            />
                            <Controller
                                name="notes"
                                control={paymentControl}
                                render={({ field }) => (
                                    <TextField {...field} label="ملاحظات" multiline rows={2} fullWidth />
                                )}
                            />
                            <FileAttachmentsField
                                title="مرفقات مرجعية للسداد"
                                pendingFiles={paymentPendingFiles}
                                onPendingFilesChange={setPaymentPendingFiles}
                                helperText="أرفق صورة الإيصال أو أي ملف مرجعي. سيتم الرفع تلقائيًا بعد تسجيل السداد."
                                maxFiles={5}
                                maxFileSizeMB={15}
                            />
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => { setPaymentDialog(null); setPaymentPendingFiles([]) }}>إلغاء</Button>
                        <Button type="submit" variant="contained" color="success" disabled={paymentLoading}>
                            {paymentLoading ? <CircularProgress size={24} /> : 'تسجيل السداد'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* Supplier Statement Dialog */}
            <Dialog
                open={statementDialog.open}
                onClose={() => setStatementDialog({ open: false, supplier: null })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    كشف حساب المورد: {statementDialog.supplier?.name_ar}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, mt: 1 }}>
                        <TextField
                            label="من تاريخ"
                            type="date"
                            size="small"
                            value={statementFilters.from_date}
                            onChange={(e) => setStatementFilters(prev => ({ ...prev, from_date: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            label="إلى تاريخ"
                            type="date"
                            size="small"
                            value={statementFilters.to_date}
                            onChange={(e) => setStatementFilters(prev => ({ ...prev, to_date: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                        />
                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            disabled={statementLoading || !statementDialog.supplier}
                            onClick={() => statementDialog.supplier && fetchSupplierStatement(statementDialog.supplier.id, statementFilters)}
                        >
                            تحديث
                        </Button>
                    </Box>

                    {statementLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <>
                            {statementData?.statement ? (
                                <>
                                    <Alert severity="info" sx={{ mb: 2 }}>
                                        الرصيد الافتتاحي: <strong>{formatMoney(statementData.statement.opening_balance)}</strong>
                                        {' | '}
                                        إجمالي المدين: <strong>{formatMoney(statementData.statement.period_debit)}</strong>
                                        {' | '}
                                        إجمالي الدائن: <strong>{formatMoney(statementData.statement.period_credit)}</strong>
                                        {' | '}
                                        الرصيد الختامي: <strong>{formatMoney(statementData.statement.closing_balance)}</strong>
                                    </Alert>

                                    <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>التاريخ</TableCell>
                                                    <TableCell>رقم القيد</TableCell>
                                                    <TableCell>المصدر</TableCell>
                                                    <TableCell>الوصف</TableCell>
                                                    <TableCell align="right">مدين</TableCell>
                                                    <TableCell align="right">دائن</TableCell>
                                                    <TableCell align="right">الرصيد الجاري</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {statementData.statement.movements.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={7} align="center">
                                                            لا توجد حركات ضمن الفترة المحددة
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    statementData.statement.movements.map((row, idx) => (
                                                        <TableRow key={`${row.journal_entry_id}-${row.account_code}-${idx}`}>
                                                            <TableCell>{row.entry_date}</TableCell>
                                                            <TableCell>{row.entry_number}</TableCell>
                                                            <TableCell>{row.source_type || '-'}</TableCell>
                                                            <TableCell>{row.description || '-'}</TableCell>
                                                            <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>
                                                                {formatMoney(row.debit)}
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
                                                                {formatMoney(row.credit)}
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                                                                {formatMoney(row.running_balance)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </>
                            ) : (
                                <Alert severity="warning">لا توجد بيانات كشف حساب متاحة</Alert>
                            )}
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStatementDialog({ open: false, supplier: null })}>إغلاق</Button>
                </DialogActions>
            </Dialog>

            {/* AP Aging Dialog */}
            <Dialog open={agingDialogOpen} onClose={() => setAgingDialogOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>تقرير أعمار الدائنين (من GL)</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, mt: 1 }}>
                        <TextField
                            label="حتى تاريخ"
                            type="date"
                            size="small"
                            value={agingDate}
                            onChange={(e) => setAgingDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            disabled={agingLoading}
                            onClick={() => fetchAgingReport(agingDate)}
                        >
                            تحديث
                        </Button>
                    </Box>

                    {agingLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <>
                            {agingReport?.summary && (
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    إجمالي المستحقات على الموردين: <strong>{formatMoney(agingReport.summary.total_outstanding_payables)}</strong>
                                    {' | '}
                                    إجمالي أرصدة الموردين الدائنة: <strong>{formatMoney(agingReport.summary.total_credit_balances)}</strong>
                                    {' | '}
                                    صافي الدائنين: <strong>{formatMoney(agingReport.summary.net_payables)}</strong>
                                </Alert>
                            )}

                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>الكود</TableCell>
                                            <TableCell>المورد</TableCell>
                                            <TableCell align="right">0-30</TableCell>
                                            <TableCell align="right">31-60</TableCell>
                                            <TableCell align="right">61-90</TableCell>
                                            <TableCell align="right">+91</TableCell>
                                            <TableCell align="right">المستحق</TableCell>
                                            <TableCell align="right">الرصيد الدائن</TableCell>
                                            <TableCell align="right">الصافي</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {!agingReport?.rows || agingReport.rows.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={9} align="center">
                                                    لا توجد بيانات للتاريخ المحدد
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            agingReport.rows.map((row) => (
                                                <TableRow key={row.supplier_id}>
                                                    <TableCell>{row.supplier_code}</TableCell>
                                                    <TableCell>{row.supplier_name}</TableCell>
                                                    <TableCell align="right">{formatMoney(row.bucket_0_30)}</TableCell>
                                                    <TableCell align="right">{formatMoney(row.bucket_31_60)}</TableCell>
                                                    <TableCell align="right">{formatMoney(row.bucket_61_90)}</TableCell>
                                                    <TableCell align="right">{formatMoney(row.bucket_91_plus)}</TableCell>
                                                    <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
                                                        {formatMoney(row.outstanding_payable)}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>
                                                        {formatMoney(row.credit_balance)}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                                        {formatMoney(row.net_balance)}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAgingDialogOpen(false)}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}

