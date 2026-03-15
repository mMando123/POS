import { io } from 'socket.io-client'
import { store } from '../store'
import { addOrder, updateOrderStatus } from '../store/slices/orderSlice'
import { addMenuItem, updateMenuItem, removeMenuItem } from '../store/slices/menuSlice'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || ''

class SocketService {
    socket = null
    notificationSound = null

    connect() {
        if (this.socket) {
            return this.socket
        }

        const token = localStorage.getItem('token')

        this.socket = io(SOCKET_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
        })

        this.socket.on('connect', () => {
            console.log('🔌 Socket connected')

            // Join POS scope rooms
            let user = null
            try {
                user = JSON.parse(localStorage.getItem('user') || '{}')
            } catch (_) {
                user = null
            }

            const branchId = user?.branch_id || user?.branchId || null
            if (branchId) {
                this.socket.emit('join:branch', branchId)
            }

            const role = user?.role || null
            if (role) {
                this.socket.emit('join:role', role)
                if (role === 'cashier') {
                    this.socket.emit('join:cashier')
                }
            }
        })

        this.socket.on('disconnect', () => {
            console.log('❌ Socket disconnected')
        })

        // Listen for new orders
        this.socket.on('order:new', (order) => {
            console.log('📦 New order:', order)
            store.dispatch(addOrder(order))
            this.playNotificationSound()
        })

        // Listen for order updates
        this.socket.on('order:updated', (data) => {
            console.log('📝 Order updated:', data)
            store.dispatch(updateOrderStatus(data))
        })

        // Listen for menu updates
        this.socket.on('menu:updated', (data) => {
            console.log('🍽️ Menu updated:', data)
            switch (data.action) {
                case 'created':
                    store.dispatch(addMenuItem(data.item))
                    break
                case 'updated':
                    store.dispatch(updateMenuItem(data.item))
                    break
                case 'deleted':
                    store.dispatch(removeMenuItem(data.itemId))
                    break
            }
        })

        // Listen for payment confirmations
        this.socket.on('payment:confirmed', (data) => {
            console.log('💳 Payment confirmed:', data)
        })

        return this.socket
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect()
            this.socket = null
        }
    }

    emit(event, data) {
        if (this.socket) {
            this.socket.emit(event, data)
        }
    }

    playNotificationSound() {
        try {
            if (!this.notificationSound) {
                // Create a simple beep sound
                const audioContext = new (window.AudioContext || window.webkitAudioContext)()
                const oscillator = audioContext.createOscillator()
                const gainNode = audioContext.createGain()

                oscillator.connect(gainNode)
                gainNode.connect(audioContext.destination)

                oscillator.frequency.value = 800
                oscillator.type = 'sine'
                gainNode.gain.value = 0.3

                oscillator.start()
                setTimeout(() => {
                    oscillator.stop()
                }, 200)
            }
        } catch (e) {
            console.log('Could not play notification sound')
        }
    }
    getSocket() {
        if (!this.socket) {
            this.connect()
        }
        return this.socket
    }
}

export const socketService = new SocketService()
export default socketService
