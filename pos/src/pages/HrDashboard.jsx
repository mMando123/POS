import { useEffect, useState } from 'react'
import {
    Box,
    Typography,
    Grid,
    Paper,
    CircularProgress,
    Alert,
    Button,
    Stack,
    Chip
} from '@mui/material'
import {
    Groups as GroupsIcon,
    Apartment as DepartmentIcon,
    EventBusy as LeaveIcon,
    AttachMoney as PayrollIcon,
    CheckCircle as PresentIcon,
    ErrorOutline as AbsentIcon,
    AccessTime as LateIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { hrAPI } from '../services/api'

const StatCard = ({ title, value, icon, color = '#1976d2' }) => (
    <Paper sx={{ p: 2.5, borderRadius: 2, borderInlineStart: `4px solid ${color}` }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
                <Typography variant="body2" color="text.secondary">{title}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{value}</Typography>
            </Box>
            <Box sx={{ color }}>{icon}</Box>
        </Stack>
    </Paper>
)

export default function HrDashboard() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [stats, setStats] = useState(null)

    const fetchDashboard = async () => {
        try {
            setLoading(true)
            const response = await hrAPI.getDashboard()
            setStats(response.data?.data || null)
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل لوحة الموارد البشرية')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchDashboard()
    }, [])

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
                <CircularProgress />
            </Box>
        )
    }

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>لوحة الموارد البشرية</Typography>
                    <Typography color="text.secondary">مؤشرات الموظفين والرواتب والحضور</Typography>
                </Box>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchDashboard}>
                    تحديث
                </Button>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Grid container spacing={2.2}>
                <Grid item xs={12} md={3}>
                    <StatCard
                        title="إجمالي الموظفين"
                        value={stats?.totals?.employees ?? 0}
                        icon={<GroupsIcon />}
                        color="#1565c0"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <StatCard
                        title="الموظفون النشطون"
                        value={stats?.totals?.active_employees ?? 0}
                        icon={<PresentIcon />}
                        color="#2e7d32"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <StatCard
                        title="الأقسام"
                        value={stats?.totals?.departments ?? 0}
                        icon={<DepartmentIcon />}
                        color="#6a1b9a"
                    />
                </Grid>
                <Grid item xs={12} md={3}>
                    <StatCard
                        title="طلبات الإجازة المعلقة"
                        value={stats?.totals?.pending_leaves ?? 0}
                        icon={<LeaveIcon />}
                        color="#ef6c00"
                    />
                </Grid>

                <Grid item xs={12} md={4}>
                    <StatCard
                        title="إجمالي صافي الرواتب (الفترة)"
                        value={`${Number(stats?.payroll?.net_total || 0).toFixed(2)} ر.س`}
                        icon={<PayrollIcon />}
                        color="#00838f"
                    />
                </Grid>
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>ملخص الحضور اليومي</Typography>
                        <Stack direction="row" spacing={1.2} flexWrap="wrap">
                            <Chip color="success" icon={<PresentIcon />} label={`حاضر: ${stats?.attendance?.present ?? 0}`} />
                            <Chip color="error" icon={<AbsentIcon />} label={`غائب: ${stats?.attendance?.absent ?? 0}`} />
                            <Chip color="warning" icon={<LateIcon />} label={`متأخر: ${stats?.attendance?.late ?? 0}`} />
                            <Chip color="info" label={`نصف يوم: ${stats?.attendance?.half_day ?? 0}`} />
                            <Chip color="default" label={`إجازة: ${stats?.attendance?.leave ?? 0}`} />
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>إجراءات سريعة</Typography>
                        <Stack direction="row" spacing={1.5} flexWrap="wrap">
                            <Button variant="contained" onClick={() => navigate('/hr/employees')}>إدارة الموظفين</Button>
                            <Button variant="outlined" onClick={() => navigate('/hr/attendance')}>تسجيل الحضور</Button>
                            <Button variant="outlined" onClick={() => navigate('/hr/leaves')}>طلبات الإجازة</Button>
                            <Button variant="outlined" onClick={() => navigate('/hr/payroll')}>معالجة الرواتب</Button>
                            <Button variant="outlined" onClick={() => navigate('/hr/performance')}>تقييمات الأداء</Button>
                            <Button variant="outlined" onClick={() => navigate('/hr/training')}>برامج التدريب</Button>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    )
}
