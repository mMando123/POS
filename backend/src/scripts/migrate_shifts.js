const { sequelize } = require('../models')

const migrate = async () => {
    try {
        await sequelize.authenticate()
        console.log('Database connected...')

        // Add shift_id column to orders table
        await sequelize.query('ALTER TABLE orders ADD COLUMN shift_id INTEGER;')
        console.log('✅ Added shift_id column to orders table')

    } catch (error) {
        if (error.message.includes('duplicate column name')) {
            console.log('⚠️ Column shift_id already exists')
        } else {
            console.error('❌ Migration failed:', error)
        }
    } finally {
        await sequelize.close()
    }
}

migrate()
