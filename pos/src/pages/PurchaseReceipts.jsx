import { useState, useEffect, useRef, useCallback } from 'react'
import {
    Box,
    Typography,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Autocomplete,
    Grid,
    Alert,
    CircularProgress,
    Chip,
    Tooltip,
    Snackbar,
    MenuItem,
    Divider,
    InputAdornment,
    LinearProgress,
    Stepper,
    Step,
    StepLabel
} from '@mui/material'
import {
    Add as AddIcon,
    Visibility as ViewIcon,
    Delete as DeleteIcon,
    Receipt as ReceiptIcon,
    CheckCircle as ReceivedIcon,
    LocalShipping as SupplierIcon,
    PersonAdd as PersonAddIcon,
    AddBox as AddBoxIcon,
    Inventory as InventoryIcon,
    LocalShipping as ShippingIcon
} from '@mui/icons-material'
import { purchaseAPI, warehouseAPI, inventoryAPI, supplierAPI, categoryAPI, expenseAPI } from '../services/api'
import EntityAttachmentsPanel from '../components/EntityAttachmentsPanel'

const PAYMENT_METHODS = [
    { value: 'credit', label: 'آجل (حساب المورد)' },
    { value: 'cash', label: 'نقدي' },
    { value: 'bank_transfer', label: 'تحويل بنكي' },
    { value: 'check', label: 'شيك' },
    { value: 'card', label: 'بطاقة' }
]
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { useThemeConfig } from '../contexts/ThemeContext'

// Sentinel value for the "Add New" option in Autocomplete
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
    kg: 'كيلوجرام (KG)',
    g: 'جرام (G)',
    l: 'لتر (L)',
    ml: 'ملليلتر (ML)',
    box: 'صندوق / كرتون',
    pack: 'عبوة / باك',
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

export default function PurchaseReceipts() {
    const { formatCurrency } = useThemeConfig()
    const [receipts, setReceipts] = useState([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [viewDialogOpen, setViewDialogOpen] = useState(false)
    const [selectedReceipt, setSelectedReceipt] = useState(null)
    const [warehouses, setWarehouses] = useState([])
    const [suppliers, setSuppliers] = useState([])
    const [products, setProducts] = useState([])
    const [categories, setCategories] = useState([])
    const [error, setError] = useState('')
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })
    const [searchFilter, setSearchFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [supplierFilter, setSupplierFilter] = useState('')
    const [warehouseFilter, setWarehouseFilter] = useState('')
    const [fromDateFilter, setFromDateFilter] = useState('')
    const [toDateFilter, setToDateFilter] = useState('')

    // ============ Goods Receipt Dialog ============
    const [receiveDialogOpen, setReceiveDialogOpen] = useState(false)
    const [receiveItems, setReceiveItems] = useState([])
    const [receiving, setReceiving] = useState(false)
    const [createAction, setCreateAction] = useState(null)

    // ============ Quick المورد Creation ============
    const [quickSupplierOpen, setQuickSupplierOpen] = useState(false)
    const [quickSupplier, setQuickSupplier] = useState({ name_ar: '', phone: '', email: '' })
    const [creatingSup, setCreatingSup] = useState(false)
    const [supErrors, setSupErrors] = useState({})

    // ============ Quick المنتج Creation ============
    const [quickProductOpen, setQuickProductOpen] = useState(false)
    const [quickProduct, setQuickProduct] = useState({
        name_ar: '', sku: '', cost_price: '', selling_price: '',
        unit_of_measure: 'piece', category_id: '', min_stock: '0'
    })
    const [quickProductCustomUom, setQuickProductCustomUom] = useState('')
    const [creatingProd, setCreatingProd] = useState(false)
    const [prodErrors, setProdErrors] = useState({})
    // Track which product row triggered the quick-add so we can auto-fill it
    const pendingProductRowRef = useRef(null)

    // Form
    const [paymentAccounts, setPaymentAccounts] = useState([])
    const [loadingPaymentAccounts, setLoadingPaymentAccounts] = useState(false)

    const { control, register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
        defaultValues: {
            items: [{ menu_id: '', quantity: 1, unit_cost: 0 }],
            payment_method: 'credit',
            payment_account_code: ''
        }
    })
    
    const watchPaymentMethod = watch('payment_method')

    const fetchPaymentAccounts = useCallback(async (method) => {
        if (!method || method === 'credit') {
            setPaymentAccounts([])
            return
        }
        try {
            setLoadingPaymentAccounts(true)
            const response = await expenseAPI.getPaymentAccounts(method)
            setPaymentAccounts(response.data.data || [])
            if (response.data.data?.length === 1) {
                setValue('payment_account_code', response.data.data[0].code)
            } else if (response.data.data?.length > 0) {
                setValue('payment_account_code', '')
            }
        } catch (err) {
            console.error('Failed to fetch payment accounts:', err)
        } finally {
            setLoadingPaymentAccounts(false)
        }
    }, [setValue])

    useEffect(() => {
        fetchPaymentAccounts(watchPaymentMethod)
    }, [watchPaymentMethod, fetchPaymentAccounts])

    const { fields, append, remove } = useFieldArray({
        control,
        name: "items"
    })

    // ==================== DATA FETCHING ====================
        const fetchReceipts = useCallback(async () => {
        try {
            setLoading(true)
            const params = {}
            if (searchFilter.trim()) params.q = searchFilter.trim()
            if (statusFilter) params.status = statusFilter
            if (supplierFilter) params.supplier_id = supplierFilter
            if (warehouseFilter) params.warehouse_id = warehouseFilter
            if (fromDateFilter) params.start_date = fromDateFilter
            if (toDateFilter) params.end_date = toDateFilter

            const response = await purchaseAPI.getAll(params)
            setReceipts(response.data.data || [])
            setError('')
        } catch (err) {
            setError('فشل في جلب فواتير الموردين')
        } finally {
            setLoading(false)
        }
    }, [searchFilter, statusFilter, supplierFilter, warehouseFilter, fromDateFilter, toDateFilter])

    const fetchInitialData = async () => {
        try {
            const [wRes, pRes, sRes, cRes] = await Promise.all([
                warehouseAPI.getAll(),
                inventoryAPI.getProducts(),
                supplierAPI.getAll({ status: 'active' }),
                categoryAPI.getAll().catch(() => ({ data: { data: [] } }))
            ])
            setWarehouses(wRes.data.data || [])
            setProducts(pRes.data.data || [])
            setSuppliers(sRes.data.data || [])
            setCategories(cRes.data.data || cRes.data || [])
        } catch (err) {
            console.error('Failed to fetch initial data', err)
        }
    }

        useEffect(() => {
        fetchReceipts()
    }, [fetchReceipts])

    useEffect(() => {
        fetchInitialData()
    }, [])

    // ==================== QUICK SUPPLIER CREATE ====================
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
            setValue('supplier_id', newSup.id)
            setValue('supplier_name', newSup.name_ar)

            setQuickSupplierOpen(false)
            setSnackbar({ open: true, message: `تمت إضافة المورد "${newSup.name_ar}" بنجاح`, severity: 'success' })
        } catch (err) {
            console.error('Failed to create supplier:', err)
            setSupErrors({ api: err.response?.data?.message || 'فشل إضافة المورد' })
        } finally {
            setCreatingSup(false)
        }
    }

    // ==================== QUICK PRODUCT CREATE ====================
    const handleOpenQuickProduct = (rowIndex = null) => {
        pendingProductRowRef.current = rowIndex
        setQuickProduct({
            name_ar: '', sku: '', cost_price: '', selling_price: '',
            unit_of_measure: 'piece', category_id: '', min_stock: '0'
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

            const rowIdx = pendingProductRowRef.current
            if (rowIdx !== null) {
                setValue(`items.${rowIdx}.menu_id`, newProduct)
                setValue(`items.${rowIdx}.unit_cost`, parseFloat(quickProduct.cost_price))
            }

            setQuickProductOpen(false)
            setSnackbar({ open: true, message: `تمت إضافة المنتج "${newProduct.name_ar}" بنجاح`, severity: 'success' })
        } catch (err) {
            console.error('Failed to create product:', err)
            setProdErrors({ api: err.response?.data?.message || 'فشل إضافة المنتج' })
        } finally {
            setCreatingProd(false)
        }
    }

    // ==================== MAIN FORM ACTIONS ====================
    const handleCreateInvoice = async (data, action = 'draft') => {
        let createdReceipt = null
        setCreateAction(action)
        setError('')

        try {
            const payload = {
                ...data,
                items: data.items.map(item => ({
                    menu_id: item.menu_id.id,
                    quantity: parseFloat(item.quantity),
                    unit_cost: parseFloat(item.unit_cost)
                }))
            }

            const createRes = await purchaseAPI.create(payload)
            createdReceipt = createRes?.data?.data || null

            if (!createdReceipt?.id) {
                throw new Error('لم يتم استلام بيانات الفاتورة من الخادم')
            }

            if (action === 'receive_full') {
                await purchaseAPI.receive(createdReceipt.id)
                setSnackbar({ open: true, message: 'تم إنشاء الفاتورة واستلامها بالكامل', severity: 'success' })
            } else if (action === 'receive_partial') {
                let receiptForReceive = createdReceipt
                try {
                    const detailsRes = await purchaseAPI.getById(createdReceipt.id)
                    receiptForReceive = detailsRes?.data?.data || createdReceipt
                } catch (fetchErr) {
                    console.warn('Failed to fetch created receipt details for partial receive dialog:', fetchErr)
                }
                handleOpenReceive(receiptForReceive, { defaultToRemaining: false })
                setSnackbar({
                    open: true,
                    message: 'تم إنشاء الفاتورة. أدخل الكميات المستلمة ثم أكد الاستلام الجزئي.',
                    severity: 'info'
                })
            } else {
                setSnackbar({ open: true, message: 'تم حفظ فاتورة المورد كمسودة', severity: 'success' })
            }

            setDialogOpen(false)
            reset()
            await fetchReceipts()
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'فشل حفظ الفاتورة'

            if (createdReceipt?.id && action !== 'draft') {
                setDialogOpen(false)
                reset()
                await fetchReceipts()
                setSnackbar({
                    open: true,
                    message: `تم إنشاء الفاتورة لكن فشل تنفيذ ${action === 'receive_full' ? 'الاستلام الكامل' : 'الاستلام الجزئي'}: ${errorMessage}`,
                    severity: 'warning'
                })
            } else {
                setError(errorMessage)
            }
        } finally {
            setCreateAction(null)
        }
    }

    // ==================== GOODS RECEIPT ====================
    const handleOpenReceive = (receipt, options = {}) => {
        const { defaultToRemaining = true } = options
        // Initialize receive items from the receipt's items
        const items = (receipt.items || []).map(item => ({
            id: item.id,
            menu_id: item.menu_id,
            productName: item.Menu?.name_ar || products.find((p) => p.id === item.menu_id)?.name_ar || 'منتج',
            quantity_ordered: parseFloat(item.quantity || 0),
            quantity_previously_received: parseFloat(item.quantity_received || 0),
            quantity_remaining: parseFloat(item.quantity || 0) - parseFloat(item.quantity_received || 0),
            quantity_to_receive: defaultToRemaining
                ? parseFloat(item.quantity || 0) - parseFloat(item.quantity_received || 0)
                : 0,
            unit_cost: parseFloat(item.unit_cost || 0),
            batch_number: item.batch_number || '',
            expiry_date: item.expiry_date || ''
        }))

        setReceiveItems(items)
        setSelectedReceipt(receipt)
        setReceiveDialogOpen(true)
    }

    const handleReceiveGoods = async () => {
        // Filter items that have something to receive
        const itemsToReceive = receiveItems
            .filter(item => item.quantity_to_receive > 0)
            .map(item => ({
                id: item.id,
                quantity_received: item.quantity_to_receive
            }))

        if (itemsToReceive.length === 0) {
            setSnackbar({ open: true, message: 'لم يتم تحديد كميات للاستلام', severity: 'warning' })
            return
        }

        setReceiving(true)
        try {
            const res = await purchaseAPI.receive(selectedReceipt.id, itemsToReceive)
            setReceiveDialogOpen(false)
            setSelectedReceipt(null)
            fetchReceipts()
            setSnackbar({
                open: true,
                message: res.data?.message || 'تم استلام البضاعة بنجاح',
                severity: 'success'
            })
        } catch (err) {
            console.error('Error receiving goods:', err)
            setSnackbar({
                open: true,
                message: err.response?.data?.message || 'فشل استلام البضاعة',
                severity: 'error'
            })
        } finally {
            setReceiving(false)
        }
    }

    const handleReceiveFullFromList = async (id) => {
        if (!window.confirm('هل أنت متأكد من استلام جميع الأصناف؟ سيتم تحديث المخزون فورًا.')) return

        try {
            const res = await purchaseAPI.receive(id)
            if (viewDialogOpen) setViewDialogOpen(false)
            fetchReceipts()
            setSnackbar({
                open: true,
                message: res.data?.message || 'تم استلام البضاعة بنجاح',
                severity: 'success'
            })
        } catch (err) {
            setSnackbar({
                open: true,
                message: err.response?.data?.message || 'فشل استلام البضاعة',
                severity: 'error'
            })
        }
    }

    const handleView = async (receipt) => {
        try {
            const res = await purchaseAPI.getById(receipt.id)
            setSelectedReceipt(res.data.data)
            setViewDialogOpen(true)
        } catch (err) {
            console.error(err)
        }
    }

    const items = watch('items')
    const selectedSupplierId = watch('supplier_id')
    const calculateTotal = () => {
        return items.reduce((sum, item) => {
            return sum + (parseFloat(item.quantity || 0) * parseFloat(item.unit_cost || 0))
        }, 0)
    }

    // Build supplier options with "Add New" always at the end
    const supplierOptions = [...suppliers, ADD_NEW_SUPPLIER]
    // Build product options with "Add New" always at the end
    const productOptions = [...products, ADD_NEW_PRODUCT]

    // Find selected supplier object for the controlled Autocomplete
    const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) || null

    const getStatusInfo = (status) => {
        switch (status) {
            case 'draft': return { label: 'بانتظار الاستلام', color: 'warning', step: 0 }
            case 'partial': return { label: 'استلام جزئي', color: 'info', step: 1 }
            case 'received': return { label: 'مستلم', color: 'success', step: 2 }
            case 'cancelled': return { label: 'ملغي', color: 'error', step: -1 }
            default: return { label: status, color: 'default', step: 0 }
        }
    }

    const getReceiveProgress = (receipt) => {
        if (!receipt.items || receipt.items.length === 0) return 0
        const totalOrdered = receipt.items.reduce((s, i) => s + parseFloat(i.quantity || 0), 0)
        const totalReceived = receipt.items.reduce((s, i) => s + parseFloat(i.quantity_received || 0), 0)
        if (totalOrdered === 0) return 0
        return Math.round((totalReceived / totalOrdered) * 100)
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" fontWeight="bold">
                    <ReceiptIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    فواتير الموردين
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => {
                        reset({ items: [{ menu_id: '', quantity: 1, unit_cost: 0 }] })
                        setDialogOpen(true)
                    }}
                >
                    تسجيل فاتورة مورد
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}


            {/* Filters */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        label="بحث (رقم الفاتورة/المرجع)"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        sx={{ minWidth: 280 }}
                    />
                    <TextField
                        size="small"
                        select
                        label="الحالة"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        sx={{ minWidth: 160 }}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        <MenuItem value="draft">مسودة</MenuItem>
                        <MenuItem value="partial">جزئي</MenuItem>
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
                        size="small"
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
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                            <TableCell>رقم الفاتورة</TableCell>
                            <TableCell>أمر الشراء</TableCell>
                            <TableCell>المورد</TableCell>
                            <TableCell>المستودع</TableCell>
                            <TableCell>الحالة</TableCell>
                            <TableCell>نسبة الاستلام</TableCell>
                            <TableCell>الإجمالي</TableCell>
                            <TableCell>التاريخ</TableCell>
                            <TableCell align="center">إجراءات</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={9} align="center"><CircularProgress /></TableCell></TableRow>
                        ) : receipts.length === 0 ? (
                            <TableRow><TableCell colSpan={9} align="center">لا توجد فواتير</TableCell></TableRow>
                        ) : (
                            receipts.map((receipt) => {
                                const progress = getReceiveProgress(receipt)
                                return (
                                    <TableRow key={receipt.id} hover>
                                        <TableCell fontFamily="monospace">{receipt.receipt_number}</TableCell>
                                        <TableCell>
                                            {receipt.purchaseOrder ? (
                                                <Chip
                                                    label={receipt.purchaseOrder.po_number}
                                                    size="small"
                                                    color="info"
                                                    variant="outlined"
                                                />
                                            ) : (
                                                <Chip label="يدوي" size="small" variant="outlined" />
                                            )}
                                        </TableCell>
                                        <TableCell>{receipt.supplier_name || receipt.Supplier?.name_ar || '-'}</TableCell>
                                        <TableCell>{receipt.Warehouse?.name_ar}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={getStatusInfo(receipt.status).label}
                                                color={getStatusInfo(receipt.status).color}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={progress}
                                                    sx={{ flexGrow: 1, height: 8, borderRadius: 1 }}
                                                    color={progress === 100 ? 'success' : progress > 0 ? 'warning' : 'inherit'}
                                                />
                                                <Typography variant="caption" sx={{ minWidth: 35 }}>
                                                    {progress}%
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            {formatCurrency(receipt.total_cost)}
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                const dateVal = receipt.createdAt || receipt.created_at || receipt.date
                                                if (!dateVal) return '---'
                                                const d = new Date(dateVal)
                                                return isNaN(d.getTime()) ? '---' : d.toLocaleDateString('ar-EG')
                                            })()}
                                        </TableCell>
                                        <TableCell align="center">
                                            <IconButton onClick={() => handleView(receipt)} color="primary">
                                                <ViewIcon />
                                            </IconButton>
                                            {['draft', 'partial'].includes(receipt.status) && (
                                                <Tooltip title="استلام البضاعة">
                                                    <IconButton onClick={() => handleView(receipt)} color="success">
                                                        <InventoryIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* ==================== CREATE INVOICE DIALOG ==================== */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
                <form onSubmit={handleSubmit((data) => handleCreateInvoice(data, 'draft'))}>
                    <DialogTitle>إضافة فاتورة مورد جديدة</DialogTitle>
                    <DialogContent>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            {/* ===== SUPPLIER AUTOCOMPLETE with Quick-Add ===== */}
                            <Grid item xs={12} md={6}>
                                <Autocomplete
                                    options={supplierOptions}
                                    getOptionLabel={(option) => option?.name_ar || ''}
                                    value={selectedSupplier}
                                    onChange={(_, val) => {
                                        if (val?._isAction) {
                                            handleOpenQuickSupplier()
                                            return
                                        }
                                        setValue('supplier_id', val?.id || '')
                                        setValue('supplier_name', val?.name_ar || '')
                                    }}
                                    isOptionEqualToValue={(option, value) => option.id === value?.id}
                                    renderOption={(props, option) => {
                                        if (option._isAction) {
                                            return (
                                                <li {...props} key="__add_new_supplier__">
                                                    <Box sx={{
                                                        display: 'flex', alignItems: 'center', gap: 1,
                                                        color: 'primary.main', fontWeight: 'bold', width: '100%',
                                                        borderTop: '1px solid', borderColor: 'divider', pt: 1
                                                    }}>
                                                        <PersonAddIcon fontSize="small" />
                                                        إضافة مورد جديد
                                                    </Box>
                                                </li>
                                            )
                                        }
                                        return (
                                            <li {...props} key={option.id}>
                                                <Box>
                                                    <Typography>{option.name_ar}</Typography>
                                                    {option.phone && (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {option.phone}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </li>
                                        )
                                    }}
                                    noOptionsText={
                                        <Box
                                            sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main', py: 1 }}
                                            onClick={handleOpenQuickSupplier}
                                        >
                                            <PersonAddIcon fontSize="small" />
                                            <Typography fontWeight="bold">لا توجد نتائج - إضافة مورد جديد</Typography>
                                        </Box>
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="المورد *"
                                            error={!!errors.supplier_id}
                                            helperText={errors.supplier_id?.message}
                                            placeholder="ابحث أو أضف موردًا..."
                                        />
                                    )}
                                    filterOptions={(options, params) => {
                                        const filtered = options.filter(opt => {
                                            if (opt._isAction) return true
                                            const label = opt.name_ar || ''
                                            return label.toLowerCase().includes((params.inputValue || '').toLowerCase())
                                        })
                                        return filtered
                                    }}
                                />
                                <input type="hidden" {...register('supplier_id', { required: 'المورد مطلوب' })} />
                                <input type="hidden" {...register('supplier_name')} />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    label="رقم فاتورة المورد (اختياري)"
                                    fullWidth
                                    {...register('invoice_number')}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Controller
                                    name="payment_method"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            select
                                            label="طريقة الدفع"
                                            fullWidth
                                            sx={{ mb: 2 }}
                                        >
                                            {PAYMENT_METHODS.map(m => (
                                                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                                            ))}
                                        </TextField>
                                    )}
                                />
                                {watchPaymentMethod !== 'credit' && (
                                    <Controller
                                        name="payment_account_code"
                                        control={control}
                                        rules={{ required: 'حساب الدفع مطلوب' }}
                                        render={({ field }) => (
                                            <TextField
                                                {...field}
                                                select
                                                label="حساب الدفع"
                                                fullWidth
                                                required
                                                disabled={loadingPaymentAccounts}
                                                error={!!errors.payment_account_code}
                                                helperText={errors.payment_account_code?.message}
                                            >
                                                {loadingPaymentAccounts ? (
                                                    <MenuItem disabled>جاري التحميل...</MenuItem>
                                                ) : paymentAccounts.length === 0 ? (
                                                    <MenuItem disabled>لا يوجد حسابات متاحة</MenuItem>
                                                ) : (
                                                    paymentAccounts.map(acc => (
                                                        <MenuItem key={acc.code} value={acc.code}>
                                                            {acc.name_ar} {acc.balance ? `(${parseFloat(acc.balance).toFixed(2)})` : ''}
                                                        </MenuItem>
                                                    ))
                                                )}
                                            </TextField>
                                        )}
                                    />
                                )}
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Controller
                                    name="warehouse_id"
                                    control={control}
                                    rules={{ required: 'المستودع مطلوب' }}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            select
                                            label="المستودع"
                                            fullWidth
                                            error={!!errors.warehouse_id}
                                            helperText={errors.warehouse_id?.message}
                                        >
                                            {warehouses.map(w => (
                                                <MenuItem key={w.id} value={w.id}>
                                                    {w.name_ar || w.nameAr}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    )}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ p: 2, bgcolor: 'primary.light', color: 'white', borderRadius: 1, textAlign: 'center' }}>
                                    <Typography variant="h6" color="primary.main">
                                        الإجمالي المستحق: {formatCurrency(calculateTotal())}
                                    </Typography>
                                </Box>
                            </Grid>

                            {/* ===== ITEMS WITH PRODUCT AUTOCOMPLETE + Quick-Add ===== */}
                            <Grid item xs={12}>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="h6" sx={{ mt: 1, mb: 1 }}>المنتجات</Typography>
                                {fields.map((field, index) => (
                                    <Box key={field.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
                                        <Controller
                                            name={`items.${index}.menu_id`}
                                            control={control}
                                            rules={{ required: true }}
                                            render={({ field: { onChange, value } }) => (
                                                <Autocomplete
                                                    options={productOptions}
                                                    getOptionLabel={(option) => option?.name_ar || ''}
                                                    value={value || null}
                                                    onChange={(_, data) => {
                                                        if (data?._isAction) {
                                                            handleOpenQuickProduct(index)
                                                            return
                                                        }
                                                        onChange(data)
                                                        if (data?.cost_price) {
                                                            setValue(`items.${index}.unit_cost`, parseFloat(data.cost_price))
                                                        }
                                                    }}
                                                    isOptionEqualToValue={(option, value) => option?.id === value?.id}
                                                    renderOption={(props, option) => {
                                                        if (option._isAction) {
                                                            return (
                                                                <li {...props} key="__add_new_product__">
                                                                    <Box sx={{
                                                                        display: 'flex', alignItems: 'center', gap: 1,
                                                                        color: 'secondary.main', fontWeight: 'bold', width: '100%',
                                                                        borderTop: '1px solid', borderColor: 'divider', pt: 1
                                                                    }}>
                                                                        <AddBoxIcon fontSize="small" />
                                                                        إضافة منتج جديد
                                                                    </Box>
                                                                </li>
                                                            )
                                                        }
                                                        return (
                                                            <li {...props} key={option.id}>
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                                    <Typography>{option.name_ar}</Typography>
                                                                    {option.sku && (
                                                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                                                            {option.sku}
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            </li>
                                                        )
                                                    }}
                                                    noOptionsText={
                                                        <Box
                                                            sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, color: 'secondary.main', py: 1 }}
                                                            onClick={() => handleOpenQuickProduct(index)}
                                                        >
                                                            <AddBoxIcon fontSize="small" />
                                                            <Typography fontWeight="bold">لا توجد نتائج - إضافة منتج جديد</Typography>
                                                        </Box>
                                                    }
                                                    filterOptions={(options, params) => {
                                                        const filtered = options.filter(opt => {
                                                            if (opt._isAction) return true
                                                            const label = (opt.name_ar || '') + ' ' + (opt.sku || '')
                                                            return label.toLowerCase().includes((params.inputValue || '').toLowerCase())
                                                        })
                                                        return filtered
                                                    }}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            label="المنتج"
                                                            size="small"
                                                            error={!!errors.items?.[index]?.menu_id}
                                                            placeholder="ابحث أو أضف منتجًا..."
                                                        />
                                                    )}
                                                    sx={{ flex: 2 }}
                                                />
                                            )}
                                        />
                                        <TextField
                                            label="الكمية"
                                            type="number"
                                            size="small"
                                            sx={{ flex: 1 }}
                                            {...register(`items.${index}.quantity`, { required: true, min: 1 })}
                                            error={!!errors.items?.[index]?.quantity}
                                        />
                                        <TextField
                                            label="سعر الشراء"
                                            type="number"
                                            size="small"
                                            sx={{ flex: 1 }}
                                            {...register(`items.${index}.unit_cost`, { required: true, min: 0 })}
                                        />
                                        <IconButton color="error" onClick={() => remove(index)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Box>
                                ))}
                                <Button startIcon={<AddIcon />} onClick={() => append({ menu_id: '', quantity: 1, unit_cost: 0 })}>
                                    إضافة سطر
                                </Button>
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setDialogOpen(false)} disabled={!!createAction}>إلغاء</Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={!!createAction}
                            startIcon={createAction === 'draft' ? <CircularProgress size={18} /> : undefined}
                        >
                            {createAction === 'draft' ? 'جاري الحفظ...' : 'حفظ كمسودة'}
                        </Button>
                        <Button
                            type="button"
                            variant="outlined"
                            color="success"
                            disabled={!!createAction}
                            onClick={handleSubmit((data) => handleCreateInvoice(data, 'receive_partial'))}
                            startIcon={createAction === 'receive_partial' ? <CircularProgress size={18} /> : <InventoryIcon />}
                        >
                            {createAction === 'receive_partial' ? 'جارٍ التحضير...' : 'استلام جزئي'}
                        </Button>
                        <Button
                            type="button"
                            variant="contained"
                            color="success"
                            disabled={!!createAction}
                            onClick={handleSubmit((data) => handleCreateInvoice(data, 'receive_full'))}
                            startIcon={createAction === 'receive_full' ? <CircularProgress size={18} /> : <ReceivedIcon />}
                        >
                            {createAction === 'receive_full' ? 'جاري الاستلام...' : 'استلام'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* ==================== VIEW DIALOG ==================== */}
            <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
                {selectedReceipt && (
                    <>
                        <DialogTitle>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="h6">
                                    تفاصيل الفاتورة: {selectedReceipt.receipt_number}
                                </Typography>
                                <Chip
                                    label={getStatusInfo(selectedReceipt.status).label}
                                    color={getStatusInfo(selectedReceipt.status).color}
                                />
                            </Box>
                        </DialogTitle>
                        <DialogContent>
                            {/* Stepper */}
                            {selectedReceipt.status !== 'cancelled' && (
                                <Stepper activeStep={getStatusInfo(selectedReceipt.status).step} sx={{ mb: 3 }}>
                                    <Step><StepLabel>بانتظار الاستلام</StepLabel></Step>
                                    <Step><StepLabel>استلام جزئي</StepLabel></Step>
                                    <Step><StepLabel>مستلم بالكامل</StepLabel></Step>
                                </Stepper>
                            )}

                            {/* PO link */}
                            {selectedReceipt.purchaseOrder && (
                                <Alert severity="info" sx={{ mb: 2 }} icon={<ShippingIcon />}>
                                    أمر الشراء المرتبط: <strong>{selectedReceipt.purchaseOrder.po_number}</strong>
                                </Alert>
                            )}

                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid item xs={6}>
                                    <Typography color="text.secondary">المورد:</Typography>
                                    <Typography variant="h6">{selectedReceipt.supplier_name}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography color="text.secondary">المستودع:</Typography>
                                    <Typography variant="h6">{selectedReceipt.Warehouse?.name_ar}</Typography>
                                </Grid>
                            </Grid>

                            {/* Progress bar */}
                            {['draft', 'partial'].includes(selectedReceipt.status) && (
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                        نسبة الاستلام: {getReceiveProgress(selectedReceipt)}%
                                    </Typography>
                                    <LinearProgress
                                        variant="determinate"
                                        value={getReceiveProgress(selectedReceipt)}
                                        sx={{ height: 10, borderRadius: 1 }}
                                        color={getReceiveProgress(selectedReceipt) > 0 ? 'warning' : 'inherit'}
                                    />
                                </Box>
                            )}

                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>المنتج</TableCell>
                                            <TableCell align="center">المطلوب</TableCell>
                                            <TableCell align="center">المستلم</TableCell>
                                            <TableCell align="center">المتبقي</TableCell>
                                            <TableCell align="right">سعر الوحدة</TableCell>
                                            <TableCell align="right">الإجمالي</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {selectedReceipt.items?.map((item) => {
                                            const ordered = parseFloat(item.quantity || 0)
                                            const received = parseFloat(item.quantity_received || 0)
                                            const remaining = ordered - received
                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell>{item.Menu?.name_ar}</TableCell>
                                                    <TableCell align="center">{ordered}</TableCell>
                                                    <TableCell align="center">
                                                        <Chip
                                                            label={received}
                                                            color={received >= ordered ? 'success' : received > 0 ? 'warning' : 'default'}
                                                            size="small"
                                                            variant="outlined"
                                                        />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {remaining > 0 ? (
                                                            <Typography color="error.main" fontWeight="bold">{remaining}</Typography>
                                                        ) : (
                                                            <Typography color="success.main">مكتمل</Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell align="right">{formatCurrency(item.unit_cost)}</TableCell>
                                                    <TableCell align="right">{formatCurrency(item.total_cost)}</TableCell>
                                                </TableRow>
                                            )
                                        })}
                                        <TableRow>
                                            <TableCell colSpan={5} align="right" sx={{ fontWeight: "bold" }}>الإجمالي المستحق</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                                {formatCurrency(selectedReceipt.total_cost)}
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <EntityAttachmentsPanel
                                entityType="purchase_receipt"
                                entityId={selectedReceipt.id}
                                title="مرفقات فاتورة المورد"
                                readOnly={selectedReceipt.status === 'cancelled'}
                            />
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setViewDialogOpen(false)}>إغلاق</Button>
                            {['draft', 'partial'].includes(selectedReceipt.status) && (
                                <>
                                    <Button
                                        variant="outlined"
                                        color="success"
                                        onClick={() => handleReceiveFullFromList(selectedReceipt.id)}
                                        startIcon={<ReceivedIcon />}
                                    >
                                        استلام الكل
                                    </Button>
                                    <Button
                                        variant="contained"
                                        color="success"
                                        onClick={() => {
                                            setViewDialogOpen(false)
                                            handleOpenReceive(selectedReceipt)
                                        }}
                                        startIcon={<InventoryIcon />}
                                    >
                                        استلام جزئي
                                    </Button>
                                </>
                            )}
                        </DialogActions>
                    </>
                )}
            </Dialog>

            {/* ==================== GOODS RECEIPT DIALOG ==================== */}
            <Dialog open={receiveDialogOpen} onClose={() => setReceiveDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InventoryIcon color="success" />
                    استلام البضاعة - {selectedReceipt?.receipt_number}
                </DialogTitle>
                <DialogContent>
                    {selectedReceipt?.purchaseOrder && (
                        <Alert severity="info" sx={{ mb: 2 }} icon={<ShippingIcon />}>
                            أمر الشراء: <strong>{selectedReceipt.purchaseOrder.po_number}</strong>
                        </Alert>
                    )}

                    <Alert severity="warning" sx={{ mb: 2 }} icon={false}>
                        أدخل الكميات المستلمة فعليًا. سيتم تحديث المخزون فورًا.
                    </Alert>

                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>المنتج</TableCell>
                                    <TableCell align="center">المطلوب</TableCell>
                                    <TableCell align="center">المستلم سابقًا</TableCell>
                                    <TableCell align="center">المتبقي</TableCell>
                                    <TableCell align="center" sx={{ minWidth: 120 }}>الكمية المستلمة الآن</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {receiveItems.map((item, idx) => (
                                    <TableRow key={item.id} sx={item.quantity_remaining <= 0 ? { opacity: 0.5, bgcolor: 'success.50' } : {}}>
                                        <TableCell>
                                            <Typography fontWeight="bold">{item.productName}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                @ {formatCurrency(item.unit_cost)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">{item.quantity_ordered}</TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                label={item.quantity_previously_received}
                                                color={item.quantity_previously_received > 0 ? 'info' : 'default'}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            {item.quantity_remaining > 0 ? (
                                                <Typography color="error.main" fontWeight="bold">{item.quantity_remaining}</Typography>
                                            ) : (
                                                <Typography color="success.main">مكتمل</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            {item.quantity_remaining > 0 ? (
                                                <TextField
                                                    type="number"
                                                    size="small"
                                                    value={item.quantity_to_receive}
                                                    onChange={(e) => {
                                                        const val = Math.min(
                                                            Math.max(0, parseFloat(e.target.value) || 0),
                                                            item.quantity_remaining
                                                        )
                                                        setReceiveItems(prev =>
                                                            prev.map((ri, i) =>
                                                                i === idx ? { ...ri, quantity_to_receive: val } : ri
                                                            )
                                                        )
                                                    }}
                                                    inputProps={{
                                                        min: 0,
                                                        max: item.quantity_remaining,
                                                        step: 1
                                                    }}
                                                    sx={{ width: 100 }}
                                                />
                                            ) : (
                                                <Typography color="success.main" variant="body2">تم الاستلام</Typography>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {/* Summary */}
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            إجمالي الكمية المطلوب استلامها الآن:{' '}
                            <strong>{receiveItems.reduce((s, i) => s + (i.quantity_to_receive || 0), 0)}</strong> وحدة
                        </Typography>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReceiveDialogOpen(false)} disabled={receiving}>
                        إلغاء
                    </Button>
                    <Button
                        variant="contained"
                        color="success"
                        onClick={handleReceiveGoods}
                        disabled={receiving || receiveItems.every(i => !i.quantity_to_receive || i.quantity_to_receive <= 0)}
                        startIcon={receiving ? <CircularProgress size={18} /> : <ReceivedIcon />}
                    >
                        {receiving ? 'جاري الاستلام...' : 'تأكيد الاستلام'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ==================== QUICK SUPPLIER DIALOG ==================== */}
            <Dialog
                open={quickSupplierOpen}
                onClose={() => setQuickSupplierOpen(false)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderTop: '4px solid', borderColor: 'primary.main' } }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonAddIcon color="primary" />
                    إضافة مورد جديد
                </DialogTitle>
                <DialogContent>
                    {supErrors.api && <Alert severity="error" sx={{ mb: 2 }}>{supErrors.api}</Alert>}
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid item xs={12}>
                            <TextField
                                label="المورد *"
                                fullWidth
                                autoFocus
                                value={quickSupplier.name_ar}
                                onChange={(e) => setQuickSupplier(prev => ({ ...prev, name_ar: e.target.value }))}
                                error={!!supErrors.name_ar}
                                helperText={supErrors.name_ar}
                                placeholder="مثال: شركة المتحدة للأغذية"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="رقم الهاتف (اختياري)"
                                fullWidth
                                value={quickSupplier.phone}
                                onChange={(e) => setQuickSupplier(prev => ({ ...prev, phone: e.target.value }))}
                                placeholder="05XXXXXXXX"
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">📱</InputAdornment>
                                }}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="البريد الإلكتروني (اختياري)"
                                fullWidth
                                type="email"
                                value={quickSupplier.email}
                                onChange={(e) => setQuickSupplier(prev => ({ ...prev, email: e.target.value }))}
                                placeholder="supplier@example.com"
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">📧</InputAdornment>
                                }}
                            />
                        </Grid>
                    </Grid>
                    <Alert severity="info" sx={{ mt: 2 }} icon={false}>
                        يمكنك استكمال بيانات المورد لاحقًا من شاشة الموردين.
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setQuickSupplierOpen(false)} disabled={creatingSup}>إلغاء</Button>
                    <Button
                        variant="contained"
                        onClick={handleCreateQuickSupplier}
                        disabled={!quickSupplier.name_ar.trim() || creatingSup}
                        startIcon={creatingSup ? <CircularProgress size={18} /> : <PersonAddIcon />}
                    >
                        {creatingSup ? 'جاري الحفظ...' : 'حفظ واختيار'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ==================== QUICK PRODUCT DIALOG ==================== */}
            <Dialog
                open={quickProductOpen}
                onClose={() => setQuickProductOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { borderTop: '4px solid', borderColor: 'secondary.main' } }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AddBoxIcon color="secondary" />
                    إضافة منتج جديد
                </DialogTitle>
                <DialogContent>
                    {prodErrors.api && <Alert severity="error" sx={{ mb: 2 }}>{prodErrors.api}</Alert>}
                    <Alert severity="info" sx={{ mb: 2, mt: 1 }} icon={false}>
                        المنتجات التي تُضاف هنا تُعامل كمواد خام في المخزون. يمكنك تعديل التفاصيل لاحقًا.
                    </Alert>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <TextField
                                label="اسم المنتج (عربي) *"
                                fullWidth
                                autoFocus
                                value={quickProduct.name_ar}
                                onChange={(e) => setQuickProduct(prev => ({ ...prev, name_ar: e.target.value }))}
                                error={!!prodErrors.name_ar}
                                helperText={prodErrors.name_ar}
                                placeholder="مثال: دقيق أبيض 25 كجم"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="المنتج (SKU)"
                                fullWidth
                                value={quickProduct.sku}
                                onChange={(e) => setQuickProduct(prev => ({ ...prev, sku: e.target.value }))}
                                placeholder="يُولّد تلقائيًا إذا تُرك فارغًا"
                                helperText="اختياري - باركود أو رمز داخلي"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="الفئة"
                                select
                                fullWidth
                                value={quickProduct.category_id}
                                onChange={(e) => setQuickProduct(prev => ({ ...prev, category_id: e.target.value }))}
                                SelectProps={{ native: true }}
                            >
                                <option value="">No الفئة</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12}>
                            <Divider sx={{ my: 0.5 }}>التسعير</Divider>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="تكلفة الشراء *"
                                type="number"
                                fullWidth
                                value={quickProduct.cost_price}
                                onChange={(e) => setQuickProduct(prev => ({ ...prev, cost_price: e.target.value }))}
                                error={!!prodErrors.cost_price}
                                helperText={prodErrors.cost_price}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">ر.س</InputAdornment>
                                }}
                                inputProps={{ min: 0, step: '0.01' }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="سعر البيع *"
                                type="number"
                                fullWidth
                                value={quickProduct.selling_price}
                                onChange={(e) => setQuickProduct(prev => ({ ...prev, selling_price: e.target.value }))}
                                error={!!prodErrors.selling_price}
                                helperText={prodErrors.selling_price}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">ر.س</InputAdornment>
                                }}
                                inputProps={{ min: 0, step: '0.01' }}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Divider sx={{ my: 0.5 }}>المخزون</Divider>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="وحدة القياس"
                                select
                                fullWidth
                                value={quickProduct.unit_of_measure}
                                onChange={(e) => {
                                    const nextValue = e.target.value
                                    setQuickProduct(prev => ({ ...prev, unit_of_measure: nextValue }))
                                    if (nextValue !== CUSTOM_UOM_VALUE) {
                                        setQuickProductCustomUom('')
                                    }
                                }}
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
                                    fullWidth
                                    sx={{ mt: 1 }}
                                    value={quickProductCustomUom}
                                    onChange={(e) => setQuickProductCustomUom(e.target.value)}
                                    placeholder="مثال: ربطة، كيس، سلة"
                                />
                            )}
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="حد تنبيه المخزون الأدنى"
                                type="number"
                                fullWidth
                                value={quickProduct.min_stock}
                                onChange={(e) => setQuickProduct(prev => ({ ...prev, min_stock: e.target.value }))}
                                helperText="تنبيه عند وصول المخزون لهذا الحد"
                                inputProps={{ min: 0 }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setQuickProductOpen(false)} disabled={creatingProd}>إلغاء</Button>
                    <Button
                        variant="contained"
                        color="secondary"
                        onClick={handleCreateQuickProduct}
                        disabled={!quickProduct.name_ar.trim() || creatingProd}
                        startIcon={creatingProd ? <CircularProgress size={18} /> : <AddBoxIcon />}
                    >
                        {creatingProd ? 'جاري الحفظ...' : 'حفظ واختيار'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ==================== SNACKBAR ==================== */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
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
        </Box>
    )
}
