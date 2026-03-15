import { useState, useEffect, useCallback } from 'react'
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    IconButton,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Grid,
    Divider,
    Alert,
    CircularProgress,
    Card,
    CardContent,
    Tabs,
    Tab,
    Badge,
    Tooltip,
    InputAdornment
} from '@mui/material'
import {
    Visibility as ViewIcon,
    CheckCircle as ApproveIcon,
    Flag as FlagIcon,
    Download as DownloadIcon,
    Refresh as RefreshIcon,
    Lock as CloseShiftIcon,
    Schedule as ScheduleIcon,
    AttachMoney as MoneyIcon,
    Person as PersonIcon,
    CalendarToday as CalendarIcon,
    Search as SearchIcon,
    FilterList as FilterIcon,
    Warning as WarningIcon
} from '@mui/icons-material'
import toast from 'react-hot-toast'
import { shiftAPI, userAPI } from '../services/api'

// --- Helper Functions ---
const getStatusColor = (status) => status === 'open' ? 'warning' : 'default'
const getReviewStatusColor = (status) => {
    const colors = { pending: 'warning', approved: 'success', flagged: 'error' }
    return colors[status] || 'default'
}
const getDifferenceColor = (diff) => {
    if (diff === null || diff === undefined) return 'text.secondary'
    if (diff === 0) return 'success.main'
    return diff > 0 ? 'info.main' : 'error.main'
}
const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleString('ar-SA', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    })
}
const formatDuration = (start, end) => {
    if (!start) return '-'
    const endTime = end ? new Date(end) : new Date()
    const startTime = new Date(start)
    const diffMs = endTime - startTime
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}س ${minutes}د`
}

// --- Summary Cards Component ---
const SummaryCards = ({ stats }) => (
    <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
            <Card sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ScheduleIcon />
                        <Box>
                            <Typography variant="h4" fontWeight="bold">{stats.openCount}</Typography>
                            <Typography variant="body2">ورديات مفتوحة</Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>
        </Grid>
        <Grid item xs={6} md={3}>
            <Card sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}>
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <MoneyIcon />
                        <Box>
                            <Typography variant="h4" fontWeight="bold">{stats.totalSales?.toFixed(0) || 0}</Typography>
                            <Typography variant="body2">إجمالي المبيعات</Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>
        </Grid>
        <Grid item xs={6} md={3}>
            <Card sx={{ bgcolor: 'info.light', color: 'info.contrastText' }}>
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon />
                        <Box>
                            <Typography variant="h4" fontWeight="bold">{stats.totalShifts}</Typography>
                            <Typography variant="body2">إجمالي الورديات</Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>
        </Grid>
        <Grid item xs={6} md={3}>
            <Card sx={{ bgcolor: stats.pendingReview > 0 ? 'error.light' : 'grey.200', color: stats.pendingReview > 0 ? 'error.contrastText' : 'text.primary' }}>
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FlagIcon />
                        <Box>
                            <Typography variant="h4" fontWeight="bold">{stats.pendingReview}</Typography>
                            <Typography variant="body2">بانتظار المراجعة</Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>
        </Grid>
    </Grid>
)

// --- Main Component ---
export default function ShiftHistory() {
    const [shifts, setShifts] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedShift, setSelectedShift] = useState(null)
    const [report, setReport] = useState(null)
    const [users, setUsers] = useState([])

    // Dialogs
    const [reportDialogOpen, setReportDialogOpen] = useState(false)
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
    const [closeShiftDialogOpen, setCloseShiftDialogOpen] = useState(false)

    // Form states
    const [endingCash, setEndingCash] = useState('')
    const [closingShift, setClosingShift] = useState(false)
    const [reviewNotes, setReviewNotes] = useState('')
    const [reviewStatus, setReviewStatus] = useState('approved')

    // Filters
    const [tabValue, setTabValue] = useState(0) // 0=all, 1=open, 2=closed
    const [filterUser, setFilterUser] = useState('')
    const [filterReviewStatus, setFilterReviewStatus] = useState('')
    const [searchTerm, setSearchTerm] = useState('')

    // Stats
    const [stats, setStats] = useState({
        openCount: 0,
        totalShifts: 0,
        totalSales: 0,
        pendingReview: 0
    })

    // Fetch users for filter
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await userAPI.getAll()
                setUsers(res.data.data || [])
            } catch (e) {
                console.error('Failed to fetch users', e)
            }
        }
        fetchUsers()
    }, [])

    const fetchShifts = useCallback(async () => {
        setLoading(true)
        try {
            const params = { limit: 100 }
            // Tab-based status filter
            if (tabValue === 1) params.status = 'open'
            if (tabValue === 2) params.status = 'closed'
            if (filterReviewStatus) params.review_status = filterReviewStatus

            const response = await shiftAPI.getHistory(params)
            let data = response.data.data || []

            // Client-side filters
            if (filterUser) {
                data = data.filter(s => s.user_id === parseInt(filterUser))
            }
            if (searchTerm) {
                const term = searchTerm.toLowerCase()
                data = data.filter(s =>
                    s.User?.name_ar?.toLowerCase().includes(term) ||
                    s.User?.username?.toLowerCase().includes(term) ||
                    s.id.toString().includes(term)
                )
            }

            setShifts(data)

            // Calculate stats from ALL shifts (not filtered)
            const allRes = await shiftAPI.getHistory({ limit: 1000 })
            const allShifts = allRes.data.data || []
            setStats({
                openCount: allShifts.filter(s => s.status === 'open').length,
                totalShifts: allShifts.length,
                totalSales: allShifts.reduce((sum, s) => sum + (parseFloat(s.cash_sales) || 0) + (parseFloat(s.card_sales) || 0), 0),
                pendingReview: allShifts.filter(s => s.status === 'closed' && s.review_status === 'pending').length
            })
        } catch (error) {
            toast.error('فشل تحميل البيانات')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [tabValue, filterUser, filterReviewStatus, searchTerm])

    useEffect(() => {
        fetchShifts()
    }, [fetchShifts])

    // Handlers
    const handleViewReport = async (shift) => {
        try {
            const response = await shiftAPI.getReport(shift.id)
            setReport(response.data.data)
            setSelectedShift(shift)
            setReportDialogOpen(true)
        } catch (error) {
            toast.error('فشل تحميل التقرير')
        }
    }

    const handleOpenReview = (shift) => {
        setSelectedShift(shift)
        setReviewNotes('')
        setReviewStatus('approved')
        setReviewDialogOpen(true)
    }

    const handleSubmitReview = async () => {
        try {
            await shiftAPI.review(selectedShift.id, { status: reviewStatus, notes: reviewNotes })
            toast.success(reviewStatus === 'approved' ? 'تم اعتماد الوردية' : 'تم تعليم الوردية')
            setReviewDialogOpen(false)
            fetchShifts()
        } catch (error) {
            toast.error('فشل حفظ المراجعة')
        }
    }

    const handleExport = async (shift) => {
        try {
            const response = await shiftAPI.exportCSV(shift.id)
            const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `shift_${shift.id}_report.csv`
            a.click()
            window.URL.revokeObjectURL(url)
            toast.success('تم تصدير التقرير')
        } catch (error) {
            toast.error('فشل التصدير')
        }
    }

    const handleOpenCloseDialog = (shift) => {
        setSelectedShift(shift)
        setEndingCash('')
        setCloseShiftDialogOpen(true)
    }

    const handleCloseShift = async () => {
        if (!endingCash || isNaN(parseFloat(endingCash))) {
            toast.error('يرجى إدخال المبلغ النهائي')
            return
        }
        setClosingShift(true)
        try {
            await shiftAPI.end(selectedShift.id, { ending_cash: parseFloat(endingCash) })
            toast.success('تم إغلاق الوردية بنجاح')
            setCloseShiftDialogOpen(false)
            fetchShifts()
        } catch (error) {
            toast.error(error.response?.data?.message || 'فشل إغلاق الوردية')
        } finally {
            setClosingShift(false)
        }
    }

    const openShiftsCount = shifts.filter(s => s.status === 'open').length

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h4" fontWeight="bold">
                    سجل الورديات
                </Typography>
                <Tooltip title="تحديث">
                    <IconButton onClick={fetchShifts} color="primary" size="large">
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Summary Cards */}
            <SummaryCards stats={stats} />

            {/* Filters Bar */}
            <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="بحث بالاسم أو رقم الوردية..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
                            }}
                        />
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <FormControl fullWidth size="small">
                            <InputLabel>الكاشير</InputLabel>
                            <Select
                                value={filterUser}
                                onChange={(e) => setFilterUser(e.target.value)}
                                label="الكاشير"
                            >
                                <MenuItem value="">الكل</MenuItem>
                                {users.map(u => (
                                    <MenuItem key={u.id} value={u.id}>{u.name_ar || u.username}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <FormControl fullWidth size="small">
                            <InputLabel>حالة المراجعة</InputLabel>
                            <Select
                                value={filterReviewStatus}
                                onChange={(e) => setFilterReviewStatus(e.target.value)}
                                label="حالة المراجعة"
                            >
                                <MenuItem value="">الكل</MenuItem>
                                <MenuItem value="pending">في الانتظار</MenuItem>
                                <MenuItem value="approved">معتمدة</MenuItem>
                                <MenuItem value="flagged">للمراجعة</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => { setSearchTerm(''); setFilterUser(''); setFilterReviewStatus(''); setTabValue(0) }}
                            startIcon={<FilterIcon />}
                        >
                            مسح الفلاتر
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {/* Tabs */}
            <Tabs
                value={tabValue}
                onChange={(e, v) => setTabValue(v)}
                sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
            >
                <Tab label={`الكل (${stats.totalShifts})`} />
                <Tab
                    label={
                        <Badge badgeContent={stats.openCount} color="warning" max={99}>
                            <Box sx={{ pr: 2 }}>مفتوحة</Box>
                        </Badge>
                    }
                />
                <Tab label="مغلقة" />
            </Tabs>

            {/* Alert for open shifts */}
            {stats.openCount > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningIcon />}>
                    يوجد <strong>{stats.openCount}</strong> وردية مفتوحة حالياً. يرجى إغلاقها قبل نهاية اليوم.
                </Alert>
            )}

            {/* Table */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                    <CircularProgress />
                </Box>
            ) : shifts.length === 0 ? (
                <Paper sx={{ p: 5, textAlign: 'center' }}>
                    <Typography color="text.secondary">لا توجد ورديات مطابقة للفلاتر المحددة</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'primary.main' }}>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>#</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>الكاشير</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>البداية</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>النهاية</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>المدة</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>الحالة</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>المبيعات</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>الفرق</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>المراجعة</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>الإجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {shifts.map((shift) => {
                                const diff = shift.ending_cash && shift.expected_cash
                                    ? parseFloat(shift.ending_cash) - parseFloat(shift.expected_cash)
                                    : null
                                const totalSales = (parseFloat(shift.cash_sales) || 0) + (parseFloat(shift.card_sales) || 0)
                                return (
                                    <TableRow
                                        key={shift.id}
                                        hover
                                        sx={{
                                            bgcolor: shift.status === 'open' ? 'warning.lighter' : 'inherit',
                                            '&:hover': { bgcolor: shift.status === 'open' ? 'warning.light' : undefined }
                                        }}
                                    >
                                        <TableCell>
                                            <Typography fontWeight="bold">#{shift.id}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <PersonIcon fontSize="small" color="action" />
                                                <Typography fontWeight="medium">{shift.User?.name_ar || 'غير معروف'}</Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>{formatDate(shift.start_time)}</TableCell>
                                        <TableCell>{formatDate(shift.end_time)}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={formatDuration(shift.start_time, shift.end_time)}
                                                size="small"
                                                variant="outlined"
                                                icon={<ScheduleIcon />}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={shift.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                                                color={getStatusColor(shift.status)}
                                                size="small"
                                                sx={{ fontWeight: 'bold' }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography fontWeight="bold" color="success.main">
                                                {totalSales.toFixed(2)} ر.س
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography fontWeight="bold" color={getDifferenceColor(diff)}>
                                                {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)} ر.س` : '-'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={
                                                    shift.review_status === 'pending' ? 'في الانتظار' :
                                                        shift.review_status === 'approved' ? 'معتمدة' : 'للمراجعة'
                                                }
                                                color={getReviewStatusColor(shift.review_status)}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                <Tooltip title="عرض التقرير">
                                                    <IconButton size="small" color="primary" onClick={() => handleViewReport(shift)}>
                                                        <ViewIcon />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="تصدير CSV">
                                                    <IconButton size="small" color="info" onClick={() => handleExport(shift)}>
                                                        <DownloadIcon />
                                                    </IconButton>
                                                </Tooltip>
                                                {shift.status === 'closed' && shift.review_status === 'pending' && (
                                                    <Tooltip title="مراجعة">
                                                        <IconButton size="small" color="success" onClick={() => handleOpenReview(shift)}>
                                                            <ApproveIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {shift.status === 'open' && (
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="error"
                                                        startIcon={<CloseShiftIcon />}
                                                        onClick={() => handleOpenCloseDialog(shift)}
                                                    >
                                                        إغلاق
                                                    </Button>
                                                )}
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Report Dialog */}
            <Dialog open={reportDialogOpen} onClose={() => setReportDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
                    تقرير الوردية #{selectedShift?.id}
                </DialogTitle>
                <DialogContent>
                    {report && (
                        <Box sx={{ py: 2 }}>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography color="text.secondary">الكاشير</Typography>
                                    <Typography fontWeight="bold">{report.cashier?.name_ar}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography color="text.secondary">المدة</Typography>
                                    <Typography fontWeight="bold">{report.duration?.formatted}</Typography>
                                </Grid>
                            </Grid>

                            <Divider sx={{ my: 2 }} />
                            <Typography variant="h6" gutterBottom>البيانات المالية</Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                    <Typography>مبلغ البداية</Typography>
                                    <Typography fontWeight="bold">{report.financials?.starting_cash} ر.س</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1 }}>
                                    <Typography>مبيعات نقدية</Typography>
                                    <Typography fontWeight="bold">{report.financials?.cash_sales?.toFixed(2)} ر.س</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                    <Typography>مبيعات شبكة</Typography>
                                    <Typography fontWeight="bold">{report.financials?.card_sales?.toFixed(2)} ر.س</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1 }}>
                                    <Typography>إجمالي المبيعات</Typography>
                                    <Typography fontWeight="bold" color="primary">{report.financials?.total_sales?.toFixed(2)} ر.س</Typography>
                                </Box>

                                <Divider />

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                                    <Typography>المبلغ المتوقع</Typography>
                                    <Typography fontWeight="bold">{report.financials?.expected_cash?.toFixed(2)} ر.س</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, bgcolor: '#e8f5e9', borderRadius: 1 }}>
                                    <Typography>المبلغ الفعلي</Typography>
                                    <Typography fontWeight="bold">{report.financials?.ending_cash?.toFixed(2) || '-'} ر.س</Typography>
                                </Box>

                                {report.financials?.difference !== null && (
                                    <Box sx={{
                                        display: 'flex', justifyContent: 'space-between', p: 2, borderRadius: 1, border: 2,
                                        bgcolor: report.financials.difference === 0 ? '#e8f5e9' :
                                            report.financials.difference > 0 ? '#fff3e0' : '#ffebee',
                                        borderColor: report.financials.difference === 0 ? 'success.main' :
                                            report.financials.difference > 0 ? 'warning.main' : 'error.main'
                                    }}>
                                        <Typography fontWeight="bold">الفرق</Typography>
                                        <Typography fontWeight="bold">
                                            {report.financials.difference > 0 ? '+' : ''}
                                            {report.financials.difference?.toFixed(2)} ر.س
                                        </Typography>
                                    </Box>
                                )}
                            </Box>

                            <Divider sx={{ my: 2 }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography color="text.secondary">عدد الطلبات</Typography>
                                <Typography fontWeight="bold">{report.order_count}</Typography>
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReportDialogOpen(false)}>إغلاق</Button>
                </DialogActions>
            </Dialog>

            {/* Review Dialog */}
            <Dialog open={reviewDialogOpen} onClose={() => setReviewDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>مراجعة الوردية #{selectedShift?.id}</DialogTitle>
                <DialogContent>
                    <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth>
                            <InputLabel>قرار المراجعة</InputLabel>
                            <Select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)} label="قرار المراجعة">
                                <MenuItem value="approved">اعتماد ✓</MenuItem>
                                <MenuItem value="flagged">تعليم للمراجعة ⚠</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField label="ملاحظات" multiline rows={3} fullWidth value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReviewDialogOpen(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={handleSubmitReview}>حفظ المراجعة</Button>
                </DialogActions>
            </Dialog>

            {/* Close Shift Dialog */}
            <Dialog open={closeShiftDialogOpen} onClose={() => setCloseShiftDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: 'error.main', color: 'white' }}>
                    إغلاق الوردية #{selectedShift?.id}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ py: 3 }}>
                        <Alert severity="warning" sx={{ mb: 3 }}>
                            أنت على وشك إغلاق هذه الوردية. هذا الإجراء لا يمكن التراجع عنه.
                        </Alert>
                        <Typography variant="body1" color="text.secondary" gutterBottom>
                            أدخل المبلغ النهائي الموجود في الصندوق:
                        </Typography>
                        <TextField
                            fullWidth
                            type="number"
                            label="المبلغ النهائي (ر.س)"
                            value={endingCash}
                            onChange={(e) => setEndingCash(e.target.value)}
                            sx={{ mt: 2 }}
                            autoFocus
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setCloseShiftDialogOpen(false)} disabled={closingShift}>إلغاء</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleCloseShift}
                        disabled={closingShift}
                        startIcon={closingShift ? <CircularProgress size={20} color="inherit" /> : <CloseShiftIcon />}
                    >
                        {closingShift ? 'جاري الإغلاق...' : 'تأكيد الإغلاق'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
