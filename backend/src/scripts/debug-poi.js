const { PurchaseOrderItem, sequelize } = require('../models');

async function debugItems() {
    try {
        await sequelize.authenticate();
        const count = await PurchaseOrderItem.count();
        console.log(`Found ${count} items.`);

        const items = await PurchaseOrderItem.findAll();
        if (items.length > 0) {
            console.log('Sample Item:', JSON.stringify(items[0], null, 2));

            // Force update for first item to test
            console.log('Attempting update...');
            items[0].remaining_quantity = 999;
            await items[0].save();
            console.log('Update successful?');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
debugItems();
