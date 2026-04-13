const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const orderRoutes = require('../../src/routes/order');
const { Order, OrderItem, Customer, Shift, sequelize } = require('../../src/models');
const PricingService = require('../../src/services/pricingService');
const OrderFinalizationService = require('../../src/services/orderFinalizationService');

// Mock dependencies
jest.mock('../../src/models');
jest.mock('../../src/services/pricingService');
jest.mock('../../src/services/orderFinalizationService');
jest.mock('../../src/services/logger');
jest.mock('../../src/middleware/auth', () => ({
    authenticate: (req, res, next) => {
        req.user = {
            userId: 'user-123',
            branchId: 'branch-1',
            role: 'cashier',
            permissions: ['ORDERS_CREATE', 'ORDERS_VIEW_ALL', 'ORDERS_VIEW_OWN', 'ORDERS_PROCESS']
        };
        next();
    },
    authorize: () => (req, res, next) => next(),
    optionalAuth: (req, res, next) => {
        req.user = {
            userId: 'user-123',
            branchId: 'branch-1',
            role: 'cashier',
            permissions: ['ORDERS_CREATE', 'ORDERS_VIEW_ALL', 'ORDERS_VIEW_OWN', 'ORDERS_PROCESS']
        };
        next();
    },
    requirePermission: () => (req, res, next) => next(),
    requireAnyPermission: () => (req, res, next) => next(),
    PERMISSIONS: {
        ORDERS_CREATE: 'ORDERS_CREATE',
        ORDERS_VIEW_ALL: 'ORDERS_VIEW_ALL',
        ORDERS_VIEW_OWN: 'ORDERS_VIEW_OWN',
        ORDERS_PROCESS: 'ORDERS_PROCESS'
    },
    hasPermission: () => true
}));

// Setup Express App
const app = express();
app.use(bodyParser.json());

// Mock IO
app.set('io', {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
});

app.use('/api/orders', orderRoutes);

describe('Order Integration Flow', () => {
    let transaction;

    beforeEach(() => {
        jest.clearAllMocks();
        transaction = {
            commit: jest.fn(),
            rollback: jest.fn()
        };
        sequelize.transaction.mockResolvedValue(transaction);
    });

    describe('POST /api/orders (Create Order)', () => {
        it('should create an order successfully', async () => {
            // Mock Customer findOrCreate
            Customer.findOrCreate.mockResolvedValue([{ id: 'cust-1' }, true]);

            // Mock Shift
            Shift.findOne.mockResolvedValue({ id: 'shift-1' });

            // Mock Order Create
            Order.count.mockResolvedValue(0);
            Order.create.mockResolvedValue({
                id: 'order-1',
                order_number: '20260304-0001',
                total: 57.5, // 50 + 15% tax
                status: 'new',
                branch_id: 'branch-1'
            });
            OrderItem.bulkCreate.mockResolvedValue([]);

            PricingService.buildOrderDraft.mockResolvedValue({
                subtotal: 50,
                tax: 7.5,
                discount: 0,
                total: 57.5,
                orderItems: [{
                    menu_id: '11111111-1111-4111-8111-111111111111',
                    item_name_ar: 'برجر',
                    item_name_en: 'Burger',
                    quantity: 1,
                    unit_price: 50,
                    total_price: 50
                }],
                couponEntity: null,
                components: {
                    promotionDiscount: 0,
                    loyaltyDiscount: 0
                },
                applied: {
                    loyalty: {
                        pointsUsed: 0,
                        estimatedEarnPoints: 0
                    }
                }
            });

            // Mock Order FindByPk (Return Complete Order)
            Order.findByPk.mockResolvedValue({
                id: 'order-1',
                order_number: '20260304-0001',
                status: 'new',
                branch_id: 'branch-1',
                items: [{ menu_id: '11111111-1111-4111-8111-111111111111', quantity: 1 }]
            });

            const res = await request(app)
                .post('/api/orders')
                .send({
                    order_type: 'walkin',
                    items: [{ menu_id: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
                    payment_method: 'cash'
                });

            expect(res.status).toBe(201);
            expect(res.body.data.order_number).toMatch(/^(?:[A-Z0-9]+-)?\d{8}-\d{4,}$/);
            expect(PricingService.buildOrderDraft).toHaveBeenCalled();
            expect(transaction.commit).toHaveBeenCalled();
        });

        it('should validate input', async () => {
            const res = await request(app)
                .post('/api/orders')
                .send({
                    order_type: 'INVALID_TYPE', // Invalid
                    items: [] // Empty items
                });

            expect(res.status).toBe(400);
            expect(res.body.errors).toBeDefined();
        });
    });

    describe('PUT /api/orders/:id/status (Update Status)', () => {
        it('should update status for a valid transition', async () => {
            // Mock Order
            const mockOrder = {
                id: 'order-1',
                status: 'ready',
                branch_id: 'branch-1',
                order_number: '20260304-0001',
                update: jest.fn().mockResolvedValue(true)
            };
            Order.findByPk.mockResolvedValue(mockOrder);

            const res = await request(app)
                .put('/api/orders/order-1/status')
                .send({ status: 'handed_to_cashier' });

            expect(res.status).toBe(200);
            expect(mockOrder.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'handed_to_cashier' })
            );
        });
    });

    describe('POST /api/orders/:id/complete (Guard Delivery State Machine)', () => {
        it('blocks completing a delivery order before rider pickup', async () => {
            Order.findByPk.mockResolvedValue({
                id: 'order-1',
                branch_id: 'branch-1',
                order_type: 'delivery',
                delivery_status: 'assigned',
                status: 'handed_to_cashier'
            });

            const res = await request(app)
                .post('/api/orders/order-1/complete')
                .set('X-Idempotency-Key', 'test-delivery-guard')
                .send({ payment_method: 'cash' });

            expect(res.status).toBe(400);
            expect(OrderFinalizationService.finalizeOrder).not.toHaveBeenCalled();
            expect(res.body.message).toContain('يجب أن يلتقط السائق الطلب');
        });
    });
});
