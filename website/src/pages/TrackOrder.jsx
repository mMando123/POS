import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { orderAPI } from '../services/api'
import { setTrackingOrder } from '../store/slices/orderSlice'
import socketService from '../services/socket'
import useCurrency from '../hooks/useCurrency'

const statusConfig = {
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

export default function TrackOrder() {
    const { orderId } = useParams()
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const { trackingOrder } = useSelector((state) => state.order)
    const [inputOrderId, setInputOrderId] = useState('')
    const [loading, setLoading] = useState(false)
    const { formatCurrency } = useCurrency()

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

    const fetchOrder = async (id) => {
        setLoading(true)
        try {
            const response = await orderAPI.track(id)
            dispatch(setTrackingOrder(response.data.data))
        } catch (error) {
            toast.error('\u0627\u0644\u0637\u0644\u0628 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f', { id: 'track-order-not-found' })
            dispatch(setTrackingOrder(null))
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
            <div className="container section" style={{ maxWidth: 500, textAlign: 'center' }}>
                <h1 style={{ marginBottom: '1rem' }}>تتبع طلبك</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    أدخل رقم الطلب لتتبع حالته
                </p>

                <form onSubmit={handleTrack} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        type="text"
                        value={inputOrderId}
                        onChange={(e) => setInputOrderId(e.target.value)}
                        className="input"
                        placeholder="رقم الطلب"
                        style={{ flex: 1 }}
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
        return (
            <div className="container section" style={{ textAlign: 'center' }}>
                <h1 style={{ marginBottom: '1rem' }}>الطلب غير موجود</h1>
                <button className="btn btn-primary" onClick={() => navigate('/track')}>
                    البحث عن طلب آخر
                </button>
            </div>
        )
    }

    const currentStatus = statusConfig[trackingOrder.status] || statusConfig.new
    // For online orders: pending -> approved -> preparing -> ready -> handed_to_cashier -> completed
    const steps = ['pending', 'approved', 'preparing', 'ready', 'handed_to_cashier', 'completed']

    return (
        <div className="container section" style={{ maxWidth: 700 }}>
            <div className="card" style={{ padding: '2rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <span style={{ fontSize: '4rem' }}>{currentStatus.icon}</span>
                    <h1 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                        طلب #{trackingOrder.order_number}
                    </h1>
                    <span
                        className="badge"
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

                {/* Progress Steps */}
                {trackingOrder.status !== 'cancelled' && (
                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                            {/* Line */}
                            <div style={{
                                position: 'absolute',
                                top: '20px',
                                left: '40px',
                                right: '40px',
                                height: '4px',
                                background: 'var(--border)',
                                zIndex: 0
                            }}>
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
                                    <div key={step} style={{ textAlign: 'center', zIndex: 1 }}>
                                        <div style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: '50%',
                                            background: isActive ? 'var(--primary)' : 'white',
                                            border: `3px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            margin: '0 auto 0.5rem',
                                            color: isActive ? 'white' : 'var(--text-secondary)',
                                            fontWeight: 'bold'
                                        }}>
                                            {isActive ? '✓' : index + 1}
                                        </div>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            color: isActive ? 'var(--text)' : 'var(--text-secondary)'
                                        }}>
                                            {config.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Order Details */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>تفاصيل الطلب</h3>

                    {trackingOrder.items?.map((item, index) => (
                        <div key={index} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '0.5rem 0',
                            borderBottom: '1px solid var(--border)'
                        }}>
                            <span>{item.item_name_ar} × {item.quantity}</span>
                            <span style={{ fontWeight: 600 }}>{formatCurrency(parseFloat(item.total_price))}</span>
                        </div>
                    ))}

                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                        <span>الإجمالي</span>
                        <span style={{ color: 'var(--primary)' }}>{formatCurrency(parseFloat(trackingOrder.total))}</span>
                    </div>
                </div>

                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <button className="btn btn-outline" onClick={() => navigate('/')}>
                        طلب جديد
                    </button>
                </div>
            </div>
        </div>
    )
}
