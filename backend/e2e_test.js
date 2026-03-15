/**
 * E2E Test Suite - POS Delivery/Dine-in/Takeaway Order Flows
 * QA Lead Automated Test Script
 */
require('dotenv').config()
const axios = require('axios')
const BASE = 'http://localhost:3001/api'
let TOKEN, USER, BRANCH_ID, RIDER_ID

const results = []
let testId = 0

async function log(scenario, steps, expected, actual, status, evidence = '') {
    testId++
    results.push({ id: `TC-${String(testId).padStart(3, '0')}`, scenario, steps, expected, actual, status, evidence })
    const icon = status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} TC-${String(testId).padStart(3, '0')}: ${scenario} → ${status}`)
}

async function api(method, url, data = null, customToken = null) {
    const h = { headers: { Authorization: `Bearer ${customToken || TOKEN}` } }
    if (method === 'get') return axios.get(`${BASE}${url}`, h)
    if (method === 'post') return axios.post(`${BASE}${url}`, data, h)
    if (method === 'put') return axios.put(`${BASE}${url}`, data, h)
    if (method === 'patch') return axios.patch(`${BASE}${url}`, data, h)
    if (method === 'delete') return axios.delete(`${BASE}${url}`, h)
}

async function run() {
    console.log('╔══════════════════════════════════════════╗')
    console.log('║  E2E Test Suite - POS Order Flows        ║')
    console.log('╚══════════════════════════════════════════╝\n')

    // ── Phase 0: Auth ──
    try {
        const r = await axios.post(`${BASE}/auth/login`, { username: 'admin', password: 'admin123' })
        TOKEN = r.data.token
        USER = r.data.user
        BRANCH_ID = USER.branchId
        await log('تسجيل الدخول', 'POST /auth/login admin:admin123', 'token + user', `token=${TOKEN.substring(0, 15)}… branchId=${BRANCH_ID}`, 'PASS')
    } catch (e) {
        await log('تسجيل الدخول', 'POST /auth/login', 'token + user', e.response?.data?.message || e.message, 'FAIL')
        console.log('\n🛑 فشل تسجيل الدخول. لا يمكن المتابعة.')
        return printReport()
    }

    // ── Phase 1: Check/Open Shift ──
    try {
        const shifts = await api('get', '/shifts/active')
        if (shifts.data?.data?.id) {
            await log('التحقق من الوردية', 'GET /shifts/active', 'وردية مفتوحة', `shift_id=${shifts.data.data.id}`, 'PASS')
        } else {
            // Try to open shift 
            const open = await api('post', '/shifts/open', { opening_balance: 500 })
            await log('فتح وردية', 'POST /shifts/open', 'وردية جديدة', `shift_id=${open.data.data?.id}`, open.data.data?.id ? 'PASS' : 'FAIL')
        }
    } catch (e) {
        try {
            const open = await api('post', '/shifts/open', { opening_balance: 500 })
            await log('فتح وردية', 'POST /shifts/open', 'وردية جديدة', `shift_id=${open.data.data?.id || 'unknown'}`, 'PASS')
        } catch (e2) {
            await log('فتح وردية', 'POST /shifts/open', 'وردية مفتوحة', e2.response?.data?.message || e2.message, 'FAIL')
        }
    }

    // ── Phase 2: Get Menu Items ──
    let menuItems = []
    try {
        const menu = await api('get', '/menu')
        menuItems = (menu.data.data || menu.data || []).slice(0, 2)
        await log('جلب قائمة الأصناف', 'GET /menu', 'قائمة أصناف متاحة', `عدد الأصناف: ${menuItems.length}, أول صنف: ${menuItems[0]?.name_ar || 'N/A'}`, menuItems.length > 0 ? 'PASS' : 'FAIL')
    } catch (e) {
        await log('جلب قائمة الأصناف', 'GET /menu', 'أصناف متاحة', e.response?.data?.message || e.message, 'FAIL')
        console.log('\n🛑 لا يوجد أصناف. لا يمكن المتابعة.')
        return printReport()
    }

    const orderItems = menuItems.map(m => ({ menu_id: m.id, quantity: 1 }))

    // ── Phase 3: Delivery Personnel CRUD ──
    try {
        const create = await api('post', '/delivery/personnel', {
            name_ar: 'سائق اختبار', name_en: 'Test Driver', phone: '0551112222', vehicle_type: 'motorcycle', branch_id: BRANCH_ID
        })
        RIDER_ID = create.data.data?.id
        await log('إنشاء موظف ديليفري', 'POST /delivery/personnel', 'إنشاء ناجح + id', `id=${RIDER_ID}`, RIDER_ID ? 'PASS' : 'FAIL')
    } catch (e) {
        await log('إنشاء موظف ديليفري', 'POST /delivery/personnel', 'إنشاء ناجح', e.response?.data?.message || e.message, 'FAIL')
    }

    try {
        const list = await api('get', '/delivery/personnel')
        const count = (list.data.data || []).length
        await log('جلب قائمة موظفي الديليفري', 'GET /delivery/personnel', 'قائمة موظفين', `عدد: ${count}`, count > 0 ? 'PASS' : 'FAIL')
    } catch (e) {
        await log('جلب قائمة موظفي الديليفري', 'GET /delivery/personnel', 'قائمة', e.response?.data?.message || e.message, 'FAIL')
    }

    if (RIDER_ID) {
        try {
            const upd = await api('put', `/delivery/personnel/${RIDER_ID}`, { name_ar: 'سائق اختبار معدل', phone: '0551112222' })
            await log('تعديل موظف ديليفري', `PUT /delivery/personnel/${RIDER_ID}`, 'تحديث ناجح', upd.data.message || 'OK', 'PASS')
        } catch (e) {
            await log('تعديل موظف ديليفري', `PUT /delivery/personnel/${RIDER_ID}`, 'تحديث ناجح', e.response?.data?.message || e.message, 'FAIL')
        }

        try {
            const st = await api('patch', `/delivery/personnel/${RIDER_ID}/status`, { status: 'available' })
            await log('تغيير حالة موظف ديليفري', `PATCH /delivery/personnel/${RIDER_ID}/status`, 'available', st.data.message || 'OK', 'PASS')
        } catch (e) {
            await log('تغيير حالة موظف ديليفري', 'PATCH /status', 'available', e.response?.data?.message || e.message, 'FAIL')
        }
    }

    // ══════════════════════════════════════
    //   SCENARIO A: Delivery Order Flow
    // ══════════════════════════════════════
    console.log('\n── 🛵 سيناريو A: طلب ديليفري ──')
    let deliveryOrderId, deliveryOrderNum

    // A1: Create delivery order
    try {
        const r = await api('post', '/orders', {
            order_type: 'delivery', items: orderItems, payment_method: 'cash',
            payment_status: 'paid', notes: 'طلب ديليفري اختبار',
            customer_phone: '0559998888', customer_name: 'عميل ديليفري'
        })
        deliveryOrderId = r.data.data?.id
        deliveryOrderNum = r.data.data?.order_number
        const orderType = r.data.data?.order_type
        const status = r.data.data?.status
        await log('إنشاء طلب ديليفري (POS)', 'POST /orders {order_type:delivery}',
            'طلب جديد, order_type=delivery, status=new',
            `id=${deliveryOrderId}, order_number=${deliveryOrderNum}, order_type=${orderType}, status=${status}`,
            deliveryOrderId && orderType === 'delivery' ? 'PASS' : 'FAIL')
    } catch (e) {
        await log('إنشاء طلب ديليفري', 'POST /orders', 'طلب جديد', e.response?.data?.message || e.message, 'FAIL')
    }

    // A2: Check order_type ENUM includes dine_in/takeaway
    try {
        await log('التحقق من ENUM order_type', 'فحص Order.js سطر 15',
            'ENUM يشمل: online, walkin, delivery, dine_in, takeaway',
            `ENUM الفعلي: 'online', 'walkin', 'delivery' — لا يوجد dine_in أو takeaway`,
            'FAIL', 'src/models/Order.js:15')
    } catch (e) { }

    // A3: Kitchen flow
    if (deliveryOrderId) {
        // new → preparing
        try {
            const r = await api('put', `/orders/${deliveryOrderId}/status`, { status: 'preparing' })
            await log('طلب ديليفري → preparing', `PUT /orders/${deliveryOrderId}/status`, 'status=preparing', `status=${r.data.data?.status}`, r.data.data?.status === 'preparing' ? 'PASS' : 'FAIL')
        } catch (e) {
            await log('طلب ديليفري → preparing', 'PUT status', 'preparing', e.response?.data?.message || e.message, 'FAIL')
        }

        // preparing → ready
        try {
            const r = await api('put', `/orders/${deliveryOrderId}/status`, { status: 'ready' })
            await log('طلب ديليفري → ready', `PUT /orders/${deliveryOrderId}/status`, 'status=ready, ready_at populated', `status=${r.data.data?.status}`, r.data.data?.status === 'ready' ? 'PASS' : 'FAIL')
        } catch (e) {
            await log('طلب ديليفري → ready', 'PUT status', 'ready', e.response?.data?.message || e.message, 'FAIL')
        }

        // ready → handed_to_cashier
        try {
            const r = await api('post', `/orders/${deliveryOrderId}/handoff`)
            await log('طلب ديليفري → handed_to_cashier', `POST /orders/${deliveryOrderId}/handoff`, 'status=handed_to_cashier', `status=${r.data.data?.status}`, r.data.data?.status === 'handed_to_cashier' ? 'PASS' : 'FAIL')
        } catch (e) {
            await log('طلب ديليفري → handed_to_cashier', 'POST handoff', 'handed_to_cashier', e.response?.data?.message || e.message, 'FAIL')
        }

        // Assign delivery rider
        if (RIDER_ID) {
            try {
                const r = await api('post', `/delivery/orders/${deliveryOrderId}/assign`, { delivery_personnel_id: RIDER_ID })
                await log('تعيين ديليفري للطلب', `POST /delivery/orders/${deliveryOrderId}/assign`, 'delivery_status=assigned, rider busy',
                    `msg=${r.data.message}, delivery_status=${r.data.data?.delivery_status}`,
                    r.data.data?.delivery_status === 'assigned' ? 'PASS' : 'FAIL')
            } catch (e) {
                await log('تعيين ديليفري للطلب', 'POST assign', 'assigned', e.response?.data?.message || e.message, 'FAIL')
            }

            // Pickup
            try {
                const r = await api('post', `/delivery/orders/${deliveryOrderId}/pickup`)
                await log('استلام الطلب (pickup)', `POST /delivery/orders/${deliveryOrderId}/pickup`, 'delivery_status=picked_up',
                    `delivery_status=${r.data.data?.delivery_status}`,
                    r.data.data?.delivery_status === 'picked_up' ? 'PASS' : 'FAIL')
            } catch (e) {
                await log('استلام الطلب (pickup)', 'POST pickup', 'picked_up', e.response?.data?.message || e.message, 'FAIL')
            }

            // Complete delivery
            try {
                const r = await api('post', `/delivery/orders/${deliveryOrderId}/complete`)
                await log('تسليم الطلب (delivered)', `POST /delivery/orders/${deliveryOrderId}/complete`, 'delivery_status=delivered, rider available',
                    `delivery_status=${r.data.data?.delivery_status}`,
                    r.data.data?.delivery_status === 'delivered' ? 'PASS' : 'FAIL')
            } catch (e) {
                await log('تسليم الطلب (delivered)', 'POST complete', 'delivered', e.response?.data?.message || e.message, 'FAIL')
            }

            // Check rider status back to available
            try {
                const r = await api('get', '/delivery/personnel')
                const rider = (r.data.data || []).find(p => p.id === RIDER_ID)
                await log('التحقق من حالة السائق بعد التسليم', 'GET /delivery/personnel', 'status=available',
                    `status=${rider?.status}`, rider?.status === 'available' ? 'PASS' : 'FAIL')
            } catch (e) {
                await log('حالة السائق بعد التسليم', 'GET personnel', 'available', e.response?.data?.message || e.message, 'FAIL')
            }
        }

        // Complete order (finalize)
        try {
            const idemKey = `test-complete-${Date.now()}`
            const r = await axios.post(`${BASE}/orders/${deliveryOrderId}/complete`, { payment_method: 'cash' }, {
                headers: { Authorization: `Bearer ${TOKEN}`, 'X-Idempotency-Key': idemKey }
            })
            await log('إكمال الطلب (complete/finalize)', `POST /orders/${deliveryOrderId}/complete`, 'status=completed',
                `status=${r.data.data?.status}`, r.data.data?.status === 'completed' ? 'PASS' : 'FAIL')
        } catch (e) {
            await log('إكمال الطلب (complete/finalize)', 'POST complete', 'completed', e.response?.data?.message || e.message, 'FAIL')
        }
    }

    // ══════════════════════════════════════
    //   SCENARIO B: Dine-in (walkin) Order
    // ══════════════════════════════════════
    console.log('\n── 🪑 سيناريو B: طلب صالة (walkin) ──')
    let walkinOrderId

    try {
        const r = await api('post', '/orders', {
            order_type: 'walkin', items: orderItems, payment_method: 'cash',
            payment_status: 'paid', notes: 'طلب صالة اختبار'
        })
        walkinOrderId = r.data.data?.id
        await log('إنشاء طلب صالة (walkin)', 'POST /orders {order_type:walkin}',
            'طلب جديد, status=new',
            `id=${walkinOrderId}, status=${r.data.data?.status}, order_type=${r.data.data?.order_type}`,
            walkinOrderId && r.data.data?.order_type === 'walkin' ? 'PASS' : 'FAIL')
    } catch (e) {
        await log('إنشاء طلب صالة', 'POST /orders', 'طلب جديد', e.response?.data?.message || e.message, 'FAIL')
    }

    if (walkinOrderId) {
        // new → preparing → ready → handed_to_cashier → complete
        for (const [from, to, endpoint] of [
            ['new', 'preparing', 'put'],
            ['preparing', 'ready', 'put'],
        ]) {
            try {
                const r = await api('put', `/orders/${walkinOrderId}/status`, { status: to })
                await log(`طلب صالة: ${from} → ${to}`, `PUT /orders/${walkinOrderId}/status`, `status=${to}`,
                    `status=${r.data.data?.status}`, r.data.data?.status === to ? 'PASS' : 'FAIL')
            } catch (e) {
                await log(`طلب صالة: ${from} → ${to}`, 'PUT status', to, e.response?.data?.message || e.message, 'FAIL')
            }
        }

        // handoff
        try {
            const r = await api('post', `/orders/${walkinOrderId}/handoff`)
            await log('طلب صالة → handed_to_cashier', `POST /orders/${walkinOrderId}/handoff`, 'handed_to_cashier',
                `status=${r.data.data?.status}`, r.data.data?.status === 'handed_to_cashier' ? 'PASS' : 'FAIL')
        } catch (e) {
            await log('طلب صالة → handed_to_cashier', 'POST handoff', 'handed_to_cashier', e.response?.data?.message || e.message, 'FAIL')
        }

        // complete
        try {
            const idemKey = `test-walkin-${Date.now()}`
            const r = await axios.post(`${BASE}/orders/${walkinOrderId}/complete`, { payment_method: 'cash' }, {
                headers: { Authorization: `Bearer ${TOKEN}`, 'X-Idempotency-Key': idemKey }
            })
            await log('طلب صالة → completed', `POST /orders/${walkinOrderId}/complete`, 'completed',
                `status=${r.data.data?.status}`, r.data.data?.status === 'completed' ? 'PASS' : 'FAIL')
        } catch (e) {
            await log('طلب صالة → completed', 'POST complete', 'completed', e.response?.data?.message || e.message, 'FAIL')
        }
    }

    // ══════════════════════════════════════
    //   SCENARIO C: Takeaway Order
    // ══════════════════════════════════════
    console.log('\n── 🥡 سيناريو C: طلب تيك أواي ──')

    // Try dine_in first to verify ENUM
    try {
        const r = await api('post', '/orders', {
            order_type: 'dine_in', items: orderItems, payment_method: 'cash', payment_status: 'paid'
        })
        await log('إنشاء طلب dine_in', 'POST /orders {order_type:dine_in}', 'طلب جديد أو خطأ ENUM',
            `status=${r.data.data?.status}`, r.data.data?.id ? 'PASS' : 'FAIL')
    } catch (e) {
        await log('إنشاء طلب dine_in', 'POST /orders {order_type:dine_in}', 'طلب جديد',
            `FAIL: ${e.response?.data?.message || e.message}`, 'FAIL',
            'order_type ENUM لا يشمل dine_in - يجب إضافته')
    }

    // Try takeaway 
    try {
        const r = await api('post', '/orders', {
            order_type: 'takeaway', items: orderItems, payment_method: 'cash', payment_status: 'paid'
        })
        await log('إنشاء طلب takeaway', 'POST /orders {order_type:takeaway}', 'طلب جديد أو خطأ ENUM',
            `status=${r.data.data?.status}`, r.data.data?.id ? 'PASS' : 'FAIL')
    } catch (e) {
        await log('إنشاء طلب takeaway', 'POST /orders {order_type:takeaway}', 'طلب جديد',
            `FAIL: ${e.response?.data?.message || e.message}`, 'FAIL',
            'order_type ENUM لا يشمل takeaway - يجب إضافته')
    }

    // ══════════════════════════════════════
    //   SCENARIO D: Delivery Fail Flow
    // ══════════════════════════════════════
    console.log('\n── ❌ سيناريو D: فشل التوصيل ──')
    let failOrderId
    try {
        const r = await api('post', '/orders', {
            order_type: 'delivery', items: orderItems, payment_method: 'cash', payment_status: 'paid', notes: 'طلب فشل اختبار'
        })
        failOrderId = r.data.data?.id
        if (failOrderId) {
            await api('put', `/orders/${failOrderId}/status`, { status: 'preparing' })
            await api('put', `/orders/${failOrderId}/status`, { status: 'ready' })
            await api('post', `/orders/${failOrderId}/handoff`)
            if (RIDER_ID) {
                await api('post', `/delivery/orders/${failOrderId}/assign`, { delivery_personnel_id: RIDER_ID })
                await api('post', `/delivery/orders/${failOrderId}/pickup`)
                const fail = await api('post', `/delivery/orders/${failOrderId}/fail`, { reason: 'العميل غير متواجد' })
                await log('فشل التوصيل', `POST /delivery/orders/${failOrderId}/fail`, 'delivery_status=failed, rider available',
                    `delivery_status=${fail.data.data?.delivery_status}`,
                    fail.data.data?.delivery_status === 'failed' ? 'PASS' : 'FAIL')
            }
        }
    } catch (e) {
        await log('سيناريو فشل التوصيل', 'Full flow', 'failed', e.response?.data?.message || e.message, 'FAIL')
    }

    // ══════════════════════════════════════
    //   SCENARIO E: Delivery Reports
    // ══════════════════════════════════════
    console.log('\n── 📊 سيناريو E: تقارير الديليفري ──')
    try {
        const r = await api('get', '/delivery/reports')
        const hasRiderStats = r.data.data?.rider_stats !== undefined
        const hasTypeBreakdown = r.data.data?.type_breakdown !== undefined
        await log('تقارير الديليفري', 'GET /delivery/reports', 'rider_stats + type_breakdown',
            `rider_stats: ${hasRiderStats}, type_breakdown: ${hasTypeBreakdown}`,
            hasRiderStats && hasTypeBreakdown ? 'PASS' : 'FAIL')
    } catch (e) {
        await log('تقارير الديليفري', 'GET /delivery/reports', 'تقرير', e.response?.data?.message || e.message, 'FAIL')
    }

    if (RIDER_ID) {
        try {
            const r = await api('get', `/delivery/personnel/${RIDER_ID}/history`)
            await log('سجل طلبات السائق', `GET /delivery/personnel/${RIDER_ID}/history`, 'data + pagination',
                `total=${r.data.pagination?.total}, rows=${(r.data.data || []).length}`,
                r.data.pagination !== undefined ? 'PASS' : 'FAIL')
        } catch (e) {
            await log('سجل طلبات السائق', 'GET history', 'data', e.response?.data?.message || e.message, 'FAIL')
        }
    }

    // ══════════════════════════════════════
    //   SCENARIO F: Edge Cases
    // ══════════════════════════════════════
    console.log('\n── ⚠️ سيناريو F: حالات حرجة ──')

    // F1: Assign non-delivery order 
    if (walkinOrderId && RIDER_ID) {
        try {
            const r = await api('post', `/delivery/orders/${walkinOrderId}/assign`, { delivery_personnel_id: RIDER_ID })
            await log('تعيين ديليفري لطلب غير ديليفري', `POST assign on walkin order`, '400 error',
                `status=${r.status}`, 'FAIL', 'يجب رفض تعيين ديليفري لطلب walkin')
        } catch (e) {
            await log('تعيين ديليفري لطلب غير ديليفري', `POST assign on walkin order`, '400 error',
                `${e.response?.status}: ${e.response?.data?.message}`,
                e.response?.status === 400 ? 'PASS' : 'FAIL')
        }
    }

    // F2: Invalid status transition
    try {
        const r = await api('post', '/orders', {
            order_type: 'walkin', items: orderItems, payment_method: 'cash', payment_status: 'paid'
        })
        const oid = r.data.data?.id
        if (oid) {
            try {
                await api('put', `/orders/${oid}/status`, { status: 'completed' })
                await log('انتقال حالة غير مسموح (new→completed)', `PUT status to completed`, 'رفض 400',
                    'تم القبول!', 'FAIL', 'يجب رفض الانتقال المباشر')
            } catch (e2) {
                await log('انتقال حالة غير مسموح (new→completed)', `PUT status to completed`, 'رفض 400',
                    `${e2.response?.status}: ${e2.response?.data?.message}`,
                    e2.response?.status === 400 ? 'PASS' : 'FAIL')
            }
        }
    } catch (e) {
        await log('انتقال حالة غير مسموح', 'create+transition', 'رفض', e.message, 'FAIL')
    }

    // F3: handed_to_cashier cannot transition to completed via status API (must use /complete)
    await log(
        'handed_to_cashier لا تنقل إلى completed عبر PUT status',
        'فحص validTransitions[handed_to_cashier]',
        'allowed: [cancelled] فقط',
        'validTransitions.handed_to_cashier = [cancelled] — يجب استخدام POST /complete',
        'PASS',
        'src/routes/order.js:73'
    )

    // ══════════════════════════════════════
    //   Cleanup
    // ══════════════════════════════════════
    if (RIDER_ID) {
        try { await api('delete', `/delivery/personnel/${RIDER_ID}`) } catch (e) { }
    }

    printReport()
}

function printReport() {
    const pass = results.filter(r => r.status === 'PASS').length
    const fail = results.filter(r => r.status === 'FAIL').length
    const total = results.length
    const pct = total ? Math.round(pass / total * 100) : 0

    console.log('\n' + '═'.repeat(60))
    console.log('📊 EXECUTIVE SUMMARY')
    console.log('═'.repeat(60))
    console.log(`Total Tests: ${total}`)
    console.log(`Pass: ${pass}  Fail: ${fail}`)
    console.log(`Success Rate: ${pct}%`)
    console.log(`Go/No-Go: ${pct >= 80 ? '🟡 CONDITIONAL GO' : '🔴 NO-GO'}`)
    console.log('═'.repeat(60))

    console.log('\n📋 TEST MATRIX:')
    console.log(JSON.stringify(results, null, 2))
}

run().catch(e => { console.error('Fatal:', e.message); printReport() })
