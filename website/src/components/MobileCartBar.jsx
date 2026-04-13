import { useNavigate, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectCartItemCount, selectCartTotal } from '../store/slices/cartSlice'
import useCurrency from '../hooks/useCurrency'

export default function MobileCartBar() {
    const navigate = useNavigate()
    const location = useLocation()
    const cartCount = useSelector(selectCartItemCount)
    const cartTotal = useSelector(selectCartTotal)
    const { formatCurrency } = useCurrency()

    if (cartCount <= 0 || location.pathname !== '/') {
        return null
    }

    const openDrawer = () => {
        const drawer = document.querySelector('.cart-drawer')
        const overlay = document.querySelector('.cart-overlay')
        document.body.classList.add('cart-drawer-open')
        drawer?.classList.add('open')
        overlay?.classList.add('open')
    }

    return (
        <div className="mobile-cart-bar">
            <button
                type="button"
                className="mobile-cart-bar-main"
                onClick={() => navigate('/checkout')}
            >
                <span className="mobile-cart-bar-count">{cartCount} عناصر</span>
                <span className="mobile-cart-bar-total">{formatCurrency(cartTotal)}</span>
            </button>

            <button
                type="button"
                className="mobile-cart-bar-action"
                onClick={openDrawer}
                aria-label="فتح السلة"
            >
                السلة
            </button>
        </div>
    )
}
