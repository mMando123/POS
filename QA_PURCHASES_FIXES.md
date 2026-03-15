# Purchases Module QA Code Fixes
**Date**: 2026-02-14
**Module**: Purchases / Inventory / Accounting

## 1. Purchase Receipt (Direct Receive)
**File**: `backend/src/routes/purchases.js`
- **Issue**: Receiving goods directly via `POST /api/purchases` created a journal entry but **failed to update the supplier's balance**.
- **Fix**: 
    - Resolved `supplier_id` from `supplier_name` if missing.
    - Added `AccountingHooks.onPurchaseReceived(receipt)` call after transaction commit to update supplier ledger.

## 2. Purchase Order Receipt
**File**: `backend/src/routes/purchaseOrders.js`
- **Issue 1**: Receiving items via `POST /api/purchase-orders/:id/receive` updated stock but **triggered NO accounting events** (missing Journal Entry & Supplier Balance update).
- **Fix 1**: Added `AccountingHooks.onPurchaseReceived(createdReceipt)` after transaction commit.
- **Issue 2**: `remaining_quantity` in `PurchaseOrderItem` was not being updated, leading to stale data.
- **Fix 2**: Added calculation `remaining_quantity = quantity_ordered - new_quantity_received` during update.

## 3. Purchase Returns (Validation & Accounting)
**File**: `backend/src/routes/purchaseReturns.js`
- **Issue**: No validation existed to prevent returning more items than were originally received. A user could return 100 items even if they only bought 10.
- **Fix**: Added logic to calculate `availableToReturn = receivedQty - totalPreviouslyReturned` and throw an error if the return quantity exceeds this limit.

**File**: `backend/src/services/accountingHooks.js`
- **Issue**: `onPurchaseReturn` hook created a Journal Entry but **did not decrease the supplier's balance**, leaving the debt on the books even after goods were returned.
- **Fix**: Added logic to decrease `Supplier.current_balance` by the return amount.

## 4. Operational Integrity
- **Stock Service**: Verified that `StockService.returnToSupplier` correctly uses specific identification (PO Layers) to deduct stock, preventing returns of sold items.
- **Supplier Payments**: Verified that payments correctly reduce supplier balance.

## Recommendation
- Future limitation: `PurchaseOrder.count()` is used for generating PO numbers, which is not concurrent-safe. Recommended to switch to a database sequence or UUIDs for strict uniqueness in high-concurrency environments.
