const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const { Op } = require('sequelize')
const { validate } = require('../middleware/validate')
const { authenticate, requirePermission, PERMISSIONS } = require('../middleware/auth')
const { Menu, MenuIngredient, Category, Warehouse, Stock, sequelize } = require('../models')
const { createMenuValidator, updateMenuValidator } = require('../validators/menuValidator')
const UnitConversionService = require('../services/unitConversionService')
const StockService = require('../services/stockService')
const { v4: uuidv4 } = require('uuid')
const { normalizeSkuInput, assertSkuAvailable, generateUniqueSku } = require('../utils/sku')

const CORE_UOM_SET = new Set(['piece', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'portion'])

const normalizeUomInput = (value, fallback = 'piece') => {
    const raw = String(value || '').trim()
    if (!raw) return fallback

    const normalized = UnitConversionService.normalizeUnit(raw)
    if (CORE_UOM_SET.has(normalized)) {
        return normalized
    }

    return raw
}

const RECIPE_INCLUDE = {
    model: MenuIngredient,
    as: 'recipeIngredients',
    attributes: ['id', 'ingredient_menu_id', 'quantity', 'unit', 'notes'],
    include: [
        {
            model: Menu,
            as: 'ingredient',
            attributes: ['id', 'name_ar', 'name_en', 'sku', 'track_stock', 'item_type', 'unit_of_measure']
        }
    ]
}

const resolveCompositeMode = (itemLike) => {
    const ingredientLines = Array.isArray(itemLike?.recipeIngredients) ? itemLike.recipeIngredients : []
    if (!ingredientLines.length) return null
    return itemLike?.track_stock ? 'on_build' : 'on_sale'
}

const withCompositeMode = (itemLike) => {
    if (!itemLike) return itemLike
    const plain = typeof itemLike.toJSON === 'function' ? itemLike.toJSON() : { ...itemLike }
    plain.composite_mode = resolveCompositeMode(plain)
    return plain
}

const resolveTrackStockForComposite = ({
    isComposite,
    requestedCompositeMode,
    hasTrackStockInput,
    requestedTrackStock
}) => {
    if (!isComposite) {
        if (requestedCompositeMode) {
            throw new Error('composite_mode متاح فقط للأصناف التجميعية')
        }
        return hasTrackStockInput ? Boolean(requestedTrackStock) : true
    }

    if (requestedCompositeMode === 'on_sale') {
        if (hasTrackStockInput && Boolean(requestedTrackStock) !== false) {
            throw new Error('تعارض: composite_mode=on_sale يتطلب track_stock=false')
        }
        return false
    }

    if (requestedCompositeMode === 'on_build') {
        if (hasTrackStockInput && Boolean(requestedTrackStock) !== true) {
            throw new Error('تعارض: composite_mode=on_build يتطلب track_stock=true')
        }
        return true
    }

    if (requestedCompositeMode) {
        throw new Error('قيمة composite_mode غير مدعومة')
    }

    // Backward compatibility: if mode not provided, keep existing behavior.
    if (hasTrackStockInput) return Boolean(requestedTrackStock)
    return false
}

const normalizeIngredients = (ingredients) => {
    if (!Array.isArray(ingredients)) return []

    const merged = new Map()

    for (const line of ingredients) {
        const ingredientId = String(line?.ingredient_menu_id || '').trim()
        const quantity = parseFloat(line?.quantity)
        const unit = normalizeUomInput(line?.unit, 'piece')
        const notes = String(line?.notes || '').trim() || null

        if (!ingredientId) {
            throw new Error('كل سطر في المكونات يجب أن يحتوي على ingredient_menu_id')
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error('كمية المكون يجب أن تكون أكبر من صفر')
        }

        if (!merged.has(ingredientId)) {
            merged.set(ingredientId, {
                ingredient_menu_id: ingredientId,
                quantity,
                unit,
                notes
            })
        } else {
            const existing = merged.get(ingredientId)
            existing.quantity += quantity
            if (!existing.notes && notes) existing.notes = notes
        }
    }

    return Array.from(merged.values())
}

const assertValidIngredientProducts = async (ingredients, { excludeMenuId = null, transaction = null } = {}) => {
    if (!ingredients.length) return []

    const ingredientIds = ingredients.map(i => i.ingredient_menu_id)

    if (excludeMenuId && ingredientIds.includes(excludeMenuId)) {
        throw new Error('لا يمكن إضافة المنتج نفسه ضمن مكونات الصنف التجميعي')
    }

    const ingredientRows = await Menu.findAll({
        where: { id: ingredientIds },
        attributes: ['id', 'track_stock', 'name_ar', 'unit_of_measure'],
        transaction
    })

    if (ingredientRows.length !== ingredientIds.length) {
        throw new Error('يوجد مكون غير موجود في قائمة الأصناف')
    }

    const notTracked = ingredientRows.filter(r => !r.track_stock)
    if (notTracked.length > 0) {
        throw new Error(`كل مكونات الصنف التجميعي يجب أن تكون أصناف مخزنية (track_stock=true). أمثلة: ${notTracked.map(r => r.name_ar).join('، ')}`)
    }

    const ingredientById = new Map(ingredientRows.map((row) => [String(row.id), row]))
    const normalizedLines = []

    for (const line of ingredients) {
        const ingredient = ingredientById.get(String(line.ingredient_menu_id))
        if (!ingredient) continue

        // Lock recipe line unit to the ingredient base unit to prevent user-side mismatch.
        const stockUnit = normalizeUomInput(ingredient.unit_of_measure || 'piece', 'piece')
        normalizedLines.push({
            ...line,
            unit: stockUnit
        })
    }

    return normalizedLines
}

router.get('/', async (req, res) => {
    try {
        const { available_only, category_id } = req.query

        const where = {}
        if (available_only === 'true') where.is_available = true
        if (category_id) where.category_id = category_id

        const items = await Menu.findAll({
            where,
            include: [
                { model: Category, attributes: ['id', 'name_ar'] },
                RECIPE_INCLUDE
            ],
            order: [['display_order', 'ASC'], ['name_ar', 'ASC']]
        })

        res.json({ data: items.map(withCompositeMode) })
    } catch (error) {
        console.error('Get menu error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

router.get('/:id', async (req, res) => {
    try {
        const item = await Menu.findByPk(req.params.id, {
            include: [
                { model: Category, attributes: ['id', 'name_ar'] },
                RECIPE_INCLUDE
            ]
        })

        if (!item) {
            return res.status(404).json({ message: 'العنصر غير موجود' })
        }

        res.json({ data: withCompositeMode(item) })
    } catch (error) {
        console.error('Get menu item error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

router.post('/', authenticate, requirePermission(PERMISSIONS.MENU_CREATE), createMenuValidator, validate, async (req, res) => {
    const transaction = await sequelize.transaction()

    try {
        const {
            name_ar,
            name_en,
            description_ar,
            description_en,
            price,
            image_url,
            category_id,
            display_order,
            is_available,
            sku,
            barcode,
            cost_price,
            item_type,
            unit_of_measure,
            track_stock,
            ingredients,
            composite_mode
        } = req.body

        const rawCostPrice = String(cost_price ?? '').trim()
        const parsedCostPrice = rawCostPrice === '' ? 0 : parseFloat(rawCostPrice)
        if (!category_id) {
            throw new Error('التصنيف مطلوب')
        }
        if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) {
            throw new Error('سعر التكلفة يجب أن يكون رقمًا موجبًا أو صفر')
        }

        const normalizedIngredients = await assertValidIngredientProducts(
            normalizeIngredients(ingredients),
            { transaction }
        )

        const isComposite = normalizedIngredients.length > 0
        const hasTrackStockInput = Object.prototype.hasOwnProperty.call(req.body, 'track_stock')
        const finalTrackStock = resolveTrackStockForComposite({
            isComposite,
            requestedCompositeMode: composite_mode,
            hasTrackStockInput,
            requestedTrackStock: track_stock
        })

        const requestedSku = normalizeSkuInput(sku)
        const finalSku = requestedSku
            ? await assertSkuAvailable(Menu, requestedSku, { transaction })
            : await generateUniqueSku(Menu, { itemType: item_type || 'sellable', transaction })

        const item = await Menu.create({
            name_ar,
            name_en,
            description_ar,
            description_en,
            price,
            image_url,
            category_id: category_id || null,
            branch_id: req.user.branchId,
            display_order: display_order || 0,
            is_available: is_available !== undefined ? is_available : true,
            sku: finalSku,
            barcode: barcode || null,
            cost_price: parsedCostPrice,
            item_type: item_type || 'sellable',
            unit_of_measure: normalizeUomInput(unit_of_measure, 'piece'),
            track_stock: finalTrackStock
        }, { transaction })

        if (normalizedIngredients.length > 0) {
            await MenuIngredient.bulkCreate(
                normalizedIngredients.map((line) => ({
                    menu_id: item.id,
                    ingredient_menu_id: line.ingredient_menu_id,
                    quantity: line.quantity,
                    unit: line.unit,
                    notes: line.notes
                })),
                { transaction }
            )
        }

        await transaction.commit()

        const result = await Menu.findByPk(item.id, {
            include: [{ model: Category, attributes: ['id', 'name_ar'] }, RECIPE_INCLUDE]
        })

        req.app.get('io').to(`branch:${req.user.branchId}`).emit('menu:updated', {
            action: 'created',
            item: result
        })

        res.status(201).json({ data: withCompositeMode(result) })
    } catch (error) {
        await transaction.rollback()
        console.error('Create menu item error:', error)
        res.status(500).json({ message: error.message || 'خطأ في الخادم' })
    }
})

router.put('/:id', authenticate, requirePermission(PERMISSIONS.MENU_UPDATE), updateMenuValidator, validate, async (req, res) => {
    const transaction = await sequelize.transaction()

    try {
        const { id } = req.params
        const item = await Menu.findByPk(id, { transaction })

        if (!item) {
            await transaction.rollback()
            return res.status(404).json({ message: 'العنصر غير موجود' })
        }

        const updateData = { ...req.body }
        const requestedCompositeMode = Object.prototype.hasOwnProperty.call(updateData, 'composite_mode')
            ? updateData.composite_mode
            : undefined
        const hasTrackStockInput = Object.prototype.hasOwnProperty.call(updateData, 'track_stock')
        const requestedTrackStock = updateData.track_stock
        const incomingIngredients = Object.prototype.hasOwnProperty.call(updateData, 'ingredients')
            ? updateData.ingredients
            : null

        delete updateData.ingredients
        delete updateData.composite_mode

        const finalCategoryId = Object.prototype.hasOwnProperty.call(updateData, 'category_id')
            ? updateData.category_id
            : item.category_id
        const finalCostPriceRaw = Object.prototype.hasOwnProperty.call(updateData, 'cost_price')
            ? updateData.cost_price
            : item.cost_price
        const finalCostPriceText = String(finalCostPriceRaw ?? '').trim()
        const finalCostPrice = finalCostPriceText === '' ? 0 : parseFloat(finalCostPriceText)

        if (!finalCategoryId) {
            throw new Error('التصنيف مطلوب')
        }
        if (!Number.isFinite(finalCostPrice) || finalCostPrice < 0) {
            throw new Error('سعر التكلفة يجب أن يكون رقمًا موجبًا أو صفر')
        }

        updateData.cost_price = finalCostPrice

        if (incomingIngredients !== null) {
            const normalizedIngredients = await assertValidIngredientProducts(
                normalizeIngredients(incomingIngredients),
                { excludeMenuId: id, transaction }
            )

            await MenuIngredient.destroy({
                where: { menu_id: id },
                transaction
            })

            if (normalizedIngredients.length > 0) {
                await MenuIngredient.bulkCreate(
                    normalizedIngredients.map((line) => ({
                        menu_id: id,
                        ingredient_menu_id: line.ingredient_menu_id,
                        quantity: line.quantity,
                        unit: line.unit,
                        notes: line.notes
                    })),
                    { transaction }
                )
            }

            // Enforce non-overlap mode rules for composite behavior.
            updateData.track_stock = resolveTrackStockForComposite({
                isComposite: normalizedIngredients.length > 0,
                requestedCompositeMode,
                hasTrackStockInput,
                requestedTrackStock
            })
        } else if (requestedCompositeMode !== undefined) {
            const existingIngredientsCount = await MenuIngredient.count({
                where: { menu_id: id },
                transaction
            })
            updateData.track_stock = resolveTrackStockForComposite({
                isComposite: existingIngredientsCount > 0,
                requestedCompositeMode,
                hasTrackStockInput,
                requestedTrackStock
            })
        } else if (hasTrackStockInput) {
            updateData.track_stock = Boolean(requestedTrackStock)
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'unit_of_measure')) {
            updateData.unit_of_measure = normalizeUomInput(updateData.unit_of_measure, item.unit_of_measure || 'piece')
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'sku')) {
            const normalizedSku = normalizeSkuInput(updateData.sku)
            if (normalizedSku) {
                await assertSkuAvailable(Menu, normalizedSku, { transaction, excludeId: id })
            }
            updateData.sku = normalizedSku
        }

        await item.update(updateData, { transaction })
        await transaction.commit()

        const result = await Menu.findByPk(id, {
            include: [{ model: Category, attributes: ['id', 'name_ar'] }, RECIPE_INCLUDE]
        })

        req.app.get('io').to(`branch:${req.user.branchId}`).emit('menu:updated', {
            action: 'updated',
            item: result
        })

        res.json({ data: withCompositeMode(result) })
    } catch (error) {
        await transaction.rollback()
        console.error('Update menu item error:', error)
        res.status(500).json({ message: error.message || 'خطأ في الخادم' })
    }
})

/**
 * Build composite item in stock (consume ingredients + add parent stock).
 * Works only for composite items configured in "on_build" mode.
 */
router.post('/:id/build',
    authenticate,
    requirePermission(PERMISSIONS.MENU_UPDATE),
    [
        body('quantity').isFloat({ min: 0.001 }).withMessage('كمية التجميع يجب أن تكون أكبر من صفر'),
        body('warehouse_id').optional().isUUID().withMessage('معرف المستودع غير صالح'),
        validate
    ],
    async (req, res) => {
        const transaction = await sequelize.transaction()
        try {
            const { id } = req.params
            const buildQty = parseFloat(req.body.quantity)
            const requestedWarehouseId = req.body.warehouse_id || null

            const item = await Menu.findByPk(id, {
                include: [RECIPE_INCLUDE],
                transaction,
                lock: transaction.LOCK.UPDATE
            })

            if (!item) {
                await transaction.rollback()
                return res.status(404).json({ message: 'العنصر غير موجود' })
            }

            if (!Array.isArray(item.recipeIngredients) || item.recipeIngredients.length === 0) {
                await transaction.rollback()
                return res.status(400).json({ message: 'هذا الصنف ليس صنفًا تجميعيًا' })
            }

            if (!item.track_stock) {
                await transaction.rollback()
                return res.status(400).json({
                    message: 'هذا الصنف مضبوط على خصم عند البيع (on_sale). لا يمكن تجميعه كمخزون.'
                })
            }

            const branchId = item.branch_id || req.user.branchId || req.user.branch_id || null
            let warehouse = null

            if (requestedWarehouseId) {
                warehouse = await Warehouse.findByPk(requestedWarehouseId, { transaction })
                if (!warehouse || warehouse.status !== 'active') {
                    await transaction.rollback()
                    return res.status(400).json({ message: 'المستودع المحدد غير موجود أو غير نشط' })
                }
                if (branchId && warehouse.branch_id !== branchId) {
                    await transaction.rollback()
                    return res.status(400).json({ message: 'المستودع المحدد لا يتبع نفس فرع الصنف' })
                }
            } else {
                const baseWhere = { status: 'active' }
                if (branchId) baseWhere.branch_id = branchId

                warehouse = await Warehouse.findOne({
                    where: { ...baseWhere, is_default: true },
                    transaction
                }) || await Warehouse.findOne({
                    where: baseWhere,
                    order: [['created_at', 'ASC']],
                    transaction
                })
            }

            if (!warehouse) {
                await transaction.rollback()
                return res.status(400).json({ message: 'لا يوجد مستودع نشط مناسب للتجميع' })
            }

            const buildRefId = uuidv4()
            let totalIngredientsCost = 0
            const consumed = []

            for (const line of item.recipeIngredients) {
                const ingredientQtyPerUnitRaw = parseFloat(line.quantity || 0)
                const recipeUnit = UnitConversionService.normalizeUnit(line.unit || 'piece')
                const stockUnit = UnitConversionService.normalizeUnit(line.ingredient?.unit_of_measure || 'piece')
                const ingredientQtyPerUnit = UnitConversionService.convertQuantity({
                    quantity: ingredientQtyPerUnitRaw,
                    fromUnit: recipeUnit,
                    toUnit: stockUnit,
                    ingredientMenuId: line.ingredient_menu_id
                })

                const consumeQty = buildQty * ingredientQtyPerUnit
                if (!(consumeQty > 0)) continue

                const outResult = await StockService.deductStock({
                    menuId: line.ingredient_menu_id,
                    warehouseId: warehouse.id,
                    quantity: consumeQty,
                    sourceType: 'production_build',
                    sourceId: buildRefId,
                    userId: req.user.userId,
                    notes: `Consume ingredient for build: ${item.name_ar}`
                }, { transaction })

                totalIngredientsCost += parseFloat(outResult.cogs || 0)
                consumed.push({
                    ingredient_menu_id: line.ingredient_menu_id,
                    ingredient_name: line.ingredient?.name_ar || line.ingredient_menu_id,
                    quantity_per_unit: ingredientQtyPerUnit,
                    unit: stockUnit,
                    quantity_consumed: consumeQty
                })
            }

            const producedUnitCost = buildQty > 0 ? (totalIngredientsCost / buildQty) : 0
            await StockService.addStock({
                menuId: item.id,
                warehouseId: warehouse.id,
                quantity: buildQty,
                unitCost: producedUnitCost,
                sourceType: 'production_build',
                sourceId: buildRefId,
                userId: req.user.userId
            }, {
                transaction,
                notes: `Build composite item: ${item.name_ar}`
            })

            await transaction.commit()

            return res.status(201).json({
                message: 'تم تجميع الصنف بنجاح',
                data: {
                    build_id: buildRefId,
                    menu_id: item.id,
                    menu_name: item.name_ar,
                    quantity_built: buildQty,
                    warehouse_id: warehouse.id,
                    warehouse_name: warehouse.name_ar,
                    produced_unit_cost: producedUnitCost,
                    total_ingredients_cost: totalIngredientsCost,
                    consumed_ingredients: consumed,
                    composite_mode: 'on_build'
                }
            })
        } catch (error) {
            await transaction.rollback()
            console.error('Build composite item error:', error)
            return res.status(500).json({ message: error.message || 'خطأ في تجميع الصنف' })
        }
    }
)

router.delete('/:id', authenticate, requirePermission(PERMISSIONS.MENU_DELETE), async (req, res) => {
    try {
        const { id } = req.params

        const item = await Menu.findByPk(id)
        if (!item) {
            return res.status(404).json({ message: 'العنصر غير موجود' })
        }

        const stockRows = await Stock.findAll({
            where: { menu_id: id },
            attributes: ['id', 'warehouse_id', 'quantity', 'reserved_qty'],
            include: [{ model: Warehouse, attributes: ['id', 'name_ar'] }]
        })

        const blockingStock = stockRows.filter((row) =>
            (parseFloat(row.quantity || 0) > 0) || (parseFloat(row.reserved_qty || 0) > 0)
        )

        if (blockingStock.length > 0) {
            const preview = blockingStock
                .slice(0, 3)
                .map((row) => `${row.Warehouse?.name_ar || row.warehouse_id}: متاح ${parseFloat(row.quantity || 0)} / محجوز ${parseFloat(row.reserved_qty || 0)}`)
                .join(' | ')
            return res.status(400).json({
                message: `لا يمكن حذف الصنف لأن له رصيدًا في المخزون. يجب عمل مرتجع/تسوية حتى يصبح الرصيد صفرًا أولًا.${preview ? ` (${preview})` : ''}`
            })
        }

        const usedAsIngredientCount = await MenuIngredient.count({ where: { ingredient_menu_id: id } })
        if (usedAsIngredientCount > 0) {
            return res.status(400).json({
                message: 'لا يمكن حذف الصنف لأنه مستخدم كمكوّن داخل وصفات أصناف أخرى'
            })
        }

        await Stock.destroy({
            where: {
                menu_id: id,
                quantity: { [Op.lte]: 0 },
                reserved_qty: { [Op.lte]: 0 }
            }
        })
        await MenuIngredient.destroy({ where: { menu_id: id } })

        await item.destroy()

        req.app.get('io').to(`branch:${req.user.branchId}`).emit('menu:updated', {
            action: 'deleted',
            itemId: id
        })

        res.json({ message: 'تم حذف العنصر بنجاح' })
    } catch (error) {
        console.error('Delete menu item error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

module.exports = router
