import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import socketService from './socket'
import toast from 'react-hot-toast'

// This component doesn't render anything, it just manages socket listeners
export const SocketManager = () => {
    const dispatch = useDispatch()

    useEffect(() => {
        const socket = socketService.connect()

        socket.on('connect', () => {
            console.log('✅ Connected to realtime server')
        })

        // Listen for PENDING orders (Online orders waiting for approval)
        socket.on('order:pending', (order) => {
            console.log('🔔 New Pending Order:', order)
            toast('طلب أونلاين جديد #' + order.order_number, {
                icon: '🌍',
                duration: 6000,
                style: {
                    border: '1px solid #4caf50',
                    padding: '16px',
                    color: '#713200',
                },
            })
        })

        // Listen for new orders (Approved/POS)
        socket.on('order:new', (order) => {
            toast('طلب جديد #' + order.order_number, {
                icon: '🔔',
                duration: 4000
            })
        })

        // Listen for status updates (Waiter/Cashier)
        socket.on('order:update', (updatedOrder) => {
            toast(`تم تحديث الطلب #${updatedOrder.order_number}: ${getStatusText(updatedOrder.status)}`, {
                icon: 'ℹ️'
            })
        })

        // Listen for shift alerts
        socket.on('shift:alert', (data) => {
            toast.error(data.message)
        })

        // Listen for Global Settings Updates
        socket.on('settings:updated', () => {
            console.log('🔄 Global Settings Updated')
            window.dispatchEvent(new Event('settingsUpdated'))
            toast.success('تم تحديث إعدادات النظام')
        })

        return () => {
            socketService.disconnect()
        }
    }, [dispatch])

    return null
}

const getStatusText = (status) => {
    const statuses = {
        pending: 'قيد الانتظار',
        preparing: 'جار التحضير',
        ready: 'جاهز',
        completed: 'مكتمل',
        cancelled: 'ملغي'
    }
    return statuses[status] || status
}
