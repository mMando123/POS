
# Audit Fixes Implementation Notes

## 1. Data Integrity & Immutability
- **Purchase Orders**: The `DELETE` endpoint now performs a "soft cancellation".
  - Status is updated to `cancelled`.
  - A note is appended to the order.
  - Audit log is created.
  - Permanent deletion is disabled.
- **Suppliers**: The `DELETE` endpoint now performs a "soft deactivation".
  - Status is updated to `inactive`.
  - Audit log is created.
  - Permanent deletion is disabled.

## 2. General Ledger Integration (Double-Entry)
- **New Accounts**:
  - `2002`: Accounts Payable (Liability)
  - `5004`: Inventory Shrinkage (Expense)
- **Purchasing**:
  - `POST /api/purchases/:id/receive` now automatically creates a Journal Entry.
  - **Debit**: Inventory Asset (1100)
  - **Credit**: Accounts Payable (2002)
- **Inventory Adjustments**:
  - `POST /api/inventory/adjust` now automatically creates a Journal Entry.
  - **Loss**: Debit Shrinkage (5004) / Credit Inventory (1100)
  - **Gain**: Debit Inventory (1100) / Credit Shrinkage (5004)
  - Stock `avg_cost` is used for valuation.

## 3. Shift Cash Reconciliation
- **Objective**: Correctly calculate "Expected Cash" by accounting for cash refunds.
- **Change**: `ShiftService.endShift` and `forceCloseShift` logic updated.
- **Formula**: `Expected Cash = Starting Cash + Cash Sales - Cash Refunds`.
- **Note**: Only refunds processed within the shift (by `refund_shift_id`) and with status `completed` are deducted.

## 4. Refund Approval Workflow
- **Workflow**:
  - **Cashiers**: Creating a refund sets status to `pending`. No stock/financial impact immediately.
  - **Managers/Admins**: Creating a refund sets status to `completed`. Stock restored and GL entry created immediately.
- **New Endpoints**:
  - `POST /api/refunds/:id/approve` (Manager/Supervisor): Approves pending refund, restores stock, updates GL.
  - `POST /api/refunds/:id/reject` (Manager/Supervisor): Rejects pending refund.

## Verification
- Run `node src/scripts/verify-audit-fixes.js` (requires `DB_DIALECT='mysql'`) to verify Shift Cash logic and Account existence.

## 5. Cost of Goods Sold (COGS) Implementation
- **Objective**: Ensure the Profit & Loss statement reflects the cost of sales, enabling accurate Gross Profit calculation.
- **Problem**: Previous P&L showed revenue but no associated cost, making Gross Profit meaningless.
- **Changes**:
  - **Accounting Service**: Added `recordCOGS` method to create Journal Entries for COGS.
    - **Debit**: Cost of Goods Sold (5001)
    - **Credit**: Inventory Asset (1100)
    - **Valuation**: Based on actual `StockMovement` records (OUT) associated with the order.
  - **Hooks**: Updated `AccountingHooks.onOrderCompleted` to trigger COGS recording.
  - **Refunds**: Added `recordRefundCOGSReversal` to reverse COGS when stock is restored (DR Inventory / CR COGS).
  - **P&L Report**: Updated to separate COGS from operating expenses and calculate Gross Profit & Margin.
- **Verification**: Run `node src/scripts/verify-cogs-fix.js` to confirm GL entries and P&L structure.

## 6. Supplier Balance Automation
- **Objective**: Synchronize operational supplier records with the General Ledger Accounts Payable.
- **Problem**: Previously, recording a purchase receipt created a GL liability but did not update the `Supplier` entity's `current_balance`, leading to discrepancies in aged payables reports.
- **Changes**:
  - **Accounting Hooks**: Updated `onPurchaseReceived` to find the associated Supplier (directly or via PO) and increment `current_balance` by the receipt's `total_cost`.
- **Verification**: Run `node src/scripts/verify-supplier-balance.js` to confirm that creating a purchase receipt updates the supplier's balance.

## 7. Supplier Payments Module
- **Objective**: enable recording of payments to suppliers and tracking Accounts Payable.
- **Problem**: There was no way to record payments to suppliers, meaning AP liabilities would grow indefinitely in the GL.
- **Changes**:
  - **New Model**: Created `SupplierPayment` model to track outgoing payments.
  - **API Endpoint**: Added `POST /api/suppliers/:id/payments` to record payments.
  - **Accounting Hooks**: Implemented `onSupplierPayment` to:
    - Create GL Entry: `DR Accounts Payable` / `CR Cash` or `Bank`.
    - Decrease `Supplier.current_balance`.
    - Update linked `PurchaseOrder` (paid amount & status).
- **Verification**: Run `node src/scripts/verify-supplier-payment.js` to confirm payment processing and GL impact.

## 8. FIFO Cost Layers (S-3)
- **Objective**: Implement First-In-First-Out (FIFO) inventory costing to ensure accurate COGS and profit calculation.
- **Problem**: Previously, the system used a simple average or "oldest cost" lookup which did not track consumption of specific batches. This meant COGS was often inaccurate when costs fluctuated.
- **Changes**:
  - **Database**: Added `remaining_quantity` column to `StockMovement` table.
  - **Migration**: Created `src/scripts/migrate-fifo-layers.js` to backfill `remaining_quantity` for existing inventory.
  - **Stock Service**:
    - Updated `addStock` to initialize `remaining_quantity`.
    - Rewrote `deductStock` to consume inventory from oldest batches first (`remaining_quantity > 0`).
    - Updated `calculateUnitCost` to reflect the next-to-be-sold layer cost.
- **Verification**: Run `node src/scripts/verify-fifo.js`.
  - Confirmed that selling 15 units (when holding 10 @ $10 + 10 @ $20) correctly costs $150 ((5*$10) + (5*$20)).
