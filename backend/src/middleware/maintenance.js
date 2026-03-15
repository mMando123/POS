/**
 * Maintenance Mode Middleware
 * Blocks all write operations during database migration
 */

const fs = require('fs')
const path = require('path')

// Maintenance mode flag file
const maintenanceFlagFile = path.join(__dirname, '../../data/.maintenance')

/**
 * Check if maintenance mode is active
 */
const isMaintenanceMode = () => {
    return fs.existsSync(maintenanceFlagFile)
}

/**
 * Enable maintenance mode
 */
const enableMaintenanceMode = (reason = 'Database migration in progress') => {
    const data = JSON.stringify({
        enabled: true,
        reason,
        startedAt: new Date().toISOString()
    })
    fs.writeFileSync(maintenanceFlagFile, data)
    return true
}

/**
 * Disable maintenance mode
 */
const disableMaintenanceMode = () => {
    if (fs.existsSync(maintenanceFlagFile)) {
        fs.unlinkSync(maintenanceFlagFile)
    }
    return true
}

/**
 * Get maintenance status
 */
const getMaintenanceStatus = () => {
    if (!isMaintenanceMode()) {
        return { enabled: false }
    }
    try {
        const data = JSON.parse(fs.readFileSync(maintenanceFlagFile, 'utf8'))
        return data
    } catch {
        return { enabled: true, reason: 'Unknown' }
    }
}

/**
 * Middleware to block write operations during maintenance
 */
const maintenanceMiddleware = (req, res, next) => {
    // Allow GET requests (read-only)
    if (req.method === 'GET') {
        return next()
    }

    // Check maintenance mode for write operations
    if (isMaintenanceMode()) {
        const status = getMaintenanceStatus()
        return res.status(503).json({
            success: false,
            message: 'النظام قيد الصيانة، يرجى الانتظار...',
            message_en: 'System is under maintenance, please wait...',
            reason: status.reason,
            startedAt: status.startedAt
        })
    }

    next()
}

/**
 * Middleware for critical operations only (more strict)
 */
const strictMaintenanceMiddleware = (req, res, next) => {
    if (isMaintenanceMode()) {
        const status = getMaintenanceStatus()
        return res.status(503).json({
            success: false,
            message: 'النظام قيد الصيانة، يرجى الانتظار...',
            message_en: 'System is under maintenance, please wait...',
            reason: status.reason,
            startedAt: status.startedAt
        })
    }
    next()
}

module.exports = {
    isMaintenanceMode,
    enableMaintenanceMode,
    disableMaintenanceMode,
    getMaintenanceStatus,
    maintenanceMiddleware,
    strictMaintenanceMiddleware
}
