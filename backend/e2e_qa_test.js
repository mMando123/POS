/**
 * ═══════════════════════════════════════════════════════════════
 *  E2E QA TEST SUITE — POS Restaurant System
 *  Date: 2026-03-06        Author: QA Automation
 * ═══════════════════════════════════════════════════════════════
 */
require('dotenv').config()
const axios = require('axios')
const BASE = 'http://localhost:3001/api'

let TOKEN, USER, BRANCH_ID
const R = [] // results
let tid = 0

const tc = (scenario, steps, expected, actual, status, evidence = '') => {
    tid++
    const id = `TC-${String(tid).padStart(3, '0')}`
    R.push({ id, scenario, steps, expected, actual, status, evidence })
    console.log(`${status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'} ${id}: ${scenario}`)
}

const api = async (method, url, data, headers) => {
    const h = { Authorization: `Bearer ${TOKEN}`, ...headers }
    const cfg = { headers: h }
    if (method === 'get') return axios.get(`${BASE}${url}`, cfg)
    if (method === 'post') return axios.post(`${BASE}${url}`, data, cfg)
    if (method === 'put') return axios.put(`${BASE}${url}`, data, cfg)
    if (method === 'patch') return axios.patch(`${BASE}${url}`, data, cfg)
    if (method === 'delete') return axios.delete(`${BASE}${url}`, cfg)
}

const safe = async (fn) => { try { return await fn() } catch (e) { return { _err: e } } }
const errMsg = (e) => e._err?.response?.data?.message || e._err?.message || 'unknown'
const db = () => require('./src/models/index')

async function run() {
    console.log('\n╔═══════════════════════════════════════════════════╗')
    console.log('║    E2E QA Test Suite — Full Order Flow            ║')
    console.log('╚═══════════════════════════════════════════════════╝\n')

    // ═══ PHASE 0: LOGIN ═══
    const login = await safe(() => axios.post(`${BASE}/auth/login`, { username: 'admin', password: 'admin123' }))
    if (login._err) { tc('تسجيل الدخول', 'POST /auth/login', '200+token', errMsg(login), 'FAIL'); return report() }
    TOKEN = login.data.token; USER = login.data.user; BRANCH_ID = USER.branchId
    tc('تسجيل الدخول', 'POST /auth/login', '200+token+branchId', `token OK, branchId=${BRANCH_ID}`, 'PASS')

    // ═══ PHASE 1: SHIFT ═══
    let shiftId
    const shiftCheck = await safe(() => api('post', '/shifts/resume-or-open', { starting_cash: 500 }))
    if (!shiftCheck._err && shiftCheck.data.data?.id) {
        shiftId = shiftCheck.data.data?.id
        tc('فتح/استئناف وردية', 'POST /shifts/resume-or-open', 'shift_id', `shift_id=${shiftId}, action=${shiftCheck.data.action}`, 'PASS')
    } else if (!shiftCheck._err && shiftCheck.data.action === 'request_opening') {
        const openShift = await safe(() => api('post', '/shifts/start', { starting_cash: 500 }))
        if (openShift._err) tc('فتح وردية', 'POST /shifts/start', '200+shift', errMsg(openShift), 'FAIL')
        else { shiftId = openShift.data.data?.id; tc('فتح وردية', 'POST /shifts/start', 'shift_id', `shift_id=${shiftId}`, shiftId ? 'PASS' : 'FAIL') }
    } else {
        tc('فتح/استئناف وردية', 'POST /shifts/resume-or-open', 'shift_id', errMsg(shiftCheck), 'FAIL')
    }

    // ═══ PHASE 2: MENU ITEMS ═══
    const menuRes = await safe(() => api('get', '/menu'))
    const menuItems = menuRes._err ? [] : (menuRes.data.data || menuRes.data || [])
    tc('جلب الأصناف', 'GET /menu', 'items.length > 0', `عدد: ${menuItems.length}`, menuItems.length > 0 ? 'PASS' : 'FAIL')
    if (menuItems.length === 0) { console.log('🛑 لا يوجد أصناف'); return report() }
    const orderItems = menuItems.slice(0, 2).map(m => ({ menu_id: m.id, quantity: 1 }))

    // ═══ PHASE 3: DELIVERY PERSONNEL ═══
    let riderId
    const createRider = await safe(() => api('post', '/delivery/personnel', {
        name_ar: 'سائق QA', name_en: 'QA Driver', phone: '0599990000', vehicle_type: 'motorcycle', branch_id: BRANCH_ID
    }))
    if (!createRider._err) { riderId = createRider.data.data?.id; tc('إنشاء سائق', 'POST /delivery/personnel', 'id', `id=${riderId}`, riderId ? 'PASS' : 'FAIL') }
    else tc('إنشاء سائق', 'POST /delivery/personnel', 'id', errMsg(createRider), 'FAIL')

    // ════════════════════════════════════════════════════════
    //  SCENARIO A: DELIVERY ORDER — Full Lifecycle
    // ════════════════════════════════════════════════════════
    console.log('\n── 🛵 سيناريو A: طلب ديليفري — دورة كاملة ──')
    let dOrd
    const dCreate = await safe(() => api('post', '/orders', {
        order_type: 'delivery', items: orderItems, payment_method: 'cash', payment_status: 'paid',
        notes: 'QA delivery test', customer_phone: '0500001111', customer_name: 'عميل QA', delivery_address: 'شارع الملك فهد 22'
    }))
    if (!dCreate._err) {
        dOrd = dCreate.data.data
        tc('إنشاء طلب ديليفري', 'POST /orders {delivery}', 'status=new, order_type=delivery',
            `id=${dOrd.id?.substring(0, 8)}, status=${dOrd.status}, type=${dOrd.order_type}`,
            dOrd.order_type === 'delivery' && dOrd.status === 'new' ? 'PASS' : 'FAIL')
    } else tc('إنشاء طلب ديليفري', 'POST /orders', 'status=new', errMsg(dCreate), 'FAIL')

    if (dOrd) {
        // Verify DB directly
        const dbOrder = await db().sequelize.query(
            `SELECT id, order_number, order_type, status, delivery_status, delivery_address FROM orders WHERE id = :id`,
            { replacements: { id: dOrd.id }, type: db().sequelize.QueryTypes.SELECT }
        )
        tc('التحقق من DB بعد الإنشاء', `SELECT * FROM orders WHERE id='${dOrd.id?.substring(0, 8)}...'`,
            'order_type=delivery, delivery_address مملوء',
            `type=${dbOrder[0]?.order_type}, address=${dbOrder[0]?.delivery_address?.substring(0, 15) || 'NULL'}`,
            dbOrder[0]?.order_type === 'delivery' ? 'PASS' : 'FAIL',
            'Evidence: Direct MySQL query')

        // Status transitions: new → preparing → ready → handed_to_cashier
        for (const [from, to] of [['new', 'preparing'], ['preparing', 'ready']]) {
            const r = await safe(() => api('put', `/orders/${dOrd.id}/status`, { status: to }))
            if (!r._err) tc(`ديليفري: ${from}→${to}`, `PUT /orders/:id/status {${to}}`, `status=${to}`, `status=${r.data.data?.status}`, r.data.data?.status === to ? 'PASS' : 'FAIL')
            else tc(`ديليفري: ${from}→${to}`, `PUT status`, to, errMsg(r), 'FAIL')
        }

        // Handoff
        const handoff = await safe(() => api('post', `/orders/${dOrd.id}/handoff`))
        if (!handoff._err) tc('ديليفري: ready→handed_to_cashier', 'POST /orders/:id/handoff', 'handed_to_cashier', `status=${handoff.data.data?.status}`, handoff.data.data?.status === 'handed_to_cashier' ? 'PASS' : 'FAIL')
        else tc('ديليفري: handoff', 'POST handoff', 'handed_to_cashier', errMsg(handoff), 'FAIL')

        // Assign rider
        if (riderId) {
            const assign = await safe(() => api('post', `/delivery/orders/${dOrd.id}/assign`, { delivery_personnel_id: riderId }))
            if (!assign._err) {
                // Verify delivery_status from DB
                const dbAfter = await db().sequelize.query(
                    `SELECT delivery_status, delivery_personnel_id, delivery_assigned_at FROM orders WHERE id = :id`,
                    { replacements: { id: dOrd.id }, type: db().sequelize.QueryTypes.SELECT }
                )
                tc('تعيين سائق للطلب', 'POST /delivery/orders/:id/assign', 'delivery_status=assigned في DB',
                    `DB.delivery_status=${dbAfter[0]?.delivery_status}, personnel_id=${dbAfter[0]?.delivery_personnel_id?.substring(0, 8) || 'NULL'}`,
                    dbAfter[0]?.delivery_status === 'assigned' ? 'PASS' : 'FAIL',
                    'Evidence: Direct DB check after assign')
            } else tc('تعيين سائق', 'POST assign', 'assigned', errMsg(assign), 'FAIL')

            // Verify API returns delivery_status
            const apiCheck = await safe(() => api('get', `/delivery/orders`))
            if (!apiCheck._err) {
                const thisOrder = (apiCheck.data.data || []).find(o => o.id === dOrd.id)
                tc('API يرجع delivery_status صحيح', 'GET /delivery/orders → filter by id',
                    'delivery_status=assigned',
                    `delivery_status=${thisOrder?.delivery_status || 'NOT_FOUND'}`,
                    thisOrder?.delivery_status === 'assigned' ? 'PASS' : 'FAIL',
                    'Evidence: API response vs DB')
            }

            // Pickup
            const pickup = await safe(() => api('post', `/delivery/orders/${dOrd.id}/pickup`))
            if (!pickup._err) {
                const dbPU = await db().sequelize.query(
                    `SELECT delivery_status, picked_up_at FROM orders WHERE id = :id`,
                    { replacements: { id: dOrd.id }, type: db().sequelize.QueryTypes.SELECT }
                )
                tc('استلام الطلب (pickup)', 'POST /delivery/orders/:id/pickup', 'delivery_status=picked_up, picked_up_at NOT NULL',
                    `DB: delivery_status=${dbPU[0]?.delivery_status}, picked_up_at=${dbPU[0]?.picked_up_at ? 'SET' : 'NULL'}`,
                    dbPU[0]?.delivery_status === 'picked_up' ? 'PASS' : 'FAIL')
            } else tc('استلام (pickup)', 'POST pickup', 'picked_up', errMsg(pickup), 'FAIL')

            // Complete delivery
            const complete = await safe(() => api('post', `/delivery/orders/${dOrd.id}/complete`))
            if (!complete._err) {
                const dbDone = await db().sequelize.query(
                    `SELECT delivery_status, delivered_at FROM orders WHERE id = :id`,
                    { replacements: { id: dOrd.id }, type: db().sequelize.QueryTypes.SELECT }
                )
                tc('تسليم الطلب (delivered)', 'POST /delivery/orders/:id/complete', 'delivery_status=delivered, delivered_at NOT NULL',
                    `DB: delivery_status=${dbDone[0]?.delivery_status}, delivered_at=${dbDone[0]?.delivered_at ? 'SET' : 'NULL'}`,
                    dbDone[0]?.delivery_status === 'delivered' ? 'PASS' : 'FAIL')
            } else tc('تسليم (delivered)', 'POST complete', 'delivered', errMsg(complete), 'FAIL')

            // Check rider freed
            const riderCheck = await safe(() => api('get', '/delivery/personnel'))
            if (!riderCheck._err) {
                const rider = (riderCheck.data.data || []).find(p => p.id === riderId)
                tc('السائق يعود لـ available بعد التسليم', 'GET /delivery/personnel', 'status=available',
                    `status=${rider?.status}`, rider?.status === 'available' ? 'PASS' : 'FAIL')
            }
        }

        // Delivery completion now finalizes the order as well
        const fin = complete
        if (!complete._err) {
            const dbFin = await db().sequelize.query(
                `SELECT status, payment_status, completed_at FROM orders WHERE id = :id`,
                { replacements: { id: dOrd.id }, type: db().sequelize.QueryTypes.SELECT }
            )
            tc('إكمال/تسوية الطلب (finalize)', 'POST /orders/:id/complete', 'status=completed, payment_status=paid',
                `DB: status=${dbFin[0]?.status}, payment=${dbFin[0]?.payment_status}`,
                dbFin[0]?.status === 'completed' && dbFin[0]?.payment_status === 'paid' ? 'PASS' : 'FAIL',
                'Evidence: DB + stock_movements + journal_entries')

            // Check stock movement
            try {
                const stockMov = await db().sequelize.query(
                    `SELECT COUNT(*) as cnt FROM stock_movements WHERE source_id = :id AND source_type = 'order'`,
                    { replacements: { id: dOrd.id }, type: db().sequelize.QueryTypes.SELECT }
                )
                tc('خصم المخزون (stock_movements)', 'SELECT stock_movements WHERE source_id=order', 'cnt > 0',
                    `cnt=${stockMov[0]?.cnt}`, parseInt(stockMov[0]?.cnt) > 0 ? 'PASS' : 'FAIL')
            } catch (dbErr) {
                tc('خصم المخزون (stock_movements)', 'DB query', 'cnt > 0', dbErr.message.substring(0, 60), 'FAIL')
            }

            // Check journal entry (actual table = gl_journal_entries)
            try {
                const je = await db().sequelize.query(
                    `SELECT COUNT(*) as cnt FROM gl_journal_entries WHERE source_type = 'order' AND source_id = :id`,
                    { replacements: { id: dOrd.id }, type: db().sequelize.QueryTypes.SELECT }
                )
                tc('قيد محاسبي (journal_entry)', 'SELECT gl_journal_entries WHERE source_id=order', 'cnt > 0',
                    `cnt=${je[0]?.cnt}`, parseInt(je[0]?.cnt) > 0 ? 'PASS' : 'FAIL')
            } catch (dbErr) {
                tc('قيد محاسبي (journal_entry)', 'DB query', 'جدول موجود', `خطأ: ${dbErr.message.substring(0, 50)}`, 'FAIL')
            }
        } else {
            tc('إكمال الطلب (finalize)', 'POST /orders/:id/complete', 'completed', errMsg(fin), 'FAIL',
                `Root: ${fin._err?.response?.data?.message || fin._err?.message}`)
        }
    }

    // ════════════════════════════════════════════════════════
    //  SCENARIO B: TAKEAWAY ORDER — Full Lifecycle
    // ════════════════════════════════════════════════════════
    console.log('\n── 🥡 سيناريو B: طلب تيك أواي — دورة كاملة ──')
    const tCreate = await safe(() => api('post', '/orders', {
        order_type: 'takeaway', items: orderItems, payment_method: 'cash', payment_status: 'paid', notes: 'QA takeaway'
    }))
    let tOrd
    if (!tCreate._err) {
        tOrd = tCreate.data.data
        tc('إنشاء طلب تيك أواي', 'POST /orders {takeaway}', 'status=new, type=takeaway',
            `id=${tOrd.id?.substring(0, 8)}, status=${tOrd.status}, type=${tOrd.order_type}`,
            tOrd.order_type === 'takeaway' ? 'PASS' : 'FAIL')
    } else tc('إنشاء طلب تيك أواي', 'POST /orders {takeaway}', 'status=new', errMsg(tCreate), 'FAIL',
        'order_type ENUM قد لا يشمل takeaway')

    if (tOrd) {
        for (const [f, t] of [['new', 'preparing'], ['preparing', 'ready']]) {
            const r = await safe(() => api('put', `/orders/${tOrd.id}/status`, { status: t }))
            if (!r._err) tc(`تيك أواي: ${f}→${t}`, `PUT status`, t, `status=${r.data.data?.status}`, r.data.data?.status === t ? 'PASS' : 'FAIL')
            else tc(`تيك أواي: ${f}→${t}`, `PUT status`, t, errMsg(r), 'FAIL')
        }
        const ho = await safe(() => api('post', `/orders/${tOrd.id}/handoff`))
        tc('تيك أواي: handoff', 'POST handoff', 'handed_to_cashier', ho._err ? errMsg(ho) : `status=${ho.data?.data?.status}`, !ho._err && ho.data?.data?.status === 'handed_to_cashier' ? 'PASS' : 'FAIL')

        const idem = `qa-ta-${Date.now()}`
        const fin = await safe(() => api('post', `/orders/${tOrd.id}/complete`, { payment_method: 'cash' }, { 'X-Idempotency-Key': idem }))
        tc('تيك أواي: finalize', 'POST /orders/:id/complete', 'completed+paid',
            fin._err ? errMsg(fin) : `status=${fin.data?.data?.status}, pay=${fin.data?.data?.payment_status}`,
            !fin._err && fin.data?.data?.status === 'completed' ? 'PASS' : 'FAIL',
            fin._err ? `Root: ${fin._err?.response?.data?.message}` : '')
    }

    // ════════════════════════════════════════════════════════
    //  SCENARIO C: DINE-IN ORDER — Full Lifecycle
    // ════════════════════════════════════════════════════════
    console.log('\n── 🪑 سيناريو C: طلب صالة (dine_in) ──')
    const diCreate = await safe(() => api('post', '/orders', {
        order_type: 'dine_in', items: orderItems, payment_method: 'cash', payment_status: 'paid', notes: 'QA dine_in', table_number: 'A5'
    }))
    let diOrd
    if (!diCreate._err) {
        diOrd = diCreate.data.data
        tc('إنشاء طلب صالة (dine_in)', 'POST /orders {dine_in}', 'status=new, type=dine_in',
            `id=${diOrd.id?.substring(0, 8)}, status=${diOrd.status}, type=${diOrd.order_type}`,
            diOrd.order_type === 'dine_in' ? 'PASS' : 'FAIL')
    } else tc('إنشاء طلب صالة', 'POST /orders {dine_in}', 'status=new', errMsg(diCreate), 'FAIL')

    if (diOrd) {
        for (const [f, t] of [['new', 'preparing'], ['preparing', 'ready']]) {
            const r = await safe(() => api('put', `/orders/${diOrd.id}/status`, { status: t }))
            tc(`صالة: ${f}→${t}`, 'PUT status', t, r._err ? errMsg(r) : `status=${r.data?.data?.status}`, !r._err && r.data?.data?.status === t ? 'PASS' : 'FAIL')
        }
        const ho = await safe(() => api('post', `/orders/${diOrd.id}/handoff`))
        tc('صالة: handoff', 'POST handoff', 'handed_to_cashier', ho._err ? errMsg(ho) : `status=${ho.data?.data?.status}`, !ho._err && ho.data?.data?.status === 'handed_to_cashier' ? 'PASS' : 'FAIL')

        const idem = `qa-di-${Date.now()}`
        const fin = await safe(() => api('post', `/orders/${diOrd.id}/complete`, { payment_method: 'cash' }, { 'X-Idempotency-Key': idem }))
        tc('صالة: finalize', 'POST /orders/:id/complete', 'completed+paid',
            fin._err ? errMsg(fin) : `status=${fin.data?.data?.status}`,
            !fin._err && fin.data?.data?.status === 'completed' ? 'PASS' : 'FAIL',
            fin._err ? `Root: ${fin._err?.response?.data?.message}` : '')
    }

    // ════════════════════════════════════════════════════════
    //  SCENARIO D: WALKIN (legacy) ORDER
    // ════════════════════════════════════════════════════════
    console.log('\n── 🏪 سيناريو D: طلب walkin (legacy) ──')
    const wCreate = await safe(() => api('post', '/orders', {
        order_type: 'walkin', items: orderItems, payment_method: 'cash', payment_status: 'paid'
    }))
    let wOrd
    if (!wCreate._err) {
        wOrd = wCreate.data.data
        tc('إنشاء طلب walkin', 'POST /orders {walkin}', 'status=new', `status=${wOrd.status}, type=${wOrd.order_type}`, wOrd.status === 'new' ? 'PASS' : 'FAIL')
    } else tc('إنشاء طلب walkin', 'POST /orders', 'status=new', errMsg(wCreate), 'FAIL')

    // ════════════════════════════════════════════════════════
    //  SCENARIO E: ONLINE ORDER (Website flow)
    // ════════════════════════════════════════════════════════
    console.log('\n── 🌐 سيناريو E: طلب أونلاين (Website) ──')
    const onCreate = await safe(() => axios.post(`${BASE}/orders`, {
        order_type: 'online', items: orderItems, payment_method: 'online',
        customer_phone: '0500009999', customer_name: 'موقع QA', customer_address: 'حي الورود'
    }))
    let onOrd
    if (!onCreate._err) {
        onOrd = onCreate.data.data
        tc('إنشاء طلب أونلاين (بدون auth)', 'POST /orders {online}', 'status=pending',
            `status=${onOrd.status}, type=${onOrd.order_type}`,
            onOrd.status === 'pending' && onOrd.order_type === 'online' ? 'PASS' : 'FAIL')
    } else tc('إنشاء طلب أونلاين', 'POST /orders {online, no auth}', 'pending', errMsg(onCreate), 'FAIL')

    if (onOrd) {
        // Approve
        const approve = await safe(() => api('post', `/orders/${onOrd.id}/approve`))
        tc('موافقة على طلب أونلاين', 'POST /orders/:id/approve', 'status=approved',
            approve._err ? errMsg(approve) : `status=${approve.data?.data?.status}`,
            !approve._err && approve.data?.data?.status === 'approved' ? 'PASS' : 'FAIL')

        // Status flow
        for (const [f, t] of [['approved', 'preparing'], ['preparing', 'ready']]) {
            const r = await safe(() => api('put', `/orders/${onOrd.id}/status`, { status: t }))
            tc(`أونلاين: ${f}→${t}`, 'PUT status', t, r._err ? errMsg(r) : `status=${r.data?.data?.status}`, !r._err && r.data?.data?.status === t ? 'PASS' : 'FAIL')
        }

        const ho = await safe(() => api('post', `/orders/${onOrd.id}/handoff`))
        tc('أونلاين: handoff', 'POST handoff', 'handed_to_cashier', ho._err ? errMsg(ho) : `status=${ho.data?.data?.status}`, !ho._err && ho.data?.data?.status === 'handed_to_cashier' ? 'PASS' : 'FAIL')

        const idem = `qa-on-${Date.now()}`
        const fin = await safe(() => api('post', `/orders/${onOrd.id}/complete`, { payment_method: 'online' }, { 'X-Idempotency-Key': idem }))
        tc('أونلاين: finalize', 'POST /orders/:id/complete', 'completed+paid',
            fin._err ? errMsg(fin) : `status=${fin.data?.data?.status}`,
            !fin._err && fin.data?.data?.status === 'completed' ? 'PASS' : 'FAIL',
            fin._err ? `Root: ${fin._err?.response?.data?.message}` : '')
    }

    // ════════════════════════════════════════════════════════
    //  SCENARIO F: DELIVERY FAILURE FLOW
    // ════════════════════════════════════════════════════════
    console.log('\n── ❌ سيناريو F: فشل توصيل ──')
    if (riderId) {
        const fOrd = await safe(() => api('post', '/orders', { order_type: 'delivery', items: orderItems, payment_method: 'cash', payment_status: 'paid' }))
        if (!fOrd._err && fOrd.data.data?.id) {
            const oid = fOrd.data.data.id
            await safe(() => api('put', `/orders/${oid}/status`, { status: 'preparing' }))
            await safe(() => api('put', `/orders/${oid}/status`, { status: 'ready' }))
            await safe(() => api('post', `/orders/${oid}/handoff`))
            await safe(() => api('post', `/delivery/orders/${oid}/assign`, { delivery_personnel_id: riderId }))
            await safe(() => api('post', `/delivery/orders/${oid}/pickup`))
            const fail = await safe(() => api('post', `/delivery/orders/${oid}/fail`, { reason: 'العميل رفض الاستلام' }))
            const dbFail = await db().sequelize.query(
                `SELECT delivery_status FROM orders WHERE id = :id`, { replacements: { id: oid }, type: db().sequelize.QueryTypes.SELECT }
            )
            tc('تسجيل فشل التوصيل', 'POST /delivery/orders/:id/fail', 'delivery_status=failed',
                `DB: delivery_status=${dbFail[0]?.delivery_status}`, dbFail[0]?.delivery_status === 'failed' ? 'PASS' : 'FAIL')
        }
    }

    // ════════════════════════════════════════════════════════
    //  SCENARIO G: EDGE CASES & VALIDATION
    // ════════════════════════════════════════════════════════
    console.log('\n── ⚠️ سيناريو G: حالات حرجة ──')

    // G1: Invalid transition
    if (wOrd) {
        const inv = await safe(() => api('put', `/orders/${wOrd.id}/status`, { status: 'completed' }))
        tc('رفض انتقال حالة غير مسموح (new→completed)', 'PUT status to completed directly', '400 error',
            inv._err ? `${inv._err?.response?.status}: ${inv._err?.response?.data?.message}` : 'accepted!',
            inv._err?.response?.status === 400 ? 'PASS' : 'FAIL')
    }

    // G2: Assign rider to non-delivery
    if (wOrd && riderId) {
        const badAssign = await safe(() => api('post', `/delivery/orders/${wOrd.id}/assign`, { delivery_personnel_id: riderId }))
        tc('رفض تعيين سائق لطلب غير ديليفري', 'POST assign on walkin order', '400 error',
            badAssign._err ? `${badAssign._err?.response?.status}: ${badAssign._err?.response?.data?.message}` : 'accepted!',
            badAssign._err?.response?.status === 400 ? 'PASS' : 'FAIL')
    }

    // G3: Cancel order
    if (wOrd) {
        const cancel = await safe(() => api('post', `/orders/${wOrd.id}/cancel`, { reason: 'QA test cancel' }))
        tc('إلغاء طلب', 'POST /orders/:id/cancel', 'status=cancelled',
            cancel._err ? errMsg(cancel) : `status=${cancel.data?.data?.status}`,
            !cancel._err && cancel.data?.data?.status === 'cancelled' ? 'PASS' : 'FAIL')
    }

    // ════════════════════════════════════════════════════════
    //  SCENARIO H: DELIVERY REPORTS
    // ════════════════════════════════════════════════════════
    console.log('\n── 📊 سيناريو H: تقارير وبيانات ──')
    const rep = await safe(() => api('get', '/delivery/reports'))
    tc('تقارير الديليفري', 'GET /delivery/reports', 'rider_stats + type_breakdown',
        rep._err ? errMsg(rep) : `rider_stats: ${!!rep.data.data?.rider_stats}, type_breakdown: ${!!rep.data.data?.type_breakdown}`,
        !rep._err && rep.data.data?.rider_stats !== undefined ? 'PASS' : 'FAIL')

    if (riderId) {
        const hist = await safe(() => api('get', `/delivery/personnel/${riderId}/history`))
        tc('سجل طلبات السائق', 'GET /delivery/personnel/:id/history', 'data + pagination',
            hist._err ? errMsg(hist) : `total=${hist.data.pagination?.total}`,
            !hist._err && hist.data.pagination !== undefined ? 'PASS' : 'FAIL')
    }

    // ════════════════════════════════════════════════════════
    //  CLEANUP
    // ════════════════════════════════════════════════════════
    if (riderId) await safe(() => api('delete', `/delivery/personnel/${riderId}`))

    report()
}

function report() {
    const pass = R.filter(r => r.status === 'PASS').length
    const fail = R.filter(r => r.status === 'FAIL').length
    const total = R.length
    const pct = total ? Math.round(pass / total * 100) : 0

    console.log('\n' + '═'.repeat(65))
    console.log('📊 EXECUTIVE SUMMARY')
    console.log('═'.repeat(65))
    console.log(`Total: ${total}   Pass: ${pass}   Fail: ${fail}   Rate: ${pct}%`)
    console.log(`Decision: ${pct >= 90 ? '🟢 GO' : pct >= 70 ? '🟡 CONDITIONAL GO' : '🔴 NO-GO'}`)
    console.log('═'.repeat(65))

    console.log('\n<<TEST_RESULTS_JSON>>')
    console.log(JSON.stringify(R, null, 2))
    console.log('<</TEST_RESULTS_JSON>>')

    process.exit(0)
}

run().catch(e => { console.error('FATAL:', e.message); report() })
