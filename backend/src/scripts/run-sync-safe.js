const { sequelize } = require('../models');

async function syncDB() {
    try {
        console.log('🔄 Syncing Database Models (Safe Mode)...');
        await sequelize.authenticate();

        // Sync models - creates missing tables ONLY
        await sequelize.sync();
        console.log('✅ Database Synchronized (Safe mode).');

        process.exit(0);
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

syncDB();
