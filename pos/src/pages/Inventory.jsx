import { useState, useEffect, useCallback } from 'react'
import { useMemo } from 'react'
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    IconButton,
    InputAdornment,
    FormControl,
    FormControlLabel,
    InputLabel,
    Select,
    MenuItem,
    Switch,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    CircularProgress,
    Card,
    CardContent,
    Grid,
    Tooltip,
    Tabs,
    Tab,
    CardHeader,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Avatar,
    Divider,
    Checkbox,
    Stack
} from '@mui/material'
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
    Warning as WarningIcon,
    Inventory2 as InventoryIcon,
    Edit as EditIcon,
    Add as AddIcon,
    Remove as RemoveIcon,
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
    EventBusy as ExpiredIcon,
    History as HistoryIcon,
    AttachMoney as MoneyIcon,
    AccessTime as TimeIcon,
    ArrowForward as ArrowForwardIcon,
    Dashboard as DashboardIcon,
    ListAlt as ListIcon,
    Print as PrintIcon,
    QrCode2 as QrCodeIcon
} from '@mui/icons-material'
import {
    differenceInDays,
    parseISO
} from 'date-fns'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts'
import { inventoryAPI, warehouseAPI } from '../services/api'
import { useLocation, useNavigate } from 'react-router-dom'
import { useThemeConfig } from '../contexts/ThemeContext'
import { openBarcodePrintWindow } from '../utils/barcodePrint'

const MOJIBAKE_PATTERN = /[ØÃÂï¿½]/

const repairLegacyArabicText = (value) => {
    if (typeof value !== 'string') return value

    const normalized = value.trim()
    if (!normalized || !MOJIBAKE_PATTERN.test(normalized)) {
        return value
    }

    try {
        const latin1Bytes = Uint8Array.from(
            Array.from(normalized).map((char) => char.charCodeAt(0) & 0xff)
        )
        const decoded = new TextDecoder('utf-8').decode(latin1Bytes)
        const decodedArabic = (decoded.match(/[\u0600-\u06FF]/g) || []).length
        const sourceArabic = (normalized.match(/[\u0600-\u06FF]/g) || []).length
        const decodedMojibake = (decoded.match(MOJIBAKE_PATTERN) || []).length
        const sourceMojibake = (normalized.match(MOJIBAKE_PATTERN) || []).length

        if (decoded && ((decodedArabic > sourceArabic) || (decodedMojibake < sourceMojibake))) {
            return decoded
        }
    } catch (_) {
        // Fall back to the original text if decoding fails.
    }

    return value
}

export default function Inventory() {
    // --- Translation & Currency ---
    const { t, formatCurrency, isRtl } = useThemeConfig()

    // --- State: Tabs ---
    const [currentTab, setCurrentTab] = useState(0)

    // --- State: Dashboard ---
    const [dashboardLoading, setDashboardLoading] = useState(true)
    const [stats, setStats] = useState({
        totalItems: 0,
        lowStockItems: 0,
        totalValue: 0,
        expiringSoon: 0
    })
    const [lowStockList, setLowStockList] = useState([])
    const [expiryAlertList, setExpiryAlertList] = useState([])
    const [recentMovements, setRecentMovements] = useState([])
    const [stockByWarehouse, setStockByWarehouse] = useState([])
    const [categoryValue, setCategoryValue] = useState([])

    // --- State: Inventory List ---
    const [stock, setStock] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [selectedWarehouse, setSelectedWarehouse] = useState('')
    const [lowStockOnly, setLowStockOnly] = useState(false)
    const [summary, setSummary] = useState({ totalProducts: 0, totalValue: 0, lowStockCount: 0 })
    const [selectedMenuIds, setSelectedMenuIds] = useState([])
    const [printDialog, setPrintDialog] = useState({ open: false, title: '', items: [] })
    const [printCopies, setPrintCopies] = useState(1)

    // --- State: Adjustment Dialog ---
    const [adjustDialog, setAdjustDialog] = useState({ open: false, item: null })
    const [adjustmentType, setAdjustmentType] = useState('count')
    const [quantityChange, setQuantityChange] = useState('')
    const [adjustmentReason, setAdjustmentReason] = useState('')
    const [batchNumber, setBatchNumber] = useState('')
    const [productionDate, setProductionDate] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [adjusting, setAdjusting] = useState(false)
    const [assembleFromIngredients, setAssembleFromIngredients] = useState(false)

    // --- State: Batches Dialog ---
    const [batchesDialog, setBatchesDialog] = useState({ open: false, item: null, batches: [], movements: [], scopeLabel: '' })
    const [loadingBatches, setLoadingBatches] = useState(false)

    const navigate = useNavigate()
    const location = useLocation()
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658']

    // --- Fetching Logic: Dashboard ---
    const fetchDashboardData = useCallback(async () => {
        try {
            setDashboardLoading(true)
            // 1. Valuation
            const valuationRes = await inventoryAPI.getValuation()
            const valuationData = valuationRes.data.data || {}

            // 2. Inventory alerts
            const alertsRes = await inventoryAPI.getAlerts()
            const lowStockPayload = alertsRes.data?.data || {}
            const lowStockArray = Array.isArray(lowStockPayload.lowStock) ? lowStockPayload.lowStock : []
            const outOfStockArray = Array.isArray(lowStockPayload.outOfStock) ? lowStockPayload.outOfStock : []
            const expiredArray = Array.isArray(lowStockPayload.expired) ? lowStockPayload.expired : []
            const expiringSoonArray = Array.isArray(lowStockPayload.expiringSoon) ? lowStockPayload.expiringSoon : []

            const combined = [...lowStockArray, ...outOfStockArray]
            const unique = new Map()
            combined.forEach(item => unique.set(item.menuId + '-' + item.warehouseId, item))
            const lowStockData = Array.from(unique.values())
            const expiryAlertData = [...expiredArray, ...expiringSoonArray]

            // 3. Recent Movements
            const movementsRes = await inventoryAPI.getMovements({ limit: 5 })

            setStats(prev => ({
                ...prev,
                totalValue: valuationData.total_value || 0,
                totalItems: valuationData.total_items || 0,
                lowStockItems: lowStockData.length,
                expiringSoon: expiryAlertData.length
            }))

            setLowStockList(lowStockData.slice(0, 5))
            setExpiryAlertList(expiryAlertData.slice(0, 5))
            setRecentMovements(Array.isArray(movementsRes.data?.data) ? movementsRes.data.data : [])

            // Charts Logic
            const warehouseData = valuationData.by_warehouse || []
            console.log('Valuation Data:', valuationData) // Debugging

            setStockByWarehouse(warehouseData.map(w => ({
                name: w.warehouse_name,
                value: parseFloat(w.total_value || 0)
            })))

            const categoriesData = valuationData.by_category || []
            setCategoryValue(categoriesData.map(c => ({
                name: c.name,
                value: parseFloat(c.total_value || 0)
            })))

        } catch (error) {
            console.error('Error fetching dashboard data:', error)
        } finally {
            setDashboardLoading(false)
        }
    }, [])

    // --- Fetching Logic: Inventory List ---
    const fetchStock = useCallback(async () => {
        try {
            setLoading(true)
            const response = await inventoryAPI.getStock({
                warehouse_id: selectedWarehouse || undefined,
                search: search || undefined,
                low_stock_only: lowStockOnly || undefined
            })
            setStock(response.data.data || [])
            setSummary(response.data.summary || { totalProducts: 0, totalValue: 0, lowStockCount: 0 })
            setError('')
        } catch (err) {
            setError('فشل في جلب بيانات المخزون')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [selectedWarehouse, search, lowStockOnly])

    const fetchWarehouses = async () => {
        try {
            const response = await warehouseAPI.getAll()
            setWarehouses(response.data.data || [])
        } catch (err) {
            console.error('Failed to fetch warehouses:', err)
        }
    }

    // --- Effects ---
    useEffect(() => {
        fetchWarehouses()
        // Determine which data to fetch based on tab
        if (currentTab === 0) {
            fetchDashboardData()
        } else {
            fetchStock()
        }
    }, [currentTab, fetchDashboardData, fetchStock])

    // Deep-link support: open inventory list filtered by a warehouse from URL
    useEffect(() => {
        const params = new URLSearchParams(location.search)
        const warehouseId = params.get('warehouse_id') || ''
        const tab = params.get('tab')

        if (tab === 'stock') {
            setCurrentTab(1)
        }
        if (warehouseId) {
            setSelectedWarehouse(warehouseId)
        }
    }, [location.search])

    // --- Helpers ---

    const getExpiryStatus = (date) => {
        if (!date) return null
        const days = differenceInDays(parseISO(date), new Date())
        if (days < 0) return { label: 'منتهي', color: 'error' }
        if (days < 30) return { label: 'ينتهي قريباً', color: 'warning' }
        return { label: 'صالح', color: 'success' }
    }

    const getMovementTypeMeta = (type) => {
        switch (type) {
            case 'IN':
                return { label: 'إضافة', color: 'success' }
            case 'OUT':
                return { label: 'صرف', color: 'error' }
            case 'TRANSFER_IN':
                return { label: 'تحويل وارد', color: 'info' }
            case 'TRANSFER_OUT':
                return { label: 'تحويل صادر', color: 'warning' }
            case 'ADJUST':
                return { label: 'تسوية', color: 'secondary' }
            case 'RESERVE':
                return { label: 'حجز', color: 'default' }
            case 'RELEASE':
                return { label: 'فك حجز', color: 'primary' }
            default:
                return { label: type || '-', color: 'default' }
        }
    }

    const getMovementSourceLabel = (sourceType) => {
        switch (sourceType) {
            case 'purchase':
                return 'استلام مشتريات'
            case 'sale':
                return 'بيع'
            case 'transfer':
                return 'تحويل مخزون'
            case 'adjustment':
                return 'تعديل مخزون'
            case 'manual':
                return 'يدوي'
            case 'purchase_return':
                return 'إرجاع مشتريات'
            case 'order':
                return 'طلب'
            default:
                return sourceType || '-'
        }
    }

    // --- Handlers: Dialogs ---
    const handleOpenBatches = async (item) => {
        setBatchesDialog({ open: true, item, batches: [], movements: [], scopeLabel: '' })
        setLoadingBatches(true)
        try {
            const currentWarehouseMeta = warehouseMetaMap[item.warehouseId] || {}
            const currentBranchId = currentWarehouseMeta.branchId || null
            const response = await inventoryAPI.getMovements({
                menu_id: item.menuId,
                limit: 100
            })
            const allMovements = response.data.data || []
            const scopedMovements = allMovements.filter((movement) => {
                if (!currentBranchId) return true
                const movementWarehouseId = movement.warehouse_id || movement.warehouseId || movement.Warehouse?.id
                const movementWarehouseMeta = warehouseMetaMap[movementWarehouseId] || {}
                return movementWarehouseMeta.branchId === currentBranchId
            })
            const batches = scopedMovements.filter((movement) => {
                const movementWarehouseId = movement.warehouse_id || movement.warehouseId || movement.Warehouse?.id
                return String(movementWarehouseId) === String(item.warehouseId)
                    && (movement.batch_number || movement.production_date || movement.expiry_date)
                    && ['IN', 'TRANSFER_IN', 'ADJUST'].includes(movement.movement_type)
            })
            const scopeLabel = currentBranchId
                ? `الفرع: ${currentWarehouseMeta.branchName || 'غير محدد'}`
                : `المستودع: ${item.warehouseName || 'غير محدد'}`

            setBatchesDialog(prev => ({ ...prev, batches, movements: scopedMovements, scopeLabel }))
        } catch (err) {
            console.error('Error fetching batches:', err)
        } finally {
            setLoadingBatches(false)
        }
    }

    const handleOpenAdjust = (item) => {
        setAdjustDialog({ open: true, item })
        setAdjustmentType('count')
        setQuantityChange('')
        setAdjustmentReason('')
        setBatchNumber('')
        setProductionDate('')
        setExpiryDate('')
        setAssembleFromIngredients(false)
    }

    const handleCloseAdjust = () => {
        setAdjustDialog({ open: false, item: null })
        setBatchNumber('')
        setProductionDate('')
        setExpiryDate('')
    }
    const handleAdjust = async () => {
        if (!quantityChange || !adjustmentReason) return

        const parsedQuantity = parseFloat(quantityChange)
        if (!Number.isFinite(parsedQuantity)) return

        if (assembleFromIngredients && parsedQuantity <= 0) {
            setError('كمية التصنيع يجب أن تكون أكبر من صفر')
            return
        }

        if (productionDate && expiryDate && expiryDate < productionDate) {
            setError('تاريخ الانتهاء يجب أن يكون بعد أو مساويًا لتاريخ الإنتاج')
            return
        }

        setAdjusting(true)
        try {
            if (assembleFromIngredients) {
                await inventoryAPI.assemble({
                    menu_id: adjustDialog.item.menuId,
                    warehouse_id: adjustDialog.item.warehouseId,
                    quantity: parsedQuantity,
                    batch_number: batchNumber || null,
                    production_date: productionDate || null,
                    expiry_date: expiryDate || null,
                    notes: adjustmentReason
                })
            } else {
                await inventoryAPI.adjust({
                    menu_id: adjustDialog.item.menuId,
                    warehouse_id: adjustDialog.item.warehouseId,
                    adjustment_type: adjustmentType,
                    quantity_change: parsedQuantity,
                    batch_number: parsedQuantity > 0 ? (batchNumber || null) : null,
                    production_date: parsedQuantity > 0 ? (productionDate || null) : null,
                    expiry_date: parsedQuantity > 0 ? (expiryDate || null) : null,
                    reason: adjustmentReason
                })
            }
            handleCloseAdjust()
            fetchStock() // Refresh list
            fetchDashboardData() // Refresh dashboard
        } catch (err) {
            setError(err.response?.data?.message || (assembleFromIngredients ? 'فشل في عملية التصنيع' : 'فشل في تعديل المخزون'))
        } finally {
            setAdjusting(false)
        }
    }

    const warehouseMetaMap = warehouses.reduce((acc, warehouse) => {
        acc[warehouse.id] = warehouse
        return acc
    }, {})

    const branchSummaryMap = stock.reduce((acc, item) => {
        const warehouseMeta = warehouseMetaMap[item.warehouseId] || {}
        const branchId = warehouseMeta.branchId || `warehouse:${item.warehouseId || 'unknown'}`
        const branchName = warehouseMeta.branchName || 'غير محدد'

        if (!acc[branchId]) {
            acc[branchId] = {
                branchId,
                branchName,
                warehouses: new Set(),
                lineCount: 0,
                totalQuantity: 0,
                totalAvailable: 0,
                totalValue: 0,
                lowStockCount: 0
            }
        }

        acc[branchId].warehouses.add(item.warehouseId)
        acc[branchId].lineCount += 1
        acc[branchId].totalQuantity += parseFloat(item.quantity || 0) || 0
        acc[branchId].totalAvailable += parseFloat(item.available || 0) || 0
        acc[branchId].totalValue += parseFloat(item.totalValue || 0) || 0
        if (item.isLowStock || (parseFloat(item.available || 0) <= 0)) {
            acc[branchId].lowStockCount += 1
        }

        return acc
    }, {})

    const branchSummaryRows = Object.values(branchSummaryMap)
        .map((row) => ({
            ...row,
            warehouseCount: row.warehouses.size
        }))
        .sort((a, b) => b.totalValue - a.totalValue)

    const printableStockItems = useMemo(() => {
        const unique = new Map()
        stock.forEach((item) => {
            const menuId = String(item.menuId || '').trim()
            if (!menuId || unique.has(menuId)) return
            unique.set(menuId, {
                id: menuId,
                name_ar: item.productName,
                sku: item.sku || '',
                barcode: item.barcode || ''
            })
        })
        return Array.from(unique.values())
    }, [stock])

    const selectedPrintableItems = useMemo(
        () => printableStockItems.filter((item) => selectedMenuIds.includes(item.id)),
        [printableStockItems, selectedMenuIds]
    )

    const allPrintableSelected = printableStockItems.length > 0
        && printableStockItems.every((item) => selectedMenuIds.includes(item.id))
    const somePrintableSelected = printableStockItems.some((item) => selectedMenuIds.includes(item.id))

    useEffect(() => {
        setSelectedMenuIds((prev) => prev.filter((id) => printableStockItems.some((item) => item.id === id)))
    }, [printableStockItems])

    const togglePrintableSelection = (menuId) => {
        const normalizedMenuId = String(menuId || '').trim()
        if (!normalizedMenuId) return
        setSelectedMenuIds((prev) => (
            prev.includes(normalizedMenuId)
                ? prev.filter((id) => id !== normalizedMenuId)
                : [...prev, normalizedMenuId]
        ))
    }

    const toggleAllPrintableSelection = () => {
        const currentIds = printableStockItems.map((item) => item.id)
        setSelectedMenuIds((prev) => (
            currentIds.every((id) => prev.includes(id))
                ? prev.filter((id) => !currentIds.includes(id))
                : [...new Set([...prev, ...currentIds])]
        ))
    }

    const openInventoryPrintDialog = (items, title) => {
        if (!items.length) {
            setError('لا توجد أصناف جاهزة للطباعة في هذا العرض')
            return
        }

        setPrintCopies(1)
        setPrintDialog({
            open: true,
            title,
            items
        })
    }

    const handlePrintInventoryBarcodes = () => {
        try {
            openBarcodePrintWindow({
                items: printDialog.items,
                copies: printCopies,
                title: printDialog.title || 'طباعة باركود المخزون'
            })
            setPrintDialog({ open: false, title: '', items: [] })
        } catch (err) {
            setError(err?.message || 'تعذر فتح نافذة الطباعة')
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" fontWeight="bold">
                    {t('inventory.title')}
                </Typography>
            </Box>

            <Paper sx={{ mb: 3 }}>
                <Tabs value={currentTab} onChange={(e, val) => setCurrentTab(val)} centered variant="fullWidth">
                    <Tab icon={<DashboardIcon />} iconPosition="start" label={t('sidebar.dashboard')} />
                    <Tab icon={<ListIcon />} iconPosition="start" label={t('sidebar.inventoryDashboard')} />
                </Tabs>
            </Paper>

            {/* TAB 0: DASHBOARD */}
            {currentTab === 0 && (
                <Box className="animate-fade-in">
                    {/* Stats Cards */}
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        <Grid item xs={12} sm={6} md={3}>
                            <Card sx={{ height: '100%', borderLeft: '4px solid #1976d2' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Box>
                                            <Typography color="text.secondary" gutterBottom>{t('inventory.totalValue')}</Typography>
                                            <Typography variant="h5" fontWeight="bold">{formatCurrency(stats.totalValue)}</Typography>
                                        </Box>
                                        <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.main' }}>
                                            <MoneyIcon />
                                        </Avatar>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <Card sx={{ height: '100%', borderLeft: '4px solid #ed6c02' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Box>
                                            <Typography color="text.secondary" gutterBottom>{t('inventory.lowStockAlerts')}</Typography>
                                            <Typography variant="h5" fontWeight="bold" color="warning.main">
                                                {stats.lowStockItems}
                                            </Typography>
                                        </Box>
                                        <Avatar sx={{ bgcolor: 'warning.light', color: 'warning.main' }}>
                                            <WarningIcon />
                                        </Avatar>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <Card sx={{ height: '100%', borderLeft: '4px solid #2e7d32' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Box>
                                            <Typography color="text.secondary" gutterBottom>{t('inventory.totalItems')}</Typography>
                                            <Typography variant="h5" fontWeight="bold">{stats.totalItems}</Typography>
                                        </Box>
                                        <Avatar sx={{ bgcolor: 'success.light', color: 'success.main' }}>
                                            <InventoryIcon />
                                        </Avatar>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <Card sx={{ height: '100%', borderLeft: '4px solid #9c27b0' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Box>
                                            <Typography color="text.secondary" gutterBottom>{t('inventory.nearExpiry')}</Typography>
                                            <Typography variant="h5" fontWeight="bold">{stats.expiringSoon}</Typography>
                                        </Box>
                                        <Avatar sx={{ bgcolor: 'secondary.light', color: 'secondary.main' }}>
                                            <TimeIcon />
                                        </Avatar>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    <Grid container spacing={3}>
                        {/* Charts */}
                        <Grid item xs={12} md={8}>
                            <Paper sx={{ p: 3, height: '100%' }}>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>{t('inventory.valueByWarehouse')}</Typography>
                                <Box sx={{ height: 350, width: '100%', mt: 2 }}>
                                    {stockByWarehouse.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={stockByWarehouse} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="name" />
                                                <YAxis tickFormatter={(val) => `${val}`} />
                                                <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                                                <Legend />
                                                <Bar dataKey="value" name={t('inventory.totalValue')} fill="#0088FE" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                            <Typography color="text.secondary">{t('inventory.noWarehouseData')}</Typography>
                                        </Box>
                                    )}
                                </Box>
                            </Paper>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 3, height: '100%' }}>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>{t('inventory.valueByCategory')}</Typography>
                                <Box sx={{ height: 350, width: '100%', mt: 2 }}>
                                    {categoryValue.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={categoryValue}
                                                    cx="50%"
                                                    cy="55%"
                                                    innerRadius={60}
                                                    outerRadius={100}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                                                >
                                                    {categoryValue.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                                                <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                            <Typography color="text.secondary">{t('inventory.noCategoryData')}</Typography>
                                        </Box>
                                    )}
                                </Box>
                            </Paper>
                        </Grid>

                        {/* Low Stock List */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardHeader
                                    title="تنبيهات نواقص المخزون"
                                    action={
                                        <Button size="small" onClick={() => { setLowStockOnly(true); setCurrentTab(1); }}>عرض في القائمة</Button>
                                    }
                                />
                                <Divider />
                                <List>
                                    {lowStockList.length === 0 ? (
                                        <ListItem><ListItemText primary="لا توجد نواقص حالياً" /></ListItem>
                                    ) : (
                                        lowStockList.map((item, index) => (
                                            <ListItem key={index}>
                                                <ListItemAvatar>
                                                    <Avatar sx={{ bgcolor: 'warning.light' }}>
                                                        <WarningIcon color="warning" />
                                                    </Avatar>
                                                </ListItemAvatar>
                                                <ListItemText
                                                    primary={item.productName || item.name_ar || item.Menu?.name_ar || 'صنف غير معروف'}
                                                    secondary={`المتوفر: ${item.available ?? item.quantity ?? 0} | الحد الأدنى: ${item.minStock ?? item.min_stock ?? 0}`}
                                                />
                                                <Chip label="منخفض" color="warning" size="small" />
                                            </ListItem>
                                        ))
                                    )}
                                </List>
                            </Card>
                        </Grid>

                        {/* Expiry Alerts */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardHeader title="تنبيهات الصلاحية" />
                                <Divider />
                                <List>
                                    {expiryAlertList.length === 0 ? (
                                        <ListItem><ListItemText primary="لا توجد أصناف منتهية أو قاربت على الانتهاء" /></ListItem>
                                    ) : (
                                        expiryAlertList.map((item, index) => (
                                            <ListItem key={`${item.movementId || item.menuId}-${index}`}>
                                                <ListItemAvatar>
                                                    <Avatar sx={{ bgcolor: item.status === 'expired' ? 'error.light' : 'warning.light' }}>
                                                        {item.status === 'expired' ? <ExpiredIcon color="error" /> : <TimeIcon color="warning" />}
                                                    </Avatar>
                                                </ListItemAvatar>
                                                <ListItemText
                                                    primary={item.productName || 'صنف غير معروف'}
                                                    secondary={`الكمية: ${item.quantity} | الانتهاء: ${item.expiryDate || '-'}${item.batchNumber ? ` | التشغيلة: ${item.batchNumber}` : ''}`}
                                                />
                                                <Chip
                                                    label={item.status === 'expired' ? 'منتهي' : `خلال ${item.daysRemaining} يوم`}
                                                    color={item.status === 'expired' ? 'error' : 'warning'}
                                                    size="small"
                                                />
                                            </ListItem>
                                        ))
                                    )}
                                </List>
                            </Card>
                        </Grid>

                        {/* Recent Movements */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardHeader title="آخر حركات المخزون" />
                                <Divider />
                                <List>
                                    {recentMovements.length === 0 ? (
                                        <ListItem><ListItemText primary="لا توجد حركات حديثة" /></ListItem>
                                    ) : (
                                        recentMovements.map((move, index) => (
                                            <ListItem key={index}>
                                                <ListItemAvatar>
                                                    <Avatar sx={{
                                                        bgcolor: move.movement_type === 'IN' ? 'success.light' : 'error.light',
                                                        color: move.movement_type === 'IN' ? 'success.main' : 'error.main'
                                                    }}>
                                                        {move.movement_type === 'IN' ? <TrendingUpIcon /> : <ArrowForwardIcon sx={{ transform: 'rotate(180deg)' }} />}
                                                    </Avatar>
                                                </ListItemAvatar>
                                                <ListItemText
                                                    primary={move.Menu?.name_ar}
                                                    secondary={`${move.movement_type === 'IN' ? 'إضافة' : 'صرف'} ${move.quantity} | ${new Date(move.created_at).toLocaleDateString('ar-SA')}`}
                                                />
                                                <Chip
                                                    label={move.reason || move.movement_type}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            </ListItem>
                                        ))
                                    )}
                                </List>
                            </Card>
                        </Grid>
                    </Grid>
                </Box>
            )}

            {/* TAB 1: STOCK LIST */}
            {currentTab === 1 && (
                <Box className="animate-fade-in">
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {/* Filters */}
                    <Paper sx={{ p: 2, mb: 3 }}>
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                            <TextField
                                placeholder="بحث بالاسم أو SKU أو الباركود..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                size="small"
                                sx={{ minWidth: 250 }}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon />
                                        </InputAdornment>
                                    )
                                }}
                            />

                            <FormControl size="small" sx={{ minWidth: 200 }}>
                                <InputLabel>المستودع</InputLabel>
                                <Select
                                    value={selectedWarehouse}
                                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                                    label="المستودع"
                                >
                                    <MenuItem value="">جميع المستودعات</MenuItem>
                                    {warehouses.map(w => (
                                        <MenuItem key={w.id} value={w.id}>{w.nameAr}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Button
                                variant={lowStockOnly ? 'contained' : 'outlined'}
                                color="warning"
                                onClick={() => setLowStockOnly(!lowStockOnly)}
                                startIcon={<WarningIcon />}
                            >
                                نقص المخزون
                            </Button>

                            <Button
                                variant="outlined"
                                onClick={fetchStock}
                                startIcon={<RefreshIcon />}
                            >
                                تحديث
                            </Button>

                            <Button
                                variant="outlined"
                                color="info"
                                startIcon={<PrintIcon />}
                                disabled={selectedPrintableItems.length === 0}
                                onClick={() => openInventoryPrintDialog(selectedPrintableItems, 'طباعة باركود الأصناف المحددة من المخزون')}
                            >
                                طباعة المحدد
                            </Button>

                            <Button
                                variant="outlined"
                                color="info"
                                startIcon={<QrCodeIcon />}
                                disabled={printableStockItems.length === 0}
                                onClick={() => openInventoryPrintDialog(printableStockItems, 'طباعة باركود نتائج المخزون الحالية')}
                            >
                                طباعة النتائج
                            </Button>
                        </Box>

                        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                            <Chip label={`الأصناف الظاهرة: ${printableStockItems.length}`} color="primary" variant="outlined" />
                            <Chip label={`المحدد: ${selectedPrintableItems.length}`} color={selectedPrintableItems.length ? 'secondary' : 'default'} variant="outlined" />
                            <Chip
                                label={allPrintableSelected ? 'إلغاء تحديد المعروض' : 'تحديد المعروض'}
                                color={somePrintableSelected ? 'secondary' : 'default'}
                                onClick={toggleAllPrintableSelection}
                                clickable
                            />
                        </Stack>
                    </Paper>

                    {branchSummaryRows.length > 0 && (
                        <Paper sx={{ p: 2, mb: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                                <Typography variant="h6" fontWeight="bold">
                                    ملخص المخزون حسب الفرع
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    عرض تجميعي سريع قبل مستوى المستودع
                                </Typography>
                            </Box>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                            <TableCell>الفرع</TableCell>
                                            <TableCell align="center">عدد المستودعات</TableCell>
                                            <TableCell align="center">عدد السطور</TableCell>
                                            <TableCell align="center">إجمالي الكمية</TableCell>
                                            <TableCell align="center">المتاح</TableCell>
                                            <TableCell align="right">القيمة</TableCell>
                                            <TableCell align="center">تنبيهات النقص</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {branchSummaryRows.map((row) => (
                                            <TableRow key={row.branchId} hover>
                                                <TableCell>
                                                    <Typography fontWeight="bold">{row.branchName}</Typography>
                                                </TableCell>
                                                <TableCell align="center">{row.warehouseCount}</TableCell>
                                                <TableCell align="center">{row.lineCount}</TableCell>
                                                <TableCell align="center">{row.totalQuantity}</TableCell>
                                                <TableCell align="center">{row.totalAvailable}</TableCell>
                                                <TableCell align="right">{formatCurrency(row.totalValue)}</TableCell>
                                                <TableCell align="center">
                                                    {row.lowStockCount > 0 ? (
                                                        <Chip label={row.lowStockCount} size="small" color="warning" />
                                                    ) : (
                                                        <Chip label="0" size="small" color="success" variant="outlined" />
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )}

                    {/* Stock Table */}
                    <TableContainer component={Paper}>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : (
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                checked={allPrintableSelected}
                                                indeterminate={!allPrintableSelected && somePrintableSelected}
                                                onChange={toggleAllPrintableSelection}
                                                inputProps={{ 'aria-label': 'تحديد الأصناف الظاهرة' }}
                                            />
                                        </TableCell>
                                        <TableCell>المنتج</TableCell>
                                        <TableCell>SKU / الباركود</TableCell>
                                        <TableCell>الفرع</TableCell>
                                        <TableCell>المستودع</TableCell>
                                        <TableCell align="center">الكمية</TableCell>
                                        <TableCell align="center">المحجوز</TableCell>
                                        <TableCell align="center">المتاح</TableCell>
                                        <TableCell align="center">الحد الأدنى</TableCell>
                                        <TableCell align="right">متوسط التكلفة</TableCell>
                                        <TableCell align="right">القيمة</TableCell>
                                        <TableCell align="center">الحالة</TableCell>
                                        <TableCell align="center">إجراءات</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {stock.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">لا توجد منتجات</Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        stock.map((item) => (
                                            <TableRow
                                                key={item.id}
                                                hover
                                                sx={{ bgcolor: item.isLowStock ? 'warning.50' : 'inherit' }}
                                            >
                                                <TableCell padding="checkbox">
                                                    <Checkbox
                                                        checked={selectedMenuIds.includes(String(item.menuId || '').trim())}
                                                        onChange={() => togglePrintableSelection(item.menuId)}
                                                        inputProps={{ 'aria-label': `تحديد ${item.productName}` }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        {item.imageUrl && (
                                                            <img
                                                                src={item.imageUrl}
                                                                alt={item.productName}
                                                                style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }}
                                                            />
                                                        )}
                                                        <Box>
                                                            <Typography fontWeight="medium">{item.productName}</Typography>
                                                            {item.productNameEn && (
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {item.productNameEn}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </Box>
                                                </TableCell>
                                                <TableCell>
                                                    <Stack spacing={0.5}>
                                                        <Typography variant="body2" fontFamily="monospace">
                                                            {item.sku || '-'}
                                                        </Typography>
                                                        {item.barcode ? (
                                                            <Chip
                                                                size="small"
                                                                icon={<QrCodeIcon />}
                                                                color="info"
                                                                variant="outlined"
                                                                label={item.barcode}
                                                                sx={{ width: 'fit-content', maxWidth: '100%' }}
                                                            />
                                                        ) : (
                                                            <Chip size="small" variant="outlined" label="بدون باركود" />
                                                        )}
                                                    </Stack>
                                                </TableCell>
                                                <TableCell>{warehouseMetaMap[item.warehouseId]?.branchName || 'غير محدد'}</TableCell>
                                                <TableCell>{item.warehouseName}</TableCell>
                                                <TableCell align="center">
                                                    <Typography fontWeight="bold">{item.quantity}</Typography>
                                                </TableCell>
                                                <TableCell align="center">
                                                    {item.reserved > 0 ? (
                                                        <Chip label={item.reserved} size="small" color="info" />
                                                    ) : '-'}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Typography
                                                        fontWeight="bold"
                                                        color={item.available <= 0 ? 'error' : item.isLowStock ? 'warning.main' : 'success.main'}
                                                    >
                                                        {item.available}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="center">{item.minStock}</TableCell>
                                                <TableCell align="right">{formatCurrency(item.avgCost)}</TableCell>
                                                <TableCell align="right">{formatCurrency(item.totalValue)}</TableCell>
                                                <TableCell align="center">
                                                    {item.available <= 0 ? (
                                                        <Chip label="نفد" color="error" size="small" />
                                                    ) : item.isLowStock ? (
                                                        <Chip label="منخفض" color="warning" size="small" icon={<WarningIcon />} />
                                                    ) : (
                                                        <Chip label="متوفر" color="success" size="small" />
                                                    )}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Tooltip title="طباعة الباركود">
                                                        <span>
                                                            <IconButton
                                                                size="small"
                                                                color="info"
                                                                disabled={!item.barcode}
                                                                onClick={() => openInventoryPrintDialog([{
                                                                    id: item.menuId,
                                                                    name_ar: item.productName,
                                                                    sku: item.sku || '',
                                                                    barcode: item.barcode || ''
                                                                }], `طباعة باركود ${item.productName}`)}
                                                            >
                                                                <PrintIcon fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    <Tooltip title="تعديل الكمية">
                                                        <IconButton size="small" onClick={() => handleOpenAdjust(item)}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="عرض الدفعات وسجل الحركة">
                                                        <IconButton size="small" onClick={() => handleOpenBatches(item)} color="info">
                                                            <HistoryIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </TableContainer>
                </Box>
            )}

            <Dialog
                open={printDialog.open}
                onClose={() => setPrintDialog({ open: false, title: '', items: [] })}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>{printDialog.title || 'طباعة باركود المخزون'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 0.5 }}>
                        <Alert severity="info">
                            سيتم طباعة الأصناف التي تحتوي على `barcode` فقط من شاشة المخزون الحالية.
                        </Alert>

                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                            <Chip label={`إجمالي الأصناف: ${printDialog.items.length}`} color="primary" variant="outlined" />
                            <Chip
                                label={`جاهز للطباعة: ${printDialog.items.filter((item) => String(item.barcode || '').trim()).length}`}
                                color="success"
                                variant="outlined"
                            />
                        </Stack>

                        <TextField
                            fullWidth
                            type="number"
                            label="عدد النسخ لكل صنف"
                            value={printCopies}
                            inputProps={{ min: 1, step: 1 }}
                            onChange={(e) => setPrintCopies(e.target.value)}
                        />

                        <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 280, overflow: 'auto', borderRadius: 2 }}>
                            <Stack spacing={1}>
                                {printDialog.items.map((item) => (
                                    <Box
                                        key={item.id}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 1,
                                            py: 0.5,
                                            borderBottom: '1px dashed',
                                            borderColor: 'divider'
                                        }}
                                    >
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography fontWeight={600}>{item.name_ar}</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {item.sku ? `SKU: ${item.sku}` : 'بدون SKU'}
                                            </Typography>
                                        </Box>
                                        <Chip
                                            size="small"
                                            icon={<QrCodeIcon />}
                                            label={item.barcode || 'بدون باركود'}
                                            color={item.barcode ? 'info' : 'default'}
                                            variant="outlined"
                                        />
                                    </Box>
                                ))}
                            </Stack>
                        </Paper>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPrintDialog({ open: false, title: '', items: [] })}>إلغاء</Button>
                    <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrintInventoryBarcodes}>
                        طباعة الآن
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Adjustment Dialog (Shared) */}
            <Dialog open={adjustDialog.open} onClose={handleCloseAdjust} maxWidth="sm" fullWidth>
                <DialogTitle>
                    تعديل المخزون - {adjustDialog.item?.productName}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Alert severity="info">
                            الكمية الحالية: <strong>{adjustDialog.item?.quantity}</strong>
                        </Alert>

                        <FormControl fullWidth>
                            <InputLabel>نوع التعديل</InputLabel>
                            <Select
                                value={adjustmentType}
                                onChange={(e) => setAdjustmentType(e.target.value)}
                                label="نوع التعديل"
                                disabled={assembleFromIngredients}
                            >
                                <MenuItem value="count">جرد</MenuItem>
                                <MenuItem value="damage">تالف</MenuItem>
                                <MenuItem value="loss">فقدان</MenuItem>
                                <MenuItem value="expired">منتهي الصلاحية</MenuItem>
                                <MenuItem value="other">أخرى</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControlLabel
                            control={(
                                <Switch
                                    checked={assembleFromIngredients}
                                    onChange={(e) => setAssembleFromIngredients(e.target.checked)}
                                />
                            )}
                            label="تصنيع من المكونات (للصنف التجميعي)"
                        />

                        {assembleFromIngredients && (
                            <Alert severity="info">
                                سيتم خصم المكونات حسب الوصفة ثم إضافة الكمية للصنف النهائي.
                            </Alert>
                        )}

                        <TextField
                            label={assembleFromIngredients ? 'كمية التصنيع' : 'التغيير في الكمية'}
                            type="number"
                            value={quantityChange}
                            onChange={(e) => setQuantityChange(e.target.value)}
                            helperText={assembleFromIngredients ? 'أدخل كمية موجبة فقط للتصنيع' : 'موجب للزيادة، سالب للنقص'}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        {parseFloat(quantityChange) > 0 ? <AddIcon color="success" /> :
                                            parseFloat(quantityChange) < 0 ? <RemoveIcon color="error" /> : null}
                                    </InputAdornment>
                                )
                            }}
                        />

                        {(assembleFromIngredients || parseFloat(quantityChange) > 0) && (
                            <>
                                <TextField
                                    label="رقم التشغيلة"
                                    value={batchNumber}
                                    onChange={(e) => setBatchNumber(e.target.value)}
                                    placeholder="اختياري"
                                />

                                <TextField
                                    label="تاريخ الإنتاج"
                                    type="date"
                                    value={productionDate}
                                    onChange={(e) => setProductionDate(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                />

                                <TextField
                                    label="تاريخ الانتهاء"
                                    type="date"
                                    value={expiryDate}
                                    onChange={(e) => setExpiryDate(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    error={Boolean(productionDate && expiryDate && expiryDate < productionDate)}
                                    helperText={productionDate && expiryDate && expiryDate < productionDate ? 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج' : 'أضف تاريخ الصلاحية إذا كان الصنف يخضع للانتهاء'}
                                />
                            </>
                        )}

                        <TextField
                            label="السبب"
                            value={adjustmentReason}
                            onChange={(e) => setAdjustmentReason(e.target.value)}
                            multiline
                            rows={2}
                            required
                        />

                        {quantityChange && (
                            <Alert severity={parseFloat(quantityChange) > 0 ? 'success' : 'warning'}>
                                الكمية الجديدة ستصبح: <strong>
                                    {(adjustDialog.item?.quantity || 0) + parseFloat(quantityChange || 0)}
                                </strong>
                            </Alert>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAdjust}>إلغاء</Button>
                    <Button
                        variant="contained"
                        onClick={handleAdjust}
                        disabled={!quantityChange || !adjustmentReason || adjusting}
                    >
                        {adjusting ? <CircularProgress size={24} /> : 'حفظ التعديل'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Batches Dialog (Shared) */}
            <Dialog
                open={batchesDialog.open}
                onClose={() => setBatchesDialog({ ...batchesDialog, open: false })}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    الدفعات وسجل الحركة - {batchesDialog.item?.productName}
                </DialogTitle>
                <DialogContent>
                    {loadingBatches ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                <Chip label={batchesDialog.scopeLabel || 'نطاق التتبع الحالي'} color="primary" variant="outlined" />
                                <Chip label={`عدد الحركات: ${batchesDialog.movements.length}`} color="info" variant="outlined" />
                                <Chip label={`عدد الدفعات: ${batchesDialog.batches.length}`} color="secondary" variant="outlined" />
                            </Box>

                            <Box>
                                <Typography variant="h6" sx={{ mb: 1 }}>
                                    سجل الدفعات والصلاحية
                                </Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>رقم الدفعة</TableCell>
                                                <TableCell>تاريخ الإنتاج</TableCell>
                                                <TableCell>تاريخ الانتهاء</TableCell>
                                                <TableCell>الكمية الأصلية</TableCell>
                                                <TableCell>تاريخ الورود</TableCell>
                                                <TableCell>الحالة</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {batchesDialog.batches.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} align="center">لا توجد سجلات دفعات لهذا المنتج في هذا المستودع</TableCell>
                                                </TableRow>
                                            ) : (
                                                batchesDialog.batches.map((batch, idx) => {
                                                    const status = getExpiryStatus(batch.expiry_date)
                                                    return (
                                                        <TableRow key={idx}>
                                                            <TableCell>{batch.batch_number || '-'}</TableCell>
                                                            <TableCell>{batch.production_date || '-'}</TableCell>
                                                            <TableCell>{batch.expiry_date || '-'}</TableCell>
                                                            <TableCell>{batch.quantity}</TableCell>
                                                            <TableCell>{new Date(batch.created_at).toLocaleDateString('ar-SA')}</TableCell>
                                                            <TableCell>
                                                                {status ? (
                                                                    <Chip
                                                                        label={status.label}
                                                                        color={status.color}
                                                                        size="small"
                                                                        variant="outlined"
                                                                    />
                                                                ) : (
                                                                    <Chip label="بدون تاريخ صلاحية" size="small" variant="outlined" />
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>

                            <Box>
                                <Typography variant="h6" sx={{ mb: 1 }}>
                                    سجل الحركة
                                </Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>التاريخ</TableCell>
                                                <TableCell>نوع الحركة</TableCell>
                                                <TableCell>المصدر</TableCell>
                                                <TableCell>المرجع</TableCell>
                                                <TableCell>الفرع</TableCell>
                                                <TableCell>المستودع</TableCell>
                                                <TableCell align="center">الكمية</TableCell>
                                                <TableCell align="center">الرصيد بعد الحركة</TableCell>
                                                <TableCell>ملاحظات</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {batchesDialog.movements.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={9} align="center">لا توجد حركات لهذا الصنف في النطاق المحدد</TableCell>
                                                </TableRow>
                                            ) : (
                                                batchesDialog.movements.map((movement) => {
                                                    const movementType = getMovementTypeMeta(movement.movement_type)
                                                    const movementWarehouseId = movement.warehouse_id || movement.warehouseId || movement.Warehouse?.id
                                                    const movementWarehouseMeta = warehouseMetaMap[movementWarehouseId] || {}
                                                    const quantityValue = parseFloat(movement.quantity || 0) || 0

                                                    return (
                                                        <TableRow key={movement.id}>
                                                            <TableCell>{new Date(movement.created_at).toLocaleString('ar-SA')}</TableCell>
                                                            <TableCell>
                                                                <Chip
                                                                    label={movementType.label}
                                                                    color={movementType.color}
                                                                    size="small"
                                                                    variant="outlined"
                                                                />
                                                            </TableCell>
                                                            <TableCell>{getMovementSourceLabel(movement.source_type)}</TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2" fontFamily="monospace">
                                                                    {movement.reference || movement.source_id || '-'}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>{movementWarehouseMeta.branchName || 'غير محدد'}</TableCell>
                                                            <TableCell>{movement.Warehouse?.name_ar || movementWarehouseMeta.nameAr || 'غير محدد'}</TableCell>
                                                            <TableCell align="center">
                                                                <Typography
                                                                    fontWeight="bold"
                                                                    color={quantityValue > 0 ? 'success.main' : quantityValue < 0 ? 'error.main' : 'text.primary'}
                                                                >
                                                                    {quantityValue}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="center">{movement.balance_after ?? '-'}</TableCell>
                                                            <TableCell>{repairLegacyArabicText(movement.notes) || '-'}</TableCell>
                                                        </TableRow>
                                                    )
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBatchesDialog({ ...batchesDialog, open: false })}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}

