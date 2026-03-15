import { useState, useEffect } from 'react'
import {
    Box,
    Typography,
    Card,
    CardContent,
    Grid,
    Button,
    Chip,
    IconButton,
    CircularProgress,
    Divider,
    Paper,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    List,
    ListItem,
    ListItemText,
    Badge
} from '@mui/material'
import {
    CheckCircle as ApproveIcon,
    Cancel as RejectIcon,
    Refresh as RefreshIcon,
    Timer as TimerIcon,
    Person as PersonIcon,
    Phone as PhoneIcon,
    LocationOn as LocationIcon,
    Close as CloseIcon,
    LocalShipping as DeliveryIcon
} from '@mui/icons-material'
import toast from 'react-hot-toast'
import { orderAPI, settingsAPI } from '../services/api'

const orderTypeLabels = {
    online: '🌐 أونلاين',
    walkin: '🚶 حضوري',
    dine_in: '🍽️ صالة',
    takeaway: '📦 تيك أواي',
    delivery: '🚗 توصيل',
}

export default function PendingOrders() {
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedOrder, setSelectedOrder] = useState(null)
    const [detailsOpen, setDetailsOpen] = useState(false)
    const [processing, setProcessing] = useState({})
    const [operationRules, setOperationRules] = useState({
        enableOnlineOrders: true,
        autoAcceptOnline: false
    })

    useEffect(() => {
        refreshAll()
        const interval = setInterval(refreshAll, 30000)
        return () => clearInterval(interval)
    }, [])

    const fetchOperationRules = async () => {
        try {
            const response = await settingsAPI.getPublic()
            const data = response.data?.data || {}
            const nextRules = {
                enableOnlineOrders: data.enableOnlineOrders !== false,
                autoAcceptOnline: data.autoAcceptOnline === true
            }
            setOperationRules(nextRules)
            return nextRules
        } catch (error) {
            console.error('Error fetching operation rules:', error)
            return operationRules
        }
    }

    const fetchOrders = async (rules = operationRules) => {
        try {
            setLoading(true)

            if (rules.enableOnlineOrders === false) {
                setOrders([])
                return
            }

            const response = await orderAPI.getPendingOnline()
            let nextOrders = response.data.data || []

            if (rules.autoAcceptOnline && nextOrders.length > 0) {
                let acceptedCount = 0
                for (const order of nextOrders) {
                    try {
                        await orderAPI.approve(order.id)
                        acceptedCount += 1
                    } catch (approveError) {
                        console.error(`Auto-accept failed for order ${order.id}:`, approveError)
                    }
                }

                if (acceptedCount > 0) {
                    toast.success(`تم القبول التلقائي لـ ${acceptedCount} طلب/طلبات أونلاين`)
                    const refreshed = await orderAPI.getPendingOnline()
                    nextOrders = refreshed.data.data || []
                }
            }

            setOrders(nextOrders)
        } catch (error) {
            console.error('Error fetching pending orders:', error)
            setOrders([])
        } finally {
            setLoading(false)
        }
    }

    const refreshAll = async () => {
        const latestRules = await fetchOperationRules()
        await fetchOrders(latestRules)
    }

    const handleApprove = async (orderId) => {
        try {
            setProcessing(prev => ({ ...prev, [orderId]: true }))
            await orderAPI.approve(orderId)
            toast.success('تم قبول الطلب وإرساله للمطبخ!', { icon: '✅' })
            refreshAll()
        } catch (error) {
            console.error('Error approving order:', error)
            toast.error(error.response?.data?.message || 'فشل قبول الطلب')
        } finally {
            setProcessing(prev => ({ ...prev, [orderId]: false }))
        }
    }

    const handleReject = async (orderId) => {
        try {
            setProcessing(prev => ({ ...prev, [orderId]: true }))
            await orderAPI.cancel(orderId, 'رفض من الإدارة')
            toast.success('تم رفض الطلب', { icon: '❌' })
            refreshAll()
        } catch (error) {
            console.error('Error rejecting order:', error)
            toast.error(error.response?.data?.message || 'فشل رفض الطلب')
        } finally {
            setProcessing(prev => ({ ...prev, [orderId]: false }))
        }
    }

    const openDetails = (order) => {
        setSelectedOrder(order)
        setDetailsOpen(true)
    }

    const getTimeSinceOrder = (createdAt) => {
        const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000 / 60)
        if (diff < 1) return 'الآن'
        if (diff < 60) return `${diff} دقيقة`
        return `${Math.floor(diff / 60)} ساعة و ${diff % 60} دقيقة`
    }

    const isUrgent = (createdAt) => {
        const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000 / 60)
        return diff > 5
    }

    if (loading && orders.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <CircularProgress size={60} />
            </Box>
        )
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DeliveryIcon color="primary" />
                        طلبات الأونلاين الجديدة
                    </Typography>
                    <Typography color="text.secondary">
                        الطلبات التي تنتظر موافقتك قبل إرسالها للمطبخ
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Badge badgeContent={orders.length} color="error">
                        <Chip
                            icon={<TimerIcon />}
                            label="في الانتظار"
                            color="warning"
                            variant="outlined"
                        />
                    </Badge>
                    <IconButton onClick={refreshAll} color="primary">
                        <RefreshIcon />
                    </IconButton>
                </Box>
            </Box>

            {operationRules.enableOnlineOrders === false && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                    الطلبات الأونلاين معطلة من قواعد العمل حاليًا.
                </Alert>
            )}

            {operationRules.enableOnlineOrders !== false && operationRules.autoAcceptOnline && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    القبول التلقائي للطلبات الأونلاين مفعّل. أي طلب جديد سيتم قبوله مباشرة.
                </Alert>
            )}

            {orders.length === 0 && (
                <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'grey.50' }}>
                    <Typography variant="h1" sx={{ fontSize: '4rem', mb: 2 }}>📭</Typography>
                    <Typography variant="h5" gutterBottom>
                        {operationRules.enableOnlineOrders === false ? 'الطلبات الأونلاين متوقفة' : 'لا توجد طلبات أونلاين جديدة'}
                    </Typography>
                    <Typography color="text.secondary">
                        {operationRules.enableOnlineOrders === false
                            ? 'يمكن تفعيلها من: الإعدادات ← قواعد العمل ← تفعيل الطلبات الأونلاين'
                            : 'ستظهر الطلبات هنا عندما يقوم العملاء بالطلب من الموقع'}
                    </Typography>
                </Paper>
            )}

            <Grid container spacing={3}>
                {orders.map((order) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={order.id}>
                        <Card
                            sx={{
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                border: '2px solid',
                                borderColor: isUrgent(order.created_at) ? 'error.main' : 'warning.main',
                                bgcolor: isUrgent(order.created_at) ? 'error.50' : 'background.paper',
                                animation: isUrgent(order.created_at) ? 'pulse 1s infinite' : 'none',
                                '@keyframes pulse': {
                                    '0%': { boxShadow: '0 0 0 0 rgba(244, 67, 54, 0.4)' },
                                    '70%': { boxShadow: '0 0 0 10px rgba(244, 67, 54, 0)' },
                                    '100%': { boxShadow: '0 0 0 0 rgba(244, 67, 54, 0)' },
                                },
                                transition: 'all 0.2s',
                                '&:hover': {
                                    transform: 'translateY(-4px)',
                                    boxShadow: 4
                                }
                            }}
                        >
                            <CardContent sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => openDetails(order)}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Box>
                                        <Typography variant="h5" fontWeight="bold">
                                            #{order.order_number}
                                        </Typography>
                                        <Chip
                                            size="small"
                                            label={orderTypeLabels[order.order_type]}
                                            color="primary"
                                            sx={{ mt: 0.5 }}
                                        />
                                    </Box>
                                    <Chip
                                        label="في الانتظار"
                                        color="warning"
                                        size="small"
                                    />
                                </Box>

                                <Alert
                                    severity={isUrgent(order.created_at) ? 'error' : 'warning'}
                                    icon={<TimerIcon />}
                                    sx={{ mb: 2, py: 0 }}
                                >
                                    <Typography variant="body2">
                                        منتظر منذ: {getTimeSinceOrder(order.created_at)}
                                    </Typography>
                                </Alert>

                                {order.Customer && (
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <PersonIcon fontSize="small" color="action" />
                                            {order.Customer.name || 'عميل'}
                                        </Typography>
                                        {order.Customer.phone && (
                                            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <PhoneIcon fontSize="small" color="action" />
                                                {order.Customer.phone}
                                            </Typography>
                                        )}
                                    </Box>
                                )}

                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                    {order.items?.length || 0} عناصر
                                </Typography>

                                <Divider sx={{ my: 1 }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="subtitle1" fontWeight="bold">الإجمالي</Typography>
                                    <Typography variant="subtitle1" fontWeight="bold" color="primary">
                                        {parseFloat(order.total || 0).toFixed(2)} ر.س
                                    </Typography>
                                </Box>
                            </CardContent>

                            <Box sx={{ p: 2, pt: 0, display: 'flex', gap: 1 }}>
                                <Button
                                    variant="outlined"
                                    color="error"
                                    size="small"
                                    startIcon={<RejectIcon />}
                                    onClick={(e) => { e.stopPropagation(); handleReject(order.id) }}
                                    disabled={processing[order.id]}
                                    sx={{ flex: 1 }}
                                >
                                    رفض
                                </Button>
                                {!operationRules.autoAcceptOnline && (
                                    <Button
                                        variant="contained"
                                        color="success"
                                        size="small"
                                        startIcon={processing[order.id] ? <CircularProgress size={16} /> : <ApproveIcon />}
                                        onClick={(e) => { e.stopPropagation(); handleApprove(order.id) }}
                                        disabled={processing[order.id]}
                                        sx={{ flex: 1 }}
                                    >
                                        قبول
                                    </Button>
                                )}
                            </Box>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Dialog
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">
                        تفاصيل الطلب #{selectedOrder?.order_number}
                    </Typography>
                    <IconButton onClick={() => setDetailsOpen(false)}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {selectedOrder && (
                        <>
                            {selectedOrder.Customer && (
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                        معلومات العميل
                                    </Typography>
                                    <Box sx={{ pl: 2 }}>
                                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                            <PersonIcon fontSize="small" /> {selectedOrder.Customer.name || 'غير محدد'}
                                        </Typography>
                                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                            <PhoneIcon fontSize="small" /> {selectedOrder.Customer.phone || 'غير محدد'}
                                        </Typography>
                                        {selectedOrder.Customer.address && (
                                            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <LocationIcon fontSize="small" /> {selectedOrder.Customer.address}
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            )}

                            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                المحتويات
                            </Typography>
                            <List dense>
                                {selectedOrder.items?.map((item, idx) => (
                                    <ListItem key={idx}>
                                        <ListItemText
                                            primary={`${item.quantity}x ${item.item_name_ar}`}
                                            secondary={item.notes}
                                        />
                                        <Typography variant="body2" fontWeight="bold">
                                            {(parseFloat(item.total_price) || 0).toFixed(2)} ر.س
                                        </Typography>
                                    </ListItem>
                                ))}
                            </List>

                            <Divider sx={{ my: 2 }} />

                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography>المجموع الفرعي</Typography>
                                <Typography>{parseFloat(selectedOrder.subtotal || 0).toFixed(2)} ر.س</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography>الضريبة</Typography>
                                <Typography>{parseFloat(selectedOrder.tax || 0).toFixed(2)} ر.س</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="h6" fontWeight="bold">الإجمالي</Typography>
                                <Typography variant="h6" fontWeight="bold" color="primary">
                                    {parseFloat(selectedOrder.total || 0).toFixed(2)} ر.س
                                </Typography>
                            </Box>

                            {selectedOrder.notes && (
                                <Alert severity="info" sx={{ mt: 2 }}>
                                    <Typography variant="body2">ملاحظات: {selectedOrder.notes}</Typography>
                                </Alert>
                            )}
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<RejectIcon />}
                        onClick={() => { handleReject(selectedOrder?.id); setDetailsOpen(false) }}
                        disabled={processing[selectedOrder?.id]}
                    >
                        رفض الطلب
                    </Button>
                    {!operationRules.autoAcceptOnline && (
                        <Button
                            variant="contained"
                            color="success"
                            startIcon={<ApproveIcon />}
                            onClick={() => { handleApprove(selectedOrder?.id); setDetailsOpen(false) }}
                            disabled={processing[selectedOrder?.id]}
                        >
                            قبول وإرسال للمطبخ
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    )
}
