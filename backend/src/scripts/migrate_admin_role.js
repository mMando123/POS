/**
 * Migration: Update admin user role and fix role ENUM
 * Run with: node src/scripts/migrate_admin_role.js
 */

const { sequelize } = require('../models')

async function migrateAdminRole() {
    try {
        console.log('🔄 Starting admin role migration...')

        // SQLite doesn't support ALTER ENUM, so we need to update the data directly
        // The model already defines admin role, Sequelize will handle it

        // Update existing admin user to have admin role
        const [results] = await sequelize.query(`
            UPDATE users SET role = 'admin' WHERE username = 'admin'
        `)

        console.log('✅ Updated admin user role to "admin"')

        // Create a sample cashier if not exists
        const [cashier] = await sequelize.query(`
            SELECT id FROM users WHERE username = 'cashier1'
        `)

        if (cashier.length === 0) {
            const [branches] = await sequelize.query(`
                SELECT id FROM branches LIMIT 1
            `)

            if (branches.length > 0) {
                const branchId = branches[0].id
                const bcrypt = require('bcryptjs')
                const hashedPassword = await bcrypt.hash('cashier123', 10)

                await sequelize.query(`
                    INSERT INTO users (id, username, password_hash, name_ar, name_en, role, branch_id, is_active, created_at, updated_at)
                    VALUES (
                        '${require('crypto').randomUUID()}',
                        'cashier1',
                        '${hashedPassword}',
                        'كاشير 1',
                        'Cashier 1',
                        'cashier',
                        '${branchId}',
                        1,
                        datetime('now'),
                        datetime('now')
                    )
                `)
                console.log('✅ Created sample cashier user (cashier1 / cashier123)')
            }
        } else {
            console.log('ℹ️ Sample cashier already exists')
        }

        console.log('✅ Migration completed successfully!')

    } catch (error) {
        console.error('❌ Migration failed:', error)
    } finally {
        await sequelize.close()
    }
}

migrateAdminRole()
