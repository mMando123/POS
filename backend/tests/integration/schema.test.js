const { sequelize } = require('../../src/models');

describe('Database Schema Validation', () => {

    beforeAll(async () => {
        // Ensure we're connected
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    test('purchase_order_items table should have remaining_quantity column', async () => {
        const queryInterface = sequelize.getQueryInterface();
        const table = await queryInterface.describeTable('purchase_order_items');

        expect(table).toHaveProperty('remaining_quantity');

        // Optional: Check type
        const column = table.remaining_quantity;
        expect(column.type).toMatch(/DECIMAL|FLOAT|DOUBLE|REAL|NUMERIC/i);
    });

    test('stock_movements table should have remaining_quantity column', async () => {
        const queryInterface = sequelize.getQueryInterface();
        const table = await queryInterface.describeTable('stock_movements');

        expect(table).toHaveProperty('remaining_quantity');
    });
});
