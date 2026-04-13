import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Grid,
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
const statusChipColor = {
    planned: 'default',
    in_progress: 'warning',
    completed: 'success',
    cancelled: 'error'
}

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

const formatMoney = (value) => Number(value || 0).toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
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

    const selectedTrainer = useMemo(
        () => employees.find((employee) => employee.id === form.trainer) || null,
        [employees, form.trainer]
    )

    const trainingInsights = useMemo(() => {
        const totalBudget = rows.reduce((sum, row) => sum + Number(row.budget || 0), 0)
        const uniqueTrainers = new Set(rows.map((row) => row.trainer).filter(Boolean)).size
        const latestProgram = rows[0] || null

        return {
            totalPrograms: rows.length,
            totalBudget,
            activePrograms: rows.filter((row) => row.status === 'in_progress').length,
            completedPrograms: rows.filter((row) => row.status === 'completed').length,
            uniqueTrainers,
            latestProgram
        }
    }, [rows])

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
            setForm(defaultForm())
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
                    <Typography color="text.secondary">إدارة برامج التدريب ومتابعة الميزانية والتنفيذ</Typography>
                </Box>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}>تحديث</Button>
            </Stack>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="إجمالي البرامج"
                        value={trainingInsights.totalPrograms}
                        subtitle="البرامج الظاهرة حسب الفلتر الحالي"
                        color="#1565c0"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="إجمالي الميزانية"
                        value={formatMoney(trainingInsights.totalBudget)}
                        subtitle="مجموع الميزانيات للبرامج الظاهرة"
                        color="#00838f"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="برامج قيد التنفيذ"
                        value={trainingInsights.activePrograms}
                        subtitle={`برامج مكتملة: ${trainingInsights.completedPrograms}`}
                        color="#ef6c00"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="مدربون مشاركون"
                        value={trainingInsights.uniqueTrainers}
                        subtitle={`مخطط: ${summary.planned} | ملغي: ${summary.cancelled}`}
                        color="#2e7d32"
                    />
                </Grid>
            </Grid>

            <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>فلاتر برامج التدريب</Typography>
                <Grid container spacing={1.5}>
                    <Grid item xs={12} md={4}>
                        <TextField
                            select
                            fullWidth
                            label="الحالة"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <MenuItem value="">الكل</MenuItem>
                            {statusOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.25 }}>ملخص الحالات</Typography>
                <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap>
                    <Chip label={`مخطط: ${summary.planned}`} />
                    <Chip color="warning" label={`قيد التنفيذ: ${summary.in_progress}`} />
                    <Chip color="success" label={`مكتمل: ${summary.completed}`} />
                    <Chip color="error" label={`ملغي: ${summary.cancelled}`} />
                </Stack>
            </Paper>

            <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 1.25, fontWeight: 700 }}>إضافة برنامج تدريب</Typography>
                {selectedTrainer && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.75 }}>
                        {selectedTrainer.employee_code} | {selectedTrainer.department?.name_ar || 'بدون قسم'} | {selectedTrainer.designation?.title_ar || 'بدون مسمى'}
                    </Typography>
                )}
                <Grid container spacing={1.5}>
                    <Grid item xs={12} md={6}>
                        <TextField
                            label="اسم البرنامج (عربي)"
                            fullWidth
                            value={form.program_name_ar}
                            onChange={(e) => setForm((prev) => ({ ...prev, program_name_ar: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            label="اسم البرنامج (English)"
                            fullWidth
                            value={form.program_name_en}
                            onChange={(e) => setForm((prev) => ({ ...prev, program_name_en: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="تاريخ البداية"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={form.start_date}
                            onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="تاريخ النهاية"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={form.end_date}
                            onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="المدة (يوم)"
                            type="number"
                            value={form.duration_days}
                            onChange={(e) => setForm((prev) => ({ ...prev, duration_days: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="الميزانية"
                            type="number"
                            value={form.budget}
                            onChange={(e) => setForm((prev) => ({ ...prev, budget: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <TextField
                            select
                            fullWidth
                            label="الحالة"
                            value={form.status}
                            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                        >
                            {statusOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
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
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="الوصف"
                            multiline
                            minRows={2}
                            value={form.description}
                            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <Button
                            fullWidth
                            sx={{ height: '100%', minHeight: 56 }}
                            variant="contained"
                            onClick={createProgram}
                            disabled={saving || !form.program_name_ar}
                        >
                            حفظ البرنامج
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ overflowX: 'auto', borderRadius: 2 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.25}>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>سجل برامج التدريب</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {trainingInsights.totalPrograms} برنامج | الميزانية الإجمالية {formatMoney(trainingInsights.totalBudget)}
                            </Typography>
                        </Box>
                        {trainingInsights.latestProgram && (
                            <Chip
                                color={statusChipColor[trainingInsights.latestProgram.status] || 'default'}
                                variant="outlined"
                                label={`آخر برنامج: ${trainingInsights.latestProgram.program_name_ar} - ${statusLabel[trainingInsights.latestProgram.status] || trainingInsights.latestProgram.status}`}
                            />
                        )}
                    </Stack>
                </Box>
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
                                <TableCell>الفرع</TableCell>
                                <TableCell>المدة</TableCell>
                                <TableCell>الميزانية</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell align="center">إجراء</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center">لا توجد برامج تدريب</TableCell>
                                </TableRow>
                            ) : rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <Stack spacing={0.4}>
                                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                {row.program_name_ar}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {row.program_name_en || row.description || '-'}
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        {row.start_date || '-'} / {row.end_date || '-'}
                                    </TableCell>
                                    <TableCell>
                                        {row.trainerEmployee
                                            ? `${row.trainerEmployee.employee_code} - ${row.trainerEmployee.first_name_ar} ${row.trainerEmployee.last_name_ar}`
                                            : '-'}
                                    </TableCell>
                                    <TableCell>{row.branch?.name_ar || '-'}</TableCell>
                                    <TableCell>{row.duration_days || '-'}</TableCell>
                                    <TableCell>{formatMoney(row.budget)}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            color={statusChipColor[row.status] || 'default'}
                                            label={statusLabel[row.status] || row.status}
                                        />
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
