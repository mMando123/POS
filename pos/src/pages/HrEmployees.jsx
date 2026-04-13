import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Box,
    Typography,
    Paper,
    Stack,
    Grid,
    TextField,
    MenuItem,
    Button,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Chip,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    CircularProgress,
    FormControl,
    InputLabel,
    Select,
    FormControlLabel,
    Switch
} from '@mui/material'
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material'
import { hrAPI, userAPI } from '../services/api'

const defaultForm = {
    first_name_ar: '',
    last_name_ar: '',
    first_name_en: '',
    last_name_en: '',
    email: '',
    phone: '',
    date_of_joining: new Date().toISOString().slice(0, 10),
    department_id: '',
    designation_id: '',
    employment_type: 'full_time',
    status: 'active',
    base_salary: '',
    user_id: '',
    is_delivery: false
}

const statusLabel = {
    active: 'نشط',
    inactive: 'غير نشط',
    on_leave: 'إجازة',
    terminated: 'منتهي'
}

const MetricCard = ({ title, value, subtitle, color = '#1976d2' }) => (
    <Paper sx={{ p: 2.25, borderRadius: 2, borderInlineStart: `4px solid ${color}`, height: '100%' }}>
        <Typography variant="body2" color="text.secondary">{title}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.75 }}>{value}</Typography>
        {subtitle && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                {subtitle}
            </Typography>
        )}
    </Paper>
)

export default function HrEmployees() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [rows, setRows] = useState([])
    const [departments, setDepartments] = useState([])
    const [designations, setDesignations] = useState([])
    const [users, setUsers] = useState([])
    const [openDialog, setOpenDialog] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form, setForm] = useState(defaultForm)

    const designationOptions = useMemo(() => {
        if (!form.department_id) return designations
        return designations.filter((d) => d.department_id === form.department_id)
    }, [designations, form.department_id])

    const employeeInsights = useMemo(() => {
        const activeCount = rows.filter((row) => row.status === 'active').length
        const linkedUsers = rows.filter((row) => row.userAccount?.id).length
        const deliveryCount = rows.filter((row) => row.deliveryProfile?.is_active).length
        const onLeaveCount = rows.filter((row) => row.status === 'on_leave').length

        return {
            total: rows.length,
            activeCount,
            linkedUsers,
            deliveryCount,
            onLeaveCount
        }
    }, [rows])

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const [employeesRes, departmentsRes, designationsRes, usersRes] = await Promise.all([
                hrAPI.getEmployees({ search: search || undefined, status: status || undefined, limit: 200 }),
                hrAPI.getDepartments({ status: 'active', limit: 200 }),
                hrAPI.getDesignations({ status: 'active' }),
                userAPI.getAll({ limit: 200 })
            ])
            setRows(employeesRes.data?.data || [])
            setDepartments(departmentsRes.data?.data || [])
            setDesignations(designationsRes.data?.data || [])
            setUsers(usersRes.data?.data || [])
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل بيانات الموظفين')
        } finally {
            setLoading(false)
        }
    }, [search, status])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleOpenCreate = () => {
        setEditing(null)
        setForm(defaultForm)
        setOpenDialog(true)
    }

    const handleOpenEdit = (row) => {
        setEditing(row)
        setForm({
            first_name_ar: row.first_name_ar || '',
            last_name_ar: row.last_name_ar || '',
            first_name_en: row.first_name_en || '',
            last_name_en: row.last_name_en || '',
            email: row.email || '',
            phone: row.phone || '',
            date_of_joining: row.date_of_joining ? String(row.date_of_joining).slice(0, 10) : new Date().toISOString().slice(0, 10),
            department_id: row.department_id || '',
            designation_id: row.designation_id || '',
            employment_type: row.employment_type || 'full_time',
            status: row.status || 'active',
            base_salary: '',
            user_id: row.user_id || row.userAccount?.id || '',
            is_delivery: !!(row.deliveryProfile?.is_active)
        })
        setOpenDialog(true)
    }

    const handleSave = async () => {
        try {
            setSaving(true)
            const payload = { ...form }
            if (!payload.base_salary) delete payload.base_salary
            if (editing) {
                await hrAPI.updateEmployee(editing.id, payload)
            } else {
                await hrAPI.createEmployee(payload)
            }
            setOpenDialog(false)
            fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر حفظ الموظف')
        } finally {
            setSaving(false)
        }
    }

    const handleDeactivate = async (row) => {
        if (!window.confirm(`تأكيد تعطيل الموظف: ${row.first_name_ar} ${row.last_name_ar} ؟`)) return
        try {
            await hrAPI.deactivateEmployee(row.id)
            fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تعطيل الموظف')
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>إدارة الموظفين</Typography>
                    <Typography color="text.secondary">إضافة وتحديث ومتابعة الموظفين</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}>تحديث</Button>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>موظف جديد</Button>
                </Stack>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="إجمالي الموظفين"
                        value={employeeInsights.total}
                        subtitle="السجلات الظاهرة حسب الفلتر الحالي"
                        color="#1565c0"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="الموظفون النشطون"
                        value={employeeInsights.activeCount}
                        subtitle={`في إجازة: ${employeeInsights.onLeaveCount}`}
                        color="#2e7d32"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="حسابات مرتبطة"
                        value={employeeInsights.linkedUsers}
                        subtitle="موظفون مرتبطون بمستخدم نظام"
                        color="#00838f"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="موظفو التوصيل"
                        value={employeeInsights.deliveryCount}
                        subtitle="الحسابات المفعلة كدليفري"
                        color="#ef6c00"
                    />
                </Grid>
            </Grid>

            <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>فلاتر الموظفين</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                        label="بحث (كود/اسم/هاتف/إيميل)"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        fullWidth
                    />
                    <TextField
                        label="الحالة"
                        select
                        sx={{ minWidth: 180 }}
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        <MenuItem value="active">نشط</MenuItem>
                        <MenuItem value="inactive">غير نشط</MenuItem>
                        <MenuItem value="on_leave">إجازة</MenuItem>
                        <MenuItem value="terminated">منتهي</MenuItem>
                    </TextField>
                </Stack>
            </Paper>

            <Paper sx={{ overflowX: 'auto', borderRadius: 2 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>سجل الموظفين</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {employeeInsights.total} موظف | النشطون {employeeInsights.activeCount} | المرتبطون بالنظام {employeeInsights.linkedUsers}
                    </Typography>
                </Box>
                {loading ? (
                    <Box sx={{ p: 5, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>الكود</TableCell>
                                <TableCell>الاسم</TableCell>
                                <TableCell>القسم</TableCell>
                                <TableCell>المسمى</TableCell>
                                <TableCell>الهاتف</TableCell>
                                <TableCell>تاريخ التعيين</TableCell>
                                <TableCell>المستخدم</TableCell>
                                <TableCell>توصيل؟</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell align="center">إجراء</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow><TableCell colSpan={8} align="center">لا توجد بيانات</TableCell></TableRow>
                            ) : rows.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell>{row.employee_code}</TableCell>
                                    <TableCell>{`${row.first_name_ar} ${row.last_name_ar}`}</TableCell>
                                    <TableCell>{row.department?.name_ar || '-'}</TableCell>
                                    <TableCell>{row.designation?.title_ar || '-'}</TableCell>
                                    <TableCell>{row.phone || '-'}</TableCell>
                                    <TableCell>{row.date_of_joining ? String(row.date_of_joining).slice(0, 10) : '-'}</TableCell>
                                    <TableCell>{row.userAccount?.username || '-'}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={row.deliveryProfile?.is_active ? 'نعم' : 'لا'}
                                            color={row.deliveryProfile?.is_active ? 'info' : 'default'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={statusLabel[row.status] || row.status}
                                            color={row.status === 'active' ? 'success' : 'default'}
                                        />
                                    </TableCell>
                                    <TableCell align="center">
                                        <IconButton color="primary" onClick={() => handleOpenEdit(row)}><EditIcon /></IconButton>
                                        <IconButton color="error" onClick={() => handleDeactivate(row)}><DeleteIcon /></IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Paper>

            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle>{editing ? 'تعديل موظف' : 'إضافة موظف جديد'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField label="الاسم الأول (عربي)" fullWidth value={form.first_name_ar} onChange={(e) => setForm({ ...form, first_name_ar: e.target.value })} />
                            <TextField label="اسم العائلة (عربي)" fullWidth value={form.last_name_ar} onChange={(e) => setForm({ ...form, last_name_ar: e.target.value })} />
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField label="الاسم الأول (English)" fullWidth value={form.first_name_en} onChange={(e) => setForm({ ...form, first_name_en: e.target.value })} />
                            <TextField label="اسم العائلة (English)" fullWidth value={form.last_name_en} onChange={(e) => setForm({ ...form, last_name_en: e.target.value })} />
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField label="البريد الإلكتروني" fullWidth value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                            <TextField label="الهاتف" fullWidth value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                                label="القسم"
                                select
                                fullWidth
                                value={form.department_id}
                                onChange={(e) => setForm({ ...form, department_id: e.target.value, designation_id: '' })}
                            >
                                <MenuItem value="">-</MenuItem>
                                {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name_ar}</MenuItem>)}
                            </TextField>
                            <TextField
                                label="المسمى"
                                select
                                fullWidth
                                value={form.designation_id}
                                onChange={(e) => setForm({ ...form, designation_id: e.target.value })}
                            >
                                <MenuItem value="">-</MenuItem>
                                {designationOptions.map((d) => <MenuItem key={d.id} value={d.id}>{d.title_ar}</MenuItem>)}
                            </TextField>
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                                label="نوع التوظيف"
                                select
                                fullWidth
                                value={form.employment_type}
                                onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                            >
                                <MenuItem value="full_time">دوام كامل</MenuItem>
                                <MenuItem value="part_time">دوام جزئي</MenuItem>
                                <MenuItem value="contract">عقد</MenuItem>
                                <MenuItem value="temporary">مؤقت</MenuItem>
                            </TextField>
                            <TextField
                                label="الحالة"
                                select
                                fullWidth
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                            >
                                <MenuItem value="active">نشط</MenuItem>
                                <MenuItem value="inactive">غير نشط</MenuItem>
                                <MenuItem value="on_leave">إجازة</MenuItem>
                                <MenuItem value="terminated">منتهي</MenuItem>
                            </TextField>
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                                label="تاريخ التعيين"
                                type="date"
                                fullWidth
                                value={form.date_of_joining}
                                InputLabelProps={{ shrink: true }}
                                onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })}
                            />
                            <TextField
                                label="راتب أساسي (اختياري عند الإنشاء)"
                                type="number"
                                fullWidth
                                value={form.base_salary}
                                onChange={(e) => setForm({ ...form, base_salary: e.target.value })}
                            />
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="center">
                            <FormControl fullWidth>
                                <InputLabel>ربط بحساب مستخدم (اختياري)</InputLabel>
                                <Select
                                    value={form.user_id}
                                    label="ربط بحساب مستخدم (اختياري)"
                                    onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                                >
                                    <MenuItem value="">بدون ربط (مستقل)</MenuItem>
                                    {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.username} - {u.name_ar}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={form.is_delivery}
                                        onChange={(e) => setForm({ ...form, is_delivery: e.target.checked })}
                                    />
                                }
                                label="تعيين كموظف ديليفري"
                                sx={{ width: '100%' }}
                            />
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDialog(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving || !form.first_name_ar || !form.last_name_ar}>
                        {saving ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
