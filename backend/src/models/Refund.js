const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

/**
 * Refund Model - Tracks all refunds/returns in the system
 * This is a compensating transaction model - it NEVER modifies original orders
 * All refunds create negative entries for accurate financial tracking
 */
const Refund = sequelize.define('Refund', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    refund_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
        comment: 'Human-readable refund reference (e.g., REF-2026-0001)'
    },
    order_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Original order being refunded'
    },
    refund_type: {
        type: DataTypes.ENUM('FULL_REFUND', 'PARTIAL_REFUND', 'VOID'),
        allowNull: false,
        comment: 'FULL_REFUND: entire order, PARTIAL_REFUND: some items, VOID: cancelled before prep'
    },
    refund_reason: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Mandatory reason for audit trail'
    },
    refund_category: {
        type: DataTypes.ENUM(
            'customer_request',      // Customer changed mind
            'quality_issue',         // Food quality problem
            'wrong_order',           // Wrong items delivered
            'delivery_issue',        // Delivery problem
            'payment_issue',         // Payment-related
            'duplicate_order',       // Accidental duplicate
            'system_error',          // Technical issue
            'other'                  // Other reasons
        ),
        defaultValue: 'customer_request'
    },
    // Financial Data (Immutable snapshot)
    original_order_total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Original order total at time of refund'
    },
    refund_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Amount being refunded (negative for deduction)'
    },
    refund_tax: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        comment: 'Tax portion of refund'
    },
    // Linkage to financial records
    original_shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Shift of original order (for audit)'
    },
    refund_shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Current shift when refund was processed'
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    // Who processed the refund
    processed_by: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'User who processed the refund (admin/supervisor)'
    },
    // Original cashier (for accountability)
    original_cashier_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Cashier who created original order'
    },
    // Status tracking
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'completed', 'rejected'),
        defaultValue: 'completed',
        comment: 'Refund approval status'
    },
    // Stock restoration flag
    stock_restored: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether stock has been added back'
    },
    // Customer notification (for online orders)
    customer_notified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    notification_sent_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Audit trail
    ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
    },
    user_agent: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    // Snapshot of order at refund time (for legal/audit purposes)
    order_snapshot: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Complete order state at time of refund'
    }
}, {
    tableName: 'refunds',
    timestamps: true,
    underscored: true,
    paranoid: true, // Soft delete - refunds are NEVER truly deleted
    indexes: [
        { fields: ['order_id'], name: 'refunds_order_idx' },
        { fields: ['processed_by'], name: 'refunds_processor_idx' },
        { fields: ['branch_id'], name: 'refunds_branch_idx' },
        { fields: ['refund_type'], name: 'refunds_type_idx' },
        { fields: ['created_at'], name: 'refunds_date_idx' },
        { fields: ['original_shift_id'], name: 'refunds_orig_shift_idx' },
        { fields: ['refund_shift_id'], name: 'refunds_curr_shift_idx' }
    ]
})

module.exports = Refund
