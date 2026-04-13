const express = require('express')
const router = express.Router()
const { PaymentGateway } = require('../models')
const { authenticate, authorize } = require('../middleware/auth')

const SECRET_MASK = '********'

const GATEWAY_METADATA = {
    stripe: { display_name_ar: 'سترايب', display_name_en: 'Stripe', supported_methods: ['card', 'apple_pay'] },
    moyasar: { display_name_ar: 'ميسر', display_name_en: 'Moyasar', supported_methods: ['mada', 'visa', 'mastercard', 'apple_pay'] },
    fawry: { display_name_ar: 'فوري', display_name_en: 'Fawry', supported_methods: ['cash', 'card', 'wallet'] },
    paymob: { display_name_ar: 'باي موب', display_name_en: 'Paymob', supported_methods: ['card', 'wallet', 'kiosk'] }
}

const SENSITIVE_BY_GATEWAY = {
    stripe: new Set(['secretKey', 'webhookSecret']),
    moyasar: new Set(['secretKey']),
    fawry: new Set(['securityKey', 'secretKey']),
    paymob: new Set(['apiKey', 'hmac', 'hmacSecret'])
}

const ALLOWED_SETTINGS_BY_GATEWAY = {
    stripe: new Set(['publishableKey', 'secretKey', 'webhookSecret']),
    moyasar: new Set(['apiKey', 'secretKey']),
    fawry: new Set(['merchantCode', 'securityKey', 'secretKey']),
    paymob: new Set(['apiKey', 'integrationId', 'iframeId', 'hmac', 'hmacSecret'])
}

const normalizePlainSettings = (settings) => {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return {}
    }
    return { ...settings }
}

const isMaskedOrEmpty = (value) => {
    if (value === undefined || value === null) return true
    const text = String(value).trim()
    if (!text) return true
    if (text === SECRET_MASK) return true
    return /^[*•]+$/.test(text)
}

const normalizeGatewaySettings = (gatewayName, settings) => {
    const normalized = normalizePlainSettings(settings)
    if (gatewayName === 'paymob') {
        if (!normalized.hmacSecret && normalized.hmac) {
            normalized.hmacSecret = normalized.hmac
        }
        delete normalized.hmac
    }
    return normalized
}

const applyGatewayMetadata = (gatewayLike) => {
    const gateway = typeof gatewayLike.toJSON === 'function' ? gatewayLike.toJSON() : { ...gatewayLike }
    const metadata = GATEWAY_METADATA[gateway.name]

    if (!metadata) return gateway

    gateway.display_name_ar = metadata.display_name_ar
    gateway.display_name_en = metadata.display_name_en
    gateway.supported_methods = metadata.supported_methods

    return gateway
}

const sanitizeGatewayForResponse = (gatewayLike) => {
    const gateway = applyGatewayMetadata(gatewayLike)
    const settings = normalizeGatewaySettings(gateway.name, gateway.settings)
    const sensitiveKeys = SENSITIVE_BY_GATEWAY[gateway.name] || new Set()
    const allowedKeys = ALLOWED_SETTINGS_BY_GATEWAY[gateway.name] || new Set(Object.keys(settings))
    const safeSettings = {}

    for (const key of Object.keys(settings)) {
        if (!allowedKeys.has(key)) continue
        const value = settings[key]
        safeSettings[key] = sensitiveKeys.has(key)
            ? (value ? SECRET_MASK : '')
            : value
    }

    gateway.settings = safeSettings
    return gateway
}

const mergeGatewaySettings = ({ gatewayName, currentSettings, incomingSettings }) => {
    const base = normalizeGatewaySettings(gatewayName, currentSettings)
    const incoming = normalizeGatewaySettings(gatewayName, incomingSettings)
    const allowedKeys = ALLOWED_SETTINGS_BY_GATEWAY[gatewayName] || new Set(Object.keys(incoming))
    const sensitiveKeys = SENSITIVE_BY_GATEWAY[gatewayName] || new Set()
    const next = { ...base }

    for (const [key, rawValue] of Object.entries(incoming)) {
        if (!allowedKeys.has(key)) continue

        if (sensitiveKeys.has(key)) {
            if (isMaskedOrEmpty(rawValue)) continue
            next[key] = String(rawValue).trim()
            continue
        }

        if (rawValue === undefined) continue
        if (typeof rawValue === 'string') {
            next[key] = rawValue.trim()
        } else {
            next[key] = rawValue
        }
    }

    return next
}

// Get all payment gateways (Admin only)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
    try {
        const gateways = await PaymentGateway.findAll()
        res.json({ data: gateways.map(sanitizeGatewayForResponse) })
    } catch (error) {
        console.error('Get gateways error:', error)
        res.status(500).json({ message: 'Failed to fetch payment gateways' })
    }
})

// Update payment gateway settings (Admin only)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { is_active, is_sandbox, settings } = req.body
        const gateway = await PaymentGateway.findByPk(req.params.id)

        if (!gateway) {
            return res.status(404).json({ message: 'Payment gateway not found' })
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
            gateway.is_active = Boolean(is_active)
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'is_sandbox')) {
            gateway.is_sandbox = Boolean(is_sandbox)
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'settings')) {
            gateway.settings = mergeGatewaySettings({
                gatewayName: gateway.name,
                currentSettings: gateway.settings,
                incomingSettings: settings
            })
        }

        await gateway.save()

        res.json({
            message: 'Payment gateway updated successfully',
            data: sanitizeGatewayForResponse(gateway)
        })
    } catch (error) {
        console.error('Update gateway error:', error)
        res.status(500).json({ message: 'Failed to update gateway settings' })
    }
})

// Get active payment methods (Public/Cashier)
router.get('/active', async (req, res) => {
    try {
        const gateways = await PaymentGateway.findAll({
            where: { is_active: true },
            attributes: ['id', 'name', 'display_name_ar', 'display_name_en', 'is_sandbox', 'supported_methods']
        })
        res.json({ data: gateways.map(applyGatewayMetadata) })
    } catch (error) {
        console.error('Get active gateways error:', error)
        res.status(500).json({ message: 'Failed to fetch active payment methods' })
    }
})

// Initialize default gateways if not exist
router.post('/init', authenticate, authorize('admin'), async (req, res) => {
    try {
        for (const [name, metadata] of Object.entries(GATEWAY_METADATA)) {
            const [gateway, created] = await PaymentGateway.findOrCreate({
                where: { name },
                defaults: { name, ...metadata }
            })

            if (!created) {
                await gateway.update(metadata)
            }
        }

        res.json({ message: 'Default payment gateways initialized' })
    } catch (error) {
        console.error('Init gateways error:', error)
        res.status(500).json({ message: 'Failed to initialize payment gateways' })
    }
})

module.exports = router
