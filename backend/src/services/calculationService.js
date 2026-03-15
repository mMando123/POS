/**
 * Calculation Service
 * Centralized logic for financial calculations
 */

class CalculationService {
    /**
     * Calculate tax amount
     * @param {number} amount - Base amount
     * @param {number} taxRate - Tax rate percentage (e.g. 15 for 15%)
     * @returns {number} Tax amount rounded to 2 decimals
     */
    static calculateTax(amount, taxRate) {
        if (!amount || !taxRate) return 0;
        const tax = (amount * taxRate) / 100;
        return Math.round(tax * 100) / 100;
    }

    /**
     * Calculate total with tax
     * @param {number} amount - Base amount
     * @param {number} taxRate - Tax rate percentage
     * @returns {number} Total amount
     */
    static calculateTotal(amount, taxRate) {
        const tax = this.calculateTax(amount, taxRate);
        return Math.round((amount + tax) * 100) / 100;
    }

    /**
     * Validate positive number
     * @param {number} value 
     * @returns {boolean}
     */
    static isPositive(value) {
        return typeof value === 'number' && !isNaN(value) && value > 0;
    }
}

module.exports = CalculationService;
