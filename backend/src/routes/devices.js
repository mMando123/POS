const express = require('express')
const router = express.Router()
const { Device, PrintJob, PrintTemplate } = require('../models')
const { getPrintService } = require('../services/printService')
const { authenticate } = require('../middleware/auth')

// Apply auth middleware to all routes
router.use(authenticate)

// ==================== DEVICES ====================

// GET /api/devices - Get all devices
router.get('/', async (req, res) => {
    try {
        const printService = getPrintService()
        const devices = await printService.getAllDevices(req.query.branch_id)
        res.json({ data: devices })
    } catch (error) {
        console.error('Get devices error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// GET /api/devices/:id - Get device by ID
router.get('/:id', async (req, res) => {
    try {
        const printService = getPrintService()
        const device = await printService.getDeviceById(req.params.id)
        if (!device) {
            return res.status(404).json({ message: 'الجهاز غير موجود' })
        }
        res.json({ data: device })
    } catch (error) {
        console.error('Get device error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// POST /api/devices - Create device
router.post('/', async (req, res) => {
    try {
        const printService = getPrintService()
        const device = await printService.createDevice(req.body)
        res.status(201).json({ data: device, message: 'تم إضافة الجهاز بنجاح' })
    } catch (error) {
        console.error('Create device error:', error)
        res.status(500).json({ message: error.message || 'خطأ في الخادم' })
    }
})

// PUT /api/devices/:id - Update device
router.put('/:id', async (req, res) => {
    try {
        const printService = getPrintService()
        const device = await printService.updateDevice(req.params.id, req.body)
        res.json({ data: device, message: 'تم تحديث الجهاز بنجاح' })
    } catch (error) {
        console.error('Update device error:', error)
        res.status(500).json({ message: error.message || 'خطأ في الخادم' })
    }
})

// DELETE /api/devices/:id - Delete device
router.delete('/:id', async (req, res) => {
    try {
        const printService = getPrintService()
        await printService.deleteDevice(req.params.id)
        res.json({ message: 'تم حذف الجهاز بنجاح' })
    } catch (error) {
        console.error('Delete device error:', error)
        res.status(500).json({ message: error.message || 'خطأ في الخادم' })
    }
})

// POST /api/devices/:id/test - Test device connection
router.post('/:id/test', async (req, res) => {
    try {
        const printService = getPrintService()
        const result = await printService.testDeviceConnection(req.params.id)
        res.json(result)
    } catch (error) {
        console.error('Test device error:', error)
        res.status(500).json({ success: false, message: error.message })
    }
})

// POST /api/devices/:id/print-test - Print test page
router.post('/:id/print-test', async (req, res) => {
    try {
        const printService = getPrintService()
        const device = await printService.getDeviceById(req.params.id)

        if (!device) {
            return res.status(404).json({ message: 'الجهاز غير موجود' })
        }

        // Create test print job
        const testContent = JSON.stringify([
            { cmd: 'init' },
            { cmd: 'align', data: 'center' },
            { cmd: 'bold', data: true },
            { cmd: 'size', data: 'large' },
            { cmd: 'text', data: '🖨️ اختبار الطابعة' },
            { cmd: 'size', data: 'normal' },
            { cmd: 'bold', data: false },
            { cmd: 'newline' },
            { cmd: 'text', data: `الجهاز: ${device.name}` },
            { cmd: 'text', data: `النوع: ${device.type}` },
            { cmd: 'text', data: `الغرض: ${device.purpose}` },
            { cmd: 'text', data: new Date().toLocaleString('ar-SA') },
            { cmd: 'newline' },
            { cmd: 'text', data: '--------------------------------' },
            { cmd: 'text', data: 'إذا ظهرت هذه الصفحة' },
            { cmd: 'text', data: 'فالطابعة تعمل بشكل صحيح ✅' },
            { cmd: 'text', data: '--------------------------------' },
            { cmd: 'cut' }
        ])

        const job = await printService.createPrintJob({
            device_id: device.id,
            purpose: device.purpose,
            title: 'صفحة اختبار',
            content_type: 'escpos',
            content: testContent,
            priority: 'high'
        })

        res.json({
            success: true,
            message: 'تم إرسال صفحة الاختبار',
            job_id: job.id
        })
    } catch (error) {
        console.error('Print test error:', error)
        res.status(500).json({ success: false, message: error.message })
    }
})

// ==================== PRINT JOBS ====================

// GET /api/devices/jobs/pending - Get pending print jobs
router.get('/jobs/pending', async (req, res) => {
    try {
        const printService = getPrintService()
        const jobs = await printService.getPendingJobs()
        res.json({ data: jobs })
    } catch (error) {
        console.error('Get pending jobs error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// GET /api/devices/jobs/history - Get job history
router.get('/jobs/history', async (req, res) => {
    try {
        const printService = getPrintService()
        const jobs = await printService.getJobHistory(parseInt(req.query.limit) || 100)
        res.json({ data: jobs })
    } catch (error) {
        console.error('Get job history error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// POST /api/devices/jobs/:id/retry - Retry failed job
router.post('/jobs/:id/retry', async (req, res) => {
    try {
        const printService = getPrintService()
        const job = await printService.retryJob(req.params.id)
        res.json({ data: job, message: 'تم إعادة المهمة للطابور' })
    } catch (error) {
        console.error('Retry job error:', error)
        res.status(500).json({ message: error.message })
    }
})

// POST /api/devices/jobs/:id/cancel - Cancel job
router.post('/jobs/:id/cancel', async (req, res) => {
    try {
        const printService = getPrintService()
        const job = await printService.cancelJob(req.params.id)
        res.json({ data: job, message: 'تم إلغاء المهمة' })
    } catch (error) {
        console.error('Cancel job error:', error)
        res.status(500).json({ message: error.message })
    }
})

// ==================== TEMPLATES ====================

// GET /api/devices/templates - Get all templates
router.get('/templates/all', async (req, res) => {
    try {
        const printService = getPrintService()
        const templates = await printService.getAllTemplates()
        res.json({ data: templates })
    } catch (error) {
        console.error('Get templates error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// GET /api/devices/templates/:id - Get template by ID
router.get('/templates/:id', async (req, res) => {
    try {
        const template = await PrintTemplate.findByPk(req.params.id)
        if (!template) {
            return res.status(404).json({ message: 'القالب غير موجود' })
        }
        res.json({ data: template })
    } catch (error) {
        console.error('Get template error:', error)
        res.status(500).json({ message: 'خطأ في الخادم' })
    }
})

// POST /api/devices/templates - Create template
router.post('/templates', async (req, res) => {
    try {
        const printService = getPrintService()
        const template = await printService.createTemplate(req.body)
        res.status(201).json({ data: template, message: 'تم إنشاء القالب بنجاح' })
    } catch (error) {
        console.error('Create template error:', error)
        res.status(500).json({ message: error.message })
    }
})

// PUT /api/devices/templates/:id - Update template
router.put('/templates/:id', async (req, res) => {
    try {
        const printService = getPrintService()
        const template = await printService.updateTemplate(req.params.id, req.body)
        res.json({ data: template, message: 'تم تحديث القالب بنجاح' })
    } catch (error) {
        console.error('Update template error:', error)
        res.status(500).json({ message: error.message })
    }
})

// DELETE /api/devices/templates/:id - Delete template
router.delete('/templates/:id', async (req, res) => {
    try {
        const printService = getPrintService()
        await printService.deleteTemplate(req.params.id)
        res.json({ message: 'تم حذف القالب بنجاح' })
    } catch (error) {
        console.error('Delete template error:', error)
        res.status(500).json({ message: error.message })
    }
})

// ==================== MANUAL PRINT ====================

// POST /api/devices/print/order/:orderId - Print order manually
router.post('/print/order/:orderId', async (req, res) => {
    try {
        const printService = getPrintService()
        const { Order, OrderItem, Menu } = require('../models')

        const order = await Order.findByPk(req.params.orderId, {
            include: [{ model: OrderItem, as: 'items', include: [Menu] }]
        })

        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' })
        }

        const type = req.body.type || 'receipt'
        const job = await printService.printOrder(order, type)

        if (job) {
            res.json({ success: true, message: `تم إرسال ${type === 'kitchen' ? 'تذكرة المطبخ' : 'الفاتورة'} للطباعة`, job_id: job.id })
        } else {
            res.json({ success: false, message: 'لا توجد طابعة مخصصة لهذا النوع' })
        }
    } catch (error) {
        console.error('Print order error:', error)
        res.status(500).json({ success: false, message: error.message })
    }
})

module.exports = router
