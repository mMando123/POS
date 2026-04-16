// Server Configuration - Trigger Restart (11)
require('dotenv').config()
const express = require('express')
const http = require('http')
const net = require('net')
const { Server } = require('socket.io')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const path = require('path')
const fs = require('fs')

// Ensure data directory exists for SQLite
const dataDir = path.join(__dirname, '../data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const ensurePortAvailable = (port) => new Promise((resolve, reject) => {
  const probe = net.createServer()

  probe.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const portError = new Error(`Port ${port} is already in use by another process`)
      portError.code = 'EADDRINUSE'
      reject(portError)
      return
    }
    reject(err)
  })

  probe.once('listening', () => {
    probe.close(resolve)
  })

  probe.listen(port)
})

const { initDatabase } = require('./models')
const setupSocketHandlers = require('./socket/handlers')



const authRoutes = require('./routes/auth')
const menuRoutes = require('./routes/menu')
const categoryRoutes = require('./routes/category')
const orderRoutes = require('./routes/order')
const customerRoutes = require('./routes/customer')
const paymentRoutes = require('./routes/payment')
const couponRoutes = require('./routes/coupons')
const pricingRoutes = require('./routes/pricing')
const loyaltyRoutes = require('./routes/loyalty')
const uploadRoutes = require('./routes/upload')
const reportsRoutes = require('./routes/reports')
const shiftRoutes = require('./routes/shifts')
const userRoutes = require('./routes/users')
const branchRoutes = require('./routes/branches')
const settingsRoutes = require('./routes/settings')
const notificationsRoutes = require('./routes/notifications')
const devicesRoutes = require('./routes/devices')
const paymentGatewayRoutes = require('./routes/paymentGateways')
// Inventory Module Routes
const inventoryRoutes = require('./routes/inventory')
const warehouseRoutes = require('./routes/warehouses')
const purchaseRoutes = require('./routes/purchases')
const transferRoutes = require('./routes/transfers')
const stockIssueRoutes = require('./routes/stockIssues')
const auditRoutes = require('./routes/audit')
const refundRoutes = require('./routes/refunds')
const suppliersRoutes = require('./routes/suppliers')
const purchaseOrdersRoutes = require('./routes/purchaseOrders')
const purchaseReturnsRoutes = require('./routes/purchaseReturns')
const entityAttachmentsRoutes = require('./routes/entityAttachments')
const hrRoutes = require('./routes/hr')
// const standaloneAccountingRoutes = require('../../accounting-module/routes')
// Accounting Layer (Phase 2)
const accountingRoutes = require('./routes/accounting')
const expenseRoutes = require('./routes/expenses')
const { initNotificationService } = require('./services/notificationService')
const { initPrintService } = require('./services/printService')
const logger = require('./services/logger')
const { maintenanceMiddleware } = require('./middleware/maintenance')
const { sanitizeMiddleware } = require('./middleware/sanitize')
const { activityAuditMiddleware } = require('./middleware/activityAudit')
const systemRoutes = require('./routes/system')

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : null,
  })
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    message: error.message,
    stack: error.stack,
  })

  // Hard stop in production-like modes to avoid running in undefined state.
  if (['production', 'staging'].includes(String(process.env.NODE_ENV || '').toLowerCase())) {
    setTimeout(() => process.exit(1), 1000)
  }
})

const app = express()
const server = http.createServer(app)

// Support reverse proxies/tunnels (ngrok, load balancers) so req.ip/rate-limit work correctly.
const trustProxySetting = (() => {
  const raw = process.env.TRUST_PROXY
  if (raw == null || raw === '') return 1
  const normalized = String(raw).trim().toLowerCase()
  if (['false', '0', 'off', 'no'].includes(normalized)) return false
  if (['true', '1', 'on', 'yes'].includes(normalized)) return 1
  const asNumber = Number(raw)
  if (Number.isFinite(asNumber)) return asNumber
  return raw
})()
app.set('trust proxy', trustProxySetting)

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:3003'],
    methods: ['GET', 'POST'],
    credentials: true
  }
})

// Make io accessible in routes
app.set('io', io)

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images to be loaded from different origins
  crossOriginEmbedderPolicy: false
}))
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:3003'],
  credentials: true
}))

// Replace morgan default with winston stream
app.use(morgan('combined', { stream: logger.stream }))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Apply input sanitization to prevent XSS and SQL injection
app.use(sanitizeMiddleware)

// Apply maintenance mode check for all incoming requests
app.use(maintenanceMiddleware)

// Centralized user activity trail logging (non-blocking)
app.use(activityAuditMiddleware)

// Serve uploaded files with proper headers
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res, path) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
}))

// Swagger Documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/menu', menuRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/coupons', couponRoutes)
app.use('/api/pricing', pricingRoutes)
app.use('/api/loyalty', loyaltyRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/shifts', shiftRoutes)
app.use('/api/users', userRoutes)
app.use('/api/branches', branchRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/devices', devicesRoutes)
app.use('/api/payment-gateways', paymentGatewayRoutes)
// Inventory Module
app.use('/api/inventory', inventoryRoutes)
app.use('/api/warehouses', warehouseRoutes)
app.use('/api/purchases', purchaseRoutes)
app.use('/api/transfers', transferRoutes)
app.use('/api/stock-issues', stockIssueRoutes)
// Audit Module
app.use('/api/audit', auditRoutes)
// Refund Module
app.use('/api/refunds', refundRoutes)
// Suppliers & Purchase Orders
app.use('/api/suppliers', suppliersRoutes)
app.use('/api/purchase-orders', purchaseOrdersRoutes)
app.use('/api/purchase-returns', purchaseReturnsRoutes)
app.use('/api/entity-attachments', entityAttachmentsRoutes)
app.use('/api/hr', hrRoutes)
// app.use('/api/v1/accounting', standaloneAccountingRoutes)
// Accounting Layer (Phase 2)
app.use('/api/accounting', accountingRoutes)
// Expenses Module
app.use('/api/expenses', expenseRoutes)
// Delivery Module
const deliveryRoutes = require('./routes/delivery')
app.use('/api/delivery', deliveryRoutes)
// System Data Setup
app.use('/api/system', systemRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Socket.io handlers
setupSocketHandlers(io)

// Initialize Notification Service with Socket.io
initNotificationService(io)
app.set('notificationService', require('./services/notificationService').getNotificationService())

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled Error:', { message: err.message, stack: err.stack, method: req.method, url: req.url })
  res.status(err.status || 500).json({
    message: err.message || 'خطأ في الخادم',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
})

// Start server
const PORT = process.env.PORT || 3001

const startServer = async () => {
  try {
    await ensurePortAvailable(PORT)

    // Initialize database (creates tables and seed data)
    await initDatabase()

    // Initialize Print Service after database sync
    await initPrintService(io)
    app.set('printService', require('./services/printService').getPrintService())

    // Seed Chart of Accounts (Phase 2 — idempotent)
    try {
      const { seedChartOfAccounts } = require('./scripts/seed-chart-of-accounts')
      await seedChartOfAccounts()
    } catch (coaErr) {
      logger.warn('Chart of Accounts seed skipped or failed:', coaErr.message)
    }

    server.once('error', (listenErr) => {
      if (listenErr.code === 'EADDRINUSE') {
        logger.warn(`Port ${PORT} is already in use. Keep only one backend process running.`)
        process.exit(0)
        return
      }

      logger.error('HTTP server failed to listen', {
        message: listenErr.message,
        code: listenErr.code,
        stack: listenErr.stack
      })
      process.exit(1)
    })

    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`)
      logger.info('Socket.io ready')
      const dialect = (process.env.DB_DIALECT || 'sqlite').trim()
      if (dialect === 'mysql') {
        logger.info(`Database: MySQL (${process.env.DB_NAME})`)
      } else {
        logger.info(`SQLite database: ${path.join(dataDir, 'restaurant.db')}`)
      }
    })
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      logger.warn(error.message)
      process.exit(0)
      return
    }

    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
