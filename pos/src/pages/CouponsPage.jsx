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
    MenuItem,
    Paper,
    Snackbar,
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
    Edit as EditIcon,
    LocalOffer as CouponIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material'
import { branchAPI, couponAPI } from '../services/api'

const EMPTY_FORM = {
    id: null,
    code: '',
    name: '',
    discount_type: 'percent',
    discount_value: '',
    min_order_amount: '0',
    max_discount_amount: '',
    usage_limit: '',
    starts_at: '',
    ends_at: '',
    branch_id: '',
    is_active: true,
    notes: ''
}

const toNumber = (value, fallback = 0) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : fallback
}

const toNullableNumber = (value) => {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    const num = Number(raw)
    return Number.isFinite(num) ? num : null
}

const toNullableInt = (value) => {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    const num = parseInt(raw, 10)
    return Number.isInteger(num) ? num : null
}

const toLocalDateTimeInput = (value) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const formatDateTime = (value) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString('ar-SA')
}

export default function CouponsPage() {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [coupons, setCoupons] = useState([])
    const [branches, setBranches] = useState([])
    const [filterSearch, setFilterSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState('all')
    const [filterBranch, setFilterBranch] = useState('')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [form, setForm] = useState(EMPTY_FORM)
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

    const branchNameById = useMemo(() => {
        const map = {}
        for (const b of branches) {
            map[b.id] = b.name_ar || b.name_en || b.id
        }
        return map
    }, [branches])

    const loadBranches = useCallback(async () => {
        try {
            const res = await branchAPI.getAll()
            setBranches(res.data?.data || [])
        } catch (error) {
            setBranches([])
        }
    }, [])

    const loadCoupons = useCallback(async () => {
        try {
            setLoading(true)
            const params = {}
            if (filterBranch) params.branch_id = filterBranch
            const res = await couponAPI.getAll(params)
            setCoupons(res.data?.data || [])
        } catch (error) {
            setSnackbar({
                open: true,
                message: error.response?.data?.message || 'فشل تحميل الكوبونات',
                severity: 'error'
            })
        } finally {
            setLoading(false)
        }
    }, [filterBranch])

    useEffect(() => {
        loadBranches()
    }, [loadBranches])

    useEffect(() => {
        loadCoupons()
    }, [loadCoupons])

    const filteredCoupons = useMemo(() => {
        const term = filterSearch.trim().toLowerCase()
        return coupons.filter((c) => {
            if (filterStatus === 'active' && !c.is_active) return false
            if (filterStatus === 'inactive' && c.is_active) return false
            if (!term) return true
            const code = String(c.code || '').toLowerCase()
            const name = String(c.name || '').toLowerCase()
            return code.includes(term) || name.includes(term)
        })
    }, [coupons, filterSearch, filterStatus])

    const openCreateDialog = () => {
        setForm(EMPTY_FORM)
        setDialogOpen(true)
    }

    const openEditDialog = (coupon) => {
        setForm({
            id: coupon.id,
            code: coupon.code || '',
            name: coupon.name || '',
            discount_type: coupon.discount_type || 'percent',
            discount_value: String(coupon.discount_value ?? ''),
            min_order_amount: String(coupon.min_order_amount ?? 0),
            max_discount_amount: coupon.max_discount_amount == null ? '' : String(coupon.max_discount_amount),
            usage_limit: coupon.usage_limit == null ? '' : String(coupon.usage_limit),
            starts_at: toLocalDateTimeInput(coupon.starts_at),
            ends_at: toLocalDateTimeInput(coupon.ends_at),
            branch_id: coupon.branch_id || '',
            is_active: Boolean(coupon.is_active),
            notes: coupon.notes || ''
        })
        setDialogOpen(true)
    }

    const closeDialog = () => {
        setDialogOpen(false)
        setForm(EMPTY_FORM)
    }

    const buildPayload = () => ({
        code: String(form.code || '').trim().toUpperCase(),
        name: String(form.name || '').trim(),
        discount_type: form.discount_type,
        discount_value: toNumber(form.discount_value, 0),
        min_order_amount: toNumber(form.min_order_amount, 0),
        max_discount_amount: toNullableNumber(form.max_discount_amount),
        usage_limit: toNullableInt(form.usage_limit),
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        branch_id: form.branch_id || null,
        is_active: Boolean(form.is_active),
        notes: String(form.notes || '').trim() || null
    })

    const validateForm = () => {
        const payload = buildPayload()
        if (!payload.code || payload.code.length < 2) return 'يرجى إدخال كود كوبون صحيح'
        if (!payload.name) return 'يرجى إدخال اسم الكوبون'
        if (payload.discount_value <= 0) return 'قيمة الخصم يجب أن تكون أكبر من صفر'
        if (payload.discount_type === 'percent' && payload.discount_value > 100) return 'نسبة الخصم لا يمكن أن تتجاوز 100%'
        if (payload.min_order_amount < 0) return 'الحد الأدنى لا يمكن أن يكون سالبًا'
        if (payload.max_discount_amount != null && payload.max_discount_amount < 0) return 'الحد الأقصى للخصم غير صالح'
        if (payload.usage_limit != null && payload.usage_limit < 1) return 'حد الاستخدام يجب أن يكون 1 أو أكثر'
        if (payload.starts_at && payload.ends_at && new Date(payload.ends_at) < new Date(payload.starts_at)) {
            return 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية'
        }
        return null
    }

    const handleSave = async () => {
        const validationError = validateForm()
        if (validationError) {
            setSnackbar({ open: true, message: validationError, severity: 'warning' })
            return
        }

        const payload = buildPayload()
        try {
            setSaving(true)
            if (form.id) {
                await couponAPI.update(form.id, payload)
                setSnackbar({ open: true, message: 'تم تحديث الكوبون بنجاح', severity: 'success' })
            } else {
                await couponAPI.create(payload)
                setSnackbar({ open: true, message: 'تم إنشاء الكوبون بنجاح', severity: 'success' })
            }
            closeDialog()
            await loadCoupons()
        } catch (error) {
            setSnackbar({
                open: true,
                message: error.response?.data?.message || 'تعذر حفظ الكوبون',
                severity: 'error'
            })
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActive = async (coupon) => {
        try {
            await couponAPI.update(coupon.id, { is_active: !coupon.is_active })
            setSnackbar({
                open: true,
                message: coupon.is_active ? 'تم تعطيل الكوبون' : 'تم تفعيل الكوبون',
                severity: 'success'
            })
            await loadCoupons()
        } catch (error) {
            setSnackbar({
                open: true,
                message: error.response?.data?.message || 'تعذر تغيير حالة الكوبون',
                severity: 'error'
            })
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">إدارة الكوبونات</Typography>
                    <Typography variant="body2" color="text.secondary">
                        إنشاء وتعديل وتفعيل/تعطيل كوبونات الخصم
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadCoupons}>
                        تحديث
                    </Button>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
                        كوبون جديد
                    </Button>
                </Box>
            </Box>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            size="small"
                            label="بحث (الكود / الاسم)"
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            size="small"
                            select
                            label="الحالة"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <MenuItem value="all">الكل</MenuItem>
                            <MenuItem value="active">مفعل</MenuItem>
                            <MenuItem value="inactive">معطل</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            size="small"
                            select
                            label="الفرع"
                            value={filterBranch}
                            onChange={(e) => setFilterBranch(e.target.value)}
                        >
                            <MenuItem value="">الكل</MenuItem>
                            {branches.map((b) => (
                                <MenuItem key={b.id} value={b.id}>{b.name_ar || b.name_en}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                </Grid>
            </Paper>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>الكود</TableCell>
                            <TableCell>الاسم</TableCell>
                            <TableCell>النوع</TableCell>
                            <TableCell>الخصم</TableCell>
                            <TableCell>الحد الأدنى</TableCell>
                            <TableCell>الاستخدام</TableCell>
                            <TableCell>الفرع</TableCell>
                            <TableCell>المدة</TableCell>
                            <TableCell>الحالة</TableCell>
                            <TableCell>إجراءات</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                                    <CircularProgress size={26} />
                                </TableCell>
                            </TableRow>
                        ) : filteredCoupons.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">لا توجد كوبونات</Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredCoupons.map((coupon) => (
                                <TableRow key={coupon.id} hover>
                                    <TableCell>
                                        <Typography fontWeight="bold">{coupon.code}</Typography>
                                    </TableCell>
                                    <TableCell>{coupon.name}</TableCell>
                                    <TableCell>
                                        {coupon.discount_type === 'percent' ? 'نسبي' : 'مبلغ ثابت'}
                                    </TableCell>
                                    <TableCell>
                                        {coupon.discount_type === 'percent'
                                            ? `${toNumber(coupon.discount_value).toFixed(2)}%`
                                            : `${toNumber(coupon.discount_value).toFixed(2)} ر.س`}
                                    </TableCell>
                                    <TableCell>{toNumber(coupon.min_order_amount).toFixed(2)}</TableCell>
                                    <TableCell>
                                        {coupon.used_count || 0}
                                        {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ' / غير محدود'}
                                    </TableCell>
                                    <TableCell>{coupon.branch_id ? (branchNameById[coupon.branch_id] || coupon.branch_id) : 'عام'}</TableCell>
                                    <TableCell>
                                        <Typography variant="caption" display="block">من: {formatDateTime(coupon.starts_at)}</Typography>
                                        <Typography variant="caption" display="block">إلى: {formatDateTime(coupon.ends_at)}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={coupon.is_active ? 'مفعل' : 'معطل'}
                                            color={coupon.is_active ? 'success' : 'default'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title="تعديل">
                                            <IconButton size="small" color="primary" onClick={() => openEditDialog(coupon)}>
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={coupon.is_active ? 'تعطيل' : 'تفعيل'}>
                                            <IconButton size="small" onClick={() => handleToggleActive(coupon)}>
                                                <CouponIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="md" fullWidth>
                <DialogTitle>{form.id ? 'تعديل كوبون' : 'إنشاء كوبون جديد'}</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="كود الكوبون *"
                                value={form.code}
                                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                placeholder="مثال: RAMADAN10"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="اسم الكوبون *"
                                value={form.name}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="مثال: خصم رمضان"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                fullWidth
                                select
                                label="نوع الخصم"
                                value={form.discount_type}
                                onChange={(e) => setForm((prev) => ({ ...prev, discount_type: e.target.value }))}
                            >
                                <MenuItem value="percent">نسبي %</MenuItem>
                                <MenuItem value="fixed">مبلغ ثابت</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                fullWidth
                                type="number"
                                label="قيمة الخصم *"
                                value={form.discount_value}
                                onChange={(e) => setForm((prev) => ({ ...prev, discount_value: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                fullWidth
                                type="number"
                                label="الحد الأدنى للطلب"
                                value={form.min_order_amount}
                                onChange={(e) => setForm((prev) => ({ ...prev, min_order_amount: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                fullWidth
                                type="number"
                                label="حد أقصى للخصم"
                                value={form.max_discount_amount}
                                onChange={(e) => setForm((prev) => ({ ...prev, max_discount_amount: e.target.value }))}
                                placeholder="اختياري"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                fullWidth
                                type="number"
                                label="حد الاستخدام"
                                value={form.usage_limit}
                                onChange={(e) => setForm((prev) => ({ ...prev, usage_limit: e.target.value }))}
                                placeholder="اختياري"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                fullWidth
                                select
                                label="الفرع"
                                value={form.branch_id}
                                onChange={(e) => setForm((prev) => ({ ...prev, branch_id: e.target.value }))}
                            >
                                <MenuItem value="">عام (كل الفروع)</MenuItem>
                                {branches.map((b) => (
                                    <MenuItem key={b.id} value={b.id}>{b.name_ar || b.name_en}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                type="datetime-local"
                                label="بداية الصلاحية"
                                value={form.starts_at}
                                onChange={(e) => setForm((prev) => ({ ...prev, starts_at: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                type="datetime-local"
                                label="نهاية الصلاحية"
                                value={form.ends_at}
                                onChange={(e) => setForm((prev) => ({ ...prev, ends_at: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                minRows={2}
                                label="ملاحظات"
                                value={form.notes}
                                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={form.is_active}
                                        onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                                    />
                                }
                                label="مفعل"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog}>إلغاء</Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving}>
                        {saving ? 'جارٍ الحفظ...' : form.id ? 'حفظ التعديلات' : 'إنشاء'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={3500}
                onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} variant="filled">
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    )
}

