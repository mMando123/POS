import { useState, useEffect } from 'react'
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Card,
    CardContent,
    Grid,
    TextField,
    CircularProgress,
    Avatar
} from '@mui/material'
import {
    AttachMoney as MoneyIcon,
    Receipt as ReceiptIcon,
    AccessTime as TimeIcon,
    Person as PersonIcon
} from '@mui/icons-material'
import toast from 'react-hot-toast'
import { shiftAPI } from '../services/api'

// Helper component for summary cards
const SummaryCard = ({ title, value, icon, color }) => (
    <Card sx={{ height: '100%' }}>
        <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Typography color="text.secondary" gutterBottom variant="subtitle2">
                        {title}
                    </Typography>
                    <Typography variant="h4" fontWeight="bold">
                        {value}
                    </Typography>
                </Box>
                <Avatar sx={{ bgcolor: `${color}.light`, color: `${color}.main` }}>
                    {icon}
                </Avatar>
            </Box>
        </CardContent>
    </Card>
)

export default function CashierPerformance() {
    const [loading, setLoading] = useState(true)
    const [performanceData, setPerformanceData] = useState([])
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [totals, setTotals] = useState({
        sales: 0,
        orders: 0,
        cashiers: 0
    })

    useEffect(() => {
        fetchPerformance()
    }, [date])

    const fetchPerformance = async () => {
        setLoading(true)
        try {
            const response = await shiftAPI.getPerformance({ date })
            const data = response.data.data || []
            setPerformanceData(data)

            // Calculate totals
            const totalSales = data.reduce((sum, cashier) => sum + cashier.total_sales, 0)
            const totalOrders = data.reduce((sum, cashier) => sum + cashier.total_orders, 0)

            setTotals({
                sales: totalSales,
                orders: totalOrders,
                cashiers: data.length
            })
        } catch (error) {
            console.error('Fetch performance error:', error)
            toast.error('فشل تحميل تقرير الأداء')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" fontWeight="bold">
                    أداء الكاشيرات
                </Typography>
                <TextField
                    type="date"
                    label="التاريخ"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={4}>
                    <SummaryCard
                        title="إجمالي المبيعات"
                        value={`${totals.sales.toFixed(2)} ر.س`}
                        icon={<MoneyIcon />}
                        color="success"
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <SummaryCard
                        title="إجمالي الطلبات"
                        value={totals.orders}
                        icon={<ReceiptIcon />}
                        color="primary"
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <SummaryCard
                        title="الكاشيرات النشطة"
                        value={totals.cashiers}
                        icon={<PersonIcon />}
                        color="info"
                    />
                </Grid>
            </Grid>

            {/* Performance Table */}
            <TableContainer component={Paper}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'primary.main' }}>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>الكاشير</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>ساعات العمل</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>عدد الورديات</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>عدد الطلبات</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>المبيعات</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>متوسط الطلب</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {performanceData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">
                                        لا توجد بيانات لهذا اليوم
                                    </TableCell>
                                </TableRow>
                            ) : (
                                performanceData.map((row) => (
                                    <TableRow key={row.cashier_id} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main', fontSize: '0.9rem' }}>
                                                    {row.username?.[0]?.toUpperCase()}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="body2" fontWeight="bold">
                                                        {row.cashier_name}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        @{row.username}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <TimeIcon fontSize="small" color="action" />
                                                {row.formatted_working_time}
                                            </Box>
                                        </TableCell>
                                        <TableCell>{row.shifts.length}</TableCell>
                                        <TableCell>{row.total_orders}</TableCell>
                                        <TableCell>
                                            <Typography fontWeight="bold" color="success.main">
                                                {row.total_sales.toFixed(2)} ر.س
                                            </Typography>
                                            <Typography variant="caption" display="block" color="text.secondary">
                                                نقدي: {row.cash_sales.toFixed(0)} | شبكة: {row.card_sales.toFixed(0)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            {row.avg_order_value.toFixed(2)} ر.س
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>
        </Box>
    )
}
