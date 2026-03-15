import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
    Alert,
    AlertTitle,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip as MuiTooltip,
    Typography,
    useMediaQuery
} from '@mui/material'
import {
    AccessTime,
    AttachMoney,
    CheckCircle,
    Inventory2,
    ListAlt,
    LocalShipping,
    People,
    Person,
    PointOfSale,
    Refresh as RefreshIcon,
    Schedule,
    ShoppingBasket,
    ShoppingCart,
    Storefront,
    TrendingUp,
    Warning
} from '@mui/icons-material'
import { useTheme } from '@mui/material/styles'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts'
import { inventoryAPI, orderAPI, reportsAPI, shiftAPI } from '../services/api'
import { hasPermission, PERMISSIONS } from '../utils/permissions'

const statusColors = {
    new: 'info',
    confirmed: 'primary',
    preparing: 'warning',
    ready: 'success',
    completed: 'default',
    cancelled: 'error',
}

const statusLabels = {
    new: 'جديد',
    confirmed: 'مؤكد',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    completed: 'مكتمل',
    cancelled: 'ملغي',
}

const shortcutDefinitions = [
    { key: 'new-order', title: 'نقطة البيع (POS)', icon: <ShoppingCart />, to: '/new-order', color: '#1976d2' },
    { key: 'orders', title: 'الطلبات', icon: <ListAlt />, to: '/orders', color: '#0288d1', permission: PERMISSIONS.ORDERS_VIEW_OWN },
    { key: 'cashier-queue', title: 'كاشير الاستلام', icon: <PointOfSale />, to: '/cashier-queue', color: '#7b1fa2', permission: PERMISSIONS.ORDERS_PROCESS },
    { key: 'pending-orders', title: 'الطلبات المعلقة', icon: <AccessTime />, to: '/pending-orders', color: '#ed6c02', permission: PERMISSIONS.ORDERS_PROCESS },
    { key: 'delivery-board', title: 'لوحة الديليفري', icon: <LocalShipping />, to: '/delivery-board', color: '#2e7d32' },
    { key: 'inventory', title: 'المخزون', icon: <Inventory2 />, to: '/inventory', color: '#1b5e20', permission: PERMISSIONS.MENU_VIEW },
    { key: 'purchases', title: 'المشتريات', icon: <ShoppingBasket />, to: '/purchases', color: '#0277bd', permission: PERMISSIONS.MENU_VIEW },
    { key: 'customers', title: 'العملاء', icon: <People />, to: '/customers', color: '#1565c0', permission: PERMISSIONS.REPORTS_VIEW },
    { key: 'reports', title: 'التقارير', icon: <TrendingUp />, to: '/reports', color: '#388e3c', permission: PERMISSIONS.REPORTS_VIEW },
    { key: 'users', title: 'المستخدمون', icon: <Person />, to: '/users', color: '#0097a7', permission: PERMISSIONS.USERS_MANAGE },
]

const formatMoney = (value) => `${Number(value || 0).toFixed(2)} ر.س`

const getOrderTypeLabel = (orderType) => {
    if (orderType === 'online') return 'أونلاين'
    if (orderType === 'walkin') return 'استلام حضوري'
    if (orderType === 'dine_in') return 'صالة'
    if (orderType === 'takeaway') return 'تيك أواي'
    return 'توصيل محلي'
}

const dedupeAlerts = (items) => {
    const unique = new Map()
    ;(items || []).forEach((item) => {
        const key = `${item.menuId || item.id || item.productName || 'unknown'}-${item.warehouseId || 'all'}`
        if (!unique.has(key)) unique.set(key, item)
    })
    return Array.from(unique.values())
}

const StatCard = ({ title, value, icon, color }) => (
    <Card sx={{ height: '100%', borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 14px rgba(0,0,0,0.04)' }}>
        <CardContent sx={{ py: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography variant="body2" color="text.secondary" fontWeight={700}>{title}</Typography>
                <Avatar sx={{ bgcolor: `${color}20`, color, width: 36, height: 36 }}>{icon}</Avatar>
            </Box>
            <Typography variant="h4" fontWeight={900} sx={{ color, letterSpacing: '-0.02em' }}>{value}</Typography>
        </CardContent>
    </Card>
)

const ShortcutCard = ({ title, icon, to, color, onNavigate }) => (
    <Grid item xs={6} sm={4} md={2}>
        <Paper
            onClick={() => onNavigate(to)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onNavigate(to)
            }}
            role="button"
            tabIndex={0}
            sx={{
                p: 2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: 'none',
                cursor: 'pointer',
                minHeight: 108,
                transition: 'all 0.2s ease',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 20px rgba(0,0,0,0.08)', borderColor: color },
                '&:focus-visible': { outline: '3px solid', outlineColor: `${color}55`, outlineOffset: 2 }
            }}
        >
            <Stack direction="column" spacing={1.2} alignItems="center" justifyContent="center">
                <Avatar sx={{ bgcolor: `${color}22`, color, width: 42, height: 42 }}>{icon}</Avatar>
                <Typography variant="subtitle2" fontWeight={800} textAlign="center" lineHeight={1.2}>{title}</Typography>
            </Stack>
        </Paper>
    </Grid>
)

export default function Dashboard() {
    const navigate = useNavigate()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

    const [stats, setStats] = useState({ todayOrders: 0, todayRevenue: 0, pendingOrders: 0, completedOrders: 0 })
    const [recentOrders, setRecentOrders] = useState([])
    const [openShifts, setOpenShifts] = useState([])
    const [reportData, setReportData] = useState(null)
    const [lowStockAlerts, setLowStockAlerts] = useState([])
    const [loadingReport, setLoadingReport] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null)

    const { orders } = useSelector((state) => state.orders)
    const { user } = useSelector((state) => state.auth)
    const isAdmin = user?.role === 'admin' || user?.role === 'manager'
    const userRole = user?.role || 'cashier'

    const updateStats = (ordersData) => {
        const list = Array.isArray(ordersData) ? ordersData : []
        const pending = list.filter((order) => ['new', 'confirmed', 'preparing'].includes(order.status)).length
        const completed = list.filter((order) => order.status === 'completed').length
        const revenue = list.filter((order) => order.payment_status === 'paid').reduce((sum, order) => sum + parseFloat(order.total || 0), 0)

        setStats({ todayOrders: list.length, todayRevenue: revenue, pendingOrders: pending, completedOrders: completed })
    }

    const fetchOpenShifts = async () => {
        try {
            const response = await shiftAPI.getOpenShifts()
            setOpenShifts(response.data?.data || [])
        } catch (error) {
            console.error('Error fetching open shifts:', error)
            setOpenShifts([])
        }
    }

    const fetchDashboardData = async () => {
        setIsRefreshing(true)
        setLoadingReport(true)

        try {
            const today = new Date().toISOString().split('T')[0]
            const [ordersRes, reportRes, alertsRes] = await Promise.allSettled([
                orderAPI.getAll({ date_from: today, limit: 100 }),
                reportsAPI.getDaily(),
                inventoryAPI.getAlerts()
            ])

            if (ordersRes.status === 'fulfilled') {
                const ordersData = ordersRes.value.data?.data || []
                setRecentOrders(ordersData.slice(0, 10))
                updateStats(ordersData)
            }

            if (reportRes.status === 'fulfilled') {
                setReportData(reportRes.value.data?.data || null)
            } else {
                setReportData(null)
            }

            if (alertsRes.status === 'fulfilled') {
                const alertsData = alertsRes.value.data?.data || {}
                const mergedAlerts = [...(alertsData.lowStock || []), ...(alertsData.outOfStock || [])]
                setLowStockAlerts(dedupeAlerts(mergedAlerts))
            } else {
                setLowStockAlerts([])
            }

            setLastUpdatedAt(new Date())
        } catch (error) {
            console.error('Error fetching dashboard data:', error)
        } finally {
            setLoadingReport(false)
            setIsRefreshing(false)
        }
    }

    useEffect(() => {
        fetchDashboardData()
        if (isAdmin) fetchOpenShifts()
    }, [isAdmin])

    useEffect(() => {
        updateStats(orders)
    }, [orders])

    const visibleQuickShortcuts = useMemo(() => (
        shortcutDefinitions.filter((item) => !item.permission || hasPermission(userRole, item.permission)).slice(0, 6)
    ), [userRole])

    const hourlyBreakdown = useMemo(() => {
        if (!reportData?.hourlyBreakdown?.length) return []
        return reportData.hourlyBreakdown.map((hour) => ({
            name: hour.hour > 12 ? `${hour.hour - 12}م` : hour.hour === 12 ? '12م' : hour.hour === 0 ? '12ص' : `${hour.hour}ص`,
            sales: Number(hour.revenue || 0)
        }))
    }, [reportData])

    const topItems = useMemo(() => reportData?.topItems || [], [reportData])

    return (
        <Box sx={{ p: { xs: 1, md: 2 } }}>
            <Paper
                sx={{
                    p: { xs: 2, md: 2.5 },
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: '0 2px 14px rgba(0,0,0,0.04)',
                    mb: 3
                }}
            >
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                            <Storefront fontSize="medium" />
                        </Avatar>
                        <Box>
                            <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: '-0.02em' }}>
                                لوحة التحكم الرئيسية
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                نظرة سريعة على أوامر اليوم والمخزون والتشغيل.
                            </Typography>
                            {lastUpdatedAt && (
                                <Typography variant="caption" color="text.secondary">
                                    آخر تحديث: {lastUpdatedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                            )}
                        </Box>
                    </Stack>

                    <Button
                        variant="outlined"
                        startIcon={isRefreshing ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon />}
                        onClick={() => {
                            fetchDashboardData()
                            if (isAdmin) fetchOpenShifts()
                        }}
                        disabled={isRefreshing}
                        sx={{ borderRadius: 2, alignSelf: { xs: 'flex-start', sm: 'center' } }}
                    >
                        تحديث الآن
                    </Button>
                </Stack>
            </Paper>

            {lowStockAlerts.length > 0 && (
                <Alert
                    severity="warning"
                    icon={<Warning fontSize="inherit" />}
                    sx={{ mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'warning.light', bgcolor: 'warning.lighter' }}
                    action={
                        <Button color="warning" size="small" variant="outlined" onClick={() => navigate('/inventory')} sx={{ borderRadius: 2 }}>
                            عرض المخزون
                        </Button>
                    }
                >
                    <AlertTitle sx={{ fontWeight: 800 }}>تنبيه مخزون</AlertTitle>
                    يوجد {lowStockAlerts.length} صنف يحتاج متابعة.
                    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {lowStockAlerts.slice(0, 3).map((item, idx) => (
                            <Chip
                                key={`${item.productName || 'item'}-${idx}`}
                                label={`${item.productName || item.name_ar}: ${item.available || item.quantity || 0}`}
                                size="small"
                                color="warning"
                                variant="outlined"
                            />
                        ))}
                    </Box>
                </Alert>
            )}

            <Typography variant="h6" fontWeight={800} gutterBottom sx={{ mb: 1.5 }}>
                الوصول السريع
            </Typography>
            <Grid container spacing={2} sx={{ mb: 4 }}>
                {visibleQuickShortcuts.map((shortcut) => (
                    <ShortcutCard
                        key={shortcut.key}
                        title={shortcut.title}
                        icon={shortcut.icon}
                        to={shortcut.to}
                        color={shortcut.color}
                        onNavigate={navigate}
                    />
                ))}
            </Grid>

            <Typography variant="h6" fontWeight={800} gutterBottom sx={{ mb: 1.5 }}>
                ملخص أداء اليوم
            </Typography>
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="إجمالي الطلبات" value={stats.todayOrders} icon={<ShoppingCart />} color="#1976d2" />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="طلبات قيد التنفيذ" value={stats.pendingOrders} icon={<AccessTime />} color="#ed6c02" />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="طلبات مكتملة" value={stats.completedOrders} icon={<CheckCircle />} color="#2e7d32" />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="إيراد اليوم" value={formatMoney(stats.todayRevenue)} icon={<AttachMoney />} color="#0288d1" />
                </Grid>
            </Grid>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={8}>
                    <Paper
                        sx={{
                            p: 2.5,
                            borderRadius: 3,
                            height: 420,
                            border: '1px solid',
                            borderColor: 'divider',
                            boxShadow: '0 2px 14px rgba(0,0,0,0.04)'
                        }}
                    >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                            <Typography variant="h6" fontWeight={800}>تدفق المبيعات بالساعة</Typography>
                            <Chip label="نشط اليوم" color="success" size="small" />
                        </Stack>
                        <Box sx={{ height: 340 }}>
                            {loadingReport ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <CircularProgress />
                                </Box>
                            ) : hourlyBreakdown.length === 0 ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <Typography color="text.secondary">لا توجد بيانات مبيعات خلال اليوم</Typography>
                                </Box>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={hourlyBreakdown} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="dashboardSalesGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#1976d2" stopOpacity={0.7} />
                                                <stop offset="95%" stopColor="#1976d2" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                        <YAxis tick={{ fontSize: 12 }} />
                                        <Tooltip
                                            formatter={(value) => [formatMoney(value), 'المبيعات']}
                                            contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 6px 18px rgba(0,0,0,0.08)' }}
                                        />
                                        <Area type="monotone" dataKey="sales" stroke="#1976d2" strokeWidth={2.5} fillOpacity={1} fill="url(#dashboardSalesGradient)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper
                        sx={{
                            borderRadius: 3,
                            height: 420,
                            border: '1px solid',
                            borderColor: 'divider',
                            boxShadow: '0 2px 14px rgba(0,0,0,0.04)',
                            overflow: 'hidden'
                        }}
                    >
                        <Box sx={{ p: 2.5, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="h6" fontWeight={800}>الأصناف الأكثر مبيعًا</Typography>
                            <Typography variant="caption" color="text.secondary">مرتبة حسب إيراد اليوم</Typography>
                        </Box>
                        {loadingReport ? (
                            <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100% - 78px)' }}>
                                <CircularProgress size={30} />
                            </Box>
                        ) : topItems.length === 0 ? (
                            <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100% - 78px)' }}>
                                <Typography color="text.secondary">لا توجد مبيعات أصناف حتى الآن</Typography>
                            </Box>
                        ) : (
                            <List sx={{ p: 0, maxHeight: 340, overflowY: 'auto' }}>
                                {topItems.map((item, index) => (
                                    <ListItem key={`${item.name}-${index}`} divider={index !== topItems.length - 1} sx={{ px: 2.5, py: 1.25 }}>
                                        <ListItemAvatar>
                                            <Avatar sx={{ width: 30, height: 30, fontSize: '0.85rem', bgcolor: index < 3 ? 'primary.main' : 'grey.300' }}>
                                                {index + 1}
                                            </Avatar>
                                        </ListItemAvatar>
                                        <ListItemText
                                            primary={<Typography variant="body2" fontWeight={700}>{item.name}</Typography>}
                                            secondary={`${item.quantity} طلب`}
                                        />
                                        <Typography variant="body2" fontWeight={800} color="primary.main">
                                            {formatMoney(item.revenue)}
                                        </Typography>
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </Paper>
                </Grid>
            </Grid>

            {isAdmin && openShifts.length > 0 && (
                <Card sx={{ mb: 4, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 14px rgba(0,0,0,0.04)' }}>
                    <CardContent sx={{ p: 2.5 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <Schedule color="warning" />
                            <Typography variant="h6" fontWeight={800}>الورديات النشطة</Typography>
                            <Chip label={openShifts.length} color="warning" size="small" />
                        </Stack>
                        <Grid container spacing={2}>
                            {openShifts.map((shift) => (
                                <Grid item xs={12} sm={6} md={4} key={shift.id}>
                                    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Avatar sx={{ bgcolor: 'warning.light', color: 'warning.dark' }}>
                                            <Person />
                                        </Avatar>
                                        <Box sx={{ flexGrow: 1 }}>
                                            <Typography variant="subtitle2" fontWeight={700}>الكاشير: {shift.userName}</Typography>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                نقدية البداية: {formatMoney(shift.startingCash)}
                                            </Typography>
                                            <Typography variant="caption" color="warning.dark" fontWeight={700}>
                                                منذ {shift.duration?.formatted || '-'}
                                            </Typography>
                                        </Box>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
                    </CardContent>
                </Card>
            )}

            <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 14px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                <Box sx={{ p: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6" fontWeight={800}>أحدث الطلبات</Typography>
                        <MuiTooltip title="الانتقال لصفحة الطلبات">
                            <Button variant="text" size="small" onClick={() => navigate('/orders')}>عرض الكل</Button>
                        </MuiTooltip>
                    </Stack>
                </Box>
                <Divider />

                {recentOrders.length === 0 ? (
                    <Box sx={{ py: 5, textAlign: 'center' }}>
                        <ShoppingCart sx={{ fontSize: 52, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary">لا توجد طلبات مسجلة اليوم</Typography>
                        <Button variant="outlined" sx={{ mt: 1.5, borderRadius: 2 }} onClick={() => navigate('/new-order')}>
                            إنشاء طلب جديد
                        </Button>
                    </Box>
                ) : isMobile ? (
                    <Stack spacing={1.2} sx={{ p: 1.5 }}>
                        {recentOrders.map((order) => (
                            <Paper
                                key={order.id}
                                onClick={() => navigate(`/orders?search=${order.order_number}`)}
                                sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', cursor: 'pointer' }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                                    <Typography fontWeight={800} color="primary.main">#{order.order_number}</Typography>
                                    <Chip label={statusLabels[order.status] || order.status} color={statusColors[order.status] || 'default'} size="small" sx={{ fontWeight: 700 }} />
                                </Stack>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="body2" color="text.secondary">{getOrderTypeLabel(order.order_type)}</Typography>
                                    <Typography variant="body2" fontWeight={800}>{formatMoney(order.total)}</Typography>
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                    {new Date(order.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                            </Paper>
                        ))}
                    </Stack>
                ) : (
                    <TableContainer>
                        <Table sx={{ minWidth: 640 }} aria-label="recent orders table">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                                    <TableCell sx={{ fontWeight: 800 }}>رقم الطلب</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>النوع</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }} align="center">الإجمالي</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }} align="center">الحالة</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }} align="left">وقت الإنشاء</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {recentOrders.map((order) => (
                                    <TableRow key={order.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/orders?search=${order.order_number}`)}>
                                        <TableCell><Typography fontWeight={800} color="primary.main">#{order.order_number}</Typography></TableCell>
                                        <TableCell><Typography variant="body2" color="text.secondary">{getOrderTypeLabel(order.order_type)}</Typography></TableCell>
                                        <TableCell align="center"><Typography fontWeight={700}>{formatMoney(order.total)}</Typography></TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                label={statusLabels[order.status] || order.status}
                                                color={statusColors[order.status] || 'default'}
                                                size="small"
                                                sx={{ fontWeight: 700 }}
                                                variant={['completed', 'cancelled'].includes(order.status) ? 'outlined' : 'filled'}
                                            />
                                        </TableCell>
                                        <TableCell align="left">
                                            <Typography variant="body2" color="text.secondary">
                                                {new Date(order.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>
        </Box>
    )
}
