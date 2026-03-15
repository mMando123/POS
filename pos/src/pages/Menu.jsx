import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Grid,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material'
import {
    Add as AddIcon,
    CloudUpload as CloudUploadIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Refresh as RefreshIcon,
    Search as SearchIcon
} from '@mui/icons-material'
import { categoryAPI, menuAPI, uploadAPI } from '../services/api'
import { usePermission, PERMISSIONS } from '../components/ProtectedRoute'

const ITEM_TYPES = ['sellable', 'raw_material', 'consumable']
const UOM_OPTIONS = ['piece', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'portion']
const CUSTOM_UOM_VALUE = '__custom__'
const ADD_UOM_OPTION_SX = {
    borderTop: '1px dashed',
    borderColor: 'primary.light',
    bgcolor: 'primary.50',
    color: 'primary.dark',
    fontWeight: 700,
    '&:hover': { bgcolor: 'primary.100' },
    '&.Mui-selected': { bgcolor: 'primary.100' },
    '&.Mui-selected:hover': { bgcolor: 'primary.200' }
}

const EMPTY_FORM = {
    name_ar: '',
    name_en: '',
    price: '',
    cost_price: '',
    category_id: '',
    sku: '',
    barcode: '',
    image_url: '',
    ingredients: [],
    item_type: 'sellable',
    unit_of_measure: 'piece',
    is_available: true,
    track_stock: true,
    min_stock: 5  // DEF-007: قيمة افتراضية لتفعيل تنبيه نقص المخزون
}


const EMPTY_INGREDIENT_LINE = {
    ingredient_menu_id: '',
    quantity: 1,
    unit: 'piece'
}

const EMPTY_CATEGORY_FORM = {
    name_ar: '',
    name_en: '',
    display_order: 0,
    is_active: true
}

const getErrorMessage = (error, fallback = 'حدث خطأ غير متوقع') =>
    error?.response?.data?.message || error?.message || fallback

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeApiBase = () => {
    let base = import.meta.env.VITE_API_URL || '/api'
    if (base.endsWith('/')) base = base.slice(0, -1)
    if (base.endsWith('/api')) base = base.slice(0, -4)
    return base
}

const resolveImageUrl = (url) => {
    const raw = String(url || '').trim()
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
        return raw
    }

    const base = normalizeApiBase()
    if (!base) return raw.startsWith('/') ? raw : `/${raw}`
    return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`
}

const itemTypeLabel = (type) => {
    if (type === 'sellable') return 'جاهز للبيع'
    if (type === 'raw_material') return 'مادة خام'
    if (type === 'consumable') return 'استهلاكي'
    return type || '-'
}

const uomLabel = (uom) => {
    const map = {
        piece: 'قطعة',
        kg: 'كجم',
        g: 'جم',
        l: 'لتر',
        ml: 'مل',
        box: 'علبة',
        pack: 'باكيت',
        portion: 'وجبة'
    }
    return map[uom] || uom
}

const UOM_ALIASES = {
    liter: 'l',
    litre: 'l',
    liters: 'l',
    litres: 'l',
    kilogram: 'kg',
    kilograms: 'kg',
    gram: 'g',
    grams: 'g'
}

const isPresetUom = (uom) => UOM_OPTIONS.includes(uom)

const normalizeUomInput = (value, fallback = 'piece') => {
    const raw = String(value || '').trim()
    if (!raw) return fallback

    const normalized = UOM_ALIASES[raw.toLowerCase()] || raw.toLowerCase()
    if (isPresetUom(normalized)) {
        return normalized
    }
    return raw
}

const resolveUomSelection = (selectedValue, customValue, fallback = 'piece') => {
    if (selectedValue === CUSTOM_UOM_VALUE) {
        return normalizeUomInput(customValue, '')
    }
    return normalizeUomInput(selectedValue, fallback)
}

const resolveIngredientUnitSelection = (unitOfMeasure) => {
    const normalizedUnit = normalizeUomInput(unitOfMeasure || 'piece', 'piece')
    if (isPresetUom(normalizedUnit)) {
        return { unit: normalizedUnit, custom_unit: '' }
    }
    return { unit: CUSTOM_UOM_VALUE, custom_unit: normalizedUnit }
}

export default function Menu() {
    const canCreate = usePermission(PERMISSIONS.MENU_CREATE)
    const canUpdate = usePermission(PERMISSIONS.MENU_UPDATE)
    const canDelete = usePermission(PERMISSIONS.MENU_DELETE)
    const canManageCategories = usePermission(PERMISSIONS.CATEGORY_MANAGE)

    const [items, setItems] = useState([])
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')

    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [availabilityFilter, setAvailabilityFilter] = useState('all')

    const [dialogOpen, setDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [imageUploading, setImageUploading] = useState(false)
    const [form, setForm] = useState(EMPTY_FORM)
    const [customUom, setCustomUom] = useState('')
    const [formError, setFormError] = useState('')
    const [editingItem, setEditingItem] = useState(null)

    const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
    const [categorySaving, setCategorySaving] = useState(false)
    const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY_FORM)
    const [categoryFormError, setCategoryFormError] = useState('')

    const [deleteTarget, setDeleteTarget] = useState(null)
    const [deleting, setDeleting] = useState(false)

    const fetchData = useCallback(async (silent = false) => {
        if (silent) {
            setRefreshing(true)
        } else {
            setLoading(true)
        }

        try {
            const [menuRes, categoryRes] = await Promise.all([
                menuAPI.getAll(),
                categoryAPI.getAll()
            ])
            setItems(menuRes.data?.data || [])
            setCategories(categoryRes.data?.data || [])
            setError('')
        } catch (err) {
            setError(getErrorMessage(err, 'فشل تحميل بيانات المنيو'))
        } finally {
            if (silent) {
                setRefreshing(false)
            } else {
                setLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        fetchData(false)
    }, [fetchData])

    const categoryMap = useMemo(() => {
        const map = new Map()
        categories.forEach((category) => map.set(category.id, category))
        return map
    }, [categories])

    const ingredientOptions = useMemo(() => {
        const excludedId = editingItem?.id || null
        return items
            .filter((item) => item.track_stock && item.id !== excludedId)
            .map((item) => ({
                id: item.id,
                name_ar: item.name_ar,
                sku: item.sku || '',
                unit_of_measure: normalizeUomInput(item.unit_of_measure || 'piece', 'piece')
            }))
    }, [items, editingItem?.id])

    const ingredientOptionsById = useMemo(() => {
        const map = new Map()
        ingredientOptions.forEach((option) => map.set(option.id, option))
        return map
    }, [ingredientOptions])

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase()
        return items.filter((item) => {
            if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false
            if (availabilityFilter === 'available' && !item.is_available) return false
            if (availabilityFilter === 'unavailable' && item.is_available) return false
            if (!term) return true

            const haystack = [
                item.name_ar,
                item.name_en,
                item.sku,
                item.barcode
            ].filter(Boolean).join(' ').toLowerCase()

            return haystack.includes(term)
        })
    }, [availabilityFilter, categoryFilter, items, search])

    const openCreateDialog = () => {
        setEditingItem(null)
        setForm({ ...EMPTY_FORM, ingredients: [] })
        setCustomUom('')
        setFormError('')
        setDialogOpen(true)
    }

    const openEditDialog = (item) => {
        setEditingItem(item)
        const normalizedItemUom = normalizeUomInput(item.unit_of_measure || 'piece', 'piece')
        const itemHasCustomUom = !isPresetUom(normalizedItemUom)
        const recipeLines = Array.isArray(item.recipeIngredients)
            ? item.recipeIngredients.map((line) => ({
                ingredient_menu_id: line.ingredient_menu_id || '',
                quantity: toNumber(line.quantity, 0) || 1,
                unit: (() => {
                    const normalizedLineUnit = normalizeUomInput(line.unit || 'piece', 'piece')
                    return isPresetUom(normalizedLineUnit) ? normalizedLineUnit : CUSTOM_UOM_VALUE
                })(),
                custom_unit: (() => {
                    const normalizedLineUnit = normalizeUomInput(line.unit || 'piece', 'piece')
                    return isPresetUom(normalizedLineUnit) ? '' : normalizedLineUnit
                })()
            }))
            : []
        setForm({
            name_ar: item.name_ar || '',
            name_en: item.name_en || '',
            price: item.price ?? '',
            cost_price: item.cost_price ?? '',
            category_id: item.category_id || '',
            sku: item.sku || '',
            barcode: item.barcode || '',
            image_url: item.image_url || '',
            ingredients: recipeLines,
            item_type: item.item_type || 'sellable',
            unit_of_measure: itemHasCustomUom ? CUSTOM_UOM_VALUE : normalizedItemUom,
            is_available: Boolean(item.is_available),
            track_stock: Boolean(item.track_stock),
            min_stock: item.min_stock ?? 5  // DEF-007
        })
        setCustomUom(itemHasCustomUom ? normalizedItemUom : '')
        setFormError('')
        setDialogOpen(true)
    }

    const handleImageUpload = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return

        try {
            setImageUploading(true)
            setFormError('')
            const formData = new FormData()
            formData.append('image', file)
            const response = await uploadAPI.uploadImage(formData)
            const uploadedUrl = response.data?.data?.url

            if (!uploadedUrl) {
                throw new Error('لم يتم استلام رابط الصورة من الخادم')
            }

            setForm((prev) => ({ ...prev, image_url: uploadedUrl }))
        } catch (err) {
            setFormError(getErrorMessage(err, 'فشل رفع الصورة'))
        } finally {
            setImageUploading(false)
        }
    }

    const handleCreateCategory = async () => {
        const payload = {
            name_ar: String(categoryForm.name_ar || '').trim(),
            name_en: String(categoryForm.name_en || '').trim() || null,
            display_order: toNumber(categoryForm.display_order, 0),
            is_active: Boolean(categoryForm.is_active)
        }

        if (!payload.name_ar) {
            setCategoryFormError('اسم التصنيف بالعربية مطلوب')
            return
        }

        try {
            setCategorySaving(true)
            setCategoryFormError('')
            const response = await categoryAPI.create(payload)
            const createdId = response.data?.data?.id || ''

            setCategoryDialogOpen(false)
            setCategoryForm({ ...EMPTY_CATEGORY_FORM })
            await fetchData(true)

            if (createdId) {
                setForm((prev) => ({ ...prev, category_id: createdId }))
            }
        } catch (err) {
            setCategoryFormError(getErrorMessage(err, 'فشل إضافة التصنيف'))
        } finally {
            setCategorySaving(false)
        }
    }

    const addIngredientLine = () => {
        setForm((prev) => ({
            ...prev,
            ingredients: [...(Array.isArray(prev.ingredients) ? prev.ingredients : []), { ...EMPTY_INGREDIENT_LINE }]
        }))
    }

    const updateIngredientLine = (index, patch) => {
        setForm((prev) => {
            const next = [...(Array.isArray(prev.ingredients) ? prev.ingredients : [])]
            next[index] = { ...next[index], ...patch }
            return { ...prev, ingredients: next }
        })
    }

    const removeIngredientLine = (index) => {
        setForm((prev) => {
            const next = [...(Array.isArray(prev.ingredients) ? prev.ingredients : [])]
            next.splice(index, 1)
            return { ...prev, ingredients: next }
        })
    }

    const handleSave = async () => {
        const normalizedIngredients = (Array.isArray(form.ingredients) ? form.ingredients : [])
            .map((line) => {
                const ingredientId = String(line.ingredient_menu_id || '').trim()
                const ingredient = ingredientOptionsById.get(ingredientId)
                return {
                    ingredient_menu_id: ingredientId,
                    quantity: toNumber(line.quantity, 0),
                    // Unit is always locked to the selected ingredient base unit.
                    unit: ingredient
                        ? normalizeUomInput(ingredient.unit_of_measure || 'piece', 'piece')
                        : resolveUomSelection(line.unit || 'piece', line.custom_unit || '', '')
                }
            })
            .filter((line) => line.ingredient_menu_id || line.quantity > 0)

        for (const line of normalizedIngredients) {
            if (!line.ingredient_menu_id) {
                setFormError('كل سطر مكونات يجب أن يحتوي على صنف')
                return
            }
            if (!(line.quantity > 0)) {
                setFormError('كمية كل مكون يجب أن تكون أكبر من صفر')
                return
            }
            if (!line.unit) {
                setFormError('وحدة القياس لكل مكون مطلوبة')
                return
            }
            if (String(line.unit).length > 30) {
                setFormError('وحدة قياس المكون يجب ألا تتجاوز 30 حرفًا')
                return
            }
        }

        const rawCostPrice = String(form.cost_price ?? '').trim()
        const parsedCostPrice = rawCostPrice === '' ? 0 : Number(rawCostPrice)
        if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) {
            setFormError('سعر التكلفة يجب أن يكون رقمًا موجبًا أو صفر')
            return
        }

        if (!String(form.category_id || '').trim()) {
            setFormError('التصنيف مطلوب')
            return
        }

        const resolvedUnitOfMeasure = resolveUomSelection(form.unit_of_measure, customUom, '')
        if (!resolvedUnitOfMeasure) {
            setFormError('وحدة القياس مطلوبة')
            return
        }
        if (String(resolvedUnitOfMeasure).length > 20) {
            setFormError('وحدة القياس يجب ألا تتجاوز 20 حرفًا')
            return
        }

        const payload = {
            name_ar: String(form.name_ar || '').trim(),
            name_en: String(form.name_en || '').trim() || null,
            price: toNumber(form.price, 0),
            cost_price: parsedCostPrice,
            category_id: form.category_id,
            sku: String(form.sku || '').trim() || null,
            barcode: String(form.barcode || '').trim() || null,
            image_url: String(form.image_url || '').trim() || null,
            item_type: form.item_type || 'sellable',
            unit_of_measure: resolvedUnitOfMeasure,
            is_available: Boolean(form.is_available),
            track_stock: Boolean(form.track_stock),
            min_stock: toNumber(form.min_stock, 0),  // DEF-007
            ingredients: normalizedIngredients
        }


        if (!payload.name_ar) {
            setFormError('اسم الصنف بالعربية مطلوب')
            return
        }
        if (!Number.isFinite(payload.price) || payload.price < 0) {
            setFormError('السعر يجب أن يكون رقمًا موجبًا أو صفر')
            return
        }

        try {
            setSaving(true)
            setFormError('')

            if (editingItem) {
                await menuAPI.update(editingItem.id, payload)
            } else {
                await menuAPI.create(payload)
            }

            setDialogOpen(false)
            await fetchData(true)
        } catch (err) {
            setFormError(getErrorMessage(err, 'فشل حفظ الصنف'))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteTarget) return

        try {
            setDeleting(true)
            await menuAPI.delete(deleteTarget.id)
            setDeleteTarget(null)
            await fetchData(true)
        } catch (err) {
            setError(getErrorMessage(err, 'فشل حذف الصنف'))
        } finally {
            setDeleting(false)
        }
    }

    if (loading) {
        return (
            <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress />
            </Box>
        )
    }

    return (
        <Stack spacing={2}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={1.5}>
                    <Box sx={{ textAlign: { xs: 'start', md: 'end' }, order: { xs: 1, md: 1 } }}>
                        <Typography variant="h4" fontWeight="bold">إدارة المنيو</Typography>
                        <Typography variant="h6" color="text.secondary">إدارة المنتجات والتصنيفات</Typography>
                    </Box>

                    <Stack direction="row" spacing={1.5} sx={{ order: { xs: 2, md: 0 }, flexWrap: 'wrap' }}>
                        {canCreate && (
                            <Button variant="contained" startIcon={<AddIcon />} sx={{ minWidth: 170 }} onClick={openCreateDialog}>
                                إضافة صنف
                            </Button>
                        )}
                        {canManageCategories && (
                            <Button
                                variant="outlined"
                                startIcon={<AddIcon />}
                                sx={{ minWidth: 170 }}
                                onClick={() => {
                                    setCategoryForm({ ...EMPTY_CATEGORY_FORM })
                                    setCategoryFormError('')
                                    setCategoryDialogOpen(true)
                                }}
                            >
                                إضافة تصنيف
                            </Button>
                        )}
                        <Button variant="outlined" startIcon={<RefreshIcon />} sx={{ minWidth: 170 }} onClick={() => fetchData(true)} disabled={refreshing}>
                            تحديث
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            {error && (
                <Alert severity="error" onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                <Grid container spacing={1.5}>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            label="بحث"
                            placeholder="ابحث بالاسم / الباركود / SKU"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon color="action" />
                                    </InputAdornment>
                                )
                            }}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            select
                            label="التصنيف"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                            <MenuItem value="all">الكل</MenuItem>
                            {categories.map((category) => (
                                <MenuItem key={category.id} value={category.id}>
                                    {category.name_ar}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            select
                            label="حالة التوفر"
                            value={availabilityFilter}
                            onChange={(e) => setAvailabilityFilter(e.target.value)}
                        >
                            <MenuItem value="all">الكل</MenuItem>
                            <MenuItem value="available">متاح</MenuItem>
                            <MenuItem value="unavailable">غير متاح</MenuItem>
                        </TextField>
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ borderRadius: 2 }}>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>الاسم</TableCell>
                                <TableCell>التصنيف</TableCell>
                                <TableCell align="right">السعر</TableCell>
                                <TableCell>النوع</TableCell>
                                <TableCell>الوحدة</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell>الصورة</TableCell>
                                {(canUpdate || canDelete) && <TableCell align="right">الإجراءات</TableCell>}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredItems.map((item) => {
                                const category = item.Category || categoryMap.get(item.category_id)
                                const imageSrc = resolveImageUrl(item.image_url)
                                return (
                                    <TableRow key={item.id} hover>
                                        <TableCell>
                                            <Typography variant="h6" fontWeight={500}>{item.name_ar}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="h6">{category?.name_ar || '-'}</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography variant="h6">{toNumber(item.price).toFixed(2)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="h6">{itemTypeLabel(item.item_type)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="h6">{uomLabel(item.unit_of_measure)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                <Chip
                                                    size="small"
                                                    color={item.is_available ? 'success' : 'default'}
                                                    label={item.is_available ? 'متاح' : 'غير متاح'}
                                                />
                                                {Array.isArray(item.recipeIngredients) && item.recipeIngredients.length > 0 && (
                                                    <Chip size="small" color="info" variant="outlined" label="تجميعي" />
                                                )}
                                                {item.track_stock && <Chip size="small" variant="outlined" color="warning" label="مخزون" />}
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            {imageSrc ? (
                                                <Box
                                                    component="img"
                                                    src={imageSrc}
                                                    alt={item.name_ar}
                                                    sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}
                                                />
                                            ) : (
                                                <Typography color="text.secondary">-</Typography>
                                            )}
                                        </TableCell>
                                        {(canUpdate || canDelete) && (
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    {canDelete && (
                                                        <Tooltip title="حذف">
                                                            <IconButton color="error" onClick={() => setDeleteTarget(item)}>
                                                                <DeleteIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {canUpdate && (
                                                        <Tooltip title="تعديل">
                                                            <IconButton onClick={() => openEditDialog(item)}>
                                                                <EditIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                )
                            })}

                            {!filteredItems.length && (
                                <TableRow>
                                    <TableCell colSpan={canUpdate || canDelete ? 8 : 7}>
                                        <Typography align="center" color="text.secondary" sx={{ py: 3 }}>
                                            لا توجد عناصر مطابقة
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Dialog open={dialogOpen} onClose={() => !saving && !imageUploading && setDialogOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>{editingItem ? 'تعديل صنف' : 'إضافة صنف جديد'}</DialogTitle>
                <DialogContent>
                    <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                required
                                label="الاسم بالعربي"
                                value={form.name_ar}
                                onChange={(e) => setForm((prev) => ({ ...prev, name_ar: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="الاسم بالإنجليزي"
                                value={form.name_en}
                                onChange={(e) => setForm((prev) => ({ ...prev, name_en: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                required
                                type="number"
                                label="السعر"
                                value={form.price}
                                inputProps={{ min: 0, step: '0.01' }}
                                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                type="number"
                                label="سعر التكلفة"
                                value={form.cost_price}
                                inputProps={{ min: 0, step: '0.01' }}
                                onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                required
                                select
                                label="التصنيف"
                                value={form.category_id}
                                onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
                            >
                                <MenuItem value="" disabled>اختر تصنيف</MenuItem>
                                {categories
                                    .filter((category) => category.is_active)
                                    .map((category) => (
                                        <MenuItem key={category.id} value={category.id}>
                                            {category.name_ar}
                                        </MenuItem>
                                    ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={8}>
                            <TextField
                                fullWidth
                                label="رابط الصورة"
                                placeholder="/uploads/example.png أو https://..."
                                value={form.image_url}
                                onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Button
                                component="label"
                                variant="outlined"
                                startIcon={<CloudUploadIcon />}
                                fullWidth
                                sx={{ height: '56px' }}
                                disabled={imageUploading}
                            >
                                {imageUploading ? 'جارٍ الرفع...' : 'رفع صورة'}
                                <input hidden type="file" accept="image/*" onChange={handleImageUpload} />
                            </Button>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="SKU"
                                value={form.sku}
                                onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Barcode"
                                value={form.barcode}
                                onChange={(e) => setForm((prev) => ({ ...prev, barcode: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                select
                                label="نوع الصنف"
                                value={form.item_type}
                                onChange={(e) => setForm((prev) => ({ ...prev, item_type: e.target.value }))}
                            >
                                {ITEM_TYPES.map((type) => (
                                    <MenuItem key={type} value={type}>
                                        {itemTypeLabel(type)}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Stack spacing={1}>
                                <TextField
                                    fullWidth
                                    select
                                    label="وحدة القياس"
                                    value={form.unit_of_measure}
                                    onChange={(e) => {
                                        const nextValue = e.target.value
                                        setForm((prev) => ({ ...prev, unit_of_measure: nextValue }))
                                        if (nextValue !== CUSTOM_UOM_VALUE) {
                                            setCustomUom('')
                                        }
                                    }}
                                >
                                    {UOM_OPTIONS.map((uom) => (
                                        <MenuItem key={uom} value={uom}>
                                            {uomLabel(uom)}
                                        </MenuItem>
                                    ))}
                                    <MenuItem value={CUSTOM_UOM_VALUE} sx={ADD_UOM_OPTION_SX}>+ إضافة وحدة جديدة</MenuItem>
                                </TextField>
                                {form.unit_of_measure === CUSTOM_UOM_VALUE && (
                                    <TextField
                                        fullWidth
                                        label="الوحدة المخصصة"
                                        value={customUom}
                                        onChange={(e) => setCustomUom(e.target.value)}
                                        placeholder="مثال: كيس، رول، ربطة"
                                    />
                                )}
                            </Stack>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <Stack direction="row" spacing={3} sx={{ pt: 1 }}>
                                <FormControlLabel
                                    control={(
                                        <Switch
                                            checked={Boolean(form.is_available)}
                                            onChange={(e) => setForm((prev) => ({ ...prev, is_available: e.target.checked }))}
                                        />
                                    )}
                                    label="متاح للبيع"
                                />
                                <FormControlLabel
                                    control={(
                                        <Switch
                                            checked={Boolean(form.track_stock)}
                                            onChange={(e) => setForm((prev) => ({ ...prev, track_stock: e.target.checked }))}
                                        />
                                    )}
                                    label="تتبع المخزون"
                                />
                            </Stack>
                            {form.track_stock && (
                                <TextField
                                    fullWidth
                                    type="number"
                                    label="الحد الأدنى للتنبيه (min_stock)"
                                    helperText="يُرسَل تنبيه نقص عندما يصل المخزون لهذا الحد"
                                    value={form.min_stock ?? 5}
                                    inputProps={{ min: 0, step: 1 }}
                                    onChange={(e) => setForm((prev) => ({ ...prev, min_stock: e.target.value }))}
                                    sx={{ mt: 1 }}
                                />
                            )}
                            {Array.isArray(form.ingredients) && form.ingredients.length > 0 && (

                                <Typography variant="caption" color="warning.main">
                                    {form.track_stock
                                        ? 'وضع مخزني: البيع سيخصم من مخزون الصنف نفسه، واستخدم عملية تصنيع لزيادة الرصيد من المكونات.'
                                        : 'وضع غير مخزني: البيع سيخصم مباشرة من مخزون المكونات.'}
                                </Typography>
                            )}
                        </Grid>

                        <Grid item xs={12}>
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                                    <Box>
                                        <Typography variant="subtitle1" fontWeight="bold">مكونات الصنف التجميعي (اختياري)</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            يمكن استخدام المكونات بطريقتين: غير مخزني (خصم المكونات عند البيع) أو مخزني (تصنيع ثم خصم مخزون الصنف عند البيع).
                                        </Typography>
                                    </Box>
                                    <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addIngredientLine}>
                                        إضافة مكون
                                    </Button>
                                </Stack>

                                {!Array.isArray(form.ingredients) || form.ingredients.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">
                                        لا توجد مكونات. الصنف سيعمل كصنف عادي.
                                    </Typography>
                                ) : (
                                    <Stack spacing={1}>
                                        {form.ingredients.map((line, index) => {
                                            const selectedIngredient = ingredientOptionsById.get(line.ingredient_menu_id || '')
                                            const selectedIngredientUnit = selectedIngredient
                                                ? normalizeUomInput(selectedIngredient.unit_of_measure || 'piece', 'piece')
                                                : ''

                                            return (
                                                <Grid container spacing={1} key={`ingredient-line-${index}`}>
                                                    <Grid item xs={12} md={6}>
                                                        <TextField
                                                            fullWidth
                                                            select
                                                            label="المكون"
                                                            value={line.ingredient_menu_id || ''}
                                                            helperText={selectedIngredientUnit ? `الوحدة الأساسية: ${uomLabel(selectedIngredientUnit)}` : ''}
                                                            onChange={(e) => {
                                                                const ingredientId = e.target.value
                                                                const option = ingredientOptionsById.get(ingredientId)
                                                                const unitState = resolveIngredientUnitSelection(option?.unit_of_measure)
                                                                updateIngredientLine(index, { ingredient_menu_id: ingredientId, ...unitState })
                                                            }}
                                                        >
                                                            {ingredientOptions.map((opt) => (
                                                                <MenuItem key={opt.id} value={opt.id}>
                                                                    {opt.name_ar}{opt.sku ? ` (${opt.sku})` : ''} - {uomLabel(opt.unit_of_measure)}
                                                                </MenuItem>
                                                            ))}
                                                        </TextField>
                                                    </Grid>
                                                    <Grid item xs={6} md={3}>
                                                        <TextField
                                                            fullWidth
                                                            type="number"
                                                            inputProps={{ min: 0.001, step: '0.001' }}
                                                            label="الكمية"
                                                            value={line.quantity}
                                                            onChange={(e) => updateIngredientLine(index, { quantity: e.target.value })}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={4} md={2}>
                                                        <TextField
                                                            fullWidth
                                                            label="الوحدة"
                                                            value={uomLabel(selectedIngredientUnit || normalizeUomInput(line.unit || 'piece', 'piece'))}
                                                            InputProps={{ readOnly: true }}
                                                            helperText={selectedIngredient ? 'تلقائي حسب وحدة الصنف الخام' : 'اختر المكون أولاً'}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={2} md={1} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <IconButton color="error" onClick={() => removeIngredientLine(index)}>
                                                            <DeleteIcon />
                                                        </IconButton>
                                                    </Grid>
                                                </Grid>
                                            )
                                        })}
                                    </Stack>
                                )}
                            </Paper>
                        </Grid>

                        {form.image_url && (
                            <Grid item xs={12}>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    معاينة الصورة
                                </Typography>
                                <Box
                                    component="img"
                                    src={resolveImageUrl(form.image_url)}
                                    alt="معاينة الصورة"
                                    sx={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
                                />
                            </Grid>
                        )}
                    </Grid>

                    {formError && <Alert severity="error" sx={{ mt: 2 }}>{formError}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)} disabled={saving || imageUploading}>إلغاء</Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving || imageUploading}>
                        {saving ? 'جارٍ الحفظ...' : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={categoryDialogOpen} onClose={() => !categorySaving && setCategoryDialogOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>إضافة تصنيف جديد</DialogTitle>
                <DialogContent>
                    <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                required
                                label="اسم التصنيف بالعربي"
                                value={categoryForm.name_ar}
                                onChange={(e) => setCategoryForm((prev) => ({ ...prev, name_ar: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="اسم التصنيف بالإنجليزي"
                                value={categoryForm.name_en}
                                onChange={(e) => setCategoryForm((prev) => ({ ...prev, name_en: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                type="number"
                                label="ترتيب العرض"
                                value={categoryForm.display_order}
                                onChange={(e) => setCategoryForm((prev) => ({ ...prev, display_order: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={(
                                    <Switch
                                        checked={Boolean(categoryForm.is_active)}
                                        onChange={(e) => setCategoryForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                                    />
                                )}
                                label="تصنيف نشط"
                            />
                        </Grid>
                    </Grid>
                    {categoryFormError && <Alert severity="error" sx={{ mt: 2 }}>{categoryFormError}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCategoryDialogOpen(false)} disabled={categorySaving}>إلغاء</Button>
                    <Button variant="contained" onClick={handleCreateCategory} disabled={categorySaving}>
                        {categorySaving ? 'جارٍ الإضافة...' : 'إضافة التصنيف'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)}>
                <DialogTitle>تأكيد الحذف</DialogTitle>
                <DialogContent>
                    <Typography>
                        هل تريد حذف الصنف "{deleteTarget?.name_ar}"؟
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        ملاحظة: لا يمكن حذف الصنف إذا كان له كمية بالمخزون أو مستخدم في وصفة صنف آخر.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>إلغاء</Button>
                    <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
                        {deleting ? 'جارٍ الحذف...' : 'حذف'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    )
}
