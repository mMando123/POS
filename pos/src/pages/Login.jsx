import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
    Box,
    Card,
    CardContent,
    TextField,
    Button,
    Typography,
    Alert,
    CircularProgress,
} from '@mui/material'
import { authAPI } from '../services/api'
import { loginStart, loginSuccess, loginFailure } from '../store/slices/authSlice'

export default function Login() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { loading, error } = useSelector((state) => state.auth)
    const [resetLoading, setResetLoading] = useState(false)
    const [resetMessage, setResetMessage] = useState(null)

    const handleResetAdmin = async () => {
        setResetLoading(true)
        setResetMessage(null)
        try {
            const res = await authAPI.resetAdmin()
            setResetMessage({ type: 'success', text: res.data.message })
            setUsername('admin')
            setPassword('admin123')
        } catch (err) {
            setResetMessage({ type: 'error', text: err.response?.data?.message || 'فشل استعادة الحساب' })
        } finally {
            setResetLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        dispatch(loginStart())

        try {
            const response = await authAPI.login(username, password)
            // API returns { message, token, user } directly
            dispatch(loginSuccess({ token: response.data.token, user: response.data.user }))
            navigate('/')
        } catch (err) {
            dispatch(loginFailure(err.response?.data?.message || 'فشل تسجيل الدخول'))
        }
    }

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
                p: 2,
            }}
        >
            <Card sx={{ maxWidth: 400, width: '100%', boxShadow: 10 }}>
                <CardContent sx={{ p: 4 }}>
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                        <Typography variant="h4" fontWeight="bold" color="primary" gutterBottom>
                            🍽️ نظام المطعم
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            نظام نقاط البيع
                        </Typography>
                    </Box>

                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    {resetMessage && (
                        <Alert severity={resetMessage.type} sx={{ mb: 2 }}>
                            {resetMessage.text}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="اسم المستخدم"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            margin="normal"
                            required
                            autoFocus
                        />
                        <TextField
                            fullWidth
                            label="كلمة المرور"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            margin="normal"
                            required
                        />
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            size="large"
                            disabled={loading}
                            sx={{ mt: 3, py: 1.5 }}
                        >
                            {loading ? <CircularProgress size={24} /> : 'تسجيل الدخول'}
                        </Button>
                    </form>

                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
                        المستخدم الافتراضي: admin / admin123
                    </Typography>

                    <Box sx={{ mt: 2, textAlign: 'center' }}>
                        <Button
                            variant="outlined"
                            color="secondary"
                            onClick={handleResetAdmin}
                            disabled={resetLoading || loading}
                            size="small"
                        >
                            {resetLoading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                            إعادة تهيئة واستعادة الحساب
                        </Button>
                    </Box>
                </CardContent>
            </Card>
        </Box>
    )
}
