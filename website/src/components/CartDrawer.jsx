import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { removeFromCart, updateQuantity, selectCartTotal } from '../store/slices/cartSlice'
import { settingsAPI } from '../services/api'
import useCurrency from '../hooks/useCurrency'

export default function CartDrawer() {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { items } = useSelector((state) => state.cart)
    const total = useSelector(selectCartTotal)
    const { formatCurrency } = useCurrency()

    // Dynamic tax rate from settings
    const [taxRate, setTaxRate] = useState(15) // Default 15%

    const fetchTaxRate = async () => {
        try {
            const res = await settingsAPI.getPublic()
            if (res.data?.data?.taxRate !== undefined) {
                setTaxRate(res.data.data.taxRate)
            }
        } catch (error) {
            console.error('Failed to fetch tax rate:', error)
        }
    }

    useEffect(() => {
        fetchTaxRate()
        // Listen for settings updates
        window.addEventListener('settingsUpdated', fetchTaxRate)
        return () => {
            document.body.classList.remove('cart-drawer-open')
            window.removeEventListener('settingsUpdated', fetchTaxRate)
        }
    }, [])

    const tax = total * (taxRate / 100)
    const grandTotal = total + tax

    const closeDrawer = () => {
        const drawer = document.querySelector('.cart-drawer')
        const overlay = document.querySelector('.cart-overlay')
        document.body.classList.remove('cart-drawer-open')
        drawer?.classList.remove('open')
        overlay?.classList.remove('open')
    }

    const handleCheckout = () => {
        closeDrawer()
        navigate('/checkout')
    }

    return (
        <>
            <div className="cart-overlay" onClick={closeDrawer}></div>
            <div className="cart-drawer">
                <div className="cart-drawer-header" style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>🛒 سلة التسوق</h2>
                    <button onClick={closeDrawer} style={{ background: 'none', border: 'none', fontSize: '1.5rem' }}>✕</button>
                </div>

                <div className="cart-drawer-body" style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                    {items.length === 0 ? (
                        <div className="cart-empty-state" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                            <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛒</p>
                            <p>السلة فارغة</p>
                            <p style={{ fontSize: '0.875rem' }}>أضف بعض العناصر اللذيذة!</p>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div key={item.menu_id} className="cart-item-row" style={{
                                display: 'flex',
                                gap: '1rem',
                                padding: '1rem 0',
                                borderBottom: '1px solid var(--border)'
                            }}>
                                <div className="cart-item-info" style={{ flex: 1 }}>
                                    <h4 style={{ margin: '0 0 0.25rem' }}>{item.name_ar}</h4>
                                    <p style={{ margin: 0, color: 'var(--primary)', fontWeight: 600 }}>
                                        {formatCurrency(item.price)}
                                    </p>
                                </div>
                                <div className="cart-item-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => dispatch(updateQuantity({ menu_id: item.menu_id, quantity: item.quantity - 1 }))}
                                        style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: 'white' }}
                                    >
                                        −
                                    </button>
                                    <span style={{ fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                                    <button
                                        onClick={() => dispatch(updateQuantity({ menu_id: item.menu_id, quantity: item.quantity + 1 }))}
                                        style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: 'white' }}
                                    >
                                        +
                                    </button>
                                    <button
                                        onClick={() => dispatch(removeFromCart(item.menu_id))}
                                        style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: 'var(--error)', marginRight: '0.5rem' }}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {items.length > 0 && (
                    <div className="cart-drawer-footer" style={{ padding: '1rem', borderTop: '2px solid var(--border)', background: '#fafafa' }}>
                        <div className="cart-summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>المجموع الفرعي</span>
                            <span>{formatCurrency(total)}</span>
                        </div>
                        <div className="cart-summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>الضريبة ({taxRate}%)</span>
                            <span>{formatCurrency(tax)}</span>
                        </div>
                        <div className="cart-summary-total" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontWeight: 700, fontSize: '1.125rem' }}>
                            <span>الإجمالي</span>
                            <span style={{ color: 'var(--primary)' }}>{formatCurrency(grandTotal)}</span>
                        </div>
                        <button className="btn btn-primary btn-full" onClick={handleCheckout}>
                            إتمام الطلب
                        </button>
                    </div>
                )}
            </div>
        </>
    )
}
