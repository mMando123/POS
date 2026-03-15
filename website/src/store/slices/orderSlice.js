import { createSlice } from '@reduxjs/toolkit'

const initialState = {
    currentOrder: null,
    trackingOrder: null,
    loading: false,
}

const orderSlice = createSlice({
    name: 'order',
    initialState,
    reducers: {
        setLoading: (state, action) => {
            state.loading = action.payload
        },
        setCurrentOrder: (state, action) => {
            state.currentOrder = action.payload
            state.loading = false
        },
        setTrackingOrder: (state, action) => {
            state.trackingOrder = action.payload
        },
        updateOrderStatus: (state, action) => {
            if (state.trackingOrder?.id === action.payload.orderId) {
                state.trackingOrder.status = action.payload.status
            }
        },
        clearOrder: (state) => {
            state.currentOrder = null
            state.trackingOrder = null
        },
    },
})

export const {
    setLoading,
    setCurrentOrder,
    setTrackingOrder,
    updateOrderStatus,
    clearOrder
} = orderSlice.actions
export default orderSlice.reducer
