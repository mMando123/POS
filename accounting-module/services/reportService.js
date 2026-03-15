const { Account, JournalEntry, JournalLine, sequelize } = require('../models');
const { Op } = require('sequelize');

class ReportService {

    /**
     * 1. General Ledger (كشف حساب)
     * Returns detailed transactions for a specific ledger account within a date range.
     */
    static async getGeneralLedger(companyId, accountId, startDate, endDate) {
        const lines = await JournalLine.findAll({
            where: { account_id: accountId },
            include: [{
                model: JournalEntry,
                where: {
                    company_id: companyId,
                    status: 'posted',
                    entry_date: {
                        [Op.between]: [startDate, endDate]
                    }
                },
                attributes: ['entry_number', 'entry_date', 'reference']
            }],
            order: [[JournalEntry, 'entry_date', 'ASC']]
        });

        let balance = 0;
        const account = await Account.findByPk(accountId);
        if (!account) throw new Error('Account not found');

        const isDebitNormal = account.normal_balance === 'debit';

        const formattedLines = lines.map(line => {
            const deb = parseFloat(line.debit);
            const cred = parseFloat(line.credit);

            // Calculate running balance based on normal balance behavior
            if (isDebitNormal) {
                balance += (deb - cred);
            } else {
                balance += (cred - deb);
            }

            return {
                date: line.JournalEntry.entry_date,
                entry_number: line.JournalEntry.entry_number,
                reference: line.JournalEntry.reference,
                description: line.description,
                debit: deb,
                credit: cred,
                running_balance: parseFloat(balance.toFixed(2))
            };
        });

        return {
            account: { code: account.code, name: account.name, normal_balance: account.normal_balance },
            period: { startDate, endDate },
            transactions: formattedLines,
            closing_balance: parseFloat(balance.toFixed(2))
        };
    }

    /**
     * Helper: Get aggregated balances for all accounts
     */
    static async _getAggregatedAccountBalances(companyId, startDate, endDate) {
        // Find all posted journal lines
        const results = await JournalLine.findAll({
            attributes: [
                'account_id',
                [sequelize.fn('SUM', sequelize.col('debit')), 'total_debit'],
                [sequelize.fn('SUM', sequelize.col('credit')), 'total_credit']
            ],
            include: [{
                model: JournalEntry,
                attributes: [],
                where: {
                    company_id: companyId,
                    status: 'posted',
                    ...(startDate && endDate ? { entry_date: { [Op.between]: [startDate, endDate] } } : {})
                }
            }],
            group: ['account_id']
        });

        const balances = new Map();
        results.forEach(r => {
            balances.set(r.account_id, {
                debit: parseFloat(r.getDataValue('total_debit') || 0),
                credit: parseFloat(r.getDataValue('total_credit') || 0)
            });
        });

        // Get all accounts
        const allAccounts = await Account.findAll({
            where: { company_id: companyId },
            order: [['code', 'ASC']]
        });

        return { allAccounts, balances };
    }

    /**
     * 2. Trial Balance (ميزان المراجعة)
     */
    static async getTrialBalance(companyId, startDate, endDate) {
        const { allAccounts, balances } = await this._getAggregatedAccountBalances(companyId, startDate, endDate);

        let grandTotalDebit = 0;
        let grandTotalCredit = 0;

        const report = allAccounts
            .filter(acc => !acc.is_group) // Trial balance typically shows only ledgers
            .map(acc => {
                const bals = balances.get(acc.id) || { debit: 0, credit: 0 };
                let netDebit = 0;
                let netCredit = 0;

                // Netting off logic
                if (bals.debit > bals.credit) {
                    netDebit = bals.debit - bals.credit;
                } else if (bals.credit > bals.debit) {
                    netCredit = bals.credit - bals.debit;
                }

                grandTotalDebit += netDebit;
                grandTotalCredit += netCredit;

                return {
                    code: acc.code,
                    name: acc.name,
                    root_type: acc.root_type,
                    debit: parseFloat(netDebit.toFixed(2)),
                    credit: parseFloat(netCredit.toFixed(2))
                };
            })
            .filter(row => row.debit > 0 || row.credit > 0); // Only entries with balance

        // Return precision corrected totals
        return {
            period: { startDate, endDate },
            rows: report,
            totals: {
                total_debit: parseFloat(grandTotalDebit.toFixed(2)),
                total_credit: parseFloat(grandTotalCredit.toFixed(2)),
                is_balanced: parseFloat(grandTotalDebit.toFixed(2)) === parseFloat(grandTotalCredit.toFixed(2))
            }
        };
    }

    /**
     * 3. Profit & Loss Statement (Income & Expenses)
     */
    static async getProfitAndLoss(companyId, startDate, endDate) {
        const { allAccounts, balances } = await this._getAggregatedAccountBalances(companyId, startDate, endDate);

        let totalIncome = 0;
        let totalExpense = 0;

        const incomeAccounts = [];
        const expenseAccounts = [];

        allAccounts.filter(acc => !acc.is_group).forEach(acc => {
            const bals = balances.get(acc.id) || { debit: 0, credit: 0 };

            // Income normal balance is credit, Expense normal balance is debit
            if (acc.root_type === 'Income') {
                const netBalance = bals.credit - bals.debit; // Positive means correct income behavior
                if (netBalance !== 0) {
                    incomeAccounts.push({ name: acc.name, balance: parseFloat(netBalance.toFixed(2)) });
                    totalIncome += netBalance;
                }
            } else if (acc.root_type === 'Expense') {
                const netBalance = bals.debit - bals.credit; // Positive means correct expense behavior
                if (netBalance !== 0) {
                    expenseAccounts.push({ name: acc.name, balance: parseFloat(netBalance.toFixed(2)) });
                    totalExpense += netBalance;
                }
            }
        });

        const netProfit = totalIncome - totalExpense;

        return {
            period: { startDate, endDate },
            income: { items: incomeAccounts, total: parseFloat(totalIncome.toFixed(2)) },
            expense: { items: expenseAccounts, total: parseFloat(totalExpense.toFixed(2)) },
            net_profit: parseFloat(netProfit.toFixed(2))
        };
    }

    /**
     * 4. Balance Sheet (Assets = Liabilities + Equity)
     */
    static async getBalanceSheet(companyId, asOfDate) {
        // Balance sheet is cumulative from beginning of time to 'asOfDate'
        const { allAccounts, balances } = await this._getAggregatedAccountBalances(companyId, null, asOfDate);

        let totalAssets = 0;
        let totalLiabilities = 0;
        let totalEquityBase = 0;

        const assets = [];
        const liabilities = [];
        const equity = [];

        // Profit/Loss calculation to roll into Retained Earnings
        let totalIncome = 0;
        let totalExpense = 0;

        allAccounts.filter(acc => !acc.is_group).forEach(acc => {
            const bals = balances.get(acc.id) || { debit: 0, credit: 0 };

            if (acc.root_type === 'Asset') {
                const net = bals.debit - bals.credit;
                if (net !== 0) {
                    assets.push({ name: acc.name, balance: parseFloat(net.toFixed(2)) });
                    totalAssets += net;
                }
            } else if (acc.root_type === 'Liability') {
                const net = bals.credit - bals.debit;
                if (net !== 0) {
                    liabilities.push({ name: acc.name, balance: parseFloat(net.toFixed(2)) });
                    totalLiabilities += net;
                }
            } else if (acc.root_type === 'Equity') {
                const net = bals.credit - bals.debit;
                if (net !== 0) {
                    equity.push({ name: acc.name, balance: parseFloat(net.toFixed(2)) });
                    totalEquityBase += net;
                }
            } else if (acc.root_type === 'Income') {
                totalIncome += (bals.credit - bals.debit);
            } else if (acc.root_type === 'Expense') {
                totalExpense += (bals.debit - bals.credit);
            }
        });

        // Add net profit to equity as Retained Earnings for current period
        const netProfit = totalIncome - totalExpense;
        const totalEquity = totalEquityBase + netProfit;

        return {
            as_of: asOfDate,
            assets: { items: assets, total: parseFloat(totalAssets.toFixed(2)) },
            liabilities: { items: liabilities, total: parseFloat(totalLiabilities.toFixed(2)) },
            equity: {
                items: [
                    ...equity,
                    { name: 'Current Year Retained Earnings', balance: parseFloat(netProfit.toFixed(2)) }
                ],
                total: parseFloat(totalEquity.toFixed(2))
            },
            total_liabilities_and_equity: parseFloat((totalLiabilities + totalEquity).toFixed(2)),
            is_balanced: parseFloat(totalAssets.toFixed(2)) === parseFloat((totalLiabilities + totalEquity).toFixed(2))
        };
    }
}

module.exports = ReportService;
