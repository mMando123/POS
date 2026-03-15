/**
 * IdempotencyKey Model
 * 
 * Prevents duplicate financial operations by tracking unique request keys.
 * Each financial endpoint (order creation, payment confirmation) requires
 * an X-Idempotency-Key header. If a key was already processed, the original
 * response is returned without re-executing the operation.
 * 
 * Keys expire after 24 hours to prevent unbounded growth.
 * 
 * CRITICAL FINANCIAL SAFETY: This model is part of the financial integrity layer.
 * Do NOT disable or bypass idempotency checks on financial endpoints.
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const IdempotencyKey = sequelize.define('IdempotencyKey', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // The idempotency key value sent by the client
    key: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    // Which endpoint this key was used on
    endpoint: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'The route path this key was used on (e.g. POST /api/orders)'
    },
    // HTTP method
    method: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'POST'
    },
    // The HTTP status code of the original response
    response_status: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // The response body (JSON stringified)
    response_body: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        get() {
            const raw = this.getDataValue('response_body')
            if (!raw) return null
            try {
                return JSON.parse(raw)
            } catch {
                return raw
            }
        },
        set(value) {
            if (value === null || value === undefined) {
                this.setDataValue('response_body', null)
            } else if (typeof value === 'object') {
                this.setDataValue('response_body', JSON.stringify(value))
            } else {
                this.setDataValue('response_body', String(value))
            }
        }
    },
    // Status: 'processing' while in-flight, 'completed' when done
    status: {
        type: DataTypes.ENUM('processing', 'completed', 'failed'),
        defaultValue: 'processing'
    },
    // User who made the request
    user_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    // Expiry time (24 hours from creation)
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => {
            const d = new Date()
            d.setHours(d.getHours() + 24)
            return d
        }
    }
}, {
    tableName: 'idempotency_keys',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['key'],
            name: 'idempotency_key_unique'
        },
        {
            fields: ['expires_at'],
            name: 'idempotency_expires_idx'
        },
        {
            fields: ['user_id'],
            name: 'idempotency_user_idx'
        }
    ]
})

module.exports = IdempotencyKey
