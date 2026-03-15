import React, { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, Chip, TextField,
    Grid, CircularProgress, Alert, IconButton, Tooltip, Dialog,
    DialogTitle, DialogContent, DialogActions, Button, TablePagination, MenuItem
} from '@mui/material';
import {
    Security as AuditIcon,
    Refresh as RefreshIcon,
    Visibility as ViewIcon,
    Create as CreateIcon,
    PostAdd as PostIcon,
    Cancel as CancelIcon,
    PersonOutline as PersonIcon
} from '@mui/icons-material';
import { accountingAPI } from '../services/api';

const ACTION_CONFIG = {
    create: { icon: <CreateIcon />, color: 'info', label: 'إنشاء' },
    post: { icon: <PostIcon />, color: 'success', label: 'ترحيل' },
    reverse: { icon: <CancelIcon />, color: 'error', label: 'عكس' },
    update: { icon: <CreateIcon />, color: 'warning', label: 'تعديل' },
    delete: { icon: <CancelIcon />, color: 'error', label: 'حذف' },
    deactivate: { icon: <CancelIcon />, color: 'default', label: 'تعطيل' }
};

const SOURCE_TYPE_LABELS = {
    order: 'طلب بيع',
    order_cogs: 'تكلفة البضاعة المباعة',
    refund: 'مرتجع',
    expense: 'مصروف',
    shift: 'وردية',
    purchase_receipt: 'استلام مشتريات',
    purchase_return: 'مرتجع شراء',
    supplier_payment: 'دفعة مورد',
    stock_adjustment: 'تسوية مخزون',
    transfer: 'تحويل مخزون',
    manual: 'قيد يدوي',
    year_end_close: 'إقفال نهاية السنة',
    gl_account: 'حساب محاسبي',
    migration: 'ترحيل بيانات'
};

const AuditLog = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterMode, setFilterMode] = useState('day');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [monthFrom, setMonthFrom] = useState('');
    const [monthTo, setMonthTo] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [totalRows, setTotalRows] = useState(0);
    const [detailOpen, setDetailOpen] = useState(false);
    const [selected, setSelected] = useState(null);

    const loadLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                page: page + 1,
                limit: rowsPerPage
            };

            if (filterMode === 'month') {
                if (monthFrom) params.periodFrom = monthFrom;
                if (monthTo) params.periodTo = monthTo;
            } else {
                if (dateFrom) params.dateFrom = dateFrom;
                if (dateTo) params.dateTo = dateTo;
            }

            const res = await accountingAPI.getAuditLog(params);
            setLogs(res.data?.data || []);
            setTotalRows(res.data?.pagination?.total || 0);
        } catch (err) {
            setError(err.response?.data?.error || 'تعذر تحميل سجل المراجعة');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, [page, rowsPerPage]);

    const getActionKey = (log) => {
        const raw = String(log?.action || log?.event_type || '').toLowerCase();
        if (!raw) return 'create';
        if (raw.includes('reverse') || raw.includes('cancel') || raw.includes('void')) return 'reverse';
        if (raw.includes('post') || raw.includes('approve') || raw.includes('close')) return 'post';
        if (raw.includes('update') || raw.includes('reopen') || raw.includes('lock') || raw.includes('migrat')) return 'update';
        if (raw.includes('delete') || raw.includes('remove')) return 'delete';
        if (raw.includes('deactiv')) return 'deactivate';
        if (raw.includes('create') || raw.includes('open')) return 'create';
        return 'create';
    };

    const getActionChip = (actionKey) => {
        const cfg = ACTION_CONFIG[actionKey] || ACTION_CONFIG.create;
        return <Chip icon={cfg.icon} label={cfg.label} color={cfg.color} size="small" variant="outlined" />;
    };

    const getEntityLabel = (log) => {
        const sourceType = log?.entity_type || log?.source_type;
        if (!sourceType) return log?.event_type || '-';
        return SOURCE_TYPE_LABELS[sourceType] || sourceType;
    };

    const getDescription = (log) => {
        return (
            log?.description ||
            log?.journalEntry?.description ||
            log?.entry_number ||
            log?.event_type ||
            '-'
        );
    };

    const getActor = (log) => (
        log?.createdByUser?.name_ar ||
        log?.createdByUser?.name_en ||
        log?.createdByUser?.username ||
        log?.user_id ||
        log?.created_by ||
        'النظام'
    );

    const parseJson = (value) => {
        if (value == null) return null;
        if (typeof value === 'object') return value;
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <AuditIcon fontSize="large" color="primary" />
                <Typography variant="h4" fontWeight="bold">سجل المراجعة المحاسبي</Typography>
            </Box>

            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={6} md={3}>
                            <TextField
                                fullWidth
                                size="small"
                                select
                                label="نمط التدقيق"
                                value={filterMode}
                                onChange={(e) => {
                                    setFilterMode(e.target.value);
                                    setPage(0);
                                }}
                            >
                                <MenuItem value="day">يومي</MenuItem>
                                <MenuItem value="month">شهري</MenuItem>
                            </TextField>
                        </Grid>

                        {filterMode === 'month' ? (
                            <>
                                <Grid item xs={6} md={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="من شهر"
                                        type="month"
                                        value={monthFrom}
                                        onChange={(e) => {
                                            setMonthFrom(e.target.value);
                                            setPage(0);
                                        }}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="إلى شهر"
                                        type="month"
                                        value={monthTo}
                                        onChange={(e) => {
                                            setMonthTo(e.target.value);
                                            setPage(0);
                                        }}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                </Grid>
                            </>
                        ) : (
                            <>
                                <Grid item xs={6} md={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="من تاريخ"
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => {
                                            setDateFrom(e.target.value);
                                            setPage(0);
                                        }}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="إلى تاريخ"
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => {
                                            setDateTo(e.target.value);
                                            setPage(0);
                                        }}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                </Grid>
                            </>
                        )}

                        <Grid item xs={12} md={2}>
                            <Button
                                fullWidth
                                variant="outlined"
                                startIcon={<RefreshIcon />}
                                onClick={() => {
                                    if (page !== 0) {
                                        setPage(0);
                                    } else {
                                        loadLogs();
                                    }
                                }}
                            >
                                تحديث
                            </Button>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                            <TableCell><strong>التاريخ</strong></TableCell>
                            <TableCell><strong>النوع</strong></TableCell>
                            <TableCell><strong>العملية</strong></TableCell>
                            <TableCell><strong>المستخدم</strong></TableCell>
                            <TableCell><strong>الوصف</strong></TableCell>
                            <TableCell align="center"><strong>التفاصيل</strong></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                                    <CircularProgress />
                                </TableCell>
                            </TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                                    <Typography color="text.secondary">لا توجد سجلات مراجعة</Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.id} hover>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {new Date(log.created_at || log.createdAt).toLocaleString('ar-SA')}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={getEntityLabel(log)} size="small" variant="filled" color="default" />
                                    </TableCell>
                                    <TableCell>{getActionChip(getActionKey(log))}</TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <PersonIcon fontSize="small" color="action" />
                                            <Typography variant="body2">{getActor(log)}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 360 }}>
                                        <Typography variant="body2" noWrap>{getDescription(log)}</Typography>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="عرض التفاصيل">
                                            <IconButton size="small" onClick={() => { setSelected(log); setDetailOpen(true); }}>
                                                <ViewIcon />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                <TablePagination
                    component="div"
                    count={totalRows}
                    page={page}
                    onPageChange={(_, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10));
                        setPage(0);
                    }}
                    rowsPerPageOptions={[25, 50, 100]}
                    labelRowsPerPage="عدد السجلات في الصفحة:"
                    labelDisplayedRows={({ from, to, count }) =>
                        `${from}-${to} من ${count !== -1 ? count : `أكثر من ${to}`}`
                    }
                />
            </TableContainer>

            <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AuditIcon color="primary" />
                        <Typography variant="h6" fontWeight="bold">تفاصيل سجل المراجعة</Typography>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    {selected && (
                        <Grid container spacing={2}>
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="text.secondary">نوع الكيان</Typography>
                                <Typography fontWeight="bold">{getEntityLabel(selected)}</Typography>
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="text.secondary">معرف الكيان</Typography>
                                <Typography fontFamily="monospace" fontSize="0.8rem">
                                    {selected.entity_id || selected.source_id || selected.journal_entry_id || '-'}
                                </Typography>
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="text.secondary">العملية</Typography>
                                {getActionChip(getActionKey(selected))}
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="text.secondary">المستخدم</Typography>
                                <Typography>{getActor(selected)}</Typography>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary">الوصف</Typography>
                                <Typography>{getDescription(selected)}</Typography>
                            </Grid>

                            {selected.entry_number && (
                                <Grid item xs={12} md={6}>
                                    <Typography variant="caption" color="text.secondary">رقم القيد</Typography>
                                    <Typography fontFamily="monospace">{selected.entry_number}</Typography>
                                </Grid>
                            )}

                            {selected.fiscal_period && (
                                <Grid item xs={12} md={6}>
                                    <Typography variant="caption" color="text.secondary">الفترة المالية</Typography>
                                    <Typography>{selected.fiscal_period}</Typography>
                                </Grid>
                            )}

                            {selected.payload && (
                                <Grid item xs={12}>
                                    <Typography variant="caption" color="text.secondary">البيانات</Typography>
                                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mt: 0.5 }}>
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.8rem', direction: 'ltr' }}>
                                            {JSON.stringify(parseJson(selected.payload), null, 2)}
                                        </pre>
                                    </Paper>
                                </Grid>
                            )}
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailOpen(false)}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AuditLog;
