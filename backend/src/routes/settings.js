const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const { validate } = require('../middleware/validate')
const { authenticate, authorize } = require('../middleware/auth')
const fs = require('fs')
const path = require('path')

const CURRENCY_SYMBOLS = {
    SAR: 'ر.س',
    USD: '$',
    EUR: '€',
    GBP: '£',
    AED: 'د.إ',
    KWD: 'د.ك',
    QAR: 'ر.ق',
    BHD: 'د.ب',
    OMR: 'ر.ع',
    EGP: 'ج.م',
    JOD: 'د.أ'
}

const resolveCurrencySymbol = (currencyCode, fallbackSymbol = '') => {
    const code = String(currencyCode || '').trim().toUpperCase()
    if (CURRENCY_SYMBOLS[code]) return CURRENCY_SYMBOLS[code]

    const fallback = String(fallbackSymbol || '').trim()
    return fallback || code || 'ر.س'
}

// Settings file path
const SETTINGS_FILE = path.join(__dirname, '../../data/settings.json')

// Default settings
const defaultSettings = {
    store: {
        storeName: 'Ù…Ø·Ø¹Ù… Ø§Ù„Ø°ÙˆØ§Ù‚Ø©',
        storeNameEn: 'Gourmet Restaurant',
        phone: '0500000000',
        address: 'Ø§Ù„Ø±ÙŠØ§Ø¶ØŒ Ø§Ù„Ù…Ù…Ù„ÙƒØ© Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ø§Ù„Ø³Ø¹ÙˆØ¯ÙŠØ©',
        taxNumber: '300000000000003',
        taxRate: 15,
        serviceRate: 0, // Ø±Ø³ÙˆÙ… Ø®Ø¯Ù…Ø©
        logo: null,
        commercialRegister: '', // Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„ØªØ¬Ø§Ø±ÙŠ
    },
    hardware: {
        printers: [], // { id, name, type: 'network'|'usb', address, location: 'cashier'|'kitchen' }
        printDirectly: true, // Ø·Ø¨Ø§Ø¹Ø© Ù…Ø¨Ø§Ø´Ø±Ø© Ø¨Ø¯ÙˆÙ† Ù…Ø¹Ø§ÙŠÙ†Ø©
        enableCashDrawer: true,
        enableKitchenDisplay: false, // KDS
    },
    workflow: {
        autoAcceptOnline: false, // Ù‚Ø¨ÙˆÙ„ ØªÙ„Ù‚Ø§Ø¦ÙŠ Ù„Ù„Ø·Ù„Ø¨Ø§Øª
        allowCancelWithoutReason: false, // Ø§Ù„Ø³Ù…Ø§Ø­ Ø¨Ø§Ù„Ø¥Ù„ØºØ§Ø¡ Ø¨Ø¯ÙˆÙ† Ø³Ø¨Ø¨
        requireManagerForVoid: true, // Ø·Ù„Ø¨ Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ù…Ø¯ÙŠØ± Ù„Ù„Ø­Ø°Ù
        orderNumberPrefix: 'ORD-',
        orderNumberStart: 1000,
        // --- أوضاع التشغيل ---
        enableOnlineOrders: true,   // تفعيل الطلبات الأونلاين (الموقع)
        enableDelivery: true,       // تفعيل خدمة التوصيل
        autoCompleteOrders: false,  // إكمال تلقائي: الطلب يكتمل فوراً عند الدفع
        printKitchenReceipt: true,  // طباعة أمر المطبخ (بدون أسعار)
        receiptCopies: 1,           // عدد نسخ فاتورة العميل
    },
    receipt: {
        showLogo: true,
        showTaxNumber: true,
        showQRCode: true,
        footerText: 'Ø´ÙƒØ±Ø§Ù‹ Ù„Ø²ÙŠØ§Ø±ØªÙƒÙ…',
        autoPrint: true,
        paperWidth: 80,
        showCustomerInfo: true,
        headerText: '',
    },
    notifications: {
        soundEnabled: true,
        newOrderAlert: true,
        lowStockAlert: true,
        shiftReminder: true,
    },
    inventory: {
        // Optional map: ingredient_menu_id -> density in kg/L
        densityKgPerLiter: {},
    },
    system: {
        language: 'ar',
        currency: 'SAR',
        currencySymbol: 'Ø±.Ø³',
        timezone: 'Asia/Riyadh',
        dateFormat: 'DD/MM/YYYY',
        themeMode: 'light', // dark, light
    }
}

const mergeWithDefaults = (stored = {}) => ({
    store: { ...defaultSettings.store, ...(stored.store || {}) },
    hardware: { ...defaultSettings.hardware, ...(stored.hardware || {}) },
    workflow: { ...defaultSettings.workflow, ...(stored.workflow || {}) },
    receipt: { ...defaultSettings.receipt, ...(stored.receipt || {}) },
    notifications: { ...defaultSettings.notifications, ...(stored.notifications || {}) },
    inventory: { ...defaultSettings.inventory, ...(stored.inventory || {}) },
    system: { ...defaultSettings.system, ...(stored.system || {}) },
})

// Load settings from file
const loadSettings = () => {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8')
            return mergeWithDefaults(JSON.parse(data))
        }
    } catch (error) {
        console.error('Error loading settings:', error)
    }
    return mergeWithDefaults()
}

// Save settings to file
const saveSettings = (settings) => {
    try {
        // Ensure data directory exists
        const dataDir = path.dirname(SETTINGS_FILE)
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true })
        }
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
        return true
    } catch (error) {
        console.error('Error saving settings:', error)
        return false
    }
}

// Get all settings
router.get('/', authenticate, async (req, res) => {
    try {
        const settings = loadSettings()
        res.json({ data: settings })
    } catch (error) {
        console.error('Get settings error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª' })
    }
})

// Get public settings (for frontend without auth - tax rate, currency, etc.)
router.get('/public', async (req, res) => {
    try {
        const settings = loadSettings()
        const currencyCode = settings.system.currency
        const currencySymbol = resolveCurrencySymbol(currencyCode, settings.system.currencySymbol)
        res.json({
            data: {
                taxRate: settings.store.taxRate,
                currency: currencyCode,
                currencySymbol,
                storeName: settings.store.storeName,
                storeNameEn: settings.store.storeNameEn,
                logo: settings.store.logo,
                // Operation modes (needed by POS frontend)
                enableKitchenDisplay: settings.hardware?.enableKitchenDisplay ?? false,
                enableOnlineOrders: settings.workflow?.enableOnlineOrders ?? true,
                enableDelivery: settings.workflow?.enableDelivery ?? true,
                autoCompleteOrders: settings.workflow?.autoCompleteOrders ?? false,
                printKitchenReceipt: settings.workflow?.printKitchenReceipt ?? true,
                receiptCopies: settings.workflow?.receiptCopies ?? 1,
                autoAcceptOnline: settings.workflow?.autoAcceptOnline ?? false,
                allowCancelWithoutReason: settings.workflow?.allowCancelWithoutReason ?? false,
                requireManagerForVoid: settings.workflow?.requireManagerForVoid ?? true,
                orderNumberPrefix: settings.workflow?.orderNumberPrefix ?? 'ORD-',
                orderNumberStart: settings.workflow?.orderNumberStart ?? 1000,
            }
        })
    } catch (error) {
        console.error('Get public settings error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª' })
    }
})

// Update all settings (Admin only)
router.put('/', authenticate, authorize('admin'), [
    body('store.storeName').optional().isLength({ max: 100 }).withMessage('Ø§Ø³Ù… Ø§Ù„Ù…ØªØ¬Ø± ÙŠØ¬Ø¨ Ø£Ù„Ø§ ÙŠØªØ¬Ø§ÙˆØ² 100 Ø­Ø±Ù').trim(),
    body('store.storeNameEn').optional().isLength({ max: 100 }).withMessage('Ø§Ø³Ù… Ø§Ù„Ù…ØªØ¬Ø± Ø¨Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© ÙŠØ¬Ø¨ Ø£Ù„Ø§ ÙŠØªØ¬Ø§ÙˆØ² 100 Ø­Ø±Ù').trim(),
    body('store.phone').optional().matches(/^[\d\s\-\+\(\)]*$/).withMessage('ØµÙŠØºØ© Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ ØºÙŠØ± ØµØ§Ù„Ø­Ø©'),
    body('store.address').optional().isLength({ max: 500 }).withMessage('Ø§Ù„Ø¹Ù†ÙˆØ§Ù† ÙŠØ¬Ø¨ Ø£Ù„Ø§ ÙŠØªØ¬Ø§ÙˆØ² 500 Ø­Ø±Ù').trim(),
    body('store.taxNumber').optional().isLength({ max: 50 }).withMessage('Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ø¶Ø±ÙŠØ¨ÙŠ ÙŠØ¬Ø¨ Ø£Ù„Ø§ ÙŠØªØ¬Ø§ÙˆØ² 50 Ø­Ø±Ù'),
    body('store.taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Ù†Ø³Ø¨Ø© Ø§Ù„Ø¶Ø±ÙŠØ¨Ø© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø¨ÙŠÙ† 0 Ùˆ 100'),
    body('store.serviceRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Ù†Ø³Ø¨Ø© Ø§Ù„Ø®Ø¯Ù…Ø© ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† Ø¨ÙŠÙ† 0 Ùˆ 100'),
    body('receipt.footerText').optional().isLength({ max: 500 }).withMessage('Ù†Øµ Ø§Ù„ÙÙˆØªØ± ÙŠØ¬Ø¨ Ø£Ù„Ø§ ÙŠØªØ¬Ø§ÙˆØ² 500 Ø­Ø±Ù').trim(),
    body('receipt.headerText').optional().isLength({ max: 500 }).withMessage('Ù†Øµ Ø§Ù„Ù‡ÙŠØ¯Ø± ÙŠØ¬Ø¨ Ø£Ù„Ø§ ÙŠØªØ¬Ø§ÙˆØ² 500 Ø­Ø±Ù').trim(),
    body('system.language').optional().isIn(['ar', 'en']).withMessage('Ø§Ù„Ù„ØºØ© ØºÙŠØ± ØµØ§Ù„Ø­Ø©'),
    body('inventory').optional().isObject().withMessage('إعدادات المخزون غير صالحة'),
    body('inventory.densityKgPerLiter').optional().isObject().withMessage('خريطة الكثافة غير صالحة'),
    body('system.currency').optional().isLength({ max: 10 }).withMessage('Ø±Ù…Ø² Ø§Ù„Ø¹Ù…Ù„Ø© ØºÙŠØ± ØµØ§Ù„Ø­'),
    validate
], async (req, res) => {
    try {
        const currentSettings = loadSettings()

        // Merge incoming settings with current settings (deep merge for each section)
        const newSettings = {
            store: { ...currentSettings.store, ...(req.body.store || {}) },
            hardware: { ...currentSettings.hardware, ...(req.body.hardware || {}) },
            workflow: { ...currentSettings.workflow, ...(req.body.workflow || {}) },
            receipt: { ...currentSettings.receipt, ...(req.body.receipt || {}) },
            notifications: { ...currentSettings.notifications, ...(req.body.notifications || {}) },
            inventory: { ...currentSettings.inventory, ...(req.body.inventory || {}) },
            system: { ...currentSettings.system, ...(req.body.system || {}) },
        }

        newSettings.system.currencySymbol = resolveCurrencySymbol(
            newSettings.system.currency,
            req.body?.system?.currencySymbol || newSettings.system.currencySymbol
        )

        if (saveSettings(newSettings)) {
            // Notify all clients about settings update
            req.app.get('io').emit('settings:updated', newSettings)

            res.json({
                message: 'ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø¨Ù†Ø¬Ø§Ø­',
                data: newSettings
            })
        } else {
            res.status(500).json({ message: 'ÙØ´Ù„ Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª' })
        }
    } catch (error) {
        console.error('Update settings error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª' })
    }
})

// Update store settings only
router.patch('/store', authenticate, authorize('admin'), async (req, res) => {
    try {
        const currentSettings = loadSettings()
        currentSettings.store = { ...currentSettings.store, ...req.body }

        if (saveSettings(currentSettings)) {
            // Notify all clients about settings update
            req.app.get('io').emit('settings:updated', currentSettings)

            res.json({
                message: 'ØªÙ… Ø­ÙØ¸ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù…ØªØ¬Ø±',
                data: currentSettings.store
            })
        } else {
            res.status(500).json({ message: 'ÙØ´Ù„ Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª' })
        }
    } catch (error) {
        console.error('Update store settings error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ ØªØ­Ø¯ÙŠØ« Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù…ØªØ¬Ø±' })
    }
})

// Update receipt settings only
router.patch('/receipt', authenticate, authorize('admin'), async (req, res) => {
    try {
        const currentSettings = loadSettings()
        currentSettings.receipt = { ...currentSettings.receipt, ...req.body }

        if (saveSettings(currentSettings)) {
            // Notify all clients about settings update
            req.app.get('io').emit('settings:updated', currentSettings)

            res.json({
                message: 'ØªÙ… Ø­ÙØ¸ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„ÙØ§ØªÙˆØ±Ø©',
                data: currentSettings.receipt
            })
        } else {
            res.status(500).json({ message: 'ÙØ´Ù„ Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª' })
        }
    } catch (error) {
        console.error('Update receipt settings error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ ØªØ­Ø¯ÙŠØ« Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„ÙØ§ØªÙˆØ±Ø©' })
    }
})

// Reset to default settings
router.post('/reset', authenticate, authorize('admin'), async (req, res) => {
    try {
        if (saveSettings(defaultSettings)) {
            res.json({
                message: 'ØªÙ… Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ù„Ù„Ù‚ÙŠÙ… Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ©',
                data: defaultSettings
            })
        } else {
            res.status(500).json({ message: 'ÙØ´Ù„ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª' })
        }
    } catch (error) {
        console.error('Reset settings error:', error)
        res.status(500).json({ message: 'Ø®Ø·Ø£ ÙÙŠ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª' })
    }
})

// Export settings and loadSettings for use in other modules
module.exports = router
module.exports.loadSettings = loadSettings

