import { useEffect, useMemo, useState } from 'react'
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
    AssignmentLate as AttentionIcon,
    AutoAwesome as AutoAwesomeIcon,
    Groups as GroupsIcon,
    Apartment as DepartmentIcon,
    EventBusy as LeaveIcon,
    AttachMoney as PayrollIcon,
    CheckCircle as PresentIcon,
    ErrorOutline as AbsentIcon,
    AccessTime as LateIcon,
    HourglassBottom as PendingIcon,
    PsychologyAlt as IntelligenceIcon,
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

const PerformanceItem = ({ employee, accent = '#1976d2' }) => (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
        <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {employee.employee_name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.4 }}>
                    {employee.employee_code} | {employee.department_name} | {employee.designation_name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.6 }}>
                    {employee.recommendation}
                </Typography>
                {employee.narrative && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.primary' }}>
                        {employee.narrative}
                    </Typography>
                )}
            </Box>
            <Stack spacing={0.75} alignItems="flex-end">
                <Chip
                    size="small"
                    label={`${employee.score}/100`}
                    sx={{ bgcolor: `${accent}15`, color: accent, fontWeight: 700 }}
                />
                <Chip size="small" label={employee.label} color={employee.score >= 70 ? 'success' : employee.score >= 55 ? 'warning' : 'error'} />
            </Stack>
        </Stack>
    </Paper>
)

export default function HrDashboard() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [stats, setStats] = useState(null)

    const derivedMetrics = useMemo(() => {
        const activeEmployees = Number(stats?.totals?.active_employees || 0)
        const pendingLeaves = Number(stats?.totals?.pending_leaves || 0)
        const attendance = stats?.attendance || {}
        const present = Number(attendance.present || 0)
        const absent = Number(attendance.absent || 0)
        const late = Number(attendance.late || 0)
        const halfDay = Number(attendance.half_day || 0)
        const leave = Number(attendance.leave || 0)
        const trackedToday = present + absent + late + halfDay + leave
        const attendedToday = present + late + halfDay
        const attendanceRate = activeEmployees > 0
            ? ((attendedToday / activeEmployees) * 100)
            : 0
        const coverageRate = activeEmployees > 0
            ? ((trackedToday / activeEmployees) * 100)
            : 0
        const unrecordedAttendance = Math.max(activeEmployees - trackedToday, 0)
        const followUpCount = pendingLeaves + absent + late + unrecordedAttendance

        return {
            activeEmployees,
            pendingLeaves,
            present,
            absent,
            late,
            halfDay,
            leave,
            trackedToday,
            attendedToday,
            attendanceRate,
            coverageRate,
            unrecordedAttendance,
            followUpCount,
            payrollNet: Number(stats?.payroll?.net_total || 0)
        }
    }, [stats])

    const aiMetrics = useMemo(() => {
        const data = stats?.ai_performance || {}
        return {
            averageScore: Number(data.average_score || 0),
            excellentCount: Number(data.excellent_count || 0),
            stableCount: Number(data.stable_count || 0),
            needsAttentionCount: Number(data.needs_attention_count || 0),
            topPerformers: data.top_performers || [],
            attentionNeeded: data.attention_needed || [],
            departmentRankings: data.department_rankings || [],
            quickInsights: data.quick_insights || [],
            analysisPeriod: data.analysis_period || null,
            model: data.model || 'zimam_hr_ai_score_v1',
            managerBrief: data.manager_brief || ''
        }
    }, [stats])

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
                        value={`${derivedMetrics.payrollNet.toFixed(2)} ر.س`}
                        icon={<PayrollIcon />}
                        color="#00838f"
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <StatCard
                        title="نسبة التواجد اليوم"
                        value={`${derivedMetrics.attendanceRate.toFixed(1)}%`}
                        icon={<PresentIcon />}
                        color="#2e7d32"
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <StatCard
                        title="حالات تحتاج متابعة"
                        value={derivedMetrics.followUpCount}
                        icon={<AttentionIcon />}
                        color="#c62828"
                    />
                </Grid>

                <Grid item xs={12} md={4}>
                    <StatCard
                        title="متوسط الأداء الذكي"
                        value={`${aiMetrics.averageScore.toFixed(1)}/100`}
                        icon={<IntelligenceIcon />}
                        color="#6a1b9a"
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <StatCard
                        title="موظفون ممتازون"
                        value={aiMetrics.excellentCount}
                        icon={<AutoAwesomeIcon />}
                        color="#00897b"
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <StatCard
                        title="بحاجة لمتابعة أداء"
                        value={aiMetrics.needsAttentionCount}
                        icon={<AttentionIcon />}
                        color="#d84315"
                    />
                </Grid>

                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>ملخص الحضور اليومي</Typography>
                        <Stack spacing={1.75}>
                            <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap>
                                <Chip color="success" icon={<PresentIcon />} label={`حاضر: ${derivedMetrics.present}`} />
                                <Chip color="error" icon={<AbsentIcon />} label={`غائب: ${derivedMetrics.absent}`} />
                                <Chip color="warning" icon={<LateIcon />} label={`متأخر: ${derivedMetrics.late}`} />
                                <Chip color="info" label={`نصف يوم: ${derivedMetrics.halfDay}`} />
                                <Chip color="default" label={`إجازة: ${derivedMetrics.leave}`} />
                                <Chip color="secondary" icon={<PendingIcon />} label={`غير مسجل: ${derivedMetrics.unrecordedAttendance}`} />
                            </Stack>

                            <Box>
                                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                                    <Typography variant="body2" color="text.secondary">التغطية اليومية</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        تم تسجيل {derivedMetrics.trackedToday} من {derivedMetrics.activeEmployees || 0}
                                    </Typography>
                                </Stack>
                                <Box sx={{ height: 10, borderRadius: 999, bgcolor: 'grey.200', overflow: 'hidden' }}>
                                    <Box
                                        sx={{
                                            width: `${Math.min(100, derivedMetrics.coverageRate)}%`,
                                            height: '100%',
                                            bgcolor: derivedMetrics.unrecordedAttendance > 0 ? 'warning.main' : 'success.main'
                                        }}
                                    />
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                                    نسبة التسجيل اليومية: {derivedMetrics.coverageRate.toFixed(1)}%
                                </Typography>
                            </Box>
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>يحتاج متابعة الآن</Typography>
                        <Stack spacing={1.25}>
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography color="text.secondary">طلبات إجازة معلقة</Typography>
                                    <Typography sx={{ fontWeight: 800, color: 'warning.dark' }}>
                                        {derivedMetrics.pendingLeaves}
                                    </Typography>
                                </Stack>
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography color="text.secondary">حالات غياب اليوم</Typography>
                                    <Typography sx={{ fontWeight: 800, color: 'error.main' }}>
                                        {derivedMetrics.absent}
                                    </Typography>
                                </Stack>
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography color="text.secondary">حالات تأخير اليوم</Typography>
                                    <Typography sx={{ fontWeight: 800, color: 'warning.main' }}>
                                        {derivedMetrics.late}
                                    </Typography>
                                </Stack>
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography color="text.secondary">موظفون بدون تسجيل حضور</Typography>
                                    <Typography sx={{ fontWeight: 800, color: 'secondary.main' }}>
                                        {derivedMetrics.unrecordedAttendance}
                                    </Typography>
                                </Stack>
                            </Paper>
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 1.75 }}>
                            <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>المحلل الذكي لأداء الموظفين</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    يعتمد على الحضور والانضباط وآخر تقييم أداء خلال فترة التحليل
                                    {aiMetrics.analysisPeriod?.period ? ` (${aiMetrics.analysisPeriod.period})` : ''}
                                </Typography>
                            </Box>
                            <Chip variant="outlined" icon={<IntelligenceIcon />} label={aiMetrics.model} />
                        </Stack>

                        {aiMetrics.managerBrief && (
                            <Paper
                                sx={{
                                    p: 1.75,
                                    mb: 2,
                                    borderRadius: 2,
                                    bgcolor: 'rgba(106, 27, 154, 0.05)',
                                    border: '1px solid',
                                    borderColor: 'rgba(106, 27, 154, 0.18)'
                                }}
                            >
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                                    الملخص التنفيذي الذكي
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {aiMetrics.managerBrief}
                                </Typography>
                            </Paper>
                        )}

                        <Grid container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>رؤى سريعة</Typography>
                                    <Stack spacing={1}>
                                        {aiMetrics.quickInsights.length ? aiMetrics.quickInsights.map((insight, index) => (
                                            <Paper key={index} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                                                <Typography variant="body2">{insight}</Typography>
                                            </Paper>
                                        )) : (
                                            <Typography variant="body2" color="text.secondary">لا توجد رؤى متاحة حاليًا</Typography>
                                        )}
                                    </Stack>
                                </Paper>
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>أفضل الموظفين حاليًا</Typography>
                                    <Stack spacing={1}>
                                        {aiMetrics.topPerformers.length ? aiMetrics.topPerformers.map((employee) => (
                                            <PerformanceItem key={employee.employee_id} employee={employee} accent="#2e7d32" />
                                        )) : (
                                            <Typography variant="body2" color="text.secondary">لا توجد بيانات كافية للترتيب</Typography>
                                        )}
                                    </Stack>
                                </Paper>
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>حالات تحتاج متابعة</Typography>
                                    <Stack spacing={1}>
                                        {aiMetrics.attentionNeeded.length ? aiMetrics.attentionNeeded.map((employee) => (
                                            <PerformanceItem key={employee.employee_id} employee={employee} accent="#c62828" />
                                        )) : (
                                            <Typography variant="body2" color="text.secondary">لا توجد حالات حرجة الآن</Typography>
                                        )}
                                    </Stack>
                                </Paper>
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>ترتيب الأقسام حسب الأداء</Typography>
                        <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
                            {aiMetrics.departmentRankings.length ? aiMetrics.departmentRankings.map((department) => (
                                <Paper key={department.department_name} variant="outlined" sx={{ p: 1.5, borderRadius: 2, minWidth: 220 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {department.department_name}
                                    </Typography>
                                    <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 800 }}>
                                        {department.average_score}/100
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        عدد الموظفين: {department.employees}
                                    </Typography>
                                    {department.narrative && (
                                        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.primary' }}>
                                            {department.narrative}
                                        </Typography>
                                    )}
                                </Paper>
                            )) : (
                                <Typography variant="body2" color="text.secondary">لا توجد بيانات أقسام كافية الآن</Typography>
                            )}
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>إجراءات سريعة</Typography>
                        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
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
