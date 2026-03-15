#!/usr/bin/env node
/**
 * POS v9.1+ migration
 * Adds pricing/loyalty schema:
 * - customers.loyalty_points
 * - orders.price_list_id, promotion_discount, loyalty_discount, loyalty points fields
 * - order_items.batch_number
 * - price_lists
 * - price_list_items
 * - promotion_rules
 * - loyalty_ledger
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

const ensureColumn = async (queryInterface, tableName, columnName, definition) => {
    if (!(await tableExists(queryInterface, tableName))) return
    const desc = await queryInterface.describeTable(tableName)
    if (desc[columnName]) {
        console.log(`${tableName}.${columnName} already exists`)
        return
    }
    await queryInterface.addColumn(tableName, columnName, definition)
    console.log(`Added ${tableName}.${columnName}`)
}

const ensureIndex = async (queryInterface, tableName, fields, name, unique = false) => {
    try {
        await queryInterface.addIndex(tableName, fields, { name, unique })
        console.log(`Added index ${name}`)
    } catch (_) {
        console.log(`Index ${name} already exists or could not be created`)
    }
}

async function ensurePricingTables(qi) {
    if (!(await tableExists(qi, 'price_lists'))) {
        await qi.createTable('price_lists', {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
            name: { type: DataTypes.STRING(120), allowNull: false },
            description: { type: DataTypes.TEXT, allowNull: true },
            branch_id: { type: DataTypes.UUID, allowNull: true },
            priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            auto_apply: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            starts_at: { type: DataTypes.DATE, allowNull: true },
            ends_at: { type: DataTypes.DATE, allowNull: true },
            is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        })
        console.log('Created price_lists')
    } else {
        console.log('price_lists already exists')
    }

    if (!(await tableExists(qi, 'price_list_items'))) {
        await qi.createTable('price_list_items', {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
            price_list_id: { type: DataTypes.UUID, allowNull: false },
            menu_id: { type: DataTypes.UUID, allowNull: false },
            price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            min_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
            is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        })
        console.log('Created price_list_items')
    } else {
        console.log('price_list_items already exists')
    }

    if (!(await tableExists(qi, 'promotion_rules'))) {
        await qi.createTable('promotion_rules', {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
            name: { type: DataTypes.STRING(120), allowNull: false },
            description: { type: DataTypes.TEXT, allowNull: true },
            branch_id: { type: DataTypes.UUID, allowNull: true },
            applies_to: { type: DataTypes.ENUM('order', 'item'), allowNull: false, defaultValue: 'order' },
            menu_id: { type: DataTypes.UUID, allowNull: true },
            discount_type: { type: DataTypes.ENUM('percent', 'fixed'), allowNull: false, defaultValue: 'percent' },
            discount_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
            min_order_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
            min_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
            max_discount_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
            stackable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            starts_at: { type: DataTypes.DATE, allowNull: true },
            ends_at: { type: DataTypes.DATE, allowNull: true },
            is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        })
        console.log('Created promotion_rules')
    } else {
        console.log('promotion_rules already exists')
    }

    if (!(await tableExists(qi, 'loyalty_ledger'))) {
        await qi.createTable('loyalty_ledger', {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
            customer_id: { type: DataTypes.UUID, allowNull: false },
            order_id: { type: DataTypes.UUID, allowNull: true },
            branch_id: { type: DataTypes.UUID, allowNull: true },
            entry_type: { type: DataTypes.ENUM('earn', 'redeem', 'adjust'), allowNull: false },
            points: { type: DataTypes.INTEGER, allowNull: false },
            notes: { type: DataTypes.TEXT, allowNull: true },
            created_by: { type: DataTypes.UUID, allowNull: true },
            expires_at: { type: DataTypes.DATE, allowNull: true },
            created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        })
        console.log('Created loyalty_ledger')
    } else {
        console.log('loyalty_ledger already exists')
    }

    await ensureIndex(qi, 'price_lists', ['branch_id'], 'price_lists_branch_idx')
    await ensureIndex(qi, 'price_lists', ['is_active'], 'price_lists_active_idx')
    await ensureIndex(qi, 'price_lists', ['priority'], 'price_lists_priority_idx')
    await ensureIndex(qi, 'price_list_items', ['price_list_id'], 'price_list_items_list_idx')
    await ensureIndex(qi, 'price_list_items', ['menu_id'], 'price_list_items_menu_idx')
    await ensureIndex(qi, 'price_list_items', ['price_list_id', 'menu_id', 'min_quantity'], 'price_list_items_unique_tier', true)
    await ensureIndex(qi, 'promotion_rules', ['branch_id'], 'promotion_rules_branch_idx')
    await ensureIndex(qi, 'promotion_rules', ['menu_id'], 'promotion_rules_menu_idx')
    await ensureIndex(qi, 'promotion_rules', ['is_active'], 'promotion_rules_active_idx')
    await ensureIndex(qi, 'loyalty_ledger', ['customer_id'], 'loyalty_ledger_customer_idx')
    await ensureIndex(qi, 'loyalty_ledger', ['order_id'], 'loyalty_ledger_order_idx')
    await ensureIndex(qi, 'loyalty_ledger', ['entry_type'], 'loyalty_ledger_type_idx')
}

async function run() {
    await sequelize.authenticate()
    console.log('Connected to database')

    const qi = sequelize.getQueryInterface()

    await ensureColumn(qi, 'customers', 'loyalty_points', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    })

    await ensureColumn(qi, 'orders', 'price_list_id', {
        type: DataTypes.UUID,
        allowNull: true
    })
    await ensureColumn(qi, 'orders', 'promotion_discount', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    })
    await ensureColumn(qi, 'orders', 'loyalty_discount', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    })
    await ensureColumn(qi, 'orders', 'loyalty_points_redeemed', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    })
    await ensureColumn(qi, 'orders', 'loyalty_points_earned', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    })

    await ensureColumn(qi, 'order_items', 'batch_number', {
        type: DataTypes.STRING(50),
        allowNull: true
    })

    await ensurePricingTables(qi)

    await ensureIndex(qi, 'orders', ['price_list_id'], 'orders_price_list_idx')
    await ensureIndex(qi, 'customers', ['loyalty_points'], 'customers_loyalty_points_idx')
    await ensureIndex(qi, 'order_items', ['batch_number'], 'order_items_batch_idx')

    console.log('POS v9.1+ migration completed')
}

if (require.main === module) {
    run()
        .then(async () => {
            try { await sequelize.close() } catch (_) { }
            process.exit(0)
        })
        .catch(async (err) => {
            console.error('POS v9.1+ migration failed:', err.message)
            try { await sequelize.close() } catch (_) { }
            process.exit(1)
        })
}

module.exports = { run }

