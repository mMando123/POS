const AuditService = require('../services/auditService')

const MUTATIVE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SENSITIVE_READ_PREFIXES = [
    '/api/audit',
    '/api/reports',
    '/api/accounting',
    '/api/hr',
    '/api/users'
]

const EXCLUDED_PREFIXES = [
    '/api/health',
    '/uploads'
]

const EXCLUDED_EXACT = new Set([
    '/api/auth/login',
    '/api/auth/refresh-token'
])

const toSlug = (value = '') => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const inferCategory = (path = '') => {
    if (path.startsWith('/api/auth')) return 'auth'
    if (
        path.startsWith('/api/orders') ||
        path.startsWith('/api/payments') ||
        path.startsWith('/api/refunds') ||
        path.startsWith('/api/pricing') ||
        path.startsWith('/api/coupons') ||
        path.startsWith('/api/loyalty') ||
        path.startsWith('/api/delivery')
    ) return 'order'
    if (path.startsWith('/api/shifts')) return 'shift'
    if (
        path.startsWith('/api/inventory') ||
        path.startsWith('/api/warehouses') ||
        path.startsWith('/api/purchases') ||
        path.startsWith('/api/purchase-orders') ||
        path.startsWith('/api/purchase-returns') ||
        path.startsWith('/api/stock-issues') ||
        path.startsWith('/api/transfers') ||
        path.startsWith('/api/suppliers')
    ) return 'inventory'
    if (
        path.startsWith('/api/settings') ||
        path.startsWith('/api/system') ||
        path.startsWith('/api/users') ||
        path.startsWith('/api/branches') ||
        path.startsWith('/api/devices') ||
        path.startsWith('/api/notifications') ||
        path.startsWith('/api/hr')
    ) return 'settings'

    return 'system'
}

const shouldAuditRequest = (req) => {
    const method = String(req.method || '').toUpperCase()
    const path = req.originalUrl || req.path || ''

    if (req.headers['x-skip-audit'] === '1') return false
    if (method === 'OPTIONS') return false
    if (EXCLUDED_EXACT.has(path)) return false
    if (EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false

    if (MUTATIVE_METHODS.has(method)) return true
    if (SENSITIVE_READ_PREFIXES.some((prefix) => path.startsWith(prefix))) return true
    return false
}

const resolveEntityType = (path = '') => {
    const parts = String(path || '').split('?')[0].split('/').filter(Boolean)
    // /api/<entity>/...
    if (parts[0] === 'api' && parts[1]) return parts[1]
    return parts[0] || 'system'
}

const activityAuditMiddleware = (req, res, next) => {
    const startedAt = Date.now()

    res.on('finish', () => {
        try {
            if (!shouldAuditRequest(req)) return

            const method = String(req.method || '').toUpperCase()
            const rawPath = req.originalUrl || req.path || ''
            const routePath = req.route?.path
                ? `${req.baseUrl || ''}${req.route.path}`
                : (req.path || rawPath)
            const category = inferCategory(rawPath)
            const resource = resolveEntityType(routePath)
            const action = `api_${method.toLowerCase()}_${toSlug(resource) || 'system'}`

            const metadata = {
                method,
                path: rawPath,
                route: routePath,
                status_code: res.statusCode,
                duration_ms: Date.now() - startedAt,
                query: req.query || {},
                params: req.params || {}
            }

            if (MUTATIVE_METHODS.has(method)) {
                metadata.body = req.body || {}
            }

            const actorUserId = req.user?.userId || null
            const actorUsername = req.user?.username || null
            const branchId = req.user?.branchId || req.body?.branch_id || req.query?.branch_id || null

            AuditService.log({
                userId: actorUserId,
                username: actorUsername,
                category,
                action,
                entityType: resource,
                entityId: req.params?.id || req.params?.userId || req.params?.orderId || null,
                branchId,
                metadata,
                req
            })
        } catch (_error) {
            // Never block request lifecycle for audit trail issues
        }
    })

    next()
}

module.exports = {
    activityAuditMiddleware
}

