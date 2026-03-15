import { createSlice } from '@reduxjs/toolkit'

const initialState = {
    activeShift: null,
    loading: false,
    shiftChecked: false, // NEW: Has shift status been verified from backend?
    error: null,
    showShiftDialog: false,
}

const shiftSlice = createSlice({
    name: 'shift',
    initialState,
    reducers: {
        setLoading: (state, action) => {
            state.loading = action.payload
        },
        setActiveShift: (state, action) => {
            state.activeShift = action.payload
            state.shiftChecked = true // Mark as checked when we get a response
            state.error = null
        },
        setShiftChecked: (state, action) => {
            state.shiftChecked = action.payload
        },
        setError: (state, action) => {
            state.error = action.payload
            state.loading = false
        },
        setShowShiftDialog: (state, action) => {
            state.showShiftDialog = action.payload
        },
        clearShiftError: (state) => {
            state.error = null
        }
    }
})

export const {
    setLoading,
    setActiveShift,
    setShiftChecked,
    setError,
    setShowShiftDialog,
    clearShiftError
} = shiftSlice.actions

export default shiftSlice.reducer
