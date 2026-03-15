const { sequelize } = require('../models');

async function syncDatabase() {
    try {
        console.log('Synchronizing Accounting Database Schema...');
        await sequelize.sync({ force: true });
        console.log('Database Schema synchronized successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Failed to sync database:', err);
        process.exit(1);
    }
}

syncDatabase();
