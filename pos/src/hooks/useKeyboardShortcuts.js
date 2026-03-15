// Keyboard Shortcuts Hook for POS System
// Usage: useKeyboardShortcuts()

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const useKeyboardShortcuts = (callbacks = {}) => {
    const navigate = useNavigate()

    useEffect(() => {
        const handleKeyPress = (event) => {
            // Don't trigger shortcuts when typing in input fields
            if (event.target.tagName === 'INPUT' ||
                event.target.tagName === 'TEXTAREA' ||
                event.target.isContentEditable) {
                return
            }

            // Keyboard shortcuts mapping
            const shortcuts = {
                'F1': () => {
                    event.preventDefault()
                    navigate('/new-order')
                    callbacks.onNewOrder?.()
                },
                'F2': () => {
                    event.preventDefault()
                    callbacks.onSearch?.()
                },
                'F3': () => {
                    event.preventDefault()
                    callbacks.onToggleCart?.()
                },
                'F4': () => {
                    event.preventDefault()
                    callbacks.onClearCart?.()
                },
                'F5': () => {
                    // Don't prevent F5 (refresh)
                    return
                },
                'F8': () => {
                    event.preventDefault()
                    navigate('/orders')
                },
                'F9': () => {
                    event.preventDefault()
                    callbacks.onCheckout?.()
                },
                'F12': () => {
                    event.preventDefault()
                    navigate('/menu')
                },
                // Quick add with number keys (if product selected)
                '1': () => callbacks.onQuickAdd?.(1),
                '2': () => callbacks.onQuickAdd?.(2),
                '3': () => callbacks.onQuickAdd?.(3),
                '5': () => callbacks.onQuickAdd?.(5),
                '0': () => callbacks.onQuickAdd?.(10),
                // Navigation
                'ArrowUp': () => callbacks.onNavigateUp?.(),
                'ArrowDown': () => callbacks.onNavigateDown?.(),
                'ArrowLeft': () => callbacks.onNavigateLeft?.(),
                'ArrowRight': () => callbacks.onNavigateRight?.(),
                'Enter': () => {
                    event.preventDefault()
                    callbacks.onConfirm?.()
                },
                'Escape': () => callbacks.onCancel?.(),
                // Quick category switch
                'Tab': () => {
                    event.preventDefault()
                    callbacks.onNextCategory?.()
                },
            }

            const handler = shortcuts[event.key]
            if (handler) {
                handler()
            }
        }

        window.addEventListener('keydown', handleKeyPress)

        return () => {
            window.removeEventListener('keydown', handleKeyPress)
        }
    }, [callbacks, navigate])

    // Show keyboard shortcuts help
    const getShortcutsHelp = () => ({
        'F1': 'طلب جديد (New Order)',
        'F2': 'بحث (Search)',
        'F3': 'إظهار/إخفاء السلة (Toggle Cart)',
        'F4': 'إفراغ السلة (Clear Cart)',
        'F8': 'الطلبات (Orders)',
        'F9': 'الدفع (Checkout)',
        'F12': 'القائمة (Menu)',
        '1-5': 'إضافة سريعة (Quick Add)',
        'Tab': 'التصنيف التالي (Next Category)',
        'Enter': 'تأكيد (Confirm)',
        'Esc': 'إلغاء (Cancel)',
    })

    return { getShortcutsHelp }
}

export default useKeyboardShortcuts
