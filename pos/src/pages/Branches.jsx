import { useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Grid,
    IconButton,
    Switch,
    TextField,
    Typography
} from '@mui/material'
import {
    Add as AddIcon,
    Apartment as BranchIcon,
    Edit as EditIcon,
    Refresh as RefreshIcon,
    ToggleOff,
    ToggleOn
} from '@mui/icons-material'
import { branchAPI } from '../services/api'

const defaultForm = {
    name_ar: '',
    name_en: '',
    address: '',
    phone: '',
    is_active: true
}

export default function Branches() {
    const [branches, setBranches] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingBranch, setEditingBranch] = useState(null)
    const [form, setForm] = useState(defaultForm)
    const [saving, setSaving] = useState(false)

    const activeCount = useMemo(
        () => branches.filter((b) => b.is_active).length,
        [branches]
    )

    const loadBranches = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await branchAPI.getAll({ includeInactive: true })
            setBranches(res.data?.data || [])
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'فشل تحميل الفروع')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadBranches()
    }, [])

    const openCreate = () => {
        setEditingBranch(null)
        setForm(defaultForm)
        setDialogOpen(true)
    }

    const openEdit = (branch) => {
        setEditingBranch(branch)
        setForm({
            name_ar: branch.name_ar || '',
            name_en: branch.name_en || '',
            address: branch.address || '',
            phone: branch.phone || '',
            is_active: !!branch.is_active
        })
        setDialogOpen(true)
    }

    const handleSave = async () => {
        if (!form.name_ar.trim()) {
            setError('اسم الفرع بالعربية مطلوب')
            return
        }
        setSaving(true)
        try {
            const payload = {
                name_ar: form.name_ar.trim(),
                name_en: form.name_en.trim() || null,
                address: form.address.trim() || null,
                phone: form.phone.trim() || null,
                is_active: !!form.is_active
            }
            if (editingBranch) {
                await branchAPI.update(editingBranch.id, payload)
            } else {
                await branchAPI.create(payload)
            }
            setDialogOpen(false)
            await loadBranches()
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'فشل حفظ الفرع')
        } finally {
            setSaving(false)
        }
    }

    const handleToggleStatus = async (branch) => {
        try {
            await branchAPI.setStatus(branch.id, !branch.is_active)
            await loadBranches()
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'فشل تحديث حالة الفرع')
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BranchIcon color="primary" />
                    <Typography variant="h4" fontWeight="bold">إدارة الفروع</Typography>
                    <Chip label={`نشط: ${activeCount}`} color="success" size="small" />
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadBranches}>
                        تحديث
                    </Button>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                        إضافة فرع
                    </Button>
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Grid container spacing={2}>
                    {branches.map((branch) => (
                        <Grid item xs={12} md={6} lg={4} key={branch.id}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                        <Box>
                                            <Typography variant="h6" fontWeight="bold">{branch.name_ar}</Typography>
                                            <Typography variant="body2" color="text.secondary">{branch.name_en || '-'}</Typography>
                                        </Box>
                                        <Chip
                                            label={branch.is_active ? 'نشط' : 'غير نشط'}
                                            color={branch.is_active ? 'success' : 'default'}
                                            size="small"
                                        />
                                    </Box>

                                    <Typography variant="body2" sx={{ mt: 2 }}>
                                        العنوان: {branch.address || '-'}
                                    </Typography>
                                    <Typography variant="body2">
                                        الهاتف: {branch.phone || '-'}
                                    </Typography>

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                                        <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(branch)}>
                                            تعديل
                                        </Button>
                                        <IconButton onClick={() => handleToggleStatus(branch)} color={branch.is_active ? 'warning' : 'success'}>
                                            {branch.is_active ? <ToggleOff /> : <ToggleOn />}
                                        </IconButton>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editingBranch ? 'تعديل فرع' : 'إضافة فرع جديد'}</DialogTitle>
                <DialogContent dividers>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <TextField
                            label="اسم الفرع بالعربية"
                            value={form.name_ar}
                            onChange={(e) => setForm((prev) => ({ ...prev, name_ar: e.target.value }))}
                            required
                        />
                        <TextField
                            label="اسم الفرع بالإنجليزية"
                            value={form.name_en}
                            onChange={(e) => setForm((prev) => ({ ...prev, name_en: e.target.value }))}
                        />
                        <TextField
                            label="العنوان"
                            value={form.address}
                            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                        />
                        <TextField
                            label="الهاتف"
                            value={form.phone}
                            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={form.is_active}
                                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                                />
                            }
                            label="نشط"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)} disabled={saving}>إلغاء</Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving}>
                        {saving ? 'جارٍ الحفظ...' : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}

