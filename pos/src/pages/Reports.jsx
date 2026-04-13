import React, { useState, useEffect } from 'react'
import {
    Box, Grid, Paper, Typography, Card, CardContent,
    TextField, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Tabs, Tab,
    LinearProgress, Chip, Tooltip, CircularProgress
} from '@mui/material'
import {
    BarChart as BarChartIcon,
    Equalizer as StatsIcon,
    PictureAsPdf as PdfIcon,
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
    const [exporting, setExporting] = useState(false)
    const { formatCurrency } = useThemeConfig()

    const paymentMethodLabels = {
        cash: 'كاش',
        card: 'بطاقة',
        online: 'أونلاين',
        multi: 'متعدد',
    }

    const orderStatusLabels = {
        new: 'جديد',
        confirmed: 'مؤكد',
        preparing: 'قيد التحضير',
        ready: 'جاهز',
        completed: 'مكتمل',
        cancelled: 'ملغي',
        pending: 'معلق',
    }

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
            toast.error('فشل جلب التقرير اليومي')
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
            toast.error('فشل جلب تقرير الفترة')
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
            toast.error('فشل جلب الأكثر مبيعًا')
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
            toast.error('فشل جلب تقرير الموظفين')
        } finally {
            setLoading(false)
        }
    }

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

    const buildSummaryCardsHtml = (cards = []) => `
        <div style="display:grid;grid-template-columns:repeat(${Math.min(cards.length || 1, 4)}, 1fr);gap:14px;margin-bottom:18px;">
            ${cards.map((card) => `
                <div style="border:1px solid #e6ebf2;border-radius:14px;padding:16px;background:#f8fbff;">
                    <div style="font-size:13px;color:#5b6472;margin-bottom:6px;">${escapeHtml(card.label)}</div>
                    <div style="font-size:24px;font-weight:800;color:#1565c0;">${escapeHtml(card.value)}</div>
                    ${card.caption ? `<div style="font-size:11px;color:#7a8394;margin-top:6px;">${escapeHtml(card.caption)}</div>` : ''}
                </div>
            `).join('')}
        </div>
    `

    const buildTableHtml = (headers = [], rows = []) => `
        <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">
            <thead>
                <tr style="background:#1565c0;color:#fff;">
                    ${headers.map((header) => `<th style="padding:10px 12px;border:1px solid #d9e1ec;text-align:center;">${escapeHtml(header)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${rows.length > 0 ? rows.map((row, idx) => `
                    <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f9fbfd'};">
                        ${row.map((cell) => `<td style="padding:9px 12px;border:1px solid #e5ebf3;text-align:center;">${escapeHtml(cell)}</td>`).join('')}
                    </tr>
                `).join('') : `
                    <tr>
                        <td colspan="${headers.length}" style="padding:14px;border:1px solid #e5ebf3;text-align:center;color:#7a8394;">
                            لا توجد بيانات متاحة
                        </td>
                    </tr>
                `}
            </tbody>
        </table>
    `

    const buildExportHtml = () => {
        const sectionTitleStyle = 'font-size:20px;font-weight:800;color:#0f172a;margin:0 0 6px;'
        const subtitleStyle = 'font-size:12px;color:#6b7280;margin:0 0 16px;'

        if (activeTab === 0 && dailyData) {
            return `
                <div style="font-family:Cairo,Tajawal,Arial,sans-serif;direction:rtl;color:#111827;padding:32px;background:#ffffff;">
                    <h1 style="font-size:28px;margin:0 0 6px;color:#1565c0;">التقرير اليومي للمبيعات</h1>
                    <p style="${subtitleStyle}">التاريخ: ${escapeHtml(date)}</p>
                    ${buildSummaryCardsHtml([
                        { label: 'إجمالي المبيعات', value: formatCurrency(dailyData.summary.totalSales) },
                        { label: 'عدد الطلبات', value: dailyData.summary.totalOrders },
                        { label: 'مبيعات الكاش', value: formatCurrency(dailyData.summary.cashSales) },
                        { label: 'مبيعات البطاقة', value: formatCurrency(dailyData.summary.cardSales) },
                    ])}
                    <h2 style="${sectionTitleStyle}">سجل الطلبات</h2>
                    ${buildTableHtml(
                        ['رقم الطلب', 'الوقت', 'المبلغ', 'الدفع', 'الحالة'],
                        (dailyData.orders || []).map((order) => [
                            `#${order.order_number}`,
                            new Date(order.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
                            formatCurrency(order.total),
                            paymentMethodLabels[order.payment_method] || order.payment_method,
                            orderStatusLabels[order.status] || order.status,
                        ])
                    )}
                    <h2 style="${sectionTitleStyle};margin-top:22px;">ملخص الساعة</h2>
                    ${buildTableHtml(
                        ['الساعة', 'عدد الطلبات', 'الإيراد'],
                        (dailyData.hourlyBreakdown || []).map((hour) => [
                            `${hour.hour}:00`,
                            hour.orders,
                            formatCurrency(hour.revenue),
                        ])
                    )}
                </div>
            `
        }

        if (activeTab === 1 && rangeData) {
            return `
                <div style="font-family:Cairo,Tajawal,Arial,sans-serif;direction:rtl;color:#111827;padding:32px;background:#ffffff;">
                    <h1 style="font-size:28px;margin:0 0 6px;color:#1565c0;">تقرير المبيعات حسب الفترة</h1>
                    <p style="${subtitleStyle}">من ${escapeHtml(rangeData.startDate)} إلى ${escapeHtml(rangeData.endDate)}</p>
                    ${buildSummaryCardsHtml([
                        { label: 'إجمالي المبيعات في الفترة', value: formatCurrency(rangeData.totalSales) },
                        { label: 'إجمالي عدد الطلبات', value: rangeData.totalOrders },
                        { label: 'متوسط المبيعات اليومي', value: formatCurrency(rangeData.averageDaily) },
                    ])}
                    <h2 style="${sectionTitleStyle}">تفاصيل المبيعات اليومية</h2>
                    ${buildTableHtml(
                        ['التاريخ', 'عدد الطلبات', 'الإيرادات'],
                        (rangeData.dailyBreakdown || []).map((day) => [
                            day.date,
                            day.orders,
                            formatCurrency(day.revenue),
                        ])
                    )}
                </div>
            `
        }

        if (activeTab === 2 && bestSellers) {
            return `
                <div style="font-family:Cairo,Tajawal,Arial,sans-serif;direction:rtl;color:#111827;padding:32px;background:#ffffff;">
                    <h1 style="font-size:28px;margin:0 0 6px;color:#1565c0;">تقرير المنتجات الأكثر مبيعًا</h1>
                    <p style="${subtitleStyle}">أفضل الأصناف حسب الكمية والإيراد</p>
                    ${buildSummaryCardsHtml([
                        { label: 'عدد الأصناف المعروضة', value: bestSellers.length },
                    ])}
                    ${buildTableHtml(
                        ['المنتج', 'الكمية المباعة', 'إجمالي الإيرادات', 'عدد الطلبات'],
                        (bestSellers || []).map((item) => [
                            item.name_ar || 'غير معروف',
                            item.quantity,
                            formatCurrency(item.revenue),
                            item.orders,
                        ])
                    )}
                </div>
            `
        }

        if (activeTab === 3 && staffStats) {
            return `
                <div style="font-family:Cairo,Tajawal,Arial,sans-serif;direction:rtl;color:#111827;padding:32px;background:#ffffff;">
                    <h1 style="font-size:28px;margin:0 0 6px;color:#1565c0;">تقرير أداء الموظفين</h1>
                    <p style="${subtitleStyle}">من ${escapeHtml(startDate)} إلى ${escapeHtml(endDate)}</p>
                    ${buildTableHtml(
                        ['الموظف', 'عدد الطلبات', 'إجمالي المبيعات'],
                        (staffStats || []).map((staff) => [
                            staff.name,
                            staff.ordersCount,
                            formatCurrency(staff.totalSales),
                        ])
                    )}
                </div>
            `
        }

        return null
    }

    const getExportFileName = () => {
        if (activeTab === 0) return `daily-report-${date}`
        if (activeTab === 1) return `sales-range-${startDate}-to-${endDate}`
        if (activeTab === 2) return `best-sellers-${new Date().toISOString().split('T')[0]}`
        return `staff-performance-${startDate}-to-${endDate}`
    }

    const handleExportPdf = async () => {
        const reportHtml = buildExportHtml()

        if (!reportHtml) {
            toast.error('لا توجد بيانات متاحة للتصدير')
            return
        }

        const container = document.createElement('div')
        container.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 794px;
            background: #ffffff;
            direction: rtl;
            z-index: -1;
        `
        container.innerHTML = reportHtml
        document.body.appendChild(container)

        setExporting(true)
        try {
            if (document.fonts?.ready) {
                await document.fonts.ready
            }

            const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
                import('html2canvas'),
                import('jspdf')
            ])

            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                windowWidth: 794
            })

            const imgData = canvas.toDataURL('image/png')
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
            const pageWidth = doc.internal.pageSize.getWidth()
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 10
            const printableWidth = pageWidth - (margin * 2)
            const printableHeight = pageHeight - (margin * 2)
            const imageHeight = (canvas.height * printableWidth) / canvas.width

            let heightLeft = imageHeight
            let position = margin

            doc.addImage(imgData, 'PNG', margin, position, printableWidth, imageHeight)
            heightLeft -= printableHeight

            while (heightLeft > 0) {
                doc.addPage()
                position = margin - (imageHeight - heightLeft)
                doc.addImage(imgData, 'PNG', margin, position, printableWidth, imageHeight)
                heightLeft -= printableHeight
            }

            doc.save(`${getExportFileName()}.pdf`)
            toast.success('تم تصدير التقرير بنجاح')
        } catch (error) {
            console.error('Export PDF error:', error)
            toast.error('فشل تصدير التقرير')
        } finally {
            document.body.removeChild(container)
            setExporting(false)
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
                    label="التاريخ"
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
                            <StatCard title="إجمالي المبيعات" value={formatCurrency(dailyData.summary.totalSales)} icon={<MoneyIcon />} color="#2e7d32" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard title="عدد الطلبات" value={dailyData.summary.totalOrders} icon={<CartIcon />} color="#1976d2" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard title="مبيعات الكاش" value={formatCurrency(dailyData.summary.cashSales)} icon={<MoneyIcon />} color="#ed6c02" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard title="مبيعات البطاقة" value={formatCurrency(dailyData.summary.cardSales)} icon={<BarChartIcon />} color="#9c27b0" />
                        </Grid>
                    </Grid>

                    <Grid container spacing={3}>
                        <Grid item xs={12} md={8}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="h6" gutterBottom>سجل الطلبات</Typography>
                                <TableContainer sx={{ maxHeight: 400 }}>
                                    <Table stickyHeader size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>رقم الطلب</TableCell>
                                                <TableCell>الوقت</TableCell>
                                                <TableCell>المبلغ</TableCell>
                                                <TableCell>الدفع</TableCell>
                                                <TableCell>الحالة</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {dailyData.orders.map((order) => (
                                                <TableRow key={order.id}>
                                                    <TableCell>#{order.order_number}</TableCell>
                                                    <TableCell>{new Date(order.created_at).toLocaleTimeString('ar-EG')}</TableCell>
                                                    <TableCell>{order.total}</TableCell>
                                                    <TableCell>
                                                        <Chip label={order.payment_method === 'cash' ? 'كاش' : 'بطاقة'} size="small" color={order.payment_method === 'cash' ? 'warning' : 'secondary'} variant="outlined" />
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
                                <Typography variant="h6" gutterBottom>ملخص الساعة</Typography>
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
                <Typography variant="h6" gutterBottom>المنتجات الأكثر مبيعًا</Typography>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>المنتج</TableCell>
                                <TableCell align="center">الكمية المباعة</TableCell>
                                <TableCell align="center">إجمالي الإيرادات</TableCell>
                                <TableCell align="center">عدد الطلبات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {bestSellers.map((item, index) => (
                                <TableRow key={index} hover>
                                    <TableCell sx={{ fontWeight: 'bold' }}>{item.name_ar || 'غير معروف'}</TableCell>
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
                    label="من تاريخ"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
                <TextField
                    type="date"
                    label="إلى تاريخ"
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
                                    <Typography color="textSecondary">إجمالي المبيعات:</Typography>
                                    <Typography fontWeight="bold">{formatCurrency(staff.totalSales)}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography color="textSecondary">عدد الطلبات:</Typography>
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
                    label="من تاريخ"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
                <TextField
                    type="date"
                    label="إلى تاريخ"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
                <Button variant="contained" onClick={fetchRangeReport} disabled={loading}>
                    عرض التقرير
                </Button>
            </Box>

            {rangeData && (
                <>
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        <Grid item xs={12} sm={6} md={4}>
                            <StatCard title="إجمالي المبيعات في الفترة" value={formatCurrency(rangeData.totalSales)} icon={<MoneyIcon />} color="#2e7d32" subtitle={`من ${rangeData.startDate} إلى ${rangeData.endDate}`} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                            <StatCard title="إجمالي عدد الطلبات" value={rangeData.totalOrders} icon={<CartIcon />} color="#1976d2" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                            <StatCard title="متوسط المبيعات اليومي" value={formatCurrency(rangeData.averageDaily)} icon={<StatsIcon />} color="#ed6c02" />
                        </Grid>
                    </Grid>

                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>تفاصيل المبيعات اليومية</Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>التاريخ</TableCell>
                                        <TableCell align="center">عدد الطلبات</TableCell>
                                        <TableCell align="center">الإيرادات</TableCell>
                                        <TableCell width="40%">الأداء</TableCell>
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
                                            <TableCell colSpan={4} align="center">لا توجد مبيعات في هذه الفترة</TableCell>
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
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>التقارير والإحصائيات</Typography>
                <Button
                    variant="outlined"
                    startIcon={exporting ? <CircularProgress size={18} color="inherit" /> : <PdfIcon />}
                    onClick={handleExportPdf}
                    disabled={exporting || loading}
                >
                    {exporting ? 'جاري التصدير...' : 'تصدير PDF'}
                </Button>
            </Box>

            <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Tab icon={<BarChartIcon />} label="المبيعات اليومية" iconPosition="start" />
                <Tab icon={<StatsIcon />} label="المبيعات حسب الفترة" iconPosition="start" />
                <Tab icon={<CartIcon />} label="الأكثر مبيعًا" iconPosition="start" />
                <Tab icon={<PersonIcon />} label="أداء الموظفين" iconPosition="start" />
            </Tabs>

            {activeTab === 0 && <DailyReportView />}
            {activeTab === 1 && <RangeReportView />}
            {activeTab === 2 && <BestSellersView />}
            {activeTab === 3 && <StaffView />}
        </Box>
    )
}

export default Reports

