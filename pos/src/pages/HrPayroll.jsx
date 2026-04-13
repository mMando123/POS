import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
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
import { Download as DownloadIcon, Refresh as RefreshIcon, PlayArrow as ProcessIcon } from '@mui/icons-material'
import { branchAPI, hrAPI } from '../services/api'
import { exportToExcel } from '../utils/excelExport'

const AUTO_UNPAID_LEAVE_COMPONENT_EN = 'auto_unpaid_leave_deduction'
const AUTO_ABSENCE_DEDUCTION_COMPONENT_EN = 'auto_attendance_absence_deduction'
const AUTO_HALF_DAY_DEDUCTION_COMPONENT_EN = 'auto_attendance_half_day_deduction'
const AUTO_LATE_DEDUCTION_COMPONENT_EN = 'auto_attendance_late_deduction'
const AUTO_GENERATED_COMPONENTS = new Set([
    AUTO_UNPAID_LEAVE_COMPONENT_EN,
    AUTO_ABSENCE_DEDUCTION_COMPONENT_EN,
    AUTO_HALF_DAY_DEDUCTION_COMPONENT_EN,
    AUTO_LATE_DEDUCTION_COMPONENT_EN
])
const autoComponentLabel = {
    [AUTO_UNPAID_LEAVE_COMPONENT_EN]: 'إجازات غير مدفوعة',
    [AUTO_ABSENCE_DEDUCTION_COMPONENT_EN]: 'غياب',
    [AUTO_HALF_DAY_DEDUCTION_COMPONENT_EN]: 'نصف يوم',
    [AUTO_LATE_DEDUCTION_COMPONENT_EN]: 'تأخير'
}
const componentTypeLabel = {
    allowance: 'بدل',
    deduction: 'خصم',
    bonus: 'مكافأة'
}
const componentTypeColor = {
    allowance: 'success',
    deduction: 'error',
    bonus: 'info'
}

const statusColor = {
    draft: 'default',
    processing: 'warning',
    approved: 'info',
    paid: 'success',
    rejected: 'error'
}

const statusLabel = {
    draft: 'مسودة',
    processing: 'قيد المعالجة',
    approved: 'معتمد',
    paid: 'مدفوع',
    rejected: 'مرفوض'
}

const currentMonth = () => {
    const now = new Date()
    const month = `${now.getMonth() + 1}`.padStart(2, '0')
    return `${now.getFullYear()}-${month}`
}

const currentDate = () => new Date().toISOString().slice(0, 10)

const getComponentAmount = (components, componentNameEn) => (
    Number(
        (components || []).find((item) => item.component_name_en === componentNameEn)?.amount || 0
    )
)

const getAutoDeductionBreakdown = (components = []) => {
    const unpaidLeave = getComponentAmount(components, AUTO_UNPAID_LEAVE_COMPONENT_EN)
    const absence = getComponentAmount(components, AUTO_ABSENCE_DEDUCTION_COMPONENT_EN)
    const halfDay = getComponentAmount(components, AUTO_HALF_DAY_DEDUCTION_COMPONENT_EN)
    const late = getComponentAmount(components, AUTO_LATE_DEDUCTION_COMPONENT_EN)

    return {
        unpaidLeave,
        absence,
        halfDay,
        late,
        total: unpaidLeave + absence + halfDay + late
    }
}

export default function HrPayroll() {
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [error, setError] = useState('')
    const [period, setPeriod] = useState(currentMonth())
    const [statusFilter, setStatusFilter] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
    const [employeeFilter, setEmployeeFilter] = useState('')
    const [departmentFilter, setDepartmentFilter] = useState('')
    const [branchFilter, setBranchFilter] = useState('')
    const [rows, setRows] = useState([])
    const [employees, setEmployees] = useState([])
    const [departments, setDepartments] = useState([])
    const [branches, setBranches] = useState([])
    const [selectedIds, setSelectedIds] = useState([])
    const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
    const [paymentDate, setPaymentDate] = useState(currentDate())
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailSalary, setDetailSalary] = useState(null)

    const currentUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null')
        } catch {
            return null
        }
    }, [])
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
    const filteredDepartmentOptions = useMemo(
        () => departments.filter((department) => !branchFilter || department.branch_id === branchFilter),
        [departments, branchFilter]
    )
    const filteredEmployeeOptions = useMemo(
        () => employees.filter((employee) => {
            if (branchFilter && employee.branch_id !== branchFilter) return false
            if (departmentFilter && employee.department_id !== departmentFilter) return false
            return true
        }),
        [employees, branchFilter, departmentFilter]
    )
    const filteredRows = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase()
        if (!normalizedSearch) {
            return rows
        }

        return rows.filter((row) => {
            const employee = row.employee || {}
            const searchableValues = [
                employee.employee_code,
                employee.first_name_ar,
                employee.last_name_ar,
                employee.first_name_en,
                employee.last_name_en,
                employee.branch?.name_ar,
                employee.department?.name_ar,
                employee.designation?.title_ar,
                String(row.salary_period || '').slice(0, 7),
                statusLabel[row.status],
                row.status,
                row.notes
            ]

            return searchableValues.some((value) =>
                String(value || '').toLowerCase().includes(normalizedSearch)
            )
        })
    }, [rows, searchTerm])
    const derivedSummary = useMemo(() => filteredRows.reduce((acc, row) => {
        const autoDeductions = getAutoDeductionBreakdown(row.components || [])

        acc.totalNetSalary += Number(row.net_salary || 0)
        acc.totalGrossSalary += Number(row.gross_salary || 0)
        acc.unpaidLeaveDeduction += autoDeductions.unpaidLeave
        acc.attendanceDeduction += (autoDeductions.absence + autoDeductions.halfDay + autoDeductions.late)
        acc.absenceDeduction += autoDeductions.absence
        acc.halfDayDeduction += autoDeductions.halfDay
        acc.lateDeduction += autoDeductions.late
        return acc
    }, {
        totalNetSalary: 0,
        totalGrossSalary: 0,
        unpaidLeaveDeduction: 0,
        attendanceDeduction: 0,
        absenceDeduction: 0,
        halfDayDeduction: 0,
        lateDeduction: 0
    }), [filteredRows])
    const actionableVisibleIds = useMemo(
        () => filteredRows.filter((row) => row.status !== 'paid').map((row) => row.id),
        [filteredRows]
    )
    const allVisibleSelected = actionableVisibleIds.length > 0 && actionableVisibleIds.every((id) => selectedSet.has(id))
    const someVisibleSelected = actionableVisibleIds.some((id) => selectedSet.has(id))
    const detailBreakdown = useMemo(() => {
        const components = detailSalary?.components || []
        const autoComponents = components.filter((item) => AUTO_GENERATED_COMPONENTS.has(item.component_name_en))
        const manualComponents = components.filter((item) => !AUTO_GENERATED_COMPONENTS.has(item.component_name_en))

        const manualTotals = manualComponents.reduce((acc, item) => {
            const amount = Number(item.amount || 0)
            if (item.component_type === 'deduction') acc.deductions += amount
            else acc.allowances += amount
            return acc
        }, { allowances: 0, deductions: 0 })

        const autoTotals = {
            unpaidLeave: getComponentAmount(autoComponents, AUTO_UNPAID_LEAVE_COMPONENT_EN),
            absence: getComponentAmount(autoComponents, AUTO_ABSENCE_DEDUCTION_COMPONENT_EN),
            halfDay: getComponentAmount(autoComponents, AUTO_HALF_DAY_DEDUCTION_COMPONENT_EN),
            late: getComponentAmount(autoComponents, AUTO_LATE_DEDUCTION_COMPONENT_EN)
        }

        return {
            autoComponents,
            manualComponents,
            manualTotals,
            autoTotals,
            autoTotal: autoTotals.unpaidLeave + autoTotals.absence + autoTotals.halfDay + autoTotals.late
        }
    }, [detailSalary])

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const salariesRes = await hrAPI.getSalaries({
                period: period || undefined,
                status: statusFilter || undefined,
                employee_id: employeeFilter || undefined,
                department_id: departmentFilter || undefined,
                branch_id: branchFilter || undefined,
                limit: 500
            })
            setRows(salariesRes.data?.data || [])
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل بيانات الرواتب')
        } finally {
            setLoading(false)
        }
    }, [period, statusFilter, employeeFilter, departmentFilter, branchFilter])

    const fetchFilterOptions = useCallback(async () => {
        try {
            const [employeesRes, departmentsRes, branchesRes] = await Promise.all([
                hrAPI.getEmployees({ status: 'active', limit: 500 }),
                hrAPI.getDepartments({ status: 'active', limit: 500 }),
                branchAPI.getAll({ includeInactive: false })
            ])

            setEmployees(employeesRes.data?.data || [])
            setDepartments(departmentsRes.data?.data || [])
            setBranches(branchesRes.data?.data || [])
        } catch (err) {
            setError((prev) => prev || err.response?.data?.message || 'تعذر تحميل فلاتر الرواتب')
        }
    }, [])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        fetchFilterOptions()
    }, [fetchFilterOptions])

    useEffect(() => {
        setSelectedIds((prev) => prev.filter((id) => filteredRows.some((row) => row.id === id)))
    }, [filteredRows])

    useEffect(() => {
        if (departmentFilter && !filteredDepartmentOptions.some((department) => department.id === departmentFilter)) {
            setDepartmentFilter('')
        }
    }, [departmentFilter, filteredDepartmentOptions])

    useEffect(() => {
        if (employeeFilter && !filteredEmployeeOptions.some((employee) => employee.id === employeeFilter)) {
            setEmployeeFilter('')
        }
    }, [employeeFilter, filteredEmployeeOptions])

    const processPayroll = async () => {
        try {
            setProcessing(true)
            await hrAPI.processPayroll({ period })
            await fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر معالجة الرواتب')
        } finally {
            setProcessing(false)
        }
    }

    const approveSelected = async () => {
        if (!selectedIds.length) return
        try {
            setProcessing(true)
            await hrAPI.approvePayroll(selectedIds)
            setSelectedIds([])
            await fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر اعتماد الرواتب')
        } finally {
            setProcessing(false)
        }
    }

    const disburseSelected = async () => {
        if (!selectedIds.length) return
        try {
            setProcessing(true)
            await hrAPI.disbursePayroll({
                salary_ids: selectedIds,
                payment_method: paymentMethod,
                payment_date: paymentDate || undefined
            })
            setSelectedIds([])
            await fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر صرف الرواتب')
        } finally {
            setProcessing(false)
        }
    }

    const toggleSelect = (salaryId) => {
        setSelectedIds((prev) => (
            prev.includes(salaryId) ? prev.filter((id) => id !== salaryId) : [...prev, salaryId]
        ))
    }

    const toggleSelectAll = () => {
        if (!actionableVisibleIds.length) return

        setSelectedIds((prev) => {
            if (allVisibleSelected) {
                return prev.filter((id) => !actionableVisibleIds.includes(id))
            }

            return Array.from(new Set([...prev, ...actionableVisibleIds]))
        })
    }

    const openSalaryDetails = async (salaryId) => {
        try {
            setDetailOpen(true)
            setDetailLoading(true)
            const response = await hrAPI.getSalaryById(salaryId)
            setDetailSalary(response.data?.data || null)
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل تفاصيل سند الراتب')
        } finally {
            setDetailLoading(false)
        }
    }

    const closeSalaryDetails = () => {
        setDetailOpen(false)
        setDetailSalary(null)
        setDetailLoading(false)
    }

    const exportPayrollSheet = () => {
        if (!filteredRows.length) {
            setError('لا توجد سجلات لتصديرها')
            return
        }

        const exportRows = filteredRows.map((row) => {
            const employee = row.employee || {}
            const autoDeductions = getAutoDeductionBreakdown(row.components || [])

            return {
                employee_code: employee.employee_code || '',
                employee_name_ar: `${employee.first_name_ar || ''} ${employee.last_name_ar || ''}`.trim(),
                employee_name_en: `${employee.first_name_en || ''} ${employee.last_name_en || ''}`.trim(),
                branch: employee.branch?.name_ar || '',
                department: employee.department?.name_ar || '',
                designation: employee.designation?.title_ar || '',
                salary_period: String(row.salary_period || '').slice(0, 7),
                status: statusLabel[row.status] || row.status || '',
                base_salary: Number(row.base_salary || 0),
                gross_salary: Number(row.gross_salary || 0),
                unpaid_leave_deduction: autoDeductions.unpaidLeave,
                absence_deduction: autoDeductions.absence,
                half_day_deduction: autoDeductions.halfDay,
                late_deduction: autoDeductions.late,
                auto_deductions_total: autoDeductions.total,
                net_salary: Number(row.net_salary || 0),
                notes: row.notes || ''
            }
        })

        const exported = exportToExcel(
            exportRows,
            `hr-payroll-${period || 'all'}`,
            'Payroll'
        )

        if (!exported) {
            setError('تعذر تصدير كشف الرواتب')
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>إدارة الرواتب</Typography>
                    <Typography color="text.secondary">معالجة واعتماد وصرف الرواتب</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}>
                        تحديث
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<ProcessIcon />}
                        onClick={processPayroll}
                        disabled={processing || !period}
                    >
                        معالجة الفترة
                    </Button>
                </Stack>
            </Stack>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                        label="الفترة (YYYY-MM)"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        sx={{ minWidth: 200 }}
                    />
                    {currentUser?.role === 'admin' && branches.length > 1 && (
                        <TextField
                            select
                            label="الفرع"
                            sx={{ minWidth: 200 }}
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                        >
                            <MenuItem value="">الكل</MenuItem>
                            {branches.map((branch) => (
                                <MenuItem key={branch.id} value={branch.id}>
                                    {branch.name_ar}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                    <TextField
                        select
                        label="الحالة"
                        sx={{ minWidth: 180 }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        {Object.keys(statusLabel).map((status) => (
                            <MenuItem key={status} value={status}>{statusLabel[status]}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        label="القسم"
                        sx={{ minWidth: 200 }}
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value)}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        {filteredDepartmentOptions.map((department) => (
                            <MenuItem key={department.id} value={department.id}>
                                {department.name_ar}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        label="الموظف"
                        sx={{ minWidth: 240 }}
                        value={employeeFilter}
                        onChange={(e) => setEmployeeFilter(e.target.value)}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        {filteredEmployeeOptions.map((employee) => (
                            <MenuItem key={employee.id} value={employee.id}>
                                {employee.employee_code} - {employee.first_name_ar} {employee.last_name_ar}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label="بحث بالموظف / الفترة"
                        sx={{ minWidth: 220 }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="كود الموظف أو الاسم..."
                    />
                    <TextField
                        select
                        label="طريقة الصرف"
                        sx={{ minWidth: 180 }}
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                        <MenuItem value="bank_transfer">تحويل بنكي</MenuItem>
                        <MenuItem value="cash">نقدي</MenuItem>
                        <MenuItem value="check">شيك</MenuItem>
                        <MenuItem value="card">بطاقة</MenuItem>
                    </TextField>
                    <TextField
                        label="تاريخ الصرف"
                        type="date"
                        sx={{ minWidth: 180 }}
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                    />
                    <Button
                        variant="outlined"
                        color="success"
                        onClick={approveSelected}
                        disabled={processing || !selectedIds.length}
                    >
                        اعتماد المحدد
                    </Button>
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={disburseSelected}
                        disabled={processing || !selectedIds.length}
                    >
                        صرف المحدد
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={exportPayrollSheet}
                        disabled={loading || !filteredRows.length}
                    >
                        تصدير Excel
                    </Button>
                </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography color="text.secondary">إجمالي صافي الرواتب</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {Number(derivedSummary.totalNetSalary || 0).toFixed(2)}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography color="text.secondary">إجمالي الرواتب الإجمالي</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {Number(derivedSummary.totalGrossSalary || 0).toFixed(2)}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography color="text.secondary">عدد السجلات</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {filteredRows.length}
                    </Typography>
                    {searchTerm.trim() && (
                        <Typography variant="caption" color="text.secondary">
                            نتائج مفلترة من إجمالي {rows.length} سجل
                        </Typography>
                    )}
                </Paper>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography color="text.secondary">إجمالي خصم الحضور</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.main' }}>
                        {Number(derivedSummary.attendanceDeduction || 0).toFixed(2)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        غياب: {Number(derivedSummary.absenceDeduction || 0).toFixed(2)} | نصف يوم: {Number(derivedSummary.halfDayDeduction || 0).toFixed(2)} | تأخير: {Number(derivedSummary.lateDeduction || 0).toFixed(2)}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography color="text.secondary">إجمالي خصم الإجازات غير المدفوعة</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.main' }}>
                        {Number(derivedSummary.unpaidLeaveDeduction || 0).toFixed(2)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        محسوب تلقائيًا من الإجازات المعتمدة داخل الفترة
                    </Typography>
                </Paper>
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
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        checked={allVisibleSelected}
                                        indeterminate={!allVisibleSelected && someVisibleSelected}
                                        onChange={toggleSelectAll}
                                    />
                                </TableCell>
                                <TableCell>الموظف</TableCell>
                                <TableCell>الفترة</TableCell>
                                <TableCell>أساسي</TableCell>
                                <TableCell>إجمالي</TableCell>
                                <TableCell>خصومات تلقائية</TableCell>
                                <TableCell>صافي</TableCell>
                                <TableCell>الحالة</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center">لا توجد سجلات رواتب</TableCell>
                                </TableRow>
                            ) : filteredRows.map((row) => (
                                <TableRow key={row.id} hover sx={{ verticalAlign: 'top' }}>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            disabled={row.status === 'paid'}
                                            checked={selectedSet.has(row.id)}
                                            onChange={() => toggleSelect(row.id)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Stack spacing={0.5} alignItems="flex-start">
                                            <Typography variant="body2">
                                                {row.employee?.employee_code} - {row.employee?.first_name_ar} {row.employee?.last_name_ar}
                                            </Typography>
                                            <Button
                                                size="small"
                                                variant="text"
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    openSalaryDetails(row.id)
                                                }}
                                                sx={{ px: 0, minWidth: 'auto' }}
                                            >
                                                عرض السند
                                            </Button>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>{String(row.salary_period).slice(0, 7)}</TableCell>
                                    <TableCell>{Number(row.base_salary || 0).toFixed(2)}</TableCell>
                                    <TableCell>{Number(row.gross_salary || 0).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Stack spacing={0.75} sx={{ minWidth: 240 }}>
                                            {(() => {
                                                const autoDeductions = getAutoDeductionBreakdown(row.components || [])

                                                if (autoDeductions.total <= 0) {
                                                    return (
                                                        <Typography variant="body2" color="text.secondary">
                                                            لا توجد خصومات تلقائية
                                                        </Typography>
                                                    )
                                                }

                                                return (
                                                    <>
                                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                            {autoDeductions.total.toFixed(2)}
                                                        </Typography>
                                                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                                            {autoDeductions.unpaidLeave > 0 && (
                                                                <Chip size="small" color="error" variant="outlined" label={`إجازات غير مدفوعة ${autoDeductions.unpaidLeave.toFixed(2)}`} />
                                                            )}
                                                            {autoDeductions.absence > 0 && (
                                                                <Chip size="small" color="warning" variant="outlined" label={`غياب ${autoDeductions.absence.toFixed(2)}`} />
                                                            )}
                                                            {autoDeductions.halfDay > 0 && (
                                                                <Chip size="small" color="warning" variant="outlined" label={`نصف يوم ${autoDeductions.halfDay.toFixed(2)}`} />
                                                            )}
                                                            {autoDeductions.late > 0 && (
                                                                <Chip size="small" color="info" variant="outlined" label={`تأخير ${autoDeductions.late.toFixed(2)}`} />
                                                            )}
                                                        </Stack>
                                                    </>
                                                )
                                            })()}
                                        </Stack>
                                    </TableCell>
                                    <TableCell>{Number(row.net_salary || 0).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            color={statusColor[row.status] || 'default'}
                                            label={statusLabel[row.status] || row.status}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Paper>

            <Dialog open={detailOpen} onClose={closeSalaryDetails} maxWidth="md" fullWidth>
                <DialogTitle>
                    {detailSalary
                        ? `سند راتب ${detailSalary.employee?.employee_code || ''} ${detailSalary.employee?.first_name_ar || ''} ${detailSalary.employee?.last_name_ar || ''}`.trim()
                        : 'تفاصيل سند الراتب'}
                </DialogTitle>
                <DialogContent dividers>
                    {detailLoading ? (
                        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
                            <CircularProgress />
                        </Box>
                    ) : !detailSalary ? (
                        <Alert severity="info">لا توجد بيانات لعرضها</Alert>
                    ) : (
                        <Stack spacing={2.5}>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                                    <Typography color="text.secondary">الفترة</Typography>
                                    <Typography fontWeight={700}>{String(detailSalary.salary_period || '').slice(0, 7) || '-'}</Typography>
                                </Paper>
                                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                                    <Typography color="text.secondary">الحالة</Typography>
                                    <Chip
                                        size="small"
                                        color={statusColor[detailSalary.status] || 'default'}
                                        label={statusLabel[detailSalary.status] || detailSalary.status}
                                        sx={{ mt: 1 }}
                                    />
                                </Paper>
                                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                                    <Typography color="text.secondary">القسم / المسمى</Typography>
                                    <Typography fontWeight={700}>
                                        {detailSalary.employee?.department?.name_ar || '-'} / {detailSalary.employee?.designation?.title_ar || '-'}
                                    </Typography>
                                </Paper>
                            </Stack>

                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                                    <Typography color="text.secondary">الراتب الأساسي</Typography>
                                    <Typography variant="h6" fontWeight={700}>{Number(detailSalary.base_salary || 0).toFixed(2)}</Typography>
                                </Paper>
                                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                                    <Typography color="text.secondary">الإجمالي</Typography>
                                    <Typography variant="h6" fontWeight={700}>{Number(detailSalary.gross_salary || 0).toFixed(2)}</Typography>
                                </Paper>
                                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                                    <Typography color="text.secondary">الصافي</Typography>
                                    <Typography variant="h6" fontWeight={700}>{Number(detailSalary.net_salary || 0).toFixed(2)}</Typography>
                                </Paper>
                            </Stack>

                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                                    ملخص الخصومات التلقائية
                                </Typography>
                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography color="text.secondary">إجمالي الخصومات التلقائية</Typography>
                                        <Typography fontWeight={700}>{Number(detailBreakdown.autoTotal || 0).toFixed(2)}</Typography>
                                    </Box>
                                    <Box sx={{ flex: 2 }}>
                                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                            {detailBreakdown.autoTotals.unpaidLeave > 0 && <Chip size="small" color="error" variant="outlined" label={`إجازات غير مدفوعة ${detailBreakdown.autoTotals.unpaidLeave.toFixed(2)}`} />}
                                            {detailBreakdown.autoTotals.absence > 0 && <Chip size="small" color="warning" variant="outlined" label={`غياب ${detailBreakdown.autoTotals.absence.toFixed(2)}`} />}
                                            {detailBreakdown.autoTotals.halfDay > 0 && <Chip size="small" color="warning" variant="outlined" label={`نصف يوم ${detailBreakdown.autoTotals.halfDay.toFixed(2)}`} />}
                                            {detailBreakdown.autoTotals.late > 0 && <Chip size="small" color="info" variant="outlined" label={`تأخير ${detailBreakdown.autoTotals.late.toFixed(2)}`} />}
                                            {detailBreakdown.autoTotal <= 0 && <Typography variant="body2" color="text.secondary">لا توجد خصومات تلقائية</Typography>}
                                        </Stack>
                                    </Box>
                                </Stack>
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                                    مكونات السند
                                </Typography>
                                {detailSalary.components?.length ? (
                                    <Stack spacing={1.25}>
                                        {detailSalary.components.map((component) => (
                                            <Box key={component.id}>
                                                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                                                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                                        <Typography fontWeight={700}>
                                                            {component.component_name_ar || component.component_name_en || 'مكون'}
                                                        </Typography>
                                                        <Chip
                                                            size="small"
                                                            color={componentTypeColor[component.component_type] || 'default'}
                                                            variant="outlined"
                                                            label={componentTypeLabel[component.component_type] || component.component_type}
                                                        />
                                                        {AUTO_GENERATED_COMPONENTS.has(component.component_name_en) && (
                                                            <Chip size="small" color="primary" variant="outlined" label="تلقائي" />
                                                        )}
                                                    </Stack>
                                                    <Typography fontWeight={700}>
                                                        {Number(component.amount || 0).toFixed(2)}
                                                    </Typography>
                                                </Stack>
                                                {component.description && (
                                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                                        {component.description}
                                                    </Typography>
                                                )}
                                                <Divider sx={{ mt: 1.25 }} />
                                            </Box>
                                        ))}
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        لا توجد مكونات إضافية على هذا السند
                                    </Typography>
                                )}
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                                    ملاحظات
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {detailSalary.notes || 'لا توجد ملاحظات على هذا السند'}
                                </Typography>
                            </Paper>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeSalaryDetails}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
