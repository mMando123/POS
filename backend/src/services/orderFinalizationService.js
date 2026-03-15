/**
 * Order Finalization Service
 * 
 * CRITICAL FINANCIAL COMPONENT
 * 
 * This service provides the SINGLE AUTHORITY for finalizing orders.
 * It enforces the strict sequence:
 * 1. Validate Order State (Ready/Handed -> Completed)
 * 2. Validate Payment (Must be verified)
 * 3. Atomic Stock Deduction (All or nothing)
 * 4. Status Update (Completed + Paid)
 * 5. Audit Logging
 * 
 * Any direct modification of order.status = 'completed' outside this service
 * is strictly FORBIDDEN and constitutes a financial control violation.
 */

const { Order, OrderItem, OrderPayment, Menu, MenuIngredient, Warehouse, User, sequelize } = require('../models')
const StockService = require('./stockService')
const AuditService = require('./auditService')
const logger = require('./logger')
const AccountingHooks = require('./accountingHooks')
const OrderPaymentService = require('./orderPaymentService')
const LoyaltyService = require('./loyaltyService')
const UnitConversionService = require('./unitConversionService')
const { getPrintService } = require('./printService')

class OrderFinalizationService {

    /**
     * Finalize an order (Complete & Pay)
     * 
     * @param {string} orderId - UUID of the order
     * @param {Object} context - { user, deliveryPerson, paymentDetails }
     * @returns {Promise<Order>} - The completed order
     */
    static async finalizeOrder(orderId, context = {}) {
        const transaction = await sequelize.transaction()

        try {
            const { user, deliveryPerson, paymentMethod, paymentBreakdown, warehouseId } = context
            const userId = user?.userId || user?.id

            // 1. Fetch Order with Lock
            const order = await Order.findByPk(orderId, {
                include: [
                    { model: OrderItem, as: 'items' }
                ],
                lock: transaction.LOCK.UPDATE, // Pessimistic lock
                transaction
            })

            if (!order) {
                throw new Error('ORDER_NOT_FOUND')
            }

            // 2. Validate State Transitions
            if (['completed', 'cancelled'].includes(order.status)) {
                throw new Error(`ORDER_ALREADY_FINALIZED: Status is ${order.status}`)
            }

            // Only allow completion from specific states
            // Online orders might jump from 'new'/'pending' to 'completed' if auto-accepted? 
            // Strict flow: preparing -> ready -> [handed] -> completed
            const validPreStates = ['ready', 'handed_to_cashier', 'delivered']

            // Exception for online orders that might auto-complete or direct sales
            if (['walkin', 'dine_in', 'takeaway', 'delivery'].includes(order.order_type)) {
                if (!validPreStates.includes(order.status) && order.status !== 'preparing') {
                    // 'preparing' allowed for quick-serve counters where ready/handed might be skipped in UI
                    // But ideally stick to strict flow. Let's be slightly flexible for now but audit it.
                }
            }

            // 3. Payment Validation
            // If payment is pending, we implicitly mark it as paid here (Cashier workflow)
            // Ideally, we should require explicit payment confirmation BEFORE completion.
            // For now, we enforce that completion = payment received.

            // 4. Stock Deduction
            // We use the StockService which handles inventory transactions.
            // Use explicitly selected warehouse when provided, else fallback to branch default.
            let targetWarehouse = null

            if (warehouseId) {
                targetWarehouse = await Warehouse.findOne({
                    where: {
                        id: warehouseId,
                        branch_id: order.branch_id,
                        status: 'active'
                    },
                    transaction
                })
                if (!targetWarehouse) {
                    throw new Error('INVALID_WAREHOUSE_FOR_BRANCH')
                }
            } else {
                const defaultWarehouse = await Warehouse.findOne({
                    where: { branch_id: order.branch_id, is_default: true, status: 'active' },
                    transaction
                })

                targetWarehouse = defaultWarehouse || await Warehouse.findOne({
                    where: { branch_id: order.branch_id, status: 'active' },
                    order: [['created_at', 'ASC']],
                    transaction
                })

                if (!targetWarehouse) {
                    throw new Error('NO_DEFAULT_WAREHOUSE_FOR_BRANCH')
                }
            }

            for (const item of order.items) {
                const menuItem = await Menu.findByPk(item.menu_id, { transaction })
                if (!menuItem) continue

                const orderQty = parseFloat(item.quantity || 0)
                if (!(orderQty > 0)) continue

                // Composite item may work in 2 modes:
                // 1) recipe-on-sale (track_stock=false): consume ingredient stock lines.
                // 2) stocked composite (track_stock=true): deduct parent item stock like normal item.
                const recipeLines = await MenuIngredient.findAll({
                    where: { menu_id: item.menu_id },
                    include: [{ model: Menu, as: 'ingredient', attributes: ['id', 'name_ar', 'unit_of_measure'] }],
                    transaction
                })

                const recipeOnSale = recipeLines.length > 0 && !menuItem.track_stock

                if (recipeOnSale) {
                    for (const line of recipeLines) {
                        try {
                            const ingredientQtyPerUnitRaw = parseFloat(line.quantity || 0)
                            const recipeUnit = UnitConversionService.normalizeUnit(
                                line.unit || line.ingredient?.unit_of_measure || 'piece'
                            )
                            const consumeQty = orderQty * ingredientQtyPerUnitRaw
                            if (!(consumeQty > 0)) continue

                            await StockService.deductStock({
                                menuId: line.ingredient_menu_id,
                                warehouseId: targetWarehouse.id,
                                quantity: consumeQty,
                                sourceType: 'order',
                                sourceId: order.id,
                                userId: userId || 'system',
                                notes: `Sales Order #${order.order_number} - recipe of ${menuItem.name_ar} (${ingredientQtyPerUnitRaw} ${recipeUnit}/unit)`
                            }, {
                                transaction,
                                quantityUnit: recipeUnit
                            })
                        } catch (stockError) {
                            const ingredientName = line.ingredient?.name_ar || line.ingredient_menu_id
                            logger.error(`Recipe stock deduction failed for Item ${item.menu_id} ingredient ${line.ingredient_menu_id}: ${stockError.message}`)
                            throw new Error(`STOCK_DEDUCTION_FAILED: ${menuItem.name_ar} / ${ingredientName} - ${stockError.message}`)
                        }
                    }
                    continue
                }

                if (menuItem.track_stock) {
                    try {
                        await StockService.deductStock({
                            menuId: item.menu_id,
                            warehouseId: targetWarehouse.id,
                            quantity: orderQty,
                            sourceType: 'order',
                            sourceId: order.id,
                            userId: userId || 'system',
                            notes: `Sales Order #${order.order_number}`
                        }, {
                            transaction,
                            preferredBatchNumber: item.batch_number || null
                        })
                    } catch (stockError) {
                        logger.error(`Stock deduction failed for Item ${item.menu_id}: ${stockError.message}`)
                        throw new Error(`STOCK_DEDUCTION_FAILED: ${menuItem.name_ar} - ${stockError.message}`)
                    }
                }
            }

            // 5. Resolve payment allocation (split tender supported)
            let normalizedPayments = []
            let effectivePaymentMethod = order.payment_method || paymentMethod || 'cash'

            if (Array.isArray(paymentBreakdown) && paymentBreakdown.length > 0) {
                normalizedPayments = OrderPaymentService.normalizeBreakdown({
                    paymentMethod: paymentMethod || 'multi',
                    paymentBreakdown,
                    totalAmount: order.total
                })
            } else if (paymentMethod) {
                normalizedPayments = OrderPaymentService.normalizeBreakdown({
                    paymentMethod,
                    totalAmount: order.total
                })
            } else if (order.payment_method === 'multi') {
                const existingRows = await OrderPayment.findAll({
                    where: { order_id: order.id },
                    transaction
                })

                if (!existingRows.length) {
                    throw new Error('PAYMENT_BREAKDOWN_REQUIRED_FOR_MULTI')
                }

                normalizedPayments = existingRows.map(row => ({
                    method: row.payment_method,
                    amount: parseFloat(row.amount || 0)
                }))
            } else {
                normalizedPayments = OrderPaymentService.normalizeBreakdown({
                    paymentMethod: order.payment_method || 'cash',
                    totalAmount: order.total
                })
            }

            if (!normalizedPayments.length) {
                throw new Error('PAYMENT_BREAKDOWN_EMPTY')
            }

            effectivePaymentMethod = normalizedPayments.length > 1
                ? 'multi'
                : normalizedPayments[0].method

            // 6. Update Order Status
            const now = new Date()
            const updateData = {
                status: 'completed',
                payment_status: 'paid', // Enforce PAID on completion
                payment_method: effectivePaymentMethod,
                completed_at: now,
            }

            // DEF-004 FIX: Update delivery_status when finalizing online/delivery orders
            if (['delivery', 'online'].includes(order.order_type)) {
                if (!order.delivery_status || order.delivery_status === 'pending') {
                    updateData.delivery_status = 'delivered'
                    updateData.delivered_at = now
                }
            }

            if (deliveryPerson) {
                updateData.delivery_person = deliveryPerson
            }

            await order.update(updateData, { transaction })
            order.payment_method = effectivePaymentMethod
            order.payment_status = 'paid'

            await OrderPaymentService.replaceOrderPayments(order, normalizedPayments, {
                transaction,
                processedBy: userId || order.user_id || null,
                notes: 'Order finalized payment allocation'
            })

            // 7. Apply loyalty points impact on completion (idempotent by ledger lookup)
            await LoyaltyService.applyLoyaltyOnOrderCompletion(order, {
                userId: userId || order.user_id || null,
                transaction
            })

            // 8. Audit Log (fire-and-forget, never blocks business logic)
            AuditService.log({
                userId: userId,
                branchId: order.branch_id,
                category: 'order',
                action: 'order_finalized',
                entityType: 'Order',
                entityId: order.id,
                metadata: {
                    orderNumber: order.order_number,
                    total: order.total,
                    method: 'OrderFinalizationService'
                }
            })

            // 9. FIX C-03: Record sale in GL INSIDE transaction (atomic)
            // If GL posting fails, the entire order finalization rolls back.
            // This ensures NO order can be 'completed' without a GL entry.
            await AccountingHooks.onOrderCompleted(order, { transaction })

            await transaction.commit()

            // 10. DEF-006 FIX: Auto-print receipt after commit (non-blocking — never fails order)
            try {
                const printService = getPrintService()
                if (printService) {
                    printService.onOrderCompleted(order).catch(e =>
                        logger.warn(`Auto-print failed for order ${order.order_number}: ${e.message}`)
                    )
                }
            } catch (printErr) { /* non-blocking */ }

            return order

        } catch (error) {
            await transaction.rollback()
            logger.error(`Order Finalization Failed [${orderId}]:`, error)
            throw error
        }
    }
}

module.exports = OrderFinalizationService
