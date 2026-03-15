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
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    FormControlLabel,
    Switch,
    Divider,
    Alert,
} from '@mui/material'
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Save as SaveIcon,
    Description as TemplateIcon,
} from '@mui/icons-material'
import toast from 'react-hot-toast'
import api from '../services/api'

const templateTypes = [
    { value: 'receipt', label: 'فاتورة كاشير' },
    { value: 'kitchen_ticket', label: 'تذكرة مطبخ' },
    { value: 'invoice', label: 'فاتورة ضريبية' },
]

const fontSizes = [
    { value: 'small', label: 'صغير' },
    { value: 'normal', label: 'متوسط' },
    { value: 'large', label: 'كبير' },
]

export default function TemplateEditor() {
    const [templates, setTemplates] = useState([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingTemplate, setEditingTemplate] = useState(null)
    const [formData, setFormData] = useState({
        name: '',
        type: 'receipt',
        header_text: '',
        footer_text: '',
        header_logo: '',
        show_logo: true,
        show_qr: true,
        show_barcode: false,
        font_size: 'normal',
        is_active: true,
        is_default: false,
    })

    useEffect(() => {
        fetchTemplates()
    }, [])

    const fetchTemplates = async () => {
        try {
            setLoading(true)
            const res = await api.get('/devices/templates/all')
            setTemplates(res.data.data || [])
        } catch (error) {
            toast.error('فشل تحميل القوالب')
        } finally {
            setLoading(false)
        }
    }

    const handleOpenDialog = (template = null) => {
        if (template) {
            setEditingTemplate(template)
            setFormData(template)
        } else {
            setEditingTemplate(null)
            setFormData({
                name: '',
                type: 'receipt',
                header_text: 'اهلا بكم في مطعمنا\nنسعد بخدمتكم',
                footer_text: 'شكرا لزيارتكم\nتطبق الشروط والاحكام',
                header_logo: '',
                show_logo: true,
                show_qr: true,
                show_barcode: false,
                show_cashier: true,
                show_date: true,
                font_size: 'normal',
                is_active: true,
                is_default: false,
            })
        }
        setDialogOpen(true)
    }

    const handleSave = async () => {
        try {
            if (editingTemplate) {
                await api.put(`/devices/templates/${editingTemplate.id}`, formData)
                toast.success('تم تحديث القالب')
            } else {
                await api.post('/devices/templates', formData)
                toast.success('تم إنشاء القالب')
            }
            setDialogOpen(false)
            fetchTemplates()
        } catch (error) {
            toast.error('فشل حفظ القالب')
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('هل أنت متأكد من حذف القالب؟')) return
        try {
            await api.delete(`/devices/templates/${id}`)
            toast.success('تم حذف القالب')
            fetchTemplates()
        } catch (error) {
            toast.error('فشل حذف القالب')
        }
    }

    // Receipt Preview Component - Matches the actual print design
    const ReceiptPreview = ({ data }) => (
        <Paper
            elevation={3}
            sx={{
                p: 1.5,
                width: '100%',
                maxWidth: 280,
                mx: 'auto',
                bgcolor: '#fff',
                color: '#000',
                fontFamily: 'monospace',
                fontSize: data.font_size === 'small' ? 10 : data.font_size === 'large' ? 14 : 12,
                direction: 'rtl',
            }}
        >
            {/* Header */}
            <Box sx={{ textAlign: 'center', borderBottom: '2px solid #000', pb: 1, mb: 1 }}>
                {data.show_logo && (
                    <Box sx={{ mb: 1, border: '1px dashed #ccc', p: 1, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {data.header_logo ? <img src={data.header_logo} alt="Logo" style={{ maxHeight: '100%' }} /> : 'LOGO'}
                    </Box>
                )}

                {/* Payment Type Badge */}
                <Box sx={{ bgcolor: '#000', color: '#fff', display: 'inline-block', px: 1.5, py: 0.3, fontSize: 12, fontWeight: 'bold', mb: 0.5 }}>
                    كاش
                </Box>

                {/* Store Name - From System Settings */}
                <Typography variant="h6" sx={{ fontWeight: 'bold', mt: 0.5, mb: 0 }}>
                    اسم المطعم
                </Typography>

                {/* Header Text - From Template */}
                <Typography variant="body2" sx={{ fontSize: 11, mb: 0.5, whiteSpace: 'pre-line' }}>
                    {data.header_text}
                </Typography>

                {/* Order Type Badge */}
                <Box sx={{ border: '1px solid #000', display: 'inline-block', px: 1, py: 0.2, fontSize: 11, fontWeight: 'bold' }}>
                    سفري
                </Box>
            </Box>

            {/* Order Info Box */}
            <Box sx={{ border: '2px solid #000', p: 1, mb: 1 }}>
                <Box sx={{ textAlign: 'center', border: '2px solid #000', p: 0.5, mb: 1, bgcolor: '#f0f0f0', fontWeight: 'bold', fontSize: 14 }}>
                    طلب رقم: 1001
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, mb: 0.3 }}>
                    <span style={{ fontWeight: 'bold' }}>التاريخ:</span>
                    <span>{data.show_date !== false ? '25/10/2023' : '---'}</span>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                    <span style={{ fontWeight: 'bold' }}>الكاشير:</span>
                    <span>{data.show_cashier !== false ? 'أحمد' : '---'}</span>
                </Box>
            </Box>

            {/* Items Table */}
            <Box sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', bgcolor: '#000', color: '#fff', p: 0.5, fontSize: 10, fontWeight: 'bold' }}>
                    <span style={{ flex: 2, textAlign: 'right' }}>الصنف</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>الكمية</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>السعر</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>الإجمالي</span>
                </Box>
                <Box sx={{ display: 'flex', p: 0.5, fontSize: 10, borderBottom: '1px dashed #ccc' }}>
                    <span style={{ flex: 2, textAlign: 'right' }}>برجر دجاج</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>1</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>25.00</span>
                    <span style={{ flex: 1, textAlign: 'center', fontWeight: 'bold' }}>25.00</span>
                </Box>
                <Box sx={{ display: 'flex', p: 0.5, fontSize: 10, borderBottom: '1px dashed #ccc' }}>
                    <span style={{ flex: 2, textAlign: 'right' }}>بيبسي</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>1</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>5.00</span>
                    <span style={{ flex: 1, textAlign: 'center', fontWeight: 'bold' }}>5.00</span>
                </Box>
            </Box>

            {/* Calculations */}
            <Box sx={{ border: '1px solid #000', p: 1, mb: 1 }}>
                <Box sx={{ bgcolor: '#000', color: '#fff', p: 0.8, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 13, my: 0.5 }}>
                    <span>الإجمالي المطلوب:</span>
                    <span>30.00 ر.س</span>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 'bold', mt: 0.5 }}>
                    <span>المدفوع:</span>
                    <span>30.00 ر.س</span>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 'bold' }}>
                    <span>المتبقي:</span>
                    <span>0.00 ر.س</span>
                </Box>
            </Box>

            {/* Footer */}
            <Box sx={{ textAlign: 'center', borderTop: '2px solid #000', pt: 1, fontSize: 10 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5, whiteSpace: 'pre-line' }}>
                    {data.footer_text || 'شكراً لزيارتكم!'}
                </Typography>
                <Box sx={{ color: '#666' }}>25/10/2023 - 14:30</Box>
                <Box sx={{ fontWeight: 'bold' }}>فاتورة رقم: 1001</Box>

                {data.show_qr && (
                    <Box sx={{ mt: 1, border: '1px solid #eee', width: 60, height: 60, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>
                        QR Code
                    </Box>
                )}

                {data.show_barcode && (
                    <Box sx={{ mt: 1, textAlign: 'center' }}>
                        <Box sx={{ border: '1px solid #000', height: 30, width: '80%', mx: 'auto', mb: 0.5, bgcolor: '#000' }}></Box>
                        <Typography variant="caption">*1001*</Typography>
                    </Box>
                )}
            </Box>
        </Paper>
    )

    return (
        <Box>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                    إضافة قالب جديد
                </Button>
            </Box>

            <Grid container spacing={3}>
                {templates.map((template) => (
                    <Grid item xs={12} md={6} lg={4} key={template.id}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    {template.name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" paragraph>
                                    النوع: {templateTypes.find(t => t.value === template.type)?.label}
                                </Typography>
                                {template.is_default && <Alert severity="info" sx={{ py: 0, mb: 1 }}>الافتراضي</Alert>}
                            </CardContent>
                            <CardActions>
                                <IconButton onClick={() => handleOpenDialog(template)} color="primary">
                                    <EditIcon />
                                </IconButton>
                                <IconButton onClick={() => handleDelete(template.id)} color="error">
                                    <DeleteIcon />
                                </IconButton>
                            </CardActions>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>{editingTemplate ? 'تعديل القالب' : 'إنشاء قالب جديد'}</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={4}>
                        {/* Form Side */}
                        <Grid item xs={12} md={7}>
                            <Grid container spacing={2}>
                                <Grid item xs={12} md={6}>
                                    <TextField
                                        fullWidth
                                        label="اسم القالب"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <TextField
                                        fullWidth
                                        select
                                        label="نوم القالب"
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    >
                                        {templateTypes.map((t) => (
                                            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField
                                        fullWidth
                                        label="رابط الشعار (URL)"
                                        value={formData.header_logo}
                                        onChange={(e) => setFormData({ ...formData, header_logo: e.target.value })}
                                        helperText="اتركه فارغاً إذا كنت لا تستخدم شعار مخصص"
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={3}
                                        label="نص الرأس (Header)"
                                        value={formData.header_text}
                                        onChange={(e) => setFormData({ ...formData, header_text: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={3}
                                        label="نص التذييل (Footer)"
                                        value={formData.footer_text}
                                        onChange={(e) => setFormData({ ...formData, footer_text: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <TextField
                                        fullWidth
                                        select
                                        label="حجم الخط"
                                        value={formData.font_size}
                                        onChange={(e) => setFormData({ ...formData, font_size: e.target.value })}
                                    >
                                        {fontSizes.map((f) => (
                                            <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>

                                <Grid item xs={12}>
                                    <Typography variant="subtitle2" gutterBottom>خيارات العرض</Typography>
                                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                        <FormControlLabel
                                            control={<Switch checked={formData.show_logo} onChange={(e) => setFormData({ ...formData, show_logo: e.target.checked })} />}
                                            label="إظهار الشعار"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={formData.show_qr} onChange={(e) => setFormData({ ...formData, show_qr: e.target.checked })} />}
                                            label="إظهار QR Code"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={formData.show_barcode} onChange={(e) => setFormData({ ...formData, show_barcode: e.target.checked })} />}
                                            label="إظهار الباركود"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={formData.show_cashier !== false} onChange={(e) => setFormData({ ...formData, show_cashier: e.target.checked })} />}
                                            label="إظهار الكاشير"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={formData.show_date !== false} onChange={(e) => setFormData({ ...formData, show_date: e.target.checked })} />}
                                            label="إظهار التاريخ"
                                        />
                                        <FormControlLabel
                                            control={<Switch checked={formData.is_default} onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })} />}
                                            label="تعيين كافتراضي"
                                        />
                                    </Box>
                                </Grid>
                            </Grid>
                        </Grid>

                        {/* Preview Side */}
                        <Grid item xs={12} md={5}>
                            <Typography variant="h6" gutterBottom align="center">معاينة</Typography>
                            <Box sx={{ bgcolor: '#eee', p: 3, borderRadius: 2, display: 'flex', justifyContent: 'center' }}>
                                <ReceiptPreview data={formData} />
                            </Box>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={handleSave} startIcon={<SaveIcon />}>حفظ</Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
