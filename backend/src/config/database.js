const { Sequelize } = require('sequelize')
const path = require('path')
const logger = require('../services/logger')

// Determine database dialect from environment
const dialect = (process.env.DB_DIALECT || 'sqlite').trim()

let sequelize

if (dialect === 'mysql') {
    // ==================== MySQL Configuration ====================
    sequelize = new Sequelize(
        process.env.DB_NAME || 'pos_restaurant',
        process.env.DB_USER || 'root',
        process.env.DB_PASSWORD || '',
        {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            dialect: 'mysql',
            logging: process.env.NODE_ENV === 'development'
                ? (msg) => logger.debug(msg)
                : false,
            define: {
                underscored: true,
                timestamps: true,
                createdAt: 'created_at',
                updatedAt: 'updated_at',
                charset: 'utf8mb4',
                collate: 'utf8mb4_unicode_ci'
            },
            pool: {
                max: parseInt(process.env.DB_POOL_MAX) || 80,   // 10 branches x ~8 connections
                min: parseInt(process.env.DB_POOL_MIN) || 10,   // Keep warm connections
                acquire: 60000,    // Max time to get connection
                idle: 10000        // Max idle time before release
            },
            dialectOptions: {
                charset: 'utf8mb4',
                // Support for Arabic text and emojis
                supportBigNumbers: true,
                bigNumberStrings: true
            },
            timezone: '+00:00'     // UTC timezone
        }
    )
} else {
    // ==================== SQLite Configuration (Existing) ====================
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/restaurant.db')

    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: dbPath,
        logging: process.env.NODE_ENV === 'development'
            ? (msg) => logger.debug(msg)
            : false,
        define: {
            underscored: true,
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        },
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        // SQLite specific - handle concurrent writes
        retry: {
            max: 10
        }
    })
}

// Test database connection
const testConnection = async () => {
    try {
        await sequelize.authenticate()
        logger.info(`${dialect.toUpperCase()} database connected successfully`)
        return true
    } catch (error) {
        logger.error(`Unable to connect to ${dialect} database:`, error.message)
        throw error
    }
}

// Get current dialect
const getDialect = () => dialect

module.exports = { sequelize, testConnection, getDialect }
