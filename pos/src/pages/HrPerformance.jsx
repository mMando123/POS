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
    { value: 'draft', label: 'مسودة' },
    { value: 'completed', label: 'مكتمل' },
    { value: 'reviewed', label: 'مراجع' }
]

const statusLabel = Object.fromEntries(statusOptions.map((item) => [item.value, item.label]))

const defaultForm = () => ({
    employee_id: '',
    review_period_start: '',
    review_period_end: '',
    overall_rating: '',
    comments: '',
    strengths: '',
    areas_for_improvement: '',
    goals_for_next_period: '',
    status: 'draft'
})

export default function HrPerformance() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const [employees, setEmployees] = useState([])
    const [rows, setRows] = useState([])
    const [summaryRows, setSummaryRows] = useState([])
    const [employeeFilter, setEmployeeFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [form, setForm] = useState(defaultForm)

    const summary = useMemo(() => {
        const values = { draft: 0, completed: 0, reviewed: 0 }
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
            const [employeesRes, reviewsRes, summaryRes] = await Promise.all([
                hrAPI.getEmployees({ limit: 500 }),
                hrAPI.getPerformanceReviews({
                    employee_id: employeeFilter || undefined,
                    status: statusFilter || undefined,
                    limit: 500
                }),
                hrAPI.getPerformanceSummary({
                    employee_id: employeeFilter || undefined,
                    status: statusFilter || undefined
                })
            ])
            const employeesList = employeesRes.data?.data || []
            setEmployees(employeesList)
            setRows(reviewsRes.data?.data || [])
            setSummaryRows(summaryRes.data?.data || [])
            if (!form.employee_id && employeesList.length) {
                setForm((prev) => ({ ...prev, employee_id: employeesList[0].id }))
            }
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل تقييمات الأداء')
        } finally {
            setLoading(false)
        }
    }, [employeeFilter, statusFilter, form.employee_id])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const createReview = async () => {
        try {
            setSaving(true)
            await hrAPI.createPerformanceReview({
                ...form,
                overall_rating: form.overall_rating ? Number(form.overall_rating) : null
            })
            setForm((prev) => ({ ...defaultForm(), employee_id: prev.employee_id }))
            await fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر إنشاء تقييم الأداء')
        } finally {
            setSaving(false)
        }
    }

    const updateStatus = async (id, status) => {
        try {
            await hrAPI.updatePerformanceReview(id, { status })
            await fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحديث حالة التقييم')
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>تقييمات الأداء</Typography>
                    <Typography color="text.secondary">متابعة تقييمات الموظفين الدورية</Typography>
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
                        fullWidth
                        label="الموظف"
                        value={employeeFilter}
                        onChange={(e) => setEmployeeFilter(e.target.value)}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        {employees.map((employee) => (
                            <MenuItem key={employee.id} value={employee.id}>
                                {employee.employee_code} - {employee.first_name_ar} {employee.last_name_ar}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        label="الحالة"
                        sx={{ minWidth: 180 }}
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
                <Chip label={`مسودة: ${summary.draft}`} />
                <Chip color="warning" label={`مكتمل: ${summary.completed}`} />
                <Chip color="success" label={`مراجع: ${summary.reviewed}`} />
            </Stack>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>إنشاء تقييم جديد</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                        select
                        fullWidth
                        label="الموظف"
                        value={form.employee_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, employee_id: e.target.value }))}
                    >
                        {employees.map((employee) => (
                            <MenuItem key={employee.id} value={employee.id}>
                                {employee.employee_code} - {employee.first_name_ar} {employee.last_name_ar}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label="من"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={form.review_period_start}
                        onChange={(e) => setForm((prev) => ({ ...prev, review_period_start: e.target.value }))}
                    />
                    <TextField
                        label="إلى"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={form.review_period_end}
                        onChange={(e) => setForm((prev) => ({ ...prev, review_period_end: e.target.value }))}
                    />
                    <TextField
                        label="التقييم (0-5)"
                        type="number"
                        inputProps={{ min: 0, max: 5, step: 0.1 }}
                        sx={{ minWidth: 140 }}
                        value={form.overall_rating}
                        onChange={(e) => setForm((prev) => ({ ...prev, overall_rating: e.target.value }))}
                    />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
                    <TextField
                        fullWidth
                        label="تعليقات"
                        value={form.comments}
                        onChange={(e) => setForm((prev) => ({ ...prev, comments: e.target.value }))}
                    />
                    <TextField
                        fullWidth
                        label="نقاط القوة"
                        value={form.strengths}
                        onChange={(e) => setForm((prev) => ({ ...prev, strengths: e.target.value }))}
                    />
                    <TextField
                        fullWidth
                        label="التحسين المطلوب"
                        value={form.areas_for_improvement}
                        onChange={(e) => setForm((prev) => ({ ...prev, areas_for_improvement: e.target.value }))}
                    />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
                    <TextField
                        fullWidth
                        label="أهداف الفترة القادمة"
                        value={form.goals_for_next_period}
                        onChange={(e) => setForm((prev) => ({ ...prev, goals_for_next_period: e.target.value }))}
                    />
                    <Button
                        variant="contained"
                        onClick={createReview}
                        disabled={saving || !form.employee_id}
                    >
                        حفظ التقييم
                    </Button>
                </Stack>
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
                                <TableCell>الموظف</TableCell>
                                <TableCell>فترة التقييم</TableCell>
                                <TableCell>الدرجة</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell>تعليقات</TableCell>
                                <TableCell align="center">إجراء</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">لا توجد تقييمات</TableCell>
                                </TableRow>
                            ) : rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        {row.employee?.employee_code} - {row.employee?.first_name_ar} {row.employee?.last_name_ar}
                                    </TableCell>
                                    <TableCell>
                                        {row.review_period_start || '-'} / {row.review_period_end || '-'}
                                    </TableCell>
                                    <TableCell>{row.overall_rating ?? '-'}</TableCell>
                                    <TableCell>
                                        <Chip size="small" label={statusLabel[row.status] || row.status} />
                                    </TableCell>
                                    <TableCell>{row.comments || '-'}</TableCell>
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

