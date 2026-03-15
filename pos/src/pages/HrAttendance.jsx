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

const defaultEntry = () => ({
    employee_id: '',
    attendance_date: new Date().toISOString().slice(0, 10),
    check_in: '',
    check_out: '',
    status: 'present',
    notes: ''
})

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

    const employeeName = useMemo(() => {
        const found = employees.find((item) => item.id === selectedEmployee)
        if (!found) return ''
        return `${found.first_name_ar || ''} ${found.last_name_ar || ''}`.trim()
    }, [employees, selectedEmployee])

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

    const handleMark = async () => {
        try {
            setSaving(true)
            await hrAPI.markAttendance({
                ...entry,
                employee_id: selectedEmployee
            })
            await loadAttendance()
            setEntry((prev) => ({ ...prev, check_in: '', check_out: '', notes: '', status: 'present' }))
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

            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
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
                    <TextField
                        label="من تاريخ"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                    />
                    <TextField
                        label="إلى تاريخ"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                    />
                    <TextField
                        select
                        label="الحالة"
                        sx={{ minWidth: 160 }}
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

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>
                    تسجيل حضور جديد {employeeName ? `- ${employeeName}` : ''}
                </Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                        label="التاريخ"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={entry.attendance_date}
                        onChange={(e) => setEntry((prev) => ({ ...prev, attendance_date: e.target.value }))}
                    />
                    <TextField
                        label="وقت الحضور"
                        type="time"
                        InputLabelProps={{ shrink: true }}
                        value={entry.check_in}
                        onChange={(e) => setEntry((prev) => ({ ...prev, check_in: e.target.value }))}
                    />
                    <TextField
                        label="وقت الانصراف"
                        type="time"
                        InputLabelProps={{ shrink: true }}
                        value={entry.check_out}
                        onChange={(e) => setEntry((prev) => ({ ...prev, check_out: e.target.value }))}
                    />
                    <TextField
                        select
                        label="الحالة"
                        sx={{ minWidth: 160 }}
                        value={entry.status}
                        onChange={(e) => setEntry((prev) => ({ ...prev, status: e.target.value }))}
                    >
                        {statusOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        fullWidth
                        label="ملاحظات"
                        value={entry.notes}
                        onChange={(e) => setEntry((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                    <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={handleMark}
                        disabled={saving || !selectedEmployee || !entry.attendance_date}
                    >
                        تسجيل
                    </Button>
                </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} sx={{ mb: 2 }}>
                <Chip color="success" label={`حاضر: ${summary.present}`} />
                <Chip color="error" label={`غائب: ${summary.absent}`} />
                <Chip color="warning" label={`متأخر: ${summary.late}`} />
                <Chip color="info" label={`نصف يوم: ${summary.half_day}`} />
                <Chip label={`إجازة: ${summary.leave}`} />
            </Stack>

            <Paper sx={{ overflowX: 'auto' }}>
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

