const express = require('express')
const { Op, fn, col } = require('sequelize')
const { body, validationResult } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const AuditService = require('../services/auditService')
const AccountingService = require('../services/accountingService')
const { AccountResolver, ACCOUNT_KEYS } = require('../services/accountResolver')
const { loadSettings } = require('./settings')
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
const PAYROLL_LOCKED_STATUSES = ['approved', 'paid']
const LEAVE_BALANCE_EXEMPT_TYPES = ['unpaid']
const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/
const PAYROLL_PAYMENT_METHODS = ['cash', 'bank_transfer', 'check', 'card']

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

const isPayrollLockedStatus = (status) => PAYROLL_LOCKED_STATUSES.includes(status)

const createHttpError = (message, statusCode = 400) => {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

const validateAttendanceRow = (row = {}) => {
    if (!row.employee_id) return 'employee_id is required'
    if (!row.attendance_date || Number.isNaN(new Date(row.attendance_date).getTime())) {
        return 'attendance_date is invalid'
    }
    if (row.status && !ATTENDANCE_STATUSES.includes(row.status)) return 'status is invalid'
    if (row.check_in && !TIME_24H_REGEX.test(row.check_in)) return 'check_in is invalid'
    if (row.check_out && !TIME_24H_REGEX.test(row.check_out)) return 'check_out is invalid'
    if (row.check_in && row.check_out && computeWorkingHours(row.check_in, row.check_out) <= 0) {
        return 'check_out must be after check_in'
    }
    return null
}

const normalizeAttendanceTimeValue = (value) => {
    if (value === undefined || value === null) return undefined
    const normalized = String(value).trim()
    return normalized ? normalized : undefined
}

const resolveAttendanceTimeState = ({ existingRecord = null, payload = {} }) => {
    const incomingCheckIn = normalizeAttendanceTimeValue(payload.check_in)
    const incomingCheckOut = normalizeAttendanceTimeValue(payload.check_out)
    const effectiveCheckIn = incomingCheckIn !== undefined
        ? incomingCheckIn
        : (existingRecord?.check_in || null)
    const effectiveCheckOut = incomingCheckOut !== undefined
        ? incomingCheckOut
        : (existingRecord?.check_out || null)
    const computedWorkingHours = computeWorkingHours(effectiveCheckIn, effectiveCheckOut)

    if (effectiveCheckIn && effectiveCheckOut && computedWorkingHours <= 0) {
        throw createHttpError('وقت الانصراف يجب أن يكون بعد وقت الحضور', 400)
    }

    return {
        check_in: effectiveCheckIn,
        check_out: effectiveCheckOut,
        working_hours: payload.working_hours ?? computedWorkingHours
    }
}

const findOverlappingLeaveRequest = async ({ employeeId, startDate, endDate, excludeId = null, transaction }) => {
    const where = {
        employee_id: employeeId,
        status: { [Op.notIn]: ['rejected', 'cancelled'] },
        start_date: { [Op.lte]: endDate },
        end_date: { [Op.gte]: startDate }
    }
    if (excludeId) where.id = { [Op.ne]: excludeId }

    return LeaveRequest.findOne({
        where,
        transaction,
        attributes: ['id', 'leave_type', 'status', 'start_date', 'end_date', 'number_of_days'],
        order: [['start_date', 'ASC']]
    })
}

const getOrCreateLeaveBalance = async ({ leave, transaction }) => {
    const year = new Date(leave.start_date).getFullYear()
    return LeaveBalance.findOrCreate({
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
        transaction
    })
}

const ensureLeaveCanBeApproved = async ({ leave, transaction, excludeId = null }) => {
    const conflictingLeave = await findOverlappingLeaveRequest({
        employeeId: leave.employee_id,
        startDate: leave.start_date,
        endDate: leave.end_date,
        excludeId,
        transaction
    })

    if (conflictingLeave) {
        throw createHttpError('يوجد طلب إجازة متداخل لنفس الموظف خلال نفس الفترة', 400)
    }

    if (LEAVE_BALANCE_EXEMPT_TYPES.includes(leave.leave_type)) {
        return null
    }

    const [balance] = await getOrCreateLeaveBalance({ leave, transaction })
    const remaining = getLeaveRemaining(
        balance.opening_balance,
        balance.allocated,
        balance.used,
        balance.carried_forward
    )
    const requestedDays = Number(leave.number_of_days || 0)
    if (requestedDays > Number(remaining || 0)) {
        throw createHttpError('رصيد الإجازة غير كاف لاعتماد هذا الطلب', 400)
    }

    return balance
}

const resolveTrainingBranchId = ({ req, trainer }) => {
    const scopedBranchId = getBranchScope(req)
    const requestedBranchId = scopedBranchId || req.body.branch_id || req.user.branchId || null

    if (requestedBranchId && trainer?.branch_id && trainer.branch_id !== requestedBranchId) {
        throw createHttpError('المدرب المحدد لا ينتمي إلى الفرع المختار', 400)
    }

    return requestedBranchId || trainer?.branch_id || null
}

const normalizePayrollPaymentMethod = (value) => {
    if (!value) return 'bank_transfer'
    return PAYROLL_PAYMENT_METHODS.includes(value) ? value : 'bank_transfer'
}

const getPayrollPaymentAccountKey = (paymentMethod) => (
    paymentMethod === 'cash' ? ACCOUNT_KEYS.CASH : ACCOUNT_KEYS.BANK
)

const createPayrollDisbursementEntry = async ({
    salary,
    employee,
    paymentMethod,
    paymentDate,
    createdBy,
    transaction
}) => {
    const amount = Math.round(Number(salary.net_salary || 0) * 100) / 100
    if (amount <= 0) return null

    const branchId = employee?.branch_id || null
    const accounts = await AccountResolver.resolveMany({
        salariesExpense: ACCOUNT_KEYS.SALARIES_EXPENSE,
        paymentAccount: getPayrollPaymentAccountKey(paymentMethod)
    }, { branchId })

    const employeeName = `${employee?.first_name_ar || ''} ${employee?.last_name_ar || ''}`.trim()
    const employeeLabel = employee?.employee_code
        ? `${employee.employee_code}${employeeName ? ` - ${employeeName}` : ''}`
        : (employeeName || salary.employee_id)
    const salaryPeriod = String(salary.salary_period || '').slice(0, 7)
    const metadata = JSON.stringify({
        salary_id: salary.id,
        employee_id: salary.employee_id,
        employee_code: employee?.employee_code || null,
        period: salaryPeriod,
        payment_method: paymentMethod
    })

    return AccountingService.createJournalEntry({
        description: `صرف راتب: ${employeeLabel} - ${salaryPeriod}`,
        sourceType: 'payroll',
        sourceId: salary.id,
        lines: [
            {
                accountCode: accounts.salariesExpense,
                debit: amount,
                credit: 0,
                description: `مصروف رواتب - ${employeeLabel}`
            },
            {
                accountCode: accounts.paymentAccount,
                debit: 0,
                credit: amount,
                description: `سداد راتب (${paymentMethod})`
            }
        ],
        entryDate: paymentDate || null,
        branchId,
        createdBy,
        notes: metadata,
        transaction
    })
}

const normalizeMoneyValue = (value) => Math.round(Number(value || 0) * 100) / 100
const AUTO_UNPAID_LEAVE_COMPONENT_EN = 'auto_unpaid_leave_deduction'
const AUTO_ABSENCE_DEDUCTION_COMPONENT_EN = 'auto_attendance_absence_deduction'
const AUTO_HALF_DAY_DEDUCTION_COMPONENT_EN = 'auto_attendance_half_day_deduction'
const AUTO_LATE_DEDUCTION_COMPONENT_EN = 'auto_attendance_late_deduction'
const AUTO_GENERATED_DEDUCTION_COMPONENT_NAMES = new Set([
    AUTO_UNPAID_LEAVE_COMPONENT_EN,
    AUTO_ABSENCE_DEDUCTION_COMPONENT_EN,
    AUTO_HALF_DAY_DEDUCTION_COMPONENT_EN,
    AUTO_LATE_DEDUCTION_COMPONENT_EN
])
const DAY_IN_MS = 24 * 60 * 60 * 1000
const HALF_DAY_FACTOR = 0.5
const PAYROLL_LATE_DEDUCTION_TYPES = ['fixed_amount', 'fraction_of_day']

const resolveEmployeeBaseSalary = async ({
    employee,
    requestBaseSalary = null,
    transaction
}) => {
    const explicitRequestBaseSalary = (
        requestBaseSalary !== undefined &&
        requestBaseSalary !== null &&
        requestBaseSalary !== ''
    )
        ? normalizeMoneyValue(requestBaseSalary)
        : null

    if (explicitRequestBaseSalary !== null && explicitRequestBaseSalary > 0) {
        return explicitRequestBaseSalary
    }

    const employeeBaseSalary = normalizeMoneyValue(employee?.base_salary)
    if (employeeBaseSalary > 0) {
        return employeeBaseSalary
    }

    const latestLockedSalary = await EmployeeSalary.findOne({
        where: {
            employee_id: employee.id,
            status: { [Op.in]: PAYROLL_LOCKED_STATUSES },
            base_salary: { [Op.gt]: 0 }
        },
        attributes: ['base_salary'],
        order: [['salary_period', 'DESC'], ['updated_at', 'DESC'], ['created_at', 'DESC']],
        transaction
    })

    if (latestLockedSalary?.base_salary) {
        return normalizeMoneyValue(latestLockedSalary.base_salary)
    }

    const latestSalarySnapshot = await EmployeeSalary.findOne({
        where: {
            employee_id: employee.id,
            status: { [Op.ne]: 'rejected' },
            base_salary: { [Op.gt]: 0 }
        },
        attributes: ['base_salary'],
        order: [['salary_period', 'DESC'], ['updated_at', 'DESC'], ['created_at', 'DESC']],
        transaction
    })

    if (latestSalarySnapshot?.base_salary) {
        return normalizeMoneyValue(latestSalarySnapshot.base_salary)
    }

    return Math.max(normalizeMoneyValue(employee?.designation?.base_salary), 0)
}

const parseUtcDate = (value) => new Date(`${value}T00:00:00.000Z`)

const getPayrollPeriodDayCount = (periodRange) => {
    if (!periodRange?.from || !periodRange?.to) return 30
    const from = parseUtcDate(periodRange.from)
    const to = parseUtcDate(periodRange.to)
    return Math.max(Math.round((to.getTime() - from.getTime()) / DAY_IN_MS), 1)
}

const getDateOverlapDays = (startDate, endDate, rangeStart, rangeEndExclusive) => {
    const start = parseUtcDate(startDate)
    const endExclusive = new Date(parseUtcDate(endDate).getTime() + DAY_IN_MS)
    const overlapStart = Math.max(start.getTime(), rangeStart.getTime())
    const overlapEnd = Math.min(endExclusive.getTime(), rangeEndExclusive.getTime())
    if (overlapEnd <= overlapStart) return 0
    return Math.round((overlapEnd - overlapStart) / DAY_IN_MS)
}

const getApprovedUnpaidLeaveSummary = async ({ employeeId, periodRange, transaction }) => {
    if (!periodRange?.from || !periodRange?.to) {
        return { days: 0, rows: [] }
    }

    const rows = await LeaveRequest.findAll({
        where: {
            employee_id: employeeId,
            leave_type: 'unpaid',
            status: 'approved',
            start_date: { [Op.lt]: periodRange.to },
            end_date: { [Op.gte]: periodRange.from }
        },
        attributes: ['id', 'start_date', 'end_date', 'number_of_days'],
        order: [['start_date', 'ASC']],
        transaction
    })

    const rangeStart = parseUtcDate(periodRange.from)
    const rangeEndExclusive = parseUtcDate(periodRange.to)
    const days = rows.reduce((total, row) => (
        total + getDateOverlapDays(row.start_date, row.end_date, rangeStart, rangeEndExclusive)
    ), 0)

    return { days, rows }
}

const getAggregateRowValue = (row, key) => (
    typeof row?.get === 'function'
        ? row.get(key)
        : row?.[key]
)

const getPayrollLatePolicy = () => {
    const settings = loadSettings()
    const policy = settings?.hr?.payrollLatePolicy || {}
    const graceCount = Math.max(parseInt(policy.graceCount ?? 0, 10) || 0, 0)
    const deductionType = PAYROLL_LATE_DEDUCTION_TYPES.includes(policy.deductionType)
        ? policy.deductionType
        : 'fixed_amount'
    const deductionValue = Math.max(normalizeMoneyValue(policy.deductionValue), 0)

    return {
        enabled: policy.enabled === true && deductionValue > 0,
        graceCount,
        deductionType,
        deductionValue
    }
}

const createEmptyAttendancePayrollSummary = () => ({
    absent: 0,
    half_day: 0,
    late: 0,
    deduction_days: 0,
    absence_deduction: 0,
    half_day_deduction: 0,
    excess_late_marks: 0,
    late_deduction: 0
})

const getAttendancePayrollSummaryMap = async ({ employeeIds, periodRange, transaction }) => {
    if (!Array.isArray(employeeIds) || !employeeIds.length || !periodRange?.from || !periodRange?.to) {
        return new Map()
    }

    const rows = await HRAttendance.findAll({
        attributes: ['employee_id', 'status', [fn('COUNT', col('id')), 'count']],
        where: {
            employee_id: { [Op.in]: employeeIds },
            attendance_date: {
                [Op.gte]: periodRange.from,
                [Op.lt]: periodRange.to
            },
            status: { [Op.in]: ['absent', 'half_day', 'late'] }
        },
        group: ['employee_id', 'status'],
        transaction
    })

    const summaryMap = new Map()
    for (const row of rows) {
        const employeeId = getAggregateRowValue(row, 'employee_id')
        const status = getAggregateRowValue(row, 'status')
        const count = parseInt(getAggregateRowValue(row, 'count') || 0, 10)
        if (!employeeId || !status || Number.isNaN(count) || count <= 0) continue

        if (!summaryMap.has(employeeId)) {
            summaryMap.set(employeeId, createEmptyAttendancePayrollSummary())
        }

        const summary = summaryMap.get(employeeId)
        if (Object.prototype.hasOwnProperty.call(summary, status)) {
            summary[status] += count
        }
    }

    return summaryMap
}

const finalizeAttendancePayrollSummary = ({ summary, dailyRate, latePolicy }) => {
    const normalizedSummary = {
        ...createEmptyAttendancePayrollSummary(),
        ...(summary || {})
    }
    const absenceCount = Number(normalizedSummary.absent || 0)
    const halfDayCount = Number(normalizedSummary.half_day || 0)
    const lateCount = Number(normalizedSummary.late || 0)
    const absenceDeduction = normalizeMoneyValue(dailyRate * absenceCount)
    const halfDayDeduction = normalizeMoneyValue(dailyRate * halfDayCount * HALF_DAY_FACTOR)
    const excessLateMarks = Math.max(lateCount - Number(latePolicy?.graceCount || 0), 0)
    let lateDeduction = 0

    if (latePolicy?.enabled && excessLateMarks > 0) {
        if (latePolicy.deductionType === 'fraction_of_day') {
            lateDeduction = normalizeMoneyValue(dailyRate * Number(latePolicy.deductionValue || 0) * excessLateMarks)
        } else {
            lateDeduction = normalizeMoneyValue(Number(latePolicy.deductionValue || 0) * excessLateMarks)
        }
    }

    return {
        ...normalizedSummary,
        deduction_days: normalizeMoneyValue(absenceCount + (halfDayCount * HALF_DAY_FACTOR)),
        absence_deduction: absenceDeduction,
        half_day_deduction: halfDayDeduction,
        excess_late_marks: excessLateMarks,
        late_deduction: lateDeduction
    }
}

const getSalaryAdjustmentSummary = async ({ salaryId, transaction }) => {
    const components = await SalaryComponent.findAll({
        where: { salary_id: salaryId },
        attributes: ['component_type', 'amount', 'component_name_en'],
        transaction
    })

    let allowances = 0
    let deductions = 0
    for (const component of components) {
        if (AUTO_GENERATED_DEDUCTION_COMPONENT_NAMES.has(component.component_name_en)) continue
        const amount = normalizeMoneyValue(component.amount)
        if (component.component_type === 'deduction') deductions += amount
        else allowances += amount
    }

    return {
        allowances: normalizeMoneyValue(allowances),
        deductions: normalizeMoneyValue(deductions)
    }
}

const syncAutoUnpaidLeaveComponent = async ({
    salaryId,
    unpaidLeaveDays,
    deductionAmount,
    transaction
}) => {
    await SalaryComponent.destroy({
        where: {
            salary_id: salaryId,
            component_name_en: AUTO_UNPAID_LEAVE_COMPONENT_EN
        },
        transaction
    })

    if (normalizeMoneyValue(deductionAmount) <= 0) return

    await SalaryComponent.create({
        salary_id: salaryId,
        component_type: 'deduction',
        component_name_ar: 'خصم إجازات غير مدفوعة',
        component_name_en: AUTO_UNPAID_LEAVE_COMPONENT_EN,
        amount: normalizeMoneyValue(deductionAmount),
        description: `Auto-generated from ${unpaidLeaveDays} unpaid leave day(s)`
    }, { transaction })
}

const syncAutoAttendanceDeductionComponents = async ({
    salaryId,
    attendanceSummary,
    transaction
}) => {
    await SalaryComponent.destroy({
        where: {
            salary_id: salaryId,
            component_name_en: {
                [Op.in]: [
                    AUTO_ABSENCE_DEDUCTION_COMPONENT_EN,
                    AUTO_HALF_DAY_DEDUCTION_COMPONENT_EN,
                    AUTO_LATE_DEDUCTION_COMPONENT_EN
                ]
            }
        },
        transaction
    })

    const absenceCount = Number(attendanceSummary?.absent || 0)
    const halfDayCount = Number(attendanceSummary?.half_day || 0)
    const excessLateMarks = Number(attendanceSummary?.excess_late_marks || 0)
    const absenceDeduction = normalizeMoneyValue(attendanceSummary?.absence_deduction)
    const halfDayDeduction = normalizeMoneyValue(attendanceSummary?.half_day_deduction)
    const lateDeduction = normalizeMoneyValue(attendanceSummary?.late_deduction)

    if (absenceDeduction > 0) {
        await SalaryComponent.create({
            salary_id: salaryId,
            component_type: 'deduction',
            component_name_ar: 'خصم غياب تلقائي',
            component_name_en: AUTO_ABSENCE_DEDUCTION_COMPONENT_EN,
            amount: absenceDeduction,
            description: `Auto-generated from ${absenceCount} absent day(s)`
        }, { transaction })
    }

    if (halfDayDeduction > 0) {
        await SalaryComponent.create({
            salary_id: salaryId,
            component_type: 'deduction',
            component_name_ar: 'خصم نصف يوم تلقائي',
            component_name_en: AUTO_HALF_DAY_DEDUCTION_COMPONENT_EN,
            amount: halfDayDeduction,
            description: `Auto-generated from ${halfDayCount} half-day attendance record(s)`
        }, { transaction })
    }

    if (lateDeduction > 0) {
        await SalaryComponent.create({
            salary_id: salaryId,
            component_type: 'deduction',
            component_name_ar: 'خصم تأخير تلقائي',
            component_name_en: AUTO_LATE_DEDUCTION_COMPONENT_EN,
            amount: lateDeduction,
            description: `Auto-generated from ${excessLateMarks} chargeable late mark(s)`
        }, { transaction })
    }
}

const clampScore = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value))

const roundScore = (value) => Math.round(Number(value || 0) * 10) / 10

const getEmployeeDisplayName = (employee) => (
    `${employee?.first_name_ar || ''} ${employee?.last_name_ar || ''}`.trim() || employee?.employee_code || 'موظف'
)

const getPerformanceBand = (score) => {
    if (score >= 85) return 'ممتاز'
    if (score >= 70) return 'جيد جداً'
    if (score >= 55) return 'مستقر'
    if (score >= 40) return 'يحتاج متابعة'
    return 'عالي الخطورة'
}

const getPerformanceRecommendation = ({
    score,
    attendance,
    unpaidLeaveDays,
    latestReview
}) => {
    const absent = Number(attendance?.absent || 0)
    const late = Number(attendance?.late || 0)
    const halfDay = Number(attendance?.half_day || 0)
    const rating = Number(latestReview?.overall_rating || 0)

    if (score >= 85) return 'أداء قوي ومنضبط، مناسب للترشيح أو المهام القيادية'
    if (rating > 0 && rating < 3) return 'يحتاج خطة تطوير واضحة بسبب انخفاض آخر تقييم أداء'
    if (absent >= 2) return 'الأولوية لمعالجة الغياب وتحسين الالتزام اليومي'
    if (late >= 3) return 'يوصى بمتابعة مواعيد الحضور ووضع تنبيه للتأخير المتكرر'
    if (halfDay >= 2) return 'يراجع سبب تكرار أنصاف الأيام وتأثيرها على الإنتاجية'
    if (unpaidLeaveDays > 0) return 'يراجع أثر الإجازات غير المدفوعة على الاستقرار الوظيفي'
    if (score >= 70) return 'الأداء جيد ويحتاج متابعة خفيفة للحفاظ على الاستقرار'
    return 'المؤشرات مختلطة وتحتاج متابعة إدارية أقرب خلال الفترة الحالية'
}

const buildEmployeeNarrative = (employee) => {
    const present = Number(employee?.attendance?.present || 0)
    const absent = Number(employee?.attendance?.absent || 0)
    const late = Number(employee?.attendance?.late || 0)
    const halfDay = Number(employee?.attendance?.half_day || 0)
    const unpaidLeaveDays = Number(employee?.unpaid_leave_days || 0)
    const reviewRating = Number(employee?.latest_review?.rating || 0)
    const reviewText = reviewRating > 0 ? `وآخر تقييم أداء له ${reviewRating.toFixed(1)} من 5` : 'ولا يوجد له تقييم أداء حديث'

    if (employee.score >= 85) {
        return `${employee.employee_name} يظهر أداءً قويًا بدرجة ${employee.score}/100، مع انضباط جيد في الحضور (${present} يوم حضور فعلي) ${reviewText}.`
    }

    if (employee.score >= 70) {
        return `${employee.employee_name} يحافظ على أداء جيد بدرجة ${employee.score}/100، لكن يحتاج متابعة خفيفة${late > 0 ? ` بسبب ${late} حالة تأخير` : ''}${halfDay > 0 ? ` و${halfDay} نصف يوم` : ''}.`
    }

    if (employee.score >= 55) {
        return `${employee.employee_name} في منطقة مستقرة نسبيًا بدرجة ${employee.score}/100، إلا أن المؤشرات تحتاج ضبط${late > 0 ? ` مع ${late} تأخير` : ''}${absent > 0 ? ` و${absent} غياب` : ''}.`
    }

    return `${employee.employee_name} يحتاج تدخلًا إداريًا قريبًا بدرجة ${employee.score}/100، حيث سُجل له ${absent} غياب و${late} تأخير${unpaidLeaveDays > 0 ? ` و${unpaidLeaveDays} يوم إجازة غير مدفوعة` : ''}.`
}

const buildDepartmentNarrative = (department) => {
    if (department.average_score >= 85) {
        return `قسم ${department.department_name} يتصدر الأداء بمتوسط ${department.average_score}/100، ويبدو أكثر الأقسام استقرارًا حاليًا.`
    }
    if (department.average_score >= 70) {
        return `قسم ${department.department_name} يحقق متوسطًا جيدًا (${department.average_score}/100) ويحتاج فقط متابعة تشغيلية دورية.`
    }
    if (department.average_score >= 55) {
        return `قسم ${department.department_name} في مستوى متوسط (${department.average_score}/100)، ويستفيد من مراجعة الانضباط والأهداف خلال الفترة الحالية.`
    }
    return `قسم ${department.department_name} يحتاج دعمًا إداريًا واضحًا لأن متوسط الأداء الحالي ${department.average_score}/100 فقط.`
}

const buildManagerBrief = ({ averageScore, excellentCount, needsAttentionCount, departmentRankings, topPerformer }) => {
    const bestDepartment = departmentRankings?.[0]
    const opener = averageScore >= 80
        ? `المستوى العام لأداء الفريق جيد جدًا بمتوسط ${averageScore}/100.`
        : averageScore >= 65
            ? `المستوى العام لأداء الفريق مستقر بمتوسط ${averageScore}/100، لكنه يحتاج متابعة تشغيلية منتظمة.`
            : `المستوى العام لأداء الفريق يحتاج تدخلًا أوضح، لأن متوسط الأداء الحالي ${averageScore}/100 فقط.`

    const excellenceText = excellentCount > 0
        ? ` يوجد ${excellentCount} موظف/موظفين في فئة الأداء الممتاز.`
        : ' لا توجد حالات أداء ممتاز بارزة حاليًا.'

    const attentionText = needsAttentionCount > 0
        ? ` كما توجد ${needsAttentionCount} حالة تحتاج متابعة مباشرة.`
        : ' ولا توجد حالات حرجة بارزة تحتاج تدخلًا عاجلًا الآن.'

    const departmentText = bestDepartment
        ? ` أفضل قسم حاليًا هو ${bestDepartment.department_name} بمتوسط ${bestDepartment.average_score}/100.`
        : ''

    const performerText = topPerformer
        ? ` أفضل موظف ظاهر في التحليل هو ${topPerformer.employee_name} بدرجة ${topPerformer.score}/100.`
        : ''

    return `${opener}${excellenceText}${attentionText}${departmentText}${performerText}`.trim()
}

const buildEmployeePerformanceInsights = async ({ employees, periodRange, branchId }) => {
    if (!Array.isArray(employees) || employees.length === 0 || !periodRange?.from || !periodRange?.to) {
        return {
            model: 'zimam_hr_ai_score_v1',
            analysis_period: periodRange || null,
            average_score: 0,
            excellent_count: 0,
            stable_count: 0,
            needs_attention_count: 0,
            top_performers: [],
            attention_needed: [],
            department_rankings: [],
            quick_insights: ['لا توجد بيانات كافية لإنشاء تحليل أداء ذكي في الفترة الحالية']
        }
    }

    const employeeIds = employees.map((employee) => employee.id)
    const [attendanceRows, reviewRows, unpaidLeaveRows] = await Promise.all([
        HRAttendance.findAll({
            attributes: ['employee_id', 'status', [fn('COUNT', col('id')), 'count']],
            where: {
                employee_id: { [Op.in]: employeeIds },
                attendance_date: {
                    [Op.gte]: periodRange.from,
                    [Op.lt]: periodRange.to
                }
            },
            group: ['employee_id', 'status']
        }),
        PerformanceReview.findAll({
            where: {
                employee_id: { [Op.in]: employeeIds },
                status: { [Op.in]: ['completed', 'reviewed'] }
            },
            attributes: [
                'id',
                'employee_id',
                'overall_rating',
                'status',
                'review_date',
                'created_at',
                'updated_at'
            ],
            order: [['employee_id', 'ASC'], ['review_date', 'DESC'], ['updated_at', 'DESC'], ['created_at', 'DESC']]
        }),
        LeaveRequest.findAll({
            where: {
                employee_id: { [Op.in]: employeeIds },
                leave_type: 'unpaid',
                status: 'approved',
                start_date: { [Op.lt]: periodRange.to },
                end_date: { [Op.gte]: periodRange.from },
                ...(branchId ? { branch_id: branchId } : {})
            },
            attributes: ['employee_id', 'start_date', 'end_date'],
            order: [['start_date', 'ASC']]
        })
    ])

    const attendanceMap = new Map()
    attendanceRows.forEach((row) => {
        const employeeId = row.get('employee_id')
        const status = row.get('status')
        const count = parseInt(row.get('count'), 10) || 0
        const current = attendanceMap.get(employeeId) || { present: 0, absent: 0, late: 0, half_day: 0, leave: 0 }
        current[status] = count
        attendanceMap.set(employeeId, current)
    })

    const latestReviewMap = new Map()
    reviewRows.forEach((row) => {
        if (!latestReviewMap.has(row.employee_id)) {
            latestReviewMap.set(row.employee_id, row)
        }
    })

    const unpaidLeaveMap = new Map()
    const rangeStart = parseUtcDate(periodRange.from)
    const rangeEndExclusive = parseUtcDate(periodRange.to)
    unpaidLeaveRows.forEach((row) => {
        const overlapDays = getDateOverlapDays(row.start_date, row.end_date, rangeStart, rangeEndExclusive)
        if (overlapDays <= 0) return
        unpaidLeaveMap.set(row.employee_id, (unpaidLeaveMap.get(row.employee_id) || 0) + overlapDays)
    })

    const scoredEmployees = employees.map((employee) => {
        const attendance = attendanceMap.get(employee.id) || { present: 0, absent: 0, late: 0, half_day: 0, leave: 0 }
        const latestReview = latestReviewMap.get(employee.id) || null
        const unpaidLeaveDays = unpaidLeaveMap.get(employee.id) || 0
        const trackedDays = Object.values(attendance).reduce((sum, count) => sum + Number(count || 0), 0)
        const attendedDays = Number(attendance.present || 0) + Number(attendance.late || 0) + Number(attendance.half_day || 0)
        const effectivePresence = Number(attendance.present || 0)
            + (Number(attendance.late || 0) * 0.85)
            + (Number(attendance.half_day || 0) * 0.5)
            + (Number(attendance.leave || 0) * 0.75)
        const attendanceRatio = trackedDays > 0 ? (effectivePresence / trackedDays) : 0.55
        const punctualityRatio = attendedDays > 0 ? Math.max(0, 1 - (Number(attendance.late || 0) / attendedDays)) : 0.7
        const consistencyRatio = trackedDays > 0 ? Math.max(0, 1 - (Number(attendance.absent || 0) / trackedDays)) : 0.75
        const reviewRatio = latestReview?.overall_rating
            ? clampScore(Number(latestReview.overall_rating || 0) / 5, 0, 1)
            : 0.6
        const unpaidPenalty = Math.min(unpaidLeaveDays * 0.03, 0.18)
        const rawScore = (
            (attendanceRatio * 0.45)
            + (punctualityRatio * 0.2)
            + (consistencyRatio * 0.15)
            + (reviewRatio * 0.2)
        ) * 100
        const score = roundScore(clampScore(rawScore - (unpaidPenalty * 100)))
        const departmentName = employee.department?.name_ar || 'بدون قسم'

        return {
            employee_id: employee.id,
            employee_code: employee.employee_code,
            employee_name: getEmployeeDisplayName(employee),
            department_name: departmentName,
            designation_name: employee.designation?.title_ar || 'بدون مسمى',
            score,
            label: getPerformanceBand(score),
            recommendation: getPerformanceRecommendation({ score, attendance, unpaidLeaveDays, latestReview }),
            attendance: {
                ...attendance,
                tracked_days: trackedDays
            },
            unpaid_leave_days: unpaidLeaveDays,
            latest_review: latestReview ? {
                rating: Number(latestReview.overall_rating || 0),
                status: latestReview.status,
                review_date: latestReview.review_date || latestReview.updated_at || latestReview.created_at
            } : null,
            narrative: ''
        }
    })

    const rankedEmployees = [...scoredEmployees].sort((a, b) => b.score - a.score)
    const departmentAggregate = new Map()
    scoredEmployees.forEach((employee) => {
        const current = departmentAggregate.get(employee.department_name) || { total: 0, count: 0 }
        current.total += employee.score
        current.count += 1
        departmentAggregate.set(employee.department_name, current)
    })

    const departmentRankings = [...departmentAggregate.entries()]
        .map(([department_name, row]) => ({
            department_name,
            average_score: roundScore(row.total / row.count),
            employees: row.count,
            narrative: ''
        }))
        .sort((a, b) => b.average_score - a.average_score)
        .slice(0, 5)

    const excellentCount = scoredEmployees.filter((employee) => employee.score >= 85).length
    const stableCount = scoredEmployees.filter((employee) => employee.score >= 55 && employee.score < 85).length
    const needsAttention = rankedEmployees
        .filter((employee) => employee.score < 55 || employee.attendance.absent >= 2 || employee.attendance.late >= 3)
        .sort((a, b) => a.score - b.score)
        .slice(0, 5)

    const quickInsights = []
    if (departmentRankings[0]) {
        quickInsights.push(`أفضل متوسط أداء حاليًا في قسم ${departmentRankings[0].department_name} بدرجة ${departmentRankings[0].average_score}`)
    }
    if (excellentCount > 0) {
        quickInsights.push(`يوجد ${excellentCount} موظف/موظفين في فئة الأداء الممتاز خلال فترة التحليل`)
    }
    if (needsAttention.length > 0) {
        quickInsights.push(`أكبر أسباب المتابعة الحالية هي الغياب والتأخير لدى ${needsAttention.length} موظف/موظفين`)
    }
    if (quickInsights.length === 0) {
        quickInsights.push('المؤشرات الحالية مستقرة ولا توجد حالات حرجة بارزة في فترة التحليل')
    }

    const enrichedTopPerformers = rankedEmployees
        .slice(0, 5)
        .map((employee) => ({ ...employee, narrative: buildEmployeeNarrative(employee) }))
    const enrichedAttentionNeeded = needsAttention
        .map((employee) => ({ ...employee, narrative: buildEmployeeNarrative(employee) }))
    const enrichedDepartmentRankings = departmentRankings
        .map((department) => ({ ...department, narrative: buildDepartmentNarrative(department) }))
    const averageScore = roundScore(
        scoredEmployees.reduce((sum, employee) => sum + employee.score, 0) / scoredEmployees.length
    )

    return {
        model: 'zimam_hr_ai_score_v1',
        analysis_period: periodRange,
        average_score: averageScore,
        excellent_count: excellentCount,
        stable_count: stableCount,
        needs_attention_count: needsAttention.length,
        top_performers: enrichedTopPerformers,
        attention_needed: enrichedAttentionNeeded,
        department_rankings: enrichedDepartmentRankings,
        quick_insights: quickInsights,
        manager_brief: buildManagerBrief({
            averageScore,
            excellentCount,
            needsAttentionCount: needsAttention.length,
            departmentRankings: enrichedDepartmentRankings,
            topPerformer: enrichedTopPerformers[0]
        })
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
        const analysisPeriod = getPeriodDateRange(req.query.analysis_period || req.query.period || attendanceDate.slice(0, 7))
        const payrollWhere = {}
        if (payrollRange) {
            payrollWhere.salary_period = {
                [Op.gte]: payrollRange.from,
                [Op.lt]: payrollRange.to
            }
        }

        const [totalEmployees, activeEmployees, departmentsCount, pendingLeaves, monthlyPayroll, attendanceSummary, activeEmployeeRows] = await Promise.all([
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
            }),
            Employee.findAll({
                where: { ...employeeWhere, status: 'active' },
                attributes: ['id', 'employee_code', 'first_name_ar', 'last_name_ar', 'status'],
                include: [
                    { model: Department, as: 'department', attributes: ['id', 'name_ar'], required: false },
                    { model: Designation, as: 'designation', attributes: ['id', 'title_ar'], required: false }
                ],
                order: [['first_name_ar', 'ASC']]
            })
        ])

        const attendance = { present: 0, absent: 0, late: 0, half_day: 0, leave: 0 }
        attendanceSummary.forEach((row) => {
            const key = row.get('status')
            attendance[key] = parseInt(row.get('count'), 10)
        })

        const aiPerformance = await buildEmployeePerformanceInsights({
            employees: activeEmployeeRows,
            periodRange: analysisPeriod,
            branchId
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
                attendance,
                ai_performance: aiPerformance
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
                base_salary: req.body.base_salary !== undefined && req.body.base_salary !== null && req.body.base_salary !== ''
                    ? Number(req.body.base_salary)
                    : 0,
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
            if (updates.base_salary !== undefined && updates.base_salary !== null && updates.base_salary !== '') {
                updates.base_salary = Number(updates.base_salary)
            }

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
            const initialAttendanceState = resolveAttendanceTimeState({ payload: req.body })

            const [attendance, created] = await HRAttendance.findOrCreate({
                where: {
                    employee_id: req.body.employee_id,
                    attendance_date: req.body.attendance_date
                },
                defaults: {
                    branch_id: branchId,
                    check_in: initialAttendanceState.check_in,
                    check_out: initialAttendanceState.check_out,
                    status: req.body.status || 'present',
                    working_hours: initialAttendanceState.working_hours,
                    notes: req.body.notes || null,
                    recorded_by: req.user.userId
                },
                transaction: t
            })

            if (!created) {
                const nextAttendanceState = resolveAttendanceTimeState({
                    existingRecord: attendance,
                    payload: req.body
                })
                await attendance.update({
                    check_in: nextAttendanceState.check_in,
                    check_out: nextAttendanceState.check_out,
                    status: req.body.status ?? attendance.status,
                    working_hours: nextAttendanceState.working_hours,
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
        const employeeIds = [...new Set(rows.map((row) => row.employee_id).filter(Boolean))]
        const employees = await Employee.findAll({
            where: {
                id: { [Op.in]: employeeIds },
                ...(scopedBranchId ? { branch_id: scopedBranchId } : {})
            },
            attributes: ['id', 'branch_id'],
            transaction: t
        })
        const employeeMap = new Map(employees.map((employee) => [employee.id, employee]))

        let upserted = 0
        const skipped = []
        for (const [index, row] of rows.entries()) {
            const validationError = validateAttendanceRow(row)
            if (validationError) {
                skipped.push({ index, employee_id: row.employee_id || null, reason: validationError })
                continue
            }

            const employee = employeeMap.get(row.employee_id)
            if (!employee) {
                skipped.push({
                    index,
                    employee_id: row.employee_id || null,
                    reason: 'employee not found or out of branch scope'
                })
                continue
            }
            const initialAttendanceState = resolveAttendanceTimeState({ payload: row })
            const [attendance, created] = await HRAttendance.findOrCreate({
                where: {
                    employee_id: row.employee_id,
                    attendance_date: row.attendance_date
                },
                defaults: {
                    branch_id: scopedBranchId || employee.branch_id || req.user.branchId || null,
                    check_in: initialAttendanceState.check_in,
                    check_out: initialAttendanceState.check_out,
                    status: row.status || 'present',
                    working_hours: initialAttendanceState.working_hours,
                    notes: row.notes || null,
                    recorded_by: req.user.userId
                },
                transaction: t
            })

            if (!created) {
                const nextAttendanceState = resolveAttendanceTimeState({
                    existingRecord: attendance,
                    payload: row
                })
                await attendance.update({
                    check_in: nextAttendanceState.check_in,
                    check_out: nextAttendanceState.check_out,
                    status: row.status ?? attendance.status,
                    working_hours: nextAttendanceState.working_hours,
                    notes: row.notes ?? attendance.notes,
                    recorded_by: req.user.userId
                }, { transaction: t })
            }
            upserted += 1
        }

        await t.commit()
        res.json({
            message: 'تم تسجيل الحضور الجماعي بنجاح',
            data: {
                total_rows: rows.length,
                upserted,
                skipped_count: skipped.length,
                skipped
            }
        })
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
        if (req.query.status) where.status = req.query.status
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

            const nextAttendanceState = resolveAttendanceTimeState({
                existingRecord: row,
                payload: req.body
            })
            await row.update({
                check_in: nextAttendanceState.check_in,
                check_out: nextAttendanceState.check_out,
                status: req.body.status ?? row.status,
                working_hours: nextAttendanceState.working_hours,
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
        if (req.query.employee_id) where.employee_id = req.query.employee_id
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
        body('employee_id').notEmpty().withMessage('employee is required'),
        body('leave_type').isIn(LEAVE_TYPES).withMessage('leave_type is invalid'),
        body('start_date').isISO8601().withMessage('start_date is required'),
        body('end_date')
            .isISO8601().withMessage('end_date is required')
            .custom((endDate, { req }) => new Date(endDate) >= new Date(req.body.start_date))
            .withMessage('end_date must be on or after start_date'),
        body('number_of_days').optional().isFloat({ min: 0.5 }).withMessage('number_of_days must be greater than zero'),
        body('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']).withMessage('leave status is invalid')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return

        const t = await sequelize.transaction()
        try {
            const start = new Date(req.body.start_date)
            const end = new Date(req.body.end_date)
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
                await t.rollback()
                return res.status(400).json({ message: 'Leave dates are invalid' })
            }

            const requestedDays = Number(
                req.body.number_of_days || Math.max(Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1, 1)
            )
            const employee = await getScopedEmployee(req, req.body.employee_id, { transaction: t })
            if (!employee) {
                await t.rollback()
                return res.status(404).json({ message: 'Employee not found' })
            }

            const conflictingLeave = await findOverlappingLeaveRequest({
                employeeId: req.body.employee_id,
                startDate: req.body.start_date,
                endDate: req.body.end_date,
                transaction: t
            })
            if (conflictingLeave) {
                await t.rollback()
                return res.status(400).json({ message: 'An overlapping leave request already exists for this employee' })
            }

            const scopedBranchId = getBranchScope(req)
            const status = req.body.status || 'pending'
            const leavePayload = {
                employee_id: req.body.employee_id,
                branch_id: scopedBranchId || employee.branch_id || req.user.branchId || null,
                leave_type: req.body.leave_type,
                start_date: req.body.start_date,
                end_date: req.body.end_date,
                number_of_days: requestedDays,
                reason: req.body.reason || null,
                status,
                notes: req.body.notes || null,
                created_by: req.user.userId
            }

            if (status === 'approved') {
                leavePayload.approved_by = req.user.userId
                leavePayload.approved_date = new Date()
                await ensureLeaveCanBeApproved({
                    leave: {
                        employee_id: leavePayload.employee_id,
                        leave_type: leavePayload.leave_type,
                        start_date: leavePayload.start_date,
                        end_date: leavePayload.end_date,
                        number_of_days: leavePayload.number_of_days
                    },
                    transaction: t
                })
            }

            const leave = await LeaveRequest.create(leavePayload, { transaction: t })

            if (status === 'approved' && !LEAVE_BALANCE_EXEMPT_TYPES.includes(leave.leave_type)) {
                const [balance] = await getOrCreateLeaveBalance({ leave, transaction: t })
                const used = Number(balance.used || 0) + Number(leave.number_of_days || 0)
                const remaining = getLeaveRemaining(balance.opening_balance, balance.allocated, used, balance.carried_forward)
                await balance.update({ used, remaining }, { transaction: t })
            }

            await t.commit()
            return res.status(201).json({ message: 'Leave request created', data: leave })
        } catch (error) {
            await t.rollback()
            console.error('Create leave error:', error)
            return res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create leave request' })
        }
    }
)

router.put(
    '/leaves/:id',
    authenticate,
    authorize('admin', 'manager'),
    [body('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']).withMessage('leave status is invalid')],
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
                return res.status(404).json({ message: 'Leave request not found' })
            }

            const previousStatus = leave.status
            const nextStatus = req.body.status ?? leave.status
            let balance = null

            if (previousStatus !== 'approved' && nextStatus === 'approved') {
                balance = await ensureLeaveCanBeApproved({
                    leave,
                    transaction: t,
                    excludeId: leave.id
                })
            }

            await leave.update({
                status: nextStatus,
                notes: req.body.notes ?? leave.notes,
                approved_by: nextStatus === 'approved' ? req.user.userId : leave.approved_by,
                approved_date: nextStatus === 'approved'
                    ? new Date()
                    : (previousStatus === 'approved' ? null : leave.approved_date)
            }, { transaction: t })

            if (previousStatus !== nextStatus && ['approved', 'rejected', 'cancelled', 'pending'].includes(nextStatus)) {
                if (!LEAVE_BALANCE_EXEMPT_TYPES.includes(leave.leave_type)) {
                    if (!balance) {
                        const result = await getOrCreateLeaveBalance({ leave, transaction: t })
                        balance = result[0]
                    }

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
            }

            await t.commit()
            return res.json({ message: 'Leave request updated', data: leave })
        } catch (error) {
            await t.rollback()
            console.error('Update leave error:', error)
            return res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update leave request' })
        }
    }
)

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
        if (req.query.employee_id) where.employee_id = req.query.employee_id
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
        const periodRange = getPeriodDateRange(period)
        const payrollDayCount = getPayrollPeriodDayCount(periodRange)
        if (!period) return res.status(400).json({ message: 'period غير صحيح، مطلوب YYYY-MM' })

        const t = await sequelize.transaction()
        try {
            const branchId = getBranchScope(req)
            const latePolicy = getPayrollLatePolicy()
            const employees = await Employee.findAll({
                where: {
                    status: 'active',
                    ...(branchId ? { branch_id: branchId } : {})
                },
                include: [{ model: Designation, as: 'designation', attributes: ['base_salary'] }],
                transaction: t
            })
            const attendanceSummaryMap = await getAttendancePayrollSummaryMap({
                employeeIds: employees.map((employee) => employee.id),
                periodRange,
                transaction: t
            })

            let processed = 0
            let locked = 0
            let createdCount = 0
            let updatedCount = 0
            const attendanceTotals = {
                absent_days: 0,
                half_days: 0,
                late_marks: 0,
                excess_late_marks: 0,
                attendance_deduction_total: 0,
                late_deduction_total: 0,
                unpaid_leave_days: 0,
                unpaid_leave_deduction_total: 0
            }
            for (const employee of employees) {
                const periodDate = new Date(`${period}-01`)
                const baseSalary = await resolveEmployeeBaseSalary({
                    employee,
                    requestBaseSalary: req.body.base_salary,
                    transaction: t
                })
                const unpaidLeaveSummary = await getApprovedUnpaidLeaveSummary({
                    employeeId: employee.id,
                    periodRange,
                    transaction: t
                })
                const unpaidLeaveDays = unpaidLeaveSummary.days
                const dailyRate = payrollDayCount > 0 ? normalizeMoneyValue(baseSalary / payrollDayCount) : 0
                const unpaidLeaveDeduction = normalizeMoneyValue(dailyRate * unpaidLeaveDays)
                const attendanceSummary = finalizeAttendancePayrollSummary({
                    summary: attendanceSummaryMap.get(employee.id),
                    dailyRate,
                    latePolicy
                })
                const attendanceDeduction = normalizeMoneyValue(
                    attendanceSummary.absence_deduction
                    + attendanceSummary.half_day_deduction
                    + attendanceSummary.late_deduction
                )
                const existingSalary = await EmployeeSalary.findOne({
                    where: {
                        employee_id: employee.id,
                        salary_period: periodDate
                    },
                    transaction: t
                })

                if (existingSalary) {
                    if (isPayrollLockedStatus(existingSalary.status)) {
                        locked += 1
                        continue
                    }

                    const adjustmentSummary = await getSalaryAdjustmentSummary({
                        salaryId: existingSalary.id,
                        transaction: t
                    })
                    const grossSalary = normalizeMoneyValue(baseSalary + adjustmentSummary.allowances)
                    const totalDeductions = normalizeMoneyValue(
                        adjustmentSummary.deductions + unpaidLeaveDeduction + attendanceDeduction
                    )
                    const netSalary = Math.max(normalizeMoneyValue(grossSalary - totalDeductions), 0)

                    await existingSalary.update({
                        base_salary: baseSalary,
                        gross_salary: grossSalary,
                        net_salary: netSalary,
                        status: 'processing',
                        notes: req.body.notes ?? existingSalary.notes
                    }, { transaction: t })
                    await syncAutoUnpaidLeaveComponent({
                        salaryId: existingSalary.id,
                        unpaidLeaveDays,
                        deductionAmount: unpaidLeaveDeduction,
                        transaction: t
                    })
                    await syncAutoAttendanceDeductionComponents({
                        salaryId: existingSalary.id,
                        attendanceSummary,
                        transaction: t
                    })
                    attendanceTotals.absent_days += Number(attendanceSummary.absent || 0)
                    attendanceTotals.half_days += Number(attendanceSummary.half_day || 0)
                    attendanceTotals.late_marks += Number(attendanceSummary.late || 0)
                    attendanceTotals.excess_late_marks += Number(attendanceSummary.excess_late_marks || 0)
                    attendanceTotals.attendance_deduction_total = normalizeMoneyValue(
                        attendanceTotals.attendance_deduction_total + attendanceDeduction
                    )
                    attendanceTotals.late_deduction_total = normalizeMoneyValue(
                        attendanceTotals.late_deduction_total + Number(attendanceSummary.late_deduction || 0)
                    )
                    attendanceTotals.unpaid_leave_days += Number(unpaidLeaveDays || 0)
                    attendanceTotals.unpaid_leave_deduction_total = normalizeMoneyValue(
                        attendanceTotals.unpaid_leave_deduction_total + unpaidLeaveDeduction
                    )
                    processed += 1
                    updatedCount += 1
                    continue
                }

                const grossSalary = normalizeMoneyValue(baseSalary)
                const netSalary = Math.max(normalizeMoneyValue(grossSalary - unpaidLeaveDeduction - attendanceDeduction), 0)
                const createdSalary = await EmployeeSalary.create({
                    employee_id: employee.id,
                    salary_period: periodDate,
                    base_salary: baseSalary,
                    gross_salary: grossSalary,
                    net_salary: netSalary,
                    status: 'processing',
                    notes: req.body.notes || null,
                    created_by: req.user.userId
                }, { transaction: t })
                await syncAutoUnpaidLeaveComponent({
                    salaryId: createdSalary.id,
                    unpaidLeaveDays,
                    deductionAmount: unpaidLeaveDeduction,
                    transaction: t
                })
                await syncAutoAttendanceDeductionComponents({
                    salaryId: createdSalary.id,
                    attendanceSummary,
                    transaction: t
                })
                attendanceTotals.absent_days += Number(attendanceSummary.absent || 0)
                attendanceTotals.half_days += Number(attendanceSummary.half_day || 0)
                attendanceTotals.late_marks += Number(attendanceSummary.late || 0)
                attendanceTotals.excess_late_marks += Number(attendanceSummary.excess_late_marks || 0)
                attendanceTotals.attendance_deduction_total = normalizeMoneyValue(
                    attendanceTotals.attendance_deduction_total + attendanceDeduction
                )
                attendanceTotals.late_deduction_total = normalizeMoneyValue(
                    attendanceTotals.late_deduction_total + Number(attendanceSummary.late_deduction || 0)
                )
                attendanceTotals.unpaid_leave_days += Number(unpaidLeaveDays || 0)
                attendanceTotals.unpaid_leave_deduction_total = normalizeMoneyValue(
                    attendanceTotals.unpaid_leave_deduction_total + unpaidLeaveDeduction
                )
                createdCount += 1
                processed += 1
            }

            await t.commit()
            AuditService.log({
                req,
                category: 'hr',
                action: 'payroll_processed',
                entityType: 'Payroll',
                entityId: period,
                newValue: {
                    period,
                    employees_processed: processed,
                    created: createdCount,
                    updated: updatedCount,
                    skipped_locked: locked,
                    attendance_summary: attendanceTotals
                },
                metadata: {
                    period,
                    employees_processed: processed,
                    created: createdCount,
                    updated: updatedCount,
                    skipped_locked: locked,
                    attendance_summary: attendanceTotals
                }
            })
            res.json({
                message: 'تمت معالجة الرواتب بنجاح',
                data: {
                    period,
                    employees_processed: processed,
                    created: createdCount,
                    updated: updatedCount,
                    skipped_locked: locked,
                    attendance_summary: attendanceTotals
                }
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
        const employeeWhere = {}

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
        if (branchId) employeeWhere.branch_id = branchId
        else if (req.query.branch_id) employeeWhere.branch_id = req.query.branch_id
        if (req.query.employee_id) employeeWhere.id = req.query.employee_id
        if (req.query.department_id) employeeWhere.department_id = req.query.department_id
        if (req.query.designation_id) employeeWhere.designation_id = req.query.designation_id

        const include = [
            {
                model: Employee,
                as: 'employee',
                required: true,
                where: Object.keys(employeeWhere).length ? employeeWhere : undefined,
                attributes: [
                    'id',
                    'employee_code',
                    'first_name_ar',
                    'last_name_ar',
                    'first_name_en',
                    'last_name_en',
                    'branch_id',
                    'department_id',
                    'designation_id'
                ],
                include: [
                    { model: Department, as: 'department', attributes: ['id', 'name_ar'], required: false },
                    { model: Designation, as: 'designation', attributes: ['id', 'title_ar'], required: false },
                    { model: Branch, as: 'branch', attributes: ['id', 'name_ar'], required: false }
                ]
            },
            { model: SalaryComponent, as: 'components' }
        ]

        const { count, rows } = await EmployeeSalary.findAndCountAll({
            where,
            include,
            distinct: true,
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
        if (isPayrollLockedStatus(salary.status)) {
            await t.rollback()
            return res.status(400).json({ message: 'Cannot edit an approved or paid payroll record' })
        }
        if (req.body.status && ['approved', 'paid'].includes(req.body.status) && req.body.status !== salary.status) {
            await t.rollback()
            return res.status(400).json({ message: 'Use dedicated approve or disburse actions for payroll status changes' })
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
        AuditService.log({
            req,
            category: 'hr',
            action: 'payroll_approved',
            entityType: 'Payroll',
            entityId: 'batch',
            newValue: { salary_ids: allowedIds, updated },
            metadata: { salary_ids: allowedIds, updated }
        })

        res.json({ message: 'تم اعتماد الرواتب', data: { updated } })
    } catch (error) {
        console.error('Approve payroll error:', error)
        res.status(500).json({ message: error.message || 'خطأ في اعتماد الرواتب' })
    }
})

router.post('/payroll/disburse', authenticate, authorize('admin', 'manager'), async (req, res) => {
    const ids = Array.isArray(req.body.salary_ids) ? req.body.salary_ids : []
    const paymentMethod = normalizePayrollPaymentMethod(req.body.payment_method)
    const paymentDateInput = req.body.payment_date ? String(req.body.payment_date) : null

    if (!ids.length) return res.status(400).json({ message: 'salary_ids is required' })
    if (paymentDateInput && Number.isNaN(new Date(`${paymentDateInput}T00:00:00.000Z`).getTime())) {
        return res.status(400).json({ message: 'payment_date is invalid' })
    }

    const transaction = await sequelize.transaction()

    try {
        const branchId = getBranchScope(req)
        const allowedRows = await EmployeeSalary.findAll({
            where: { id: { [Op.in]: ids } },
            include: [{
                model: Employee,
                as: 'employee',
                required: true,
                attributes: ['id', 'employee_code', 'first_name_ar', 'last_name_ar', 'branch_id'],
                ...(branchId ? { where: { branch_id: branchId } } : {})
            }],
            attributes: ['id', 'employee_id', 'salary_period', 'net_salary', 'status', 'notes'],
            order: [['created_at', 'ASC']],
            transaction
        })

        if (!allowedRows.length) {
            await transaction.rollback()
            return res.status(403).json({ message: 'No payroll records found within the current branch scope' })
        }

        const paidDate = paymentDateInput
            ? new Date(`${paymentDateInput}T00:00:00.000Z`)
            : new Date()
        const skipped = []
        const postedEntries = []
        let updated = 0

        for (const salary of allowedRows) {
            if (salary.status !== 'approved') {
                skipped.push({
                    salary_id: salary.id,
                    employee_id: salary.employee_id,
                    reason: 'not_approved',
                    status: salary.status
                })
                continue
            }

            const amount = Math.round(Number(salary.net_salary || 0) * 100) / 100
            if (amount <= 0) {
                skipped.push({
                    salary_id: salary.id,
                    employee_id: salary.employee_id,
                    reason: 'non_positive_net_salary'
                })
                continue
            }

            const entry = await createPayrollDisbursementEntry({
                salary,
                employee: salary.employee,
                paymentMethod,
                paymentDate: paidDate.toISOString().slice(0, 10),
                createdBy: req.user.userId,
                transaction
            })

            const disbursementNote = `Disbursed via ${paymentMethod} on ${paidDate.toISOString().slice(0, 10)}`
            const nextNotes = salary.notes
                ? `${salary.notes}\n${disbursementNote}`
                : disbursementNote

            await salary.update({
                status: 'paid',
                paid_date: paidDate,
                notes: nextNotes
            }, { transaction })

            postedEntries.push({
                salary_id: salary.id,
                journal_entry_id: entry?.id || null,
                journal_entry_number: entry?.entry_number || null
            })
            updated += 1
        }

        await transaction.commit()

        AuditService.log({
            req,
            category: 'hr',
            action: 'payroll_disbursed',
            entityType: 'Payroll',
            entityId: 'batch',
            newValue: {
                salary_ids: allowedRows.map((row) => row.id),
                updated,
                skipped_count: skipped.length,
                payment_method: paymentMethod,
                payment_date: paidDate.toISOString().slice(0, 10),
                posted_entries: postedEntries
            },
            metadata: {
                salary_ids: allowedRows.map((row) => row.id),
                updated,
                skipped_count: skipped.length,
                payment_method: paymentMethod,
                payment_date: paidDate.toISOString().slice(0, 10),
                posted_entries: postedEntries
            }
        })

        return res.json({
            message: 'Payroll disbursed successfully',
            data: {
                updated,
                skipped_count: skipped.length,
                skipped,
                payment_method: paymentMethod,
                payment_date: paidDate.toISOString().slice(0, 10),
                posted_entries: postedEntries
            }
        })
    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback()
        }
        console.error('Disburse payroll error:', error)
        return res.status(error.statusCode || 500).json({ message: error.message || 'Failed to disburse payroll' })
    }
})

router.get('/payroll/reports/summary', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const branchId = getBranchScope(req)
        const where = {}
        const employeeWhere = {}
        if (req.query.period) {
            const periodRange = getPeriodDateRange(req.query.period)
            if (periodRange) {
                where.salary_period = {
                    [Op.gte]: periodRange.from,
                    [Op.lt]: periodRange.to
                }
            }
        }
        if (branchId) employeeWhere.branch_id = branchId
        else if (req.query.branch_id) employeeWhere.branch_id = req.query.branch_id
        if (req.query.employee_id) employeeWhere.id = req.query.employee_id
        if (req.query.department_id) employeeWhere.department_id = req.query.department_id
        if (req.query.designation_id) employeeWhere.designation_id = req.query.designation_id
        const includeByScope = Object.keys(employeeWhere).length
            ? [{ model: Employee, as: 'employee', required: true, where: employeeWhere, attributes: [] }]
            : undefined

        const [totalNet, totalGross, byStatus] = await Promise.all([
            EmployeeSalary.sum('net_salary', { where, include: includeByScope }),
            EmployeeSalary.sum('gross_salary', { where, include: includeByScope }),
            EmployeeSalary.findAll({
                attributes: ['status', [fn('COUNT', col('id')), 'count']],
                where,
                include: includeByScope,
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
        const where = {}
        const branchId = getBranchScope(req)
        if (branchId) where.branch_id = branchId
        else if (req.query.branch_id) where.branch_id = req.query.branch_id
        if (req.query.status) where.status = req.query.status

        const rows = await TrainingProgram.findAll({
            attributes: ['status', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('budget')), 'total_budget']],
            where,
            group: ['status']
        })

        return res.json({ data: rows })
    } catch (error) {
        console.error('Training summary error:', error)
        return res.status(error.statusCode || 500).json({ message: error.message || 'Failed to load training summary' })
    }
})

router.get('/training/programs', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const { page, limit, offset } = normalizePagination(req.query)
        const where = {}
        const branchId = getBranchScope(req)
        if (branchId) where.branch_id = branchId
        else if (req.query.branch_id) where.branch_id = req.query.branch_id
        if (req.query.status) where.status = req.query.status

        const { count, rows } = await TrainingProgram.findAndCountAll({
            where,
            include: [
                { model: Employee, as: 'trainerEmployee', attributes: ['id', 'employee_code', 'first_name_ar', 'last_name_ar', 'branch_id'] },
                { model: Branch, as: 'branch', attributes: ['id', 'name_ar', 'name_en'] }
            ],
            order: [['start_date', 'DESC'], ['created_at', 'DESC']],
            limit,
            offset
        })

        return sendPaginatedResponse(res, rows, count, page, limit)
    } catch (error) {
        console.error('List training programs error:', error)
        return res.status(error.statusCode || 500).json({ message: error.message || 'Failed to load training programs' })
    }
})

router.post(
    '/training',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('program_name_ar').notEmpty().withMessage('program_name_ar is required'),
        body('start_date').optional({ checkFalsy: true }).isISO8601().withMessage('start_date is invalid'),
        body('end_date')
            .optional({ checkFalsy: true })
            .isISO8601().withMessage('end_date is invalid')
            .custom((endDate, { req }) => !req.body.start_date || new Date(endDate) >= new Date(req.body.start_date))
            .withMessage('end_date must be on or after start_date'),
        body('duration_days').optional().isInt({ min: 1 }).withMessage('duration_days must be a positive integer'),
        body('budget').optional().isFloat({ min: 0 }).withMessage('budget must be a positive number'),
        body('status').optional().isIn(['planned', 'in_progress', 'completed', 'cancelled']).withMessage('training status is invalid')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return

        try {
            const trainerId = req.body.trainer || null
            let trainer = null
            if (trainerId) {
                trainer = await getScopedEmployee(req, trainerId)
                if (!trainer) return res.status(404).json({ message: 'Trainer not found' })
            }

            const branchId = resolveTrainingBranchId({ req, trainer })
            const program = await TrainingProgram.create({
                program_name_ar: req.body.program_name_ar,
                program_name_en: req.body.program_name_en || null,
                description: req.body.description || null,
                start_date: req.body.start_date || null,
                end_date: req.body.end_date || null,
                duration_days: req.body.duration_days || null,
                trainer: trainerId,
                branch_id: branchId,
                budget: req.body.budget || 0,
                status: req.body.status || 'planned',
                created_by: req.user.userId
            })

            return res.status(201).json({ message: 'Training program created', data: program })
        } catch (error) {
            console.error('Create training program error:', error)
            return res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create training program' })
        }
    }
)

router.put(
    '/training/:id',
    authenticate,
    authorize('admin', 'manager'),
    [
        body('start_date').optional({ checkFalsy: true }).isISO8601().withMessage('start_date is invalid'),
        body('end_date')
            .optional({ checkFalsy: true })
            .isISO8601().withMessage('end_date is invalid')
            .custom((endDate, { req }) => !req.body.start_date || new Date(endDate) >= new Date(req.body.start_date))
            .withMessage('end_date must be on or after start_date'),
        body('duration_days').optional().isInt({ min: 1 }).withMessage('duration_days must be a positive integer'),
        body('budget').optional().isFloat({ min: 0 }).withMessage('budget must be a positive number'),
        body('status').optional().isIn(['planned', 'in_progress', 'completed', 'cancelled']).withMessage('training status is invalid')
    ],
    async (req, res) => {
        if (!ensureValidRequest(req, res)) return

        try {
            const branchId = getBranchScope(req)
            const where = { id: req.params.id }
            if (branchId) where.branch_id = branchId
            else if (req.body.branch_id) where.branch_id = req.body.branch_id

            const program = await TrainingProgram.findOne({ where })
            if (!program) return res.status(404).json({ message: 'Training program not found' })

            let trainer = null
            if (req.body.trainer) {
                trainer = await getScopedEmployee(req, req.body.trainer)
                if (!trainer) return res.status(404).json({ message: 'Trainer not found' })
            } else if (program.trainer) {
                trainer = await Employee.findByPk(program.trainer, { attributes: ['id', 'branch_id'] })
            }

            const resolvedBranchId = resolveTrainingBranchId({
                req: { ...req, body: { ...req.body, branch_id: req.body.branch_id ?? program.branch_id } },
                trainer
            })

            await program.update({
                program_name_ar: req.body.program_name_ar ?? program.program_name_ar,
                program_name_en: req.body.program_name_en ?? program.program_name_en,
                description: req.body.description ?? program.description,
                start_date: req.body.start_date ?? program.start_date,
                end_date: req.body.end_date ?? program.end_date,
                duration_days: req.body.duration_days ?? program.duration_days,
                trainer: req.body.trainer ?? program.trainer,
                branch_id: resolvedBranchId,
                budget: req.body.budget ?? program.budget,
                status: req.body.status ?? program.status
            })

            return res.json({ message: 'Training program updated', data: program })
        } catch (error) {
            console.error('Update training program error:', error)
            return res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update training program' })
        }
    }
)

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



