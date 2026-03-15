# 🍽️ نظام إدارة المطعم
# Restaurant Management System

A comprehensive restaurant management solution with Online Ordering Website, POS (Point of Sale), and Kitchen Display System (KDS). Built with modern technologies and Arabic RTL interface support.

## 🚀 Features

### Online Ordering Website (موقع الطلب الإلكتروني)
- ✅ Arabic RTL interface
- ✅ PWA support (installable, offline menu)
- ✅ Menu browsing by category
- ✅ Shopping cart with localStorage persistence
- ✅ Checkout with customer information
- ✅ Real-time order tracking
- ✅ Payment gateway integration ready

### POS System (نظام نقاط البيع)
- ✅ Arabic RTL interface
- ✅ Dashboard with daily statistics
- ✅ Quick order creation
- ✅ Order management with status updates
- ✅ Menu management (add/edit/delete items)
- ✅ Category management
- ✅ **Shift Management** (Start/End shift, Cash reconciliation)
- ✅ **Cashier Performance Tracking** (Sales, Orders, Hours)
- ✅ Real-time sync with website and KDS
- ✅ Sound notifications for new orders

### Kitchen Display System (شاشة المطبخ)
- ✅ Dark theme optimized for kitchen
- ✅ Real-time order display
- ✅ Order status management
- ✅ Timer for order age (urgent alerts)
- ✅ Audio notifications
- ✅ Connection status indicator

### Backend API
- ✅ RESTful API with Express.js
- ✅ Real-time updates with Socket.io
- ✅ **MySQL database** (production-ready)
- ✅ **Sequelize ORM** (typed models + migrations + audit-safe transactions)
- ✅ JWT authentication
- ✅ Role-based authorization (Admin, Manager, Cashier, Chef)
- ✅ Payment gateway integration ready
- ✅ **User Management System** (Create, Edit, Deactivate users)
- ✅ **Advanced Reporting** (Shift History, Performance Analytics)

## 📁 Project Structure

```
restaurant-app/
├── backend/                 # Node.js + Express API
│   ├── src/
│   │   ├── config/         # Database configuration
│   │   ├── middleware/     # Auth, validation
│   │   ├── routes/         # API routes
│   │   ├── migrations/     # Database schema
│   │   ├── socket/         # Socket.io handlers
│   │   └── server.js       # Main entry
│   ├── .env                # Environment variables
│   └── package.json
├── pos/                     # POS React Application
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── store/          # Redux store
│   │   └── services/       # API & Socket
│   └── package.json
├── website/                 # Online Ordering Website (PWA)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── store/
│   │   └── services/
│   └── package.json
└── kds/                     # Kitchen Display System
    ├── src/
    └── package.json
```

## 🛠️ Installation

### Prerequisites
- Node.js 18+ LTS
- npm or yarn

> **Note:** The system is configured for **MySQL** in current production/dev setup.

### 1. Clone and Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install POS dependencies
cd ../pos
npm install

# Install Website dependencies
cd ../website
npm install

# Install KDS dependencies
cd ../kds
npm install

### 2. Start Development

```bash
# Start backend
cd backend
npm run dev
```

### 3. Environment Configuration

Copy `.env.example` to `.env` in the backend folder and update:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=pos_restaurant
DB_USER=root
DB_PASSWORD=your_password
JWT_SECRET=your_secret_key
```

### 4. Start Development Servers

```bash
# One command for mobile PWA testing (backend + POS PWA dev + ngrok)
npm run dev:mobile
```

Or run services manually:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - POS
cd pos
npm run dev

# Terminal 3 - POS (PWA test mode for mobile install prompt)
cd pos
npm run dev:pwa

# Terminal 4 - HTTPS tunnel to POS
cd pos
npm run tunnel

# Terminal 5 - Website
cd website
npm run dev

# Terminal 6 - KDS
cd kds
npm run dev
```

### Staff-HR Sync (Cashier + Delivery)

```bash
# Link cashiers and delivery riders to HR employees,
# auto-create departments/designations, and create current month salaries
npm run hr:sync:staff
```

Optional salary defaults (set in `backend/.env`):

```env
HR_DEFAULT_CASHIER_SALARY=3500
HR_DEFAULT_DELIVERY_SALARY=3000
```

### SKU Backfill (Existing Products)

```bash
# Dry run (preview items that will get auto SKU)
npm run backend:sku:backfill

# Apply changes
npm run backend:sku:backfill -- --apply

# Optional: limit and branch filter
npm run backend:sku:backfill -- --apply --limit=500 --branch=<BRANCH_ID>
```

### Access Points
- **Backend API**: http://localhost:3001
- **Website**: http://localhost:3000
- **POS**: http://localhost:3002
- **KDS**: http://localhost:3003

## Pre-Production Gate (Accounting)

Before production cutover, run:

```bash
cd backend
node src/scripts/backup-before-migration.js
node src/scripts/verify-erpnext-migration.js
node src/scripts/preprod-gate-check.js
# staging ثم production بنفس الإعدادات الصارمة
npm run gate:strict:rollout
```

Cutover checklist:
- `PRODUCTION_CUTOVER_CHECKLIST.md`

## Production Ops (Monitoring, Backup, Rollback)

```bash
cd backend
# test alert channel (webhook)
npm run ops:alert:test
# local self-test with mock webhook
npm run ops:alert:test -- --mock-webhook

# run full backup + restore validation
npm run ops:backup:test

# install daily backup scheduler (Windows Task Scheduler)
npm run ops:schedule:install
# production recommendation: run task as SYSTEM
npm run ops:schedule:install -- --time=02:30 --run-as-system
# verify scheduler status/evidence
npm run ops:schedule:check

# rollback dry-run (safe)
npm run ops:rollback -- --file=./data/backups/daily/<backup-file>.sql

# stability soak (POS + API + DB)
npm run ops:soak -- --hours=24 --interval=60
```

Runbook:
- `PRODUCTION_OPS_RUNBOOK.md`

## Accounting Operations (COA Cutover)

```bash
# Monthly compliance check (must remain zero violations)
npm run coa:cutover:check --workspace=backend

# Generate UAT evidence pack for finance sign-off
npm run coa:uat:evidence --workspace=backend -- --periodTo=2026-02
```

Sign-off template:
- `COA_FINANCIAL_UAT_SIGNOFF_TEMPLATE.md`

## 🔐 Default Login

- **Username**: `admin`
- **Password**: `admin123`

> ⚠️ Change the default password in production!

## 🚀 Production Deployment

### Build for Production

```bash
# Build all frontend apps
cd pos && npm run build
cd ../website && npm run build
cd ../kds && npm run build
```

### VPS Deployment (Ubuntu 22.04)

1. Install Node.js 20 LTS, MySQL 8+, Nginx
2. Clone repository and install dependencies
3. Run database migrations
4. Configure PM2 ecosystem file
5. Setup Nginx reverse proxy
6. Configure SSL with Certbot

See `deployment/` folder for detailed scripts.

## 📱 PWA Installation

The website/POS supports PWA installation:
1. Quick start from project root: `npm run dev:mobile`
2. Open the generated `https://...` URL on mobile browser
3. Android Chrome: open menu and choose `Install app`
4. iPhone Safari: `Share` -> `Add to Home Screen`

Manual mode:
1. Run POS in PWA dev mode: `npm run dev:pwa` (inside `pos`)
2. Start HTTPS tunnel: `npm run tunnel` (inside `pos`)
3. Open the generated `https://...` URL on mobile browser
4. Android Chrome: open menu and choose `Install app`
5. iPhone Safari: `Share` -> `Add to Home Screen`

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| GET | `/api/menu` | Get menu items |
| POST | `/api/menu` | Create menu item |
| POST | `/api/orders` | Create order |
| PUT | `/api/orders/:id/status` | Update order status |
| GET | `/api/categories` | Get categories |

## 📡 Socket.io Events

| Event | Description |
|-------|-------------|
| `order:new` | New order created |
| `order:updated` | Order status changed |
| `menu:updated` | Menu item added/modified |

## 🌍 Internationalization

The application is built with Arabic RTL support:
- All interfaces use Cairo font
- RTL layout with proper text alignment
- Arabic number formatting
- Arabic date/time formatting

## 📄 License

MIT License - Feel free to use for personal or commercial projects.

---

Built with ❤️ for restaurant owners



