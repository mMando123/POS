import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { store } from './store'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <Provider store={store}>
            <App />
            <Toaster
                position="top-center"
                toastOptions={{
                    style: {
                        fontFamily: 'Cairo, sans-serif',
                        direction: 'rtl',
                    },
                }}
            />
        </Provider>
    </React.StrictMode>,
)
