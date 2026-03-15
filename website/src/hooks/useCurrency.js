import { useEffect, useState } from 'react'
import { settingsAPI } from '../services/api'

const FALLBACK_SYMBOL_BY_CODE = {
    SAR: 'ر.س',
    EGP: 'ج.م',
    USD: '$',
    EUR: '€',
    GBP: '£',
    AED: 'د.إ',
    KWD: 'د.ك',
    BHD: 'د.ب',
    OMR: 'ر.ع',
    QAR: 'ر.ق'
}

const DEFAULT_SYMBOL = 'ر.س'

const resolveSymbol = (settings) => {
    const directSymbol = String(settings?.currencySymbol || '').trim()
    if (directSymbol) return directSymbol

    const code = String(settings?.currency || '').trim().toUpperCase()
    if (!code) return DEFAULT_SYMBOL
    return FALLBACK_SYMBOL_BY_CODE[code] || code
}

let cachedCurrencySymbol = ''
let inFlightRequest = null

const fetchCurrencySymbol = async () => {
    if (cachedCurrencySymbol) return cachedCurrencySymbol
    if (inFlightRequest) return inFlightRequest

    inFlightRequest = settingsAPI.getPublic()
        .then((res) => {
            const symbol = resolveSymbol(res.data?.data)
            cachedCurrencySymbol = symbol || DEFAULT_SYMBOL
            return cachedCurrencySymbol
        })
        .catch(() => DEFAULT_SYMBOL)
        .finally(() => {
            inFlightRequest = null
        })

    return inFlightRequest
}

const formatAmount = (value) => {
    const num = Number(value)
    return Number.isFinite(num) ? num.toFixed(2) : '0.00'
}

export default function useCurrency() {
    const [currencySymbol, setCurrencySymbol] = useState(cachedCurrencySymbol || DEFAULT_SYMBOL)

    useEffect(() => {
        let mounted = true

        const applyRemoteCurrency = async () => {
            const symbol = await fetchCurrencySymbol()
            if (mounted) setCurrencySymbol(symbol || DEFAULT_SYMBOL)
        }

        const handleSettingsUpdated = async (event) => {
            const nextSymbol = resolveSymbol(event?.detail)
            if (nextSymbol) {
                cachedCurrencySymbol = nextSymbol
                if (mounted) setCurrencySymbol(nextSymbol)
                return
            }

            cachedCurrencySymbol = ''
            await applyRemoteCurrency()
        }

        applyRemoteCurrency()
        window.addEventListener('settingsUpdated', handleSettingsUpdated)

        return () => {
            mounted = false
            window.removeEventListener('settingsUpdated', handleSettingsUpdated)
        }
    }, [])

    return {
        currencySymbol,
        formatCurrency: (value) => `${formatAmount(value)} ${currencySymbol || DEFAULT_SYMBOL}`
    }
}

