const { sequelize } = require('../models');
const { QueryInterface } = require('sequelize');

async function checkAndFixColumn() {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database.');

        const queryInterface = sequelize.getQueryInterface();
        const tableDescription = await queryInterface.describeTable('stock_movements');

        if (!tableDescription.remaining_quantity) {
            console.log('⚠️ Column remaining_quantity MISSING in stock_movements table.');
            console.log('➕ Adding column now...');

            await queryInterface.addColumn('stock_movements', 'remaining_quantity', {
                type: 'DECIMAL(10, 2)',
                defaultValue: 0,
                allowNull: false
            });

            console.log('✅ Column added successfully.');
        } else {
            console.log('✅ Column remaining_quantity ALREADY EXISTS.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error checking/fixing column:', error);
        process.exit(1);
    }
}

checkAndFixColumn();
