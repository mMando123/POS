import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { Toaster } from 'react-hot-toast'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { store } from './store'
import { ThemeConfigProvider } from './contexts/ThemeContext'
import './index.css'
import './styles/pos-terminal.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <ThemeConfigProvider>
                <Provider store={store}>
                    <App />
                    <Toaster
                        position="top-left"
                        toastOptions={{
                            style: {
                                fontFamily: 'Cairo, sans-serif',
                            },
                        }}
                    />
                </Provider>
            </ThemeConfigProvider>
        </ErrorBoundary>
    </React.StrictMode>,
)
