/**
 * Migration: Add Delivery Tracking System
 * - Creates delivery_personnel table
 * - Alters orders table: order_type, delivery fields, table_number
 */
const { sequelize } = require('./src/config/database')

async function run() {
    const q = (sql) => sequelize.query(sql).then(() => console.log('✅', sql.slice(0, 70))).catch(e => console.log('⚠️ Skip:', e.message.slice(0, 80)))

    console.log('🚀 Starting delivery migration...\n')

    // 1. Create delivery_personnel table
    await q(`
        CREATE TABLE IF NOT EXISTS delivery_personnel (
            id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
            name_ar VARCHAR(100) NOT NULL,
            name_en VARCHAR(100),
            phone VARCHAR(20) NOT NULL,
            vehicle_type ENUM('motorcycle','car','bicycle','foot') DEFAULT 'motorcycle',
            vehicle_number VARCHAR(50),
            branch_id CHAR(36) NOT NULL,
            status ENUM('available','busy','offline') DEFAULT 'available',
            is_active TINYINT(1) DEFAULT 1,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_branch (branch_id),
            INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 2. Alter orders.order_type to include dine_in/takeaway
    await q(`ALTER TABLE orders MODIFY COLUMN order_type ENUM('online','walkin','dine_in','takeaway','delivery') NOT NULL DEFAULT 'walkin'`)

    // 3. Add delivery_personnel_id FK
    await q(`ALTER TABLE orders ADD COLUMN delivery_personnel_id CHAR(36) DEFAULT NULL`)

    // 4. Add delivery_address
    await q(`ALTER TABLE orders ADD COLUMN delivery_address TEXT DEFAULT NULL`)

    // 5. Add delivery_fee
    await q(`ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2) DEFAULT 0`)

    // 6. Add delivery_status
    await q(`ALTER TABLE orders ADD COLUMN delivery_status ENUM('pending','assigned','picked_up','in_transit','delivered','failed') DEFAULT NULL`)

    // 7. Add delivery timestamps
    await q(`ALTER TABLE orders ADD COLUMN delivery_assigned_at DATETIME DEFAULT NULL`)
    await q(`ALTER TABLE orders ADD COLUMN delivery_picked_up_at DATETIME DEFAULT NULL`)
    await q(`ALTER TABLE orders ADD COLUMN delivery_completed_at DATETIME DEFAULT NULL`)

    // 8. Add table_number for dine_in
    await q(`ALTER TABLE orders ADD COLUMN table_number VARCHAR(20) DEFAULT NULL`)

    console.log('\n✅ Migration completed!')
    process.exit(0)
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
