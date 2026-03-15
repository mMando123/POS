const fs = require('fs')
const path = require('path')

const SETTINGS_FILE = path.join(__dirname, '../../data/settings.json')

const UNIT_META = {
    g: { dimension: 'mass', toBase: 1 },
    kg: { dimension: 'mass', toBase: 1000 },
    ml: { dimension: 'volume', toBase: 1 },
    l: { dimension: 'volume', toBase: 1000 },
    piece: { dimension: 'count', toBase: 1 },
    portion: { dimension: 'count', toBase: 1 },
    pack: { dimension: 'count', toBase: 1 },
    box: { dimension: 'count', toBase: 1 }
}

const UNIT_ALIASES = {
    liter: 'l',
    litre: 'l',
    liters: 'l',
    litres: 'l',
    kilogram: 'kg',
    kilograms: 'kg',
    gram: 'g',
    grams: 'g'
}

const round6 = (value) => Math.round((parseFloat(value || 0) + Number.EPSILON) * 1_000_000) / 1_000_000

const normalizeUnit = (unit) => {
    const raw = String(unit || '').trim().toLowerCase()
    if (!raw) return 'piece'
    return UNIT_ALIASES[raw] || raw
}

const asPositiveNumber = (value) => {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const readSettings = () => {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return {}
        const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (_) {
        return {}
    }
}

const readDensityMap = () => {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return {}
        const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
        const densityMap = parsed?.inventory?.densityKgPerLiter
        return densityMap && typeof densityMap === 'object' ? densityMap : {}
    } catch (_) {
        return {}
    }
}

const resolveDensityKgPerLiter = ({ ingredientMenuId, explicitDensityKgPerLiter = null }) => {
    const explicit = parseFloat(explicitDensityKgPerLiter)
    if (Number.isFinite(explicit) && explicit > 0) return explicit

    if (!ingredientMenuId) return null
    const densityMap = readDensityMap()
    const fromMap = parseFloat(densityMap[String(ingredientMenuId)])
    return Number.isFinite(fromMap) && fromMap > 0 ? fromMap : null
}

const ensureKnownUnit = (unit) => {
    if (!UNIT_META[unit]) {
        throw new Error(`UNSUPPORTED_UNIT: ${unit}`)
    }
}

const extractFactorFromObjectMap = (map, fromUnit, toUnit) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return null

    const directKeys = [
        `${fromUnit}->${toUnit}`,
        `${fromUnit}:${toUnit}`,
        `${fromUnit}_to_${toUnit}`,
        `${fromUnit}/${toUnit}`
    ]

    for (const key of directKeys) {
        const direct = asPositiveNumber(map[key])
        if (direct) return direct
    }

    const nested = map[fromUnit]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const nestedFactor = asPositiveNumber(nested[toUnit])
        if (nestedFactor) return nestedFactor
    }

    return null
}

const extractFactorFromArrayMap = (map, fromUnit, toUnit) => {
    if (!Array.isArray(map)) return null

    for (const entry of map) {
        if (!entry || typeof entry !== 'object') continue
        const from = normalizeUnit(entry.from || entry.from_unit || entry.fromUnit)
        const to = normalizeUnit(entry.to || entry.to_unit || entry.toUnit)
        if (from !== fromUnit || to !== toUnit) continue
        const factor = asPositiveNumber(entry.factor ?? entry.rate ?? entry.multiplier)
        if (factor) return factor
    }

    return null
}

const extractDirectFactor = (map, fromUnit, toUnit) =>
    extractFactorFromObjectMap(map, fromUnit, toUnit) || extractFactorFromArrayMap(map, fromUnit, toUnit)

const extractFactorWithInverse = (map, fromUnit, toUnit) => {
    const direct = extractDirectFactor(map, fromUnit, toUnit)
    if (direct) return direct

    const reverse = extractDirectFactor(map, toUnit, fromUnit)
    if (reverse) return 1 / reverse
    return null
}

const resolveExplicitUnitFactor = ({ fromUnit, toUnit, ingredientMenuId = null }) => {
    const settings = readSettings()
    const inventory = settings?.inventory && typeof settings.inventory === 'object'
        ? settings.inventory
        : {}

    const mapCandidates = []
    const ingredientId = String(ingredientMenuId || '').trim()

    if (ingredientId) {
        const byIngredientContainers = [
            inventory.unitConversionsByIngredient,
            inventory.uomConversionsByIngredient,
            inventory.countUnitConversionsByIngredient
        ]
        byIngredientContainers.forEach((container) => {
            if (!container || typeof container !== 'object') return
            const ingredientMap = container[ingredientId]
            if (ingredientMap) mapCandidates.push(ingredientMap)
        })
    }

    const globalCandidates = [
        inventory.unitConversions,
        inventory.uomConversions,
        inventory.countUnitConversions
    ]
    globalCandidates.forEach((candidate) => {
        if (candidate) mapCandidates.push(candidate)
    })

    for (const candidate of mapCandidates) {
        const factor = extractFactorWithInverse(candidate, fromUnit, toUnit)
        if (factor) return factor
    }

    return null
}

const convertWithinSameDimension = ({ quantity, fromUnit, toUnit, dimension }) => {
    // Count-like units need explicit same-unit tracking (box/pack/piece are not safely interchangeable).
    if (dimension === 'count' && fromUnit !== toUnit) {
        throw new Error(`INCOMPATIBLE_COUNT_UNITS: ${fromUnit} -> ${toUnit}`)
    }

    const fromMeta = UNIT_META[fromUnit]
    const toMeta = UNIT_META[toUnit]
    const qtyInBase = quantity * fromMeta.toBase
    return qtyInBase / toMeta.toBase
}

const convertMassVolumeWithDensity = ({ quantity, fromUnit, toUnit, densityKgPerLiter }) => {
    const density = parseFloat(densityKgPerLiter)
    if (!Number.isFinite(density) || density <= 0) {
        throw new Error(`DENSITY_REQUIRED_FOR_CROSS_DIMENSION_CONVERSION: ${fromUnit} -> ${toUnit}`)
    }

    const fromDim = UNIT_META[fromUnit].dimension
    const toDim = UNIT_META[toUnit].dimension

    // Step 1: normalize source into kg or liter
    let massKg = null
    let volumeL = null

    if (fromDim === 'mass') {
        massKg = fromUnit === 'kg' ? quantity : quantity / 1000
    } else {
        volumeL = fromUnit === 'l' ? quantity : quantity / 1000
    }

    // Step 2: cross using density (kg per liter)
    if (fromDim === 'mass' && toDim === 'volume') {
        volumeL = massKg / density
    } else if (fromDim === 'volume' && toDim === 'mass') {
        massKg = volumeL * density
    }

    // Step 3: map to target unit
    if (toDim === 'mass') {
        return toUnit === 'kg' ? massKg : massKg * 1000
    }
    return toUnit === 'l' ? volumeL : volumeL * 1000
}

class UnitConversionService {
    static normalizeUnit(unit) {
        return normalizeUnit(unit)
    }

    static resolveDensityKgPerLiter(params = {}) {
        return resolveDensityKgPerLiter(params)
    }

    static convertQuantity({
        quantity,
        fromUnit,
        toUnit,
        ingredientMenuId = null,
        densityKgPerLiter = null
    }) {
        const qty = parseFloat(quantity)
        if (!Number.isFinite(qty) || qty < 0) {
            throw new Error(`INVALID_QUANTITY: ${quantity}`)
        }

        const from = normalizeUnit(fromUnit)
        const to = normalizeUnit(toUnit)

        if (from === to) return round6(qty)

        // Explicit conversion maps (global or ingredient-specific) override default behavior.
        // This supports cases like box -> kg or pack -> piece when business-defined mapping exists.
        const explicitFactor = resolveExplicitUnitFactor({
            fromUnit: from,
            toUnit: to,
            ingredientMenuId
        })
        if (explicitFactor) {
            return round6(qty * explicitFactor)
        }

        ensureKnownUnit(from)
        ensureKnownUnit(to)

        const fromDim = UNIT_META[from].dimension
        const toDim = UNIT_META[to].dimension

        if (fromDim === toDim) {
            return round6(convertWithinSameDimension({
                quantity: qty,
                fromUnit: from,
                toUnit: to,
                dimension: fromDim
            }))
        }

        const crossMassVolume =
            (fromDim === 'mass' && toDim === 'volume') ||
            (fromDim === 'volume' && toDim === 'mass')

        if (!crossMassVolume) {
            throw new Error(`INCOMPATIBLE_UNITS: ${from} -> ${to}`)
        }

        const density = resolveDensityKgPerLiter({
            ingredientMenuId,
            explicitDensityKgPerLiter: densityKgPerLiter
        })

        return round6(convertMassVolumeWithDensity({
            quantity: qty,
            fromUnit: from,
            toUnit: to,
            densityKgPerLiter: density
        }))
    }
}

module.exports = UnitConversionService
