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
    CheckCircle as ApproveIcon,
    Cancel as CancelIcon,
    Outbox as IssueIcon
} from '@mui/icons-material'
import { stockIssueAPI, warehouseAPI, menuAPI, inventoryAPI } from '../services/api'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'

export default function StockIssues() {
    const [issues, setIssues] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [statusFilter, setStatusFilter] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [warehouses, setWarehouses] = useState([])
    const [products, setProducts] = useState([])
    const [stockLevels, setStockLevels] = useState({})

    // Dialog states
    const [openCreate, setOpenCreate] = useState(false)
    const [openView, setOpenView] = useState(false)
    const [selectedIssue, setSelectedIssue] = useState(null)

    // For Cancel dialog
    const [cancelReason, setCancelReason] = useState('')
    const [openCancel, setOpenCancel] = useState(false)

    // Create form state
    const [newIssue, setNewIssue] = useState({
        warehouse_id: '',
        issue_type: 'kitchen',
        recipient_name: '',
        recipient_department: '',
        notes: '',
        items: []
    })

    // Line item to add
    const [newItem, setNewItem] = useState({
        menu_id: '',
        requested_quantity: 1
    })

    const fetchIssues = useCallback(async () => {
        try {
            setLoading(true)
            const params = {}
            if (statusFilter) params.status = statusFilter
            if (typeFilter) params.issue_type = typeFilter

            const response = await stockIssueAPI.getAll(params)
            setIssues(response.data.data || response.data || [])
            setError(null)
        } catch (err) {
            console.error('Error fetching issues:', err)
            setError('حدث خطأ في جلب أذونات الصرف')
        } finally {
            setLoading(false)
        }
    }, [statusFilter, typeFilter])

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
            console.log('Stock API response for warehouse', warehouseId, ':', stockData)

            stockData.forEach(s => {
                const menuId = s.menuId || s.menu_id || (s.Menu ? s.Menu.id : null)
                let available = 0

                // Use the pre-calculated available quantity from formatting if accessible
                if (s.available !== undefined && s.available !== null) {
                    available = parseFloat(s.available)
                } else {
                    const quantity = parseFloat(s.quantity) || 0
                    const reserved = parseFloat(s.reserved_qty) || parseFloat(s.reserved) || 0
                    available = quantity - reserved
                }

                if (menuId) {
                    stockMap[menuId] = Math.max(0, available)
                }
            })
            console.log('Generated stockMap:', stockMap)
            setStockLevels(stockMap)
        } catch (err) {
            console.error('Error fetching stock levels:', err)
        }
    }

    useEffect(() => {
        fetchIssues()
        fetchRelatedData()
    }, [fetchIssues])

    useEffect(() => {
        if (newIssue.warehouse_id) {
            fetchStockForWarehouse(newIssue.warehouse_id)
        }
    }, [newIssue.warehouse_id])

    const handleOpenCreate = () => {
        // Try to find a default warehouse: if any has is_default = 1 or true, pick it. Else index 0.
        const defaultW = warehouses.find(w => w.is_default === 1 || w.is_default === true) || warehouses[0]

        setNewIssue({
            warehouse_id: defaultW?.id || '',
            issue_type: 'kitchen',
            recipient_name: '',
            recipient_department: '',
            notes: '',
            items: []
        })
        setOpenCreate(true)
    }

    const handleAddItem = () => {
        if (!newItem.menu_id || newItem.requested_quantity <= 0) return

        const product = products.find(p => p.id === newItem.menu_id)
        const available = stockLevels[newItem.menu_id] || 0

        // Allow adding more than available only if allow_negative_stock is true
        if (newItem.requested_quantity > available && !product?.allow_negative_stock) {
            setError(`الكمية المطلوبة (${newItem.requested_quantity}) أكبر من المتوفر (${available}) والصنف لا يسمح بالسحب بالسالب`)
            return
        }

        setNewIssue(prev => ({
            ...prev,
            items: [...prev.items, {
                ...newItem,
                productName: product?.name_ar || '',
                available
            }]
        }))
        setNewItem({ menu_id: '', requested_quantity: 1 })
    }

    const handleRemoveItem = (index) => {
        setNewIssue(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }))
    }

    const handleCreateIssue = async () => {
        try {
            if (!newIssue.warehouse_id || newIssue.items.length === 0) {
                setError('يجب اختيار المستودع وإضافة منتجات')
                return
            }

            await stockIssueAPI.create(newIssue)
            setOpenCreate(false)
            fetchIssues()
        } catch (err) {
            console.error('Error creating issue:', err)
            setError(err.response?.data?.message || 'حدث خطأ في إنشاء إذن الصرف')
        }
    }

    const handleViewIssue = async (issue) => {
        try {
            const response = await stockIssueAPI.getById(issue.id)
            setSelectedIssue(response.data.data || response.data)
            setOpenView(true)
        } catch (err) {
            console.error('Error fetching details:', err)
            setError('حدث خطأ في جلب تفاصيل إذن الصرف')
        }
    }

    const handleApprove = async () => {
        try {
            await stockIssueAPI.approve(selectedIssue.id)
            setSelectedIssue(prev => ({ ...prev, status: 'approved' }))
            fetchIssues()
        } catch (err) {
            console.error('Error approving:', err)
            setError(err.response?.data?.message || 'خطأ في اعتماد الإذن')
        }
    }

    const handleIssueStock = async () => {
        try {
            await stockIssueAPI.issue(selectedIssue.id)
            setSelectedIssue(prev => ({ ...prev, status: 'issued' }))
            fetchIssues()
        } catch (err) {
            console.error('Error issuing stock:', err)
            setError(err.response?.data?.message || 'خطأ في خصم المخزون والصرف')
        }
    }

    const handleCancel = async () => {
        try {
            if (!cancelReason.trim()) {
                setError('برجاء كتابة سبب الإلغاء')
                return
            }
            await stockIssueAPI.cancel(selectedIssue.id, cancelReason)
            setOpenCancel(false)
            setCancelReason('')
            setSelectedIssue(prev => ({ ...prev, status: 'cancelled', cancel_reason: cancelReason }))
            fetchIssues()
        } catch (err) {
            console.error('Error cancelling:', err)
            setError(err.response?.data?.message || 'خطأ في إلغاء الإذن')
        }
    }

    const getStatusInfo = (status) => {
        switch (status) {
            case 'draft': return { label: 'مسودة', color: 'default', step: 0 }
            case 'approved': return { label: 'معتمد (قيد الصرف)', color: 'warning', step: 1 }
            case 'issued': return { label: 'تم الصرف', color: 'success', step: 2 }
            case 'cancelled': return { label: 'ملغى', color: 'error', step: -1 }
            default: return { label: status, color: 'default', step: 0 }
        }
    }

    const getTypeLabel = (type) => {
        switch (type) {
            case 'kitchen': return 'صرف للمطبخ'
            case 'branch_transfer': return 'تحويل لفرع'
            case 'department': return 'صرف إدارة'
            case 'customer': return 'صرف لعميل'
            case 'waste': return 'صرف هدر/تالف'
            case 'other': return 'أخرى'
            default: return type
        }
    }

    const formatDate = (date) => {
        if (!date) return '-'
        return format(new Date(date), 'dd MMM yyyy HH:mm', { locale: arSA })
    }

    const getWarehouseName = (id) => {
        const w = warehouses.find(w => w.id === id)
        if (!w) return '-'
        const bName = w.Branch?.name_ar || w.Branch?.nameAr || ''
        return `${w.nameAr || w.name_ar} ${bName ? `(${bName})` : ''}`
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" fontWeight="bold">
                    <IssueIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    إذن صرف بضاعة
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleOpenCreate}
                >
                    إنشاء إذن صرف
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
                        <MenuItem value="draft">مسودة</MenuItem>
                        <MenuItem value="approved">معتمد</MenuItem>
                        <MenuItem value="issued">مصروف</MenuItem>
                        <MenuItem value="cancelled">ملغى</MenuItem>
                    </TextField>

                    <TextField
                        size="small"
                        select
                        label="سبب الصرف"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        sx={{ minWidth: 150 }}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        <MenuItem value="kitchen">للمطبخ</MenuItem>
                        <MenuItem value="department">للإدارة</MenuItem>
                        <MenuItem value="waste">هدر/إتلاف</MenuItem>
                    </TextField>
                </Box>
            </Paper>

            {/* Issues Table */}
            <TableContainer component={Paper}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>رقم الإذن</TableCell>
                                <TableCell>المستودع</TableCell>
                                <TableCell>نوع الصرف</TableCell>
                                <TableCell>المستلم</TableCell>
                                <TableCell>التاريخ</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell align="center">إجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {issues.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        لا توجد أذونات صرف
                                    </TableCell>
                                </TableRow>
                            ) : (
                                issues.map((issue) => (
                                    <TableRow key={issue.id} hover>
                                        <TableCell>
                                            <Typography fontWeight="bold">{issue.issue_number}</Typography>
                                        </TableCell>
                                        <TableCell>{issue.Warehouse?.name_ar || getWarehouseName(issue.warehouse_id)}</TableCell>
                                        <TableCell>{getTypeLabel(issue.issue_type)}</TableCell>
                                        <TableCell>{issue.recipient_name || '-'}</TableCell>
                                        <TableCell>{formatDate(issue.created_at)}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={getStatusInfo(issue.status).label}
                                                color={getStatusInfo(issue.status).color}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleViewIssue(issue)}
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

            {/* Create Issue Dialog */}
            <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="md" fullWidth>
                <DialogTitle>إصدار إذن صرف بضاعة</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2, mb: 3 }}>
                        <TextField
                            select
                            label="المستودع المصدر"
                            value={newIssue.warehouse_id}
                            onChange={(e) => setNewIssue({ ...newIssue, warehouse_id: e.target.value, items: [] })}
                            required
                        >
                            {warehouses.map(w => {
                                const bName = w.Branch?.name_ar || w.Branch?.nameAr || ''
                                return (
                                    <MenuItem key={w.id} value={w.id}>
                                        {w.nameAr || w.name_ar} {bName ? `(${bName})` : ''}
                                    </MenuItem>
                                )
                            })}
                        </TextField>

                        <TextField
                            select
                            label="نوع الصرف / السبب"
                            value={newIssue.issue_type}
                            onChange={(e) => setNewIssue({ ...newIssue, issue_type: e.target.value })}
                            required
                        >
                            <MenuItem value="kitchen">إنتاج مطبخ</MenuItem>
                            <MenuItem value="department">إدارة/قسم</MenuItem>
                            <MenuItem value="waste">هدر/تالف</MenuItem>
                            <MenuItem value="branch_transfer">تحويل لفرع آخر</MenuItem>
                            <MenuItem value="customer">لعميل</MenuItem>
                            <MenuItem value="other">أخرى</MenuItem>
                        </TextField>

                        <TextField
                            label="الجهة / الشخص المستلم"
                            value={newIssue.recipient_name}
                            onChange={(e) => setNewIssue({ ...newIssue, recipient_name: e.target.value })}
                        />

                        <TextField
                            label="القسم"
                            value={newIssue.recipient_department}
                            onChange={(e) => setNewIssue({ ...newIssue, recipient_department: e.target.value })}
                        />
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Add Items */}
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                        الأصناف المطلوبة
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
                            disabled={!newIssue.warehouse_id}
                        />
                        <TextField
                            label="الكمية المطلوبة"
                            type="number"
                            size="small"
                            value={newItem.requested_quantity}
                            onChange={(e) => setNewItem({ ...newItem, requested_quantity: parseFloat(e.target.value) || 0 })}
                            inputProps={{ min: 0.01 }}
                            sx={{ width: 130 }}
                        />
                        <Tooltip title={!newItem.menu_id ? "اختر منتجاً" : ""}>
                            <span>
                                <Button
                                    variant="outlined"
                                    onClick={handleAddItem}
                                    disabled={!newItem.menu_id || newItem.requested_quantity <= 0}
                                >
                                    إضافة
                                </Button>
                            </span>
                        </Tooltip>
                    </Box>

                    {/* Items List */}
                    {newIssue.items.length > 0 && (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>المنتج</TableCell>
                                        <TableCell>الكمية المتوفرة</TableCell>
                                        <TableCell>الكمية المطلوبة</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {newIssue.items.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{item.productName}</TableCell>
                                            <TableCell>{item.available}</TableCell>
                                            <TableCell>{item.requested_quantity}</TableCell>
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
                        value={newIssue.notes}
                        onChange={(e) => setNewIssue({ ...newIssue, notes: e.target.value })}
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCreate(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={handleCreateIssue} disabled={newIssue.items.length === 0}>
                        إنشاء
                    </Button>
                </DialogActions>
            </Dialog>

            {/* View Issue Dialog */}
            <Dialog open={openView} onClose={() => setOpenView(false)} maxWidth="md" fullWidth>
                {selectedIssue && (
                    <>
                        <DialogTitle>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="h6">إذن الصرف: {selectedIssue.issue_number}</Typography>
                                <Chip
                                    label={getStatusInfo(selectedIssue.status).label}
                                    color={getStatusInfo(selectedIssue.status).color}
                                />
                            </Box>
                        </DialogTitle>
                        <DialogContent>
                            {/* Status Stepper */}
                            {selectedIssue.status !== 'cancelled' && (
                                <Stepper activeStep={getStatusInfo(selectedIssue.status).step} sx={{ mb: 3 }}>
                                    <Step><StepLabel>مسودة: قيد المراجعة</StepLabel></Step>
                                    <Step><StepLabel>معتمد: في انتظار الصرف</StepLabel></Step>
                                    <Step><StepLabel>تم التنفيذ (خصم من عهدة المخزن)</StepLabel></Step>
                                </Stepper>
                            )}

                            {selectedIssue.status === 'cancelled' && (
                                <Alert severity="error" sx={{ mb: 3 }}>
                                    سبب الإلغاء: {selectedIssue.cancel_reason} (بواسطة {selectedIssue.cancelledBy?.name_ar || 'النظام'})
                                </Alert>
                            )}

                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">المستودع المصدر</Typography>
                                    <Typography fontWeight="bold">
                                        {selectedIssue.Warehouse?.name_ar || getWarehouseName(selectedIssue.warehouse_id)}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">نوع الصرف</Typography>
                                    <Typography fontWeight="bold">
                                        {getTypeLabel(selectedIssue.issue_type)}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">الجهة المستلمة</Typography>
                                    <Typography>{selectedIssue.recipient_name || '-'} / {selectedIssue.recipient_department || '-'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">تاريخ الإصدار</Typography>
                                    <Typography>{formatDate(selectedIssue.created_at)}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">بواسطة (طبّاخ / مستلم)</Typography>
                                    <Typography>{selectedIssue.createdBy?.name_ar || 'غير معروف'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">أمين المستودع (نفّذ الصرف)</Typography>
                                    <Typography>{selectedIssue.issuedBy?.name_ar || 'لم يتم الصرف بعد'}</Typography>
                                </Box>
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>المنتج / الصنف</TableCell>
                                            <TableCell>الكمية المطلوبة</TableCell>
                                            <TableCell>الكمية المصروفة الفعلية</TableCell>
                                            <TableCell>إجمالي التكلفة (مخزنية)</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {selectedIssue.items?.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.Menu?.name_ar || '-'}</TableCell>
                                                <TableCell>{item.requested_quantity} {item.unit}</TableCell>
                                                <TableCell>{item.issued_quantity} {item.unit}</TableCell>
                                                <TableCell>{item.total_cost || 0} ج.م</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            {selectedIssue.notes && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="body2" color="text.secondary">ملاحظات</Typography>
                                    <Typography>{selectedIssue.notes}</Typography>
                                </Box>
                            )}
                        </DialogContent>
                        <DialogActions sx={{ justifyContent: 'space-between' }}>
                            <Box>
                                {['draft', 'approved'].includes(selectedIssue.status) && (
                                    <Button
                                        startIcon={<CancelIcon />}
                                        color="error"
                                        onClick={() => setOpenCancel(true)}
                                    >
                                        إلغاء الإذن
                                    </Button>
                                )}
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button onClick={() => setOpenView(false)}>إغلاق</Button>

                                {selectedIssue.status === 'draft' && (
                                    <Button
                                        variant="contained"
                                        startIcon={<ApproveIcon />}
                                        onClick={handleApprove}
                                        color="primary"
                                    >
                                        اعتماد (مسؤول/مدير)
                                    </Button>
                                )}

                                {selectedIssue.status === 'approved' && (
                                    <Button
                                        variant="contained"
                                        startIcon={<IssueIcon />}
                                        onClick={handleIssueStock}
                                        color="success"
                                    >
                                        تنفيذ الصرف (خصم من المستودع)
                                    </Button>
                                )}
                            </Box>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            {/* Cancel Dialog */}
            <Dialog open={openCancel} onClose={() => setOpenCancel(false)} maxWidth="xs" fullWidth>
                <DialogTitle>إلغاء إذن الصرف</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        label="سبب الإلغاء"
                        multiline
                        rows={3}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        required
                        autoFocus
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCancel(false)}>تراجع</Button>
                    <Button color="error" variant="contained" onClick={handleCancel} disabled={!cancelReason.trim()}>
                        تأكيد الإلغاء
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
