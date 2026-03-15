# Restaurant Management System - Test Plan

## Overview
This document outlines automated and manual tests for the Restaurant Management System including Backend API, POS, Website, and KDS.

---

## Backend API Tests

### 1. Authentication Tests

**Test: User Login**
- **Endpoint**: `POST /api/auth/login`
- **Payload**: `{ "username": "admin", "password": "admin123" }`
- **Expected**: Status 200, returns `{ token, user }`
- **Verify**: Token is valid JWT

**Test: Invalid Login**
- **Payload**: `{ "username": "admin", "password": "wrong" }`
- **Expected**: Status 401, error message

### 2. Menu Management Tests

**Test: Get All Menu Items**
- **Endpoint**: `GET /api/menu`
- **Expected**: Status 200, array of menu items

**Test: Get Available Items Only**
- **Endpoint**: `GET /api/menu?available_only=true`
- **Expected**: Only items with `is_available = true`

**Test: Create Menu Item (Authenticated)**
- **Endpoint**: `POST /api/menu`
- **Headers**: `Authorization: Bearer {token}`
- **Payload**:
```json
{
  "name_ar": "برجر لحم",
  "name_en": "Beef Burger",
  "price": 25.50,
  "category_id": "{category_id}"
}
```
- **Expected**: Status 201, created item

**Test: Update Menu Item**
- **Endpoint**: `PUT /api/menu/{id}`
- **Payload**: `{ "price": 30.00 }`
- **Expected**: Status 200, updated item

### 3. Category Tests

**Test: Get All Categories**
- **Endpoint**: `GET /api/categories`
- **Expected**: Status 200, array of categories

**Test: Create Category**
- **Endpoint**: `POST /api/categories`
- **Payload**: `{ "name_ar": "مشروبات", "name_en": "Drinks" }`
- **Expected**: Status 201

### 4. Order Management Tests

**Test: Create Walk-in Order**
- **Endpoint**: `POST /api/orders`
- **Payload**:
```json
{
  "order_type": "walkin",
  "items": [
    { "menu_id": "{menu_id}", "quantity": 2 }
  ],
  "payment_method": "cash"
}
```
- **Expected**: Status 201, order created with order_number

**Test: Create Online Order with Customer**
- **Payload**:
```json
{
  "order_type": "online",
  "customer_phone": "0500000001",
  "customer_name": "أحمد محمد",
  "items": [
    { "menu_id": "{menu_id}", "quantity": 1, "notes": "بدون بصل" }
  ],
  "payment_method": "online"
}
```
- **Expected**: Customer created/updated, order created

**Test: Get All Orders**
- **Endpoint**: `GET /api/orders`
- **Expected**: Status 200, array of orders with items

**Test: Update Order Status**
- **Endpoint**: `PUT /api/orders/{id}/status`
- **Payload**: `{ "status": "preparing" }`
- **Expected**: Status 200, status updated
- **Verify**: Socket.io event emitted

**Test: Order Status Flow**
1. Create order (status: "new")
2. Update to "preparing"
3. Update to "ready"
4. Update to "completed"
- **Verify**: Each transition succeeds

### 5. Real-time Tests (Socket.io)

**Test: Connect to Socket**
- **Verify**: Client connects successfully
- **Event**: `connect` received

**Test: New Order Notification**
1. Create new order via API
2. **Verify**: `order:new` event received on `kds` room
3. **Verify**: Event contains order data

**Test: Order Status Update Notification**
1. Update order status
2. **Verify**: `order:updated` event received
3. **Verify**: Event contains `orderId` and new `status`

---

## Frontend Integration Tests

### POS Application

**Test: Login Flow**
1. Navigate to `/login`
2. Enter credentials: `admin` / `admin123`
3. Click "تسجيل الدخول"
- **Verify**: Redirected to dashboard
- **Verify**: Token stored in localStorage

**Test: Dashboard Loads**
- **Verify**: Statistics displayed (total orders, revenue, etc.)
- **Verify**: Recent orders list shown

**Test: Create New Order**
1. Navigate to "طلب جديد"
2. Select menu items
3. Add to cart
4. Checkout with payment method
- **Verify**: Order created
- **Verify**: Order appears in orders list

**Test: Menu Management**
1. Navigate to "إدارة القائمة"
2. Add new menu item
3. Edit existing item
4. Delete item
- **Verify**: Real-time updates

### Website (Online Ordering)

**Test: Browse Menu**
- Open `localhost:3000`
- **Verify**: Menu items displayed
- **Verify**: Categories filter works

**Test: Add to Cart**
1. Click "أضف للسلة" on item
2. **Verify**: Cart count increases
3. Open cart drawer
- **Verify**: Item appears in cart

**Test: Checkout Flow**
1. Fill customer info (name, phone, address)
2. Submit order
- **Verify**: Order created
- **Verify**: Redirected to tracking page

**Test: Order Tracking**
1. Enter order ID
2. **Verify**: Order status displayed
3. Update order status from backend
- **Verify**: Status updates in real-time

### KDS (Kitchen Display)

**Test: Display Active Orders**
- Open `localhost:3003`
- **Verify**: Active orders shown (new, preparing, ready)

**Test: Real-time Order Updates**
1. Create order from POS/Website
- **Verify**: Order appears immediately in KDS

**Test: Update Order Status from KDS**
1. Click "بدء التحضير" on new order
- **Verify**: Status changes to "preparing"
2. Click "جاهز"
- **Verify**: Status changes to "ready"

---

## Database Tests

**Test: SQLite Database Created**
- **Verify**: File `backend/data/restaurant.db` exists

**Test: Initial Seed Data**
- **Verify**: Default branch exists
- **Verify**: Admin user exists with username "admin"

**Test: Orders with Transaction**
1. Create order with multiple items
- **Verify**: Order and all OrderItems created
- **Verify**: Customer stats updated
- **Verify**: All in single transaction

---

## Performance Tests

**Test: Concurrent Orders**
- Create 10 orders simultaneously
- **Verify**: All orders created successfully
- **Verify**: No race conditions in order numbering

**Test: Large Menu Load**
- Add 100+ menu items
- **Verify**: GET /api/menu responds in < 1s

---

## Error Handling Tests

**Test: Invalid Menu Item**
- Create order with non-existent menu_id
- **Expected**: Status 400, error message

**Test: Database Connection Failure**
- Stop database
- Make API request
- **Verify**: Graceful error handling

**Test: Socket Disconnection**
- Disconnect client
- Create order
- Reconnect client
- **Verify**: Client receives missed updates

---

## Security Tests

**Test: Unauthorized Access**
- Call `POST /api/menu` without token
- **Expected**: Status 401

**Test: Invalid Token**
- Use expired/invalid JWT
- **Expected**: Status 401

**Test: SQL Injection Protection**
- Try SQL injection in search/filter params
- **Verify**: Sequelize parameterization prevents injection

---

## Browser Compatibility

**Test: POS on Different Browsers**
- Chrome: ✓
- Firefox: ✓
- Edge: ✓
- Safari: ✓

**Test: Website PWA**
- Install PWA on mobile
- **Verify**: Works offline (cached menu)
- **Verify**: Add to home screen

---

## Manual Test Scenarios

### Scenario 1: Full Order Flow
1. Customer browses website
2. Adds items to cart
3. Checks out with delivery
4. POS receives order
5. KDS shows order
6. Chef marks preparing
7. Chef marks ready
8. Cashier marks completed
9. Customer receives notification

### Scenario 2: Walk-in Order
1. Customer arrives at restaurant
2. Cashier creates order in POS
3. KDS receives order
4. Kitchen prepares
5. Order ready
6. Payment at counter

### Scenario 3: Menu Update
1. Manager adds new item in POS
2. Website updates in real-time
3. Item appears in online menu
4. Customer can order new item

---

## Automated Test Commands

```bash
# Run backend tests
cd backend
npm test

# Run API integration tests
npm run test:integration

# Run frontend tests
cd pos
npm test

cd website
npm test

cd kds
npm test
```

---

## Test Coverage Goals

- **Backend API**: > 80% code coverage
- **Frontend Components**: > 70% coverage
- **Critical Paths**: 100% coverage
  - Authentication
  - Order creation
  - Payment processing

---

## TestSprite Configuration

### API Tests

```javascript
// Example test configuration for TestSprite
{
  "baseUrl": "http://localhost:3001/api",
  "tests": [
    {
      "name": "Login Test",
      "request": {
        "method": "POST",
        "endpoint": "/auth/login",
        "body": {
          "username": "admin",
          "password": "admin123"
        }
      },
      "assertions": [
        { "field": "status", "equals": 200 },
        { "field": "body.token", "exists": true }
      ]
    }
  ]
}
```

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
```

---

## Known Issues & Edge Cases

1. **Concurrent order creation**: Test with high load
2. **Network latency**: Socket.io reconnection
3. **Browser storage limits**: localStorage overflow
4. **Large order items**: Performance with 50+ items

---

**Last Updated**: 2026-01-20
**Version**: 1.0

---

## Phase 2: Financial Integrity Verification (Audit Fixes)

These scripts verify the implementation of critical financial controls (COGS, AP, Supplier Balances).

### 1. Verification Scripts

**Test: Cost of Goods Sold (COGS)**
- **Script**: `node src/scripts/verify-cogs-fix.js`
- **Verifies**:
  - COGS Journal Entry creation (DR COGS / CR Inventory)
  - P&L Report structure (Gross Profit calculation)
  - Refund COGS Reversal (DR Inventory / CR COGS)

**Test: Supplier Balance Automation**
- **Script**: `node src/scripts/verify-supplier-balance.js`
- **Verifies**:
  - Purchase Receipt updates `Supplier.current_balance` (Liability Increase)
  - Journal Entry creation (DR Inventory / CR Accounts Payable)

**Test: Supplier Payments**
- **Script**: `node src/scripts/verify-supplier-payment.js`
- **Verifies**:
  - Payment updates `Supplier.current_balance` (Liability Decrease)
  - Purchase Order status update (Paid/Partial)
  - Journal Entry creation (DR Accounts Payable / CR Bank)

