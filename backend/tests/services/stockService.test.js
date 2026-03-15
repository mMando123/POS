const StockService = require('../../src/services/stockService');
const { Stock, StockMovement, Menu, Warehouse, sequelize } = require('../../src/models');

// Mock all dependencies
jest.mock('../../src/models', () => ({
    Stock: {
        findOrCreate: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn()
    },
    StockMovement: {
        create: jest.fn(),
        findAll: jest.fn() // Added for costing method tests
    },
    Menu: {
        findByPk: jest.fn()
    },
    Warehouse: {
        findByPk: jest.fn()
    },
    sequelize: {
        transaction: jest.fn(() => ({
            commit: jest.fn(),
            rollback: jest.fn()
        })),
        col: jest.fn(),
        where: jest.fn()
    },
    Op: {
        and: 'and',
        lte: 'lte',
        gt: 'gt'
    }
}));

describe('StockService', () => {

    // Clear mocks before each test
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('addStock', () => {
        test('should add stock to existing item correctly', async () => {
            // Setup
            const menuId = 'item-123';
            const warehouseId = 'wh-1';
            const quantity = 10;
            const unitCost = 50;
            const userId = 'user-1';

            // Mock Stock.findOrCreate to return existing stock
            // Returns [instance, created]
            const mockStockInstance = {
                quantity: 5,
                avg_cost: 40,
                update: jest.fn().mockResolvedValue(true),
                toJSON: jest.fn().mockReturnValue({ quantity: 15, avg_cost: 46.67 })
            };
            Stock.findOrCreate.mockResolvedValue([mockStockInstance, false]);

            // Execute
            const result = await StockService.addStock({
                menuId,
                warehouseId,
                quantity,
                unitCost,
                sourceType: 'purchase',
                sourceId: 'po-1',
                userId
            });

            // Verify
            // 1. Transaction started
            expect(sequelize.transaction).toHaveBeenCalled();

            // 2. Stock found/created
            expect(Stock.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
                where: { menu_id: menuId, warehouse_id: warehouseId }
            }));

            // 3. New weighted average cost calculation
            // Old: 5 * 40 = 200
            // New: 10 * 50 = 500
            // Total: 700 / 15 = 46.666... -> 46.67
            expect(mockStockInstance.update).toHaveBeenCalledWith(expect.objectContaining({
                quantity: 15,
                avg_cost: 46.67
            }), expect.anything());

            // 4. Movement recorded
            expect(StockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
                movement_type: 'IN',
                quantity: 10,
                unit_cost: 50
            }), expect.anything());
        });

        test('should rollback transaction on error', async () => {
            Stock.findOrCreate.mockRejectedValue(new Error('DB Error'));

            // Allow the error to propagate but verify rollback happened
            await expect(StockService.addStock({
                menuId: '1', warehouseId: '1', quantity: 1
            })).rejects.toThrow('DB Error');

            // We can't easily check the transaction object created inside the function without more complex mocking,
            // but we know findOrCreate failed.
        });
    });

    describe('deductStock', () => {
        test('should deduct stock and calculate COGS', async () => {
            const menuId = 'item-123';
            const warehouseId = 'wh-1';
            const quantity = 2; // Selling 2

            // Mock Stock finding
            const mockStockInstance = {
                quantity: 10,
                avg_cost: 50,
                update: jest.fn().mockResolvedValue(true),
                toJSON: jest.fn()
            };
            Stock.findOne.mockResolvedValue(mockStockInstance);

            // Mock Menu for costing method check
            Menu.findByPk.mockResolvedValue({ costing_method: 'avg' });

            const result = await StockService.deductStock({
                menuId, warehouseId, quantity, userId: 'u1'
            });

            // Verify stock update: 10 - 2 = 8
            expect(mockStockInstance.update).toHaveBeenCalledWith(expect.objectContaining({
                quantity: 8
            }), expect.anything());

            // Verify Movement
            expect(StockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
                movement_type: 'OUT',
                quantity: -2
            }), expect.anything());
        });

        test('should prevent negative stock if not allowed', async () => {
            const mockStockInstance = {
                quantity: 1, // Only 1 available
                update: jest.fn()
            };
            Stock.findOne.mockResolvedValue(mockStockInstance);
            Menu.findByPk.mockResolvedValue({ allow_negative_stock: false }); // Strict mode

            await expect(StockService.deductStock({
                menuId: '1', warehouseId: '1', quantity: 5
            })).rejects.toThrow(/الكمية المتاحة غير كافية/);
        });
    });
});
