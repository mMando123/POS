const { sequelize } = require('../models')

const migrate = async () => {
    try {
        await sequelize.authenticate()
        console.log('Database connected...')

        const columns = [
            { name: 'order_count', sql: 'ALTER TABLE shifts ADD COLUMN order_count INTEGER DEFAULT 0;' },
            { name: 'reviewed_by', sql: 'ALTER TABLE shifts ADD COLUMN reviewed_by TEXT;' },
            { name: 'review_status', sql: "ALTER TABLE shifts ADD COLUMN review_status TEXT DEFAULT 'pending';" },
            { name: 'review_notes', sql: 'ALTER TABLE shifts ADD COLUMN review_notes TEXT;' },
            { name: 'reviewed_at', sql: 'ALTER TABLE shifts ADD COLUMN reviewed_at DATETIME;' },
        ]

        for (const col of columns) {
            try {
                await sequelize.query(col.sql)
                console.log(`✅ Added ${col.name} column`)
            } catch (error) {
                if (error.message.includes('duplicate column name')) {
                    console.log(`⚠️ Column ${col.name} already exists`)
                } else {
                    throw error
                }
            }
        }

        console.log('✅ Migration completed successfully')
    } catch (error) {
        console.error('❌ Migration failed:', error)
    } finally {
        await sequelize.close()
    }
}

migrate()
