/**
 * Migration: Add new order statuses for Kitchen-Cashier Handoff Workflow
 * 
 * New statuses:
 * - pending: Online order waiting for admin approval
 * - approved: Admin approved, ready for kitchen
 * - preparing: Kitchen is preparing
 * - ready: Kitchen finished, waiting for cashier pickup
 * - handed_to_cashier: Cashier received the order
 * - completed: Order delivered/finalized
 * - cancelled: Order cancelled
 */

const { sequelize } = require('./src/config/database')

async function migrateOrderStatus() {
    console.log('Starting order status migration...')

    try {
        // SQLite doesn't support ALTER ENUM, so we need to recreate the table
        // First, backup data
        console.log('Backing up orders data...')
        const [orders] = await sequelize.query('SELECT * FROM orders')
        const [orderItems] = await sequelize.query('SELECT * FROM order_items')

        console.log(`Found ${orders.length} orders and ${orderItems.length} order items`)

        // Drop foreign key constraints by dropping order_items first
        console.log('Dropping order_items table...')
        await sequelize.query('DROP TABLE IF EXISTS order_items')

        // Drop orders table
        console.log('Dropping orders table...')
        await sequelize.query('DROP TABLE IF EXISTS orders')

        // Recreate orders table with new status enum
        console.log('Creating orders table with new status values...')
        await sequelize.query(`
            CREATE TABLE orders (
                id TEXT PRIMARY KEY,
                order_number VARCHAR(20) NOT NULL,
                order_type TEXT NOT NULL CHECK(order_type IN ('online', 'walkin', 'delivery')),
                status TEXT DEFAULT 'new' CHECK(status IN ('pending', 'approved', 'new', 'confirmed', 'preparing', 'ready', 'handed_to_cashier', 'completed', 'cancelled')),
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
                delivery_person TEXT,
                ready_at DATETIME,
                handed_at DATETIME,
                completed_at DATETIME,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (shift_id) REFERENCES shifts(id)
            )
        `)

        // Recreate order_items table
        console.log('Creating order_items table...')
        await sequelize.query(`
            CREATE TABLE order_items (
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

        // Restore orders data with status mapping
        console.log('Restoring orders data...')
        for (const order of orders) {
            // Map old status to new status
            let newStatus = order.status
            if (order.order_type === 'online' && order.status === 'new') {
                newStatus = 'pending' // Online orders start as pending
            }

            await sequelize.query(`
                INSERT INTO orders (id, order_number, order_type, status, customer_id, branch_id, user_id, shift_id, subtotal, tax, discount, total, payment_method, payment_status, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, {
                replacements: [
                    order.id, order.order_number, order.order_type, newStatus,
                    order.customer_id, order.branch_id, order.user_id, order.shift_id,
                    order.subtotal, order.tax, order.discount, order.total,
                    order.payment_method, order.payment_status, order.notes,
                    order.created_at, order.updated_at
                ]
            })
        }

        // Restore order items
        console.log('Restoring order items...')
        for (const item of orderItems) {
            await sequelize.query(`
                INSERT INTO order_items (id, order_id, menu_id, item_name_ar, item_name_en, quantity, unit_price, total_price, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, {
                replacements: [
                    item.id, item.order_id, item.menu_id, item.item_name_ar, item.item_name_en,
                    item.quantity, item.unit_price, item.total_price, item.notes,
                    item.created_at, item.updated_at
                ]
            })
        }

        console.log('✅ Migration completed successfully!')
        console.log('')
        console.log('New Order Status Flow:')
        console.log('  Online: pending → approved → preparing → ready → handed_to_cashier → completed')
        console.log('  POS:    new → preparing → ready → handed_to_cashier → completed')

    } catch (error) {
        console.error('❌ Migration failed:', error)
        process.exit(1)
    }

    process.exit(0)
}

migrateOrderStatus()
