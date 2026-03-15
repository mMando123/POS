/**
 * Remove duplicate menu items script
 * Keeps the latest created item for each name
 */
require('dotenv').config()
const { Menu, OrderItem, sequelize } = require('./src/models')
const { Op } = require('sequelize')

async function cleanDuplicates() {
    const transaction = await sequelize.transaction();
    try {
        console.log('Finding duplicates...');

        // Find duplicate names
        const duplicates = await Menu.findAll({
            attributes: ['name_ar', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
            group: ['name_ar'],
            having: sequelize.literal('count > 1')
        });

        console.log(`Found ${duplicates.length} duplicated product names.`);

        for (const dup of duplicates) {
            const name = dup.name_ar;

            // Get all items with this name, ordered by creation (newest first)
            const items = await Menu.findAll({
                where: { name_ar: name },
                order: [['created_at', 'DESC']]
            });

            // Keep the first one (newest), delete the rest
            const toKeep = items[0];
            const toDelete = items.slice(1);

            console.log(`Processing "${name}": Keeping ID ${toKeep.id}, Deleting ${toDelete.length} duplicates.`);

            for (const item of toDelete) {
                // Check if used in orders (optional safety)
                /* 
                const usage = await OrderItem.count({ where: { menu_id: item.id } });
                if (usage > 0) {
                    console.log(`  Cannot delete ${item.id} (used in ${usage} orders). Skipping.`);
                    continue;
                } 
                */

                // Force delete for cleanup
                await item.destroy({ transaction });
            }
        }

        await transaction.commit();
        console.log('✅ Cleanup completed successfully!');
        process.exit(0);

    } catch (error) {
        await transaction.rollback();
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

cleanDuplicates();
