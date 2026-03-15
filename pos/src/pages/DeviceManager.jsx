import { useState, useEffect } from 'react'
import {
    Box,
    Typography,
    Button,
    Paper,
    Grid,
    Card,
    CardContent,
    CardActions,
    Chip,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    FormControlLabel,
    Switch,
    Tabs,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Alert,
    Tooltip,
    Divider,
} from '@mui/material'
import {
    Print as PrintIcon,
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    CheckCircle as OnlineIcon,
    Cancel as OfflineIcon,
    Warning as WarningIcon,
    Wifi as NetworkIcon,
    Usb as UsbIcon,
    Bluetooth as BluetoothIcon,
    PlayArrow as TestIcon,
    History as HistoryIcon,
    Settings as SettingsIcon,
    Description as TemplateIcon,
    Restaurant as KitchenIcon,
    Receipt as ReceiptIcon,
    LocalShipping as InvoiceIcon,
} from '@mui/icons-material'
import toast from 'react-hot-toast'
import api from '../services/api'
import TemplateEditor from '../components/TemplateEditor'

const deviceTypes = [
    { value: 'thermal', label: 'طابعة حرارية' },
    { value: 'receipt', label: 'طابعة فواتير' },
    { value: 'kitchen', label: 'طابعة مطبخ' },
    { value: 'a4', label: 'طابعة A4' },
    { value: 'label', label: 'طابعة ملصقات' },
]

const connectionTypes = [
    { value: 'network', label: 'شبكة (IP)', icon: <NetworkIcon /> },
    { value: 'usb', label: 'USB', icon: <UsbIcon /> },
    { value: 'bluetooth', label: 'بلوتوث', icon: <BluetoothIcon /> },
]

const purposes = [
    { value: 'receipt', label: 'فواتير الكاشير', icon: <ReceiptIcon /> },
    { value: 'kitchen', label: 'تذاكر المطبخ', icon: <KitchenIcon /> },
    { value: 'invoice', label: 'فواتير ضريبية', icon: <InvoiceIcon /> },
    { value: 'label', label: 'ملصقات', icon: <TemplateIcon /> },
    { value: 'admin', label: 'تقارير إدارية', icon: <SettingsIcon /> },
]

const paperWidths = [
    { value: '58mm', label: '58mm' },
    { value: '80mm', label: '80mm' },
    { value: 'A4', label: 'A4' },
    { value: 'A5', label: 'A5' },
]

export default function DeviceManager() {
    const [tab, setTab] = useState(0)
    const [devices, setDevices] = useState([])
    const [jobs, setJobs] = useState([])
    const [templates, setTemplates] = useState([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingDevice, setEditingDevice] = useState(null)
    const [formData, setFormData] = useState({
        name: '',
        type: 'thermal',
        connection_type: 'network',
        ip_address: '',
        port: 9100,
        purpose: 'receipt',
        paper_width: '80mm',
        is_active: true,
        is_default: false,
        auto_cut: true,
        print_copies: 1,
        supports_arabic: true,
        supports_logo: true,
        supports_qr: true,
        supports_cut: true,
        supports_cash_drawer: false,
        open_drawer_on_print: false,
        beep_on_print: false,
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [devicesRes, jobsRes] = await Promise.all([
                api.get('/devices'),
                api.get('/devices/jobs/history?limit=50'),
            ])
            setDevices(devicesRes.data.data || [])
            setJobs(jobsRes.data.data || [])
        } catch (error) {
            toast.error('فشل في تحميل البيانات')
        } finally {
            setLoading(false)
        }
    }

    const handleOpenDialog = (device = null) => {
        if (device) {
            setEditingDevice(device)
            setFormData(device)
        } else {
            setEditingDevice(null)
            setFormData({
                name: '',
                type: 'thermal',
                connection_type: 'network',
                ip_address: '',
                port: 9100,
                purpose: 'receipt',
                paper_width: '80mm',
                is_active: true,
                is_default: false,
                auto_cut: true,
                print_copies: 1,
                supports_arabic: true,
                supports_logo: true,
                supports_qr: true,
                supports_cut: true,
                supports_cash_drawer: false,
                open_drawer_on_print: false,
                beep_on_print: false,
            })
        }
        setDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setDialogOpen(false)
        setEditingDevice(null)
    }

    const handleSave = async () => {
        try {
            if (editingDevice) {
                await api.put(`/devices/${editingDevice.id}`, formData)
                toast.success('تم تحديث الجهاز')
            } else {
                await api.post('/devices', formData)
                toast.success('تم إضافة الجهاز')
            }
            handleCloseDialog()
            fetchData()
        } catch (error) {
            toast.error(error.response?.data?.message || 'حدث خطأ')
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('هل تريد حذف هذا الجهاز؟')) return
        try {
            await api.delete(`/devices/${id}`)
            toast.success('تم حذف الجهاز')
            fetchData()
        } catch (error) {
            toast.error('فشل في حذف الجهاز')
        }
    }

    const handleTestConnection = async (id) => {
        try {
            toast.loading('جاري اختبار الاتصال...', { id: 'test' })
            const res = await api.post(`/devices/${id}/test`)
            if (res.data.success) {
                toast.success(res.data.message, { id: 'test' })
            } else {
                toast.error(res.data.message, { id: 'test' })
            }
            fetchData()
        } catch (error) {
            toast.error('فشل الاتصال', { id: 'test' })
        }
    }

    const handleTestPrint = async (id) => {
        try {
            toast.loading('جاري طباعة صفحة الاختبار...', { id: 'print' })
            const res = await api.post(`/devices/${id}/print-test`)
            if (res.data.success) {
                toast.success(res.data.message, { id: 'print' })
            } else {
                toast.error(res.data.message, { id: 'print' })
            }
        } catch (error) {
            toast.error('فشل في الطباعة', { id: 'print' })
        }
    }

    const handleRetryJob = async (jobId) => {
        try {
            await api.post(`/devices/jobs/${jobId}/retry`)
            toast.success('تم إعادة المهمة للطابور')
            fetchData()
        } catch (error) {
            toast.error('فشل في إعادة المهمة')
        }
    }

    const getStatusChip = (status) => {
        switch (status) {
            case 'online':
                return <Chip icon={<OnlineIcon />} label="متصل" color="success" size="small" />
            case 'offline':
                return <Chip icon={<OfflineIcon />} label="غير متصل" color="default" size="small" />
            case 'error':
                return <Chip icon={<WarningIcon />} label="خطأ" color="error" size="small" />
            case 'busy':
                return <Chip icon={<CircularProgress size={14} />} label="مشغول" color="warning" size="small" />
            default:
                return <Chip label={status} size="small" />
        }
    }

    const getJobStatusChip = (status) => {
        const colors = {
            pending: 'warning',
            printing: 'info',
            completed: 'success',
            failed: 'error',
            cancelled: 'default',
        }
        return <Chip label={status} color={colors[status] || 'default'} size="small" />
    }

    const getConnectionIcon = (type) => {
        switch (type) {
            case 'network': return <NetworkIcon color="primary" />
            case 'usb': return <UsbIcon color="secondary" />
            case 'bluetooth': return <BluetoothIcon color="info" />
            default: return <PrintIcon />
        }
    }

    const getPurposeIcon = (purpose) => {
        switch (purpose) {
            case 'receipt': return <ReceiptIcon />
            case 'kitchen': return <KitchenIcon />
            case 'invoice': return <InvoiceIcon />
            default: return <PrintIcon />
        }
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress />
            </Box>
        )
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" fontWeight="bold">
                    🖨️ إدارة الطابعات
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button startIcon={<RefreshIcon />} onClick={fetchData}>
                        تحديث
                    </Button>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                        إضافة طابعة
                    </Button>
                </Box>
            </Box>

            {/* Tabs */}
            <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab icon={<PrintIcon />} label="الطابعات" iconPosition="start" />
                <Tab icon={<HistoryIcon />} label="سجل الطباعة" iconPosition="start" />
                <Tab icon={<TemplateIcon />} label="القوالب" iconPosition="start" />
            </Tabs>

            {/* Devices Tab */}
            {tab === 0 && (
                <Grid container spacing={3}>
                    {devices.length === 0 ? (
                        <Grid item xs={12}>
                            <Paper sx={{ p: 4, textAlign: 'center' }}>
                                <PrintIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                                <Typography variant="h6" color="text.secondary">
                                    لا توجد طابعات مسجلة
                                </Typography>
                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    sx={{ mt: 2 }}
                                    onClick={() => handleOpenDialog()}
                                >
                                    إضافة أول طابعة
                                </Button>
                            </Paper>
                        </Grid>
                    ) : (
                        devices.map((device) => (
                            <Grid item xs={12} md={6} lg={4} key={device.id}>
                                <Card sx={{ height: '100%', position: 'relative' }}>
                                    {device.is_default && (
                                        <Chip
                                            label="افتراضي"
                                            color="primary"
                                            size="small"
                                            sx={{ position: 'absolute', top: 10, left: 10 }}
                                        />
                                    )}
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                            {getConnectionIcon(device.connection_type)}
                                            <Box sx={{ flexGrow: 1 }}>
                                                <Typography variant="h6" fontWeight="bold">
                                                    {device.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {device.type} • {device.paper_width}
                                                </Typography>
                                            </Box>
                                            {getStatusChip(device.status)}
                                        </Box>

                                        <Divider sx={{ my: 1 }} />

                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                                            <Chip
                                                icon={getPurposeIcon(device.purpose)}
                                                label={purposes.find(p => p.value === device.purpose)?.label}
                                                variant="outlined"
                                                size="small"
                                            />
                                            {device.connection_type === 'network' && (
                                                <Chip
                                                    label={`${device.ip_address}:${device.port}`}
                                                    variant="outlined"
                                                    size="small"
                                                />
                                            )}
                                        </Box>

                                        {device.last_error && (
                                            <Alert severity="error" sx={{ mb: 1 }}>
                                                {device.last_error}
                                            </Alert>
                                        )}

                                        {device.last_seen && (
                                            <Typography variant="caption" color="text.secondary">
                                                آخر اتصال: {new Date(device.last_seen).toLocaleString('ar-SA')}
                                            </Typography>
                                        )}
                                    </CardContent>

                                    <CardActions sx={{ justifyContent: 'space-between' }}>
                                        <Box>
                                            <Tooltip title="اختبار الاتصال">
                                                <IconButton onClick={() => handleTestConnection(device.id)}>
                                                    <RefreshIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="طباعة اختبار">
                                                <IconButton onClick={() => handleTestPrint(device.id)} color="primary">
                                                    <TestIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                        <Box>
                                            <IconButton onClick={() => handleOpenDialog(device)}>
                                                <EditIcon />
                                            </IconButton>
                                            <IconButton color="error" onClick={() => handleDelete(device.id)}>
                                                <DeleteIcon />
                                            </IconButton>
                                        </Box>
                                    </CardActions>
                                </Card>
                            </Grid>
                        ))
                    )}
                </Grid>
            )}

            {/* Jobs History Tab */}
            {tab === 1 && (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>العنوان</TableCell>
                                <TableCell>النوع</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell>التاريخ</TableCell>
                                <TableCell>إجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {jobs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center">
                                        لا توجد مهام طباعة
                                    </TableCell>
                                </TableRow>
                            ) : (
                                jobs.map((job) => (
                                    <TableRow key={job.id}>
                                        <TableCell>{job.title}</TableCell>
                                        <TableCell>{job.purpose}</TableCell>
                                        <TableCell>{getJobStatusChip(job.status)}</TableCell>
                                        <TableCell>{new Date(job.created_at).toLocaleString('ar-SA')}</TableCell>
                                        <TableCell>
                                            {job.status === 'failed' && (
                                                <Button size="small" onClick={() => handleRetryJob(job.id)}>
                                                    إعادة
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Templates Tab */}
            {tab === 2 && (
                <TemplateEditor />
            )}

            {/* Add/Edit Device Dialog */}
            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
                <DialogTitle>
                    {editingDevice ? 'تعديل الطابعة' : 'إضافة طابعة جديدة'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="اسم الطابعة"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                select
                                label="نوع الطابعة"
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            >
                                {deviceTypes.map((t) => (
                                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                select
                                label="طريقة الاتصال"
                                value={formData.connection_type}
                                onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                            >
                                {connectionTypes.map((t) => (
                                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                select
                                label="الغرض"
                                value={formData.purpose}
                                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                            >
                                {purposes.map((p) => (
                                    <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>

                        {formData.connection_type === 'network' && (
                            <>
                                <Grid item xs={12} md={8}>
                                    <TextField
                                        fullWidth
                                        label="عنوان IP"
                                        value={formData.ip_address}
                                        onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                                        placeholder="192.168.1.100"
                                    />
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <TextField
                                        fullWidth
                                        label="المنفذ"
                                        type="number"
                                        value={formData.port}
                                        onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                                    />
                                </Grid>
                            </>
                        )}

                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                select
                                label="عرض الورق"
                                value={formData.paper_width}
                                onChange={(e) => setFormData({ ...formData, paper_width: e.target.value })}
                            >
                                {paperWidths.map((w) => (
                                    <MenuItem key={w.value} value={w.value}>{w.label}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="عدد النسخ"
                                type="number"
                                value={formData.print_copies}
                                onChange={(e) => setFormData({ ...formData, print_copies: parseInt(e.target.value) })}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                الإعدادات
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                <FormControlLabel
                                    control={<Switch checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />}
                                    label="نشط"
                                />
                                <FormControlLabel
                                    control={<Switch checked={formData.is_default} onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })} />}
                                    label="افتراضي"
                                />
                                <FormControlLabel
                                    control={<Switch checked={formData.auto_cut} onChange={(e) => setFormData({ ...formData, auto_cut: e.target.checked })} />}
                                    label="قص تلقائي"
                                />
                                <FormControlLabel
                                    control={<Switch checked={formData.open_drawer_on_print} onChange={(e) => setFormData({ ...formData, open_drawer_on_print: e.target.checked })} />}
                                    label="فتح الدرج"
                                />
                                <FormControlLabel
                                    control={<Switch checked={formData.beep_on_print} onChange={(e) => setFormData({ ...formData, beep_on_print: e.target.checked })} />}
                                    label="صوت تنبيه"
                                />
                            </Box>
                        </Grid>

                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                القدرات
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                <FormControlLabel
                                    control={<Switch checked={formData.supports_arabic} onChange={(e) => setFormData({ ...formData, supports_arabic: e.target.checked })} />}
                                    label="عربي"
                                />
                                <FormControlLabel
                                    control={<Switch checked={formData.supports_logo} onChange={(e) => setFormData({ ...formData, supports_logo: e.target.checked })} />}
                                    label="شعار"
                                />
                                <FormControlLabel
                                    control={<Switch checked={formData.supports_qr} onChange={(e) => setFormData({ ...formData, supports_qr: e.target.checked })} />}
                                    label="QR"
                                />
                                <FormControlLabel
                                    control={<Switch checked={formData.supports_cut} onChange={(e) => setFormData({ ...formData, supports_cut: e.target.checked })} />}
                                    label="قص"
                                />
                                <FormControlLabel
                                    control={<Switch checked={formData.supports_cash_drawer} onChange={(e) => setFormData({ ...formData, supports_cash_drawer: e.target.checked })} />}
                                    label="درج نقود"
                                />
                            </Box>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>إلغاء</Button>
                    <Button variant="contained" onClick={handleSave}>
                        {editingDevice ? 'حفظ التغييرات' : 'إضافة'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
