import { createSlice } from '@reduxjs/toolkit'

const initialState = {
    items: [],
    categories: [],
    loading: false,
}

const menuSlice = createSlice({
    name: 'menu',
    initialState,
    reducers: {
        setLoading: (state, action) => {
            state.loading = action.payload
        },
        setMenuItems: (state, action) => {
            state.items = action.payload
            state.loading = false
        },
        setCategories: (state, action) => {
            state.categories = action.payload
        },
        updateMenuItem: (state, action) => {
            const index = state.items.findIndex(item => item.id === action.payload.id)
            if (index !== -1) {
                state.items[index] = action.payload
            }
        },
    },
})

export const { setLoading, setMenuItems, setCategories, updateMenuItem } = menuSlice.actions
export default menuSlice.reducer
