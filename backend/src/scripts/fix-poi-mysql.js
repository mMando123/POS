require('dotenv').config();
const { sequelize } = require('../models');

async function fixPoiMysql() {
    try {
        console.log('🔄 Checking purchase_order_items table (MySQL)...');
        await sequelize.authenticate();
        console.log('✅ Connected to MySQL.');

        const queryInterface = sequelize.getQueryInterface();
        const tableDesc = await queryInterface.describeTable('purchase_order_items');

        if (!tableDesc.remaining_quantity) {
            console.log('➕ Adding remaining_quantity column to purchase_order_items...');
            await queryInterface.addColumn('purchase_order_items', 'remaining_quantity', {
                type: 'DECIMAL(10, 2)',
                allowNull: true,
                defaultValue: 0
            });
            console.log('✅ Column added successfully.');
        } else {
            console.log('ℹ️ Column remaining_quantity already exists in purchase_order_items.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

fixPoiMysql();
