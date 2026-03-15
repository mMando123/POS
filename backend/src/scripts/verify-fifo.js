const { sequelize } = require('../config/database')
const { Stock, StockMovement, Menu, Category, Warehouse, User } = require('../models')
const StockService = require('../services/stockService')

async function verifyFIFO() {
    const transaction = await sequelize.transaction()
    let userId, warehouseId, menuId

    try {
        console.log('🧪 Starting FIFO Logic Verification...')

        // 1. Setup Test Data
        const adminUser = await User.findOne({ where: { role: 'admin' }, transaction })
        userId = adminUser.id

        // Ensure Branch Exists
        let branch = await sequelize.models.Branch.findByPk(1, { transaction })
        if (!branch) {
            branch = await sequelize.models.Branch.create({
                id: 1,
                name_en: 'Main Branch',
                name_ar: 'الفرع الرئيسي',
                is_active: true
            }, { transaction })
        }

        // Ensure Category Exists
        let category = await Category.findOne({ transaction })
        if (!category) {
            category = await Category.create({
                name_en: 'Test Category',
                name_ar: 'تصنيف تجريبي',
                is_active: true,
                branch_id: branch.id
            }, { transaction })
        }

        const warehouse = await Warehouse.create({
            name: 'FIFO Test Warehouse',
            name_ar: 'مستودع اختبار FIFO',
            code: 'FIFO_WH',
            branch_id: branch.id
        }, { transaction })
        warehouseId = warehouse.id

        const menu = await Menu.create({
            name_en: 'FIFO Test Item',
            name_ar: 'عنصر اختبار FIFO',
            price: 100,
            category_id: category.id,
            costing_method: 'fifo',
            branch_id: branch.id,
            is_active: true
        }, { transaction })
        menuId = menu.id

        console.log('✅ Test Data Created')

        // 2. Add Stock (Two Batches)
        // Batch 1: 10 units @ $10
        await StockService.addStock({
            menuId, warehouseId, userId,
            quantity: 10,
            unitCost: 10,
            sourceType: 'manual',
            notes: 'Batch 1'
        }, { transaction })

        // Batch 2: 10 units @ $20
        await StockService.addStock({
            menuId, warehouseId, userId,
            quantity: 10,
            unitCost: 20,
            sourceType: 'manual',
            notes: 'Batch 2'
        }, { transaction })

        console.log('✅ 2 Batches Added (10 @ $10, 10 @ $20)')

        // 3. Deduct Stock - Sale 1 (5 units)
        // Expected: Consumes 5 from Batch 1. Cost = 5 * 10 = 50.
        // Remaining: Batch 1 = 5, Batch 2 = 10.
        const sale1 = await StockService.deductStock({
            menuId, warehouseId, userId,
            quantity: 5,
            sourceType: 'sale',
            notes: 'Sale 1'
        }, { transaction })

        console.log(`📉 Sale 1 (5 units): Cost = ${sale1.cogs} (Expected 50)`)
        if (sale1.cogs !== 50) throw new Error(`Sale 1 Cost Mismatch: Got ${sale1.cogs}, Expected 50`)

        // 4. Deduct Stock - Sale 2 (10 units)
        // Expected: Consumes 5 from Batch 1 + 5 from Batch 2.
        // Cost = (5 * 10) + (5 * 20) = 50 + 100 = 150.
        // Remaining: Batch 1 = 0, Batch 2 = 5.
        const sale2 = await StockService.deductStock({
            menuId, warehouseId, userId,
            quantity: 10,
            sourceType: 'sale',
            notes: 'Sale 2'
        }, { transaction })

        console.log(`📉 Sale 2 (10 units): Cost = ${sale2.cogs} (Expected 150)`)
        if (sale2.cogs !== 150) throw new Error(`Sale 2 Cost Mismatch: Got ${sale2.cogs}, Expected 150`)

        // 5. Verify Remaining Quantities
        const batch1 = await StockMovement.findOne({
            where: { menu_id: menuId, warehouse_id: warehouseId, unit_cost: 10, movement_type: 'IN' },
            transaction
        })
        const batch2 = await StockMovement.findOne({
            where: { menu_id: menuId, warehouse_id: warehouseId, unit_cost: 20, movement_type: 'IN' },
            transaction
        })

        console.log(`📊 Batch 1 Remaining: ${batch1.remaining_quantity} (Expected 0.00)`)
        console.log(`📊 Batch 2 Remaining: ${batch2.remaining_quantity} (Expected 5.00)`)

        if (parseFloat(batch1.remaining_quantity) !== 0) throw new Error('Batch 1 should be empty')
        if (parseFloat(batch2.remaining_quantity) !== 5) throw new Error('Batch 2 should have 5')

        console.log('🎉 INFO Verification SUCCEEDED! Rolling back test data...')
        await transaction.rollback() // Always rollback test data

    } catch (error) {
        console.error('❌ FIFO Verification Failed:', error)
        try { await transaction.rollback() } catch (e) { }
        process.exit(1)
    } finally {
        await sequelize.close()
    }
}

verifyFIFO()
