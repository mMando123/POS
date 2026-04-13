import { useState, useEffect, useCallback, useMemo } from 'react'
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
    Tooltip,
    Stack,
    InputAdornment
} from '@mui/material'
import {
    Add as AddIcon,
    Visibility as ViewIcon,
    Delete as DeleteIcon,
    SwapHoriz as TransferIcon,
    Check as CheckIcon,
    Cancel as CancelIcon,
    LocalShipping as ShippingIcon,
    QrCodeScanner as ScannerIcon
} from '@mui/icons-material'
import { transferAPI, warehouseAPI, inventoryAPI } from '../services/api'
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
    const [bulkScanInput, setBulkScanInput] = useState('')
    const [bulkScanQuantity, setBulkScanQuantity] = useState(1)
    const [bulkScanFeedback, setBulkScanFeedback] = useState({ severity: 'info', message: '', misses: [], stockIssues: [] })

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
                inventoryAPI.getProducts({ track_stock: 'true' })
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

    const totalTransferLines = newTransfer.items.length
    const totalTransferQuantity = newTransfer.items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) || 0), 0)

    const productLookup = useMemo(() => {
        const barcodeMap = new Map()
        const skuMap = new Map()
        const exactMap = new Map()

        for (const product of products) {
            const barcode = String(product?.barcode || '').trim().toLowerCase()
            const sku = String(product?.sku || '').trim().toLowerCase()
            const nameAr = String(product?.name_ar || '').trim().toLowerCase()
            const nameEn = String(product?.name_en || '').trim().toLowerCase()

            if (barcode) barcodeMap.set(barcode, product)
            if (sku) skuMap.set(sku, product)
            if (nameAr) exactMap.set(nameAr, product)
            if (nameEn) exactMap.set(nameEn, product)
        }

        return { barcodeMap, skuMap, exactMap }
    }, [products])

    const resolveProductFromScanToken = useCallback((rawToken) => {
        const token = String(rawToken || '').trim()
        if (!token) return null

        const normalized = token.toLowerCase()
        const exactBarcode = productLookup.barcodeMap.get(normalized)
        if (exactBarcode) return exactBarcode

        const exactSku = productLookup.skuMap.get(normalized)
        if (exactSku) return exactSku

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

    const addTransferItemByProduct = useCallback((product, requestedQuantity = 1) => {
        const available = parseFloat(stockLevels[product.id] || 0) || 0
        const quantityToAdd = Math.max(0.01, parseFloat(requestedQuantity) || 1)

        if (available <= 0) {
            return { status: 'insufficient_stock', available }
        }

        const existingIndex = newTransfer.items.findIndex((item) => item.menu_id === product.id)
        if (existingIndex >= 0) {
            const nextQuantity = (parseFloat(newTransfer.items[existingIndex]?.quantity || 0) || 0) + quantityToAdd
            if (nextQuantity > available) {
                return { status: 'insufficient_stock', available }
            }

            setNewTransfer((prev) => ({
                ...prev,
                items: prev.items.map((item, index) => (
                    index === existingIndex ? { ...item, quantity: nextQuantity, available } : item
                ))
            }))
            return { status: 'incremented', available }
        }

        if (quantityToAdd > available) {
            return { status: 'insufficient_stock', available }
        }

        setNewTransfer((prev) => ({
            ...prev,
            items: [...prev.items, {
                menu_id: product.id,
                quantity: quantityToAdd,
                productName: product?.name_ar || '',
                available,
                sku: product?.sku || '',
                barcode: product?.barcode || ''
            }]
        }))

        return { status: 'added', available }
    }, [newTransfer.items, stockLevels])

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
        if (!newTransfer.from_warehouse_id) {
            setError('اختر المستودع المصدر أولًا قبل المسح السريع')
            return
        }

        const entries = parseBulkScanEntries(bulkScanInput, bulkScanQuantity)
        if (!entries.length) return

        let addedCount = 0
        let incrementedCount = 0
        const misses = []
        const stockIssues = []

        for (const entry of entries) {
            const product = resolveProductFromScanToken(entry.token)
            if (!product) {
                misses.push(entry.token)
                continue
            }

            const result = addTransferItemByProduct(product, entry.quantity)
            if (result.status === 'incremented') incrementedCount += 1
            else if (result.status === 'added') addedCount += 1
            else stockIssues.push(`${product.name_ar} (المتاح ${result.available})`)
        }

        const messageParts = []
        if (addedCount) messageParts.push(`تمت إضافة ${addedCount} صنف`)
        if (incrementedCount) messageParts.push(`تمت زيادة ${incrementedCount} سطر`)
        if (misses.length) messageParts.push(`تعذر العثور على ${misses.length} كود`)
        if (stockIssues.length) messageParts.push(`يوجد ${stockIssues.length} صنف بدون رصيد كافٍ`)

        const severity = (misses.length || stockIssues.length)
            ? (addedCount || incrementedCount ? 'warning' : 'error')
            : 'success'
        const message = messageParts.join(' - ') || 'لم يتم تنفيذ أي إضافة'

        setBulkScanFeedback({ severity, message, misses, stockIssues })
        setError(null)
        setBulkScanInput('')
        if (!/[\n,،;]/.test(String(bulkScanInput || '').trim())) {
            setBulkScanQuantity(1)
        }
    }, [addTransferItemByProduct, bulkScanInput, bulkScanQuantity, newTransfer.from_warehouse_id, parseBulkScanEntries, resolveProductFromScanToken])

    const handleOpenCreate = () => {
        setNewTransfer({
            from_warehouse_id: warehouses[0]?.id || '',
            to_warehouse_id: '',
            notes: '',
            items: []
        })
        setNewItem({ menu_id: '', quantity: 1 })
        setBulkScanInput('')
        setBulkScanQuantity(1)
        setBulkScanFeedback({ severity: 'info', message: '', misses: [], stockIssues: [] })
        setOpenCreate(true)
    }

    const handleAddItem = () => {
        if (!newItem.menu_id || newItem.quantity <= 0) return

        const product = products.find(p => p.id === newItem.menu_id)
        if (!product) {
            setError('الصنف المحدد غير موجود')
            return
        }

        const result = addTransferItemByProduct(product, newItem.quantity)
        if (result.status === 'insufficient_stock') {
            setError(`الكمية المطلوبة (${newItem.quantity}) أكبر من المتوفر (${result.available})`)
            return
        }

        setError(null)
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

            const payload = {
                ...newTransfer,
                items: newTransfer.items.map((item) => ({
                    menu_id: item.menu_id,
                    quantity: parseFloat(item.quantity)
                }))
            }

            await transferAPI.create(payload)
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
                            onChange={(e) => {
                                setNewTransfer({ ...newTransfer, from_warehouse_id: e.target.value, items: [] })
                                setNewItem({ menu_id: '', quantity: 1 })
                                setBulkScanInput('')
                                setBulkScanQuantity(1)
                                setBulkScanFeedback({ severity: 'info', message: '', misses: [], stockIssues: [] })
                            }}
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

                    <Paper
                        variant="outlined"
                        sx={{
                            p: 2,
                            mb: 3,
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
                                    وضعية الإدخال السريع للتحويل
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    امسح الباركود أو أدخل SKU أو اسم الصنف، وسيتم دمج السطر تلقائيًا إذا كان موجودًا بالفعل داخل التحويل.
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                                <Chip color="primary" variant="outlined" label={`${totalTransferLines} سطر`} />
                                <Chip color="success" variant="outlined" label={`${totalTransferQuantity} إجمالي الكمية`} />
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
                                disabled={!newTransfer.from_warehouse_id}
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
                                disabled={!newTransfer.from_warehouse_id}
                            />
                            <Button
                                variant="contained"
                                onClick={handleBulkScanSubmit}
                                disabled={!bulkScanInput.trim() || !newTransfer.from_warehouse_id}
                                sx={{ minWidth: { xs: '100%', md: 160 } }}
                            >
                                إضافة مباشرة
                            </Button>
                        </Stack>

                        {bulkScanFeedback.message && (
                            <Alert
                                severity={bulkScanFeedback.severity}
                                sx={{ mt: 1.5 }}
                                onClose={() => setBulkScanFeedback({ severity: 'info', message: '', misses: [], stockIssues: [] })}
                            >
                                <Typography variant="body2">{bulkScanFeedback.message}</Typography>
                                {bulkScanFeedback.misses.length > 0 && (
                                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                        الأكواد غير المعروفة: {bulkScanFeedback.misses.join('، ')}
                                    </Typography>
                                )}
                                {bulkScanFeedback.stockIssues.length > 0 && (
                                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                        أصناف بدون رصيد كافٍ: {bulkScanFeedback.stockIssues.join('، ')}
                                    </Typography>
                                )}
                            </Alert>
                        )}
                    </Paper>

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
                            filterOptions={(options, params) => {
                                const search = String(params.inputValue || '').toLowerCase()
                                return options.filter((opt) => {
                                    const label = [
                                        opt.name_ar || '',
                                        opt.name_en || '',
                                        opt.sku || '',
                                        opt.barcode || ''
                                    ].join(' ').toLowerCase()
                                    return label.includes(search)
                                })
                            }}
                            renderOption={(props, option) => {
                                const stock = stockLevels[option.id] || 0
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
                                            <Chip size="small" label={`المتاح: ${stock}`} color={stock > 0 ? 'success' : 'default'} variant="outlined" />
                                        </Box>
                                    </li>
                                )
                            }}
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
                                            <TableCell>
                                                <Typography fontWeight="bold">{item.productName}</Typography>
                                                {(item.sku || item.barcode) && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {[item.sku, item.barcode].filter(Boolean).join(' - ')}
                                                    </Typography>
                                                )}
                                            </TableCell>
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
