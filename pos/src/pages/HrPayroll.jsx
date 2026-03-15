import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Checkbox,
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
import { Refresh as RefreshIcon, PlayArrow as ProcessIcon } from '@mui/icons-material'
import { hrAPI } from '../services/api'

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

export default function HrPayroll() {
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [error, setError] = useState('')
    const [period, setPeriod] = useState(currentMonth())
    const [statusFilter, setStatusFilter] = useState('')
    const [rows, setRows] = useState([])
    const [summary, setSummary] = useState(null)
    const [selectedIds, setSelectedIds] = useState([])

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const [salariesRes, summaryRes] = await Promise.all([
                hrAPI.getSalaries({
                    period: period || undefined,
                    status: statusFilter || undefined,
                    limit: 500
                }),
                hrAPI.getPayrollSummary({ period: period || undefined })
            ])
            setRows(salariesRes.data?.data || [])
            setSummary(summaryRes.data?.data || null)
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل بيانات الرواتب')
        } finally {
            setLoading(false)
        }
    }, [period, statusFilter])

    useEffect(() => {
        fetchData()
    }, [fetchData])

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
            await hrAPI.disbursePayroll(selectedIds)
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
        const actionable = rows
            .filter((row) => row.status !== 'paid')
            .map((row) => row.id)
        if (selectedIds.length === actionable.length) {
            setSelectedIds([])
            return
        }
        setSelectedIds(actionable)
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
                </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography color="text.secondary">إجمالي صافي الرواتب</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {Number(summary?.total_net_salary || 0).toFixed(2)}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography color="text.secondary">إجمالي الرواتب الإجمالي</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {Number(summary?.total_gross_salary || 0).toFixed(2)}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography color="text.secondary">عدد السجلات</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {rows.length}
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
                                        checked={rows.length > 0 && selectedIds.length > 0 && selectedIds.length === rows.filter((row) => row.status !== 'paid').length}
                                        indeterminate={selectedIds.length > 0 && selectedIds.length < rows.filter((row) => row.status !== 'paid').length}
                                        onChange={toggleSelectAll}
                                    />
                                </TableCell>
                                <TableCell>الموظف</TableCell>
                                <TableCell>الفترة</TableCell>
                                <TableCell>أساسي</TableCell>
                                <TableCell>إجمالي</TableCell>
                                <TableCell>صافي</TableCell>
                                <TableCell>الحالة</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">لا توجد سجلات رواتب</TableCell>
                                </TableRow>
                            ) : rows.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            disabled={row.status === 'paid'}
                                            checked={selectedSet.has(row.id)}
                                            onChange={() => toggleSelect(row.id)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {row.employee?.employee_code} - {row.employee?.first_name_ar} {row.employee?.last_name_ar}
                                    </TableCell>
                                    <TableCell>{String(row.salary_period).slice(0, 7)}</TableCell>
                                    <TableCell>{Number(row.base_salary || 0).toFixed(2)}</TableCell>
                                    <TableCell>{Number(row.gross_salary || 0).toFixed(2)}</TableCell>
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
        </Box>
    )
}

