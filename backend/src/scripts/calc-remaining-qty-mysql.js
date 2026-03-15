require('dotenv').config();
const { PurchaseOrderItem, sequelize } = require('../models');

async function fixRemainingQtyMysql() {
    try {
        console.log('🔄 Recalculating remaining_quantity for all items in MySQL...');
        await sequelize.authenticate();

        const items = await PurchaseOrderItem.findAll();
        console.log(`Found ${items.length} items.`);
        let updatedCount = 0;

        for (const item of items) {
            const ordered = parseFloat(item.quantity_ordered);
            const received = parseFloat(item.quantity_received) || 0;
            const remaining = Math.max(0, ordered - received);

            // Only update if differnet
            if (parseFloat(item.remaining_quantity) !== remaining) {
                await item.update({ remaining_quantity: remaining });
                updatedCount++;
            }
        }

        console.log(`✅ Process complete. Updated ${updatedCount} items.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixRemainingQtyMysql();
