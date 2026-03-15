# HR Module - Simplified Logic

## 1) What the module currently does

The HR module in this project covers 7 areas:

1. Dashboard (`/api/hr/dashboard`)
2. Departments (`/api/hr/departments`)
3. Employees (`/api/hr/employees`)
4. Attendance (`/api/hr/attendance`)
5. Leaves (`/api/hr/leaves`)
6. Payroll (`/api/hr/payroll/*`)
7. Performance + Training (`/api/hr/performance`, `/api/hr/training/*`)

## 2) Core data model (business view)

1. `employees` = master staff record
2. `hr_departments` = org structure
3. `hr_designations` = job titles + default salary
4. `hr_attendance` = daily attendance rows
5. `leave_requests` + `leave_balances` = leave lifecycle
6. `employee_salaries` + `salary_components` = payroll
7. `performance_reviews`, `training_programs` = development records

## 3) Access logic (important)

1. `admin` sees all branches
2. `manager` is branch-scoped via `req.user.branchId`
3. Any operation on employee-linked records must validate employee belongs to allowed scope

## 4) Attendance flow (simple)

1. UI sends `employee_id + attendance_date + status + times`
2. API does upsert by `(employee_id, attendance_date)`
3. If row exists: update
4. If not: create
5. `working_hours` calculated from `check_in/check_out` if not supplied

## 5) Leave flow (simple)

1. Create leave request with date range
2. On status changes (`approved/rejected/cancelled/pending`), balances are recalculated
3. `leave_balances.remaining` always derived from opening/allocated/used/carried

## 6) Payroll flow (simple)

1. `process` builds/updates salary documents for a period (YYYY-MM)
2. `approve` moves draft/processing to approved
3. `disburse` moves approved to paid
4. Summary endpoints aggregate net/gross and status counts

## 7) Simplification applied in code

To reduce complexity and repetition in `backend/src/routes/hr.js`:

1. Added `getScopedEmployee(req, employeeId, options)` helper
   - One place for branch-scope employee lookup
2. Added `sendPaginatedResponse(res, rows, count, page, limit)` helper
   - One place for repeated pagination response shape
3. Replaced repeated branch checks and repeated pagination blocks with those helpers

Result: same behavior, less duplicated logic, lower maintenance cost.

## 8) Recommended next step (optional)

Split `hr.js` into feature routes for cleaner code ownership:

1. `hr.attendance.routes.js`
2. `hr.leaves.routes.js`
3. `hr.payroll.routes.js`
4. `hr.employees.routes.js`
5. `hr.performance.routes.js`
6. `hr.training.routes.js`

