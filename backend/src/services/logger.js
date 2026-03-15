const winston = require('winston')
require('winston-daily-rotate-file')
const Transport = require('winston-transport')
const path = require('path')
const { sendOpsAlert, isOpsAlertsEnabled } = require('./opsAlertService')

// Define log directory
const logDir = path.join(__dirname, '../../logs');

// Define log format
const { combine, timestamp, printf, colorize, json } = winston.format

// Custom log format for console
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message} `
    if (Object.keys(metadata).length > 0) {
        msg += JSON.stringify(metadata)
    }
    return msg
})

// Filter out sensitive data
const sensitiveKeys = ['password', 'token', 'refreshToken', 'creditCard', 'cvv', 'password_hash']
const redactSecrets = winston.format((info) => {
    const redact = (obj) => {
        if (!obj || typeof obj !== 'object') return obj
        Object.keys(obj).forEach(key => {
            if (sensitiveKeys.includes(key)) {
                obj[key] = '***REDACTED***'
            } else if (typeof obj[key] === 'object') {
                redact(obj[key])
            }
        })
        return obj
    }

    if (info) redact(info)
    return info
})

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        redactSecrets(),
        json()
    ),
    transports: [
        // Error logs - daily rotation
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            level: 'error',
        }),
        // Combined logs - daily rotation (all levels)
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
        }),
    ],
})

class OpsAlertTransport extends Transport {
    log(info, callback) {
        setImmediate(() => this.emit('logged', info))

        const { level, message, timestamp: _ts, ...metadata } = info || {}
        sendOpsAlert({
            level: level || 'error',
            message: typeof message === 'string' ? message : JSON.stringify(message || {}),
            metadata,
        }).catch((error) => {
            // Prevent alert failures from affecting business flow.
            console.error(`OPS alert delivery failed: ${error.message}`)
        })

        callback()
    }
}

if (isOpsAlertsEnabled()) {
    logger.add(new OpsAlertTransport({ level: 'error' }))
}

// If we're not in production then log to the `console` with simple format
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: combine(
            colorize(),
            timestamp({ format: 'HH:mm:ss' }),
            consoleFormat
        ),
    }))
}

// Create a stream object with a 'write' function that will be used by `morgan`
logger.stream = {
    write: (message) => {
        logger.info(message.trim())
    },
}

module.exports = logger
