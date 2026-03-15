const stripePackage = require('stripe')

class StripeGateway {
    async createSession(order, config) {
        // 1. Get API Key from settings
        const secretKey = config.settings?.secretKey

        if (!secretKey) {
            throw new Error('Stripe Secret Key is missing in settings')
        }

        const stripe = stripePackage(secretKey)

        // 2. Prepare Line Items
        const lineItems = order.items.map(item => ({
            price_data: {
                currency: 'sar', // Or config.currency
                product_data: {
                    name: item.name || 'Item',
                },
                unit_amount: Math.round(item.unit_price * 100), // Stripe expects cents
            },
            quantity: item.quantity,
        }))

        // 3. Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${order.id}/success`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${order.id}/cancel`,
            client_reference_id: order.id.toString(),
            metadata: {
                orderId: order.id
            }
        })

        return {
            paymentUrl: session.url,
            sessionId: session.id,
            provider: 'stripe'
        }
    }
}

module.exports = new StripeGateway()
