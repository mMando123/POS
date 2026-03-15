import { useState, useEffect, useCallback } from 'react'
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
    Divider
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
    ListAlt as ListIcon
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

    // --- State: Adjustment Dialog ---
    const [adjustDialog, setAdjustDialog] = useState({ open: false, item: null })
    const [adjustmentType, setAdjustmentType] = useState('count')
    const [quantityChange, setQuantityChange] = useState('')
    const [adjustmentReason, setAdjustmentReason] = useState('')
    const [adjusting, setAdjusting] = useState(false)
    const [assembleFromIngredients, setAssembleFromIngredients] = useState(false)

    // --- State: Batches Dialog ---
    const [batchesDialog, setBatchesDialog] = useState({ open: false, item: null, batches: [] })
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

            // 2. Low Stock
            const lowStockRes = await inventoryAPI.getLowStock()
            const lowStockPayload = lowStockRes.data?.data || {}
            const lowStockArray = Array.isArray(lowStockPayload.lowStock) ? lowStockPayload.lowStock : []
            const outOfStockArray = Array.isArray(lowStockPayload.outOfStock) ? lowStockPayload.outOfStock : []

            const combined = [...lowStockArray, ...outOfStockArray]
            const unique = new Map()
            combined.forEach(item => unique.set(item.menuId + '-' + item.warehouseId, item))
            const lowStockData = Array.from(unique.values())

            // 3. Recent Movements
            const movementsRes = await inventoryAPI.getMovements({ limit: 5 })

            setStats(prev => ({
                ...prev,
                totalValue: valuationData.total_value || 0,
                totalItems: valuationData.total_items || 0,
                lowStockItems: lowStockData.length
            }))

            setLowStockList(lowStockData.slice(0, 5))
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

    // --- Handlers: Dialogs ---
    const handleOpenBatches = async (item) => {
        setBatchesDialog({ open: true, item, batches: [] })
        setLoadingBatches(true)
        try {
            const response = await inventoryAPI.getMovements({
                menu_id: item.menuId,
                warehouse_id: item.warehouseId,
                limit: 50
            })
            const batches = (response.data.data || [])
                .filter(m => (m.batch_number || m.expiry_date) && m.movement_type === 'IN')
            setBatchesDialog(prev => ({ ...prev, batches }))
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
        setAssembleFromIngredients(false)
    }

    const handleCloseAdjust = () => {
        setAdjustDialog({ open: false, item: null })
    }
    const handleAdjust = async () => {
        if (!quantityChange || !adjustmentReason) return

        const parsedQuantity = parseFloat(quantityChange)
        if (!Number.isFinite(parsedQuantity)) return

        if (assembleFromIngredients && parsedQuantity <= 0) {
            setError('كمية التصنيع يجب أن تكون أكبر من صفر')
            return
        }

        setAdjusting(true)
        try {
            if (assembleFromIngredients) {
                await inventoryAPI.assemble({
                    menu_id: adjustDialog.item.menuId,
                    warehouse_id: adjustDialog.item.warehouseId,
                    quantity: parsedQuantity,
                    notes: adjustmentReason
                })
            } else {
                await inventoryAPI.adjust({
                    menu_id: adjustDialog.item.menuId,
                    warehouse_id: adjustDialog.item.warehouseId,
                    adjustment_type: adjustmentType,
                    quantity_change: parsedQuantity,
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
                                placeholder="بحث بالاسم أو SKU..."
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
                        </Box>
                    </Paper>

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
                                        <TableCell>المنتج</TableCell>
                                        <TableCell>SKU</TableCell>
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
                                            <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
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
                                                    <Typography variant="body2" fontFamily="monospace">
                                                        {item.sku || '-'}
                                                    </Typography>
                                                </TableCell>
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
                                                    <Tooltip title="تعديل الكمية">
                                                        <IconButton size="small" onClick={() => handleOpenAdjust(item)}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="عرض الدفعات والصلاحية">
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
                    سجل الدفعات والصلاحية - {batchesDialog.item?.productName}
                </DialogTitle>
                <DialogContent>
                    {loadingBatches ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>رقم الدفعة</TableCell>
                                        <TableCell>تاريخ الانتهاء</TableCell>
                                        <TableCell>الكمية الأصلية</TableCell>
                                        <TableCell>تاريخ الورود</TableCell>
                                        <TableCell>الحالة</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {batchesDialog.batches.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center">لا توجد سجلات دفعات لهذا المنتج</TableCell>
                                        </TableRow>
                                    ) : (
                                        batchesDialog.batches.map((batch, idx) => {
                                            const status = getExpiryStatus(batch.expiry_date)
                                            return (
                                                <TableRow key={idx}>
                                                    <TableCell>{batch.batch_number || '-'}</TableCell>
                                                    <TableCell>{batch.expiry_date || '-'}</TableCell>
                                                    <TableCell>{batch.quantity}</TableCell>
                                                    <TableCell>{new Date(batch.created_at).toLocaleDateString('ar-SA')}</TableCell>
                                                    <TableCell>
                                                        {status && (
                                                            <Chip
                                                                label={status.label}
                                                                color={status.color}
                                                                size="small"
                                                                variant="outlined"
                                                            />
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBatchesDialog({ ...batchesDialog, open: false })}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}

