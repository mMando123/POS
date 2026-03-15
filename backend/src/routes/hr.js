const express = require('express')
const { Op, fn, col } = require('sequelize')
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const {
    sequelize,
    Branch,
    Department,
    Designation,
    Employee,
    User,
    DeliveryPersonnel,
    EmployeeSalary,
    SalaryComponent,
    HRAttendance,
    LeaveRequest,
    LeaveBalance,
    PerformanceReview,
    TrainingProgram
} = require('../models')

const router = express.Router()

const LEAVE_TYPES = ['annual', 'sick', 'unpaid', 'maternity', 'compassionate']
const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'half_day', 'leave']
const PAYROLL_APPROVABLE_STATUSES = ['draft', 'processing']
const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

const ensureValidRequest = (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() })
        return false
    }
    return true
}

const normalizePagination = (query) => {
    const page = Math.max(parseInt(query.page || 1, 10), 1)
    const limit = Math.min(Math.max(parseInt(query.limit || 50, 10), 1), 200)
    return { page, limit, offset: (page - 1) * limit }
}

const getBranchScope = (req) => {
    if (req.user.role === 'admin') return null
    return req.user.branchId || null
}

const getScopedEmployee = async (req, employeeId, queryOptions = {}) => {
    const branchId = getBranchScope(req)
    const where = { id: employeeId }
    if (branchId) where.branch_id = branchId
    return Employee.findOne({ where, ...queryOptions })
}

const buildPaginationMeta = (count, page, limit) => ({
    total: count,
    page,
    limit,
    pages: Math.ceil(count / limit)
})

const sendPaginatedResponse = (res, rows, count, page, limit) => {
    res.json({
        data: rows,
        pagination: buildPaginationMeta(count, page, limit)
    })
}

const computeWorkingHours = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 0
    const start = new Date(`1970-01-01T${checkIn}`)
    const end = new Date(`1970-01-01T${checkOut}`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    return Math.round(diff * 100) / 100
}

const getLeaveRemaining = (opening, allocated, used, carriedForward) => {
    return Number(opening || 0) + Number(allocated || 0) + Number(carriedForward || 0) - Number(used || 0)
}

const getMonthlyPeriod = (period) => {
    const date = period ? new Date(`${period}-01`) : new Date()
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 7)
}

const getPeriodDateRange = (period) => {
    const normalized = getMonthlyPeriod(period)
    if (!normalized) return null

    const start = new Date(`${normalized}-01T00:00:00.000Z`)
    if (Number.isNaN(start.getTime())) return null

    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)

    return {
        period: normalized,
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10)
    }
}

// ==================== DASHBOARD ====================

router.get('/dashboard', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const employeeWhere = {}
        if (branchId) employeeWhere.branch_id = branchId

        const attendanceDate = req.query.date || new Date().toISOString().slice(0, 10)
        const payrollRange = getPeriodDateRange(req.query.period)
        const payrollWhere = {}
        if (payrollRange) {
            payrollWhere.salary_period = {
                [Op.gte]: payrollRange.from,
                [Op.lt]: payrollRange.to
            }
        }

        const [totalEmployees, activeEmployees, departmentsCount, pendingLeaves, monthlyPayroll, attendanceSummary] = await Promise.all([
            Employee.count({ where: employeeWhere }),
            Employee.count({ where: { ...employeeWhere, status: 'active' } }),
            Department.count({ where: branchId ? { branch_id: branchId } : {} }),
            LeaveRequest.count({ where: { ...(branchId ? { branch_id: branchId } : {}), status: 'pending' } }),
            EmployeeSalary.sum('net_salary', {
                where: payrollWhere,
                include: branchId ? [{
                    model: Employee,
                    as: 'employee',
                    required: true,
                    where: { branch_id: branchId },
                    attributes: []
                }] : undefined
            }),
            HRAttendance.findAll({
                attributes: ['status', [fn('COUNT', col('id')), 'count']],
                where: {
                    ...(branchId ? { branch_id: branchId } : {}),
                    attendance_date: attendanceDate
                },
                group: ['status']
            })
        ])

        const attendance = { present: 0, absent: 0, late: 0, half_day: 0, leave: 0 }
        attendanceSummary.forEach((row) => {
            const key = row.get('status')
            attendance[key] = parseInt(row.get('count'), 10)
        })

        res.json({
            data: {
                totals: {
                    employees: totalEmployees,
                    active_employees: activeEmployees,
                    departments: departmentsCount,
                    pending_leaves: pendingLeaves
                },
                payroll: {
                    period: payrollRange?.period || null,
                    net_total: Number(monthlyPayroll || 0)
                },
                attendance
            }
        })
    } catch (error) {
        console.error('HR dashboard error:', error)
        res.status(500).json({ message: 'خطأ في جلب لوحة موارد بشرية' })
    }
})

// ==================== DEPARTMENTS ====================

router.get('/departments', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const { page, limit, offset } = normalizePagination(req.query)
        const where = {}
        if (branchId) where.branch_id = branchId
        if (req.query.status) where.status = req.query.status
        if (req.query.search) {
            where[Op.or] = [
                { code: { [Op.like]: `%${req.query.search}%` } },
                { name_ar: { [Op.like]: `%${req.query.search}%` } },
                { name_en: { [Op.like]: `%${req.query.search}%` } }
            ]
        }

        const { count, rows } = await Department.findAndCountAll({
            where,
            include: [{ model: Employee, as: 'manager', attributes: ['id', 'employee_code', 'first_name_ar', 'last_name_ar'] }],
            order: [['name_ar', 'ASC']],
            limit,
            offset
        })

        sendPaginatedResponse(res, rows, count, page, limit)
    } catch (error) {
        console.error('Get departments error:', error)
        res.status(500).json({ message: 'خطأ في جلب الأقسام' })
    }
})

router.post(
    '/departments',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('name_ar').notEmpty().withMessage('اسم القسم بالعربية مطلوب'),
        body('code').optional().trim(),
        body('budget').optional().isFloat({ min: 0 }).withMessage('الميزانية يجب أن تكون رقم موجب')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        const t = await sequelize.transaction()
        try {
            const branchId = getBranchScope(req) || req.body.branch_id || req.user.branchId || null
            const code = req.body.code?.trim() || `DEP-${Date.now().toString().slice(-6)}`

            const department = await Department.create({
                code,
                name_ar: req.body.name_ar,
                name_en: req.body.name_en || null,
                description: req.body.description || null,
                manager_id: req.body.manager_id || null,
                branch_id: branchId,
                budget: req.body.budget || 0,
                status: req.body.status || 'active',
                created_by: req.user.userId
            }, { transaction: t })

            await t.commit()
            res.status(201).json({ message: 'تم إنشاء القسم بنجاح', data: department })
        } catch (error) {
            await t.rollback()
            console.error('Create department error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إنشاء القسم' })
        }
    }
)

// ==================== EMPLOYEES ====================

router.get('/employees', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const { page, limit, offset } = normalizePagination(req.query)
        const where = {}
        if (branchId) where.branch_id = branchId
        if (req.query.status) where.status = req.query.status
        if (req.query.department_id) where.department_id = req.query.department_id
        if (req.query.designation_id) where.designation_id = req.query.designation_id
        if (req.query.search) {
            where[Op.or] = [
                { employee_code: { [Op.like]: `%${req.query.search}%` } },
                { first_name_ar: { [Op.like]: `%${req.query.search}%` } },
                { last_name_ar: { [Op.like]: `%${req.query.search}%` } },
                { phone: { [Op.like]: `%${req.query.search}%` } },
                { email: { [Op.like]: `%${req.query.search}%` } }
            ]
        }

        const { count, rows } = await Employee.findAndCountAll({
            where,
            include: [
                { model: Department, as: 'department', attributes: ['id', 'name_ar'] },
                { model: Designation, as: 'designation', attributes: ['id', 'title_ar'] },
                { model: Branch, as: 'branch', attributes: ['id', 'name_ar'] },
                { model: User, as: 'userAccount', attributes: ['id', 'username', 'name_ar', 'role'], required: false },
                { model: DeliveryPersonnel, as: 'deliveryProfile', attributes: ['id', 'phone', 'vehicle_type', 'status'], required: false }
            ],
            order: [['created_at', 'DESC']],
            limit,
            offset
        })

        sendPaginatedResponse(res, rows, count, page, limit)
    } catch (error) {
        console.error('Get employees error:', error)
        res.status(500).json({ message: 'خطأ في جلب الموظفين' })
    }
})

router.get('/employees/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const employee = await Employee.findOne({
            where: { id: req.params.id, ...(branchId ? { branch_id: branchId } : {}) },
            include: [
                { model: Department, as: 'department', attributes: ['id', 'name_ar', 'code'] },
                { model: Designation, as: 'designation', attributes: ['id', 'title_ar', 'code'] },
                { model: Branch, as: 'branch', attributes: ['id', 'name_ar'] },
                { model: LeaveBalance, as: 'leaveBalances' }
            ]
        })
        if (!employee) return res.status(404).json({ message: 'الموظف غير موجود' })

        res.json({ data: employee })
    } catch (error) {
        console.error('Get employee error:', error)
        res.status(500).json({ message: 'خطأ في جلب بيانات الموظف' })
    }
})

router.post(
    '/employees',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('first_name_ar').notEmpty().withMessage('الاسم الأول بالعربية مطلوب'),
        body('last_name_ar').notEmpty().withMessage('اسم العائلة بالعربية مطلوب'),
        body('date_of_joining').notEmpty().withMessage('تاريخ التعيين مطلوب'),
        body('email').optional({ checkFalsy: true }).isEmail().withMessage('البريد الإلكتروني غير صحيح')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const branchId = getBranchScope(req) || req.body.branch_id || req.user.branchId || null
            const employeeCode = req.body.employee_code?.trim() || `EMP-${Date.now().toString().slice(-8)}`

            const employee = await Employee.create({
                employee_code: employeeCode,
                first_name_ar: req.body.first_name_ar,
                last_name_ar: req.body.last_name_ar,
                first_name_en: req.body.first_name_en || null,
                last_name_en: req.body.last_name_en || null,
                email: req.body.email || null,
                phone: req.body.phone || null,
                date_of_birth: req.body.date_of_birth || null,
                gender: req.body.gender || null,
                branch_id: branchId,
                department_id: req.body.department_id || null,
                designation_id: req.body.designation_id || null,
                employment_type: req.body.employment_type || 'full_time',
                date_of_joining: req.body.date_of_joining,
                date_of_leaving: req.body.date_of_leaving || null,
                status: req.body.status || 'active',
                address_ar: req.body.address_ar || null,
                address_en: req.body.address_en || null,
                city: req.body.city || null,
                state: req.body.state || null,
                country: req.body.country || null,
                postal_code: req.body.postal_code || null,
                bank_name: req.body.bank_name || null,
                account_number: req.body.account_number || null,
                iban: req.body.iban || null,
                user_id: req.body.user_id || null,
                created_by: req.user.userId
            })

            if (req.body.base_salary && Number(req.body.base_salary) > 0) {
                await EmployeeSalary.create({
                    employee_id: employee.id,
                    salary_period: new Date(),
                    base_salary: Number(req.body.base_salary),
                    gross_salary: Number(req.body.base_salary),
                    net_salary: Number(req.body.base_salary),
                    status: 'approved',
                    approved_by: req.user.userId,
                    approved_date: new Date(),
                    created_by: req.user.userId,
                    notes: 'تهيئة راتب أساسي عند إنشاء الموظف'
                })
            }

            if (req.body.is_delivery) {
                await DeliveryPersonnel.create({
                    name_ar: `${req.body.first_name_ar} ${req.body.last_name_ar}`,
                    name_en: req.body.first_name_en ? `${req.body.first_name_en} ${req.body.last_name_en || ''}`.trim() : null,
                    phone: req.body.phone || '00000000',
                    branch_id: branchId,
                    employee_id: employee.id,
                    vehicle_type: 'motorcycle',
                    is_active: true
                })
            }

            res.status(201).json({ message: 'تم إنشاء الموظف بنجاح', data: employee })
        } catch (error) {
            console.error('Create employee error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إنشاء الموظف' })
        }
    }
)

router.put(
    '/employees/:id',
    authenticate,
    authorize('admin', 'manager'),
    [body('email').optional({ checkFalsy: true }).isEmail().withMessage('البريد الإلكتروني غير صحيح')],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const branchId = getBranchScope(req)
            const where = { id: req.params.id }
            if (branchId) where.branch_id = branchId

            const employee = await Employee.findOne({
                where,
                include: [{ model: DeliveryPersonnel, as: 'deliveryProfile' }]
            })
            if (!employee) return res.status(404).json({ message: 'الموظف غير موجود' })

            const updates = { ...req.body }
            delete updates.id
            delete updates.employee_code
            delete updates.created_by
            delete updates.branch_id
            delete updates.is_delivery

            await employee.update(updates)

            if (req.body.is_delivery !== undefined) {
                if (req.body.is_delivery && !employee.deliveryProfile) {
                    await DeliveryPersonnel.create({
                        name_ar: `${updates.first_name_ar || employee.first_name_ar} ${updates.last_name_ar || employee.last_name_ar}`,
                        name_en: updates.first_name_en || employee.first_name_en ? `${updates.first_name_en || employee.first_name_en} ${updates.last_name_en || employee.last_name_en || ''}`.trim() : null,
                        phone: updates.phone || employee.phone || '00000000',
                        branch_id: employee.branch_id,
                        employee_id: employee.id,
                        vehicle_type: 'motorcycle',
                        is_active: true
                    })
                } else if (!req.body.is_delivery && employee.deliveryProfile) {
                    await employee.deliveryProfile.update({ is_active: false })
                } else if (req.body.is_delivery && employee.deliveryProfile) {
                    await employee.deliveryProfile.update({ is_active: true })
                }
            }

            res.json({ message: 'تم تحديث بيانات الموظف', data: employee })
        } catch (error) {
            console.error('Update employee error:', error)
            res.status(500).json({ message: error.message || 'خطأ في تحديث الموظف' })
        }
    }
)

router.delete('/employees/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const where = { id: req.params.id }
        if (branchId) where.branch_id = branchId

        const employee = await Employee.findOne({ where })
        if (!employee) return res.status(404).json({ message: 'الموظف غير موجود' })

        await employee.update({
            status: 'inactive',
            date_of_leaving: employee.date_of_leaving || new Date()
        })
        res.json({ message: 'تم تعطيل الموظف بنجاح' })
    } catch (error) {
        console.error('Deactivate employee error:', error)
        res.status(500).json({ message: error.message || 'خطأ في تعطيل الموظف' })
    }
})

// ==================== ATTENDANCE ====================

router.post(
    '/attendance',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('employee_id').notEmpty().withMessage('الموظف مطلوب'),
        body('attendance_date').isISO8601().withMessage('تاريخ الحضور مطلوب'),
        body('check_in').optional({ checkFalsy: true }).matches(TIME_24H_REGEX).withMessage('صيغة check_in غير صحيحة'),
        body('check_out').optional({ checkFalsy: true }).matches(TIME_24H_REGEX).withMessage('صيغة check_out غير صحيحة'),
        body('status').optional().isIn(ATTENDANCE_STATUSES).withMessage('حالة الحضور غير صحيحة')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        const t = await sequelize.transaction()
        try {
            const employee = await getScopedEmployee(req, req.body.employee_id, { transaction: t })
            if (!employee) {
                await t.rollback()
                return res.status(404).json({ message: 'الموظف غير موجود' })
            }

            const scopedBranchId = getBranchScope(req)

            const branchId = scopedBranchId || employee.branch_id || req.user.branchId || null
            const workingHours = req.body.working_hours ?? computeWorkingHours(req.body.check_in, req.body.check_out)

            const [attendance, created] = await HRAttendance.findOrCreate({
                where: {
                    employee_id: req.body.employee_id,
                    attendance_date: req.body.attendance_date
                },
                defaults: {
                    branch_id: branchId,
                    check_in: req.body.check_in || null,
                    check_out: req.body.check_out || null,
                    status: req.body.status || 'present',
                    working_hours: workingHours,
                    notes: req.body.notes || null,
                    recorded_by: req.user.userId
                },
                transaction: t
            })

            if (!created) {
                await attendance.update({
                    check_in: req.body.check_in ?? attendance.check_in,
                    check_out: req.body.check_out ?? attendance.check_out,
                    status: req.body.status ?? attendance.status,
                    working_hours: workingHours,
                    notes: req.body.notes ?? attendance.notes,
                    recorded_by: req.user.userId
                }, { transaction: t })
            }

            await t.commit()
            res.status(created ? 201 : 200).json({
                message: created ? 'تم تسجيل الحضور' : 'تم تحديث الحضور',
                data: attendance
            })
        } catch (error) {
            await t.rollback()
            console.error('Mark attendance error:', error)
            res.status(500).json({ message: error.message || 'خطأ في تسجيل الحضور' })
        }
    }
)

router.post('/attendance/bulk', authenticate, authorize('admin', 'manager'), async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : []
    if (!rows.length) return res.status(400).json({ message: 'rows مطلوبة وبصيغة Array' })

    const t = await sequelize.transaction()
    try {
        const scopedBranchId = getBranchScope(req)
        let allowedEmployeeIds = null
        if (scopedBranchId) {
            const employeeIds = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))]
            const employees = await Employee.findAll({
                where: { id: { [Op.in]: employeeIds }, branch_id: scopedBranchId },
                attributes: ['id'],
                transaction: t
            })
            allowedEmployeeIds = new Set(employees.map((emp) => emp.id))
        }

        let upserted = 0
        for (const row of rows) {
            if (!row.employee_id || !row.attendance_date) continue
            if (allowedEmployeeIds && !allowedEmployeeIds.has(row.employee_id)) continue
            const workingHours = row.working_hours ?? computeWorkingHours(row.check_in, row.check_out)
            const [attendance, created] = await HRAttendance.findOrCreate({
                where: {
                    employee_id: row.employee_id,
                    attendance_date: row.attendance_date
                },
                defaults: {
                    branch_id: scopedBranchId || req.user.branchId || null,
                    check_in: row.check_in || null,
                    check_out: row.check_out || null,
                    status: row.status || 'present',
                    working_hours: workingHours,
                    notes: row.notes || null,
                    recorded_by: req.user.userId
                },
                transaction: t
            })

            if (!created) {
                await attendance.update({
                    check_in: row.check_in ?? attendance.check_in,
                    check_out: row.check_out ?? attendance.check_out,
                    status: row.status ?? attendance.status,
                    working_hours: workingHours,
                    notes: row.notes ?? attendance.notes,
                    recorded_by: req.user.userId
                }, { transaction: t })
            }
            upserted += 1
        }

        await t.commit()
        res.json({ message: 'تم تسجيل الحضور الجماعي بنجاح', data: { upserted } })
    } catch (error) {
        await t.rollback()
        console.error('Bulk attendance error:', error)
        res.status(500).json({ message: error.message || 'خطأ في الحضور الجماعي' })
    }
})

router.get('/attendance/:empId', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const employee = await getScopedEmployee(req, req.params.empId, { attributes: ['id'] })
        if (!employee) return res.status(404).json({ message: 'الموظف غير موجود' })

        const where = { employee_id: req.params.empId }
        if (branchId) where.branch_id = branchId
        if (req.query.from_date || req.query.to_date) {
            where.attendance_date = {}
            if (req.query.from_date) where.attendance_date[Op.gte] = req.query.from_date
            if (req.query.to_date) where.attendance_date[Op.lte] = req.query.to_date
        }

        const rows = await HRAttendance.findAll({
            where,
            order: [['attendance_date', 'DESC']]
        })
        res.json({ data: rows })
    } catch (error) {
        console.error('Get attendance error:', error)
        res.status(500).json({ message: 'خطأ في جلب الحضور' })
    }
})

router.put(
    '/attendance/:id',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('check_in').optional({ checkFalsy: true }).matches(TIME_24H_REGEX).withMessage('صيغة check_in غير صحيحة'),
        body('check_out').optional({ checkFalsy: true }).matches(TIME_24H_REGEX).withMessage('صيغة check_out غير صحيحة'),
        body('status').optional().isIn(ATTENDANCE_STATUSES).withMessage('حالة الحضور غير صحيحة')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const branchId = getBranchScope(req)
            const where = { id: req.params.id }
            if (branchId) where.branch_id = branchId

            let row = await HRAttendance.findOne({ where })
            if (!row && branchId) {
                row = await HRAttendance.findOne({
                    where: { id: req.params.id },
                    include: [{ model: Employee, as: 'employee', required: true, where: { branch_id: branchId }, attributes: ['id'] }]
                })
            }
            if (!row) return res.status(404).json({ message: 'سجل الحضور غير موجود' })

            const workingHours = req.body.working_hours ?? computeWorkingHours(req.body.check_in || row.check_in, req.body.check_out || row.check_out)
            await row.update({
                check_in: req.body.check_in ?? row.check_in,
                check_out: req.body.check_out ?? row.check_out,
                status: req.body.status ?? row.status,
                working_hours: workingHours,
                notes: req.body.notes ?? row.notes,
                recorded_by: req.user.userId
            })

            res.json({ message: 'تم تحديث الحضور', data: row })
        } catch (error) {
            console.error('Update attendance error:', error)
            res.status(500).json({ message: 'خطأ في تحديث الحضور' })
        }
    }
)

router.get('/attendance/reports/summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const where = {}
        if (branchId) where.branch_id = branchId
        if (req.query.from_date || req.query.to_date) {
            where.attendance_date = {}
            if (req.query.from_date) where.attendance_date[Op.gte] = req.query.from_date
            if (req.query.to_date) where.attendance_date[Op.lte] = req.query.to_date
        }

        const rows = await HRAttendance.findAll({
            attributes: ['status', [fn('COUNT', col('id')), 'count']],
            where,
            group: ['status']
        })

        res.json({ data: rows })
    } catch (error) {
        console.error('Attendance report error:', error)
        res.status(500).json({ message: 'خطأ في تقرير الحضور' })
    }
})

// ==================== LEAVES ====================

router.post(
    '/leaves',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('employee_id').notEmpty().withMessage('الموظف مطلوب'),
        body('leave_type').isIn(LEAVE_TYPES).withMessage('نوع الإجازة غير صحيح'),
        body('start_date').isISO8601().withMessage('تاريخ البداية مطلوب'),
        body('end_date')
            .isISO8601().withMessage('تاريخ النهاية مطلوب')
            .custom((endDate, { req }) => new Date(endDate) >= new Date(req.body.start_date))
            .withMessage('تاريخ النهاية يجب أن يكون بعد أو يساوي تاريخ البداية'),
        body('number_of_days').optional().isFloat({ min: 0.5 }).withMessage('number_of_days يجب أن يكون رقمًا أكبر من صفر')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const start = new Date(req.body.start_date)
            const end = new Date(req.body.end_date)
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
                return res.status(400).json({ message: 'تواريخ الإجازة غير صحيحة' })
            }
            const diffDays = Math.max(Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1, 1)

            const employee = await getScopedEmployee(req, req.body.employee_id)
            if (!employee) return res.status(404).json({ message: 'الموظف غير موجود' })

            const scopedBranchId = getBranchScope(req)

            const leave = await LeaveRequest.create({
                employee_id: req.body.employee_id,
                branch_id: scopedBranchId || employee.branch_id || req.user.branchId || null,
                leave_type: req.body.leave_type,
                start_date: req.body.start_date,
                end_date: req.body.end_date,
                number_of_days: req.body.number_of_days || diffDays,
                reason: req.body.reason || null,
                status: req.body.status || 'pending',
                notes: req.body.notes || null,
                created_by: req.user.userId
            })
            res.status(201).json({ message: 'تم إنشاء طلب الإجازة', data: leave })
        } catch (error) {
            console.error('Create leave error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إنشاء طلب الإجازة' })
        }
    }
)

router.get('/leaves/:empId', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const employee = await getScopedEmployee(req, req.params.empId, { attributes: ['id'] })
        if (!employee) return res.status(404).json({ message: 'الموظف غير موجود' })

        const where = { employee_id: req.params.empId }
        if (branchId) where.branch_id = branchId
        if (req.query.status) where.status = req.query.status
        const rows = await LeaveRequest.findAll({
            where,
            order: [['created_at', 'DESC']]
        })
        res.json({ data: rows })
    } catch (error) {
        console.error('Get leaves error:', error)
        res.status(500).json({ message: 'خطأ في جلب الإجازات' })
    }
})

router.put(
    '/leaves/:id',
    authenticate,
    authorize('admin', 'manager'),
    [body('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']).withMessage('حالة الإجازة غير صحيحة')],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return

        const t = await sequelize.transaction()
        try {
            const branchId = getBranchScope(req)
            const where = { id: req.params.id }
            if (branchId) where.branch_id = branchId

            let leave = await LeaveRequest.findOne({ where, transaction: t })
            if (!leave && branchId) {
                leave = await LeaveRequest.findOne({
                    where: { id: req.params.id },
                    include: [{ model: Employee, as: 'employee', required: true, where: { branch_id: branchId }, attributes: ['id'] }],
                    transaction: t
                })
            }

            if (!leave) {
                await t.rollback()
                return res.status(404).json({ message: 'طلب الإجازة غير موجود' })
            }

            const previousStatus = leave.status
            const nextStatus = req.body.status ?? leave.status
            await leave.update({
                status: nextStatus,
                notes: req.body.notes ?? leave.notes,
                approved_by: nextStatus === 'approved' ? req.user.userId : leave.approved_by,
                approved_date: nextStatus === 'approved' ? new Date() : leave.approved_date
            }, { transaction: t })

            if (previousStatus !== nextStatus && ['approved', 'rejected', 'cancelled', 'pending'].includes(nextStatus)) {
                const year = new Date(leave.start_date).getFullYear()
                const [balance] = await LeaveBalance.findOrCreate({
                    where: {
                        employee_id: leave.employee_id,
                        leave_type: leave.leave_type,
                        financial_year: year
                    },
                    defaults: {
                        opening_balance: 0,
                        allocated: 0,
                        used: 0,
                        remaining: 0,
                        carried_forward: 0
                    },
                    transaction: t
                })

                let used = Number(balance.used || 0)
                if (previousStatus !== 'approved' && nextStatus === 'approved') {
                    used += Number(leave.number_of_days || 0)
                }
                if (previousStatus === 'approved' && nextStatus !== 'approved') {
                    used = Math.max(used - Number(leave.number_of_days || 0), 0)
                }

                const remaining = getLeaveRemaining(balance.opening_balance, balance.allocated, used, balance.carried_forward)
                await balance.update({ used, remaining }, { transaction: t })
            }

            await t.commit()
            res.json({ message: 'تم تحديث طلب الإجازة', data: leave })
        } catch (error) {
            await t.rollback()
            console.error('Update leave error:', error)
            res.status(500).json({ message: error.message || 'خطأ في تحديث الإجازة' })
        }
    }
)

router.get('/leaves/balance/:empId', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const employee = await getScopedEmployee(req, req.params.empId, { attributes: ['id'] })
        if (!employee) return res.status(404).json({ message: 'الموظف غير موجود' })

        const where = { employee_id: req.params.empId }
        if (req.query.year) where.financial_year = parseInt(req.query.year, 10)
        const rows = await LeaveBalance.findAll({ where, order: [['financial_year', 'DESC']] })
        res.json({ data: rows })
    } catch (error) {
        console.error('Get leave balance error:', error)
        res.status(500).json({ message: 'خطأ في جلب رصيد الإجازات' })
    }
})

router.put(
    '/leaves/balance/:id',
    authenticate,
    authorize('admin', 'manager'),
    [body('used').optional().isFloat({ min: 0 }).withMessage('used يجب أن يكون رقمًا موجبًا')],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const branchId = getBranchScope(req)
            let balance
            if (branchId) {
                balance = await LeaveBalance.findOne({
                    where: { id: req.params.id },
                    include: [{ model: Employee, as: 'employee', required: true, where: { branch_id: branchId }, attributes: ['id'] }]
                })
            } else {
                balance = await LeaveBalance.findByPk(req.params.id)
            }

            if (!balance) return res.status(404).json({ message: 'رصيد الإجازة غير موجود' })

            const opening = req.body.opening_balance ?? balance.opening_balance
            const allocated = req.body.allocated ?? balance.allocated
            const used = req.body.used ?? balance.used
            const carriedForward = req.body.carried_forward ?? balance.carried_forward
            const remaining = getLeaveRemaining(opening, allocated, used, carriedForward)

            await balance.update({
                opening_balance: opening,
                allocated,
                used,
                carried_forward: carriedForward,
                remaining
            })

            res.json({ message: 'تم تحديث رصيد الإجازة', data: balance })
        } catch (error) {
            console.error('Update leave balance error:', error)
            res.status(500).json({ message: 'خطأ في تحديث رصيد الإجازة' })
        }
    }
)

router.get('/leaves/reports/summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const where = {}
        if (branchId) where.branch_id = branchId
        if (req.query.from_date || req.query.to_date) {
            where.start_date = {}
            if (req.query.from_date) where.start_date[Op.gte] = req.query.from_date
            if (req.query.to_date) where.start_date[Op.lte] = req.query.to_date
        }

        const rows = await LeaveRequest.findAll({
            attributes: ['leave_type', 'status', [fn('COUNT', col('id')), 'count']],
            where,
            group: ['leave_type', 'status']
        })

        res.json({ data: rows })
    } catch (error) {
        console.error('Leave report error:', error)
        res.status(500).json({ message: 'خطأ في تقرير الإجازات' })
    }
})

// ==================== PAYROLL ====================

router.post(
    '/payroll/process',
    authenticate,
    authorize('admin', 'manager'),
    [body('period').notEmpty().withMessage('period مطلوب بصيغة YYYY-MM')],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        const period = getMonthlyPeriod(req.body.period)
        if (!period) return res.status(400).json({ message: 'period غير صحيح، مطلوب YYYY-MM' })

        const t = await sequelize.transaction()
        try {
            const branchId = getBranchScope(req)
            const employees = await Employee.findAll({
                where: {
                    status: 'active',
                    ...(branchId ? { branch_id: branchId } : {})
                },
                include: [{ model: Designation, as: 'designation', attributes: ['base_salary'] }],
                transaction: t
            })

            let processed = 0
            for (const employee of employees) {
                const periodDate = new Date(`${period}-01`)
                const baseSalary = Number(req.body.base_salary || employee.designation?.base_salary || 0)
                const [salary, created] = await EmployeeSalary.findOrCreate({
                    where: {
                        employee_id: employee.id,
                        salary_period: periodDate
                    },
                    defaults: {
                        base_salary: baseSalary,
                        gross_salary: baseSalary,
                        net_salary: baseSalary,
                        status: 'processing',
                        created_by: req.user.userId
                    },
                    transaction: t
                })

                if (!created) {
                    await salary.update({
                        base_salary: baseSalary,
                        gross_salary: baseSalary,
                        net_salary: baseSalary,
                        status: 'processing'
                    }, { transaction: t })
                }
                processed += 1
            }

            await t.commit()
            res.json({
                message: 'تمت معالجة الرواتب بنجاح',
                data: { period, employees_processed: processed }
            })
        } catch (error) {
            await t.rollback()
            console.error('Process payroll error:', error)
            res.status(500).json({ message: error.message || 'خطأ في معالجة الرواتب' })
        }
    }
)

router.get('/payroll/salaries', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { page, limit, offset } = normalizePagination(req.query)
        const branchId = getBranchScope(req)
        const where = {}

        if (req.query.status) where.status = req.query.status
        if (req.query.period) {
            const periodRange = getPeriodDateRange(req.query.period)
            if (periodRange) {
                where.salary_period = {
                    [Op.gte]: periodRange.from,
                    [Op.lt]: periodRange.to
                }
            }
        }

        const include = [
            {
                model: Employee,
                as: 'employee',
                required: true,
                where: branchId ? { branch_id: branchId } : undefined,
                attributes: ['id', 'employee_code', 'first_name_ar', 'last_name_ar', 'branch_id']
            },
            { model: SalaryComponent, as: 'components' }
        ]

        const { count, rows } = await EmployeeSalary.findAndCountAll({
            where,
            include,
            order: [['salary_period', 'DESC'], ['created_at', 'DESC']],
            limit,
            offset
        })

        sendPaginatedResponse(res, rows, count, page, limit)
    } catch (error) {
        console.error('Get salaries error:', error)
        res.status(500).json({ message: error.message || 'خطأ في جلب الرواتب' })
    }
})

router.get('/payroll/salaries/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const salary = await EmployeeSalary.findOne({
            where: { id: req.params.id },
            include: [
                {
                    model: Employee,
                    as: 'employee',
                    required: true,
                    where: branchId ? { branch_id: branchId } : undefined,
                    include: [
                        { model: Department, as: 'department', attributes: ['id', 'name_ar'] },
                        { model: Designation, as: 'designation', attributes: ['id', 'title_ar'] }
                    ]
                },
                { model: SalaryComponent, as: 'components' }
            ]
        })
        if (!salary) return res.status(404).json({ message: 'سند الراتب غير موجود' })

        res.json({ data: salary })
    } catch (error) {
        console.error('Get salary error:', error)
        res.status(500).json({ message: 'خطأ في جلب سند الراتب' })
    }
})

router.put('/payroll/salaries/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    const t = await sequelize.transaction()
    try {
        const branchId = getBranchScope(req)
        const salary = await EmployeeSalary.findOne({
            where: { id: req.params.id },
            include: branchId ? [{ model: Employee, as: 'employee', required: true, where: { branch_id: branchId }, attributes: ['id'] }] : undefined,
            transaction: t
        })
        if (!salary) {
            await t.rollback()
            return res.status(404).json({ message: 'سند الراتب غير موجود' })
        }

        const baseSalary = req.body.base_salary ?? salary.base_salary
        const componentsInput = Array.isArray(req.body.components) ? req.body.components : null
        let componentsTotal = 0

        if (componentsInput) {
            await SalaryComponent.destroy({ where: { salary_id: salary.id }, transaction: t })
            for (const item of componentsInput) {
                const amount = Number(item.amount || 0)
                if (!amount) continue
                await SalaryComponent.create({
                    salary_id: salary.id,
                    component_type: item.component_type || 'allowance',
                    component_name_ar: item.component_name_ar || 'مكون',
                    component_name_en: item.component_name_en || null,
                    amount,
                    description: item.description || null
                }, { transaction: t })
                componentsTotal += item.component_type === 'deduction' ? -amount : amount
            }
        }

        const grossSalary = Number(baseSalary) + Math.max(componentsTotal, 0)
        const deductionAmount = componentsTotal < 0 ? Math.abs(componentsTotal) : 0
        const netSalary = grossSalary - deductionAmount

        await salary.update({
            base_salary: baseSalary,
            gross_salary: grossSalary,
            net_salary: netSalary,
            status: req.body.status || salary.status,
            notes: req.body.notes ?? salary.notes
        }, { transaction: t })

        await t.commit()
        res.json({ message: 'تم تحديث سند الراتب', data: salary })
    } catch (error) {
        await t.rollback()
        console.error('Update salary error:', error)
        res.status(500).json({ message: error.message || 'خطأ في تحديث سند الراتب' })
    }
})

router.post('/payroll/approve', authenticate, authorize('admin', 'manager'), async (req, res) => {
    const ids = Array.isArray(req.body.salary_ids) ? req.body.salary_ids : []
    if (!ids.length) return res.status(400).json({ message: 'salary_ids مطلوبة' })

    try {
        const branchId = getBranchScope(req)
        const allowedRows = await EmployeeSalary.findAll({
            where: { id: { [Op.in]: ids } },
            include: branchId ? [{ model: Employee, as: 'employee', required: true, where: { branch_id: branchId }, attributes: ['id'] }] : undefined,
            attributes: ['id']
        })
        const allowedIds = allowedRows.map((row) => row.id)
        if (!allowedIds.length) {
            return res.status(403).json({ message: 'لا توجد رواتب ضمن صلاحية الفرع الحالي' })
        }

        const [updated] = await EmployeeSalary.update({
            status: 'approved',
            approved_by: req.user.userId,
            approved_date: new Date()
        }, {
            where: {
                id: { [Op.in]: allowedIds },
                status: { [Op.in]: PAYROLL_APPROVABLE_STATUSES }
            }
        })

        res.json({ message: 'تم اعتماد الرواتب', data: { updated } })
    } catch (error) {
        console.error('Approve payroll error:', error)
        res.status(500).json({ message: error.message || 'خطأ في اعتماد الرواتب' })
    }
})

router.post('/payroll/disburse', authenticate, authorize('admin', 'manager'), async (req, res) => {
    const ids = Array.isArray(req.body.salary_ids) ? req.body.salary_ids : []
    if (!ids.length) return res.status(400).json({ message: 'salary_ids مطلوبة' })
    try {
        const branchId = getBranchScope(req)
        const allowedRows = await EmployeeSalary.findAll({
            where: { id: { [Op.in]: ids } },
            include: branchId ? [{ model: Employee, as: 'employee', required: true, where: { branch_id: branchId }, attributes: ['id'] }] : undefined,
            attributes: ['id']
        })
        const allowedIds = allowedRows.map((row) => row.id)
        if (!allowedIds.length) {
            return res.status(403).json({ message: 'لا توجد رواتب ضمن صلاحية الفرع الحالي' })
        }

        const [updated] = await EmployeeSalary.update({
            status: 'paid',
            paid_date: new Date()
        }, {
            where: { id: { [Op.in]: allowedIds }, status: 'approved' }
        })
        res.json({ message: 'تم صرف الرواتب', data: { updated } })
    } catch (error) {
        console.error('Disburse payroll error:', error)
        res.status(500).json({ message: error.message || 'خطأ في صرف الرواتب' })
    }
})

router.get('/payroll/reports/summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const where = {}
        if (req.query.period) {
            const periodRange = getPeriodDateRange(req.query.period)
            if (periodRange) {
                where.salary_period = {
                    [Op.gte]: periodRange.from,
                    [Op.lt]: periodRange.to
                }
            }
        }
        const includeByBranch = branchId
            ? [{ model: Employee, as: 'employee', required: true, where: { branch_id: branchId }, attributes: [] }]
            : undefined

        const [totalNet, totalGross, byStatus] = await Promise.all([
            EmployeeSalary.sum('net_salary', { where, include: includeByBranch }),
            EmployeeSalary.sum('gross_salary', { where, include: includeByBranch }),
            EmployeeSalary.findAll({
                attributes: ['status', [fn('COUNT', col('id')), 'count']],
                where,
                include: includeByBranch,
                group: ['status']
            })
        ])

        res.json({
            data: {
                total_net_salary: Number(totalNet || 0),
                total_gross_salary: Number(totalGross || 0),
                breakdown: byStatus
            }
        })
    } catch (error) {
        console.error('Payroll summary error:', error)
        res.status(500).json({ message: 'خطأ في تقرير الرواتب' })
    }
})

router.put(
    '/departments/:id',
    authenticate,
    authorize('admin', 'manager'),
    [body('budget').optional().isFloat({ min: 0 }).withMessage('الميزانية يجب أن تكون رقم موجب')],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const branchId = getBranchScope(req)
            const where = { id: req.params.id }
            if (branchId) where.branch_id = branchId

            const department = await Department.findOne({ where })
            if (!department) return res.status(404).json({ message: 'القسم غير موجود' })

            await department.update({
                name_ar: req.body.name_ar ?? department.name_ar,
                name_en: req.body.name_en ?? department.name_en,
                description: req.body.description ?? department.description,
                manager_id: req.body.manager_id ?? department.manager_id,
                budget: req.body.budget ?? department.budget,
                status: req.body.status ?? department.status
            })

            res.json({ message: 'تم تحديث القسم بنجاح', data: department })
        } catch (error) {
            console.error('Update department error:', error)
            res.status(500).json({ message: error.message || 'خطأ في تحديث القسم' })
        }
    }
)

router.get('/departments/:id/team', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const department = await Department.findOne({
            where: { id: req.params.id, ...(branchId ? { branch_id: branchId } : {}) }
        })
        if (!department) return res.status(404).json({ message: 'القسم غير موجود' })

        const team = await Employee.findAll({
            where: { department_id: department.id },
            include: [{ model: Designation, as: 'designation', attributes: ['id', 'title_ar', 'title_en'] }],
            order: [['first_name_ar', 'ASC']]
        })

        res.json({ data: { department, team } })
    } catch (error) {
        console.error('Get department team error:', error)
        res.status(500).json({ message: 'خطأ في جلب فريق القسم' })
    }
})

// ==================== DESIGNATIONS ====================

router.get('/designations', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const where = {}
        if (branchId) where.branch_id = branchId
        if (req.query.department_id) where.department_id = req.query.department_id
        if (req.query.status) where.status = req.query.status

        const rows = await Designation.findAll({
            where,
            include: [{ model: Department, as: 'department', attributes: ['id', 'name_ar'] }],
            order: [['title_ar', 'ASC']]
        })

        res.json({ data: rows })
    } catch (error) {
        console.error('Get designations error:', error)
        res.status(500).json({ message: 'خطأ في جلب المسميات الوظيفية' })
    }
})

router.post(
    '/designations',
    authenticate,
    authorize('admin', 'manager'),
    [body('title_ar').notEmpty().withMessage('المسمى الوظيفي بالعربية مطلوب')],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const code = req.body.code?.trim() || `DES-${Date.now().toString().slice(-6)}`
            const branchId = getBranchScope(req) || req.body.branch_id || req.user.branchId || null

            const row = await Designation.create({
                code,
                title_ar: req.body.title_ar,
                title_en: req.body.title_en || null,
                level: req.body.level || null,
                department_id: req.body.department_id || null,
                branch_id: branchId,
                description: req.body.description || null,
                base_salary: req.body.base_salary || 0,
                status: req.body.status || 'active'
            })
            res.status(201).json({ message: 'تم إضافة المسمى الوظيفي', data: row })
        } catch (error) {
            console.error('Create designation error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إنشاء المسمى الوظيفي' })
        }
    }
)

router.put(
    '/designations/:id',
    authenticate,
    authorize('admin', 'manager'),
    async (req, res) => {
        try {
            const branchId = getBranchScope(req)
            const where = { id: req.params.id }
            if (branchId) where.branch_id = branchId

            const row = await Designation.findOne({ where })
            if (!row) return res.status(404).json({ message: 'المسمى الوظيفي غير موجود' })

            await row.update({
                title_ar: req.body.title_ar ?? row.title_ar,
                title_en: req.body.title_en ?? row.title_en,
                level: req.body.level ?? row.level,
                department_id: req.body.department_id ?? row.department_id,
                description: req.body.description ?? row.description,
                base_salary: req.body.base_salary ?? row.base_salary,
                status: req.body.status ?? row.status
            })

            res.json({ message: 'تم تحديث المسمى الوظيفي', data: row })
        } catch (error) {
            console.error('Update designation error:', error)
            res.status(500).json({ message: error.message || 'خطأ في تحديث المسمى الوظيفي' })
        }
    }
)

// ==================== EXTRA LISTING APIS ====================

router.get('/attendance', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { page, limit, offset } = normalizePagination(req.query)
        const branchId = getBranchScope(req)
        const where = {}
        if (branchId) where.branch_id = branchId
        if (req.query.employee_id) where.employee_id = req.query.employee_id
        if (req.query.status) where.status = req.query.status
        if (req.query.from_date || req.query.to_date) {
            where.attendance_date = {}
            if (req.query.from_date) where.attendance_date[Op.gte] = req.query.from_date
            if (req.query.to_date) where.attendance_date[Op.lte] = req.query.to_date
        }

        const { count, rows } = await HRAttendance.findAndCountAll({
            where,
            include: [{ model: Employee, as: 'employee', attributes: ['id', 'employee_code', 'first_name_ar', 'last_name_ar'] }],
            order: [['attendance_date', 'DESC'], ['created_at', 'DESC']],
            limit,
            offset
        })

        sendPaginatedResponse(res, rows, count, page, limit)
    } catch (error) {
        console.error('List attendance error:', error)
        res.status(500).json({ message: 'خطأ في جلب سجلات الحضور' })
    }
})

router.get('/leaves', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { page, limit, offset } = normalizePagination(req.query)
        const branchId = getBranchScope(req)
        const where = {}
        if (branchId) where.branch_id = branchId
        if (req.query.employee_id) where.employee_id = req.query.employee_id
        if (req.query.status) where.status = req.query.status
        if (req.query.leave_type) where.leave_type = req.query.leave_type
        if (req.query.from_date || req.query.to_date) {
            where.start_date = {}
            if (req.query.from_date) where.start_date[Op.gte] = req.query.from_date
            if (req.query.to_date) where.start_date[Op.lte] = req.query.to_date
        }

        const { count, rows } = await LeaveRequest.findAndCountAll({
            where,
            include: [{ model: Employee, as: 'employee', attributes: ['id', 'employee_code', 'first_name_ar', 'last_name_ar'] }],
            order: [['created_at', 'DESC']],
            limit,
            offset
        })

        sendPaginatedResponse(res, rows, count, page, limit)
    } catch (error) {
        console.error('List leaves error:', error)
        res.status(500).json({ message: 'خطأ في جلب طلبات الإجازة' })
    }
})

// ==================== PERFORMANCE ====================

router.get('/performance/reports/summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const where = {}
        if (req.query.status) where.status = req.query.status
        if (req.query.employee_id) where.employee_id = req.query.employee_id

        const rows = await PerformanceReview.findAll({
            attributes: ['status', [fn('COUNT', col('id')), 'count'], [fn('AVG', col('overall_rating')), 'avg_rating']],
            where,
            include: branchId ? [{ model: Employee, as: 'employee', required: true, where: { branch_id: branchId }, attributes: [] }] : undefined,
            group: ['status']
        })
        res.json({ data: rows })
    } catch (error) {
        console.error('Performance summary error:', error)
        res.status(500).json({ message: 'خطأ في تقرير تقييمات الأداء' })
    }
})

router.get('/performance', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { page, limit, offset } = normalizePagination(req.query)
        const branchId = getBranchScope(req)
        const where = {}
        if (req.query.employee_id) where.employee_id = req.query.employee_id
        if (req.query.status) where.status = req.query.status

        const { count, rows } = await PerformanceReview.findAndCountAll({
            where,
            include: [
                {
                    model: Employee,
                    as: 'employee',
                    required: true,
                    where: branchId ? { branch_id: branchId } : undefined,
                    attributes: ['id', 'employee_code', 'first_name_ar', 'last_name_ar']
                },
                { model: User, as: 'reviewer', attributes: ['id', 'name_ar', 'username'] }
            ],
            order: [['created_at', 'DESC']],
            limit,
            offset
        })

        sendPaginatedResponse(res, rows, count, page, limit)
    } catch (error) {
        console.error('List performance reviews error:', error)
        res.status(500).json({ message: 'خطأ في جلب تقييمات الأداء' })
    }
})

router.post(
    '/performance',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('employee_id').notEmpty().withMessage('الموظف مطلوب'),
        body('overall_rating').optional().isFloat({ min: 1, max: 5 }).withMessage('overall_rating يجب أن تكون من 1 إلى 5'),
        body('review_period_start').optional({ checkFalsy: true }).isISO8601().withMessage('review_period_start غير صحيح'),
        body('review_period_end')
            .optional({ checkFalsy: true })
            .isISO8601().withMessage('review_period_end غير صحيح')
            .custom((endDate, { req }) => !req.body.review_period_start || new Date(endDate) >= new Date(req.body.review_period_start))
            .withMessage('review_period_end يجب أن يكون بعد أو يساوي review_period_start')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const employee = await getScopedEmployee(req, req.body.employee_id)
            if (!employee) return res.status(404).json({ message: 'الموظف غير موجود' })

            const scopedBranchId = getBranchScope(req)

            const review = await PerformanceReview.create({
                employee_id: req.body.employee_id,
                review_period_start: req.body.review_period_start || null,
                review_period_end: req.body.review_period_end || null,
                reviewer_id: req.user.userId,
                overall_rating: req.body.overall_rating ?? null,
                comments: req.body.comments || null,
                strengths: req.body.strengths || null,
                areas_for_improvement: req.body.areas_for_improvement || null,
                goals_for_next_period: req.body.goals_for_next_period || null,
                status: req.body.status || 'draft',
                review_date: req.body.review_date || new Date(),
                created_by: req.user.userId
            })

            res.status(201).json({ message: 'تم إنشاء تقييم الأداء', data: review })
        } catch (error) {
            console.error('Create performance review error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إنشاء تقييم الأداء' })
        }
    }
)

router.put(
    '/performance/:id',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('overall_rating').optional().isFloat({ min: 1, max: 5 }).withMessage('overall_rating يجب أن تكون من 1 إلى 5'),
        body('review_period_start').optional({ checkFalsy: true }).isISO8601().withMessage('review_period_start غير صحيح'),
        body('review_period_end')
            .optional({ checkFalsy: true })
            .isISO8601().withMessage('review_period_end غير صحيح')
            .custom((endDate, { req }) => !req.body.review_period_start || new Date(endDate) >= new Date(req.body.review_period_start))
            .withMessage('review_period_end يجب أن يكون بعد أو يساوي review_period_start')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const branchId = getBranchScope(req)
            const review = await PerformanceReview.findOne({
                where: { id: req.params.id },
                include: branchId ? [{ model: Employee, as: 'employee', required: true, where: { branch_id: branchId }, attributes: ['id'] }] : undefined
            })
            if (!review) return res.status(404).json({ message: 'تقييم الأداء غير موجود' })

            await review.update({
                review_period_start: req.body.review_period_start ?? review.review_period_start,
                review_period_end: req.body.review_period_end ?? review.review_period_end,
                overall_rating: req.body.overall_rating ?? review.overall_rating,
                comments: req.body.comments ?? review.comments,
                strengths: req.body.strengths ?? review.strengths,
                areas_for_improvement: req.body.areas_for_improvement ?? review.areas_for_improvement,
                goals_for_next_period: req.body.goals_for_next_period ?? review.goals_for_next_period,
                status: req.body.status ?? review.status,
                review_date: req.body.review_date ?? review.review_date,
                reviewer_id: req.user.userId
            })

            res.json({ message: 'تم تحديث تقييم الأداء', data: review })
        } catch (error) {
            console.error('Update performance review error:', error)
            res.status(500).json({ message: error.message || 'خطأ في تحديث تقييم الأداء' })
        }
    }
)

// ==================== TRAINING ====================

router.get('/training/reports/summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const rows = await TrainingProgram.findAll({
            attributes: ['status', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('budget')), 'total_budget']],
            group: ['status']
        })
        res.json({ data: rows })
    } catch (error) {
        console.error('Training summary error:', error)
        res.status(500).json({ message: 'خطأ في تقرير التدريب' })
    }
})

router.get('/training/programs', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { page, limit, offset } = normalizePagination(req.query)
        const where = {}
        if (req.query.status) where.status = req.query.status

        const { count, rows } = await TrainingProgram.findAndCountAll({
            where,
            include: [{ model: Employee, as: 'trainerEmployee', attributes: ['id', 'employee_code', 'first_name_ar', 'last_name_ar'] }],
            order: [['start_date', 'DESC'], ['created_at', 'DESC']],
            limit,
            offset
        })

        sendPaginatedResponse(res, rows, count, page, limit)
    } catch (error) {
        console.error('List training programs error:', error)
        res.status(500).json({ message: 'خطأ في جلب برامج التدريب' })
    }
})

router.post(
    '/training',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('program_name_ar').notEmpty().withMessage('اسم البرنامج مطلوب'),
        body('start_date').optional({ checkFalsy: true }).isISO8601().withMessage('start_date غير صحيح'),
        body('end_date')
            .optional({ checkFalsy: true })
            .isISO8601().withMessage('end_date غير صحيح')
            .custom((endDate, { req }) => !req.body.start_date || new Date(endDate) >= new Date(req.body.start_date))
            .withMessage('end_date يجب أن يكون بعد أو يساوي start_date'),
        body('duration_days').optional().isInt({ min: 1 }).withMessage('duration_days يجب أن يكون رقمًا صحيحًا موجبًا'),
        body('budget').optional().isFloat({ min: 0 }).withMessage('budget يجب أن يكون رقمًا موجبًا')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            const trainerId = req.body.trainer || null
            if (trainerId) {
                const trainer = await getScopedEmployee(req, trainerId)
                if (!trainer) return res.status(404).json({ message: 'المدرب غير موجود' })
            }

            const program = await TrainingProgram.create({
                program_name_ar: req.body.program_name_ar,
                program_name_en: req.body.program_name_en || null,
                description: req.body.description || null,
                start_date: req.body.start_date || null,
                end_date: req.body.end_date || null,
                duration_days: req.body.duration_days || null,
                trainer: trainerId,
                budget: req.body.budget || 0,
                status: req.body.status || 'planned',
                created_by: req.user.userId
            })

            res.status(201).json({ message: 'تم إنشاء برنامج التدريب', data: program })
        } catch (error) {
            console.error('Create training program error:', error)
            res.status(500).json({ message: error.message || 'خطأ في إنشاء برنامج التدريب' })
        }
    }
)

router.put(
    '/training/:id',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('start_date').optional({ checkFalsy: true }).isISO8601().withMessage('start_date غير صحيح'),
        body('end_date')
            .optional({ checkFalsy: true })
            .isISO8601().withMessage('end_date غير صحيح')
            .custom((endDate, { req }) => !req.body.start_date || new Date(endDate) >= new Date(req.body.start_date))
            .withMessage('end_date يجب أن يكون بعد أو يساوي start_date'),
        body('duration_days').optional().isInt({ min: 1 }).withMessage('duration_days يجب أن يكون رقمًا صحيحًا موجبًا'),
        body('budget').optional().isFloat({ min: 0 }).withMessage('budget يجب أن يكون رقمًا موجبًا')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return
        try {
            if (req.body.trainer) {
                const trainer = await getScopedEmployee(req, req.body.trainer)
                if (!trainer) return res.status(404).json({ message: 'المدرب غير موجود' })
            }

            const program = await TrainingProgram.findByPk(req.params.id)
            if (!program) return res.status(404).json({ message: 'برنامج التدريب غير موجود' })

            await program.update({
                program_name_ar: req.body.program_name_ar ?? program.program_name_ar,
                program_name_en: req.body.program_name_en ?? program.program_name_en,
                description: req.body.description ?? program.description,
                start_date: req.body.start_date ?? program.start_date,
                end_date: req.body.end_date ?? program.end_date,
                duration_days: req.body.duration_days ?? program.duration_days,
                trainer: req.body.trainer ?? program.trainer,
                budget: req.body.budget ?? program.budget,
                status: req.body.status ?? program.status
            })

            res.json({ message: 'تم تحديث برنامج التدريب', data: program })
        } catch (error) {
            console.error('Update training program error:', error)
            res.status(500).json({ message: error.message || 'خطأ في تحديث برنامج التدريب' })
        }
    }
)

module.exports = router



