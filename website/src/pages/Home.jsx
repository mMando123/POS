
import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { addToCart } from '../store/slices/cartSlice'
import ProductDetailsModal from '../components/ProductDetailsModal'
import toast from 'react-hot-toast'
import useCurrency from '../hooks/useCurrency'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function Home() {
    const dispatch = useDispatch()
    const { items: menuItems, categories, loading } = useSelector((state) => state.menu)
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [selectedProduct, setSelectedProduct] = useState(null)
    const { formatCurrency } = useCurrency()

    const filteredItems = selectedCategory === 'all'
        ? menuItems
        : menuItems.filter(item => item.category_id === selectedCategory)

    const handleAddToCart = (item) => {
        dispatch(addToCart({
            menu_id: item.id,
            name_ar: item.name_ar,
            price: parseFloat(item.price),
        }))
        toast.success(`تمت إضافة ${item.name_ar} للسلة`)
    }

    return (
        <div>
            {/* Hero Section */}
            <section className="hero">
                <div className="container">
                    <h1 className="hero-title" style={{ animation: 'fadeIn 0.8s ease-out' }}>مرحباً بك في مطعمنا</h1>
                    <p className="hero-subtitle" style={{ fontSize: '1.25rem', opacity: 0.9, animation: 'slideUp 0.8s ease-out' }}>اكتشف أشهى المأكولات واطلب الآن</p>
                </div>
            </section>

            {/* Menu Section */}
            <section className="section">
                <div className="container">
                    <h2 className="section-title">قائمة الطعام</h2>

                    {/* Categories */}
                    <div className="category-row" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
                        <button
                            className={`btn ${selectedCategory === 'all' ? 'btn-primary' : 'btn-outline'} btn-sm`}
                            onClick={() => setSelectedCategory('all')}
                            style={{ borderRadius: '2rem' }}
                        >
                            الكل
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                className={`btn ${selectedCategory === cat.id ? 'btn-primary' : 'btn-outline'} btn-sm`}
                                onClick={() => setSelectedCategory(cat.id)}
                                style={{ borderRadius: '2rem' }}
                            >
                                {cat.name_ar}
                            </button>
                        ))}
                    </div>

                    {/* Menu Grid */}
                    {loading ? (
                        <div className="grid grid-3">
                            {[1, 2, 3, 4, 5, 6].map((n) => (
                                <div key={n} className="skeleton-card">
                                    <div className="skeleton skeleton-img"></div>
                                    <div className="skeleton-content">
                                        <div className="skeleton skeleton-title"></div>
                                        <div className="skeleton skeleton-text" style={{ width: '80%' }}></div>
                                        <div className="skeleton skeleton-text" style={{ width: '60%' }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                            <p>لا توجد عناصر في هذا التصنيف</p>
                        </div>
                    ) : (
                        <div className="grid grid-3">
                            {filteredItems.map((item) => (
                                <div
                                    key={item.id}
                                    className="menu-item"
                                    onClick={() => setSelectedProduct(item)}
                                >
                                    {item.image_url ? (
                                        <img
                                            src={item.image_url.startsWith('/') ? `${API_URL}${item.image_url}` : item.image_url}
                                            alt={item.name_ar}
                                            className="menu-item-image"
                                        />
                                    ) : (
                                        <div className="menu-item-image" style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '3rem',
                                            background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)'
                                        }}>
                                            🍽️
                                        </div>
                                    )}
                                    <div className="menu-item-content">
                                        <h3 className="menu-item-name">{item.name_ar}</h3>
                                        <p className="menu-item-description">
                                            {item.description_ar || 'وصف شهي لهذا الطبق الرائع...'}
                                        </p>

                                        <div className="menu-item-footer">
                                            <span className="menu-item-price">{formatCurrency(parseFloat(item.price))}</span>
                                            <button
                                                className="menu-item-add-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAddToCart(item);
                                                }}
                                                aria-label="أضف للسلة"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Footer */}
            <footer style={{ background: 'var(--secondary)', color: 'white', padding: '4rem 0', marginTop: '4rem' }}>
                <div className="container" style={{ textAlign: 'center' }}>
                    <p style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>🍽️ مطعمنا</p>
                    <p style={{ fontSize: '0.875rem', opacity: 0.6 }}>جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
                </div>
            </footer>

            {/* Product Details Modal */}
            <ProductDetailsModal
                product={selectedProduct}
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
            />
        </div>
    )
}
