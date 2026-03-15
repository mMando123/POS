import { useState, useEffect, useCallback } from 'react'
import {
    Box, Typography, Paper, Grid, Card, CardContent, Button,
    TextField, MenuItem, FormControl, InputLabel, Select,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    CircularProgress, Tooltip, InputAdornment, Divider
} from '@mui/material'
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { arSA } from 'date-fns/locale'
import {
    Receipt as ReceiptIcon,
    Search as SearchIcon,
    FilterList as FilterIcon,
    Visibility as ViewIcon,
    Download as DownloadIcon,
    Refresh as RefreshIcon,
    Person as PersonIcon,
    Money as MoneyIcon,
    LocalPrintshop as PrintIcon
} from '@mui/icons-material'
import { orderAPI, userAPI } from '../services/api'
import { useThemeConfig } from '../contexts/ThemeContext'
import { exportToExcel } from '../utils/excelExport'
import { printReceipt } from '../components/Receipt'
import toast from 'react-hot-toast'

const statusColors = {
    completed: 'success',
    handed_to_cashier: 'primary',
    refunded: 'warning',
    cancelled: 'error',
    default: 'default'
}

const statusLabels = {
    completed: 'مكتمل',
    handed_to_cashier: 'مستلم/مدفوع',
    refunded: 'مسترجع',
    cancelled: 'ملغي',
}

export default function SalesInvoices() {
    const { formatCurrency } = useThemeConfig()

    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [users, setUsers] = useState([])

    // Details Dialog
    const [selectedInvoice, setSelectedInvoice] = useState(null)
    const [detailsOpen, setDetailsOpen] = useState(false)

    // Filters
    const [filters, setFilters] = useState({
        searchTerm: '',
        cashierId: '',
        status: '',
        fromDate: null,
        toDate: null
    })

    // Stats
    const [stats, setStats] = useState({
        totalInvoices: 0,
        totalSales: 0,
        totalTax: 0,
        cashSales: 0,
        cardSales: 0
    })

    const fetchUsers = async () => {
        try {
            const res = await userAPI.getAll()
            setUsers(res.data.data || [])
        } catch (error) {
            console.error('Failed to fetch users', error)
        }
    }

    const fetchInvoices = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch branch sales and filter locally by POS-relevant order channels.
            const params = {
                status: filters.status || undefined,
                search: filters.searchTerm || undefined,
                limit: 500 // Fetch a good amount for the page to filter/export locally
            }

            if (filters.fromDate) {
                params.date_from = filters.fromDate.toISOString()
            }
            if (filters.toDate) {
                params.date_to = filters.toDate.toISOString()
            }

            const res = await orderAPI.getAll(params)
            let data = res.data.data || []
            const billableOrderTypes = new Set(['walkin', 'dine_in', 'takeaway', 'delivery'])
            data = data.filter(inv => billableOrderTypes.has(String(inv.order_type || '')))

            // Local filtering for things not natively supported in a robust way by the generic list endpoint
            if (filters.cashierId) {
                data = data.filter(inv => inv.user_id === parseInt(filters.cashierId) || inv.cashier_id === parseInt(filters.cashierId))
            }

            // Also exclude pending/preparing statuses for invoices page
            data = data.filter(inv => ['completed', 'handed_to_cashier', 'cancelled', 'refunded'].includes(inv.status))

            setInvoices(data)

            // Compute stats
            let tInv = data.length
            let tSales = 0
            let tTax = 0
            let cashS = 0
            let cardS = 0

            data.forEach(inv => {
                if (inv.status !== 'cancelled') {
                    const total = parseFloat(inv.total) || 0;
                    tSales += total;
                    tTax += parseFloat(inv.tax) || 0;
                    // Deduce payment method if available (assume from payments array or payment_method field)
                    if (inv.payments && inv.payments.length > 0) {
                        inv.payments.forEach(p => {
                            if (p.payment_method === 'cash') cashS += parseFloat(p.amount) || 0;
                            if (p.payment_method === 'card') cardS += parseFloat(p.amount) || 0;
                        })
                    } else {
                        // fallback if no payments array loaded
                        if (inv.payment_method === 'cash') cashS += total;
                        else if (inv.payment_method === 'card') cardS += total;
                    }
                }
            })

            setStats({
                totalInvoices: tInv,
                totalSales: tSales,
                totalTax: tTax,
                cashSales: cashS,
                cardSales: cardS
            })

        } catch (error) {
            toast.error('فشل جلب الفواتير')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [filters])

    useEffect(() => {
        fetchUsers()
    }, [])

    useEffect(() => {
        fetchInvoices()
    }, [fetchInvoices])

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }))
    }

    const clearFilters = () => {
        setFilters({
            searchTerm: '',
            cashierId: '',
            status: '',
            fromDate: null,
            toDate: null
        })
    }

    const handleViewInvoice = (invoice) => {
        setSelectedInvoice(invoice)
        setDetailsOpen(true)
    }

    const handleExport = () => {
        if (invoices.length === 0) return toast.error('لا توجد بيانات للتصدير')

        const dataToExport = invoices.map(inv => ({
            'رقم الفاتورة': inv.order_number,
            'التاريخ': new Date(inv.created_at).toLocaleString('ar-SA'),
            'الكاشير': inv.User?.name_ar || inv.User?.username || '-',
            'الإجمالي (شامل الضريبة)': parseFloat(inv.total).toFixed(2),
            'قيمة الضريبة': parseFloat(inv.tax).toFixed(2),
            'الخصم': parseFloat(inv.discount_amount).toFixed(2),
            'الحالة': statusLabels[inv.status] || inv.status
        }))

        exportToExcel(dataToExport, `Sales_Invoices_${new Date().toISOString().split('T')[0]}`)
    }

    const getOrderTaxRateLabel = (order) => {
        const subtotal = parseFloat(order?.subtotal || 0)
        const tax = parseFloat(order?.tax || 0)
        if (subtotal <= 0) return '0'
        return ((tax / subtotal) * 100).toFixed(2).replace(/\.00$/, '')
    }

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={arSA}>
            <Box sx={{ p: 3 }}>
                {/* Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ReceiptIcon color="primary" fontSize="large" />
                        فواتير البيع المباشر
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            onClick={fetchInvoices}
                        >
                            تحديث
                        </Button>
                        <Button
                            variant="contained"
                            color="success"
                            startIcon={<DownloadIcon />}
                            onClick={handleExport}
                            disabled={!invoices.length}
                        >
                            تصدير Excel
                        </Button>
                    </Box>
                </Box>

                {/* Summary Cards */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                            <CardContent>
                                <Typography variant="subtitle2">إجمالي الفواتير</Typography>
                                <Typography variant="h4" fontWeight="bold">{stats.totalInvoices}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}>
                            <CardContent>
                                <Typography variant="subtitle2">إجمالي المبيعات</Typography>
                                <Typography variant="h4" fontWeight="bold">{formatCurrency(stats.totalSales)}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'info.light', color: 'info.contrastText' }}>
                            <CardContent>
                                <Typography variant="subtitle2">مبيعات نقدية</Typography>
                                <Typography variant="h4" fontWeight="bold">{formatCurrency(stats.cashSales)}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                            <CardContent>
                                <Typography variant="subtitle2">إجمالي الضريبة</Typography>
                                <Typography variant="h4" fontWeight="bold">{formatCurrency(stats.totalTax)}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                {/* Filters */}
                <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={3}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="بحث برقم الفاتورة..."
                                value={filters.searchTerm}
                                onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
                                }}
                            />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <FormControl fullWidth size="small">
                                <InputLabel>الكاشير</InputLabel>
                                <Select
                                    value={filters.cashierId}
                                    onChange={(e) => handleFilterChange('cashierId', e.target.value)}
                                    label="الكاشير"
                                >
                                    <MenuItem value="">الكل</MenuItem>
                                    {users.map(u => (
                                        <MenuItem key={u.id} value={u.id}>{u.name_ar || u.username}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <FormControl fullWidth size="small">
                                <InputLabel>الحالة</InputLabel>
                                <Select
                                    value={filters.status}
                                    onChange={(e) => handleFilterChange('status', e.target.value)}
                                    label="الحالة"
                                >
                                    <MenuItem value="">الكل</MenuItem>
                                    <MenuItem value="completed">مكتمل</MenuItem>
                                    <MenuItem value="handed_to_cashier">مستلم/مدفوع</MenuItem>
                                    <MenuItem value="cancelled">ملغي</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <DatePicker
                                label="من تاريخ"
                                value={filters.fromDate}
                                onChange={(date) => handleFilterChange('fromDate', date)}
                                slotProps={{ textField: { size: 'small', fullWidth: true } }}
                            />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <DatePicker
                                label="إلى تاريخ"
                                value={filters.toDate}
                                onChange={(date) => handleFilterChange('toDate', date)}
                                slotProps={{ textField: { size: 'small', fullWidth: true } }}
                            />
                        </Grid>
                        <Grid item xs={12} md={1}>
                            <Button
                                fullWidth
                                variant="outlined"
                                color="error"
                                onClick={clearFilters}
                                sx={{ minWidth: 'auto' }}
                            >
                                مسح
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>

                {/* Data Table */}
                <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                    <Table>
                        <TableHead sx={{ bgcolor: 'grey.100' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>رقم الفاتورة</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>التاريخ والوقت</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>الكاشير المصدر</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>الإجمالي</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>الحالة</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>إجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                        <CircularProgress />
                                    </TableCell>
                                </TableRow>
                            ) : invoices.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                        <Typography color="text.secondary">لا توجد فواتير مطابقة للبحث</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                invoices.map((inv) => (
                                    <TableRow key={inv.id} hover>
                                        <TableCell>
                                            <Typography fontWeight="bold">#{inv.order_number}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            {new Date(inv.created_at).toLocaleString('ar-SA')}
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <PersonIcon fontSize="small" color="disabled" />
                                                {inv.User?.name_ar || inv.User?.username || '-'}
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Typography fontWeight="bold" color="primary.main">
                                                {formatCurrency(parseFloat(inv.total))}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={statusLabels[inv.status] || inv.status}
                                                color={statusColors[inv.status] || statusColors.default}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title="عرض التفاصيل">
                                                <IconButton color="info" onClick={() => handleViewInvoice(inv)}>
                                                    <ViewIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="طباعة الفاتورة">
                                                <IconButton
                                                    color="primary"
                                                    onClick={() => printReceipt(inv)}
                                                >
                                                    <PrintIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {/* Details Dialog */}
                <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
                    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'primary.main', color: 'white' }}>
                        <Typography variant="h6">تفاصيل الفاتورة #{selectedInvoice?.order_number}</Typography>
                        <Chip
                            label={statusLabels[selectedInvoice?.status] || selectedInvoice?.status}
                            color={statusColors[selectedInvoice?.status] || 'default'}
                            size="small"
                            sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 'bold' }}
                        />
                    </DialogTitle>
                    <DialogContent sx={{ mt: 2 }}>
                        {selectedInvoice && (
                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography color="text.secondary">تاريخ الإصدار</Typography>
                                    <Typography fontWeight="bold">{new Date(selectedInvoice.created_at).toLocaleString('ar-SA')}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography color="text.secondary">الكاشير</Typography>
                                    <Typography fontWeight="bold">{selectedInvoice.User?.name_ar || selectedInvoice.User?.username || '-'}</Typography>
                                </Box>

                                <Divider sx={{ my: 2 }} />

                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>العناصر المشتراة:</Typography>
                                {selectedInvoice.items?.map((item, index) => (
                                    <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px dashed #e0e0e0' }}>
                                        <Box>
                                            <Typography>{item.item_name_ar}</Typography>
                                            <Typography variant="caption" color="text.secondary">الكمية: {item.quantity}</Typography>
                                        </Box>
                                        <Typography fontWeight="bold">
                                            {formatCurrency(parseFloat(item.total_price))}
                                        </Typography>
                                    </Box>
                                ))}

                                <Box sx={{ mt: 3, pt: 2, bgcolor: '#f8f9fa', p: 2, borderRadius: 2 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography color="text.secondary">المجموع الفرعي:</Typography>
                                        <Typography>{formatCurrency(parseFloat(selectedInvoice.subtotal))}</Typography>
                                    </Box>
                                    {parseFloat(selectedInvoice.discount_amount) > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography color="error.main">الخصم:</Typography>
                                            <Typography color="error.main">-{formatCurrency(parseFloat(selectedInvoice.discount_amount))}</Typography>
                                        </Box>
                                    )}
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography color="text.secondary">الضريبة ({getOrderTaxRateLabel(selectedInvoice)}%):</Typography>
                                        <Typography>{formatCurrency(parseFloat(selectedInvoice.tax))}</Typography>
                                    </Box>
                                    <Divider sx={{ my: 1 }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="h6" fontWeight="bold">الإجمالي المشتمل:</Typography>
                                        <Typography variant="h5" fontWeight="bold" color="primary.main">
                                            {formatCurrency(parseFloat(selectedInvoice.total))}
                                        </Typography>
                                    </Box>
                                </Box>

                                {selectedInvoice.notes && (
                                    <Box sx={{ mt: 2, p: 2, bgcolor: '#fff3e0', borderRadius: 1 }}>
                                        <Typography variant="subtitle2" color="warning.dark">ملاحظات الطلب:</Typography>
                                        <Typography variant="body2">{selectedInvoice.notes}</Typography>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions sx={{ p: 2 }}>
                        <Button onClick={() => setDetailsOpen(false)} variant="contained" color="inherit" disableElevation>
                            إغلاق
                        </Button>
                        <Button
                            color="primary"
                            variant="outlined"
                            startIcon={<PrintIcon />}
                            onClick={() => printReceipt(selectedInvoice)}
                        >
                            طباعة
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </LocalizationProvider>
    )
}
