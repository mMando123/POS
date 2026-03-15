import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    Grid,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    Cancel as CancelledIcon,
    CheckCircle as PostedIcon,
    Edit as DraftIcon,
    Receipt as ReceiptIcon,
    Refresh as RefreshIcon,
    Undo as CancelIcon,
    Visibility as ViewIcon
} from '@mui/icons-material';
import { useThemeConfig } from '../contexts/ThemeContext';
import { accountingAPI } from '../services/api';
import { useLocation, useNavigate } from 'react-router-dom';
import FileAttachmentsField from '../components/FileAttachmentsField';

const emptyLine = () => ({ account_id: '', description: '', debit: '', credit: '' });

const JournalEntries = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { formatCurrency } = useThemeConfig();

    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

    const [statusFilter, setStatusFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState([]);
    const [newEntry, setNewEntry] = useState({
        entry_date: new Date().toISOString().split('T')[0],
        description: '',
        reference: '',
        lines: [emptyLine(), emptyLine()]
    });

    const entryIdFromUrl = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return params.get('entryId');
    }, [location.search]);

    const statusLabel = useMemo(() => ({
        draft: 'مسودة',
        posted: 'مرحّل',
        cancelled: 'ملغي',
        reversed: 'عكسي'
    }), []);

    const formatCreateError = (err) => {
        const apiError = err?.response?.data?.error;
        if (typeof apiError === 'string' && apiError.trim()) return apiError;

        const apiErrors = err?.response?.data?.errors;
        if (Array.isArray(apiErrors) && apiErrors.length) {
            const messages = apiErrors
                .map((e) => e?.msg || e?.message || e?.param || '')
                .filter(Boolean);
            if (messages.length) return messages.join('، ');
        }

        if (typeof err?.message === 'string' && err.message.trim()) return err.message;
        return 'فشل في إنشاء القيد';
    };

    const calcTotalsFromLines = (lines = []) => {
        const debit = lines.reduce((sum, line) => sum + (parseFloat(line.debit_amount ?? line.debit ?? 0) || 0), 0);
        const credit = lines.reduce((sum, line) => sum + (parseFloat(line.credit_amount ?? line.credit ?? 0) || 0), 0);
        return { debit, credit };
    };

    const loadEntries = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (dateFrom) params.periodFrom = dateFrom.slice(0, 7);
            if (dateTo) params.periodTo = dateTo.slice(0, 7);

            const res = await accountingAPI.getJournalEntries(params);
            if (!res?.data?.success) {
                throw new Error(res?.data?.error || 'فشل في تحميل القيود');
            }

            let rows = res.data.data || [];
            if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
            setEntries(rows);
        } catch (err) {
            setError(err?.response?.data?.error || err.message || 'فشل في تحميل القيود');
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo, statusFilter]);

    useEffect(() => {
        loadEntries();
    }, [loadEntries]);

    useEffect(() => {
        if (!entryIdFromUrl) return;

        let cancelled = false;

        const openEntryFromLink = async () => {
            try {
                const res = await accountingAPI.getJournalEntry(entryIdFromUrl);
                if (cancelled) return;
                if (res?.data?.success) {
                    setSelectedEntry(res.data.data);
                    setDetailOpen(true);
                } else {
                    setSnack({ open: true, msg: 'تعذر فتح القيد المطلوب', severity: 'error' });
                }
            } catch (err) {
                if (cancelled) return;
                setSnack({
                    open: true,
                    msg: err?.response?.data?.error || 'تعذر فتح القيد المطلوب',
                    severity: 'error'
                });
            } finally {
                if (!cancelled) {
                    navigate('/journal-entries', { replace: true });
                }
            }
        };

        openEntryFromLink();

        return () => {
            cancelled = true;
        };
    }, [entryIdFromUrl, navigate]);

    const loadAccounts = async () => {
        try {
            const res = await accountingAPI.getCOAFlat({ leafOnly: true });
            if (res?.data?.success) {
                const list = (res.data.data || []).filter((a) => !a.is_group);
                setAccounts(list);
            }
        } catch (err) {
            setSnack({ open: true, msg: err?.response?.data?.error || 'تعذر تحميل الحسابات', severity: 'error' });
        }
    };

    const handleOpenCreate = async () => {
        await loadAccounts();
        setCreateError(null);
        setNewEntry({
            entry_date: new Date().toISOString().split('T')[0],
            description: '',
            reference: '',
            lines: [emptyLine(), emptyLine()]
        });
        setPendingAttachmentFiles([]);
        setCreateOpen(true);
    };

    const handleView = async (entry) => {
        try {
            const res = await accountingAPI.getJournalEntry(entry.id);
            if (res?.data?.success) {
                setSelectedEntry(res.data.data);
            } else {
                setSelectedEntry(entry);
            }
        } catch {
            setSelectedEntry(entry);
        }
        setDetailOpen(true);
    };

    const handleReverse = async (entryId) => {
        try {
            await accountingAPI.reverseJournalEntry(entryId, { reason: 'إلغاء يدوي' });
            setSnack({ open: true, msg: 'تم إنشاء قيد عكسي بنجاح', severity: 'success' });
            setDetailOpen(false);
            loadEntries();
        } catch (err) {
            setSnack({ open: true, msg: err?.response?.data?.error || 'فشل في إلغاء القيد', severity: 'error' });
        }
    };

    const handleDownloadAttachment = async (entryId, attachment) => {
        try {
            const res = await accountingAPI.downloadJournalEntryAttachment(entryId, attachment.id);
            const blob = new Blob([res.data], { type: attachment.mime_type || 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = attachment.original_name || 'attachment';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            setSnack({
                open: true,
                msg: err?.response?.data?.error || 'تعذر تحميل المرفق',
                severity: 'error'
            });
        }
    };

    const handleDeleteAttachment = async (entryId, attachment) => {
        try {
            await accountingAPI.deleteJournalEntryAttachment(entryId, attachment.id);
            const refreshed = await accountingAPI.getJournalEntry(entryId);
            if (refreshed?.data?.success) {
                setSelectedEntry(refreshed.data.data);
            }
            setSnack({ open: true, msg: 'تم حذف المرفق', severity: 'success' });
        } catch (err) {
            setSnack({
                open: true,
                msg: err?.response?.data?.error || 'تعذر حذف المرفق',
                severity: 'error'
            });
        }
    };

    const addLine = () => {
        setNewEntry((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }));
    };

    const removeLine = (index) => {
        setNewEntry((prev) => {
            if (prev.lines.length <= 2) return prev;
            return { ...prev, lines: prev.lines.filter((_, i) => i !== index) };
        });
    };

    const updateLine = (index, field, value) => {
        setNewEntry((prev) => {
            const lines = [...prev.lines];
            lines[index] = { ...lines[index], [field]: value };

            if (field === 'debit' && value) lines[index].credit = '';
            if (field === 'credit' && value) lines[index].debit = '';

            return { ...prev, lines };
        });
    };

    const createTotalDebit = newEntry.lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
    const createTotalCredit = newEntry.lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
    const isBalanced = Math.abs(createTotalDebit - createTotalCredit) < 0.01 && createTotalDebit > 0;

    const handleCreate = async () => {
        setCreateLoading(true);
        setCreateError(null);
        try {
            if (!newEntry.description.trim()) {
                throw new Error('وصف القيد مطلوب');
            }
            if (!isBalanced) {
                throw new Error('القيد غير متوازن (المدين لا يساوي الدائن)');
            }

            const mappedLines = newEntry.lines.map((line, idx) => {
                const selectedAccount = accounts.find((a) => a.id === line.account_id);
                const accountCode = selectedAccount?.code || '';

                if (!accountCode) {
                    throw new Error(`يرجى اختيار حساب صحيح في السطر ${idx + 1}`);
                }

                return {
                    accountCode,
                    description: line.description || '',
                    debit: parseFloat(line.debit) || 0,
                    credit: parseFloat(line.credit) || 0
                };
            });

            const payload = {
                description: newEntry.description,
                notes: newEntry.reference || '',
                entryDate: newEntry.entry_date,
                lines: mappedLines
            };

            const created = await accountingAPI.createJournalEntry(payload);
            const createdEntry = created?.data?.data;

            let uploadWarning = null;
            if (createdEntry?.id && pendingAttachmentFiles.length > 0) {
                try {
                    await accountingAPI.uploadJournalEntryAttachments(createdEntry.id, pendingAttachmentFiles);
                } catch (uploadErr) {
                    uploadWarning = uploadErr?.response?.data?.error || 'تم إنشاء القيد لكن فشل رفع بعض المرفقات';
                }
            }

            setSnack({
                open: true,
                msg: uploadWarning || (pendingAttachmentFiles.length > 0
                    ? 'تم إنشاء القيد وحفظ المرفقات'
                    : 'تم إنشاء القيد بنجاح'),
                severity: uploadWarning ? 'warning' : 'success'
            });
            setCreateOpen(false);
            setPendingAttachmentFiles([]);
            loadEntries();
        } catch (err) {
            setCreateError(formatCreateError(err));
        } finally {
            setCreateLoading(false);
        }
    };

    const getStatusChip = (status) => {
        const config = {
            draft: { color: 'warning', icon: <DraftIcon fontSize="small" /> },
            posted: { color: 'success', icon: <PostedIcon fontSize="small" /> },
            cancelled: { color: 'error', icon: <CancelledIcon fontSize="small" /> },
            reversed: { color: 'error', icon: <CancelledIcon fontSize="small" /> }
        };

        const c = config[status] || config.draft;
        return <Chip icon={c.icon} label={statusLabel[status] || status} color={c.color} size="small" variant="outlined" />;
    };

    const getAccountLabel = (acc) => `${acc.code} - ${acc.name_ar || acc.name_en || '-'}`;

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <ReceiptIcon color="primary" fontSize="large" />
                    <Typography variant="h4" fontWeight="bold">دفتر اليومية</Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate} size="large">
                    قيد جديد
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>الحالة</InputLabel>
                                <Select value={statusFilter} label="الحالة" onChange={(e) => setStatusFilter(e.target.value)}>
                                    <MenuItem value="">الكل</MenuItem>
                                    <MenuItem value="draft">مسودة</MenuItem>
                                    <MenuItem value="posted">مرحّل</MenuItem>
                                    <MenuItem value="cancelled">ملغي</MenuItem>
                                    <MenuItem value="reversed">عكسي</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={3}>
                            <TextField
                                fullWidth
                                size="small"
                                label="من تاريخ"
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12} md={3}>
                            <TextField
                                fullWidth
                                size="small"
                                label="إلى تاريخ"
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12} md={3}>
                            <Button fullWidth variant="outlined" startIcon={<RefreshIcon />} onClick={loadEntries}>
                                تحديث
                            </Button>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Paper>
                {loading ? (
                    <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>رقم القيد</strong></TableCell>
                                    <TableCell><strong>التاريخ</strong></TableCell>
                                    <TableCell><strong>الوصف</strong></TableCell>
                                    <TableCell><strong>المرجع</strong></TableCell>
                                    <TableCell align="right"><strong>المدين</strong></TableCell>
                                    <TableCell align="right"><strong>الدائن</strong></TableCell>
                                    <TableCell align="center"><strong>الحالة</strong></TableCell>
                                    <TableCell align="center"><strong>إجراءات</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {entries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">
                                            <Typography color="text.secondary">لا توجد قيود محاسبية</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : entries.map((entry) => {
                                    const totals = calcTotalsFromLines(entry.lines || []);
                                    return (
                                        <TableRow key={entry.id} hover>
                                            <TableCell>
                                                <Button size="small" onClick={() => handleView(entry)}>
                                                    {entry.entry_number || '-'}
                                                </Button>
                                            </TableCell>
                                            <TableCell>{entry.entry_date || '-'}</TableCell>
                                            <TableCell>{entry.description || '-'}</TableCell>
                                            <TableCell>{entry.reference || '-'}</TableCell>
                                            <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>
                                                {formatCurrency(totals.debit || entry.total_amount || 0)}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
                                                {formatCurrency(totals.credit || entry.total_amount || 0)}
                                            </TableCell>
                                            <TableCell align="center">{getStatusChip(entry.status)}</TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="عرض التفاصيل">
                                                    <IconButton size="small" color="primary" onClick={() => handleView(entry)}>
                                                        <ViewIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>{selectedEntry?.entry_number || 'تفاصيل القيد'}</DialogTitle>
                <DialogContent>
                    {selectedEntry && (
                        <>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={12} md={3}>
                                    <Typography variant="caption" color="text.secondary">التاريخ</Typography>
                                    <Typography>{selectedEntry.entry_date || '-'}</Typography>
                                </Grid>
                                <Grid item xs={12} md={3}>
                                    <Typography variant="caption" color="text.secondary">المرجع</Typography>
                                    <Typography>{selectedEntry.reference || '-'}</Typography>
                                </Grid>
                                <Grid item xs={12} md={3}>
                                    <Typography variant="caption" color="text.secondary">أُنشئ بواسطة</Typography>
                                    <Typography>{selectedEntry.created_by || '-'}</Typography>
                                </Grid>
                                <Grid item xs={12} md={3}>
                                    <Typography variant="caption" color="text.secondary">الحالة</Typography>
                                    <Box>{getStatusChip(selectedEntry.status)}</Box>
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="caption" color="text.secondary">الوصف</Typography>
                                    <Typography>{selectedEntry.description || '-'}</Typography>
                                </Grid>
                            </Grid>

                            <Divider sx={{ mb: 2 }} />

                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell><strong>الحساب</strong></TableCell>
                                            <TableCell><strong>البيان</strong></TableCell>
                                            <TableCell align="right"><strong>مدين</strong></TableCell>
                                            <TableCell align="right"><strong>دائن</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {(selectedEntry.lines || []).map((line) => (
                                            <TableRow key={line.id}>
                                                <TableCell>{line.account?.code} - {line.account?.name_ar || line.account?.name_en || '-'}</TableCell>
                                                <TableCell>{line.description || '-'}</TableCell>
                                                <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>
                                                    {formatCurrency(parseFloat(line.debit_amount || 0))}
                                                </TableCell>
                                                <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>
                                                    {formatCurrency(parseFloat(line.credit_amount || 0))}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {(() => {
                                            const totals = calcTotalsFromLines(selectedEntry.lines || []);
                                            return (
                                                <TableRow>
                                                    <TableCell colSpan={2}><strong>الإجمالي</strong></TableCell>
                                                    <TableCell align="right" sx={{ color: 'success.main', fontWeight: 800 }}>
                                                        {formatCurrency(totals.debit)}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ color: 'error.main', fontWeight: 800 }}>
                                                        {formatCurrency(totals.credit)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })()}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <FileAttachmentsField
                                title="مرفقات القيد"
                                existingFiles={selectedEntry?.attachments || []}
                                onDownloadExisting={(f) => handleDownloadAttachment(selectedEntry.id, f)}
                                onDeleteExisting={selectedEntry?.status === 'posted'
                                    ? undefined
                                    : (f) => handleDeleteAttachment(selectedEntry.id, f)}
                                disabled
                                helperText={selectedEntry?.status === 'posted'
                                    ? 'القيد المرحّل: يسمح بالتحميل فقط'
                                    : 'يمكن تحميل أو حذف المرفقات'}
                            />
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    {selectedEntry?.status === 'posted' && (
                        <Button color="error" startIcon={<CancelIcon />} onClick={() => handleReverse(selectedEntry.id)}>
                            إلغاء (قيد عكسي)
                        </Button>
                    )}
                    <Button onClick={() => setDetailOpen(false)}>إغلاق</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>إنشاء قيد يومية جديد</DialogTitle>
                <DialogContent>
                    {createError && <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>}

                    <Grid container spacing={2} sx={{ mb: 2, mt: 0.5 }}>
                        <Grid item xs={12} md={3}>
                            <TextField
                                fullWidth
                                label="التاريخ"
                                type="date"
                                value={newEntry.entry_date}
                                onChange={(e) => setNewEntry((prev) => ({ ...prev, entry_date: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12} md={5}>
                            <TextField
                                fullWidth
                                label="الوصف"
                                value={newEntry.description}
                                onChange={(e) => setNewEntry((prev) => ({ ...prev, description: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="المرجع"
                                value={newEntry.reference}
                                onChange={(e) => setNewEntry((prev) => ({ ...prev, reference: e.target.value }))}
                            />
                        </Grid>
                    </Grid>

                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>سطور القيد</Typography>

                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ width: '35%' }}><strong>الحساب</strong></TableCell>
                                    <TableCell sx={{ width: '25%' }}><strong>البيان</strong></TableCell>
                                    <TableCell sx={{ width: '15%' }} align="right"><strong>مدين</strong></TableCell>
                                    <TableCell sx={{ width: '15%' }} align="right"><strong>دائن</strong></TableCell>
                                    <TableCell sx={{ width: '10%' }} align="center" />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {newEntry.lines.map((line, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>
                                            <Autocomplete
                                                size="small"
                                                options={accounts}
                                                value={accounts.find((a) => a.id === line.account_id) || null}
                                                getOptionLabel={getAccountLabel}
                                                onChange={(_, val) => updateLine(idx, 'account_id', val?.id || '')}
                                                renderInput={(params) => <TextField {...params} placeholder="اختر الحساب" />}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                fullWidth
                                                value={line.description}
                                                onChange={(e) => updateLine(idx, 'description', e.target.value)}
                                                placeholder="بيان"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                fullWidth
                                                type="number"
                                                value={line.debit}
                                                onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                                                inputProps={{ min: 0, step: 0.01 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                fullWidth
                                                type="number"
                                                value={line.credit}
                                                onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                                                inputProps={{ min: 0, step: 0.01 }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            {newEntry.lines.length > 2 && (
                                                <IconButton size="small" color="error" onClick={() => removeLine(idx)}>
                                                    <CancelledIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}

                                <TableRow>
                                    <TableCell colSpan={2}>
                                        <Button size="small" startIcon={<AddIcon />} onClick={addLine}>إضافة سطر</Button>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography fontWeight="bold" color={isBalanced ? 'success.main' : 'error.main'}>
                                            {createTotalDebit.toFixed(2)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography fontWeight="bold" color={isBalanced ? 'success.main' : 'error.main'}>
                                            {createTotalCredit.toFixed(2)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="center">
                                        {isBalanced ?
                                            <Chip size="small" label="متوازن" color="success" /> :
                                            <Chip size="small" label="غير متوازن" color="error" />}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <FileAttachmentsField
                        title="مرفقات داعمة للقيد"
                        pendingFiles={pendingAttachmentFiles}
                        onPendingFilesChange={setPendingAttachmentFiles}
                        helperText="يمكن إرفاق PDF أو Word أو Excel أو صور. سيتم حفظها بعد إنشاء القيد."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCreateOpen(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={handleCreate} disabled={createLoading}>
                        {createLoading ? <CircularProgress size={22} /> : 'إنشاء وترحيل'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snack.open}
                autoHideDuration={4000}
                onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snack.severity} onClose={() => setSnack((prev) => ({ ...prev, open: false }))}>
                    {snack.msg}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default JournalEntries;
