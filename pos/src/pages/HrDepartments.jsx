import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material'
import {
    Add as AddIcon,
    Edit as EditIcon,
    Group as TeamIcon,
    Refresh as RefreshIcon,
    Work as WorkIcon
} from '@mui/icons-material'
import { hrAPI } from '../services/api'

const departmentDefault = {
    code: '',
    name_ar: '',
    name_en: '',
    manager_id: '',
    budget: '',
    status: 'active',
    description: ''
}

const designationDefault = {
    code: '',
    title_ar: '',
    title_en: '',
    department_id: '',
    level: '',
    base_salary: '',
    status: 'active',
    description: ''
}

export default function HrDepartments() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')

    const [departments, setDepartments] = useState([])
    const [designations, setDesignations] = useState([])
    const [employees, setEmployees] = useState([])

    const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false)
    const [designationDialogOpen, setDesignationDialogOpen] = useState(false)
    const [teamDialogOpen, setTeamDialogOpen] = useState(false)

    const [savingDepartment, setSavingDepartment] = useState(false)
    const [savingDesignation, setSavingDesignation] = useState(false)
    const [loadingTeam, setLoadingTeam] = useState(false)

    const [editingDepartment, setEditingDepartment] = useState(null)
    const [departmentForm, setDepartmentForm] = useState(departmentDefault)
    const [designationForm, setDesignationForm] = useState(designationDefault)
    const [teamData, setTeamData] = useState({ department: null, team: [] })

    const employeeNameMap = useMemo(() => {
        const map = new Map()
        employees.forEach((employee) => {
            map.set(employee.id, `${employee.first_name_ar || ''} ${employee.last_name_ar || ''}`.trim())
        })
        return map
    }, [employees])

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const [departmentsRes, designationsRes, employeesRes] = await Promise.all([
                hrAPI.getDepartments({
                    search: search || undefined,
                    status: status || undefined,
                    limit: 300
                }),
                hrAPI.getDesignations({ limit: 500 }),
                hrAPI.getEmployees({ status: 'active', limit: 500 })
            ])

            setDepartments(departmentsRes.data?.data || [])
            setDesignations(designationsRes.data?.data || [])
            setEmployees(employeesRes.data?.data || [])
            setError('')
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل بيانات الأقسام')
        } finally {
            setLoading(false)
        }
    }, [search, status])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const openCreateDepartment = () => {
        setEditingDepartment(null)
        setDepartmentForm(departmentDefault)
        setDepartmentDialogOpen(true)
    }

    const openEditDepartment = (row) => {
        setEditingDepartment(row)
        setDepartmentForm({
            code: row.code || '',
            name_ar: row.name_ar || '',
            name_en: row.name_en || '',
            manager_id: row.manager_id || '',
            budget: row.budget ?? '',
            status: row.status || 'active',
            description: row.description || ''
        })
        setDepartmentDialogOpen(true)
    }

    const saveDepartment = async () => {
        try {
            setSavingDepartment(true)
            const payload = {
                ...departmentForm,
                budget: Number(departmentForm.budget || 0)
            }

            if (editingDepartment) {
                await hrAPI.updateDepartment(editingDepartment.id, payload)
            } else {
                await hrAPI.createDepartment(payload)
            }

            setDepartmentDialogOpen(false)
            fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر حفظ القسم')
        } finally {
            setSavingDepartment(false)
        }
    }

    const saveDesignation = async () => {
        try {
            setSavingDesignation(true)
            await hrAPI.createDesignation({
                ...designationForm,
                level: designationForm.level ? Number(designationForm.level) : null,
                base_salary: Number(designationForm.base_salary || 0)
            })
            setDesignationDialogOpen(false)
            setDesignationForm(designationDefault)
            fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر حفظ المسمى الوظيفي')
        } finally {
            setSavingDesignation(false)
        }
    }

    const openTeamDialog = async (departmentId) => {
        try {
            setLoadingTeam(true)
            setTeamDialogOpen(true)
            const response = await hrAPI.getDepartmentTeam(departmentId)
            setTeamData(response.data?.data || { department: null, team: [] })
        } catch (err) {
            setError(err.response?.data?.message || 'تعذر تحميل فريق القسم')
            setTeamDialogOpen(false)
        } finally {
            setLoadingTeam(false)
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>الأقسام والمسميات</Typography>
                    <Typography color="text.secondary">إدارة الهيكل التنظيمي للموظفين</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}>
                        تحديث
                    </Button>
                    <Button variant="outlined" startIcon={<WorkIcon />} onClick={() => setDesignationDialogOpen(true)}>
                        مسمى جديد
                    </Button>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDepartment}>
                        قسم جديد
                    </Button>
                </Stack>
            </Stack>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                        fullWidth
                        label="بحث (الكود / الاسم)"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <TextField
                        select
                        label="الحالة"
                        sx={{ minWidth: 180 }}
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                    >
                        <MenuItem value="">الكل</MenuItem>
                        <MenuItem value="active">نشط</MenuItem>
                        <MenuItem value="inactive">غير نشط</MenuItem>
                    </TextField>
                </Stack>
            </Paper>

            <Paper sx={{ mb: 2, overflowX: 'auto' }}>
                {loading ? (
                    <Box sx={{ p: 5, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>الكود</TableCell>
                                <TableCell>اسم القسم</TableCell>
                                <TableCell>المدير</TableCell>
                                <TableCell>الميزانية</TableCell>
                                <TableCell>الحالة</TableCell>
                                <TableCell align="center">إجراء</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {departments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">لا توجد أقسام</TableCell>
                                </TableRow>
                            ) : departments.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell>{row.code}</TableCell>
                                    <TableCell>{row.name_ar}</TableCell>
                                    <TableCell>{employeeNameMap.get(row.manager_id) || row.manager?.first_name_ar || '-'}</TableCell>
                                    <TableCell>{Number(row.budget || 0).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={row.status === 'active' ? 'نشط' : 'غير نشط'}
                                            color={row.status === 'active' ? 'success' : 'default'}
                                        />
                                    </TableCell>
                                    <TableCell align="center">
                                        <IconButton color="primary" onClick={() => openEditDepartment(row)}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton color="info" onClick={() => openTeamDialog(row.id)}>
                                            <TeamIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Paper>

            <Paper sx={{ overflowX: 'auto' }}>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>المسميات الوظيفية</Typography>
                </Box>
                <Divider />
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>الكود</TableCell>
                            <TableCell>المسمى</TableCell>
                            <TableCell>القسم</TableCell>
                            <TableCell>الدرجة</TableCell>
                            <TableCell>الراتب الأساسي</TableCell>
                            <TableCell>الحالة</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {designations.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center">لا توجد مسميات</TableCell>
                            </TableRow>
                        ) : designations.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{row.code}</TableCell>
                                <TableCell>{row.title_ar}</TableCell>
                                <TableCell>{row.department?.name_ar || '-'}</TableCell>
                                <TableCell>{row.level ?? '-'}</TableCell>
                                <TableCell>{Number(row.base_salary || 0).toFixed(2)}</TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        label={row.status === 'active' ? 'نشط' : 'غير نشط'}
                                        color={row.status === 'active' ? 'success' : 'default'}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>

            <Dialog open={departmentDialogOpen} onClose={() => setDepartmentDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{editingDepartment ? 'تعديل قسم' : 'إضافة قسم جديد'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                                label="كود القسم (اختياري)"
                                fullWidth
                                value={departmentForm.code}
                                onChange={(e) => setDepartmentForm({ ...departmentForm, code: e.target.value })}
                            />
                            <TextField
                                label="اسم القسم (عربي)"
                                fullWidth
                                required
                                value={departmentForm.name_ar}
                                onChange={(e) => setDepartmentForm({ ...departmentForm, name_ar: e.target.value })}
                            />
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                                label="اسم القسم (English)"
                                fullWidth
                                value={departmentForm.name_en}
                                onChange={(e) => setDepartmentForm({ ...departmentForm, name_en: e.target.value })}
                            />
                            <TextField
                                select
                                label="المدير"
                                fullWidth
                                value={departmentForm.manager_id}
                                onChange={(e) => setDepartmentForm({ ...departmentForm, manager_id: e.target.value })}
                            >
                                <MenuItem value="">-</MenuItem>
                                {employees.map((employee) => (
                                    <MenuItem key={employee.id} value={employee.id}>
                                        {employee.employee_code} - {employee.first_name_ar} {employee.last_name_ar}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                                label="الميزانية"
                                type="number"
                                fullWidth
                                value={departmentForm.budget}
                                onChange={(e) => setDepartmentForm({ ...departmentForm, budget: e.target.value })}
                            />
                            <TextField
                                label="الحالة"
                                select
                                fullWidth
                                value={departmentForm.status}
                                onChange={(e) => setDepartmentForm({ ...departmentForm, status: e.target.value })}
                            >
                                <MenuItem value="active">نشط</MenuItem>
                                <MenuItem value="inactive">غير نشط</MenuItem>
                            </TextField>
                        </Stack>
                        <TextField
                            label="الوصف"
                            multiline
                            minRows={2}
                            fullWidth
                            value={departmentForm.description}
                            onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDepartmentDialogOpen(false)}>إلغاء</Button>
                    <Button
                        variant="contained"
                        onClick={saveDepartment}
                        disabled={savingDepartment || !departmentForm.name_ar}
                    >
                        {savingDepartment ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={designationDialogOpen} onClose={() => setDesignationDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>إضافة مسمى وظيفي</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                                label="كود المسمى (اختياري)"
                                fullWidth
                                value={designationForm.code}
                                onChange={(e) => setDesignationForm({ ...designationForm, code: e.target.value })}
                            />
                            <TextField
                                label="اسم المسمى (عربي)"
                                fullWidth
                                required
                                value={designationForm.title_ar}
                                onChange={(e) => setDesignationForm({ ...designationForm, title_ar: e.target.value })}
                            />
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                                label="اسم المسمى (English)"
                                fullWidth
                                value={designationForm.title_en}
                                onChange={(e) => setDesignationForm({ ...designationForm, title_en: e.target.value })}
                            />
                            <TextField
                                select
                                label="القسم"
                                fullWidth
                                value={designationForm.department_id}
                                onChange={(e) => setDesignationForm({ ...designationForm, department_id: e.target.value })}
                            >
                                <MenuItem value="">-</MenuItem>
                                {departments.map((department) => (
                                    <MenuItem key={department.id} value={department.id}>
                                        {department.name_ar}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                                label="الدرجة"
                                type="number"
                                fullWidth
                                value={designationForm.level}
                                onChange={(e) => setDesignationForm({ ...designationForm, level: e.target.value })}
                            />
                            <TextField
                                label="الراتب الأساسي"
                                type="number"
                                fullWidth
                                value={designationForm.base_salary}
                                onChange={(e) => setDesignationForm({ ...designationForm, base_salary: e.target.value })}
                            />
                        </Stack>
                        <TextField
                            label="الوصف"
                            multiline
                            minRows={2}
                            fullWidth
                            value={designationForm.description}
                            onChange={(e) => setDesignationForm({ ...designationForm, description: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDesignationDialogOpen(false)}>إلغاء</Button>
                    <Button
                        variant="contained"
                        onClick={saveDesignation}
                        disabled={savingDesignation || !designationForm.title_ar}
                    >
                        {savingDesignation ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={teamDialogOpen} onClose={() => setTeamDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>فريق القسم</DialogTitle>
                <DialogContent dividers>
                    {loadingTeam ? (
                        <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Box>
                            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>
                                {teamData.department?.name_ar || '-'}
                            </Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>الكود</TableCell>
                                        <TableCell>الاسم</TableCell>
                                        <TableCell>المسمى</TableCell>
                                        <TableCell>الحالة</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {teamData.team?.length ? teamData.team.map((member) => (
                                        <TableRow key={member.id}>
                                            <TableCell>{member.employee_code}</TableCell>
                                            <TableCell>{member.first_name_ar} {member.last_name_ar}</TableCell>
                                            <TableCell>{member.designation?.title_ar || '-'}</TableCell>
                                            <TableCell>{member.status}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">لا يوجد أعضاء</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTeamDialogOpen(false)}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}

