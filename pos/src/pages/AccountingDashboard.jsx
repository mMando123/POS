import React, { useState, useEffect, useMemo } from 'react'
import {
    Box,
    Grid,
    Paper,
    Typography,
    Card,
    CardContent,
    CircularProgress,
    Divider,
    Alert,
    Avatar,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    IconButton,
    Tooltip,
    Button
} from '@mui/material'
import {
    AccountBalance as BankIcon,
    TrendingUp as RevenueIcon,
    TrendingDown as ExpenseIcon,
    AccountBalanceWallet as EquityIcon,
    Assessment as StatsIcon,
    Refresh as RefreshIcon,
    Description as DocumentIcon,
    AttachMoney,
    ReceiptLong as JournalIcon,
    Settings as SettingsIcon,
    AccountTree as CoaIcon,
    FactCheck as AuditIcon
} from '@mui/icons-material'
import { accountingAPI } from '../services/api'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    Legend
} from 'recharts'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'
import { useThemeConfig } from '../contexts/ThemeContext'

// Colors for the dashboard
const COLORS = {
    assets: '#1976d2',
    liabilities: '#d32f2f',
    equity: '#7b1fa2',
    revenue: '#2e7d32',
    expenses: '#e65100',
    netIncome: '#00796b'
}

const StatCard = ({ title, value, icon, color, subtitle, loading }) => (
    <Card sx={{ height: '100%', borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <CardContent sx={{ position: 'relative', overflow: 'hidden', p: 3 }}>
            <Box sx={{
                position: 'absolute',
                top: -15,
                right: -15,
                width: 100,
                height: 100,
                borderRadius: '50%',
                bgcolor: `${color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 0
            }}>
                {React.cloneElement(icon, { sx: { fontSize: 60, color: `${color}40` } })}
            </Box>

            <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="overline" color="text.secondary" fontWeight="bold" sx={{ mb: 1, fontSize: '0.85rem' }}>
                    {title}
                </Typography>

                {loading ? (
                    <CircularProgress size={24} sx={{ my: 1, color }} />
                ) : (
                    <Typography variant="h4" fontWeight="900" sx={{ color, mb: subtitle ? 1 : 0, letterSpacing: '-0.5px' }}>
                        {value}
                    </Typography>
                )}

                {subtitle && (
                    <Box sx={{ mt: 'auto' }}>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            {subtitle}
                        </Typography>
                    </Box>
                )}
            </Box>
        </CardContent>
    </Card>
)

const AccountingDashboard = () => {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [stats, setStats] = useState(null)
    const { formatCurrency } = useThemeConfig()
    const { user } = useSelector((state) => state.auth)
    const userRole = user?.role || 'cashier'

    const fetchStats = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await accountingAPI.getDashboardStats()
            if (res.data?.success) {
                setStats(res.data.data)
            } else {
                setError('فشل في تحميل الإحصائيات.')
            }
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.error || err.message || 'حدث خطأ غير متوقع.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStats()
    }, [])

    const netIncomeColor = stats?.summary?.netIncome >= 0 ? COLORS.netIncome : COLORS.liabilities

    // Prepare chart data: Reverse trend to show chronological order
    const chartData = useMemo(() => {
        if (!stats?.trend) return []
        // The trend array contains [{month: 'YYYY-MM', income: 100, expense: 50}]
        return [...stats.trend].reverse().map(item => ({
            ...item,
            // Format month nicely
            name: format(new Date(`${item.month}-01`), 'MMMM yyyy', { locale: ar })
        }))
    }, [stats?.trend])

    const quickLinks = useMemo(() => {
        const links = [
            {
                title: 'التقارير المالية',
                subtitle: 'قائمة الدخل والميزانية',
                path: '/financial-reports',
                icon: <DocumentIcon fontSize="small" />,
                color: '#1976d2',
                roles: ['admin', 'manager']
            },
            {
                title: 'دفتر اليومية',
                subtitle: 'عرض القيود والترحيل',
                path: '/journal-entries',
                icon: <JournalIcon fontSize="small" />,
                color: '#00897b',
                roles: ['admin', 'manager']
            },
            {
                title: 'المصروفات',
                subtitle: 'تسجيل ومراجعة المصروفات',
                path: '/expenses',
                icon: <ExpenseIcon fontSize="small" />,
                color: '#ef6c00',
                roles: ['admin', 'manager']
            },
            {
                title: 'إعدادات الحسابات',
                subtitle: 'ربط الحسابات الافتراضية',
                path: '/account-defaults',
                icon: <SettingsIcon fontSize="small" />,
                color: '#5e35b1',
                roles: ['admin']
            },
            {
                title: 'شجرة الحسابات',
                subtitle: 'إدارة الحسابات الرئيسية والفرعية',
                path: '/coa-manager',
                icon: <CoaIcon fontSize="small" />,
                color: '#3949ab',
                roles: ['admin']
            },
            {
                title: 'سجل المراجعة',
                subtitle: 'تتبع الأحداث المحاسبية',
                path: '/audit-log',
                icon: <AuditIcon fontSize="small" />,
                color: '#2e7d32',
                roles: ['admin']
            }
        ]

        return links.filter(link => link.roles.includes(userRole))
    }, [userRole])

    return (
        <Box sx={{ p: { xs: 1, md: 3 }, direction: 'rtl' }}>
            {/* Header */}
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row-reverse' },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'flex-start', md: 'center' },
                    gap: { xs: 2, md: 0 },
                    mb: 4
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48, boxShadow: '0 4px 10px rgba(25, 118, 210, 0.3)' }}>
                        <StatsIcon fontSize="medium" />
                    </Avatar>
                    <Box>
                        <Typography variant="h4" fontWeight="900" sx={{ letterSpacing: '-0.5px' }}>لوحة الإحصائيات المالية</Typography>
                        <Typography variant="body2" color="text.secondary">نظرة عامة على الأداء المالي للمصروفات، الإيرادات والأرصدة.</Typography>
                    </Box>
                </Box>
                <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={fetchStats}
                    disabled={loading}
                    sx={{ borderRadius: 2 }}
                >
                    تحديث
                </Button>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                    {error}
                </Alert>
            )}

            {/* Quick Links */}
            <Paper sx={{ p: 2.5, borderRadius: 3, mb: 4 }}>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    روابط سريعة
                </Typography>
                <Grid container spacing={2}>
                    {quickLinks.map((link) => (
                        <Grid item xs={12} sm={6} md={4} key={link.path}>
                            <Card
                                component={Link}
                                to={link.path}
                                sx={{
                                    textDecoration: 'none',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    boxShadow: 'none',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        transform: 'translateY(-2px)',
                                        boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
                                        borderColor: link.color
                                    }
                                }}
                            >
                                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                                    <Avatar sx={{ bgcolor: `${link.color}20`, color: link.color }}>
                                        {link.icon}
                                    </Avatar>
                                    <Box>
                                        <Typography variant="body1" fontWeight="bold" color="text.primary">
                                            {link.title}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {link.subtitle}
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            </Paper>

            {/* KPI Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                        title="صافي الدخل (الربح/الخسارة)"
                        value={formatCurrency(stats?.summary?.netIncome)}
                        icon={<AttachMoney />}
                        color={netIncomeColor}
                        subtitle={stats?.summary?.netIncome >= 0 ? "يتم عرض أرباح حالياً" : "يوجد خسائر مسجلة"}
                        loading={loading}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                        title="إجمالي الإيرادات"
                        value={formatCurrency(stats?.summary?.revenue)}
                        icon={<RevenueIcon />}
                        color={COLORS.revenue}
                        loading={loading}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                        title="إجمالي المصروفات"
                        value={formatCurrency(stats?.summary?.expenses)}
                        icon={<ExpenseIcon />}
                        color={COLORS.expenses}
                        loading={loading}
                    />
                </Grid>
            </Grid>

            {/* Balances Row */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={4}>
                    <StatCard
                        title="إجمالي الأصول"
                        value={formatCurrency(stats?.summary?.assets)}
                        icon={<BankIcon />}
                        color={COLORS.assets}
                        loading={loading}
                    />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <StatCard
                        title="إجمالي الخصوم (الالتزامات)"
                        value={formatCurrency(stats?.summary?.liabilities)}
                        icon={<DocumentIcon />}
                        color={COLORS.liabilities}
                        loading={loading}
                    />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <StatCard
                        title="حقوق الملكية (رأس المال والأرباح)"
                        value={formatCurrency(stats?.summary?.equity)}
                        icon={<EquityIcon />}
                        color={COLORS.equity}
                        loading={loading}
                    />
                </Grid>
            </Grid>

            <Grid container spacing={3}>
                {/* 6-Month Chart */}
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 3, borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="h6" fontWeight="bold" sx={{ mb: 3 }}>
                            إيرادات ومصروفات آخر 6 أشهر
                        </Typography>
                        <Box sx={{ flexGrow: 1, minHeight: 350, width: '100%' }}>
                            {loading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <CircularProgress />
                                </Box>
                            ) : chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={COLORS.revenue} stopOpacity={0.8} />
                                                <stop offset="95%" stopColor={COLORS.revenue} stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={COLORS.expenses} stopOpacity={0.8} />
                                                <stop offset="95%" stopColor={COLORS.expenses} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                        <YAxis tickFormatter={(val) => `${val / 1000}k`} tick={{ fontSize: 12 }} />
                                        <RechartsTooltip
                                            formatter={(value) => [formatCurrency(value), '']}
                                            labelStyle={{ color: '#666', marginBottom: '5px' }}
                                        />
                                        <Legend verticalAlign="top" height={36} />
                                        <Area type="monotone" name="الإيرادات" dataKey="income" stroke={COLORS.revenue} fillOpacity={1} fill="url(#colorIncome)" />
                                        <Area type="monotone" name="المصروفات" dataKey="expense" stroke={COLORS.expenses} fillOpacity={1} fill="url(#colorExpense)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <Typography color="text.secondary">لا توجد حركات خلال الفترة الأخيرة</Typography>
                                </Box>
                            )}
                        </Box>
                    </Paper>
                </Grid>

                {/* Cash & Bank Balances */}
                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 0, borderRadius: 3, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ p: 2.5, bgcolor: '#f8fafc', borderBottom: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="h6" fontWeight="bold">السيولة النقدية والبنوك</Typography>
                            <Typography variant="caption" color="text.secondary">أرصدة حسابات الأصول السائلة</Typography>
                        </Box>

                        {loading ? (
                            <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={30} /></Box>
                        ) : stats?.cashBankAccounts?.length > 0 ? (
                            <TableContainer sx={{ flexGrow: 1 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                                            <TableCell sx={{ fontWeight: 'bold' }}>الحساب</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold' }} align="right">الرصيد</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {stats.cashBankAccounts.map(acc => (
                                            <TableRow key={acc.id} hover>
                                                <TableCell>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="bold">{acc.name_ar}</Typography>
                                                        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                                                            {acc.code}
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Chip
                                                        label={formatCurrency(acc.balance)}
                                                        size="small"
                                                        color={acc.balance >= 0 ? "primary" : "error"}
                                                        variant="outlined"
                                                        sx={{ fontWeight: 'bold' }}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        ) : (
                            <Box sx={{ p: 4, textAlign: 'center' }}>
                                <Typography color="text.secondary">لا توجد حسابات نقدية/بنوك محددة.</Typography>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                {/* Recent Journal Entries */}
                <Grid item xs={12}>
                    <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
                        <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                            أحدث قيود اليومية
                        </Typography>
                        {loading ? (
                            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress size={30} /></Box>
                        ) : stats?.recentEntries?.length > 0 ? (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.03)' }}>
                                            <TableCell>رقم القيد</TableCell>
                                            <TableCell>التاريخ والوقت</TableCell>
                                            <TableCell>الوصف</TableCell>
                                            <TableCell align="center">إجمالي مدين</TableCell>
                                            <TableCell align="center">إجمالي دائن</TableCell>
                                            <TableCell align="center">الحالة</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {stats.recentEntries.map(entry => (
                                            <TableRow key={entry.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="bold" color="primary">
                                                        #{entry.entry_number}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    {format(new Date(entry.created_at), 'yyyy-MM-dd hh:mm a', { locale: ar })}
                                                </TableCell>
                                                <TableCell>{entry.description || 'لا يوجد وصف'}</TableCell>
                                                <TableCell align="center">
                                                    <Typography color="success.main" fontWeight="bold">
                                                        {formatCurrency(entry.total_debit ?? entry.total_amount ?? 0)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Typography color="error.main" fontWeight="bold">
                                                        {formatCurrency(entry.total_credit ?? entry.total_amount ?? 0)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Chip
                                                        label={entry.status === 'posted' ? 'مُرحّل' : 'مسودة'}
                                                        size="small"
                                                        color={entry.status === 'posted' ? 'success' : 'default'}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        ) : (
                            <Alert severity="info" sx={{ mt: 2 }}>لا توجد قيود يومية مسجلة بعد.</Alert>
                        )}
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    )
}

export default AccountingDashboard

