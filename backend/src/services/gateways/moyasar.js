class MoyasarGateway {
    async createSession(order, config) {
        const apiKey = config.settings?.apiKey

        if (!apiKey) {
            throw new Error('Moyasar Publishable API Key is missing')
        }

        // Moyasar usually initiates payment on the client side using their form,
        // so we return the necessary config and order details to the frontend.
        // Or if using Moyasar Invoices API, we would call it here.

        // For simplicity, we return data for the Client-Side SDK execution
        return {
            paymentUrl: null, // Client-side handling
            provider: 'moyasar',
            clientConfig: {
                publishableApiKey: apiKey,
                amount: Math.round(order.total * 100), // Halalas
                currency: 'SAR',
                description: `Order #${order.id}`,
                metadata: {
                    orderId: order.id
                }
            }
        }
    }
}

module.exports = new MoyasarGateway()
