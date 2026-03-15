import React, { useState, useEffect } from 'react'
import {
    Box, Grid, Paper, Typography, Card, CardContent,
    TextField, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Tabs, Tab,
    LinearProgress, Chip, Alert, Tooltip
} from '@mui/material'
import {
    BarChart as BarChartIcon,
    Equalizer as StatsIcon,
    CalendarToday as CalendarIcon,
    Person as PersonIcon,
    AttachMoney as MoneyIcon,
    ShoppingCart as CartIcon
} from '@mui/icons-material'
import { reportsAPI } from '../services/api'
import toast from 'react-hot-toast'
import { useThemeConfig } from '../contexts/ThemeContext'

const Reports = () => {
    const [activeTab, setActiveTab] = useState(0)
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0])
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

    // Data States
    const [dailyData, setDailyData] = useState(null)
    const [rangeData, setRangeData] = useState(null)
    const [bestSellers, setBestSellers] = useState([])
    const [staffStats, setStaffStats] = useState([])
    const [loading, setLoading] = useState(false)
    const { formatCurrency } = useThemeConfig()

    useEffect(() => {
        if (activeTab === 0) fetchDailyReport()
        if (activeTab === 1) fetchRangeReport()
        if (activeTab === 2) fetchBestSellers()
        if (activeTab === 3) fetchStaffPerformance()
    }, [activeTab, date, startDate, endDate])

    const fetchDailyReport = async () => {
        setLoading(true)
        try {
            const res = await reportsAPI.getDaily(date)
            setDailyData(res.data.data)
        } catch (error) {
            console.error(error)
            toast.error('ÙØ´Ù„ Ø¬Ù„Ø¨ Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø§Ù„ÙŠÙˆÙ…ÙŠ')
        } finally {
            setLoading(false)
        }
    }

    const fetchRangeReport = async () => {
        setLoading(true)
        try {
            const res = await reportsAPI.getRange(startDate, endDate)
            setRangeData(res.data.data)
        } catch (error) {
            console.error(error)
            toast.error('ÙØ´Ù„ Ø¬Ù„Ø¨ ØªÙ‚Ø±ÙŠØ± Ø§Ù„ÙØªØ±Ø©')
        } finally {
            setLoading(false)
        }
    }

    const fetchBestSellers = async () => {
        setLoading(true)
        try {
            const res = await reportsAPI.getBestSellers({ limit: 10 })
            setBestSellers(res.data.data)
        } catch (error) {
            console.error(error)
            toast.error('ÙØ´Ù„ Ø¬Ù„Ø¨ Ø§Ù„Ø£ÙƒØ«Ø± Ù…Ø¨ÙŠØ¹Ø§Ù‹')
        } finally {
            setLoading(false)
        }
    }

    const fetchStaffPerformance = async () => {
        setLoading(true)
        try {
            const res = await reportsAPI.getStaffPerformance({ start_date: startDate, end_date: endDate })
            setStaffStats(res.data.data)
        } catch (error) {
            console.error(error)
            toast.error('ÙØ´Ù„ Ø¬Ù„Ø¨ ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†')
        } finally {
            setLoading(false)
        }
    }

    // --- Components ---

    const StatCard = ({ title, value, icon, color = 'primary.main', subtitle }) => (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography color="textSecondary" gutterBottom variant="subtitle2">{title}</Typography>
                        <Typography variant="h4" sx={{ color: color, fontWeight: 'bold' }}>{value}</Typography>
                        {subtitle && <Typography variant="caption" color="textSecondary">{subtitle}</Typography>}
                    </Box>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${color}20`, color: color }}>
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    )

    const DailyReportView = () => (
        <Box className="animate-fade-in">
            <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
                <TextField
                    type="date"
                    label="Ø§Ù„ØªØ§Ø±ÙŠØ®"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
            </Box>

            {dailyData && (
                <>
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard title="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª" value={formatCurrency(dailyData.summary.totalSales)} icon={<MoneyIcon />} color="#2e7d32" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard title="Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª" value={dailyData.summary.totalOrders} icon={<CartIcon />} color="#1976d2" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard title="Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„ÙƒØ§Ø´" value={formatCurrency(dailyData.summary.cashSales)} icon={<MoneyIcon />} color="#ed6c02" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard title="Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©" value={formatCurrency(dailyData.summary.cardSales)} icon={<BarChartIcon />} color="#9c27b0" />
                        </Grid>
                    </Grid>

                    <Grid container spacing={3}>
                        <Grid item xs={12} md={8}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="h6" gutterBottom>Ø³Ø¬Ù„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª</Typography>
                                <TableContainer sx={{ maxHeight: 400 }}>
                                    <Table stickyHeader size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Ø±Ù‚Ù… Ø§Ù„Ø·Ù„Ø¨</TableCell>
                                                <TableCell>Ø§Ù„ÙˆÙ‚Øª</TableCell>
                                                <TableCell>Ø§Ù„Ù…Ø¨Ù„Øº</TableCell>
                                                <TableCell>Ø§Ù„Ø¯ÙØ¹</TableCell>
                                                <TableCell>Ø§Ù„Ø­Ø§Ù„Ø©</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {dailyData.orders.map((order) => (
                                                <TableRow key={order.id}>
                                                    <TableCell>#{order.order_number}</TableCell>
                                                    <TableCell>{new Date(order.created_at).toLocaleTimeString('ar-EG')}</TableCell>
                                                    <TableCell>{order.total}</TableCell>
                                                    <TableCell>
                                                        <Chip label={order.payment_method === 'cash' ? 'ÙƒØ§Ø´' : 'Ø¨Ø·Ø§Ù‚Ø©'} size="small" color={order.payment_method === 'cash' ? 'warning' : 'secondary'} variant="outlined" />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip label={order.status} size="small" color={order.status === 'completed' ? 'success' : 'default'} />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="h6" gutterBottom>Ù…Ù„Ø®Øµ Ø§Ù„Ø³Ø§Ø¹Ø©</Typography>
                                {dailyData.hourlyBreakdown.map((hour) => (
                                    <Box key={hour.hour} sx={{ mb: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography variant="body2">{hour.hour}:00</Typography>
                                            <Typography variant="body2">{formatCurrency(hour.revenue)}</Typography>
                                        </Box>
                                        <LinearProgress variant="determinate" value={(hour.revenue / dailyData.summary.totalSales) * 100} />
                                    </Box>
                                ))}
                            </Paper>
                        </Grid>
                    </Grid>
                </>
            )}
        </Box>
    )

    const BestSellersView = () => (
        <Box className="animate-fade-in">
            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª Ø§Ù„Ø£ÙƒØ«Ø± Ù…Ø¨ÙŠØ¹Ø§Ù‹</Typography>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Ø§Ù„Ù…Ù†ØªØ¬</TableCell>
                                <TableCell align="center">Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø¨Ø§Ø¹Ø©</TableCell>
                                <TableCell align="center">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª</TableCell>
                                <TableCell align="center">Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {bestSellers.map((item, index) => (
                                <TableRow key={index} hover>
                                    <TableCell sx={{ fontWeight: 'bold' }}>{item.name_ar || 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ'}</TableCell>
                                    <TableCell align="center">{item.quantity}</TableCell>
                                    <TableCell align="center">{formatCurrency(item.revenue)}</TableCell>
                                    <TableCell align="center">{item.orders}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    )

    const StaffView = () => (
        <Box className="animate-fade-in">
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <TextField
                    type="date"
                    label="Ù…Ù† ØªØ§Ø±ÙŠØ®"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
                <TextField
                    type="date"
                    label="Ø¥Ù„Ù‰ ØªØ§Ø±ÙŠØ®"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
            </Box>

            <Grid container spacing={3}>
                {staffStats.map((staff) => (
                    <Grid item xs={12} sm={6} md={4} key={staff.id}>
                        <Card variant="outlined">
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                    <Box sx={{ bgcolor: 'primary.light', color: 'primary.contrastText', p: 1, borderRadius: '50%' }}>
                                        <PersonIcon />
                                    </Box>
                                    <Typography variant="h6">{staff.name}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography color="textSecondary">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª:</Typography>
                                    <Typography fontWeight="bold">{formatCurrency(staff.totalSales)}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography color="textSecondary">Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª:</Typography>
                                    <Typography fontWeight="bold">{staff.ordersCount}</Typography>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    )

    const RangeReportView = () => (
        <Box className="animate-fade-in">
            <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
                <TextField
                    type="date"
                    label="Ù…Ù† ØªØ§Ø±ÙŠØ®"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
                <TextField
                    type="date"
                    label="Ø¥Ù„Ù‰ ØªØ§Ø±ÙŠØ®"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
                <Button variant="contained" onClick={fetchRangeReport} disabled={loading}>
                    Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±
                </Button>
            </Box>

            {rangeData && (
                <>
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        <Grid item xs={12} sm={6} md={4}>
                            <StatCard title="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª ÙÙŠ Ø§Ù„ÙØªØ±Ø©" value={formatCurrency(rangeData.totalSales)} icon={<MoneyIcon />} color="#2e7d32" subtitle={`Ù…Ù† ${rangeData.startDate} Ø¥Ù„Ù‰ ${rangeData.endDate}`} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                            <StatCard title="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª" value={rangeData.totalOrders} icon={<CartIcon />} color="#1976d2" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                            <StatCard title="Ù…ØªÙˆØ³Ø· Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„ÙŠÙˆÙ…ÙŠ" value={formatCurrency(rangeData.averageDaily)} icon={<StatsIcon />} color="#ed6c02" />
                        </Grid>
                    </Grid>

                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„ÙŠÙˆÙ…ÙŠØ©</Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Ø§Ù„ØªØ§Ø±ÙŠØ®</TableCell>
                                        <TableCell align="center">Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª</TableCell>
                                        <TableCell align="center">Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª</TableCell>
                                        <TableCell width="40%">Ø§Ù„Ø£Ø¯Ø§Ø¡</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rangeData.dailyBreakdown.map((day) => (
                                        <TableRow key={day.date} hover>
                                            <TableCell>{day.date}</TableCell>
                                            <TableCell align="center">{day.orders}</TableCell>
                                            <TableCell align="center">{formatCurrency(day.revenue)}</TableCell>
                                            <TableCell>
                                                <Tooltip title={formatCurrency(day.revenue)}>
                                                    <LinearProgress
                                                        variant="determinate"
                                                        value={Math.min((day.revenue / (parseFloat(rangeData.averageDaily) * 1.5 || 1)) * 100, 100)}
                                                        color="primary"
                                                        sx={{ height: 8, borderRadius: 4 }}
                                                    />
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {rangeData.dailyBreakdown.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø¨ÙŠØ¹Ø§Øª ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„ÙØªØ±Ø©</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </>
            )}
        </Box>
    )

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ± ÙˆØ§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª</Typography>
                <Button variant="outlined" startIcon={<CalendarIcon />}>ØªØµØ¯ÙŠØ± PDF</Button>
            </Box>

            <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Tab icon={<BarChartIcon />} label="Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„ÙŠÙˆÙ…ÙŠØ©" iconPosition="start" />
                <Tab icon={<StatsIcon />} label="Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª Ø­Ø³Ø¨ Ø§Ù„ÙØªØ±Ø©" iconPosition="start" />
                <Tab icon={<CartIcon />} label="Ø§Ù„Ø£ÙƒØ«Ø± Ù…Ø¨ÙŠØ¹Ø§Ù‹" iconPosition="start" />
                <Tab icon={<PersonIcon />} label="Ø£Ø¯Ø§Ø¡ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†" iconPosition="start" />
            </Tabs>

            {activeTab === 0 && <DailyReportView />}
            {activeTab === 1 && <RangeReportView />}
            {activeTab === 2 && <BestSellersView />}
            {activeTab === 3 && <StaffView />}
        </Box>
    )
}

export default Reports

