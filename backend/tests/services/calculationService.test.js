const CalculationService = require('../../src/services/calculationService');

describe('CalculationService Tests', () => {

    describe('calculateTax', () => {
        test('should calculate 15% tax correctly for 100', () => {
            const result = CalculationService.calculateTax(100, 15);
            expect(result).toBe(15);
        });

        test('should handle floating point precision', () => {
            const result = CalculationService.calculateTax(33.33, 15);
            // 33.33 * 0.15 = 4.9995 -> rounds to 5.00
            expect(result).toBe(5.00);
        });

        test('should return 0 for 0 amount', () => {
            expect(CalculationService.calculateTax(0, 15)).toBe(0);
        });

        test('should handle missing rate (defaults to 0)', () => {
            expect(CalculationService.calculateTax(100)).toBe(0);
        });
    });

    describe('calculateTotal', () => {
        test('should add tax to amount', () => {
            const result = CalculationService.calculateTotal(100, 15);
            expect(result).toBe(115);
        });
    });

    describe('isPositive', () => {
        test('should return true for positive number', () => {
            expect(CalculationService.isPositive(10)).toBe(true);
        });

        test('should return false for negative number', () => {
            expect(CalculationService.isPositive(-5)).toBe(false);
        });

        test('should return false for 0', () => {
            expect(CalculationService.isPositive(0)).toBe(false);
        });

        test('should return false for string', () => {
            expect(CalculationService.isPositive('10')).toBe(false);
        });
    });
});
