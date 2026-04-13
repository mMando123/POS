const request = require('supertest')
const express = require('express')
const { Op } = require('sequelize')

const mockAuthUser = {
    userId: 'user-123',
    branchId: 'branch-1',
    role: 'manager'
}

const mockBranchModel = {}
const mockDepartmentModel = {}
const mockDesignationModel = {}
const mockEmployeeModel = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn()
}
const mockUserModel = {}
const mockDeliveryPersonnelModel = {}
const mockEmployeeSalaryModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn()
}
const mockSalaryComponentModel = {
    destroy: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn()
}
const mockAttendanceModel = {
    findAll: jest.fn(),
    findOrCreate: jest.fn(),
    findOne: jest.fn()
}
const mockLeaveRequestModel = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn()
}
const mockLeaveBalanceModel = {
    findOrCreate: jest.fn()
}
const mockPerformanceReviewModel = {}
const mockTrainingProgramModel = {
    findAndCountAll: jest.fn()
}
const mockSequelize = {
    transaction: jest.fn()
}

const mockAuditService = {
    log: jest.fn()
}

const mockAccountingService = {
    createJournalEntry: jest.fn()
}

const mockAccountResolver = {
    resolveMany: jest.fn()
}

const mockAccountKeys = {
    CASH: 'default_cash_account',
    BANK: 'default_bank_account',
    SALARIES_EXPENSE: 'default_salaries_expense_account'
}
const mockLoadSettings = jest.fn()

jest.mock('../../src/models', () => ({
    sequelize: mockSequelize,
    Branch: mockBranchModel,
    Department: mockDepartmentModel,
    Designation: mockDesignationModel,
    Employee: mockEmployeeModel,
    User: mockUserModel,
    DeliveryPersonnel: mockDeliveryPersonnelModel,
    EmployeeSalary: mockEmployeeSalaryModel,
    SalaryComponent: mockSalaryComponentModel,
    HRAttendance: mockAttendanceModel,
    LeaveRequest: mockLeaveRequestModel,
    LeaveBalance: mockLeaveBalanceModel,
    PerformanceReview: mockPerformanceReviewModel,
    TrainingProgram: mockTrainingProgramModel
}))

jest.mock('../../src/services/auditService', () => mockAuditService)
jest.mock('../../src/services/accountingService', () => mockAccountingService)
jest.mock('../../src/services/accountResolver', () => ({
    AccountResolver: mockAccountResolver,
    ACCOUNT_KEYS: mockAccountKeys
}))
jest.mock('../../src/routes/settings', () => ({
    loadSettings: mockLoadSettings
}))
jest.mock('../../src/middleware/auth', () => ({
    authenticate: (req, res, next) => {
        req.user = { ...mockAuthUser }
        next()
    },
    authorize: () => (req, res, next) => next()
}))

const hrRoutes = require('../../src/routes/hr')

const createTransaction = () => ({
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    finished: undefined
})

describe('HR Routes', () => {
    let app

    beforeEach(() => {
        jest.clearAllMocks()
        mockAuthUser.userId = 'user-123'
        mockAuthUser.branchId = 'branch-1'
        mockAuthUser.role = 'manager'
        mockSalaryComponentModel.findAll.mockResolvedValue([])
        mockAttendanceModel.findAll.mockResolvedValue([])
        mockLeaveRequestModel.findAll.mockResolvedValue([])
        mockLoadSettings.mockReturnValue({
            hr: {
                payrollLatePolicy: {
                    enabled: false,
                    graceCount: 0,
                    deductionType: 'fixed_amount',
                    deductionValue: 0
                }
            }
        })

        app = express()
        app.use(express.json())
        app.use('/api/hr', hrRoutes)
    })

    it('prevents editing approved payroll records', async () => {
        const transaction = createTransaction()
        mockSequelize.transaction.mockResolvedValue(transaction)
        mockEmployeeSalaryModel.findOne.mockResolvedValue({
            id: 'salary-1',
            status: 'approved'
        })

        const res = await request(app)
            .put('/api/hr/payroll/salaries/salary-1')
            .send({ notes: 'should fail' })

        expect(res.status).toBe(400)
        expect(res.body.message).toBe('Cannot edit an approved or paid payroll record')
        expect(transaction.rollback).toHaveBeenCalled()
    })

    it('filters payroll salaries by branch, department, and employee while including employee metadata', async () => {
        mockAuthUser.role = 'admin'
        mockAuthUser.branchId = null
        mockEmployeeSalaryModel.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [{ id: 'salary-1' }]
        })

        const res = await request(app)
            .get('/api/hr/payroll/salaries')
            .query({
                period: '2026-04',
                status: 'processing',
                branch_id: 'branch-2',
                department_id: 'dep-1',
                employee_id: 'employee-1',
                limit: 20,
                page: 1
            })

        expect(res.status).toBe(200)
        expect(mockEmployeeSalaryModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                status: 'processing',
                salary_period: {
                    [Op.gte]: '2026-04-01',
                    [Op.lt]: '2026-05-01'
                }
            }),
            distinct: true,
            include: expect.arrayContaining([
                expect.objectContaining({
                    as: 'employee',
                    required: true,
                    where: {
                        branch_id: 'branch-2',
                        department_id: 'dep-1',
                        id: 'employee-1'
                    },
                    include: expect.arrayContaining([
                        expect.objectContaining({ as: 'department' }),
                        expect.objectContaining({ as: 'designation' }),
                        expect.objectContaining({ as: 'branch' })
                    ])
                }),
                expect.objectContaining({ as: 'components' })
            ])
        }))

        mockAuthUser.role = 'manager'
        mockAuthUser.branchId = 'branch-1'
    })

    it('uses employee base_salary as the primary payroll source and deducts attendance and unpaid leave days', async () => {
        const transaction = createTransaction()
        mockSequelize.transaction.mockResolvedValue(transaction)
        mockLoadSettings.mockReturnValue({
            hr: {
                payrollLatePolicy: {
                    enabled: true,
                    graceCount: 1,
                    deductionType: 'fixed_amount',
                    deductionValue: 25
                }
            }
        })
        mockEmployeeModel.findAll.mockResolvedValue([
            {
                id: 'employee-1',
                base_salary: 3200,
                designation: { base_salary: 1800 }
            }
        ])
        mockEmployeeSalaryModel.findOne.mockResolvedValue(null)
        mockEmployeeSalaryModel.create.mockResolvedValue({ id: 'salary-new' })
        mockLeaveRequestModel.findAll.mockResolvedValue([
            {
                id: 'leave-1',
                start_date: '2026-04-10',
                end_date: '2026-04-11',
                number_of_days: 2
            }
        ])
        mockAttendanceModel.findAll.mockResolvedValue([
            {
                get: (key) => ({
                    employee_id: 'employee-1',
                    status: 'absent',
                    count: '1'
                })[key]
            },
            {
                get: (key) => ({
                    employee_id: 'employee-1',
                    status: 'half_day',
                    count: '1'
                })[key]
            },
            {
                get: (key) => ({
                    employee_id: 'employee-1',
                    status: 'late',
                    count: '2'
                })[key]
            }
        ])

        const res = await request(app)
            .post('/api/hr/payroll/process')
            .send({ period: '2026-04' })

        expect(res.status).toBe(200)
        expect(res.body.data.attendance_summary).toEqual({
            absent_days: 1,
            half_days: 1,
            late_marks: 2,
            excess_late_marks: 1,
            attendance_deduction_total: 185.01,
            late_deduction_total: 25,
            unpaid_leave_days: 2,
            unpaid_leave_deduction_total: 213.34
        })
        expect(mockEmployeeSalaryModel.create).toHaveBeenCalledWith(expect.objectContaining({
            employee_id: 'employee-1',
            base_salary: 3200,
            gross_salary: 3200,
            net_salary: expect.closeTo(2801.65, 2),
            status: 'processing'
        }), { transaction })
        expect(mockSalaryComponentModel.destroy).toHaveBeenNthCalledWith(1, expect.objectContaining({
            where: expect.objectContaining({
                salary_id: 'salary-new',
                component_name_en: 'auto_unpaid_leave_deduction'
            })
        }))
        expect(mockSalaryComponentModel.destroy).toHaveBeenNthCalledWith(2, expect.objectContaining({
            where: expect.objectContaining({
                salary_id: 'salary-new',
                component_name_en: {
                    [Op.in]: [
                        'auto_attendance_absence_deduction',
                        'auto_attendance_half_day_deduction',
                        'auto_attendance_late_deduction'
                    ]
                }
            })
        }))
        expect(mockSalaryComponentModel.create).toHaveBeenCalledWith(expect.objectContaining({
            salary_id: 'salary-new',
            component_type: 'deduction',
            component_name_en: 'auto_unpaid_leave_deduction',
            amount: expect.closeTo(213.34, 2)
        }), { transaction })
        expect(mockSalaryComponentModel.create).toHaveBeenCalledWith(expect.objectContaining({
            salary_id: 'salary-new',
            component_type: 'deduction',
            component_name_en: 'auto_attendance_absence_deduction',
            amount: expect.closeTo(106.67, 2)
        }), { transaction })
        expect(mockSalaryComponentModel.create).toHaveBeenCalledWith(expect.objectContaining({
            salary_id: 'salary-new',
            component_type: 'deduction',
            component_name_en: 'auto_attendance_half_day_deduction',
            amount: expect.closeTo(53.34, 2)
        }), { transaction })
        expect(mockSalaryComponentModel.create).toHaveBeenCalledWith(expect.objectContaining({
            salary_id: 'salary-new',
            component_type: 'deduction',
            component_name_en: 'auto_attendance_late_deduction',
            amount: 25
        }), { transaction })
        expect(mockAuditService.log).toHaveBeenCalledWith(expect.objectContaining({
            action: 'payroll_processed'
        }))
        expect(transaction.commit).toHaveBeenCalled()
    })

    it('reprocesses an existing payroll record without double-counting generated deductions', async () => {
        const transaction = createTransaction()
        mockSequelize.transaction.mockResolvedValue(transaction)
        mockEmployeeModel.findAll.mockResolvedValue([
            {
                id: 'employee-1',
                base_salary: 3000,
                designation: { base_salary: 1800 }
            }
        ])

        const existingSalary = {
            id: 'salary-existing',
            status: 'processing',
            notes: 'existing note',
            update: jest.fn().mockResolvedValue(undefined)
        }

        mockEmployeeSalaryModel.findOne.mockResolvedValue(existingSalary)
        mockSalaryComponentModel.findAll.mockResolvedValue([
            {
                component_type: 'allowance',
                component_name_en: 'manual_allowance',
                amount: 200
            },
            {
                component_type: 'deduction',
                component_name_en: 'manual_deduction',
                amount: 50
            },
            {
                component_type: 'deduction',
                component_name_en: 'auto_unpaid_leave_deduction',
                amount: 100
            },
            {
                component_type: 'deduction',
                component_name_en: 'auto_attendance_absence_deduction',
                amount: 80
            }
        ])
        mockAttendanceModel.findAll.mockResolvedValue([
            {
                get: (key) => ({
                    employee_id: 'employee-1',
                    status: 'absent',
                    count: '1'
                })[key]
            }
        ])

        const res = await request(app)
            .post('/api/hr/payroll/process')
            .send({ period: '2026-04' })

        expect(res.status).toBe(200)
        expect(existingSalary.update).toHaveBeenCalledWith(expect.objectContaining({
            base_salary: 3000,
            gross_salary: 3200,
            net_salary: 3050,
            status: 'processing',
            notes: 'existing note'
        }), { transaction })
        expect(mockSalaryComponentModel.create).toHaveBeenCalledWith(expect.objectContaining({
            salary_id: 'salary-existing',
            component_name_en: 'auto_attendance_absence_deduction',
            amount: 100
        }), { transaction })
        expect(transaction.commit).toHaveBeenCalled()
    })

    it('stores employee base_salary without creating a seeded payroll record', async () => {
        mockEmployeeModel.create.mockResolvedValue({
            id: 'employee-1',
            branch_id: 'branch-1'
        })

        const res = await request(app)
            .post('/api/hr/employees')
            .send({
                first_name_ar: 'أحمد',
                last_name_ar: 'حسن',
                date_of_joining: '2026-04-03',
                base_salary: 2750
            })

        expect(res.status).toBe(201)
        expect(mockEmployeeModel.create).toHaveBeenCalledWith(expect.objectContaining({
            base_salary: 2750
        }))
        expect(mockEmployeeSalaryModel.create).not.toHaveBeenCalled()
    })

    it('disburses only approved salaries and creates accounting entries', async () => {
        const transaction = createTransaction()
        mockSequelize.transaction.mockResolvedValue(transaction)

        const approvedSalary = {
            id: 'salary-approved',
            employee_id: 'employee-1',
            salary_period: '2026-04-01',
            net_salary: 1500,
            status: 'approved',
            notes: null,
            employee: {
                id: 'employee-1',
                employee_code: 'EMP-001',
                first_name_ar: 'أحمد',
                last_name_ar: 'علي',
                branch_id: 'branch-1'
            },
            update: jest.fn().mockResolvedValue(undefined)
        }
        const processingSalary = {
            id: 'salary-processing',
            employee_id: 'employee-2',
            salary_period: '2026-04-01',
            net_salary: 900,
            status: 'processing',
            notes: null,
            employee: {
                id: 'employee-2',
                employee_code: 'EMP-002',
                first_name_ar: 'سارة',
                last_name_ar: 'محمد',
                branch_id: 'branch-1'
            },
            update: jest.fn().mockResolvedValue(undefined)
        }

        mockEmployeeSalaryModel.findAll.mockResolvedValue([approvedSalary, processingSalary])
        mockAccountResolver.resolveMany.mockResolvedValue({
            salariesExpense: '5101',
            paymentAccount: '1002'
        })
        mockAccountingService.createJournalEntry.mockResolvedValue({
            id: 'journal-1',
            entry_number: 'JE-2026-0001'
        })

        const res = await request(app)
            .post('/api/hr/payroll/disburse')
            .send({
                salary_ids: ['salary-approved', 'salary-processing'],
                payment_method: 'bank_transfer',
                payment_date: '2026-04-03'
            })

        expect(res.status).toBe(200)
        expect(res.body.data.updated).toBe(1)
        expect(res.body.data.skipped_count).toBe(1)
        expect(res.body.data.payment_method).toBe('bank_transfer')
        expect(mockAccountingService.createJournalEntry).toHaveBeenCalledTimes(1)
        expect(mockAccountingService.createJournalEntry).toHaveBeenCalledWith(expect.objectContaining({
            sourceType: 'payroll',
            sourceId: 'salary-approved',
            entryDate: '2026-04-03'
        }))
        expect(approvedSalary.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'paid'
        }), { transaction })
        expect(processingSalary.update).not.toHaveBeenCalled()
        expect(mockAuditService.log).toHaveBeenCalledWith(expect.objectContaining({
            action: 'payroll_disbursed'
        }))
        expect(transaction.commit).toHaveBeenCalled()
    })

    it('bulk attendance skips invalid rows and only upserts valid scoped rows', async () => {
        const transaction = createTransaction()
        mockSequelize.transaction.mockResolvedValue(transaction)
        mockEmployeeModel.findAll.mockResolvedValue([
            { id: 'employee-1', branch_id: 'branch-1' }
        ])
        mockAttendanceModel.findOrCreate.mockResolvedValue([
            { update: jest.fn().mockResolvedValue(undefined) },
            true
        ])

        const res = await request(app)
            .post('/api/hr/attendance/bulk')
            .send({
                rows: [
                    {
                        employee_id: 'employee-1',
                        attendance_date: '2026-04-03',
                        status: 'present',
                        check_in: '09:00',
                        check_out: '17:00'
                    },
                    {
                        employee_id: 'employee-2',
                        attendance_date: '2026-04-03',
                        status: 'present'
                    },
                    {
                        employee_id: 'employee-1',
                        status: 'present'
                    }
                ]
            })

        expect(res.status).toBe(200)
        expect(res.body.data.total_rows).toBe(3)
        expect(res.body.data.upserted).toBe(1)
        expect(res.body.data.skipped_count).toBe(2)
        expect(res.body.data.skipped).toEqual([
            expect.objectContaining({
                index: 1,
                employee_id: 'employee-2',
                reason: 'employee not found or out of branch scope'
            }),
            expect.objectContaining({
                index: 2,
                employee_id: 'employee-1',
                reason: 'attendance_date is invalid'
            })
        ])
        expect(mockAttendanceModel.findOrCreate).toHaveBeenCalledTimes(1)
        expect(mockAttendanceModel.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
            defaults: expect.objectContaining({
                branch_id: 'branch-1',
                status: 'present'
            })
        }))
        expect(transaction.commit).toHaveBeenCalled()
    })

    it('preserves the recorded check-in when adding check-out later on the same attendance row', async () => {
        const transaction = createTransaction()
        mockSequelize.transaction.mockResolvedValue(transaction)
        mockEmployeeModel.findOne.mockResolvedValue({
            id: 'employee-1',
            branch_id: 'branch-1'
        })

        const existingAttendance = {
            id: 'attendance-1',
            check_in: '09:00',
            check_out: null,
            status: 'present',
            working_hours: 0,
            notes: null,
            update: jest.fn().mockResolvedValue(undefined)
        }

        mockAttendanceModel.findOrCreate.mockResolvedValue([existingAttendance, false])

        const res = await request(app)
            .post('/api/hr/attendance')
            .send({
                employee_id: 'employee-1',
                attendance_date: '2026-04-03',
                check_in: '',
                check_out: '17:00',
                status: 'present'
            })

        expect(res.status).toBe(200)
        expect(existingAttendance.update).toHaveBeenCalledWith(expect.objectContaining({
            check_in: '09:00',
            check_out: '17:00',
            status: 'present',
            working_hours: 8
        }), { transaction })
        expect(transaction.commit).toHaveBeenCalled()
    })

    it('rejects overlapping leave requests for the same employee', async () => {
        const transaction = createTransaction()
        mockSequelize.transaction.mockResolvedValue(transaction)
        mockEmployeeModel.findOne.mockResolvedValue({
            id: 'employee-1',
            branch_id: 'branch-1'
        })
        mockLeaveRequestModel.findOne.mockResolvedValue({
            id: 'leave-existing',
            status: 'approved'
        })

        const res = await request(app)
            .post('/api/hr/leaves')
            .send({
                employee_id: 'employee-1',
                leave_type: 'annual',
                start_date: '2026-04-10',
                end_date: '2026-04-12',
                number_of_days: 3,
                status: 'pending'
            })

        expect(res.status).toBe(400)
        expect(res.body.message).toBe('An overlapping leave request already exists for this employee')
        expect(mockLeaveRequestModel.create).not.toHaveBeenCalled()
        expect(transaction.rollback).toHaveBeenCalled()
    })

    it('scopes training program listings to the current branch', async () => {
        mockTrainingProgramModel.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [{ id: 'training-1' }]
        })

        const res = await request(app)
            .get('/api/hr/training/programs')
            .query({ limit: 20, page: 1 })

        expect(res.status).toBe(200)
        expect(mockTrainingProgramModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                branch_id: 'branch-1'
            })
        }))
    })
})
