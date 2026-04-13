/**
 * Print Service - Unified Printing System
 * Handles print job creation, queue management, and device communication
 */

const { Device, PrintJob, PrintTemplate, Order, OrderItem, Menu } = require('../models')
const { Op } = require('sequelize')
const net = require('net')
const logger = require('./logger')

class PrintService {
    constructor(io) {
        this.io = io
        this.printQueue = new Map() // In-memory queue for faster processing
        this.processingJobs = new Set()
        this.retryTimeouts = new Map()
        this._schemaErrorLogged = false
        this._schemaRecoveryInProgress = false
        this._dbUnavailableLogAt = 0

        // Start queue processor
        this.startQueueProcessor()
    }

    // ==================== DEVICE MANAGEMENT ====================

    async getAllDevices(branchId = null) {
        const where = {}
        if (branchId) where.branch_id = branchId
        return await Device.findAll({ where, order: [['purpose', 'ASC'], ['name', 'ASC']] })
    }

    async getDeviceById(id) {
        return await Device.findByPk(id)
    }

    async createDevice(data) {
        const device = await Device.create(data)
        await this.testDeviceConnection(device.id)
        return device
    }

    async updateDevice(id, data) {
        const device = await Device.findByPk(id)
        if (!device) throw new Error('الجهاز غير موجود')
        await device.update(data)
        return device
    }

    async deleteDevice(id) {
        const device = await Device.findByPk(id)
        if (!device) throw new Error('الجهاز غير موجود')
        await device.destroy()
        return true
    }

    async testDeviceConnection(deviceId) {
        const device = await Device.findByPk(deviceId)
        if (!device) throw new Error('الجهاز غير موجود')

        try {
            if (device.connection_type === 'network') {
                const isOnline = await this.testNetworkPrinter(device.ip_address, device.port)
                await device.update({
                    status: isOnline ? 'online' : 'offline',
                    last_seen: isOnline ? new Date() : device.last_seen,
                    last_error: isOnline ? null : 'فشل الاتصال بالطابعة'
                })
                return { success: isOnline, message: isOnline ? 'الطابعة متصلة' : 'فشل الاتصال' }
            } else if (device.connection_type === 'usb') {
                // USB testing requires electron/node-usb - mark as online for now
                await device.update({ status: 'online', last_seen: new Date() })
                return { success: true, message: 'USB - يتطلب اختبارًا محليًا' }
            } else {
                await device.update({ status: 'offline' })
                return { success: false, message: 'نوع الاتصال غير مدعوم للاختبار' }
            }
        } catch (error) {
            await device.update({ status: 'error', last_error: error.message })
            return { success: false, message: error.message }
        }
    }

    testNetworkPrinter(ip, port, timeout = 3000) {
        return new Promise((resolve) => {
            const socket = new net.Socket()
            let resolved = false

            socket.setTimeout(timeout)

            socket.on('connect', () => {
                resolved = true
                socket.destroy()
                resolve(true)
            })

            socket.on('timeout', () => {
                if (!resolved) {
                    socket.destroy()
                    resolve(false)
                }
            })

            socket.on('error', () => {
                if (!resolved) {
                    resolved = true
                    resolve(false)
                }
            })

            socket.connect(port, ip)
        })
    }

    async getDeviceByPurpose(purpose, branchId = null) {
        const where = { purpose, is_active: true }
        if (branchId) where.branch_id = branchId

        // Try to find default device first
        let device = await Device.findOne({ where: { ...where, is_default: true } })
        if (!device) {
            device = await Device.findOne({ where })
        }
        return device
    }

    // ==================== PRINT JOB MANAGEMENT ====================

    async createPrintJob(data) {
        const job = await PrintJob.create({
            ...data,
            status: 'pending',
        })

        // Emit event for real-time updates
        this.io?.emit('print:job:created', {
            id: job.id,
            title: job.title,
            purpose: job.purpose,
            status: job.status,
        })

        // Add to in-memory queue for faster processing
        this.printQueue.set(job.id, job)

        return job
    }

    async getPendingJobs() {
        try {
            return await PrintJob.findAll({
                where: {
                    status: ['pending', 'failed'],
                    retry_count: { [Op.lt]: 3 }
                },
                order: [
                    ['priority', 'DESC'],
                    ['created_at', 'ASC']
                ],
                limit: 50,
                logging: false
            })
        } catch (error) {
            const sqlCode = error?.original?.code
            const message = String(error?.message || '')
            const isMissingTable = sqlCode === 'ER_NO_SUCH_TABLE' || message.includes("doesn't exist")
            const isDbUnavailable = sqlCode === 'ER_BAD_DB_ERROR'
                || sqlCode === 'ECONNREFUSED'
                || sqlCode === 'PROTOCOL_CONNECTION_LOST'
                || /Unknown database/i.test(message)

            if (isDbUnavailable) {
                const now = Date.now()
                if ((now - this._dbUnavailableLogAt) > 30000) {
                    logger.warn('Print queue paused: database is unavailable.')
                    this._dbUnavailableLogAt = now
                }
                return []
            }

            if (!isMissingTable) throw error

            if (!this._schemaErrorLogged) {
                logger.warn('Print queue table is missing; attempting to create print tables now.')
                this._schemaErrorLogged = true
            }

            if (this._schemaRecoveryInProgress) return []
            this._schemaRecoveryInProgress = true
            try {
                await ensurePrintSchema()
            } finally {
                this._schemaRecoveryInProgress = false
            }
            return []
        }
    }

    async getJobHistory(limit = 100) {
        return await PrintJob.findAll({
            order: [['created_at', 'DESC']],
            limit
        })
    }

    async retryJob(jobId) {
        const job = await PrintJob.findByPk(jobId)
        if (!job) throw new Error('المهمة غير موجودة')

        await job.update({
            status: 'pending',
            error_message: null
        })

        this.printQueue.set(job.id, job)
        return job
    }

    async cancelJob(jobId) {
        const job = await PrintJob.findByPk(jobId)
        if (!job) throw new Error('المهمة غير موجودة')

        await job.update({ status: 'cancelled' })
        this.printQueue.delete(job.id)

        return job
    }

    // ==================== PRINTING LOGIC ====================

    async printOrder(order, type = 'receipt') {
        try {
            // Get appropriate device
            const device = await this.getDeviceByPurpose(type, order.branch_id)
            if (!device) {
                logger.warn(`No ${type} printer configured`, { orderId: order?.id, orderNumber: order?.order_number })
                return null
            }

            // Get template
            const template = await this.getTemplateByType(type === 'kitchen' ? 'kitchen_ticket' : 'receipt')

            // Generate content
            const content = await this.generateOrderContent(order, template, device)

            // Create print job
            const job = await this.createPrintJob({
                device_id: device.id,
                purpose: type,
                title: `${type === 'kitchen' ? 'تذكرة مطبخ' : 'فاتورة'} #${order.order_number}`,
                content_type: 'escpos',
                content: content,
                entity_type: 'order',
                entity_id: order.id,
                copies: device.print_copies,
                priority: type === 'kitchen' ? 'high' : 'normal',
                branch_id: order.branch_id,
            })

            return job
        } catch (error) {
            logger.error('Print order error', { error: error.message, orderId: order?.id, orderNumber: order?.order_number, type })
            throw error
        }
    }

    async printKitchenTicket(order) {
        return this.printOrder(order, 'kitchen')
    }

    async printReceipt(order) {
        return this.printOrder(order, 'receipt')
    }

    async printInvoice(order) {
        return this.printOrder(order, 'invoice')
    }

    // ==================== CONTENT GENERATION ====================

    async generateOrderContent(order, template, device) {
        const commands = []
        const width = device.paper_width === '58mm' ? 32 : 48

        // Initialize printer
        commands.push({ cmd: 'init' })

        // Header with logo
        if (template?.show_logo && device.supports_logo && template.header_logo) {
            commands.push({ cmd: 'logo', data: template.header_logo })
        }

        // Store name
        commands.push({ cmd: 'align', data: 'center' })
        commands.push({ cmd: 'bold', data: true })
        commands.push({ cmd: 'size', data: 'large' })
        commands.push({ cmd: 'text', data: template?.header_text || 'المتجر' })
        commands.push({ cmd: 'size', data: 'normal' })
        commands.push({ cmd: 'bold', data: false })
        commands.push({ cmd: 'newline' })

        // Order info
        commands.push({ cmd: 'text', data: `طلب #${order.order_number}` })
        commands.push({ cmd: 'text', data: new Date(order.created_at).toLocaleString('ar-SA') })
        commands.push({ cmd: 'text', data: this.getOrderTypeLabel(order.order_type) })
        commands.push({ cmd: 'newline' })

        // Divider
        commands.push({ cmd: 'text', data: '-'.repeat(width) })

        // Items
        commands.push({ cmd: 'align', data: 'right' })
        const items = order.items || order.OrderItems || []
        for (const item of items) {
            const itemName = item.Menu?.name_ar || item.name_ar || item.menu_name || 'صنف'
            const qty = item.quantity
            const price = (parseFloat(item.unit_price || item.price) * qty).toFixed(2)

            commands.push({
                cmd: 'columns',
                data: [
                    { text: `${qty}x ${itemName}`, width: width - 10, align: 'right' },
                    { text: `${price}`, width: 10, align: 'left' }
                ]
            })

            // Notes
            if (item.notes) {
                commands.push({ cmd: 'text', data: `  - ${item.notes}` })
            }
        }

        // Divider
        commands.push({ cmd: 'text', data: '-'.repeat(width) })

        // Totals
        const subtotalAmount = parseFloat(order.subtotal || 0)
        const taxAmountValue = parseFloat(order.tax_amount ?? order.tax ?? 0)
        const resolvedTaxRate = Number(order.tax_rate)
        const taxRatePercent = Number.isFinite(resolvedTaxRate)
            ? resolvedTaxRate
            : (subtotalAmount > 0 ? ((taxAmountValue / subtotalAmount) * 100) : 0)

        commands.push({ cmd: 'align', data: 'right' })
        commands.push({
            cmd: 'columns',
            data: [
                { text: 'المجموع الفرعي:', width: width - 12, align: 'right' },
                { text: `${parseFloat(order.subtotal).toFixed(2)}`, width: 12, align: 'left' }
            ]
        })
        commands.push({
            cmd: 'columns',
            data: [
                { text: `الضريبة (${taxRatePercent.toFixed(2).replace(/\.00$/, '')}%):`, width: width - 12, align: 'right' },
                { text: `${taxAmountValue.toFixed(2)}`, width: 12, align: 'left' }
            ]
        })
        commands.push({ cmd: 'bold', data: true })
        commands.push({ cmd: 'size', data: 'large' })
        commands.push({
            cmd: 'columns',
            data: [
                { text: 'الإجمالي:', width: width - 12, align: 'right' },
                { text: `${parseFloat(order.total_amount).toFixed(2)} ر.س`, width: 12, align: 'left' }
            ]
        })
        commands.push({ cmd: 'size', data: 'normal' })
        commands.push({ cmd: 'bold', data: false })

        // Payment method
        commands.push({ cmd: 'newline' })
        commands.push({ cmd: 'align', data: 'center' })
        commands.push({ cmd: 'text', data: `طريقة الدفع: ${this.getPaymentMethodLabel(order.payment_method)}` })

        // QR Code
        if (template?.show_qr && device.supports_qr) {
            commands.push({ cmd: 'newline' })
            commands.push({ cmd: 'qr', data: `ORDER:${order.id}`, size: 4 })
        }

        // Footer
        if (template?.footer_text) {
            commands.push({ cmd: 'newline' })
            commands.push({ cmd: 'text', data: template.footer_text })
        }

        // Cut paper
        if (device.auto_cut && device.supports_cut) {
            commands.push({ cmd: 'cut' })
        }

        // Open cash drawer
        if (device.open_drawer_on_print && device.supports_cash_drawer) {
            commands.push({ cmd: 'drawer' })
        }

        return JSON.stringify(commands)
    }

    async generateKitchenContent(order, template, device) {
        const commands = []
        const width = device.paper_width === '58mm' ? 32 : 48

        commands.push({ cmd: 'init' })
        commands.push({ cmd: 'align', data: 'center' })
        commands.push({ cmd: 'bold', data: true })
        commands.push({ cmd: 'size', data: 'large' })
        commands.push({ cmd: 'text', data: 'تذكرة مطبخ' })
        commands.push({ cmd: 'size', data: 'double' })
        commands.push({ cmd: 'text', data: `#${order.order_number}` })
        commands.push({ cmd: 'size', data: 'normal' })
        commands.push({ cmd: 'bold', data: false })
        commands.push({ cmd: 'newline' })

        // Order type with emphasis
        commands.push({ cmd: 'invert', data: true })
        commands.push({ cmd: 'text', data: ` ${this.getOrderTypeLabel(order.order_type)} ` })
        commands.push({ cmd: 'invert', data: false })
        commands.push({ cmd: 'newline' })

        commands.push({ cmd: 'text', data: new Date().toLocaleTimeString('ar-SA') })
        commands.push({ cmd: 'text', data: '='.repeat(width) })

        // Items - Large and clear for kitchen
        commands.push({ cmd: 'align', data: 'right' })
        commands.push({ cmd: 'size', data: 'large' })

        const items = order.items || order.OrderItems || []
        for (const item of items) {
            const itemName = item.Menu?.name_ar || item.name_ar || item.menu_name || 'صنف'
            commands.push({ cmd: 'bold', data: true })
            commands.push({ cmd: 'text', data: `${item.quantity}x  ${itemName}` })
            commands.push({ cmd: 'bold', data: false })

            if (item.notes) {
                commands.push({ cmd: 'size', data: 'normal' })
                commands.push({ cmd: 'text', data: `    ملاحظة: ${item.notes}` })
                commands.push({ cmd: 'size', data: 'large' })
            }
            commands.push({ cmd: 'newline' })
        }

        commands.push({ cmd: 'size', data: 'normal' })
        commands.push({ cmd: 'text', data: '='.repeat(width) })

        // Special notes
        if (order.notes) {
            commands.push({ cmd: 'align', data: 'center' })
            commands.push({ cmd: 'bold', data: true })
            commands.push({ cmd: 'text', data: 'ملاحظات:' })
            commands.push({ cmd: 'text', data: order.notes })
            commands.push({ cmd: 'bold', data: false })
        }

        if (device.auto_cut && device.supports_cut) {
            commands.push({ cmd: 'cut' })
        }

        if (device.beep_on_print) {
            commands.push({ cmd: 'beep' })
        }

        return JSON.stringify(commands)
    }

    // ==================== TEMPLATE MANAGEMENT ====================

    async getTemplateByType(type, branchId = null) {
        const where = { type, is_active: true }
        if (branchId) where.branch_id = branchId

        let template = await PrintTemplate.findOne({ where: { ...where, is_default: true } })
        if (!template) {
            template = await PrintTemplate.findOne({ where })
        }
        return template
    }

    async getAllTemplates() {
        return await PrintTemplate.findAll({ order: [['type', 'ASC']] })
    }

    async createTemplate(data) {
        return await PrintTemplate.create(data)
    }

    async updateTemplate(id, data) {
        const template = await PrintTemplate.findByPk(id)
        if (!template) throw new Error('القالب غير موجود')
        await template.update(data)
        return template
    }

    async deleteTemplate(id) {
        const template = await PrintTemplate.findByPk(id)
        if (!template) throw new Error('القالب غير موجود')
        await template.destroy()
        return true
    }

    // ==================== QUEUE PROCESSOR ====================

    startQueueProcessor() {
        setInterval(async () => {
            await this.processQueue()
        }, 2000) // Process every 2 seconds
    }

    async processQueue() {
        try {
            const pendingJobs = await this.getPendingJobs()

            for (const job of pendingJobs) {
                if (this.processingJobs.has(job.id)) continue

                this.processingJobs.add(job.id)

                try {
                    await this.executeJob(job)
                } catch (error) {
                    logger.error(`Print job ${job.id} failed during queue processing`, { error: error.message })
                } finally {
                    this.processingJobs.delete(job.id)
                }
            }
        } catch (error) {
            logger.error('Queue processor error', { error: error.message })
        }
    }

    async executeJob(job) {
        const device = await Device.findByPk(job.device_id)
        if (!device) {
            await job.update({ status: 'failed', error_message: 'الجهاز غير موجود' })
            return
        }

        try {
            await job.update({ status: 'printing', started_at: new Date() })

            // Emit event
            this.io?.emit('print:job:printing', { id: job.id, device: device.name })

            // Send to printer based on connection type
            let success = false

            if (device.connection_type === 'network') {
                success = await this.sendToNetworkPrinter(device, job.content)
            } else if (device.connection_type === 'usb') {
                // USB printing requires local agent
                success = await this.sendToLocalAgent(device, job)
            } else {
                throw new Error('نوع الاتصال غير مدعوم')
            }

            if (success) {
                await job.update({ status: 'completed', completed_at: new Date() })
                await device.update({ status: 'online', last_seen: new Date(), last_error: null })

                this.io?.emit('print:job:completed', { id: job.id })
                logger.info(`Print job ${job.id} completed`)
            } else {
                throw new Error('فشل الإرسال إلى الطابعة')
            }

        } catch (error) {
            const retryCount = job.retry_count + 1
            const status = retryCount >= job.max_retries ? 'failed' : 'pending'

            await job.update({
                status,
                retry_count: retryCount,
                error_message: error.message
            })

            await device.update({ status: 'error', last_error: error.message })

            this.io?.emit('print:job:failed', {
                id: job.id,
                error: error.message,
                retrying: status === 'pending'
            })

            logger.error(`Print job ${job.id} failed`, { error: error.message, retryCount, status })
        }
    }

    async sendToNetworkPrinter(device, content) {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket()

            socket.setTimeout(10000)

            socket.connect(device.port, device.ip_address, () => {
                // Convert JSON commands to ESC/POS
                const escposData = this.convertToESCPOS(content)
                socket.write(escposData, () => {
                    socket.end()
                    resolve(true)
                })
            })

            socket.on('error', (err) => {
                socket.destroy()
                reject(new Error(`Network error: ${err.message}`))
            })

            socket.on('timeout', () => {
                socket.destroy()
                reject(new Error('Connection timeout'))
            })
        })
    }

    async sendToLocalAgent(device, job) {
        // This would communicate with a local print agent (Electron app)
        // For now, emit event for client-side handling
        this.io?.emit('print:local', {
            jobId: job.id,
            deviceId: device.id,
            content: job.content,
            contentType: job.content_type
        })

        // Mark as completed (local agent will handle)
        return true
    }

    convertToESCPOS(jsonContent) {
        const commands = JSON.parse(jsonContent)
        const buffer = []

        // ESC/POS command codes
        const ESC = 0x1B
        const GS = 0x1D
        const FS = 0x1C

        for (const cmd of commands) {
            switch (cmd.cmd) {
                case 'init':
                    buffer.push(ESC, 0x40) // Initialize printer
                    break
                case 'text':
                    buffer.push(...Buffer.from(cmd.data + '\n', 'utf8'))
                    break
                case 'newline':
                    buffer.push(0x0A)
                    break
                case 'align':
                    const alignments = { left: 0, center: 1, right: 2 }
                    buffer.push(ESC, 0x61, alignments[cmd.data] || 0)
                    break
                case 'bold':
                    buffer.push(ESC, 0x45, cmd.data ? 1 : 0)
                    break
                case 'size':
                    const sizes = { small: 0x00, normal: 0x00, large: 0x11, double: 0x22 }
                    buffer.push(GS, 0x21, sizes[cmd.data] || 0x00)
                    break
                case 'invert':
                    buffer.push(GS, 0x42, cmd.data ? 1 : 0)
                    break
                case 'cut':
                    buffer.push(GS, 0x56, 0x00) // Full cut
                    break
                case 'drawer':
                    buffer.push(ESC, 0x70, 0x00, 0x19, 0xFA) // Open cash drawer
                    break
                case 'beep':
                    buffer.push(ESC, 0x42, 0x03, 0x02) // Beep 3 times
                    break
                case 'qr':
                    // Simplified QR code generation
                    const qrData = cmd.data
                    buffer.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, cmd.size || 4) // Size
                    buffer.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31) // Error correction
                    const storeLen = qrData.length + 3
                    buffer.push(GS, 0x28, 0x6B, storeLen & 0xFF, (storeLen >> 8) & 0xFF, 0x31, 0x50, 0x30)
                    buffer.push(...Buffer.from(qrData, 'utf8'))
                    buffer.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30) // Print QR
                    break
            }
        }

        return Buffer.from(buffer)
    }

    // ==================== HELPERS ====================

    getOrderTypeLabel(type) {
        const labels = {
            online: 'أونلاين',
            walkin: 'حضوري',
            delivery: 'توصيل',
            dine_in: 'محلي',
            takeaway: 'استلام'
        }
        return labels[type] || type
    }

    getPaymentMethodLabel(method) {
        const labels = {
            cash: 'نقدًا',
            card: 'بطاقة',
            online: 'دفع إلكتروني'
        }
        return labels[method] || method
    }

    // ==================== AUTO-PRINT TRIGGERS ====================

    async onNewOrder(order) {
        try {
            // Print receipt for POS orders
            if (order.order_type !== 'online') {
                await this.printReceipt(order)
            }
            // Print kitchen ticket
            await this.printKitchenTicket(order)

            logger.info(`Auto-print triggered for order #${order.order_number}`)
        } catch (error) {
            logger.error('Auto-print error', { error: error.message, orderId: order?.id, orderNumber: order?.order_number })
        }
    }

    async onOrderApproved(order) {
        try {
            // Print kitchen ticket for approved online orders
            await this.printKitchenTicket(order)
            logger.info(`Kitchen ticket printed for approved order #${order.order_number}`)
        } catch (error) {
            logger.error('Auto-print error', { error: error.message, orderId: order?.id, orderNumber: order?.order_number })
        }
    }

    async onOrderCompleted(order) {
        try {
            // Print invoice/receipt
            await this.printReceipt(order)
            logger.info(`Receipt printed for completed order #${order.order_number}`)
        } catch (error) {
            logger.error('Auto-print error', { error: error.message, orderId: order?.id, orderNumber: order?.order_number })
        }
    }
}

// Singleton instance
let printServiceInstance = null

async function ensurePrintSchema() {
    await Device.sync()
    await PrintTemplate.sync()
    await PrintJob.sync()
}

async function initPrintService(io) {
    if (!printServiceInstance) {
        await ensurePrintSchema()
        printServiceInstance = new PrintService(io)
        logger.info('Print Service initialized')
    }
    return printServiceInstance
}

function getPrintService() {
    return printServiceInstance
}

module.exports = {
    PrintService,
    initPrintService,
    getPrintService
}

