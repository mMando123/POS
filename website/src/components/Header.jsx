import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectCartItemCount } from '../store/slices/cartSlice'
import { settingsAPI } from '../services/api'

export default function Header() {
    const cartCount = useSelector(selectCartItemCount)
    const [storeInfo, setStoreInfo] = useState({ storeName: 'مطعمنا', logo: null })

    const fetchSettings = async () => {
        try {
            const res = await settingsAPI.getPublic()
            if (res.data?.data) {
                setStoreInfo({
                    storeName: res.data.data.storeName || 'مطعمنا',
                    logo: res.data.data.logo
                })
            }
        } catch (error) {
            console.error('Failed to load settings:', error)
        }
    }

    useEffect(() => {
        fetchSettings()
        window.addEventListener('settingsUpdated', fetchSettings)
        return () => window.removeEventListener('settingsUpdated', fetchSettings)
    }, [])

    return (
        <header className="header">
            <div className="container header-content">
                <Link to="/" className="logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {storeInfo.logo ? (
                        <img
                            src={storeInfo.logo.startsWith('http') ? storeInfo.logo : `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${storeInfo.logo}`}
                            alt="Logo"
                            style={{ height: '32px', width: '32px', objectFit: 'contain' }}
                            onError={(e) => { e.target.style.display = 'none' }}
                        />
                    ) : (
                        <span>🍽️</span>
                    )}
                    {storeInfo.storeName}
                </Link>

                <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <Link to="/" style={{ fontWeight: 500 }}>القائمة</Link>
                    <Link to="/track" style={{ fontWeight: 500 }}>تتبع طلبك</Link>

                    <button
                        className="cart-icon"
                        onClick={() => {
                            const drawer = document.querySelector('.cart-drawer')
                            const overlay = document.querySelector('.cart-overlay')
                            drawer?.classList.add('open')
                            overlay?.classList.add('open')
                        }}
                        style={{ background: 'none', border: 'none', fontSize: '1.5rem' }}
                    >
                        🛒
                        {cartCount > 0 && (
                            <span className="cart-badge">{cartCount}</span>
                        )}
                    </button>
                </nav>
            </div>
        </header>
    )
}
