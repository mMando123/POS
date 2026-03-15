const { Op } = require('sequelize')

const ITEM_TYPE_PREFIX = {
    sellable: 'PRD',
    raw_material: 'RAW',
    consumable: 'CON'
}

const normalizeSkuInput = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    return raw.toUpperCase()
}

const resolvePrefix = (itemType, explicitPrefix) => {
    const source = String(explicitPrefix || ITEM_TYPE_PREFIX[itemType] || 'SKU').toUpperCase()
    const sanitized = source.replace(/[^A-Z0-9]/g, '').slice(0, 6)
    return sanitized || 'SKU'
}

const buildDateToken = (date = new Date()) => {
    const y = String(date.getFullYear())
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}${m}${d}`
}

const randomToken = (length = 4) => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let token = ''
    for (let i = 0; i < length; i += 1) {
        token += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    return token
}

const isSkuTaken = async (MenuModel, sku, { transaction = null, excludeId = null } = {}) => {
    const where = { sku }
    if (excludeId) {
        where.id = { [Op.ne]: excludeId }
    }
    const existing = await MenuModel.findOne({
        where,
        attributes: ['id'],
        transaction
    })
    return Boolean(existing)
}

const assertSkuAvailable = async (MenuModel, sku, { transaction = null, excludeId = null } = {}) => {
    const normalized = normalizeSkuInput(sku)
    if (!normalized) return null

    const exists = await isSkuTaken(MenuModel, normalized, { transaction, excludeId })
    if (exists) {
        const error = new Error('SKU is already in use')
        error.statusCode = 400
        throw error
    }

    return normalized
}

const generateUniqueSku = async (
    MenuModel,
    {
        itemType = 'sellable',
        prefix = null,
        transaction = null,
        maxAttempts = 25
    } = {}
) => {
    const skuPrefix = resolvePrefix(itemType, prefix)
    const dateToken = buildDateToken()

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = `${skuPrefix}-${dateToken}-${randomToken(4)}`
        // eslint-disable-next-line no-await-in-loop
        const exists = await isSkuTaken(MenuModel, candidate, { transaction })
        if (!exists) {
            return candidate
        }
    }

    const fallback = `${skuPrefix}-${Date.now()}-${randomToken(3)}`
    const fallbackExists = await isSkuTaken(MenuModel, fallback, { transaction })
    if (fallbackExists) {
        const error = new Error('Failed to generate unique SKU, please try again')
        error.statusCode = 500
        throw error
    }

    return fallback
}

module.exports = {
    normalizeSkuInput,
    assertSkuAvailable,
    generateUniqueSku
}
