import { createSlice } from '@reduxjs/toolkit'

const initialState = {
    items: [],
    categories: [],
    loading: false,
    error: null,
}

const menuSlice = createSlice({
    name: 'menu',
    initialState,
    reducers: {
        setMenuLoading: (state) => {
            state.loading = true
        },
        setMenuItems: (state, action) => {
            state.items = action.payload
            state.loading = false
        },
        setCategories: (state, action) => {
            state.categories = action.payload
        },
        addMenuItem: (state, action) => {
            state.items.push(action.payload)
        },
        updateMenuItem: (state, action) => {
            const index = state.items.findIndex(item => item.id === action.payload.id)
            if (index !== -1) {
                state.items[index] = action.payload
            }
        },
        removeMenuItem: (state, action) => {
            state.items = state.items.filter(item => item.id !== action.payload)
        },
        setMenuError: (state, action) => {
            state.error = action.payload
            state.loading = false
        },
    },
})

export const {
    setMenuLoading,
    setMenuItems,
    setCategories,
    addMenuItem,
    updateMenuItem,
    removeMenuItem,
    setMenuError
} = menuSlice.actions

export default menuSlice.reducer
