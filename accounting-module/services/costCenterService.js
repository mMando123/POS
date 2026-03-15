const { CostCenter, JournalLine, sequelize } = require('../models');

class CostCenterService {

    /**
     * Create Cost Center
     */
    static async createCostCenter(payload, companyId, transaction = null) {
        if (payload.parent_id) {
            const parent = await CostCenter.findOne({
                where: { id: payload.parent_id, company_id: companyId },
                transaction
            });

            if (!parent) throw new Error('Parent cost center not found.');
            if (!parent.is_group) throw new Error('Parent cost center must be a group.');
        }

        const existingCode = await CostCenter.findOne({
            where: { name: payload.name, company_id: companyId },
            transaction
        });

        if (existingCode) throw new Error(`Cost center name ${payload.name} already exists.`);

        payload.company_id = companyId;
        return CostCenter.create(payload, { transaction });
    }

    /**
     * Check usage
     */
    static async hasTransactions(costCenterId, transaction = null) {
        const count = await JournalLine.count({
            where: { cost_center_id: costCenterId },
            transaction
        });
        return count > 0;
    }

    /**
     * Update 
     */
    static async updateCostCenter(id, companyId, payload, transaction = null) {
        const cc = await CostCenter.findOne({
            where: { id: id, company_id: companyId },
            transaction
        });

        if (!cc) throw new Error('Cost Center not found.');

        await cc.update(payload, { transaction });
        return cc;
    }

    /**
     * Delete safely
     */
    static async deleteCostCenter(id, companyId, transaction = null) {
        const cc = await CostCenter.findOne({
            where: { id: id, company_id: companyId },
            transaction
        });

        if (!cc) throw new Error('Cost Center not found.');

        const hasTx = await this.hasTransactions(id, transaction);
        if (hasTx) {
            await cc.update({ is_active: false }, { transaction });
            return { message: 'Deactivated because it has transactions', deleted: false };
        } else {
            await cc.destroy({ transaction });
            return { message: 'Deleted permanently', deleted: true };
        }
    }
}

module.exports = CostCenterService;
