/**
 * End-to-end verification for:
 * Add product -> purchase -> receive -> sell -> stock deduction
 *
 * Usage:
 *   node src/scripts/run-product-sales-cycle.js
 *
 * Optional env vars:
 *   CYCLE_API_BASE=http://localhost:3001/api
 *   CYCLE_USERNAME=admin
 *   CYCLE_PASSWORD=admin123
 */

const axios = require('axios')
const { randomUUID } = require('crypto')

const API_BASE = process.env.CYCLE_API_BASE || 'http://localhost:3001/api'
const USERNAME = process.env.CYCLE_USERNAME || 'admin'
const PASSWORD = process.env.CYCLE_PASSWORD || 'admin123'

const PURCHASE_QTY = 10
const SALE_QTY = 2
const UNIT_COST = 30
const SELLING_PRICE = 45

const asNumber = (value) => {
    const parsed = parseFloat(value || 0)
    return Number.isFinite(parsed) ? parsed : 0
}
const isClientValidationError = (error) => Number(error?.response?.status) === 400

const getProductStock = async (client, sku) => {
    const response = await client.get('/inventory/stock', { params: { search: sku } })
    const rows = Array.isArray(response?.data?.data) ? response.data.data : []
    return rows[0] || null
}

async function main() {
    const tag = Date.now().toString().slice(-8)
    const sku = `E2E-${tag}`
    const batchNumber = `BATCH-${tag}`

    console.log(`API: ${API_BASE}`)
    console.log(`Tag: ${tag}`)

    // 1) Login
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
        username: USERNAME,
        password: PASSWORD
    })

    const token = loginRes?.data?.accessToken
    const branchId = loginRes?.data?.user?.branch?.id || null
    if (!token) throw new Error('Login failed: missing access token')
    if (!branchId) throw new Error('Login failed: missing branch id')

    const client = axios.create({
        baseURL: API_BASE,
        headers: { Authorization: `Bearer ${token}` }
    })

    console.log(`Logged in as ${USERNAME} (branch: ${branchId})`)

    // 2) Resolve warehouse
    const warehousesRes = await client.get('/warehouses', { params: { status: 'active' } })
    const warehouses = Array.isArray(warehousesRes?.data?.data) ? warehousesRes.data.data : []
    const warehouse =
        warehouses.find((w) => w.branchId === branchId && w.isDefault) ||
        warehouses.find((w) => w.branchId === branchId)

    if (!warehouse) {
        throw new Error(`No active warehouse found for branch ${branchId}`)
    }
    console.log(`Warehouse selected: ${warehouse.nameAr} (${warehouse.id})`)

    // 3) Resolve/create category
    const categoriesRes = await axios.get(`${API_BASE}/categories`, { params: { active_only: 'true' } })
    const categories = Array.isArray(categoriesRes?.data?.data) ? categoriesRes.data.data : []
    let category = categories.find((c) => c.branch_id === branchId && c.is_active)

    if (!category) {
        const createCategoryRes = await client.post('/categories', {
            name_ar: `E2E Category ${tag}`,
            name_en: `E2E Category ${tag}`,
            branch_id: branchId
        })
        category = createCategoryRes?.data?.data
    }

    if (!category?.id) throw new Error('Failed to resolve category')
    console.log(`Category selected: ${category.name_ar} (${category.id})`)

    // 4) Create product for POS (stock-tracked + available)
    const productRes = await client.post('/menu', {
        name_ar: `E2E Product ${tag}`,
        name_en: `E2E Product ${tag}`,
        price: SELLING_PRICE,
        cost_price: UNIT_COST,
        category_id: category.id,
        sku,
        is_available: true,
        track_stock: true,
        item_type: 'sellable',
        unit_of_measure: 'piece'
    })
    const product = productRes?.data?.data
    if (!product?.id) throw new Error('Product creation failed')
    console.log(`Product created: ${product.name_ar} (${product.id}) SKU=${sku}`)

    // 5) Create supplier
    const supplierRes = await client.post('/suppliers', {
        name_ar: `E2E Supplier ${tag}`
    })
    const supplier = supplierRes?.data?.data
    if (!supplier?.id) throw new Error('Supplier creation failed')
    console.log(`Supplier created: ${supplier.name_ar} (${supplier.id})`)

    // 6) Create purchase order
    const poRes = await client.post('/purchase-orders', {
        supplier_id: supplier.id,
        warehouse_id: warehouse.id,
        expected_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        notes: `E2E lifecycle test ${tag}`,
        items: [
            {
                menu_id: product.id,
                quantity_ordered: PURCHASE_QTY,
                unit_cost: UNIT_COST,
                tax_rate: 0,
                discount_rate: 0
            }
        ]
    })
    const po = poRes?.data?.data
    const poItem = po?.items?.[0]
    if (!po?.id || !poItem?.id) throw new Error('Purchase order creation failed')
    console.log(`PO created: ${po.po_number} (${po.id})`)

    // 7) Confirm PO
    await client.post(`/purchase-orders/${po.id}/confirm`, {})
    console.log(`PO confirmed: ${po.po_number}`)

    // 8) Receive PO and add stock
    const receiveRes = await client.post(`/purchase-orders/${po.id}/receive`, {
        items: [
            {
                id: poItem.id,
                quantity_received: PURCHASE_QTY,
                batch_number: batchNumber
            }
        ]
    })
    const poAfterReceive = receiveRes?.data?.data
    if (!poAfterReceive || poAfterReceive.status !== 'received') {
        throw new Error(`PO receive failed or unexpected status: ${poAfterReceive?.status}`)
    }
    console.log(`PO received: status=${poAfterReceive.status}`)

    const stockAfterReceive = await getProductStock(client, sku)
    const qtyAfterReceive = asNumber(stockAfterReceive?.quantity || 0)
    if (qtyAfterReceive < PURCHASE_QTY) {
        throw new Error(`Stock after receive is too low: expected >= ${PURCHASE_QTY}, got ${qtyAfterReceive}`)
    }
    console.log(`Stock after receive: ${qtyAfterReceive}`)

    // 9) Ensure open shift for cashier flow
    await client.post('/shifts/resume-or-open', { starting_cash: 200 })
    console.log('Shift is open (or resumed)')

    // 10) Create walk-in paid order
    const orderRes = await client.post('/orders', {
        order_type: 'walkin',
        payment_method: 'cash',
        payment_status: 'paid',
        items: [
            {
                menu_id: product.id,
                quantity: SALE_QTY,
                batch_number: batchNumber
            }
        ],
        notes: `E2E lifecycle sale ${tag}`
    })

    const order = orderRes?.data?.data
    if (!order?.id) throw new Error('Order creation failed')
    console.log(`Order created: ${order.order_number} (${order.id}) status=${order.status}`)

    // 11) Complete order to trigger stock deduction (idempotent-safe)
    let completedOrder = order
    if (order.status !== 'completed') {
        try {
            const completeRes = await client.post(
                `/orders/${order.id}/complete`,
                {},
                {
                    headers: {
                        'X-Idempotency-Key': randomUUID()
                    }
                }
            )
            completedOrder = completeRes?.data?.data
        } catch (error) {
            if (!isClientValidationError(error)) throw error
            const orderAfterErrorRes = await client.get(`/orders/${order.id}`)
            completedOrder = orderAfterErrorRes?.data?.data
        }
    }

    if (!completedOrder || completedOrder.status !== 'completed') {
        throw new Error(`Order complete failed or unexpected status: ${completedOrder?.status}`)
    }
    console.log(`Order completed: ${completedOrder.order_number}`)

    // 12) Validate final stock
    const stockAfterSale = await getProductStock(client, sku)
    const qtyAfterSale = asNumber(stockAfterSale?.quantity || 0)
    const expectedFinalQty = qtyAfterReceive - SALE_QTY

    if (Math.abs(qtyAfterSale - expectedFinalQty) > 0.0001) {
        throw new Error(
            `Final stock mismatch. expected=${expectedFinalQty}, actual=${qtyAfterSale}, afterReceive=${qtyAfterReceive}, sold=${SALE_QTY}`
        )
    }

    console.log(`Stock after sale: ${qtyAfterSale} (expected: ${expectedFinalQty})`)

    // 13) Validate IN/OUT movements exist
    const movementsRes = await client.get('/inventory/movements', {
        params: { menu_id: product.id, limit: 50, offset: 0 }
    })
    const movements = Array.isArray(movementsRes?.data?.data) ? movementsRes.data.data : []
    const inMovements = movements.filter((m) => m.movement_type === 'IN')
    const outMovements = movements.filter((m) => m.movement_type === 'OUT')

    if (!inMovements.length) throw new Error('No IN movement found for the product')
    if (!outMovements.length) throw new Error('No OUT movement found for the product')

    console.log('Movement check passed (IN and OUT exist)')
    console.log('---')
    console.log('Cycle verification passed successfully.')
    console.log(JSON.stringify({
        productId: product.id,
        sku,
        supplierId: supplier.id,
        purchaseOrderId: po.id,
        orderId: order.id,
        stockAfterReceive: qtyAfterReceive,
        stockAfterSale: qtyAfterSale,
        expectedFinalQty
    }, null, 2))
}

main().catch((error) => {
    console.error('Cycle verification failed:')
    console.error(error.response?.data || error.message || error)
    process.exit(1)
})
