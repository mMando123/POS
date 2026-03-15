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
- ✅ **SQLite database** (lightweight, no installation needed)
- ✅ **Sequelize ORM** (easy switch to MySQL/PostgreSQL later)
- ✅ JWT authentication
- ✅ Role-based authorization (manager, cashier, chef)
- ✅ Payment gateway integration ready

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

> **Note:** SQLite is included - no database installation required!

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
```

### 2. Start Development

```bash
# Start backend (auto-creates SQLite database)
cd backend
npm run dev
```

The SQLite database will be automatically created at `backend/data/restaurant.db` with default admin user.

### 3. Environment Configuration

Copy `.env.example` to `.env` in the backend folder and update:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restaurant_db
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_secret_key
```

### 4. Start Development Servers

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - POS
cd pos
npm run dev

# Terminal 3 - Website
cd website
npm run dev

# Terminal 4 - KDS
cd kds
npm run dev
```

### Access Points
- **Backend API**: http://localhost:3001
- **Website**: http://localhost:3000
- **POS**: http://localhost:3002
- **KDS**: http://localhost:3003

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

1. Install Node.js 20 LTS, PostgreSQL 16, Nginx
2. Clone repository and install dependencies
3. Run database migrations
4. Configure PM2 ecosystem file
5. Setup Nginx reverse proxy
6. Configure SSL with Certbot

See `deployment/` folder for detailed scripts.

## 📱 PWA Installation

The website supports PWA installation:
1. Open the website on mobile browser
2. Click "Add to Home Screen"
3. The app will work offline with cached menu

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
