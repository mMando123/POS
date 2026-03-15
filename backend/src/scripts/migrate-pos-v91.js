#!/usr/bin/env node
/**
 * POS v9.1 migration
 * - Adds split tender support table: order_payments
 * - Adds POS opening/closing artifacts tables
 * - Adds coupons table
 * - Adds orders.client_reference
 * - Expands orders.payment_method/payment_status enums on MySQL
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize } = require('../models')
const { DataTypes } = require('sequelize')

const normalizeTableName = (entry) => {
    if (!entry) return ''
    if (typeof entry === 'string') return entry
    return entry.tableName || entry.TABLE_NAME || Object.values(entry)[0]
}

const tableExists = async (queryInterface, name) => {
    const tables = await queryInterface.showAllTables()
    return tables.map(normalizeTableName).includes(name)
}

const columnExists = async (queryInterface, table, column) => {
    const desc = await queryInterface.describeTable(table)
    return Boolean(desc[column])
}

async function ensureOrdersColumnsAndEnums(queryInterface) {
    if (!(await columnExists(queryInterface, 'orders', 'client_reference'))) {
        await queryInterface.addColumn('orders', 'client_reference', {
            type: DataTypes.STRING(100),
            allowNull: true
        })
        console.log('Added orders.client_reference')
    } else {
        console.log('orders.client_reference already exists')
    }

    try {
        await queryInterface.addIndex('orders', ['client_reference'], {
            name: 'orders_client_reference_idx'
        })
        console.log('Added orders_client_reference_idx')
    } catch (_) {
        console.log('orders_client_reference_idx already exists or could not be created')
    }

    try {
        await queryInterface.addIndex('orders', ['branch_id', 'client_reference'], {
            name: 'orders_branch_client_reference_idx'
        })
        console.log('Added orders_branch_client_reference_idx')
    } catch (_) {
        console.log('orders_branch_client_reference_idx already exists or could not be created')
    }

    if (sequelize.getDialect() === 'mysql') {
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')
        try {
            await sequelize.query(`
                ALTER TABLE orders
                MODIFY payment_method ENUM('cash','card','online','multi') DEFAULT 'cash'
            `)
            await sequelize.query(`
                ALTER TABLE orders
                MODIFY payment_status ENUM('pending','paid','failed','refunded','partially_refunded') DEFAULT 'pending'
            `)
            console.log('Expanded orders enums for payment_method/payment_status')
        } finally {
            await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
        }
    } else {
        console.log('Skipped enum ALTER (non-MySQL dialect)')
    }
}

async function ensureOrderPaymentsTable(queryInterface) {
    if (await tableExists(queryInterface, 'order_payments')) {
        console.log('order_payments already exists')
        return
    }

    await queryInterface.createTable('order_payments', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        order_id: { type: DataTypes.UUID, allowNull: false },
        shift_id: { type: DataTypes.INTEGER, allowNull: true },
        branch_id: { type: DataTypes.UUID, allowNull: false },
        payment_method: { type: DataTypes.ENUM('cash', 'card', 'online'), allowNull: false },
        amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        reference: { type: DataTypes.STRING(100), allowNull: true },
        processed_by: { type: DataTypes.UUID, allowNull: true },
        notes: { type: DataTypes.TEXT, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    })

    await queryInterface.addIndex('order_payments', ['order_id'], { name: 'order_payments_order_idx' })
    await queryInterface.addIndex('order_payments', ['shift_id'], { name: 'order_payments_shift_idx' })
    await queryInterface.addIndex('order_payments', ['branch_id'], { name: 'order_payments_branch_idx' })
    await queryInterface.addIndex('order_payments', ['payment_method'], { name: 'order_payments_method_idx' })
    await queryInterface.addIndex('order_payments', ['created_at'], { name: 'order_payments_created_idx' })
    console.log('Created order_payments')
}

async function ensurePOSOpeningTable(queryInterface) {
    if (await tableExists(queryInterface, 'pos_opening_entries')) {
        console.log('pos_opening_entries already exists')
        return
    }

    await queryInterface.createTable('pos_opening_entries', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        shift_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        branch_id: { type: DataTypes.UUID, allowNull: false },
        user_id: { type: DataTypes.UUID, allowNull: false },
        opening_cash: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        status: { type: DataTypes.ENUM('open', 'closed'), allowNull: false, defaultValue: 'open' },
        opened_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        notes: { type: DataTypes.TEXT, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    })

    await queryInterface.addIndex('pos_opening_entries', ['shift_id'], { name: 'pos_open_shift_idx', unique: true })
    await queryInterface.addIndex('pos_opening_entries', ['branch_id'], { name: 'pos_open_branch_idx' })
    await queryInterface.addIndex('pos_opening_entries', ['user_id'], { name: 'pos_open_user_idx' })
    console.log('Created pos_opening_entries')
}

async function ensurePOSClosingTable(queryInterface) {
    if (await tableExists(queryInterface, 'pos_closing_entries')) {
        console.log('pos_closing_entries already exists')
        return
    }

    await queryInterface.createTable('pos_closing_entries', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        shift_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        opening_entry_id: { type: DataTypes.UUID, allowNull: true },
        branch_id: { type: DataTypes.UUID, allowNull: false },
        closed_by: { type: DataTypes.UUID, allowNull: true },
        expected_cash: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        actual_cash: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        variance: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        gross_sales: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        cash_sales: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        card_sales: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        online_sales: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        order_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        closed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        notes: { type: DataTypes.TEXT, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    })

    await queryInterface.addIndex('pos_closing_entries', ['shift_id'], { name: 'pos_close_shift_idx', unique: true })
    await queryInterface.addIndex('pos_closing_entries', ['branch_id'], { name: 'pos_close_branch_idx' })
    await queryInterface.addIndex('pos_closing_entries', ['closed_by'], { name: 'pos_close_user_idx' })
    console.log('Created pos_closing_entries')
}

async function ensureCouponsTable(queryInterface) {
    if (await tableExists(queryInterface, 'coupons')) {
        console.log('coupons already exists')
        return
    }

    await queryInterface.createTable('coupons', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
        name: { type: DataTypes.STRING(120), allowNull: false },
        discount_type: { type: DataTypes.ENUM('percent', 'fixed'), allowNull: false, defaultValue: 'percent' },
        discount_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        min_order_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        max_discount_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
        starts_at: { type: DataTypes.DATE, allowNull: true },
        ends_at: { type: DataTypes.DATE, allowNull: true },
        usage_limit: { type: DataTypes.INTEGER, allowNull: true },
        used_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        branch_id: { type: DataTypes.UUID, allowNull: true },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        created_by: { type: DataTypes.UUID, allowNull: true },
        notes: { type: DataTypes.TEXT, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    })

    await queryInterface.addIndex('coupons', ['code'], { name: 'coupons_code_idx', unique: true })
    await queryInterface.addIndex('coupons', ['branch_id'], { name: 'coupons_branch_idx' })
    await queryInterface.addIndex('coupons', ['is_active'], { name: 'coupons_active_idx' })
    await queryInterface.addIndex('coupons', ['starts_at', 'ends_at'], { name: 'coupons_window_idx' })
    console.log('Created coupons')
}

async function run() {
    await sequelize.authenticate()
    console.log('Connected to database')

    const qi = sequelize.getQueryInterface()

    await ensureOrdersColumnsAndEnums(qi)
    await ensureOrderPaymentsTable(qi)
    await ensurePOSOpeningTable(qi)
    await ensurePOSClosingTable(qi)
    await ensureCouponsTable(qi)

    console.log('POS v9.1 migration completed')
}

if (require.main === module) {
    run()
        .then(async () => {
            try { await sequelize.close() } catch (_) { }
            process.exit(0)
        })
        .catch(async (err) => {
            console.error('POS v9.1 migration failed:', err.message)
            try { await sequelize.close() } catch (_) { }
            process.exit(1)
        })
}

module.exports = { run }
