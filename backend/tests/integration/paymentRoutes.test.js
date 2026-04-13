const request = require('supertest')
const express = require('express')

const mockAuthUser = {
    userId: 'user-123',
    branchId: 'branch-1',
    role: 'cashier',
    permissions: ['PAYMENT_PROCESS']
}

const mockOrderModel = {
    findByPk: jest.fn()
}

const mockPaymentGatewayModel = {
    findOne: jest.fn(),
    findAll: jest.fn()
}

const mockAuditLogModel = {
    findOne: jest.fn()
}

const mockSequelize = {
    transaction: jest.fn()
}

const mockPaymentService = {
    initiatePayment: jest.fn()
}

const mockAuditService = {
    log: jest.fn()
}

const mockAccountingHooks = {
    onOnlinePaymentConfirmed: jest.fn()
}

const mockPaymobGateway = {
    verifyCallback: jest.fn(),
    verifyAmount: jest.fn()
}

const mockOrderPaymentService = {
    ensureRowsForPaidOrder: jest.fn(),
    normalizeBreakdown: jest.fn(),
    replaceOrderPayments: jest.fn()
}

const mockSettings = {
    workflow: { autoAcceptOnline: false, printKitchenReceipt: true },
    hardware: { enableKitchenDisplay: true }
}

jest.mock('../../src/models', () => ({
    Order: mockOrderModel,
    PaymentGateway: mockPaymentGatewayModel,
    AuditLog: mockAuditLogModel,
    sequelize: mockSequelize
}))

jest.mock('../../src/services/paymentService', () => mockPaymentService)
jest.mock('../../src/services/auditService', () => mockAuditService)
jest.mock('../../src/services/accountingHooks', () => mockAccountingHooks)
jest.mock('../../src/services/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}))
jest.mock('../../src/services/gateways/paymob', () => mockPaymobGateway)
jest.mock('../../src/services/orderPaymentService', () => mockOrderPaymentService)
jest.mock('../../src/services/printService', () => ({
    getPrintService: jest.fn(() => ({}))
}))
jest.mock('../../src/routes/settings', () => ({
    loadSettings: jest.fn(() => mockSettings)
}))
jest.mock('../../src/middleware/auth', () => ({
    authenticate: (req, res, next) => {
        req.user = { ...mockAuthUser }
        next()
    },
    optionalAuth: (req, res, next) => next(),
    requirePermission: () => (req, res, next) => next(),
    PERMISSIONS: {
        PAYMENT_PROCESS: 'PAYMENT_PROCESS'
    }
}))
jest.mock('../../src/middleware/idempotency', () => ({
    requireIdempotency: () => (req, res, next) => next()
}))
jest.mock('../../src/middleware/rateLimiter', () => ({
    paymentLimiter: (req, res, next) => next()
}))

const paymentRoutes = require('../../src/routes/payment')

const buildOrder = (overrides = {}) => {
    const order = {
        id: '11111111-1111-4111-8111-111111111111',
        order_number: 'ORD-20260331-1001',
        order_type: 'online',
        status: 'pending',
        payment_status: 'pending',
        payment_method: 'online',
        total: 100,
        branch_id: 'branch-1',
        shift_id: null,
        user_id: 'user-123',
        items: [],
        update: jest.fn(async (values) => {
            Object.assign(order, values)
            return order
        }),
        ...overrides
    }
    return order
}

describe('Payment Routes', () => {
    let app
    let io
    let transaction

    beforeEach(() => {
        jest.clearAllMocks()

        io = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        }

        transaction = {
            LOCK: { UPDATE: 'UPDATE' },
            commit: jest.fn(),
            rollback: jest.fn(),
            finished: undefined
        }

        mockSequelize.transaction.mockResolvedValue(transaction)
        mockPaymentGatewayModel.findOne.mockResolvedValue({
            name: 'paymob',
            is_active: true,
            settings: {
                hmacSecret: 'secret',
                hmac: 'secret'
            }
        })

        app = express()
        app.use(express.json())
        app.set('io', io)
        app.use('/api/payments', paymentRoutes)
    })

    describe('POST /api/payments/initiate', () => {
        it('returns 404 when order does not exist', async () => {
            mockOrderModel.findByPk.mockResolvedValue(null)

            const res = await request(app)
                .post('/api/payments/initiate')
                .send({ order_id: 'missing-order' })

            expect(res.status).toBe(404)
            expect(res.body.message).toContain('الطلب غير موجود')
        })

        it('rejects non-online orders', async () => {
            mockOrderModel.findByPk.mockResolvedValue(buildOrder({ order_type: 'walkin' }))

            const res = await request(app)
                .post('/api/payments/initiate')
                .send({ order_id: 'order-1' })

            expect(res.status).toBe(400)
            expect(res.body.message).toBeDefined()
        })

        it('rejects already-paid orders', async () => {
            mockOrderModel.findByPk.mockResolvedValue(buildOrder({ payment_status: 'paid' }))

            const res = await request(app)
                .post('/api/payments/initiate')
                .send({ order_id: 'order-1' })

            expect(res.status).toBe(409)
            expect(res.body.message).toContain('تم دفع')
        })

        it('rejects payment methods that do not require online gateway', async () => {
            mockOrderModel.findByPk.mockResolvedValue(buildOrder({ payment_method: 'cash' }))

            const res = await request(app)
                .post('/api/payments/initiate')
                .send({ order_id: 'order-1' })

            expect(res.status).toBe(400)
            expect(res.body.message).toContain('لا تتطلب بوابة دفع')
        })

        it('initiates a valid online payment through payment service', async () => {
            const order = buildOrder({ payment_method: 'online' })
            mockOrderModel.findByPk.mockResolvedValue(order)
            mockPaymentService.initiatePayment.mockResolvedValue({
                success: true,
                gateway: 'paymob',
                paymentUrl: 'https://gateway.example/pay'
            })

            const res = await request(app)
                .post('/api/payments/initiate')
                .send({ order_id: order.id })

            expect(res.status).toBe(200)
            expect(mockPaymentService.initiatePayment).toHaveBeenCalledWith(order, undefined)
            expect(res.body.data.paymentUrl).toBe('https://gateway.example/pay')
        })
    })

    describe('POST /api/payments/verify', () => {
        it('rejects missing merchant_order_id', async () => {
            const res = await request(app)
                .post('/api/payments/verify')
                .send({ query: {} })

            expect(res.status).toBe(400)
            expect(res.body.message).toContain('معرف الطلب مفقود')
        })

        it('rejects invalid order id format', async () => {
            const res = await request(app)
                .post('/api/payments/verify')
                .send({ query: { merchant_order_id: 'bad-id' } })

            expect(res.status).toBe(400)
            expect(res.body.message).toContain('غير صالح')
        })

        it('returns 404 when order is missing', async () => {
            mockOrderModel.findByPk.mockResolvedValue(null)

            const res = await request(app)
                .post('/api/payments/verify')
                .send({ query: { merchant_order_id: '11111111-1111-4111-8111-111111111111' } })

            expect(res.status).toBe(404)
            expect(res.body.message).toContain('الطلب غير موجود')
        })

        it('returns paid state for orders already confirmed', async () => {
            const order = buildOrder({ payment_status: 'paid' })
            mockOrderModel.findByPk.mockResolvedValue(order)

            const res = await request(app)
                .post('/api/payments/verify')
                .send({
                    query: {
                        merchant_order_id: order.id,
                        success: 'true'
                    }
                })

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(res.body.data.payment_status).toBe('paid')
        })

        it('keeps order pending when callback lacks trusted verification', async () => {
            const order = buildOrder({ payment_status: 'pending' })
            mockOrderModel.findByPk.mockResolvedValue(order)

            const res = await request(app)
                .post('/api/payments/verify')
                .send({
                    query: {
                        merchant_order_id: order.id,
                        success: 'true'
                    }
                })

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(false)
            expect(res.body.data.payment_status).toBe('pending')
        })

        it('confirms a pending order using valid callback hmac fallback', async () => {
            const order = buildOrder({ payment_status: 'pending', payment_method: 'online', total: 1310 })
            mockOrderModel.findByPk.mockResolvedValue(order)
            mockPaymobGateway.verifyCallback.mockReturnValue(true)
            mockPaymobGateway.verifyAmount.mockReturnValue(true)

            const res = await request(app)
                .post('/api/payments/verify')
                .send({
                    query: {
                        merchant_order_id: order.id,
                        success: 'true',
                        hmac: 'valid-hmac',
                        amount_cents: '131000',
                        id: 'paymob-txn-1',
                        created_at: '2026-03-31T20:00:00Z',
                        currency: 'EGP',
                        pending: 'false',
                        integration_id: '5498006'
                    }
                })

            expect(res.status).toBe(200)
            expect(order.update).toHaveBeenCalledWith({ payment_status: 'paid' })
            expect(mockOrderPaymentService.ensureRowsForPaidOrder).toHaveBeenCalled()
            expect(res.body.success).toBe(true)
            expect(res.body.verified_by).toBe('callback_hmac')
        })
    })

    describe('GET /api/payments/status/:orderId', () => {
        it('rejects invalid uuid format', async () => {
            const res = await request(app).get('/api/payments/status/not-a-uuid')

            expect(res.status).toBe(400)
            expect(res.body.message).toContain('غير صالح')
        })

        it('returns 404 when order is missing', async () => {
            mockOrderModel.findByPk.mockResolvedValue(null)

            const res = await request(app)
                .get('/api/payments/status/11111111-1111-4111-8111-111111111111')

            expect(res.status).toBe(404)
            expect(res.body.message).toContain('الطلب غير موجود')
        })

        it('returns current payment status when order exists', async () => {
            const order = buildOrder({ payment_status: 'paid' })
            mockOrderModel.findByPk.mockResolvedValue(order)

            const res = await request(app)
                .get(`/api/payments/status/${order.id}`)

            expect(res.status).toBe(200)
            expect(res.body.data.payment_status).toBe('paid')
        })
    })

    describe('POST /api/payments/:orderId/confirm', () => {
        it('validates payment method', async () => {
            const res = await request(app)
                .post('/api/payments/11111111-1111-4111-8111-111111111111/confirm')
                .send({ payment_method: 'bitcoin' })

            expect(res.status).toBe(400)
            expect(res.body.errors).toBeDefined()
        })

        it('returns 404 when order is missing', async () => {
            mockOrderModel.findByPk.mockResolvedValue(null)

            const res = await request(app)
                .post('/api/payments/11111111-1111-4111-8111-111111111111/confirm')
                .send({ payment_method: 'cash' })

            expect(res.status).toBe(404)
        })

        it('blocks branch access violations', async () => {
            const order = buildOrder({ branch_id: 'branch-2' })
            mockOrderModel.findByPk.mockResolvedValue(order)

            const res = await request(app)
                .post(`/api/payments/${order.id}/confirm`)
                .send({ payment_method: 'cash' })

            expect(res.status).toBe(403)
        })

        it('returns duplicate success for already-paid orders', async () => {
            const order = buildOrder({ payment_status: 'paid' })
            mockOrderModel.findByPk.mockResolvedValue(order)

            const res = await request(app)
                .post(`/api/payments/${order.id}/confirm`)
                .send({ payment_method: 'cash' })

            expect(res.status).toBe(200)
            expect(res.body.duplicate).toBe(true)
        })

        ;[
            {
                label: 'cash',
                body: { payment_method: 'cash' },
                normalized: [{ method: 'cash', amount: 100 }],
                expectedMethod: 'cash'
            },
            {
                label: 'card',
                body: { payment_method: 'card' },
                normalized: [{ method: 'card', amount: 100 }],
                expectedMethod: 'card'
            },
            {
                label: 'online',
                body: { payment_method: 'online' },
                normalized: [{ method: 'online', amount: 100 }],
                expectedMethod: 'online'
            },
            {
                label: 'multi',
                body: {
                    payment_method: 'multi',
                    payment_breakdown: [
                        { method: 'cash', amount: 40 },
                        { method: 'card', amount: 60 }
                    ]
                },
                normalized: [
                    { method: 'cash', amount: 40 },
                    { method: 'card', amount: 60 }
                ],
                expectedMethod: 'multi'
            }
        ].forEach(({ label, body, normalized, expectedMethod }) => {
            it(`confirms manual payment using ${label}`, async () => {
                const order = buildOrder({ total: 100, payment_status: 'pending' })
                mockOrderModel.findByPk.mockResolvedValue(order)
                mockOrderPaymentService.normalizeBreakdown.mockReturnValue(normalized)

                const res = await request(app)
                    .post(`/api/payments/${order.id}/confirm`)
                    .send(body)

                expect(res.status).toBe(200)
                expect(mockOrderPaymentService.normalizeBreakdown).toHaveBeenCalled()
                expect(order.update).toHaveBeenCalledWith({
                    payment_status: 'paid',
                    payment_method: expectedMethod,
                    status: 'confirmed'
                }, { transaction })
                expect(mockOrderPaymentService.replaceOrderPayments).toHaveBeenCalledWith(
                    order,
                    normalized,
                    expect.objectContaining({
                        transaction,
                        processedBy: mockAuthUser.userId
                    })
                )
                expect(mockAccountingHooks.onOnlinePaymentConfirmed).toHaveBeenCalledWith(order, { transaction })
                expect(transaction.commit).toHaveBeenCalled()
            })
        })
    })
})
