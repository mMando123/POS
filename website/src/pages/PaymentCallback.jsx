import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { paymentAPI } from '../services/api'

export default function PaymentCallback() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [status, setStatus] = useState('processing') // processing, success, error
    const [message, setMessage] = useState('جاري التحقق من عملية الدفع...')
    const hasProcessedRef = useRef(false)

    useEffect(() => {
        if (hasProcessedRef.current) return
        hasProcessedRef.current = true

        const params = Object.fromEntries(searchParams.entries())
        console.log('Payment Callback Params:', params)

        const success = searchParams.get('success')
        const merchantOrderId = searchParams.get('merchant_order_id')

        const navigateToOrder = (delayMs = 1500) => {
            window.setTimeout(() => {
                if (merchantOrderId && merchantOrderId !== 'null') {
                    navigate(`/track/${merchantOrderId}`, { replace: true })
                } else {
                    navigate('/', { replace: true })
                }
            }, delayMs)
        }

        const verifyAndRedirect = async () => {
            if (success === 'true') {
                try {
                    setMessage('جاري تأكيد الدفع مع الخادم...')
                    toast.loading('جاري تأكيد عملية الدفع...', {
                        id: 'payment-verify-progress'
                    })

                    const verifyResponse = await paymentAPI.verify(params)
                    const verifyData = verifyResponse.data || {}

                    if (verifyData.success !== true) {
                        setStatus('processing')
                        setMessage(verifyData.message || 'جارٍ التحقق من الدفع...')
                        navigateToOrder(1500)
                        return
                    }

                    setStatus('success')
                    setMessage('تم تأكيد الدفع بنجاح! جاري التحويل...')
                    toast.success('تم تأكيد الدفع بنجاح!', {
                        id: 'payment-verify-progress'
                    })
                    navigateToOrder(1500)
                } catch (error) {
                    console.error('Verification Error:', error)
                    setStatus('processing')
                    setMessage('تعذر تأكيد الدفع مؤقتًا. جاري فتح صفحة تتبع الطلب لمراجعة حالته...')
                    toast.error('تعذر تأكيد الدفع الآن، سنفتح الطلب مباشرة', {
                        id: 'payment-verify-progress'
                    })
                    navigateToOrder(1200)
                }
                return
            }

            setStatus('error')
            const errorMsg = searchParams.get('data.message') || 'فشلت عملية الدفع'
            setMessage(errorMsg)
            toast.error(errorMsg, { id: 'payment-verify-progress' })

            window.setTimeout(() => {
                navigate('/checkout', { replace: true })
            }, 2000)
        }

        verifyAndRedirect()
    }, [searchParams, navigate])

    return (
        <div className="container section" style={{ textAlign: 'center', marginTop: '4rem', padding: '2rem' }}>
            <div style={{
                background: status === 'success' ? '#d4edda' : status === 'error' ? '#f8d7da' : '#fff3cd',
                padding: '2rem',
                borderRadius: '1rem',
                maxWidth: '500px',
                margin: '0 auto'
            }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
                    {status === 'processing' && '⏳'}
                    {status === 'success' && '✅'}
                    {status === 'error' && '❌'}
                </div>
                <h2 style={{ marginBottom: '1rem' }}>
                    {status === 'processing' && 'جاري المعالجة...'}
                    {status === 'success' && 'تم بنجاح!'}
                    {status === 'error' && 'حدث خطأ'}
                </h2>
                <p style={{ color: '#555' }}>{message}</p>
            </div>
        </div>
    )
}
