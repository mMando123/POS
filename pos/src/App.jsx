
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import NewOrder from './pages/NewOrder'
import Menu from './pages/Menu'
import Reports from './pages/Reports'
import ShiftHistory from './pages/ShiftHistory'
import CashierPerformance from './pages/CashierPerformance'
import CashierQueue from './pages/CashierQueue'
import PendingOrders from './pages/PendingOrders'
import Users from './pages/Users'
import Branches from './pages/Branches'
import Settings from './pages/Settings'
import DeviceManager from './pages/DeviceManager'
import Inventory from './pages/Inventory'
import Warehouses from './pages/Warehouses'
import PurchaseReceipts from './pages/PurchaseReceipts'
import RefundsPage from './pages/RefundsPage'
import Suppliers from './pages/Suppliers'
import PurchaseOrders from './pages/PurchaseOrders'
import PurchaseReturns from './pages/PurchaseReturns'
import StockTransfers from './pages/StockTransfers'
import StockIssues from './pages/StockIssues'
import FinancialReports from './pages/FinancialReports'
import ExpensesPage from './pages/ExpensesPage'
import AccountDefaults from './pages/AccountDefaults'
import COAManager from './pages/COAManager'
import JournalEntries from './pages/JournalEntries'
import GeneralLedger from './pages/GeneralLedger'
import AuditLog from './pages/AuditLog'
import Profile from './pages/Profile'
import AccountingDashboard from './pages/AccountingDashboard'
import CouponsPage from './pages/CouponsPage'
import CustomersPage from './pages/CustomersPage'
import SalesInvoices from './pages/SalesInvoices'
import DeliveryBoard from './pages/DeliveryBoard'
import DeliveryManagement from './pages/DeliveryManagement'
import HrDashboard from './pages/HrDashboard'
import HrEmployees from './pages/HrEmployees'
import HrDepartments from './pages/HrDepartments'
import HrAttendance from './pages/HrAttendance'
import HrLeaveManagement from './pages/HrLeaveManagement'
import HrPayroll from './pages/HrPayroll'
import HrPerformance from './pages/HrPerformance'
import HrTraining from './pages/HrTraining'

import InventoryReports from './pages/InventoryReports'
import ProtectedRoute, { PERMISSIONS } from './components/ProtectedRoute'
import { SocketManager } from './services/socketEvents'
import { ShiftProvider } from './providers/ShiftProvider'
import PWAStatusBar from './components/PWAStatusBar'

function PrivateRoute({ children }) {
    const { isAuthenticated } = useSelector((state) => state.auth)
    return isAuthenticated ? children : <Navigate to="/login" replace />
}

function App() {
    const { isAuthenticated, user } = useSelector((state) => state.auth)
    const userRole = user?.role || 'cashier'

    useEffect(() => {
        const updateFavicon = async () => {
            try {
                // Fetch public settings for branding
                const res = await fetch('/api/settings/public')
                const { data } = await res.json()

                if (data?.logo) {
                    let link = document.querySelector("link[rel~='icon']")
                    if (!link) {
                        link = document.createElement('link')
                        link.rel = 'icon'
                        document.getElementsByTagName('head')[0].appendChild(link)
                    }
                    // Handle path (uploads are usually served from root via proxy)
                    const logoPath = data.logo.startsWith('/') ? data.logo : `/${data.logo}`
                    link.href = logoPath
                }

                if (data?.storeName) {
                    document.title = data.storeName
                }

            } catch (error) {
                console.error('Failed to load branding:', error)
            }
        }
        updateFavicon()
    }, [])

    return (
        <BrowserRouter>
            <PWAStatusBar />
            {isAuthenticated && <SocketManager />}
            {isAuthenticated && (
                <ShiftProvider>
                    <Routes>
                        <Route path="/login" element={<Navigate to="/" replace />} />
                        <Route
                            path="/"
                            element={
                                <PrivateRoute>
                                    <Layout />
                                </PrivateRoute>
                            }
                        >
                            <Route index element={
                                userRole === 'cashier' ? <Navigate to="/new-order" replace /> : <Dashboard />
                            } />
                            <Route path="sales-invoices" element={<SalesInvoices />} />
                            <Route path="delivery-board" element={<DeliveryBoard />} />
                            <Route path="delivery-management" element={<DeliveryManagement />} />
                            <Route path="orders" element={<Orders />} />
                            <Route path="new-order" element={<NewOrder />} />
                            <Route path="profile" element={<Profile />} />
                            <Route path="cashier-queue" element={<CashierQueue />} />
                            <Route path="pending-orders" element={<PendingOrders />} />
                            <Route path="menu" element={
                                <ProtectedRoute permission={PERMISSIONS.MENU_VIEW} redirectTo="/">
                                    <Menu />
                                </ProtectedRoute>
                            } />
                            <Route path="reports" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <Reports />
                                </ProtectedRoute>
                            } />
                            <Route path="shift-history" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <ShiftHistory />
                                </ProtectedRoute>
                            } />
                            <Route path="performance" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <CashierPerformance />
                                </ProtectedRoute>
                            } />
                            <Route path="users" element={
                                <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE} redirectTo="/">
                                    <Users />
                                </ProtectedRoute>
                            } />
                            <Route path="branches" element={
                                <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE} redirectTo="/">
                                    <Branches />
                                </ProtectedRoute>
                            } />
                            <Route path="settings" element={
                                <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE} redirectTo="/">
                                    <Settings />
                                </ProtectedRoute>
                            } />
                            <Route path="devices" element={
                                <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE} redirectTo="/">
                                    <DeviceManager />
                                </ProtectedRoute>
                            } />
                            <Route path="inventory" element={
                                <ProtectedRoute permission={PERMISSIONS.MENU_VIEW} redirectTo="/">
                                    <Inventory />
                                </ProtectedRoute>
                            } />
                            <Route path="warehouses" element={
                                <ProtectedRoute permission={PERMISSIONS.MENU_VIEW} redirectTo="/">
                                    <Warehouses />
                                </ProtectedRoute>
                            } />
                            <Route path="purchases" element={
                                <ProtectedRoute permission={PERMISSIONS.MENU_VIEW} redirectTo="/">
                                    <PurchaseReceipts />
                                </ProtectedRoute>
                            } />
                            <Route path="refunds" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <RefundsPage />
                                </ProtectedRoute>
                            } />
                            <Route path="coupons" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <CouponsPage />
                                </ProtectedRoute>
                            } />
                            <Route path="customers" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <CustomersPage />
                                </ProtectedRoute>
                            } />
                            <Route path="suppliers" element={
                                <ProtectedRoute permission={PERMISSIONS.MENU_VIEW} redirectTo="/">
                                    <Suppliers />
                                </ProtectedRoute>
                            } />
                            <Route path="purchase-orders" element={
                                <ProtectedRoute permission={PERMISSIONS.MENU_VIEW} redirectTo="/">
                                    <PurchaseOrders />
                                </ProtectedRoute>
                            } />
                            <Route path="purchase-returns" element={
                                <ProtectedRoute permission={PERMISSIONS.MENU_VIEW} redirectTo="/">
                                    <PurchaseReturns />
                                </ProtectedRoute>
                            } />
                            <Route path="stock-transfers" element={
                                <ProtectedRoute permission={PERMISSIONS.MENU_VIEW} redirectTo="/">
                                    <StockTransfers />
                                </ProtectedRoute>
                            } />
                            <Route path="stock-issues" element={
                                <ProtectedRoute permission={PERMISSIONS.MENU_VIEW} redirectTo="/">
                                    <StockIssues />
                                </ProtectedRoute>
                            } />
                            <Route path="inventory-reports" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <InventoryReports />
                                </ProtectedRoute>
                            } />
                            <Route path="financial-reports" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <FinancialReports />
                                </ProtectedRoute>
                            } />
                            <Route path="expenses" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <ExpensesPage />
                                </ProtectedRoute>
                            } />
                            <Route path="account-defaults" element={
                                <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE} redirectTo="/">
                                    <AccountDefaults />
                                </ProtectedRoute>
                            } />
                            <Route path="coa-manager" element={
                                <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE} redirectTo="/">
                                    <COAManager />
                                </ProtectedRoute>
                            } />
                            <Route path="journal-entries" element={
                                <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE} redirectTo="/">
                                    <JournalEntries />
                                </ProtectedRoute>
                            } />
                            <Route path="general-ledger" element={
                                <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW} redirectTo="/">
                                    <GeneralLedger />
                                </ProtectedRoute>
                            } />
                            <Route path="audit-log" element={
                                <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE} redirectTo="/">
                                    <AuditLog />
                                </ProtectedRoute>
                            } />
                            <Route path="accounting-dashboard" element={<AccountingDashboard />} />
                            <Route path="hr/dashboard" element={
                                <ProtectedRoute permission={PERMISSIONS.HR_REPORTS_VIEW} redirectTo="/">
                                    <HrDashboard />
                                </ProtectedRoute>
                            } />
                            <Route path="hr/employees" element={
                                <ProtectedRoute permission={PERMISSIONS.HR_EMPLOYEE_VIEW} redirectTo="/">
                                    <HrEmployees />
                                </ProtectedRoute>
                            } />
                            <Route path="hr/departments" element={
                                <ProtectedRoute permission={PERMISSIONS.HR_DEPARTMENT_VIEW} redirectTo="/">
                                    <HrDepartments />
                                </ProtectedRoute>
                            } />
                            <Route path="hr/attendance" element={
                                <ProtectedRoute permission={PERMISSIONS.HR_ATTENDANCE_VIEW} redirectTo="/">
                                    <HrAttendance />
                                </ProtectedRoute>
                            } />
                            <Route path="hr/leaves" element={
                                <ProtectedRoute permission={PERMISSIONS.HR_LEAVE_VIEW} redirectTo="/">
                                    <HrLeaveManagement />
                                </ProtectedRoute>
                            } />
                            <Route path="hr/payroll" element={
                                <ProtectedRoute permission={PERMISSIONS.HR_PAYROLL_VIEW} redirectTo="/">
                                    <HrPayroll />
                                </ProtectedRoute>
                            } />
                            <Route path="hr/performance" element={
                                <ProtectedRoute permission={PERMISSIONS.HR_REPORTS_VIEW} redirectTo="/">
                                    <HrPerformance />
                                </ProtectedRoute>
                            } />
                            <Route path="hr/training" element={
                                <ProtectedRoute permission={PERMISSIONS.HR_REPORTS_VIEW} redirectTo="/">
                                    <HrTraining />
                                </ProtectedRoute>
                            } />
                        </Route>
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </ShiftProvider>
            )}
            {!isAuthenticated && (
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            )}
        </BrowserRouter>
    )
}

export default App

