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
    Snackbar
} from '@mui/material'
import {
    Add as AddIcon,
    Visibility as ViewIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    ShoppingCart as CartIcon,
    Check as CheckIcon,
    Cancel as CancelIcon,
    Receipt as ReceiptIcon,
    OpenInNew as OpenInNewIcon
} from '@mui/icons-material'
import { purchaseOrderAPI, supplierAPI, warehouseAPI, menuAPI, inventoryAPI, categoryAPI, settingsAPI } from '../services/api'
import EntityAttachmentsPanel from '../components/EntityAttachmentsPanel'

import { useThemeConfig } from '../contexts/ThemeContext'
import { useNavigate } from 'react-router-dom'

const ADD_NEW_SUPPLIER = { id: '__ADD_NEW__', name_ar: '+ إضافة مورد جديد', _isAction: true }
const ADD_NEW_PRODUCT = { id: '__ADD_NEW__', name_ar: '+ إضافة منتج جديد', _isAction: true }
const CUSTOM_UOM_VALUE = '__custom__'
const ADD_UOM_OPTION_SX = {
    borderTop: '1px dashed',
    borderColor: 'secondary.light',
    bgcolor: 'secondary.50',
    color: 'secondary.dark',
    fontWeight: 700,
    '&:hover': { bgcolor: 'secondary.100' },
    '&.Mui-selected': { bgcolor: 'secondary.100' },
    '&.Mui-selected:hover': { bgcolor: 'secondary.200' }
}
const QUICK_UOM_OPTIONS = ['piece', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'portion']
const QUICK_UOM_LABELS = {
    piece: 'قطعة',
    kg: 'كيلو',
    g: 'جرام',
    l: 'لتر',
    ml: 'مل',
    box: 'علبة',
    pack: 'باكيت',
    portion: 'حصة'
}
const QUICK_UOM_ALIASES = {
    liter: 'l',
    litre: 'l',
    liters: 'l',
    litres: 'l',
    kilogram: 'kg',
    kilograms: 'kg',
    gram: 'g',
    grams: 'g'
}

const normalizeUomInput = (value, fallback = 'piece') => {
    const raw = String(value || '').trim()
    if (!raw) return fallback
    const normalized = QUICK_UOM_ALIASES[raw.toLowerCase()] || raw.toLowerCase()
    if (QUICK_UOM_OPTIONS.includes(normalized)) return normalized
    return raw
}

export default function PurchaseOrders() {
    const { formatCurrency } = useThemeConfig()
    const navigate = useNavigate()
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [searchFilter, setSearchFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [supplierFilter, setSupplierFilter] = useState('')
    const [warehouseFilter, setWarehouseFilter] = useState('')
    const [fromDateFilter, setFromDateFilter] = useState('')
    const [toDateFilter, setToDateFilter] = useState('')
    const [suppliers, setSuppliers] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [products, setProducts] = useState([])
    const [categories, setCategories] = useState([])
    const [defaultTaxRate, setDefaultTaxRate] = useState(15)
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

    // Dialog states
    const [openCreate, setOpenCreate] = useState(false)
    const [openView, setOpenView] = useState(false)
    const [selectedPO, setSelectedPO] = useState(null)
    const [confirming, setConfirming] = useState(false)
    const [editingPOId, setEditingPOId] = useState(null)

    // Quick Supplier Creation
    const [quickSupplierOpen, setQuickSupplierOpen] = useState(false)
    const [quickSupplier, setQuickSupplier] = useState({ name_ar: '', phone: '', email: '' })
    const [creatingSup, setCreatingSup] = useState(false)
    const [supErrors, setSupErrors] = useState({})

    // Quick Product Creation
    const [quickProductOpen, setQuickProductOpen] = useState(false)
    const [quickProduct, setQuickProduct] = useState({
        name_ar: '', sku: '', cost_price: '', selling_price: '',
        unit_of_measure: 'piece', category_id: '', min_stock: '0',
        has_ingredients: false
    })
    const [quickProductCustomUom, setQuickProductCustomUom] = useState('')
    const [creatingProd, setCreatingProd] = useState(false)
    const [prodErrors, setProdErrors] = useState({})

    // Create form state
    const [newPO, setNewPO] = useState({
        supplier_id: '',
        warehouse_id: '',
        expected_date: '',
        notes: '',
        items: []
    })

    // Line item to add
    const [newItem, setNewItem] = useState({
        menu_id: '',
        quantity_ordered: 1,
        unit_cost: 0,
        tax_rate: 15
    })

    const fetchOrders = useCallback(async () => {
        try {
            setLoading(true)
            const params = {}
            if (searchFilter.trim()) params.q = searchFilter.trim()
            if (statusFilter) params.status = statusFilter
            if (supplierFilter) params.supplier_id = supplierFilter
            if (warehouseFilter) params.warehouse_id = warehouseFilter
            if (fromDateFilter) params.from_date = fromDateFilter
            if (toDateFilter) params.to_date = toDateFilter

            const response = await purchaseOrderAPI.getAll(params)
            setOrders(response.data.data || [])
            setError(null)
        } catch (err) {
            console.error('Error fetching orders:', err)
            setError('فشل تحميل أوامر الشراء')
        } finally {
            setLoading(false)
        }
    }, [searchFilter, statusFilter, supplierFilter, warehouseFilter, fromDateFilter, toDateFilter])

    const fetchRelatedData = async () => {
        try {
            const [suppliersRes, warehousesRes, productsRes, categoriesRes, settingsRes] = await Promise.all([
                supplierAPI.getAll({ status: 'active' }),
                warehouseAPI.getAll(),
                menuAPI.getAll(),
                categoryAPI.getAll().catch(() => ({ data: { data: [] } })),
                settingsAPI.getPublic().catch(() => ({ data: { data: {} } }))
            ])
            setSuppliers(suppliersRes.data.data || [])
            setWarehouses(warehousesRes.data.data || warehousesRes.data || [])
            setProducts(productsRes.data.data || productsRes.data || [])
            setCategories(categoriesRes.data.data || categoriesRes.data || [])
            const configuredTax = Number(settingsRes?.data?.data?.taxRate)
            const resolvedTax = Number.isFinite(configuredTax) && configuredTax >= 0 ? configuredTax : 15
            setDefaultTaxRate(resolvedTax)
            setNewItem(prev => (prev.menu_id || prev.unit_cost > 0 || prev.quantity_ordered !== 1)
                ? prev
                : { ...prev, tax_rate: resolvedTax })
        } catch (err) {
            console.error('Error fetching related data:', err)
        }
    }

    useEffect(() => {
        fetchOrders()
        fetchRelatedData()
    }, [fetchOrders])

    const handleOpenCreate = () => {
        const d = new Date()
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

        setEditingPOId(null)
        setNewPO({
            supplier_id: '',
            warehouse_id: warehouses[0]?.id || '',
            expected_date: todayStr,
            notes: '',
            items: []
        })
        setNewItem({ menu_id: '', quantity_ordered: 1, unit_cost: 0, tax_rate: defaultTaxRate })
        setOpenCreate(true)
    }

    const handleCloseCreate = () => {
        setOpenCreate(false)
        setEditingPOId(null)
    }

    const mapPOItemToFormItem = (item) => ({
        menu_id: item.menu_id,
        quantity_ordered: parseFloat(item.quantity_ordered || 0),
        unit_cost: parseFloat(item.unit_cost || 0),
        tax_rate: parseFloat(item.tax_rate || 0),
        discount_rate: parseFloat(item.discount_rate || 0),
        productName: item.Menu?.name_ar || item.productName || ''
    })

    const handleOpenEdit = async (po) => {
        try {
            const response = await purchaseOrderAPI.getById(po.id)
            const fullPO = response.data?.data
            if (!fullPO) return

            if (fullPO.status !== 'draft') {
                setError('يمكن تعديل أوامر الشراء المسودة فقط')
                return
            }

            setEditingPOId(fullPO.id)
            setNewPO({
                supplier_id: fullPO.supplier_id || '',
                warehouse_id: fullPO.warehouse_id || '',
                expected_date: fullPO.expected_date ? String(fullPO.expected_date).slice(0, 10) : '',
                notes: fullPO.notes || '',
                items: (fullPO.items || []).map(mapPOItemToFormItem)
            })
            setNewItem({ menu_id: '', quantity_ordered: 1, unit_cost: 0, tax_rate: defaultTaxRate })
            setOpenCreate(true)
        } catch (err) {
            console.error('Error loading PO for edit:', err)
            setError(err.response?.data?.message || 'فشل تحميل أمر الشراء للتعديل')
        }
    }

    const handleAddItem = () => {
        if (!newItem.menu_id || newItem.quantity_ordered <= 0) return

        const product = products.find(p => p.id === newItem.menu_id)
        setNewPO(prev => ({
            ...prev,
            items: [...prev.items, {
                ...newItem,
                productName: product?.name_ar || ''
            }]
        }))
        setNewItem({ menu_id: '', quantity_ordered: 1, unit_cost: 0, tax_rate: defaultTaxRate })
    }

    const handleRemoveItem = (index) => {
        setNewPO(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }))
    }

    const handleCreatePO = async () => {
        try {
            if (!newPO.supplier_id || !newPO.warehouse_id || newPO.items.length === 0) {
                setError('يرجى اختيار المورد والمستودع وإضافة صنف واحد على الأقل')
                return
            }

            if (editingPOId) {
                await purchaseOrderAPI.update(editingPOId, newPO)
            } else {
                await purchaseOrderAPI.create(newPO)
            }

            handleCloseCreate()
            fetchOrders()
            setSnackbar({
                open: true,
                message: editingPOId ? 'تم تحديث أمر الشراء بنجاح' : 'تم إنشاء أمر الشراء بنجاح',
                severity: 'success'
            })
        } catch (err) {
            console.error('Error saving PO:', err)
            setError(err.response?.data?.message || (editingPOId ? 'فشل تحديث أمر الشراء' : 'فشل إنشاء أمر الشراء'))
        }
    }

    const handleViewPO = async (po) => {
        try {
            const response = await purchaseOrderAPI.getById(po.id)
            setSelectedPO(response.data.data)
            setOpenView(true)
        } catch (err) {
            console.error('Error fetching PO details:', err)
            setError('فشل تحميل تفاصيل أمر الشراء')
        }
    }

    const handleConfirmPO = async () => {
        setConfirming(true)
        try {
            const res = await purchaseOrderAPI.confirm(selectedPO.id)
            setOpenView(false)
            fetchOrders()
            const receiptNumber = res.data?.receipt?.receipt_number || ''
            setSnackbar({
                open: true,
                message: `تم تأكيد أمر الشراء وإنشاء فاتورة مورد ${receiptNumber}`,
                severity: 'success'
            })
        } catch (err) {
            console.error('Error confirming PO:', err)
            setError(err.response?.data?.message || 'فشل تأكيد أمر الشراء')
        } finally {
            setConfirming(false)
        }
    }

    const handleCancelPO = async () => {
        try {
            await purchaseOrderAPI.cancel(selectedPO.id)
            setOpenView(false)
            fetchOrders()
        } catch (err) {
            console.error('Error cancelling PO:', err)
            setError(err.response?.data?.message || 'فشل إلغاء أمر الشراء')
        }
    }

    const getStatusInfo = (status) => {
        switch (status) {
            case 'draft': return { label: 'مسودة', color: 'default', step: 0 }
            case 'confirmed': return { label: 'مؤكد', color: 'info', step: 1 }
            case 'partial': return { label: 'استلام جزئي', color: 'warning', step: 2 }
            case 'received': return { label: 'مستلم', color: 'success', step: 3 }
            case 'cancelled': return { label: 'ملغي', color: 'error', step: -1 }
            default: return { label: status, color: 'default', step: 0 }
        }
    }

    const formatDate = (date) => {
        if (!date) return '-'
        return new Date(date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
    }

    const calculateTotal = (items) => {
        return items.reduce((sum, item) => {
            const subtotal = item.quantity_ordered * item.unit_cost
            const tax = subtotal * (item.tax_rate || 0) / 100
            return sum + subtotal + tax
        }, 0)
    }

    // ==================== QUICK SUPPLIER HANDLERS ====================
    const handleOpenQuickSupplier = () => {
        setQuickSupplier({ name_ar: '', phone: '', email: '' })
        setSupErrors({})
        setQuickSupplierOpen(true)
    }

    const handleCreateQuickSupplier = async () => {
        const errs = {}
        if (!quickSupplier.name_ar.trim()) errs.name_ar = 'اسم المورد مطلوب'
        if (Object.keys(errs).length) { setSupErrors(errs); return }

        setCreatingSup(true)
        try {
            const response = await supplierAPI.create({
                name_ar: quickSupplier.name_ar.trim(),
                phone: quickSupplier.phone.trim() || undefined,
                email: quickSupplier.email.trim() || undefined,
                status: 'active',
                payment_terms: 30
            })

            const newSup = response.data.data
            setSuppliers(prev => [...prev, newSup])
            setNewPO(prev => ({ ...prev, supplier_id: newSup.id }))

            setQuickSupplierOpen(false)
            setSnackbar({ open: true, message: `تمت إضافة المورد "${newSup.name_ar}" بنجاح`, severity: 'success' })
        } catch (err) {
            console.error('Failed to create supplier:', err)
            setSupErrors({ api: err.response?.data?.message || 'فشل إضافة المورد' })
        } finally {
            setCreatingSup(false)
        }
    }

    // ==================== QUICK PRODUCT HANDLERS ====================
    const handleOpenQuickProduct = () => {
        setQuickProduct({
            name_ar: '', sku: '', cost_price: '', selling_price: '',
            unit_of_measure: 'piece', category_id: '', min_stock: '0',
            has_ingredients: false
        })
        setQuickProductCustomUom('')
        setProdErrors({})
        setQuickProductOpen(true)
    }

    const handleCreateQuickProduct = async () => {
        const errs = {}
        if (!quickProduct.name_ar.trim()) errs.name_ar = 'اسم المنتج مطلوب'
        if (!quickProduct.cost_price || parseFloat(quickProduct.cost_price) <= 0) errs.cost_price = 'سعر الشراء مطلوب'
        if (!quickProduct.selling_price || parseFloat(quickProduct.selling_price) <= 0) errs.selling_price = 'سعر البيع مطلوب'
        const resolvedUom = quickProduct.unit_of_measure === CUSTOM_UOM_VALUE
            ? normalizeUomInput(quickProductCustomUom, '')
            : normalizeUomInput(quickProduct.unit_of_measure, 'piece')
        if (!resolvedUom) errs.unit_of_measure = 'وحدة القياس مطلوبة'
        if (resolvedUom && String(resolvedUom).length > 20) errs.unit_of_measure = 'وحدة القياس طويلة جدًا'
        if (Object.keys(errs).length) { setProdErrors(errs); return }

        setCreatingProd(true)
        try {
            const response = await inventoryAPI.createQuickProduct({
                name_ar: quickProduct.name_ar.trim(),
                sku: quickProduct.sku.trim() || undefined,
                item_type: 'raw_material',
                unit_of_measure: resolvedUom,
                min_stock: parseFloat(quickProduct.min_stock) || 0,
                cost_price: parseFloat(quickProduct.cost_price),
                selling_price: parseFloat(quickProduct.selling_price),
                category_id: quickProduct.category_id || undefined
            })

            const newProduct = response.data.data
            setProducts(prev => [...prev, newProduct])

            // Auto select the new product
            setNewItem({
                ...newItem,
                menu_id: newProduct.id,
                unit_cost: parseFloat(quickProduct.cost_price)
            })

            setQuickProductOpen(false)
            setSnackbar({ open: true, message: `تمت إضافة المنتج "${newProduct.name_ar}" بنجاح`, severity: 'success' })
        } catch (err) {
            console.error('Failed to create product:', err)
            setProdErrors({ api: err.response?.data?.message || 'فشل إضافة المنتج' })
        } finally {
            setCreatingProd(false)
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" fontWeight="bold">
                    <CartIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    أوامر الشراء
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleOpenCreate}
                >
                    أمر شراء جديد
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            {/* Workflow Info */}
            <Alert severity="info" sx={{ mb: 2 }} icon={false}>
                <strong>سير العمل:</strong> أمر شراء (مسودة) ← تأكيد ← إنشاء فاتورة مورد تلقائيًا ← استلام البضاعة من صفحة{' '}
                <Typography
                    component="span"
                    sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}
                    onClick={() => navigate('/purchases')}
                >
                    فواتير الموردين
                </Typography>
            </Alert>
            {/* Filters */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        label="بحث (رقم الأمر/ملاحظات)"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        sx={{ minWidth: 260 }}
                    />
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
                        <MenuItem value="confirmed">مؤكد</MenuItem>
                        <MenuItem value="partial">استلام جزئي</MenuItem>
                        <MenuItem value="received">مستلم</MenuItem>
                        <MenuItem value="cancelled">ملغي</MenuItem>
                    </TextField>
                    <TextField
                        size="small"
                        select
                        label="المورد"
                        value={supplierFilter}
                        onChange={(e) => setSupplierFilter(e.target.value)}
                        sx={{ minWidth: 180 }}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        {suppliers.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                                {s.name_ar}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        size="small"
                        select
                        label="المستودع"
                        value={warehouseFilter}
                        onChange={(e) => setWarehouseFilter(e.target.value)}
                        sx={{ minWidth: 180 }}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        {warehouses.map((w) => (
                            <MenuItem key={w.id} value={w.id}>
                                {w.name_ar || w.nameAr}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        size="small"
                        type="date"
                        label="من تاريخ"
                        value={fromDateFilter}
                        onChange={(e) => setFromDateFilter(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        size="small"
                        type="date"
                        label="إلى تاريخ"
                        value={toDateFilter}
                        onChange={(e) => setToDateFilter(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                    />
                    <Button
                        variant="outlined"
                        onClick={() => {
                            setSearchFilter('')
                            setStatusFilter('')
                            setSupplierFilter('')
                            setWarehouseFilter('')
                            setFromDateFilter('')
                            setToDateFilter('')
                        }}
                    >
                        مسح الفلاتر
                    </Button>
                </Box>
            </Paper>

            {/* Orders Table */}
            <TableContainer component={Paper}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>رقم الأمر</TableCell>
                                <TableCell>المورد</TableCell>
                                <TableCell>المستودع</TableCell>
                                <TableCell>التاريخ</TableCell>
                                <TableCell>الإجمالي المستحق</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell align="center">إجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {orders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        لا توجد أوامر شراء
                                    </TableCell>
                                </TableRow>
                            ) : (
                                orders.map((po) => (
                                    <TableRow key={po.id} hover>
                                        <TableCell>
                                            <Typography fontWeight="bold">{po.po_number}</Typography>
                                        </TableCell>
                                        <TableCell>{po.Supplier?.name_ar || '-'}</TableCell>
                                        <TableCell>{po.Warehouse?.name_ar || '-'}</TableCell>
                                        <TableCell>{formatDate(po.order_date)}</TableCell>
                                        <TableCell>{formatCurrency(po.total_amount)}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={getStatusInfo(po.status).label}
                                                color={getStatusInfo(po.status).color}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleViewPO(po)}
                                                color="primary"
                                            >
                                                <ViewIcon fontSize="small" />
                                            </IconButton>
                                            {po.status === 'draft' && (
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleOpenEdit(po)}
                                                    color="secondary"
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>

            {/* Create PO Dialog */}
            <Dialog open={openCreate} onClose={handleCloseCreate} maxWidth="lg" fullWidth>
                <DialogTitle>{editingPOId ? 'تعديل أمر الشراء' : 'أمر شراء جديد'}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mt: 2, mb: 3 }}>
                        <Autocomplete
                            options={[...suppliers, ADD_NEW_SUPPLIER]}
                            getOptionLabel={(option) => option.name_ar || ''}
                            value={suppliers.find(s => s.id === newPO.supplier_id) || null}
                            onChange={(e, val) => {
                                if (val?._isAction) {
                                    handleOpenQuickSupplier()
                                } else {
                                    setNewPO({ ...newPO, supplier_id: val?.id || '' })
                                }
                            }}
                            renderInput={(params) => <TextField {...params} label="المورد *" />}
                        />
                        <TextField
                            select
                            label="المستودع"
                            value={newPO.warehouse_id}
                            onChange={(e) => setNewPO({ ...newPO, warehouse_id: e.target.value })}
                            required
                        >
                            {warehouses.map(w => (
                                <MenuItem key={w.id} value={w.id}>{w.nameAr || w.name_ar}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            label="تاريخ التسليم المتوقع"
                            type="date"
                            value={newPO.expected_date}
                            onChange={(e) => setNewPO({ ...newPO, expected_date: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Add Items */}
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                        إضافة منتجات
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', mb: 2 }}>
                        <Autocomplete
                            options={[...products, ADD_NEW_PRODUCT]}
                            getOptionLabel={(option) => option.name_ar || ''}
                            value={products.find(p => p.id === newItem.menu_id) || null}
                            onChange={(e, val) => {
                                if (val?._isAction) {
                                    handleOpenQuickProduct()
                                } else {
                                    setNewItem({
                                        ...newItem,
                                        menu_id: val?.id || '',
                                        unit_cost: val?.cost_price || val?.price || 0
                                    })
                                }
                            }}
                            renderInput={(params) => <TextField {...params} label="المنتج" size="small" />}
                            sx={{ minWidth: 250 }}
                        />
                        <TextField
                            label="الكمية"
                            type="number"
                            size="small"
                            value={newItem.quantity_ordered}
                            onChange={(e) => setNewItem({ ...newItem, quantity_ordered: parseFloat(e.target.value) || 0 })}
                            inputProps={{ min: 1 }}
                            sx={{ width: 100 }}
                        />
                        <TextField
                            label="سعر الوحدة"
                            type="number"
                            size="small"
                            value={newItem.unit_cost}
                            onChange={(e) => setNewItem({ ...newItem, unit_cost: parseFloat(e.target.value) || 0 })}
                            inputProps={{ min: 0 }}
                            sx={{ width: 120 }}
                        />
                        <TextField
                            label="ضريبة %"
                            type="number"
                            size="small"
                            value={newItem.tax_rate}
                            onChange={(e) => setNewItem({ ...newItem, tax_rate: parseFloat(e.target.value) || 0 })}
                            sx={{ width: 80 }}
                        />
                        <Button variant="outlined" onClick={handleAddItem}>
                            إضافة
                        </Button>
                    </Box>

                    {/* Items List */}
                    {newPO.items.length > 0 && (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>المنتج</TableCell>
                                        <TableCell>الكمية</TableCell>
                                        <TableCell>سعر الوحدة</TableCell>
                                        <TableCell>الضريبة</TableCell>
                                        <TableCell>الإجمالي المستحق</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {newPO.items.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{item.productName}</TableCell>
                                            <TableCell>{item.quantity_ordered}</TableCell>
                                            <TableCell>{formatCurrency(item.unit_cost)}</TableCell>
                                            <TableCell>{item.tax_rate}%</TableCell>
                                            <TableCell>
                                                {formatCurrency(
                                                    item.quantity_ordered * item.unit_cost * (1 + item.tax_rate / 100)
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <IconButton size="small" onClick={() => handleRemoveItem(idx)} color="error">
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow>
                                        <TableCell colSpan={4} align="left">
                                            <Typography fontWeight="bold">الإجمالي الكلي</Typography>
                                        </TableCell>
                                        <TableCell colSpan={2}>
                                            <Typography fontWeight="bold" color="primary">
                                                {formatCurrency(calculateTotal(newPO.items))}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    <TextField
                        label="ملاحظات"
                        fullWidth
                        multiline
                        rows={2}
                        value={newPO.notes}
                        onChange={(e) => setNewPO({ ...newPO, notes: e.target.value })}
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseCreate}>إلغاء</Button>
                    <Button variant="contained" onClick={handleCreatePO} disabled={newPO.items.length === 0}>
                        {editingPOId ? 'حفظ التعديلات' : 'إنشاء أمر الشراء'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* View PO Dialog */}
            <Dialog open={openView} onClose={() => setOpenView(false)} maxWidth="md" fullWidth>
                {selectedPO && (
                    <>
                        <DialogTitle>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="h6">أمر الشراء: {selectedPO.po_number}</Typography>
                                <Chip
                                    label={getStatusInfo(selectedPO.status).label}
                                    color={getStatusInfo(selectedPO.status).color}
                                />
                            </Box>
                        </DialogTitle>
                        <DialogContent>
                            {/* Status Stepper */}
                            {selectedPO.status !== 'cancelled' && (
                                <Stepper activeStep={getStatusInfo(selectedPO.status).step} sx={{ mb: 3 }}>
                                    <Step><StepLabel>مسودة</StepLabel></Step>
                                    <Step><StepLabel>مؤكد</StepLabel></Step>
                                    <Step><StepLabel>استلام جزئي</StepLabel></Step>
                                    <Step><StepLabel>مستلم</StepLabel></Step>
                                </Stepper>
                            )}

                            {/* Info about linked invoice */}
                            {['confirmed', 'partial'].includes(selectedPO.status) && (
                                <Alert
                                    severity="info"
                                    sx={{ mb: 2 }}
                                    icon={<ReceiptIcon />}
                                    action={
                                        <Button
                                            color="inherit"
                                            size="small"
                                            endIcon={<OpenInNewIcon />}
                                            onClick={() => {
                                                setOpenView(false)
                                                navigate('/purchases')
                                            }}
                                        >
                                            عرض فواتير الموردين
                                        </Button>
                                    }
                                >
                                    تم تأكيد أمر الشراء وتم إنشاء فاتورة المورد تلقائيًا. يمكن متابعة الاستلام من صفحة <strong>فواتير الموردين</strong>
                                </Alert>
                            )}

                            {selectedPO.status === 'received' && (
                                <Alert severity="success" sx={{ mb: 2 }} icon={<CheckIcon />}>
                                    تم استلام هذا الأمر بالكامل
                                </Alert>
                            )}

                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">المورد</Typography>
                                    <Typography fontWeight="bold">{selectedPO.Supplier?.name_ar}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">المستودع</Typography>
                                    <Typography fontWeight="bold">{selectedPO.Warehouse?.name_ar}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">تاريخ الطلب</Typography>
                                    <Typography>{formatDate(selectedPO.order_date)}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">تاريخ التسليم المتوقع</Typography>
                                    <Typography>{formatDate(selectedPO.expected_date)}</Typography>
                                </Box>
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>المنتج</TableCell>
                                            <TableCell>الكمية المطلوبة</TableCell>
                                            <TableCell>الكمية المستلمة</TableCell>
                                            <TableCell>سعر الوحدة</TableCell>
                                            <TableCell>الإجمالي المستحق</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {selectedPO.items?.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.Menu?.name_ar}</TableCell>
                                                <TableCell>{item.quantity_ordered}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={item.quantity_received || 0}
                                                        color={parseFloat(item.quantity_received || 0) >= parseFloat(item.quantity_ordered) ? 'success' : parseFloat(item.quantity_received || 0) > 0 ? 'warning' : 'default'}
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell>{formatCurrency(item.unit_cost)}</TableCell>
                                                <TableCell>{formatCurrency(item.line_total)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow>
                                            <TableCell colSpan={4} align="left">
                                                <Typography fontWeight="bold">الإجمالي الكلي</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography fontWeight="bold" color="primary">
                                                    {formatCurrency(selectedPO.total_amount)}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <EntityAttachmentsPanel
                                entityType="purchase_order"
                                entityId={selectedPO.id}
                                title="مرفقات أمر الشراء"
                                readOnly={selectedPO.status === 'cancelled'}
                            />
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setOpenView(false)}>إغلاق</Button>
                            {selectedPO.status === 'draft' && (
                                <>
                                    <Button
                                        startIcon={<EditIcon />}
                                        color="secondary"
                                        onClick={() => {
                                            setOpenView(false)
                                            handleOpenEdit(selectedPO)
                                        }}
                                    >
                                        تعديل
                                    </Button>
                                    <Button
                                        startIcon={<CancelIcon />}
                                        color="error"
                                        onClick={handleCancelPO}
                                    >
                                        إلغاء الأمر
                                    </Button>
                                    <Button
                                        variant="contained"
                                        startIcon={confirming ? <CircularProgress size={18} /> : <CheckIcon />}
                                        onClick={handleConfirmPO}
                                        disabled={confirming}
                                    >
                                        {confirming ? 'جاري التأكيد...' : 'تأكيد أمر الشراء'}
                                    </Button>
                                </>
                            )}
                            {['confirmed', 'partial'].includes(selectedPO.status) && (
                                <Button
                                    variant="outlined"
                                    startIcon={<ReceiptIcon />}
                                    onClick={() => {
                                        setOpenView(false)
                                        navigate('/purchases')
                                    }}
                                >
                                    متابعة فواتير الموردين
                                </Button>
                            )}
                        </DialogActions>
                    </>
                )}
            </Dialog>

            {/* Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={5000}
                onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                    severity={snackbar.severity}
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* Quick Supplier Dialog */}
            <Dialog open={quickSupplierOpen} onClose={() => setQuickSupplierOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>إضافة مورد جديد (سريع)</DialogTitle>
                <DialogContent>
                    {supErrors.api && <Alert severity="error" sx={{ mb: 2 }}>{supErrors.api}</Alert>}
                    <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
                        <TextField
                            label="اسم المورد *"
                            value={quickSupplier.name_ar}
                            onChange={(e) => setQuickSupplier({ ...quickSupplier, name_ar: e.target.value })}
                            error={!!supErrors.name_ar}
                            helperText={supErrors.name_ar}
                            fullWidth
                            autoFocus
                        />
                        <TextField
                            label="رقم الهاتف"
                            value={quickSupplier.phone}
                            onChange={(e) => setQuickSupplier({ ...quickSupplier, phone: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label="البريد الإلكتروني"
                            value={quickSupplier.email}
                            onChange={(e) => setQuickSupplier({ ...quickSupplier, email: e.target.value })}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setQuickSupplierOpen(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={handleCreateQuickSupplier} disabled={creatingSup}>
                        {creatingSup ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Quick Product Dialog */}
            <Dialog open={quickProductOpen} onClose={() => setQuickProductOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>إضافة منتج جديد (سريع)</DialogTitle>
                <DialogContent>
                    {prodErrors.api && <Alert severity="error" sx={{ mb: 2 }}>{prodErrors.api}</Alert>}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
                        <TextField
                            label="اسم المنتج *"
                            value={quickProduct.name_ar}
                            onChange={(e) => setQuickProduct({ ...quickProduct, name_ar: e.target.value })}
                            error={!!prodErrors.name_ar}
                            helperText={prodErrors.name_ar}
                            fullWidth
                            sx={{ gridColumn: 'span 2' }}
                            autoFocus
                        />
                        <TextField
                            label="سعر الشراء (التكلفة) *"
                            type="number"
                            value={quickProduct.cost_price}
                            onChange={(e) => setQuickProduct({ ...quickProduct, cost_price: e.target.value })}
                            error={!!prodErrors.cost_price}
                            helperText={prodErrors.cost_price}
                            fullWidth
                        />
                        <TextField
                            label="سعر البيع *"
                            type="number"
                            value={quickProduct.selling_price}
                            onChange={(e) => setQuickProduct({ ...quickProduct, selling_price: e.target.value })}
                            error={!!prodErrors.selling_price}
                            helperText={prodErrors.selling_price}
                            fullWidth
                        />
                        <TextField
                            label="وحدة القياس"
                            select
                            value={quickProduct.unit_of_measure}
                            onChange={(e) => {
                                const nextValue = e.target.value
                                setQuickProduct({ ...quickProduct, unit_of_measure: nextValue })
                                if (nextValue !== CUSTOM_UOM_VALUE) {
                                    setQuickProductCustomUom('')
                                }
                            }}
                            fullWidth
                            error={!!prodErrors.unit_of_measure}
                            helperText={prodErrors.unit_of_measure}
                        >
                            {QUICK_UOM_OPTIONS.map((uom) => (
                                <MenuItem key={uom} value={uom}>{QUICK_UOM_LABELS[uom] || uom}</MenuItem>
                            ))}
                            <MenuItem value={CUSTOM_UOM_VALUE} sx={ADD_UOM_OPTION_SX}>+ إضافة وحدة جديدة</MenuItem>
                        </TextField>
                        {quickProduct.unit_of_measure === CUSTOM_UOM_VALUE && (
                            <TextField
                                label="الوحدة المخصصة"
                                value={quickProductCustomUom}
                                onChange={(e) => setQuickProductCustomUom(e.target.value)}
                                fullWidth
                                placeholder="مثال: ربطة، كيس، سلة"
                            />
                        )}
                        <TextField
                            label="الفئة"
                            select
                            value={quickProduct.category_id}
                            onChange={(e) => setQuickProduct({ ...quickProduct, category_id: e.target.value })}
                            fullWidth
                        >
                            <MenuItem value="">بدون فئة</MenuItem>
                            {categories.map((cat) => (
                                <MenuItem key={cat.id} value={cat.id}>
                                    {cat.name_ar}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            label="حد التنبيه الأدنى"
                            type="number"
                            value={quickProduct.min_stock}
                            onChange={(e) => setQuickProduct({ ...quickProduct, min_stock: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label="الباركود / SKU"
                            value={quickProduct.sku}
                            onChange={(e) => setQuickProduct({ ...quickProduct, sku: e.target.value })}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setQuickProductOpen(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={handleCreateQuickProduct} disabled={creatingProd}>
                        {creatingProd ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
