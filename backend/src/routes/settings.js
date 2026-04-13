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
        storeName: 'مطعم الذواقة',
        storeNameEn: 'Gourmet Restaurant',
        phone: '0500000000',
        address: 'الرياض، المملكة العربية السعودية',
        taxNumber: '300000000000003',
        taxRate: 15,
        serviceRate: 0, // رسوم خدمة
        logo: null,
        commercialRegister: '', // السجل التجاري
    },
    hardware: {
        printers: [], // { id, name, type: 'network'|'usb', address, location: 'cashier'|'kitchen' }
        printDirectly: true, // طباعة مباشرة بدون معاينة
        enableCashDrawer: true,
        enableKitchenDisplay: false, // KDS
    },
    workflow: {
        autoAcceptOnline: false, // قبول تلقائي للطلبات
        allowCancelWithoutReason: false, // السماح بالإلغاء بدون سبب
        requireManagerForVoid: true, // طلب موافقة المدير للحذف
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
        footerText: 'شكرًا لزيارتكم',
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
    hr: {
        payrollLatePolicy: {
            enabled: false,
            graceCount: 0,
            deductionType: 'fixed_amount',
            deductionValue: 0
        }
    },
    system: {
        language: 'ar',
        currency: 'SAR',
        currencySymbol: 'ر.س',
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
    hr: {
        ...defaultSettings.hr,
        ...(stored.hr || {}),
        payrollLatePolicy: {
            ...defaultSettings.hr.payrollLatePolicy,
            ...((stored.hr && stored.hr.payrollLatePolicy) || {})
        }
    },
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
        res.status(500).json({ message: 'خطأ في جلب الإعدادات' })
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
        res.status(500).json({ message: 'خطأ في جلب الإعدادات' })
    }
})

// Update all settings (Admin only)
router.put('/', authenticate, authorize('admin'), [
    body('store.storeName').optional().isLength({ max: 100 }).withMessage('اسم المتجر يجب ألا يتجاوز 100 حرف').trim(),
    body('store.storeNameEn').optional().isLength({ max: 100 }).withMessage('اسم المتجر بالإنجليزية يجب ألا يتجاوز 100 حرف').trim(),
    body('store.phone').optional().matches(/^[\d\s\-\+\(\)]*$/).withMessage('صيغة رقم الهاتف غير صالحة'),
    body('store.address').optional().isLength({ max: 500 }).withMessage('العنوان يجب ألا يتجاوز 500 حرف').trim(),
    body('store.taxNumber').optional().isLength({ max: 50 }).withMessage('الرقم الضريبي يجب ألا يتجاوز 50 حرف'),
    body('store.taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('نسبة الضريبة يجب أن تكون بين 0 و100'),
    body('store.serviceRate').optional().isFloat({ min: 0, max: 100 }).withMessage('نسبة الخدمة يجب أن تكون بين 0 و100'),
    body('receipt.footerText').optional().isLength({ max: 500 }).withMessage('نص التذييل يجب ألا يتجاوز 500 حرف').trim(),
    body('receipt.headerText').optional().isLength({ max: 500 }).withMessage('نص الترويسة يجب ألا يتجاوز 500 حرف').trim(),
    body('hr').optional().isObject().withMessage('إعدادات الموارد البشرية غير صالحة'),
    body('hr.payrollLatePolicy').optional().isObject().withMessage('سياسة التأخير غير صالحة'),
    body('hr.payrollLatePolicy.enabled').optional().isBoolean().withMessage('قيمة تفعيل سياسة التأخير غير صالحة'),
    body('hr.payrollLatePolicy.graceCount').optional().isInt({ min: 0, max: 31 }).withMessage('عدد مرات السماح بالتأخير غير صالح'),
    body('hr.payrollLatePolicy.deductionType').optional().isIn(['fixed_amount', 'fraction_of_day']).withMessage('نوع خصم التأخير غير صالح'),
    body('hr.payrollLatePolicy.deductionValue').optional().isFloat({ min: 0, max: 1000000 }).withMessage('قيمة خصم التأخير غير صالحة'),
    body('system.language').optional().isIn(['ar', 'en']).withMessage('اللغة غير صالحة'),
    body('inventory').optional().isObject().withMessage('إعدادات المخزون غير صالحة'),
    body('inventory.densityKgPerLiter').optional().isObject().withMessage('خريطة الكثافة غير صالحة'),
    body('system.currency').optional().isLength({ max: 10 }).withMessage('رمز العملة غير صالح'),
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
            hr: {
                ...currentSettings.hr,
                ...(req.body.hr || {}),
                payrollLatePolicy: {
                    ...(currentSettings.hr?.payrollLatePolicy || {}),
                    ...((req.body.hr && req.body.hr.payrollLatePolicy) || {})
                }
            },
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
                message: 'تم حفظ الإعدادات بنجاح',
                data: newSettings
            })
        } else {
            res.status(500).json({ message: 'فشل حفظ الإعدادات' })
        }
    } catch (error) {
        console.error('Update settings error:', error)
        res.status(500).json({ message: 'خطأ في تحديث الإعدادات' })
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
                message: 'تم حفظ إعدادات المتجر',
                data: currentSettings.store
            })
        } else {
            res.status(500).json({ message: 'فشل حفظ الإعدادات' })
        }
    } catch (error) {
        console.error('Update store settings error:', error)
        res.status(500).json({ message: 'خطأ في تحديث إعدادات المتجر' })
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
                message: 'تم حفظ إعدادات الفاتورة',
                data: currentSettings.receipt
            })
        } else {
            res.status(500).json({ message: 'فشل حفظ الإعدادات' })
        }
    } catch (error) {
        console.error('Update receipt settings error:', error)
        res.status(500).json({ message: 'خطأ في تحديث إعدادات الفاتورة' })
    }
})

// Reset to default settings
router.post('/reset', authenticate, authorize('admin'), async (req, res) => {
    try {
        if (saveSettings(defaultSettings)) {
            res.json({
                message: 'تمت إعادة الإعدادات للقيم الافتراضية',
                data: defaultSettings
            })
        } else {
            res.status(500).json({ message: 'فشل إعادة الإعدادات' })
        }
    } catch (error) {
        console.error('Reset settings error:', error)
        res.status(500).json({ message: 'خطأ في إعادة الإعدادات' })
    }
})

// Export settings and loadSettings for use in other modules
module.exports = router
module.exports.loadSettings = loadSettings

