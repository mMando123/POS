import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import {
    Box,
    Typography,
    Card,
    CardContent,
    Grid,
    Button,
    Chip,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Badge,
    CircularProgress,
    Divider,
    Paper,
    Alert,
    useTheme,
    useMediaQuery
} from '@mui/material'
import {
    CheckCircle as CompleteIcon,
    LocalShipping as DeliveryIcon,
    Print as PrintIcon,
    Refresh as RefreshIcon,
    Person as PersonIcon,
    Timer as TimerIcon,
    Restaurant as RestaurantIcon,
    Close as CloseIcon,
    Undo as RefundIcon
} from '@mui/icons-material'
import toast from 'react-hot-toast'
import { orderAPI } from '../services/api'
import { printReceipt } from '../components/Receipt'
import { io } from 'socket.io-client'
import RefundDialog from '../components/RefundDialog'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || ''

const statusLabels = {
    ready: 'جاهز للتسليم',
    handed_to_cashier: 'لدى الكاشير'
}

const orderTypeLabels = {
    online: '🌐 أونلاين',
    walkin: '🚶 حضوري',
    dine_in: '🍽️ صالة',
    takeaway: '📦 تيك أواي',
    delivery: '🚗 توصيل',
}

export default function CashierQueue() {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedOrder, setSelectedOrder] = useState(null)
    const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
    const [deliveryPerson, setDeliveryPerson] = useState('')
    const [processing, setProcessing] = useState(false)
    const [refundOrder, setRefundOrder] = useState(null)
    const { user } = useSelector((state) => state.auth)
    const socketRef = useRef(null)

    useEffect(() => {
        fetchOrders()
        setupSocket()

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect()
            }
        }
    }, [])

    const setupSocket = () => {
        const socket = io(SOCKET_URL, {
            auth: { token: localStorage.getItem('token') },
            transports: ['websocket', 'polling'],
        })

        socketRef.current = socket

        socket.on('connect', () => {
            console.log('🔌 Cashier connected to socket')
            socket.emit('join:cashier')
        })

        socket.on('order:ready_for_pickup', (data) => {
            console.log('📦 Order ready for pickup:', data)
            toast.success(`طلب #${data.orderNumber} جاهز للتسليم!`, { icon: '🔔' })
            fetchOrders() // Refresh orders
        })

        socket.on('order:handed', (data) => {
            console.log('📤 Order handed to cashier:', data)
            fetchOrders()
        })

        socket.on('order:removed', (data) => {
            setOrders(prev => prev.filter(o => o.id !== data.orderId))
        })

        socket.on('order:cancelled', (data) => {
            setOrders(prev => prev.filter(o => o.id !== data.orderId))
            toast.error('تم إلغاء طلب', { icon: '❌' })
        })
    }

    const fetchOrders = async () => {
        try {
            setLoading(true)
            const response = await orderAPI.getCashierQueue()
            setOrders(response.data.data || [])
        } catch (error) {
            console.error('Error fetching cashier queue:', error)
            toast.error('فشل تحميل الطلبات')
        } finally {
            setLoading(false)
        }
    }

    const handleCompleteOrder = async () => {
        if (!selectedOrder) return

        try {
            setProcessing(true)
            await orderAPI.complete(selectedOrder.id, {
                delivery_person: deliveryPerson || undefined
            })

            toast.success('تم إكمال الطلب بنجاح!', { icon: '✅' })
            setCompleteDialogOpen(false)
            setSelectedOrder(null)
            setDeliveryPerson('')
            fetchOrders()
        } catch (error) {
            console.error('Error completing order:', error)
            toast.error(error.response?.data?.message || 'فشل إكمال الطلب')
        } finally {
            setProcessing(false)
        }
    }

    const handlePrintReceipt = async (order) => {
        try {
            await printReceipt(order)
            toast.success('تم فتح نافذة الطباعة')
        } catch (error) {
            toast.error('فشل الطباعة')
        }
    }

    const openCompleteDialog = (order) => {
        setSelectedOrder(order)
        setDeliveryPerson('')
        setCompleteDialogOpen(true)
    }

    const getTimeSinceReady = (readyAt) => {
        if (!readyAt) return 'غير محدد'
        const diff = Math.floor((Date.now() - new Date(readyAt).getTime()) / 1000 / 60)
        if (diff < 1) return 'الآن'
        if (diff < 60) return `${diff} دقيقة`
        return `${Math.floor(diff / 60)} ساعة و ${diff % 60} دقيقة`
    }

    const isUrgent = (readyAt) => {
        if (!readyAt) return false
        const diff = Math.floor((Date.now() - new Date(readyAt).getTime()) / 1000 / 60)
        return diff > 10 // Urgent if waiting more than 10 minutes
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <CircularProgress size={60} />
            </Box>
        )
    }

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 } }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1.25, sm: 2 }, mb: { xs: 2, sm: 3, md: 4 } }}>
                <Box sx={{ width: '100%', minWidth: 0 }}>
                    <Typography variant={isMobile ? 'h5' : 'h4'} fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontSize: { xs: '2rem', sm: undefined } }}>
                        <RestaurantIcon color="primary" />
                        طلبات جاهزة للتسليم
                    </Typography>
                    <Typography color="text.secondary" sx={{ fontSize: { xs: '0.95rem', sm: '1rem' } }}>
                        الطلبات التي انتهى المطبخ من تحضيرها وتنتظر التسليم
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
                    <Badge badgeContent={orders.filter(o => o.status === 'ready').length} color="warning">
                        <Chip
                            icon={<TimerIcon />}
                            label="في الانتظار"
                            color="warning"
                            variant="outlined"
                        />
                    </Badge>
                    <Badge badgeContent={orders.filter(o => o.status === 'handed_to_cashier').length} color="primary">
                        <Chip
                            icon={<PersonIcon />}
                            label="لدى الكاشير"
                            color="primary"
                            variant="outlined"
                        />
                    </Badge>
                    <IconButton onClick={fetchOrders} color="primary" size={isMobile ? 'small' : 'medium'}>
                        <RefreshIcon />
                    </IconButton>
                </Box>
            </Box>

            {/* Empty State */}
            {orders.length === 0 && (
                <Paper sx={{ p: { xs: 3, sm: 6 }, textAlign: 'center', bgcolor: 'grey.50' }}>
                    <Typography variant="h1" sx={{ fontSize: { xs: '3rem', sm: '4rem' }, mb: 2 }}>✨</Typography>
                    <Typography variant={isMobile ? 'h6' : 'h5'} gutterBottom>لا توجد طلبات جاهزة حالياً</Typography>
                    <Typography color="text.secondary">
                        ستظهر الطلبات هنا عندما ينتهي المطبخ من تحضيرها
                    </Typography>
                </Paper>
            )}

            {/* Orders Grid */}
            <Grid container spacing={3}>
                {orders.map((order) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={order.id}>
                        <Card
                            sx={{
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                border: order.status === 'ready' ? '2px solid' : '1px solid',
                                borderColor: order.status === 'ready'
                                    ? (isUrgent(order.ready_at) ? 'error.main' : 'warning.main')
                                    : 'divider',
                                bgcolor: isUrgent(order.ready_at) ? 'error.50' : 'background.paper',
                                transition: 'all 0.2s',
                                '&:hover': {
                                    transform: 'translateY(-4px)',
                                    boxShadow: 4
                                }
                            }}
                        >
                            <CardContent sx={{ flexGrow: 1 }}>
                                {/* Order Header */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Box>
                                        <Typography variant="h5" fontWeight="bold">
                                            #{order.order_number}
                                        </Typography>
                                        <Chip
                                            size="small"
                                            label={orderTypeLabels[order.order_type]}
                                            sx={{ mt: 0.5 }}
                                        />
                                    </Box>
                                    <Chip
                                        label={statusLabels[order.status]}
                                        color={order.status === 'ready' ? 'warning' : 'primary'}
                                        size="small"
                                    />
                                </Box>

                                {/* Time Info */}
                                <Alert
                                    severity={isUrgent(order.ready_at) ? 'error' : 'info'}
                                    icon={<TimerIcon />}
                                    sx={{ mb: 2, py: 0 }}
                                >
                                    <Typography variant="body2">
                                        منتظر منذ: {getTimeSinceReady(order.ready_at || order.created_at)}
                                    </Typography>
                                </Alert>

                                {/* Items */}
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                    المحتويات ({order.items?.length || 0} عناصر)
                                </Typography>
                                <Box sx={{ maxHeight: 120, overflow: 'auto', mb: 2 }}>
                                    {order.items?.map((item, idx) => (
                                        <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                            <Typography variant="body2">
                                                {item.quantity}x {item.item_name_ar}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>

                                {/* Total */}
                                <Divider sx={{ my: 1 }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="subtitle1" fontWeight="bold">الإجمالي</Typography>
                                    <Typography variant="subtitle1" fontWeight="bold" color="primary">
                                        {parseFloat(order.total || 0).toFixed(2)} ر.س
                                    </Typography>
                                </Box>
                            </CardContent>

                            {/* Actions */}
                            <Box sx={{ p: 2, pt: 0, display: 'flex', gap: 1 }}>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<PrintIcon />}
                                    onClick={() => handlePrintReceipt(order)}
                                    sx={{ flex: 1 }}
                                >
                                    طباعة
                                </Button>
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<CompleteIcon />}
                                    onClick={() => openCompleteDialog(order)}
                                    color={order.order_type === 'delivery' ? 'warning' : 'success'}
                                    sx={{ flex: 1 }}
                                >
                                    {order.order_type === 'delivery' ? 'تسليم' : 'إكمال'}
                                </Button>
                                {/* Refund Button */}
                                {['admin', 'manager', 'supervisor', 'cashier'].includes(user?.role) && (
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        color="warning"
                                        onClick={() => setRefundOrder(order)}
                                        sx={{ minWidth: 'auto', px: 1 }}
                                    >
                                        <RefundIcon fontSize="small" />
                                    </Button>
                                )}
                            </Box>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* Complete Order Dialog */}
            <Dialog
                open={completeDialogOpen}
                onClose={() => setCompleteDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">
                        إكمال الطلب #{selectedOrder?.order_number}
                    </Typography>
                    <IconButton onClick={() => setCompleteDialogOpen(false)}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {selectedOrder?.order_type === 'delivery' && (
                        <Box sx={{ mb: 3 }}>
                            <Typography gutterBottom fontWeight="bold">
                                <DeliveryIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                                معلومات التوصيل
                            </Typography>
                            <TextField
                                fullWidth
                                label="اسم عامل التوصيل"
                                value={deliveryPerson}
                                onChange={(e) => setDeliveryPerson(e.target.value)}
                                placeholder="أدخل اسم الدليفري..."
                                sx={{ mt: 1 }}
                            />
                        </Box>
                    )}

                    <Typography variant="body2" color="text.secondary">
                        بالضغط على "تأكيد الإكمال"، سيتم:
                    </Typography>
                    <Box component="ul" sx={{ pl: 2, color: 'text.secondary' }}>
                        <li>تسجيل الطلب كمكتمل</li>
                        <li>إضافة المبلغ لمبيعات الوردية</li>
                        <li>تحديث إحصائيات أداء الكاشير</li>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setCompleteDialogOpen(false)} disabled={processing}>
                        إلغاء
                    </Button>
                    <Button
                        variant="contained"
                        color="success"
                        onClick={handleCompleteOrder}
                        disabled={processing}
                        startIcon={processing ? <CircularProgress size={20} /> : <CompleteIcon />}
                    >
                        {processing ? 'جاري الإكمال...' : 'تأكيد الإكمال'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Refund Dialog */}
            <RefundDialog
                open={!!refundOrder}
                onClose={() => setRefundOrder(null)}
                order={refundOrder}
                onRefundComplete={(refund) => {
                    toast.success(`تم الاسترداد بنجاح: ${refund.refund_number}`)
                    fetchOrders()
                }}
            />
        </Box>
    )
}
