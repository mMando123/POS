import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import CssBaseline from '@mui/material/CssBaseline';
import translations from '../locales';

// Context
const ThemeConfigContext = createContext();

// Constants
const STORAGE_KEY_MODE = 'smartpos_theme_mode';
const STORAGE_KEY_LANG = 'smartpos_language';
const STORAGE_KEY_CURRENCY = 'smartpos_currency';

// Currency configurations
const CURRENCIES = {
    SAR: { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', nameAr: 'ريال سعودي', decimals: 2, position: 'after' },
    USD: { code: 'USD', symbol: '$', name: 'US Dollar', nameAr: 'دولار أمريكي', decimals: 2, position: 'before' },
    EUR: { code: 'EUR', symbol: '€', name: 'Euro', nameAr: 'يورو', decimals: 2, position: 'before' },
    GBP: { code: 'GBP', symbol: '£', name: 'British Pound', nameAr: 'جنيه استرليني', decimals: 2, position: 'before' },
    AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', nameAr: 'درهم إماراتي', decimals: 2, position: 'after' },
    KWD: { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', nameAr: 'دينار كويتي', decimals: 3, position: 'after' },
    QAR: { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal', nameAr: 'ريال قطري', decimals: 2, position: 'after' },
    BHD: { code: 'BHD', symbol: 'د.ب', name: 'Bahraini Dinar', nameAr: 'دينار بحريني', decimals: 3, position: 'after' },
    OMR: { code: 'OMR', symbol: 'ر.ع', name: 'Omani Rial', nameAr: 'ريال عماني', decimals: 3, position: 'after' },
    EGP: { code: 'EGP', symbol: 'ج.م', name: 'Egyptian Pound', nameAr: 'جنيه مصري', decimals: 2, position: 'after' },
    JOD: { code: 'JOD', symbol: 'د.أ', name: 'Jordanian Dinar', nameAr: 'دينار أردني', decimals: 3, position: 'after' },
};

// Cache for RTL
const cacheRtl = createCache({
    key: 'muirtl',
    stylisPlugins: [prefixer, rtlPlugin],
});

// Cache for LTR (Standard)
const cacheLtr = createCache({
    key: 'muiltr',
    stylisPlugins: [prefixer],
});

export function ThemeConfigProvider({ children }) {
    // State initialization from localStorage or defaults
    const [mode, setMode] = useState(() => localStorage.getItem(STORAGE_KEY_MODE) || 'light');
    const [language, setLanguage] = useState(() => localStorage.getItem(STORAGE_KEY_LANG) || 'ar');
    const [currencyCode, setCurrencyCode] = useState(() => localStorage.getItem(STORAGE_KEY_CURRENCY) || 'SAR');

    // Get current currency config
    const currency = CURRENCIES[currencyCode] || CURRENCIES.SAR;

    // Sync default currency from backend public settings.
    const syncCurrencyFromServer = useCallback(async () => {
        try {
            const res = await fetch('/api/settings/public');
            if (!res.ok) return;

            const payload = await res.json();
            const serverCurrency = String(payload?.data?.currency || '').trim().toUpperCase();

            if (CURRENCIES[serverCurrency]) {
                setCurrencyCode((prev) => (prev === serverCurrency ? prev : serverCurrency));
            }
        } catch (_) {
            // Keep local currency if public settings request fails.
        }
    }, []);

    // Persist changes
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MODE, mode);
        localStorage.setItem(STORAGE_KEY_LANG, language);
        localStorage.setItem(STORAGE_KEY_CURRENCY, currencyCode);

        // Update document direction and lang attribute
        document.dir = language === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = language;
    }, [mode, language, currencyCode]);

    useEffect(() => {
        const handleSettingsUpdated = () => {
            syncCurrencyFromServer();
        };

        syncCurrencyFromServer();
        window.addEventListener('settingsUpdated', handleSettingsUpdated);

        return () => {
            window.removeEventListener('settingsUpdated', handleSettingsUpdated);
        };
    }, [syncCurrencyFromServer]);

    // Translation function
    const t = useCallback((key, fallback = '') => {
        const keys = key.split('.');
        let value = translations[language];

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // Fallback to English if key not found
                value = translations['en'];
                for (const ek of keys) {
                    if (value && typeof value === 'object' && ek in value) {
                        value = value[ek];
                    } else {
                        return fallback || key;
                    }
                }
                break;
            }
        }

        return typeof value === 'string' ? value : (fallback || key);
    }, [language]);

    // Format currency function
    const formatCurrency = useCallback((amount, options = {}) => {
        const {
            showSymbol = true,
            showCode = false,
            customCurrency = null
        } = options;

        const curr = customCurrency ? (CURRENCIES[customCurrency] || currency) : currency;
        const numAmount = parseFloat(amount) || 0;
        const formatted = numAmount.toFixed(curr.decimals);

        if (!showSymbol && !showCode) {
            return formatted;
        }

        const symbolOrCode = showCode ? curr.code : curr.symbol;

        if (curr.position === 'before') {
            return `${symbolOrCode}${showSymbol ? ' ' : ''}${formatted}`;
        } else {
            return `${formatted} ${symbolOrCode}`;
        }
    }, [currency]);

    // Theme creation
    const theme = useMemo(() => {
        const isRtl = language === 'ar';

        return createTheme({
            direction: isRtl ? 'rtl' : 'ltr',
            palette: {
                mode,
                primary: {
                    main: '#1976d2',
                    light: '#42a5f5',
                    dark: '#1565c0',
                },
                secondary: {
                    main: '#9c27b0',
                },
                background: {
                    default: mode === 'dark' ? '#121212' : '#f5f5f5',
                    paper: mode === 'dark' ? '#1e1e1e' : '#ffffff',
                },
            },
            typography: {
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'Roboto, sans-serif',
            },
            components: {
                MuiButton: {
                    styleOverrides: {
                        root: { borderRadius: 8 },
                    },
                },
                MuiCard: {
                    styleOverrides: {
                        root: { borderRadius: 12 },
                    },
                },
            },
        });
    }, [mode, language]);

    // Functions to expose
    const toggleMode = () => setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
    const toggleLanguage = () => setLanguage((prev) => (prev === 'ar' ? 'en' : 'ar'));
    const setSpecificLanguage = (lang) => setLanguage(lang);
    const setSpecificCurrency = (code) => {
        if (CURRENCIES[code]) {
            setCurrencyCode(code);
        }
    };

    const contextValue = useMemo(() => ({
        // Theme
        mode,
        toggleMode,
        setMode,

        // Language
        language,
        toggleLanguage,
        setLanguage: setSpecificLanguage,
        t, // Translation function

        // Currency
        currency,
        currencyCode,
        setCurrency: setSpecificCurrency,
        formatCurrency,
        availableCurrencies: CURRENCIES,

        // Direction helper
        isRtl: language === 'ar',
    }), [mode, language, currency, currencyCode, t, formatCurrency]);

    return (
        <ThemeConfigContext.Provider value={contextValue}>
            <CacheProvider value={language === 'ar' ? cacheRtl : cacheLtr}>
                <MuiThemeProvider theme={theme}>
                    <CssBaseline />
                    {children}
                </MuiThemeProvider>
            </CacheProvider>
        </ThemeConfigContext.Provider>
    );
}

// Hook for consuming the context
export const useThemeConfig = () => {
    const context = useContext(ThemeConfigContext);
    if (!context) {
        throw new Error('useThemeConfig must be used within a ThemeConfigProvider');
    }
    return context;
};

// Standalone hooks for convenience
export const useTranslation = () => {
    const { t, language, setLanguage, isRtl } = useThemeConfig();
    return { t, language, setLanguage, isRtl };
};

export const useCurrency = () => {
    const { currency, currencyCode, setCurrency, formatCurrency, availableCurrencies } = useThemeConfig();
    return { currency, currencyCode, setCurrency, formatCurrency, availableCurrencies };
};
