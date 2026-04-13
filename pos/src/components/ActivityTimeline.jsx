import {
    Avatar,
    Box,
    Chip,
    CircularProgress,
    Divider,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Paper,
    Stack,
    Typography
} from '@mui/material'
import {
    AdminPanelSettings,
    History,
    Inventory2,
    Login,
    PointOfSale,
    Settings,
    ShoppingBasket,
    Timeline as TimelineIcon
} from '@mui/icons-material'

const categoryMetaMap = {
    order: {
        label: 'الطلبات',
        color: 'primary',
        icon: <PointOfSale fontSize="small" />
    },
    shift: {
        label: 'الورديات',
        color: 'warning',
        icon: <History fontSize="small" />
    },
    inventory: {
        label: 'المخزون',
        color: 'success',
        icon: <Inventory2 fontSize="small" />
    },
    auth: {
        label: 'الدخول',
        color: 'secondary',
        icon: <Login fontSize="small" />
    },
    settings: {
        label: 'الإعدادات',
        color: 'info',
        icon: <Settings fontSize="small" />
    },
    purchasing: {
        label: 'المشتريات',
        color: 'success',
        icon: <ShoppingBasket fontSize="small" />
    },
    system: {
        label: 'النظام',
        color: 'default',
        icon: <AdminPanelSettings fontSize="small" />
    }
}

const routeLabelMap = [
    { match: '/api/orders', label: 'الطلبات' },
    { match: '/api/payments', label: 'المدفوعات' },
    { match: '/api/menu', label: 'الأصناف' },
    { match: '/api/categories', label: 'التصنيفات' },
    { match: '/api/settings', label: 'إعدادات النظام' },
    { match: '/api/users', label: 'المستخدمين' },
    { match: '/api/branches', label: 'الفروع' },
    { match: '/api/inventory', label: 'المخزون' },
    { match: '/api/purchases', label: 'المشتريات' },
    { match: '/api/purchase-orders', label: 'أوامر الشراء' },
    { match: '/api/suppliers', label: 'الموردين' },
    { match: '/api/transfers', label: 'تحويلات المخزون' },
    { match: '/api/shifts', label: 'الورديات' },
    { match: '/api/accounting', label: 'القيود المحاسبية' },
    { match: '/api/expenses', label: 'المصروفات' },
    { match: '/api/hr', label: 'الموارد البشرية' }
]

const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'الآن'

    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return 'الآن'

    const diffMs = Date.now() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'الآن'
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`
    if (diffHours < 24) return `منذ ${diffHours} ساعة`
    if (diffDays < 7) return `منذ ${diffDays} يوم`

    return date.toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    })
}

const formatValue = (value) => {
    if (value === null || value === undefined || value === '') return '—'
    return String(value)
}

const getRouteLabel = (route = '') => {
    const normalized = String(route || '').toLowerCase()
    const match = routeLabelMap.find((item) => normalized.startsWith(item.match))
    return match?.label || 'النظام'
}

const extractReference = (item) => {
    const metadata = item?.metadata || {}
    const newValue = item?.new_value || {}

    return metadata?.order_number ||
        newValue?.order_number ||
        newValue?.receipt_number ||
        newValue?.transfer_number ||
        metadata?.receipt_number ||
        metadata?.transfer_number ||
        metadata?.reference ||
        metadata?.reference_number ||
        metadata?.entry_number ||
        metadata?.invoice_number ||
        metadata?.po_number ||
        newValue?.entry_number ||
        newValue?.po_number ||
        newValue?.invoice_number ||
        null
}

const buildGenericSummary = (item, actor, metadata) => {
    const route = String(metadata?.route || metadata?.path || '').toLowerCase()
    const method = String(metadata?.method || '').toUpperCase()
    const resourceLabel = getRouteLabel(route)
    const reference = extractReference(item)

    if (route.startsWith('/api/purchases')) {
        return {
            title: method === 'POST' ? `${actor} سجل استلام مشتريات` : `${actor} حدّث استلام مشتريات`,
            subtitle: reference ? `المرجع: ${reference}` : 'تمت معالجة مستند استلام مشتريات'
        }
    }

    if (route.startsWith('/api/purchase-orders')) {
        return {
            title: method === 'POST' ? `${actor} أنشأ أمر شراء` : `${actor} حدّث أمر شراء`,
            subtitle: reference ? `المرجع: ${reference}` : 'تمت معالجة أمر شراء'
        }
    }

    if (route.startsWith('/api/suppliers')) {
        return {
            title: method === 'POST' ? `${actor} أضاف موردًا` : `${actor} حدّث بيانات مورد`,
            subtitle: 'إدارة الموردين'
        }
    }

    if (route.startsWith('/api/menu')) {
        return {
            title: method === 'POST' ? `${actor} أضاف صنفًا جديدًا` : `${actor} حدّث صنفًا`,
            subtitle: 'قائمة الطعام'
        }
    }

    if (route.startsWith('/api/settings')) {
        return {
            title: `${actor} حدّث إعدادات النظام`,
            subtitle: 'تم حفظ تغييرات جديدة على الإعدادات'
        }
    }

    if (route.includes('/approve')) {
        return {
            title: `${actor} وافق على عملية`,
            subtitle: reference ? `${resourceLabel} • ${reference}` : resourceLabel
        }
    }

    if (route.includes('/complete')) {
        return {
            title: `${actor} أكمل عملية`,
            subtitle: reference ? `${resourceLabel} • ${reference}` : resourceLabel
        }
    }

    if (route.includes('/cancel')) {
        return {
            title: `${actor} ألغى عملية`,
            subtitle: reference ? `${resourceLabel} • ${reference}` : resourceLabel
        }
    }

    if (route.includes('/status')) {
        return {
            title: `${actor} حدّث الحالة`,
            subtitle: reference ? `${resourceLabel} • ${reference}` : resourceLabel
        }
    }

    if (method === 'POST') {
        return {
            title: `${actor} أنشأ سجلًا جديدًا`,
            subtitle: reference ? `${resourceLabel} • ${reference}` : resourceLabel
        }
    }

    if (method === 'DELETE') {
        return {
            title: `${actor} حذف سجلًا`,
            subtitle: reference ? `${resourceLabel} • ${reference}` : resourceLabel
        }
    }

    return {
        title: `${actor} حدّث سجلًا`,
        subtitle: reference ? `${resourceLabel} • ${reference}` : resourceLabel
    }
}

const summarizeActivity = (item) => {
    const actor = item?.username || 'مستخدم النظام'
    const metadata = item?.metadata || {}
    const action = String(item?.action || '')
    const oldValue = item?.old_value || {}
    const newValue = item?.new_value || {}

    switch (action) {
    case 'order_created':
        return {
            title: `${actor} أنشأ طلبًا جديدًا`,
            subtitle: metadata?.order_number ? `رقم الطلب: ${metadata.order_number}` : 'تم تسجيل طلب جديد'
        }
    case 'order_status_changed':
        return {
            title: `${actor} غيّر حالة الطلب`,
            subtitle: metadata?.order_number
                ? `${metadata.order_number} • ${formatValue(oldValue?.status)} ← ${formatValue(newValue?.status)}`
                : `${formatValue(oldValue?.status)} ← ${formatValue(newValue?.status)}`
        }
    case 'payment_status_changed':
        return {
            title: `${actor} حدّث حالة الدفع`,
            subtitle: metadata?.order_number
                ? `${metadata.order_number} • ${formatValue(oldValue?.payment_status)} ← ${formatValue(newValue?.payment_status)}`
                : `${formatValue(oldValue?.payment_status)} ← ${formatValue(newValue?.payment_status)}`
        }
    case 'order_cancelled':
        return {
            title: `${actor} ألغى طلبًا`,
            subtitle: metadata?.order_number ? `رقم الطلب: ${metadata.order_number}` : 'تم إلغاء الطلب'
        }
    case 'shift_opened':
        return {
            title: `${actor} فتح وردية`,
            subtitle: newValue?.starting_cash !== undefined ? `نقدية البداية: ${formatValue(newValue.starting_cash)}` : 'تم فتح وردية جديدة'
        }
    case 'shift_closed':
        return {
            title: `${actor} أغلق وردية`,
            subtitle: newValue?.closing_cash !== undefined ? `نقدية الإغلاق: ${formatValue(newValue.closing_cash)}` : 'تم إغلاق الوردية'
        }
    case 'stock_adjusted':
        return {
            title: `${actor} عدّل رصيد المخزون`,
            subtitle: `${formatValue(oldValue?.quantity)} ← ${formatValue(newValue?.quantity)}`
        }
    case 'stock_received':
        return {
            title: `${actor} سجّل استلام مخزون`,
            subtitle: newValue?.receipt_number ? `رقم الاستلام: ${newValue.receipt_number}` : 'تمت إضافة مخزون جديد'
        }
    case 'stock_transferred':
        return {
            title: `${actor} نفّذ تحويل مخزون`,
            subtitle: newValue?.transfer_number ? `رقم التحويل: ${newValue.transfer_number}` : 'تم تحويل مخزون بين مستودعين'
        }
    case 'deactivate_supplier':
        return {
            title: `${actor} عطّل موردًا`,
            subtitle: 'تم تغيير حالة المورد إلى غير نشط'
        }
    case 'cancel_po':
        return {
            title: `${actor} ألغى أمر شراء`,
            subtitle: 'تم إلغاء أمر شراء من النظام'
        }
    default:
        if (action.startsWith('api_')) {
            return buildGenericSummary(item, actor, metadata)
        }

        return {
            title: `${actor} نفّذ إجراءً على النظام`,
            subtitle: action.replace(/_/g, ' ')
        }
    }
}

export default function ActivityTimeline({
    items = [],
    loading = false,
    error = '',
    title = 'سجل النشاط',
    subtitle = 'آخر التغييرات التي قام بها المستخدمون على النظام'
}) {
    return (
        <Paper sx={{ mt: 4, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 14px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc' }}>
                <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                        <TimelineIcon color="primary" />
                        <Box>
                            <Typography variant="h6" fontWeight={800}>{title}</Typography>
                            <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
                        </Box>
                    </Stack>
                    <Chip label={`${items.length} حدث`} color="primary" variant="outlined" size="small" />
                </Stack>
            </Box>

            {loading ? (
                <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress />
                </Box>
            ) : error ? (
                <Box sx={{ py: 5, px: 2.5, textAlign: 'center' }}>
                    <Typography color="error.main">{error}</Typography>
                </Box>
            ) : items.length === 0 ? (
                <Box sx={{ py: 5, px: 2.5, textAlign: 'center' }}>
                    <Typography color="text.secondary">لا توجد أحداث حديثة لعرضها حاليًا.</Typography>
                </Box>
            ) : (
                <List sx={{ py: 0 }}>
                    {items.map((item, index) => {
                        const categoryMeta = categoryMetaMap[item?.category] || categoryMetaMap.system
                        const summary = summarizeActivity(item)
                        const reference = extractReference(item)

                        return (
                            <Box key={item?.id || `${item?.timestamp}-${index}`}>
                                <ListItem alignItems="flex-start" sx={{ px: 2.5, py: 2 }}>
                                    <ListItemAvatar>
                                        <Avatar
                                            sx={{
                                                bgcolor: `${categoryMeta.color}.light`,
                                                color: `${categoryMeta.color}.dark`
                                            }}
                                        >
                                            {categoryMeta.icon}
                                        </Avatar>
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={(
                                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
                                                <Typography variant="subtitle1" fontWeight={800}>
                                                    {summary.title}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatRelativeTime(item?.timestamp)}
                                                </Typography>
                                            </Stack>
                                        )}
                                        secondary={(
                                            <Stack spacing={1} sx={{ mt: 0.75 }}>
                                                <Typography variant="body2" color="text.primary">
                                                    {summary.subtitle}
                                                </Typography>
                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                    <Chip
                                                        label={categoryMeta.label}
                                                        color={categoryMeta.color}
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                    {reference && (
                                                        <Chip
                                                            label={reference}
                                                            size="small"
                                                            variant="outlined"
                                                        />
                                                    )}
                                                </Stack>
                                            </Stack>
                                        )}
                                    />
                                </ListItem>
                                {index < items.length - 1 && <Divider component="li" />}
                            </Box>
                        )
                    })}
                </List>
            )}
        </Paper>
    )
}
