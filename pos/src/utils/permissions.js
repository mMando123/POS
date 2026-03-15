/**
 * Frontend Permission Utilities
 * 
 * This file provides helpers to check user permissions on the frontend.
 * Used for UI visibility but NOT for security (backend enforces permissions).
 */

// All available permissions (must match backend)
export const PERMISSIONS = {
    // Orders
    ORDERS_CREATE: 'orders.create',
    ORDERS_VIEW_OWN: 'orders.view_own',
    ORDERS_VIEW_ALL: 'orders.view_all',
    ORDERS_PROCESS: 'orders.process',
    ORDERS_CANCEL: 'orders.cancel',
    ORDERS_DELETE: 'orders.delete',

    // Cart
    CART_MANAGE: 'cart.manage',

    // Payment
    PAYMENT_PROCESS: 'payment.process',

    // Receipt
    RECEIPT_PRINT: 'receipt.print',

    // Kitchen Display (KDS)
    KDS_SEND: 'kds.send',
    KDS_VIEW: 'kds.view',
    KDS_UPDATE: 'kds.update',

    // Menu Management
    MENU_VIEW: 'menu.view',
    MENU_CREATE: 'menu.create',
    MENU_UPDATE: 'menu.update',
    MENU_DELETE: 'menu.delete',

    // Category Management
    CATEGORY_VIEW: 'category.view',
    CATEGORY_MANAGE: 'category.manage',

    // Reports
    REPORTS_VIEW: 'reports.view',
    REPORTS_EXPORT: 'reports.export',

    // Users
    USERS_VIEW: 'users.view',
    USERS_MANAGE: 'users.manage',

    // Settings
    SETTINGS_ACCESS: 'settings.access',

    // Branch
    BRANCH_VIEW: 'branch.view',
    BRANCH_MANAGE: 'branch.manage',

    // HR - Employees
    HR_EMPLOYEE_VIEW: 'hr.employee.view',
    HR_EMPLOYEE_CREATE: 'hr.employee.create',
    HR_EMPLOYEE_EDIT: 'hr.employee.edit',
    HR_EMPLOYEE_DELETE: 'hr.employee.delete',

    // HR - Departments / Designations
    HR_DEPARTMENT_VIEW: 'hr.department.view',
    HR_DEPARTMENT_MANAGE: 'hr.department.manage',
    HR_DESIGNATION_VIEW: 'hr.designation.view',
    HR_DESIGNATION_MANAGE: 'hr.designation.manage',

    // HR - Attendance / Leave
    HR_ATTENDANCE_VIEW: 'hr.attendance.view',
    HR_ATTENDANCE_MARK: 'hr.attendance.mark',
    HR_LEAVE_VIEW: 'hr.leave.view',
    HR_LEAVE_MANAGE: 'hr.leave.manage',

    // HR - Payroll
    HR_PAYROLL_VIEW: 'hr.payroll.view',
    HR_PAYROLL_PROCESS: 'hr.payroll.process',
    HR_PAYROLL_APPROVE: 'hr.payroll.approve',

    // HR - Reports
    HR_REPORTS_VIEW: 'hr.reports.view',
}

// Cashier base permissions
const CASHIER_PERMISSIONS = [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_VIEW_OWN,
    PERMISSIONS.ORDERS_PROCESS,
    PERMISSIONS.CART_MANAGE,
    PERMISSIONS.PAYMENT_PROCESS,
    PERMISSIONS.RECEIPT_PRINT,
    PERMISSIONS.KDS_SEND,
    PERMISSIONS.KDS_VIEW,
    PERMISSIONS.KDS_UPDATE,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.CATEGORY_VIEW,
]

// Manager permissions
const MANAGER_PERMISSIONS = [
    ...CASHIER_PERMISSIONS,
    PERMISSIONS.ORDERS_VIEW_ALL,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.MENU_CREATE,
    PERMISSIONS.MENU_UPDATE,
    PERMISSIONS.MENU_DELETE,
    PERMISSIONS.CATEGORY_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.HR_EMPLOYEE_VIEW,
    PERMISSIONS.HR_EMPLOYEE_CREATE,
    PERMISSIONS.HR_EMPLOYEE_EDIT,
    PERMISSIONS.HR_EMPLOYEE_DELETE,
    PERMISSIONS.HR_DEPARTMENT_VIEW,
    PERMISSIONS.HR_DEPARTMENT_MANAGE,
    PERMISSIONS.HR_DESIGNATION_VIEW,
    PERMISSIONS.HR_DESIGNATION_MANAGE,
    PERMISSIONS.HR_ATTENDANCE_VIEW,
    PERMISSIONS.HR_ATTENDANCE_MARK,
    PERMISSIONS.HR_LEAVE_VIEW,
    PERMISSIONS.HR_LEAVE_MANAGE,
    PERMISSIONS.HR_PAYROLL_VIEW,
    PERMISSIONS.HR_PAYROLL_PROCESS,
    PERMISSIONS.HR_PAYROLL_APPROVE,
    PERMISSIONS.HR_REPORTS_VIEW,
]

// Chef permissions (kitchen-focused)
const CHEF_PERMISSIONS = [
    PERMISSIONS.ORDERS_VIEW_OWN,
    PERMISSIONS.ORDERS_PROCESS,
    PERMISSIONS.KDS_SEND,
    PERMISSIONS.KDS_VIEW,
    PERMISSIONS.KDS_UPDATE,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.CATEGORY_VIEW,
]

// Supervisor permissions (operations-focused)
const SUPERVISOR_PERMISSIONS = [
    ...CASHIER_PERMISSIONS,
    PERMISSIONS.ORDERS_VIEW_ALL,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.REPORTS_VIEW,
]

// Accountant permissions (financial view/reporting oriented)
const ACCOUNTANT_PERMISSIONS = [
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.CATEGORY_VIEW,
    PERMISSIONS.HR_REPORTS_VIEW,
]

// Role definitions
const ROLES = {
    cashier: CASHIER_PERMISSIONS,
    chef: CHEF_PERMISSIONS,
    manager: MANAGER_PERMISSIONS,
    supervisor: SUPERVISOR_PERMISSIONS,
    accountant: ACCOUNTANT_PERMISSIONS,
    admin: ['*'], // All permissions
}

/**
 * Check if a role has a specific permission
 * @param {string} role - User role (cashier, manager, admin)
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
export const hasPermission = (role, permission) => {
    const permissions = ROLES[role]
    if (!permissions) return false

    // Admin has all permissions
    if (permissions.includes('*')) return true

    return permissions.includes(permission)
}

/**
 * Check if user has any of the specified permissions
 * @param {string} role - User role
 * @param {string[]} permissions - Permissions to check (OR logic)
 * @returns {boolean}
 */
export const hasAnyPermission = (role, permissions) => {
    return permissions.some(permission => hasPermission(role, permission))
}

/**
 * Check if user has all specified permissions
 * @param {string} role - User role
 * @param {string[]} permissions - Permissions to check (AND logic)
 * @returns {boolean}
 */
export const hasAllPermissions = (role, permissions) => {
    return permissions.every(permission => hasPermission(role, permission))
}

/**
 * Get all permissions for a role
 * @param {string} role - User role
 * @returns {string[]}
 */
export const getPermissions = (role) => {
    const permissions = ROLES[role]
    if (!permissions) return []

    if (permissions.includes('*')) {
        return Object.values(PERMISSIONS)
    }

    return permissions
}

/**
 * Check if user can access a route based on route path
 * @param {string} role - User role
 * @param {string} path - Route path
 * @returns {boolean}
 */
export const canAccessRoute = (role, path) => {
    const routePermissions = {
        '/reports': PERMISSIONS.REPORTS_VIEW,
        '/menu': PERMISSIONS.MENU_VIEW,
        '/settings': PERMISSIONS.SETTINGS_ACCESS,
        '/users': PERMISSIONS.USERS_MANAGE,
    }

    const requiredPermission = routePermissions[path]
    if (!requiredPermission) return true // No restriction

    return hasPermission(role, requiredPermission)
}

export default {
    PERMISSIONS,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getPermissions,
    canAccessRoute,
}
