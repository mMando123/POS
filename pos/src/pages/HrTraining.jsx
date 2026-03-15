import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material'
import { Refresh as RefreshIcon } from '@mui/icons-material'
import { hrAPI } from '../services/api'

const statusOptions = [
    { value: 'planned', label: 'مخطط' },
    { value: 'in_progress', label: 'قيد التنفيذ' },
    { value: 'completed', label: 'مكتمل' },
    { value: 'cancelled', label: 'ملغي' }
]

const statusLabel = Object.fromEntries(statusOptions.map((item) => [item.value, item.label]))

const defaultForm = () => ({
    program_name_ar: '',
    program_name_en: '',
    description: '',
    start_date: '',
    end_date: '',
    duration_days: '',
    trainer: '',
    budget: '',
    status: 'planned'
})

export default function HrTraining() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [rows, setRows] = useState([])
    const [employees, setEmployees] = useState([])
    const [summaryRows, setSummaryRows] = useState([])
    const [form, setForm] = useState(defaultForm)

    const summary = useMemo(() => {
        const values = { planned: 0, in_progress: 0, completed: 0, cancelled: 0 }
        summaryRows.forEach((row) => {
            const key = row.status || row.dataValues?.status
            const count = Number(row.count || row.dataValues?.count || 0)
            if (key in values) values[key] = count
        })
        return values
    }, [summaryRows])

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const [programsRes, summaryRes, employeesRes] = await Promise.all([
                hrAPI.getTrainingPrograms({ status: statusFilter || undefined, limit: 500 }),
                hrAPI.getTrainingSummary({ status: statusFilter || undefined }),
                hrAPI.getEmployees({ status: 'active', limit: 500 })
            ])

            setRows(programsRes.data?.data || [])
            setSummaryRows(summaryRes.data?.data || [])
            setEmployees(employeesRes.data?.data || [])
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل برامج التدريب')
        } finally {
            setLoading(false)
        }
    }, [statusFilter])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const createProgram = async () => {
        try {
            setSaving(true)
            await hrAPI.createTrainingProgram({
                ...form,
                duration_days: form.duration_days ? Number(form.duration_days) : null,
                budget: Number(form.budget || 0),
                trainer: form.trainer || null
            })
            setForm(defaultForm)
            await fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر إنشاء برنامج التدريب')
        } finally {
            setSaving(false)
        }
    }

    const updateStatus = async (id, status) => {
        try {
            await hrAPI.updateTrainingProgram(id, { status })
            await fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحديث حالة البرنامج')
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>التدريب والتطوير</Typography>
                    <Typography color="text.secondary">برامج التدريب ومتابعة حالتها</Typography>
                </Box>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}>تحديث</Button>
            </Stack>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                        select
                        label="الحالة"
                        sx={{ minWidth: 220 }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        {statusOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>
                </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} sx={{ mb: 2 }}>
                <Chip label={`مخطط: ${summary.planned}`} />
                <Chip color="warning" label={`قيد التنفيذ: ${summary.in_progress}`} />
                <Chip color="success" label={`مكتمل: ${summary.completed}`} />
                <Chip color="default" label={`ملغي: ${summary.cancelled}`} />
            </Stack>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>إضافة برنامج تدريب</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                        label="اسم البرنامج (عربي)"
                        fullWidth
                        value={form.program_name_ar}
                        onChange={(e) => setForm((prev) => ({ ...prev, program_name_ar: e.target.value }))}
                    />
                    <TextField
                        label="اسم البرنامج (English)"
                        fullWidth
                        value={form.program_name_en}
                        onChange={(e) => setForm((prev) => ({ ...prev, program_name_en: e.target.value }))}
                    />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
                    <TextField
                        label="تاريخ البداية"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={form.start_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    />
                    <TextField
                        label="تاريخ النهاية"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={form.end_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                    />
                    <TextField
                        label="المدة (يوم)"
                        type="number"
                        value={form.duration_days}
                        onChange={(e) => setForm((prev) => ({ ...prev, duration_days: e.target.value }))}
                    />
                    <TextField
                        label="الميزانية"
                        type="number"
                        value={form.budget}
                        onChange={(e) => setForm((prev) => ({ ...prev, budget: e.target.value }))}
                    />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
                    <TextField
                        select
                        fullWidth
                        label="المدرب (اختياري)"
                        value={form.trainer}
                        onChange={(e) => setForm((prev) => ({ ...prev, trainer: e.target.value }))}
                    >
                        <MenuItem value="">-</MenuItem>
                        {employees.map((employee) => (
                            <MenuItem key={employee.id} value={employee.id}>
                                {employee.employee_code} - {employee.first_name_ar} {employee.last_name_ar}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        label="الحالة"
                        sx={{ minWidth: 200 }}
                        value={form.status}
                        onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                    >
                        {statusOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>
                    <Button
                        variant="contained"
                        onClick={createProgram}
                        disabled={saving || !form.program_name_ar}
                    >
                        حفظ البرنامج
                    </Button>
                </Stack>
                <TextField
                    label="الوصف"
                    fullWidth
                    multiline
                    minRows={2}
                    sx={{ mt: 1.5 }}
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
            </Paper>

            <Paper sx={{ overflowX: 'auto' }}>
                {loading ? (
                    <Box sx={{ p: 5, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>البرنامج</TableCell>
                                <TableCell>الفترة</TableCell>
                                <TableCell>المدرب</TableCell>
                                <TableCell>الميزانية</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell align="center">إجراء</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">لا توجد برامج تدريب</TableCell>
                                </TableRow>
                            ) : rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.program_name_ar}</TableCell>
                                    <TableCell>{row.start_date || '-'} / {row.end_date || '-'}</TableCell>
                                    <TableCell>
                                        {row.trainerEmployee
                                            ? `${row.trainerEmployee.employee_code} - ${row.trainerEmployee.first_name_ar} ${row.trainerEmployee.last_name_ar}`
                                            : '-'}
                                    </TableCell>
                                    <TableCell>{Number(row.budget || 0).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Chip size="small" label={statusLabel[row.status] || row.status} />
                                    </TableCell>
                                    <TableCell align="center">
                                        <TextField
                                            select
                                            size="small"
                                            value={row.status}
                                            onChange={(e) => updateStatus(row.id, e.target.value)}
                                        >
                                            {statusOptions.map((option) => (
                                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                            ))}
                                        </TextField>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Paper>
        </Box>
    )
}

