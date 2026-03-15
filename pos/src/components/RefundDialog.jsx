import { useEffect, useState } from 'react'
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    CircularProgress,
    Typography,
    Box,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Checkbox,
    IconButton
} from '@mui/material'
import {
    Undo as RefundIcon,
    Warning as WarningIcon,
    Add as AddIcon,
    Remove as RemoveIcon
} from '@mui/icons-material'
import { useSelector } from 'react-redux'
import { refundAPI, settingsAPI } from '../services/api'
import { useThemeConfig } from '../contexts/ThemeContext'

/**
 * RefundDialog Component
 * Professional refund dialog for POS/Admin with full/partial/void options
 */
export default function RefundDialog({ open, onClose, order, onRefundComplete }) {
    const { formatCurrency } = useThemeConfig()
    const { user } = useSelector((state) => state.auth || {})
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(false)
    const [operationRules, setOperationRules] = useState({
        allowCancelWithoutReason: false,
        requireManagerForVoid: true
    })

    // Refund configuration
    const [refundType, setRefundType] = useState('FULL_REFUND')
    const [refundReason, setRefundReason] = useState('')
    const [refundCategory, setRefundCategory] = useState('customer_request')

    // For partial refunds
    const [selectedItems, setSelectedItems] = useState([])

    const resetForm = () => {
        setRefundType('FULL_REFUND')
        setRefundReason('')
        setRefundCategory('customer_request')
        setSelectedItems([])
        setError(null)
        setSuccess(false)
    }

    const handleClose = () => {
        resetForm()
        onClose()
    }

    useEffect(() => {
        if (!open) return
        const loadOperationRules = async () => {
            try {
                const response = await settingsAPI.getPublic()
                const data = response.data?.data || {}
                setOperationRules({
                    allowCancelWithoutReason: data.allowCancelWithoutReason === true,
                    requireManagerForVoid: data.requireManagerForVoid !== false
                })
            } catch (settingsError) {
                console.error('Failed to load refund operation rules:', settingsError)
            }
        }
        loadOperationRules()
    }, [open])

    const isManagerRole = ['admin', 'manager'].includes(String(user?.role || '').toLowerCase())
    const canVoidByStatus = order && ['new', 'pending', 'approved', 'confirmed'].includes(order.status)
    const voidRestrictedByPolicy = canVoidByStatus && operationRules.requireManagerForVoid && !isManagerRole
    const canVoid = canVoidByStatus && !voidRestrictedByPolicy
    const reasonRequired = refundType !== 'VOID' || !operationRules.allowCancelWithoutReason

    // Initialize selected items for partial refund
    const initializePartialItems = () => {
        if (order?.items) {
            setSelectedItems(order.items.map(item => ({
                order_item_id: item.id,
                menu_id: item.menu_id,
                name: item.item_name_ar || item.Menu?.name_ar,
                max_quantity: item.quantity,
                selected_quantity: 0,
                unit_price: item.price,
                selected: false
            })))
        }
    }

    const handleRefundTypeChange = (type) => {
        if (type === 'VOID' && voidRestrictedByPolicy) {
            setError('إلغاء الطلب (VOID) يتطلب صلاحية مدير حسب قواعد العمل')
            return
        }
        setRefundType(type)
        setError(null)
        if (type === 'PARTIAL_REFUND') {
            initializePartialItems()
        }
    }

    const toggleItemSelection = (index) => {
        const updated = [...selectedItems]
        updated[index].selected = !updated[index].selected
        if (updated[index].selected && updated[index].selected_quantity === 0) {
            updated[index].selected_quantity = 1
        }
        setSelectedItems(updated)
    }

    const updateItemQuantity = (index, delta) => {
        const updated = [...selectedItems]
        const newQty = updated[index].selected_quantity + delta
        if (newQty >= 0 && newQty <= updated[index].max_quantity) {
            updated[index].selected_quantity = newQty
            updated[index].selected = newQty > 0
        }
        setSelectedItems(updated)
    }

    const calculatePartialTotal = () => {
        return selectedItems
            .filter(i => i.selected && i.selected_quantity > 0)
            .reduce((sum, i) => sum + (i.unit_price * i.selected_quantity), 0)
    }

    const handleSubmit = async () => {
        if (reasonRequired && !refundReason.trim()) {
            setError('سبب الاسترداد مطلوب')
            return
        }

        setLoading(true)
        setError(null)

        try {
            let response

            if (refundType === 'VOID') {
                const payload = { order_id: order.id }
                if (refundReason.trim()) {
                    payload.refund_reason = refundReason.trim()
                }
                response = await refundAPI.voidOrder(payload)
            } else if (refundType === 'FULL_REFUND') {
                response = await refundAPI.createFull({
                    order_id: order.id,
                    refund_reason: refundReason.trim(),
                    refund_category: refundCategory
                })
            } else if (refundType === 'PARTIAL_REFUND') {
                const items = selectedItems
                    .filter(i => i.selected && i.selected_quantity > 0)
                    .map(i => ({
                        order_item_id: i.order_item_id,
                        quantity: i.selected_quantity
                    }))

                if (items.length === 0) {
                    setError('يجب اختيار عنصر واحد على الأقل')
                    setLoading(false)
                    return
                }

                response = await refundAPI.createPartial({
                    order_id: order.id,
                    refund_reason: refundReason.trim(),
                    refund_category: refundCategory,
                    items
                })
            }

            setSuccess(true)
            setTimeout(() => {
                handleClose()
                if (onRefundComplete) {
                    onRefundComplete(response.data.data)
                }
            }, 1500)

        } catch (err) {
            console.error('Refund failed:', err)
            setError(err.response?.data?.message || 'فشل في عملية الاسترداد')
        } finally {
            setLoading(false)
        }
    }

    // const formatCurrency = (amount) => {
    //    return new Intl.NumberFormat('ar-SA', {
    //        style: 'currency',
    //        currency: 'SAR'
    //    }).format(amount)
    // }

    if (!order) return null

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'error.light', color: 'error.contrastText' }}>
                <RefundIcon />
                استرداد الطلب #{order.order_number}
            </DialogTitle>
            <DialogContent sx={{ mt: 2 }}>
                {success ? (
                    <Alert severity="success" sx={{ my: 2 }}>
                        تم الاسترداد بنجاح! جاري إغلاق النافذة...
                    </Alert>
                ) : (
                    <>
                        {/* Order Summary */}
                        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                    <Typography variant="subtitle2" color="text.secondary">الطلب الأصلي</Typography>
                                    <Typography variant="h6">{order.order_number}</Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                    <Typography variant="subtitle2" color="text.secondary">إجمالي الطلب</Typography>
                                    <Typography variant="h5" color="primary">{formatCurrency(order.total)}</Typography>
                                </Box>
                            </Box>
                        </Paper>

                        {error && (
                            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                        )}

                        {voidRestrictedByPolicy && (
                            <Alert severity="info" sx={{ mb: 2 }}>
                                إلغاء الطلب (VOID) يتطلب صلاحية مدير حسب قواعد العمل الحالية.
                            </Alert>
                        )}

                        {/* Refund Type Selection */}
                        <Typography variant="subtitle1" sx={{ mb: 1 }}>نوع الاسترداد</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                            {canVoid && (
                                <Chip
                                    label="إلغاء (قبل التحضير)"
                                    onClick={() => handleRefundTypeChange('VOID')}
                                    color={refundType === 'VOID' ? 'default' : 'default'}
                                    variant={refundType === 'VOID' ? 'filled' : 'outlined'}
                                />
                            )}
                            <Chip
                                label="استرداد كامل"
                                onClick={() => handleRefundTypeChange('FULL_REFUND')}
                                color={refundType === 'FULL_REFUND' ? 'error' : 'default'}
                                variant={refundType === 'FULL_REFUND' ? 'filled' : 'outlined'}
                            />
                            <Chip
                                label="استرداد جزئي"
                                onClick={() => handleRefundTypeChange('PARTIAL_REFUND')}
                                color={refundType === 'PARTIAL_REFUND' ? 'warning' : 'default'}
                                variant={refundType === 'PARTIAL_REFUND' ? 'filled' : 'outlined'}
                            />
                        </Box>

                        {/* Partial Refund Items Selection */}
                        {refundType === 'PARTIAL_REFUND' && (
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="subtitle1" sx={{ mb: 1 }}>اختر العناصر المراد إرجاعها</Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell padding="checkbox"></TableCell>
                                                <TableCell>المنتج</TableCell>
                                                <TableCell align="center">الكمية الأصلية</TableCell>
                                                <TableCell align="center">كمية الإرجاع</TableCell>
                                                <TableCell align="right">الإجمالي</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {selectedItems.map((item, index) => (
                                                <TableRow key={item.order_item_id}>
                                                    <TableCell padding="checkbox">
                                                        <Checkbox
                                                            checked={item.selected}
                                                            onChange={() => toggleItemSelection(index)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>{item.name}</TableCell>
                                                    <TableCell align="center">{item.max_quantity}</TableCell>
                                                    <TableCell align="center">
                                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => updateItemQuantity(index, -1)}
                                                                disabled={item.selected_quantity <= 0}
                                                            >
                                                                <RemoveIcon />
                                                            </IconButton>
                                                            <Typography sx={{ mx: 1, minWidth: 20, textAlign: 'center' }}>
                                                                {item.selected_quantity}
                                                            </Typography>
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => updateItemQuantity(index, 1)}
                                                                disabled={item.selected_quantity >= item.max_quantity}
                                                            >
                                                                <AddIcon />
                                                            </IconButton>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        {formatCurrency(item.unit_price * item.selected_quantity)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                <Box sx={{ mt: 1, textAlign: 'right' }}>
                                    <Typography variant="h6" color="error">
                                        إجمالي الإرجاع: {formatCurrency(calculatePartialTotal())}
                                    </Typography>
                                </Box>
                            </Box>
                        )}

                        {/* Refund Category */}
                        {refundType !== 'VOID' && (
                            <FormControl fullWidth sx={{ mb: 2 }}>
                                <InputLabel>تصنيف السبب</InputLabel>
                                <Select
                                    value={refundCategory}
                                    onChange={(e) => setRefundCategory(e.target.value)}
                                    label="تصنيف السبب"
                                >
                                    <MenuItem value="customer_request">طلب العميل</MenuItem>
                                    <MenuItem value="quality_issue">مشكلة في الجودة</MenuItem>
                                    <MenuItem value="wrong_order">طلب خاطئ</MenuItem>
                                    <MenuItem value="delivery_issue">مشكلة في التوصيل</MenuItem>
                                    <MenuItem value="payment_issue">مشكلة في الدفع</MenuItem>
                                    <MenuItem value="duplicate_order">طلب مكرر</MenuItem>
                                    <MenuItem value="system_error">خطأ في النظام</MenuItem>
                                    <MenuItem value="other">أخرى</MenuItem>
                                </Select>
                            </FormControl>
                        )}

                        {/* Refund Reason */}
                        <TextField
                            label={reasonRequired ? 'سبب الاسترداد (مطلوب)' : 'سبب الاسترداد (اختياري)'}
                            multiline
                            rows={3}
                            fullWidth
                            value={refundReason}
                            onChange={(e) => setRefundReason(e.target.value)}
                            placeholder="اكتب سبب الاسترداد بالتفصيل..."
                            required={reasonRequired}
                            error={reasonRequired && !refundReason.trim() && !!error}
                        />

                        {/* Warning */}
                        <Alert severity="warning" icon={<WarningIcon />} sx={{ mt: 2 }}>
                            <Typography variant="subtitle2">تنبيه مهم</Typography>
                            <Typography variant="body2">
                                • سيتم خصم المبلغ من إيرادات اليوم والكاشير
                                <br />
                                • سيتم إرجاع المنتجات للمخزون
                                <br />
                                • لا يمكن التراجع عن هذا الإجراء
                            </Typography>
                        </Alert>
                    </>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={handleClose} disabled={loading}>
                    إلغاء
                </Button>
                {!success && (
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleSubmit}
                        disabled={loading || (reasonRequired && !refundReason.trim())}
                        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <RefundIcon />}
                    >
                        {loading ? 'جاري المعالجة...' : 'تأكيد الاسترداد'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}
