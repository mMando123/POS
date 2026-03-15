const { FiscalYear, FiscalPeriod, sequelize } = require('../models');
const { Op } = require('sequelize');

class FiscalService {
    /**
     * Asserts that a given date falls within an open fiscal period for the company.
     * Enforces the "No posting in a closed period" rule.
     */
    static async assertOpenPeriod(dateStr, companyId, transaction = null) {
        // 1. Check Fiscal Year
        const year = await FiscalYear.findOne({
            where: {
                company_id: companyId,
                start_date: { [Op.lte]: dateStr },
                end_date: { [Op.gte]: dateStr }
            },
            transaction
        });

        if (!year) {
            throw new Error(`No Fiscal Year found for date ${dateStr} in company ${companyId}`);
        }
        if (year.is_closed) {
            throw new Error(`Fiscal Year ${year.year_name} is closed.`);
        }

        // 2. Check Fiscal Period
        const period = await FiscalPeriod.findOne({
            where: {
                company_id: companyId,
                fiscal_year_id: year.id,
                start_date: { [Op.lte]: dateStr },
                end_date: { [Op.gte]: dateStr }
            },
            transaction
        });

        if (!period) {
            throw new Error(`No Fiscal Period found within year ${year.year_name} for date ${dateStr}`);
        }
        if (period.is_closed) {
            throw new Error(`Fiscal Period ${period.period_name} is closed.`);
        }

        return { fiscalYear: year, fiscalPeriod: period };
    }
}

module.exports = FiscalService;
