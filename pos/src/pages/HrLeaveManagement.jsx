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

const defaultLeaveForm = () => ({
    employee_id: '',
    leave_type: 'annual',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    number_of_days: 1,
    reason: '',
    notes: ''
})

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
    const [summaryRows, setSummaryRows] = useState([])

    const summary = useMemo(() => {
        const counters = {
            pending: 0,
            approved: 0,
            rejected: 0,
            cancelled: 0
        }
        summaryRows.forEach((row) => {
            const status = row.status || row.dataValues?.status
            const count = Number(row.count || row.dataValues?.count || 0)
            if (status in counters) counters[status] += count
        })
        return counters
    }, [summaryRows])

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
        const [leavesRes, balanceRes, summaryRes] = await Promise.all([
            hrAPI.getEmployeeLeaves(selectedEmployee, { status: statusFilter || undefined }),
            hrAPI.getLeaveBalance(selectedEmployee, { year: Number(year) }),
            hrAPI.getLeaveSummary()
        ])
        setLeaveRows(leavesRes.data?.data || [])
        setBalanceRows(balanceRes.data?.data || [])
        setSummaryRows(summaryRes.data?.data || [])
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
                        select
                        label="حالة الطلب"
                        sx={{ minWidth: 170 }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        {leaveStatusOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label="السنة المالية"
                        type="number"
                        sx={{ minWidth: 160 }}
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                    />
                </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} sx={{ mb: 2 }}>
                <Chip color="warning" label={`معلقة: ${summary.pending}`} />
                <Chip color="success" label={`معتمدة: ${summary.approved}`} />
                <Chip color="error" label={`مرفوضة: ${summary.rejected}`} />
                <Chip label={`ملغاة: ${summary.cancelled}`} />
            </Stack>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>طلب إجازة جديد</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                        select
                        label="نوع الإجازة"
                        sx={{ minWidth: 170 }}
                        value={form.leave_type}
                        onChange={(e) => setForm((prev) => ({ ...prev, leave_type: e.target.value }))}
                    >
                        {leaveTypeOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label="من تاريخ"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={form.start_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    />
                    <TextField
                        label="إلى تاريخ"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={form.end_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                    />
                    <TextField
                        label="عدد الأيام"
                        type="number"
                        sx={{ minWidth: 140 }}
                        value={form.number_of_days}
                        onChange={(e) => setForm((prev) => ({ ...prev, number_of_days: e.target.value }))}
                    />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
                    <TextField
                        label="السبب"
                        fullWidth
                        value={form.reason}
                        onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                    />
                    <TextField
                        label="ملاحظات"
                        fullWidth
                        value={form.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                    <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={createLeaveRequest}
                        disabled={saving || !selectedEmployee}
                    >
                        تسجيل الطلب
                    </Button>
                </Stack>
            </Paper>

            <Paper sx={{ mb: 2, overflowX: 'auto' }}>
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
                                            color={row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'error' : 'warning'}
                                            label={leaveStatusLabel[row.status] || row.status}
                                        />
                                    </TableCell>
                                    <TableCell>{row.reason || '-'}</TableCell>
                                    <TableCell align="center">
                                        <Stack direction="row" spacing={0.7} justifyContent="center">
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

            <Paper sx={{ overflowX: 'auto' }}>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>أرصدة الإجازات - {year}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        يمكن تعديل الأرصدة الموجودة. إنشاء رصيد جديد يتم تلقائيًا عند اعتماد الإجازة أو عبر سكربت إداري.
                    </Typography>
                </Box>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>النوع</TableCell>
                            <TableCell>رصيد افتتاحي</TableCell>
                            <TableCell>مخصص</TableCell>
                            <TableCell>مستخدم</TableCell>
                            <TableCell>مرحّل</TableCell>
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

