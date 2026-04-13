import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import api, { authAPI } from './api'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || ''

const statusLabels = {
    pending: 'انتظار موافقة',
    approved: 'تم القبول',
    new: 'جديد',
    confirmed: 'مؤكد',
    preparing: 'قيد التحضير',
    ready: 'جاهز للكاشير',
}

const orderTypeLabels = {
    online: 'أونلاين',
    walkin: 'حضوري',
    dine_in: 'صالة',
    takeaway: 'تيك أواي',
    delivery: 'توصيل',
}

const getStoredToken = () => {
    try {
        return localStorage.getItem('token') || ''
    } catch (_) {
        return ''
    }
}

export default function App() {
    const [orders, setOrders] = useState([])
    const [connected, setConnected] = useState(false)
    const [audioEnabled, setAudioEnabled] = useState(true)
    const [storeName, setStoreName] = useState('شاشة المطبخ (KDS)')
    const [authToken, setAuthToken] = useState(getStoredToken())
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [authLoading, setAuthLoading] = useState(false)
    const [authError, setAuthError] = useState('')

    const socketRef = useRef(null)
    const audioContextRef = useRef(null)

    const resetSessionState = (message = '') => {
        setOrders([])
        setConnected(false)
        setAuthToken('')
        setPassword('')
        if (message) setAuthError(message)
    }

    const fetchSettings = async () => {
        try {
            const res = await api.get('/settings/public')
            const data = res.data?.data
            if (data?.storeName) {
                setStoreName(`${data.storeName} (KDS)`)
                document.title = `${data.storeName} - KDS`
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
            const response = await api.get('/orders/kds/active')
            setOrders(response.data.data || [])
        } catch (error) {
            console.error('Error fetching KDS orders:', error)
            setOrders([])
        }
    }

    const handleUnauthorized = (error, fallbackMessage) => {
        if (error?.response?.status !== 401) return false
        resetSessionState(error.response?.data?.message || fallbackMessage)
        return true
    }

    const updateOrderStatus = async (orderId, newStatus) => {
        try {
            await api.put(`/orders/${orderId}/status`, { status: newStatus })

            setOrders((prev) => prev
                .map((order) => (
                    order.id === orderId
                        ? { ...order, status: newStatus }
                        : order
                ))
                .filter((order) => !['handed_to_cashier', 'completed', 'cancelled'].includes(order.status))
            )
        } catch (error) {
            console.error('Error updating order:', error)
            if (handleUnauthorized(error, 'انتهت الجلسة، يرجى تسجيل الدخول')) return
            alert(error.response?.data?.message || 'حدث خطأ')
        }
    }

    const handoffToCashier = async (orderId) => {
        try {
            await api.post(`/orders/${orderId}/handoff`)
            setOrders((prev) => prev.filter((order) => order.id !== orderId))
        } catch (error) {
            console.error('Error handing off order:', error)
            if (handleUnauthorized(error, 'انتهت الجلسة، يرجى تسجيل الدخول')) return
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
        } catch (_) {
            console.log('Could not play notification sound')
        }
    }

    useEffect(() => {
        const authRequiredHandler = (event) => {
            resetSessionState(event?.detail?.message || 'يرجى تسجيل الدخول إلى شاشة المطبخ')
        }

        window.addEventListener('kds:auth-required', authRequiredHandler)
        return () => window.removeEventListener('kds:auth-required', authRequiredHandler)
    }, [])

    useEffect(() => {
        if (!authToken) {
            setConnected(false)
            setOrders([])
            return undefined
        }

        setAuthError('')
        fetchOrders()
        fetchSettings()

        const socket = io(SOCKET_URL, {
            auth: { token: authToken },
            transports: ['websocket', 'polling'],
        })

        socketRef.current = socket

        socket.on('connect', () => {
            setConnected(true)
            socket.emit('join:kds')
        })

        socket.on('disconnect', () => {
            setConnected(false)
        })

        socket.on('settings:updated', (newSettings) => {
            if (newSettings.store?.storeName) {
                setStoreName(`${newSettings.store.storeName} (KDS)`)
            }
            if (typeof newSettings.hardware?.enableKitchenDisplay === 'boolean') {
                fetchOrders()
            }
        })

        socket.on('order:new', (order) => {
            setOrders((prev) => {
                if (prev.find((item) => item.id === order.id)) return prev
                return [order, ...prev]
            })
            playNotificationSound()
        })

        socket.on('notification:new', (notification) => {
            if (notification.type === 'order_new' || notification.type === 'order_approved') {
                playNotificationSound()
            }
        })

        socket.on('order:updated', (data) => {
            setOrders((prev) => prev
                .map((order) => (
                    order.id === data.orderId
                        ? { ...order, status: data.status, ...(data.order || {}) }
                        : order
                ))
                .filter((order) => !['handed_to_cashier', 'completed', 'cancelled'].includes(order.status))
            )
        })

        socket.on('order:removed', (data) => {
            setOrders((prev) => prev.filter((order) => order.id !== data.orderId))
        })

        socket.on('order:cancelled', (data) => {
            setOrders((prev) => prev.filter((order) => order.id !== data.orderId))
        })

        return () => {
            socket.disconnect()
        }
    }, [authToken, audioEnabled])

    const handleLogin = async (event) => {
        event.preventDefault()
        setAuthLoading(true)
        setAuthError('')

        try {
            const response = await authAPI.login(username, password)
            const token = response.data.accessToken || response.data.token || getStoredToken()
            setAuthToken(token)
            setPassword('')
        } catch (error) {
            setAuthError(error.response?.data?.message || 'فشل تسجيل الدخول')
        } finally {
            setAuthLoading(false)
        }
    }

    const handleLogout = async () => {
        await authAPI.logout()
        resetSessionState('تم تسجيل الخروج من شاشة المطبخ')
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
        return diff > 60
    }

    const stats = useMemo(() => ({
        new: orders.filter((order) => ['new', 'confirmed', 'approved'].includes(order.status)).length,
        preparing: orders.filter((order) => order.status === 'preparing').length,
        ready: orders.filter((order) => order.status === 'ready').length,
        stale: orders.filter((order) => isVeryOld(order.created_at)).length,
    }), [orders])

    if (!authToken) {
        return (
            <div className="auth-screen">
                <div className="auth-card">
                    <div className="auth-badge">KDS</div>
                    <h1>تسجيل دخول شاشة المطبخ</h1>
                    <p>سجل الدخول بحساب لديه صلاحية المطبخ أو معالجة الطلبات.</p>

                    {authError && <div className="auth-error">{authError}</div>}

                    <form className="auth-form" onSubmit={handleLogin}>
                        <input
                            className="auth-input"
                            type="text"
                            placeholder="اسم المستخدم"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoFocus
                            required
                        />
                        <input
                            className="auth-input"
                            type="password"
                            placeholder="كلمة المرور"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                        />
                        <button className="auth-submit" type="submit" disabled={authLoading}>
                            {authLoading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="app">
            <header className="header">
                <h1>{storeName}</h1>

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
                        <div className="stat stat-alert">
                            <div className="stat-value" style={{ color: '#dc2626' }}>⚠ {stats.stale}</div>
                            <div className="stat-label" style={{ color: '#dc2626' }}>عالق أكثر من ساعة</div>
                        </div>
                    )}
                </div>

                <div className="header-actions">
                    <button
                        className={`audio-toggle ${!audioEnabled ? 'muted' : ''}`}
                        onClick={() => setAudioEnabled((prev) => !prev)}
                    >
                        {audioEnabled ? '🔔' : '🔕'}
                    </button>

                    <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                        <span className="connection-dot"></span>
                        <span>{connected ? 'متصل' : 'غير متصل'}</span>
                    </div>

                    <button className="header-button" onClick={handleLogout}>
                        تسجيل الخروج
                    </button>
                </div>
            </header>

            <div className="orders-container">
                {orders.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">✨</div>
                        <h2>لا توجد طلبات نشطة</h2>
                        <p>ستظهر الطلبات الجديدة هنا تلقائيًا</p>
                    </div>
                ) : (
                    orders
                        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                        .map((order) => (
                            <div
                                key={order.id}
                                className={`order-card status-${order.status}`}
                                style={isVeryOld(order.created_at) ? { borderColor: '#dc2626', borderWidth: '3px' } : {}}
                            >
                                {isVeryOld(order.created_at) && (
                                    <div className="order-alert-banner">
                                        طلب عالق منذ أكثر من ساعة ويحتاج تدخلًا فوريًا
                                    </div>
                                )}

                                <div className="order-header">
                                    <div>
                                        <div className="order-number">#{order.order_number}</div>
                                        <div className="order-type">{orderTypeLabels[order.order_type] || order.order_type}</div>
                                    </div>
                                    <div style={{ textAlign: 'left' }}>
                                        <span className={`status-badge ${order.status}`}>
                                            {statusLabels[order.status] || order.status}
                                        </span>
                                        <div className={`order-time ${isUrgent(order.created_at) ? 'urgent' : ''}`}>
                                            ⏱ {getTimeSinceOrder(order.created_at)}
                                        </div>
                                    </div>
                                </div>

                                <div className="order-items">
                                    {order.items?.map((item, index) => (
                                        <div key={`${order.id}-${index}`} className="order-item">
                                            <span className="item-quantity">{item.quantity}</span>
                                            <div>
                                                <div className="item-name">{item.item_name_ar}</div>
                                                {item.notes && <div className="item-notes">📝 {item.notes}</div>}
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
                                    {['new', 'confirmed', 'approved'].includes(order.status) && (
                                        <button
                                            className="btn btn-preparing"
                                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                                        >
                                            بدء التحضير
                                        </button>
                                    )}

                                    {order.status === 'preparing' && (
                                        <button
                                            className="btn btn-ready"
                                            onClick={() => updateOrderStatus(order.id, 'ready')}
                                        >
                                            جاهز للتسليم
                                        </button>
                                    )}

                                    {order.status === 'ready' && (
                                        <button
                                            className="btn btn-complete"
                                            onClick={() => handoffToCashier(order.id)}
                                        >
                                            تسليم للكاشير
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
