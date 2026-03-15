const { PaymentGateway } = require('../models')
const logger = require('./logger')

class PaymentService {
    constructor() {
        this.gateways = {}
    }

    /**
     * Initialize a payment for an order
     * @param {Object} order - The order object
     * @param {String} gatewayName - The explicit gateway name (optional)
     */
    async initiatePayment(order, gatewayName = null) {
        try {
            // 1. Determine which gateway to use
            let gatewayConfig
            if (gatewayName) {
                gatewayConfig = await PaymentGateway.findOne({ where: { name: gatewayName, is_active: true } })
            } else {
                // Default: Find first active gateway supporting the method, generally implied priority
                gatewayConfig = await PaymentGateway.findOne({ where: { is_active: true } })
            }

            if (!gatewayConfig) {
                throw new Error('No active payment gateway found')
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
