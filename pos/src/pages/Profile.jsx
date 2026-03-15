import { useState, useEffect } from 'react'
import {
    Box,
    Typography,
    Paper,
    Grid,
    TextField,
    Button,
    Avatar,
    Divider,
    IconButton,
    InputAdornment,
    Alert,
    Stack
} from '@mui/material'
import {
    Save as SaveIcon,
    Lock as LockIcon,
    Person as PersonIcon,
    Visibility,
    VisibilityOff
} from '@mui/icons-material'
import { useSelector, useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import { authAPI } from '../services/api'
import { useThemeConfig } from '../contexts/ThemeContext'
import { loginSuccess } from '../store/slices/authSlice'
import { toReadableText } from '../utils/textSanitizer'

export default function Profile() {
    const { t, isRtl } = useThemeConfig()
    const { user } = useSelector((state) => state.auth)
    const dispatch = useDispatch()

    const [loading, setLoading] = useState(false)
    const [passwordLoading, setPasswordLoading] = useState(false)

    // Validation & Form State
    const [errors, setErrors] = useState({})
    const [isDirty, setIsDirty] = useState(false)
    const [initialProfileData, setInitialProfileData] = useState(null)

    const [profileData, setProfileData] = useState({
        name_ar: '',
        name_en: '',
        username: '',
        email: ''
    })

    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    })

    const [showPassword, setShowPassword] = useState({
        current: false,
        new: false,
        confirm: false
    })

    const displayNameAr = toReadableText(user?.name_ar, user?.username || 'المستخدم')
    const displayNameEn = toReadableText(user?.name_en, user?.username || displayNameAr)
    const avatarLabel = displayNameAr || displayNameEn || user?.username || 'U'
    const avatarInitial = avatarLabel.trim().charAt(0) || 'U'

    useEffect(() => {
        if (user) {
            const data = {
                name_ar: toReadableText(user.name_ar, ''),
                name_en: toReadableText(user.name_en, ''),
                username: user.username || '',
                email: user.email || ''
            }
            setProfileData(data)
            setInitialProfileData(data)
        }
    }, [user])

    const validateProfileForm = () => {
        const newErrors = {}
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

        if (!profileData.name_ar.trim()) newErrors.name_ar = t('validation.required') || 'هذا الحقل مطلوب'
        if (!profileData.name_en.trim()) newErrors.name_en = t('validation.required') || 'هذا الحقل مطلوب'

        if (!profileData.email.trim()) {
            newErrors.email = t('validation.required') || 'هذا الحقل مطلوب'
        } else if (!emailRegex.test(profileData.email)) {
            newErrors.email = t('validation.invalidEmail') || 'البريد الإلكتروني غير صحيح'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleProfileChange = (e) => {
        const { name, value } = e.target
        setProfileData(prev => {
            const updated = { ...prev, [name]: value }

            // Check dirty state
            if (initialProfileData) {
                const hasChanged = Object.keys(updated).some(key => updated[key] !== initialProfileData[key])
                setIsDirty(hasChanged)
            }
            return updated
        })

        // Clear error when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }))
        }
    }

    const handlePasswordChange = (e) => {
        setPasswords({ ...passwords, [e.target.name]: e.target.value })
    }

    const togglePasswordVisibility = (field) => {
        setShowPassword({ ...showPassword, [field]: !showPassword[field] })
    }

    const handleUpdateProfile = async (e) => {
        e.preventDefault()
        if (!validateProfileForm()) return

        setLoading(true)
        try {
            const res = await authAPI.updateProfile({
                name_ar: profileData.name_ar,
                name_en: profileData.name_en,
                email: profileData.email
            })

            if (res.data?.success) {
                const meRes = await authAPI.me()
                const updatedUser = meRes.data.data

                dispatch(loginSuccess({ user: updatedUser, token: localStorage.getItem('token') }))
                setInitialProfileData(profileData)
                setIsDirty(false)
                toast.success(t('messages.updateSuccess') || 'تم التحديث بنجاح')
            }
        } catch (error) {
            console.error('Update profile error:', error)
            toast.error(error.response?.data?.message || 'فشل التحديث')
        } finally {
            setLoading(false)
        }
    }

    const handleChangePassword = async (e) => {
        e.preventDefault()
        if (passwords.newPassword !== passwords.confirmPassword) {
            toast.error(t('auth.passwordsDoNotMatch') || 'كلمتا المرور غير متطابقتين')
            return
        }
        if (passwords.newPassword.length < 6) {
            toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
            return
        }

        setPasswordLoading(true)
        try {
            await authAPI.changePassword(passwords.currentPassword, passwords.newPassword)
            toast.success(t('messages.passwordChanged') || 'تم تغيير كلمة المرور بنجاح')
            setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
        } catch (error) {
            console.error('Change password error:', error)
            toast.error(error.response?.data?.message || 'فشل تغيير كلمة المرور')
        } finally {
            setPasswordLoading(false)
        }
    }

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
            <Typography variant="h5" fontWeight="bold" mb={3} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon color="primary" /> الملف الشخصي
            </Typography>

            <Grid container spacing={3}>
                {/* Profile Information */}
                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 3, borderRadius: 2 }}>
                        <Typography variant="h6" fontWeight="bold" mb={2} gutterBottom>
                            البيانات الأساسية
                        </Typography>
                        <Divider sx={{ mb: 3 }} />

                        <Box component="form" onSubmit={handleUpdateProfile}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                                <Avatar
                                    sx={{ width: 80, height: 80, bgcolor: 'primary.main', fontSize: '2rem' }}
                                >
                                    {avatarInitial}
                                </Avatar>
                                <Box>
                                    <Typography variant="h6" fontWeight="bold">{displayNameAr}</Typography>
                                    <Typography variant="body2" color="text.secondary">{user?.role}</Typography>
                                </Box>
                            </Box>

                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        label="الاسم بالعربية"
                                        name="name_ar"
                                        value={profileData.name_ar}
                                        onChange={handleProfileChange}
                                        error={!!errors.name_ar}
                                        helperText={errors.name_ar}
                                        fullWidth
                                        required
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        label="الاسم بالإنجليزية"
                                        name="name_en"
                                        value={profileData.name_en}
                                        onChange={handleProfileChange}
                                        error={!!errors.name_en}
                                        helperText={errors.name_en}
                                        fullWidth
                                        required
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        label="اسم المستخدم"
                                        name="username"
                                        value={profileData.username}
                                        disabled
                                        fullWidth
                                        helperText="لا يمكن تغيير اسم المستخدم"
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        label="البريد الإلكتروني"
                                        name="email"
                                        value={profileData.email}
                                        onChange={handleProfileChange}
                                        error={!!errors.email}
                                        helperText={errors.email}
                                        fullWidth
                                        required
                                        type="email"
                                    />
                                </Grid>
                            </Grid>

                            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                    type="submit"
                                    variant="contained"
                                    startIcon={<SaveIcon />}
                                    disabled={loading || !isDirty}
                                >
                                    {loading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                                </Button>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>

                {/* Change Password */}
                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 3, borderRadius: 2 }}>
                        <Typography variant="h6" fontWeight="bold" mb={2} gutterBottom>
                            تغيير كلمة المرور
                        </Typography>
                        <Divider sx={{ mb: 3 }} />

                        <Box component="form" onSubmit={handleChangePassword}>
                            <Stack spacing={2}>
                                <TextField
                                    label="كلمة المرور الحالية"
                                    name="currentPassword"
                                    type={showPassword.current ? 'text' : 'password'}
                                    value={passwords.currentPassword}
                                    onChange={handlePasswordChange}
                                    fullWidth
                                    required
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton onClick={() => togglePasswordVisibility('current')}>
                                                    {showPassword.current ? <VisibilityOff /> : <Visibility />}
                                                </IconButton>
                                            </InputAdornment>
                                        )
                                    }}
                                />
                                <TextField
                                    label="كلمة المرور الجديدة"
                                    name="newPassword"
                                    type={showPassword.new ? 'text' : 'password'}
                                    value={passwords.newPassword}
                                    onChange={handlePasswordChange}
                                    fullWidth
                                    required
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton onClick={() => togglePasswordVisibility('new')}>
                                                    {showPassword.new ? <VisibilityOff /> : <Visibility />}
                                                </IconButton>
                                            </InputAdornment>
                                        )
                                    }}
                                />
                                <TextField
                                    label="تأكيد كلمة المرور الجديدة"
                                    name="confirmPassword"
                                    type={showPassword.confirm ? 'text' : 'password'}
                                    value={passwords.confirmPassword}
                                    onChange={handlePasswordChange}
                                    fullWidth
                                    required
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton onClick={() => togglePasswordVisibility('confirm')}>
                                                    {showPassword.confirm ? <VisibilityOff /> : <Visibility />}
                                                </IconButton>
                                            </InputAdornment>
                                        )
                                    }}
                                />
                            </Stack>

                            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                    type="submit"
                                    variant="outlined"
                                    color="secondary"
                                    startIcon={<LockIcon />}
                                    disabled={passwordLoading}
                                >
                                    {passwordLoading ? 'جاري التغيير...' : 'تحديث كلمة المرور'}
                                </Button>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    )
}
