import { useState, useEffect, useCallback } from 'react'
import {
    Box, Typography, Paper, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
    Chip, CircularProgress, Alert, InputAdornment, Avatar, Tooltip
} from '@mui/material'
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    DeliveryDining as DeliveryIcon,
    Phone as PhoneIcon,
    History as HistoryIcon,
    Search as SearchIcon
} from '@mui/icons-material'
import { deliveryAPI } from '../services/api'
import { useForm, Controller } from 'react-hook-form'
import toast from 'react-hot-toast'

const VEHICLE_OPTIONS = [
    { value: 'motorcycle', label: '🛵 دراجة نارية' },
    { value: 'car', label: '🚗 سيارة' },
    { value: 'bicycle', label: '🚲 دراجة هوائية' },
    { value: 'foot', label: '🚶 مشياً' },
]

const STATUS_COLORS = { available: 'success', busy: 'warning', offline: 'default' }
const STATUS_LABELS = { available: 'متاح', busy: 'مشغول', offline: 'أوفلاين' }

export default function DeliveryManagement() {
    const [personnel, setPersonnel] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [openDialog, setOpenDialog] = useState(false)
    const [editing, setEditing] = useState(null)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(null)
    const [historyDialog, setHistoryDialog] = useState({ open: false, person: null, data: [] })
    const [error, setError] = useState(null)

    const { control, handleSubmit, reset, formState: { errors } } = useForm({
        defaultValues: {
            name_ar: '', name_en: '', phone: '',
            vehicle_type: 'motorcycle', vehicle_number: '', notes: ''
        }
    })

    const fetchPersonnel = useCallback(async () => {
        try {
            setLoading(true)
            const res = await deliveryAPI.getPersonnel()
            setPersonnel(res.data.data || [])
            setError(null)
        } catch (e) {
            setError('خطأ في جلب بيانات موظفي الديليفري')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchPersonnel() }, [fetchPersonnel])

    const handleOpen = (person = null) => {
        setEditing(person)
        reset(person ? {
            name_ar: person.name_ar || '',
            name_en: person.name_en || '',
            phone: person.phone || '',
            vehicle_type: person.vehicle_type || 'motorcycle',
            vehicle_number: person.vehicle_number || '',
            notes: person.notes || ''
        } : { name_ar: '', name_en: '', phone: '', vehicle_type: 'motorcycle', vehicle_number: '', notes: '' })
        setOpenDialog(true)
    }

    const onSubmit = async (data) => {
        try {
            setSaving(true)
            if (editing) {
                await deliveryAPI.updatePersonnel(editing.id, data)
                toast.success('تم تحديث بيانات الديليفري')
            } else {
                await deliveryAPI.createPersonnel(data)
                toast.success('تم إضافة موظف الديليفري بنجاح')
            }
            setOpenDialog(false)
            fetchPersonnel()
        } catch (e) {
            toast.error(e.response?.data?.message || 'حدث خطأ')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id) => {
        try {
            setDeleting(id)
            await deliveryAPI.deletePersonnel(id)
            toast.success('تم تعطيل الموظف')
            fetchPersonnel()
        } catch (e) {
            toast.error(e.response?.data?.message || 'خطأ في الحذف')
        } finally {
            setDeleting(null)
        }
    }

    const handleStatusChange = async (id, status) => {
        try {
            await deliveryAPI.updatePersonnelStatus(id, status)
            fetchPersonnel()
        } catch (e) {
            toast.error('خطأ في تغيير الحالة')
        }
    }

    const handleHistory = async (person) => {
        try {
            const res = await deliveryAPI.getPersonnelHistory(person.id)
            setHistoryDialog({ open: true, person, data: res.data.data || [] })
        } catch (e) {
            toast.error('خطأ في جلب السجل')
        }
    }

    const filtered = personnel.filter(p =>
        p.name_ar?.includes(search) ||
        p.phone?.includes(search) ||
        p.name_en?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                <DeliveryIcon sx={{ fontSize: 36, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h5" fontWeight="bold">إدارة موظفي الديليفري</Typography>
                    <Typography variant="body2" color="text.secondary">
                        إضافة وإدارة موظفي التوصيل وتتبع أدائهم
                    </Typography>
                </Box>
                <Button
                    variant="contained" startIcon={<AddIcon />} sx={{ ml: 'auto' }}
                    onClick={() => handleOpen()}
                >
                    إضافة موظف
                </Button>
            </Box>

            {/* Stats Cards */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                {[
                    { label: 'إجمالي الموظفين', value: personnel.filter(p => p.is_active).length, color: 'primary' },
                    { label: 'متاح', value: personnel.filter(p => p.status === 'available' && p.is_active).length, color: 'success' },
                    { label: 'مشغول', value: personnel.filter(p => p.status === 'busy').length, color: 'warning' },
                    { label: 'أوفلاين', value: personnel.filter(p => p.status === 'offline' && p.is_active).length, color: 'default' },
                ].map(stat => (
                    <Paper key={stat.label} elevation={1} sx={{ p: 2, borderRadius: 2, flex: '1 1 150px', textAlign: 'center' }}>
                        <Typography variant="h4" fontWeight="bold" color={`${stat.color}.main`}>{stat.value}</Typography>
                        <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
                    </Paper>
                ))}
            </Box>

            {/* Search */}
            <TextField
                fullWidth size="small" placeholder="بحث بالاسم أو الهاتف..."
                value={search} onChange={e => setSearch(e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Table */}
            <TableContainer component={Paper} elevation={1} sx={{ borderRadius: 2 }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                            <TableCell><b>الموظف</b></TableCell>
                            <TableCell><b>الهاتف</b></TableCell>
                            <TableCell><b>المركبة</b></TableCell>
                            <TableCell><b>الحالة</b></TableCell>
                            <TableCell align="center"><b>الإجراءات</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center"><CircularProgress size={32} /></TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center">
                                    <Typography color="text.secondary">لا يوجد موظفون</Typography>
                                </TableCell>
                            </TableRow>
                        ) : filtered.map(person => (
                            <TableRow key={person.id} sx={{ opacity: person.is_active ? 1 : 0.5 }}>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
                                            {person.name_ar?.charAt(0)}
                                        </Avatar>
                                        <Box>
                                            <Typography variant="body2" fontWeight="bold">{person.name_ar}</Typography>
                                            {person.name_en && <Typography variant="caption" color="text.secondary">{person.name_en}</Typography>}
                                        </Box>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Chip icon={<PhoneIcon />} label={person.phone} size="small" variant="outlined" />
                                </TableCell>
                                <TableCell>
                                    {VEHICLE_OPTIONS.find(v => v.value === person.vehicle_type)?.label}
                                    {person.vehicle_number && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{person.vehicle_number}</Typography>}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        label={STATUS_LABELS[person.status] || person.status}
                                        color={STATUS_COLORS[person.status] || 'default'}
                                        onClick={() => {
                                            const next = person.status === 'available' ? 'offline' : 'available'
                                            handleStatusChange(person.id, next)
                                        }}
                                        sx={{ cursor: 'pointer' }}
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    <Tooltip title="السجل">
                                        <IconButton size="small" onClick={() => handleHistory(person)}>
                                            <HistoryIcon />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="تعديل">
                                        <IconButton size="small" color="primary" onClick={() => handleOpen(person)}>
                                            <EditIcon />
                                        </IconButton>
                                    </Tooltip>
                                    {person.is_active && (
                                        <Tooltip title="تعطيل">
                                            <IconButton
                                                size="small" color="error"
                                                onClick={() => handleDelete(person.id)}
                                                disabled={deleting === person.id}
                                            >
                                                {deleting === person.id ? <CircularProgress size={16} /> : <DeleteIcon />}
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Add/Edit Dialog */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editing ? 'تعديل موظف الديليفري' : 'إضافة موظف ديليفري جديد'}</DialogTitle>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <DialogContent>
                        <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
                            <Controller name="name_ar" control={control}
                                rules={{ required: 'الاسم بالعربي مطلوب' }}
                                render={({ field }) => (
                                    <TextField {...field} label="الاسم بالعربي *" fullWidth
                                        error={!!errors.name_ar} helperText={errors.name_ar?.message} />
                                )}
                            />
                            <Controller name="name_en" control={control}
                                render={({ field }) => <TextField {...field} label="الاسم بالإنجليزي" fullWidth />}
                            />
                            <Controller name="phone" control={control}
                                rules={{ required: 'رقم الهاتف مطلوب' }}
                                render={({ field }) => (
                                    <TextField {...field} label="رقم الهاتف *" fullWidth
                                        error={!!errors.phone} helperText={errors.phone?.message}
                                        InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon /></InputAdornment> }}
                                    />
                                )}
                            />
                            <Controller name="vehicle_type" control={control}
                                render={({ field }) => (
                                    <TextField {...field} select label="نوع المركبة" fullWidth>
                                        {VEHICLE_OPTIONS.map(v => <MenuItem key={v.value} value={v.value}>{v.label}</MenuItem>)}
                                    </TextField>
                                )}
                            />
                            <Controller name="vehicle_number" control={control}
                                render={({ field }) => <TextField {...field} label="رقم اللوحة (اختياري)" fullWidth />}
                            />
                            <Controller name="notes" control={control}
                                render={({ field }) => <TextField {...field} label="ملاحظات" fullWidth multiline rows={2} />}
                            />
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenDialog(false)}>إلغاء</Button>
                        <Button variant="contained" type="submit" disabled={saving}>
                            {saving ? <CircularProgress size={22} /> : (editing ? 'حفظ التعديلات' : 'إضافة')}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* History Dialog */}
            <Dialog open={historyDialog.open} onClose={() => setHistoryDialog({ open: false, person: null, data: [] })} maxWidth="md" fullWidth>
                <DialogTitle>سجل طلبات: {historyDialog.person?.name_ar}</DialogTitle>
                <DialogContent>
                    {historyDialog.data.length === 0 ? (
                        <Alert severity="info">لا يوجد طلبات سابقة</Alert>
                    ) : (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>رقم الطلب</TableCell>
                                    <TableCell>الإجمالي</TableCell>
                                    <TableCell>الحالة</TableCell>
                                    <TableCell>التاريخ</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {historyDialog.data.map(o => (
                                    <TableRow key={o.id}>
                                        <TableCell>#{o.order_number}</TableCell>
                                        <TableCell>{parseFloat(o.total || 0).toFixed(2)} ر.س</TableCell>
                                        <TableCell>
                                            <Chip size="small" label={o.delivery_status || 'غير محدد'}
                                                color={o.delivery_status === 'delivered' ? 'success' : o.delivery_status === 'failed' ? 'error' : 'default'}
                                            />
                                        </TableCell>
                                        <TableCell>{new Date(o.created_at).toLocaleDateString('ar-SA')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setHistoryDialog({ open: false, person: null, data: [] })}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
