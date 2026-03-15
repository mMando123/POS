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
    IconButton,
    Chip,
    Button,
    CircularProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    Divider,
    TextField,
    Autocomplete,
    Tooltip,
    Snackbar,
    Stepper,
    Step,
    StepLabel
} from '@mui/material'
import {
    Visibility as ViewIcon,
    AssignmentReturn as ReturnIcon,
    Refresh as RefreshIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    CheckCircle as ConfirmIcon,
    Cancel as CancelIcon,
    LocalShipping as POIcon
} from '@mui/icons-material'
import { purchaseReturnAPI, purchaseOrderAPI } from '../services/api'
import { useThemeConfig } from '../contexts/ThemeContext'
import EntityAttachmentsPanel from '../components/EntityAttachmentsPanel'

export default function PurchaseReturns() {
    const { formatCurrency } = useThemeConfig()

    // ==================== LIST STATE ====================
    const [returns, setReturns] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

    // ==================== VIEW STATE ====================
    const [openView, setOpenView] = useState(false)
    const [selectedReturn, setSelectedReturn] = useState(null)
    const [confirming, setConfirming] = useState(false)

    // ==================== CREATE STATE ====================
    const [openCreate, setOpenCreate] = useState(false)
    const [purchaseOrders, setPurchaseOrders] = useState([])
    const [selectedPO, setSelectedPO] = useState(null)
    const [returnItems, setReturnItems] = useState([])
    const [returnNotes, setReturnNotes] = useState('')
    const [creating, setCreating] = useState(false)
    const [loadingPO, setLoadingPO] = useState(false)

    // ==================== FETCH RETURNS ====================
    const fetchReturns = useCallback(async () => {
        try {
            setLoading(true)
            const response = await purchaseReturnAPI.getAll()
            setReturns(response.data.data || [])
            setError(null)
        } catch (err) {
            console.error('Error fetching returns:', err)
            setError('حدث خطأ في جلب المرتجعات')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchReturns()
    }, [fetchReturns])

    // ==================== FETCH POs FOR CREATE ====================
    const fetchPurchaseOrders = async () => {
        try {
            // Fetch confirmed/received/partial POs that have items to return
            const response = await purchaseOrderAPI.getAll({ status: 'confirmed' })
            const response2 = await purchaseOrderAPI.getAll({ status: 'received' })
            const response3 = await purchaseOrderAPI.getAll({ status: 'partial' })
            const allPOs = [
                ...(response.data.data || []),
                ...(response2.data.data || []),
                ...(response3.data.data || [])
            ]
            setPurchaseOrders(allPOs)
        } catch (err) {
            console.error('Error fetching POs:', err)
        }
    }

    // ==================== OPEN CREATE DIALOG ====================
    const handleOpenCreate = () => {
        setSelectedPO(null)
        setReturnItems([])
        setReturnNotes('')
        fetchPurchaseOrders()
        setOpenCreate(true)
    }

    // ==================== SELECT PO ====================
    const handleSelectPO = async (po) => {
        if (!po) {
            setSelectedPO(null)
            setReturnItems([])
            return
        }

        try {
            setLoadingPO(true)
            const response = await purchaseOrderAPI.getById(po.id)
            const fullPO = response.data.data
            setSelectedPO(fullPO)

            // Build return items from PO items (only items with received quantity > 0)
            const items = (fullPO.items || [])
                .filter(item => {
                    const received = parseFloat(item.quantity_received || 0)
                    return received > 0
                })
                .map(item => ({
                    menu_id: item.menu_id,
                    purchase_order_item_id: item.id,
                    product_name: item.Menu?.name_ar || item.productName || 'منتج',
                    quantity_received: parseFloat(item.quantity_received || 0),
                    quantity_ordered: parseFloat(item.quantity_ordered || 0),
                    unit_cost: parseFloat(item.unit_cost || 0),
                    quantity_to_return: 0,
                    reason: ''
                }))

            setReturnItems(items)
        } catch (err) {
            console.error('Error fetching PO details:', err)
            setError('فشل جلب تفاصيل أمر الشراء')
        } finally {
            setLoadingPO(false)
        }
    }

    // ==================== UPDATE RETURN ITEM ====================
    const handleUpdateReturnItem = (index, field, value) => {
        setReturnItems(prev => {
            const updated = [...prev]
            updated[index] = { ...updated[index], [field]: value }
            return updated
        })
    }

    // ==================== CALCULATE TOTAL ====================
    const calculateReturnTotal = () => {
        return returnItems.reduce((sum, item) => {
            return sum + (parseFloat(item.quantity_to_return) || 0) * item.unit_cost
        }, 0)
    }

    // ==================== CREATE RETURN ====================
    const handleCreateReturn = async () => {
        // Validate
        const itemsToReturn = returnItems.filter(item => item.quantity_to_return > 0)
        if (itemsToReturn.length === 0) {
            setSnackbar({ open: true, message: 'يرجى تحديد كمية لإرجاعها', severity: 'warning' })
            return
        }

        // Validate quantities
        for (const item of itemsToReturn) {
            if (item.quantity_to_return > item.quantity_received) {
                setSnackbar({
                    open: true,
                    message: `كمية الإرجاع للمنتج "${item.product_name}" تتجاوز الكمية المستلمة (${item.quantity_received})`,
                    severity: 'error'
                })
                return
            }
        }

        try {
            setCreating(true)
            await purchaseReturnAPI.create({
                purchase_order_id: selectedPO.id,
                items: itemsToReturn.map(item => ({
                    menu_id: item.menu_id,
                    quantity: item.quantity_to_return,
                    reason: item.reason
                })),
                notes: returnNotes
            })

            setOpenCreate(false)
            fetchReturns()
            setSnackbar({ open: true, message: 'تم إنشاء مسودة المرتجع بنجاح ✅', severity: 'success' })
        } catch (err) {
            console.error('Error creating return:', err)
            setSnackbar({
                open: true,
                message: err.response?.data?.message || 'حدث خطأ في إنشاء المرتجع',
                severity: 'error'
            })
        } finally {
            setCreating(false)
        }
    }

    // ==================== VIEW RETURN ====================
    const handleViewReturn = async (ret) => {
        try {
            const response = await purchaseReturnAPI.getById(ret.id)
            setSelectedReturn(response.data.data)
            setOpenView(true)
        } catch (err) {
            setError('فشل جلب تفاصيل المرتجع')
        }
    }

    // ==================== CONFIRM RETURN ====================
    const handleConfirmReturn = async () => {
        try {
            setConfirming(true)
            await purchaseReturnAPI.confirm(selectedReturn.id)
            setOpenView(false)
            fetchReturns()
            setSnackbar({
                open: true,
                message: 'تم تأكيد المرتجع وخصم المخزون بنجاح ✅',
                severity: 'success'
            })
        } catch (err) {
            console.error('Error confirming return:', err)
            setSnackbar({
                open: true,
                message: err.response?.data?.message || 'حدث خطأ في تأكيد المرتجع',
                severity: 'error'
            })
        } finally {
            setConfirming(false)
        }
    }

    // ==================== HELPERS ====================
    const formatDate = (date) => {
        if (!date) return '-'
        const d = new Date(date)
        return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
    }

    const getStatusInfo = (status) => {
        switch (status) {
            case 'draft': return { label: 'مسودة', color: 'warning', step: 0 }
            case 'completed': return { label: 'مكتمل', color: 'success', step: 1 }
            case 'cancelled': return { label: 'ملغى', color: 'error', step: -1 }
            default: return { label: status, color: 'default', step: 0 }
        }
    }

    // ==================== RENDER ====================
    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" fontWeight="bold">
                    <ReturnIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    مردودات المشتريات
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button startIcon={<RefreshIcon />} onClick={fetchReturns}>
                        تحديث
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<AddIcon />}
                        onClick={handleOpenCreate}
                    >
                        مرتجع جديد
                    </Button>
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Returns Table */}
            <TableContainer component={Paper}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>رقم المرتجع</TableCell>
                                <TableCell>أمر الشراء</TableCell>
                                <TableCell>المورد</TableCell>
                                <TableCell>التاريخ</TableCell>
                                <TableCell>المبلغ</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell align="center">إجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {returns.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        <Box sx={{ py: 4 }}>
                                            <ReturnIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                            <Typography color="text.secondary">
                                                لا توجد مردودات بعد
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                اضغط "مرتجع جديد" لإنشاء أول مرتجع
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                returns.map((ret) => (
                                    <TableRow key={ret.id} hover>
                                        <TableCell>
                                            <Typography fontWeight="bold" sx={{ color: 'error.main' }}>
                                                {ret.return_number}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={ret.PurchaseOrder?.po_number || '-'}
                                                size="small"
                                                variant="outlined"
                                                icon={<POIcon />}
                                            />
                                        </TableCell>
                                        <TableCell>{ret.Supplier?.name_ar}</TableCell>
                                        <TableCell>{formatDate(ret.return_date || ret.created_at || ret.createdAt)}</TableCell>
                                        <TableCell>
                                            <Typography fontWeight="bold" color="error.main">
                                                {formatCurrency(ret.total_amount)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={getStatusInfo(ret.status).label}
                                                color={getStatusInfo(ret.status).color}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title="عرض التفاصيل">
                                                <IconButton size="small" onClick={() => handleViewReturn(ret)} color="primary">
                                                    <ViewIcon fontSize="small" />
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

            {/* ==================== CREATE RETURN DIALOG ==================== */}
            <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: 'error.main', color: 'white' }}>
                    <ReturnIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    إنشاء مرتجع مشتريات جديد
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    {/* Step 1: Select PO */}
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
                        ① اختر أمر الشراء
                    </Typography>
                    <Autocomplete
                        options={purchaseOrders}
                        getOptionLabel={(option) =>
                            `${option.po_number} - ${option.supplier_name || option.Supplier?.name_ar || ''}`
                        }
                        value={selectedPO ? purchaseOrders.find(po => po.id === selectedPO.id) || null : null}
                        onChange={(e, val) => handleSelectPO(val)}
                        renderOption={(props, option) => (
                            <li {...props} key={option.id}>
                                <Box sx={{ width: '100%' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography fontWeight="bold">{option.po_number}</Typography>
                                        <Chip
                                            label={option.status === 'confirmed' ? 'مؤكد' : option.status === 'received' ? 'مستلم' : 'جزئي'}
                                            size="small"
                                            color={option.status === 'received' ? 'success' : 'info'}
                                        />
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">
                                        المورد: {option.supplier_name || option.Supplier?.name_ar} | الإجمالي: {formatCurrency(option.total_amount)}
                                    </Typography>
                                </Box>
                            </li>
                        )}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="ابحث عن أمر شراء..."
                                placeholder="اختر أمر الشراء المراد عمل مرتجع عليه"
                            />
                        )}
                        noOptionsText="لا توجد أوامر شراء مؤهلة للإرجاع"
                        sx={{ mb: 2 }}
                    />

                    {loadingPO && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress />
                        </Box>
                    )}

                    {/* Step 2: Select Items to Return */}
                    {selectedPO && !loadingPO && (
                        <>
                            <Divider sx={{ my: 2 }} />

                            {/* PO Info */}
                            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                                <Grid container spacing={2}>
                                    <Grid item xs={4}>
                                        <Typography variant="caption" color="text.secondary">المورد</Typography>
                                        <Typography fontWeight="bold">
                                            {selectedPO.supplier_name || selectedPO.Supplier?.name_ar}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={4}>
                                        <Typography variant="caption" color="text.secondary">رقم أمر الشراء</Typography>
                                        <Typography fontWeight="bold">{selectedPO.po_number}</Typography>
                                    </Grid>
                                    <Grid item xs={4}>
                                        <Typography variant="caption" color="text.secondary">المستودع</Typography>
                                        <Typography fontWeight="bold">
                                            {selectedPO.Warehouse?.name_ar || selectedPO.warehouse_name || '-'}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </Paper>

                            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                                ② حدد المنتجات والكميات المراد إرجاعها
                            </Typography>

                            {returnItems.length === 0 ? (
                                <Alert severity="info">
                                    لا توجد منتجات مستلمة في أمر الشراء هذا يمكن إرجاعها
                                </Alert>
                            ) : (
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: 'error.50' }}>
                                                <TableCell>المنتج</TableCell>
                                                <TableCell align="center">الكمية المستلمة</TableCell>
                                                <TableCell align="center">كمية الإرجاع</TableCell>
                                                <TableCell align="center">سعر الوحدة</TableCell>
                                                <TableCell align="center">المبلغ</TableCell>
                                                <TableCell>سبب الإرجاع</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {returnItems.map((item, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>
                                                        <Typography fontWeight="bold">{item.product_name}</Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Chip label={item.quantity_received} size="small" color="info" />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <TextField
                                                            type="number"
                                                            size="small"
                                                            value={item.quantity_to_return}
                                                            onChange={(e) => {
                                                                const val = Math.max(0, Math.min(parseFloat(e.target.value) || 0, item.quantity_received))
                                                                handleUpdateReturnItem(idx, 'quantity_to_return', val)
                                                            }}
                                                            inputProps={{ min: 0, max: item.quantity_received, step: 1 }}
                                                            sx={{ width: 90 }}
                                                            error={item.quantity_to_return > item.quantity_received}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {formatCurrency(item.unit_cost)}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Typography
                                                            fontWeight="bold"
                                                            color={item.quantity_to_return > 0 ? 'error.main' : 'text.disabled'}
                                                        >
                                                            {formatCurrency(item.quantity_to_return * item.unit_cost)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <TextField
                                                            size="small"
                                                            placeholder="السبب (اختياري)"
                                                            value={item.reason}
                                                            onChange={(e) => handleUpdateReturnItem(idx, 'reason', e.target.value)}
                                                            sx={{ minWidth: 150 }}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {/* Total Row */}
                                            <TableRow sx={{ bgcolor: 'error.50' }}>
                                                <TableCell colSpan={4} align="left">
                                                    <Typography fontWeight="bold" color="error.main">
                                                        إجمالي المرتجع
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Typography fontWeight="bold" color="error.main" variant="h6">
                                                        {formatCurrency(calculateReturnTotal())}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell />
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}

                            {/* Notes */}
                            <TextField
                                label="ملاحظات"
                                fullWidth
                                multiline
                                rows={2}
                                value={returnNotes}
                                onChange={(e) => setReturnNotes(e.target.value)}
                                sx={{ mt: 2 }}
                                placeholder="أي ملاحظات إضافية على المرتجع..."
                            />
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={() => setOpenCreate(false)}>إلغاء</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleCreateReturn}
                        disabled={creating || !selectedPO || returnItems.filter(i => i.quantity_to_return > 0).length === 0}
                        startIcon={creating ? <CircularProgress size={16} /> : <ReturnIcon />}
                    >
                        {creating ? 'جارٍ الحفظ...' : 'حفظ كمسودة'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ==================== VIEW RETURN DIALOG ==================== */}
            <Dialog open={openView} onClose={() => setOpenView(false)} maxWidth="md" fullWidth>
                {selectedReturn && (
                    <>
                        <DialogTitle>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="h6">
                                    تفاصيل المرتجع: {selectedReturn.return_number}
                                </Typography>
                                <Chip
                                    label={getStatusInfo(selectedReturn.status).label}
                                    color={getStatusInfo(selectedReturn.status).color}
                                />
                            </Box>
                        </DialogTitle>
                        <DialogContent>
                            {/* Stepper */}
                            {selectedReturn.status !== 'cancelled' && (
                                <Stepper activeStep={getStatusInfo(selectedReturn.status).step} sx={{ mb: 3 }}>
                                    <Step>
                                        <StepLabel>مسودة</StepLabel>
                                    </Step>
                                    <Step>
                                        <StepLabel>مكتمل (تم الخصم)</StepLabel>
                                    </Step>
                                </Stepper>
                            )}

                            {/* PO Link */}
                            {selectedReturn.PurchaseOrder && (
                                <Alert severity="info" sx={{ mb: 2 }} icon={<POIcon />}>
                                    مرتبط بأمر الشراء: <strong>{selectedReturn.PurchaseOrder.po_number}</strong>
                                </Alert>
                            )}

                            {/* Info Grid */}
                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid item xs={6} sm={4}>
                                    <Typography variant="caption" color="text.secondary">المورّد</Typography>
                                    <Typography fontWeight="bold">
                                        {selectedReturn.Supplier?.name_ar}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6} sm={4}>
                                    <Typography variant="caption" color="text.secondary">المستودع</Typography>
                                    <Typography fontWeight="bold">
                                        {selectedReturn.Warehouse?.name_ar}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6} sm={4}>
                                    <Typography variant="caption" color="text.secondary">التاريخ</Typography>
                                    <Typography fontWeight="bold">
                                        {formatDate(selectedReturn.return_date)}
                                    </Typography>
                                </Grid>
                            </Grid>

                            {/* Items Table */}
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                                المنتجات المرتجعة
                            </Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>المنتج</TableCell>
                                            <TableCell align="center">الكمية</TableCell>
                                            <TableCell align="center">سعر الوحدة</TableCell>
                                            <TableCell align="center">الإجمالي</TableCell>
                                            <TableCell>السبب</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {selectedReturn.items?.map((item, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>
                                                    <Typography fontWeight="bold">
                                                        {item.Menu?.name_ar}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Chip label={item.quantity_returned} size="small" color="error" />
                                                </TableCell>
                                                <TableCell align="center">{formatCurrency(item.unit_cost)}</TableCell>
                                                <TableCell align="center">
                                                    <Typography fontWeight="bold" color="error.main">
                                                        {formatCurrency(item.total_cost)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>{item.reason || '-'}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow sx={{ bgcolor: 'error.50' }}>
                                            <TableCell colSpan={3} align="left">
                                                <Typography fontWeight="bold">إجمالي المرتجع</Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Typography fontWeight="bold" color="error.main" variant="h6">
                                                    {formatCurrency(selectedReturn.total_amount)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell />
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            {/* Notes */}
                            {selectedReturn.notes && (
                                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                                    <Typography variant="caption" color="text.secondary">ملاحظات</Typography>
                                    <Typography>{selectedReturn.notes}</Typography>
                                </Paper>
                            )}

                            <EntityAttachmentsPanel
                                entityType="purchase_return"
                                entityId={selectedReturn.id}
                                title="مرفقات مرتجع الشراء"
                                readOnly={selectedReturn.status === 'cancelled'}
                            />

                            {/* Confirm Warning */}
                            {selectedReturn.status === 'draft' && (
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                    <Typography variant="body2" fontWeight="bold">
                                        ⚠️ هذا المرتجع لم يُؤكد بعد
                                    </Typography>
                                    <Typography variant="caption">
                                        عند التأكيد سيتم خصم الكميات من المخزون وتعديل رصيد المورد تلقائياً.
                                    </Typography>
                                </Alert>
                            )}
                        </DialogContent>
                        <DialogActions sx={{ px: 3, py: 2 }}>
                            <Button onClick={() => setOpenView(false)}>إغلاق</Button>
                            {selectedReturn.status === 'draft' && (
                                <Button
                                    variant="contained"
                                    color="success"
                                    onClick={handleConfirmReturn}
                                    disabled={confirming}
                                    startIcon={confirming ? <CircularProgress size={16} /> : <ConfirmIcon />}
                                >
                                    {confirming ? 'جارٍ التأكيد...' : 'تأكيد المرتجع ✅'}
                                </Button>
                            )}
                        </DialogActions>
                    </>
                )}
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    )
}
