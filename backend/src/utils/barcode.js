const { Op } = require('sequelize')

const INTERNAL_BARCODE_PREFIX = 'ZM'
const INTERNAL_BARCODE_PAD = 6
const INTERNAL_BARCODE_PATTERN = new RegExp(`^${INTERNAL_BARCODE_PREFIX}(\\d{${INTERNAL_BARCODE_PAD}})$`, 'i')

const normalizeBarcodeInput = (value) => {
    const normalized = String(value || '')
        .trim()
        .replace(/\s+/g, '')
        .toUpperCase()

    return normalized || null
}

const buildInternalBarcode = (sequence) => (
    `${INTERNAL_BARCODE_PREFIX}${String(sequence).padStart(INTERNAL_BARCODE_PAD, '0')}`
)

const extractInternalBarcodeSequence = (barcode) => {
    const normalized = normalizeBarcodeInput(barcode)
    if (!normalized) return null

    const match = normalized.match(INTERNAL_BARCODE_PATTERN)
    if (!match) return null

    const sequence = parseInt(match[1], 10)
    return Number.isFinite(sequence) ? sequence : null
}

const getNextInternalBarcode = async (MenuModel, { transaction = null } = {}) => {
    const rows = await MenuModel.findAll({
        where: {
            barcode: {
                [Op.like]: `${INTERNAL_BARCODE_PREFIX}%`
            }
        },
        attributes: ['barcode'],
        transaction,
        ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
    })

    let maxSequence = 0
    for (const row of rows) {
        const sequence = extractInternalBarcodeSequence(row?.barcode)
        if (sequence && sequence > maxSequence) {
            maxSequence = sequence
        }
    }

    return buildInternalBarcode(maxSequence + 1)
}

const assertBarcodeAvailable = async (MenuModel, barcode, { transaction = null, excludeId = null } = {}) => {
    const normalizedBarcode = normalizeBarcodeInput(barcode)
    if (!normalizedBarcode) return null

    const where = { barcode: normalizedBarcode }
    if (excludeId) {
        where.id = { [Op.ne]: excludeId }
    }

    const existing = await MenuModel.findOne({
        where,
        attributes: ['id', 'barcode'],
        transaction
    })

    if (existing) {
        throw new Error('الباركود موجود بالفعل')
    }

    return normalizedBarcode
}

module.exports = {
    INTERNAL_BARCODE_PREFIX,
    INTERNAL_BARCODE_PAD,
    INTERNAL_BARCODE_PATTERN,
    normalizeBarcodeInput,
    buildInternalBarcode,
    extractInternalBarcodeSequence,
    getNextInternalBarcode,
    assertBarcodeAvailable
}
