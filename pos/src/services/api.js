import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
})

const generateIdempotencyKey = (prefix = 'op') => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// Queue to hold requests while refreshing token
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error)
        } else {
            prom.resolve(token)
        }
    })
    failedQueue = []
}

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Handle errors and Token Refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config

        // If 401 error and not a refresh-token request itself
        if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/refresh-token') && !originalRequest.url.includes('/auth/login')) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject })
                })
                    .then(token => {
                        originalRequest.headers.Authorization = `Bearer ${token}`
                        return api(originalRequest)
                    })
                    .catch(err => {
                        return Promise.reject(err)
                    })
            }

            originalRequest._retry = true
            isRefreshing = true

            const refreshToken = localStorage.getItem('refreshToken')

            if (refreshToken) {
                try {
                    // Call backend to refresh token
                    // We use axios directly to avoid circular interceptor calls if this fails with 401
                    const response = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken })

                    const newToken = response.data.accessToken || response.data.token

                    localStorage.setItem('token', newToken)

                    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
                    originalRequest.headers.Authorization = `Bearer ${newToken}`

                    processQueue(null, newToken)
                    isRefreshing = false

                    return api(originalRequest)
                } catch (refreshError) {
                    processQueue(refreshError, null)
                    isRefreshing = false

                    // If refresh fails, logout
                    localStorage.removeItem('token')
                    localStorage.removeItem('refreshToken')
                    localStorage.removeItem('user')
                    window.location.href = '/login'
                    return Promise.reject(refreshError)
                }
            } else {
                // No refresh token, direct logout
                localStorage.removeItem('token')
                localStorage.removeItem('user')
                window.location.href = '/login'
            }
        }

        // Standard 401 logout if it wasn't handled by refresh logic (e.g. login failed)
        if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/refresh-token')) {
            // Avoid double redirect if we just failed refresh
            if (window.location.pathname !== '/login') {
                localStorage.removeItem('token')
                localStorage.removeItem('user')
                window.location.href = '/login'
            }
        }

        return Promise.reject(error)
    }
)

// Auth API
export const authAPI = {
    login: async (username, password) => {
        const response = await api.post('/auth/login', { username, password })
        if (response.data.refreshToken) {
            localStorage.setItem('refreshToken', response.data.refreshToken)
        }
        return response
    },
    me: () => api.get('/auth/me'),
    updateProfile: (data) => api.put('/auth/update-profile', data),
    changePassword: (currentPassword, newPassword) =>
        api.put('/auth/change-password', { currentPassword, newPassword }),
}

// Menu API
export const menuAPI = {
    getAll: (params) => api.get('/menu', { params }),
    getById: (id) => api.get(`/menu/${id}`),
    getNextBarcode: () => api.get('/menu/barcode/next'),
    generateBarcodes: (data) => api.post('/menu/barcode/bulk-generate', data),
    create: (data) => api.post('/menu', data),
    update: (id, data) => api.put(`/menu/${id}`, data),
    delete: (id) => api.delete(`/menu/${id}`),
}

// Category API
export const categoryAPI = {
    getAll: (params) => api.get('/categories', { params }),
    create: (data) => api.post('/categories', data),
    update: (id, data) => api.put(`/categories/${id}`, data),
    delete: (id) => api.delete(`/categories/${id}`),
}

// Shift API
export const shiftAPI = {
    validate: () => api.get('/shifts/validate'),
    getCurrent: () => api.get('/shifts/current'),
    getOpenShifts: () => api.get('/shifts/open'),
    start: (data) => api.post('/shifts/start', data),
    end: (id, data) => api.post(`/shifts/${id}/end`, data),
    endCurrent: (data) => api.post('/shifts/end', data),
    getHistory: (params) => api.get('/shifts/history', { params }),
    getReport: (id) => api.get(`/shifts/${id}/report`),
    review: (id, data) => api.post(`/shifts/${id}/review`, data),
    getPerformance: (params) => api.get('/shifts/performance', { params }),
    exportCSV: (id) => api.get(`/shifts/${id}/export?format=csv`, { responseType: 'blob' }),
}

export const orderAPI = {
    getAll: (params) => api.get('/orders', { params }),
    getById: (id) => api.get(`/orders/${id}`),
    getStockBatches: (menuId, params = {}) => api.get(`/orders/stock-batches/${menuId}`, { params }),
    create: (data) => {
        const selectedWarehouseId = localStorage.getItem('pos_selected_warehouse_id')
        const payload = { ...(data || {}) }
        if (!payload.warehouse_id && selectedWarehouseId) {
            payload.warehouse_id = selectedWarehouseId
        }
        return api.post('/orders', payload)
    },
    updateStatus: (id, status, data = {}) => api.put(`/orders/${id}/status`, { status, ...data }),
    cancel: (id, reason) => api.post(`/orders/${id}/cancel`, { reason }),
    getActiveForKDS: () => api.get('/orders/kds/active'),
    // Kitchen-Cashier Handoff Workflow
    getCashierQueue: () => api.get('/orders/cashier/ready'),
    getPendingOnline: () => api.get('/orders/admin/pending'),
    approve: (id) => api.post(`/orders/${id}/approve`),
    handoff: (id) => api.post(`/orders/${id}/handoff`),
    complete: (id, data = {}, idempotencyKey = null) => {
        const selectedWarehouseId = localStorage.getItem('pos_selected_warehouse_id')
        const payload = { ...(data || {}) }
        if (!payload.warehouse_id && selectedWarehouseId) {
            payload.warehouse_id = selectedWarehouseId
        }
        return api.post(`/orders/${id}/complete`, payload, {
            headers: {
                'X-Idempotency-Key': idempotencyKey || generateIdempotencyKey(`order-complete-${id}`)
            }
        })
    }
}

// Customer API
export const customerAPI = {
    getAll: (params) => api.get('/customers', { params }),
    getById: (id) => api.get(`/customers/${id}`),
    getOrders: (id, params) => api.get(`/customers/${id}/orders`, { params }),
    getByPhone: (phone) => api.get(`/customers/phone/${encodeURIComponent(phone)}`),
    create: (data) => api.post('/customers', data),
}

// Payment API
export const paymentAPI = {
    initiate: (orderId, amount) => api.post('/payments/initiate', { order_id: orderId, amount }),
    getStatus: (orderId) => api.get(`/payments/status/${orderId}`),
    confirm: (orderId, paymentMethod, paymentBreakdown = null, idempotencyKey = null) =>
        api.post(`/payments/${orderId}/confirm`, {
            payment_method: paymentMethod,
            ...(Array.isArray(paymentBreakdown) ? { payment_breakdown: paymentBreakdown } : {})
        }, {
            headers: {
                'X-Idempotency-Key': idempotencyKey || generateIdempotencyKey(`payment-confirm-${orderId}`)
            }
        }),
}

// Coupon API
export const couponAPI = {
    getAll: (params) => api.get('/coupons', { params }),
    validate: (data) => api.post('/coupons/validate', data),
    create: (data) => api.post('/coupons', data),
    update: (id, data) => api.put(`/coupons/${id}`, data),
}

// Pricing API (price lists, promotions, real-time cart preview)
export const pricingAPI = {
    preview: (data) => api.post('/pricing/preview', data),
    getPriceLists: (params) => api.get('/pricing/price-lists', { params }),
    createPriceList: (data) => api.post('/pricing/price-lists', data),
    updatePriceList: (id, data) => api.put(`/pricing/price-lists/${id}`, data),
    getPromotions: (params) => api.get('/pricing/promotions', { params }),
    createPromotion: (data) => api.post('/pricing/promotions', data),
    updatePromotion: (id, data) => api.put(`/pricing/promotions/${id}`, data),
}

// Loyalty API
export const loyaltyAPI = {
    getByPhone: (phone) => api.get(`/loyalty/by-phone/${encodeURIComponent(phone)}`),
    getByCustomer: (customerId) => api.get(`/loyalty/customer/${customerId}`),
    adjust: (data) => api.post('/loyalty/adjust', data),
}

// User API
export const userAPI = {
    getAll: (params) => api.get('/users', { params }),
    getById: (id) => api.get(`/users/${id}`),
    getHistory: (id, params) => api.get(`/users/${id}/history`, { params }),
    create: (data) => api.post('/users', data),
    update: (id, data) => api.put(`/users/${id}`, data),
    delete: (id) => api.delete(`/users/${id}`),
    toggleStatus: (id) => api.patch(`/users/${id}/status`),
    getRoles: () => api.get('/users/meta/roles'),
}

// Branch API
export const branchAPI = {
    getAll: (params) => api.get('/branches', { params }),
    getById: (id) => api.get(`/branches/${id}`),
    create: (data) => api.post('/branches', data),
    update: (id, data) => api.put(`/branches/${id}`, data),
    setStatus: (id, is_active) => api.patch(`/branches/${id}/status`, { is_active }),
}

// Upload API
export const uploadAPI = {
    uploadImage: (formData) => api.post('/upload/image', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    }),
}

// Settings API
export const settingsAPI = {
    getAll: () => api.get('/settings'),
    getPublic: () => api.get('/settings/public'),
    update: (data) => api.put('/settings', data),
    updateStore: (data) => api.patch('/settings/store', data),
    updateReceipt: (data) => api.patch('/settings/receipt', data),
    reset: () => api.post('/settings/reset'),
}

// Payment Gateways API
export const paymentGatewaysAPI = {
    getAll: () => api.get('/payment-gateways'),
    getActive: () => api.get('/payment-gateways/active'),
    update: (id, data) => api.put(`/payment-gateways/${id}`, data),
    init: () => api.post('/payment-gateways/init'),
}

// Reports API
export const reportsAPI = {
    getDaily: (date) => api.get('/reports/daily', { params: { date } }),
    getRange: (start_date, end_date) => api.get('/reports/range', { params: { start_date, end_date } }),
    getBestSellers: (params) => api.get('/reports/best-sellers', { params }),
    getStaffPerformance: (params) => api.get('/reports/staff-performance', { params }),
    getDailyReconciliation: (date, branch_id = null) => api.get('/reports/reconciliation/daily', { params: { date, branch_id } }),
}

// Notifications API
export const notificationsAPI = {
    getAll: (params) => api.get('/notifications', { params }),
    markRead: (id) => api.put(`/notifications/${id}/read`),
    markAllRead: () => api.put('/notifications/read-all'),
    cleanup: () => api.delete('/notifications/cleanup'),
}

// Audit / Activity Feed API
export const auditAPI = {
    getFeed: (params) => api.get('/audit/feed', { params }),
    getAll: (params) => api.get('/audit', { params }),
    getEntityTrail: (type, id, params) => api.get(`/audit/entity/${type}/${id}`, { params }),
}

// ==================== INVENTORY MODULE ====================

// Inventory API (Stock Management)
export const inventoryAPI = {
    // Stock queries
    getStock: (params) => api.get('/inventory/stock', { params }),
    getProductStock: (menuId) => api.get(`/inventory/stock/${menuId}`),
    getAlerts: (params) => api.get('/inventory/alerts', { params }),
    getLowStock: (params) => api.get('/inventory/alerts', { params }),
    getValuation: (params) => api.get('/inventory/valuation', { params }),
    getBranchSummary: (params) => api.get('/inventory/branch-summary', { params }),
    getMovements: (params) => api.get('/inventory/movements', { params }),

    // Stock operations
    adjust: (data) => api.post('/inventory/adjust', data),
    assemble: (data) => api.post('/inventory/assemble', data),
    updateSettings: (menuId, data) => api.put(`/inventory/stock/${menuId}/settings`, data),

    // Adjustments
    getAdjustments: (params) => api.get('/inventory/adjustments', { params }),

    // Products (for purchase receipts - includes raw materials)
    getProducts: (params) => api.get('/inventory/products', { params }),
    createQuickProduct: (data) => api.post('/inventory/quick-product', data),
}

// Warehouse API
export const warehouseAPI = {
    getAll: (params) => api.get('/warehouses', { params }),
    getById: (id) => api.get(`/warehouses/${id}`),
    create: (data) => api.post('/warehouses', data),
    update: (id, data) => api.put(`/warehouses/${id}`, data),
    delete: (id) => api.delete(`/warehouses/${id}`),
}

// Purchase API
export const purchaseAPI = {
    getAll: (params) => api.get('/purchases', { params }),
    getById: (id) => api.get(`/purchases/${id}`),
    create: (data) => api.post('/purchases', data),
    receive: (id, items) => api.post(`/purchases/${id}/receive`, items ? { items } : {}),
    cancel: (id) => api.delete(`/purchases/${id}`),
}

// Stock Transfer API
export const transferAPI = {
    getAll: (params) => api.get('/transfers', { params }),
    getSummary: (params) => api.get('/transfers/reports/summary', { params }),
    getById: (id) => api.get(`/transfers/${id}`),
    create: (data) => api.post('/transfers', data),
    complete: (id) => api.post(`/transfers/${id}/complete`),
    cancel: (id) => api.post(`/transfers/${id}/cancel`),
}

// Stock Issue API (إذن صرف بضاعة)
export const stockIssueAPI = {
    getAll: (params) => api.get('/stock-issues', { params }),
    getById: (id) => api.get(`/stock-issues/${id}`),
    create: (data) => api.post('/stock-issues', data),
    update: (id, data) => api.put(`/stock-issues/${id}`, data),
    approve: (id) => api.post(`/stock-issues/${id}/approve`),
    issue: (id) => api.post(`/stock-issues/${id}/issue`),
    cancel: (id, reason) => api.post(`/stock-issues/${id}/cancel`, { reason }),
}

// Refund API
export const refundAPI = {
    // Get all refunds (admin)
    getAll: (params) => api.get('/refunds', { params }),
    // Get refunds for specific order
    getByOrder: (orderId) => api.get(`/refunds/${orderId}`),
    // Full refund
    createFull: (data) => api.post('/refunds', data),
    // Partial refund
    createPartial: (data) => api.post('/refunds/partial', data),
    // Void order (before kitchen starts)
    voidOrder: (data) => api.post('/refunds/void', data),
    // Daily summary
    getDailySummary: (params) => api.get('/refunds/summary/daily', { params }),
}

// Suppliers API
export const supplierAPI = {
    getAll: (params) => api.get('/suppliers', { params }),
    getById: (id) => api.get(`/suppliers/${id}`),
    create: (data) => api.post('/suppliers', data),
    update: (id, data) => api.put(`/suppliers/${id}`, data),
    delete: (id) => api.delete(`/suppliers/${id}`),
    getStats: (id) => api.get(`/suppliers/${id}/stats`),
    recordPayment: (id, data) => api.post(`/suppliers/${id}/payments`, data),
    getGLBalance: (id) => api.get(`/suppliers/${id}/gl-balance`),
    syncBalance: (id) => api.post(`/suppliers/${id}/sync-balance`),
    getStatement: (id, params) => api.get(`/suppliers/${id}/statement`, { params }),
    getPayablesAging: (params) => api.get('/suppliers/payables/aging', { params }),
    getPayablesSummary: (params) => api.get('/suppliers/payables/summary', { params }),
    reconcileBalances: () => api.get('/suppliers/reconcile'),
    reconcileAndFixBalances: () => api.post('/suppliers/reconcile'),
}

// Purchase Orders API
export const purchaseOrderAPI = {
    getAll: (params) => api.get('/purchase-orders', { params }),
    getById: (id) => api.get(`/purchase-orders/${id}`),
    create: (data) => api.post('/purchase-orders', data),
    update: (id, data) => api.put(`/purchase-orders/${id}`, data),
    confirm: (id) => api.post(`/purchase-orders/${id}/confirm`),
    receive: (id, items) => api.post(`/purchase-orders/${id}/receive`, { items }),
    cancel: (id) => api.post(`/purchase-orders/${id}/cancel`),
    delete: (id) => api.delete(`/purchase-orders/${id}`),
}

// Purchase Returns API
export const purchaseReturnAPI = {
    getAll: (params) => api.get('/purchase-returns', { params }),
    getById: (id) => api.get(`/purchase-returns/${id}`),
    create: (data) => api.post('/purchase-returns', data),
    confirm: (id) => api.post(`/purchase-returns/${id}/confirm`),
}

// Generic Entity Attachments API
export const entityAttachmentAPI = {
    list: (entityType, entityId) => api.get(`/entity-attachments/${entityType}/${entityId}`),
    upload: (entityType, entityId, files = []) => {
        const formData = new FormData()
        files.forEach((file) => formData.append('files', file))
        return api.post(`/entity-attachments/${entityType}/${entityId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
    },
    remove: (entityType, entityId, attachmentId) =>
        api.delete(`/entity-attachments/${entityType}/${entityId}/${attachmentId}`),
    download: (entityType, entityId, attachmentId) =>
        api.get(`/entity-attachments/${entityType}/${entityId}/${attachmentId}/download`, { responseType: 'blob' }),
}

// Accounting API
export const accountingAPI = {
    getChartOfAccounts: () => api.get('/accounting/coa'),
    getCOATree: (params) => api.get('/accounting/coa/tree', { params }),
    getCOAFlat: (params) => api.get('/accounting/coa/flat', { params }),
    createCOAAccount: (data) => api.post('/accounting/coa/accounts', data),
    updateCOAAccount: (id, data) => api.put(`/accounting/coa/accounts/${id}`, data),
    moveCOAAccount: (id, parent_id = null) => api.patch(`/accounting/coa/accounts/${id}/move`, { parent_id }),
    setCOAAccountStatus: (id, is_active) => api.patch(`/accounting/coa/accounts/${id}/status`, { is_active }),
    getLedger: (code, params) => api.get(`/accounting/ledger/${code}`, { params }),
    getJournalEntries: (params) => api.get('/accounting/journal-entries', { params }),
    getJournalEntry: (id) => api.get(`/accounting/journal-entries/${id}`),
    createJournalEntry: (data) => api.post('/accounting/journal-entries', data),
    reverseJournalEntry: (id, data) => api.post(`/accounting/journal-entries/${id}/reverse`, data),
    getJournalEntryAttachments: (id) => api.get(`/accounting/journal-entries/${id}/attachments`),
    uploadJournalEntryAttachments: (id, files = []) => {
        const formData = new FormData()
        files.forEach((file) => formData.append('files', file))
        return api.post(`/accounting/journal-entries/${id}/attachments`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
    },
    deleteJournalEntryAttachment: (id, attachmentId) => api.delete(`/accounting/journal-entries/${id}/attachments/${attachmentId}`),
    downloadJournalEntryAttachment: (id, attachmentId) =>
        api.get(`/accounting/journal-entries/${id}/attachments/${attachmentId}/download`, { responseType: 'blob' }),
    getTrialBalance: (params) => api.get('/accounting/reports/trial-balance', { params }),
    getProfitLoss: (params) => api.get('/accounting/reports/profit-loss', { params }),
    getBalanceSheet: (params) => api.get('/accounting/reports/balance-sheet', { params }),
    getCashFlow: (params) => api.get('/accounting/reports/cash-flow', { params }),
    getFiscalPeriods: () => api.get('/accounting/periods'),
    closePeriod: (period, data) => api.post(`/accounting/periods/${period}/close`, data),
    reopenPeriod: (period) => api.post(`/accounting/periods/${period}/reopen`),
    // Audit Log
    getAuditLog: (params) => api.get('/accounting/audit-logs', { params }),
    // General Ledger
    getGeneralLedger: (accountCode, params) => api.get(`/accounting/ledger/${accountCode}`, { params }),
    // Account Defaults (Phase 3 — Dynamic Account Resolution)
    getAccountDefaults: (params) => api.get('/accounting/defaults', { params }),
    getAccountDefaultKeys: () => api.get('/accounting/defaults/keys'),
    setAccountDefault: (data) => api.put('/accounting/defaults', data),
    deleteAccountDefault: (id) => api.delete(`/accounting/defaults/${id}`),
    reseedDefaults: () => api.post('/accounting/defaults/reseed'),
    clearDefaultsCache: () => api.post('/accounting/defaults/clear-cache'),
    // Dashboard Stats
    getDashboardStats: () => api.get('/accounting/dashboard/stats'),
}

// Expense API
export const expenseAPI = {
    getAll: (params) => api.get('/expenses', { params }),
    getCategories: () => api.get('/expenses/categories'),
    getPaymentAccounts: (paymentMethod) => api.get('/expenses/payment-accounts', { params: { payment_method: paymentMethod } }),
    getSummary: (params) => api.get('/expenses/summary', { params }),
    create: (data) => api.post('/expenses', data),
    delete: (id) => api.delete(`/expenses/${id}`),
}

// HR API
export const hrAPI = {
    // Dashboard
    getDashboard: (params) => api.get('/hr/dashboard', { params }),

    // Departments
    getDepartments: (params) => api.get('/hr/departments', { params }),
    createDepartment: (data) => api.post('/hr/departments', data),
    updateDepartment: (id, data) => api.put(`/hr/departments/${id}`, data),
    getDepartmentTeam: (id) => api.get(`/hr/departments/${id}/team`),

    // Designations
    getDesignations: (params) => api.get('/hr/designations', { params }),
    createDesignation: (data) => api.post('/hr/designations', data),

    // Employees
    getEmployees: (params) => api.get('/hr/employees', { params }),
    getEmployeeById: (id) => api.get(`/hr/employees/${id}`),
    createEmployee: (data) => api.post('/hr/employees', data),
    updateEmployee: (id, data) => api.put(`/hr/employees/${id}`, data),
    deactivateEmployee: (id) => api.delete(`/hr/employees/${id}`),

    // Attendance
    markAttendance: (data) => api.post('/hr/attendance', data),
    bulkAttendance: (rows) => api.post('/hr/attendance/bulk', { rows }),
    getAttendance: (params) => api.get('/hr/attendance', { params }),
    getEmployeeAttendance: (employeeId, params) => api.get(`/hr/attendance/${employeeId}`, { params }),
    updateAttendance: (id, data) => api.put(`/hr/attendance/${id}`, data),
    getAttendanceSummary: (params) => api.get('/hr/attendance/reports/summary', { params }),

    // Leaves
    createLeaveRequest: (data) => api.post('/hr/leaves', data),
    getLeaves: (params) => api.get('/hr/leaves', { params }),
    getEmployeeLeaves: (employeeId, params) => api.get(`/hr/leaves/${employeeId}`, { params }),
    updateLeaveRequest: (id, data) => api.put(`/hr/leaves/${id}`, data),
    getLeaveBalance: (employeeId, params) => api.get(`/hr/leaves/balance/${employeeId}`, { params }),
    updateLeaveBalance: (id, data) => api.put(`/hr/leaves/balance/${id}`, data),
    getLeaveSummary: (params) => api.get('/hr/leaves/reports/summary', { params }),

    // Payroll
    processPayroll: (data) => api.post('/hr/payroll/process', data),
    getSalaries: (params) => api.get('/hr/payroll/salaries', { params }),
    getSalaryById: (id) => api.get(`/hr/payroll/salaries/${id}`),
    updateSalary: (id, data) => api.put(`/hr/payroll/salaries/${id}`, data),
    approvePayroll: (salaryIds) => api.post('/hr/payroll/approve', { salary_ids: salaryIds }),
    disbursePayroll: (payload) => api.post('/hr/payroll/disburse', Array.isArray(payload) ? { salary_ids: payload } : payload),
    getPayrollSummary: (params) => api.get('/hr/payroll/reports/summary', { params }),

    // Performance
    getPerformanceReviews: (params) => api.get('/hr/performance', { params }),
    createPerformanceReview: (data) => api.post('/hr/performance', data),
    updatePerformanceReview: (id, data) => api.put(`/hr/performance/${id}`, data),
    getPerformanceSummary: (params) => api.get('/hr/performance/reports/summary', { params }),

    // Training
    getTrainingPrograms: (params) => api.get('/hr/training/programs', { params }),
    createTrainingProgram: (data) => api.post('/hr/training', data),
    updateTrainingProgram: (id, data) => api.put(`/hr/training/${id}`, data),
    getTrainingSummary: (params) => api.get('/hr/training/reports/summary', { params }),
}

// System API (Backup, Reset)
export const systemAPI = {
    exportData: () => api.post('/system/export', {}, { responseType: 'blob' }),
    resetData: (payload = {}) => api.post('/system/reset', payload),
    internalBackup: () => api.post('/system/backup'),
    restoreData: (formData) => api.post('/system/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    restartServer: () => api.post('/system/restart', { confirm: true }),
}

export default api

// Delivery API
export const deliveryAPI = {
    // Personnel
    getPersonnel: (params) => api.get('/delivery/personnel', { params }),
    createPersonnel: (data) => api.post('/delivery/personnel', data),
    updatePersonnel: (id, data) => api.put(`/delivery/personnel/${id}`, data),
    updatePersonnelStatus: (id, status) => api.patch(`/delivery/personnel/${id}/status`, { status }),
    deletePersonnel: (id) => api.delete(`/delivery/personnel/${id}`),
    getPersonnelHistory: (id, params) => api.get(`/delivery/personnel/${id}/history`, { params }),

    // Orders
    getOrders: (params) => api.get('/delivery/orders', { params }),
    assignRider: (orderId, delivery_personnel_id) => api.post(`/delivery/orders/${orderId}/assign`, { delivery_personnel_id }),
    markPickup: (orderId) => api.post(`/delivery/orders/${orderId}/pickup`),
    markComplete: (orderId) => api.post(`/delivery/orders/${orderId}/complete`),
    markFailed: (orderId, reason) => api.post(`/delivery/orders/${orderId}/fail`, { reason }),

    // Reports
    getReports: (params) => api.get('/delivery/reports', { params }),
}

