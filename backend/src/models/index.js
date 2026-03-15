const { DataTypes } = require('sequelize')
const { sequelize, testConnection } = require('../config/database')
const Branch = require('./Branch')
const User = require('./User')
const Category = require('./Category')
const Menu = require('./Menu')
const MenuIngredient = require('./MenuIngredient')
const Customer = require('./Customer')
const Shift = require('./Shift')
const Order = require('./Order')
const OrderItem = require('./OrderItem')
const OrderPayment = require('./OrderPayment')
const POSOpeningEntry = require('./POSOpeningEntry')
const POSClosingEntry = require('./POSClosingEntry')
const Coupon = require('./Coupon')
const PriceList = require('./PriceList')
const PriceListItem = require('./PriceListItem')
const PromotionRule = require('./PromotionRule')
const LoyaltyLedger = require('./LoyaltyLedger')
const Notification = require('./Notification')(sequelize)
const Device = require('./Device')(sequelize)
const PrintJob = require('./PrintJob')(sequelize)
const PrintTemplate = require('./PrintTemplate')(sequelize)
const PaymentGateway = require('./PaymentGateway')
// Inventory Models
const Warehouse = require('./Warehouse')
const Stock = require('./Stock')
const StockMovement = require('./StockMovement')
const PurchaseReceipt = require('./PurchaseReceipt')
const PurchaseReceiptItem = require('./PurchaseReceiptItem')
const StockTransfer = require('./StockTransfer')
const StockTransferItem = require('./StockTransferItem')
const StockAdjustment = require('./StockAdjustment')
// Supplier & Purchase Order Models
const Supplier = require('./Supplier')
const PurchaseOrder = require('./PurchaseOrder')
const PurchaseOrderItem = require('./PurchaseOrderItem')
const SupplierPayment = require('./SupplierPayment')
const PurchaseReturn = require('./PurchaseReturn')
const PurchaseReturnItem = require('./PurchaseReturnItem')
const RefreshToken = require('./RefreshToken')
const AuditLog = require('./AuditLog')
// Refund Models
const Refund = require('./Refund')
const RefundItem = require('./RefundItem')
// Financial Integrity Models (Phase 1)
const IdempotencyKey = require('./IdempotencyKey')
// Accounting Layer Models (Phase 2)
const Account = require('./Account')
const JournalEntry = require('./JournalEntry')
const JournalLine = require('./JournalLine')
const JournalAttachment = require('./JournalAttachment')
const EntityAttachment = require('./EntityAttachment')
const FiscalPeriod = require('./FiscalPeriod')
const CashDrawer = require('./CashDrawer')
const GLAuditLog = require('./GLAuditLog')
// Accounting Layer â€” Phase 3 (ERP-Ready)
const AccountDefault = require('./AccountDefault')
// Accounting Layer â€” ERPNext-Style Architecture
const Company = require('./Company')
const CostCenter = require('./CostCenter')
// HR Module Models
const Department = require('./Department')
const Designation = require('./Designation')
const Employee = require('./Employee')
const EmployeeSalary = require('./EmployeeSalary')
const SalaryComponent = require('./SalaryComponent')
const HRAttendance = require('./HRAttendance')
const LeaveRequest = require('./LeaveRequest')
const LeaveBalance = require('./LeaveBalance')
const PerformanceReview = require('./PerformanceReview')
const TrainingProgram = require('./TrainingProgram')
const DeliveryPersonnel = require('./DeliveryPersonnel')
const StockIssue = require('./StockIssue')
const StockIssueItem = require('./StockIssueItem')

// Define associations
// Branch associations
Branch.hasMany(User, { foreignKey: 'branch_id' })
User.belongsTo(Branch, { foreignKey: 'branch_id' })

Branch.hasMany(Category, { foreignKey: 'branch_id' })
Category.belongsTo(Branch, { foreignKey: 'branch_id' })

Branch.hasMany(Menu, { foreignKey: 'branch_id' })
Menu.belongsTo(Branch, { foreignKey: 'branch_id' })

Branch.hasMany(Order, { foreignKey: 'branch_id' })
// Delivery Personnel associations
DeliveryPersonnel.hasMany(Order, { foreignKey: 'delivery_personnel_id', as: 'deliveryOrders' })
Order.belongsTo(DeliveryPersonnel, { foreignKey: 'delivery_personnel_id', as: 'deliveryRider' })

// DeliveryPersonnel -> Branch
Branch.hasMany(DeliveryPersonnel, { foreignKey: 'branch_id', as: 'deliveryPersonnel' })
DeliveryPersonnel.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' })

// Employee <-> User account link (1:1)
Employee.belongsTo(User, { foreignKey: 'user_id', as: 'userAccount' })
User.hasOne(Employee, { foreignKey: 'user_id', as: 'employeeProfile' })

// DeliveryPersonnel <-> Employee HR link (1:1)
DeliveryPersonnel.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' })
Employee.hasOne(DeliveryPersonnel, { foreignKey: 'employee_id', as: 'deliveryProfile' })

Order.belongsTo(Branch, { foreignKey: 'branch_id' })

Branch.hasMany(Shift, { foreignKey: 'branch_id' })
Shift.belongsTo(Branch, { foreignKey: 'branch_id' })

Branch.hasMany(Coupon, { foreignKey: 'branch_id' })
Coupon.belongsTo(Branch, { foreignKey: 'branch_id' })

Branch.hasMany(PriceList, { foreignKey: 'branch_id' })
PriceList.belongsTo(Branch, { foreignKey: 'branch_id' })

Branch.hasMany(PromotionRule, { foreignKey: 'branch_id' })
PromotionRule.belongsTo(Branch, { foreignKey: 'branch_id' })

Branch.hasMany(LoyaltyLedger, { foreignKey: 'branch_id' })
LoyaltyLedger.belongsTo(Branch, { foreignKey: 'branch_id' })

// ==================== HR ASSOCIATIONS ====================

// Branch -> HR
Branch.hasMany(Department, { foreignKey: 'branch_id', as: 'departments' })
Department.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' })

Branch.hasMany(Designation, { foreignKey: 'branch_id', as: 'designations' })
Designation.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' })

Branch.hasMany(Employee, { foreignKey: 'branch_id', as: 'employees' })
Employee.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' })

Branch.hasMany(HRAttendance, { foreignKey: 'branch_id', as: 'hrAttendance' })
HRAttendance.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' })

Branch.hasMany(LeaveRequest, { foreignKey: 'branch_id', as: 'leaveRequests' })
LeaveRequest.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' })

// Department hierarchy
Department.hasMany(Designation, { foreignKey: 'department_id', as: 'designations' })
Designation.belongsTo(Department, { foreignKey: 'department_id', as: 'department' })

Department.hasMany(Employee, { foreignKey: 'department_id', as: 'employees' })
Employee.belongsTo(Department, { foreignKey: 'department_id', as: 'department' })

// Designation -> Employee
Designation.hasMany(Employee, { foreignKey: 'designation_id', as: 'employees' })
Employee.belongsTo(Designation, { foreignKey: 'designation_id', as: 'designation' })

// Employee -> Department manager
Department.belongsTo(Employee, { foreignKey: 'manager_id', as: 'manager' })
Employee.hasMany(Department, { foreignKey: 'manager_id', as: 'managedDepartments' })

// Employee -> Salaries
Employee.hasMany(EmployeeSalary, { foreignKey: 'employee_id', as: 'salaries' })
EmployeeSalary.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' })

EmployeeSalary.hasMany(SalaryComponent, { foreignKey: 'salary_id', as: 'components' })
SalaryComponent.belongsTo(EmployeeSalary, { foreignKey: 'salary_id', as: 'salary' })

// Employee -> Attendance
Employee.hasMany(HRAttendance, { foreignKey: 'employee_id', as: 'attendanceRecords' })
HRAttendance.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' })

// Employee -> Leaves
Employee.hasMany(LeaveRequest, { foreignKey: 'employee_id', as: 'leaveRequests' })
LeaveRequest.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' })

Employee.hasMany(LeaveBalance, { foreignKey: 'employee_id', as: 'leaveBalances' })
LeaveBalance.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' })

// Employee -> Performance
Employee.hasMany(PerformanceReview, { foreignKey: 'employee_id', as: 'performanceReviews' })
PerformanceReview.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' })

// Employee -> Training
Employee.hasMany(TrainingProgram, { foreignKey: 'trainer', as: 'trainingProgramsLed' })
TrainingProgram.belongsTo(Employee, { foreignKey: 'trainer', as: 'trainerEmployee' })

// User audit relations in HR
User.hasMany(Employee, { foreignKey: 'created_by', as: 'hrEmployeesCreated' })
Employee.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' })

User.hasMany(EmployeeSalary, { foreignKey: 'approved_by', as: 'hrSalariesApproved' })
EmployeeSalary.belongsTo(User, { foreignKey: 'approved_by', as: 'approvedBy' })

User.hasMany(EmployeeSalary, { foreignKey: 'created_by', as: 'hrSalariesCreated' })
EmployeeSalary.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' })

User.hasMany(HRAttendance, { foreignKey: 'recorded_by', as: 'hrAttendanceRecorded' })
HRAttendance.belongsTo(User, { foreignKey: 'recorded_by', as: 'recordedBy' })

User.hasMany(LeaveRequest, { foreignKey: 'approved_by', as: 'hrLeavesApproved' })
LeaveRequest.belongsTo(User, { foreignKey: 'approved_by', as: 'approvedBy' })

User.hasMany(LeaveRequest, { foreignKey: 'created_by', as: 'hrLeavesCreated' })
LeaveRequest.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' })

User.hasMany(PerformanceReview, { foreignKey: 'reviewer_id', as: 'hrPerformanceReviewed' })
PerformanceReview.belongsTo(User, { foreignKey: 'reviewer_id', as: 'reviewer' })

User.hasMany(PerformanceReview, { foreignKey: 'created_by', as: 'hrPerformanceCreated' })
PerformanceReview.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' })

User.hasMany(TrainingProgram, { foreignKey: 'created_by', as: 'hrTrainingCreated' })
TrainingProgram.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' })

// User-Shift association
User.hasMany(Shift, { foreignKey: 'user_id' })
Shift.belongsTo(User, { foreignKey: 'user_id' })

User.hasMany(Coupon, { foreignKey: 'created_by', as: 'createdCoupons' })
Coupon.belongsTo(User, { foreignKey: 'created_by', as: 'creator' })

User.hasMany(LoyaltyLedger, { foreignKey: 'created_by', as: 'loyaltyEntriesCreated' })
LoyaltyLedger.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' })

// User-RefreshToken association
User.hasMany(RefreshToken, { foreignKey: 'user_id' })
RefreshToken.belongsTo(User, { foreignKey: 'user_id' })

// Shift-Order association
Shift.hasMany(Order, { foreignKey: 'shift_id' })
Order.belongsTo(Shift, { foreignKey: 'shift_id' })

// Price list reference on order
PriceList.hasMany(Order, { foreignKey: 'price_list_id', as: 'orders' })
Order.belongsTo(PriceList, { foreignKey: 'price_list_id', as: 'priceList' })

// Shift-POS opening/closing artifacts
Shift.hasOne(POSOpeningEntry, { foreignKey: 'shift_id', as: 'openingEntry' })
POSOpeningEntry.belongsTo(Shift, { foreignKey: 'shift_id', as: 'shift' })

Shift.hasOne(POSClosingEntry, { foreignKey: 'shift_id', as: 'closingEntry' })
POSClosingEntry.belongsTo(Shift, { foreignKey: 'shift_id', as: 'shift' })

POSOpeningEntry.hasOne(POSClosingEntry, { foreignKey: 'opening_entry_id', as: 'closingEntry' })
POSClosingEntry.belongsTo(POSOpeningEntry, { foreignKey: 'opening_entry_id', as: 'openingEntry' })

Branch.hasMany(POSOpeningEntry, { foreignKey: 'branch_id' })
POSOpeningEntry.belongsTo(Branch, { foreignKey: 'branch_id' })

Branch.hasMany(POSClosingEntry, { foreignKey: 'branch_id' })
POSClosingEntry.belongsTo(Branch, { foreignKey: 'branch_id' })

User.hasMany(POSOpeningEntry, { foreignKey: 'user_id', as: 'posOpeningEntries' })
POSOpeningEntry.belongsTo(User, { foreignKey: 'user_id', as: 'user' })

User.hasMany(POSClosingEntry, { foreignKey: 'closed_by', as: 'posClosingEntries' })
POSClosingEntry.belongsTo(User, { foreignKey: 'closed_by', as: 'closer' })

// Category-Menu association
Category.hasMany(Menu, { foreignKey: 'category_id' })
Menu.belongsTo(Category, { foreignKey: 'category_id' })

// Customer-Order association
Customer.hasMany(Order, { foreignKey: 'customer_id' })
Order.belongsTo(Customer, { foreignKey: 'customer_id' })

// Customer-Loyalty association
Customer.hasMany(LoyaltyLedger, { foreignKey: 'customer_id', as: 'loyaltyEntries' })
LoyaltyLedger.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' })

// User-Order association
User.hasMany(Order, { foreignKey: 'user_id' })
Order.belongsTo(User, { foreignKey: 'user_id' })

// Order-OrderItem association
Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' })
OrderItem.belongsTo(Order, { foreignKey: 'order_id' })

Order.hasMany(LoyaltyLedger, { foreignKey: 'order_id', as: 'loyaltyEntries' })
LoyaltyLedger.belongsTo(Order, { foreignKey: 'order_id', as: 'order' })

// Order split payments
Order.hasMany(OrderPayment, { foreignKey: 'order_id', as: 'payments' })
OrderPayment.belongsTo(Order, { foreignKey: 'order_id' })

Shift.hasMany(OrderPayment, { foreignKey: 'shift_id', as: 'orderPayments' })
OrderPayment.belongsTo(Shift, { foreignKey: 'shift_id' })

Branch.hasMany(OrderPayment, { foreignKey: 'branch_id' })
OrderPayment.belongsTo(Branch, { foreignKey: 'branch_id' })

User.hasMany(OrderPayment, { foreignKey: 'processed_by', as: 'processedOrderPayments' })
OrderPayment.belongsTo(User, { foreignKey: 'processed_by', as: 'processor' })

// Menu-OrderItem association
Menu.hasMany(OrderItem, { foreignKey: 'menu_id' })
OrderItem.belongsTo(Menu, { foreignKey: 'menu_id' })

// Menu composite recipe (BOM) associations
Menu.hasMany(MenuIngredient, { foreignKey: 'menu_id', as: 'recipeIngredients' })
MenuIngredient.belongsTo(Menu, { foreignKey: 'menu_id', as: 'menu' })
Menu.hasMany(MenuIngredient, { foreignKey: 'ingredient_menu_id', as: 'usedInRecipes' })
MenuIngredient.belongsTo(Menu, { foreignKey: 'ingredient_menu_id', as: 'ingredient' })

Menu.hasMany(PriceListItem, { foreignKey: 'menu_id', as: 'priceOverrides' })
PriceListItem.belongsTo(Menu, { foreignKey: 'menu_id', as: 'menu' })

PriceList.hasMany(PriceListItem, { foreignKey: 'price_list_id', as: 'items' })
PriceListItem.belongsTo(PriceList, { foreignKey: 'price_list_id', as: 'priceList' })

Menu.hasMany(PromotionRule, { foreignKey: 'menu_id', as: 'promotionRules' })
PromotionRule.belongsTo(Menu, { foreignKey: 'menu_id', as: 'menu' })

// ==================== INVENTORY ASSOCIATIONS ====================

// Warehouse-Branch association
Branch.hasMany(Warehouse, { foreignKey: 'branch_id' })
Warehouse.belongsTo(Branch, { foreignKey: 'branch_id' })

// Warehouse-User (Manager) association
User.hasMany(Warehouse, { foreignKey: 'manager_id', as: 'managedWarehouses' })
Warehouse.belongsTo(User, { foreignKey: 'manager_id', as: 'manager' })

// User default selling warehouse assignment (optional)
Warehouse.hasMany(User, { foreignKey: 'default_warehouse_id', as: 'usersByDefaultWarehouse' })
User.belongsTo(Warehouse, { foreignKey: 'default_warehouse_id', as: 'defaultWarehouse' })

// Stock associations
Menu.hasMany(Stock, { foreignKey: 'menu_id' })
Stock.belongsTo(Menu, { foreignKey: 'menu_id' })

Warehouse.hasMany(Stock, { foreignKey: 'warehouse_id' })
Stock.belongsTo(Warehouse, { foreignKey: 'warehouse_id' })

// StockMovement associations
Menu.hasMany(StockMovement, { foreignKey: 'menu_id' })
StockMovement.belongsTo(Menu, { foreignKey: 'menu_id' })

Warehouse.hasMany(StockMovement, { foreignKey: 'warehouse_id' })
StockMovement.belongsTo(Warehouse, { foreignKey: 'warehouse_id' })

User.hasMany(StockMovement, { foreignKey: 'user_id' })
StockMovement.belongsTo(User, { foreignKey: 'user_id' })

// PurchaseReceipt associations
Warehouse.hasMany(PurchaseReceipt, { foreignKey: 'warehouse_id' })
PurchaseReceipt.belongsTo(Warehouse, { foreignKey: 'warehouse_id' })

User.hasMany(PurchaseReceipt, { foreignKey: 'created_by', as: 'createdPurchases' })
PurchaseReceipt.belongsTo(User, { foreignKey: 'created_by', as: 'creator' })

User.hasMany(PurchaseReceipt, { foreignKey: 'received_by', as: 'receivedPurchases' })
PurchaseReceipt.belongsTo(User, { foreignKey: 'received_by', as: 'receiver' })

PurchaseReceipt.hasMany(PurchaseReceiptItem, { foreignKey: 'receipt_id', as: 'items' })
PurchaseReceiptItem.belongsTo(PurchaseReceipt, { foreignKey: 'receipt_id' })

Menu.hasMany(PurchaseReceiptItem, { foreignKey: 'menu_id' })
PurchaseReceiptItem.belongsTo(Menu, { foreignKey: 'menu_id' })

// PurchaseReceipt - PurchaseOrder link (for receipts created from PO)
PurchaseOrder.hasMany(PurchaseReceipt, { foreignKey: 'purchase_order_id', as: 'receipts' })
PurchaseReceipt.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id', as: 'purchaseOrder' })

// PurchaseReceipt - Supplier link
Supplier.hasMany(PurchaseReceipt, { foreignKey: 'supplier_id' })
PurchaseReceipt.belongsTo(Supplier, { foreignKey: 'supplier_id' })

// PurchaseReceipt - Branch link
Branch.hasMany(PurchaseReceipt, { foreignKey: 'branch_id' })
PurchaseReceipt.belongsTo(Branch, { foreignKey: 'branch_id' })

// StockTransfer associations
Warehouse.hasMany(StockTransfer, { foreignKey: 'from_warehouse_id', as: 'outgoingTransfers' })
StockTransfer.belongsTo(Warehouse, { foreignKey: 'from_warehouse_id', as: 'fromWarehouse' })

Warehouse.hasMany(StockTransfer, { foreignKey: 'to_warehouse_id', as: 'incomingTransfers' })
StockTransfer.belongsTo(Warehouse, { foreignKey: 'to_warehouse_id', as: 'toWarehouse' })

User.hasMany(StockTransfer, { foreignKey: 'transferred_by' })
StockTransfer.belongsTo(User, { foreignKey: 'transferred_by', as: 'transferredBy' })

StockTransfer.hasMany(StockTransferItem, { foreignKey: 'transfer_id', as: 'items' })
StockTransferItem.belongsTo(StockTransfer, { foreignKey: 'transfer_id' })

Menu.hasMany(StockTransferItem, { foreignKey: 'menu_id' })
StockTransferItem.belongsTo(Menu, { foreignKey: 'menu_id' })

// StockAdjustment associations
Warehouse.hasMany(StockAdjustment, { foreignKey: 'warehouse_id' })
StockAdjustment.belongsTo(Warehouse, { foreignKey: 'warehouse_id' })

Menu.hasMany(StockAdjustment, { foreignKey: 'menu_id' })
StockAdjustment.belongsTo(Menu, { foreignKey: 'menu_id' })

User.hasMany(StockAdjustment, { foreignKey: 'created_by', as: 'createdAdjustments' })
StockAdjustment.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' })

User.hasMany(StockAdjustment, { foreignKey: 'approved_by', as: 'approvedAdjustments' })
StockAdjustment.belongsTo(User, { foreignKey: 'approved_by', as: 'approvedBy' })

// StockIssue associations (إذن صرف بضاعة)
Warehouse.hasMany(StockIssue, { foreignKey: 'warehouse_id' })
StockIssue.belongsTo(Warehouse, { foreignKey: 'warehouse_id' })

Branch.hasMany(StockIssue, { foreignKey: 'branch_id' })
StockIssue.belongsTo(Branch, { foreignKey: 'branch_id' })

User.hasMany(StockIssue, { foreignKey: 'created_by', as: 'createdIssues' })
StockIssue.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' })

User.hasMany(StockIssue, { foreignKey: 'approved_by', as: 'approvedIssues' })
StockIssue.belongsTo(User, { foreignKey: 'approved_by', as: 'approvedBy' })

User.hasMany(StockIssue, { foreignKey: 'issued_by', as: 'executedIssues' })
StockIssue.belongsTo(User, { foreignKey: 'issued_by', as: 'issuedBy' })

StockIssue.hasMany(StockIssueItem, { foreignKey: 'issue_id', as: 'items' })
StockIssueItem.belongsTo(StockIssue, { foreignKey: 'issue_id' })

Menu.hasMany(StockIssueItem, { foreignKey: 'menu_id' })
StockIssueItem.belongsTo(Menu, { foreignKey: 'menu_id' })

// ==================== SUPPLIER & PURCHASE ORDER ASSOCIATIONS ====================

// Supplier associations
Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplier_id' })
PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplier_id' })

// PurchaseOrder-Warehouse association
Warehouse.hasMany(PurchaseOrder, { foreignKey: 'warehouse_id' })
PurchaseOrder.belongsTo(Warehouse, { foreignKey: 'warehouse_id' })

// PurchaseOrder-User associations
User.hasMany(PurchaseOrder, { foreignKey: 'created_by', as: 'createdPurchaseOrders' })
PurchaseOrder.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' })

User.hasMany(PurchaseOrder, { foreignKey: 'confirmed_by', as: 'confirmedPurchaseOrders' })
PurchaseOrder.belongsTo(User, { foreignKey: 'confirmed_by', as: 'confirmedBy' })

User.hasMany(PurchaseOrder, { foreignKey: 'received_by', as: 'receivedPurchaseOrders' })
PurchaseOrder.belongsTo(User, { foreignKey: 'received_by', as: 'receivedBy' })

// PurchaseOrder-Items association
PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: 'purchase_order_id', as: 'items' })
PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' })

// PurchaseOrderItem-Menu association
Menu.hasMany(PurchaseOrderItem, { foreignKey: 'menu_id' })
PurchaseOrderItem.belongsTo(Menu, { foreignKey: 'menu_id' })

// SupplierPayment associations
Supplier.hasMany(SupplierPayment, { foreignKey: 'supplier_id' })
SupplierPayment.belongsTo(Supplier, { foreignKey: 'supplier_id' })

PurchaseOrder.hasMany(SupplierPayment, { foreignKey: 'purchase_order_id' })
SupplierPayment.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' })

User.hasMany(SupplierPayment, { foreignKey: 'created_by', as: 'createdPayments' })
SupplierPayment.belongsTo(User, { foreignKey: 'created_by', as: 'creator' })

// SupplierPayment - Branch link
Branch.hasMany(SupplierPayment, { foreignKey: 'branch_id' })
SupplierPayment.belongsTo(Branch, { foreignKey: 'branch_id' })

// PurchaseReturn associations
PurchaseOrder.hasMany(PurchaseReturn, { foreignKey: 'purchase_order_id', as: 'returns' })
PurchaseReturn.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' })

Supplier.hasMany(PurchaseReturn, { foreignKey: 'supplier_id' })
PurchaseReturn.belongsTo(Supplier, { foreignKey: 'supplier_id' })

Warehouse.hasMany(PurchaseReturn, { foreignKey: 'warehouse_id' })
PurchaseReturn.belongsTo(Warehouse, { foreignKey: 'warehouse_id' })

// PurchaseReturn - Branch link
Branch.hasMany(PurchaseReturn, { foreignKey: 'branch_id' })
PurchaseReturn.belongsTo(Branch, { foreignKey: 'branch_id' })

User.hasMany(PurchaseReturn, { foreignKey: 'created_by', as: 'createdReturns' })
PurchaseReturn.belongsTo(User, { foreignKey: 'created_by', as: 'creator' })

PurchaseReturn.hasMany(PurchaseReturnItem, { foreignKey: 'purchase_return_id', as: 'items' })
PurchaseReturnItem.belongsTo(PurchaseReturn, { foreignKey: 'purchase_return_id' })

Menu.hasMany(PurchaseReturnItem, { foreignKey: 'menu_id' })
PurchaseReturnItem.belongsTo(Menu, { foreignKey: 'menu_id' })

// ==================== REFUND ASSOCIATIONS ====================

// Refund-Order association
Order.hasMany(Refund, { foreignKey: 'order_id', as: 'refunds' })
Refund.belongsTo(Order, { foreignKey: 'order_id' })

// Refund-Branch association
Branch.hasMany(Refund, { foreignKey: 'branch_id' })
Refund.belongsTo(Branch, { foreignKey: 'branch_id' })

// Refund-User associations (processor and original cashier)
User.hasMany(Refund, { foreignKey: 'processed_by', as: 'processedRefunds' })
Refund.belongsTo(User, { foreignKey: 'processed_by', as: 'processor' })

User.hasMany(Refund, { foreignKey: 'original_cashier_id', as: 'refundedOrders' })
Refund.belongsTo(User, { foreignKey: 'original_cashier_id', as: 'originalCashier' })

// Refund-Shift associations
Shift.hasMany(Refund, { foreignKey: 'original_shift_id', as: 'originalOrderRefunds' })
Refund.belongsTo(Shift, { foreignKey: 'original_shift_id', as: 'originalShift' })

Shift.hasMany(Refund, { foreignKey: 'refund_shift_id', as: 'processedRefunds' })
Refund.belongsTo(Shift, { foreignKey: 'refund_shift_id', as: 'refundShift' })

// Refund-RefundItem association
Refund.hasMany(RefundItem, { foreignKey: 'refund_id', as: 'items' })
RefundItem.belongsTo(Refund, { foreignKey: 'refund_id' })

// RefundItem-OrderItem association
OrderItem.hasMany(RefundItem, { foreignKey: 'order_item_id' })
RefundItem.belongsTo(OrderItem, { foreignKey: 'order_item_id', as: 'orderItem' })

// RefundItem-Menu association
Menu.hasMany(RefundItem, { foreignKey: 'menu_id' })
RefundItem.belongsTo(Menu, { foreignKey: 'menu_id' })

// RefundItem-Warehouse association
Warehouse.hasMany(RefundItem, { foreignKey: 'warehouse_id' })
RefundItem.belongsTo(Warehouse, { foreignKey: 'warehouse_id' })

// ==================== Accounting Layer Associations (Phase 2) ====================

// JournalEntry <-> JournalLine
JournalEntry.hasMany(JournalLine, { foreignKey: 'journal_entry_id', as: 'lines' })
JournalLine.belongsTo(JournalEntry, { foreignKey: 'journal_entry_id' })

// JournalEntry <-> JournalAttachment
JournalEntry.hasMany(JournalAttachment, { foreignKey: 'journal_entry_id', as: 'attachments' })
JournalAttachment.belongsTo(JournalEntry, { foreignKey: 'journal_entry_id', as: 'journalEntry' })

// JournalAttachment -> User (actor)
JournalAttachment.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' })
User.hasMany(JournalAttachment, { foreignKey: 'uploaded_by', as: 'journalAttachments' })

// Generic Entity Attachments -> User (actor)
EntityAttachment.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' })
User.hasMany(EntityAttachment, { foreignKey: 'uploaded_by', as: 'entityAttachments' })

// JournalLine -> Account
JournalLine.belongsTo(Account, { foreignKey: 'account_id', as: 'account' })
Account.hasMany(JournalLine, { foreignKey: 'account_id', as: 'journalLines' })

// Account self-referential (parent-child)
Account.hasMany(Account, { foreignKey: 'parent_id', as: 'children' })
Account.belongsTo(Account, { foreignKey: 'parent_id', as: 'parent' })

// JournalEntry reversal chain
JournalEntry.belongsTo(JournalEntry, { foreignKey: 'reversal_of', as: 'originalEntry' })
JournalEntry.hasOne(JournalEntry, { foreignKey: 'reversed_by', as: 'reversalEntry' })

// JournalEntry -> Supplier (for AP-linked entries)
JournalEntry.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' })
Supplier.hasMany(JournalEntry, { foreignKey: 'supplier_id', as: 'journalEntries' })

// GLAuditLog -> JournalEntry
GLAuditLog.belongsTo(JournalEntry, { foreignKey: 'journal_entry_id', as: 'journalEntry' })
JournalEntry.hasMany(GLAuditLog, { foreignKey: 'journal_entry_id', as: 'auditLogs' })
// GLAuditLog -> User (actor)
GLAuditLog.belongsTo(User, { foreignKey: 'created_by', as: 'createdByUser' })
User.hasMany(GLAuditLog, { foreignKey: 'created_by', as: 'glAuditLogs' })

// CashDrawer -> JournalEntry links
CashDrawer.belongsTo(JournalEntry, { foreignKey: 'opening_journal_id', as: 'openingJournal' })
CashDrawer.belongsTo(JournalEntry, { foreignKey: 'closing_journal_id', as: 'closingJournal' })
CashDrawer.belongsTo(JournalEntry, { foreignKey: 'variance_journal_id', as: 'varianceJournal' })

// AccountDefault -> Account (Phase 3 â€” ERP-Ready)
AccountDefault.belongsTo(Account, { foreignKey: 'account_id', as: 'account' })
Account.hasMany(AccountDefault, { foreignKey: 'account_id', as: 'defaults' })

// ==================== ERPNext-Style Architecture Associations ====================

// Company self-referential (parent-child for consolidated reporting)
Company.hasMany(Company, { foreignKey: 'parent_company_id', as: 'subsidiaries' })
Company.belongsTo(Company, { foreignKey: 'parent_company_id', as: 'parentCompany' })

// Company <-> Branch
Company.hasMany(Branch, { foreignKey: 'company_id', as: 'branches' })
Branch.belongsTo(Company, { foreignKey: 'company_id', as: 'company' })

// Company <-> Account
Company.hasMany(Account, { foreignKey: 'company_id', as: 'accounts' })
Account.belongsTo(Company, { foreignKey: 'company_id', as: 'company' })

// Company <-> JournalEntry
Company.hasMany(JournalEntry, { foreignKey: 'company_id', as: 'journalEntries' })
JournalEntry.belongsTo(Company, { foreignKey: 'company_id', as: 'company' })

// Company <-> FiscalPeriod
Company.hasMany(FiscalPeriod, { foreignKey: 'company_id', as: 'fiscalPeriods' })
FiscalPeriod.belongsTo(Company, { foreignKey: 'company_id', as: 'company' })

// Company <-> CostCenter
Company.hasMany(CostCenter, { foreignKey: 'company_id', as: 'costCenters' })
CostCenter.belongsTo(Company, { foreignKey: 'company_id', as: 'company' })

// Company <-> AccountDefault
Company.hasMany(AccountDefault, { foreignKey: 'company_id', as: 'accountDefaults' })
AccountDefault.belongsTo(Company, { foreignKey: 'company_id', as: 'company' })

// CostCenter self-referential (parent-child hierarchy)
CostCenter.hasMany(CostCenter, { foreignKey: 'parent_id', as: 'children' })
CostCenter.belongsTo(CostCenter, { foreignKey: 'parent_id', as: 'parent' })

// CostCenter <-> JournalEntry (entry-level default)
CostCenter.hasMany(JournalEntry, { foreignKey: 'cost_center_id', as: 'journalEntries' })
JournalEntry.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' })

// CostCenter <-> JournalLine (line-level override)
CostCenter.hasMany(JournalLine, { foreignKey: 'cost_center_id', as: 'journalLines' })
JournalLine.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' })


const normalizeTableName = (entry) => {
    if (!entry) return ''
    if (typeof entry === 'string') return entry
    return entry.tableName || entry.TABLE_NAME || Object.values(entry)[0]
}

const ensurePreSyncSchemaCompatibility = async () => {
    const qi = sequelize.getQueryInterface()
    const tables = (await qi.showAllTables()).map(normalizeTableName)
    const mysqlLikeDialect = ['mysql', 'mariadb'].includes(sequelize.getDialect())

    const ensureColumn = async (tableName, columnName, definition) => {
        if (!tables.includes(tableName)) return
        const desc = await qi.describeTable(tableName)
        if (desc[columnName]) return
        await qi.addColumn(tableName, columnName, definition)
        console.log(`Added missing ${tableName}.${columnName}`)
    }

    const ensureOrderDeliveryTrackingColumns = async () => {
        if (!tables.includes('orders')) return

        let desc = await qi.describeTable('orders')

        if (!desc.picked_up_at) {
            await qi.addColumn('orders', 'picked_up_at', {
                type: DataTypes.DATE,
                allowNull: true
            })
            console.log('Added missing orders.picked_up_at')
            desc = await qi.describeTable('orders')
        }

        if (!desc.delivered_at) {
            await qi.addColumn('orders', 'delivered_at', {
                type: DataTypes.DATE,
                allowNull: true
            })
            console.log('Added missing orders.delivered_at')
            desc = await qi.describeTable('orders')
        }

        if (desc.delivery_picked_up_at && desc.picked_up_at) {
            await sequelize.query(
                `UPDATE orders
                 SET picked_up_at = COALESCE(picked_up_at, delivery_picked_up_at)
                 WHERE delivery_picked_up_at IS NOT NULL`,
                { type: sequelize.QueryTypes.UPDATE }
            )
            console.log('Backfilled orders.picked_up_at from orders.delivery_picked_up_at')
        }

        if (desc.delivery_completed_at && desc.delivered_at) {
            await sequelize.query(
                `UPDATE orders
                 SET delivered_at = COALESCE(delivered_at, delivery_completed_at)
                 WHERE delivery_completed_at IS NOT NULL`,
                { type: sequelize.QueryTypes.UPDATE }
            )
            console.log('Backfilled orders.delivered_at from orders.delivery_completed_at')
        }
    }

    const getColumnMeta = async (tableName, columnName) => {
        if (!mysqlLikeDialect) return null
        const [rows] = await sequelize.query(
            `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_SET_NAME, COLLATION_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND COLUMN_NAME = :columnName
             LIMIT 1`,
            {
                replacements: { tableName, columnName },
                type: sequelize.QueryTypes.SELECT
            }
        )
        return rows || null
    }

    const ensureMysqlEnumContainsValues = async ({ tableName, columnName, requiredValues }) => {
        if (!mysqlLikeDialect) return
        if (!tables.includes(tableName)) return
        const columnMeta = await getColumnMeta(tableName, columnName)
        if (!columnMeta) return

        const columnType = String(columnMeta.COLUMN_TYPE || '').toLowerCase()
        if (!columnType.startsWith('enum(')) return

        const currentValues = []
        const enumRegex = /'([^']+)'/g
        let match = enumRegex.exec(columnType)
        while (match) {
            currentValues.push(match[1])
            match = enumRegex.exec(columnType)
        }

        const merged = Array.from(new Set([
            ...currentValues,
            ...(Array.isArray(requiredValues) ? requiredValues : [])
        ]))
        const hasAllValues = (requiredValues || []).every((value) => merged.includes(value))
        if (!hasAllValues || merged.length !== currentValues.length) {
            const qg = qi.queryGenerator
            const qTable = qg && typeof qg.quoteTable === 'function'
                ? qg.quoteTable(tableName)
                : `\`${tableName}\``
            const qCol = qg && typeof qg.quoteIdentifier === 'function'
                ? qg.quoteIdentifier(columnName)
                : `\`${columnName}\``
            const enumSql = merged.map((value) => sequelize.escape(value)).join(', ')
            const nullSql = columnMeta.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'
            const defaultSql = columnMeta.COLUMN_DEFAULT == null
                ? ''
                : ` DEFAULT ${sequelize.escape(columnMeta.COLUMN_DEFAULT)}`

            await sequelize.query(
                `ALTER TABLE ${qTable} MODIFY ${qCol} ENUM(${enumSql}) ${nullSql}${defaultSql}`,
                { type: sequelize.QueryTypes.RAW }
            )
            console.log(`Expanded ENUM values for ${tableName}.${columnName}`)
        }
    }

    // Keep FK column type/collation compatible with referenced PK before adding constraints.
    const alignForeignKeyColumn = async ({
        tableName,
        fkColumn,
        referencedTable,
        referencedColumn = 'id'
    }) => {
        if (!mysqlLikeDialect) return
        if (!tables.includes(tableName) || !tables.includes(referencedTable)) return

        const [fkMeta, refMeta] = await Promise.all([
            getColumnMeta(tableName, fkColumn),
            getColumnMeta(referencedTable, referencedColumn)
        ])
        if (!fkMeta || !refMeta) return

        const refType = String(refMeta.COLUMN_TYPE || '').toLowerCase()
        if (!refType.startsWith('char(36)')) return

        const fkType = String(fkMeta.COLUMN_TYPE || '').toLowerCase()
        const needsType = !fkType.startsWith('char(36)')
        const needsCharset = (fkMeta.CHARACTER_SET_NAME || null) !== (refMeta.CHARACTER_SET_NAME || null)
        const needsCollation = (fkMeta.COLLATION_NAME || null) !== (refMeta.COLLATION_NAME || null)
        if (!needsType && !needsCharset && !needsCollation) return

        const qg = qi.queryGenerator
        const qTable = qg && typeof qg.quoteTable === 'function'
            ? qg.quoteTable(tableName)
            : `\`${tableName}\``
        const qFk = qg && typeof qg.quoteIdentifier === 'function'
            ? qg.quoteIdentifier(fkColumn)
            : `\`${fkColumn}\``
        const nullSql = fkMeta.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'
        const charset = String(refMeta.CHARACTER_SET_NAME || 'utf8mb4')
        const collation = String(refMeta.COLLATION_NAME || 'utf8mb4_bin')
        const safeCharset = /^[a-zA-Z0-9_]+$/.test(charset) ? charset : 'utf8mb4'
        const safeCollation = /^[a-zA-Z0-9_]+$/.test(collation) ? collation : 'utf8mb4_bin'
        const defaultSql = fkMeta.COLUMN_DEFAULT == null
            ? ''
            : ` DEFAULT ${sequelize.escape(fkMeta.COLUMN_DEFAULT)}`

        await sequelize.query(
            `ALTER TABLE ${qTable} MODIFY ${qFk} CHAR(36) CHARACTER SET ${safeCharset} COLLATE ${safeCollation} ${nullSql}${defaultSql}`,
            { type: sequelize.QueryTypes.RAW }
        )

        console.warn(
            `Pre-sync alignment: normalized ${tableName}.${fkColumn} to CHAR(36) ${safeCollation} (match ${referencedTable}.${referencedColumn})`
        )
    }

    // Auto-repair orphan foreign-key values in legacy datasets before sequelize.sync()
    // to prevent ALTER TABLE failures on upgraded databases.
    const repairOrphanForeignKey = async ({
        tableName,
        fkColumn,
        referencedTable,
        referencedColumn = 'id',
        strategy = 'auto' // auto | set_null | delete_rows
    }) => {
        if (!mysqlLikeDialect) return
        if (!tables.includes(tableName) || !tables.includes(referencedTable)) return

        const desc = await qi.describeTable(tableName)
        if (!desc[fkColumn]) return

        let effectiveStrategy = strategy
        if (effectiveStrategy === 'auto') {
            effectiveStrategy = desc[fkColumn].allowNull === true ? 'set_null' : 'delete_rows'
        }

        if (effectiveStrategy === 'set_null' && desc[fkColumn].allowNull === false) {
            console.warn(`Pre-sync cleanup skipped: ${tableName}.${fkColumn} is NOT NULL`)
            return
        }

        const qg = qi.queryGenerator
        const qTable = qg && typeof qg.quoteTable === 'function'
            ? qg.quoteTable(tableName)
            : `\`${tableName}\``
        const qFk = qg && typeof qg.quoteIdentifier === 'function'
            ? qg.quoteIdentifier(fkColumn)
            : `\`${fkColumn}\``
        const qRefTable = qg && typeof qg.quoteTable === 'function'
            ? qg.quoteTable(referencedTable)
            : `\`${referencedTable}\``
        const qRefCol = qg && typeof qg.quoteIdentifier === 'function'
            ? qg.quoteIdentifier(referencedColumn)
            : `\`${referencedColumn}\``
        const orphanWhere = `t.${qFk} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${qRefTable} r WHERE r.${qRefCol} = t.${qFk})`

        const countRows = await sequelize.query(
            `SELECT COUNT(*) AS orphan_count FROM ${qTable} t WHERE ${orphanWhere}`,
            { type: sequelize.QueryTypes.SELECT }
        )
        const orphanCount = Number(countRows?.[0]?.orphan_count || 0)
        if (!orphanCount) return

        if (effectiveStrategy === 'delete_rows') {
            await sequelize.query(
                `DELETE t FROM ${qTable} t WHERE ${orphanWhere}`,
                { type: sequelize.QueryTypes.DELETE }
            )
            console.warn(`Pre-sync cleanup: deleted ${orphanCount} orphan row(s) from ${tableName} due to ${fkColumn}`)
            return
        }

        await sequelize.query(
            `UPDATE ${qTable} t SET t.${qFk} = NULL WHERE ${orphanWhere}`,
            { type: sequelize.QueryTypes.UPDATE }
        )
        console.warn(`Pre-sync cleanup: set ${orphanCount} orphan ${tableName}.${fkColumn} value(s) to NULL`)
    }

    await ensureColumn('orders', 'client_reference', {
        type: DataTypes.STRING(100),
        allowNull: true
    })
    await ensureColumn('orders', 'price_list_id', {
        type: DataTypes.UUID,
        allowNull: true
    })
    await ensureColumn('orders', 'promotion_discount', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    })
    await ensureColumn('orders', 'loyalty_discount', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    })
    await ensureColumn('orders', 'loyalty_points_redeemed', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    })
    await ensureColumn('orders', 'loyalty_points_earned', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    })
    await ensureColumn('orders', 'delivery_personnel_id', {
        type: DataTypes.UUID,
        allowNull: true
    })
    await ensureColumn('delivery_personnel', 'employee_id', {
        type: DataTypes.UUID,
        allowNull: true
    })
    await ensureColumn('orders', 'delivery_status', {
        type: DataTypes.ENUM('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'),
        allowNull: true
    })
    await ensureColumn('orders', 'delivery_assigned_at', {
        type: DataTypes.DATE,
        allowNull: true
    })
    await ensureOrderDeliveryTrackingColumns()
    await ensureColumn('orders', 'table_number', {
        type: DataTypes.STRING(30),
        allowNull: true
    })
    await ensureColumn('orders', 'delivery_address', {
        type: DataTypes.TEXT,
        allowNull: true
    })
    await ensureColumn('orders', 'delivery_fee', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
    })

    await ensureMysqlEnumContainsValues({
        tableName: 'orders',
        columnName: 'order_type',
        requiredValues: ['online', 'walkin', 'delivery', 'dine_in', 'takeaway']
    })
    await ensureMysqlEnumContainsValues({
        tableName: 'users',
        columnName: 'role',
        requiredValues: ['admin', 'manager', 'cashier', 'chef', 'supervisor', 'accountant']
    })
    await ensureMysqlEnumContainsValues({
        tableName: 'orders',
        columnName: 'delivery_status',
        requiredValues: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed']
    })
    await ensureMysqlEnumContainsValues({
        tableName: 'notifications',
        columnName: 'target_role',
        requiredValues: ['all', 'admin', 'manager', 'cashier', 'chef', 'supervisor', 'accountant']
    })
    await ensureColumn('customers', 'loyalty_points', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    })
    await ensureColumn('order_items', 'batch_number', {
        type: DataTypes.STRING(50),
        allowNull: true
    })
    await ensureColumn('branches', 'company_id', {
        type: DataTypes.UUID,
        allowNull: true
    })

    // ============ gl_accounts ERPNext-style pre-sync ============
    // The Account model now requires company_id, root_type, is_group, and STRING account_type.
    // If the database was created before the ERPNext migration, these columns won't exist
    // and sequelize.sync() will crash trying to create indexes on them.
    if (tables.includes('gl_accounts')) {
        const desc = await qi.describeTable('gl_accounts')

        // 1. Ensure company_id exists (needed for unique index)
        if (!desc.company_id) {
            await qi.addColumn('gl_accounts', 'company_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing gl_accounts.company_id')
        }

        // 2. Ensure root_type exists (migrate from old account_type ENUM)
        if (!desc.root_type) {
            await qi.addColumn('gl_accounts', 'root_type', {
                type: DataTypes.ENUM('asset', 'liability', 'equity', 'income', 'expense'),
                allowNull: true  // temporarily nullable, will fill from old account_type
            })
            console.log('Added missing gl_accounts.root_type')

            // Copy old account_type values into root_type if they match
            try {
                await sequelize.query(
                    `UPDATE gl_accounts SET root_type = account_type WHERE account_type IN ('asset','liability','equity','income','expense')`,
                    { type: sequelize.QueryTypes.UPDATE }
                )
                console.log('Migrated gl_accounts.account_type â†’ root_type')
            } catch (e) {
                console.warn('Could not auto-migrate account_type â†’ root_type:', e.message)
            }
        }
        // 3. Ensure is_group exists
        if (!desc.is_group) {
            await qi.addColumn('gl_accounts', 'is_group', {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            })
            console.log('Added missing gl_accounts.is_group')
        }

        // 4. Ensure parent_id exists
        if (!desc.parent_id) {
            await qi.addColumn('gl_accounts', 'parent_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing gl_accounts.parent_id')
        }

        // 5. Ensure is_system exists
        if (!desc.is_system) {
            await qi.addColumn('gl_accounts', 'is_system', {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            })
            console.log('Added missing gl_accounts.is_system')
        }

        // 6. Widen account_type from ENUM to STRING(50) if needed
        // Old schema had ENUM('asset','liability','equity','income','expense')
        // New schema has STRING(50) for granular types like 'Cash','Bank','Tax'
        if (desc.account_type && desc.account_type.type && desc.account_type.type.includes('ENUM')) {
            try {
                await sequelize.query(
                    `ALTER TABLE gl_accounts MODIFY COLUMN account_type VARCHAR(50) NULL`,
                    { type: sequelize.QueryTypes.RAW }
                )
                console.log('Widened gl_accounts.account_type from ENUM to VARCHAR(50)')
            } catch (e) {
                console.warn('Could not widen account_type column:', e.message)
            }
        }
    }

    // ============ gl_journal_entries ERPNext-style pre-sync ============
    if (tables.includes('gl_journal_entries')) {
        const desc = await qi.describeTable('gl_journal_entries')

        if (!desc.company_id) {
            await qi.addColumn('gl_journal_entries', 'company_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing gl_journal_entries.company_id')
        }
        if (!desc.cost_center_id) {
            await qi.addColumn('gl_journal_entries', 'cost_center_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing gl_journal_entries.cost_center_id')
        }
        if (!desc.supplier_id) {
            await qi.addColumn('gl_journal_entries', 'supplier_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing gl_journal_entries.supplier_id')
        }
    }

    // ============ gl_journal_lines ERPNext-style pre-sync ============
    if (tables.includes('gl_journal_lines')) {
        const desc = await qi.describeTable('gl_journal_lines')

        if (!desc.cost_center_id) {
            await qi.addColumn('gl_journal_lines', 'cost_center_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing gl_journal_lines.cost_center_id')
        }
        if (!desc.company_id) {
            await qi.addColumn('gl_journal_lines', 'company_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing gl_journal_lines.company_id')
        }
    }

    // ============ gl_fiscal_periods ERPNext-style pre-sync ============
    if (tables.includes('gl_fiscal_periods')) {
        const desc = await qi.describeTable('gl_fiscal_periods')

        if (!desc.company_id) {
            await qi.addColumn('gl_fiscal_periods', 'company_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing gl_fiscal_periods.company_id')
        }
    }

    // ============ cost_centers pre-sync ============
    if (tables.includes('cost_centers')) {
        const desc = await qi.describeTable('cost_centers')
        if (!desc.branch_id) {
            await qi.addColumn('cost_centers', 'branch_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing cost_centers.branch_id')
        }
    }

    // ============ users pre-sync ============
    if (tables.includes('users')) {
        const desc = await qi.describeTable('users')
        if (!desc.default_warehouse_id) {
            await qi.addColumn('users', 'default_warehouse_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added missing users.default_warehouse_id')
        }
    }

    // ===== Legacy FK integrity repair (MySQL/MariaDB only) =====
    const fkRepairPlan = [
        // Core POS
        { tableName: 'users', fkColumn: 'default_warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'shifts', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'shifts', fkColumn: 'user_id', referencedTable: 'users' },
        { tableName: 'orders', fkColumn: 'customer_id', referencedTable: 'customers' },
        { tableName: 'orders', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'orders', fkColumn: 'user_id', referencedTable: 'users' },
        { tableName: 'orders', fkColumn: 'shift_id', referencedTable: 'shifts' },
        { tableName: 'orders', fkColumn: 'price_list_id', referencedTable: 'price_lists' },
        { tableName: 'orders', fkColumn: 'delivery_personnel_id', referencedTable: 'delivery_personnel' },
        { tableName: 'order_items', fkColumn: 'order_id', referencedTable: 'orders' },
        { tableName: 'order_items', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'delivery_personnel', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'delivery_personnel', fkColumn: 'employee_id', referencedTable: 'employees', strategy: 'set_null' },
        { tableName: 'order_payments', fkColumn: 'order_id', referencedTable: 'orders' },
        { tableName: 'order_payments', fkColumn: 'shift_id', referencedTable: 'shifts' },
        { tableName: 'order_payments', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'order_payments', fkColumn: 'processed_by', referencedTable: 'users' },
        { tableName: 'pos_opening_entries', fkColumn: 'shift_id', referencedTable: 'shifts' },
        { tableName: 'pos_opening_entries', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'pos_opening_entries', fkColumn: 'user_id', referencedTable: 'users' },
        { tableName: 'pos_closing_entries', fkColumn: 'shift_id', referencedTable: 'shifts' },
        { tableName: 'pos_closing_entries', fkColumn: 'opening_entry_id', referencedTable: 'pos_opening_entries' },
        { tableName: 'pos_closing_entries', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'pos_closing_entries', fkColumn: 'closed_by', referencedTable: 'users' },
        // Pricing/Loyalty
        { tableName: 'coupons', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'coupons', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'price_lists', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'price_list_items', fkColumn: 'price_list_id', referencedTable: 'price_lists' },
        { tableName: 'price_list_items', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'promotion_rules', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'promotion_rules', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'loyalty_ledger', fkColumn: 'customer_id', referencedTable: 'customers' },
        { tableName: 'loyalty_ledger', fkColumn: 'order_id', referencedTable: 'orders' },
        { tableName: 'loyalty_ledger', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'loyalty_ledger', fkColumn: 'created_by', referencedTable: 'users' },
        // Inventory & Purchasing
        { tableName: 'warehouses', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'warehouses', fkColumn: 'manager_id', referencedTable: 'users' },
        { tableName: 'stock', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'stock', fkColumn: 'warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'stock_movements', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'stock_movements', fkColumn: 'warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'stock_movements', fkColumn: 'user_id', referencedTable: 'users' },
        { tableName: 'purchase_orders', fkColumn: 'supplier_id', referencedTable: 'suppliers' },
        { tableName: 'purchase_orders', fkColumn: 'warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'purchase_orders', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'purchase_orders', fkColumn: 'confirmed_by', referencedTable: 'users' },
        { tableName: 'purchase_orders', fkColumn: 'received_by', referencedTable: 'users' },
        { tableName: 'purchase_order_items', fkColumn: 'purchase_order_id', referencedTable: 'purchase_orders' },
        { tableName: 'purchase_order_items', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'purchase_receipts', fkColumn: 'warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'purchase_receipts', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'purchase_receipts', fkColumn: 'purchase_order_id', referencedTable: 'purchase_orders' },
        { tableName: 'purchase_receipts', fkColumn: 'supplier_id', referencedTable: 'suppliers' },
        { tableName: 'purchase_receipts', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'purchase_receipts', fkColumn: 'received_by', referencedTable: 'users' },
        { tableName: 'purchase_receipt_items', fkColumn: 'receipt_id', referencedTable: 'purchase_receipts' },
        { tableName: 'purchase_receipt_items', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'stock_transfers', fkColumn: 'from_warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'stock_transfers', fkColumn: 'to_warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'stock_transfers', fkColumn: 'transferred_by', referencedTable: 'users' },
        { tableName: 'stock_transfer_items', fkColumn: 'transfer_id', referencedTable: 'stock_transfers' },
        { tableName: 'stock_transfer_items', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'stock_adjustments', fkColumn: 'warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'stock_adjustments', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'stock_adjustments', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'stock_adjustments', fkColumn: 'approved_by', referencedTable: 'users' },
        { tableName: 'stock_issues', fkColumn: 'warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'stock_issues', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'stock_issues', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'stock_issue_items', fkColumn: 'issue_id', referencedTable: 'stock_issues' },
        { tableName: 'stock_issue_items', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'supplier_payments', fkColumn: 'supplier_id', referencedTable: 'suppliers' },
        { tableName: 'supplier_payments', fkColumn: 'purchase_order_id', referencedTable: 'purchase_orders' },
        { tableName: 'supplier_payments', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'supplier_payments', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'purchase_returns', fkColumn: 'purchase_order_id', referencedTable: 'purchase_orders' },
        { tableName: 'purchase_returns', fkColumn: 'supplier_id', referencedTable: 'suppliers' },
        { tableName: 'purchase_returns', fkColumn: 'warehouse_id', referencedTable: 'warehouses' },
        { tableName: 'purchase_returns', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'purchase_returns', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'purchase_return_items', fkColumn: 'purchase_return_id', referencedTable: 'purchase_returns' },
        { tableName: 'purchase_return_items', fkColumn: 'purchase_order_item_id', referencedTable: 'purchase_order_items' },
        { tableName: 'purchase_return_items', fkColumn: 'menu_id', referencedTable: 'menu' },
        // Refunds
        { tableName: 'refunds', fkColumn: 'order_id', referencedTable: 'orders' },
        { tableName: 'refunds', fkColumn: 'original_shift_id', referencedTable: 'shifts' },
        { tableName: 'refunds', fkColumn: 'refund_shift_id', referencedTable: 'shifts' },
        { tableName: 'refunds', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'refunds', fkColumn: 'processed_by', referencedTable: 'users' },
        { tableName: 'refunds', fkColumn: 'original_cashier_id', referencedTable: 'users' },
        { tableName: 'refund_items', fkColumn: 'refund_id', referencedTable: 'refunds' },
        { tableName: 'refund_items', fkColumn: 'order_item_id', referencedTable: 'order_items' },
        { tableName: 'refund_items', fkColumn: 'menu_id', referencedTable: 'menu' },
        { tableName: 'refund_items', fkColumn: 'warehouse_id', referencedTable: 'warehouses' },
        // Accounting
        { tableName: 'gl_journal_entries', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'gl_journal_entries', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'gl_journal_entries', fkColumn: 'reversal_of', referencedTable: 'gl_journal_entries' },
        { tableName: 'gl_journal_entries', fkColumn: 'reversed_by', referencedTable: 'gl_journal_entries' },
        { tableName: 'gl_journal_entries', fkColumn: 'company_id', referencedTable: 'companies' },
        { tableName: 'gl_journal_entries', fkColumn: 'cost_center_id', referencedTable: 'cost_centers' },
        { tableName: 'gl_journal_entries', fkColumn: 'supplier_id', referencedTable: 'suppliers' },
        { tableName: 'gl_journal_lines', fkColumn: 'journal_entry_id', referencedTable: 'gl_journal_entries' },
        { tableName: 'gl_journal_lines', fkColumn: 'account_id', referencedTable: 'gl_accounts' },
        { tableName: 'gl_journal_lines', fkColumn: 'company_id', referencedTable: 'companies' },
        { tableName: 'gl_journal_lines', fkColumn: 'cost_center_id', referencedTable: 'cost_centers' },
        { tableName: 'gl_journal_attachments', fkColumn: 'journal_entry_id', referencedTable: 'gl_journal_entries' },
        { tableName: 'gl_journal_attachments', fkColumn: 'uploaded_by', referencedTable: 'users' },
        { tableName: 'gl_journal_attachments', fkColumn: 'deleted_by', referencedTable: 'users' },
        { tableName: 'gl_journal_attachments', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'gl_journal_attachments', fkColumn: 'company_id', referencedTable: 'companies' },
        { tableName: 'entity_attachments', fkColumn: 'uploaded_by', referencedTable: 'users' },
        { tableName: 'entity_attachments', fkColumn: 'deleted_by', referencedTable: 'users' },
        { tableName: 'entity_attachments', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'entity_attachments', fkColumn: 'company_id', referencedTable: 'companies' },
        { tableName: 'gl_cash_drawers', fkColumn: 'shift_id', referencedTable: 'shifts' },
        { tableName: 'gl_cash_drawers', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'gl_cash_drawers', fkColumn: 'user_id', referencedTable: 'users' },
        { tableName: 'gl_cash_drawers', fkColumn: 'reconciled_by', referencedTable: 'users' },
        { tableName: 'gl_cash_drawers', fkColumn: 'opening_journal_id', referencedTable: 'gl_journal_entries' },
        { tableName: 'gl_cash_drawers', fkColumn: 'closing_journal_id', referencedTable: 'gl_journal_entries' },
        { tableName: 'gl_cash_drawers', fkColumn: 'variance_journal_id', referencedTable: 'gl_journal_entries' },
        { tableName: 'gl_audit_logs', fkColumn: 'journal_entry_id', referencedTable: 'gl_journal_entries' },
        { tableName: 'gl_audit_logs', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'gl_audit_logs', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'gl_account_defaults', fkColumn: 'account_id', referencedTable: 'gl_accounts' },
        { tableName: 'gl_account_defaults', fkColumn: 'company_id', referencedTable: 'companies' },
        { tableName: 'gl_account_defaults', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'cost_centers', fkColumn: 'parent_id', referencedTable: 'cost_centers' },
        { tableName: 'cost_centers', fkColumn: 'company_id', referencedTable: 'companies' },
        { tableName: 'cost_centers', fkColumn: 'branch_id', referencedTable: 'branches' },
        // HR
        { tableName: 'hr_departments', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'hr_departments', fkColumn: 'manager_id', referencedTable: 'employees' },
        { tableName: 'hr_designations', fkColumn: 'department_id', referencedTable: 'hr_departments' },
        { tableName: 'hr_designations', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'employees', fkColumn: 'department_id', referencedTable: 'hr_departments' },
        { tableName: 'employees', fkColumn: 'designation_id', referencedTable: 'hr_designations' },
        { tableName: 'employees', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'employees', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'employee_salaries', fkColumn: 'employee_id', referencedTable: 'employees' },
        { tableName: 'employee_salaries', fkColumn: 'approved_by', referencedTable: 'users' },
        { tableName: 'employee_salaries', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'salary_components', fkColumn: 'salary_id', referencedTable: 'employee_salaries' },
        { tableName: 'hr_attendance', fkColumn: 'employee_id', referencedTable: 'employees' },
        { tableName: 'hr_attendance', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'hr_attendance', fkColumn: 'recorded_by', referencedTable: 'users' },
        { tableName: 'leave_requests', fkColumn: 'employee_id', referencedTable: 'employees' },
        { tableName: 'leave_requests', fkColumn: 'branch_id', referencedTable: 'branches' },
        { tableName: 'leave_requests', fkColumn: 'approved_by', referencedTable: 'users' },
        { tableName: 'leave_requests', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'leave_balances', fkColumn: 'employee_id', referencedTable: 'employees' },
        { tableName: 'performance_reviews', fkColumn: 'employee_id', referencedTable: 'employees' },
        { tableName: 'performance_reviews', fkColumn: 'reviewer_id', referencedTable: 'users' },
        { tableName: 'performance_reviews', fkColumn: 'created_by', referencedTable: 'users' },
        { tableName: 'training_programs', fkColumn: 'trainer', referencedTable: 'employees' },
        { tableName: 'training_programs', fkColumn: 'created_by', referencedTable: 'users' }
    ]

    for (const step of fkRepairPlan) {
        await alignForeignKeyColumn(step)
        await repairOrphanForeignKey({ ...step, strategy: step.strategy || 'auto' })
    }
}

const parseBooleanOption = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue
    const normalized = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
    return defaultValue
}

const tableExists = async (tableName) => {
    const dialect = sequelize.getDialect()

    if (dialect === 'sqlite') {
        const [rows] = await sequelize.query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = :tableName LIMIT 1",
            { replacements: { tableName } }
        )
        return Array.isArray(rows) && rows.length > 0
    }

    const [rows] = await sequelize.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName LIMIT 1`,
        { replacements: { tableName } }
    )

    return Array.isArray(rows) && rows.length > 0
}

const ensureUsersDefaultWarehouseColumn = async () => {
    try {
        if (!(await tableExists('users'))) return

        const qi = sequelize.getQueryInterface()
        const desc = await qi.describeTable('users')
        if (!desc.default_warehouse_id) {
            await qi.addColumn('users', 'default_warehouse_id', {
                type: DataTypes.UUID,
                allowNull: true
            })
            console.log('Added users.default_warehouse_id (startup safeguard)')
        }
    } catch (error) {
        console.warn('Could not ensure users.default_warehouse_id column:', error.message)
    }
}

const coreTablesExist = async () => {
    const requiredTables = [
        'branches',
        'users',
        'categories',
        'menu',
        'refresh_tokens',
        'devices',
        'print_templates',
        'print_jobs'
    ]

    for (const tableName of requiredTables) {
        if (!(await tableExists(tableName))) {
            return false
        }
    }

    return true
}

const initDatabase = async (options = {}) => {
    try {
        const seedDemoData = options.seedDemoData === true
            || parseBooleanOption(process.env.SEED_DEMO_DATA, false)
        const seedPaymentGateways = options.seedPaymentGateways !== false

        const runCompatibilityChecks = options.runCompatibilityChecks ?? parseBooleanOption(process.env.DB_RUN_STARTUP_COMPATIBILITY, true)
        const runSchemaSync = options.runSchemaSync ?? parseBooleanOption(process.env.DB_RUN_STARTUP_SYNC, false)
        const autoSyncIfMissing = options.autoSyncIfMissing ?? parseBooleanOption(process.env.DB_AUTO_SYNC_IF_MISSING, true)

        await testConnection()
        await ensureUsersDefaultWarehouseColumn()

        if (runCompatibilityChecks) {
            await ensurePreSyncSchemaCompatibility()
        } else {
            console.log('Startup compatibility checks skipped (DB_RUN_STARTUP_COMPATIBILITY=false)')
        }

        if (runSchemaSync) {
            await sequelize.sync()
            console.log('Database synchronized (startup sync enabled)')
        } else if (autoSyncIfMissing) {
            const hasCoreSchema = await coreTablesExist()
            if (!hasCoreSchema) {
                await sequelize.sync()
                console.log('Database synchronized (missing core tables bootstrap)')
            } else {
                console.log('Startup schema sync skipped (core schema already exists)')
            }
        } else {
            console.log('Startup schema sync skipped (DB_RUN_STARTUP_SYNC=false, DB_AUTO_SYNC_IF_MISSING=false)')
        }

        // Keep BOM table available even when full startup sync is disabled.
        await MenuIngredient.sync()
        // Ensure new stock issue tables exist
        await StockIssue.sync({ alter: true })
        await StockIssueItem.sync({ alter: true })

        // Ensure HR and Delivery tables have new fields synced
        await Employee.sync({ alter: true })
        await DeliveryPersonnel.sync({ alter: true })

        const [branch] = await Branch.findOrCreate({
            where: { name_ar: 'الفرع الرئيسي' },
            defaults: {
                name_ar: 'الفرع الرئيسي',
                name_en: 'Main Branch',
                address: 'الرياض',
                phone: '0500000000',
                is_active: true
            }
        })

        await Warehouse.findOrCreate({
            where: { branch_id: branch.id, is_default: true },
            defaults: {
                name_ar: 'المستودع الرئيسي',
                name_en: 'Main Warehouse',
                branch_id: branch.id,
                location: 'الرياض',
                status: 'active',
                is_default: true
            }
        })
        console.log('Default warehouse ensured')

        await User.findOrCreate({
            where: { username: 'admin' },
            defaults: {
                username: 'admin',
                password_hash: 'admin123',
                name_ar: 'مدير النظام',
                name_en: 'Admin',
                role: 'admin',
                branch_id: branch.id,
                is_active: true
            }
        })

        const categoryCount = await Category.count()
        if (seedDemoData && categoryCount === 0) {
            const sampleCategories = [
                { name_ar: 'برجر', name_en: 'Burgers', branch_id: branch.id, display_order: 1, is_active: true },
                { name_ar: 'بيتزا', name_en: 'Pizza', branch_id: branch.id, display_order: 2, is_active: true },
                { name_ar: 'دجاج', name_en: 'Chicken', branch_id: branch.id, display_order: 3, is_active: true },
                { name_ar: 'مشروبات', name_en: 'Drinks', branch_id: branch.id, display_order: 4, is_active: true },
                { name_ar: 'حلويات', name_en: 'Desserts', branch_id: branch.id, display_order: 5, is_active: true },
            ]

            const createdCategories = await Category.bulkCreate(sampleCategories)
            console.log('Sample categories created')

            const menuItems = [
                { name_ar: 'برجر لحم كلاسيك', name_en: 'Classic Beef Burger', price: 25, category_id: createdCategories[0].id, branch_id: branch.id, is_available: true },
                { name_ar: 'برجر دجاج مقرمش', name_en: 'Crispy Chicken Burger', price: 22, category_id: createdCategories[0].id, branch_id: branch.id, is_available: true },
                { name_ar: 'برجر لحم مزدوج', name_en: 'Double Beef Burger', price: 35, category_id: createdCategories[0].id, branch_id: branch.id, is_available: true },
                { name_ar: 'برجر جبنة خاص', name_en: 'Special Cheese Burger', price: 28, category_id: createdCategories[0].id, branch_id: branch.id, is_available: true },
                { name_ar: 'بيتزا مارغريتا', name_en: 'Margherita Pizza', price: 35, category_id: createdCategories[1].id, branch_id: branch.id, is_available: true },
                { name_ar: 'بيتزا بيبروني', name_en: 'Pepperoni Pizza', price: 40, category_id: createdCategories[1].id, branch_id: branch.id, is_available: true },
                { name_ar: 'بيتزا خضار', name_en: 'Veggie Pizza', price: 38, category_id: createdCategories[1].id, branch_id: branch.id, is_available: true },
                { name_ar: 'دجاج مقلي 6 قطع', name_en: 'Fried Chicken 6pcs', price: 30, category_id: createdCategories[2].id, branch_id: branch.id, is_available: true },
                { name_ar: 'ستربس دجاج', name_en: 'Chicken Strips', price: 25, category_id: createdCategories[2].id, branch_id: branch.id, is_available: true },
                { name_ar: 'أجنحة دجاج حارة', name_en: 'Spicy Wings', price: 28, category_id: createdCategories[2].id, branch_id: branch.id, is_available: true },
                { name_ar: 'بيبسي', name_en: 'Pepsi', price: 5, category_id: createdCategories[3].id, branch_id: branch.id, is_available: true },
                { name_ar: 'عصير برتقال', name_en: 'Orange Juice', price: 8, category_id: createdCategories[3].id, branch_id: branch.id, is_available: true },
                { name_ar: 'عصير مانجو', name_en: 'Mango Juice', price: 10, category_id: createdCategories[3].id, branch_id: branch.id, is_available: true },
                { name_ar: 'ماء', name_en: 'Water', price: 3, category_id: createdCategories[3].id, branch_id: branch.id, is_available: true },
                { name_ar: 'آيس كريم', name_en: 'Ice Cream', price: 12, category_id: createdCategories[4].id, branch_id: branch.id, is_available: true },
                { name_ar: 'كيك شوكولاتة', name_en: 'Chocolate Cake', price: 18, category_id: createdCategories[4].id, branch_id: branch.id, is_available: true },
            ]

            await Menu.bulkCreate(menuItems)
            console.log('Seeded sample menu items')
        }

        if (seedPaymentGateways) {
            const gatewayCount = await PaymentGateway.count()
            if (gatewayCount === 0) {
                const defaultGateways = [
                    { name: 'stripe', display_name_ar: 'سترايب', display_name_en: 'Stripe', supported_methods: ['card', 'apple_pay'], is_active: false, is_sandbox: true },
                    { name: 'moyasar', display_name_ar: 'ميسر', display_name_en: 'Moyasar', supported_methods: ['mada', 'visa', 'mastercard', 'apple_pay'], is_active: false, is_sandbox: true },
                    { name: 'fawry', display_name_ar: 'فوري', display_name_en: 'Fawry', supported_methods: ['cash', 'card', 'wallet'], is_active: false, is_sandbox: true },
                    { name: 'paymob', display_name_ar: 'باي موب', display_name_en: 'Paymob', supported_methods: ['card', 'wallet', 'kiosk'], is_active: false, is_sandbox: true }
                ]
                await PaymentGateway.bulkCreate(defaultGateways)
                console.log('Seeded default payment gateways')
            }
        }

        console.log('Initial data created')
    } catch (error) {
        console.error('Database initialization failed:', error.message)
        throw error
    }
}

module.exports = {
    sequelize,
    Branch,
    User,
    Category,
    Menu,
    MenuIngredient,
    Customer,
    Order,
    OrderItem,
    OrderPayment,
    Shift,
    POSOpeningEntry,
    POSClosingEntry,
    Coupon,
    PriceList,
    PriceListItem,
    PromotionRule,
    LoyaltyLedger,
    Notification,
    Device,
    PrintJob,
    PrintTemplate,
    PaymentGateway,
    // Inventory Models
    Warehouse,
    Stock,
    StockMovement,
    PurchaseReceipt,
    PurchaseReceiptItem,
    StockTransfer,
    StockTransferItem,
    StockAdjustment,
    StockIssue,
    StockIssueItem,
    // Supplier & Purchase Order Models
    Supplier,
    PurchaseOrder,
    PurchaseOrderItem,
    SupplierPayment,
    PurchaseReturn,
    PurchaseReturnItem,
    RefreshToken,
    AuditLog,
    // Refund Models
    Refund,
    RefundItem,
    // Financial Integrity Models (Phase 1)
    IdempotencyKey,
    // Accounting Layer Models (Phase 2)
    Account,
    JournalEntry,
    JournalLine,
    JournalAttachment,
    EntityAttachment,
    FiscalPeriod,
    CashDrawer,
    GLAuditLog,
    // Accounting Layer â€” Phase 3 (ERP-Ready)
    AccountDefault,
    // ERPNext-Style Architecture
    Company,
    CostCenter,
    // HR Module Models
    Department,
    Designation,
    Employee,
    EmployeeSalary,
    SalaryComponent,
    HRAttendance,
    LeaveRequest,
    LeaveBalance,
    PerformanceReview,
    TrainingProgram,
    DeliveryPersonnel,
    initDatabase
}
