import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || ''

const statusLabels = {
    pending: '⏳ انتظار موافقة',
    approved: '✅ تم القبول',
    new: '🆕 جديد',
    confirmed: '✔️ مؤكد',
    preparing: '👨‍🍳 قيد التحضير',
    ready: '🔔 جاهز للكاشير',
}

const orderTypeLabels = {
    online: '🌐 أونلاين',
    walkin: '🚶 حضوري',
    dine_in: '🍽️ صالة',
    takeaway: '📦 تيك أواي',
    delivery: '🚗 توصيل',
}

export default function App() {
    const [orders, setOrders] = useState([])
    const [connected, setConnected] = useState(false)
    const [audioEnabled, setAudioEnabled] = useState(true)
    const socketRef = useRef(null)
    const audioContextRef = useRef(null)

    const [storeName, setStoreName] = useState('شاشة المطبخ (KDS)')

    useEffect(() => {
        // Fetch initial orders & Settings
        fetchOrders()
        fetchSettings()

        // Connect to socket
        const socket = io(SOCKET_URL, {
            auth: { token: localStorage.getItem('token') },
            transports: ['websocket', 'polling'],
        })

        socketRef.current = socket

        socket.on('connect', () => {
            console.log('🔌 Connected to server')
            setConnected(true)
            socket.emit('join:kds')
        })

        socket.on('disconnect', () => {
            console.log('❌ Disconnected from server')
            setConnected(false)
        })

        // Listen for settings update
        socket.on('settings:updated', (newSettings) => {
            if (newSettings.store?.storeName) {
                setStoreName(newSettings.store.storeName + ' (KDS)')
            }
        })

        socket.on('order:new', (order) => {
            console.log('📦 New order:', order)
            setOrders(prev => {
                // Avoid duplicates
                if (prev.find(o => o.id === order.id)) return prev
                return [order, ...prev]
            })
            playNotificationSound()
        })

        // Listen for new notification system
        socket.on('notification:new', (notification) => {
            console.log('🔔 Notification:', notification)
            if (notification.type === 'order_new' || notification.type === 'order_approved') {
                playNotificationSound()
            }
        })

        socket.on('order:updated', (data) => {
            console.log('📝 Order updated:', data)
            setOrders(prev => prev.map(order =>
                order.id === data.orderId
                    ? { ...order, status: data.status, ...(data.order || {}) }
                    : order
            ).filter(order =>
                // Kitchen doesn't see: handed_to_cashier, completed, cancelled
                !['handed_to_cashier', 'completed', 'cancelled'].includes(order.status)
            ))
        })

        socket.on('order:removed', (data) => {
            console.log('🗑️ Order removed:', data)
            setOrders(prev => prev.filter(order => order.id !== data.orderId))
        })

        socket.on('order:cancelled', (data) => {
            console.log('❌ Order cancelled:', data)
            setOrders(prev => prev.filter(order => order.id !== data.orderId))
        })

        return () => {
            socket.disconnect()
        }
    }, [])

    const fetchSettings = async () => {
        try {
            const res = await axios.get(`${API_URL}/settings/public`)
            const data = res.data?.data
            if (data?.storeName) {
                setStoreName(data.storeName + ' (KDS)')
                document.title = data.storeName + ' - KDS'
            }
            if (data?.logo) {
                let link = document.querySelector("link[rel~='icon']")
                if (!link) {
                    link = document.createElement('link')
                    link.rel = 'icon'
                    document.getElementsByTagName('head')[0].appendChild(link)
                }
                const logoPath = data.logo.startsWith('/') ? data.logo : `/${data.logo}`
                link.href = logoPath
            }
        } catch (error) {
            console.error('Error fetching settings:', error)
        }
    }

    const fetchOrders = async () => {
        try {
            // Use KDS-specific endpoint
            const response = await axios.get(`${API_URL}/orders/kds/active`)
            setOrders(response.data.data || [])
        } catch (error) {
            console.error('Error fetching orders:', error)
            // Fallback to general orders
            try {
                const response = await axios.get(`${API_URL}/orders`, { params: { limit: 50 } })
                const activeOrders = (response.data.data || []).filter(o =>
                    ['approved', 'new', 'confirmed', 'preparing'].includes(o.status)
                )
                setOrders(activeOrders)
            } catch (e) {
                console.error('Fallback fetch failed:', e)
            }
        }
    }

    const updateOrderStatus = async (orderId, newStatus) => {
        try {
            await axios.put(`${API_URL}/orders/${orderId}/status`,
                { status: newStatus },
                { headers: { 'Content-Type': 'application/json' } }
            )

            // Update local state
            if (newStatus === 'ready') {
                // Keep in list but update status
                setOrders(prev => prev.map(order =>
                    order.id === orderId ? { ...order, status: newStatus } : order
                ))
            } else {
                setOrders(prev => prev.map(order =>
                    order.id === orderId ? { ...order, status: newStatus } : order
                ).filter(order =>
                    !['handed_to_cashier', 'completed', 'cancelled'].includes(order.status)
                ))
            }
        } catch (error) {
            console.error('Error updating order:', error)
            alert(error.response?.data?.message || 'حدث خطأ')
        }
    }

    const handoffToCashier = async (orderId) => {
        try {
            await axios.post(`${API_URL}/orders/${orderId}/handoff`)
            // Remove from KDS
            setOrders(prev => prev.filter(order => order.id !== orderId))
        } catch (error) {
            console.error('Error handing off order:', error)
            alert(error.response?.data?.message || 'حدث خطأ')
        }
    }

    const playNotificationSound = () => {
        if (!audioEnabled) return

        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
            }

            const ctx = audioContextRef.current
            const oscillator = ctx.createOscillator()
            const gainNode = ctx.createGain()

            oscillator.connect(gainNode)
            gainNode.connect(ctx.destination)

            oscillator.frequency.value = 800
            oscillator.type = 'sine'
            gainNode.gain.value = 0.5

            oscillator.start()

            setTimeout(() => {
                oscillator.frequency.value = 1000
            }, 150)

            setTimeout(() => {
                oscillator.stop()
            }, 300)
        } catch (e) {
            console.log('Could not play notification sound')
        }
    }

    const getTimeSinceOrder = (createdAt) => {
        const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000 / 60)
        if (diff < 1) return 'الآن'
        if (diff < 60) return `${diff} دقيقة`
        return `${Math.floor(diff / 60)}:${diff % 60} ساعة`
    }

    const isUrgent = (createdAt) => {
        const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000 / 60)
        return diff > 20
    }

    const isVeryOld = (createdAt) => {
        const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000 / 60)
        return diff > 60  // طلب عالق أكثر من ساعة — خطر
    }

    const stats = {
        new: orders.filter(o => ['new', 'confirmed', 'approved'].includes(o.status)).length,
        preparing: orders.filter(o => o.status === 'preparing').length,
        ready: orders.filter(o => o.status === 'ready').length,
        stale: orders.filter(o => isVeryOld(o.created_at)).length,  // DEF-002: طلبات عالقة > ساعة
    }

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <h1>🍳 {storeName}</h1>

                <div className="header-stats">
                    <div className="stat">
                        <div className="stat-value" style={{ color: 'var(--new)' }}>{stats.new}</div>
                        <div className="stat-label">جديد</div>
                    </div>
                    <div className="stat">
                        <div className="stat-value" style={{ color: 'var(--preparing)' }}>{stats.preparing}</div>
                        <div className="stat-label">قيد التحضير</div>
                    </div>
                    <div className="stat">
                        <div className="stat-value" style={{ color: 'var(--ready)' }}>{stats.ready}</div>
                        <div className="stat-label">جاهز للكاشير</div>
                    </div>
                    {stats.stale > 0 && (
                        <div className="stat" style={{ background: 'rgba(220,38,38,0.15)', borderRadius: '8px', padding: '4px 8px' }}>
                            <div className="stat-value" style={{ color: '#dc2626' }}>⚠️ {stats.stale}</div>
                            <div className="stat-label" style={{ color: '#dc2626' }}>عالق &gt;ساعة</div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        className={`audio-toggle ${!audioEnabled ? 'muted' : ''}`}
                        onClick={() => setAudioEnabled(!audioEnabled)}
                    >
                        {audioEnabled ? '🔔' : '🔕'}
                    </button>

                    <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                        <span className="connection-dot"></span>
                        <span>{connected ? 'متصل' : 'غير متصل'}</span>
                    </div>
                </div>
            </header>

            {/* Orders Grid */}
            <div className="orders-container">
                {orders.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">✨</div>
                        <h2>لا توجد طلبات نشطة</h2>
                        <p>ستظهر الطلبات الجديدة هنا تلقائياً</p>
                    </div>
                ) : (
                    orders
                        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                        .map((order) => (
                            <div key={order.id} className={`order-card status-${order.status}`} style={isVeryOld(order.created_at) ? { borderColor: '#dc2626', borderWidth: '3px' } : {}}>
                                {isVeryOld(order.created_at) && (
                                    <div style={{ background: '#dc2626', color: '#fff', textAlign: 'center', padding: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        🚨 طلب عالق منذ أكثر من ساعة — يحتاج تدخل فوري
                                    </div>
                                )}
                                <div className="order-header">
                                    <div>
                                        <div className="order-number">#{order.order_number}</div>
                                        <div className="order-type">{orderTypeLabels[order.order_type]}</div>
                                    </div>
                                    <div style={{ textAlign: 'left' }}>
                                        <span className={`status-badge ${order.status}`}>
                                            {statusLabels[order.status]}
                                        </span>
                                        <div className={`order-time ${isUrgent(order.created_at) ? 'urgent' : ''}`}>
                                            ⏱️ {getTimeSinceOrder(order.created_at)}
                                        </div>
                                    </div>
                                </div>

                                <div className="order-items">
                                    {order.items?.map((item, index) => (
                                        <div key={index} className="order-item">
                                            <span className="item-quantity">{item.quantity}</span>
                                            <div>
                                                <div className="item-name">{item.item_name_ar}</div>
                                                {item.notes && (
                                                    <div className="item-notes">📝 {item.notes}</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {order.notes && (
                                    <div style={{ padding: '0 1rem 1rem', fontSize: '0.875rem', color: 'var(--warning)' }}>
                                        💬 {order.notes}
                                    </div>
                                )}

                                <div className="order-footer">
                                    {/* New/Approved orders - Start preparing */}
                                    {['new', 'confirmed', 'approved'].includes(order.status) && (
                                        <button
                                            className="btn btn-preparing"
                                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                                        >
                                            بدء التحضير 👨‍🍳
                                        </button>
                                    )}

                                    {/* Preparing - Mark as ready */}
                                    {order.status === 'preparing' && (
                                        <button
                                            className="btn btn-ready"
                                            onClick={() => updateOrderStatus(order.id, 'ready')}
                                        >
                                            جاهز للتسليم ✅
                                        </button>
                                    )}

                                    {/* Ready - Hand off to cashier */}
                                    {order.status === 'ready' && (
                                        <button
                                            className="btn btn-complete"
                                            onClick={() => handoffToCashier(order.id)}
                                        >
                                            تسليم للكاشير 📤
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                )}
            </div>
        </div>
    )
}

