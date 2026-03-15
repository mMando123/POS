import { useState, useEffect, useCallback } from 'react'
import {
    Box,
    Typography,
    Paper,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    Chip,
    CircularProgress,
    Alert,
    Stepper,
    Step,
    StepLabel,
    Divider,
    Autocomplete,
    Tooltip
} from '@mui/material'
import {
    Add as AddIcon,
    Visibility as ViewIcon,
    Delete as DeleteIcon,
    SwapHoriz as TransferIcon,
    Check as CheckIcon,
    Cancel as CancelIcon,
    LocalShipping as ShippingIcon
} from '@mui/icons-material'
import { transferAPI, warehouseAPI, menuAPI, inventoryAPI } from '../services/api'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'

export default function StockTransfers() {
    const [transfers, setTransfers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [statusFilter, setStatusFilter] = useState('')
    const [warehouses, setWarehouses] = useState([])
    const [products, setProducts] = useState([])
    const [stockLevels, setStockLevels] = useState({})

    // Dialog states
    const [openCreate, setOpenCreate] = useState(false)
    const [openView, setOpenView] = useState(false)
    const [selectedTransfer, setSelectedTransfer] = useState(null)

    // Create form state
    const [newTransfer, setNewTransfer] = useState({
        from_warehouse_id: '',
        to_warehouse_id: '',
        notes: '',
        items: []
    })

    // Line item to add
    const [newItem, setNewItem] = useState({
        menu_id: '',
        quantity: 1
    })

    const fetchTransfers = useCallback(async () => {
        try {
            setLoading(true)
            const params = {}
            if (statusFilter) params.status = statusFilter

            const response = await transferAPI.getAll(params)
            setTransfers(response.data.data || response.data || [])
            setError(null)
        } catch (err) {
            console.error('Error fetching transfers:', err)
            setError('حدث خطأ في جلب التحويلات')
        } finally {
            setLoading(false)
        }
    }, [statusFilter])

    const fetchRelatedData = async () => {
        try {
            const [warehousesRes, productsRes] = await Promise.all([
                warehouseAPI.getAll(),
                menuAPI.getAll()
            ])
            setWarehouses(warehousesRes.data.data || warehousesRes.data || [])
            setProducts(productsRes.data.data || productsRes.data || [])
        } catch (err) {
            console.error('Error fetching related data:', err)
        }
    }

    const fetchStockForWarehouse = async (warehouseId) => {
        if (!warehouseId) return
        try {
            const response = await inventoryAPI.getStock({ warehouse_id: warehouseId })
            const stockMap = {}
            const stockData = response.data.data || response.data || []

            console.log('Stock Data for Warehouse:', stockData) // Debugging

            stockData.forEach(s => {
                // Handle various potential field names
                const menuId = s.menu_id || s.menuId || (s.Menu ? s.Menu.id : null)
                const quantity = s.quantity || 0
                const reserved = s.reserved_qty || s.reserved || 0

                if (menuId) {
                    stockMap[menuId] = Math.max(0, quantity - reserved)
                }
            })
            setStockLevels(stockMap)
        } catch (err) {
            console.error('Error fetching stock levels:', err)
        }
    }

    useEffect(() => {
        fetchTransfers()
        fetchRelatedData()
    }, [fetchTransfers])

    useEffect(() => {
        if (newTransfer.from_warehouse_id) {
            fetchStockForWarehouse(newTransfer.from_warehouse_id)
        }
    }, [newTransfer.from_warehouse_id])

    const handleOpenCreate = () => {
        setNewTransfer({
            from_warehouse_id: warehouses[0]?.id || '',
            to_warehouse_id: '',
            notes: '',
            items: []
        })
        setOpenCreate(true)
    }

    const handleAddItem = () => {
        if (!newItem.menu_id || newItem.quantity <= 0) return

        const product = products.find(p => p.id === newItem.menu_id)
        const available = stockLevels[newItem.menu_id] || 0

        if (newItem.quantity > available) {
            setError(`الكمية المطلوبة (${newItem.quantity}) أكبر من المتوفر (${available})`)
            return
        }

        setNewTransfer(prev => ({
            ...prev,
            items: [...prev.items, {
                ...newItem,
                productName: product?.name_ar || '',
                available
            }]
        }))
        setNewItem({ menu_id: '', quantity: 1 })
    }

    const handleRemoveItem = (index) => {
        setNewTransfer(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }))
    }

    const handleCreateTransfer = async () => {
        try {
            if (!newTransfer.from_warehouse_id || !newTransfer.to_warehouse_id || newTransfer.items.length === 0) {
                setError('يجب اختيار المستودعات وإضافة منتجات')
                return
            }

            if (newTransfer.from_warehouse_id === newTransfer.to_warehouse_id) {
                setError('لا يمكن التحويل إلى نفس المستودع')
                return
            }

            await transferAPI.create(newTransfer)
            setOpenCreate(false)
            fetchTransfers()
        } catch (err) {
            console.error('Error creating transfer:', err)
            setError(err.response?.data?.message || 'حدث خطأ في إنشاء التحويل')
        }
    }

    const handleViewTransfer = async (transfer) => {
        try {
            const response = await transferAPI.getById(transfer.id)
            setSelectedTransfer(response.data.data || response.data)
            setOpenView(true)
        } catch (err) {
            console.error('Error fetching transfer details:', err)
            setError('حدث خطأ في جلب تفاصيل التحويل')
        }
    }

    const handleCompleteTransfer = async () => {
        try {
            await transferAPI.complete(selectedTransfer.id)
            setOpenView(false)
            fetchTransfers()
        } catch (err) {
            console.error('Error completing transfer:', err)
            setError(err.response?.data?.message || 'حدث خطأ في إكمال التحويل')
        }
    }

    const handleCancelTransfer = async () => {
        try {
            await transferAPI.cancel(selectedTransfer.id)
            setOpenView(false)
            fetchTransfers()
        } catch (err) {
            console.error('Error cancelling transfer:', err)
            setError(err.response?.data?.message || 'حدث خطأ في إلغاء التحويل')
        }
    }

    const getStatusInfo = (status) => {
        switch (status) {
            case 'pending': return { label: 'قيد الانتظار', color: 'warning', step: 0 }
            case 'in_transit': return { label: 'في الطريق', color: 'info', step: 1 }
            case 'completed': return { label: 'مكتمل', color: 'success', step: 2 }
            case 'cancelled': return { label: 'ملغى', color: 'error', step: -1 }
            default: return { label: status, color: 'default', step: 0 }
        }
    }

    const formatDate = (date) => {
        if (!date) return '-'
        return format(new Date(date), 'dd MMM yyyy HH:mm', { locale: arSA })
    }

    const getWarehouseName = (id) => {
        return warehouses.find(w => w.id === id)?.nameAr || warehouses.find(w => w.id === id)?.name_ar || '-'
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" fontWeight="bold">
                    <TransferIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    تحويلات المخزون
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleOpenCreate}
                >
                    تحويل جديد
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        select
                        label="الحالة"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        sx={{ minWidth: 150 }}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        <MenuItem value="pending">قيد الانتظار</MenuItem>
                        <MenuItem value="in_transit">في الطريق</MenuItem>
                        <MenuItem value="completed">مكتمل</MenuItem>
                        <MenuItem value="cancelled">ملغى</MenuItem>
                    </TextField>
                </Box>
            </Paper>

            {/* Transfers Table */}
            <TableContainer component={Paper}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>رقم التحويل</TableCell>
                                <TableCell>من المستودع</TableCell>
                                <TableCell>إلى المستودع</TableCell>
                                <TableCell>عدد الأصناف</TableCell>
                                <TableCell>التاريخ</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell align="center">إجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {transfers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        لا يوجد تحويلات
                                    </TableCell>
                                </TableRow>
                            ) : (
                                transfers.map((transfer) => (
                                    <TableRow key={transfer.id} hover>
                                        <TableCell>
                                            <Typography fontWeight="bold">{transfer.transfer_number}</Typography>
                                        </TableCell>
                                        <TableCell>{transfer.fromWarehouse?.name_ar || getWarehouseName(transfer.from_warehouse_id)}</TableCell>
                                        <TableCell>{transfer.toWarehouse?.name_ar || getWarehouseName(transfer.to_warehouse_id)}</TableCell>
                                        <TableCell>{transfer.items?.length || '-'}</TableCell>
                                        <TableCell>{formatDate(transfer.created_at)}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={getStatusInfo(transfer.status).label}
                                                color={getStatusInfo(transfer.status).color}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleViewTransfer(transfer)}
                                                color="primary"
                                            >
                                                <ViewIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>

            {/* Create Transfer Dialog */}
            <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="md" fullWidth>
                <DialogTitle>تحويل مخزون جديد</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2, mb: 3 }}>
                        <TextField
                            select
                            label="من المستودع"
                            value={newTransfer.from_warehouse_id}
                            onChange={(e) => setNewTransfer({ ...newTransfer, from_warehouse_id: e.target.value, items: [] })}
                            required
                        >
                            {warehouses.map(w => (
                                <MenuItem key={w.id} value={w.id}>{w.nameAr || w.name_ar}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            label="إلى المستودع"
                            value={newTransfer.to_warehouse_id}
                            onChange={(e) => setNewTransfer({ ...newTransfer, to_warehouse_id: e.target.value })}
                            required
                        >
                            {warehouses
                                .filter(w => w.id !== newTransfer.from_warehouse_id)
                                .map(w => (
                                    <MenuItem key={w.id} value={w.id}>{w.nameAr || w.name_ar}</MenuItem>
                                ))}
                        </TextField>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Add Items */}
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                        إضافة منتجات
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', mb: 2 }}>
                        <Autocomplete
                            options={products}
                            getOptionLabel={(option) => {
                                const stock = stockLevels[option.id] || 0
                                return `${option.name_ar} (متوفر: ${stock})`
                            }}
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                            value={products.find(p => p.id === newItem.menu_id) || null}
                            onChange={(e, val) => setNewItem({ ...newItem, menu_id: val?.id || '' })}
                            renderInput={(params) => <TextField {...params} label="المنتج" size="small" />}
                            sx={{ minWidth: 300 }}
                            disabled={!newTransfer.from_warehouse_id}
                        />
                        <TextField
                            label="الكمية"
                            type="number"
                            size="small"
                            value={newItem.quantity}
                            onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 0 })}
                            inputProps={{ min: 1, max: stockLevels[newItem.menu_id] || 1 }}
                            sx={{ width: 100 }}
                        />
                        <Tooltip title={
                            !newItem.menu_id ? "اختر منتجاً" :
                                (stockLevels[newItem.menu_id] || 0) <= 0 ? "لا يوجد مخزون كافٍ" :
                                    (stockLevels[newItem.menu_id] || 0) < newItem.quantity ? "الكمية المطلوبة أكبر من المتوفر" :
                                        ""
                        }>
                            <span>
                                <Button
                                    variant="outlined"
                                    onClick={handleAddItem}
                                    disabled={!newItem.menu_id || (stockLevels[newItem.menu_id] || 0) < newItem.quantity || (stockLevels[newItem.menu_id] || 0) <= 0}
                                >
                                    إضافة
                                </Button>
                            </span>
                        </Tooltip>
                    </Box>

                    {/* Items List */}
                    {newTransfer.items.length > 0 && (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>المنتج</TableCell>
                                        <TableCell>الكمية المتوفرة</TableCell>
                                        <TableCell>كمية التحويل</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {newTransfer.items.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{item.productName}</TableCell>
                                            <TableCell>{item.available}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>
                                                <IconButton size="small" onClick={() => handleRemoveItem(idx)} color="error">
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    <TextField
                        label="ملاحظات"
                        fullWidth
                        multiline
                        rows={2}
                        value={newTransfer.notes}
                        onChange={(e) => setNewTransfer({ ...newTransfer, notes: e.target.value })}
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCreate(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={handleCreateTransfer} disabled={newTransfer.items.length === 0}>
                        إنشاء التحويل
                    </Button>
                </DialogActions>
            </Dialog>

            {/* View Transfer Dialog */}
            <Dialog open={openView} onClose={() => setOpenView(false)} maxWidth="md" fullWidth>
                {selectedTransfer && (
                    <>
                        <DialogTitle>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="h6">تحويل رقم: {selectedTransfer.transfer_number}</Typography>
                                <Chip
                                    label={getStatusInfo(selectedTransfer.status).label}
                                    color={getStatusInfo(selectedTransfer.status).color}
                                />
                            </Box>
                        </DialogTitle>
                        <DialogContent>
                            {/* Status Stepper */}
                            {selectedTransfer.status !== 'cancelled' && (
                                <Stepper activeStep={getStatusInfo(selectedTransfer.status).step} sx={{ mb: 3 }}>
                                    <Step><StepLabel>قيد الانتظار</StepLabel></Step>
                                    <Step><StepLabel>في الطريق</StepLabel></Step>
                                    <Step><StepLabel>مكتمل</StepLabel></Step>
                                </Stepper>
                            )}

                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">من المستودع</Typography>
                                    <Typography fontWeight="bold">
                                        {selectedTransfer.fromWarehouse?.name_ar || getWarehouseName(selectedTransfer.from_warehouse_id)}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">إلى المستودع</Typography>
                                    <Typography fontWeight="bold">
                                        {selectedTransfer.toWarehouse?.name_ar || getWarehouseName(selectedTransfer.to_warehouse_id)}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">تاريخ الإنشاء</Typography>
                                    <Typography>{formatDate(selectedTransfer.created_at)}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">تاريخ الإكمال</Typography>
                                    <Typography>{formatDate(selectedTransfer.completed_at)}</Typography>
                                </Box>
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>المنتج</TableCell>
                                            <TableCell>الكمية</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {selectedTransfer.items?.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.Menu?.name_ar || item.menu?.name_ar || '-'}</TableCell>
                                                <TableCell>{item.quantity}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            {selectedTransfer.notes && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="body2" color="text.secondary">ملاحظات</Typography>
                                    <Typography>{selectedTransfer.notes}</Typography>
                                </Box>
                            )}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setOpenView(false)}>إغلاق</Button>
                            {selectedTransfer.status === 'pending' && (
                                <>
                                    <Button
                                        startIcon={<CancelIcon />}
                                        color="error"
                                        onClick={handleCancelTransfer}
                                    >
                                        إلغاء
                                    </Button>
                                    <Button
                                        variant="contained"
                                        startIcon={<ShippingIcon />}
                                        onClick={handleCompleteTransfer}
                                    >
                                        بدء الشحن
                                    </Button>
                                </>
                            )}
                            {selectedTransfer.status === 'in_transit' && (
                                <Button
                                    variant="contained"
                                    startIcon={<CheckIcon />}
                                    onClick={handleCompleteTransfer}
                                    color="success"
                                >
                                    تأكيد الاستلام
                                </Button>
                            )}
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Box>
    )
}
