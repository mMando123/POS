const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    order_number: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    order_type: {
        type: DataTypes.ENUM('online', 'walkin', 'delivery', 'dine_in', 'takeaway'),
        allowNull: false
    },
    status: {
        // New Kitchen-Cashier Handoff Workflow statuses
        type: DataTypes.ENUM(
            'pending',           // Online order waiting for admin approval
            'approved',          // Admin approved, ready for kitchen
            'new',               // POS order just created
            'confirmed',         // Legacy: kept for compatibility
            'preparing',         // Kitchen is preparing
            'ready',             // Kitchen finished, waiting for cashier
            'handed_to_cashier', // Cashier received the order
            'completed',         // Order delivered/finalized
            'cancelled'          // Order cancelled
        ),
        defaultValue: 'new'
    },
    customer_id: {
        type: DataTypes.UUID
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    user_id: {
        type: DataTypes.UUID
    },
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    tax: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    discount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    payment_method: {
        type: DataTypes.ENUM('cash', 'card', 'online', 'multi'),
        defaultValue: 'cash'
    },
    payment_status: {
        type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded', 'partially_refunded'),
        defaultValue: 'pending'
    },
    price_list_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    promotion_discount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    loyalty_discount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    loyalty_points_redeemed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    loyalty_points_earned: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    client_reference: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT
    },
    // New fields for tracking workflow
    delivery_person: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    delivery_personnel_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    delivery_status: {
        type: DataTypes.ENUM('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'),
        allowNull: true
    },
    delivery_assigned_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    picked_up_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    delivered_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    table_number: {
        type: DataTypes.STRING(30),
        allowNull: true
    },
    delivery_address: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    delivery_fee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
    },
    // Audit: who approved the order
    approved_by: {
        type: DataTypes.UUID,
        allowNull: true
    },
    approved_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    ready_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    handed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'orders',
    timestamps: true,
    underscored: true,
    validate: {
        completedOrderMustBeSettled() {
            if (this.status === 'completed' && this.payment_status === 'pending') {
                throw new Error('ORDER_INTEGRITY_ERROR: Completed orders cannot have pending payment status')
            }
        }
    }
})

module.exports = Order

