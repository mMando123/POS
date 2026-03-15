import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { paymentAPI } from '../services/api'

export default function PaymentCallback() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [status, setStatus] = useState('processing') // processing, success, error
    const [message, setMessage] = useState('جاري التحقق من عملية الدفع...')

    useEffect(() => {
        const params = Object.fromEntries(searchParams.entries())
        console.log('Payment Callback Params:', params)

        const success = searchParams.get('success')
        const merchantOrderId = searchParams.get('merchant_order_id')

        const verifyAndRedirect = async () => {
            if (success === 'true') {
                try {
                    setMessage('جاري تأكيد الدفع مع الخادم...')
                    toast('جاري تأكيد عملية الدفع...', { icon: '⏳' })

                    await paymentAPI.verify(params)

                    setStatus('success')
                    setMessage('تم تأكيد الدفع بنجاح! جاري التحويل...')
                    toast.success('تم تأكيد الدفع بنجاح!')

                    // Wait a moment before redirecting
                    setTimeout(() => {
                        if (merchantOrderId && merchantOrderId !== 'null') {
                            navigate(`/track/${merchantOrderId}`, { replace: true })
                        } else {
                            navigate('/', { replace: true })
                        }
                    }, 1500)

                } catch (error) {
                    console.error('Verification Error:', error)
                    setStatus('error')
                    setMessage('حدث خطأ في التحقق، لكن الدفع قد يكون ناجحاً. جاري التحويل...')
                    toast.error('حدث خطأ أثناء التحقق')

                    setTimeout(() => {
                        if (merchantOrderId) {
                            navigate(`/track/${merchantOrderId}`, { replace: true })
                        } else {
                            navigate('/', { replace: true })
                        }
                    }, 2000)
                }
            } else {
                setStatus('error')
                const errorMsg = searchParams.get('data.message') || 'فشلت عملية الدفع'
                setMessage(errorMsg)
                toast.error(errorMsg)

                setTimeout(() => {
                    navigate('/checkout', { replace: true })
                }, 2000)
            }
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

