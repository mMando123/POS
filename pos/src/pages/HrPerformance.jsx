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
    { value: 'draft', label: 'مسودة' },
    { value: 'completed', label: 'مكتمل' },
    { value: 'reviewed', label: 'مراجع' }
]

const statusLabel = Object.fromEntries(statusOptions.map((item) => [item.value, item.label]))
const statusChipColor = {
    draft: 'default',
    completed: 'warning',
    reviewed: 'success'
}

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

    const selectedFormEmployee = useMemo(
        () => employees.find((employee) => employee.id === form.employee_id) || null,
        [employees, form.employee_id]
    )

    const performanceInsights = useMemo(() => {
        const ratedRows = rows.filter((row) => row.overall_rating !== null && row.overall_rating !== undefined && row.overall_rating !== '')
        const averageRating = ratedRows.length
            ? ratedRows.reduce((sum, row) => sum + Number(row.overall_rating || 0), 0) / ratedRows.length
            : 0
        const latestReview = rows[0] || null
        const reviewedCount = rows.filter((row) => row.status === 'reviewed').length

        return {
            totalReviews: rows.length,
            averageRating,
            reviewedCount,
            latestReview
        }
    }, [rows])

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

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="إجمالي التقييمات"
                        value={performanceInsights.totalReviews}
                        subtitle={employeeFilter ? 'وفق الفلاتر الحالية' : 'كل السجلات المعروضة'}
                        color="#1565c0"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="متوسط التقييم"
                        value={performanceInsights.averageRating.toFixed(2)}
                        subtitle="من 5 درجات"
                        color="#00838f"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="تقييمات مراجعة"
                        value={performanceInsights.reviewedCount}
                        subtitle={`مراجعة نهائية: ${summary.reviewed}`}
                        color="#2e7d32"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="تقييمات بانتظار الإغلاق"
                        value={summary.draft + summary.completed}
                        subtitle={`مسودات: ${summary.draft} | مكتملة: ${summary.completed}`}
                        color="#ef6c00"
                    />
                </Grid>
            </Grid>

            <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>فلاتر التقييمات</Typography>
                <Grid container spacing={1.5}>
                    <Grid item xs={12} md={8}>
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
                    </Grid>
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
                    <Chip label={`مسودة: ${summary.draft}`} />
                    <Chip color="warning" label={`مكتمل: ${summary.completed}`} />
                    <Chip color="success" label={`مراجع: ${summary.reviewed}`} />
                </Stack>
            </Paper>

            <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 1.25, fontWeight: 700 }}>إنشاء تقييم جديد</Typography>
                {selectedFormEmployee && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.75 }}>
                        {selectedFormEmployee.employee_code} | {selectedFormEmployee.department?.name_ar || 'بدون قسم'} | {selectedFormEmployee.designation?.title_ar || 'بدون مسمى'}
                    </Typography>
                )}
                <Grid container spacing={1.5}>
                    <Grid item xs={12} md={4}>
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
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="من"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={form.review_period_start}
                            onChange={(e) => setForm((prev) => ({ ...prev, review_period_start: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="إلى"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={form.review_period_end}
                            onChange={(e) => setForm((prev) => ({ ...prev, review_period_end: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="التقييم (0-5)"
                            type="number"
                            inputProps={{ min: 0, max: 5, step: 0.1 }}
                            value={form.overall_rating}
                            onChange={(e) => setForm((prev) => ({ ...prev, overall_rating: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
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
                            fullWidth
                            label="تعليقات"
                            value={form.comments}
                            onChange={(e) => setForm((prev) => ({ ...prev, comments: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            label="نقاط القوة"
                            value={form.strengths}
                            onChange={(e) => setForm((prev) => ({ ...prev, strengths: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            label="التحسين المطلوب"
                            value={form.areas_for_improvement}
                            onChange={(e) => setForm((prev) => ({ ...prev, areas_for_improvement: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={10}>
                        <TextField
                            fullWidth
                            label="أهداف الفترة القادمة"
                            value={form.goals_for_next_period}
                            onChange={(e) => setForm((prev) => ({ ...prev, goals_for_next_period: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <Button
                            fullWidth
                            sx={{ height: '100%', minHeight: 56 }}
                            variant="contained"
                            onClick={createReview}
                            disabled={saving || !form.employee_id}
                        >
                            حفظ التقييم
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ overflowX: 'auto', borderRadius: 2 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.25}>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>سجل تقييمات الأداء</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {performanceInsights.totalReviews} تقييم
                            </Typography>
                        </Box>
                        {performanceInsights.latestReview && (
                            <Chip
                                color={statusChipColor[performanceInsights.latestReview.status] || 'default'}
                                variant="outlined"
                                label={`آخر تقييم: ${performanceInsights.latestReview.employee?.employee_code || '-'} - ${statusLabel[performanceInsights.latestReview.status] || performanceInsights.latestReview.status}`}
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
                                        <Chip size="small" color={statusChipColor[row.status] || 'default'} label={statusLabel[row.status] || row.status} />
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
