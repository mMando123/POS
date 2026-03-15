import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import Header from './components/Header'
import CartDrawer from './components/CartDrawer'
import Home from './pages/Home'
import Checkout from './pages/Checkout'
import PaymentCallback from './pages/PaymentCallback'
import TrackOrder from './pages/TrackOrder'
import { menuAPI, categoryAPI } from './services/api'
import { setMenuItems, setCategories } from './store/slices/menuSlice'
import socketService from './services/socket'

import { Toaster, toast } from 'react-hot-toast'

function App() {
    const dispatch = useDispatch()

    useEffect(() => {
        // Connect socket
        socketService.connect()

        // Listen for notifications
        const handleNotification = (e) => {
            const notification = e.detail
            toast(notification.title + '\n' + (notification.message || ''), {
                icon: notification.icon || '🔔',
                duration: 5000,
                position: 'top-center',
                style: {
                    border: '1px solid #ff9800',
                    padding: '16px',
                    color: '#333',
                    background: '#fff',
                },
            })
        }

        window.addEventListener('notification', handleNotification)

        // Fetch menu and categories
        Promise.all([
            menuAPI.getAll(),
            categoryAPI.getAll()
        ]).then(([menuRes, catRes]) => {
            dispatch(setMenuItems(menuRes.data.data || []))
            dispatch(setCategories(catRes.data.data || []))
        }).catch(err => {
            console.error('Error fetching menu:', err)
        })

        // Fetch public settings
        fetch('/api/settings/public')
            .then(res => res.json())
            .then(res => {
                const data = res.data
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
                if (data?.storeName) {
                    document.title = data.storeName
                }

                window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: data }))
            })
            .catch(err => console.error('Error fetching settings:', err))

        return () => {
            socketService.disconnect()
            window.removeEventListener('notification', handleNotification)
        }
    }, [dispatch])

    return (
        <BrowserRouter>
            <div className="app">
                <Toaster />
                <Header />
                <CartDrawer />
                <main>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/checkout" element={<Checkout />} />
                        <Route path="/payment/callback" element={<PaymentCallback />} />
                        <Route path="/track/:orderId" element={<TrackOrder />} />
                        <Route path="/track" element={<TrackOrder />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    )
}

export default App
