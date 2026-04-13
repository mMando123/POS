import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { PermissionGate, PERMISSIONS } from '../components/ProtectedRoute'
import {
    Box,
    Card,
    CardContent,
    Typography,
    Chip,
    Button,
    Grid,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tabs,
    Tab,
    IconButton,
} from '@mui/material'
import { Refresh, Visibility, Undo as RefundIcon } from '@mui/icons-material'
import toast from 'react-hot-toast'
import { orderAPI, settingsAPI } from '../services/api'
import { setOrders, updateOrderStatus } from '../store/slices/orderSlice'
import RefundDialog from '../components/RefundDialog'
import EntityAttachmentsPanel from '../components/EntityAttachmentsPanel'

const statusColors = {
    pending: 'warning',
    approved: 'info',
    new: 'info',
    confirmed: 'info',
    preparing: 'warning',
    ready: 'success',
    handed_to_cashier: 'primary',
    completed: 'default',
    cancelled: 'error',
}

const statusLabels = {
    pending: 'انتظار الموافقة',
    approved: 'تم القبول',
    new: 'جديد',
    confirmed: 'مؤكد',
    preparing: 'جاري التحضير',
    ready: 'جاهز للتسليم',
    handed_to_cashier: 'لدى الكاشير',
    completed: 'مكتمل',
    cancelled: 'ملغي',
}

const orderTypeLabel = (type) => {
    if (type === 'online') return 'أونلاين'
    if (type === 'walkin') return 'حضوري'
    if (type === 'dine_in') return 'صالة'
    if (type === 'takeaway') return 'تيك أواي'
    return 'توصيل'
}

const getOrderTaxRateLabel = (order) => {
    const subtotal = parseFloat(order?.subtotal || 0)
    const tax = parseFloat(order?.tax || 0)
    if (subtotal <= 0) return '0'
    return ((tax / subtotal) * 100).toFixed(2).replace(/\.00$/, '')
}

export default function Orders() {
    const dispatch = useDispatch()
    const { orders } = useSelector((state) => state.orders)
    const [selectedOrder, setSelectedOrder] = useState(null)
    const [tab, setTab] = useState(0)
    const [refundOrder, setRefundOrder] = useState(null)
    const [actionLoadingByOrder, setActionLoadingByOrder] = useState({})
    const [allowCancelWithoutReason, setAllowCancelWithoutReason] = useState(false)

    useEffect(() => {
        fetchOrders()
        fetchOperationRules()
    }, [])

    const fetchOperationRules = async () => {
        try {
            const response = await settingsAPI.getPublic()
            setAllowCancelWithoutReason(response.data?.data?.allowCancelWithoutReason === true)
        } catch (error) {
            console.error('Failed to fetch operation rules:', error)
        }
    }

    const fetchOrders = async () => {
        try {
            const response = await orderAPI.getAll({ limit: 100 })
            dispatch(setOrders(response.data.data || []))
        } catch {
            toast.error('فشل تحميل الطلبات')
        }
    }

    const handleStatusChange = async (orderId, newStatus) => {
        if (actionLoadingByOrder[orderId]) return
        setActionLoadingByOrder((prev) => ({ ...prev, [orderId]: true }))
        try {
            if (newStatus === 'approved') {
                await orderAPI.approve(orderId)
            } else if (newStatus === 'handed_to_cashier') {
                await orderAPI.handoff(orderId)
            } else if (newStatus === 'completed') {
                await orderAPI.complete(orderId)
            } else {
                await orderAPI.updateStatus(orderId, newStatus)
            }

            dispatch(updateOrderStatus({ orderId, status: newStatus }))
            toast.success(`تم تحديث الحالة إلى: ${statusLabels[newStatus]}`)
        } catch (error) {
            console.error(error)
            toast.error(error?.response?.data?.message || 'فشل تحديث الحالة')
        } finally {
            setActionLoadingByOrder((prev) => ({ ...prev, [orderId]: false }))
        }
    }

    const getNextStatus = (order) => {
        const s = order.status

        if (order.order_type === 'online') {
            if (s === 'pending') return 'approved'
            if (s === 'approved') return 'preparing'
        }

        if (s === 'new') return 'preparing'
        if (s === 'confirmed') return 'preparing'
        if (s === 'preparing') return 'ready'
        if (s === 'ready') return 'handed_to_cashier'
        if (s === 'handed_to_cashier') return 'completed'

        return null
    }

    const handleCancelOrder = async (orderId) => {
        const reasonPrompt = allowCancelWithoutReason ?
            'سبب الإلغاء (اختياري):' :
            'سبب الإلغاء (إلزامي):'
        const reasonValue = window.prompt(reasonPrompt, '')

        if (reasonValue === null) {
            return
        }
        const reason = String(reasonValue || '').trim()

        if (!allowCancelWithoutReason && !reason) {
            toast.error('سبب الإلغاء مطلوب حسب قواعد العمل الحالية')
            return
        }

        if (!window.confirm('هل أنت متأكد من إلغاء هذا الطلب؟')) {
            return
        }

        try {
            await orderAPI.cancel(orderId, reason)
            dispatch(updateOrderStatus({ orderId, status: 'cancelled' }))
            toast.success('تم إلغاء الطلب بنجاح')
        } catch (error) {
            toast.error(error?.response?.data?.message || 'فشل إلغاء الطلب')
        }
    }

    const filteredOrders = orders.filter((order) => {
        if (tab === 0) return !['completed', 'cancelled'].includes(order.status)
        if (tab === 1) return order.status === 'completed'
        if (tab === 2) return order.status === 'cancelled'
        return true
    })

    const OrderCard = ({ order }) => {
        const nextStatus = getNextStatus(order)

        return (
            <Card sx={{ height: '100%' }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6" fontWeight="bold">
                            طلب #{order.order_number}
                        </Typography>
                        <Chip
                            label={statusLabels[order.status]}
                            color={statusColors[order.status]}
                            size="small"
                        />
                    </Box>

                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        {orderTypeLabel(order.order_type)}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        {new Date(order.created_at).toLocaleString('ar-SA')}
                    </Typography>

                    <Typography variant="h6" color="primary.main" sx={{ my: 2 }}>
                        {parseFloat(order.total).toFixed(2)} ر.س
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <IconButton
                            size="small"
                            onClick={() => setSelectedOrder(order)}
                            color="primary"
                        >
                            <Visibility />
                        </IconButton>

                        {nextStatus && order.status !== 'cancelled' && (
                            <Button
                                variant="contained"
                                size="small"
                                disabled={!!actionLoadingByOrder[order.id]}
                                onClick={() => handleStatusChange(order.id, nextStatus)}
                                sx={{ flex: 1 }}
                            >
                                {statusLabels[nextStatus]} ←
                            </Button>
                        )}

                        {['new', 'confirmed'].includes(order.status) && (
                            <PermissionGate permission={PERMISSIONS.ORDERS_CANCEL}>
                                <Button
                                    variant="outlined"
                                    color="error"
                                    size="small"
                                    onClick={() => handleCancelOrder(order.id)}
                                >
                                    إلغاء
                                </Button>
                            </PermissionGate>
                        )}

                        {(order.status === 'completed' || order.payment_status === 'paid') && order.status !== 'cancelled' && (
                            <Button
                                variant="outlined"
                                color="warning"
                                size="small"
                                startIcon={<RefundIcon />}
                                onClick={() => setRefundOrder(order)}
                            >
                                استرداد
                            </Button>
                        )}
                    </Box>
                </CardContent>
            </Card>
        )
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" fontWeight="bold">
                    إدارة الطلبات
                </Typography>
                <Button
                    variant="outlined"
                    startIcon={<Refresh />}
                    onClick={fetchOrders}
                >
                    تحديث
                </Button>
            </Box>

            <Box sx={{ mb: 2 }}>
                <Chip
                    size="small"
                    color={allowCancelWithoutReason ? 'warning' : 'info'}
                    label={allowCancelWithoutReason ? 'الإلغاء بدون سبب: مفعل' : 'الإلغاء بدون سبب: غير مفعل'}
                />
            </Box>

            <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab label={`نشطة (${orders.filter(o => ['pending', 'approved', 'new', 'confirmed', 'preparing', 'ready', 'handed_to_cashier'].includes(o.status)).length})`} />
                <Tab label={`مكتملة (${orders.filter(o => o.status === 'completed').length})`} />
                <Tab label={`ملغية (${orders.filter(o => o.status === 'cancelled').length})`} />
            </Tabs>

            {filteredOrders.length === 0 ? (
                <Card>
                    <CardContent sx={{ textAlign: 'center', py: 6 }}>
                        <Typography color="text.secondary">
                            لا توجد طلبات
                        </Typography>
                    </CardContent>
                </Card>
            ) : (
                <Grid container spacing={2}>
                    {filteredOrders.map((order) => (
                        <Grid item xs={12} sm={6} md={4} lg={3} key={order.id}>
                            <OrderCard order={order} />
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog open={!!selectedOrder} onClose={() => setSelectedOrder(null)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    تفاصيل الطلب #{selectedOrder?.order_number}
                </DialogTitle>
                <DialogContent>
                    {selectedOrder && (
                        <Box>
                            <Box sx={{ mb: 2 }}>
                                <Chip
                                    label={statusLabels[selectedOrder.status]}
                                    color={statusColors[selectedOrder.status]}
                                />
                            </Box>

                            <Typography variant="subtitle2" color="text.secondary">العناصر:</Typography>
                            {selectedOrder.items?.map((item, index) => (
                                <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #eee' }}>
                                    <Typography>
                                        {item.item_name_ar} × {item.quantity}
                                    </Typography>
                                    <Typography fontWeight="bold">
                                        {parseFloat(item.total_price).toFixed(2)} ر.س
                                    </Typography>
                                </Box>
                            ))}

                            <Box sx={{ mt: 2, pt: 2, borderTop: '2px solid #eee' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography>المجموع الفرعي:</Typography>
                                    <Typography>{parseFloat(selectedOrder.subtotal).toFixed(2)} ر.س</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography>الضريبة ({getOrderTaxRateLabel(selectedOrder)}%):</Typography>
                                    <Typography>{parseFloat(selectedOrder.tax).toFixed(2)} ر.س</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                    <Typography variant="h6" fontWeight="bold">الإجمالي:</Typography>
                                    <Typography variant="h6" fontWeight="bold" color="primary.main">
                                        {parseFloat(selectedOrder.total).toFixed(2)} ر.س
                                    </Typography>
                                </Box>
                            </Box>

                            {selectedOrder.notes && (
                                <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                    <Typography variant="subtitle2">ملاحظات:</Typography>
                                    <Typography>{selectedOrder.notes}</Typography>
                                </Box>
                            )}
                            <EntityAttachmentsPanel
                                entityType="order"
                                entityId={selectedOrder.id}
                                title="مرفقات فاتورة البيع"
                            />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSelectedOrder(null)}>إغلاق</Button>
                    {selectedOrder && (selectedOrder.status === 'completed' || selectedOrder.payment_status === 'paid') && selectedOrder.status !== 'cancelled' && (
                        <Button
                            variant="contained"
                            color="warning"
                            startIcon={<RefundIcon />}
                            onClick={() => {
                                setRefundOrder(selectedOrder)
                                setSelectedOrder(null)
                            }}
                        >
                            استرداد هذا الطلب
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

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
