import { createSlice } from '@reduxjs/toolkit'

const initialState = {
    orders: [],
    activeOrders: [],
    loading: false,
    error: null,
}

const orderSlice = createSlice({
    name: 'orders',
    initialState,
    reducers: {
        setOrdersLoading: (state) => {
            state.loading = true
        },
        setOrders: (state, action) => {
            state.orders = action.payload
            state.loading = false
        },
        setActiveOrders: (state, action) => {
            state.activeOrders = action.payload
        },
        addOrder: (state, action) => {
            state.orders.unshift(action.payload)
            if (['new', 'confirmed', 'preparing'].includes(action.payload.status)) {
                state.activeOrders.unshift(action.payload)
            }
        },
        updateOrderStatus: (state, action) => {
            const { orderId, status } = action.payload

            // Update in orders list
            const orderIndex = state.orders.findIndex(o => o.id === orderId)
            if (orderIndex !== -1) {
                state.orders[orderIndex].status = status
            }

            // Update in active orders
            const activeIndex = state.activeOrders.findIndex(o => o.id === orderId)
            if (activeIndex !== -1) {
                if (['completed', 'cancelled'].includes(status)) {
                    state.activeOrders.splice(activeIndex, 1)
                } else {
                    state.activeOrders[activeIndex].status = status
                }
            }
        },
        setOrderError: (state, action) => {
            state.error = action.payload
            state.loading = false
        },
    },
})

export const {
    setOrdersLoading,
    setOrders,
    setActiveOrders,
    addOrder,
    updateOrderStatus,
    setOrderError
} = orderSlice.actions

export default orderSlice.reducer
