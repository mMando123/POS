const { AccountDefault, PaymentMethod, ExpenseType, Warehouse, Account } = require('../models');

class AccountResolver {
    /**
     * Resolve a default key to Account ID.
     * Uses direct lookup.
     */
    static async resolveDefault(key, companyId) {
        const mapping = await AccountDefault.findOne({
            where: { key, company_id: companyId },
            include: { model: Account }
        });

        if (!mapping) {
            throw new Error(`Account Default Key '${key}' not found for company ${companyId}.`);
        }
        if (mapping.Account.is_group) {
            throw new Error(`Mapping Error: Key '${key}' resolves to Group Account (${mapping.Account.code}).`);
        }
        if (!mapping.Account.is_active) {
            throw new Error(`Mapping Error: Key '${key}' resolves to deactivated Account (${mapping.Account.code}).`);
        }

        return mapping.account_id;
    }

    /**
     * Resolve Payment Method to Account ID.
     * Fallback Strategy: PaymentMethod.account_id → default_cash_account → Error
     */
    static async resolvePaymentMethod(methodId, companyId) {
        if (methodId) {
            const method = await PaymentMethod.findOne({
                where: { id: methodId, company_id: companyId },
                include: { model: Account }
            });

            if (method) {
                if (method.Account.is_group) throw new Error('Payment method cannot map to a Group Account.');
                if (!method.Account.is_active) throw new Error('Payment method maps to a deactivated Account.');
                return method.account_id;
            }
        }

        // Fallback to default_cash_account
        try {
            return await this.resolveDefault('default_cash_account', companyId);
        } catch (fallbackErr) {
            throw new Error(`Payment method ${methodId || 'null'} not found and no default_cash_account configured.`);
        }
    }

    /**
     * Resolve Expense Type to Account ID.
     * Fallback Strategy: ExpenseType.account_id → Error
     */
    static async resolveExpenseType(typeId, companyId) {
        const expense = await ExpenseType.findOne({
            where: { id: typeId, company_id: companyId },
            include: { model: Account }
        });

        if (!expense) throw new Error(`Expense type ${typeId} not found.`);
        if (expense.Account.is_group) throw new Error('Expense type cannot map to a Group Account.');
        if (!expense.Account.is_active) throw new Error('Expense type maps to a deactivated Account.');

        return expense.account_id;
    }

    /**
     * Resolve Warehouse to Inventory Account ID.
     * Fallback Strategy: Warehouse.inventory_account_id → default_inventory_account → Error
     */
    static async resolveWarehouseInventory(warehouseId, companyId) {
        if (warehouseId) {
            const wh = await Warehouse.findOne({
                where: { id: warehouseId, company_id: companyId },
                include: { model: Account }
            });

            if (wh) {
                if (wh.Account.is_group) throw new Error('Warehouse inventory cannot map to a Group Account.');
                if (!wh.Account.is_active) throw new Error('Warehouse inventory maps to a deactivated Account.');
                return wh.inventory_account_id;
            }
        }

        // Fallback to default_inventory_account
        try {
            return await this.resolveDefault('default_inventory_account', companyId);
        } catch (fallbackErr) {
            throw new Error(`Warehouse ${warehouseId || 'null'} not found and no default_inventory_account configured.`);
        }
    }

    /**
     * Batch resolver: resolve multiple keys at once for a POS transaction.
     * Returns an object with all resolved account IDs.
     */
    static async resolveForPOSSale(companyId, { paymentMethodId = null, warehouseId = null } = {}) {
        const [cashOrBankAccount, incomeAccount, cogsAccount, inventoryAccount, taxOutputAccount] = await Promise.all([
            this.resolvePaymentMethod(paymentMethodId, companyId),
            this.resolveDefault('default_income_account', companyId),
            this.resolveDefault('default_cogs_account', companyId),
            this.resolveWarehouseInventory(warehouseId, companyId),
            this.resolveDefault('default_tax_output_account', companyId)
        ]);

        return {
            cashOrBankAccount,
            incomeAccount,
            cogsAccount,
            inventoryAccount,
            taxOutputAccount
        };
    }
}

module.exports = AccountResolver;
