import { createSlice } from '@reduxjs/toolkit'

const MAX_HELD_ORDERS = 5

const resolveCartItemKey = (payload) => {
    if (payload && typeof payload === 'object') {
        return String(payload.cart_key || payload.menu_id || '')
    }
    return String(payload || '')
}

const initialState = {
    items: [],
    notes: '',
    heldOrders: [], // Array of held cart states
}

const cartSlice = createSlice({
    name: 'cart',
    initialState,
    reducers: {
        addToCart: (state, action) => {
            const incomingKey = resolveCartItemKey(action.payload)
            const existingItem = state.items.find(
                item => resolveCartItemKey(item) === incomingKey
            )
            if (existingItem) {
                existingItem.quantity += action.payload.quantity || 1
                if (action.payload.batch_number !== undefined) {
                    existingItem.batch_number = action.payload.batch_number
                }
            } else {
                state.items.push({
                    ...action.payload,
                    quantity: action.payload.quantity || 1,
                })
            }
        },
        removeFromCart: (state, action) => {
            const targetKey = resolveCartItemKey(action.payload)
            state.items = state.items.filter(item => resolveCartItemKey(item) !== targetKey)
        },
        updateQuantity: (state, action) => {
            const { quantity } = action.payload
            const itemKey = resolveCartItemKey(action.payload)
            if (quantity <= 0) {
                state.items = state.items.filter(i => resolveCartItemKey(i) !== itemKey)
                return
            }
            const item = state.items.find(i => resolveCartItemKey(i) === itemKey)
            if (item) {
                item.quantity = quantity
            }
        },
        setItemNotes: (state, action) => {
            const { notes } = action.payload
            const itemKey = resolveCartItemKey(action.payload)
            const item = state.items.find(i => resolveCartItemKey(i) === itemKey)
            if (item) {
                item.notes = notes
            }
        },
        setOrderNotes: (state, action) => {
            state.notes = action.payload
        },
        clearCart: (state) => {
            state.items = []
            state.notes = ''
        },

        // Hold current cart for later
        holdCart: (state, action) => {
            if (state.items.length === 0) return

            // Check max limit
            if (state.heldOrders.length >= MAX_HELD_ORDERS) {
                // Remove oldest
                state.heldOrders.shift()
            }

            // Save current cart with timestamp and optional name
            state.heldOrders.push({
                id: Date.now(),
                name: action.payload?.name || `طلب معلق ${state.heldOrders.length + 1}`,
                items: [...state.items],
                notes: state.notes,
                total: Math.round(state.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) * 100) / 100,
                createdAt: new Date().toISOString(),
            })

            // Clear current cart
            state.items = []
            state.notes = ''
        },

        // Recall a held order
        recallCart: (state, action) => {
            const orderId = action.payload
            const heldOrder = state.heldOrders.find(o => o.id === orderId)

            if (heldOrder) {
                // If current cart has items, hold it first
                if (state.items.length > 0) {
                    state.heldOrders.push({
                        id: Date.now(),
                        name: 'طلب مُبدّل',
                        items: [...state.items],
                        notes: state.notes,
                        total: Math.round(state.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) * 100) / 100,
                        createdAt: new Date().toISOString(),
                    })
                }

                // Restore held order
                state.items = heldOrder.items
                state.notes = heldOrder.notes

                // Remove from held orders
                state.heldOrders = state.heldOrders.filter(o => o.id !== orderId)
            }
        },

        // Delete a held order
        deleteHeldOrder: (state, action) => {
            state.heldOrders = state.heldOrders.filter(o => o.id !== action.payload)
        },
    },
})

export const {
    addToCart,
    removeFromCart,
    updateQuantity,
    setItemNotes,
    setOrderNotes,
    clearCart,
    holdCart,
    recallCart,
    deleteHeldOrder,
} = cartSlice.actions

export default cartSlice.reducer

// Selectors
export const selectCartTotal = (state) => {
    return Math.round(state.cart.items.reduce((total, item) => {
        return total + (item.price * item.quantity)
    }, 0) * 100) / 100
}

export const selectCartItemCount = (state) => {
    return state.cart.items.reduce((count, item) => count + item.quantity, 0)
}

export const selectHeldOrders = (state) => state.cart.heldOrders
