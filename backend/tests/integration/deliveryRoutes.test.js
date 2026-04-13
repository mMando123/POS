const request = require('supertest')
const express = require('express')
const bodyParser = require('body-parser')

jest.mock('../../src/middleware/auth', () => ({
    authenticate: (req, res, next) => {
        req.user = {
            userId: 'user-1',
            branchId: 'branch-1',
            role: 'admin'
        }
        next()
    },
    authorize: () => (req, res, next) => next()
}))

const mockOrderFindByPk = jest.fn()
const mockOrderFindAll = jest.fn()
const mockOrderCount = jest.fn()
const mockDeliveryPersonnelFindByPk = jest.fn()
const mockDeliveryPersonnelUpdate = jest.fn()
const mockDescribeTable = jest.fn()
const mockFinalizeOrder = jest.fn()

jest.mock('../../src/models', () => ({
    Order: {
        findByPk: (...args) => mockOrderFindByPk(...args),
        findAll: (...args) => mockOrderFindAll(...args),
        count: (...args) => mockOrderCount(...args)
    },
    OrderItem: {},
    Customer: {},
    DeliveryPersonnel: {
        findByPk: (...args) => mockDeliveryPersonnelFindByPk(...args),
        update: (...args) => mockDeliveryPersonnelUpdate(...args)
    },
    sequelize: {
        getQueryInterface: () => ({
            describeTable: (...args) => mockDescribeTable(...args)
        })
    }
}))

jest.mock('../../src/services/orderFinalizationService', () => ({
    finalizeOrder: (...args) => mockFinalizeOrder(...args)
}))

const deliveryRoutes = require('../../src/routes/delivery')

describe('Delivery routes state machine', () => {
    let app
    let io

    beforeEach(() => {
        jest.clearAllMocks()
        mockDescribeTable.mockResolvedValue({})
        mockOrderFindAll.mockResolvedValue([])
        mockOrderCount.mockResolvedValue(0)
        mockDeliveryPersonnelUpdate.mockResolvedValue([1])

        io = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        }

        app = express()
        app.use(bodyParser.json())
        app.set('io', io)
        app.use('/api/delivery', deliveryRoutes)
    })

    it('rejects rider assignment before the order is handed to cashier', async () => {
        mockOrderFindByPk.mockResolvedValue({
            id: 'order-1',
            order_number: 'ORD-1',
            order_type: 'delivery',
            branch_id: 'branch-1',
            status: 'preparing',
            delivery_status: 'pending'
        })

        const res = await request(app)
            .post('/api/delivery/orders/order-1/assign')
            .send({ delivery_personnel_id: 'rider-1' })

        expect(res.status).toBe(400)
        expect(mockDeliveryPersonnelFindByPk).not.toHaveBeenCalled()
    })

    it('rejects completing delivery before pickup is recorded', async () => {
        mockOrderFindByPk.mockResolvedValue({
            id: 'order-1',
            order_number: 'ORD-1',
            order_type: 'delivery',
            branch_id: 'branch-1',
            status: 'handed_to_cashier',
            delivery_status: 'assigned',
            delivery_personnel_id: 'rider-1',
            payment_method: 'cash'
        })

        const res = await request(app)
            .post('/api/delivery/orders/order-1/complete')
            .send({})

        expect(res.status).toBe(400)
        expect(mockFinalizeOrder).not.toHaveBeenCalled()
    })

    it('finalizes the order when delivery is completed', async () => {
        const finalizedOrder = {
            id: 'order-1',
            order_number: 'ORD-1',
            branch_id: 'branch-1',
            status: 'completed',
            delivery_status: 'picked_up',
            delivery_personnel_id: 'rider-1',
            delivered_at: null,
            update: jest.fn().mockImplementation(async function (payload) {
                Object.assign(this, payload)
                return this
            })
        }

        mockOrderFindByPk.mockResolvedValue({
            id: 'order-1',
            order_number: 'ORD-1',
            order_type: 'delivery',
            branch_id: 'branch-1',
            status: 'handed_to_cashier',
            delivery_status: 'picked_up',
            delivery_personnel_id: 'rider-1',
            payment_method: 'cash'
        })
        mockFinalizeOrder.mockResolvedValue(finalizedOrder)

        const res = await request(app)
            .post('/api/delivery/orders/order-1/complete')
            .send({})

        expect(res.status).toBe(200)
        expect(mockFinalizeOrder).toHaveBeenCalledWith(
            'order-1',
            expect.objectContaining({
                paymentMethod: 'cash'
            })
        )
        expect(finalizedOrder.update).toHaveBeenCalledWith(
            expect.objectContaining({ delivery_status: 'delivered' })
        )
        expect(mockDeliveryPersonnelUpdate).toHaveBeenCalledWith(
            { status: 'available' },
            { where: { id: 'rider-1' } }
        )
    })
})
