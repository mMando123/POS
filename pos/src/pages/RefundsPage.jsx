import { useState, useEffect } from 'react'
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    Button,
    Chip,
    TextField,
    Grid,
    Card,
    CardContent,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    CircularProgress,
    IconButton,
    Tooltip,
    Divider
} from '@mui/material'
import {
    Refresh as RefreshIcon,
    Visibility as ViewIcon,
    Download as DownloadIcon,
    ReceiptLong as RefundIcon,
    TrendingDown as TrendingDownIcon,
    Cancel as CancelIcon,
    CheckCircle as CheckCircleIcon
} from '@mui/icons-material'
import { refundAPI, userAPI } from '../services/api'
import { useThemeConfig } from '../contexts/ThemeContext'
import { exportToExcel } from '../utils/excelExport'
import EntityAttachmentsPanel from '../components/EntityAttachmentsPanel'

export default function RefundsPage() {
    const { formatCurrency } = useThemeConfig()
    const [refunds, setRefunds] = useState([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(0)
    const [rowsPerPage, setRowsPerPage] = useState(20)
    const [totalCount, setTotalCount] = useState(0)
    const [error, setError] = useState(null)

    // Filters
    const [filters, setFilters] = useState({
        refund_type: '',
        cashier_id: '',
        from_date: '',
        to_date: ''
    })

    // Summary
    const [summary, setSummary] = useState(null)

    // View dialog
    const [selectedRefund, setSelectedRefund] = useState(null)
    const [viewDialogOpen, setViewDialogOpen] = useState(false)

    // Users for filter
    const [users, setUsers] = useState([])

    useEffect(() => {
        fetchRefunds()
        fetchSummary()
        fetchUsers()
    }, [page, rowsPerPage, filters])

    const fetchRefunds = async () => {
        setLoading(true)
        try {
            const params = {
                page: page + 1,
                limit: rowsPerPage,
                ...filters
            }
            // Remove empty filters
            Object.keys(params).forEach(key => {
                if (!params[key]) delete params[key]
            })

            const response = await refundAPI.getAll(params)
            setRefunds(response.data.data)
            setTotalCount(response.data.pagination.total)
            setError(null)
        } catch (err) {
            console.error('Failed to fetch refunds', err)
            setError('فشل في تحميل المرتجعات')
        } finally {
            setLoading(false)
        }
    }

    const fetchSummary = async () => {
        try {
            const params = {}
            if (filters.from_date && filters.to_date) {
                params.start_date = filters.from_date
                params.end_date = filters.to_date
            }
            const response = await refundAPI.getDailySummary(params)
            setSummary(response.data.data)
        } catch (err) {
            console.error('Failed to fetch summary', err)
        }
    }

    const fetchUsers = async () => {
        try {
            const response = await userAPI.getAll()
            setUsers(response.data.data || [])
        } catch (err) {
            console.error('Failed to fetch users', err)
        }
    }

    const handleViewRefund = (refund) => {
        setSelectedRefund(refund)
        setViewDialogOpen(true)
    }

    const getRefundTypeLabel = (type) => {
        switch (type) {
            case 'FULL_REFUND': return 'استرداد كامل'
            case 'PARTIAL_REFUND': return 'استرداد جزئي'
            case 'VOID': return 'إلغاء'
            default: return type
        }
    }

    const getRefundTypeColor = (type) => {
        switch (type) {
            case 'FULL_REFUND': return 'error'
            case 'PARTIAL_REFUND': return 'warning'
            case 'VOID': return 'default'
            default: return 'default'
        }
    }

    const getCategoryLabel = (category) => {
        const labels = {
            'customer_request': 'طلب العميل',
            'quality_issue': 'مشكلة جودة',
            'wrong_order': 'طلب خاطئ',
            'delivery_issue': 'مشكلة توصيل',
            'payment_issue': 'مشكلة دفع',
            'duplicate_order': 'طلب مكرر',
            'system_error': 'خطأ نظام',
            'other': 'أخرى'
        }
        return labels[category] || category
    }

    // const formatCurrency = (amount) => {
    //    return new Intl.NumberFormat('ar-SA', {
    //        style: 'currency',
    //        currency: 'SAR'
    //    }).format(amount)
    // }

    const formatDate = (date) => {
        if (!date) return '-'
        const d = new Date(date)
        return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }

    const handleExport = () => {
        if (!refunds || refunds.length === 0) return;

        const dataToExport = refunds.map(refund => ({
            'رقم الاسترداد': refund.refund_number,
            'رقم الطلب': refund.Order?.order_number || '-',
            'النوع': getRefundTypeLabel(refund.refund_type),
            'المبلغ': refund.refund_amount,
            'السبب': getCategoryLabel(refund.refund_category) + (refund.refund_reason ? ` - ${refund.refund_reason}` : ''),
            'الكاشير الأصلي': refund.originalCashier?.name_ar || '-',
            'من قام بالاسترداد': refund.processor?.name_ar || '-',
            'التاريخ': formatDate(refund.created_at)
        }));

        exportToExcel(dataToExport, `Refunds_Report_${new Date().toISOString().split('T')[0]}`);
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <RefundIcon color="error" />
                    إدارة المرتجعات
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={() => { fetchRefunds(); fetchSummary() }}
                    >
                        تحديث
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<DownloadIcon />}
                        onClick={handleExport}
                    >
                        تصدير Excel
                    </Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            {summary && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
                            <CardContent>
                                <Typography variant="subtitle2">
                                    {filters.from_date && filters.to_date ? 'إجمالي المرتجعات للفترة' : 'إجمالي المرتجعات اليوم'}
                                </Typography>
                                <Typography variant="h4">{summary.total_refunds}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                            <CardContent>
                                <Typography variant="subtitle2">قيمة المرتجعات</Typography>
                                <Typography variant="h4">{formatCurrency(summary.total_amount)}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="subtitle2">استرداد كامل</Typography>
                                <Typography variant="h4" color="error">{summary.by_type?.FULL_REFUND || 0}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="subtitle2">إلغاء قبل التحضير</Typography>
                                <Typography variant="h4" color="text.secondary">{summary.by_type?.VOID || 0}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>نوع الاسترداد</InputLabel>
                            <Select
                                value={filters.refund_type}
                                onChange={(e) => setFilters({ ...filters, refund_type: e.target.value })}
                                label="نوع الاسترداد"
                            >
                                <MenuItem value="">الكل</MenuItem>
                                <MenuItem value="FULL_REFUND">استرداد كامل</MenuItem>
                                <MenuItem value="PARTIAL_REFUND">استرداد جزئي</MenuItem>
                                <MenuItem value="VOID">إلغاء</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>الكاشير الأصلي</InputLabel>
                            <Select
                                value={filters.cashier_id}
                                onChange={(e) => setFilters({ ...filters, cashier_id: e.target.value })}
                                label="الكاشير الأصلي"
                            >
                                <MenuItem value="">الكل</MenuItem>
                                {users.map(user => (
                                    <MenuItem key={user.id} value={user.id}>{user.name_ar}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            label="من تاريخ"
                            type="date"
                            size="small"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={filters.from_date}
                            onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            label="إلى تاريخ"
                            type="date"
                            size="small"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={filters.to_date}
                            onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <Button
                            variant="outlined"
                            onClick={() => setFilters({ refund_type: '', cashier_id: '', from_date: '', to_date: '' })}
                        >
                            مسح الفلاتر
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {/* Error Alert */}
            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            )}

            {/* Refunds Table */}
            <TableContainer component={Paper}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>رقم الاسترداد</TableCell>
                                    <TableCell>رقم الطلب</TableCell>
                                    <TableCell>النوع</TableCell>
                                    <TableCell>المبلغ</TableCell>
                                    <TableCell>السبب</TableCell>
                                    <TableCell>الكاشير الأصلي</TableCell>
                                    <TableCell>من قام بالاسترداد</TableCell>
                                    <TableCell>التاريخ</TableCell>
                                    <TableCell>إجراءات</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {refunds.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center">
                                            <Typography color="text.secondary" sx={{ py: 4 }}>
                                                لا توجد مرتجعات
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    refunds.map((refund) => (
                                        <TableRow key={refund.id} hover>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {refund.refund_number}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>{refund.Order?.order_number}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={getRefundTypeLabel(refund.refund_type)}
                                                    color={getRefundTypeColor(refund.refund_type)}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography color="error.main" fontWeight="bold" sx={{ direction: 'ltr', textAlign: 'right' }}>
                                                    -{formatCurrency(refund.refund_amount)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Tooltip title={refund.refund_reason}>
                                                    <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                                                        {getCategoryLabel(refund.refund_category)}
                                                    </Typography>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>{refund.originalCashier?.name_ar || '-'}</TableCell>
                                            <TableCell>{refund.processor?.name_ar}</TableCell>
                                            <TableCell sx={{ direction: 'ltr', textAlign: 'right' }}>{formatDate(refund.created_at)}</TableCell>
                                            <TableCell>
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={() => handleViewRefund(refund)}
                                                >
                                                    <ViewIcon />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                        <TablePagination
                            component="div"
                            count={totalCount}
                            page={page}
                            onPageChange={(e, newPage) => setPage(newPage)}
                            rowsPerPage={rowsPerPage}
                            onRowsPerPageChange={(e) => {
                                setRowsPerPage(parseInt(e.target.value, 10))
                                setPage(0)
                            }}
                            labelRowsPerPage="عدد الصفوف:"
                            labelDisplayedRows={({ from, to, count }) => `${from}-${to} من ${count}`}
                        />
                    </>
                )}
            </TableContainer>

            {/* View Refund Dialog */}
            <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <RefundIcon color="error" />
                    تفاصيل الاسترداد
                </DialogTitle>
                <DialogContent dividers>
                    {selectedRefund && (
                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                <Typography color="text.secondary">رقم الاسترداد</Typography>
                                <Typography variant="h6">{selectedRefund.refund_number}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography color="text.secondary">رقم الطلب الأصلي</Typography>
                                <Typography variant="h6">{selectedRefund.Order?.order_number}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography color="text.secondary">نوع الاسترداد</Typography>
                                <Chip
                                    label={getRefundTypeLabel(selectedRefund.refund_type)}
                                    color={getRefundTypeColor(selectedRefund.refund_type)}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <Typography color="text.secondary">المبلغ المسترد</Typography>
                                <Typography variant="h5" color="error.main">
                                    -{formatCurrency(selectedRefund.refund_amount)}
                                </Typography>
                            </Grid>
                            <Grid item xs={12}>
                                <Divider sx={{ my: 1 }} />
                            </Grid>
                            <Grid item xs={6}>
                                <Typography color="text.secondary">الكاشير الأصلي</Typography>
                                <Typography>{selectedRefund.originalCashier?.name_ar || '-'}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography color="text.secondary">من قام بالاسترداد</Typography>
                                <Typography>{selectedRefund.processor?.name_ar}</Typography>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography color="text.secondary">سبب الاسترداد</Typography>
                                <Alert severity="info" sx={{ mt: 1 }}>
                                    <strong>{getCategoryLabel(selectedRefund.refund_category)}</strong>
                                    <br />
                                    {selectedRefund.refund_reason}
                                </Alert>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography color="text.secondary">تاريخ الاسترداد</Typography>
                                <Typography>{formatDate(selectedRefund.created_at)}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography color="text.secondary">استعادة المخزون</Typography>
                                {selectedRefund.stock_restored ? (
                                    <Chip icon={<CheckCircleIcon />} label="تم استعادة المخزون" color="success" size="small" />
                                ) : (
                                    <Chip icon={<CancelIcon />} label="لم يتم استعادة المخزون" color="warning" size="small" />
                                )}
                            </Grid>

                            {/* Refund Items */}
                            {selectedRefund.items && selectedRefund.items.length > 0 && (
                                <Grid item xs={12}>
                                    <Typography color="text.secondary" sx={{ mb: 1 }}>العناصر المستردة</Typography>
                                    <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>المنتج</TableCell>
                                                    <TableCell align="center">الكمية</TableCell>
                                                    <TableCell align="right">السعر</TableCell>
                                                    <TableCell align="right">الإجمالي</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {selectedRefund.items.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>{item.Menu?.name_ar}</TableCell>
                                                        <TableCell align="center">{item.refund_quantity}</TableCell>
                                                        <TableCell align="right">{formatCurrency(item.unit_price)}</TableCell>
                                                        <TableCell align="right">{formatCurrency(item.refund_amount)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Grid>
                            )}

                            {/* Audit Info */}
                            <Grid item xs={12}>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="subtitle2" color="text.secondary">معلومات التدقيق</Typography>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">عنوان IP</Typography>
                                <Typography variant="body2">{selectedRefund.ip_address || '-'}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">المتصفح</Typography>
                                <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                                    {selectedRefund.user_agent?.substring(0, 50) || '-'}...
                                </Typography>
                            </Grid>
                            <Grid item xs={12}>
                                <EntityAttachmentsPanel
                                    entityType="refund"
                                    entityId={selectedRefund.id}
                                    title="مرفقات مرتجع البيع"
                                />
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setViewDialogOpen(false)}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
