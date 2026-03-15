require('dotenv').config()
const { Sequelize } = require('sequelize')
const path = require('path')

// Helper for logs
const log = (msg, type = 'info') => {
    const colors = { info: '\x1b[36m', success: '\x1b[32m', error: '\x1b[31m', reset: '\x1b[0m' }
    console.log(`${colors[type] || ''}${msg}${colors.reset}`)
}

const SQLITE_DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/restaurant.db')

const main = async () => {
    log('Starting Migration Verification...', 'info')

    if (process.env.DB_DIALECT !== 'mysql') {
        log('Error: DB_DIALECT must be set to "mysql" for verification to connect to target.', 'error')
        process.exit(1)
    }

    const sqlite = new Sequelize({
        dialect: 'sqlite',
        storage: SQLITE_DB_PATH,
        logging: false
    })

    const mysql = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            dialect: 'mysql',
            logging: false
        }
    )

    try {
        await sqlite.authenticate()
        await mysql.authenticate()

        const tables = [
            'branches', 'users', 'categories', 'menu', 'customers',
            'shifts', 'orders', 'order_items', 'payment_gateways',
            'warehouses', 'stock', 'stock_movements', 'purchase_receipts',
            'stock_transfers', 'notifications'
        ]

        let errors = 0

        for (const table of tables) {
            log(`Checking table: ${table}...`)

            // Check count
            const [sqliteCount] = await sqlite.query(`SELECT COUNT(*) as count FROM ${table}`)
            const [mysqlCount] = await mysql.query(`SELECT COUNT(*) as count FROM ${table}`)

            const count1 = sqliteCount[0].count
            const count2 = mysqlCount[0].count

            if (count1 !== count2) {
                log(`Mismatch in ${table}: SQLite=${count1}, MySQL=${count2}`, 'error')
                errors++
            } else {
                log(`Count matched for ${table}: ${count1}`, 'success')
            }

            // Check first and last record ID if table not empty
            if (count1 > 0) {
                const [rows1] = await sqlite.query(`SELECT id FROM ${table} ORDER BY created_at ASC LIMIT 1`)
                const [rows2] = await mysql.query(`SELECT id FROM ${table} ORDER BY created_at ASC LIMIT 1`)

                if (rows1[0].id !== rows2[0].id) {
                    log(`First record ID mismatch in ${table}`, 'error')
                    errors++
                }
            }
        }

        if (errors === 0) {
            log('Verification PASSED! All counts match.', 'success')
        } else {
            log(`Verification FAILED with ${errors} errors.`, 'error')
        }

    } catch (error) {
        log('Verification Error: ' + error.message, 'error')
    } finally {
        await sqlite.close()
        await mysql.close()
    }
}

main()
