/**
 * Idempotency Middleware
 *
 * Prevents duplicate financial operations by requiring and enforcing
 * X-Idempotency-Key headers on financial endpoints.
 *
 * How it works:
 * 1. Client sends X-Idempotency-Key header (UUID or unique string)
 * 2. Middleware checks if this key has been used before
 * 3. If used + completed: returns the cached original response (no re-execution)
 * 4. If used + still processing: returns 409 Conflict
 * 5. If new: marks as 'processing' and lets the request through
 * 6. After handler responds, the response is stored against the key
 *
 * CRITICAL: This is a financial safety guard. Do NOT bypass on money endpoints.
 */

const { Op } = require('sequelize')
const logger = require('../services/logger')

// Lazy-load to avoid circular dependency at module init time
let _IdempotencyKey = null
function getIdempotencyKeyModel() {
    if (!_IdempotencyKey) {
        _IdempotencyKey = require('../models/IdempotencyKey')
    }
    return _IdempotencyKey
}

/**
 * Cleanup expired idempotency keys (called periodically)
 */
async function cleanupExpiredKeys() {
    try {
        const IdempotencyKey = getIdempotencyKeyModel()
        const deleted = await IdempotencyKey.destroy({
            where: {
                expires_at: { [Op.lt]: new Date() }
            }
        })
        if (deleted > 0) {
            logger.info(`Cleaned up ${deleted} expired idempotency keys`)
        }
    } catch (error) {
        logger.error('Idempotency cleanup error:', error)
    }
}

// Run cleanup every hour without keeping Node process alive in tests/tools.
const cleanupInterval = setInterval(cleanupExpiredKeys, 60 * 60 * 1000)
if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref()
}

/**
 * Idempotency middleware factory
 *
 * @param {Object} options
 * @param {boolean} options.required - If true, requests without the header are rejected (default: true)
 * @param {string} options.endpointName - Human-readable name for logging
 * @returns {Function} Express middleware
 */
function requireIdempotency(options = {}) {
    const { required = true, endpointName = 'unknown' } = options

    return async (req, res, next) => {
        const idempotencyKey = req.headers['x-idempotency-key']

        // If header is missing
        if (!idempotencyKey) {
            if (required) {
                return res.status(400).json({
                    success: false,
                    message: 'حقل X-Idempotency-Key مطلوب لهذه العملية المالية',
                    code: 'IDEMPOTENCY_KEY_REQUIRED'
                })
            }
            // Not required, skip idempotency check
            return next()
        }

        // Validate key format (must be non-empty, max 255 chars)
        if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0 || idempotencyKey.length > 255) {
            return res.status(400).json({
                success: false,
                message: 'قيمة X-Idempotency-Key يجب أن تكون نصًا غير فارغ (حد أقصى 255 حرفًا)',
                code: 'IDEMPOTENCY_KEY_INVALID'
            })
        }

        try {
            const IdempotencyKey = getIdempotencyKeyModel()
            const endpoint = `${req.method} ${req.baseUrl}${req.path}`

            // Check if key already exists
            const existing = await IdempotencyKey.findOne({
                where: { key: idempotencyKey.trim() }
            })

            if (existing) {
                // Key exists - check state
                if (existing.status === 'processing') {
                    // Request is still being processed (possible retry during in-flight request)
                    return res.status(409).json({
                        success: false,
                        message: 'هذا الطلب قيد المعالجة الآن، يرجى الانتظار.',
                        code: 'IDEMPOTENCY_IN_PROGRESS'
                    })
                }

                if (existing.status === 'completed') {
                    // Already completed - return cached response
                    logger.info(`Idempotency hit: key=${idempotencyKey} endpoint=${endpoint}`)
                    const cachedBody = existing.response_body
                    return res.status(existing.response_status || 200).json(cachedBody)
                }

                if (existing.status === 'failed') {
                    // Previous attempt failed - allow retry by deleting the old record
                    await existing.destroy()
                }
            }

            // New key - create record in 'processing' state
            const expiresAt = new Date()
            expiresAt.setHours(expiresAt.getHours() + 24)

            const record = await IdempotencyKey.create({
                key: idempotencyKey.trim(),
                endpoint,
                method: req.method,
                user_id: req.user?.userId || null,
                status: 'processing',
                expires_at: expiresAt
            })

            // Attach idempotency info to request for the handler to use
            req.idempotencyRecord = record

            // Intercept response to cache it
            const originalJson = res.json.bind(res)
            res.json = function (body) {
                // Store the response asynchronously (non-blocking)
                record.update({
                    status: 'completed',
                    response_status: res.statusCode,
                    response_body: body
                }).catch(err => {
                    logger.error('Failed to store idempotency response:', err)
                })

                return originalJson(body)
            }

            next()
        } catch (error) {
            logger.error('Idempotency middleware error:', error)
            // On middleware failure, let the request through rather than blocking commerce
            // But log as high-priority
            next()
        }
    }
}

module.exports = { requireIdempotency, cleanupExpiredKeys }
