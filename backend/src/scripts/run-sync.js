const { sequelize, initDatabase } = require('../models');

async function syncDB() {
    try {
        console.log('🔄 Syncing Database Models...');
        await sequelize.authenticate();
        console.log('✅ Connected.');

        // Sync models
        await sequelize.sync({ alter: true }); // Use alter to update existing schema without dropping data
        console.log('✅ Database Synchronized (Alter mode).');

        process.exit(0);
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

syncDB();
