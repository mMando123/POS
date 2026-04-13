#!/usr/bin/env node
/**
 * E2E order-channel verification:
 * - POS Delivery
 * - POS Dine-in
 * - POS Takeaway
 * - Website Online -> Delivery handoff
 *
 * Usage:
 *   node src/scripts/run-e2e-order-channels.js
 *
 * Optional env:
 *   CYCLE_API_BASE=http://localhost:3001/api
 *   CYCLE_USERNAME=admin
 *   CYCLE_PASSWORD=admin123
 */

const axios = require('axios')
const { randomUUID } = require('crypto')

const API_BASE = process.env.CYCLE_API_BASE || 'http://localhost:3001/api'
const USERNAME = process.env.CYCLE_USERNAME || 'admin'
const PASSWORD = process.env.CYCLE_PASSWORD || 'admin123'

const asArray = (value) => (Array.isArray(value) ? value : [])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const buildClient = (token) => axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` }
})

const buildClientRef = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const isClientValidationError = (error) => Number(error?.response?.status) === 400
async function login() {
    const response = await axios.post(`${API_BASE}/auth/login`, {
        username: USERNAME,
        password: PASSWORD
    })

    const token = response?.data?.accessToken || response?.data?.token
    const user = response?.data?.user || {}
    if (!token) throw new Error('Login failed: missing access token')
    return { token, user }
}

async function ensureShift(client) {
    await client.post('/shifts/resume-or-open', { starting_cash: 300 })
}

async function ensureCategory(client) {
    const response = await client.get('/categories', { params: { active_only: true } })
    const rows = asArray(response?.data?.data)
    if (rows.length) return rows[0]
    const create = await client.post('/categories', {
        name_ar: `E2E Category ${Date.now()}`,
        name_en: `E2E Category ${Date.now()}`
    })
    return create?.data?.data
}

async function ensureSellableMenuItem(client) {
    const menuResponse = await client.get('/menu', { params: { available_only: true } })
    const menuRows = asArray(menuResponse?.data?.data)
    const existing = menuRows.find((item) => item?.is_available && !item?.track_stock)
    if (existing) return existing

    const category = await ensureCategory(client)
    if (!category?.id) throw new Error('Could not resolve category for E2E item')

    const create = await client.post('/menu', {
        name_ar: `E2E NonStock Item ${Date.now()}`,
        name_en: `E2E NonStock Item ${Date.now()}`,
        price: 25,
        cost_price: 0,
        category_id: category.id,
        is_available: true,
        track_stock: false,
        item_type: 'sellable',
        unit_of_measure: 'piece'
    })

    return create?.data?.data
}

async function ensureRider(client) {
    const response = await client.get('/delivery/personnel', { params: { active: 'true' } })
    const active = asArray(response?.data?.data).find((p) => p?.is_active)
    if (active) return active

    const create = await client.post('/delivery/personnel', {
        name_ar: `Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã¢â‚¬Â ÃƒËœÃ‚Â¯Ãƒâ„¢Ã‹â€ ÃƒËœÃ‚Â¨ E2E ${Date.now()}`,
        phone: `05${String(Date.now()).slice(-8)}`
    })
    return create?.data?.data
}

async function fetchOrder(client, orderId) {
    const response = await client.get(`/orders/${orderId}`)
    return response?.data?.data
}

async function safeStatusUpdate(client, orderId, status) {
    try {
        await client.put(`/orders/${orderId}/status`, { status })
    } catch (error) {
        if (isClientValidationError(error)) return
        const statusCode = error?.response?.status
        const message = String(error?.response?.data?.message || '')
        if (statusCode === 400 && message.includes('Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â§ Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã†â€™Ãƒâ„¢Ã¢â‚¬Â  ÃƒËœÃ‚ÂªÃƒËœÃ‚ÂºÃƒâ„¢Ã…Â Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â± ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â­ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â©')) return
        throw error
    }
}

async function safeHandoff(client, orderId) {
    try {
        await client.post(`/orders/${orderId}/handoff`)
    } catch (error) {
        if (isClientValidationError(error)) return
        const statusCode = error?.response?.status
        const message = String(error?.response?.data?.message || '')
        if (statusCode === 400 && message.includes('ÃƒËœÃ‚Â¬ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Â¡ÃƒËœÃ‚Â²Ãƒâ„¢Ã¢â‚¬Â¹ÃƒËœÃ‚Â§ Ãƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â¨Ãƒâ„¢Ã¢â‚¬Å¾ ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚ÂªÃƒËœÃ‚Â³Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â Ãƒâ„¢Ã¢â‚¬Â¦')) return
        throw error
    }
}

async function safeApprove(client, orderId) {
    try {
        await client.post(`/orders/${orderId}/approve`)
    } catch (error) {
        if (isClientValidationError(error)) return
        const statusCode = error?.response?.status
        const message = String(error?.response?.data?.message || '')
        if (statusCode === 400 && message.includes('Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã…Â ÃƒËœÃ‚Â³ Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã…Â  ÃƒËœÃ‚Â­ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾ÃƒËœÃ‚Â© ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Â ÃƒËœÃ‚ÂªÃƒËœÃ‚Â¸ÃƒËœÃ‚Â§ÃƒËœÃ‚Â± ÃƒËœÃ‚Â§Ãƒâ„¢Ã¢â‚¬Å¾Ãƒâ„¢Ã¢â‚¬Â¦Ãƒâ„¢Ã‹â€ ÃƒËœÃ‚Â§Ãƒâ„¢Ã‚ÂÃƒâ„¢Ã¢â‚¬Å¡ÃƒËœÃ‚Â©')) return
        throw error
    }
}

async function safeAssignRider(client, orderId, riderId) {
    try {
        await client.post(`/delivery/orders/${orderId}/assign`, { delivery_personnel_id: riderId })
    } catch (error) {
        if (isClientValidationError(error)) return
        const statusCode = error?.response?.status
        if (statusCode === 400) return
        throw error
    }
}

async function safePickup(client, orderId) {
    try {
        await client.post(`/delivery/orders/${orderId}/pickup`)
    } catch (error) {
        if (isClientValidationError(error)) return
        const statusCode = error?.response?.status
        if (statusCode === 400) return
        throw error
    }
}

async function safeDeliveryComplete(client, orderId) {
    try {
        await client.post(`/delivery/orders/${orderId}/complete`)
    } catch (error) {
        if (isClientValidationError(error)) return
        const statusCode = error?.response?.status
        if (statusCode === 400) return
        throw error
    }
}

async function progressKitchenCashierFlow(client, orderId) {
    let order = await fetchOrder(client, orderId)
    if (!order) throw new Error(`Order not found after create: ${orderId}`)

    if (order.status === 'pending') {
        await safeApprove(client, orderId)
        order = await fetchOrder(client, orderId)
    }

    if (['approved', 'new', 'confirmed'].includes(order.status)) {
        await safeStatusUpdate(client, orderId, 'preparing')
        order = await fetchOrder(client, orderId)
    }

    if (order.status === 'preparing') {
        await safeStatusUpdate(client, orderId, 'ready')
        order = await fetchOrder(client, orderId)
    }

    if (order.status === 'ready') {
        await safeHandoff(client, orderId)
        order = await fetchOrder(client, orderId)
    }

    return order
}

async function createOrder(client, menuId, type, extra = {}) {
    const payload = {
        order_type: type,
        payment_method: 'cash',
        ...(type !== 'online' ? { payment_status: 'paid' } : {}),
        items: [{ menu_id: menuId, quantity: 1 }],
        client_reference: buildClientRef(`e2e_${type}`),
        ...extra
    }

    const response = await client.post('/orders', payload)
    return response?.data?.data
}

async function finalizeOrder(client, orderId) {
    try {
        await client.post(
            `/orders/${orderId}/complete`,
            {},
            { headers: { 'X-Idempotency-Key': randomUUID() } }
        )
    } catch (error) {
        if (isClientValidationError(error)) return
        throw error
    }
}

async function runScenario(client, menuItem, rider, scenario) {
    const { name, orderType, extraPayload, expectDeliveryTrack } = scenario
    const created = await createOrder(client, menuItem.id, orderType, extraPayload)
    if (!created?.id) throw new Error(`[${name}] create order failed`)

    await progressKitchenCashierFlow(client, created.id)

    if (expectDeliveryTrack) {
        await safeAssignRider(client, created.id, rider.id)
        await safePickup(client, created.id)
        await safeDeliveryComplete(client, created.id)
    } else {
        await finalizeOrder(client, created.id)
    }
    await sleep(150)
    const finalOrder = await fetchOrder(client, created.id)

    if (finalOrder?.status !== 'completed') {
        throw new Error(`[${name}] expected final status=completed, got=${finalOrder?.status}`)
    }
    if (expectDeliveryTrack && finalOrder?.delivery_status !== 'delivered') {
        throw new Error(`[${name}] expected delivery_status=delivered, got=${finalOrder?.delivery_status}`)
    }

    return {
        scenario: name,
        orderId: finalOrder.id,
        orderNumber: finalOrder.order_number,
        orderType: finalOrder.order_type,
        status: finalOrder.status,
        deliveryStatus: finalOrder.delivery_status || null
    }
}

async function main() {
    console.log(`API_BASE=${API_BASE}`)
    const { token, user } = await login()
    console.log(`Logged in as ${USERNAME} (${user?.role || 'unknown'})`)

    const client = buildClient(token)
    await ensureShift(client)
    const menuItem = await ensureSellableMenuItem(client)
    const rider = await ensureRider(client)

    if (!menuItem?.id) throw new Error('No menu item for E2E')
    if (!rider?.id) throw new Error('No rider for E2E')

    const scenarios = [
        {
            name: 'POS Delivery',
            orderType: 'delivery',
            extraPayload: {
                customer_phone: '0501111111',
                customer_name: 'E2E Delivery',
                delivery_address: 'E2E Street 1',
                delivery_fee: 10
            },
            expectDeliveryTrack: true
        },
        {
            name: 'POS Dine-in',
            orderType: 'dine_in',
            extraPayload: {
                table_number: 'T-12'
            },
            expectDeliveryTrack: false
        },
        {
            name: 'POS Takeaway',
            orderType: 'takeaway',
            extraPayload: {},
            expectDeliveryTrack: false
        },
        {
            name: 'Website Online -> Delivery',
            orderType: 'online',
            extraPayload: {
                customer_phone: '0502222222',
                customer_name: 'E2E Online',
                customer_address: 'E2E Online Address',
                delivery_address: 'E2E Online Address',
                delivery_fee: 8
            },
            expectDeliveryTrack: true
        }
    ]

    const results = []
    for (const scenario of scenarios) {
        const row = await runScenario(client, menuItem, rider, scenario)
        results.push(row)
        console.log(`PASS ${scenario.name}: #${row.orderNumber} (${row.orderId})`)
    }

    console.log('\nE2E scenarios completed successfully:')
    console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
    console.error('E2E channel test failed:')
    console.error(error?.response?.data || error?.message || error)
    process.exit(1)
})



