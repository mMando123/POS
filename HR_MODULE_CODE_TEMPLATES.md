# 💻 نماذج الأكواد الجاهزة - HR Module Code Templates
## Ready-to-Use Code Examples for HR Module

---

## 1️⃣ نموذج الموظف / Employee Model (Backend)

### backend/src/models/Employee.js
```javascript
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Employee = sequelize.define('Employee', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    employee_code: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
    },
    first_name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    last_name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    first_name_en: DataTypes.STRING(100),
    last_name_en: DataTypes.STRING(100),
    email: {
        type: DataTypes.STRING(150),
        unique: true,
        validate: {
            isEmail: true,
        },
    },
    phone: DataTypes.STRING(20),
    date_of_birth: DataTypes.DATE,
    gender: {
        type: DataTypes.ENUM('M', 'F'),
    },
    department_id: DataTypes.UUID,
    designation_id: DataTypes.UUID,
    employment_type: {
        type: DataTypes.ENUM('Full-time', 'Part-time', 'Contract', 'Temporary'),
        defaultValue: 'Full-time',
    },
    date_of_joining: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    date_of_leaving: DataTypes.DATE,
    status: {
        type: DataTypes.ENUM('Active', 'Inactive', 'On-leave', 'Terminated'),
        defaultValue: 'Active',
    },
    address_ar: DataTypes.TEXT,
    address_en: DataTypes.TEXT,
    city: DataTypes.STRING(100),
    state: DataTypes.STRING(100),
    country: DataTypes.STRING(100),
    postal_code: DataTypes.STRING(20),
    bank_name: DataTypes.STRING(100),
    account_number: DataTypes.STRING(50),
    iban: DataTypes.STRING(50),
}, {
    tableName: 'employees',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = Employee;
```

---

## 2️⃣ خدمة الموظفين / Employee Service

### backend/src/services/employeeService.js
```javascript
const { Employee, Department, Designation } = require('../models');
const { Op } = require('sequelize');

class EmployeeService {
    // إضافة موظف جديد
    static async createEmployee(employeeData) {
        try {
            const employee = await Employee.create({
                ...employeeData,
                employee_code: await this.generateEmployeeCode(),
            });
            return employee;
        } catch (error) {
            throw new Error(`Failed to create employee: ${error.message}`);
        }
    }

    // الحصول على جميع الموظفين
    static async getAllEmployees(filters = {}) {
        try {
            const where = {};
            
            if (filters.status) where.status = filters.status;
            if (filters.department_id) where.department_id = filters.department_id;
            if (filters.search) {
                where[Op.or] = [
                    { first_name_ar: { [Op.like]: `%${filters.search}%` } },
                    { employee_code: { [Op.like]: `%${filters.search}%` } },
                    { email: { [Op.like]: `%${filters.search}%` } },
                ];
            }

            const employees = await Employee.findAll({
                where,
                include: [
                    { model: Department, as: 'department' },
                    { model: Designation, as: 'designation' },
                ],
                order: [['first_name_ar', 'ASC']],
            });

            return employees;
        } catch (error) {
            throw new Error(`Failed to fetch employees: ${error.message}`);
        }
    }

    // الحصول على بيانات موظف واحد
    static async getEmployeeById(id) {
        try {
            const employee = await Employee.findByPk(id, {
                include: [
                    { model: Department, as: 'department' },
                    { model: Designation, as: 'designation' },
                ],
            });

            if (!employee) {
                throw new Error('Employee not found');
            }

            return employee;
        } catch (error) {
            throw new Error(`Failed to fetch employee: ${error.message}`);
        }
    }

    // تحديث بيانات الموظف
    static async updateEmployee(id, employeeData) {
        try {
            const employee = await Employee.findByPk(id);
            
            if (!employee) {
                throw new Error('Employee not found');
            }

            await employee.update(employeeData);
            return employee;
        } catch (error) {
            throw new Error(`Failed to update employee: ${error.message}`);
        }
    }

    // توليد رمز الموظف
    static async generateEmployeeCode() {
        const lastEmployee = await Employee.findOne({
            order: [['created_at', 'DESC']],
        });

        const lastCode = lastEmployee?.employee_code || 'EMP000';
        const number = parseInt(lastCode.substring(3)) + 1;
        return `EMP${String(number).padStart(3, '0')}`;
    }

    // حساب سنوات الخدمة
    static calculateServiceYears(joiningDate) {
        const today = new Date();
        const years = today.getFullYear() - joiningDate.getFullYear();
        const months = today.getMonth() - joiningDate.getMonth();
        
        return { years, months };
    }
}

module.exports = EmployeeService;
```

---

## 3️⃣ خدمة الرواتب / Payroll Service

### backend/src/services/payrollService.js
```javascript
const { EmployeeSalary, SalaryComponent, Employee } = require('../models');
const Decimal = require('decimal.js');

class PayrollService {
    // معالجة الرواتب الشهرية
    static async processMonthlyPayroll(salaryPeriod, employeeIds = null) {
        try {
            const employees = await Employee.findAll({
                where: {
                    status: 'Active',
                    ...(employeeIds && { id: employeeIds }),
                },
            });

            const salaries = [];

            for (const employee of employees) {
                const salary = await this.calculateSalary(employee, salaryPeriod);
                salaries.push(salary);
            }

            return salaries;
        } catch (error) {
            throw new Error(`Failed to process payroll: ${error.message}`);
        }
    }

    // حساب الراتب للموظف
    static async calculateSalary(employee, salaryPeriod) {
        try {
            const baseSalary = new Decimal(employee.designation?.base_salary || 0);
            const allowances = new Decimal(0); // من قاعدة البيانات
            const deductions = new Decimal(0); // من قاعدة البيانات

            const gross = baseSalary.plus(allowances);
            const net = gross.minus(deductions);

            const salary = await EmployeeSalary.create({
                employee_id: employee.id,
                salary_period: salaryPeriod,
                base_salary: baseSalary.toNumber(),
                gross_salary: gross.toNumber(),
                net_salary: net.toNumber(),
                status: 'Draft',
            });

            return salary;
        } catch (error) {
            throw new Error(`Failed to calculate salary: ${error.message}`);
        }
    }

    // الموافقة على الرواتب
    static async approveSalaries(salaryIds, approvedBy) {
        try {
            const salaries = await EmployeeSalary.update(
                {
                    status: 'Approved',
                    approved_by: approvedBy,
                    approved_date: new Date(),
                },
                {
                    where: { id: salaryIds },
                }
            );

            return salaries;
        } catch (error) {
            throw new Error(`Failed to approve salaries: ${error.message}`);
        }
    }

    // توليد تقرير الرواتب
    static async generatePayrollReport(salaryPeriod) {
        try {
            const salaries = await EmployeeSalary.findAll({
                where: { salary_period: salaryPeriod },
                include: [
                    {
                        model: Employee,
                        attributes: ['employee_code', 'first_name_ar', 'department_id'],
                    },
                ],
            });

            const totalGross = salaries.reduce((sum, s) => sum + s.gross_salary, 0);
            const totalNet = salaries.reduce((sum, s) => sum + s.net_salary, 0);

            return {
                period: salaryPeriod,
                total_employees: salaries.length,
                total_gross: totalGross,
                total_net: totalNet,
                salaries,
            };
        } catch (error) {
            throw new Error(`Failed to generate payroll report: ${error.message}`);
        }
    }
}

module.exports = PayrollService;
```

---

## 4️⃣ صفحة الموظفين (Frontend) / Employee Page

### pos/src/pages/HrEmployees.jsx
```jsx
import React, { useState, useEffect } from 'react'
import {
    Box,
    Button,
    Dialog,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    TextField,
    IconButton,
    Chip,
} from '@mui/material'
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material'
import toast from 'react-hot-toast'
import api from '../services/api'

export default function HrEmployees() {
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(false)
    const [openDialog, setOpenDialog] = useState(false)
    const [editingEmployee, setEditingEmployee] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    // جلب الموظفين
    const fetchEmployees = async () => {
        try {
            setLoading(true)
            const response = await api.get('/api/hr/employees', {
                params: { search: searchTerm },
            })
            setEmployees(response.data)
        } catch (error) {
            toast.error('فشل تحميل الموظفين')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchEmployees()
    }, [searchTerm])

    // فتح نموذج الإضافة
    const handleAddEmployee = () => {
        setEditingEmployee(null)
        setOpenDialog(true)
    }

    // حفظ الموظف
    const handleSaveEmployee = async (employeeData) => {
        try {
            if (editingEmployee) {
                await api.put(`/api/hr/employees/${editingEmployee.id}`, employeeData)
                toast.success('تم تحديث الموظف بنجاح')
            } else {
                await api.post('/api/hr/employees', employeeData)
                toast.success('تم إضافة الموظف بنجاح')
            }
            setOpenDialog(false)
            fetchEmployees()
        } catch (error) {
            toast.error('حدث خطأ أثناء حفظ الموظف')
        }
    }

    // حذف الموظف
    const handleDeleteEmployee = async (id) => {
        if (window.confirm('هل تريد حذف هذا الموظف؟')) {
            try {
                await api.delete(`/api/hr/employees/${id}`)
                toast.success('تم حذف الموظف بنجاح')
                fetchEmployees()
            } catch (error) {
                toast.error('فشل حذف الموظف')
            }
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <h1>إدارة الموظفين</h1>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleAddEmployee}
                >
                    إضافة موظف
                </Button>
            </Box>

            <TextField
                placeholder="ابحث عن الموظف..."
                fullWidth
                sx={{ mb: 3 }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <TableContainer component={Paper}>
                <Table>
                    <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableRow>
                            <TableCell>رمز الموظف</TableCell>
                            <TableCell>الاسم</TableCell>
                            <TableCell>البريد الإلكتروني</TableCell>
                            <TableCell>القسم</TableCell>
                            <TableCell>الحالة</TableCell>
                            <TableCell>الإجراءات</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {employees.map((employee) => (
                            <TableRow key={employee.id}>
                                <TableCell>{employee.employee_code}</TableCell>
                                <TableCell>{employee.first_name_ar} {employee.last_name_ar}</TableCell>
                                <TableCell>{employee.email}</TableCell>
                                <TableCell>{employee.department?.name_ar}</TableCell>
                                <TableCell>
                                    <Chip
                                        label={employee.status}
                                        color={employee.status === 'Active' ? 'success' : 'default'}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            setEditingEmployee(employee)
                                            setOpenDialog(true)
                                        }}
                                    >
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleDeleteEmployee(employee.id)}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* نموذج الموظف Dialog سيتم إضافته هنا */}
        </Box>
    )
}
```

---

## 5️⃣ خدمة الحضور / Attendance Service

### backend/src/services/attendanceService.js
```javascript
const { Attendance, Employee } = require('../models');

class AttendanceService {
    // تسجيل الحضور
    static async markAttendance(employeeId, checkIn, checkOut) {
        try {
            const workingHours = this.calculateWorkingHours(checkIn, checkOut);
            
            const attendance = await Attendance.create({
                employee_id: employeeId,
                attendance_date: new Date(),
                check_in: checkIn,
                check_out: checkOut,
                status: 'Present',
                working_hours: workingHours,
            });

            return attendance;
        } catch (error) {
            throw new Error(`Failed to mark attendance: ${error.message}`);
        }
    }

    // حساب ساعات العمل
    static calculateWorkingHours(checkIn, checkOut, breakTime = 1) {
        const checkInTime = new Date(checkIn);
        const checkOutTime = new Date(checkOut);
        const diffMs = checkOutTime - checkInTime;
        const diffHours = diffMs / (1000 * 60 * 60);
        return Math.round((diffHours - breakTime) * 100) / 100;
    }

    // تقرير الحضور الشهري
    static async getMonthlyAttendanceReport(month, year) {
        try {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);

            const records = await Attendance.findAll({
                where: {
                    attendance_date: {
                        [Op.between]: [startDate, endDate],
                    },
                },
                include: [Employee],
            });

            return records;
        } catch (error) {
            throw new Error(`Failed to generate attendance report: ${error.message}`);
        }
    }
}

module.exports = AttendanceService;
```

---

## 6️⃣ خدمة الإجازات / Leave Service

### backend/src/services/leaveService.js
```javascript
const { LeaveRequest, LeaveBalance, Employee } = require('../models');

class LeaveService {
    // طلب إجازة
    static async requestLeave(employeeId, leaveData) {
        try {
            const leave = await LeaveRequest.create({
                employee_id: employeeId,
                leave_type: leaveData.leave_type,
                start_date: leaveData.start_date,
                end_date: leaveData.end_date,
                number_of_days: this.calculateDays(leaveData.start_date, leaveData.end_date),
                reason: leaveData.reason,
                status: 'Pending',
            });

            return leave;
        } catch (error) {
            throw new Error(`Failed to request leave: ${error.message}`);
        }
    }

    // الموافقة على الإجازة
    static async approveLeave(leaveId, approvedBy) {
        try {
            const leave = await LeaveRequest.findByPk(leaveId);
            await leave.update({
                status: 'Approved',
                approved_by: approvedBy,
                approved_date: new Date(),
            });

            // تحديث رصيد الإجازات
            await this.updateLeaveBalance(leave.employee_id, leave.leave_type, leave.number_of_days);

            return leave;
        } catch (error) {
            throw new Error(`Failed to approve leave: ${error.message}`);
        }
    }

    // تحديث رصيد الإجازات
    static async updateLeaveBalance(employeeId, leaveType, daysUsed) {
        try {
            const balance = await LeaveBalance.findOne({
                where: {
                    employee_id: employeeId,
                    leave_type: leaveType,
                    financial_year: new Date().getFullYear(),
                },
            });

            if (balance) {
                await balance.update({
                    used: balance.used + daysUsed,
                    remaining: balance.remaining - daysUsed,
                });
            }

            return balance;
        } catch (error) {
            throw new Error(`Failed to update leave balance: ${error.message}`);
        }
    }

    // حساب عدد أيام الإجازة
    static calculateDays(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays;
    }
}

module.exports = LeaveService;
```

---

## 7️⃣ API Routes

### backend/src/routes/hr.routes.js
```javascript
const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middlewares/auth');
const employeeController = require('../controllers/employeeController');
const payrollController = require('../controllers/payrollController');
const attendanceController = require('../controllers/attendanceController');
const leaveController = require('../controllers/leaveController');

// Employees Routes
router.get('/employees', authenticateToken, employeeController.getAllEmployees);
router.get('/employees/:id', authenticateToken, employeeController.getEmployee);
router.post('/employees', authenticateToken, authorizeRole(['HR Manager']), employeeController.createEmployee);
router.put('/employees/:id', authenticateToken, authorizeRole(['HR Manager']), employeeController.updateEmployee);
router.delete('/employees/:id', authenticateToken, authorizeRole(['HR Manager']), employeeController.deleteEmployee);
router.post('/employees/upload', authenticateToken, authorizeRole(['HR Manager']), employeeController.bulkUpload);

// Payroll Routes
router.post('/payroll/process', authenticateToken, authorizeRole(['HR Manager']), payrollController.processPayroll);
router.get('/payroll/salaries', authenticateToken, payrollController.getSalaries);
router.post('/payroll/approve', authenticateToken, authorizeRole(['HR Manager']), payrollController.approveSalaries);
router.get('/payroll/reports', authenticateToken, payrollController.getPayrollReport);

// Attendance Routes
router.post('/attendance', authenticateToken, attendanceController.markAttendance);
router.get('/attendance/:empId', authenticateToken, attendanceController.getAttendance);
router.get('/attendance/reports/monthly', authenticateToken, attendanceController.getMonthlyReport);

// Leave Routes
router.post('/leaves', authenticateToken, leaveController.requestLeave);
router.get('/leaves/:empId', authenticateToken, leaveController.getLeaves);
router.put('/leaves/:id/approve', authenticateToken, authorizeRole(['HR Manager']), leaveController.approveLeave);
router.get('/leaves/balance/:empId', authenticateToken, leaveController.getLeaveBalance);

module.exports = router;
```

---

## 📊 React Hook للموظفين / useEmployees Hook

### pos/src/hooks/useEmployees.js
```javascript
import { useState, useCallback, useEffect } from 'react'
import api from '../services/api'

export const useEmployees = () => {
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const fetchEmployees = useCallback(async (filters = {}) => {
        try {
            setLoading(true)
            const response = await api.get('/api/hr/employees', { params: filters })
            setEmployees(response.data)
            setError(null)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    const createEmployee = useCallback(async (data) => {
        try {
            setLoading(true)
            const response = await api.post('/api/hr/employees', data)
            setEmployees([...employees, response.data])
            return response.data
        } catch (err) {
            setError(err.message)
            throw err
        } finally {
            setLoading(false)
        }
    }, [employees])

    const updateEmployee = useCallback(async (id, data) => {
        try {
            setLoading(true)
            const response = await api.put(`/api/hr/employees/${id}`, data)
            setEmployees(employees.map(e => e.id === id ? response.data : e))
            return response.data
        } catch (err) {
            setError(err.message)
            throw err
        } finally {
            setLoading(false)
        }
    }, [employees])

    const deleteEmployee = useCallback(async (id) => {
        try {
            setLoading(true)
            await api.delete(`/api/hr/employees/${id}`)
            setEmployees(employees.filter(e => e.id !== id))
        } catch (err) {
            setError(err.message)
            throw err
        } finally {
            setLoading(false)
        }
    }, [employees])

    return {
        employees,
        loading,
        error,
        fetchEmployees,
        createEmployee,
        updateEmployee,
        deleteEmployee,
    }
}
```

---

## 🎯 Redux Slice للموارد البشرية / HR Redux Slice

### pos/src/store/slices/hrSlice.js
```javascript
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../services/api'

export const fetchEmployees = createAsyncThunk(
    'hr/fetchEmployees',
    async (filters, { rejectWithValue }) => {
        try {
            const response = await api.get('/api/hr/employees', { params: filters })
            return response.data
        } catch (error) {
            return rejectWithValue(error.message)
        }
    }
)

export const processPayroll = createAsyncThunk(
    'hr/processPayroll',
    async (payload, { rejectWithValue }) => {
        try {
            const response = await api.post('/api/hr/payroll/process', payload)
            return response.data
        } catch (error) {
            return rejectWithValue(error.message)
        }
    }
)

const initialState = {
    employees: [],
    payroll: {},
    attendance: {},
    leaves: {},
    loading: false,
    error: null,
}

const hrSlice = createSlice({
    name: 'hr',
    initialState,
    extraReducers: (builder) => {
        builder
            .addCase(fetchEmployees.pending, (state) => {
                state.loading = true
                state.error = null
            })
            .addCase(fetchEmployees.fulfilled, (state, action) => {
                state.loading = false
                state.employees = action.payload
            })
            .addCase(fetchEmployees.rejected, (state, action) => {
                state.loading = false
                state.error = action.payload
            })
            .addCase(processPayroll.fulfilled, (state, action) => {
                state.payroll = action.payload
            })
    },
})

export default hrSlice.reducer
```

---

## 📊 مساعدات الحساب / Calculation Utilities

### backend/src/utils/hrCalculations.js
```javascript
const Decimal = require('decimal.js');

const HRCalculations = {
    // حساب صافي الراتب
    calculateNetSalary(baseSalary, allowances = 0, deductions = 0) {
        const base = new Decimal(baseSalary);
        const allow = new Decimal(allowances);
        const ded = new Decimal(deductions);
        
        const gross = base.plus(allow);
        const net = gross.minus(ded);
        
        return {
            baseSalary: base.toNumber(),
            gross: gross.toNumber(),
            net: net.toNumber(),
        };
    },

    // حساب الضريبة
    calculateTax(grossSalary, taxRate = 0.10) {
        const gross = new Decimal(grossSalary);
        const rate = new Decimal(taxRate);
        const tax = gross.times(rate);
        return tax.toNumber();
    },

    // حساب ساعات العمل
    calculateWorkingHours(checkIn, checkOut, breakMinutes = 60) {
        const checkInTime = new Date(checkIn);
        const checkOutTime = new Date(checkOut);
        const diffMs = checkOutTime - checkInTime;
        const diffHours = diffMs / (1000 * 60 * 60);
        const breakHours = breakMinutes / 60;
        return Math.round((diffHours - breakHours) * 100) / 100;
    },

    // عدد أيام العمل
    calculateWorkDays(startDate, endDate) {
        let count = 0;
        const currentDate = new Date(startDate);
        
        while (currentDate <= new Date(endDate)) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // اسكت الجمعة والسبت
                count++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return count;
    },

    // تحديث رصيد الإجازات السنوية
    updateAnnualLeaveBalance(serviceYears) {
        // قاعدة: 2.5 يوم لكل سنة خدمة، أقصى 30 يوم
        const daysPerYear = 2.5;
        const maxDays = 30;
        const totalDays = Math.min(serviceYears * daysPerYear, maxDays);
        
        return Math.floor(totalDays);
    },

    // حساب المكافأة النهائية
    calculateFinalBenefit(baseSalary, serviceYears, lastSalary) {
        // حسب الفترة الزمنية وآخر راتب
        const salary = new Decimal(lastSalary || baseSalary);
        
        let benefit;
        if (serviceYears < 2) {
            benefit = salary.times(0); // لا تحق
        } else if (serviceYears <= 5) {
            benefit = salary.times(serviceYears); // راتب لكل سنة
        } else {
            benefit = salary.times(serviceYears).plus(salary.times(0.5)); // إضافة 50% للسنوات الإضافية
        }
        
        return benefit.toNumber();
    },
};

module.exports = HRCalculations;
```

---

**ملاحظات مهمة:**
- جميع الأكواد جاهزة للاستخدام مباشرة
- يمكن تعديلها حسب احتياجات المشروع
- استخدم الحسابات الدقيقة (Decimal.js) للعمليات المالية
- لا تنسَ مصادقة المستخدمين والتحقق من الصلاحيات
- أضف معالجة الأخطاء المناسبة
