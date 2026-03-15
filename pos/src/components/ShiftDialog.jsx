import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Typography,
    Box,
    InputAdornment,
    Alert,
    CircularProgress,
    Tabs,
    Tab,
    Divider,
    Chip
} from '@mui/material'
import {
    LockOpen as OpenIcon,
    Lock as CloseIcon,
    Schedule as ScheduleIcon
} from '@mui/icons-material'
import toast from 'react-hot-toast'
import { shiftAPI } from '../services/api'
import { setActiveShift, setShowShiftDialog, setLoading } from '../store/slices/shiftSlice'

export default function ShiftDialog() {
    const dispatch = useDispatch()
    const { activeShift, showShiftDialog, loading } = useSelector((state) => state.shift)
    const [amount, setAmount] = useState('')
    const [notes, setNotes] = useState('')
    const [error, setError] = useState(null)
    const [summary, setSummary] = useState(null)
    const [mode, setMode] = useState('open') // 'open' or 'close'
    const [checking, setChecking] = useState(false)

    // Check for active shift when dialog opens
    useEffect(() => {
        if (showShiftDialog) {
            setAmount('')
            setNotes('')
            setError(null)
            setSummary(null)

            // If user already has an active shift, set mode to 'close'
            // and keep dialog open so they can enter ending cash
            if (activeShift) {
                setMode('close')
                setChecking(false)
                return // Don't close the dialog!
            }

            // Only check for shift if we don't have one in state
            // This handles cases where user opens dialog without active shift
            const checkActiveShift = async () => {
                setChecking(true)
                try {
                    const response = await shiftAPI.getCurrent()
                    if (response.data.data) {
                        dispatch(setActiveShift(response.data.data))
                        // Set mode to close but KEEP dialog open
                        setMode('close')
                    } else {
                        dispatch(setActiveShift(null))
                        setMode('open')
                    }
                } catch (error) {
                    // No active shift
                    dispatch(setActiveShift(null))
                    setMode('open')
                } finally {
                    setChecking(false)
                }
            }
            checkActiveShift()
        }
    }, [showShiftDialog, dispatch, activeShift])

    // Update mode based on activeShift
    useEffect(() => {
        if (activeShift) {
            setMode('close')
        } else {
            setMode('open')
        }
    }, [activeShift])

    const handleClose = () => {
        if (!loading && !checking) {
            dispatch(setShowShiftDialog(false))
        }
    }

    const handleSubmit = async () => {
        if (mode === 'open' && !amount && amount !== 0) {
            setError('الرجاء إدخال مبلغ البداية')
            return
        }
        if (mode === 'close' && (!amount && amount !== 0)) {
            setError('الرجاء إدخال المبلغ النهائي')
            return
        }

        const numAmount = parseFloat(amount)
        if (isNaN(numAmount) || numAmount < 0) {
            setError('الرجاء إدخال مبلغ صحيح')
            return
        }

        dispatch(setLoading(true))
        setError(null)

        try {
            if (mode === 'close') {
                const response = await shiftAPI.endCurrent({
                    ending_cash: numAmount,
                    notes
                })
                setSummary(response.data.data.summary)
                dispatch(setActiveShift(null))
                toast.success('تم إغلاق الوردية بنجاح')
            } else {
                const response = await shiftAPI.start({
                    starting_cash: numAmount
                })
                dispatch(setActiveShift(response.data.data))
                dispatch(setShowShiftDialog(false))
                toast.success('تم فتح الوردية بنجاح')
            }
        } catch (error) {
            console.error('Shift action error:', error)
            const errorMessage = error.response?.data?.message || 'حدث خطأ أثناء تنفيذ العملية'

            // If backend says shift already exists when trying to open
            if (errorMessage.includes('مفتوحة') && mode === 'open') {
                // Backend confirms shift exists! Try to fetch it
                try {
                    const res = await shiftAPI.getCurrent()
                    if (res.data?.data) {
                        dispatch(setActiveShift(res.data.data))
                        dispatch(setShowShiftDialog(false))
                        toast.success('تم العثور على وردية مفتوحة')
                        return
                    }
                } catch (e) {
                    console.error('Could not fetch existing shift:', e)
                }

                // If we still can't get it, show error but DON'T create ghost shift
                setError('توجد وردية مفتوحة ولكن تعذر جلب بياناتها. حاول تحديث الصفحة.')
            } else if (errorMessage.includes('لا توجد وردية') && mode === 'close') {
                setMode('open')
                dispatch(setActiveShift(null))
                toast.error('لا توجد وردية مفتوحة حالياً')
                setError(null)
            } else {
                setError(errorMessage)
            }
        } finally {
            dispatch(setLoading(false))
        }
    }

    const formatDuration = () => {
        if (!activeShift?.start_time) return ''
        const start = new Date(activeShift.start_time)
        const now = new Date()
        const diffMs = now - start
        const hours = Math.floor(diffMs / (1000 * 60 * 60))
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        return `${hours}س ${minutes}د`
    }

    // Show summary after closing
    if (summary) {
        return (
            <Dialog open={showShiftDialog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: 'success.main', color: 'white' }}>
                    ✅ تم إغلاق الوردية بنجاح
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="h6" gutterBottom>ملخص الوردية</Typography>

                        <Box sx={{ border: '1px solid #eee', borderRadius: 2, overflow: 'hidden' }}>
                            <Box sx={{ p: 1, bgcolor: '#f8f9fa', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                                <Typography variant="caption" fontWeight="bold">تفاصيل المبيعات المكتملة</Typography>
                            </Box>
                            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2">مبيعات POS:</Typography>
                                    <Typography variant="body2" fontWeight="bold">{(summary.breakdown?.pos_total || 0).toFixed(2)} ر.س</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2">مبيعات أونلاين:</Typography>
                                    <Typography variant="body2" fontWeight="bold">{(summary.breakdown?.online_total || 0).toFixed(2)} ر.س</Typography>
                                </Box>
                                <Divider sx={{ my: 0.5 }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2">دفع نقد (Cash):</Typography>
                                    <Typography variant="body2" fontWeight="bold">{(summary.breakdown?.cash_sales || 0).toFixed(2)} ر.س</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2">دفع شبكة (Card):</Typography>
                                    <Typography variant="body2" fontWeight="bold">{(summary.breakdown?.card_sales || 0).toFixed(2)} ر.س</Typography>
                                </Box>
                            </Box>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                            <Typography fontWeight="bold">الإجمالي المتوقع (كاش):</Typography>
                            <Typography fontWeight="bold">{summary.expected?.toFixed(2)} ر.س</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 2, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                            <Typography fontWeight="bold">المبلغ الفعلي (كاش):</Typography>
                            <Typography fontWeight="bold">{summary.actual?.toFixed(2)} ر.س</Typography>
                        </Box>

                        <Box sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            p: 2,
                            bgcolor: summary.difference === 0 ? '#e8f5e9' : summary.difference > 0 ? '#fff3e0' : '#ffebee',
                            borderRadius: 1,
                            border: 2,
                            borderColor: summary.difference === 0 ? 'success.main' : summary.difference > 0 ? 'warning.main' : 'error.main'
                        }}>
                            <Typography fontWeight="bold">فرق الكاش:</Typography>
                            <Typography fontWeight="bold" color={summary.difference === 0 ? 'success.main' : summary.difference > 0 ? 'warning.main' : 'error.main'}>
                                {summary.difference > 0 ? '+' : ''}{summary.difference?.toFixed(2)} ر.س
                            </Typography>
                        </Box>

                        {summary.difference !== 0 && (
                            <Alert severity={summary.difference > 0 ? 'warning' : 'error'}>
                                {summary.difference > 0
                                    ? 'تنبيه: يوجد زيادة في الصندوق'
                                    : 'تنبيه: يوجد عجز في الصندوق'}
                            </Alert>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose} variant="contained">إغلاق</Button>
                </DialogActions>
            </Dialog>
        )
    }

    return (
        <Dialog open={showShiftDialog} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{
                bgcolor: mode === 'close' ? 'error.main' : 'primary.main',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: 1
            }}>
                {mode === 'close' ? <CloseIcon /> : <OpenIcon />}
                {mode === 'close' ? 'إغلاق الوردية' : 'فتح وردية جديدة'}
            </DialogTitle>
            <DialogContent>
                {checking ? (
                    <Box sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
                        <CircularProgress size={24} />
                        <Typography>جاري التحقق من الوردية...</Typography>
                    </Box>
                ) : (
                    <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {error && <Alert severity="error">{error}</Alert>}

                        {/* Mode Tabs */}
                        <Tabs
                            value={mode}
                            onChange={(e, v) => { setMode(v); setError(null); setAmount('') }}
                            variant="fullWidth"
                            sx={{ mb: 1 }}
                        >
                            <Tab
                                value="open"
                                label="فتح وردية"
                                icon={<OpenIcon />}
                                iconPosition="start"
                                disabled={!!activeShift}
                            />
                            <Tab
                                value="close"
                                label="إغلاق الوردية"
                                icon={<CloseIcon />}
                                iconPosition="start"
                                disabled={!activeShift}
                            />
                        </Tabs>

                        <Divider />

                        {mode === 'close' && activeShift && (
                            <Box sx={{ bgcolor: 'warning.lighter', p: 2, borderRadius: 2, mb: 1 }}>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                    معلومات الوردية الحالية
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    <Chip
                                        icon={<ScheduleIcon />}
                                        label={`المدة: ${formatDuration()}`}
                                        variant="outlined"
                                        size="small"
                                    />
                                    <Chip
                                        label={`مبلغ البداية: ${activeShift.starting_cash} ر.س`}
                                        variant="outlined"
                                        size="small"
                                        color="primary"
                                    />
                                </Box>
                            </Box>
                        )}

                        <Typography gutterBottom>
                            {mode === 'close'
                                ? 'أدخل المبلغ الموجود في الصندوق حالياً لإغلاق الوردية:'
                                : 'أدخل مبلغ بداية الوردية (العهدة):'}
                        </Typography>

                        <TextField
                            autoFocus
                            label={mode === 'close' ? "المبلغ الفعلي (المعدود)" : "مبلغ البداية"}
                            type="number"
                            fullWidth
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            InputProps={{
                                endAdornment: <InputAdornment position="end">ر.س</InputAdornment>,
                            }}
                            sx={{ mt: 1 }}
                        />

                        {mode === 'close' && (
                            <TextField
                                label="ملاحظات (اختياري)"
                                multiline
                                rows={2}
                                fullWidth
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="أي ملاحظات حول الوردية..."
                            />
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={handleClose} disabled={loading || checking}>إلغاء</Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    color={mode === 'close' ? 'error' : 'primary'}
                    disabled={loading || checking}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : (mode === 'close' ? <CloseIcon /> : <OpenIcon />)}
                >
                    {loading ? 'جاري التنفيذ...' : (mode === 'close' ? 'إغلاق الوردية' : 'فتح الوردية')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
