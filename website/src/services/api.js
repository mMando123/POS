import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
    },
})

// Menu API
export const menuAPI = {
    getAll: () => api.get('/menu', { params: { available_only: true, hide_out_of_stock: true } }),
}

// Category API
export const categoryAPI = {
    getAll: () => api.get('/categories', { params: { active_only: true } }),
}

// Order API
export const orderAPI = {
    create: (data) => api.post('/orders', data),
    getById: (id) => api.get(`/orders/${id}`),
    track: (reference) => api.get(`/orders/track/${encodeURIComponent(reference)}`),
}

// Customer API
export const customerAPI = {
    create: (data) => api.post('/customers', data),
}

// Payment API
export const paymentAPI = {
    initiate: (orderId, amount) => api.post('/payments/initiate', { order_id: orderId, amount }),
    verify: (queryParams) => api.post('/payments/verify', { query: queryParams }),
}

// Settings API
export const settingsAPI = {
    getPublic: () => api.get('/settings/public'),
}

export default api
