import React from 'react'
import { Box, Typography, Button } from '@mui/material'

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo)
        this.setState({ errorInfo })
    }

    handleRetry = () => {
        // Clear localStorage and reload
        localStorage.clear()
        window.location.href = '/login'
    }

    render() {
        if (this.state.hasError) {
            return (
                <Box
                    sx={{
                        height: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3,
                        p: 3,
                        textAlign: 'center',
                        bgcolor: '#f5f5f5'
                    }}
                >
                    <Typography variant="h2">⚠️</Typography>
                    <Typography variant="h4" color="error">
                        حدث خطأ غير متوقع
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 500 }}>
                        {this.state.error?.message || 'حدث خطأ أثناء تحميل الصفحة'}
                    </Typography>
                    {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                        <Box
                            component="pre"
                            sx={{
                                p: 2,
                                bgcolor: '#fff',
                                border: '1px solid #ddd',
                                borderRadius: 1,
                                maxWidth: '80%',
                                overflow: 'auto',
                                fontSize: '0.75rem',
                                textAlign: 'left',
                                direction: 'ltr'
                            }}
                        >
                            {this.state.errorInfo.componentStack}
                        </Box>
                    )}
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button
                            variant="contained"
                            onClick={() => window.location.reload()}
                        >
                            إعادة المحاولة
                        </Button>
                        <Button
                            variant="outlined"
                            color="error"
                            onClick={this.handleRetry}
                        >
                            تسجيل الخروج وإعادة التشغيل
                        </Button>
                    </Box>
                </Box>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
