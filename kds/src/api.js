import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
})

let isRefreshing = false
let failedQueue = []

const notifyAuthRequired = (message = 'يرجى تسجيل الدخول إلى شاشة المطبخ') => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('kds:auth-required', {
        detail: { message }
    }))
}

const processQueue = (error, token = null) => {
    failedQueue.forEach((entry) => {
        if (error) {
            entry.reject(error)
        } else {
            entry.resolve(token)
        }
    })
    failedQueue = []
}

const clearStoredSession = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
}

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config || {}
        const requestUrl = String(originalRequest.url || '')

        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !requestUrl.includes('/auth/refresh-token') &&
            !requestUrl.includes('/auth/login')
        ) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject })
                }).then((token) => {
                    originalRequest.headers = originalRequest.headers || {}
                    originalRequest.headers.Authorization = `Bearer ${token}`
                    return api(originalRequest)
                })
            }

            originalRequest._retry = true
            isRefreshing = true

            const refreshToken = localStorage.getItem('refreshToken')
            if (!refreshToken) {
                clearStoredSession()
                notifyAuthRequired(error.response?.data?.message || 'يرجى تسجيل الدخول إلى شاشة المطبخ')
                isRefreshing = false
                return Promise.reject(error)
            }

            try {
                const refreshResponse = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken })
                const newToken = refreshResponse.data.accessToken || refreshResponse.data.token

                localStorage.setItem('token', newToken)
                api.defaults.headers.common.Authorization = `Bearer ${newToken}`
                originalRequest.headers = originalRequest.headers || {}
                originalRequest.headers.Authorization = `Bearer ${newToken}`

                processQueue(null, newToken)
                isRefreshing = false
                return api(originalRequest)
            } catch (refreshError) {
                processQueue(refreshError, null)
                clearStoredSession()
                notifyAuthRequired('انتهت جلسة شاشة المطبخ، يرجى تسجيل الدخول مرة أخرى')
                isRefreshing = false
                return Promise.reject(refreshError)
            }
        }

        return Promise.reject(error)
    }
)

export const authAPI = {
    login: async (username, password) => {
        const response = await api.post('/auth/login', { username, password })
        const accessToken = response.data.accessToken || response.data.token

        if (accessToken) {
            localStorage.setItem('token', accessToken)
            api.defaults.headers.common.Authorization = `Bearer ${accessToken}`
        }
        if (response.data.refreshToken) {
            localStorage.setItem('refreshToken', response.data.refreshToken)
        }

        return response
    },
    logout: async () => {
        const refreshToken = localStorage.getItem('refreshToken')
        clearStoredSession()
        delete api.defaults.headers.common.Authorization
        if (refreshToken) {
            try {
                await api.post('/auth/logout', { refreshToken })
            } catch (_) {
                // Ignore logout failures on kiosk screens.
            }
        }
    }
}

export default api
