import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { orderAPI, settingsAPI } from '../services/api'
import { setTrackingOrder } from '../store/slices/orderSlice'
import socketService from '../services/socket'
import useCurrency from '../hooks/useCurrency'

const baseStatusConfig = {
    pending: { label: 'في انتظار القبول', color: '#f97316', icon: '⏳', step: 0 },
    approved: { label: 'تم القبول', color: '#8b5cf6', icon: '✅', step: 1 },
    new: { label: 'جديد', color: '#3b82f6', icon: '📝', step: 1 },
    confirmed: { label: 'تم التأكيد', color: '#8b5cf6', icon: '✅', step: 1 },
    preparing: { label: 'قيد التحضير', color: '#f59e0b', icon: '👨‍🍳', step: 2 },
    ready: { label: 'جاهز للاستلام', color: '#22c55e', icon: '🍽️', step: 3 },
    handed_to_cashier: { label: 'عند الكاشير', color: '#06b6d4', icon: '💳', step: 4 },
    completed: { label: 'مكتمل', color: '#6b7280', icon: '🎉', step: 5 },
    cancelled: { label: 'ملغي', color: '#ef4444', icon: '❌', step: -1 },
}

const buildTrackingView = ({ enableKitchenDisplay, printKitchenReceipt }) => {
    const statusConfig = {
        ...baseStatusConfig,
        approved: enableKitchenDisplay
            ? baseStatusConfig.approved
            : {
                ...baseStatusConfig.approved,
                label: printKitchenReceipt ? 'تم القبول والطباعة' : 'تم القبول'
            },
        preparing: enableKitchenDisplay
            ? baseStatusConfig.preparing
            : {
                ...baseStatusConfig.preparing,
                label: 'قيد التجهيز'
            },
        ready: enableKitchenDisplay
            ? baseStatusConfig.ready
            : {
                ...baseStatusConfig.ready,
                label: 'جاهز'
            }
    }

    const steps = ['pending', 'approved', 'preparing', 'ready', 'handed_to_cashier', 'completed']

    const approvedNote = enableKitchenDisplay
        ? 'تمت الموافقة على طلبك وإرساله إلى شاشة المطبخ للمتابعة.'
        : (printKitchenReceipt
            ? 'تمت الموافقة على طلبك وتمت طباعة أمر المطبخ ورقيًا. سيتم تحديث الحالة يدويًا أثناء التجهيز.'
            : 'تمت الموافقة على طلبك. سيتم تحديث حالته يدويًا من شاشة الطلبات.')

    return { statusConfig, steps, approvedNote }
}

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

export default function TrackOrder() {
    const { orderId } = useParams()
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const { trackingOrder } = useSelector((state) => state.order)
    const [inputOrderId, setInputOrderId] = useState('')
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState(null) // null | not_found | temporary
    const [displayMode, setDisplayMode] = useState({
        enableKitchenDisplay: true,
        printKitchenReceipt: true
    })
    const { formatCurrency } = useCurrency()

    useEffect(() => {
        fetchPublicSettings()
    }, [])

    useEffect(() => {
        if (orderId) {
            fetchOrder(orderId)
        }
    }, [orderId])

    useEffect(() => {
        const roomId = trackingOrder?.id
        if (!roomId) return

        socketService.joinOrderRoom(roomId)
        return () => {
            socketService.leaveOrderRoom(roomId)
        }
    }, [trackingOrder?.id])

    const fetchPublicSettings = async () => {
        try {
            const response = await settingsAPI.getPublic()
            const data = response.data?.data || {}
            setDisplayMode({
                enableKitchenDisplay: data.enableKitchenDisplay === true,
                printKitchenReceipt: data.printKitchenReceipt !== false
            })
        } catch (error) {
            console.error('Error fetching public settings:', error)
        }
    }

    const fetchOrder = async (id) => {
        setLoading(true)
        setLoadError(null)
        dispatch(setTrackingOrder(null))

        let lastError = null

        try {
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    const response = await orderAPI.track(id)
                    dispatch(setTrackingOrder(response.data.data))
                    setLoadError(null)
                    return
                } catch (error) {
                    lastError = error

                    if (error.response?.status === 404) {
                        setLoadError('not_found')
                        toast.error('الطلب غير موجود', { id: 'track-order-not-found' })
                        return
                    }

                    if (attempt < 2) {
                        await delay(900 * (attempt + 1))
                        continue
                    }
                }
            }

            console.error('Track order fetch failed:', lastError)
            setLoadError('temporary')
            toast.error('تعذر تحميل حالة الطلب الآن، حاول مرة أخرى بعد لحظات', {
                id: 'track-order-temporary'
            })
        } finally {
            setLoading(false)
        }
    }

    const handleTrack = (e) => {
        e.preventDefault()
        if (inputOrderId.trim()) {
            navigate(`/track/${inputOrderId.trim()}`)
        }
    }

    if (!orderId) {
        return (
            <div className="container section track-search-page">
                <h1 style={{ marginBottom: '1rem' }}>تتبع طلبك</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    أدخل رقم الطلب لتتبع حالته
                </p>

                <form onSubmit={handleTrack} className="track-search-form">
                    <input
                        type="text"
                        value={inputOrderId}
                        onChange={(e) => setInputOrderId(e.target.value)}
                        className="input"
                        placeholder="رقم الطلب"
                    />
                    <button type="submit" className="btn btn-primary">
                        تتبع
                    </button>
                </form>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="container section" style={{ textAlign: 'center' }}>
                <p>جاري التحميل...</p>
            </div>
        )
    }

    if (!trackingOrder) {
        if (loadError === 'temporary') {
            return (
                <div className="container section" style={{ textAlign: 'center' }}>
                    <h1 style={{ marginBottom: '1rem' }}>تعذر تحميل حالة الطلب</h1>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                        قد تكون هناك مشكلة اتصال مؤقتة أو تأخر لحظي في مزامنة الطلب. حاول مرة أخرى.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => fetchOrder(orderId)}>
                            إعادة المحاولة
                        </button>
                        <button className="btn btn-outline" onClick={() => navigate('/track')}>
                            البحث عن طلب آخر
                        </button>
                    </div>
                </div>
            )
        }

        return (
            <div className="container section" style={{ textAlign: 'center' }}>
                <h1 style={{ marginBottom: '1rem' }}>الطلب غير موجود</h1>
                <button className="btn btn-primary" onClick={() => navigate('/track')}>
                    البحث عن طلب آخر
                </button>
            </div>
        )
    }

    const { statusConfig, steps, approvedNote } = buildTrackingView(displayMode)
    const currentStatus = statusConfig[trackingOrder.status] || statusConfig.new

    return (
        <div className="container section track-page">
            <div className="card track-card" style={{ padding: '2rem' }}>
                <div className="track-status-header">
                    <span className="track-status-icon">{currentStatus.icon}</span>
                    <h1 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                        طلب #{trackingOrder.order_number}
                    </h1>
                    <span
                        className="badge track-status-badge"
                        style={{
                            background: `${currentStatus.color}20`,
                            color: currentStatus.color,
                            fontSize: '1rem',
                            padding: '0.5rem 1rem'
                        }}
                    >
                        {currentStatus.label}
                    </span>
                </div>

                {trackingOrder.status === 'approved' && (
                    <div className="track-approved-note" style={{
                        marginBottom: '1.5rem',
                        padding: '0.85rem 1rem',
                        borderRadius: '12px',
                        background: '#fff7ed',
                        color: '#9a3412',
                        border: '1px solid #fdba74',
                        textAlign: 'center',
                        lineHeight: 1.7
                    }}>
                        {approvedNote}
                    </div>
                )}

                {trackingOrder.status !== 'cancelled' && (
                    <div className="track-progress-wrap">
                        <div className="track-progress">
                            <div className="track-progress-line">
                                <div style={{
                                    height: '100%',
                                    background: 'var(--primary)',
                                    width: `${(currentStatus.step / (steps.length - 1)) * 100}%`,
                                    transition: 'width 0.5s'
                                }} />
                            </div>

                            {steps.map((step, index) => {
                                const config = statusConfig[step]
                                const isActive = currentStatus.step >= index
                                return (
                                    <div key={step} className="track-step">
                                        <div
                                            className={`track-step-circle ${isActive ? 'active' : ''}`}
                                            style={{
                                                borderColor: isActive ? 'var(--primary)' : 'var(--border)'
                                            }}
                                        >
                                            {isActive ? '✓' : index + 1}
                                        </div>
                                        <span className={`track-step-label ${isActive ? 'active' : ''}`}>
                                            {config.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div className="track-details">
                    <h3 style={{ marginBottom: '1rem' }}>تفاصيل الطلب</h3>

                    {trackingOrder.items?.map((item, index) => (
                        <div key={index} className="track-item-row">
                            <span>{item.item_name_ar} × {item.quantity}</span>
                            <span className="track-item-price">{formatCurrency(parseFloat(item.total_price))}</span>
                        </div>
                    ))}

                    <div className="track-total-row">
                        <span>الإجمالي</span>
                        <span style={{ color: 'var(--primary)' }}>{formatCurrency(parseFloat(trackingOrder.total))}</span>
                    </div>
                </div>

                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <button className="btn btn-outline track-cta-button" onClick={() => navigate('/')}>
                        طلب جديد
                    </button>
                </div>
            </div>
        </div>
    )
}
