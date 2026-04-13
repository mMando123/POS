/**
 * StockService - Centralized Inventory Management Service
 * 
 * This service provides atomic operations for all stock-related activities:
 * - Adding stock (purchases, returns)
 * - Deducting stock (sales, damages)
 * - Reserving stock (pending orders)
 * - Transferring between warehouses
 * - Cost calculations (FIFO, LIFO, AVG)
 * - Stock level queries and alerts
 */

const {
    Stock,
    StockMovement,
    Menu,
    Warehouse,
    Category,
    PurchaseReceipt,
    sequelize
} = require('../models')
const { Op } = require('sequelize')
const UnitConversionService = require('./unitConversionService')

const resolveUpdateLock = (transaction) => transaction?.LOCK?.UPDATE || true

const round6 = (value) => Math.round((parseFloat(value || 0) + Number.EPSILON) * 1_000_000) / 1_000_000
const parseDateOnly = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const normalized = raw.includes('T') ? raw.slice(0, 10) : raw
    const parsed = new Date(`${normalized}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
}

const toFiniteNumber = (value, label) => {
    const parsed = parseFloat(value)
    if (!Number.isFinite(parsed)) {
        throw new Error(`INVALID_${label}`)
    }
    return parsed
}

class StockService {

    /**
     * Add stock to inventory (purchase, return, adjustment)
     * @param {Object} params
     * @param {string} params.menuId - Product ID
     * @param {string} params.warehouseId - Warehouse ID
     * @param {number} params.quantity - Quantity to add
     * @param {number} params.unitCost - Cost per unit
     * @param {string} params.sourceType - 'purchase', 'return', 'adjustment', 'transfer'
     * @param {string} params.sourceId - Reference to source document
     * @param {string} params.userId - User performing the action
     * @param {Object} options - Additional options (batch, expiry, notes, transaction)
     */
    static async addStock({ menuId, warehouseId, quantity, unitCost = 0, sourceType, sourceId, userId }, options = {}) {
        // Use provided transaction or create a new one
        const externalTransaction = options.transaction
        const transaction = externalTransaction || await sequelize.transaction()

        try {
            const menu = await Menu.findByPk(menuId, { transaction })
            const stockUnit = UnitConversionService.normalizeUnit(menu?.unit_of_measure || 'piece')
            const sourceUnit = UnitConversionService.normalizeUnit(options.quantityUnit || stockUnit)
            const sourceQty = toFiniteNumber(quantity, 'QUANTITY')
            if (sourceQty <= 0) {
                throw new Error('INVALID_QUANTITY')
            }

            // Normalize all stock math to the menu base unit.
            const quantityInStockUnit = UnitConversionService.convertQuantity({
                quantity: sourceQty,
                fromUnit: sourceUnit,
                toUnit: stockUnit,
                ingredientMenuId: menuId
            })

            const inputUnitCost = toFiniteNumber(unitCost, 'UNIT_COST')
            const normalizedUnitCost = quantityInStockUnit > 0
                ? round6((sourceQty * inputUnitCost) / quantityInStockUnit)
                : inputUnitCost

            // Get or create stock record
            let [stock, created] = await Stock.findOrCreate({
                where: { menu_id: menuId, warehouse_id: warehouseId },
                defaults: {
                    menu_id: menuId,
                    warehouse_id: warehouseId,
                    quantity: 0,
                    reserved_qty: 0,
                    avg_cost: normalizedUnitCost
                },
                transaction
            })

            const previousQty = parseFloat(stock.quantity)
            const newQty = previousQty + quantityInStockUnit

            // Calculate new weighted average cost
            let newAvgCost = stock.avg_cost
            if (normalizedUnitCost > 0 && quantityInStockUnit > 0) {
                const totalValue = (previousQty * parseFloat(stock.avg_cost)) + (quantityInStockUnit * normalizedUnitCost)
                newAvgCost = newQty > 0 ? totalValue / newQty : normalizedUnitCost
            }

            // Update stock
            await stock.update({
                quantity: newQty,
                avg_cost: Math.round(newAvgCost * 100) / 100,
                last_restock_date: new Date()
            }, { transaction })

            // Record movement
            await StockMovement.create({
                menu_id: menuId,
                warehouse_id: warehouseId,
                movement_type: 'IN', // or sourceType mapped to enum
                quantity: quantityInStockUnit,
                remaining_quantity: quantityInStockUnit, // Initialize cost layer
                unit_cost: normalizedUnitCost,
                total_cost: quantityInStockUnit * normalizedUnitCost,
                balance_after: newQty,
                source_type: sourceType,
                source_id: sourceId,
                reference: options.reference,
                batch_number: options.batchNumber,
                production_date: options.productionDate,
                expiry_date: options.expiryDate,
                user_id: userId,
                notes: options.notes
            }, { transaction })

            // Only commit if we created the transaction
            if (!externalTransaction) {
                await transaction.commit()
            }

            return {
                success: true,
                stock: stock.toJSON(),
                previousQty,
                newQty,
                stockUnit,
                sourceUnit,
                addedQuantity: quantityInStockUnit
            }
        } catch (error) {
            // Only rollback if we created the transaction
            if (!externalTransaction) {
                await transaction.rollback()
            }
            throw error
        }
    }


    /**
     * Deduct stock from inventory (sale, damage, loss)
     * Uses FIFO logic to consume cost layers
     */
    static async deductStock({ menuId, warehouseId, quantity, sourceType, sourceId, userId, notes }, options = {}) {
        const externalTransaction = options.transaction
        const transaction = externalTransaction || await sequelize.transaction()

        try {
            const stock = await Stock.findOne({
                where: { menu_id: menuId, warehouse_id: warehouseId },
                transaction,
                lock: resolveUpdateLock(transaction)
            })

            if (!stock) {
                throw new Error('لا يوجد مخزون لهذا المنتج في هذا المستودع')
            }

            const menu = await Menu.findByPk(menuId, { transaction })
            const previousQty = parseFloat(stock.quantity)
            const stockUnit = UnitConversionService.normalizeUnit(menu?.unit_of_measure || 'piece')
            const sourceUnit = UnitConversionService.normalizeUnit(options.quantityUnit || stockUnit)
            const sourceQty = toFiniteNumber(quantity, 'QUANTITY')
            if (sourceQty <= 0) {
                throw new Error('INVALID_QUANTITY')
            }
            // Normalize all deductions to the stock base unit.
            const qtyToDeduct = UnitConversionService.convertQuantity({
                quantity: sourceQty,
                fromUnit: sourceUnit,
                toUnit: stockUnit,
                ingredientMenuId: menuId
            })
            const newQty = previousQty - qtyToDeduct

            // Check for negative stock
            if (newQty < 0 && !menu?.allow_negative_stock) {
                throw new Error(`الكمية المتاحة غير كافية. المتاح: ${previousQty}`)
            }

            // FIFO Cost Calculation Logic
            let remainingToDeduct = qtyToDeduct
            let totalCostOfSold = 0

            // Find FIFO layers (oldest first)
            let layers = await StockMovement.findAll({
                where: {
                    menu_id: menuId,
                    warehouse_id: warehouseId,
                    movement_type: { [Op.in]: ['IN', 'TRANSFER_IN', 'ADJUST'] },
                    remaining_quantity: { [Op.gt]: 0 },
                    quantity: { [Op.gt]: 0 } // Ensure it's a positive movement
                },
                order: [['created_at', 'ASC']],
                transaction,
                lock: resolveUpdateLock(transaction)
            })
            if (!Array.isArray(layers)) {
                layers = []
            }

            const preferredBatch = String(options.preferredBatchNumber || '').trim()
            if (preferredBatch) {
                const preferred = []
                const rest = []
                for (const layer of layers) {
                    const layerBatch = String(layer.batch_number || '').trim()
                    if (layerBatch && layerBatch === preferredBatch) preferred.push(layer)
                    else rest.push(layer)
                }
                layers = [...preferred, ...rest]
            }

            for (const layer of layers) {
                if (remainingToDeduct <= 0) break

                const layerQty = parseFloat(layer.remaining_quantity)
                const layerCost = parseFloat(layer.unit_cost || 0)

                let dQty = 0
                if (layerQty >= remainingToDeduct) {
                    // This layer satisfies the remainder
                    dQty = remainingToDeduct
                    await layer.update({ remaining_quantity: layerQty - dQty }, { transaction })
                    remainingToDeduct = 0
                } else {
                    // Consume this entire layer
                    dQty = layerQty
                    await layer.update({ remaining_quantity: 0 }, { transaction })
                    remainingToDeduct -= dQty
                }

                totalCostOfSold += (dQty * layerCost)
            }

            // If we still have quantity to deduct (negative stock or missing layers),
            // use the current average cost or last known cost for the remainder
            if (remainingToDeduct > 0) {
                const fallbackCost = parseFloat(stock.avg_cost || 0)
                totalCostOfSold += (remainingToDeduct * fallbackCost)
            }

            const unitCost = totalCostOfSold / qtyToDeduct

            // Update stock
            await stock.update({
                quantity: newQty,
                last_sold_date: new Date()
            }, { transaction })

            // Record movement
            await StockMovement.create({
                menu_id: menuId,
                warehouse_id: warehouseId,
                movement_type: 'OUT',
                quantity: -qtyToDeduct,
                // store accurate costs derived from layers
                unit_cost: unitCost,
                total_cost: totalCostOfSold,
                balance_after: newQty,
                source_type: sourceType,
                source_id: sourceId,
                reference: options.reference,
                user_id: userId,
                notes: notes || options.notes
            }, { transaction })

            if (!externalTransaction) await transaction.commit()

            return {
                success: true,
                stock: stock.toJSON(),
                previousQty,
                newQty,
                cogs: totalCostOfSold,
                stockUnit,
                sourceUnit,
                deductedQuantity: qtyToDeduct
            }
        } catch (error) {
            if (!externalTransaction) await transaction.rollback()
            throw error
        }
    }

    /**
     * Reserve stock for a pending order
     */
    static async reserveStock({ menuId, warehouseId, quantity, orderId, userId }) {
        const transaction = await sequelize.transaction()

        try {
            const stock = await Stock.findOne({
                where: { menu_id: menuId, warehouse_id: warehouseId },
                transaction,
                lock: resolveUpdateLock(transaction)
            })

            if (!stock) {
                throw new Error('لا يوجد مخزون لهذا المنتج')
            }

            const available = parseFloat(stock.quantity) - parseFloat(stock.reserved_qty)

            if (available < quantity) {
                const menu = await Menu.findByPk(menuId, { transaction })
                if (!menu?.allow_negative_stock) {
                    throw new Error(`الكمية المتاحة غير كافية. المتاح: ${available}`)
                }
            }

            await stock.update({
                reserved_qty: parseFloat(stock.reserved_qty) + quantity
            }, { transaction })

            // Record reservation movement
            await StockMovement.create({
                menu_id: menuId,
                warehouse_id: warehouseId,
                movement_type: 'RESERVE',
                quantity: quantity,
                balance_after: stock.quantity,
                source_type: 'order',
                source_id: orderId,
                user_id: userId,
                notes: `حجز لطلب #${orderId}`
            }, { transaction })

            await transaction.commit()
            return { success: true, reserved: quantity }
        } catch (error) {
            await transaction.rollback()
            throw error
        }
    }

    /**
     * Release reserved stock (order cancelled)
     */
    static async releaseReservation({ menuId, warehouseId, quantity, orderId, userId }) {
        const transaction = await sequelize.transaction()

        try {
            const stock = await Stock.findOne({
                where: { menu_id: menuId, warehouse_id: warehouseId },
                transaction
            })

            if (stock) {
                const newReserved = Math.max(0, parseFloat(stock.reserved_qty) - quantity)
                await stock.update({
                    reserved_qty: newReserved
                }, { transaction })

                await StockMovement.create({
                    menu_id: menuId,
                    warehouse_id: warehouseId,
                    movement_type: 'RELEASE',
                    quantity: -quantity,
                    balance_after: stock.quantity,
                    source_type: 'order_cancel',
                    source_id: orderId,
                    user_id: userId,
                    notes: `إلغاء حجز لطلب #${orderId}`
                }, { transaction })
            }

            await transaction.commit()
            return { success: true, released: quantity }
        } catch (error) {
            await transaction.rollback()
            throw error
        }
    }

    /**
     * Return items to supplier (Purchase Return)
     * Deducts from specific PO stock layers (Specific Identification)
     */
    static async returnToSupplier({ menuId, warehouseId, quantity, poId, userId, notes }, options = {}) {
        const externalTransaction = options.transaction
        const transaction = externalTransaction || await sequelize.transaction()

        try {
            const stock = await Stock.findOne({
                where: { menu_id: menuId, warehouse_id: warehouseId },
                transaction,
                lock: true
            })

            if (!stock) throw new Error('لا يوجد مخزون لهذا المنتج')

            const qtyToReturn = parseFloat(quantity)
            if (parseFloat(stock.quantity) < qtyToReturn) {
                throw new Error('الكمية الحالية في المخزون أقل من الكمية المراد إرجاعها')
            }

            // Find specific layers from this PO.
            // Some flows store purchase IN movements with source_id=poId,
            // while others store source_id=receiptId (linked to the same PO).
            const sourceIds = new Set([String(poId)])
            const linkedReceipts = await PurchaseReceipt.findAll({
                where: { purchase_order_id: poId },
                attributes: ['id'],
                transaction
            })
            for (const receipt of linkedReceipts) {
                sourceIds.add(String(receipt.id))
            }

            const layers = await StockMovement.findAll({
                where: {
                    menu_id: menuId,
                    warehouse_id: warehouseId,
                    source_type: 'purchase',
                    source_id: { [Op.in]: Array.from(sourceIds) },
                    remaining_quantity: { [Op.gt]: 0 }
                },
                order: [['created_at', 'ASC']],
                transaction,
                lock: resolveUpdateLock(transaction)
            })

            const totalAvailableReturn = layers.reduce((sum, l) => sum + parseFloat(l.remaining_quantity), 0)

            if (totalAvailableReturn < qtyToReturn) {
                // Determine what can be returned
                throw new Error(`لا يمكن إرجاع ${qtyToReturn}. الكمية المتبقية من أمر الشراء هذا هي ${totalAvailableReturn} فقط (الباقي تم بيعه أو استخدامه)`)
            }

            let remainingToReturn = qtyToReturn
            let totalCostReturned = 0

            for (const layer of layers) {
                if (remainingToReturn <= 0) break

                const layerQty = parseFloat(layer.remaining_quantity)
                const layerCost = parseFloat(layer.unit_cost)

                let dQty = 0
                if (layerQty >= remainingToReturn) {
                    dQty = remainingToReturn
                    await layer.update({ remaining_quantity: layerQty - dQty }, { transaction })
                    remainingToReturn = 0
                } else {
                    dQty = layerQty
                    await layer.update({ remaining_quantity: 0 }, { transaction })
                    remainingToReturn -= dQty
                }

                totalCostReturned += (dQty * layerCost)
            }

            // Update Stock Quantity
            const newQty = parseFloat(stock.quantity) - qtyToReturn
            await stock.update({
                quantity: newQty,
                last_restock_date: new Date()
            }, { transaction })

            // Create One OUT Movement for the Return
            const unitCost = totalCostReturned / qtyToReturn

            await StockMovement.create({
                menu_id: menuId,
                warehouse_id: warehouseId,
                movement_type: 'OUT',
                quantity: -qtyToReturn,
                unit_cost: unitCost,
                total_cost: totalCostReturned,
                balance_after: newQty,
                source_type: 'purchase_return',
                source_id: options.returnId || poId,
                user_id: userId,
                notes: notes || `إرجاع للمورد من أمر الشراء ${poId}`
            }, { transaction })

            if (!externalTransaction) await transaction.commit()

            return { success: true, returnedCost: totalCostReturned }

        } catch (error) {
            if (!externalTransaction) await transaction.rollback()
            throw error
        }
    }

    /**
     * Calculate unit cost based on costing method
     */
    static async calculateUnitCost(menuId, warehouseId, method = 'avg') {
        if (method === 'avg') {
            const stock = await Stock.findOne({
                where: { menu_id: menuId, warehouse_id: warehouseId }
            })
            return parseFloat(stock?.avg_cost || 0)
        }

        if (method === 'fifo') {
            // Get the oldest purchase cost that still has inventory (via remaining_quantity)
            const movements = await StockMovement.findAll({
                where: {
                    menu_id: menuId,
                    warehouse_id: warehouseId,
                    movement_type: { [Op.in]: ['IN', 'TRANSFER_IN', 'ADJUST'] },
                    remaining_quantity: { [Op.gt]: 0 }
                },
                order: [['created_at', 'ASC']],
                limit: 1
            })
            return parseFloat(movements[0]?.unit_cost || 0)
        }

        if (method === 'lifo') {
            // Get the newest purchase cost
            const movements = await StockMovement.findAll({
                where: {
                    menu_id: menuId,
                    warehouse_id: warehouseId,
                    movement_type: 'IN',
                    unit_cost: { [Op.gt]: 0 }
                },
                order: [['created_at', 'DESC']],
                limit: 1
            })
            return parseFloat(movements[0]?.unit_cost || 0)
        }

        return 0
    }

    /**
     * Get current stock level for a product
     */
    static async getStockLevel(menuId, warehouseId = null) {
        const where = { menu_id: menuId }
        if (warehouseId) where.warehouse_id = warehouseId

        const stocks = await Stock.findAll({
            where,
            include: [{ model: Warehouse, attributes: ['id', 'name_ar', 'name_en'] }]
        })

        const total = stocks.reduce((sum, s) => sum + parseFloat(s.quantity), 0)
        const reserved = stocks.reduce((sum, s) => sum + parseFloat(s.reserved_qty), 0)

        return {
            total,
            reserved,
            available: total - reserved,
            byWarehouse: stocks.map(s => ({
                warehouseId: s.warehouse_id,
                warehouseName: s.Warehouse?.name_ar,
                quantity: parseFloat(s.quantity),
                reserved: parseFloat(s.reserved_qty),
                available: parseFloat(s.quantity) - parseFloat(s.reserved_qty),
                avgCost: parseFloat(s.avg_cost)
            }))
        }
    }

    /**
     * Get low stock items
     */
    static async getLowStockItems(warehouseId = null) {
        const where = {}
        if (warehouseId) where.warehouse_id = warehouseId

        const stocks = await Stock.findAll({
            where: {
                ...where,
                [Op.and]: [
                    sequelize.where(
                        sequelize.col('quantity'),
                        Op.gt,
                        0
                    ),
                    sequelize.where(
                        sequelize.col('quantity'),
                        Op.lte,
                        sequelize.col('min_stock')
                    )
                ]
            },
            include: [
                { model: Menu, attributes: ['id', 'name_ar', 'name_en', 'sku'] },
                { model: Warehouse, attributes: ['id', 'name_ar', 'branch_id'] }
            ]
        })

        return stocks.map(s => ({
            menuId: s.menu_id,
            productName: s.Menu?.name_ar || s.menu?.name_ar || '-',
            sku: s.Menu?.sku || s.menu?.sku || '-',
            warehouseId: s.warehouse_id,
            warehouseName: s.Warehouse?.name_ar || s.warehouse?.name_ar || '-',
            branchId: s.Warehouse?.branch_id || s.warehouse?.branch_id || null,
            quantity: parseFloat(s.quantity || 0),
            minStock: parseFloat(s.min_stock || 0),
            deficit: parseFloat(s.min_stock || 0) - parseFloat(s.quantity || 0)
        }))
    }

    /**
     * Get batches that are expired or close to expiry.
     */
    static async getExpiryAlerts(warehouseId = null, alertDays = 30) {
        const safeAlertDays = Number.isFinite(parseInt(alertDays, 10))
            ? Math.max(0, parseInt(alertDays, 10))
            : 30

        const where = {
            movement_type: { [Op.in]: ['IN', 'TRANSFER_IN', 'ADJUST'] },
            remaining_quantity: { [Op.gt]: 0 },
            expiry_date: { [Op.not]: null }
        }
        if (warehouseId) where.warehouse_id = warehouseId

        const movements = await StockMovement.findAll({
            where,
            include: [
                { model: Menu, attributes: ['id', 'name_ar', 'name_en', 'sku'] },
                { model: Warehouse, attributes: ['id', 'name_ar', 'branch_id'] }
            ],
            order: [['expiry_date', 'ASC'], ['created_at', 'ASC']]
        })

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const expired = []
        const expiringSoon = []

        for (const movement of movements) {
            const expiryDate = parseDateOnly(movement.expiry_date)
            if (!expiryDate) continue

            const daysRemaining = Math.floor((expiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
            const entry = {
                movementId: movement.id,
                menuId: movement.menu_id,
                productName: movement.Menu?.name_ar || movement.Menu?.name_en || '-',
                sku: movement.Menu?.sku || '-',
                warehouseId: movement.warehouse_id,
                warehouseName: movement.Warehouse?.name_ar || '-',
                branchId: movement.Warehouse?.branch_id || null,
                batchNumber: movement.batch_number || null,
                productionDate: movement.production_date || null,
                expiryDate: movement.expiry_date || null,
                quantity: parseFloat(movement.remaining_quantity || 0),
                daysRemaining
            }

            if (daysRemaining < 0) {
                expired.push({ ...entry, status: 'expired' })
            } else if (daysRemaining <= safeAlertDays) {
                expiringSoon.push({ ...entry, status: 'expiring_soon' })
            }
        }

        return { expired, expiringSoon }
    }

    /**
     * Get inventory valuation
     */
    static async getInventoryValuation(warehouseId = null) {
        const where = {}
        if (warehouseId) where.warehouse_id = warehouseId

        const stocks = await Stock.findAll({
            where,
            include: [
                {
                    model: Menu,
                    attributes: ['id', 'name_ar', 'costing_method', 'category_id'],
                    include: [{ model: Category, attributes: ['id', 'name_ar'] }]
                },
                { model: Warehouse, attributes: ['id', 'name_ar'] }
            ]
        })

        const items = stocks.map(s => {
            const quantity = parseFloat(s.quantity || 0)
            const avgCost = parseFloat(s.avg_cost || 0)
            const totalValue = Math.round(quantity * avgCost * 100) / 100

            return {
                menuId: s.menu_id,
                productName: s.Menu?.name_ar || 'غير معروف',
                warehouseId: s.warehouse_id || 'default',
                warehouseName: s.Warehouse?.name_ar || 'المستودع الرئيسي',
                categoryId: s.Menu?.category_id || 'other',
                categoryName: s.Menu?.Category?.name_ar || 'غير مصنف',
                quantity: quantity,
                avgCost: avgCost,
                totalValue: totalValue
            }
        })

        // Group by warehouse
        const byWarehouseMap = {}
        // Group by category
        const byCategoryMap = {}

        items.forEach(item => {
            // Warehouse grouping
            const wKey = item.warehouseId
            if (!byWarehouseMap[wKey]) {
                byWarehouseMap[wKey] = {
                    warehouse_name: item.warehouseName,
                    total_value: 0
                }
            }
            byWarehouseMap[wKey].total_value = Math.round((byWarehouseMap[wKey].total_value + item.totalValue) * 100) / 100

            // Category grouping
            const cKey = item.categoryId
            if (!byCategoryMap[cKey]) {
                byCategoryMap[cKey] = {
                    name: item.categoryName,
                    total_value: 0
                }
            }
            byCategoryMap[cKey].total_value = Math.round((byCategoryMap[cKey].total_value + item.totalValue) * 100) / 100
        })

        const byWarehouse = Object.values(byWarehouseMap).map(w => ({
            warehouse_name: w.warehouse_name,
            total_value: w.total_value
        }))

        const byCategory = Object.values(byCategoryMap).map(c => ({
            name: c.name,
            total_value: c.total_value
        }))

        const totalValue = items.reduce((sum, i) => sum + i.totalValue, 0)
        const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)

        return {
            total_value: Math.round(totalValue * 100) / 100,
            total_items: totalItems,
            item_count: items.length,
            by_warehouse: byWarehouse,
            by_category: byCategory,
            items
        }
    }

    /**
     * Get stock movement history
     */
    static async getMovementHistory({ menuId, warehouseId, startDate, endDate, type, limit = 100, offset = 0 }) {
        const where = {}
        if (menuId) where.menu_id = menuId
        if (warehouseId) where.warehouse_id = warehouseId
        if (type) where.movement_type = type
        if (startDate || endDate) {
            where.created_at = {}
            if (startDate) where.created_at[Op.gte] = startDate
            if (endDate) where.created_at[Op.lte] = endDate
        }

        const { rows, count } = await StockMovement.findAndCountAll({
            where,
            include: [
                { model: Menu, attributes: ['id', 'name_ar', 'sku'] },
                { model: Warehouse, attributes: ['id', 'name_ar'] }
            ],
            order: [['created_at', 'DESC']],
            limit,
            offset
        })

        return {
            movements: rows,
            total: count,
            limit,
            offset
        }
    }
}

module.exports = StockService
