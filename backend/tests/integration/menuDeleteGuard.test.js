const request = require('supertest')
const express = require('express')
const bodyParser = require('body-parser')

jest.mock('../../src/middleware/auth', () => ({
    authenticate: (req, res, next) => {
        req.user = { userId: 'user-1', branchId: 'branch-1', role: 'admin' }
        next()
    },
    requirePermission: () => (req, res, next) => next(),
    authorize: () => (req, res, next) => next(),
    optionalAuth: (req, res, next) => next(),
    hasPermission: () => true,
    PERMISSIONS: {
        MENU_DELETE: 'menu:delete',
        MENU_CREATE: 'menu:create',
        MENU_UPDATE: 'menu:update'
    }
}))

const mockMenuFindByPk = jest.fn()
const mockStockFindAll = jest.fn()
const mockMenuIngredientCount = jest.fn()
const mockStockDestroy = jest.fn()
const mockMenuIngredientDestroy = jest.fn()

jest.mock('../../src/models', () => ({
    Menu: { findByPk: (...args) => mockMenuFindByPk(...args), findAll: jest.fn(), create: jest.fn() },
    MenuIngredient: {
        count: (...args) => mockMenuIngredientCount(...args),
        destroy: (...args) => mockMenuIngredientDestroy(...args),
        bulkCreate: jest.fn()
    },
    Category: {},
    Warehouse: {},
    Stock: {
        findAll: (...args) => mockStockFindAll(...args),
        destroy: (...args) => mockStockDestroy(...args)
    },
    sequelize: { transaction: jest.fn() }
}))

const menuRoutes = require('../../src/routes/menu')

describe('Menu delete guard', () => {
    let app
    const io = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
    }

    beforeEach(() => {
        jest.clearAllMocks()
        app = express()
        app.use(bodyParser.json())
        app.set('io', io)
        app.use('/api/menu', menuRoutes)
    })

    it('blocks deletion when stock exists', async () => {
        mockMenuFindByPk.mockResolvedValue({
            id: 'item-1',
            destroy: jest.fn()
        })
        mockStockFindAll.mockResolvedValue([
            {
                warehouse_id: 'wh-1',
                quantity: 5,
                reserved_qty: 0,
                Warehouse: { name_ar: 'المخزن الرئيسي' }
            }
        ])

        const res = await request(app).delete('/api/menu/item-1')

        expect(res.status).toBe(400)
        expect(res.body.message).toContain('لا يمكن حذف الصنف لأن له رصيدًا في المخزون')
        expect(mockMenuIngredientCount).not.toHaveBeenCalled()
        expect(mockStockDestroy).not.toHaveBeenCalled()
    })

    it('blocks deletion when item is used as ingredient in other recipes', async () => {
        mockMenuFindByPk.mockResolvedValue({
            id: 'item-1',
            destroy: jest.fn()
        })
        mockStockFindAll.mockResolvedValue([])
        mockMenuIngredientCount.mockResolvedValue(2)

        const res = await request(app).delete('/api/menu/item-1')

        expect(res.status).toBe(400)
        expect(res.body.message).toContain('مستخدم كمكوّن داخل وصفات أصناف أخرى')
        expect(mockStockDestroy).not.toHaveBeenCalled()
    })

    it('deletes item when stock is zero and item not used as ingredient', async () => {
        const destroyItem = jest.fn().mockResolvedValue(true)
        mockMenuFindByPk.mockResolvedValue({
            id: 'item-1',
            destroy: destroyItem
        })
        mockStockFindAll.mockResolvedValue([
            { warehouse_id: 'wh-1', quantity: 0, reserved_qty: 0 }
        ])
        mockMenuIngredientCount.mockResolvedValue(0)
        mockStockDestroy.mockResolvedValue(1)
        mockMenuIngredientDestroy.mockResolvedValue(0)

        const res = await request(app).delete('/api/menu/item-1')

        expect(res.status).toBe(200)
        expect(res.body.message).toBe('تم حذف العنصر بنجاح')
        expect(mockStockDestroy).toHaveBeenCalled()
        expect(mockMenuIngredientDestroy).toHaveBeenCalledWith({ where: { menu_id: 'item-1' } })
        expect(destroyItem).toHaveBeenCalled()
        expect(io.to).toHaveBeenCalledWith('branch:branch-1')
    })
})
