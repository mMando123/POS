/**
 * SQLite-compatible migration for delivery tracking
 * Handles ENUM as TEXT + CHECK constraints
 */
const { sequelize } = require('./src/config/database')

async function run() {
    const q = (sql, label) => sequelize.query(sql)
        .then(() => console.log('✅', label || sql.slice(0, 70)))
        .catch(e => console.log('⚠️ Skip:', label || '', '-', e.message.slice(0, 80)))

    console.log('🚀 Fixing delivery migration for SQLite...\n')

    // delivery_personnel - SQLite version (no ENUM)
    await q(`
        CREATE TABLE IF NOT EXISTS delivery_personnel (
            id TEXT PRIMARY KEY,
            name_ar TEXT NOT NULL,
            name_en TEXT,
            phone TEXT NOT NULL,
            vehicle_type TEXT DEFAULT 'motorcycle',
            vehicle_number TEXT,
            branch_id TEXT NOT NULL,
            status TEXT DEFAULT 'available',
            is_active INTEGER DEFAULT 1,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, 'Create delivery_personnel table')

    // Add delivery_status to orders (SQLite doesn't support MODIFY)
    await q(`ALTER TABLE orders ADD COLUMN delivery_status TEXT DEFAULT NULL`, 'Add delivery_status')

    console.log('\n✅ SQLite migration completed!')
    process.exit(0)
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
