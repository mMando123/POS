#!/usr/bin/env node
require('dotenv').config()

const { Op } = require('sequelize')
const {
    initDatabase,
    sequelize,
    User,
    Employee,
    DeliveryPersonnel,
    Department,
    Designation,
    EmployeeSalary
} = require('../models')

const nowIsoDate = () => new Date().toISOString().slice(0, 10)
const salaryPeriodStart = () => {
    const now = new Date()
    const y = now.getUTCFullYear()
    const m = String(now.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
}

const safeMoney = (value, fallback) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return fallback
    return Math.round(parsed * 100) / 100
}

const splitName = (fullName, fallbackFirst, fallbackLast) => {
    const value = String(fullName || '').trim()
    if (!value) {
        return { first: fallbackFirst, last: fallbackLast }
    }
    const parts = value.split(/\s+/).filter(Boolean)
    if (parts.length === 1) {
        return { first: parts[0], last: fallbackLast }
    }
    return { first: parts[0], last: parts.slice(1).join(' ') || fallbackLast }
}

const branchCodeSuffix = (branchId) => {
    const normalized = String(branchId || 'global').replace(/-/g, '').toUpperCase()
    return normalized.slice(0, 8) || 'GLOBAL'
}

const defaults = {
    cashierSalary: safeMoney(process.env.HR_DEFAULT_CASHIER_SALARY, 3500),
    deliverySalary: safeMoney(process.env.HR_DEFAULT_DELIVERY_SALARY, 3000)
}

const ensureDepartment = async ({ branchId, roleKey, transaction }) => {
    const suffix = branchCodeSuffix(branchId)
    const presets = {
        cashier: {
            code: `DEP-SALES-${suffix}`,
            name_ar: 'المبيعات',
            name_en: 'Sales'
        },
        delivery: {
            code: `DEP-DELIVERY-${suffix}`,
            name_ar: 'التوصيل',
            name_en: 'Delivery'
        }
    }
    const config = presets[roleKey]
    if (!config) throw new Error(`Unknown department role key: ${roleKey}`)

    const [department] = await Department.findOrCreate({
        where: { code: config.code },
        defaults: {
            code: config.code,
            name_ar: config.name_ar,
            name_en: config.name_en,
            branch_id: branchId || null,
            status: 'active'
        },
        transaction
    })

    const updates = {}
    if (department.name_ar !== config.name_ar) updates.name_ar = config.name_ar
    if (department.name_en !== config.name_en) updates.name_en = config.name_en
    if ((department.branch_id || null) !== (branchId || null)) updates.branch_id = branchId || null
    if (department.status !== 'active') updates.status = 'active'
    if (Object.keys(updates).length) await department.update(updates, { transaction })

    return department
}

const ensureDesignation = async ({ branchId, departmentId, roleKey, baseSalary, transaction }) => {
    const suffix = branchCodeSuffix(branchId)
    const presets = {
        cashier: {
            code: `DES-CASHIER-${suffix}`,
            title_ar: 'كاشير',
            title_en: 'Cashier'
        },
        delivery: {
            code: `DES-DRIVER-${suffix}`,
            title_ar: 'سائق ديليفري',
            title_en: 'Delivery Driver'
        }
    }
    const config = presets[roleKey]
    if (!config) throw new Error(`Unknown designation role key: ${roleKey}`)

    const [designation] = await Designation.findOrCreate({
        where: { code: config.code },
        defaults: {
            code: config.code,
            title_ar: config.title_ar,
            title_en: config.title_en,
            branch_id: branchId || null,
            department_id: departmentId || null,
            base_salary: baseSalary,
            status: 'active'
        },
        transaction
    })

    const updates = {}
    if (designation.title_ar !== config.title_ar) updates.title_ar = config.title_ar
    if (designation.title_en !== config.title_en) updates.title_en = config.title_en
    if ((designation.branch_id || null) !== (branchId || null)) updates.branch_id = branchId || null
    if ((designation.department_id || null) !== (departmentId || null)) updates.department_id = departmentId || null
    if (Number(designation.base_salary || 0) !== Number(baseSalary)) updates.base_salary = baseSalary
    if (designation.status !== 'active') updates.status = 'active'
    if (Object.keys(updates).length) await designation.update(updates, { transaction })

    return designation
}

const ensureSalary = async ({ employeeId, amount, createdBy, transaction }) => {
    const period = salaryPeriodStart()
    const [salary, created] = await EmployeeSalary.findOrCreate({
        where: { employee_id: employeeId, salary_period: period },
        defaults: {
            employee_id: employeeId,
            salary_period: period,
            base_salary: amount,
            gross_salary: amount,
            net_salary: amount,
            status: 'approved',
            approved_by: createdBy || null,
            approved_date: new Date(),
            created_by: createdBy || null,
            notes: 'Auto-generated by staff-to-HR sync'
        },
        transaction
    })

    if (!created) {
        const needsUpdate = Number(salary.base_salary || 0) <= 0
            || Number(salary.gross_salary || 0) <= 0
            || Number(salary.net_salary || 0) <= 0
        if (needsUpdate) {
            await salary.update({
                base_salary: amount,
                gross_salary: amount,
                net_salary: amount,
                status: salary.status === 'paid' ? salary.status : 'approved',
                approved_by: salary.approved_by || createdBy || null,
                approved_date: salary.approved_date || new Date()
            }, { transaction })
            return { created: false, updated: true }
        }
    }

    return { created, updated: false }
}

const run = async () => {
    await initDatabase({
        seedDemoData: false,
        seedPaymentGateways: false,
        runCompatibilityChecks: true,
        runSchemaSync: false,
        autoSyncIfMissing: false
    })

    const t = await sequelize.transaction()
    const summary = {
        cashiers: { users: 0, employeesCreated: 0, employeesUpdated: 0, salariesCreated: 0, salariesUpdated: 0 },
        delivery: { riders: 0, employeesCreated: 0, employeesUpdated: 0, linksUpdated: 0, salariesCreated: 0, salariesUpdated: 0 },
        departmentsCreatedOrUpdated: 0,
        designationsCreatedOrUpdated: 0
    }

    try {
        const departmentCache = new Map()
        const designationCache = new Map()

        const getHrTargets = async ({ branchId, roleKey, salary }) => {
            const cacheKey = `${roleKey}:${branchId || 'global'}`
            if (departmentCache.has(cacheKey) && designationCache.has(cacheKey)) {
                return {
                    department: departmentCache.get(cacheKey),
                    designation: designationCache.get(cacheKey)
                }
            }

            const department = await ensureDepartment({ branchId, roleKey, transaction: t })
            const designation = await ensureDesignation({
                branchId,
                departmentId: department.id,
                roleKey,
                baseSalary: salary,
                transaction: t
            })

            summary.departmentsCreatedOrUpdated += 1
            summary.designationsCreatedOrUpdated += 1
            departmentCache.set(cacheKey, department)
            designationCache.set(cacheKey, designation)
            return { department, designation }
        }

        const cashiers = await User.findAll({
            where: { role: 'cashier' },
            attributes: ['id', 'name_ar', 'name_en', 'email', 'branch_id', 'is_active'],
            transaction: t
        })

        summary.cashiers.users = cashiers.length

        for (const user of cashiers) {
            const { department, designation } = await getHrTargets({
                branchId: user.branch_id || null,
                roleKey: 'cashier',
                salary: defaults.cashierSalary
            })

            let employee = await Employee.findOne({
                where: { user_id: user.id },
                transaction: t
            })

            if (!employee) {
                const arNames = splitName(user.name_ar, user.name_ar || 'موظف', '-')
                const enNames = splitName(user.name_en, user.name_en || user.name_ar || 'Employee', '-')
                employee = await Employee.create({
                    employee_code: `EMPU-${String(user.id).slice(0, 8).toUpperCase()}`,
                    first_name_ar: arNames.first,
                    last_name_ar: arNames.last,
                    first_name_en: enNames.first,
                    last_name_en: enNames.last,
                    email: user.email || null,
                    branch_id: user.branch_id || null,
                    department_id: department.id,
                    designation_id: designation.id,
                    employment_type: 'full_time',
                    date_of_joining: nowIsoDate(),
                    status: user.is_active ? 'active' : 'inactive',
                    user_id: user.id
                }, { transaction: t })
                summary.cashiers.employeesCreated += 1
            } else {
                await employee.update({
                    branch_id: user.branch_id || employee.branch_id,
                    department_id: department.id,
                    designation_id: designation.id,
                    status: user.is_active ? 'active' : (employee.status || 'inactive'),
                    user_id: user.id
                }, { transaction: t })
                summary.cashiers.employeesUpdated += 1
            }

            const salaryResult = await ensureSalary({
                employeeId: employee.id,
                amount: defaults.cashierSalary,
                createdBy: user.id,
                transaction: t
            })
            if (salaryResult.created) summary.cashiers.salariesCreated += 1
            if (salaryResult.updated) summary.cashiers.salariesUpdated += 1
        }

        const riders = await DeliveryPersonnel.findAll({
            where: {},
            attributes: ['id', 'name_ar', 'name_en', 'phone', 'branch_id', 'is_active', 'employee_id'],
            transaction: t
        })

        summary.delivery.riders = riders.length

        for (const rider of riders) {
            const { department, designation } = await getHrTargets({
                branchId: rider.branch_id || null,
                roleKey: 'delivery',
                salary: defaults.deliverySalary
            })

            let employee = null
            if (rider.employee_id) {
                employee = await Employee.findByPk(rider.employee_id, { transaction: t })
            }

            if (!employee) {
                employee = await Employee.findOne({
                    where: {
                        [Op.or]: [
                            { employee_code: `EMPD-${String(rider.id).slice(0, 8).toUpperCase()}` },
                            { employee_code: `EMPD-${String(rider.id).slice(0, 8)}` }
                        ]
                    },
                    transaction: t
                })
            }

            if (!employee) {
                const arNames = splitName(rider.name_ar, rider.name_ar || 'سائق', '-')
                const enNames = splitName(rider.name_en, rider.name_en || rider.name_ar || 'Driver', '-')
                employee = await Employee.create({
                    employee_code: `EMPD-${String(rider.id).slice(0, 8).toUpperCase()}`,
                    first_name_ar: arNames.first,
                    last_name_ar: arNames.last,
                    first_name_en: enNames.first,
                    last_name_en: enNames.last,
                    phone: rider.phone || null,
                    branch_id: rider.branch_id || null,
                    department_id: department.id,
                    designation_id: designation.id,
                    employment_type: 'full_time',
                    date_of_joining: nowIsoDate(),
                    status: rider.is_active ? 'active' : 'inactive'
                }, { transaction: t })
                summary.delivery.employeesCreated += 1
            } else {
                await employee.update({
                    phone: employee.phone || rider.phone || null,
                    branch_id: rider.branch_id || employee.branch_id,
                    department_id: department.id,
                    designation_id: designation.id,
                    status: rider.is_active ? 'active' : (employee.status || 'inactive')
                }, { transaction: t })
                summary.delivery.employeesUpdated += 1
            }

            if (!rider.employee_id || rider.employee_id !== employee.id) {
                await rider.update({ employee_id: employee.id }, { transaction: t })
                summary.delivery.linksUpdated += 1
            }

            const salaryResult = await ensureSalary({
                employeeId: employee.id,
                amount: defaults.deliverySalary,
                createdBy: null,
                transaction: t
            })
            if (salaryResult.created) summary.delivery.salariesCreated += 1
            if (salaryResult.updated) summary.delivery.salariesUpdated += 1
        }

        await t.commit()
        console.log('Staff-HR sync completed successfully.')
        console.log(JSON.stringify({
            defaults,
            salary_period: salaryPeriodStart(),
            summary
        }, null, 2))
    } catch (error) {
        await t.rollback()
        console.error('Staff-HR sync failed:', error)
        process.exit(1)
    } finally {
        await sequelize.close()
    }
}

run()
