import { useState } from 'react'
import {
    Box,
    Paper,
    Typography,
    Grid,
    Card,
    CardContent,
    Button,
    TextField,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress
} from '@mui/material'
import {
    Assessment as ReportIcon,
    Download as DownloadIcon,
    DateRange as DateRangeIcon
} from '@mui/icons-material'
import { DatePicker } from '@mui/x-date-pickers'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { arSA } from 'date-fns/locale'
import { inventoryAPI, warehouseAPI } from '../services/api'
import { useThemeConfig } from '../contexts/ThemeContext'
import { exportToExcel } from '../utils/excelExport'

export default function InventoryReports() {
    const { formatCurrency } = useThemeConfig()
    const [reportType, setReportType] = useState('valuation')
    const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 1)))
    const [endDate, setEndDate] = useState(new Date())
    const [loading, setLoading] = useState(false)
    const [reportData, setReportData] = useState([])
    const [summary, setSummary] = useState(null)

    const reportTypes = [
        { value: 'valuation', label: 'تقرير قيمة المخزون' },
        { value: 'movements', label: 'تقرير حركة الأصناف' },
        { value: 'low_stock', label: 'تقرير النواقص' },
        { value: 'expiry', label: 'تقرير انتهاء الصلاحية' }
    ]

    const handleGenerateReport = async () => {
        setLoading(true)
        try {
            let response
            const params = {
                from_date: startDate.toISOString(),
                to_date: endDate.toISOString()
            }

            switch (reportType) {
                case 'valuation':
                    response = await inventoryAPI.getValuation(params)
                    // Backend returns { data: { by_warehouse: [...], items: [...], total_value: ... } }
                    setReportData(response.data.data?.by_warehouse || [])
                    setSummary(response.data.data)
                    break
                case 'movements':
                    response = await inventoryAPI.getMovements({ ...params, limit: 100 })
                    setReportData(response.data.data || [])
                    setSummary(null)
                    break
                case 'low_stock':
                    response = await inventoryAPI.getLowStock()
                    // Backend returns { data: { lowStock: [...] } }
                    setReportData(response.data.data?.lowStock || [])
                    setSummary(null)
                    break
                // Add other cases as backend supports
                default:
                    setReportData([])
            }
        } catch (error) {
            console.error('Error generating report:', error)
        } finally {
            setLoading(false)
        }
    }

    // const formatCurrency = (val) => new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(val)

    const handleExport = () => {
        if (!reportData.length) return;

        let dataToExport = [];
        let fileName = 'Inventory_Report';

        switch (reportType) {
            case 'valuation':
                dataToExport = reportData.map(row => ({
                    'المستودع': row.warehouse_name,
                    'عدد الأصناف': row.total_items,
                    'إجمالي القيمة': row.total_value
                }));
                if (summary) {
                    dataToExport.push({
                        'المستودع': 'الإجمالي الكلي',
                        'عدد الأصناف': summary.total_items,
                        'إجمالي القيمة': summary.total_value
                    });
                }
                fileName = 'Valuation_Report';
                break;
            case 'movements':
                dataToExport = reportData.map(row => ({
                    'التاريخ': new Date(row.created_at).toLocaleString('ar-SA'),
                    'الصنف': row.Menu?.name_ar || '-',
                    'نوع الحركة': row.movement_type,
                    'الكمية': row.quantity > 0 ? `+${row.quantity}` : row.quantity,
                    'المستودع': row.Warehouse?.name_ar || '-',
                    'المستخدم': row.User?.name_ar || '-'
                }));
                fileName = 'Movements_Report';
                break;
            case 'low_stock':
                dataToExport = reportData.map(row => ({
                    'الصنف': row.productName,
                    'المستودع': row.warehouseName,
                    'الكمية الحالية': row.quantity,
                    'الحد الأدنى': row.minStock,
                    'النقص': row.minStock - row.quantity
                }));
                fileName = 'Low_Stock_Report';
                break;
            default:
                break;
        }

        exportToExcel(dataToExport, `${fileName}_${new Date().toISOString().split('T')[0]}`);
    };

    const renderTable = () => {
        if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
        if (!reportData.length) return <Typography align="center" sx={{ py: 4 }}>لا توجد بيانات</Typography>

        switch (reportType) {
            case 'valuation':
                return (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>المستودع</TableCell>
                                <TableCell align="right">عدد الأصناف</TableCell>
                                <TableCell align="right">إجمالي القيمة</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {reportData.map((row, idx) => (
                                <TableRow key={idx}>
                                    <TableCell>{row.warehouse_name}</TableCell>
                                    <TableCell align="right">{row.total_items}</TableCell>
                                    <TableCell align="right">{formatCurrency(row.total_value)}</TableCell>
                                </TableRow>
                            ))}
                            {summary && (
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell><strong>الإجمالي الكلي</strong></TableCell>
                                    <TableCell align="right"><strong>{summary.total_items}</strong></TableCell>
                                    <TableCell align="right"><strong>{formatCurrency(summary.total_value)}</strong></TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )
            case 'movements':
                return (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>التاريخ</TableCell>
                                <TableCell>الصنف</TableCell>
                                <TableCell>نوع الحركة</TableCell>
                                <TableCell>الكمية</TableCell>
                                <TableCell>المستودع</TableCell>
                                <TableCell>المستخدم</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {reportData.map((row, idx) => (
                                <TableRow key={idx}>
                                    <TableCell>{new Date(row.created_at).toLocaleString('ar-SA')}</TableCell>
                                    <TableCell>{row.Menu?.name_ar || '-'}</TableCell>
                                    <TableCell>{row.movement_type}</TableCell>
                                    <TableCell dir="ltr" align="center">{row.quantity > 0 ? `+${row.quantity}` : row.quantity}</TableCell>
                                    <TableCell>{row.Warehouse?.name_ar || '-'}</TableCell>
                                    <TableCell>{row.User?.name_ar || '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )
            case 'low_stock':
                return (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>الصنف</TableCell>
                                <TableCell>المستودع</TableCell>
                                <TableCell align="center">الكمية الحالية</TableCell>
                                <TableCell align="center">الحد الأدنى</TableCell>
                                <TableCell align="center">النقص</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {reportData.map((row, idx) => (
                                <TableRow key={idx}>
                                    <TableCell>{row.productName}</TableCell>
                                    <TableCell>{row.warehouseName}</TableCell>
                                    <TableCell align="center" sx={{ color: 'error.main', fontWeight: 'bold' }}>{row.quantity}</TableCell>
                                    <TableCell align="center">{row.minStock}</TableCell>
                                    <TableCell align="center">{row.minStock - row.quantity}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )
            default:
                return null
        }
    }

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={arSA}>
            <Box sx={{ p: 3 }}>
                <Typography variant="h4" fontWeight="bold" sx={{ mb: 3 }}>
                    <ReportIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    تقارير المخزون
                </Typography>

                <Paper sx={{ p: 3, mb: 3 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={4}>
                            <TextField
                                select
                                label="نوع التقرير"
                                value={reportType}
                                onChange={(e) => setReportType(e.target.value)}
                                fullWidth
                            >
                                {reportTypes.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={3}>
                            <DatePicker
                                label="من تاريخ"
                                value={startDate}
                                onChange={(newValue) => setStartDate(newValue)}
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                        </Grid>
                        <Grid item xs={12} md={3}>
                            <DatePicker
                                label="إلى تاريخ"
                                value={endDate}
                                onChange={(newValue) => setEndDate(newValue)}
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <Button
                                variant="contained"
                                fullWidth
                                size="large"
                                onClick={handleGenerateReport}
                                startIcon={<ReportIcon />}
                            >
                                عرض التقرير
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>

                <TableContainer component={Paper}>
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">نتائج التقرير</Typography>
                        <Button startIcon={<DownloadIcon />} disabled={!reportData.length} onClick={handleExport}>
                            تصدير (Excel)
                        </Button>
                    </Box>
                    {renderTable()}
                </TableContainer>
            </Box>
        </LocalizationProvider>
    )
}
