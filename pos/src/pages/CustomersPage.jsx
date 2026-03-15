import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    Paper,
    Snackbar,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material'
import {
    Person as PersonIcon,
    Phone as PhoneIcon,
    Refresh as RefreshIcon,
    Visibility as VisibilityIcon
} from '@mui/icons-material'
import { customerAPI } from '../services/api'

const formatMoney = (value) => {
    const amount = Number(value || 0)
    return amount.toLocaleString('ar-SA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })
}

const formatDateTime = (value) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString('ar-SA')
}

const statusColor = {
    pending: 'warning',
    approved: 'info',
    new: 'info',
    confirmed: 'info',
    preparing: 'warning',
    ready: 'success',
    handed_to_cashier: 'primary',
    completed: 'success',
    cancelled: 'error'
}

const statusLabel = {
    pending: 'معلق',
    approved: 'مقبول',
    new: 'جديد',
    confirmed: 'مؤكد',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    handed_to_cashier: 'عند الكاشير',
    completed: 'مكتمل',
    cancelled: 'ملغي'
}

export default function CustomersPage() {
    const [loading, setLoading] = useState(false)
    const [customers, setCustomers] = useState([])
    const [summary, setSummary] = useState({
        total_customers: 0,
        total_orders: 0,
        total_spent: 0,
        total_loyalty_points: 0
    })
    const [search, setSearch] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState(null)
    const [ordersOpen, setOrdersOpen] = useState(false)
    const [ordersLoading, setOrdersLoading] = useState(false)
    const [customerOrders, setCustomerOrders] = useState([])
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

    const fetchCustomers = useCallback(async () => {
        try {
            setLoading(true)
            const res = await customerAPI.getAll({ search: search.trim(), limit: 200, offset: 0 })
            setCustomers(res.data?.data || [])
            setSummary(res.data?.summary || {
                total_customers: 0,
                total_orders: 0,
                total_spent: 0,
                total_loyalty_points: 0
            })
        } catch (error) {
            setSnackbar({
                open: true,
                message: error.response?.data?.message || 'تعذر تحميل بيانات العملاء',
                severity: 'error'
            })
        } finally {
            setLoading(false)
        }
    }, [search])

    useEffect(() => {
        fetchCustomers()
    }, [fetchCustomers])

    const sortedCustomers = useMemo(() => {
        return [...customers].sort((a, b) => Number(b.total_spent || 0) - Number(a.total_spent || 0))
    }, [customers])

    const openCustomerOrders = async (customer) => {
        try {
            setSelectedCustomer(customer)
            setOrdersOpen(true)
            setOrdersLoading(true)
            const res = await customerAPI.getOrders(customer.id, { limit: 50 })
            setCustomerOrders(res.data?.data || [])
        } catch (error) {
            setCustomerOrders([])
            setSnackbar({
                open: true,
                message: error.response?.data?.message || 'تعذر تحميل طلبات العميل',
                severity: 'error'
            })
        } finally {
            setOrdersLoading(false)
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">إدارة العملاء</Typography>
                    <Typography variant="body2" color="text.secondary">
                        عرض بيانات العملاء وحركة الطلبات لكل عميل
                    </Typography>
                </Box>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchCustomers}>
                    تحديث
                </Button>
            </Box>

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography variant="body2" color="text.secondary">عدد العملاء</Typography>
                            <Typography variant="h5" fontWeight="bold">{summary.total_customers}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography variant="body2" color="text.secondary">إجمالي الطلبات</Typography>
                            <Typography variant="h5" fontWeight="bold">{summary.total_orders}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography variant="body2" color="text.secondary">إجمالي مشتريات العملاء</Typography>
                            <Typography variant="h6" fontWeight="bold">{formatMoney(summary.total_spent)} ر.س</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography variant="body2" color="text.secondary">إجمالي نقاط الولاء</Typography>
                            <Typography variant="h5" fontWeight="bold">{summary.total_loyalty_points}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Paper sx={{ p: 2, mb: 2 }}>
                <TextField
                    fullWidth
                    label="بحث بالاسم أو رقم الهاتف"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') fetchCustomers()
                    }}
                />
            </Paper>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>العميل</TableCell>
                            <TableCell>رقم الهاتف</TableCell>
                            <TableCell>العنوان</TableCell>
                            <TableCell>عدد الطلبات</TableCell>
                            <TableCell>إجمالي المشتريات</TableCell>
                            <TableCell>نقاط الولاء</TableCell>
                            <TableCell>إجراءات</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                    <CircularProgress size={26} />
                                </TableCell>
                            </TableRow>
                        ) : sortedCustomers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">لا توجد بيانات عملاء</Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            sortedCustomers.map((customer) => (
                                <TableRow key={customer.id} hover>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <PersonIcon fontSize="small" color="action" />
                                            <Typography fontWeight="bold">
                                                {customer.name || 'بدون اسم'}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <PhoneIcon fontSize="small" color="action" />
                                            {customer.phone}
                                        </Box>
                                    </TableCell>
                                    <TableCell>{customer.address || '-'}</TableCell>
                                    <TableCell>{customer.total_orders || 0}</TableCell>
                                    <TableCell>{formatMoney(customer.total_spent)} ر.س</TableCell>
                                    <TableCell>
                                        <Chip label={customer.loyalty_points || 0} size="small" color="info" />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<VisibilityIcon />}
                                            onClick={() => openCustomerOrders(customer)}
                                        >
                                            عرض
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={ordersOpen} onClose={() => setOrdersOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>
                    طلبات العميل: {selectedCustomer?.name || selectedCustomer?.phone || '-'}
                </DialogTitle>
                <DialogContent>
                    {selectedCustomer && (
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2"><b>الاسم:</b> {selectedCustomer.name || '-'}</Typography>
                            <Typography variant="body2"><b>الهاتف:</b> {selectedCustomer.phone || '-'}</Typography>
                            <Typography variant="body2"><b>إجمالي الطلبات:</b> {selectedCustomer.total_orders || 0}</Typography>
                            <Typography variant="body2"><b>إجمالي المشتريات:</b> {formatMoney(selectedCustomer.total_spent)} ر.س</Typography>
                        </Box>
                    )}

                    {ordersLoading ? (
                        <Box sx={{ py: 4, textAlign: 'center' }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : customerOrders.length === 0 ? (
                        <Alert severity="info">لا توجد طلبات لهذا العميل</Alert>
                    ) : (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>رقم الطلب</TableCell>
                                        <TableCell>التاريخ</TableCell>
                                        <TableCell>نوع الطلب</TableCell>
                                        <TableCell>طريقة الدفع</TableCell>
                                        <TableCell>حالة الدفع</TableCell>
                                        <TableCell>الحالة</TableCell>
                                        <TableCell>الإجمالي</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {customerOrders.map((order) => (
                                        <TableRow key={order.id}>
                                            <TableCell>{order.order_number}</TableCell>
                                            <TableCell>{formatDateTime(order.created_at)}</TableCell>
                                            <TableCell>{order.order_type}</TableCell>
                                            <TableCell>{order.payment_method}</TableCell>
                                            <TableCell>{order.payment_status}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={statusLabel[order.status] || order.status}
                                                    color={statusColor[order.status] || 'default'}
                                                />
                                            </TableCell>
                                            <TableCell>{formatMoney(order.total)} ر.س</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOrdersOpen(false)}>إغلاق</Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={3500}
                onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} variant="filled">
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    )
}

