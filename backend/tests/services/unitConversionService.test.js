const fs = require('fs')
const UnitConversionService = require('../../src/services/unitConversionService')

describe('UnitConversionService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    test('converts grams to kilograms', () => {
        const result = UnitConversionService.convertQuantity({
            quantity: 500,
            fromUnit: 'g',
            toUnit: 'kg'
        })
        expect(result).toBeCloseTo(0.5, 6)
    })

    test('converts milliliters to liters', () => {
        const result = UnitConversionService.convertQuantity({
            quantity: 250,
            fromUnit: 'ml',
            toUnit: 'l'
        })
        expect(result).toBeCloseTo(0.25, 6)
    })

    test('converts volume to mass when density exists', () => {
        const result = UnitConversionService.convertQuantity({
            quantity: 0.5,
            fromUnit: 'l',
            toUnit: 'kg',
            densityKgPerLiter: 0.8
        })
        expect(result).toBeCloseTo(0.4, 6)
    })

    test('supports fractional quantities used by recipes', () => {
        const result = UnitConversionService.convertQuantity({
            quantity: 0.25,
            fromUnit: 'kg',
            toUnit: 'g'
        })
        expect(result).toBeCloseTo(250, 6)
    })

    test('throws when mass-volume conversion has no density', () => {
        expect(() => UnitConversionService.convertQuantity({
            quantity: 1,
            fromUnit: 'kg',
            toUnit: 'l'
        })).toThrow(/DENSITY_REQUIRED_FOR_CROSS_DIMENSION_CONVERSION/)
    })

    test('throws for count unit mismatch without explicit conversion', () => {
        expect(() => UnitConversionService.convertQuantity({
            quantity: 1,
            fromUnit: 'pack',
            toUnit: 'piece'
        })).toThrow(/INCOMPATIBLE_COUNT_UNITS/)
    })

    test('supports explicit count conversion from settings map', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true)
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
            inventory: {
                unitConversions: {
                    'pack->piece': 12
                }
            }
        }))

        const result = UnitConversionService.convertQuantity({
            quantity: 2,
            fromUnit: 'pack',
            toUnit: 'piece'
        })

        expect(result).toBeCloseTo(24, 6)
    })

    test('supports explicit ingredient-specific conversion across dimensions', () => {
        const ingredientId = 'ingredient-123'
        jest.spyOn(fs, 'existsSync').mockReturnValue(true)
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
            inventory: {
                unitConversionsByIngredient: {
                    [ingredientId]: {
                        'box->kg': 5
                    }
                }
            }
        }))

        const result = UnitConversionService.convertQuantity({
            quantity: 3,
            fromUnit: 'box',
            toUnit: 'kg',
            ingredientMenuId: ingredientId
        })

        expect(result).toBeCloseTo(15, 6)
    })
})
