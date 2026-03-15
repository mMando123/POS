/**
 * Permission-based Authorization System
 * 
 * This file defines all permissions and role mappings for the POS system.
 * Permissions follow the format: resource.action
 */

// All available permissions in the system
const PERMISSIONS = {
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
    // Orders - can create and view own orders
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_VIEW_OWN,
    PERMISSIONS.ORDERS_PROCESS,

    // Cart - full control
    PERMISSIONS.CART_MANAGE,

    // Payment - can process
    PERMISSIONS.PAYMENT_PROCESS,

    // Receipt - can print
    PERMISSIONS.RECEIPT_PRINT,

    // KDS - can send and view
    PERMISSIONS.KDS_SEND,
    PERMISSIONS.KDS_VIEW,
    PERMISSIONS.KDS_UPDATE,

    // Menu - view only
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.CATEGORY_VIEW,
]

// Manager permissions (includes cashier + more)
const MANAGER_PERMISSIONS = [
    ...CASHIER_PERMISSIONS,

    // Orders - full control
    PERMISSIONS.ORDERS_VIEW_ALL,
    PERMISSIONS.ORDERS_CANCEL,

    // Menu - full control
    PERMISSIONS.MENU_CREATE,
    PERMISSIONS.MENU_UPDATE,
    PERMISSIONS.MENU_DELETE,
    PERMISSIONS.CATEGORY_MANAGE,

    // Reports - view
    PERMISSIONS.REPORTS_VIEW,

    // HR
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

// Accountant permissions (financial reporting-focused)
const ACCOUNTANT_PERMISSIONS = [
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.CATEGORY_VIEW,
    PERMISSIONS.HR_REPORTS_VIEW,
]

// Role definitions with their permissions
const ROLES = {
    cashier: {
        name: 'Cashier',
        name_en: 'Cashier',
        permissions: CASHIER_PERMISSIONS
    },

    chef: {
        name: 'Chef',
        name_en: 'Chef',
        permissions: CHEF_PERMISSIONS
    },

    manager: {
        name: 'Manager',
        name_en: 'Manager',
        permissions: MANAGER_PERMISSIONS
    },

    supervisor: {
        name: 'Supervisor',
        name_en: 'Supervisor',
        permissions: SUPERVISOR_PERMISSIONS
    },

    accountant: {
        name: 'Accountant',
        name_en: 'Accountant',
        permissions: ACCOUNTANT_PERMISSIONS
    },

    admin: {
        name: 'Admin',
        name_en: 'Admin',
        permissions: ['*'] // Wildcard = all permissions
    }
}

/**
 * Check if a role has a specific permission
 * @param {string} role - Role name (cashier, manager, admin)
 * @param {string} permission - Permission string (e.g., 'orders.create')
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
    const roleConfig = ROLES[role]
    if (!roleConfig) return false

    // Admin has all permissions (wildcard)
    if (roleConfig.permissions.includes('*')) return true

    // Check specific permission
    return roleConfig.permissions.includes(permission)
}

/**
 * Get all permissions for a role
 * @param {string} role - Role name
 * @returns {string[]} Array of permission strings
 */
const getPermissions = (role) => {
    const roleConfig = ROLES[role]
    if (!roleConfig) return []

    // Admin returns all permissions
    if (roleConfig.permissions.includes('*')) {
        return Object.values(PERMISSIONS)
    }

    return roleConfig.permissions
}

/**
 * Get role display name
 * @param {string} role - Role name
 * @param {string} lang - Language (ar/en)
 * @returns {string}
 */
const getRoleName = (role, lang = 'ar') => {
    const roleConfig = ROLES[role]
    if (!roleConfig) return role
    return lang === 'ar' ? roleConfig.name : roleConfig.name_en
}

/**
 * Get all available roles
 * @returns {string[]}
 */
const getAllRoles = () => Object.keys(ROLES)

module.exports = {
    PERMISSIONS,
    ROLES,
    hasPermission,
    getPermissions,
    getRoleName,
    getAllRoles
}
