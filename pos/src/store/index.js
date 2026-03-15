import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import menuReducer from './slices/menuSlice'
import orderReducer from './slices/orderSlice'
import cartReducer from './slices/cartSlice'
import shiftReducer from './slices/shiftSlice'

export const store = configureStore({
    reducer: {
        auth: authReducer,
        menu: menuReducer,
        orders: orderReducer,
        cart: cartReducer,
        shift: shiftReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }),
})
