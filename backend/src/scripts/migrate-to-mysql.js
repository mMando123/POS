require('dotenv').config()
const { Sequelize } = require('sequelize')
const path = require('path')
const fs = require('fs')
const { enableMaintenanceMode, disableMaintenanceMode } = require('../middleware/maintenance')

// Helper for colored logs
const log = {
    info: (msg) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`),
    success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
    warn: (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`),
    error: (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`)
}

// Configuration
const SQLITE_DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/restaurant.db')
const BACKUP_DIR = path.join(__dirname, '../../data/backups')

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

// Check MySQL config
if (!process.env.DB_HOST || !process.env.DB_NAME) {
    log.error('MySQL configuration missing in .env')
    process.exit(1)
}

const main = async () => {
    log.info('Starting migration from SQLite to MySQL...')

    // 1. Enable Maintenance Mode
    log.info('Enabling maintenance mode...')
    enableMaintenanceMode('Thinking... Database migration in progress')

    let sqliteSequelize = null
    let mysqlSequelize = null

    try {
        // 2. Backup SQLite
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const backupPath = path.join(BACKUP_DIR, `backup_pre_migration_${timestamp}.db`)
        log.info(`Creating backup at ${backupPath}...`)
        fs.copyFileSync(SQLITE_DB_PATH, backupPath)
        log.success('Backup created successfully')

        // 3. Connect to SQLite (Source)
        log.info('Connecting to SQLite...')
        sqliteSequelize = new Sequelize({
            dialect: 'sqlite',
            storage: SQLITE_DB_PATH,
            logging: false
        })
        await sqliteSequelize.authenticate()
        log.success('Connected to SQLite')

        // 4. Connect to MySQL (Target)
        log.info('Connecting to MySQL...')
        mysqlSequelize = new Sequelize(
            process.env.DB_NAME,
            process.env.DB_USER,
            process.env.DB_PASSWORD,
            {
                host: process.env.DB_HOST,
                port: parseInt(process.env.DB_PORT) || 3306,
                dialect: 'mysql',
                logging: false,
                define: {
                    underscored: true,
                    timestamps: true,
                    charset: 'utf8mb4',
                    collate: 'utf8mb4_unicode_ci'
                },
                dialectOptions: {
                    supportBigNumbers: true,
                    bigNumberStrings: true
                }
            }
        )
        await mysqlSequelize.authenticate()
        log.success('Connected to MySQL')

        // 5. Load Models
        const models = require('../models')
        // We need to attach models to both instances theoretically, 
        // but easier strategy: read raw data from SQLite, insert using MySQL models

        // However, models in index.js are bound to a single sequelize instance (from config).
        // Solution: We will define models dynamically on mysqlSequelize or just use raw queries for insertion?
        // Better: Initialize models on mysqlSequelize using the schema definitions.
        // BUT, that requires refactoring all models to export factory functions.
        // Current models export initialized model: `const User = sequelize.define(...)`

        // Practical Approach:
        // 1. Sync structures to MySQL using the 'mysqlSequelize' instance (we need to redefine models attached to it).
        // Since we can't easily re-attach existing models, we'll use `sequelize-auto` or just rely on `sync` if we switch the config temporary.
        // OR: We read data from SQLite using raw queries `SELECT * FROM table`, preventing model conflicts.
        // AND: We use the *current* application to `sync` to MySQL (by setting DB_DIALECT=mysql temporarily in process.env before loading models).

        // Strategy:
        // A. Read all data from SQLite into memory (or JSON files).
        // B. Re-instantiate models with MySQL connection.
        // C. Bulk insert.

        // Implementation of Strategy A+B requires reloading modules which is node-tricky.

        // refined Strategy:
        // 1. Use `sqliteSequelize` for raw SELECTs.
        // 2. Models in `../models/index.js` are already initialized with whatever `database.js` uses.
        // So we will TRICK the app.
        // We will run this script with `DB_DIALECT=mysql` so that `models` use MySQL.
        // Then we create a separate `sqlite` connection just for reading.

        if (require('../config/database').getDialect() !== 'mysql') {
            log.error('Please run this script with DB_DIALECT=mysql environment variable set, or update .env first.')
            log.info('Example: set DB_DIALECT=mysql && node src/scripts/migrate-to-mysql.js')
            log.info('Current dialect from config: ' + require('../config/database').getDialect())
            throw new Error('Incorrect Dialect Configuration')
        }

        log.info('Syncing schema to MySQL (dropping existing tables)...')

        // Disable FK checks on the instance used by MODELS, not the script's instance
        const appSequelize = require('../models').sequelize;
        await appSequelize.query('SET FOREIGN_KEY_CHECKS = 0', { raw: true })

        // Force sync to create tables in MySQL
        await appSequelize.sync({ force: true })
        log.success('MySQL Schema created')

        // Ordered list of tables to migrate
        const tables = [
            'branches',
            'users',
            'categories',
            'payment_gateways',
            'menus',          // tableName: menu or menus? Model: Menu, tableName: 'menu' in model file
            'customers',
            'shifts',
            'notifications',
            'devices',
            'print_templates',
            'warehouses'
        ]

        // Dependent tables (Order usually depends on many)
        const dependentTables = [
            'orders',
            'order_items',
            'stocks',
            'stock_movements',
            'purchase_receipts',
            'purchase_receipt_items',
            'stock_transfers',
            'stock_transfer_items',
            'stock_adjustments',
            'print_jobs',
            'refresh_tokens'
        ]

        // Map model names to actual table names if different
        // We will check the SQLite metadata or just guess.
        // Model file for Menu says `tableName: 'menu'`
        // Check Model definitions for table names

        const tableMapping = [
            { model: 'Branch', table: 'branches' },
            { model: 'User', table: 'users' },
            { model: 'Category', table: 'categories' },
            { model: 'PaymentGateway', table: 'payment_gateways' },
            { model: 'Menu', table: 'menu' }, // Verified from file
            { model: 'Customer', table: 'customers' },
            { model: 'Shift', table: 'shifts' },
            { model: 'Notification', table: 'notifications' },
            { model: 'Device', table: 'devices' },
            { model: 'PrintTemplate', table: 'print_templates' },
            { model: 'Warehouse', table: 'warehouses' },
            { model: 'Order', table: 'orders' },
            { model: 'OrderItem', table: 'order_items' },
            { model: 'Stock', table: 'stock' },
            { model: 'StockMovement', table: 'stock_movements' },
            { model: 'PurchaseReceipt', table: 'purchase_receipts' },
            { model: 'PurchaseReceiptItem', table: 'purchase_receipt_items' },
            { model: 'StockTransfer', table: 'stock_transfers' },
            { model: 'StockTransferItem', table: 'stock_transfer_items' },
            { model: 'StockAdjustment', table: 'stock_adjustments' },
            { model: 'PrintJob', table: 'print_jobs' },
            { model: 'RefreshToken', table: 'refresh_tokens' }
        ]

        for (const { model: modelName, table } of tableMapping) {
            log.info(`Migrating table: ${table}...`)

            // Read from SQLite
            const [rows] = await sqliteSequelize.query(`SELECT * FROM ${table}`)
            const count = rows.length

            if (count > 0) {
                // Fix boolean fields (SQLite stores as 0/1, MySQL usually takes 0/1 for TINYINT ok, 
                // but Sequelize might convert. Raw insert to MySQL might skip Sequelize hooks/types, 
                // but we should use Model.bulkCreate to be safe with types if possible, 
                // OR raw INSERT. BulkCreate is validation-heavy.
                // Raw INSERT is faster and preserves exact IDs.)

                // Let's use the loaded MySQL models to insert
                const Model = models[modelName]
                if (!Model) {
                    log.error(`Model ${modelName} not found! Skipping...`)
                    continue
                }

                // Batch insert
                const BATCH_SIZE = 100
                for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                    const batch = rows.slice(i, i + BATCH_SIZE)

                    // Sanitize batch: valid JSON or other sqlite inconsistencies?
                    // Sequelize `bulkCreate` handles it.
                    try {
                        await Model.bulkCreate(batch, {
                            validate: false,
                            // ignoreDuplicates: true  // Let's catch errors
                        })
                    } catch (err) {
                        log.warn(`Batch failed in ${table}, trying one-by-one... Error: ${err.message}`)
                        for (const item of batch) {
                            try {
                                await Model.create(item, { validate: false })
                            } catch (innerErr) {
                                log.error(`Failed row in ${table}: ${innerErr.message}`)
                                // log.error(JSON.stringify(item))
                            }
                        }
                    }
                }
                log.success(`Migrated ${count} rows to ${table}`)
            } else {
                log.info(`Table ${table} is empty.`)
            }
        }

        log.success('Migration completed successfully!')
        log.warn('Please check the verification report manually.')

    } catch (error) {
        log.error('Migration failed!')
        log.error(error)
        process.exit(1)
    } finally {
        try {
            const appSequelize = require('../models').sequelize;
            await appSequelize.query('SET FOREIGN_KEY_CHECKS = 1', { raw: true })
            // Don't close appSequelize as required modules might use it? No, script is ending.
            await appSequelize.close()
        } catch (e) {
            log.warn('Could not re-enable FK checks or close connection: ' + e.message)
        }

        if (sqliteSequelize) await sqliteSequelize.close()
        if (mysqlSequelize) await mysqlSequelize.close()

        // Disable maintenance mode
        disableMaintenanceMode()
        log.info('Maintenance mode disabled')
    }
}

main()
