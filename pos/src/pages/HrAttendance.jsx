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
import { Refresh as RefreshIcon, Save as SaveIcon } from '@mui/icons-material'
import { hrAPI } from '../services/api'

const statusOptions = [
    { value: 'present', label: 'حاضر' },
    { value: 'absent', label: 'غائب' },
    { value: 'late', label: 'متأخر' },
    { value: 'half_day', label: 'نصف يوم' },
    { value: 'leave', label: 'إجازة' }
]

const statusLabel = Object.fromEntries(statusOptions.map((item) => [item.value, item.label]))
const statusChipColor = {
    present: 'success',
    absent: 'error',
    late: 'warning',
    half_day: 'info',
    leave: 'default'
}

const defaultEntry = () => ({
    employee_id: '',
    attendance_date: new Date().toISOString().slice(0, 10),
    check_in: '',
    check_out: '',
    status: 'present',
    notes: ''
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

export default function HrAttendance() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const [employees, setEmployees] = useState([])
    const [rows, setRows] = useState([])
    const [summaryRows, setSummaryRows] = useState([])

    const [selectedEmployee, setSelectedEmployee] = useState('')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [entry, setEntry] = useState(defaultEntry)

    const summary = useMemo(() => {
        const base = { present: 0, absent: 0, late: 0, half_day: 0, leave: 0 }
        summaryRows.forEach((row) => {
            const key = row.status || row.dataValues?.status
            const count = Number(row.count || row.dataValues?.count || 0)
            if (key in base) base[key] = count
        })
        return base
    }, [summaryRows])

    const selectedEmployeeRecord = useMemo(
        () => employees.find((item) => item.id === selectedEmployee) || null,
        [employees, selectedEmployee]
    )

    const employeeName = useMemo(() => {
        if (!selectedEmployeeRecord) return ''
        return `${selectedEmployeeRecord.first_name_ar || ''} ${selectedEmployeeRecord.last_name_ar || ''}`.trim()
    }, [selectedEmployeeRecord])

    const attendanceInsights = useMemo(() => {
        const totalHours = rows.reduce((sum, row) => sum + Number(row.working_hours || 0), 0)
        const productiveDays = rows.filter((row) => ['present', 'late', 'half_day'].includes(row.status)).length
        const latestRecord = rows[0] || null
        const attendanceRate = rows.length > 0 ? ((productiveDays / rows.length) * 100) : 0

        return {
            totalRecords: rows.length,
            totalHours,
            productiveDays,
            attendanceRate,
            latestRecord
        }
    }, [rows])

    const syncEntryWithExistingRow = useCallback((row) => {
        if (!row) return

        setEntry((prev) => {
            const next = {
                ...prev,
                employee_id: selectedEmployee || prev.employee_id,
                attendance_date: row.attendance_date || prev.attendance_date,
                check_in: row.check_in || '',
                check_out: row.check_out || '',
                status: row.status || 'present',
                notes: row.notes || ''
            }

            if (
                prev.employee_id === next.employee_id &&
                prev.attendance_date === next.attendance_date &&
                prev.check_in === next.check_in &&
                prev.check_out === next.check_out &&
                prev.status === next.status &&
                prev.notes === next.notes
            ) {
                return prev
            }

            return next
        })
    }, [selectedEmployee])

    const loadEmployees = useCallback(async () => {
        const response = await hrAPI.getEmployees({ status: 'active', limit: 500 })
        const list = response.data?.data || []
        setEmployees(list)
        if (!selectedEmployee && list.length) {
            setSelectedEmployee(list[0].id)
            setEntry((prev) => ({ ...prev, employee_id: list[0].id }))
        }
    }, [selectedEmployee])

    const loadAttendance = useCallback(async () => {
        if (!selectedEmployee) return
        const [listRes, summaryRes] = await Promise.all([
            hrAPI.getEmployeeAttendance(selectedEmployee, {
                from_date: fromDate || undefined,
                to_date: toDate || undefined,
                status: statusFilter || undefined
            }),
            hrAPI.getAttendanceSummary({
                employee_id: selectedEmployee || undefined,
                from_date: fromDate || undefined,
                to_date: toDate || undefined
            })
        ])
        setRows(listRes.data?.data || [])
        setSummaryRows(summaryRes.data?.data || [])
    }, [selectedEmployee, fromDate, toDate, statusFilter])

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            await loadEmployees()
            if (selectedEmployee) {
                await loadAttendance()
            }
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل سجل الحضور')
        } finally {
            setLoading(false)
        }
    }, [loadEmployees, loadAttendance, selectedEmployee])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (!selectedEmployee) return
        setEntry((prev) => ({ ...prev, employee_id: selectedEmployee }))
        loadAttendance().catch((err) => {
            setError(err.response?.data?.message || 'تعذر تحديث سجل الحضور')
        })
    }, [selectedEmployee, fromDate, toDate, statusFilter, loadAttendance])

    useEffect(() => {
        if (!selectedEmployee || !entry.attendance_date) return
        const rowForSelectedDate = rows.find((row) => row.attendance_date === entry.attendance_date)
        if (rowForSelectedDate) {
            syncEntryWithExistingRow(rowForSelectedDate)
        }
    }, [rows, selectedEmployee, entry.attendance_date, syncEntryWithExistingRow])

    const handleMark = async () => {
        try {
            setSaving(true)
            await hrAPI.markAttendance({
                ...entry,
                employee_id: selectedEmployee
            })
            await loadAttendance()
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تسجيل الحضور')
        } finally {
            setSaving(false)
        }
    }

    const updateRowStatus = async (rowId, newStatus) => {
        try {
            await hrAPI.updateAttendance(rowId, { status: newStatus })
            await loadAttendance()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحديث حالة الحضور')
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>الحضور والانصراف</Typography>
                    <Typography color="text.secondary">تسجيل ومتابعة حضور الموظفين</Typography>
                </Box>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}>
                    تحديث
                </Button>
            </Stack>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="السجلات المعروضة"
                        value={attendanceInsights.totalRecords}
                        subtitle={selectedEmployeeRecord?.employee_code || 'اختر موظفًا'}
                        color="#1565c0"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="إجمالي ساعات العمل"
                        value={attendanceInsights.totalHours.toFixed(2)}
                        subtitle="ضمن الفترة المحددة"
                        color="#00838f"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="أيام الدوام الفعلي"
                        value={attendanceInsights.productiveDays}
                        subtitle={`نسبة انتظام ${attendanceInsights.attendanceRate.toFixed(1)}%`}
                        color="#2e7d32"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="آخر حالة مسجلة"
                        value={statusLabel[attendanceInsights.latestRecord?.status] || '-'}
                        subtitle={attendanceInsights.latestRecord?.attendance_date || 'لا توجد سجلات'}
                        color="#ef6c00"
                    />
                </Grid>
            </Grid>

            <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>فلاتر سجل الحضور</Typography>
                <Grid container spacing={1.5}>
                    <Grid item xs={12} md={6}>
                        <TextField
                            select
                            fullWidth
                            label="الموظف"
                            value={selectedEmployee}
                            onChange={(e) => setSelectedEmployee(e.target.value)}
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
                            label="من تاريخ"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="إلى تاريخ"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12} md={2}>
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

            <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 1.25, fontWeight: 700 }}>
                    تسجيل حضور جديد {employeeName ? `- ${employeeName}` : ''}
                </Typography>
                {selectedEmployeeRecord && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.75 }}>
                        {selectedEmployeeRecord.employee_code} | {selectedEmployeeRecord.department?.name_ar || 'بدون قسم'} | {selectedEmployeeRecord.designation?.title_ar || 'بدون مسمى'}
                    </Typography>
                )}
                <Grid container spacing={1.5} alignItems="stretch">
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="التاريخ"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={entry.attendance_date}
                            onChange={(e) => setEntry((prev) => ({ ...prev, attendance_date: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="وقت الحضور"
                            type="time"
                            InputLabelProps={{ shrink: true }}
                            value={entry.check_in}
                            onChange={(e) => setEntry((prev) => ({ ...prev, check_in: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="وقت الانصراف"
                            type="time"
                            InputLabelProps={{ shrink: true }}
                            value={entry.check_out}
                            onChange={(e) => setEntry((prev) => ({ ...prev, check_out: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            select
                            fullWidth
                            label="الحالة"
                            value={entry.status}
                            onChange={(e) => setEntry((prev) => ({ ...prev, status: e.target.value }))}
                        >
                            {statusOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <TextField
                            fullWidth
                            label="ملاحظات"
                            value={entry.notes}
                            onChange={(e) => setEntry((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={1}>
                        <Button
                            fullWidth
                            sx={{ height: '100%', minHeight: 56 }}
                            variant="contained"
                            startIcon={<SaveIcon />}
                            onClick={handleMark}
                            disabled={saving || !selectedEmployee || !entry.attendance_date}
                        >
                            تسجيل
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.25 }}>ملخص الفترة المحددة</Typography>
                <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap>
                    <Chip color="success" label={`حاضر: ${summary.present}`} />
                    <Chip color="error" label={`غائب: ${summary.absent}`} />
                    <Chip color="warning" label={`متأخر: ${summary.late}`} />
                    <Chip color="info" label={`نصف يوم: ${summary.half_day}`} />
                    <Chip label={`إجازة: ${summary.leave}`} />
                    <Chip variant="outlined" label={`الساعات: ${attendanceInsights.totalHours.toFixed(2)}`} />
                    <Chip variant="outlined" label={`السجلات: ${attendanceInsights.totalRecords}`} />
                </Stack>
            </Paper>

            <Paper sx={{ overflowX: 'auto', borderRadius: 2 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.25}>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>سجل الحضور</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {employeeName || 'الموظف المحدد'} - {attendanceInsights.totalRecords} سجل
                            </Typography>
                        </Box>
                        {attendanceInsights.latestRecord && (
                            <Chip
                                color={statusChipColor[attendanceInsights.latestRecord.status] || 'default'}
                                variant="outlined"
                                label={`آخر حالة: ${statusLabel[attendanceInsights.latestRecord.status] || attendanceInsights.latestRecord.status} - ${attendanceInsights.latestRecord.attendance_date}`}
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
                                <TableCell>التاريخ</TableCell>
                                <TableCell>حضور</TableCell>
                                <TableCell>انصراف</TableCell>
                                <TableCell>ساعات العمل</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell>ملاحظات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">لا توجد سجلات</TableCell>
                                </TableRow>
                            ) : rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.attendance_date}</TableCell>
                                    <TableCell>{row.check_in || '-'}</TableCell>
                                    <TableCell>{row.check_out || '-'}</TableCell>
                                    <TableCell>{Number(row.working_hours || 0).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <TextField
                                            select
                                            size="small"
                                            value={row.status}
                                            onChange={(e) => updateRowStatus(row.id, e.target.value)}
                                        >
                                            {statusOptions.map((option) => (
                                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                            ))}
                                        </TextField>
                                    </TableCell>
                                    <TableCell>{row.notes || '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Paper>
        </Box>
    )
}
