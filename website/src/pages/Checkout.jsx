import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { clearCart, selectCartTotal } from '../store/slices/cartSlice'
import { orderAPI, paymentAPI, settingsAPI } from '../services/api'
import useCurrency from '../hooks/useCurrency'

export default function Checkout() {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { items } = useSelector((state) => state.cart)
    const total = useSelector(selectCartTotal)
    const { formatCurrency } = useCurrency()

    // Dynamic tax rate from settings
    const [taxRate, setTaxRate] = useState(15)
    const [onlineOrdersEnabled, setOnlineOrdersEnabled] = useState(true)

    useEffect(() => {
        const fetchTaxRate = async () => {
            try {
                const res = await settingsAPI.getPublic()
                const publicSettings = res.data?.data || {}
                if (publicSettings.taxRate !== undefined) {
                    setTaxRate(publicSettings.taxRate)
                }
                setOnlineOrdersEnabled(publicSettings.enableOnlineOrders !== false)
            } catch (error) {
                console.error('Failed to fetch tax rate:', error)
            }
        }
        fetchTaxRate()
    }, [])

    const tax = total * (taxRate / 100)
    const grandTotal = total + tax

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        address: '',
        notes: '',
    })
    const [loading, setLoading] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState('cash')

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!onlineOrdersEnabled) {
            toast.error('الطلبات الأونلاين غير متاحة حالياً')
            return
        }

        if (!formData.phone) {
            toast.error('رقم الهاتف مطلوب')
            return
        }

        if (items.length === 0) {
            toast.error('السلة فارغة')
            return
        }

        console.log('Submitting order with payment method:', paymentMethod) // Debug log

        setLoading(true)


        try {
            // Create order
            const orderData = {
                order_type: 'online',
                payment_method: paymentMethod === 'card' ? 'online' : paymentMethod,
                customer_phone: formData.phone,
                customer_name: formData.name,
                customer_address: formData.address,
                notes: formData.notes,
                items: items.map(item => ({
                    menu_id: item.menu_id,
                    quantity: item.quantity,
                })),
            }

            const response = await orderAPI.create(orderData)
            const order = response.data.data

            // Handle payment
            if (paymentMethod === 'card') {
                try {
                    toast('جاري تحضير بوابة الدفع...', { icon: '💳' })

                    // Initiate payment
                    const paymentResponse = await paymentAPI.initiate(order.id, grandTotal)
                    console.log('Payment initiated:', paymentResponse.data)

                    // Handle response structure
                    const responseData = paymentResponse.data.data || paymentResponse.data
                    const { paymentUrl } = responseData || {}

                    if (paymentUrl) {
                        // Redirect to payment gateway
                        window.location.href = paymentUrl
                        // Return explicitly to prevent navigating to tracking page
                        return
                    } else {
                        console.error('No paymentUrl in response:', responseData)
                        toast.error('لم يتم استلام رابط الدفع. يرجى مراجعة الإدارة.')
                        setLoading(false)
                        return // Stop here
                    }
                } catch (payError) {
                    console.error('Payment Error:', payError)
                    toast.error('فشل الاتصال ببوابة الدفع. حاول مرة أخرى.')
                    setLoading(false)
                    return // Stop here
                }
            }

            // ONLY reached for Cash on Delivery
            toast.success('تم إنشاء طلبك بنجاح!')
            dispatch(clearCart())

            // Redirect to order tracking
            navigate(`/track/${order.id}`)
        } catch (error) {
            console.error('Submit Error:', error)
            toast.error(error.response?.data?.message || 'فشل إنشاء الطلب')
        } finally {
            // Only stop loading if we didn't redirect (Cash or Error cases)
            if (paymentMethod !== 'card') {
                setLoading(false)
            }
        }
    }

    if (items.length === 0) {
        return (
            <div className="container section" style={{ textAlign: 'center' }}>
                <h1 style={{ marginBottom: '1rem' }}>السلة فارغة</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    أضف بعض العناصر من القائمة للمتابعة
                </p>
                <button className="btn btn-primary" onClick={() => navigate('/')}>
                    تصفح القائمة
                </button>
            </div>
        )
    }

    if (!onlineOrdersEnabled) {
        return (
            <div className="container section" style={{ textAlign: 'center' }}>
                <h1 style={{ marginBottom: '1rem' }}>الطلبات الأونلاين غير متاحة</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    تم تعطيل الطلب عبر الموقع من إعدادات النظام مؤقتًا.
                </p>
                <button className="btn btn-primary" onClick={() => navigate('/')}>
                    العودة للقائمة
                </button>
            </div>
        )
    }

    return (
        <div className="container section">
            <h1 className="checkout-title" style={{ marginBottom: '2rem' }}>إتمام الطلب</h1>

            <div className="checkout-layout">
                {/* Form */}
                <div className="card checkout-card" style={{ padding: '1.5rem' }}>
                    <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>معلومات التوصيل</h2>

                    <form id="checkout-form" onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                الاسم
                            </label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className="input"
                                placeholder="اسمك الكريم"
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                رقم الهاتف *
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                className="input"
                                placeholder="05xxxxxxxx"
                                required
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                عنوان التوصيل
                            </label>
                            <textarea
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                className="input"
                                placeholder="العنوان بالتفصيل"
                                rows={3}
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                ملاحظات
                            </label>
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                className="input"
                                placeholder="أي ملاحظات خاصة بالطلب..."
                                rows={2}
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                طريقة الدفع
                            </label>
                            <div className="checkout-payment-options">
                                <label
                                    className={`checkout-payment-option ${paymentMethod === 'cash' ? 'active' : ''}`}
                                    style={{
                                        border: `2px solid ${paymentMethod === 'cash' ? 'var(--primary)' : 'var(--border)'}`
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="payment"
                                        value="cash"
                                        checked={paymentMethod === 'cash'}
                                        onChange={() => setPaymentMethod('cash')}
                                    />
                                    💵 الدفع عند الاستلام
                                </label>
                                <label
                                    className={`checkout-payment-option ${paymentMethod === 'card' ? 'active' : ''}`}
                                    style={{
                                        border: `2px solid ${paymentMethod === 'card' ? 'var(--primary)' : 'var(--border)'}`
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="payment"
                                        value="card"
                                        checked={paymentMethod === 'card'}
                                        onChange={() => setPaymentMethod('card')}
                                    />
                                    💳 بطاقة ائتمان
                                </label>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg btn-full"
                            disabled={loading}
                        >
                            {loading ? 'جاري إرسال الطلب...' : 'تأكيد الطلب'}
                        </button>
                    </form>
                </div>

                {/* Order Summary */}
                <div className="card checkout-card checkout-summary" style={{ padding: '1.5rem', alignSelf: 'start' }}>
                    <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>ملخص الطلب</h2>

                    {items.map((item) => (
                        <div key={item.menu_id} className="checkout-summary-item" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '0.75rem 0',
                            borderBottom: '1px solid var(--border)'
                        }}>
                            <span>{item.name_ar} × {item.quantity}</span>
                            <span style={{ fontWeight: 600 }}>{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                    ))}

                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid var(--border)' }}>
                        <div className="checkout-summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>المجموع الفرعي</span>
                            <span>{formatCurrency(total)}</span>
                        </div>
                        <div className="checkout-summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>الضريبة ({taxRate}%)</span>
                            <span>{formatCurrency(tax)}</span>
                        </div>
                        <div className="checkout-summary-total" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '1.25rem', fontWeight: 700 }}>
                            <span>الإجمالي</span>
                            <span style={{ color: 'var(--primary)' }}>{formatCurrency(grandTotal)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="checkout-mobile-bar">
                <div className="checkout-mobile-total">
                    <span>Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</span>
                    <strong>{formatCurrency(grandTotal)}</strong>
                </div>
                <button
                    type="submit"
                    form="checkout-form"
                    className="btn btn-primary checkout-mobile-submit"
                    disabled={loading}
                >
                    {loading ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¥Ø±Ø³Ø§Ù„...' : 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø·Ù„Ø¨'}
                </button>
            </div>
        </div>
    )
}
