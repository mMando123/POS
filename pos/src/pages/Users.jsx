import { useState, useEffect } from 'react'
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    IconButton,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Switch,
    FormControlLabel,
    CircularProgress,
    Alert,
    InputAdornment,
    Avatar
} from '@mui/material'
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as ViewIcon,
    VisibilityOff as HideIcon,
    Search as SearchIcon,

    Refresh as RefreshIcon,
    Warning as WarningIcon // Added Warning Icon
} from '@mui/icons-material'
import toast from 'react-hot-toast'
import { userAPI, branchAPI, warehouseAPI } from '../services/api'

const ROLE_COLORS = {
    admin: 'error',
    manager: 'warning',
    cashier: 'info',
    chef: 'success',
    supervisor: 'secondary',
    accountant: 'default'
}

const ROLE_LABELS = {
    admin: '?????',
    manager: '????',
    cashier: '?????',
    chef: '???',
    supervisor: '????',
    accountant: '?????'
}

const DEFAULT_ROLE_OPTIONS = [
    { value: 'admin', label_ar: '????? ??????', label_en: 'Admin' },
    { value: 'manager', label_ar: '????', label_en: 'Manager' },
    { value: 'supervisor', label_ar: '????', label_en: 'Supervisor' },
    { value: 'cashier', label_ar: '?????', label_en: 'Cashier' },
    { value: 'chef', label_ar: '???', label_en: 'Chef' },
    { value: 'accountant', label_ar: '?????', label_en: 'Accountant' }
]


export default function Users() {
    const [users, setUsers] = useState([])
    const [branches, setBranches] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [roleOptions, setRoleOptions] = useState(DEFAULT_ROLE_OPTIONS)
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingUser, setEditingUser] = useState(null)
    const [showPassword, setShowPassword] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterRole, setFilterRole] = useState('')

    const [formData, setFormData] = useState({
        username: '',
        password: '',
        name_ar: '',
        name_en: '',
        role: 'cashier',
        branch_id: '',
        default_warehouse_id: '',
        is_active: true
    })

    const [errors, setErrors] = useState({}) // Field-level errors state

    useEffect(() => {
        fetchUsers()
        fetchBranches()
        fetchWarehouses()
        fetchRoleOptions()
    }, [])

    const fetchUsers = async () => {
        setLoading(true)
        try {
            const params = {}
            if (searchTerm) params.search = searchTerm
            if (filterRole) params.role = filterRole

            const response = await userAPI.getAll(params)
            setUsers(response.data.data || [])
        } catch (error) {
            console.error('Fetch users error:', error)
            toast.error('فشل تحميل المستخدمين')
        } finally {
            setLoading(false)
        }
    }

    const fetchBranches = async () => {
        try {
            const response = await branchAPI.getAll()
            setBranches(response.data.data || [])
        } catch (error) {
            console.error('Fetch branches error:', error)
        }
    }

    const fetchWarehouses = async () => {
        try {
            const response = await warehouseAPI.getAll({ status: 'active' })
            setWarehouses(response.data.data || [])
        } catch (error) {
            console.error('Fetch warehouses error:', error)
        }
    }



    const fetchRoleOptions = async () => {
        try {
            const response = await userAPI.getRoles()
            const roles = response?.data?.data
            if (Array.isArray(roles) && roles.length) {
                setRoleOptions(roles)
            }
        } catch (error) {
            console.error('Fetch roles meta error:', error)
        }
    }

    const getRoleLabel = (role) => {
        const meta = roleOptions.find((item) => item.value === role)
        return meta?.label_ar || ROLE_LABELS[role] || role
    }

    const handleOpenDialog = (user = null) => {
        if (user) {
            setEditingUser(user)
            setFormData({
                username: user.username,
                password: '',
                name_ar: user.name_ar,
                name_en: user.name_en || '',
                role: user.role,
                branch_id: user.branch_id,
                default_warehouse_id: user.default_warehouse_id || '',
                is_active: user.is_active
            })
        } else {
            setEditingUser(null)
            setFormData({
                username: '',
                password: '',
                name_ar: '',
                name_en: '',
                role: 'cashier',
                branch_id: branches[0]?.id || '',
                default_warehouse_id: '',
                is_active: true
            })
            setErrors({}) // Clear errors
        }
        setDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setDialogOpen(false)
        setEditingUser(null)
        setShowPassword(false)
    }

    const validateField = (name, value) => {
        let error = ''
        switch (name) {
            case 'username':
                if (!value) error = 'يرجى إدخال اسم المستخدم'
                else if (value.length < 3) error = 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'
                break
            case 'password':
                // Only validate password if creating user OR if password field has value (updating)
                if (!editingUser && !value) error = 'يرجى إدخال كلمة المرور'
                else if (value && value.length < 6) error = 'كلمة المرور يجب أن تكون 6 خانات (أرقام وحروف)'
                else if (value && !/^[a-zA-Z0-9]+$/.test(value)) error = 'كلمة المرور يجب أن تحتوي على أحرف وأرقام إنجليزية فقط'
                break
            case 'name_ar':
                if (!value) error = 'يرجى إدخال الاسم'
                break
            case 'branch_id':
                if (!value) error = 'يرجى اختيار الفرع'
                break
            default:
                break
        }
        setErrors(prev => ({ ...prev, [name]: error }))
        return error === ''
    }

    const validateForm = () => {
        const fields = ['username', 'name_ar', 'branch_id']
        // Only validate password if creating new user or if password field has value
        if (!editingUser || formData.password) {
            fields.push('password')
        }

        let isValid = true
        // Check all fields
        fields.forEach(field => {
            // Check logic manually to ensure we catch all errors
            let isFieldValid = true
            const value = formData[field]

            // Re-use logic or call validateField (but validateField updates state async? No, React state updates are scheduled, but we can't rely on `errors` state immediately inside loop if we just set it. 
            // Better to calculate error and set it.)
            // Actually, calling validateField multiple times in loop will trigger 4 state updates.
            // Better to compute all errors and set once.

            // Simplified: Just iterate and call validation logic.
            // But for simplicity in this tool step, I will use a helper approach or just call validateField.
            // Since validateField updates state using updater function `prev => ...`, it handles batching reasonably well in React 18, or at least merges updates.
            if (!validateField(field, value)) {
                isValid = false
            }
        })
        return isValid
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => {
            const next = { ...prev, [name]: value }
            if (name === 'branch_id') {
                next.default_warehouse_id = ''
            }
            if (name === 'role' && value !== 'cashier') {
                next.default_warehouse_id = ''
            }
            return next
        })
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }))
        }
    }

    const handleBlur = (e) => {
        const { name, value } = e.target
        validateField(name, value)
    }

    const warehousesForSelectedBranch = warehouses.filter((w) => (
        String(w.branchId) === String(formData.branch_id || '')
    ))

    const handleSubmit = async () => {
        if (!validateForm()) return

        try {
            const payload = {
                ...formData,
                default_warehouse_id: formData.role === 'cashier'
                    ? (formData.default_warehouse_id || null)
                    : null
            }

            if (editingUser) {
                const updateData = { ...payload }
                if (!updateData.password) delete updateData.password
                await userAPI.update(editingUser.id, updateData)
                toast.success('تم تحديث المستخدم بنجاح')
            } else {
                await userAPI.create(payload)
                toast.success('تم إنشاء المستخدم بنجاح')
            }
            handleCloseDialog()
            fetchUsers()
        } catch (error) {
            console.error('Save user error:', error)
            const msg = error.response?.data?.message
            if (msg === 'اسم المستخدم موجود مسبقاً') {
                setErrors(prev => ({ ...prev, username: 'اسم المستخدم موجود بالفعل، اختر اسماً آخر' }))
            } else {
                toast.error(msg || 'حدث خطأ')
            }
        }
    }

    const handleDelete = async (user) => {
        if (!window.confirm(`هل تريد حذف المستخدم "${user.name_ar}"؟`)) return

        try {
            await userAPI.delete(user.id)
            toast.success('تم حذف المستخدم')
            fetchUsers()
        } catch (error) {
            console.error('Delete user error:', error)
            toast.error(error.response?.data?.message || 'فشل حذف المستخدم')
        }
    }

    const handleToggleStatus = async (user) => {
        try {
            await userAPI.toggleStatus(user.id)
            toast.success(user.is_active ? 'تم إلغاء تفعيل المستخدم' : 'تم تفعيل المستخدم')
            fetchUsers()
        } catch (error) {
            console.error('Toggle status error:', error)
            toast.error(error.response?.data?.message || 'فشل تغيير الحالة')
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" fontWeight="bold">
                    إدارة المستخدمين
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    size="large"
                >
                    إضافة مستخدم
                </Button>
            </Box>

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        placeholder="بحث..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        size="small"
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            )
                        }}
                        sx={{ minWidth: 200 }}
                    />
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>الدور</InputLabel>
                        <Select
                            value={filterRole}
                            label="الدور"
                            onChange={(e) => setFilterRole(e.target.value)}
                        >
                            <MenuItem value="">????</MenuItem>
                            {roleOptions.map((role) => (
                                <MenuItem key={role.value} value={role.value}>
                                    {role.label_ar || role.value}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={fetchUsers}
                    >
                        تحديث
                    </Button>
                </Box>
            </Paper>

            {/* Users Table */}
            <TableContainer component={Paper}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'primary.main' }}>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>المستخدم</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>اسم المستخدم</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>الدور</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>الفرع</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>مخزن الصرف</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>الحالة</TableCell>
                                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>الإجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        لا يوجد مستخدمين
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={user.id} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Avatar sx={{ bgcolor: 'secondary.main' }}>
                                                    {user.name_ar?.[0]}
                                                </Avatar>
                                                <Box>
                                                    <Typography fontWeight="bold">{user.name_ar}</Typography>
                                                    {user.name_en && (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {user.name_en}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>@{user.username}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={getRoleLabel(user.role)}
                                                color={ROLE_COLORS[user.role] || 'default'}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>{user.Branch?.name_ar || '-'}</TableCell>
                                        <TableCell>
                                            {user.role === 'cashier'
                                                ? (user.defaultWarehouse?.name_ar || user.defaultWarehouse?.name_en || '-')
                                                : '-'}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={user.is_active ? 'نشط' : 'غير نشط'}
                                                color={user.is_active ? 'success' : 'default'}
                                                size="small"
                                                variant={user.is_active ? 'filled' : 'outlined'}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <IconButton
                                                color="primary"
                                                onClick={() => handleOpenDialog(user)}
                                                title="تعديل"
                                            >
                                                <EditIcon />
                                            </IconButton>
                                            <IconButton
                                                color="error"
                                                onClick={() => handleDelete(user)}
                                                title="حذف"
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            name="username"
                            label="اسم المستخدم"
                            value={formData.username}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            disabled={!!editingUser}
                            required
                            fullWidth
                            error={!!errors.username}
                            helperText={errors.username && (
                                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <WarningIcon fontSize="small" /> {errors.username}
                                </Box>
                            )}
                        />
                        <TextField
                            name="password"
                            label={editingUser ? 'كلمة المرور الجديدة (اختياري)' : 'كلمة المرور'}
                            type={showPassword ? 'text' : 'password'}
                            value={formData.password}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            required={!editingUser}
                            fullWidth
                            error={!!errors.password}
                            helperText={errors.password && (
                                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <WarningIcon fontSize="small" /> {errors.password}
                                </Box>
                            )}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton onClick={() => setShowPassword(!showPassword)}>
                                            {showPassword ? <HideIcon /> : <ViewIcon />}
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />
                        <TextField
                            name="name_ar"
                            label="الاسم بالعربية"
                            value={formData.name_ar}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            required
                            fullWidth
                            error={!!errors.name_ar}
                            helperText={errors.name_ar && (
                                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <WarningIcon fontSize="small" /> {errors.name_ar}
                                </Box>
                            )}
                        />
                        <TextField
                            name="name_en"
                            label="الاسم بالإنجليزية"
                            value={formData.name_en}
                            onChange={handleChange}
                            fullWidth
                        />
                        <FormControl fullWidth required>
                            <InputLabel>الدور</InputLabel>
                            <Select
                                name="role"
                                value={formData.role}
                                label="الدور"
                                onChange={handleChange}
                            >
                                {roleOptions.map((role) => (
                                    <MenuItem key={role.value} value={role.value}>
                                        {role.label_ar || role.value}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth required error={!!errors.branch_id}>
                            <InputLabel>الفرع</InputLabel>
                            <Select
                                name="branch_id"
                                value={formData.branch_id}
                                label="الفرع"
                                onChange={handleChange}
                                onBlur={handleBlur}
                            >
                                {branches.map((branch) => (
                                    <MenuItem key={branch.id} value={branch.id}>
                                        {branch.name_ar}
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.branch_id && (
                                <Box sx={{ color: 'error.main', fontSize: '0.75rem', mt: 0.5, ml: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <WarningIcon fontSize="small" /> {errors.branch_id}
                                </Box>
                            )}
                        </FormControl>
                        {formData.role === 'cashier' && (
                            <FormControl fullWidth>
                                <InputLabel>مخزن الصرف (اختياري)</InputLabel>
                                <Select
                                    name="default_warehouse_id"
                                    value={formData.default_warehouse_id}
                                    label="مخزن الصرف (اختياري)"
                                    onChange={handleChange}
                                >
                                    <MenuItem value="">افتراضي الفرع (بدون تقييد)</MenuItem>
                                    {warehousesForSelectedBranch.map((warehouse) => (
                                        <MenuItem key={warehouse.id} value={warehouse.id}>
                                            {warehouse.nameAr || warehouse.nameEn}
                                            {warehouse.isDefault ? ' (افتراضي)' : ''}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        {editingUser && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.is_active}
                                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    />
                                }
                                label="المستخدم نشط"
                            />
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>إلغاء</Button>
                    <Button variant="contained" onClick={handleSubmit}>
                        {editingUser ? 'حفظ التعديلات' : 'إضافة'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}

