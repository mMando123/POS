import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
    StepLabel,
    Stack
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
    LocalShipping as ShippingIcon,
    WhatsApp as WhatsAppIcon,
    QrCodeScanner as ScannerIcon,
    PhotoCamera as CameraIcon,
    UploadFile as UploadIcon,
    StopCircle as StopIcon
} from '@mui/icons-material'
import { purchaseAPI, warehouseAPI, inventoryAPI, supplierAPI, categoryAPI, expenseAPI } from '../services/api'
import EntityAttachmentsPanel from '../components/EntityAttachmentsPanel'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

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
const BARCODE_DETECTOR_FORMATS = [
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
    'code_128',
    'code_39',
    'codabar',
    'itf',
    'qr_code'
]

const normalizeUomInput = (value, fallback = 'piece') => {
    const raw = String(value || '').trim()
    if (!raw) return fallback
    const normalized = QUICK_UOM_ALIASES[raw.toLowerCase()] || raw.toLowerCase()
    if (QUICK_UOM_OPTIONS.includes(normalized)) return normalized
    return raw
}

const buildScanLookupKeys = (value, { allowUpcEanFallback = true } = {}) => {
    const raw = String(value || '').trim()
    if (!raw) return []

    const rawLower = raw.toLowerCase()
    const compact = rawLower.replace(/[\s\-_]+/g, '')
    const digitsOnly = compact.replace(/\D+/g, '')
    const keys = new Set([rawLower])

    if (compact) keys.add(compact)
    if (digitsOnly) keys.add(digitsOnly)

    // Barcode readers sometimes return EAN-13 while the system stores UPC-A,
    // or the reverse, by only adding/removing a leading zero.
    if (allowUpcEanFallback && digitsOnly) {
        if (digitsOnly.length === 12) keys.add(`0${digitsOnly}`)
        if (digitsOnly.length === 13 && digitsOnly.startsWith('0')) keys.add(digitsOnly.slice(1))
    }

    return [...keys].filter(Boolean)
}

const formatCodePreview = (codes, limit = 3) => {
    const cleaned = [...new Set((codes || []).map((code) => String(code || '').trim()).filter(Boolean))]
    if (!cleaned.length) return ''

    const preview = cleaned.slice(0, limit).join('، ')
    return cleaned.length > limit ? `${preview} ...` : preview
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
    const [whatsappDialog, setWhatsappDialog] = useState({ open: false, receipt: null, pdfBlob: null, generating: false })
    const [whatsappPhone, setWhatsappPhone] = useState('')
    const [searchFilter, setSearchFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [supplierFilter, setSupplierFilter] = useState('')
    const [warehouseFilter, setWarehouseFilter] = useState('')
    const [fromDateFilter, setFromDateFilter] = useState('')
    const [toDateFilter, setToDateFilter] = useState('')
    const [bulkScanInput, setBulkScanInput] = useState('')
    const [bulkScanQuantity, setBulkScanQuantity] = useState(1)
    const [bulkScanFeedback, setBulkScanFeedback] = useState({ severity: 'info', message: '', misses: [] })
    const [scanDialogOpen, setScanDialogOpen] = useState(false)
    const [scanStatus, setScanStatus] = useState({ severity: 'info', message: 'افتح الكاميرا أو ارفع صورة تحتوي على باركود لقراءته تلقائيًا.' })
    const [cameraRunning, setCameraRunning] = useState(false)
    const [scannerProcessing, setScannerProcessing] = useState(false)
    const [lastDetectedCode, setLastDetectedCode] = useState('')

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
    const cameraVideoRef = useRef(null)
    const fileScanInputRef = useRef(null)
    const cameraStreamRef = useRef(null)
    const scanLoopRef = useRef(null)
    const scanInFlightRef = useRef(false)
    const lastScanRef = useRef({ code: '', at: 0 })

    // Form
    const [paymentAccounts, setPaymentAccounts] = useState([])
    const [loadingPaymentAccounts, setLoadingPaymentAccounts] = useState(false)

    const { control, register, handleSubmit, reset, watch, setValue, getValues, formState: { errors } } = useForm({
        defaultValues: {
            items: [{
                menu_id: '',
                quantity: 1,
                unit_cost: 0,
                batch_number: '',
                production_date: '',
                expiry_date: ''
            }],
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
            const normalizedItems = (data.items || []).filter((item) => Boolean(item?.menu_id?.id || item?.menu_id))

            if (!normalizedItems.length) {
                setSnackbar({
                    open: true,
                    message: 'أضف صنفًا واحدًا على الأقل قبل حفظ الفاتورة',
                    severity: 'error'
                })
                return
            }

            const invalidShelfLifeItem = normalizedItems.find((item) =>
                item.production_date && item.expiry_date && item.expiry_date < item.production_date
            )

            if (invalidShelfLifeItem) {
                const productName = invalidShelfLifeItem.menu_id?.name_ar || 'الصنف المحدد'
                setSnackbar({
                    open: true,
                    message: `تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج للصنف ${productName}`,
                    severity: 'error'
                })
                return
            }

            const payload = {
                ...data,
                items: normalizedItems.map(item => ({
                    menu_id: item.menu_id?.id || item.menu_id,
                    quantity: parseFloat(item.quantity),
                    unit_cost: parseFloat(item.unit_cost),
                    batch_number: item.batch_number || null,
                    production_date: item.production_date || null,
                    expiry_date: item.expiry_date || null
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
            production_date: item.production_date || '',
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
                quantity_received: item.quantity_to_receive,
                batch_number: item.batch_number || null,
                production_date: item.production_date || null,
                expiry_date: item.expiry_date || null
            }))

        if (itemsToReceive.length === 0) {
            setSnackbar({ open: true, message: 'لم يتم تحديد كميات للاستلام', severity: 'warning' })
            return
        }

        const invalidShelfLifeItem = itemsToReceive.find((item) =>
            item.production_date && item.expiry_date && item.expiry_date < item.production_date
        )
        if (invalidShelfLifeItem) {
            const invalidProduct = receiveItems.find((item) => item.id === invalidShelfLifeItem.id)
            setSnackbar({
                open: true,
                message: `تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج للصنف ${invalidProduct?.productName || ''}`.trim(),
                severity: 'error'
            })
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
    const totalLineItems = items.filter((item) => Boolean(item?.menu_id?.id || item?.menu_id)).length
    const totalItemQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) || 0), 0)

    // Build supplier options with "Add New" always at the end
    const supplierOptions = [...suppliers, ADD_NEW_SUPPLIER]
    // Build product options with "Add New" always at the end
    const productOptions = [...products, ADD_NEW_PRODUCT]

    // Find selected supplier object for the controlled Autocomplete
    const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) || null

    const productLookup = useMemo(() => {
        const barcodeMap = new Map()
        const skuMap = new Map()
        const exactMap = new Map()

        for (const product of products) {
            const nameAr = String(product?.name_ar || '').trim().toLowerCase()
            const nameEn = String(product?.name_en || '').trim().toLowerCase()

            buildScanLookupKeys(product?.barcode).forEach((key) => {
                if (!barcodeMap.has(key)) barcodeMap.set(key, product)
            })

            buildScanLookupKeys(product?.sku, { allowUpcEanFallback: false }).forEach((key) => {
                if (!skuMap.has(key)) skuMap.set(key, product)
            })

            if (nameAr) exactMap.set(nameAr, product)
            if (nameEn) exactMap.set(nameEn, product)
        }

        return { barcodeMap, skuMap, exactMap }
    }, [products])

    const resolveProductFromScanToken = useCallback((rawToken) => {
        const token = String(rawToken || '').trim()
        if (!token) return null

        const normalized = token.toLowerCase()
        for (const key of buildScanLookupKeys(token)) {
            const exactBarcode = productLookup.barcodeMap.get(key)
            if (exactBarcode) return exactBarcode
        }

        for (const key of buildScanLookupKeys(token, { allowUpcEanFallback: false })) {
            const exactSku = productLookup.skuMap.get(key)
            if (exactSku) return exactSku
        }

        const exactName = productLookup.exactMap.get(normalized)
        if (exactName) return exactName

        const partialMatches = products.filter((product) => {
            const haystack = [
                product?.name_ar,
                product?.name_en,
                product?.sku,
                product?.barcode
            ].filter(Boolean).join(' ').toLowerCase()

            return haystack.includes(normalized)
        })

        return partialMatches.length === 1 ? partialMatches[0] : null
    }, [productLookup, products])

    const addProductToInvoice = useCallback((product, requestedQuantity = 1) => {
        const quantityToAdd = Math.max(0.01, parseFloat(requestedQuantity) || 1)
        const currentItems = getValues('items') || []
        const existingIndex = currentItems.findIndex((item) => {
            const lineProductId = item?.menu_id?.id || item?.menu_id || ''
            return lineProductId === product.id
        })

        if (existingIndex >= 0) {
            const currentQty = parseFloat(currentItems[existingIndex]?.quantity || 0) || 0
            setValue(`items.${existingIndex}.quantity`, currentQty + quantityToAdd, {
                shouldDirty: true,
                shouldValidate: true
            })
            if (!(parseFloat(currentItems[existingIndex]?.unit_cost || 0) > 0) && parseFloat(product.cost_price || 0) > 0) {
                setValue(`items.${existingIndex}.unit_cost`, parseFloat(product.cost_price), {
                    shouldDirty: true,
                    shouldValidate: true
                })
            }
            return 'incremented'
        }

        const blankIndex = currentItems.findIndex((item) => !(item?.menu_id?.id || item?.menu_id))
        if (blankIndex >= 0) {
            setValue(`items.${blankIndex}.menu_id`, product, { shouldDirty: true, shouldValidate: true })
            setValue(`items.${blankIndex}.quantity`, quantityToAdd, { shouldDirty: true, shouldValidate: true })
            setValue(`items.${blankIndex}.unit_cost`, parseFloat(product.cost_price || 0), {
                shouldDirty: true,
                shouldValidate: true
            })
            return 'added'
        }

        append({
            menu_id: product,
            quantity: quantityToAdd,
            unit_cost: parseFloat(product.cost_price || 0),
            batch_number: '',
            production_date: '',
            expiry_date: ''
        })
        return 'added'
    }, [append, getValues, setValue])

    const parseBulkScanEntries = useCallback((rawValue, defaultQuantity) => {
        const normalizedValue = String(rawValue || '').trim()
        if (!normalizedValue) return []

        const hasBatchSeparators = /[\n,،;]/.test(normalizedValue)
        const rawEntries = hasBatchSeparators
            ? normalizedValue.split(/[\n,،;]+/)
            : [normalizedValue]

        return rawEntries
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
            .map((entry) => {
                const qtyMatch = entry.match(/^(.*?)(?:\s*[*xX]\s*(\d+(?:\.\d+)?))$/)
                if (qtyMatch) {
                    return {
                        token: qtyMatch[1].trim(),
                        quantity: Math.max(0.01, parseFloat(qtyMatch[2]) || 1)
                    }
                }

                return {
                    token: entry,
                    quantity: hasBatchSeparators ? 1 : Math.max(0.01, parseFloat(defaultQuantity) || 1)
                }
            })
    }, [])

    const handleBulkScanSubmit = useCallback(() => {
        const entries = parseBulkScanEntries(bulkScanInput, bulkScanQuantity)
        if (!entries.length) return

        let addedCount = 0
        let incrementedCount = 0
        const misses = []

        for (const entry of entries) {
            const product = resolveProductFromScanToken(entry.token)
            if (!product) {
                misses.push(entry.token)
                continue
            }

            const result = addProductToInvoice(product, entry.quantity)
            if (result === 'incremented') incrementedCount += 1
            else addedCount += 1
        }

        const messageParts = []
        if (addedCount) messageParts.push(`تمت إضافة ${addedCount} صنف`)
        if (incrementedCount) messageParts.push(`تمت زيادة ${incrementedCount} سطر`)
        if (misses.length) {
            const missPreview = formatCodePreview(misses)
            messageParts.push(`تعذر العثور على ${misses.length} كود${missPreview ? `: ${missPreview}` : ''}`)
        }

        const severity = misses.length ? (addedCount || incrementedCount ? 'warning' : 'error') : 'success'
        const message = messageParts.join(' - ') || 'لم يتم تنفيذ أي إضافة'

        setBulkScanFeedback({ severity, message, misses })
        setSnackbar({ open: true, message, severity })
        setBulkScanInput('')
        if (!/[\n,،;]/.test(String(bulkScanInput || '').trim())) {
            setBulkScanQuantity(1)
        }
    }, [addProductToInvoice, bulkScanInput, bulkScanQuantity, parseBulkScanEntries, resolveProductFromScanToken])

    const createBarcodeDetector = useCallback(() => {
        if (typeof window === 'undefined' || !window.BarcodeDetector) return null
        try {
            return new window.BarcodeDetector({ formats: BARCODE_DETECTOR_FORMATS })
        } catch {
            try {
                return new window.BarcodeDetector()
            } catch {
                return null
            }
        }
    }, [])

    const stopCameraScan = useCallback(() => {
        if (scanLoopRef.current) {
            cancelAnimationFrame(scanLoopRef.current)
            scanLoopRef.current = null
        }

        const stream = cameraStreamRef.current
        if (stream) {
            stream.getTracks().forEach((track) => track.stop())
            cameraStreamRef.current = null
        }

        if (cameraVideoRef.current) {
            cameraVideoRef.current.srcObject = null
        }

        scanInFlightRef.current = false
        setCameraRunning(false)
    }, [])

    const applyDetectedCodes = useCallback((codes, source = 'camera') => {
        const normalizedCodes = [...new Set(
            (codes || [])
                .map((code) => String(code || '').trim())
                .filter(Boolean)
        )]
        if (!normalizedCodes.length) return false

        const now = Date.now()
        if (
            normalizedCodes.length === 1 &&
            lastScanRef.current.code === normalizedCodes[0] &&
            (now - lastScanRef.current.at) < 1500
        ) {
            return false
        }

        lastScanRef.current = { code: normalizedCodes[0], at: now }
        const quantityPerCode = normalizedCodes.length > 1 ? 1 : Math.max(0.01, parseFloat(bulkScanQuantity) || 1)
        let addedCount = 0
        let incrementedCount = 0
        const misses = []

        for (const code of normalizedCodes) {
            const product = resolveProductFromScanToken(code)
            if (!product) {
                misses.push(code)
                continue
            }

            const result = addProductToInvoice(product, quantityPerCode)
            if (result === 'incremented') incrementedCount += 1
            else addedCount += 1
        }

        const messageParts = []
        if (addedCount) messageParts.push(`تمت إضافة ${addedCount} صنف`)
        if (incrementedCount) messageParts.push(`تمت زيادة ${incrementedCount} سطر`)
        const missPreview = formatCodePreview(misses)
        if (misses.length) messageParts.push(`تعذر العثور على ${misses.length} كود${missPreview ? `: ${missPreview}` : ''}`)
        const severity = misses.length ? (addedCount || incrementedCount ? 'warning' : 'error') : 'success'
        const message = messageParts.join(' - ') || 'لم يتم تنفيذ أي إضافة'

        setLastDetectedCode(normalizedCodes.join('، '))
        setBulkScanFeedback({ severity, message, misses })
        setSnackbar({ open: true, message, severity })
        setScanStatus({
            severity,
            message: misses.length
                ? `${message}. تم المسح عبر ${source === 'image' ? 'الصورة' : 'الكاميرا'}${missPreview ? `، والكود المقروء: ${missPreview}` : ''}.`
                : `تمت قراءة ${normalizedCodes.length} كود من ${source === 'image' ? 'الصورة' : 'الكاميرا'} وإضافته مباشرة.`
        })
        return true
    }, [addProductToInvoice, bulkScanQuantity, resolveProductFromScanToken])

    const startCameraScan = useCallback(async () => {
        const detector = createBarcodeDetector()
        if (!detector) {
            setScanStatus({
                severity: 'warning',
                message: 'المتصفح الحالي لا يدعم قراءة الباركود بالكاميرا أو من الصورة. استخدم متصفح أحدث مثل Chrome على الهاتف.'
            })
            return
        }

        if (!window.isSecureContext) {
            setScanStatus({
                severity: 'warning',
                message: 'تشغيل الكاميرا يحتاج فتح الصفحة عبر HTTPS أو localhost. على الهاتف استخدم رابط tunnel أو ngrok ثم أعد المحاولة.'
            })
            return
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            setScanStatus({
                severity: 'error',
                message: 'هذا الجهاز أو المتصفح لا يوفّر الوصول إلى الكاميرا.'
            })
            return
        }

        stopCameraScan()
        setScannerProcessing(true)
        setLastDetectedCode('')

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            })

            cameraStreamRef.current = stream
            if (cameraVideoRef.current) {
                cameraVideoRef.current.srcObject = stream
                await cameraVideoRef.current.play().catch(() => {})
            }

            setCameraRunning(true)
            setScanStatus({
                severity: 'info',
                message: 'وجّه الكاميرا نحو الباركود، وسيتم إدخاله تلقائيًا عند التعرف عليه.'
            })

            const scanFrame = async () => {
                const video = cameraVideoRef.current
                if (!cameraStreamRef.current || !video) return

                if (video.readyState < 2 || scanInFlightRef.current) {
                    scanLoopRef.current = requestAnimationFrame(scanFrame)
                    return
                }

                scanInFlightRef.current = true
                try {
                    const detected = await detector.detect(video)
                    if (detected?.length) {
                        applyDetectedCodes(detected.map((item) => item.rawValue), 'camera')
                    }
                } catch {
                    // Ignore transient detector errors and continue scanning
                } finally {
                    scanInFlightRef.current = false
                    if (cameraStreamRef.current) {
                        scanLoopRef.current = requestAnimationFrame(scanFrame)
                    }
                }
            }

            scanLoopRef.current = requestAnimationFrame(scanFrame)
        } catch (err) {
            setScanStatus({
                severity: 'error',
                message: err?.name === 'NotAllowedError'
                    ? 'تم رفض صلاحية الكاميرا. اسمح للمتصفح بالوصول إلى الكاميرا ثم أعد المحاولة.'
                    : 'تعذر تشغيل الكاميرا الآن.'
            })
        } finally {
            setScannerProcessing(false)
        }
    }, [applyDetectedCodes, createBarcodeDetector, stopCameraScan])

    const handleImageScan = useCallback(async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return

        const detector = createBarcodeDetector()
        if (!detector) {
            setScanStatus({
                severity: 'warning',
                message: 'المتصفح الحالي لا يدعم قراءة الباركود من الصور. استخدم متصفح أحدث أو الإدخال اليدوي.'
            })
            return
        }

        setScannerProcessing(true)
        setLastDetectedCode('')

        let objectUrl = null
        let imageSource = null
        try {
            if (window.createImageBitmap) {
                imageSource = await window.createImageBitmap(file)
            } else {
                objectUrl = URL.createObjectURL(file)
                imageSource = await new Promise((resolve, reject) => {
                    const image = new Image()
                    image.onload = () => resolve(image)
                    image.onerror = reject
                    image.src = objectUrl
                })
            }

            const detected = await detector.detect(imageSource)
            if (!detected?.length) {
                setScanStatus({
                    severity: 'warning',
                    message: 'لم يتم العثور على باركود واضح داخل الصورة. جرّب صورة أوضح أو بإضاءة أفضل.'
                })
                return
            }

            applyDetectedCodes(detected.map((item) => item.rawValue), 'image')
        } catch {
            setScanStatus({
                severity: 'error',
                message: 'تعذر تحليل الصورة الحالية. جرّب صورة أوضح أو باركود أقرب.'
            })
        } finally {
            if (imageSource?.close) imageSource.close()
            if (objectUrl) URL.revokeObjectURL(objectUrl)
            setScannerProcessing(false)
        }
    }, [applyDetectedCodes, createBarcodeDetector])

    const openScanDialog = useCallback(() => {
        setScanDialogOpen(true)
        setLastDetectedCode('')
        setScanStatus({
            severity: 'info',
            message: 'اختر المسح بالكاميرا أو ارفع صورة باركود، وسيتم إدخال الكود مباشرة في الفاتورة.'
        })
    }, [])

    const closeScanDialog = useCallback(() => {
        setScanDialogOpen(false)
        stopCameraScan()
    }, [stopCameraScan])

    useEffect(() => {
        if (!scanDialogOpen) {
            stopCameraScan()
        }
    }, [scanDialogOpen, stopCameraScan])

    useEffect(() => () => {
        stopCameraScan()
    }, [stopCameraScan])

    const getStatusInfo = (status) => {
        switch (status) {
            case 'draft': return { label: 'بانتظار الاستلام', color: 'warning', step: 0 }
            case 'partial': return { label: 'استلام جزئي', color: 'info', step: 1 }
            case 'received': return { label: 'مستلم', color: 'success', step: 2 }
            case 'cancelled': return { label: 'ملغي', color: 'error', step: -1 }
            default: return { label: status, color: 'default', step: 0 }
        }
    }

    // ==================== WHATSAPP PDF SHARING ====================
        const openWhatsAppDialog = async (receipt) => {
        const rawPhone = receipt.Supplier?.phone || ''
        setWhatsappPhone(rawPhone)
        setWhatsappDialog({ open: true, receipt, pdfBlob: null, generating: true })
        try {
            const doc = await generateInvoicePDF(receipt)
            const pdfBlob = doc.output('blob')
            setWhatsappDialog(prev => ({ ...prev, pdfBlob, generating: false }))
        } catch (err) {
            console.error('PDF Init Error:', err)
            setSnackbar({ open: true, message: 'فشل في تحضير الفاتورة', severity: 'error' })
            setWhatsappDialog({ open: false, receipt: null, pdfBlob: null, generating: false })
        }
    }

    const generateInvoicePDF = async (receipt) => {
        const { default: html2canvas } = await import('html2canvas')
        const container = document.createElement('div')
        container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;padding:40px;background:#fff;font-family:Tajawal,Cairo,Arial,sans-serif;direction:rtl;color:#222;'
        const dateVal = receipt.createdAt || receipt.created_at || receipt.date
        const dateStr = dateVal ? new Date(dateVal).toLocaleDateString('ar-EG') : '---'
        const statusInfo = getStatusInfo(receipt.status)
        const itemsRows = (receipt.items || []).map((item, idx) => {
            const qty = parseFloat(item.quantity || 0)
            const cost = parseFloat(item.unit_cost || 0)
            return `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;">${idx + 1}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">${item.Menu?.name_ar || item.menu_id || '---'}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;">${qty}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;">${formatCurrency(cost)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;text-align:center;font-weight:600;">${formatCurrency(qty * cost)}</td>
            </tr>`
        }).join('')
        container.innerHTML = `
            <div style="text-align:center;margin-bottom:24px;">
                <h1 style="font-size:26px;margin:0 0 4px;color:#1565c0;">فاتورة مشتريات</h1>
                <p style="margin:0;color:#666;font-size:13px;">Purchase Invoice</p>
            </div>
            <div style="display:flex;justify-content:space-between;background:#f5f7fb;border-radius:10px;padding:16px 20px;margin-bottom:20px;border:1px solid #e3e8f0;">
                <div>
                    <p style="margin:4px 0;font-size:13px;color:#888;">رقم الفاتورة</p>
                    <p style="margin:4px 0;font-size:16px;font-weight:700;color:#1565c0;direction:ltr;text-align:right;">${receipt.receipt_number || '---'}</p>
                    <p style="margin:10px 0 4px;font-size:13px;color:#888;">المورد</p>
                    <p style="margin:4px 0;font-size:15px;font-weight:600;">${receipt.supplier_name || '---'}</p>
                </div>
                <div style="text-align:left;">
                    <p style="margin:4px 0;font-size:13px;color:#888;">التاريخ</p>
                    <p style="margin:4px 0;font-size:15px;font-weight:600;">${dateStr}</p>
                    <p style="margin:10px 0 4px;font-size:13px;color:#888;">المستودع</p>
                    <p style="margin:4px 0;font-size:15px;font-weight:600;">${receipt.Warehouse?.name_ar || '---'}</p>
                </div>
                <div style="text-align:left;">
                    <p style="margin:4px 0;font-size:13px;color:#888;">الحالة</p>
                    <p style="margin:4px 0;font-size:14px;font-weight:700;background:#e3f2fd;color:#1565c0;padding:3px 12px;border-radius:12px;display:inline-block;">${statusInfo.label}</p>
                </div>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <thead>
                    <tr style="background:#1976d2;color:#fff;">
                        <th style="padding:10px 12px;text-align:center;font-size:13px;">#</th>
                        <th style="padding:10px 12px;text-align:right;font-size:13px;">المنتج</th>
                        <th style="padding:10px 12px;text-align:center;font-size:13px;">الكمية</th>
                        <th style="padding:10px 12px;text-align:center;font-size:13px;">سعر الوحدة</th>
                        <th style="padding:10px 12px;text-align:center;font-size:13px;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>${itemsRows}</tbody>
                <tfoot>
                    <tr style="background:#f0f4fa;">
                        <td colspan="4" style="padding:12px;text-align:left;font-weight:800;font-size:15px;">الإجمالي المستحق</td>
                        <td style="padding:12px;text-align:center;font-weight:800;font-size:17px;color:#1565c0;">${formatCurrency(receipt.total_cost)}</td>
                    </tr>
                </tfoot>
            </table>
            <p style="text-align:center;color:#aaa;font-size:11px;margin-top:24px;">تم إنشاء هذه الفاتورة من نظام نقاط البيع \u2014 Zimam POS System</p>
        `
        document.body.appendChild(container)
        try {
            const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
            const imgData = canvas.toDataURL('image/png')
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
            const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight()
            const iw = pw - 20, ih = (canvas.height * iw) / canvas.width
            const fh = Math.min(ih, ph - 20)
            const fw = ih > ph - 20 ? (canvas.width * fh) / canvas.height : iw
            doc.addImage(imgData, 'PNG', 10, 10, fw, fh)
            return doc
        } finally { document.body.removeChild(container) }
    }

        const handleWhatsAppSend = async () => {
        const { receipt, pdfBlob } = whatsappDialog
        if (!receipt || !pdfBlob) return
        try {
            setWhatsappDialog({ open: false, receipt: null, pdfBlob: null, generating: false })
            const fileName = `Invoice_${receipt.receipt_number || 'PUR'}.pdf`
            const textLines = [
                `📄 فاتورة: ${receipt.receipt_number || '---'}`,
                `المورد: ${receipt.supplier_name || '---'}`,
                `الإجمالي: ${formatCurrency(receipt.total_cost)}`,
                `التاريخ: ${(() => { const d = receipt.createdAt || receipt.created_at; return d ? new Date(d).toLocaleDateString('ar-EG') : '---' })()}`,
                '', '👇 الفاتورة PDF مرفقة'
            ].join('\n')
            // تنظيف الرقم ليكون عبارة عن أرقام فقط بدون + أو 00 لأن API الواتساب يرفض الرموز
            let cleanPhone = whatsappPhone.replace(/[^0-9]/g, '')
            if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.substring(2)
            else if (cleanPhone.startsWith('0')) cleanPhone = '2' + cleanPhone

            if (navigator.share && navigator.canShare) {
                const file = new File([pdfBlob], fileName, { type: 'application/pdf' })
                const shareData = { title: `فاتورة ${receipt.receipt_number}`, text: textLines, files: [file] }
                if (navigator.canShare(shareData)) {
                    await navigator.share(shareData)
                    setSnackbar({ open: true, message: 'تم مشاركة الفاتورة بنجاح!', severity: 'success' })
                    return
                }
            }
            const url = URL.createObjectURL(pdfBlob)
            const a = document.createElement('a')
            a.href = url; a.download = fileName
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
            
            const encodedText = encodeURIComponent(textLines)
            // إجبار المتصفح على فتح (WhatsApp Web) مباشرة لتجنب مشاكل تطبيق الويندوز
            const waUrl = cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}` : `https://web.whatsapp.com/send?text=${encodedText}`
            
            // استخدام اسم نافذة محدد (whatsapp_web) بدلاً من _blank لإعادة استخدام نفس التبويب إذا كان مفتوحاً
            window.open(waUrl, 'whatsapp_web')
            
            setSnackbar({ open: true, message: 'تم تحميل الـ PDF. قم بإرفاقه في محادثة الواتساب.', severity: 'info' })
        } catch (err) {
            console.error('WhatsApp share error:', err)
            if (err.name !== 'AbortError') {
                setSnackbar({ open: true, message: `فشل مشاركة الفاتورة: ${err.message}`, severity: 'error' })
            }
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
                        reset({
                            items: [{
                                menu_id: '',
                                quantity: 1,
                                unit_cost: 0,
                                batch_number: '',
                                production_date: '',
                                expiry_date: ''
                            }],
                            payment_method: 'credit',
                            payment_account_code: ''
                        })
                        setBulkScanInput('')
                        setBulkScanQuantity(1)
                        setBulkScanFeedback({ severity: 'info', message: '', misses: [] })
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
                                            <Tooltip title="مشاركة واتساب">
                                                <IconButton onClick={() => openWhatsAppDialog(receipt)} sx={{ color: '#25D366' }}>
                                                    <WhatsAppIcon />
                                                </IconButton>
                                            </Tooltip>
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

                            <Grid item xs={12}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderStyle: 'dashed',
                                        borderColor: 'primary.light',
                                        bgcolor: 'primary.50'
                                    }}
                                >
                                    <Stack
                                        direction={{ xs: 'column', md: 'row' }}
                                        spacing={2}
                                        alignItems={{ xs: 'stretch', md: 'center' }}
                                        justifyContent="space-between"
                                        sx={{ mb: 1.5 }}
                                    >
                                        <Box>
                                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <ScannerIcon color="primary" />
                                                وضعية الإدخال السريع للفواتير الكبيرة
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                امسح الباركود أو أدخل SKU أو اسم الصنف، وسيتم زيادة الكمية تلقائيًا إذا تكرر الصنف.
                                            </Typography>
                                        </Box>
                                        <Stack direction="row" spacing={1} flexWrap="wrap">
                                            <Chip color="primary" variant="outlined" label={`${totalLineItems} سطر`} />
                                            <Chip color="success" variant="outlined" label={`${totalItemQuantity} إجمالي الكمية`} />
                                        </Stack>
                                    </Stack>

                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                        <TextField
                                            label="مسح باركود / SKU / اسم الصنف"
                                            value={bulkScanInput}
                                            onChange={(e) => setBulkScanInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    handleBulkScanSubmit()
                                                }
                                            }}
                                            placeholder="مثال: 123456789 أو SKU-001 أو عدة أكواد كل سطر"
                                            fullWidth
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <ScannerIcon fontSize="small" color="action" />
                                                    </InputAdornment>
                                                )
                                            }}
                                            helperText="يمكن لصق عدة أكواد مفصولة بسطر جديد أو فاصلة، ويمكن استخدام CODE*5 لإضافة كمية مباشرة"
                                        />
                                        <TextField
                                            label="الكمية"
                                            type="number"
                                            value={bulkScanQuantity}
                                            onChange={(e) => setBulkScanQuantity(e.target.value)}
                                            inputProps={{ min: 0.01, step: 1 }}
                                            sx={{ minWidth: { xs: '100%', md: 120 } }}
                                        />
                                        <Button
                                            variant="contained"
                                            onClick={handleBulkScanSubmit}
                                            disabled={!bulkScanInput.trim()}
                                            sx={{ minWidth: { xs: '100%', md: 160 } }}
                                        >
                                            إضافة مباشرة
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            color="secondary"
                                            startIcon={<CameraIcon />}
                                            onClick={openScanDialog}
                                            sx={{ minWidth: { xs: '100%', md: 170 } }}
                                        >
                                            مسح بالكاميرا
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            startIcon={<UploadIcon />}
                                            onClick={openScanDialog}
                                            sx={{ minWidth: { xs: '100%', md: 170 } }}
                                        >
                                            رفع صورة
                                        </Button>
                                    </Stack>

                                    {bulkScanFeedback.message && (
                                        <Alert
                                            severity={bulkScanFeedback.severity}
                                            sx={{ mt: 1.5 }}
                                            onClose={() => setBulkScanFeedback({ severity: 'info', message: '', misses: [] })}
                                        >
                                            <Typography variant="body2">{bulkScanFeedback.message}</Typography>
                                            {bulkScanFeedback.misses.length > 0 && (
                                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                                    الأكواد غير المعروفة: {bulkScanFeedback.misses.join('، ')}
                                                </Typography>
                                            )}
                                        </Alert>
                                    )}
                                    <input
                                        ref={fileScanInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageScan}
                                        style={{ display: 'none' }}
                                    />
                                </Paper>
                            </Grid>

                            {/* ===== ITEMS WITH PRODUCT AUTOCOMPLETE + Quick-Add ===== */}
                            <Grid item xs={12}>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="h6" sx={{ mt: 1, mb: 1 }}>المنتجات</Typography>
                                {fields.map((field, index) => (
                                    <Box
                                        key={field.id}
                                        sx={{
                                            display: 'flex',
                                            gap: 1,
                                            mb: 1,
                                            alignItems: 'flex-start',
                                            flexWrap: 'wrap'
                                        }}
                                    >
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
                                                                    <Box>
                                                                        <Typography>{option.name_ar}</Typography>
                                                                        {(option.sku || option.barcode) && (
                                                                            <Typography variant="caption" color="text.secondary">
                                                                                {[option.sku, option.barcode].filter(Boolean).join(' - ')}
                                                                            </Typography>
                                                                        )}
                                                                    </Box>
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
                                                            const label = [(opt.name_ar || ''), (opt.sku || ''), (opt.barcode || '')].join(' ')
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
                                        <TextField
                                            label="رقم التشغيلة"
                                            size="small"
                                            sx={{ flex: 1, minWidth: 150 }}
                                            {...register(`items.${index}.batch_number`)}
                                        />
                                        <TextField
                                            label="تاريخ الإنتاج"
                                            type="date"
                                            size="small"
                                            sx={{ flex: 1, minWidth: 170 }}
                                            InputLabelProps={{ shrink: true }}
                                            {...register(`items.${index}.production_date`)}
                                        />
                                        <TextField
                                            label="تاريخ الانتهاء"
                                            type="date"
                                            size="small"
                                            sx={{ flex: 1, minWidth: 170 }}
                                            InputLabelProps={{ shrink: true }}
                                            error={Boolean(
                                                watch(`items.${index}.production_date`) &&
                                                watch(`items.${index}.expiry_date`) &&
                                                watch(`items.${index}.expiry_date`) < watch(`items.${index}.production_date`)
                                            )}
                                            helperText={
                                                watch(`items.${index}.production_date`) &&
                                                watch(`items.${index}.expiry_date`) &&
                                                watch(`items.${index}.expiry_date`) < watch(`items.${index}.production_date`)
                                                    ? 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج'
                                                    : 'اختياري'
                                            }
                                            {...register(`items.${index}.expiry_date`)}
                                        />
                                        <IconButton color="error" onClick={() => remove(index)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Box>
                                ))}
                                <Button
                                    startIcon={<AddIcon />}
                                    onClick={() => append({
                                        menu_id: '',
                                        quantity: 1,
                                        unit_cost: 0,
                                        batch_number: '',
                                        production_date: '',
                                        expiry_date: ''
                                    })}
                                >
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

            <Dialog open={scanDialogOpen} onClose={closeScanDialog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ScannerIcon color="primary" />
                    مسح الباركود بالكاميرا أو من صورة
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Alert severity={scanStatus.severity}>
                            <Typography variant="body2">{scanStatus.message}</Typography>
                            {!window.isSecureContext && (
                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                    ملاحظة: الكاميرا على الهاتف لن تعمل من الرابط المحلي `http://192.168...`، ويجب فتح الصفحة عبر HTTPS.
                                </Typography>
                            )}
                        </Alert>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                            <Button
                                variant="contained"
                                startIcon={<CameraIcon />}
                                onClick={startCameraScan}
                                disabled={scannerProcessing}
                                fullWidth
                            >
                                تشغيل الكاميرا
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<UploadIcon />}
                                onClick={() => fileScanInputRef.current?.click()}
                                disabled={scannerProcessing}
                                fullWidth
                            >
                                رفع صورة باركود
                            </Button>
                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<StopIcon />}
                                onClick={stopCameraScan}
                                disabled={!cameraRunning}
                                fullWidth
                            >
                                إيقاف
                            </Button>
                        </Stack>

                        <Paper
                            variant="outlined"
                            sx={{
                                p: 1,
                                borderRadius: 2,
                                bgcolor: 'grey.50'
                            }}
                        >
                            <Box
                                component="video"
                                ref={cameraVideoRef}
                                autoPlay
                                playsInline
                                muted
                                sx={{
                                    width: '100%',
                                    minHeight: 240,
                                    maxHeight: 320,
                                    bgcolor: '#111',
                                    borderRadius: 1.5,
                                    objectFit: 'cover'
                                }}
                            />
                            {!cameraRunning && (
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                                    يمكنك تشغيل الكاميرا لمسح مباشر، أو رفع صورة محفوظة للباركود.
                                </Typography>
                            )}
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                                آخر قراءة
                            </Typography>
                            <Typography variant="body2" color={lastDetectedCode ? 'text.primary' : 'text.secondary'}>
                                {lastDetectedCode || 'لا توجد قراءة بعد'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                                سيتم إدخال الكود مباشرة باستخدام الكمية الحالية: {bulkScanQuantity || 1}
                            </Typography>
                        </Paper>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeScanDialog}>إغلاق</Button>
                </DialogActions>
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
                            <Button
                                variant="contained"
                                sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' }, color: '#fff' }}
                                startIcon={<WhatsAppIcon />}
                                onClick={() => { setViewDialogOpen(false); openWhatsAppDialog(selectedReceipt) }}
                            >
                                مشاركة واتساب
                            </Button>
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
                                    <TableCell align="center" sx={{ minWidth: 140 }}>رقم التشغيلة</TableCell>
                                    <TableCell align="center" sx={{ minWidth: 145 }}>تاريخ الإنتاج</TableCell>
                                    <TableCell align="center" sx={{ minWidth: 145 }}>تاريخ الانتهاء</TableCell>
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
                                        <TableCell align="center">
                                            <TextField
                                                size="small"
                                                value={item.batch_number}
                                                onChange={(e) => {
                                                    const value = e.target.value
                                                    setReceiveItems(prev =>
                                                        prev.map((ri, i) =>
                                                            i === idx ? { ...ri, batch_number: value } : ri
                                                        )
                                                    )
                                                }}
                                                placeholder="اختياري"
                                                sx={{ minWidth: 120 }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <TextField
                                                type="date"
                                                size="small"
                                                value={item.production_date || ''}
                                                onChange={(e) => {
                                                    const value = e.target.value
                                                    setReceiveItems(prev =>
                                                        prev.map((ri, i) =>
                                                            i === idx ? { ...ri, production_date: value } : ri
                                                        )
                                                    )
                                                }}
                                                InputLabelProps={{ shrink: true }}
                                                sx={{ minWidth: 135 }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <TextField
                                                type="date"
                                                size="small"
                                                value={item.expiry_date || ''}
                                                onChange={(e) => {
                                                    const value = e.target.value
                                                    setReceiveItems(prev =>
                                                        prev.map((ri, i) =>
                                                            i === idx ? { ...ri, expiry_date: value } : ri
                                                        )
                                                    )
                                                }}
                                                InputLabelProps={{ shrink: true }}
                                                sx={{ minWidth: 135 }}
                                                error={Boolean(item.production_date && item.expiry_date && item.expiry_date < item.production_date)}
                                                helperText={item.production_date && item.expiry_date && item.expiry_date < item.production_date ? 'الانتهاء قبل الإنتاج' : ' '}
                                            />
                                        </TableCell>
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

            {/* ==================== WHATSAPP PHONE DIALOG ==================== */}
            <Dialog
                open={whatsappDialog.open}
                onClose={() => setWhatsappDialog({ open: false, receipt: null })}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WhatsAppIcon sx={{ color: '#25D366', fontSize: 28 }} />
                    <Typography variant="h6">إرسال الفاتورة عبر واتساب</Typography>
                </DialogTitle>
                <DialogContent>
                    {whatsappDialog.receipt && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            فاتورة: <strong>{whatsappDialog.receipt.receipt_number}</strong> | الإجمالي: <strong>{formatCurrency(whatsappDialog.receipt.total_cost)}</strong>
                        </Alert>
                    )}
                    <TextField
                        autoFocus
                        fullWidth
                        label="رقم الهاتف (واتساب)"
                        placeholder="01xxxxxxxxx"
                        value={whatsappPhone}
                        onChange={(e) => setWhatsappPhone(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && whatsappPhone.trim()) handleWhatsAppSend() }}
                        sx={{ mt: 1 }}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><WhatsAppIcon sx={{ color: '#25D366' }} /></InputAdornment>,
                            sx: { direction: 'ltr' }
                        }}
                        helperText="أدخل رقم الهاتف الذي تريد إرسال الفاتورة إليه"
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setWhatsappDialog({ open: false, receipt: null })}>إلغاء</Button>
                    <Button
                        variant="contained"
                        disabled={!whatsappPhone.trim() || whatsappDialog.generating}
                        onClick={handleWhatsAppSend}
                        sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' }, color: '#fff', borderRadius: 2, px: 4 }}
                        startIcon={whatsappDialog.generating ? <CircularProgress size={20} color="inherit" /> : <WhatsAppIcon />}
                    >
                        {whatsappDialog.generating ? 'جاري التجهيز...' : 'إرسال'}
                    </Button>
                </DialogActions>
            </Dialog>
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
