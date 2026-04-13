import { useEffect, useMemo, useState } from 'react'
import {
    Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
    Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Typography
} from '@mui/material'
import { Assessment as ReportIcon, Download as DownloadIcon } from '@mui/icons-material'
import { DatePicker } from '@mui/x-date-pickers'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { arSA } from 'date-fns/locale'
import { inventoryAPI, transferAPI, warehouseAPI } from '../services/api'
import { useThemeConfig } from '../contexts/ThemeContext'
import { exportToExcel } from '../utils/excelExport'

const REPORT_TYPES = [
    { value: 'valuation', label: 'تقرير قيمة المخزون' },
    { value: 'branch_stock', label: 'تقرير المخزون حسب الفرع' },
    { value: 'transfer_summary', label: 'تقرير التحويلات بين الفروع' },
    { value: 'movements', label: 'تقرير حركة الأصناف' },
    { value: 'low_stock', label: 'تقرير النواقص' },
    { value: 'expiry', label: 'تقرير انتهاء الصلاحية' }
]
const MOVEMENT_TYPES = [
    { value: '', label: 'كل الحركات' },
    { value: 'IN', label: 'إضافة مخزون' },
    { value: 'OUT', label: 'خصم مخزون' },
    { value: 'ADJUST', label: 'تسوية مخزون' },
    { value: 'TRANSFER_IN', label: 'تحويل وارد' },
    { value: 'TRANSFER_OUT', label: 'تحويل صادر' },
    { value: 'SALE', label: 'بيع' },
    { value: 'PURCHASE', label: 'شراء' }
]
const TRANSFER_STATUSES = [
    { value: '', label: 'كل الحالات' },
    { value: 'pending', label: 'معلق' },
    { value: 'completed', label: 'مكتمل' },
    { value: 'cancelled', label: 'ملغي' }
]

const getTransferStatusMeta = (status) => {
    switch (status) {
        case 'completed': return { label: 'مكتمل', color: 'success' }
        case 'pending': return { label: 'معلق', color: 'warning' }
        case 'cancelled': return { label: 'ملغي', color: 'error' }
        default: return { label: status || 'غير معروف', color: 'default' }
    }
}
const formatDateTime = (value) => {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '—'
    return parsed.toLocaleString('ar-SA')
}
const formatDateOnly = (value) => {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return String(value)
    return parsed.toLocaleDateString('ar-SA')
}
const formatQuantity = (value) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(Number(value || 0))

export default function InventoryReports() {
    const { formatCurrency } = useThemeConfig()
    const [reportType, setReportType] = useState('valuation')
    const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 1)))
    const [endDate, setEndDate] = useState(new Date())
    const [loading, setLoading] = useState(false)
    const [warehousesLoading, setWarehousesLoading] = useState(false)
    const [error, setError] = useState('')
    const [reportData, setReportData] = useState([])
    const [summary, setSummary] = useState(null)
    const [routeBreakdown, setRouteBreakdown] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [branchFilter, setBranchFilter] = useState('')
    const [warehouseFilter, setWarehouseFilter] = useState('')
    const [transferStatusFilter, setTransferStatusFilter] = useState('')
    const [movementTypeFilter, setMovementTypeFilter] = useState('')
    const [searchFilter, setSearchFilter] = useState('')

    useEffect(() => {
        const fetchWarehouses = async () => {
            try {
                setWarehousesLoading(true)
                const response = await warehouseAPI.getAll()
                setWarehouses(Array.isArray(response.data?.data) ? response.data.data : [])
            } catch (fetchError) {
                console.error('Error fetching warehouses for reports:', fetchError)
            } finally {
                setWarehousesLoading(false)
            }
        }
        fetchWarehouses()
    }, [])

    const branchOptions = useMemo(() => {
        const map = new Map()
        warehouses.forEach((warehouse) => {
            if (!warehouse?.branchId || map.has(warehouse.branchId)) return
            map.set(warehouse.branchId, { id: warehouse.branchId, name: warehouse.branchName || 'بدون اسم' })
        })
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    }, [warehouses])
    const filteredWarehouseOptions = useMemo(() => {
        if (!branchFilter) return warehouses
        return warehouses.filter((warehouse) => warehouse.branchId === branchFilter)
    }, [branchFilter, warehouses])

    const showBranchFilter = reportType === 'branch_stock' || reportType === 'transfer_summary'
    const showWarehouseFilter = true
    const showTransferStatusFilter = reportType === 'transfer_summary'
    const showMovementTypeFilter = reportType === 'movements'
    const showSearchFilter = reportType === 'branch_stock'

    const summaryCards = useMemo(() => {
        if (!summary) return []
        switch (reportType) {
            case 'valuation':
                return [
                    { label: 'إجمالي قيمة المخزون', value: formatCurrency(summary.total_value || 0) },
                    { label: 'عدد الأصناف', value: formatQuantity(summary.total_items || 0) },
                    { label: 'عدد المستودعات', value: formatQuantity(summary.by_warehouse?.length || 0) }
                ]
            case 'branch_stock':
                return [
                    { label: 'عدد الفروع', value: formatQuantity(summary.total_branches || 0) },
                    { label: 'عدد المستودعات', value: formatQuantity(summary.total_warehouses || 0) },
                    { label: 'الرصيد المتاح', value: formatQuantity(summary.total_available || 0) },
                    { label: 'قيمة المخزون', value: formatCurrency(summary.total_value || 0) },
                    { label: 'تنبيهات النقص', value: formatQuantity(summary.low_stock_count || 0) }
                ]
            case 'transfer_summary':
                return [
                    { label: 'إجمالي التحويلات', value: formatQuantity(summary.total_transfers || 0) },
                    { label: 'التحويلات المكتملة', value: formatQuantity(summary.completed_transfers || 0) },
                    { label: 'التحويلات المعلقة', value: formatQuantity(summary.pending_transfers || 0) },
                    { label: 'التحويلات الملغاة', value: formatQuantity(summary.cancelled_transfers || 0) },
                    { label: 'إجمالي الكمية المحولة', value: formatQuantity(summary.total_quantity || 0) }
                ]
            case 'expiry':
                return [
                    { label: 'منتهي الصلاحية', value: formatQuantity(summary.expiredCount || 0) },
                    { label: 'قرب الانتهاء', value: formatQuantity(summary.expiringSoonCount || 0) },
                    { label: 'منخفض المخزون', value: formatQuantity(summary.lowStockCount || 0) },
                    { label: 'نافد المخزون', value: formatQuantity(summary.outOfStockCount || 0) }
                ]
            default:
                return []
        }
    }, [formatCurrency, reportType, summary])

    const handleGenerateReport = async () => {
        setLoading(true)
        setError('')
        try {
            let response
            const dateParams = { start_date: startDate?.toISOString(), end_date: endDate?.toISOString() }
            switch (reportType) {
                case 'valuation':
                    response = await inventoryAPI.getValuation({ warehouse_id: warehouseFilter || undefined })
                    setReportData(response.data.data?.by_warehouse || [])
                    setSummary(response.data.data || null)
                    setRouteBreakdown([])
                    break
                case 'branch_stock':
                    response = await inventoryAPI.getBranchSummary({
                        branch_id: branchFilter || undefined,
                        warehouse_id: warehouseFilter || undefined,
                        search: searchFilter || undefined
                    })
                    setReportData(response.data.data || [])
                    setSummary(response.data.summary || null)
                    setRouteBreakdown([])
                    break
                case 'transfer_summary':
                    response = await transferAPI.getSummary({
                        ...dateParams,
                        branch_id: branchFilter || undefined,
                        warehouse_id: warehouseFilter || undefined,
                        status: transferStatusFilter || undefined,
                        limit: 500,
                        offset: 0
                    })
                    setReportData(response.data.data || [])
                    setSummary(response.data.summary || null)
                    setRouteBreakdown(response.data.by_route || [])
                    break
                case 'movements':
                    response = await inventoryAPI.getMovements({
                        ...dateParams,
                        warehouse_id: warehouseFilter || undefined,
                        type: movementTypeFilter || undefined,
                        limit: 100
                    })
                    setReportData(response.data.data || [])
                    setSummary(null)
                    setRouteBreakdown([])
                    break
                case 'low_stock':
                    response = await inventoryAPI.getLowStock({ warehouse_id: warehouseFilter || undefined })
                    setReportData(response.data.data?.lowStock || [])
                    setSummary(null)
                    setRouteBreakdown([])
                    break
                case 'expiry':
                    response = await inventoryAPI.getAlerts({ warehouse_id: warehouseFilter || undefined })
                    setReportData([...(response.data.data?.expired || []), ...(response.data.data?.expiringSoon || [])])
                    setSummary(response.data.data?.summary || null)
                    setRouteBreakdown([])
                    break
                default:
                    setReportData([])
                    setSummary(null)
                    setRouteBreakdown([])
            }
        } catch (fetchError) {
            console.error('Error generating inventory report:', fetchError)
            setError(fetchError.response?.data?.message || 'تعذر إنشاء التقرير الآن')
        } finally {
            setLoading(false)
        }
    }

    const handleExport = () => {
        if (!reportData.length) return
        let dataToExport = []
        let fileName = 'Inventory_Report'
        switch (reportType) {
            case 'valuation':
                dataToExport = reportData.map((row) => ({ 'المستودع': row.warehouse_name, 'عدد الأصناف': row.total_items, 'إجمالي القيمة': row.total_value }))
                if (summary) dataToExport.push({ 'المستودع': 'الإجمالي الكلي', 'عدد الأصناف': summary.total_items, 'إجمالي القيمة': summary.total_value })
                fileName = 'Inventory_Valuation_Report'
                break
            case 'branch_stock':
                dataToExport = reportData.map((row) => ({
                    'الفرع': row.branch_name,
                    'عدد المستودعات': row.warehouse_count,
                    'أسماء المستودعات': row.warehouse_names?.join('، ') || '—',
                    'عدد السجلات المخزنية': row.product_lines,
                    'إجمالي الكمية': row.total_quantity,
                    'المتاح': row.total_available,
                    'المحجوز': row.total_reserved,
                    'قيمة المخزون': row.total_value,
                    'نواقص المخزون': row.low_stock_count,
                    'نافد المخزون': row.out_of_stock_count
                }))
                fileName = 'Branch_Stock_Report'
                break
            case 'transfer_summary':
                dataToExport = reportData.map((row) => ({
                    'رقم التحويل': row.transfer_number,
                    'من الفرع': row.from_branch_name,
                    'إلى الفرع': row.to_branch_name,
                    'من المستودع': row.from_warehouse_name,
                    'إلى المستودع': row.to_warehouse_name,
                    'عدد الأصناف': row.items_count,
                    'إجمالي الكمية': row.total_quantity,
                    'الحالة': getTransferStatusMeta(row.status).label,
                    'تاريخ الإنشاء': formatDateTime(row.created_at),
                    'تاريخ الإتمام': formatDateTime(row.completed_at),
                    'ملاحظات': row.notes || ''
                }))
                fileName = 'Branch_Transfer_Report'
                break
            case 'movements':
                dataToExport = reportData.map((row) => ({
                    'التاريخ': formatDateTime(row.created_at),
                    'الصنف': row.Menu?.name_ar || '-',
                    'نوع الحركة': row.movement_type,
                    'الكمية': row.quantity > 0 ? `+${row.quantity}` : row.quantity,
                    'المستودع': row.Warehouse?.name_ar || '-',
                    'المستخدم': row.User?.name_ar || '-'
                }))
                fileName = 'Stock_Movements_Report'
                break
            case 'low_stock':
                dataToExport = reportData.map((row) => ({
                    'الصنف': row.productName,
                    'المستودع': row.warehouseName,
                    'الكمية الحالية': row.quantity,
                    'الحد الأدنى': row.minStock,
                    'العجز': row.minStock - row.quantity
                }))
                fileName = 'Low_Stock_Report'
                break
            case 'expiry':
                dataToExport = reportData.map((row) => ({
                    'المنتج': row.productName,
                    'المستودع': row.warehouseName,
                    'رقم التشغيلة': row.batchNumber || '-',
                    'تاريخ الإنتاج': row.productionDate || '-',
                    'تاريخ الانتهاء': row.expiryDate || '-',
                    'الكمية': row.quantity,
                    'الحالة': row.status === 'expired' ? 'منتهي' : `ينتهي خلال ${row.daysRemaining} يوم`
                }))
                fileName = 'Expiry_Report'
                break
            default:
                break
        }
        exportToExcel(dataToExport, `${fileName}_${new Date().toISOString().split('T')[0]}`)
    }

    const renderTable = () => {
        if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
        if (!reportData.length) return <Typography align="center" sx={{ py: 4 }}>لا توجد بيانات</Typography>
        switch (reportType) {
            case 'valuation':
                return (
                    <Table>
                        <TableHead><TableRow><TableCell>المستودع</TableCell><TableCell align="right">عدد الأصناف</TableCell><TableCell align="right">إجمالي القيمة</TableCell></TableRow></TableHead>
                        <TableBody>
                            {reportData.map((row, idx) => <TableRow key={idx}><TableCell>{row.warehouse_name}</TableCell><TableCell align="right">{formatQuantity(row.total_items)}</TableCell><TableCell align="right">{formatCurrency(row.total_value)}</TableCell></TableRow>)}
                            {summary && <TableRow sx={{ bgcolor: 'grey.100' }}><TableCell><strong>الإجمالي الكلي</strong></TableCell><TableCell align="right"><strong>{formatQuantity(summary.total_items)}</strong></TableCell><TableCell align="right"><strong>{formatCurrency(summary.total_value)}</strong></TableCell></TableRow>}
                        </TableBody>
                    </Table>
                )
            case 'branch_stock':
                return (
                    <Table>
                        <TableHead><TableRow><TableCell>الفرع</TableCell><TableCell align="center">عدد المستودعات</TableCell><TableCell>المستودعات</TableCell><TableCell align="center">عدد السجلات</TableCell><TableCell align="center">إجمالي الكمية</TableCell><TableCell align="center">المتاح</TableCell><TableCell align="center">المحجوز</TableCell><TableCell align="right">قيمة المخزون</TableCell><TableCell align="center">نواقص</TableCell></TableRow></TableHead>
                        <TableBody>
                            {reportData.map((row) => (
                                <TableRow key={row.branch_id || row.branch_name}>
                                    <TableCell>{row.branch_name}</TableCell>
                                    <TableCell align="center">{formatQuantity(row.warehouse_count)}</TableCell>
                                    <TableCell>{row.warehouse_names?.join('، ') || '—'}</TableCell>
                                    <TableCell align="center">{formatQuantity(row.product_lines)}</TableCell>
                                    <TableCell align="center">{formatQuantity(row.total_quantity)}</TableCell>
                                    <TableCell align="center">{formatQuantity(row.total_available)}</TableCell>
                                    <TableCell align="center">{formatQuantity(row.total_reserved)}</TableCell>
                                    <TableCell align="right">{formatCurrency(row.total_value)}</TableCell>
                                    <TableCell align="center"><Stack direction="row" spacing={1} justifyContent="center"><Chip size="small" color="warning" label={`نواقص: ${formatQuantity(row.low_stock_count)}`} /><Chip size="small" color="error" label={`نافد: ${formatQuantity(row.out_of_stock_count)}`} /></Stack></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )
            case 'transfer_summary':
                return (
                    <Table>
                        <TableHead><TableRow><TableCell>رقم التحويل</TableCell><TableCell>من الفرع</TableCell><TableCell>إلى الفرع</TableCell><TableCell>من المستودع</TableCell><TableCell>إلى المستودع</TableCell><TableCell align="center">عدد الأصناف</TableCell><TableCell align="center">إجمالي الكمية</TableCell><TableCell align="center">الحالة</TableCell><TableCell>تاريخ الإنشاء</TableCell><TableCell>تاريخ الإتمام</TableCell></TableRow></TableHead>
                        <TableBody>
                            {reportData.map((row) => {
                                const statusMeta = getTransferStatusMeta(row.status)
                                return <TableRow key={row.id}><TableCell>{row.transfer_number}</TableCell><TableCell>{row.from_branch_name}</TableCell><TableCell>{row.to_branch_name}</TableCell><TableCell>{row.from_warehouse_name}</TableCell><TableCell>{row.to_warehouse_name}</TableCell><TableCell align="center">{formatQuantity(row.items_count)}</TableCell><TableCell align="center">{formatQuantity(row.total_quantity)}</TableCell><TableCell align="center"><Chip size="small" color={statusMeta.color} label={statusMeta.label} /></TableCell><TableCell>{formatDateTime(row.created_at)}</TableCell><TableCell>{formatDateTime(row.completed_at)}</TableCell></TableRow>
                            })}
                        </TableBody>
                    </Table>
                )
            case 'movements':
                return (
                    <Table>
                        <TableHead><TableRow><TableCell>التاريخ</TableCell><TableCell>الصنف</TableCell><TableCell>نوع الحركة</TableCell><TableCell align="center">الكمية</TableCell><TableCell>المستودع</TableCell><TableCell>المستخدم</TableCell></TableRow></TableHead>
                        <TableBody>
                            {reportData.map((row, idx) => <TableRow key={`${row.id || row.created_at}-${idx}`}><TableCell>{formatDateTime(row.created_at)}</TableCell><TableCell>{row.Menu?.name_ar || '-'}</TableCell><TableCell>{row.movement_type}</TableCell><TableCell dir="ltr" align="center">{row.quantity > 0 ? `+${formatQuantity(row.quantity)}` : formatQuantity(row.quantity)}</TableCell><TableCell>{row.Warehouse?.name_ar || '-'}</TableCell><TableCell>{row.User?.name_ar || '-'}</TableCell></TableRow>)}
                        </TableBody>
                    </Table>
                )
            case 'low_stock':
                return (
                    <Table>
                        <TableHead><TableRow><TableCell>الصنف</TableCell><TableCell>المستودع</TableCell><TableCell align="center">الكمية الحالية</TableCell><TableCell align="center">الحد الأدنى</TableCell><TableCell align="center">العجز</TableCell></TableRow></TableHead>
                        <TableBody>
                            {reportData.map((row, idx) => <TableRow key={`${row.menuId || row.productName}-${idx}`}><TableCell>{row.productName}</TableCell><TableCell>{row.warehouseName}</TableCell><TableCell align="center" sx={{ color: 'error.main', fontWeight: 'bold' }}>{formatQuantity(row.quantity)}</TableCell><TableCell align="center">{formatQuantity(row.minStock)}</TableCell><TableCell align="center">{formatQuantity(row.minStock - row.quantity)}</TableCell></TableRow>)}
                        </TableBody>
                    </Table>
                )
            case 'expiry':
                return (
                    <Table>
                        <TableHead><TableRow><TableCell>المنتج</TableCell><TableCell>المستودع</TableCell><TableCell>رقم التشغيلة</TableCell><TableCell>تاريخ الإنتاج</TableCell><TableCell>تاريخ الانتهاء</TableCell><TableCell align="center">الكمية</TableCell><TableCell align="center">الحالة</TableCell></TableRow></TableHead>
                        <TableBody>
                            {reportData.map((row, idx) => <TableRow key={`${row.movementId || row.batchNumber || row.productName}-${idx}`}><TableCell>{row.productName}</TableCell><TableCell>{row.warehouseName}</TableCell><TableCell>{row.batchNumber || '-'}</TableCell><TableCell>{formatDateOnly(row.productionDate)}</TableCell><TableCell>{formatDateOnly(row.expiryDate)}</TableCell><TableCell align="center">{formatQuantity(row.quantity)}</TableCell><TableCell align="center"><Chip size="small" color={row.status === 'expired' ? 'error' : 'warning'} label={row.status === 'expired' ? 'منتهي' : `خلال ${formatQuantity(row.daysRemaining)} يوم`} /></TableCell></TableRow>)}
                        </TableBody>
                    </Table>
                )
            default:
                return null
        }
    }

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={arSA}>
            <Box sx={{ p: 3 }}>
                <Typography variant="h4" fontWeight="bold" sx={{ mb: 3 }}><ReportIcon sx={{ mr: 1, verticalAlign: 'middle' }} />تقارير المخزون</Typography>
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={4}><TextField select label="نوع التقرير" value={reportType} onChange={(e) => setReportType(e.target.value)} fullWidth>{REPORT_TYPES.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</TextField></Grid>
                        <Grid item xs={12} md={3}><DatePicker label="من تاريخ" value={startDate} onChange={(newValue) => setStartDate(newValue)} slotProps={{ textField: { fullWidth: true } }} /></Grid>
                        <Grid item xs={12} md={3}><DatePicker label="إلى تاريخ" value={endDate} onChange={(newValue) => setEndDate(newValue)} slotProps={{ textField: { fullWidth: true } }} /></Grid>
                        <Grid item xs={12} md={2}><Button variant="contained" fullWidth size="large" onClick={handleGenerateReport} startIcon={<ReportIcon />} disabled={loading}>عرض التقرير</Button></Grid>
                    </Grid>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        {showBranchFilter && <Grid item xs={12} md={3}><TextField select label="الفرع" value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setWarehouseFilter('') }} fullWidth disabled={warehousesLoading}><MenuItem value="">كل الفروع</MenuItem>{branchOptions.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</TextField></Grid>}
                        {showWarehouseFilter && <Grid item xs={12} md={3}><TextField select label="المستودع" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} fullWidth disabled={warehousesLoading}><MenuItem value="">كل المستودعات</MenuItem>{filteredWarehouseOptions.map((warehouse) => <MenuItem key={warehouse.id} value={warehouse.id}>{warehouse.nameAr}</MenuItem>)}</TextField></Grid>}
                        {showTransferStatusFilter && <Grid item xs={12} md={3}><TextField select label="حالة التحويل" value={transferStatusFilter} onChange={(e) => setTransferStatusFilter(e.target.value)} fullWidth>{TRANSFER_STATUSES.map((statusOption) => <MenuItem key={statusOption.value || 'all'} value={statusOption.value}>{statusOption.label}</MenuItem>)}</TextField></Grid>}
                        {showMovementTypeFilter && <Grid item xs={12} md={3}><TextField select label="نوع الحركة" value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value)} fullWidth>{MOVEMENT_TYPES.map((movementOption) => <MenuItem key={movementOption.value || 'all'} value={movementOption.value}>{movementOption.label}</MenuItem>)}</TextField></Grid>}
                        {showSearchFilter && <Grid item xs={12} md={3}><TextField label="بحث بالصنف / الباركود / SKU" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} fullWidth /></Grid>}
                    </Grid>
                </Paper>
                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
                {!!summaryCards.length && <Grid container spacing={2} sx={{ mb: 3 }}>{summaryCards.map((card) => <Grid item xs={12} sm={6} md={4} lg={3} key={card.label}><Card sx={{ height: '100%' }}><CardContent><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{card.label}</Typography><Typography variant="h6" fontWeight="bold">{card.value}</Typography></CardContent></Card></Grid>)}</Grid>}
                {reportType === 'transfer_summary' && routeBreakdown.length > 0 && <Paper sx={{ p: 2, mb: 3 }}><Typography variant="h6" sx={{ mb: 2 }}>أكثر مسارات التحويل نشاطًا</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>{routeBreakdown.slice(0, 6).map((route) => <Chip key={route.route_key} color="primary" variant="outlined" label={`${route.from_branch_name} ← ${route.to_branch_name} • ${formatQuantity(route.total_quantity)}`} />)}</Stack><Table size="small"><TableHead><TableRow><TableCell>المسار</TableCell><TableCell align="center">عدد التحويلات</TableCell><TableCell align="center">عدد الأصناف</TableCell><TableCell align="center">إجمالي الكمية</TableCell><TableCell align="center">مكتمل</TableCell><TableCell align="center">معلق</TableCell></TableRow></TableHead><TableBody>{routeBreakdown.slice(0, 10).map((route) => <TableRow key={route.route_key}><TableCell>{route.from_branch_name} ← {route.to_branch_name}</TableCell><TableCell align="center">{formatQuantity(route.transfers_count)}</TableCell><TableCell align="center">{formatQuantity(route.total_items)}</TableCell><TableCell align="center">{formatQuantity(route.total_quantity)}</TableCell><TableCell align="center">{formatQuantity(route.completed_transfers)}</TableCell><TableCell align="center">{formatQuantity(route.pending_transfers)}</TableCell></TableRow>)}</TableBody></Table></Paper>}
                <TableContainer component={Paper}>
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">نتائج التقرير</Typography>
                        <Button startIcon={<DownloadIcon />} disabled={!reportData.length} onClick={handleExport}>تصدير (Excel)</Button>
                    </Box>
                    {renderTable()}
                </TableContainer>
            </Box>
        </LocalizationProvider>
    )
}
