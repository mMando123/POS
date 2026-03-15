# 📋 خطة تنفيذ موديول الموارد البشرية (HR)
## HR Module Implementation Plan for POS System

**التاريخ / Date**: مارس 1، 2026
**الإصدار / Version**: 1.0.0
**الحالة / Status**: Plan & Design Phase

---

## 🎯 نظرة عامة / Overview

### المرئية / Vision
بناء نظام شامل لإدارة الموارد البشرية متكامل مع نظام POS للتعامل مع:
- إدارة الموظفين والعاملين
- نظام الرواتب والمزايا
- إدارة الإجازات والحضور
- تقييمات الأداء
- التدريب والتطور الوظيفي

### الأهداف / Goals
✅ تحسين إدارة الموظفين
✅ أتمتة عمليات الرواتب
✅ تتبع الأداء والإنتاجية
✅ تحسين رضا الموظفين
✅ توفير تقارير شاملة

---

## 📊 البنية المعمارية / Architecture

### مكونات النظام / System Components

```
HR Module
├── Employee Management (إدارة الموظفين)
│   ├── Employee Profiles
│   ├── Departments
│   ├── Designations
│   └── Employee History
├── Payroll System (نظام الرواتب)
│   ├── Salary Configuration
│   ├── Allowances & Deductions
│   ├── Payroll Processing
│   └── Salary Slips
├── Attendance & Leave (الحضور والغياب)
│   ├── Attendance Tracking
│   ├── Leave Requests
│   ├── Leave Balance
│   └── Attendance Reports
├── Performance Management (إدارة الأداء)
│   ├── Performance Reviews
│   ├── Goals & Objectives
│   ├── Feedback System
│   └── Ratings
├── Training & Development (التدريب والتطوير)
│   ├── Training Programs
│   ├── Certificates
│   ├── Skill Development
│   └── Training Records
└── Reports & Analytics (التقارير والتحليلات)
    ├── Payroll Reports
    ├── Attendance Reports
    ├── Performance Analytics
    └── HR Dashboards
```

---

## 🗄️ هيكل قاعدة البيانات / Database Schema

### 1. جدول الموظفين / Employees Table
```sql
CREATE TABLE employees (
    id CHAR(36) PRIMARY KEY,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    first_name_ar VARCHAR(100) NOT NULL,
    last_name_ar VARCHAR(100) NOT NULL,
    first_name_en VARCHAR(100),
    last_name_en VARCHAR(100),
    email VARCHAR(150) UNIQUE,
    phone VARCHAR(20),
    date_of_birth DATE,
    gender ENUM('M', 'F'),
    
    -- Job Information
    department_id CHAR(36),
    designation_id CHAR(36),
    employment_type ENUM('Full-time', 'Part-time', 'Contract', 'Temporary'),
    date_of_joining DATE,
    date_of_leaving DATE,
    status ENUM('Active', 'Inactive', 'On-leave', 'Terminated'),
    
    -- Address Information
    address_ar TEXT,
    address_en TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    
    -- Banking Information
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    iban VARCHAR(50),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by CHAR(36),
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (designation_id) REFERENCES designations(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### 2. جدول الأقسام / Departments Table
```sql
CREATE TABLE departments (
    id CHAR(36) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    description TEXT,
    manager_id CHAR(36),
    budget DECIMAL(12, 2),
    status ENUM('Active', 'Inactive'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES employees(id)
);
```

### 3. جدول المسميات الوظيفية / Designations Table
```sql
CREATE TABLE designations (
    id CHAR(36) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title_ar VARCHAR(100) NOT NULL,
    title_en VARCHAR(100),
    level INT,
    department_id CHAR(36),
    description TEXT,
    base_salary DECIMAL(12, 2),
    status ENUM('Active', 'Inactive'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);
```

### 4. جدول الرواتب / Salaries Table
```sql
CREATE TABLE employee_salaries (
    id CHAR(36) PRIMARY KEY,
    employee_id CHAR(36) NOT NULL,
    salary_period DATE NOT NULL,
    base_salary DECIMAL(12, 2),
    gross_salary DECIMAL(12, 2),
    net_salary DECIMAL(12, 2),
    status ENUM('Draft', 'Processing', 'Approved', 'Paid', 'Rejected'),
    approved_by CHAR(36),
    approved_date DATETIME,
    paid_date DATETIME,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);
```

### 5. جدول الإضافيات والخصومات / Salary Components Table
```sql
CREATE TABLE salary_components (
    id CHAR(36) PRIMARY KEY,
    salary_id CHAR(36) NOT NULL,
    component_type ENUM('Allowance', 'Deduction', 'Bonus'),
    component_name_ar VARCHAR(100) NOT NULL,
    component_name_en VARCHAR(100),
    amount DECIMAL(12, 2),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (salary_id) REFERENCES employee_salaries(id)
);
```

### 6. جدول الحضور والغياب / Attendance Table
```sql
CREATE TABLE attendance (
    id CHAR(36) PRIMARY KEY,
    employee_id CHAR(36) NOT NULL,
    attendance_date DATE NOT NULL,
    check_in TIME,
    check_out TIME,
    status ENUM('Present', 'Absent', 'Late', 'Half-day', 'Leave'),
    working_hours INT,
    notes TEXT,
    recorded_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, attendance_date),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);
```

### 7. جدول الإجازات / Leaves Table
```sql
CREATE TABLE leave_requests (
    id CHAR(36) PRIMARY KEY,
    employee_id CHAR(36) NOT NULL,
    leave_type ENUM('Annual', 'Sick', 'Unpaid', 'Maternity', 'Compassionate'),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    number_of_days INT,
    reason TEXT,
    status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled'),
    approved_by CHAR(36),
    approved_date DATETIME,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);
```

### 8. جدول رصيد الإجازات / Leave Balance Table
```sql
CREATE TABLE leave_balances (
    id CHAR(36) PRIMARY KEY,
    employee_id CHAR(36) NOT NULL,
    leave_type VARCHAR(50) NOT NULL,
    financial_year INT NOT NULL,
    opening_balance INT,
    allocated INT,
    used INT,
    remaining INT,
    carried_forward INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, leave_type, financial_year),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

### 9. جدول تقييمات الأداء / Performance Reviews Table
```sql
CREATE TABLE performance_reviews (
    id CHAR(36) PRIMARY KEY,
    employee_id CHAR(36) NOT NULL,
    review_period_start DATE,
    review_period_end DATE,
    reviewer_id CHAR(36),
    overall_rating DECIMAL(3, 2),
    comments TEXT,
    strengths TEXT,
    areas_for_improvement TEXT,
    goals_for_next_period TEXT,
    status ENUM('Draft', 'Completed', 'Reviewed'),
    review_date DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (reviewer_id) REFERENCES users(id)
);
```

### 10. جدول التدريب / Training Programs Table
```sql
CREATE TABLE training_programs (
    id CHAR(36) PRIMARY KEY,
    program_name_ar VARCHAR(255) NOT NULL,
    program_name_en VARCHAR(255),
    description TEXT,
    start_date DATE,
    end_date DATE,
    duration_days INT,
    trainer CHAR(36),
    budget DECIMAL(12, 2),
    status ENUM('Planned', 'InProgress', 'Completed', 'Cancelled'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trainer) REFERENCES employees(id)
);
```

---

## 🎨 الواجهات والصفحات / Pages & Components

### الصفحات الرئيسية / Main Pages

#### 1. لوحة تحكم HR / HR Dashboard
```jsx
src/pages/HrDashboard.jsx
├── Employee Statistics
│   ├── Total Employees
│   ├── New Joiners (This Month)
│   ├── Resignations
│   └── Departmental Distribution (Chart)
├── Payroll Metrics
│   ├── Monthly Payroll Summary
│   ├── Pending Approvals
│   └── Salary Trends (Chart)
├── Attendance Overview
│   ├── Present Count
│   ├── Absent Count
│   ├── Leave Approvals Pending
│   └── Attendance Trend (Chart)
├── Performance Metrics
│   ├── Pending Reviews
│   ├── Top Performers
│   └── Performance Distribution (Chart)
└── Quick Actions
    ├── Add New Employee
    ├── Process Payroll
    ├── Approve Attendance
    └── Review Leave Requests
```

#### 2. إدارة الموظفين / Employee Management
```jsx
src/pages/HrEmployees.jsx
├── Employee List
│   ├── Table View (Sortable, Filterable)
│   ├── Search by Code/Name
│   ├── Filter by Department/Status
│   └── Export to Excel
├── Employee Profile
│   ├── Personal Information
│   ├── Job Information
│   ├── Contact Details
│   ├── Banking Information
│   ├── Document Attachments
│   └── Work History
├── Actions
│   ├── Add Employee
│   ├── Edit Employee
│   ├── Deactivate/Terminate
│   └── View Documents
```

#### 3. إدارة الأقسام / Department Management
```jsx
src/pages/HrDepartments.jsx
├── Department List
│   ├── Create Department
│   ├── Edit Department
│   ├── Set Manager
│   ├── Budget Management
│   └── Department Members
├── Department Details
│   ├── Overview
│   ├── Team Structure
│   ├── Budget Allocation
│   └── Performance Metrics
```

#### 4. معالجة الرواتب / Payroll Management
```jsx
src/pages/HrPayroll.jsx
├── Salary Configuration
│   ├── Salary Structure
│   ├── Allowances & Deductions
│   ├── Tax Configuration
│   └── Employee-wise Configuration
├── Payroll Processing
│   ├── Select Salary Period
│   ├── Generate Salaries
│   ├── Apply Adjustments
│   ├── Approve Batch
│   └── Process Payments
├── Salary Slips
│   ├── View Slip
│   ├── Print Slip
│   ├── Email to Employee
│   └── Slip History
├── Payroll Reports
│   ├── Monthly Payroll Report
│   ├── Deduction Report
│   ├── Bank Transfer File
│   └── Statutory Reports
```

#### 5. إدارة الحضور والغياب / Attendance Management
```jsx
src/pages/HrAttendance.jsx
├── Mark Attendance
│   ├── Biometric Integration (Future)
│   ├── Manual Entry (Today)
│   ├── Bulk Upload
│   └── Auto-Calculate Working Hours
├── View Attendance
│   ├── Employee Attendance History
│   ├── Department Attendance Summary
│   ├── Monthly Calendar View
│   └── Filter & Search
├── Attendance Reports
│   ├── Daily Report
│   ├── Monthly Report
│   ├── Leaves Report
│   └── On-time/Late Report
```

#### 6. إدارة الإجازات / Leave Management
```jsx
src/pages/HrLeaveManagement.jsx
├── Leave Requests
│   ├── Employee Submit Request
│   ├── View Pending Requests
│   ├── Approve/Reject
│   └── Leave History
├── Leave Configuration
│   ├── Leave Types
│   ├── Leave Limits
│   ├── Accrual Policy
│   └── Carried Forward Rules
├── Leave Balance
│   ├── View Balance (Employee)
│   ├── Bulk Update Balance
│   ├── Year-end Closing
│   └── Balance Reports
├── Leave Reports
│   ├── Leave Taken Report
│   ├── Balance Utilization
│   └── Department-wise Leave
```

#### 7. تقييمات الأداء / Performance Management
```jsx
src/pages/HrPerformance.jsx
├── Performance Reviews
│   ├── Create Review
│   ├── Rating System
│   ├── Comments & Feedback
│   └── Store Review
├── Review History
│   ├── View Past Reviews
│   ├── Trend Analysis
│   └── Compare Ratings
├── Goals Management
│   ├── Set Annual Goals
│   ├── Track Progress
│   ├── Update Goals
│   └── Goal Reviews
├── Performance Reports
│   ├── Department Performance
│   ├── Top Performers
│   ├── Performance Trends
│   └── Rating Distribution
```

#### 8. التدريب والتطوير / Training & Development
```jsx
src/pages/HrTraining.jsx
├── Training Programs
│   ├── Create Program
│   ├── Assign Employees
│   ├── Track Attendance
│   └── Certificate Management
├── Skill Development
│   ├── Employee Skills
│   ├── Skill Gap Analysis
│   ├── Training Needs
│   └── Development Plan
├── Training Records
│   ├── Completed Training
│   ├── Certificates
│   ├── Training Cost
│   └── ROI Analysis
├── Training Reports
│   ├── Program-wise Report
│   ├── Employee-wise Report
│   └── Cost Analysis
```

---

## 🔌 API Endpoints / الـ API الأساسية

### Employees / الموظفين
```
GET     /api/hr/employees              - Get all employees
GET     /api/hr/employees/:id          - Get employee details
POST    /api/hr/employees              - Create employee
PUT     /api/hr/employees/:id          - Update employee
DELETE  /api/hr/employees/:id          - Deactivate employee
GET     /api/hr/employees/search       - Search employees
POST    /api/hr/employees/upload       - Bulk upload
GET     /api/hr/employees/export       - Export to Excel
```

### Departments / الأقسام
```
GET     /api/hr/departments            - Get all departments
GET     /api/hr/departments/:id        - Get department details
POST    /api/hr/departments            - Create department
PUT     /api/hr/departments/:id        - Update department
GET     /api/hr/departments/:id/team   - Get department members
```

### Payroll / الرواتب
```
POST    /api/hr/payroll/process        - Generate salaries
GET     /api/hr/payroll/salaries       - Get all salaries
GET     /api/hr/payroll/salaries/:id   - Get salary slip
PUT     /api/hr/payroll/salaries/:id   - Update salary
POST    /api/hr/payroll/approve        - Approve payroll batch
POST    /api/hr/payroll/disburse       - Process payments
GET     /api/hr/payroll/reports        - Generate reports
```

### Attendance / الحضور
```
POST    /api/hr/attendance             - Mark attendance
GET     /api/hr/attendance/:empId      - Get employee attendance
PUT     /api/hr/attendance/:id         - Update attendance
GET     /api/hr/attendance/reports     - Get attendance reports
POST    /api/hr/attendance/bulk        - Bulk mark attendance
```

### Leave / الإجازات
```
POST    /api/hr/leaves                 - Submit leave request
GET     /api/hr/leaves/:empId          - Get leave requests
PUT     /api/hr/leaves/:id             - Update request status
GET     /api/hr/leaves/balance/:empId  - Get leave balance
PUT     /api/hr/leaves/balance/:id     - Update balance
GET     /api/hr/leaves/reports         - Get leave reports
```

### Performance / الأداء
```
POST    /api/hr/performance            - Create review
GET     /api/hr/performance/:empId     - Get reviews
PUT     /api/hr/performance/:id        - Update review
GET     /api/hr/performance/reports    - Get performance reports
```

### Training / التدريب
```
POST    /api/hr/training               - Create program
GET     /api/hr/training/programs      - Get all programs
PUT     /api/hr/training/:id           - Update program
POST    /api/hr/training/:id/assign    - Assign employees
GET     /api/hr/training/reports       - Get reports
```

---

## 🏛️ البنية الفنية / Technical Structure

### Frontend Structure
```
src/
├── pages/
│   ├── HrDashboard.jsx
│   ├── HrEmployees.jsx
│   ├── HrDepartments.jsx
│   ├── HrPayroll.jsx
│   ├── HrAttendance.jsx
│   ├── HrLeaveManagement.jsx
│   ├── HrPerformance.jsx
│   └── HrTraining.jsx
├── components/
│   └── Hr/
│       ├── EmployeeForm.jsx
│       ├── SalaryForm.jsx
│       ├── AttendanceMarker.jsx
│       ├── LeaveRequestForm.jsx
│       ├── PerformanceReviewForm.jsx
│       ├── TrainingForm.jsx
│       ├── HrTable.jsx
│       ├── HrChart.jsx
│       └── HrReports.jsx
├── services/
│   └── hrService.js
├── hooks/
│   ├── useEmployees.js
│   ├── usePayroll.js
│   ├── useAttendance.js
│   ├── useLeaves.js
│   ├── usePerformance.js
│   └── useTraining.js
└── store/
    └── slices/
        └── hrSlice.js
```

### Backend Structure
```
backend/src/
├── models/
│   ├── Employee.js
│   ├── Department.js
│   ├── Designation.js
│   ├── Salary.js
│   ├── SalaryComponent.js
│   ├── Attendance.js
│   ├── Leave.js
│   ├── LeaveBalance.js
│   ├── PerformanceReview.js
│   ├── TrainingProgram.js
│   └── TrainingAttendance.js
├── routes/
│   └── hr.routes.js
├── controllers/
│   ├── employeeController.js
│   ├── payrollController.js
│   ├── attendanceController.js
│   ├── leaveController.js
│   ├── performanceController.js
│   └── trainingController.js
├── services/
│   ├── employeeService.js
│   ├── payrollService.js
│   ├── attendanceService.js
│   ├── leaveService.js
│   ├── performanceService.js
│   └── trainingService.js
├── utils/
│   ├── hrmCalculations.js
│   ├── salaryCalculations.js
│   ├── leaveCalculations.js
│   └── reportGenerator.js
└── scripts/
    └── hrMigrations.js
```

---

## 📱 الواجهات والمكونات / UI Components

### دالة مساعدة للحسابات / HR Calculation Utilities
```javascript
// src/utils/hrmCalculations.js

// حساب صافي الراتب / Calculate Net Salary
export const calculateNetSalary = (baseSalary, allowances, deductions) => {
    const gross = baseSalary + allowances;
    const net = gross - deductions;
    return { gross, net, deductions };
};

// حساب الغياب / Calculate Working Hours
export const calculateWorkingHours = (checkIn, checkOut, breakTime = 1) => {
    const hours = ((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60)) - breakTime;
    return Math.round(hours * 100) / 100;
};

// حساب الإجازات / Calculate Leave Balance
export const calculateLeaveBalance = (opening, allocated, used, carriedForward) => {
    const remaining = opening + allocated - used;
    return { remaining, used, carriedForward };
};

// حساب الأقدمية / Calculate Service Years
export const calculateServiceYears = (joiningDate) => {
    const today = new Date();
    const years = today.getFullYear() - joiningDate.getFullYear();
    const months = today.getMonth() - joiningDate.getMonth();
    return { years, months };
};
```

---

## 📊 التقارير / Reports

### تقارير رئيسية / Key Reports
1. **موجز الرواتب الشهري** - Monthly Payroll Summary
2. **تقرير الحضور الشامل** - Comprehensive Attendance Report
3. **تقرير الإجازات السنوي** - Annual Leave Report
4. **تقييمات الأداء** - Performance Evaluations Report
5. **تقرير تكاليف الموظفين** - Employee Cost Analysis
6. **تقرير الدوران الوظيفي** - Employee Turnover Report
7. **تكلفة الراتب الكلية** - Total Payroll Cost Report
8. **تقرير التدريب والتطوير** - Training & Development Report

---

## 🔐 الأمان والصلاحيات / Security & Permissions

### الأدوار والصلاحيات / Roles & Permissions

```javascript
HR_PERMISSIONS = {
    // Employee Management
    EMPLOYEE_VIEW: 'hr.employee.view',
    EMPLOYEE_CREATE: 'hr.employee.create',
    EMPLOYEE_EDIT: 'hr.employee.edit',
    EMPLOYEE_DELETE: 'hr.employee.delete',
    
    // Payroll
    PAYROLL_VIEW: 'hr.payroll.view',
    PAYROLL_PROCESS: 'hr.payroll.process',
    PAYROLL_APPROVE: 'hr.payroll.approve',
    PAYROLL_DISBURSE: 'hr.payroll.disburse',
    
    // Attendance
    ATTENDANCE_MARK: 'hr.attendance.mark',
    ATTENDANCE_APPROVE: 'hr.attendance.approve',
    ATTENDANCE_VIEW: 'hr.attendance.view',
    
    // Leave
    LEAVE_REQUEST: 'hr.leave.request',
    LEAVE_APPROVE: 'hr.leave.approve',
    LEAVE_VIEW: 'hr.leave.view',
    
    // Performance
    PERFORMANCE_REVIEW: 'hr.performance.review',
    PERFORMANCE_VIEW: 'hr.performance.view',
    
    // Training
    TRAINING_CREATE: 'hr.training.create',
    TRAINING_ASSIGN: 'hr.training.assign',
    TRAINING_VIEW: 'hr.training.view',
    
    // Reports
    HR_REPORTS: 'hr.reports.view',
}

// Role: HR Manager
HR_MANAGER = [
    EMPLOYEE_VIEW, EMPLOYEE_CREATE, EMPLOYEE_EDIT,
    PAYROLL_VIEW, PAYROLL_PROCESS, PAYROLL_APPROVE,
    ATTENDANCE_MARK, ATTENDANCE_APPROVE, ATTENDANCE_VIEW,
    LEAVE_APPROVE, LEAVE_VIEW,
    PERFORMANCE_REVIEW, PERFORMANCE_VIEW,
    TRAINING_CREATE, TRAINING_ASSIGN,
    HR_REPORTS
]

// Role: Department Manager
DEPT_MANAGER = [
    EMPLOYEE_VIEW,
    ATTENDANCE_MARK, ATTENDANCE_VIEW,
    LEAVE_APPROVE, LEAVE_VIEW,
    PERFORMANCE_REVIEW,
    HR_REPORTS
]

// Role: Employee
EMPLOYEE = [
    LEAVE_REQUEST,
    PERFORMANCE_VIEW
]
```

---

## 📅 جدول التنفيذ / Implementation Timeline

### المرحلة الأولى: البنية الأساسية (أسبوعان)
**Phase 1: Foundation & Setup**

```
Week 1:
  Day 1-2: تصميم قاعدة البيانات / Database Design
  Day 3-4: إعداد النماذج / Setup Models
  Day 5: تعريف API أساسي / Basic API Setup

Week 2:
  Day 1-2: إدارة الموظفين الأساسية / Basic Employee Management
  Day 3-4: إدارة الأقسام / Department Management
  Day 5: الاختبارات والتحقق / Testing & Validation
```

### المرحلة الثانية: نظام الرواتب (3 أسابيع)
**Phase 2: Payroll System**

```
Week 1:
  Day 1-2: تكوين الراتب / Salary Configuration
  Day 3-4: حسابات الراتب / Salary Calculations
  Day 5: معالجة الرواتب / Payroll Processing

Week 2:
  Day 1-2: الموافقات والمراجعة / Approvals & Review
  Day 3-4: كشوف الرواتب / Salary Slips
  Day 5: وسائل الدفع / Payment Methods

Week 3:
  Day 1-2: تقارير الرواتب / Payroll Reports
  Day 3-4: التكاملات البنكية / Bank Integration
  Day 5: الاختبار الشامل / Comprehensive Testing
```

### المرحلة الثالثة: الحضور والإجازات (أسبوعان)
**Phase 3: Attendance & Leave**

```
Week 1:
  Day 1-2: تسجيل الحضور / Attendance Marking
  Day 3-4: حسابات الإجازات / Leave Calculations
  Day 5: طلبات الإجازات / Leave Requests

Week 2:
  Day 1-2: رصيد الإجازات / Leave Balance Management
  Day 3-4: التقارير / Reports
  Day 5: التكامل مع الرواتب / Integration with Payroll
```

### المرحلة الرابعة: إدارة الأداء والتدريب (أسبوعان)
**Phase 4: Performance & Training**

```
Week 1:
  Day 1-2: تقييمات الأداء / Performance Reviews
  Day 3-4: إدارة الأهداف / Goals Management
  Day 5: نظام التقييم / Rating System

Week 2:
  Day 1-2: برامج التدريب / Training Programs
  Day 3-4: إدارة المهارات / Skill Management
  Day 5: التقارير والتحليلات / Reports & Analytics
```

### المرحلة الخامسة: لوحة التحكم والتقارير (أسبوع)
**Phase 5: Dashboard & Analytics**

```
Week 1:
  Day 1-2: لوحة تحكم HR / HR Dashboard
  Day 3-4: التقارير المتقدمة / Advanced Reports
  Day 5: تحليلات البيانات / Data Analytics
```

### المرحلة السادسة: الاختبار والنشر (أسبوع)
**Phase 6: Testing & Deployment**

```
Week 1:
  Day 1-2: اختبار شامل / Comprehensive Testing
  Day 3: اختبار الأداء / Performance Testing
  Day 4: اختبار الأمان / Security Testing
  Day 5: النشر والتطبيق / Deployment & Go-live
```

**المجموع / Total Duration**: 9-10 أسابيع (~2.5 شهور)

---

## 💻 المتطلبات التقنية / Technical Requirements

### في الـ Frontend
```javascript
// React Components & Hooks
- React: ^18.2.0
- React Router: ^6.21.3
- Redux Toolkit: ^2.1.0
- Material-UI: ^5.15.7
- react-hook-form: ^7.71.1
- Axios: ^1.6.7

// Additional Libraries
- date-fns: ^4.1.0 (Date calculations)
- recharts: ^3.7.0 (Charts & graphs)
- xlsx: ^0.18.5 (Excel export)
- jspdf: ^2.x (PDF generation)
- react-hot-toast: ^2.4.1 (Notifications)
```

### في الـ Backend
```javascript
// Node & Database
- Node.js: >= 16.0.0
- Sequelize: ^6.x
- MySQL: 8.0+
- Express.js: ^4.x

// Utilities
- bcryptjs: ^2.x (Password hashing)
- jsonwebtoken: ^9.x (JWT)
- moment: ^2.x (Date/Time)
- decimal.js: ^10.x (Precise calculations)
```

---

## 🧪 خطة الاختبار / Testing Strategy

### Unit Tests
```bash
✅ Employee calculations
✅ Salary computations
✅ Leave balance calculations
✅ Attendance logic
✅ Performance rating logic
```

### Integration Tests
```bash
✅ Employee creation → Department assignment
✅ Salary processing → Payment generation
✅ Leave request → Balance update
✅ Attendance marking → Report generation
```

### UAT Scenarios
```bash
✅ Complete payroll cycle (month-end process)
✅ Annual leave cycle (year-end closing)
✅ Employee onboarding flow
✅ Performance review process
✅ Training program execution
```

---

## 📋 قائمة تحقق التنفيذ / Implementation Checklist

### البنية الأساسية / Foundation
- [ ] قاعدة البيانات مصممة ومنشأة
- [ ] النماذج مكتوبة
- [ ] الروابط (Relations) محددة
- [ ] الـ API مهيأة

### الموظفين / Employees
- [ ] صفحة إضافة موظف
- [ ] صفحة تعديل الموظف
- [ ] قائمة الموظفين مع البحث
- [ ] تصدير البيانات
- [ ] رفع ملفات (Bulk Upload)

### الرواتب / Payroll
- [ ] تكوين هيكل الراتب
- [ ] حساب الراتب الشهري
- [ ] موافقات الرواتب
- [ ] كشوف الراتب
- [ ] التحويل البنكي
- [ ] التقارير

### الحضور / Attendance
- [ ] تسجيل الحضور اليومي
- [ ] حساب ساعات العمل
- [ ] تقارير الحضور
- [ ] التكامل مع الأجهزة

### الإجازات / Leaves
- [ ] طلبات الإجازات
- [ ] اعتماد الإجازات
- [ ] حسابات الرصيد
- [ ] تقارير الإجازات
- [ ] منح الإجازات السنوية

### الأداء / Performance
- [ ] نموذج التقييم
- [ ] نظام التقييم
- [ ] تتبع الأهداف
- [ ] تقارير الأداء

### التدريب / Training
- [ ] برامج التدريب
- [ ] تسجيل الموظفين
- [ ] الشهادات
- [ ] تقارير التدريب

### التقارير / Reports
- [ ] تقرير موجز الرواتب
- [ ] تقرير الحضور
- [ ] تقرير الإجازات
- [ ] تقرير الأداء
- [ ] تقرير التدريب

---

## 🎯 مؤشرات النجاح / Success Metrics

### الأداء
```
✓ معالجة الرواتب في < 10 دقائق
✓ تحميل قوائم الموظفين في < 2 ثانية
✓ معالجة طلبات الإجازات في < 5 ثوان
✓ توليد التقارير في < 30 ثانية
```

### الوظائف
```
✓ جميع الميزات المصممة مطبقة
✓ جميع الحسابات دقيقة
✓ جميع التقارير شاملة
✓ جميع التكاملات تعمل
```

### الأمان
```
✓ جميع البيانات الحساسة مشفرة
✓ صلاحيات الوصول صحيحة
✓ قوانين الحماية واتبعت
✓ التدقيق (Audit) منشط
```

---

## 🚀 الميزات المتقدمة (المستقبل) / Future Enhancements

### المرحلة التالية
```
1. تكامل البيومتري / Biometric Integration
2. محاكاة الحضور الذكية / Smart Attendance
3. ربط الاتصالات / Communication Integration
4. نماذج الموارد البشرية المتقدمة / Advanced HR Forms
5. نموذج الخلافة الوظيفية / Succession Planning
6. إدارة تنوع الموارد البشرية / Diversity Management
7. تحليلات الموارد البشرية المتقدمة / Advanced HR Analytics
8. الذكاء الاصطناعي في التنبؤ / AI-powered Predictions
```

---

## 📞 الدعم والتوثيق / Support & Documentation

### الوثائق المطلوبة
- [ ] دليل المستخدم (User Manual)
- [ ] التوثيق الفنية (Technical Documentation)
- [ ] فيديوهات تدريبية (Training Videos)
- [ ] دليل التدريب (Training Manual)
- [ ] API Documentation
- [ ] استكشاف الأخطاء (Troubleshooting Guide)

---

## ✅ الخلاصة / Summary

هذه خطة شاملة لبناء نظام HR متكامل يشمل:

✅ **إدارة الموظفين** - Complete employee lifecycle management
✅ **نظام الرواتب** - Automated payroll processing
✅ **الحضور والإجازات** - Attendance & leave management
✅ **تقييمات الأداء** - Performance evaluation system
✅ **التدريب والتطوير** - Training & skill development
✅ **التقارير والتحليلات** - Comprehensive reporting

**الهدف**: نظام شامل يحسن كفاءة الموارد البشرية ويقلل العمل اليدوي ويوفر رؤى مفيدة.

---

**تاريخ الإعداد**: مارس 1، 2026
**الحالة**: جاهز للتطبيق / Ready for Implementation
**المدة المقدرة**: 9-10 أسابيع
**حجم الفريق المطلوب**: 3-4 مطورين + 1 صحة/QA
