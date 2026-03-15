/**
 * Complete fix for shifts and orders tables
 * This will recreate both tables with correct schema
 */

const { sequelize } = require('./src/config/database')

async function fixTables() {
    console.log('Starting complete table fix...')

    try {
        // Drop orders table (depends on shifts)
        console.log('Dropping orders table...')
        await sequelize.query('DROP TABLE IF EXISTS orders')

        // Drop shifts table
        console.log('Dropping shifts table...')
        await sequelize.query('DROP TABLE IF EXISTS shifts')

        // Recreate shifts table with correct UUID types
        console.log('Creating shifts table with correct schema...')
        await sequelize.query(`
            CREATE TABLE shifts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                branch_id TEXT,
                user_id TEXT NOT NULL,
                start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                starting_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
                ending_cash DECIMAL(10,2),
                expected_cash DECIMAL(10,2),
                cash_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
                card_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
                notes TEXT,
                order_count INTEGER NOT NULL DEFAULT 0,
                reviewed_by TEXT,
                review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending', 'approved', 'flagged')),
                review_notes TEXT,
                reviewed_at DATETIME,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Recreate orders table with correct schema
        console.log('Creating orders table with correct schema...')
        await sequelize.query(`
            CREATE TABLE orders (
                id TEXT PRIMARY KEY,
                order_number VARCHAR(20) NOT NULL,
                order_type TEXT NOT NULL CHECK(order_type IN ('online', 'walkin', 'delivery')),
                status TEXT DEFAULT 'new' CHECK(status IN ('new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
                customer_id TEXT,
                branch_id TEXT NOT NULL,
                user_id TEXT,
                shift_id INTEGER,
                subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
                tax DECIMAL(10,2) DEFAULT 0,
                discount DECIMAL(10,2) DEFAULT 0,
                total DECIMAL(10,2) NOT NULL DEFAULT 0,
                payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash', 'card', 'online')),
                payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'refunded')),
                notes TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (shift_id) REFERENCES shifts(id)
            )
        `)

        // Create order_items table
        console.log('Creating order_items table...')
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                menu_id TEXT NOT NULL,
                item_name_ar VARCHAR(100),
                item_name_en VARCHAR(100),
                quantity INTEGER NOT NULL DEFAULT 1,
                unit_price DECIMAL(10,2) NOT NULL,
                total_price DECIMAL(10,2) NOT NULL,
                notes TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        `)

        console.log('✅ Tables recreated successfully!')
        console.log('')
        console.log('IMPORTANT:')
        console.log('- All shifts and orders have been cleared')
        console.log('- Menu items, users, and categories are preserved')
        console.log('- You can now open a new shift and create orders')
        console.log('- Orders will now correctly link to shifts and users')

    } catch (error) {
        console.error('❌ Migration failed:', error)
        process.exit(1)
    }

    process.exit(0)
}

fixTables()
