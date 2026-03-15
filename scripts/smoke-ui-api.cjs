#!/usr/bin/env node
/**
 * UI-oriented API smoke test.
 * Validates core endpoints used by dashboard/POS/delivery/purchases/HR pages.
 */

const axios = require('axios')

const API_BASE = process.env.SMOKE_API_BASE || 'http://localhost:3001/api'
const USERNAME = process.env.SMOKE_USERNAME || 'admin'
const PASSWORD = process.env.SMOKE_PASSWORD || 'admin123'

const baseChecks = [
    ['GET', '/health'],
    ['GET', '/settings/public'],
    ['GET', '/notifications?limit=5'],
    ['GET', '/shifts/current'],
    ['GET', '/orders?limit=5'],
    ['GET', '/reports/daily'],
    ['GET', '/inventory/alerts'],
    ['GET', '/inventory/stock?limit=5'],
    ['GET', '/warehouses?status=active'],
    ['GET', '/purchase-orders?limit=5'],
    ['GET', '/purchases?limit=5'],
    ['GET', '/purchase-returns?limit=5'],
    ['GET', '/delivery/personnel?active=true'],
    ['GET', '/delivery/orders?limit=20'],
    ['GET', '/hr/dashboard'],
    ['GET', '/hr/departments?limit=5'],
    ['GET', '/hr/designations'],
    ['GET', '/hr/employees?limit=5'],
    ['GET', '/hr/attendance?limit=5'],
    ['GET', '/hr/leaves?limit=5'],
    ['GET', '/hr/performance?limit=5'],
    ['GET', '/hr/training/programs?limit=5'],
    ['GET', '/hr/payroll/salaries?limit=5'],
    ['GET', '/hr/payroll/reports/summary']
]

const request = async (client, method, url) => {
    const started = Date.now()
    try {
        const response = await client.request({ method, url })
        return {
            ok: true,
            method,
            url,
            status: response.status,
            ms: Date.now() - started
        }
    } catch (error) {
        return {
            ok: false,
            method,
            url,
            status: error?.response?.status || 0,
            ms: Date.now() - started,
            message: error?.response?.data?.message || error.message
        }
    }
}

async function main() {
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: USERNAME,
        password: PASSWORD
    })

    const token = loginResponse?.data?.accessToken || loginResponse?.data?.token
    if (!token) {
        throw new Error('Smoke login failed: missing access token')
    }

    const client = axios.create({
        baseURL: API_BASE,
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
    })

    const results = []
    let firstEmployeeId = null

    for (const [method, url] of baseChecks) {
        const row = await request(client, method, url)
        results.push(row)

        if (url.startsWith('/hr/employees') && row.ok) {
            const response = await client.get('/hr/employees?limit=1')
            const firstRow = Array.isArray(response?.data?.data) ? response.data.data[0] : null
            if (firstRow?.id) firstEmployeeId = firstRow.id
        }
    }

    if (firstEmployeeId) {
        const dynamicChecks = [
            ['GET', `/hr/employees/${firstEmployeeId}`],
            ['GET', `/hr/attendance/${firstEmployeeId}?limit=5`],
            ['GET', `/hr/leaves/${firstEmployeeId}?limit=5`],
            ['GET', `/hr/leaves/balance/${firstEmployeeId}`]
        ]
        for (const [method, url] of dynamicChecks) {
            results.push(await request(client, method, url))
        }
    }

    const passed = results.filter((item) => item.ok).length
    const failed = results.filter((item) => !item.ok).length

    console.log(JSON.stringify({
        baseUrl: API_BASE,
        passed,
        failed,
        total: results.length,
        results
    }, null, 2))

    process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
    console.error('smoke-ui-api failed:')
    console.error(error?.response?.data || error.message || error)
    process.exit(1)
})

