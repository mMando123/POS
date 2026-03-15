import { createSlice } from '@reduxjs/toolkit'

// Load cart from localStorage
const loadCart = () => {
    try {
        const saved = localStorage.getItem('cart')
        return saved ? JSON.parse(saved) : { items: [] }
    } catch {
        return { items: [] }
    }
}

const saveCart = (items) => {
    localStorage.setItem('cart', JSON.stringify({ items }))
}

const initialState = loadCart()

const cartSlice = createSlice({
    name: 'cart',
    initialState,
    reducers: {
        addToCart: (state, action) => {
            const existingItem = state.items.find(
                item => item.menu_id === action.payload.menu_id
            )
            if (existingItem) {
                existingItem.quantity += 1
            } else {
                state.items.push({
                    ...action.payload,
                    quantity: 1,
                })
            }
            saveCart(state.items)
        },
        removeFromCart: (state, action) => {
            state.items = state.items.filter(item => item.menu_id !== action.payload)
            saveCart(state.items)
        },
        updateQuantity: (state, action) => {
            const { menu_id, quantity } = action.payload
            const item = state.items.find(i => i.menu_id === menu_id)
            if (item) {
                if (quantity <= 0) {
                    state.items = state.items.filter(i => i.menu_id !== menu_id)
                } else {
                    item.quantity = quantity
                }
            }
            saveCart(state.items)
        },
        clearCart: (state) => {
            state.items = []
            localStorage.removeItem('cart')
        },
    },
})

export const { addToCart, removeFromCart, updateQuantity, clearCart } = cartSlice.actions
export default cartSlice.reducer

// Selectors
export const selectCartTotal = (state) =>
    Math.round(state.cart.items.reduce((total, item) => total + (item.price * item.quantity), 0) * 100) / 100

export const selectCartItemCount = (state) =>
    state.cart.items.reduce((count, item) => count + item.quantity, 0)
