const { Account, JournalLine, sequelize } = require('../models');

class AccountService {

    /**
     * Create a new Account in the Chart of Accounts.
     * Enforces ERPNext rules: Parent inheritance and code uniqueness.
     */
    static async createAccount(payload, companyId, transaction = null) {
        let parentAccount = null;

        // Rule 2: Child inherits root_type from parent automatically
        if (payload.parent_id) {
            parentAccount = await Account.findOne({
                where: { id: payload.parent_id, company_id: companyId },
                transaction
            });

            if (!parentAccount) {
                throw new Error('Parent account not found in this company.');
            }
            if (!parentAccount.is_group) {
                throw new Error('Parent account must be a group account (is_group=true).');
            }
            // Auto inherit
            payload.root_type = parentAccount.root_type;
            payload.normal_balance = parentAccount.normal_balance;
        } else {
            // Must provide root_type and normal_balance if it's a root account
            if (!payload.root_type || !payload.normal_balance) {
                throw new Error('root_type and normal_balance are required for root accounts.');
            }
        }

        // Rule 3: Code must be unique within company
        const existingCode = await Account.findOne({
            where: { code: payload.code, company_id: companyId },
            transaction
        });
        if (existingCode) {
            throw new Error(`Account code ${payload.code} already exists for this company.`);
        }

        payload.company_id = companyId;

        return Account.create(payload, { transaction });
    }

    /**
     * Check if an account has journal entries (transactions)
     */
    static async hasTransactions(accountId, transaction = null) {
        const count = await JournalLine.count({
            where: { account_id: accountId },
            transaction
        });
        return count > 0;
    }

    /**
     * Update account. Enforces rules regarding root_type modification.
     */
    static async updateAccount(accountId, companyId, payload, transaction = null) {
        const account = await Account.findOne({
            where: { id: accountId, company_id: companyId },
            transaction
        });

        if (!account) throw new Error('Account not found');

        // Rule 5: Cannot change root_type after transactions exist
        if (payload.root_type && payload.root_type !== account.root_type) {
            const hasTx = await this.hasTransactions(accountId, transaction);
            if (hasTx) {
                throw new Error('Cannot change root_type of an account with existing transactions.');
            }
        }

        await account.update(payload, { transaction });
        return account;
    }

    /**
     * Safe delete account.
     * Rule 4: Disables instead of deleting if transactions exist.
     */
    static async deleteAccount(accountId, companyId, transaction = null) {
        const account = await Account.findOne({
            where: { id: accountId, company_id: companyId },
            transaction
        });

        if (!account) throw new Error('Account not found');

        const hasTx = await this.hasTransactions(accountId, transaction);
        if (hasTx) {
            // Disable instead
            await account.update({ is_active: false }, { transaction });
            return { message: 'Account deactivated because it has transactions', deleted: false };
        } else {
            // Safe to delete literally
            await account.destroy({ transaction });
            return { message: 'Account deleted permanently', deleted: true };
        }
    }
}

module.exports = AccountService;
