const { PaymentGateway } = require('../models')
const logger = require('./logger')

const GATEWAY_PRIORITY = ['paymob', 'stripe', 'moyasar', 'fawry']

class PaymentService {
    constructor() {
        this.gateways = {}
    }

    normalizeGatewayMethod(paymentMethod = '') {
        const method = String(paymentMethod || '').trim().toLowerCase()
        return method === 'online' ? 'card' : method
    }

    gatewaySupportsMethod(gateway, paymentMethod = '') {
        const requestedMethod = this.normalizeGatewayMethod(paymentMethod)
        if (!requestedMethod) return true

        const supportedMethods = Array.isArray(gateway?.supported_methods)
            ? gateway.supported_methods.map((method) => String(method || '').trim().toLowerCase())
            : []

        if (!supportedMethods.length) return true
        return supportedMethods.includes(requestedMethod)
    }

    sortGateways(gateways = []) {
        return [...gateways].sort((a, b) => {
            const aIdx = GATEWAY_PRIORITY.indexOf(String(a?.name || '').toLowerCase())
            const bIdx = GATEWAY_PRIORITY.indexOf(String(b?.name || '').toLowerCase())
            const safeA = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx
            const safeB = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx
            return safeA - safeB
        })
    }

    /**
     * Initialize a payment for an order
     * @param {Object} order - The order object
     * @param {String} gatewayName - The explicit gateway name (optional)
     */
    async initiatePayment(order, gatewayName = null) {
        try {
            const requestedGatewayName = String(gatewayName || '').trim().toLowerCase() || null
            const isOnlineCheckout = order?.order_type === 'online'
            const resolvedGatewayName = isOnlineCheckout ? 'paymob' : requestedGatewayName

            if (isOnlineCheckout && requestedGatewayName && requestedGatewayName !== 'paymob') {
                throw new Error('This online checkout flow currently supports Paymob only')
            }

            // 1. Determine which gateway to use
            let gatewayConfig
            if (resolvedGatewayName) {
                gatewayConfig = await PaymentGateway.findOne({ where: { name: resolvedGatewayName, is_active: true } })
            } else {
                const activeGateways = await PaymentGateway.findAll({ where: { is_active: true } })
                const matchingGateways = activeGateways.filter((gateway) =>
                    this.gatewaySupportsMethod(gateway, order?.payment_method)
                )

                gatewayConfig = this.sortGateways(matchingGateways)[0] || null
            }

            if (!gatewayConfig) {
                throw new Error('No active payment gateway found')
            }

            if (!this.gatewaySupportsMethod(gatewayConfig, order?.payment_method)) {
                throw new Error(`Payment gateway ${gatewayConfig.name} does not support ${order?.payment_method || 'this payment method'}`)
            }

            // 2. Load the specific gateway implementation
            const gatewayImpl = this.getGatewayImplementation(gatewayConfig.name)

            // 3. Call the setup/initiate method on the provider
            const paymentResult = await gatewayImpl.createSession(order, gatewayConfig)

            return {
                success: true,
                gateway: gatewayConfig.name,
                ...paymentResult
            }

        } catch (error) {
            console.error('Payment initiation failed:', error)
            throw error
        }
    }

    /**
     * Get the specific implementation code for a gateway
     */
    getGatewayImplementation(name) {
        try {
            // Dynamic import of the gateway logic
            return require(`./gateways/${name}`)
        } catch (error) {
            console.error(`Gateway implementation for ${name} not found`, error)
            throw new Error(`Payment provider ${name} not implemented yet`)
        }
    }
}

module.exports = new PaymentService()
