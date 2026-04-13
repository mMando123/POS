const { Op } = require('sequelize')
const { Menu, MenuIngredient, Warehouse, Stock } = require('../models')
const UnitConversionService = require('./unitConversionService')

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

const toPlain = (item) => {
    if (!item) return null
    if (typeof item.toJSON === 'function') return item.toJSON()
    if (typeof item.get === 'function') return item.get({ plain: true })
    return { ...item }
}

class MenuAvailabilityService {
    static async resolveWarehouseMap(branchIds, explicitWarehouseId = null, transaction = null) {
        const normalizedBranchIds = Array.from(new Set((branchIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
        const map = new Map()

        if (explicitWarehouseId) {
            const warehouse = await Warehouse.findByPk(explicitWarehouseId, {
                attributes: ['id', 'branch_id', 'status'],
                ...(transaction ? { transaction } : {})
            })
            if (warehouse?.status === 'active') {
                map.set(String(warehouse.branch_id), warehouse)
            }
            return map
        }

        if (!normalizedBranchIds.length) return map

        const warehouses = await Warehouse.findAll({
            where: {
                branch_id: { [Op.in]: normalizedBranchIds },
                status: 'active'
            },
            attributes: ['id', 'branch_id', 'is_default', 'created_at'],
            order: [['is_default', 'DESC'], ['created_at', 'ASC']],
            ...(transaction ? { transaction } : {})
        })

        warehouses.forEach((warehouse) => {
            const branchKey = String(warehouse.branch_id)
            if (!map.has(branchKey)) {
                map.set(branchKey, warehouse)
            }
        })

        return map
    }

    static buildAvailableMap(stockRows = []) {
        const availableByWarehouseMenu = new Map()
        stockRows.forEach((row) => {
            const warehouseId = String(row.warehouse_id || row.warehouseId || '')
            const menuId = String(row.menu_id || row.menuId || '')
            if (!warehouseId || !menuId) return

            const quantity = parseFloat(row.quantity || 0)
            const reserved = parseFloat(row.reserved_qty ?? row.reserved ?? 0)
            availableByWarehouseMenu.set(`${warehouseId}:${menuId}`, quantity - reserved)
        })
        return availableByWarehouseMenu
    }

    static getStockAwareAvailability(item, targetWarehouseId, availableByWarehouseMenu) {
        const plainItem = toPlain(item)
        const recipeLines = Array.isArray(plainItem?.recipeIngredients) ? plainItem.recipeIngredients : []

        if (!plainItem) {
            return { stock_available: false, stock_available_qty: 0, stock_warehouse_id: targetWarehouseId || null }
        }

        if (!plainItem.is_available) {
            return { stock_available: false, stock_available_qty: 0, stock_warehouse_id: targetWarehouseId || null }
        }

        if (!plainItem.track_stock && recipeLines.length === 0) {
            return { stock_available: true, stock_available_qty: null, stock_warehouse_id: targetWarehouseId || null }
        }

        if (!targetWarehouseId) {
            return { stock_available: false, stock_available_qty: 0, stock_warehouse_id: null }
        }

        if (plainItem.track_stock) {
            const availableQty = availableByWarehouseMenu.get(`${String(targetWarehouseId)}:${String(plainItem.id)}`) || 0
            return {
                stock_available: availableQty > 0,
                stock_available_qty: availableQty,
                stock_warehouse_id: targetWarehouseId
            }
        }

        let maxBuildableUnits = Number.POSITIVE_INFINITY

        for (const line of recipeLines) {
            const ingredientMenuId = String(line.ingredient_menu_id || '')
            if (!ingredientMenuId) continue

            const ingredientStockUnit = UnitConversionService.normalizeUnit(line.ingredient?.unit_of_measure || 'piece')
            const recipeUnit = UnitConversionService.normalizeUnit(line.unit || line.ingredient?.unit_of_measure || 'piece')
            const perUnitRequiredRaw = parseFloat(line.quantity || 0)

            if (!(perUnitRequiredRaw > 0)) continue

            const requiredQty = UnitConversionService.convertQuantity({
                quantity: perUnitRequiredRaw,
                fromUnit: recipeUnit,
                toUnit: ingredientStockUnit,
                ingredientMenuId
            })

            const availableQty = availableByWarehouseMenu.get(`${String(targetWarehouseId)}:${ingredientMenuId}`) || 0
            const buildableUnits = requiredQty > 0 ? (availableQty / requiredQty) : Number.POSITIVE_INFINITY
            maxBuildableUnits = Math.min(maxBuildableUnits, buildableUnits)
        }

        if (!Number.isFinite(maxBuildableUnits)) {
            return { stock_available: true, stock_available_qty: null, stock_warehouse_id: targetWarehouseId }
        }

        return {
            stock_available: maxBuildableUnits >= 1,
            stock_available_qty: Math.max(0, Math.floor((maxBuildableUnits + Number.EPSILON) * 1000) / 1000),
            stock_warehouse_id: targetWarehouseId
        }
    }

    static async annotateMenuItems(menuItems, { warehouseId = null, hideOutOfStock = false, transaction = null } = {}) {
        const plainItems = (menuItems || []).map((item) => toPlain(item)).filter(Boolean)
        if (!plainItems.length) return []

        const branchIds = plainItems.map((item) => item.branch_id).filter(Boolean)
        const warehouseByBranch = await this.resolveWarehouseMap(branchIds, warehouseId, transaction)

        const stockMenuIds = new Set()
        plainItems.forEach((item) => {
            if (item.track_stock) {
                stockMenuIds.add(String(item.id))
            }

            const recipeLines = Array.isArray(item.recipeIngredients) ? item.recipeIngredients : []
            recipeLines.forEach((line) => {
                if (line?.ingredient_menu_id) {
                    stockMenuIds.add(String(line.ingredient_menu_id))
                }
            })
        })

        const relevantWarehouseIds = Array.from(new Set(Array.from(warehouseByBranch.values()).map((warehouse) => String(warehouse.id))))
        const stockRows = stockMenuIds.size && relevantWarehouseIds.length
            ? await Stock.findAll({
                where: {
                    menu_id: { [Op.in]: Array.from(stockMenuIds) },
                    warehouse_id: { [Op.in]: relevantWarehouseIds }
                },
                attributes: ['menu_id', 'warehouse_id', 'quantity', 'reserved_qty'],
                ...(transaction ? { transaction } : {})
            })
            : []

        const availableByWarehouseMenu = this.buildAvailableMap(stockRows)

        const annotated = plainItems.map((item) => {
            const targetWarehouse = warehouseByBranch.get(String(item.branch_id))
            const availability = this.getStockAwareAvailability(item, targetWarehouse?.id || null, availableByWarehouseMenu)
            return {
                ...item,
                ...availability
            }
        })

        if (!hideOutOfStock) return annotated
        return annotated.filter((item) => item.stock_available !== false)
    }

    static async validateRequestedItems({ branchId, items, warehouseId = null, transaction = null }) {
        const normalizedItems = Array.isArray(items) ? items : []
        const menuIds = Array.from(new Set(normalizedItems.map((item) => String(item.menu_id || '')).filter(Boolean)))
        if (!menuIds.length) return { ok: true, shortages: [] }

        const menuItems = await Menu.findAll({
            where: {
                id: { [Op.in]: menuIds },
                ...(branchId ? { branch_id: branchId } : {})
            },
            include: [RECIPE_INCLUDE],
            ...(transaction ? { transaction } : {})
        })

        const annotatedItems = await this.annotateMenuItems(menuItems, { warehouseId, transaction })
        const menuMap = new Map(annotatedItems.map((item) => [String(item.id), item]))
        const shortages = []

        normalizedItems.forEach((item) => {
            const menuItem = menuMap.get(String(item.menu_id || ''))
            if (!menuItem) return

            const requestedQty = Math.max(1, parseFloat(item.quantity || 1) || 1)
            const availableQty = menuItem.stock_available_qty

            if (menuItem.stock_available === false) {
                shortages.push({
                    menuId: menuItem.id,
                    name_ar: menuItem.name_ar,
                    requestedQty,
                    availableQty: availableQty ?? 0
                })
                return
            }

            if (typeof availableQty === 'number' && Number.isFinite(availableQty) && availableQty < requestedQty) {
                shortages.push({
                    menuId: menuItem.id,
                    name_ar: menuItem.name_ar,
                    requestedQty,
                    availableQty
                })
            }
        })

        return { ok: shortages.length === 0, shortages }
    }
}

module.exports = MenuAvailabilityService
