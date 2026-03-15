const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const { authenticate, authorize } = require('../middleware/auth')

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads')
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir)
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase()
        const filename = `${uuidv4()}${ext}`
        cb(null, filename)
    }
})

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true)
    } else {
        cb(new Error('نوع الملف غير مدعوم. يرجى رفع صورة (JPEG, PNG, GIF, WebP)'), false)
    }
}

// Configure multer
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    }
})

// Upload single image
router.post('/image', authenticate, authorize('admin', 'manager', 'supervisor'), upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي صورة' })
        }

        const imageUrl = `/uploads/${req.file.filename}`

        res.json({
            success: true,
            data: {
                url: imageUrl,
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size
            }
        })
    } catch (error) {
        console.error('Upload error:', error)
        res.status(500).json({ message: 'فشل رفع الصورة' })
    }
})

// Delete image
router.delete('/image/:filename', authenticate, authorize('admin', 'manager'), (req, res) => {
    try {
        const { filename } = req.params
        if (!/^[a-f0-9-]{36}\.(jpe?g|png|gif|webp)$/i.test(filename)) {
            return res.status(400).json({ message: 'Ø§Ø³Ù… Ø§Ù„Ù…Ù„Ù ØºÙŠØ± ØµØ§Ù„Ø­' })
        }
        const filePath = path.join(uploadsDir, filename)

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
            res.json({ success: true, message: 'تم حذف الصورة' })
        } else {
            res.status(404).json({ message: 'الصورة غير موجودة' })
        }
    } catch (error) {
        console.error('Delete image error:', error)
        res.status(500).json({ message: 'فشل حذف الصورة' })
    }
})

// Error handling for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت' })
        }
        return res.status(400).json({ message: error.message })
    }
    if (error) {
        return res.status(400).json({ message: error.message })
    }
    next()
})

module.exports = router
