const { sequelize, PaymentGateway } = require('./models')

const enableStripe = async () => {
    try {
        await sequelize.authenticate()

        const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim()
        const publishableKey = String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim()

        if (!secretKey || !publishableKey) {
            throw new Error('Missing STRIPE_SECRET_KEY or STRIPE_PUBLISHABLE_KEY in environment')
        }

        const gateway = await PaymentGateway.findOne({ where: { name: 'stripe' } })
        if (gateway) {
            gateway.is_active = true
            gateway.settings = {
                ...(gateway.settings || {}),
                secretKey,
                publishableKey
            }
            await gateway.save()
            console.log('Stripe enabled using environment keys')
        } else {
            console.log('Stripe gateway not found')
        }
    } catch (error) {
        console.error('Error:', error)
    }
}

enableStripe()
