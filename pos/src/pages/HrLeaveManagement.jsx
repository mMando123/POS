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

const leaveTypeOptions = [
    { value: 'annual', label: 'سنوية' },
    { value: 'sick', label: 'مرضية' },
    { value: 'unpaid', label: 'بدون راتب' },
    { value: 'maternity', label: 'أمومة' },
    { value: 'compassionate', label: 'طارئة' }
]

const leaveStatusOptions = [
    { value: 'pending', label: 'معلقة' },
    { value: 'approved', label: 'معتمدة' },
    { value: 'rejected', label: 'مرفوضة' },
    { value: 'cancelled', label: 'ملغاة' }
]

const leaveTypeLabel = Object.fromEntries(leaveTypeOptions.map((item) => [item.value, item.label]))
const leaveStatusLabel = Object.fromEntries(leaveStatusOptions.map((item) => [item.value, item.label]))
const leaveStatusColor = {
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
    cancelled: 'default'
}

const defaultLeaveForm = () => ({
    employee_id: '',
    leave_type: 'annual',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    number_of_days: 1,
    reason: '',
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

export default function HrLeaveManagement() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const [employees, setEmployees] = useState([])
    const [selectedEmployee, setSelectedEmployee] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [year, setYear] = useState(String(new Date().getFullYear()))

    const [leaveRows, setLeaveRows] = useState([])
    const [balanceRows, setBalanceRows] = useState([])
    const [form, setForm] = useState(defaultLeaveForm)

    const summary = useMemo(() => {
        const counters = { pending: 0, approved: 0, rejected: 0, cancelled: 0 }
        leaveRows.forEach((row) => {
            if (row.status in counters) counters[row.status] += 1
        })
        return counters
    }, [leaveRows])

    const selectedEmployeeRecord = useMemo(
        () => employees.find((item) => item.id === selectedEmployee) || null,
        [employees, selectedEmployee]
    )

    const selectedEmployeeLabel = useMemo(() => {
        if (!selectedEmployeeRecord) return 'الموظف المحدد'
        return `${selectedEmployeeRecord.employee_code || ''} - ${selectedEmployeeRecord.first_name_ar || ''} ${selectedEmployeeRecord.last_name_ar || ''}`.trim()
    }, [selectedEmployeeRecord])

    const leaveInsights = useMemo(() => {
        const totalDays = leaveRows.reduce((sum, row) => sum + Number(row.number_of_days || 0), 0)
        const approvedDays = leaveRows
            .filter((row) => row.status === 'approved')
            .reduce((sum, row) => sum + Number(row.number_of_days || 0), 0)
        const annualBalance = balanceRows.find((row) => row.leave_type === 'annual')
        const latestLeave = leaveRows[0] || null

        return {
            totalRequests: leaveRows.length,
            totalDays,
            approvedDays,
            annualRemaining: Number(annualBalance?.remaining || 0),
            latestLeave
        }
    }, [leaveRows, balanceRows])

    const fetchEmployees = useCallback(async () => {
        const response = await hrAPI.getEmployees({ limit: 500 })
        const list = response.data?.data || []
        setEmployees(list)
        if (!selectedEmployee && list.length) {
            setSelectedEmployee(list[0].id)
            setForm((prev) => ({ ...prev, employee_id: list[0].id }))
        }
    }, [selectedEmployee])

    const fetchEmployeeData = useCallback(async () => {
        if (!selectedEmployee) return
        const [leavesRes, balanceRes] = await Promise.all([
            hrAPI.getEmployeeLeaves(selectedEmployee, { status: statusFilter || undefined }),
            hrAPI.getLeaveBalance(selectedEmployee, { year: Number(year) })
        ])
        setLeaveRows(leavesRes.data?.data || [])
        setBalanceRows(balanceRes.data?.data || [])
    }, [selectedEmployee, statusFilter, year])

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            await fetchEmployees()
            if (selectedEmployee) {
                await fetchEmployeeData()
            }
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل بيانات الإجازات')
        } finally {
            setLoading(false)
        }
    }, [fetchEmployees, fetchEmployeeData, selectedEmployee])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (!selectedEmployee) return
        setForm((prev) => ({ ...prev, employee_id: selectedEmployee }))
        fetchEmployeeData().catch((err) => {
            setError(err.response?.data?.message || 'تعذر تحديث بيانات الإجازات')
        })
    }, [selectedEmployee, statusFilter, year, fetchEmployeeData])

    const createLeaveRequest = async () => {
        try {
            setSaving(true)
            await hrAPI.createLeaveRequest({
                ...form,
                employee_id: selectedEmployee,
                number_of_days: Number(form.number_of_days || 1)
            })
            await fetchEmployeeData()
            setForm((prev) => ({ ...defaultLeaveForm(), employee_id: selectedEmployee }))
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر إنشاء طلب الإجازة')
        } finally {
            setSaving(false)
        }
    }

    const updateLeaveStatus = async (leaveId, status) => {
        try {
            await hrAPI.updateLeaveRequest(leaveId, { status })
            await fetchEmployeeData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحديث حالة طلب الإجازة')
        }
    }

    const updateBalanceRow = async (row) => {
        try {
            await hrAPI.updateLeaveBalance(row.id, {
                opening_balance: Number(row.opening_balance || 0),
                allocated: Number(row.allocated || 0),
                used: Number(row.used || 0),
                carried_forward: Number(row.carried_forward || 0)
            })
            await fetchEmployeeData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحديث رصيد الإجازة')
        }
    }

    const patchBalance = (id, key, value) => {
        setBalanceRows((prev) => prev.map((row) => (
            row.id === id ? { ...row, [key]: value } : row
        )))
    }

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>إدارة الإجازات</Typography>
                    <Typography color="text.secondary">طلبات الإجازة والأرصدة السنوية</Typography>
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
                        title="طلبات الإجازة"
                        value={leaveInsights.totalRequests}
                        subtitle={selectedEmployeeRecord?.employee_code || 'اختر موظفًا'}
                        color="#1565c0"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="إجمالي الأيام المطلوبة"
                        value={leaveInsights.totalDays}
                        subtitle="كل الطلبات المعروضة"
                        color="#00838f"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="أيام معتمدة"
                        value={leaveInsights.approvedDays}
                        subtitle={`معتمدة: ${summary.approved}`}
                        color="#2e7d32"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <MetricCard
                        title="المتبقي السنوي"
                        value={leaveInsights.annualRemaining.toFixed(2)}
                        subtitle={`رصيد السنوية ${year}`}
                        color="#ef6c00"
                    />
                </Grid>
            </Grid>

            <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>فلاتر الإجازات</Typography>
                <Grid container spacing={1.5}>
                    <Grid item xs={12} md={7}>
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
                    <Grid item xs={12} md={3}>
                        <TextField
                            select
                            fullWidth
                            label="حالة الطلب"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <MenuItem value="">الكل</MenuItem>
                            {leaveStatusOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <TextField
                            fullWidth
                            label="السنة المالية"
                            type="number"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                        />
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.25 }}>ملخص الحالات</Typography>
                <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap>
                    <Chip color="warning" label={`معلقة: ${summary.pending}`} />
                    <Chip color="success" label={`معتمدة: ${summary.approved}`} />
                    <Chip color="error" label={`مرفوضة: ${summary.rejected}`} />
                    <Chip label={`ملغاة: ${summary.cancelled}`} />
                </Stack>
            </Paper>

            <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 1.25, fontWeight: 700 }}>طلب إجازة جديد</Typography>
                {selectedEmployeeRecord && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.75 }}>
                        {selectedEmployeeRecord.employee_code} | {selectedEmployeeRecord.department?.name_ar || 'بدون قسم'} | {selectedEmployeeRecord.designation?.title_ar || 'بدون مسمى'}
                    </Typography>
                )}
                <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            select
                            fullWidth
                            label="نوع الإجازة"
                            value={form.leave_type}
                            onChange={(e) => setForm((prev) => ({ ...prev, leave_type: e.target.value }))}
                        >
                            {leaveTypeOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="من تاريخ"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={form.start_date}
                            onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="إلى تاريخ"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={form.end_date}
                            onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField
                            fullWidth
                            label="عدد الأيام"
                            type="number"
                            value={form.number_of_days}
                            onChange={(e) => setForm((prev) => ({ ...prev, number_of_days: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <TextField
                            fullWidth
                            label="السبب"
                            value={form.reason}
                            onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <TextField
                            fullWidth
                            label="ملاحظات"
                            value={form.notes}
                            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <Button
                            fullWidth
                            sx={{ height: '100%', minHeight: 56 }}
                            variant="contained"
                            startIcon={<SaveIcon />}
                            onClick={createLeaveRequest}
                            disabled={saving || !selectedEmployee}
                        >
                            تسجيل الطلب
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ mb: 2, overflowX: 'auto', borderRadius: 2 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.25}>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>سجل طلبات الإجازة</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {selectedEmployeeLabel} - {leaveInsights.totalRequests} طلب
                            </Typography>
                        </Box>
                        {leaveInsights.latestLeave && (
                            <Chip
                                color={leaveStatusColor[leaveInsights.latestLeave.status] || 'default'}
                                variant="outlined"
                                label={`آخر طلب: ${leaveTypeLabel[leaveInsights.latestLeave.leave_type] || leaveInsights.latestLeave.leave_type} - ${leaveStatusLabel[leaveInsights.latestLeave.status] || leaveInsights.latestLeave.status}`}
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
                                <TableCell>النوع</TableCell>
                                <TableCell>من</TableCell>
                                <TableCell>إلى</TableCell>
                                <TableCell>الأيام</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell>السبب</TableCell>
                                <TableCell align="center">إجراء</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {leaveRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">لا توجد طلبات إجازة</TableCell>
                                </TableRow>
                            ) : leaveRows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{leaveTypeLabel[row.leave_type] || row.leave_type}</TableCell>
                                    <TableCell>{row.start_date}</TableCell>
                                    <TableCell>{row.end_date}</TableCell>
                                    <TableCell>{row.number_of_days}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            color={leaveStatusColor[row.status] || 'default'}
                                            label={leaveStatusLabel[row.status] || row.status}
                                        />
                                    </TableCell>
                                    <TableCell>{row.reason || '-'}</TableCell>
                                    <TableCell align="center">
                                        <Stack direction="row" spacing={0.7} justifyContent="center" flexWrap="wrap" useFlexGap>
                                            <Button size="small" color="success" variant="outlined" onClick={() => updateLeaveStatus(row.id, 'approved')}>
                                                اعتماد
                                            </Button>
                                            <Button size="small" color="error" variant="outlined" onClick={() => updateLeaveStatus(row.id, 'rejected')}>
                                                رفض
                                            </Button>
                                            <Button size="small" variant="outlined" onClick={() => updateLeaveStatus(row.id, 'cancelled')}>
                                                إلغاء
                                            </Button>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Paper>

            <Paper sx={{ overflowX: 'auto', borderRadius: 2 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>أرصدة الإجازات - {year}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        تعديل الأرصدة السنوية للموظف المحدد وحفظها مباشرة
                    </Typography>
                </Box>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>النوع</TableCell>
                            <TableCell>رصيد افتتاحي</TableCell>
                            <TableCell>مخصص</TableCell>
                            <TableCell>مستخدم</TableCell>
                            <TableCell>مرحل</TableCell>
                            <TableCell>المتبقي</TableCell>
                            <TableCell align="center">إجراء</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {balanceRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} align="center">لا توجد أرصدة لهذا الموظف/السنة</TableCell>
                            </TableRow>
                        ) : balanceRows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{leaveTypeLabel[row.leave_type] || row.leave_type}</TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        value={row.opening_balance}
                                        onChange={(e) => patchBalance(row.id, 'opening_balance', e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        value={row.allocated}
                                        onChange={(e) => patchBalance(row.id, 'allocated', e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        value={row.used}
                                        onChange={(e) => patchBalance(row.id, 'used', e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        value={row.carried_forward}
                                        onChange={(e) => patchBalance(row.id, 'carried_forward', e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>{Number(row.remaining || 0).toFixed(2)}</TableCell>
                                <TableCell align="center">
                                    <Button size="small" variant="contained" onClick={() => updateBalanceRow(row)}>
                                        حفظ
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        </Box>
    )
}
