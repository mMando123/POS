require('dotenv').config();
const { sequelize } = require('../models');

async function fixStockMovementsMysql() {
    try {
        console.log('🔄 Checking stock_movements table (MySQL)...');
        await sequelize.authenticate();
        console.log('✅ Connected to MySQL.');

        const queryInterface = sequelize.getQueryInterface();
        const tableDesc = await queryInterface.describeTable('stock_movements');

        if (!tableDesc.remaining_quantity) {
            console.log('➕ Adding remaining_quantity column to stock_movements...');
            await queryInterface.addColumn('stock_movements', 'remaining_quantity', {
                type: 'DECIMAL(10, 2)',
                allowNull: true,
                defaultValue: 0
            });
            console.log('✅ Column added successfully.');
        } else {
            console.log('ℹ️ Column remaining_quantity already exists in stock_movements.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

fixStockMovementsMysql();
