import { io } from 'socket.io-client'
import { store } from '../store'
import { updateOrderStatus } from '../store/slices/orderSlice'
import { updateMenuItem } from '../store/slices/menuSlice'

// When behind ngrok/proxy, connect to same origin so Vite proxy forwards to backend
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (
    typeof window !== 'undefined' && !window.location.hostname.includes('localhost')
        ? window.location.origin  // ngrok or remote: use same origin (Vite proxies /socket.io)
        : 'http://localhost:3001' // local dev: connect directly to backend
)

class SocketService {
    socket = null

    connect() {
        this.socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            extraHeaders: {
                'ngrok-skip-browser-warning': 'true'
            }
        })

        this.socket.on('connect', () => {
            console.log('🔌 Connected to server')
        })

        this.socket.on('order:updated', (data) => {
            store.dispatch(updateOrderStatus(data))
        })

        this.socket.on('order:status:changed', (data) => {
            store.dispatch(updateOrderStatus(data))
        })

        this.socket.on('order:completed', (data) => {
            const order = data?.order
            if (!order?.id) return
            store.dispatch(updateOrderStatus({
                orderId: order.id,
                status: order.status || 'completed'
            }))
        })

        this.socket.on('menu:updated', (data) => {
            if (data.action === 'updated') {
                store.dispatch(updateMenuItem(data.item))
            }
        })

        this.socket.on('settings:updated', () => {
            window.dispatchEvent(new Event('settingsUpdated'))
        })

        // Listen for notifications (customer order updates)
        this.socket.on('notification:new', (notification) => {
            console.log('🔔 Notification:', notification)
            // Dispatch event for components to handle
            window.dispatchEvent(new CustomEvent('notification', { detail: notification }))
        })

        return this.socket
    }

    joinOrderRoom(orderId) {
        if (this.socket) {
            this.socket.emit('join:order', orderId)
        }
    }

    leaveOrderRoom(orderId) {
        if (this.socket) {
            this.socket.emit('leave:order', orderId)
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect()
            this.socket = null
        }
    }
}

export const socketService = new SocketService()
export default socketService
