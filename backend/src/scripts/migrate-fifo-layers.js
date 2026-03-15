const { sequelize } = require('../config/database')
const { DataTypes } = require('sequelize')
const { Stock, StockMovement } = require('../models')
const { Op } = require('sequelize')

async function migrateFifoLayers() {
    const queryInterface = sequelize.getQueryInterface()
    const transaction = await sequelize.transaction()

    try {
        console.log('🔄 Starting FIFO Cost Layers Migration...')

        // 1. Add remaining_quantity column if not exists
        const tableDescription = await queryInterface.describeTable('stock_movements')
        if (!tableDescription.remaining_quantity) {
            console.log('➕ Adding remaining_quantity column...')
            await queryInterface.addColumn('stock_movements', 'remaining_quantity', {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
                defaultValue: 0,
                after: 'quantity'
            }, { transaction })
        } else {
            console.log('ℹ️ remaining_quantity column already exists.')
        }

        // 2. Initialize remaining_quantity for existing data
        // We need to reconcile current Stock quantity with historical IN movements
        console.log('📊 Reconciling stock layers...')

        // Get all current stock records
        const stocks = await Stock.findAll({ transaction })

        for (const stock of stocks) {
            let currentQty = parseFloat(stock.quantity || 0)

            if (currentQty <= 0) {
                // If stock is 0 or negative, all IN movements are effectively consumed
                await StockMovement.update(
                    { remaining_quantity: 0 },
                    {
                        where: {
                            menu_id: stock.menu_id,
                            warehouse_id: stock.warehouse_id,
                            movement_type: 'IN'
                        },
                        transaction
                    }
                )
                continue
            }

            // Fetch all IN movements for this item/warehouse, newest first
            const inMovements = await StockMovement.findAll({
                where: {
                    menu_id: stock.menu_id,
                    warehouse_id: stock.warehouse_id,
                    movement_type: 'IN'
                },
                order: [['created_at', 'DESC']], // Newest first
                transaction
            })

            // Allocate currentQty to movements backwards (LIFO allocation for FIFO consumption assumption)
            // Meaning: The items we have NOW are the ones we bought MOST RECENTLY.
            for (const movement of inMovements) {
                const movementQty = parseFloat(movement.quantity)

                if (currentQty > 0) {
                    // How much of this batch is still here?
                    // If we have more stock than this batch, the whole batch is remaining.
                    // If we have less stock than this batch, only part of it is remaining.
                    const remaining = Math.min(currentQty, movementQty)

                    await movement.update({ remaining_quantity: remaining }, { transaction })

                    currentQty -= remaining
                } else {
                    // No stock left to match this older batch
                    await movement.update({ remaining_quantity: 0 }, { transaction })
                }
            }

            // If currentQty is still > 0, it means we have more stock than recorded IN movements (Phantom Stock)
            // We'll leave it. Future sales will just not find cost layers and default to avg cost.
            if (currentQty > 0) {
                console.warn(`⚠️ Item ${stock.menu_id} has ${currentQty} more units than recorded purchases!`)
            }
        }

        // Also ensure OUT/ADJUST movements have 0 remaining_quantity
        await StockMovement.update(
            { remaining_quantity: 0 },
            {
                where: { movement_type: { [Op.ne]: 'IN' } },
                transaction
            }
        )

        await transaction.commit()
        console.log('✅ FIFO Layers Migration Complete!')

    } catch (error) {
        await transaction.rollback()
        console.error('❌ Migration Failed:', error)
        process.exit(1)
    } finally {
        await sequelize.close()
    }
}

migrateFifoLayers()
