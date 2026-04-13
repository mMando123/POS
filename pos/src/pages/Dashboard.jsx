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
    LinearProgress,
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
    ReferenceLine,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts'
import {
    auditAPI,
    accountingAPI,
    expenseAPI,
    inventoryAPI,
    orderAPI,
    reportsAPI,
    purchaseAPI,
    purchaseOrderAPI,
    shiftAPI,
    supplierAPI,
    transferAPI
} from '../services/api'
import { hasPermission, PERMISSIONS } from '../utils/permissions'
import { useThemeConfig } from '../contexts/ThemeContext'
import ActivityTimeline from '../components/ActivityTimeline'

const statusColors = {
    new: 'info',
    confirmed: 'primary',
    preparing: 'warning',
    ready: 'primary',
    completed: 'success',
    cancelled: 'default',
}

const statusLabels = {
    new: 'جديد',
    confirmed: 'مؤكد',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    completed: 'مكتمل',
    cancelled: 'ملغي',
}

const paymentStatusColors = {
    paid: 'success',
    pending: 'warning',
    unpaid: 'warning',
    failed: 'error',
    refunded: 'default',
    partially_paid: 'info',
}

const paymentStatusLabels = {
    paid: 'مدفوع',
    pending: 'بانتظار الدفع',
    unpaid: 'غير مدفوع',
    failed: 'فشل الدفع',
    refunded: 'مسترد',
    partially_paid: 'دفع جزئي',
}

const operationsNavTabs = [
    { key: 'quotes', label: 'عروض الأسعار', allRoute: '/purchase-orders' },
    { key: 'operations', label: 'أوامر التشغيل', allRoute: '/orders' },
    { key: 'sales', label: 'المبيعات', allRoute: '/sales-invoices' },
    { key: 'received-products', label: 'المنتجات المستلمة', allRoute: '/purchases' },
    { key: 'matching', label: 'مطابقة', allRoute: null },
    { key: 'stock-transfers', label: 'تحويل المخزون', allRoute: '/stock-transfers' },
    { key: 'finance', label: 'التمويل', allRoute: '/accounting-dashboard' },
    { key: 'suppliers', label: 'الموردين', allRoute: '/suppliers' },
    { key: 'journal-vouchers', label: 'السندات المالية', allRoute: '/journal-entries' },
    { key: 'purchases', label: 'المشتريات', allRoute: '/purchase-orders' },
]

const operationsTabMessages = {
    matching: 'لا يوجد مصدر بيانات مباشر لعمليات المطابقة في النظام الحالي.'
}

const getOperationsView = (tabKey) => {
    if (tabKey === 'sales' || tabKey === 'operations') {
        return {
            showPaymentColumns: true,
            counterpartLabel: 'العميل',
            totalLabel: 'المجموع',
            successLabel: 'مدفوع',
            pendingLabel: 'قيد المتابعة'
        }
    }

    if (tabKey === 'quotes') {
        return {
            showPaymentColumns: false,
            counterpartLabel: 'المورد',
            totalLabel: 'الإجمالي',
            extraPrimaryLabel: 'المستودع',
            extraSecondaryLabel: 'تاريخ الطلب',
            successLabel: 'معتمدة',
            pendingLabel: 'قيد التسعير'
        }
    }

    if (tabKey === 'received-products') {
        return {
            showPaymentColumns: false,
            counterpartLabel: 'المورد',
            totalLabel: 'الإجمالي',
            extraPrimaryLabel: 'رقم الفاتورة',
            extraSecondaryLabel: 'المستودع',
            successLabel: 'تم الاستلام',
            pendingLabel: 'قيد الاستلام'
        }
    }

    if (tabKey === 'stock-transfers') {
        return {
            showPaymentColumns: false,
            counterpartLabel: 'المسار',
            totalLabel: 'العناصر',
            extraPrimaryLabel: 'المصدر',
            extraSecondaryLabel: 'الهدف',
            successLabel: 'تم التحويل',
            pendingLabel: 'قيد النقل'
        }
    }

    if (tabKey === 'finance' || tabKey === 'journal-vouchers') {
        return {
            showPaymentColumns: false,
            counterpartLabel: 'الوصف',
            totalLabel: 'المبلغ',
            extraPrimaryLabel: 'نوع المصدر',
            extraSecondaryLabel: 'الفترة',
            successLabel: 'قيد مرحل',
            pendingLabel: 'قيد مفتوح'
        }
    }

    if (tabKey === 'suppliers') {
        return {
            showPaymentColumns: false,
            counterpartLabel: 'المورد',
            totalLabel: 'الرصيد الحالي',
            extraPrimaryLabel: 'الهاتف',
            extraSecondaryLabel: 'الرصيد الافتتاحي',
            successLabel: 'نشط',
            pendingLabel: 'قيد المتابعة'
        }
    }

    if (tabKey === 'purchases') {
        return {
            showPaymentColumns: false,
            counterpartLabel: 'المورد',
            totalLabel: 'الإجمالي',
            extraPrimaryLabel: 'المستودع',
            extraSecondaryLabel: 'تاريخ التوريد',
            successLabel: 'مكتملة',
            pendingLabel: 'معلقة'
        }
    }

    return {
        showPaymentColumns: false,
        counterpartLabel: 'الجهة',
        totalLabel: 'القيمة',
        extraPrimaryLabel: 'تفصيل 1',
        extraSecondaryLabel: 'تفصيل 2',
        successLabel: 'مكتمل',
        pendingLabel: 'معلق'
    }
}

const shortcutDefinitions = [
    { key: 'new-order', title: 'نقطة البيع (POS)', icon: <ShoppingCart />, to: '/new-order', color: 'primary' },
    { key: 'orders', title: 'الطلبات', icon: <ListAlt />, to: '/orders', color: 'info', permission: PERMISSIONS.ORDERS_VIEW_OWN },
    { key: 'cashier-queue', title: 'كاشير الاستلام', icon: <PointOfSale />, to: '/cashier-queue', color: 'secondary', permission: PERMISSIONS.ORDERS_PROCESS },
    { key: 'pending-orders', title: 'الطلبات المعلقة', icon: <AccessTime />, to: '/pending-orders', color: 'warning', permission: PERMISSIONS.ORDERS_PROCESS },
    { key: 'delivery-board', title: 'لوحة الديليفري', icon: <LocalShipping />, to: '/delivery-board', color: 'success' },
    { key: 'inventory', title: 'المخزون', icon: <Inventory2 />, to: '/inventory', color: 'success', permission: PERMISSIONS.MENU_VIEW },
    { key: 'purchases', title: 'المشتريات', icon: <ShoppingBasket />, to: '/purchases', color: 'info', permission: PERMISSIONS.MENU_VIEW },
    { key: 'customers', title: 'العملاء', icon: <People />, to: '/customers', color: 'primary', permission: PERMISSIONS.REPORTS_VIEW },
    { key: 'reports', title: 'التقارير', icon: <TrendingUp />, to: '/reports', color: 'success', permission: PERMISSIONS.REPORTS_VIEW },
    { key: 'users', title: 'المستخدمون', icon: <Person />, to: '/users', color: 'info', permission: PERMISSIONS.USERS_MANAGE },
]

const getOrderTypeLabel = (orderType) => {
    if (orderType === 'online') return 'أونلاين'
    if (orderType === 'walkin') return 'استلام حضوري'
    if (orderType === 'dine_in') return 'صالة'
    if (orderType === 'takeaway') return 'تيك أواي'
    return 'توصيل محلي'
}

const getCustomerName = (order) =>
    order?.Customer?.name ||
    order?.customer?.name ||
    order?.customer_name ||
    'عميل نقدي'

const getPaymentStatusLabel = (order) => {
    const paymentMethod = String(order?.payment_method || '').toLowerCase()
    const paymentStatus = String(order?.payment_status || '').toLowerCase()

    if (paymentMethod === 'cash' && paymentStatus !== 'paid') return 'عند الاستلام'
    return paymentStatusLabels[paymentStatus] || 'غير محدد'
}

const getPaymentStatusColor = (order) => {
    const paymentMethod = String(order?.payment_method || '').toLowerCase()
    const paymentStatus = String(order?.payment_status || '').toLowerCase()

    if (paymentMethod === 'cash' && paymentStatus !== 'paid') return 'warning'
    return paymentStatusColors[paymentStatus] || 'default'
}

const getPaidAmount = (order) => {
    const paymentRows = Array.isArray(order?.payments) ? order.payments : []
    const paidFromRows = paymentRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0)

    if (paidFromRows > 0) return paidFromRows
    if (String(order?.payment_status || '').toLowerCase() === 'paid') return Number(order?.total || 0)
    return 0
}

const getOperationStatusMeta = (order) => {
    const status = String(order?.status || '').toLowerCase()

    if (status === 'completed') return { label: 'عملية مكتملة', color: 'success' }
    if (status === 'cancelled') return { label: 'ملغاة', color: 'error' }
    if (['pending'].includes(status)) return { label: 'عملية معلقة', color: 'warning' }
    return { label: 'قيد المعالجة', color: 'info' }
}

const getPaymentBadgeMeta = (order) => {
    const total = Number(order?.total || 0)
    const paidAmount = getPaidAmount(order)

    if (paidAmount >= total && total > 0) return { label: 'مدفوع كاملاً', color: 'success' }
    if (paidAmount > 0) return { label: 'دفع جزئي', color: 'warning' }
    return { label: 'غير مدفوع', color: 'error' }
}

const formatOrderDate = (value) => {
    if (!value) return { day: '--', time: '--' }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return { day: '--', time: '--' }

    return {
        day: date.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    }
}

const pickFirstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== '')

const pickFirstNumber = (...values) => {
    for (const value of values) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return null
}

const formatAmountCell = (value, formatCurrency) => {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'string' && Number.isNaN(Number(value))) return value
    return formatCurrency(Number(value || 0))
}

const buildGenericStatusMeta = (status, labels = {}) => {
    const normalized = String(status || '').toLowerCase()
    const successStates = new Set(['completed', 'received', 'approved', 'posted', 'active'])
    const warningStates = new Set(['pending', 'draft', 'open'])
    const errorStates = new Set(['cancelled', 'rejected', 'inactive', 'failed'])

    if (successStates.has(normalized)) {
        return { label: labels.success || 'عملية مكتملة', color: 'success' }
    }
    if (warningStates.has(normalized)) {
        return { label: labels.warning || 'عملية معلقة', color: 'warning' }
    }
    if (errorStates.has(normalized)) {
        return { label: labels.error || 'ملغاة', color: 'error' }
    }
    return { label: labels.info || 'قيد المعالجة', color: 'info' }
}

const dedupeAlerts = (items) => {
    const unique = new Map()
    ;(items || []).forEach((item) => {
        const key = `${item.menuId || item.id || item.productName || 'unknown'}-${item.warehouseId || 'all'}`
        if (!unique.has(key)) unique.set(key, item)
    })
    return Array.from(unique.values())
}

const formatHourLabel = (hour) => {
    const h = Number(hour)
    if (!Number.isFinite(h)) return '--'
    if (h > 12) return `${h - 12}م`
    if (h === 12) return '12م'
    if (h === 0) return '12ص'
    return `${h}ص`
}

const formatCompactNumber = (value) => {
    const amount = Number(value || 0)
    const abs = Math.abs(amount)
    if (abs >= 1000000) return `${(amount / 1000000).toFixed(1)}م`
    if (abs >= 1000) return `${(amount / 1000).toFixed(abs >= 10000 ? 0 : 1)}ك`
    return `${Math.round(amount)}`
}

const toSafeNumber = (value) => {
    const amount = Number(value)
    return Number.isFinite(amount) ? amount : 0
}

const StatCard = ({ title, value, icon, colorName }) => {
    const theme = useTheme();
    const mainColor = theme.palette[colorName]?.main || colorName;
    const lightColor = theme.palette[colorName]?.light || `${mainColor}20`;

    return (
        <Card sx={{ 
            height: '100%', 
            borderRadius: 4, 
            boxShadow: '0 4px 24px 0 rgba(0,0,0,0.04)', 
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
            border: '1px solid',
            borderColor: 'rgba(0,0,0,0.03)',
            position: 'relative',
            overflow: 'hidden',
            '&:hover': { 
                transform: 'translateY(-6px)',
                boxShadow: `0 14px 28px -4px ${lightColor}` 
            } 
        }}>
            <Box sx={{
                position: 'absolute',
                top: -20,
                right: -20,
                width: 140,
                height: 140,
                borderRadius: '50%',
                bgcolor: lightColor,
                opacity: 0.25,
                zIndex: 0
            }} />
            
            <CardContent sx={{ position: 'relative', zIndex: 1, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight="800">
                            {title}
                        </Typography>
                    </Box>
                    <Avatar sx={{ 
                        bgcolor: lightColor, 
                        color: mainColor, 
                        width: 50, 
                        height: 50, 
                        borderRadius: 3 
                    }}>
                        {icon}
                    </Avatar>
                </Box>
                <Typography variant="h4" fontWeight="900" sx={{ color: mainColor, letterSpacing: '-0.5px', mt: 'auto' }}>
                    {value}
                </Typography>
            </CardContent>
        </Card>
    );
};

const ShortcutCard = ({ title, icon, to, colorName='primary', onNavigate }) => {
    const theme = useTheme();
    const mainColor = theme.palette[colorName]?.main || colorName;
    const lightColor = theme.palette[colorName]?.lighter || `${mainColor}22`;
    
    return (
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
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: `0 8px 25px ${mainColor}33`, borderColor: mainColor },
                    '&:focus-visible': { outline: '3px solid', outlineColor: `${mainColor}55`, outlineOffset: 2 }
                }}
            >
                <Stack direction="column" spacing={1.2} alignItems="center" justifyContent="center">
                    <Avatar sx={{ bgcolor: lightColor, color: mainColor, width: 42, height: 42, transition: 'transform 0.2s', '.MuiPaper-root:hover &': { transform: 'scale(1.15)' } }}>{icon}</Avatar>
                    <Typography variant="subtitle2" fontWeight={800} textAlign="center" lineHeight={1.2} sx={{ transition: 'color 0.2s', '.MuiPaper-root:hover &': { color: mainColor } }}>{title}</Typography>
                </Stack>
            </Paper>
        </Grid>
    )
}

export default function Dashboard() {
    const navigate = useNavigate()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

    const [stats, setStats] = useState({ todayOrders: 0, todayRevenue: 0, pendingOrders: 0, completedOrders: 0 })
    const [financialStats, setFinancialStats] = useState({
        totalPayments: 0,
        todayReceipts: 0,
        todaySales: 0,
        totalExpenses: 0,
        todayExpenses: 0,
        totalCredit: 0
    })
    const [recentOrders, setRecentOrders] = useState([])
    const [activeOperationsTab, setActiveOperationsTab] = useState('sales')
    const [operationsRows, setOperationsRows] = useState([])
    const [operationsLoading, setOperationsLoading] = useState(false)
    const [operationsError, setOperationsError] = useState('')
    const [openShifts, setOpenShifts] = useState([])
    const [reportData, setReportData] = useState(null)
    const [lowStockAlerts, setLowStockAlerts] = useState([])
    const [activityFeed, setActivityFeed] = useState([])
    const [activityLoading, setActivityLoading] = useState(false)
    const [activityError, setActivityError] = useState('')
    const [loadingReport, setLoadingReport] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null)

    const { orders } = useSelector((state) => state.orders)
    const { user } = useSelector((state) => state.auth)
    const isAdmin = user?.role === 'admin' || user?.role === 'manager'
    const userRole = user?.role || 'cashier'
    const canViewActivityFeed = hasPermission(userRole, PERMISSIONS.REPORTS_VIEW) || hasPermission(userRole, PERMISSIONS.USERS_VIEW)
    const { formatCurrency } = useThemeConfig()

    const updateStats = (ordersData, reportSummary = null) => {
        const list = Array.isArray(ordersData) ? ordersData : []
        const pending = list.filter((order) => ['new', 'confirmed', 'preparing'].includes(order.status)).length
        const completed = list.filter((order) => order.status === 'completed').length
        const revenue = reportSummary
            ? toSafeNumber(reportSummary.totalSales)
            : list.filter((order) => order.payment_status === 'paid').reduce((sum, order) => sum + parseFloat(order.total || 0), 0)

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
        if (canViewActivityFeed) {
            setActivityLoading(true)
            setActivityError('')
        }

        try {
            const today = new Date().toISOString().split('T')[0]
            const [ordersRes, reportRes, alertsRes, payablesRes, expensesRes, todayExpensesRes, activityRes] = await Promise.allSettled([
                orderAPI.getAll({ date_from: today, limit: 100 }),
                reportsAPI.getDaily(today),
                inventoryAPI.getAlerts(),
                supplierAPI.getPayablesSummary({ include_zero: true }),
                expenseAPI.getSummary(),
                expenseAPI.getSummary({ from_date: today, to_date: today }),
                canViewActivityFeed ? auditAPI.getFeed({ limit: 10 }) : Promise.resolve({ data: { data: [] } })
            ])

            const reportPayload = reportRes.status === 'fulfilled'
                ? (reportRes.value.data?.data || null)
                : null
            const reportSummary = reportPayload?.summary || null

            if (ordersRes.status === 'fulfilled') {
                const ordersData = ordersRes.value.data?.data || []
                setRecentOrders(ordersData.slice(0, 10))
                updateStats(ordersData, reportSummary)
            } else {
                setRecentOrders([])
                updateStats([], reportSummary)
            }

            setReportData(reportPayload)

            if (alertsRes.status === 'fulfilled') {
                const alertsData = alertsRes.value.data?.data || {}
                const mergedAlerts = [...(alertsData.lowStock || []), ...(alertsData.outOfStock || [])]
                setLowStockAlerts(dedupeAlerts(mergedAlerts))
            } else {
                setLowStockAlerts([])
            }

            const payablesData = payablesRes.status === 'fulfilled'
                ? (payablesRes.value.data?.data || {})
                : {}
            const payablesRows = Array.isArray(payablesData.rows) ? payablesData.rows : []
            const payablesSummary = payablesData.summary || {}
            const totalPayments = payablesRows.reduce(
                (sum, row) => sum + toSafeNumber(row.total_settlements_ap),
                0
            )

            const allExpensesSummary = expensesRes.status === 'fulfilled'
                ? (expensesRes.value.data?.data || {})
                : {}
            const todayExpensesSummary = todayExpensesRes.status === 'fulfilled'
                ? (todayExpensesRes.value.data?.data || {})
                : {}

            setFinancialStats({
                totalPayments,
                todayReceipts: toSafeNumber(
                    pickFirstDefined(
                        reportSummary?.totalReceipts,
                        (toSafeNumber(reportSummary?.cashReceipts) + toSafeNumber(reportSummary?.cardReceipts) + toSafeNumber(reportSummary?.onlineReceipts))
                    )
                ),
                todaySales: toSafeNumber(reportSummary?.totalSales),
                totalExpenses: toSafeNumber(allExpensesSummary.total_amount),
                todayExpenses: toSafeNumber(todayExpensesSummary.total_amount),
                totalCredit: toSafeNumber(pickFirstDefined(
                    payablesSummary.net_payables,
                    payablesSummary.total_outstanding_payables
                ))
            })

            if (canViewActivityFeed) {
                if (activityRes.status === 'fulfilled') {
                    setActivityFeed(activityRes.value.data?.data || [])
                    setActivityError('')
                } else {
                    setActivityFeed([])
                    setActivityError(activityRes.reason?.response?.data?.message || 'تعذر تحميل سجل النشاط.')
                }
            } else {
                setActivityFeed([])
                setActivityError('')
            }

            setLastUpdatedAt(new Date())
        } catch (error) {
            console.error('Error fetching dashboard data:', error)
        } finally {
            setLoadingReport(false)
            setIsRefreshing(false)
            setActivityLoading(false)
        }
    }

    const fetchOperationsData = async (tabKey) => {
        const unsupportedMessage = operationsTabMessages[tabKey]
        if (unsupportedMessage) {
            setOperationsRows([])
            setOperationsError(unsupportedMessage)
            return
        }

        setOperationsLoading(true)
        setOperationsError('')

        try {
            let rows = []

            if (tabKey === 'sales') {
                const response = await orderAPI.getAll({ limit: 5, offset: 0 })
                rows = (response.data?.data || []).slice(0, 5).map((order) => {
                    const statusMeta = getOperationStatusMeta(order)
                    const paymentMeta = getPaymentBadgeMeta(order)
                    const paidAmount = getPaidAmount(order)

                    return {
                        id: order.id,
                        date: order.created_at,
                        reference: order.order_number,
                        counterpart: getCustomerName(order),
                        statusLabel: statusMeta.label,
                        statusColor: statusMeta.color,
                        totalValue: Number(order.total || 0),
                        paymentLabel: paymentMeta.label,
                        paymentColor: paymentMeta.color,
                        paidValue: paidAmount,
                        openTo: `/orders?search=${encodeURIComponent(order.order_number || '')}`
                    }
                })
            } else if (tabKey === 'operations') {
                const response = await orderAPI.getAll({ limit: 20, offset: 0 })
                rows = (response.data?.data || [])
                    .filter((order) => !['completed', 'cancelled'].includes(String(order.status || '').toLowerCase()))
                    .slice(0, 5)
                    .map((order) => {
                        const statusMeta = getOperationStatusMeta(order)
                        const paymentMeta = getPaymentBadgeMeta(order)
                        const paidAmount = getPaidAmount(order)

                        return {
                            id: order.id,
                            date: order.created_at,
                            reference: order.order_number,
                            counterpart: getCustomerName(order),
                            statusLabel: statusMeta.label,
                            statusColor: statusMeta.color,
                            totalValue: Number(order.total || 0),
                            paymentLabel: paymentMeta.label,
                            paymentColor: paymentMeta.color,
                            paidValue: paidAmount,
                            openTo: `/orders?search=${encodeURIComponent(order.order_number || '')}`
                        }
                    })
            } else if (tabKey === 'received-products') {
                const response = await purchaseAPI.getAll({ limit: 5, offset: 0 })
                rows = (response.data?.data || []).slice(0, 5).map((receipt) => {
                    const statusMeta = buildGenericStatusMeta(receipt.status, {
                        success: 'تم الاستلام',
                        warning: 'استلام معلق',
                        error: 'ملغي',
                        info: 'قيد الاستلام'
                    })

                    return {
                        id: receipt.id,
                        date: receipt.created_at || receipt.invoice_date,
                        reference: pickFirstDefined(receipt.receipt_number, receipt.invoice_number, receipt.id),
                        counterpart: pickFirstDefined(receipt.Supplier?.name_ar, receipt.supplier_name, 'مورد غير محدد'),
                        statusLabel: statusMeta.label,
                        statusColor: statusMeta.color,
                        totalValue: pickFirstNumber(receipt.total_amount, receipt.total_cost, receipt.grand_total, receipt.subtotal),
                        extraPrimaryValue: pickFirstDefined(receipt.invoice_number, '—'),
                        extraSecondaryValue: pickFirstDefined(receipt.Warehouse?.name_ar, '—'),
                        paymentLabel: '—',
                        paymentColor: 'default',
                        paidValue: '—',
                        openTo: '/purchases'
                    }
                })
            } else if (tabKey === 'stock-transfers') {
                const response = await transferAPI.getAll({ limit: 5, offset: 0 })
                rows = (response.data?.data || []).slice(0, 5).map((transfer) => {
                    const statusMeta = buildGenericStatusMeta(transfer.status, {
                        success: 'تم التحويل',
                        warning: 'تحويل معلق',
                        error: 'ملغي',
                        info: 'قيد النقل'
                    })
                    const itemsCount = Array.isArray(transfer.items) ? transfer.items.length : 0

                    return {
                        id: transfer.id,
                        date: transfer.created_at || transfer.completed_at,
                        reference: pickFirstDefined(transfer.transfer_number, transfer.id),
                        counterpart: `${pickFirstDefined(transfer.fromWarehouse?.name_ar, 'مخزن')} ← ${pickFirstDefined(transfer.toWarehouse?.name_ar, 'مخزن')}`,
                        statusLabel: statusMeta.label,
                        statusColor: statusMeta.color,
                        totalValue: `${itemsCount} صنف`,
                        extraPrimaryValue: pickFirstDefined(transfer.fromWarehouse?.name_ar, '—'),
                        extraSecondaryValue: pickFirstDefined(transfer.toWarehouse?.name_ar, '—'),
                        paymentLabel: '—',
                        paymentColor: 'default',
                        paidValue: '—',
                        openTo: '/stock-transfers'
                    }
                })
            } else if (tabKey === 'finance' || tabKey === 'journal-vouchers') {
                const response = await accountingAPI.getJournalEntries({ page: 1, limit: 5 })
                rows = (response.data?.data || []).slice(0, 5).map((entry) => {
                    const statusMeta = buildGenericStatusMeta(entry.status, {
                        success: 'قيد مرحل',
                        warning: 'مسودة',
                        error: 'ملغي',
                        info: 'قيد محاسبي'
                    })

                    return {
                        id: entry.id,
                        date: entry.entry_date || entry.created_at,
                        reference: pickFirstDefined(entry.entry_number, entry.reference_number, entry.id),
                        counterpart: pickFirstDefined(entry.description, entry.source_type, 'قيد محاسبي'),
                        statusLabel: statusMeta.label,
                        statusColor: statusMeta.color,
                        totalValue: pickFirstNumber(entry.total_debit, entry.total_credit, entry.amount),
                        extraPrimaryValue: pickFirstDefined(entry.source_type, '—'),
                        extraSecondaryValue: pickFirstDefined(entry.fiscal_period, '—'),
                        paymentLabel: '—',
                        paymentColor: 'default',
                        paidValue: '—',
                        openTo: '/journal-entries'
                    }
                })
            } else if (tabKey === 'suppliers') {
                const response = await supplierAPI.getAll({ page: 1, limit: 50 })
                rows = (response.data?.data || [])
                    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                    .slice(0, 5)
                    .map((supplier) => {
                        const statusMeta = buildGenericStatusMeta(supplier.status, {
                            success: 'مورد نشط',
                            warning: 'قيد المراجعة',
                            error: 'مورد غير نشط',
                            info: 'قيد المعالجة'
                        })

                        return {
                            id: supplier.id,
                            date: supplier.created_at || supplier.updated_at,
                            reference: pickFirstDefined(supplier.code, supplier.id),
                            counterpart: pickFirstDefined(supplier.name_ar, supplier.name_en, 'مورد'),
                            statusLabel: statusMeta.label,
                            statusColor: statusMeta.color,
                            totalValue: pickFirstNumber(supplier.current_balance, supplier.opening_balance),
                            extraPrimaryValue: pickFirstDefined(supplier.phone, '—'),
                            extraSecondaryValue: pickFirstNumber(supplier.opening_balance, 0),
                            paymentLabel: '—',
                            paymentColor: 'default',
                            paidValue: '—',
                            openTo: '/suppliers'
                        }
                    })
            } else if (tabKey === 'quotes' || tabKey === 'purchases') {
                const response = await purchaseOrderAPI.getAll({ limit: 5, offset: 0 })
                rows = (response.data?.data || []).slice(0, 5).map((purchaseOrder) => {
                    const statusMeta = buildGenericStatusMeta(purchaseOrder.status, {
                        success: tabKey === 'quotes' ? 'عرض معتمد' : 'عملية مكتملة',
                        warning: tabKey === 'quotes' ? 'قيد التسعير' : 'عملية معلقة',
                        error: 'ملغاة',
                        info: 'قيد المعالجة'
                    })

                    return {
                        id: purchaseOrder.id,
                        date: purchaseOrder.created_at || purchaseOrder.order_date,
                        reference: pickFirstDefined(purchaseOrder.po_number, purchaseOrder.id),
                        counterpart: pickFirstDefined(purchaseOrder.Supplier?.name_ar, purchaseOrder.supplier_name, 'مورد'),
                        statusLabel: statusMeta.label,
                        statusColor: statusMeta.color,
                        totalValue: pickFirstNumber(
                            purchaseOrder.total_amount,
                            purchaseOrder.grand_total,
                            purchaseOrder.subtotal
                        ),
                        extraPrimaryValue: pickFirstDefined(purchaseOrder.Warehouse?.name_ar, '—'),
                        extraSecondaryValue: pickFirstDefined(purchaseOrder.order_date, purchaseOrder.expected_date, '—'),
                        paymentLabel: '—',
                        paymentColor: 'default',
                        paidValue: '—',
                        openTo: '/purchase-orders'
                    }
                })
            }

            setOperationsRows(rows)
            if (rows.length === 0) {
                setOperationsError('لا توجد عمليات حديثة لهذا القسم حاليًا.')
            }
        } catch (error) {
            console.error('Error fetching operations widget data:', error)
            setOperationsRows([])
            setOperationsError(error.response?.data?.message || 'تعذر تحميل العمليات لهذا القسم.')
        } finally {
            setOperationsLoading(false)
        }
    }

    useEffect(() => {
        fetchDashboardData()
        if (isAdmin) fetchOpenShifts()
    }, [isAdmin, canViewActivityFeed])

    useEffect(() => {
        fetchOperationsData(activeOperationsTab)
    }, [activeOperationsTab])

    useEffect(() => {
        updateStats(orders)
    }, [orders])

    const visibleQuickShortcuts = useMemo(() => (
        shortcutDefinitions.filter((item) => !item.permission || hasPermission(userRole, item.permission)).slice(0, 6)
    ), [userRole])

    const hourlyBreakdown = useMemo(() => {
        const source = Array.isArray(reportData?.hourlyBreakdown) ? reportData.hourlyBreakdown : []
        const salesByHour = new Map(
            source.map((hour) => [Number(hour.hour), Number(hour.revenue || 0)])
        )

        // Keep a full-day timeline so the chart stays readable even with sparse sales.
        return Array.from({ length: 24 }, (_, hour) => ({
            hour,
            name: formatHourLabel(hour),
            sales: salesByHour.get(hour) || 0
        }))
    }, [reportData])

    const topItems = useMemo(() => reportData?.topItems || [], [reportData])
    const hourlyPeak = useMemo(() => Math.max(0, ...hourlyBreakdown.map((hour) => Number(hour.sales || 0))), [hourlyBreakdown])
    const hourlyAverage = useMemo(() => {
        if (!hourlyBreakdown.length) return 0
        const total = hourlyBreakdown.reduce((sum, hour) => sum + Number(hour.sales || 0), 0)
        return total / hourlyBreakdown.length
    }, [hourlyBreakdown])
    const topRevenueMax = useMemo(() => Math.max(0, ...topItems.map((item) => Number(item.revenue || 0))), [topItems])
    const operationsView = useMemo(() => getOperationsView(activeOperationsTab), [activeOperationsTab])
    const recentPaidCount = useMemo(() => (
        operationsView.showPaymentColumns
            ? operationsRows.filter((row) => row.paymentColor === 'success').length
            : operationsRows.filter((row) => row.statusColor === 'success').length
    ), [operationsRows, operationsView.showPaymentColumns])
    const recentPendingCount = useMemo(() => (
        operationsRows.filter((row) => ['warning', 'info'].includes(row.statusColor)).length
    ), [operationsRows])
    const recentOperations = useMemo(() => operationsRows.slice(0, 5), [operationsRows])

    const renderSalesTooltip = ({ active, payload }) => {
        if (!active || !payload?.length) return null

        const point = payload[0]?.payload || {}
        const sales = Number(point.sales || 0)
        const contribution = stats.todayRevenue > 0 ? (sales / stats.todayRevenue) * 100 : 0

        return (
            <Paper
                elevation={0}
                sx={{
                    px: 1.5,
                    py: 1.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: '0 8px 22px rgba(15,23,42,0.12)'
                }}
            >
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
                    الساعة {point.name}
                </Typography>
                <Typography variant="subtitle1" fontWeight={800} color="primary.main" sx={{ lineHeight: 1.2 }}>
                    {formatCurrency(sales)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {contribution.toFixed(1)}% من إجمالي اليوم
                </Typography>
            </Paper>
        )
    }

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
                        variant="contained"
                        startIcon={isRefreshing ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon />}
                        onClick={() => {
                            fetchDashboardData()
                            fetchOperationsData(activeOperationsTab)
                            if (isAdmin) fetchOpenShifts()
                        }}
                        disabled={isRefreshing}
                        sx={{ borderRadius: 2, alignSelf: { xs: 'flex-start', sm: 'center' }, boxShadow: '0 4px 14px rgba(25,118,210,0.25)' }}
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
                        colorName={shortcut.color}
                        onNavigate={navigate}
                    />
                ))}
            </Grid>

            <Typography variant="h6" fontWeight={800} gutterBottom sx={{ mb: 1.5 }}>
                ملخص أداء اليوم
            </Typography>
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="إجمالي الطلبات" value={stats.todayOrders} icon={<ShoppingCart />} colorName="primary" />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="طلبات قيد التنفيذ" value={stats.pendingOrders} icon={<AccessTime />} colorName="warning" />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="طلبات مكتملة" value={stats.completedOrders} icon={<CheckCircle />} colorName="success" />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="إيراد اليوم" value={formatCurrency(stats.todayRevenue)} icon={<AttachMoney />} colorName="info" />
                </Grid>
            </Grid>

            <Typography variant="h6" fontWeight={800} gutterBottom sx={{ mb: 1.5 }}>
                الملخص المالي
            </Typography>
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="إجمالي المدفوعات"
                        value={formatCurrency(financialStats.totalPayments)}
                        icon={<PointOfSale />}
                        colorName="#1976d2"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="إجمالي المصروفات"
                        value={formatCurrency(financialStats.totalExpenses)}
                        icon={<ShoppingBasket />}
                        colorName="#ff7043"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="مصروفات اليوم"
                        value={formatCurrency(financialStats.todayExpenses)}
                        icon={<Schedule />}
                        colorName="#f9a825"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="إجمالي الآجل"
                        value={formatCurrency(financialStats.totalCredit)}
                        icon={<Warning />}
                        colorName="#ff6f61"
                    />
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
                            <Chip
                                label={hourlyPeak > 0 ? `الذروة ${formatCurrency(hourlyPeak)}` : 'بدون مبيعات'}
                                color={hourlyPeak > 0 ? 'success' : 'default'}
                                size="small"
                            />
                        </Stack>
                        <Box sx={{ height: 340 }}>
                            {loadingReport ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <CircularProgress />
                                </Box>
                            ) : hourlyPeak === 0 ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <Typography color="text.secondary">لا توجد بيانات مبيعات خلال اليوم</Typography>
                                </Box>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={hourlyBreakdown} margin={{ top: 14, right: 14, left: 4, bottom: 8 }}>
                                        <defs>
                                            <linearGradient id="dashboardSalesGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.55} />
                                                <stop offset="30%" stopColor={theme.palette.primary.light || '#2196f3'} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.22} />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fontSize: 12 }}
                                            interval={isMobile ? 3 : 1}
                                            minTickGap={16}
                                            tickLine={false}
                                            axisLine={{ stroke: 'rgba(15,23,42,0.2)' }}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 12 }}
                                            tickFormatter={formatCompactNumber}
                                            width={50}
                                            tickLine={false}
                                            axisLine={false}
                                            domain={[0, (dataMax) => Math.max(50, Math.ceil((Number(dataMax || 0) * 1.15) / 10) * 10)]}
                                        />
                                        <ReferenceLine
                                            y={hourlyAverage}
                                            stroke={theme.palette.warning.main}
                                            strokeDasharray="5 5"
                                            ifOverflow="extendDomain"
                                            label={{
                                                value: `متوسط ${formatCompactNumber(hourlyAverage)}`,
                                                position: 'insideTopLeft',
                                                fill: theme.palette.warning.main,
                                                fontSize: 11
                                            }}
                                        />
                                        <Tooltip
                                            content={renderSalesTooltip}
                                            cursor={{ stroke: theme.palette.primary.light || '#90caf9', strokeDasharray: '4 4' }}
                                        />
                                        <Area
                                            type="monotoneX"
                                            dataKey="sales"
                                            stroke={theme.palette.primary.main}
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#dashboardSalesGradient)"
                                            dot={{ r: 2.5, fill: '#ffffff', stroke: theme.palette.primary.main, strokeWidth: 2 }}
                                            activeDot={{ r: 5.5, fill: theme.palette.primary.main, stroke: '#ffffff', strokeWidth: 2 }}
                                            isAnimationActive={!isMobile}
                                        />
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
                            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                <Box>
                                    <Typography variant="h6" fontWeight={800}>الأصناف الأكثر مبيعًا</Typography>
                                    <Typography variant="caption" color="text.secondary">مرتبة حسب إيراد اليوم</Typography>
                                </Box>
                                <Chip label={`${topItems.length} أصناف`} size="small" variant="outlined" />
                            </Stack>
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
                                    <ListItem key={`${item.name || item.name_ar || 'item'}-${index}`} divider={index !== topItems.length - 1} sx={{ px: 2.5, py: 1.25 }}>
                                        <ListItemAvatar>
                                            <Avatar sx={{ width: 30, height: 30, fontSize: '0.85rem', bgcolor: index < 3 ? 'primary.main' : 'grey.300', color: index < 3 ? 'common.white' : 'text.primary' }}>
                                                {index + 1}
                                            </Avatar>
                                        </ListItemAvatar>
                                        <ListItemText
                                            primary={
                                                <Typography variant="body2" fontWeight={700} noWrap>
                                                    {item.name || item.name_ar || item.item_name_ar || 'صنف بدون اسم'}
                                                </Typography>
                                            }
                                            secondary={
                                                <Box sx={{ mt: 0.5 }}>
                                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                                        {item.quantity || 0} طلب
                                                    </Typography>
                                                    <LinearProgress
                                                        variant="determinate"
                                                        value={topRevenueMax > 0 ? Math.min(100, (Number(item.revenue || 0) / topRevenueMax) * 100) : 0}
                                                        sx={{
                                                            height: 6,
                                                            borderRadius: 99,
                                                            bgcolor: 'rgba(25,118,210,0.14)',
                                                            '& .MuiLinearProgress-bar': {
                                                                borderRadius: 99,
                                                                background: 'linear-gradient(90deg, #1976d2 0%, #42a5f5 100%)'
                                                            }
                                                        }}
                                                    />
                                                </Box>
                                            }
                                        />
                                        <Typography variant="body2" fontWeight={800} color="primary.main">
                                            {formatCurrency(item.revenue)}
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
                                                نقدية البداية: {formatCurrency(shift.startingCash)}
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
                <Box sx={{ px: 2, pt: 2, pb: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc' }}>
                    <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 0.75, overflowX: 'auto', pb: 0.5 }}>
                        {operationsNavTabs.map((tab) => (
                            <Button
                                key={tab.key}
                                size="small"
                                variant={activeOperationsTab === tab.key ? 'contained' : 'outlined'}
                                onClick={() => setActiveOperationsTab(tab.key)}
                                sx={{
                                    flex: '0 0 auto',
                                    minWidth: 'fit-content',
                                    borderRadius: 1.5,
                                    px: 1.5,
                                    py: 0.75,
                                    fontWeight: 800,
                                    whiteSpace: 'nowrap',
                                    boxShadow: activeOperationsTab === tab.key ? '0 6px 18px rgba(25,118,210,0.22)' : 'none',
                                    ...(activeOperationsTab === tab.key ? {
                                        bgcolor: '#1565c0',
                                        '&:hover': { bgcolor: '#0d47a1' }
                                    } : {
                                        color: '#1565c0',
                                        borderColor: '#90caf9',
                                        '&:hover': {
                                            borderColor: '#1565c0',
                                            bgcolor: 'rgba(21,101,192,0.04)'
                                        }
                                    })
                                }}
                            >
                                {tab.label}
                            </Button>
                        ))}
                    </Box>
                </Box>
                <Box sx={{ p: 2.5 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
                        <Box>
                            <Typography variant="h6" fontWeight={800}>أحدث خمس عمليات</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {operationsNavTabs.find((tab) => tab.key === activeOperationsTab)?.label || 'العمليات'} مرتبة من الأحدث إلى الأقدم.
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`${recentOperations.length} عملية`} color="primary" variant="outlined" size="small" />
                            <Chip label={`${recentPaidCount} ${operationsView.successLabel}`} color="success" variant="outlined" size="small" />
                            <Chip label={`${recentPendingCount} ${operationsView.pendingLabel}`} color="warning" variant="outlined" size="small" />
                            {!!operationsNavTabs.find((tab) => tab.key === activeOperationsTab)?.allRoute && (
                                <MuiTooltip title="الانتقال لصفحة التفاصيل الكاملة">
                                    <Button
                                        variant="text"
                                        size="small"
                                        onClick={() => navigate(operationsNavTabs.find((tab) => tab.key === activeOperationsTab)?.allRoute || '/')}
                                    >
                                        عرض الكل
                                    </Button>
                                </MuiTooltip>
                            )}
                        </Stack>
                    </Stack>
                </Box>
                <Divider />

                {operationsLoading ? (
                    <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress />
                    </Box>
                ) : recentOperations.length === 0 ? (
                    <Box sx={{ py: 5, textAlign: 'center' }}>
                        <ShoppingCart sx={{ fontSize: 52, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary">{operationsError || 'لا توجد عمليات حديثة لهذا القسم'}</Typography>
                    </Box>
                ) : isMobile ? (
                    <Stack spacing={1.2} sx={{ p: 1.5 }}>
                        {recentOperations.map((item) => (
                            <Paper
                                key={item.id}
                                onClick={() => {
                                    if (item.openTo) navigate(item.openTo)
                                }}
                                sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', cursor: item.openTo ? 'pointer' : 'default' }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                                    <Typography fontWeight={800} color="primary.main">{item.reference}</Typography>
                                    <Chip label={item.statusLabel} color={item.statusColor} size="small" sx={{ fontWeight: 700 }} />
                                </Stack>
                                <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                                    {item.counterpart}
                                </Typography>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="body2" color="text.secondary">
                                        {operationsView.totalLabel}: {formatAmountCell(item.totalValue, formatCurrency)}
                                    </Typography>
                                    {operationsView.showPaymentColumns ? (
                                        <Typography variant="body2" fontWeight={800}>
                                            {formatAmountCell(item.paidValue, formatCurrency)}
                                        </Typography>
                                    ) : (
                                        <Typography variant="body2" fontWeight={800}>
                                            {operationsView.extraPrimaryLabel}: {formatAmountCell(item.extraPrimaryValue, formatCurrency)}
                                        </Typography>
                                    )}
                                </Stack>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.75 }}>
                                    {operationsView.showPaymentColumns ? (
                                        <Chip
                                            label={item.paymentLabel}
                                            color={item.paymentColor}
                                            size="small"
                                            variant="outlined"
                                            sx={{ fontWeight: 700 }}
                                        />
                                    ) : (
                                        <Typography variant="caption" color="text.secondary">
                                            {operationsView.extraSecondaryLabel}: {formatAmountCell(item.extraSecondaryValue, formatCurrency)}
                                        </Typography>
                                    )}
                                    <Typography variant="caption" color="text.secondary">
                                        {formatOrderDate(item.date).time}
                                    </Typography>
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                ) : (
                    <TableContainer>
                        <Table sx={{ minWidth: 920 }} aria-label="recent operations table">
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#243447', '& th': { borderBottom: '2px solid', borderColor: '#1b2838', color: '#fff' } }}>
                                    <TableCell sx={{ fontWeight: 800 }}>التاريخ</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>الرقم المرجعي</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>{operationsView.counterpartLabel}</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }} align="center">الحالة</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }} align="left">{operationsView.totalLabel}</TableCell>
                                    {operationsView.showPaymentColumns ? (
                                        <>
                                            <TableCell sx={{ fontWeight: 800 }} align="center">حالة الدفع</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }} align="left">المدفوع</TableCell>
                                        </>
                                    ) : (
                                        <>
                                            <TableCell sx={{ fontWeight: 800 }} align="left">{operationsView.extraPrimaryLabel}</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }} align="left">{operationsView.extraSecondaryLabel}</TableCell>
                                        </>
                                    )}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {recentOperations.map((item) => (
                                    <TableRow
                                        key={item.id}
                                        hover={!!item.openTo}
                                        sx={{ cursor: item.openTo ? 'pointer' : 'default' }}
                                        onClick={() => {
                                            if (item.openTo) navigate(item.openTo)
                                        }}
                                    >
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: 'nowrap' }}>
                                                {formatOrderDate(item.date).time}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {formatOrderDate(item.date).day}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            {item.openTo ? (
                                                <Button
                                                    variant="text"
                                                    size="small"
                                                    sx={{ fontWeight: 800, px: 0, minWidth: 0, justifyContent: 'flex-start' }}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        navigate(item.openTo)
                                                    }}
                                                >
                                                    {item.reference}
                                                </Button>
                                            ) : (
                                                <Typography fontWeight={800} color="primary.main">{item.reference}</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={700}>
                                                {item.counterpart}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip label={item.statusLabel} color={item.statusColor} size="small" sx={{ fontWeight: 700 }} />
                                        </TableCell>
                                        <TableCell align="left">
                                            <Typography fontWeight={700}>{formatAmountCell(item.totalValue, formatCurrency)}</Typography>
                                        </TableCell>
                                        {operationsView.showPaymentColumns ? (
                                            <>
                                                <TableCell align="center">
                                                    <Chip label={item.paymentLabel} color={item.paymentColor} size="small" sx={{ fontWeight: 700 }} />
                                                </TableCell>
                                                <TableCell align="left">
                                                    <Typography fontWeight={700}>{formatAmountCell(item.paidValue, formatCurrency)}</Typography>
                                                </TableCell>
                                            </>
                                        ) : (
                                            <>
                                                <TableCell align="left">
                                                    <Typography fontWeight={700}>{formatAmountCell(item.extraPrimaryValue, formatCurrency)}</Typography>
                                                </TableCell>
                                                <TableCell align="left">
                                                    <Typography fontWeight={700}>{formatAmountCell(item.extraSecondaryValue, formatCurrency)}</Typography>
                                                </TableCell>
                                            </>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {canViewActivityFeed && (
                <ActivityTimeline
                    items={activityFeed}
                    loading={activityLoading}
                    error={activityError}
                    title="سجل النشاط"
                    subtitle="آخر العمليات التي نفذها المستخدمون على النظام"
                />
            )}
        </Box>
    )
}
