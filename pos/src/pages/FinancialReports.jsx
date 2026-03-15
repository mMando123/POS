import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Grid,
    Typography,
    Button,
    Tab,
    Tabs,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    CircularProgress,
    Alert
} from '@mui/material';
import {
    Print as PrintIcon,
    Download as DownloadIcon,
    Refresh as RefreshIcon,
    TrendingUp,
    AccountBalance,
    AttachMoney,
    ListAlt,
    InfoOutlined
} from '@mui/icons-material';
import { useTranslation, useThemeConfig } from '../contexts/ThemeContext';
import { accountingAPI } from '../services/api';
import { format } from 'date-fns';
import { exportToExcel } from '../utils/excelExport';

// Custom Tab Panel
function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`financial-tabpanel-${index}`}
            aria-labelledby={`financial-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

const FinancialReports = () => {
    const { t, language } = useTranslation();
    const { formatCurrency } = useThemeConfig();
    const isRtl = language === 'ar';
    const [activeTab, setActiveTab] = useState(0);
    const [period, setPeriod] = useState(format(new Date(), 'yyyy-MM'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [reportData, setReportData] = useState(null);
    const [fiscalPeriods, setFiscalPeriods] = useState([]);
    const [refreshKey, setRefreshKey] = useState(0);

    // RTL-aware indentation padding
    const indentSx = isRtl ? { pr: 4 } : { pl: 4 };

    // Fetch available fiscal periods on mount
    useEffect(() => {
        loadFiscalPeriods();
    }, []);

    // Fetch report data when tab or period changes
    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            setLoading(true);
            setError(null);

            // Clear data before fetching new tab data to avoid type mismatch
            setReportData(null);

            try {
                let response;
                const params = { periodFrom: period, periodTo: period, asOfDate: getLastDayOfMonth(period) };

                switch (activeTab) {
                    case 0: // Income Statement
                        response = await accountingAPI.getProfitLoss(params);
                        break;
                    case 1: // Balance Sheet
                        response = await accountingAPI.getBalanceSheet(params);
                        break;
                    case 2: // Trial Balance
                        response = await accountingAPI.getTrialBalance(params);
                        break;
                    case 3: // Cash Flow
                        response = await accountingAPI.getCashFlow(params);
                        break;
                    default:
                        break;
                }

                if (isMounted && response && response.data.success) {
                    setReportData(response.data.data);
                }
            } catch (err) {
                console.error('Failed to load report data', err);
                if (isMounted) setError(t('errors.somethingWrong'));
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [activeTab, period, refreshKey]);

    const loadFiscalPeriods = async () => {
        try {
            const response = await accountingAPI.getFiscalPeriods();
            if (response.data.success) {
                setFiscalPeriods(response.data.data);
            }
        } catch (err) {
            console.error('Failed to load fiscal periods', err);
        }
    };

    const loadReportData = () => {
        setRefreshKey(k => k + 1);
    };

    const getLastDayOfMonth = (periodStr) => {
        if (!periodStr) return format(new Date(), 'yyyy-MM-dd');
        const [year, month] = periodStr.split('-');
        const date = new Date(year, month, 0); // Last day of month
        return format(date, 'yyyy-MM-dd');
    };

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
        // Data clearing is now handled in useEffect
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExport = () => {
        let dataToExport = [];
        let fileName = `Report_${period}`;

        if (activeTab === 0 && reportData.incomeStatement) {
            // Income Statement
            fileName = `Income_Statement_${period}`;
            const { income, cogs, expenses, netIncome } = reportData.incomeStatement;

            dataToExport.push({ Section: 'Income', Account: 'Revenue', Amount: income.total });
            income.accounts.forEach(acc =>
                dataToExport.push({ Section: '', Account: getAccountName(acc), Amount: acc.balance })
            );

            if (income.contraAccounts && income.contraAccounts.length > 0) {
                income.contraAccounts.forEach(acc =>
                    dataToExport.push({ Section: '', Account: `${getAccountName(acc)} (Contra)`, Amount: -acc.balance })
                );
            }

            dataToExport.push({ Section: 'COGS', Account: 'Total COGS', Amount: -cogs.total });
            cogs.accounts.forEach(acc =>
                dataToExport.push({ Section: '', Account: getAccountName(acc), Amount: -acc.balance })
            );

            dataToExport.push({ Section: 'Gross Profit', Account: '', Amount: income.total - cogs.total });

            dataToExport.push({ Section: 'Expenses', Account: 'Total Expenses', Amount: -expenses.total });
            expenses.accounts.forEach(acc =>
                dataToExport.push({ Section: '', Account: getAccountName(acc), Amount: -acc.balance })
            );

            dataToExport.push({ Section: 'Net Income', Account: '', Amount: netIncome });

        } else if (activeTab === 1 && reportData.balanceSheet) {
            // Balance Sheet
            fileName = `Balance_Sheet_${period}`;
            const { assets, liabilities, equity } = reportData.balanceSheet;

            dataToExport.push({ Section: 'Assets', Account: 'Total Assets', Amount: assets.total });
            assets.accounts.forEach(acc =>
                dataToExport.push({ Section: '', Account: getAccountName(acc), Amount: acc.balance })
            );

            dataToExport.push({ Section: 'Liabilities', Account: 'Total Liabilities', Amount: liabilities.total });
            liabilities.accounts.forEach(acc =>
                dataToExport.push({ Section: '', Account: getAccountName(acc), Amount: acc.balance })
            );

            dataToExport.push({ Section: 'Equity', Account: 'Total Equity', Amount: equity.total });
            equity.accounts.forEach(acc =>
                dataToExport.push({ Section: '', Account: getAccountName(acc), Amount: acc.balance })
            );
            dataToExport.push({ Section: 'Equity', Account: 'Retained Earnings', Amount: equity.retainedEarnings });

        } else if (activeTab === 2 && reportData.trialBalance) {
            // Trial Balance
            fileName = `Trial_Balance_${period}`;
            const { accounts, totalDebit, totalCredit } = reportData.trialBalance;

            accounts.forEach(acc => {
                dataToExport.push({
                    Code: acc.code,
                    Account: getAccountName(acc),
                    Type: acc.account_type,
                    Debit: acc.debit > 0 ? acc.debit : 0,
                    Credit: acc.credit > 0 ? acc.credit : 0
                });
            });
            dataToExport.push({ Code: 'TOTAL', Account: '', Type: '', Debit: totalDebit, Credit: totalCredit });

        } else if (activeTab === 3 && reportData.cashFlow) {
            // Cash Flow
            fileName = `Cash_Flow_${period}`;
            const { operating } = reportData.cashFlow;

            dataToExport.push({ Section: 'Operating', Item: 'Net Income', Amount: operating.netIncome });
            dataToExport.push({ Section: 'Operating', Item: 'Depreciation', Amount: operating.adjustments.depreciation });
            dataToExport.push({ Section: 'Operating', Item: 'Working Capital Changes', Amount: operating.adjustments.workingCapital });
            dataToExport.push({ Section: 'Total', Item: 'Net Cash from Operating', Amount: operating.netCash });
        }

        if (dataToExport.length > 0) {
            exportToExcel(dataToExport, fileName);
        } else {
            alert('No data to export');
        }
    };

    // Get account display name
    const getAccountName = (acc) => {
        return isRtl ? (acc.name_ar || acc.name_en) : (acc.name_en || acc.name_ar);
    };

    // Empty state component
    const renderEmptyState = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
            <InfoOutlined sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
                {t('accounting.noReportData')}
            </Typography>
        </Box>
    );

    // --- REPORT RENDERERS ---

    const renderIncomeStatement = () => {
        if (!reportData || !reportData.income || !reportData.cogs) return renderEmptyState();
        const { income, cogs, grossProfit, operatingExpenses, netIncome } = reportData;

        return (
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('accounting.account')}</TableCell>
                            <TableCell align="right">{t('accounting.total')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {/* Revenue Section */}
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                            <TableCell colSpan={2}>
                                <Typography variant="subtitle1" fontWeight="bold">{t('accounting.revenue')}</Typography>
                            </TableCell>
                        </TableRow>
                        {income.accounts.map((acc) => (
                            <TableRow key={acc.code}>
                                <TableCell sx={indentSx}>
                                    {getAccountName(acc)} ({acc.code})
                                </TableCell>
                                <TableCell align="right">
                                    {formatCurrency(acc.balance)}
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow>
                            <TableCell sx={indentSx}>
                                <Typography variant="body2" fontWeight="bold">{t('common.total')} {t('accounting.revenue')}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography fontWeight="bold">{formatCurrency(income.totalRevenue || income.total)}</Typography>
                            </TableCell>
                        </TableRow>

                        {/* Contra-Revenue (Discounts Given) */}
                        {income.contraAccounts && income.contraAccounts.length > 0 && (
                            <>
                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell colSpan={2}>
                                        <Typography variant="subtitle1" fontWeight="bold">{t('accounting.discounts') || 'Discounts / Contra-Revenue'}</Typography>
                                    </TableCell>
                                </TableRow>
                                {income.contraAccounts.map((acc) => (
                                    <TableRow key={acc.code}>
                                        <TableCell sx={indentSx}>
                                            {getAccountName(acc)} ({acc.code})
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main' }}>
                                            ({formatCurrency(acc.balance)})
                                        </TableCell>
                                    </TableRow>
                                ))}
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell sx={indentSx}>
                                        <Typography variant="body2" fontWeight="bold">{t('accounting.netRevenue') || 'Net Revenue'}</Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography fontWeight="bold">{formatCurrency(income.total)}</Typography>
                                    </TableCell>
                                </TableRow>
                            </>
                        )}

                        {/* COGS Section */}
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                            <TableCell colSpan={2}>
                                <Typography variant="subtitle1" fontWeight="bold">{t('accounting.cogs')}</Typography>
                            </TableCell>
                        </TableRow>
                        {cogs.accounts.map((acc) => (
                            <TableRow key={acc.code}>
                                <TableCell sx={indentSx}>
                                    {getAccountName(acc)} ({acc.code})
                                </TableCell>
                                <TableCell align="right">
                                    {formatCurrency(acc.balance)}
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow>
                            <TableCell sx={indentSx}>
                                <Typography variant="body2" fontWeight="bold">{t('common.total')}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography fontWeight="bold">{formatCurrency(cogs.total)}</Typography>
                            </TableCell>
                        </TableRow>

                        {/* Gross Profit */}
                        <TableRow sx={{ bgcolor: 'primary.main' }}>
                            <TableCell>
                                <Typography variant="h6" color="white">{t('accounting.grossProfit')}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant="h6" color="white">{formatCurrency(grossProfit)}</Typography>
                            </TableCell>
                        </TableRow>

                        {/* Operating Expenses Section */}
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                            <TableCell colSpan={2}>
                                <Typography variant="subtitle1" fontWeight="bold">{t('accounting.operatingExpenses')}</Typography>
                            </TableCell>
                        </TableRow>
                        {operatingExpenses.accounts.map((acc) => (
                            <TableRow key={acc.code}>
                                <TableCell sx={indentSx}>
                                    {getAccountName(acc)} ({acc.code})
                                </TableCell>
                                <TableCell align="right">
                                    {formatCurrency(acc.balance)}
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow>
                            <TableCell sx={indentSx}>
                                <Typography variant="body2" fontWeight="bold">{t('common.total')}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography fontWeight="bold">{formatCurrency(operatingExpenses.total)}</Typography>
                            </TableCell>
                        </TableRow>

                        {/* Net Income */}
                        <TableRow sx={{ bgcolor: netIncome >= 0 ? 'success.main' : 'error.main' }}>
                            <TableCell>
                                <Typography variant="h6" color="white">{t('accounting.netIncome')}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant="h6" color="white">{formatCurrency(netIncome)}</Typography>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        );
    };

    const renderBalanceSheet = () => {
        if (!reportData || !reportData.assets || !reportData.liabilities) return renderEmptyState();
        const { assets, liabilities, equity, totalLiabilitiesAndEquity, balanced } = reportData;

        const renderSection = (title, data, showRetainedEarnings = false) => (
            <>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={2}>
                        <Typography variant="subtitle1" fontWeight="bold">{title}</Typography>
                    </TableCell>
                </TableRow>
                {data.accounts.map((acc) => (
                    <TableRow key={acc.code}>
                        <TableCell sx={indentSx}>
                            {getAccountName(acc)} ({acc.code})
                        </TableCell>
                        <TableCell align="right">
                            {formatCurrency(acc.balance)}
                        </TableCell>
                    </TableRow>
                ))}
                {/* Show Retained Earnings only in Equity section */}
                {showRetainedEarnings && equity.retainedEarnings !== 0 && (
                    <TableRow>
                        <TableCell sx={indentSx}>
                            {t('accounting.retainedEarnings')}
                        </TableCell>
                        <TableCell align="right">
                            {formatCurrency(equity.retainedEarnings)}
                        </TableCell>
                    </TableRow>
                )}
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={indentSx}>
                        <Typography variant="body2" fontWeight="bold">{t('common.total')} {title}</Typography>
                    </TableCell>
                    <TableCell align="right">
                        <Typography fontWeight="bold">{formatCurrency(data.total)}</Typography>
                    </TableCell>
                </TableRow>
            </>
        );

        return (
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('accounting.account')}</TableCell>
                            <TableCell align="right">{t('accounting.total')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {/* Assets */}
                        {renderSection(t('accounting.assets'), assets)}

                        <TableRow><TableCell colSpan={2} sx={{ height: 20, border: 'none' }} /></TableRow>

                        {/* Liabilities */}
                        {renderSection(t('accounting.liabilities'), liabilities)}

                        {/* Equity (with Retained Earnings) */}
                        {renderSection(t('accounting.equity'), equity, true)}

                        {/* Total Liabilities & Equity */}
                        <TableRow sx={{ bgcolor: balanced ? 'success.main' : 'error.main' }}>
                            <TableCell>
                                <Typography variant="h6" color="white">
                                    {t('accounting.totalLiabilitiesEquity')}
                                </Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant="h6" color="white">{formatCurrency(totalLiabilitiesAndEquity)}</Typography>
                            </TableCell>
                        </TableRow>
                        {!balanced && (
                            <TableRow>
                                <TableCell colSpan={2}>
                                    <Alert severity="error">
                                        {t('accounting.unbalancedWarning')}
                                        {' '}({formatCurrency(assets.total)} ≠ {formatCurrency(totalLiabilitiesAndEquity)})
                                    </Alert>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    };

    const renderTrialBalance = () => {
        if (!reportData || !reportData.accounts || !reportData.totals) return renderEmptyState();
        const { accounts, totals, balanced } = reportData;

        return (
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('accounting.account')}</TableCell>
                            <TableCell align="right">{t('accounting.debit')}</TableCell>
                            <TableCell align="right">{t('accounting.credit')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {accounts.map((acc) => (
                            <TableRow key={acc.code}>
                                <TableCell>
                                    {acc.code} - {getAccountName(acc)}
                                </TableCell>
                                <TableCell align="right">
                                    {formatCurrency(acc.total_debit)}
                                </TableCell>
                                <TableCell align="right">
                                    {formatCurrency(acc.total_credit)}
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow sx={{ bgcolor: balanced ? 'success.main' : 'error.main' }}>
                            <TableCell>
                                <Typography variant="subtitle1" color="white" fontWeight="bold">{t('common.total')}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant="subtitle1" color="white" fontWeight="bold">{formatCurrency(totals.totalDebits)}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant="subtitle1" color="white" fontWeight="bold">{formatCurrency(totals.totalCredits)}</Typography>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        );
    };

    const renderCashFlow = () => {
        if (!reportData || !reportData.operating) return renderEmptyState();
        const { operating, netCashFlow } = reportData;

        return (
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('common.description')}</TableCell>
                            <TableCell align="right">{t('accounting.total')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                            <TableCell colSpan={2}>
                                <Typography variant="subtitle1" fontWeight="bold">{t('accounting.operatingActivities')}</Typography>
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell sx={indentSx}>{t('accounting.cashInflow')}</TableCell>
                            <TableCell align="right" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                                +{formatCurrency(operating.inflows)}
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell sx={indentSx}>{t('accounting.cashOutflow')}</TableCell>
                            <TableCell align="right" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                                -{formatCurrency(operating.outflows)}
                            </TableCell>
                        </TableRow>

                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                            <TableCell>
                                <Typography variant="subtitle1" fontWeight="bold">{t('accounting.netOperatingCashFlow')}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant="subtitle1" fontWeight="bold">{formatCurrency(operating.net)}</Typography>
                            </TableCell>
                        </TableRow>

                        {/* Net Cash Flow */}
                        <TableRow sx={{ bgcolor: 'primary.main' }}>
                            <TableCell>
                                <Typography variant="h6" color="white">{t('accounting.netCashFlow')}</Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant="h6" color="white">{formatCurrency(netCashFlow)}</Typography>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                {/* Details Section */}
                {operating.items && operating.items.length > 0 && (
                    <Box sx={{ p: 2, mt: 2 }}>
                        <Typography variant="h6" gutterBottom>{t('accounting.detailedMovements')}</Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('common.date')}</TableCell>
                                    <TableCell>{t('common.description')}</TableCell>
                                    <TableCell align="right">{t('accounting.amount')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {operating.items.map((item, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>{format(new Date(item.date), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>{item.description}</TableCell>
                                        <TableCell align="right" sx={{ color: item.net >= 0 ? 'success.main' : 'error.main', fontWeight: 'bold' }}>
                                            {formatCurrency(item.net)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Box>
                )}
            </TableContainer>
        );
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <AttachMoney fontSize="large" color="primary" />
                    <Typography variant="h4" fontWeight="bold">
                        {t('accounting.title')}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        variant="outlined"
                        startIcon={<PrintIcon />}
                        onClick={handlePrint}
                    >
                        {t('common.print')}
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={handleExport}
                    >
                        {t('common.exportExcel')}
                    </Button>
                </Box>
            </Box>

            {/* Filter */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>{t('accounting.fiscalPeriod')}</InputLabel>
                                <Select
                                    value={period}
                                    label={t('accounting.fiscalPeriod')}
                                    onChange={(e) => setPeriod(e.target.value)}
                                >
                                    {fiscalPeriods.map((fp) => (
                                        <MenuItem key={fp.period} value={fp.period}>
                                            {fp.period} ({fp.status})
                                        </MenuItem>
                                    ))}
                                    {/* Fallback if no periods */}
                                    {!fiscalPeriods.find(p => p.period === format(new Date(), 'yyyy-MM')) && (
                                        <MenuItem value={format(new Date(), 'yyyy-MM')}>
                                            {format(new Date(), 'yyyy-MM')} (Current)
                                        </MenuItem>
                                    )}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <Button
                                fullWidth
                                variant="contained"
                                startIcon={<RefreshIcon />}
                                onClick={loadReportData}
                            >
                                {t('common.refresh')}
                            </Button>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Tabs */}
            <Paper sx={{ width: '100%', mb: 2 }}>
                <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    textColor="primary"
                    indicatorColor="primary"
                    variant="scrollable"
                    scrollButtons="auto"
                >
                    <Tab icon={<TrendingUp />} iconPosition="start" label={t('accounting.incomeStatement')} />
                    <Tab icon={<AccountBalance />} iconPosition="start" label={t('accounting.balanceSheet')} />
                    <Tab icon={<ListAlt />} iconPosition="start" label={t('accounting.trialBalance')} />
                    <Tab icon={<AttachMoney />} iconPosition="start" label={t('accounting.cashFlow')} />
                </Tabs>

                <Box sx={{ position: 'relative', minHeight: 400 }}>
                    {loading && (
                        <Box sx={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            bgcolor: 'rgba(255,255,255,0.7)', zIndex: 1
                        }}>
                            <CircularProgress />
                        </Box>
                    )}

                    {error && (
                        <Box sx={{ p: 3 }}>
                            <Alert severity="error">{error}</Alert>
                        </Box>
                    )}

                    <TabPanel value={activeTab} index={0}>
                        {renderIncomeStatement()}
                    </TabPanel>
                    <TabPanel value={activeTab} index={1}>
                        {renderBalanceSheet()}
                    </TabPanel>
                    <TabPanel value={activeTab} index={2}>
                        {renderTrialBalance()}
                    </TabPanel>
                    <TabPanel value={activeTab} index={3}>
                        {renderCashFlow()}
                    </TabPanel>
                </Box>
            </Paper>
        </Box>
    );
};

export default FinancialReports;
