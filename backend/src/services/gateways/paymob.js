const axios = require('axios')
const crypto = require('crypto')

class PaymobGateway {
    constructor() {
        this.baseUrl = 'https://accept.paymob.com/api'
    }

    /**
     * Step 1: Authentication Request
     * returns auth_token
     */
    async authenticate(apiKey) {
        try {
            const response = await axios.post(`${this.baseUrl}/auth/tokens`, {
                api_key: apiKey
            })
            return response.data.token
        } catch (error) {
            console.error('Paymob Auth Error details:', error.response?.data)
            throw new Error('فشل الاتصال ببوابة الدفع (Authentication): تأكد من صحة API Key')
        }
    }

    /**
     * Step 2: Order Registration API
     * returns paymob_order_id
     */
    async registerOrder(authToken, order) {
        try {
            // Paymob requires amount in cents/piastres
            const amountCents = Math.round(order.total * 100) // Using order.total, assuming it's available

            const response = await axios.post(`${this.baseUrl}/ecommerce/orders`, {
                auth_token: authToken,
                delivery_needed: "false",
                amount_cents: amountCents,
                currency: "EGP",
                merchant_order_id: order.id, // STRICTLY use UUID to ensure findByPk works on callback
                items: []
            })
            return response.data.id
        } catch (error) {
            console.error('Paymob Order Register Error:', error.response?.data)
            throw new Error('فشل تسجيل الطلب في بوابة الدفع')
        }
    }

    /**
     * Step 3: Payment Key Request
     * returns payment_key
     */
    async requestPaymentKey(authToken, paymobOrderId, order, integrationId, billingData) {
        try {
            const amountCents = Math.round(order.total * 100)

            const response = await axios.post(`${this.baseUrl}/acceptance/payment_keys`, {
                auth_token: authToken,
                amount_cents: amountCents,
                expiration: 3600,
                order_id: paymobOrderId,
                billing_data: billingData,
                currency: "EGP",
                integration_id: integrationId
            })
            return response.data.token
        } catch (error) {
            console.error('Paymob Payment Key Error:', error.response?.data)
            throw new Error('فشل الحصول على مفتاح الدفع: تأكد من صحة Integration ID')
        }
    }

    /**
     * Main entry point called by PaymentService
     * @param {Object} order - The order object
     * @param {Object} config - The payment gateway configuration from DB
     */
    async createSession(order, config) {
        try {
            // Extract settings from JSON
            const settings = config.settings || {}

            // Validate required settings
            if (!settings.apiKey || !settings.integrationId || !settings.iframeId) {
                throw new Error('إعدادات Paymob غير مكتملة (API Key, Integration ID, IFrame ID)')
            }

            // 1. Authenticate
            const authToken = await this.authenticate(settings.apiKey)

            // 2. Register Order
            const paymobOrderId = await this.registerOrder(authToken, order)

            // 3. Prepare Billing Data
            // We use dummy data if real customer data is missing, as Paymob requires it
            const billingData = {
                "apartment": "NA",
                "email": "customer@example.com",
                "floor": "NA",
                "first_name": "Guest",
                "street": "NA",
                "building": "NA",
                "phone_number": "+201000000000",
                "shipping_method": "NA",
                "postal_code": "NA",
                "city": "NA",
                "country": "NA",
                "last_name": "User",
                "state": "NA"
            }

            // 4. Request Payment Key
            const integrationId = settings.integrationId
            const paymentKey = await this.requestPaymentKey(authToken, paymobOrderId, order, integrationId, billingData)

            // 5. Construct Redirect URL (IFrame)
            // Sanitize iframeId: extract only numbers to handle cases where user pastes full URL or garbage
            let iframeId = settings.iframeId.toString().replace(/\D/g, '');

            // Fallback if sanitization failed (empty string), implies config error, but let's try raw or throw
            if (!iframeId) {
                // Try to catch common mistake if user pasted nothing valid
                console.warn('Warning: Invalid IFrame ID format detected:', settings.iframeId);
                iframeId = settings.iframeId;
            }

            const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`

            // Return standardized Object expected by Frontend
            return {
                paymentUrl: paymentUrl,
                paymentId: paymobOrderId.toString(),
                provider: 'paymob'
            }

        } catch (error) {
            console.error('Paymob Session Creation Failed:', error.message)
            throw error
        }
    }

    /**
     * Verify Paymob Callback HMAC
     * 
     * CRITICAL FINANCIAL SECURITY: This method validates that webhook data
     * actually came from Paymob and was not forged by an attacker.
     * 
     * Paymob HMAC calculation requires concatenating specific fields from the
     * transaction object in a specific order, then computing HMAC-SHA512.
     * 
     * @param {Object} transactionData - The transaction object from webhook (req.body.obj)
     * @param {string} receivedHmac - The HMAC sent by Paymob (req.query.hmac or req.body.hmac)
     * @param {string} hmacSecret - The HMAC secret from gateway settings
     * @returns {boolean} true if HMAC is valid
     */
    verifyCallback(transactionData, receivedHmac, hmacSecret) {
        if (!transactionData || !receivedHmac || !hmacSecret) {
            console.error('⚠️ HMAC verification failed: missing parameters')
            return false
        }

        try {
            // Paymob specifies these fields must be concatenated in this exact order
            // Reference: Paymob Accept API documentation
            const fields = [
                transactionData.amount_cents,
                transactionData.created_at,
                transactionData.currency,
                transactionData.error_occured,
                transactionData.has_parent_transaction,
                transactionData.id,
                transactionData.integration_id,
                transactionData.is_3d_secure,
                transactionData.is_auth,
                transactionData.is_capture,
                transactionData.is_refunded,
                transactionData.is_standalone_payment,
                transactionData.is_voided,
                transactionData.order?.id || transactionData.order,
                transactionData.owner,
                transactionData.pending,
                transactionData.source_data?.pan || '',
                transactionData.source_data?.sub_type || '',
                transactionData.source_data?.type || '',
                transactionData.success,
            ]

            // Concatenate all fields as strings
            const concatenated = fields.map(f => {
                if (f === undefined || f === null) return ''
                if (typeof f === 'boolean') return f.toString()
                return String(f)
            }).join('')

            // Compute HMAC-SHA512
            const computedHmac = crypto
                .createHmac('sha512', hmacSecret)
                .update(concatenated)
                .digest('hex')

            const isValid = computedHmac === receivedHmac

            if (!isValid) {
                console.error('❌ HMAC mismatch!')
                console.error('   Computed:', computedHmac.substring(0, 20) + '...')
                console.error('   Received:', receivedHmac.substring(0, 20) + '...')
            }

            return isValid
        } catch (error) {
            console.error('HMAC verification error:', error)
            return false
        }
    }

    /**
     * Verify that payment amount matches order amount
     * 
     * CRITICAL: Prevents amount tampering where attacker pays 1 EGP for a 1000 EGP order
     * 
     * @param {number} paidAmountCents - Amount paid (in cents/piastres) from Paymob
     * @param {number} orderTotal - Order total from our database (in EGP)
     * @returns {boolean} true if amounts match
     */
    verifyAmount(paidAmountCents, orderTotal) {
        const expectedCents = Math.round(parseFloat(orderTotal) * 100)
        const actualCents = parseInt(paidAmountCents)

        if (expectedCents !== actualCents) {
            console.error(`❌ Amount mismatch! Expected: ${expectedCents} cents, Got: ${actualCents} cents`)
            return false
        }
        return true
    }
}

// Export a NEW INSTANCE as expected by paymentService.js
module.exports = new PaymobGateway()
