import { useState, useEffect } from 'react'
import {
    Box,
    Typography,
    Button,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControlLabel,
    Switch,
    Alert,
    CircularProgress,
    Grid,
    Card,
    CardContent,
    MenuItem,
    Tooltip,
    InputAdornment
} from '@mui/material'
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Store as StoreIcon,
    LocationOn as LocationIcon,
    Inventory2 as InventoryIcon
} from '@mui/icons-material'
import { inventoryAPI, warehouseAPI, branchAPI } from '../services/api'
import { useForm } from 'react-hook-form'
import { useThemeConfig } from '../contexts/ThemeContext'
import { toReadableText } from '../utils/textSanitizer'
import { useNavigate } from 'react-router-dom'

const getCurrentBranchId = (warehouses = []) => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}')
        return user?.branch_id || user?.branchId || warehouses[0]?.branchId || null
    } catch {
        return warehouses[0]?.branchId || null
    }
}

export default function Warehouses() {
    const { formatCurrency } = useThemeConfig()
    const navigate = useNavigate()
    const currentUser = (() => {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}')
        } catch {
            return {}
        }
    })()
    const isAdminUser = currentUser?.role === 'admin'
    const [warehouses, setWarehouses] = useState([])
    const [branches, setBranches] = useState([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingWarehouse, setEditingWarehouse] = useState(null)
    const [error, setError] = useState('')

    const [addItemDialogOpen, setAddItemDialogOpen] = useState(false)
    const [itemWarehouse, setItemWarehouse] = useState(null)
    const [products, setProducts] = useState([])
    const [productsLoading, setProductsLoading] = useState(false)
    const [addingItem, setAddingItem] = useState(false)
    const [itemForm, setItemForm] = useState({
        menu_id: '',
        quantity_change: '',
        unit_cost: '',
        reason: ''
    })

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm()

    const fetchWarehouses = async () => {
        try {
            setLoading(true)
            const response = await warehouseAPI.getAll()
            setWarehouses(response.data.data || [])
            setError('')
        } catch (err) {
            setError('فشل في جلب بيانات المستودعات')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const fetchProducts = async () => {
        try {
            setProductsLoading(true)
            const response = await inventoryAPI.getProducts({ track_stock: true })
            setProducts(response.data?.data || [])
        } catch (err) {
            console.error('Failed to fetch inventory products:', err)
            setError('فشل في جلب الأصناف')
        } finally {
            setProductsLoading(false)
        }
    }

    useEffect(() => {
        fetchWarehouses()
        if (isAdminUser) {
            fetchBranches()
        }
    }, [])

    const fetchBranches = async () => {
        try {
            const response = await branchAPI.getAll()
            setBranches(response.data?.data || [])
        } catch (err) {
            console.error('Failed to fetch branches:', err)
        }
    }

    const handleOpenDialog = (warehouse = null) => {
        setEditingWarehouse(warehouse)
        if (warehouse) {
            setValue('name_ar', toReadableText(warehouse.nameAr, warehouse.nameEn))
            setValue('name_en', toReadableText(warehouse.nameEn))
            setValue('location', toReadableText(warehouse.location))
            setValue('is_default', warehouse.isDefault)
            setValue('status', warehouse.status === 'active')
            setValue('branch_id', warehouse.branchId || '')
        } else {
            reset({
                name_ar: '',
                name_en: '',
                location: '',
                is_default: false,
                branch_id: getCurrentBranchId(warehouses) || '',
                status: true
            })
        }
        setDialogOpen(true)
    }

    const handleOpenAddItemDialog = async (warehouse) => {
        setItemWarehouse(warehouse)
        setItemForm({
            menu_id: '',
            quantity_change: '',
            unit_cost: '',
            reason: `إضافة صنف إلى مستودع ${toReadableText(warehouse?.nameAr, warehouse?.nameEn || '')}`
        })
        setAddItemDialogOpen(true)

        if (products.length === 0) {
            await fetchProducts()
        }
    }

    const handleCloseAddItemDialog = () => {
        setAddItemDialogOpen(false)
        setItemWarehouse(null)
        setItemForm({ menu_id: '', quantity_change: '', unit_cost: '', reason: '' })
    }

    const onSubmit = async (data) => {
        try {
            const branchId = getCurrentBranchId(warehouses)
            if (!editingWarehouse && !branchId) {
                setError('لا يمكن تحديد الفرع الحالي لإنشاء المستودع')
                return
            }

            const payload = {
                ...data,
                status: data.status ? 'active' : 'inactive',
                ...(isAdminUser ? { branch_id: data.branch_id || branchId } : { branch_id: branchId })
            }

            if (editingWarehouse) {
                await warehouseAPI.update(editingWarehouse.id, payload)
            } else {
                await warehouseAPI.create(payload)
            }

            setDialogOpen(false)
            fetchWarehouses()
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.message || 'فشل في حفظ المستودع')
        }
    }

    const handleAddItemToWarehouse = async () => {
        if (!itemWarehouse?.id) {
            setError('لم يتم تحديد المستودع')
            return
        }

        const quantity = parseFloat(itemForm.quantity_change)
        const unitCost = itemForm.unit_cost === '' ? undefined : parseFloat(itemForm.unit_cost)

        if (!itemForm.menu_id) {
            setError('يرجى اختيار الصنف')
            return
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            setError('يرجى إدخال كمية صحيحة أكبر من صفر')
            return
        }
        if (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0)) {
            setError('يرجى إدخال تكلفة وحدة صحيحة')
            return
        }
        if (!itemForm.reason.trim()) {
            setError('يرجى إدخال سبب الإضافة')
            return
        }

        try {
            setAddingItem(true)
            await inventoryAPI.adjust({
                menu_id: itemForm.menu_id,
                warehouse_id: itemWarehouse.id,
                adjustment_type: 'count',
                quantity_change: quantity,
                ...(unitCost !== undefined ? { unit_cost: unitCost } : {}),
                reason: itemForm.reason.trim()
            })

            handleCloseAddItemDialog()
            await fetchWarehouses()
            setError('')
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.message || 'فشل في إضافة الصنف إلى المستودع')
        } finally {
            setAddingItem(false)
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('هل أنت متأكد من إلغاء تفعيل هذا المستودع؟')) return

        try {
            await warehouseAPI.delete(id)
            fetchWarehouses()
        } catch (err) {
            setError(err.response?.data?.message || 'فشل في حذف المستودع')
        }
    }

    const handleOpenWarehouseStock = (warehouse) => {
        if (!warehouse?.id) return
        const params = new URLSearchParams({
            warehouse_id: warehouse.id,
            tab: 'stock'
        })
        navigate(`/inventory?${params.toString()}`)
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" fontWeight="bold">
                    <StoreIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    إدارة المستودعات
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                >
                    مستودع جديد
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Alert severity="info" sx={{ mb: 2 }}>
                المستودع الافتراضي يتم تحديده لكل فرع بشكل مستقل، وليس افتراضيًا عامًا لكل النظام.
            </Alert>

            <Grid container spacing={3}>
                {loading ? (
                    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : warehouses.length === 0 ? (
                    <Box sx={{ width: '100%', textAlign: 'center', p: 4 }}>
                        <Typography color="text.secondary">لا توجد مستودعات</Typography>
                    </Box>
                ) : (
                    warehouses.map((warehouse) => {
                        const displayNameAr = toReadableText(warehouse.nameAr, warehouse.nameEn)
                        const displayNameEn = toReadableText(warehouse.nameEn)
                        const displayLocation = toReadableText(warehouse.location, 'غير محدد')

                        return (
                            <Grid item xs={12} md={6} lg={4} key={warehouse.id}>
                                <Card sx={{
                                    height: '100%',
                                    position: 'relative',
                                    border: warehouse.isDefault ? '2px solid #1976d2' : 'none',
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                    '&:hover': {
                                        transform: 'translateY(-2px)',
                                        boxShadow: 4
                                    }
                                }}
                                onClick={() => handleOpenWarehouseStock(warehouse)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        handleOpenWarehouseStock(warehouse)
                                    }
                                }}
                                >
                                    {warehouse.isDefault && (
                                        <Box sx={{
                                            position: 'absolute',
                                            top: 10,
                                            left: 10,
                                            bgcolor: 'primary.main',
                                            color: 'white',
                                            px: 1,
                                            borderRadius: 1,
                                            fontSize: '0.75rem'
                                        }}>
                                            افتراضي للفرع
                                        </Box>
                                    )}
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Box>
                                                <Typography variant="h6" fontWeight="bold">
                                                    {displayNameAr}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                                    {displayNameEn}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    الفرع: {toReadableText(warehouse.branchName, 'غير محدد')}
                                                    {warehouse.branchId ? ` (${String(warehouse.branchId).slice(0, 8)})` : ''}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Tooltip title="إضافة صنف للمستودع">
                                                    <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); handleOpenAddItemDialog(warehouse) }}>
                                                        <InventoryIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="تعديل بيانات المستودع">
                                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenDialog(warehouse) }}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                {!warehouse.isDefault && (
                                                    <Tooltip title="إلغاء تفعيل المستودع">
                                                        <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDelete(warehouse.id) }}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        </Box>

                                        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                            <LocationIcon fontSize="small" />
                                            <Typography variant="body2">{displayLocation}</Typography>
                                        </Box>

                                        <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                                            <Grid container textAlign="center">
                                                <Grid item xs={6}>
                                                    <Typography variant="caption" color="text.secondary">عدد الأصناف</Typography>
                                                    <Typography variant="body1" fontWeight="bold">
                                                        {warehouse.stats?.productCount || 0}
                                                    </Typography>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <Typography variant="caption" color="text.secondary">إجمالي القيمة</Typography>
                                                    <Typography variant="body1" fontWeight="bold" color="primary.main">
                                                        {formatCurrency(warehouse.stats?.totalValue || 0)}
                                                    </Typography>
                                                </Grid>
                                            </Grid>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        )
                    })
                )}
            </Grid>

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <DialogTitle>
                        {editingWarehouse ? 'تعديل مستودع' : 'إضافة مستودع جديد'}
                    </DialogTitle>
                    <DialogContent>
                        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <TextField
                                label="الاسم بالعربية"
                                fullWidth
                                {...register('name_ar', { required: 'هذا الحقل مطلوب' })}
                                error={!!errors.name_ar}
                                helperText={errors.name_ar?.message}
                            />
                            <TextField
                                label="الاسم بالإنجليزية"
                                fullWidth
                                {...register('name_en')}
                            />
                            <TextField
                                label="الموقع / العنوان"
                                fullWidth
                                {...register('location')}
                            />

                            {isAdminUser && (
                                <TextField
                                    select
                                    label="الفرع"
                                    fullWidth
                                    {...register('branch_id', { required: 'الفرع مطلوب' })}
                                    error={!!errors.branch_id}
                                    helperText={errors.branch_id?.message}
                                >
                                    {branches.map((branch) => (
                                        <MenuItem key={branch.id} value={branch.id}>
                                            {toReadableText(branch.name_ar, branch.name_en)} ({String(branch.id).slice(0, 8)})
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}

                            <FormControlLabel
                                control={<Switch {...register('is_default')} checked={!!watch('is_default')} />}
                                label="تعيين كمستودع افتراضي لهذا الفرع"
                            />

                            <FormControlLabel
                                control={<Switch {...register('status')} checked={watch('status') !== false && watch('status') !== undefined ? true : false} />}
                                label="نشط"
                            />
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setDialogOpen(false)}>إلغاء</Button>
                        <Button type="submit" variant="contained">حفظ</Button>
                    </DialogActions>
                </form>
            </Dialog>

            <Dialog open={addItemDialogOpen} onClose={handleCloseAddItemDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    إضافة صنف إلى {toReadableText(itemWarehouse?.nameAr, itemWarehouse?.nameEn || 'المستودع')}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            select
                            fullWidth
                            label="الصنف"
                            value={itemForm.menu_id}
                            onChange={(e) => setItemForm((prev) => ({ ...prev, menu_id: e.target.value }))}
                            disabled={productsLoading}
                            helperText={productsLoading ? 'جاري تحميل الأصناف...' : ''}
                        >
                            {products.map((p) => {
                                const nameAr = toReadableText(p.name_ar, p.name_en)
                                const sku = toReadableText(p.sku)
                                const label = sku ? `${nameAr} - ${sku}` : nameAr
                                return (
                                    <MenuItem key={p.id} value={p.id}>{label}</MenuItem>
                                )
                            })}
                        </TextField>

                        <TextField
                            label="الكمية المضافة"
                            type="number"
                            value={itemForm.quantity_change}
                            onChange={(e) => setItemForm((prev) => ({ ...prev, quantity_change: e.target.value }))}
                            inputProps={{ min: 0.01, step: 0.01 }}
                            required
                        />

                        <TextField
                            label="تكلفة الوحدة (اختياري)"
                            type="number"
                            value={itemForm.unit_cost}
                            onChange={(e) => setItemForm((prev) => ({ ...prev, unit_cost: e.target.value }))}
                            inputProps={{ min: 0, step: 0.01 }}
                            InputProps={{
                                endAdornment: <InputAdornment position="end">EGP</InputAdornment>
                            }}
                        />

                        <TextField
                            label="سبب الإضافة"
                            value={itemForm.reason}
                            onChange={(e) => setItemForm((prev) => ({ ...prev, reason: e.target.value }))}
                            multiline
                            minRows={2}
                            required
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAddItemDialog} disabled={addingItem}>إلغاء</Button>
                    <Button
                        variant="contained"
                        onClick={handleAddItemToWarehouse}
                        disabled={addingItem || productsLoading}
                    >
                        {addingItem ? 'جاري الإضافة...' : 'إضافة'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
