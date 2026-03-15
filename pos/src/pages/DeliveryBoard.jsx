import { useState, useEffect, useCallback } from 'react'
import {
    Box, Typography, Paper, Grid, Chip, Button, CircularProgress,
    Alert, Dialog, DialogTitle, DialogContent, DialogActions,
    MenuItem, TextField, Avatar, Badge, IconButton, Tooltip,
    Card, CardContent, CardActions, Collapse, Divider
} from '@mui/material'
import {
    DeliveryDining as DeliveryIcon,
    CheckCircle as DoneIcon,
    Cancel as FailIcon,
    Refresh as RefreshIcon,
    AccessTime as TimeIcon,
    Phone as PhoneIcon,
    DirectionsBike as BikeIcon,
    Assignment as AssignIcon,
    DirectionsRun as PickupIcon
} from '@mui/icons-material'
import { deliveryAPI } from '../services/api'
import toast from 'react-hot-toast'

const STATUS_COLUMNS = [
    { key: 'pending', label: 'بانتظار التعيين', color: '#f59e0b', bg: '#fef3c7', icon: '⏳' },
    { key: 'assigned', label: 'تم التعيين', color: '#3b82f6', bg: '#dbeafe', icon: '🔄' },
    { key: 'picked_up', label: 'في الطريق', color: '#8b5cf6', bg: '#ede9fe', icon: '🏃' },
    { key: 'delivered', label: 'تم التوصيل', color: '#10b981', bg: '#d1fae5', icon: '✅' },
]

const VEHICLE_ICONS = { motorcycle: '🛵', car: '🚗', bicycle: '🚲', foot: '🚶' }

function OrderCard({ order, personnel, onAssign, onPickup, onComplete, onFail }) {
    const [expanded, setExpanded] = useState(false)
    const timeAgo = (d) => {
        if (!d) return ''
        const mins = Math.floor((Date.now() - new Date(d)) / 60000)
        if (mins < 60) return `منذ ${mins} د`
        return `منذ ${Math.floor(mins / 60)} س`
    }

    return (
        <Card
            elevation={2}
            sx={{
                mb: 1.5, borderRadius: 2, border: '1px solid',
                borderColor: 'divider',
                transition: 'box-shadow .2s',
                '&:hover': { boxShadow: 4 }
            }}
        >
            <CardContent sx={{ pb: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography fontWeight="bold" variant="body2">#{order.order_number}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {timeAgo(order.created_at)}
                        </Typography>
                    </Box>
                    <Chip
                        label={`${parseFloat(order.total || 0).toFixed(0)} ر.س`}
                        color="primary" size="small" variant="outlined"
                    />
                </Box>

                {order.delivery_address && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        📍 {order.delivery_address}
                    </Typography>
                )}

                {order.Customer && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <PhoneIcon fontSize="inherit" sx={{ fontSize: 12 }} />
                        <Typography variant="caption">{order.Customer?.phone || order.Customer?.name || '—'}</Typography>
                    </Box>
                )}

                {order.deliveryRider && (
                    <Chip
                        size="small"
                        icon={<DeliveryIcon fontSize="small" />}
                        label={order.deliveryRider.name_ar}
                        sx={{ mt: 0.5 }}
                        color="info"
                    />
                )}
            </CardContent>

            <CardActions sx={{ pt: 0.5, pb: 1, px: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                {/* pending: assign rider */}
                {(!order.delivery_status || order.delivery_status === 'pending') && (
                    <Button
                        startIcon={<AssignIcon />}
                        size="small" variant="contained" color="warning"
                        onClick={() => onAssign(order)}
                        sx={{ fontSize: 11 }}
                    >
                        تعيين ديليفري
                    </Button>
                )}

                {/* assigned: mark picked up */}
                {order.delivery_status === 'assigned' && (
                    <Button
                        startIcon={<PickupIcon />}
                        size="small" variant="contained" color="info"
                        onClick={() => onPickup(order.id)}
                        sx={{ fontSize: 11 }}
                    >
                        استلم الطلب
                    </Button>
                )}

                {/* picked_up: complete or fail */}
                {order.delivery_status === 'picked_up' && (
                    <>
                        <Button
                            startIcon={<DoneIcon />}
                            size="small" variant="contained" color="success"
                            onClick={() => onComplete(order.id)}
                            sx={{ fontSize: 11 }}
                        >
                            تم التوصيل
                        </Button>
                        <Button
                            startIcon={<FailIcon />}
                            size="small" variant="outlined" color="error"
                            onClick={() => onFail(order.id)}
                            sx={{ fontSize: 11 }}
                        >
                            فشل
                        </Button>
                    </>
                )}
            </CardActions>
        </Card>
    )
}

function PersonnelCard({ person, onStatusChange }) {
    const statusColor = { available: 'success', busy: 'warning', offline: 'default' }
    const statusLabel = { available: 'متاح', busy: 'مشغول', offline: 'أوفلاين' }

    return (
        <Paper
            elevation={1}
            sx={{
                p: 1.5, mb: 1, borderRadius: 2, display: 'flex',
                alignItems: 'center', gap: 1.5, border: '1px solid',
                borderColor: person.status === 'available' ? 'success.light' :
                    person.status === 'busy' ? 'warning.light' : 'divider'
            }}
        >
            <Badge
                badgeContent={VEHICLE_ICONS[person.vehicle_type] || '🛵'}
                sx={{ '& .MuiBadge-badge': { fontSize: 14, background: 'transparent' } }}
            >
                <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
                    {person.name_ar.charAt(0)}
                </Avatar>
            </Badge>
            <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight="bold">{person.name_ar}</Typography>
                <Typography variant="caption" color="text.secondary">{person.phone}</Typography>
            </Box>
            <Chip
                size="small"
                label={statusLabel[person.status]}
                color={statusColor[person.status]}
                onClick={() => {
                    const next = person.status === 'available' ? 'offline'
                        : person.status === 'offline' ? 'available' : undefined
                    if (next) onStatusChange(person.id, next)
                }}
                sx={{ cursor: 'pointer' }}
            />
        </Paper>
    )
}

export default function DeliveryBoard() {
    const [orders, setOrders] = useState([])
    const [personnel, setPersonnel] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [assignDialog, setAssignDialog] = useState({ open: false, order: null })
    const [selectedRider, setSelectedRider] = useState('')
    const [assigning, setAssigning] = useState(false)

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const [ordersRes, personnelRes] = await Promise.all([
                deliveryAPI.getOrders(),
                deliveryAPI.getPersonnel()
            ])
            setOrders(ordersRes.data.data || [])
            setPersonnel(personnelRes.data.data || [])
            setError(null)
        } catch (e) {
            setError(e.response?.data?.message || 'خطأ في جلب بيانات الديليفري')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchData, 30000)
        return () => clearInterval(interval)
    }, [fetchData])

    const handleAssign = async () => {
        if (!selectedRider || !assignDialog.order) return
        try {
            setAssigning(true)
            await deliveryAPI.assignRider(assignDialog.order.id, selectedRider)
            toast.success('تم تعيين الديليفري بنجاح ✅')
            setAssignDialog({ open: false, order: null })
            setSelectedRider('')
            fetchData()
        } catch (e) {
            toast.error(e.response?.data?.message || 'فشل تعيين الديليفري')
        } finally {
            setAssigning(false)
        }
    }

    const handlePickup = async (orderId) => {
        try {
            await deliveryAPI.markPickup(orderId)
            toast.success('تم تسجيل الاستلام')
            fetchData()
        } catch (e) {
            toast.error(e.response?.data?.message || 'خطأ')
        }
    }

    const handleComplete = async (orderId) => {
        try {
            await deliveryAPI.markComplete(orderId)
            toast.success('تم تسليم الطلب بنجاح ✅')
            fetchData()
        } catch (e) {
            toast.error(e.response?.data?.message || 'خطأ')
        }
    }

    const handleFail = async (orderId) => {
        try {
            await deliveryAPI.markFailed(orderId, 'فشل التوصيل')
            toast.error('تم تسجيل فشل التوصيل')
            fetchData()
        } catch (e) {
            toast.error(e.response?.data?.message || 'خطأ')
        }
    }

    const handleStatusChange = async (personId, newStatus) => {
        try {
            await deliveryAPI.updatePersonnelStatus(personId, newStatus)
            fetchData()
        } catch (e) {
            toast.error('فشل تغيير الحالة')
        }
    }

    const getOrdersByStatus = (status) => {
        if (status === 'pending') {
            return orders.filter(o => !o.delivery_status || o.delivery_status === 'pending')
        }
        return orders.filter(o => o.delivery_status === status)
    }

    if (loading && orders.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress size={48} />
            </Box>
        )
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                <DeliveryIcon sx={{ fontSize: 36, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h5" fontWeight="bold">لوحة تتبع الديليفري</Typography>
                    <Typography variant="body2" color="text.secondary">
                        تتبع وإدارة طلبات التوصيل في الوقت الفعلي
                    </Typography>
                </Box>
                <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                    <Chip
                        label={`${orders.filter(o => !o.delivery_status || o.delivery_status === 'pending').length} بانتظار`}
                        color="warning" variant="outlined"
                    />
                    <Chip
                        label={`${personnel.filter(p => p.status === 'available').length} متاح`}
                        color="success" variant="outlined"
                    />
                    <Tooltip title="تحديث">
                        <IconButton onClick={fetchData} disabled={loading}>
                            <RefreshIcon className={loading ? 'spin' : ''} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Grid container spacing={3}>
                {/* Delivery Personnel Sidebar */}
                <Grid item xs={12} md={3}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: 'fit-content' }}>
                        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                            👤 موظفو الديليفري
                        </Typography>
                        {personnel.length === 0 ? (
                            <Alert severity="info" sx={{ fontSize: 12 }}>
                                لا يوجد موظفو ديليفري. أضف من صفحة إدارة الديليفري.
                            </Alert>
                        ) : (
                            personnel.filter(p => p.is_active).map(person => (
                                <PersonnelCard
                                    key={person.id}
                                    person={person}
                                    onStatusChange={handleStatusChange}
                                />
                            ))
                        )}
                    </Paper>
                </Grid>

                {/* Kanban Board */}
                <Grid item xs={12} md={9}>
                    <Grid container spacing={2}>
                        {STATUS_COLUMNS.map(col => {
                            const colOrders = getOrdersByStatus(col.key)
                            return (
                                <Grid item xs={12} sm={6} lg={3} key={col.key}>
                                    <Paper
                                        elevation={0}
                                        sx={{
                                            borderRadius: 3, border: '2px solid',
                                            borderColor: col.color + '44',
                                            bgcolor: col.bg,
                                            p: 1.5,
                                            minHeight: 300
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
                                            <Typography variant="h6">{col.icon}</Typography>
                                            <Typography variant="subtitle2" fontWeight="bold">
                                                {col.label}
                                            </Typography>
                                            <Chip
                                                size="small"
                                                label={colOrders.length}
                                                sx={{ ml: 'auto', bgcolor: col.color, color: 'white', fontWeight: 'bold' }}
                                            />
                                        </Box>

                                        {colOrders.length === 0 ? (
                                            <Box sx={{ textAlign: 'center', py: 4, opacity: 0.5 }}>
                                                <Typography variant="body2">لا يوجد طلبات</Typography>
                                            </Box>
                                        ) : (
                                            colOrders.map(order => (
                                                <OrderCard
                                                    key={order.id}
                                                    order={order}
                                                    personnel={personnel}
                                                    onAssign={(o) => { setAssignDialog({ open: true, order: o }); setSelectedRider('') }}
                                                    onPickup={handlePickup}
                                                    onComplete={handleComplete}
                                                    onFail={handleFail}
                                                />
                                            ))
                                        )}
                                    </Paper>
                                </Grid>
                            )
                        })}
                    </Grid>
                </Grid>
            </Grid>

            {/* Assign Dialog */}
            <Dialog open={assignDialog.open} onClose={() => setAssignDialog({ open: false, order: null })} maxWidth="xs" fullWidth>
                <DialogTitle>تعيين ديليفري للطلب #{assignDialog.order?.order_number}</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        الإجمالي: <strong>{parseFloat(assignDialog.order?.total || 0).toFixed(2)} ر.س</strong>
                        {assignDialog.order?.delivery_address && (
                            <><br />العنوان: {assignDialog.order.delivery_address}</>
                        )}
                    </Alert>
                    <TextField
                        select fullWidth label="اختر موظف الديليفري"
                        value={selectedRider}
                        onChange={e => setSelectedRider(e.target.value)}
                    >
                        {personnel.filter(p => p.is_active && p.status !== 'offline').map(p => (
                            <MenuItem key={p.id} value={p.id}>
                                {VEHICLE_ICONS[p.vehicle_type] || '🛵'} {p.name_ar}
                                <Chip
                                    size="small"
                                    label={p.status === 'available' ? 'متاح' : 'مشغول'}
                                    color={p.status === 'available' ? 'success' : 'warning'}
                                    sx={{ ml: 1 }}
                                />
                            </MenuItem>
                        ))}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAssignDialog({ open: false, order: null })}>إلغاء</Button>
                    <Button
                        variant="contained" onClick={handleAssign}
                        disabled={!selectedRider || assigning}
                    >
                        {assigning ? <CircularProgress size={20} /> : 'تعيين'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
