const rateLimit = require('express-rate-limit')

// Common limiter configuration
const createLimiter = (options) => {
    return rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // Limit each IP to 5 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        message: {
            success: false,
            message: 'تم تجاوز الحد المسموح من المحاولات، يرجى المحاولة لاحقاً بعد 15 دقيقة',
            code: 'RATE_LIMIT_EXCEEDED'
        },
        handler: (req, res, next, options) => {
            console.warn(`[RATE LIMIT] IP: ${req.ip} exceeded limit on ${req.originalUrl} at ${new Date().toISOString()}`)
            res.status(options.statusCode).send(options.message)
        },
        ...options
    })
}

// Specific limiters
const authLimiter = createLimiter({
    max: 30, // 10 branches may share IP via NAT/VPN
    message: {
        success: false,
        message: 'تم تجاوز عدد محاولات الدخول المسموحة، يرجى المحاولة بعد 15 دقيقة',
        code: 'AUTH_RATE_LIMIT'
    }
})

const orderLimiter = createLimiter({
    max: 100, // Higher limit for order creation to avoid blocking busy POS terminals (adjust as needed)
    windowMs: 15 * 60 * 1000 // 100 orders per 15 mins per IP is still very generous but prevents pure DoS
})

const paymentLimiter = createLimiter({
    max: 30, // Payment initiation should be tighter than order flow
    windowMs: 15 * 60 * 1000,
    message: {
        success: false,
        message: 'Too many payment attempts from this IP. Please try again later.',
        code: 'PAYMENT_RATE_LIMIT'
    }
})

module.exports = {
    authLimiter,
    orderLimiter,
    paymentLimiter
}
