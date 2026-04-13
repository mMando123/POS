import { useState, useEffect, useRef } from 'react'
import {
    Box,
    Typography,
    Paper,
    Grid,
    Card,
    CardContent,
    Switch,
    TextField,
    Button,
    Divider,
    Alert,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    CircularProgress,
    Backdrop,
    IconButton,
    MenuItem,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    InputAdornment,
    Collapse
} from '@mui/material'
import {
    Settings as SettingsIcon,
    Store as StoreIcon,
    Receipt as ReceiptIcon,
    Notifications as NotificationsIcon,
    Save as SaveIcon,
    Print as PrintIcon,
    Storage as StorageIcon, // Data
    Tune as TuneIcon, // Workflow
    Computer as HardwareIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    RestartAlt as ResetIcon,
    CloudUpload as BackupIcon,
    CloudDownload as RestoreIcon,
    ExpandLess,
    ExpandMore,
    Language as LanguageIcon,
    Security as SecurityIcon,
    Palette as PaletteIcon,
    CreditCard as CreditCardIcon
} from '@mui/icons-material'
import { FormControlLabel } from '@mui/material'
import toast from 'react-hot-toast'
import { settingsAPI, uploadAPI, paymentGatewaysAPI, systemAPI } from '../services/api'
import Swal from 'sweetalert2'
import { useThemeConfig } from '../contexts/ThemeContext'

// --- Components ---

const SettingsHeader = ({ title, subtitle, onSave, onReset, hasChanges, saving }) => (
    <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
            <Typography variant="h4" fontWeight="800" sx={{ mb: 1, background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                إعدادات النظام
            </Typography>
            <Typography variant="body1" color="text.secondary">
                {subtitle}
            </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
                variant="outlined"
                color="error"
                startIcon={<ResetIcon />}
                onClick={onReset}
            >
                استعادة
            </Button>
            <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={onSave}
                disabled={!hasChanges || saving}
                sx={{ px: 4, borderRadius: 2, boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)' }}
            >
                {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </Button>
        </Box>
    </Box>
)

const SectionTitle = ({ icon, title }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.lighter', color: 'primary.main' }}>
            {icon}
        </Box>
        <Typography variant="h6" fontWeight="bold">
            {title}
        </Typography>
    </Box>
)

const PAYMENT_GATEWAY_LABELS = {
    stripe: { ar: 'سترايب', en: 'Stripe' },
    moyasar: { ar: 'ميسر', en: 'Moyasar' },
    fawry: { ar: 'فوري', en: 'Fawry' },
    paymob: { ar: 'باي موب', en: 'Paymob' }
}

// --- Printer Dialog Component ---
const PrinterDialog = ({ open, onClose, onSave, printer = null }) => {
    const [formData, setFormData] = useState({ name: '', type: 'network', address: '', location: 'cashier' })

    useEffect(() => {
        if (printer) setFormData(printer)
        else setFormData({ name: '', type: 'network', address: '', location: 'cashier' })
    }, [printer, open])

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{printer ? 'تعديل الطابعة' : 'إضافة طابعة جديدة'}</DialogTitle>
            <DialogContent dividers>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    <Grid item xs={12}>
                        <TextField fullWidth label="اسم الطابعة" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="مثال: طابعة المطبخ" />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField select fullWidth label="نوع الاتصال" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                            <MenuItem value="network">شبكة (IP)</MenuItem>
                            <MenuItem value="usb">USB</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={6}>
                        <TextField select fullWidth label="الموقع" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })}>
                            <MenuItem value="cashier">الكاشير</MenuItem>
                            <MenuItem value="kitchen">المطبخ</MenuItem>
                            <MenuItem value="bar">البار</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12}>
                        <TextField fullWidth label={formData.type === 'network' ? 'عنوان IP' : 'اسم المنفذ'} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder={formData.type === 'network' ? '192.168.1.200' : 'USB001'} />
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>إلغاء</Button>
                <Button variant="contained" onClick={() => onSave(formData)}>حفظ</Button>
            </DialogActions>
        </Dialog>
    )
}

// --- Main Page ---

export default function Settings() {
    const [activeSection, setActiveSection] = useState('store')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)
    const [printerDialogOpen, setPrinterDialogOpen] = useState(false)
    const [editingPrinter, setEditingPrinter] = useState(null)

    // Unified State
    const [settings, setSettings] = useState({
        store: {},
        hardware: { printers: [] },
        workflow: {},
        receipt: {},
        notifications: {},
        hr: {},
        system: {}
    })

    const [paymentGateways, setPaymentGateways] = useState([])
    const [restoreFile, setRestoreFile] = useState(null)
    const [restoringData, setRestoringData] = useState(false)
    const restoreFileInputRef = useRef(null)

    // Theme Hook with Currency and Translation
    const {
        language,
        currencyCode,
        setCurrency,
        setLanguage,
        t,
        availableCurrencies,
        formatCurrency,
        mode,
        setMode
    } = useThemeConfig()

    useEffect(() => {
        fetchSettings()
        fetchPaymentGateways()
    }, [])

    const fetchPaymentGateways = async () => {
        try {
            // First try to init (idempotent)
            await paymentGatewaysAPI.init().catch(() => { })
            // Then fetch
            const res = await paymentGatewaysAPI.getAll()
            setPaymentGateways(res.data.data || [])
        } catch (error) {
            console.error('Failed to fetch payment gateways', error)
        }
    }

    const handleGatewayUpdate = async (gatewayId, updates) => {
        try {
            // Optimistic update
            const updatedGateways = paymentGateways.map(gw =>
                gw.id === gatewayId ? { ...gw, ...updates } : gw
            )
            setPaymentGateways(updatedGateways)

            // Send to backend
            const gateway = updatedGateways.find(g => g.id === gatewayId)
            await paymentGatewaysAPI.update(gatewayId, {
                is_active: gateway.is_active,
                is_sandbox: gateway.is_sandbox,
                settings: gateway.settings || {}
            })
            toast.success('تم تحديث إعدادات الدفع')
        } catch (error) {
            toast.error('فشل تحديث الإعدادات')
            fetchPaymentGateways() // Revert
        }
    }

    const handleGatewaySettingChange = (gatewayId, key, value) => {
        const updatedGateways = paymentGateways.map(gw =>
            gw.id === gatewayId ? {
                ...gw,
                settings: { ...(gw.settings || {}), [key]: value }
            } : gw
        )
        setPaymentGateways(updatedGateways)
        // Note: For text fields, we wait for explicit save or blur (not implemented here), 
        // OR we can add a specific "Save" button for each gateway to avoid too many API calls.
        // For now, let's add a "Save" button to the card.
    }

    const saveGatewayConfig = async (gatewayId) => {
        try {
            const gateway = paymentGateways.find(g => g.id === gatewayId)
            await paymentGatewaysAPI.update(gatewayId, {
                is_active: gateway.is_active,
                is_sandbox: gateway.is_sandbox,
                settings: gateway.settings || {}
            })
            toast.success('تم حفظ المفاتيح')
        } catch (error) {
            toast.error('فشل الحفظ')
        }
    }

    const fetchSettings = async () => {
        try {
            const response = await settingsAPI.getAll()
            setSettings(response.data.data)
            setLoading(false)
        } catch (error) {
            toast.error(t('common.error'))
            setLoading(false)
        }
    }

    const handleChange = (section, field, value) => {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [field]: value
            }
        }))
        setHasChanges(true)

        // Instant Context Update
        if (section === 'system') {
            if (field === 'themeMode' && value !== mode) {
                setMode(value)
            }
            if (field === 'language' && value !== language) {
                setLanguage(value)
            }
        }
    }

    const handleNestedChange = (section, parentField, field, value) => {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [parentField]: {
                    ...(prev[section]?.[parentField] || {}),
                    [field]: value
                }
            }
        }))
        setHasChanges(true)
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await settingsAPI.update(settings)
            setHasChanges(false)
            toast.success(t('common.saveSuccess'))
            // Refresh to update values in case of any server-side logic
            fetchSettings()
            // Notify other components (like Layout) to refresh store info
            window.dispatchEvent(new CustomEvent('settingsUpdated'))
        } catch (error) {
            toast.error(t('common.error'))
        } finally {
            setSaving(false)
        }
    }

    const handleLogoUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        const formData = new FormData()
        formData.append('image', file)

        try {
            toast.loading(t('common.uploading'), { id: 'upload' })
            const res = await uploadAPI.uploadImage(formData)
            handleChange('store', 'logo', res.data.data.url)
            toast.success(t('common.uploadSuccess'), { id: 'upload' })
        } catch (error) {
            toast.error(t('common.uploadFailed'), { id: 'upload' })
        }
    }

    const handleExportBackup = async () => {
        try {
            toast.loading('جاري تجهيز وتحميل النسخة الاحتياطية...', { id: 'export-backup' })
            const response = await systemAPI.exportData();

            // Create a blob from the response data to trigger the download
            const blob = new Blob([response.data], { type: response.headers['content-type'] });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            // Try to extract filename from content-disposition header if available, else default
            let fileName = `POS_Backup_${new Date().toISOString().split('T')[0]}.zip`;
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches != null && matches[1]) {
                    fileName = matches[1].replace(/['"]/g, '');
                }
            }

            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('تم تحميل النسخة الاحتياطية بنجاح', { id: 'export-backup' })
        } catch (error) {
            console.error(error)
            toast.error('حدث خطأ أثناء تحميل البيانات', { id: 'export-backup' })
        }
    }

    const handleInternalBackup = async () => {
        try {
            toast.loading('جاري أخذ لقطة سريعة للبيانات...', { id: 'internal-backup' })
            const response = await systemAPI.internalBackup()
            toast.success(response.data.message || 'تم حفظ النسخة بنجاح', { id: 'internal-backup' })
        } catch (error) {
            console.error(error)
            toast.error('حدث خطأ أثناء أخذ اللقطة', { id: 'internal-backup' })
        }
    }

    const handleRestoreFileChange = (event) => {
        const file = event.target.files?.[0]
        setRestoreFile(file || null)
    }

    const handleRestartServerNow = async () => {
        try {
            toast.loading('\u062c\u0627\u0631\u064a \u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062e\u0627\u062f\u0645...', { id: 'restart-server' })
            await systemAPI.restartServer()
            toast.success('\u062a\u0645 \u0637\u0644\u0628 \u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062e\u0627\u062f\u0645', { id: 'restart-server' })
            setTimeout(() => {
                window.location.reload()
            }, 5000)
        } catch (error) {
            console.error(error)
            toast.error(error?.response?.data?.message || '\u0641\u0634\u0644 \u0637\u0644\u0628 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0634\u063a\u064a\u0644', { id: 'restart-server' })
        }
    }

    const triggerRestoreFilePicker = () => {
        restoreFileInputRef.current?.click()
    }

    const handleRestoreBackup = async () => {
        if (!restoreFile) {
            toast.error('\u0627\u062e\u062a\u0631 \u0645\u0644\u0641 \u0646\u0633\u062e\u0629 \u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629 \u0623\u0648\u0644\u064b\u0627')
            return
        }

        const confirmResult = await Swal.fire({
            title: '\u062a\u0623\u0643\u064a\u062f \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a',
            text: '\u0633\u064a\u062a\u0645 \u0627\u0633\u062a\u0628\u062f\u0627\u0644 \u0643\u0644 \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0628\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0645\u0631\u0641\u0648\u0639\u0629.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: '\u0646\u0639\u0645\u060c \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0646\u0633\u062e\u0629',
            cancelButtonText: '\u0625\u0644\u063a\u0627\u0621'
        })

        if (!confirmResult.isConfirmed) return

        try {
            setRestoringData(true)
            const formData = new FormData()
            formData.append('backup_file', restoreFile)
            formData.append('restore_settings', 'true')

            toast.loading('\u062c\u0627\u0631\u064a \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629...', { id: 'restore-sys' })
            const response = await systemAPI.restoreData(formData)
            toast.success(response.data?.message || '\u062a\u0645\u062a \u0627\u0644\u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0628\u0646\u062c\u0627\u062d', { id: 'restore-sys' })

            setRestoreFile(null)
            if (restoreFileInputRef.current) {
                restoreFileInputRef.current.value = ''
            }

            const restartPrompt = await Swal.fire({
                title: '\u062a\u0645\u062a \u0627\u0644\u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0628\u0646\u062c\u0627\u062d',
                text: '\u064a\u064f\u0641\u0636\u0644 \u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062e\u0627\u062f\u0645 \u0627\u0644\u0622\u0646 \u0644\u062a\u0637\u0628\u064a\u0642 \u0643\u0627\u0641\u0629 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a.',
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: '\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0622\u0646',
                cancelButtonText: '\u0644\u0627\u062d\u0642\u064b\u0627'
            })

            if (restartPrompt.isConfirmed) {
                await handleRestartServerNow()
            }
        } catch (error) {
            console.error(error)
            toast.error(error?.response?.data?.message || '\u0641\u0634\u0644\u062a \u0639\u0645\u0644\u064a\u0629 \u0627\u0644\u0627\u0633\u062a\u0639\u0627\u062f\u0629', { id: 'restore-sys' })
        } finally {
            setRestoringData(false)
        }
    }

    const handleResetSystem = async () => {
        const confirmResult = await Swal.fire({
            title: 'هل أنت متأكد من مسح جميع البيانات؟',
            text: "هذا الإجراء سيقوم بحذف جميع المبيعات والمنتجات والعملاء بشكل نهائي (Factory Reset). سيتم أخذ نسخة احتياطية خفية قبل المسح للطوارئ.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'نعم، قم بتهيئة النظام',
            cancelButtonText: 'إلغاء'
        });

        if (confirmResult.isConfirmed) {
            try {
                toast.loading('جاري تهيئة النظام ومسح البيانات...', { id: 'reset-sys' })
                const response = await systemAPI.resetData({ seed_demo_data: false, preserve_uploads: false, preserve_settings: false })
                toast.success(response.data.message || 'تم تهيئة النظام بنجاح', { id: 'reset-sys' })
                setTimeout(() => window.location.reload(), 2000)
            } catch (error) {
                console.error(error)
                toast.error('فشل في عملية تهيئة النظام', { id: 'reset-sys' })
            }
        }
    }

    const handlePrinterSave = (printerData) => {
        let newPrinters = [...(settings.hardware.printers || [])]
        if (editingPrinter) {
            newPrinters = newPrinters.map(p => p.id === editingPrinter.id ? { ...printerData, id: p.id } : p)
        } else {
            newPrinters.push({ ...printerData, id: Date.now() })
        }
        handleChange('hardware', 'printers', newPrinters)
        setPrinterDialogOpen(false)
        setEditingPrinter(null)
    }

    const handleDeletePrinter = (id) => {
        const newPrinters = settings.hardware.printers.filter(p => p.id !== id)
        handleChange('hardware', 'printers', newPrinters)
    }

    const renderSidebarItem = (id, icon, label) => (
        <ListItem
            button
            selected={activeSection === id}
            onClick={() => setActiveSection(id)}
            sx={{
                borderRadius: 2,
                mb: 1,
                bgcolor: activeSection === id ? 'primary.light' : 'transparent',
                color: activeSection === id ? 'primary.contrastText' : 'text.primary',
                '&:hover': { bgcolor: activeSection === id ? 'primary.light' : 'action.hover' }
            }}
        >
            <Box sx={{ mr: 2, display: 'flex' }}>{icon}</Box>
            <ListItemText primary={label} primaryTypographyProps={{ fontWeight: activeSection === id ? 'bold' : 'medium' }} />
        </ListItem>
    )

    if (loading) return <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box>

    return (
        <Box sx={{ p: 3, maxWidth: 1600, mx: 'auto' }}>
            <SettingsHeader
                title={t('settings.title')}
                subtitle={t('settings.subtitle')}
                onSave={handleSave}
                onReset={fetchSettings} // Simple reset to server state
                hasChanges={hasChanges}
                saving={saving}
            />

            <Grid container spacing={3}>
                {/* Sidebar Navigation */}
                <Grid item xs={12} md={3}>
                    <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%', borderRadius: 3 }}>
                        <List component="nav">
                            {renderSidebarItem('store', <StoreIcon />, t('settings.storeInfo'))}
                            {renderSidebarItem('hardware', <HardwareIcon />, t('settings.hardware'))}
                            {renderSidebarItem('workflow', <TuneIcon />, t('settings.workflow'))}
                            {renderSidebarItem('receipt', <ReceiptIcon />, t('settings.invoices'))}
                            {renderSidebarItem('payment', <CreditCardIcon />, t('settings.paymentGateways'))}
                            {renderSidebarItem('notifications', <NotificationsIcon />, t('settings.notifications'))}
                            {renderSidebarItem('system', <SettingsIcon />, t('settings.systemConfig'))}
                            {renderSidebarItem('data', <StorageIcon />, t('settings.dataManagement'))}
                        </List>
                    </Paper>
                </Grid>

                {/* Content Area */}
                <Grid item xs={12} md={9}>
                    <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider', minHeight: 600, borderRadius: 3 }}>

                        {/* Store Section */}
                        {activeSection === 'store' && (
                            <Box className="animate-fade-in">
                                <SectionTitle icon={<StoreIcon />} title={t('settings.storeInfo')} />

                                <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <Box
                                        sx={{
                                            width: 120,
                                            height: 120,
                                            borderRadius: 2,
                                            border: '2px dashed',
                                            borderColor: 'divider',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            position: 'relative',
                                            bgcolor: 'grey.50'
                                        }}
                                    >
                                        {settings.store.logo ? (
                                            <>
                                                <Box
                                                    component="img"
                                                    src={settings.store.logo.startsWith('http') ? settings.store.logo : `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/${settings.store.logo.replace(/^\//, '')}`}
                                                    sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                />
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={() => handleChange('store', 'logo', null)}
                                                    sx={{
                                                        position: 'absolute',
                                                        top: 5,
                                                        right: 5,
                                                        bgcolor: 'rgba(255,255,255,0.8)',
                                                        '&:hover': { bgcolor: 'white' }
                                                    }}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </>
                                        ) : (
                                            <StoreIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                                        )}
                                    </Box>
                                    <Button
                                        component="label"
                                        variant="outlined"
                                        startIcon={<BackupIcon />}
                                        size="small"
                                    >
                                        ??? ???? ????
                                        <input
                                            type="file"
                                            hidden
                                            accept="image/*"
                                            onChange={handleLogoUpload}
                                        />
                                    </Button>
                                    <Typography variant="caption" color="text.secondary">
                                        ????? ??????? ???? ????? ?????? ????? (PNG)
                                    </Typography>
                                </Box>
                                                            <Grid container spacing={3}>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField fullWidth label={t('settings.storeName')} required error={!settings.store.storeName} value={settings.store.storeName} onChange={e => handleChange('store', 'storeName', e.target.value)} />
                                                                </Grid>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField fullWidth label="Store Name (English)" value={settings.store.storeNameEn} onChange={e => handleChange('store', 'storeNameEn', e.target.value)} />
                                                                </Grid>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField fullWidth label="السجل التجاري" value={settings.store.commercialRegister} onChange={e => handleChange('store', 'commercialRegister', e.target.value)} />
                                                                </Grid>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField fullWidth label={t('settings.taxNumber')} value={settings.store.taxNumber} onChange={e => handleChange('store', 'taxNumber', e.target.value)} />
                                                                </Grid>
                                                                <Grid item xs={12}>
                                                                    <TextField fullWidth multiline rows={2} label={t('settings.storeAddress')} value={settings.store.address} onChange={e => handleChange('store', 'address', e.target.value)} />
                                                                </Grid>
                                                            </Grid>
                                                        </Box>
                                                    )}

                                                    {/* Hardware Section */}
                                                    {activeSection === 'hardware' && (
                                                        <Box className="animate-fade-in">
                                                            <SectionTitle icon={<HardwareIcon />} title={t('settings.hardware')} />

                                                            <Card variant="outlined" sx={{ mb: 3 }}>
                                                                <CardContent>
                                                                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>{t('settings.printers')}</Typography>
                                                                    <Box sx={{ mb: 2 }}>
                                                                        {settings.hardware?.printers?.length === 0 ? (
                                                                            <Alert severity="info" sx={{ mb: 2 }}>{t('common.noData')}</Alert>
                                                                        ) : (
                                                                            <List>
                                                                                {settings.hardware.printers.map((printer) => (
                                                                                    <ListItem key={printer.id} sx={{ borderBottom: '1px solid #eee' }}
                                                                                        secondaryAction={
                                                                                            <IconButton edge="end" color="error" onClick={() => handleDeletePrinter(printer.id)}>
                                                                                                <DeleteIcon />
                                                                                            </IconButton>
                                                                                        }>
                                                                                        <Box sx={{ mr: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}><PrintIcon /></Box>
                                                                                        <ListItemText
                                                                                            primary={`${printer.name} (${printer.location})`}
                                                                                            secondary={`${printer.type.toUpperCase()} - ${printer.address}`}
                                                                                        />
                                                                                        <Chip size="small" label="متصل" color="success" variant="outlined" sx={{ mr: 2 }} />
                                                                                    </ListItem>
                                                                                ))}
                                                                            </List>
                                                                        )}
                                                                    </Box>
                                                                    <Button variant="outlined" startIcon={<AddIcon />} onClick={() => { setEditingPrinter(null); setPrinterDialogOpen(true); }}>
                                                                        {t('settings.addPrinter')}
                                                                    </Button>
                                                                </CardContent>
                                                            </Card>

                                                            <Grid container spacing={3}>
                                                                <Grid item xs={12} md={6}>
                                                                    <Card variant="outlined">
                                                                        <CardContent>
                                                                            <Typography fontWeight="bold" gutterBottom>{t('common.details')}</Typography>
                                                                            <List disablePadding>
                                                                                <ListItem disablePadding>
                                                                                    <ListItemText primary={t('settings.cashDrawer')} secondary={t('settings.enableCashDrawer')} />
                                                                                    <Switch checked={settings.hardware.enableCashDrawer} onChange={e => handleChange('hardware', 'enableCashDrawer', e.target.checked)} />
                                                                                </ListItem>
                                                                                <Divider sx={{ my: 1 }} />
                                                                                <ListItem disablePadding>
                                                                                    <ListItemText primary={t('settings.kitchenDisplay')} secondary={t('settings.enableKDS')} />
                                                                                    <Switch checked={settings.hardware.enableKitchenDisplay} onChange={e => handleChange('hardware', 'enableKitchenDisplay', e.target.checked)} />
                                                                                </ListItem>
                                                                            </List>
                                                                        </CardContent>
                                                                    </Card>
                                                                </Grid>
                                                            </Grid>
                                                        </Box>
                                                    )}

                                                    {/* Workflow Section */}
                                                    {activeSection === 'workflow' && (
                                                        <Box className="animate-fade-in">
                                                            <SectionTitle icon={<TuneIcon />} title={t('settings.workflow')} />
                                                            <Grid container spacing={3}>
                                                                {/* --- أوضاع التشغيل --- */}
                                                                <Grid item xs={12}>
                                                                    <Card variant="outlined" sx={{ borderColor: 'primary.200' }}>
                                                                        <CardContent>
                                                                            <Typography fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                ⚙️ أوضاع التشغيل
                                                                            </Typography>
                                                                            <Alert severity="info" sx={{ mb: 2 }}>
                                                                                قم بتفعيل أو تعطيل الميزات حسب طبيعة نشاطك التجاري. التغييرات تُطبق فوراً بعد الحفظ.
                                                                            </Alert>
                                                                            <List>
                                                                                <ListItem disablePadding sx={{ py: 1 }}>
                                                                                    <ListItemText
                                                                                        primary="🌐 تفعيل الطلبات الأونلاين (الموقع)"
                                                                                        secondary="السماح للعملاء بالطلب عبر الموقع الإلكتروني"
                                                                                    />
                                                                                    <Switch
                                                                                        checked={settings.workflow?.enableOnlineOrders !== false}
                                                                                        onChange={e => handleChange('workflow', 'enableOnlineOrders', e.target.checked)}
                                                                                    />
                                                                                </ListItem>
                                                                                <Divider sx={{ my: 1 }} />
                                                                                <ListItem disablePadding sx={{ py: 1 }}>
                                                                                    <ListItemText
                                                                                        primary="🛵 تفعيل خدمة التوصيل (ديليفري)"
                                                                                        secondary="عند التعطيل لن يظهر خيار التوصيل في الكاشير"
                                                                                    />
                                                                                    <Switch
                                                                                        checked={settings.workflow?.enableDelivery !== false}
                                                                                        onChange={e => handleChange('workflow', 'enableDelivery', e.target.checked)}
                                                                                    />
                                                                                </ListItem>
                                                                                <Divider sx={{ my: 1 }} />
                                                                                <ListItem disablePadding sx={{ py: 1 }}>
                                                                                    <ListItemText
                                                                                        primary="⚡ إكمال الطلب تلقائياً عند الدفع"
                                                                                        secondary="الطلب يكتمل فوراً بدون انتظار المطبخ (مناسب للبقالات والسوبرماركت)"
                                                                                    />
                                                                                    <Switch
                                                                                        checked={settings.workflow?.autoCompleteOrders === true}
                                                                                        onChange={e => handleChange('workflow', 'autoCompleteOrders', e.target.checked)}
                                                                                    />
                                                                                </ListItem>
                                                                                <Divider sx={{ my: 1 }} />
                                                                                <ListItem disablePadding sx={{ py: 1 }}>
                                                                                    <ListItemText
                                                                                        primary="🍳 طباعة أمر المطبخ (بدون أسعار)"
                                                                                        secondary="طباعة ورقة للمطبخ تحتوي الأصناف والكميات فقط عند إنشاء الطلب"
                                                                                    />
                                                                                    <Switch
                                                                                        checked={settings.workflow?.printKitchenReceipt !== false}
                                                                                        onChange={e => handleChange('workflow', 'printKitchenReceipt', e.target.checked)}
                                                                                    />
                                                                                </ListItem>
                                                                                <Divider sx={{ my: 1 }} />
                                                                                <ListItem disablePadding sx={{ py: 1 }}>
                                                                                    <ListItemText
                                                                                        primary="🧾 عدد نسخ فاتورة العميل"
                                                                                        secondary="عدد الفواتير التي تُطبع تلقائياً عند إنشاء الطلب"
                                                                                    />
                                                                                    <TextField
                                                                                        type="number"
                                                                                        size="small"
                                                                                        value={settings.workflow?.receiptCopies ?? 1}
                                                                                        onChange={e => handleChange('workflow', 'receiptCopies', Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                                                                                        inputProps={{ min: 1, max: 5, style: { width: 60, textAlign: 'center' } }}
                                                                                    />
                                                                                </ListItem>
                                                                            </List>
                                                                        </CardContent>
                                                                    </Card>
                                                                </Grid>

                                                                <Grid item xs={12} md={6}>
                                                                    <Card variant="outlined">
                                                                        <CardContent>
                                                                            <Typography fontWeight="bold" gutterBottom>{t('orders.title')}</Typography>
                                                                            <List>
                                                                                <ListItem disablePadding>
                                                                                    <ListItemText primary={t('settings.autoAccept')} />
                                                                                    <Switch checked={settings.workflow?.autoAcceptOnline} onChange={e => handleChange('workflow', 'autoAcceptOnline', e.target.checked)} />
                                                                                </ListItem>
                                                                                <ListItem disablePadding sx={{ mt: 2 }}>
                                                                                    <ListItemText primary={t('settings.allowCancel')} />
                                                                                    <Switch checked={settings.workflow?.allowCancelWithoutReason} onChange={e => handleChange('workflow', 'allowCancelWithoutReason', e.target.checked)} />
                                                                                </ListItem>
                                                                                <ListItem disablePadding sx={{ mt: 2 }}>
                                                                                    <ListItemText primary={t('settings.requireManagerForVoid')} />
                                                                                    <Switch
                                                                                        checked={settings.workflow?.requireManagerForVoid !== false}
                                                                                        onChange={e => handleChange('workflow', 'requireManagerForVoid', e.target.checked)}
                                                                                    />
                                                                                </ListItem>
                                                                            </List>
                                                                        </CardContent>
                                                                    </Card>
                                                                </Grid>
                                                                <Grid item xs={12} md={6}>
                                                                    <Card variant="outlined">
                                                                        <CardContent>
                                                                            <Typography fontWeight="bold" gutterBottom>{t('settings.orderPrefix')}</Typography>
                                                                            <Grid container spacing={2} sx={{ mt: 1 }}>
                                                                                <Grid item xs={6}>
                                                                                    <TextField fullWidth size="small" label={t('settings.orderPrefix')} value={settings.workflow?.orderNumberPrefix} onChange={e => handleChange('workflow', 'orderNumberPrefix', e.target.value)} />
                                                                                </Grid>
                                                                                <Grid item xs={6}>
                                                                                    <TextField fullWidth size="small" label={t('settings.orderStart')} type="number" value={settings.workflow?.orderNumberStart} onChange={e => handleChange('workflow', 'orderNumberStart', e.target.value)} />
                                                                                </Grid>
                                                                            </Grid>
                                                                        </CardContent>
                                                                    </Card>
                                                                </Grid>
                                                            </Grid>
                                                        </Box>
                                                    )}

                                                    {/* Receipt Section */}
                                                    {activeSection === 'receipt' && (
                                                        <Box className="animate-fade-in">
                                                            <SectionTitle icon={<ReceiptIcon />} title={t('settings.invoices')} />
                                                            <Grid container spacing={3}>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField
                                                                        fullWidth
                                                                        label={t('settings.taxRate')}
                                                                        type="number"
                                                                        value={settings.store.taxRate}
                                                                        onChange={e => handleChange('store', 'taxRate', parseFloat(e.target.value))}
                                                                        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                                                                    />
                                                                </Grid>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField
                                                                        fullWidth
                                                                        label={t('settings.serviceRate')}
                                                                        type="number"
                                                                        value={settings.store.serviceRate}
                                                                        onChange={e => handleChange('store', 'serviceRate', parseFloat(e.target.value))}
                                                                        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                                                                    />
                                                                </Grid>
                                                                <Grid item xs={12}>
                                                                    <Divider sx={{ my: 2 }}>{t('common.print')}</Divider>
                                                                </Grid>
                                                                <Grid item xs={12} md={4}>
                                                                    <ListItem disablePadding>
                                                                        <ListItemText primary={t('settings.showLogo')} />
                                                                        <Switch checked={settings.receipt.showLogo} onChange={e => handleChange('receipt', 'showLogo', e.target.checked)} />
                                                                    </ListItem>
                                                                </Grid>
                                                                <Grid item xs={12} md={4}>
                                                                    <ListItem disablePadding>
                                                                        <ListItemText primary={t('settings.showQRCode')} />
                                                                        <Switch checked={settings.receipt.showQRCode} onChange={e => handleChange('receipt', 'showQRCode', e.target.checked)} />
                                                                    </ListItem>
                                                                </Grid>
                                                                <Grid item xs={12} md={4}>
                                                                    <ListItem disablePadding>
                                                                        <ListItemText primary={t('settings.autoPrint')} />
                                                                        <Switch checked={settings.receipt.autoPrint} onChange={e => handleChange('receipt', 'autoPrint', e.target.checked)} />
                                                                    </ListItem>
                                                                </Grid>
                                                                <Grid item xs={12}>
                                                                    <TextField fullWidth label={t('settings.footerText')} multiline rows={2} value={settings.receipt.footerText} onChange={e => handleChange('receipt', 'footerText', e.target.value)} />
                                                                </Grid>
                                                            </Grid>
                                                        </Box>
                                                    )}

                                                    {/* Notifications Section */}
                                                    {activeSection === 'notifications' && (
                                                        <Box className="animate-fade-in">
                                                            <SectionTitle icon={<NotificationsIcon />} title={t('settings.notifications')} />
                                                            <Card variant="outlined">
                                                                <List>
                                                                    <ListItem>
                                                                        <ListItemText primary={t('settings.soundEnabled')} />
                                                                        <Switch checked={settings.notifications.soundEnabled} onChange={e => handleChange('notifications', 'soundEnabled', e.target.checked)} />
                                                                    </ListItem>
                                                                    <Divider />
                                                                    <ListItem>
                                                                        <ListItemText primary={t('notifications.newOrder')} />
                                                                        <Switch checked={settings.notifications.newOrderAlert} onChange={e => handleChange('notifications', 'newOrderAlert', e.target.checked)} />
                                                                    </ListItem>
                                                                    <Divider />
                                                                    <ListItem>
                                                                        <ListItemText primary={t('notifications.lowStockAlert')} />
                                                                        <Switch checked={settings.notifications.lowStockAlert} onChange={e => handleChange('notifications', 'lowStockAlert', e.target.checked)} />
                                                                    </ListItem>
                                                                </List>
                                                            </Card>
                                                        </Box>
                                                    )}

                                                    {/* System Section */}
                                                    {activeSection === 'system' && (
                                                        <Box className="animate-fade-in">
                                                            <SectionTitle icon={<SettingsIcon />} title={t('settings.systemConfig')} />
                                                            <Grid container spacing={3}>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField
                                                                        select
                                                                        fullWidth
                                                                        label={t('settings.language')}
                                                                        value={language}
                                                                        onChange={e => {
                                                                            const newLang = e.target.value;
                                                                            handleChange('system', 'language', newLang);
                                                                            setLanguage(newLang);
                                                                        }}
                                                                    >
                                                                        <MenuItem value="ar">{t('settings.arabic')}</MenuItem>
                                                                        <MenuItem value="en">{t('settings.english')}</MenuItem>
                                                                    </TextField>
                                                                </Grid>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField
                                                                        select
                                                                        fullWidth
                                                                        label={t('settings.currency')}
                                                                        value={currencyCode}
                                                                        onChange={e => {
                                                                            const newCurrency = e.target.value;
                                                                            handleChange('system', 'currency', newCurrency);
                                                                            setCurrency(newCurrency);
                                                                        }}
                                                                    >
                                                                        {Object.values(availableCurrencies).map(curr => (
                                                                            <MenuItem key={curr.code} value={curr.code}>
                                                                                {language === 'ar' ? curr.nameAr : curr.name} ({curr.code})
                                                                            </MenuItem>
                                                                        ))}
                                                                    </TextField>
                                                                </Grid>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField
                                                                        select
                                                                        fullWidth
                                                                        label={t('settings.dateFormat')}
                                                                        value={settings.system?.dateFormat || 'DD/MM/YYYY'}
                                                                        onChange={e => handleChange('system', 'dateFormat', e.target.value)}
                                                                    >
                                                                        <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                                                                        <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                                                                        <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                                                                    </TextField>
                                                                </Grid>
                                                                <Grid item xs={12} md={6}>
                                                                    <TextField
                                                                        select
                                                                        fullWidth
                                                                        label={t('settings.theme')}
                                                                        value={mode}
                                                                        onChange={e => {
                                                                            const newMode = e.target.value;
                                                                            handleChange('system', 'themeMode', newMode);
                                                                            setMode(newMode);
                                                                        }}
                                                                    >
                                                                        <MenuItem value="light">{t('settings.light')}</MenuItem>
                                                                        <MenuItem value="dark">{t('settings.dark')}</MenuItem>
                                                                    </TextField>
                                                                </Grid>
                                                                <Grid item xs={12}>
                                                                    <Card variant="outlined" sx={{ mt: 1 }}>
                                                                        <CardContent>
                                                                            <Typography variant="h6" fontWeight="bold" gutterBottom>
                                                                                سياسة خصم التأخير للرواتب
                                                                            </Typography>
                                                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                                                                يتم تطبيق هذه السياسة عند معالجة الرواتب. التأخيرات ضمن السماح لا يترتب عليها خصم.
                                                                            </Typography>
                                                                            <Grid container spacing={2}>
                                                                                <Grid item xs={12}>
                                                                                    <FormControlLabel
                                                                                        control={(
                                                                                            <Switch
                                                                                                checked={settings.hr?.payrollLatePolicy?.enabled === true}
                                                                                                onChange={e => handleNestedChange('hr', 'payrollLatePolicy', 'enabled', e.target.checked)}
                                                                                            />
                                                                                        )}
                                                                                        label="تفعيل خصم التأخير التلقائي"
                                                                                    />
                                                                                </Grid>
                                                                                <Grid item xs={12} md={4}>
                                                                                    <TextField
                                                                                        fullWidth
                                                                                        type="number"
                                                                                        label="عدد مرات السماح"
                                                                                        inputProps={{ min: 0, max: 31 }}
                                                                                        value={settings.hr?.payrollLatePolicy?.graceCount ?? 0}
                                                                                        onChange={e => handleNestedChange('hr', 'payrollLatePolicy', 'graceCount', Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
                                                                                        helperText="عدد مرات التأخير المسموح بها قبل بدء الخصم"
                                                                                    />
                                                                                </Grid>
                                                                                <Grid item xs={12} md={4}>
                                                                                    <TextField
                                                                                        select
                                                                                        fullWidth
                                                                                        label="نوع الخصم"
                                                                                        value={settings.hr?.payrollLatePolicy?.deductionType || 'fixed_amount'}
                                                                                        onChange={e => handleNestedChange('hr', 'payrollLatePolicy', 'deductionType', e.target.value)}
                                                                                        disabled={settings.hr?.payrollLatePolicy?.enabled !== true}
                                                                                    >
                                                                                        <MenuItem value="fixed_amount">مبلغ ثابت لكل مرة</MenuItem>
                                                                                        <MenuItem value="fraction_of_day">نسبة من أجر اليوم</MenuItem>
                                                                                    </TextField>
                                                                                </Grid>
                                                                                <Grid item xs={12} md={4}>
                                                                                    <TextField
                                                                                        fullWidth
                                                                                        type="number"
                                                                                        label={settings.hr?.payrollLatePolicy?.deductionType === 'fraction_of_day' ? 'قيمة النسبة من اليوم' : 'قيمة الخصم'}
                                                                                        inputProps={{
                                                                                            min: 0,
                                                                                            step: settings.hr?.payrollLatePolicy?.deductionType === 'fraction_of_day' ? 0.05 : 1
                                                                                        }}
                                                                                        value={settings.hr?.payrollLatePolicy?.deductionValue ?? 0}
                                                                                        onChange={e => handleNestedChange('hr', 'payrollLatePolicy', 'deductionValue', Math.max(0, parseFloat(e.target.value || '0') || 0))}
                                                                                        disabled={settings.hr?.payrollLatePolicy?.enabled !== true}
                                                                                        helperText={
                                                                                            settings.hr?.payrollLatePolicy?.deductionType === 'fraction_of_day'
                                                                                                ? 'مثال: 0.25 يعني ربع أجر يوم لكل تأخير بعد السماح'
                                                                                                : 'يخصم هذا المبلغ عن كل تأخير زائد عن حد السماح'
                                                                                        }
                                                                                    />
                                                                                </Grid>
                                                                            </Grid>
                                                                        </CardContent>
                                                                    </Card>
                                                                </Grid>
                                                            </Grid>
                                                        </Box>
                                                    )}

                                                    {/* Data Management Section */}
                                                    {activeSection === 'data' && (
                                                        <Box className="animate-fade-in">
                                                            <SectionTitle icon={<StorageIcon />} title={t('settings.dataManagement')} />
                                                            <input
                                                                ref={restoreFileInputRef}
                                                                type="file"
                                                                accept=".zip,.sql,.sqlite,.db"
                                                                style={{ display: 'none' }}
                                                                onChange={handleRestoreFileChange}
                                                            />
                                                            <Grid container spacing={3}>
                                                                <Grid item xs={12} md={4}>
                                                                    <Card variant="outlined" sx={{ bgcolor: 'primary.lighter', borderColor: 'primary.light' }}>
                                                                        <CardContent sx={{ textAlign: 'center' }}>
                                                                            <BackupIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
                                                                            <Typography variant="h6" gutterBottom>{t('settings.backup')}</Typography>
                                                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                                                تحميل نسخة كاملة من قاعدة البيانات والإعدادات في ملف مضغوط.
                                                                            </Typography>
                                                                            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                                                                                <Button variant="contained" onClick={handleExportBackup}>
                                                                                    تصدير وتحميل ZIP
                                                                                </Button>
                                                                            </Box>
                                                                        </CardContent>
                                                                    </Card>
                                                                </Grid>
                                                                <Grid item xs={12} md={4}>
                                                                    <Card variant="outlined" sx={{ bgcolor: 'info.lighter', borderColor: 'info.light' }}>
                                                                        <CardContent sx={{ textAlign: 'center' }}>
                                                                            <RestoreIcon sx={{ fontSize: 40, color: 'info.main', mb: 2 }} />
                                                                            <Typography variant="h6" gutterBottom>{'\u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0646\u0633\u062e\u0629 \u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629'}</Typography>
                                                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                                                {'\u0627\u0631\u0641\u0639 \u0645\u0644\u0641 ZIP \u0623\u0648 SQL \u0644\u0625\u0631\u062c\u0627\u0639 \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a. \u0633\u064a\u062a\u0645 \u0623\u062e\u0630 \u0646\u0633\u062e\u0629 \u0642\u0628\u0644 \u0627\u0644\u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0644\u0644\u0623\u0645\u0627\u0646.'}
                                                                            </Typography>
                                                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                                                                                <Button variant="outlined" onClick={triggerRestoreFilePicker}>
                                                                                    {'\u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0644\u0641'}
                                                                                </Button>
                                                                                <Button
                                                                                    variant="contained"
                                                                                    color="info"
                                                                                    onClick={handleRestoreBackup}
                                                                                    disabled={!restoreFile || restoringData}
                                                                                >
                                                                                    {restoringData ? '\u062c\u0627\u0631\u064a \u0627\u0644\u0627\u0633\u062a\u0639\u0627\u062f\u0629...' : '\u0628\u062f\u0621 \u0627\u0644\u0627\u0633\u062a\u0639\u0627\u062f\u0629'}
                                                                                </Button>
                                                                            </Box>
                                                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                                                                {restoreFile ? restoreFile.name : '\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u0644\u0641 \u0645\u062d\u062f\u062f'}
                                                                            </Typography>
                                                                        </CardContent>
                                                                    </Card>
                                                                </Grid>
                                                                <Grid item xs={12} md={4}>
                                                                    <Card variant="outlined" sx={{ bgcolor: 'error.lighter', borderColor: 'error.light' }}>
                                                                        <CardContent sx={{ textAlign: 'center' }}>
                                                                            <WarningIcon sx={{ fontSize: 40, color: 'error.main', mb: 2 }} />
                                                                            <Typography variant="h6" gutterBottom>{t('settings.resetDatabase')} (تهيئة)</Typography>
                                                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                                                سيتم مسح جميع البيانات واستعادة النظام كأنه جديد. لا يمكن التراجع عن هذا الإجراء دون إرجاع النسخة.
                                                                            </Typography>
                                                                            <Button variant="outlined" color="error" onClick={handleResetSystem}>
                                                                                إعادة تعيين (فرمتة)
                                                                            </Button>
                                                                        </CardContent>
                                                                    </Card>
                                                                </Grid>
                                                            </Grid>
                                                        </Box>
                                                    )}

                                                    {/* Payment Settings Section */}
                                                    {activeSection === 'payment' && (
                                                        <Box className="animate-fade-in">
                                                            <SectionTitle icon={<CreditCardIcon />} title="بوابات الدفع الإلكتروني" />
                                                            <Alert severity="info" sx={{ mb: 3 }}>
                                                                قم بتكوين بوابات الدفع لتمكين الدفع الإلكتروني والمدفوعات عبر البطاقات. تأكد من تفعيل وضع التجربة (Sandbox) أثناء الاختبار.
                                                            </Alert>

                                                            <Grid container spacing={3}>
                                                                {paymentGateways.map(gateway => {
                                                                    const labels = PAYMENT_GATEWAY_LABELS[gateway.name] || {}
                                                                    const displayNameAr = labels.ar || gateway.display_name_ar
                                                                    const displayNameEn = labels.en || gateway.display_name_en

                                                                    return (
                                                                    <Grid item xs={12} md={6} key={gateway.id}>
                                                                        <Card variant="outlined" sx={{ position: 'relative', overflow: 'visible' }}>
                                                                            {gateway.is_active && (
                                                                                <Box sx={{ position: 'absolute', top: -10, left: 10, bgcolor: 'success.main', color: 'white', px: 1, borderRadius: 1, fontSize: 10 }}>مفعل</Box>
                                                                            )}
                                                                            <CardContent>
                                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                        <Typography variant="h6">{displayNameEn} ({displayNameAr})</Typography>
                                                                                    </Box>
                                                                                    <Switch
                                                                                        checked={gateway.is_active}
                                                                                        onChange={(e) => handleGatewayUpdate(gateway.id, { is_active: e.target.checked })}
                                                                                    />
                                                                                </Box>

                                                                                {/* Dynamic Fields based on Gateway Name */}
                                                                                {gateway.name === 'stripe' && (
                                                                                    <>
                                                                                        <TextField fullWidth size="small" label="Publishable Key" sx={{ mb: 2 }}
                                                                                            type="password"
                                                                                            value={gateway.settings?.publishableKey || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'publishableKey', e.target.value)}
                                                                                        />
                                                                                        <TextField fullWidth size="small" label="Secret Key" sx={{ mb: 2 }}
                                                                                            type="password"
                                                                                            value={gateway.settings?.secretKey || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'secretKey', e.target.value)}
                                                                                        />
                                                                                    </>
                                                                                )}

                                                                                {gateway.name === 'moyasar' && (
                                                                                    <>
                                                                                        <TextField fullWidth size="small" label="API Key (Publishable)" sx={{ mb: 2 }}
                                                                                            value={gateway.settings?.apiKey || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'apiKey', e.target.value)}
                                                                                        />
                                                                                        <TextField fullWidth size="small" label="Secret Key" sx={{ mb: 2 }}
                                                                                            type="password"
                                                                                            value={gateway.settings?.secretKey || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'secretKey', e.target.value)}
                                                                                        />
                                                                                    </>
                                                                                )}

                                                                                {gateway.name === 'fawry' && (
                                                                                    <>
                                                                                        <TextField fullWidth size="small" label="Merchant Code" sx={{ mb: 2 }}
                                                                                            value={gateway.settings?.merchantCode || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'merchantCode', e.target.value)}
                                                                                        />
                                                                                        <TextField fullWidth size="small" label="Security Key" sx={{ mb: 2 }}
                                                                                            type="password"
                                                                                            value={gateway.settings?.securityKey || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'securityKey', e.target.value)}
                                                                                        />
                                                                                    </>
                                                                                )}

                                                                                {gateway.name === 'paymob' && (
                                                                                    <>
                                                                                        <TextField fullWidth size="small" label="API Key" sx={{ mb: 2 }}
                                                                                            type="password"
                                                                                            value={gateway.settings?.apiKey || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'apiKey', e.target.value)}
                                                                                        />
                                                                                        <TextField fullWidth size="small" label="Integration ID (Card)" sx={{ mb: 2 }}
                                                                                            value={gateway.settings?.integrationId || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'integrationId', e.target.value)}
                                                                                        />
                                                                                        <TextField fullWidth size="small" label="HMAC Secret" sx={{ mb: 2 }}
                                                                                            type="password"
                                                                                            value={gateway.settings?.hmacSecret || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'hmacSecret', e.target.value)}
                                                                                        />
                                                                                        <TextField fullWidth size="small" label="Iframe ID" sx={{ mb: 2 }}
                                                                                            value={gateway.settings?.iframeId || ''}
                                                                                            onChange={(e) => handleGatewaySettingChange(gateway.id, 'iframeId', e.target.value)}
                                                                                        />
                                                                                    </>
                                                                                )}

                                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                                                                    <FormControlLabel
                                                                                        control={
                                                                                            <Switch size="small"
                                                                                                checked={gateway.is_sandbox}
                                                                                                onChange={(e) => handleGatewayUpdate(gateway.id, { is_sandbox: e.target.checked })}
                                                                                            />
                                                                                        }
                                                                                        label="Test Mode"
                                                                                    />
                                                                                    <Button size="small" variant="contained" onClick={() => saveGatewayConfig(gateway.id)}>
                                                                                        حفظ المفاتيح
                                                                                    </Button>
                                                                                </Box>
                                                                            </CardContent>
                                                                        </Card>
                                                                    </Grid>
                                                                    )
                                                                })}
                                                            </Grid>
                                                        </Box>
                                                    )}
                                                </Paper>
                                            </Grid>
                                        </Grid>

                                        {/* Dialogs */}
                                        <PrinterDialog
                                            open={printerDialogOpen}
                                            onClose={() => setPrinterDialogOpen(false)}
                                            onSave={handlePrinterSave}
                                            printer={editingPrinter}
                                        />
                                    </Box>
                                    )
}
