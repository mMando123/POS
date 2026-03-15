const { JournalEntry, JournalLine, Account, CostCenter, Sequence, sequelize } = require('../models');
const FiscalService = require('./fiscalService');
const AuditService = require('./auditService');

/**
 * Convert a monetary value to integer (halalas/cents) to avoid float precision issues.
 * DECIMAL(15,2) from MySQL returns as string, so we parse and multiply.
 */
const toHalalas = (val) => Math.round(parseFloat(val || 0) * 100);
const fromHalalas = (val) => parseFloat((val / 100).toFixed(2));

class JournalService {

    /**
     * Generate next sequential entry number (gap-free).
     * Uses row-level locking to prevent race conditions.
     */
    static async _getNextEntryNumber(companyId, prefix, fiscalYearName, transaction) {
        const yearKey = fiscalYearName.substring(0, 4);

        // Find or create the sequence row with lock
        let seq = await Sequence.findOne({
            where: { company_id: companyId, prefix, fiscal_year: yearKey },
            lock: true,
            transaction
        });

        if (!seq) {
            seq = await Sequence.create({
                company_id: companyId,
                prefix,
                fiscal_year: yearKey,
                current_value: 0
            }, { transaction });
        }

        const nextVal = seq.current_value + 1;
        await seq.update({ current_value: nextVal }, { transaction });

        return `${prefix}-${yearKey}-${nextVal.toString().padStart(5, '0')}`;
    }

    /**
     * Create a double-entry journal with ALL critical validations.
     */
    static async createJournalEntry(payload, companyId, { userId = null, transaction = null } = {}) {
        const _txn = transaction || await sequelize.transaction();

        try {
            // 1. Period validation
            const { fiscalYear } = await FiscalService.assertOpenPeriod(payload.entry_date, companyId, _txn);

            // 2. Must have at least 2 lines
            if (!payload.lines || payload.lines.length < 2) {
                throw new Error('Journal Entry requires at least 2 lines for double-entry bookkeeping.');
            }

            // 3. Batch-load accounts and cost centers
            const accountIds = [...new Set(payload.lines.map(l => l.account_id))];
            const costCenterIds = [...new Set(payload.lines.map(l => l.cost_center_id).filter(Boolean))];

            const accounts = await Account.findAll({
                where: { id: accountIds, company_id: companyId },
                transaction: _txn
            });

            if (accounts.length !== accountIds.length) {
                throw new Error('One or more accounts do not exist in this company.');
            }

            const accountMap = new Map(accounts.map(a => [a.id, a]));

            let costCenterMap = new Map();
            if (costCenterIds.length > 0) {
                const costCenters = await CostCenter.findAll({
                    where: { id: costCenterIds, company_id: companyId },
                    transaction: _txn
                });
                costCenterMap = new Map(costCenters.map(cc => [cc.id, cc]));
            }

            // 4. Validate every line
            let totalDebitHalalas = 0;
            let totalCreditHalalas = 0;

            for (const line of payload.lines) {
                const account = accountMap.get(line.account_id);

                // CRITICAL FIX: Check is_group
                if (account.is_group) {
                    throw new Error(`Account ${account.code} - ${account.name} is a group account and cannot accept journal entries.`);
                }

                // CRITICAL FIX: Check is_active
                if (!account.is_active) {
                    throw new Error(`Account ${account.code} - ${account.name} is deactivated and cannot accept journal entries.`);
                }

                // CostCenter validation
                if (line.cost_center_id) {
                    const cc = costCenterMap.get(line.cost_center_id);
                    if (!cc) throw new Error(`Cost center ${line.cost_center_id} not found in company.`);
                    if (cc.is_group) throw new Error(`Cost center ${cc.name} is a group and cannot accept entries.`);
                    if (!cc.is_active) throw new Error(`Cost center ${cc.name} is deactivated.`);
                }

                // CRITICAL FIX: Integer math for precision
                const debitH = toHalalas(line.debit);
                const creditH = toHalalas(line.credit);

                if (debitH < 0 || creditH < 0) throw new Error('Debit and Credit amounts must be non-negative.');
                if (debitH > 0 && creditH > 0) throw new Error('A line cannot have both a debit and credit value.');
                if (debitH === 0 && creditH === 0) throw new Error('A line must have either a debit or credit value.');

                totalDebitHalalas += debitH;
                totalCreditHalalas += creditH;
            }

            // CRITICAL FIX: Integer comparison (no float issues ever)
            if (totalDebitHalalas !== totalCreditHalalas) {
                throw new Error(`Journal Entry is unbalanced. Total Debit: ${fromHalalas(totalDebitHalalas)}, Total Credit: ${fromHalalas(totalCreditHalalas)}`);
            }

            const totalDebit = fromHalalas(totalDebitHalalas);
            const totalCredit = fromHalalas(totalCreditHalalas);

            // 5. CRITICAL FIX: Sequential entry number (no more Math.random!)
            const entryNumber = await this._getNextEntryNumber(companyId, 'JV', fiscalYear.year_name, _txn);

            // 6. Create the entry
            const entry = await JournalEntry.create({
                company_id: companyId,
                fiscal_year_id: fiscalYear.id,
                entry_number: entryNumber,
                entry_date: payload.entry_date,
                reference: payload.reference,
                description: payload.description,
                status: payload.status || 'draft',
                total_debit: totalDebit,
                total_credit: totalCredit,
                created_by: userId,
                posted_by: payload.status === 'posted' ? userId : null,
                posted_at: payload.status === 'posted' ? new Date() : null
            }, { transaction: _txn });

            // 7. Create all lines
            const lineRecords = payload.lines.map(line => ({
                journal_entry_id: entry.id,
                account_id: line.account_id,
                debit: fromHalalas(toHalalas(line.debit)),
                credit: fromHalalas(toHalalas(line.credit)),
                cost_center_id: line.cost_center_id || null,
                party_type: line.party_type || null,
                party_id: line.party_id || null,
                description: line.description || null
            }));

            await JournalLine.bulkCreate(lineRecords, { transaction: _txn });

            // 8. CRITICAL FIX: Audit Log
            await AuditService.log({
                companyId,
                entityType: 'JournalEntry',
                entityId: entry.id,
                action: 'create',
                userId,
                newValues: { entry_number: entryNumber, total_debit: totalDebit, status: entry.status },
                description: `Created journal entry ${entryNumber}`
            }, _txn);

            if (!transaction) await _txn.commit();

            return JournalEntry.findByPk(entry.id, {
                include: { model: JournalLine, as: 'lines' },
                transaction: transaction || null
            });

        } catch (error) {
            if (!transaction && _txn) await _txn.rollback();
            throw error;
        }
    }

    /**
     * Post a draft entry.
     */
    static async postEntry(entryId, companyId, { userId = null, transaction = null } = {}) {
        const _txn = transaction || await sequelize.transaction();
        try {
            const entry = await JournalEntry.findOne({
                where: { id: entryId, company_id: companyId },
                transaction: _txn
            });

            if (!entry) throw new Error('Entry not found.');
            if (entry.status === 'posted') throw new Error('Entry is already posted.');
            if (entry.status === 'cancelled') throw new Error('Cannot post a cancelled entry.');

            await FiscalService.assertOpenPeriod(entry.entry_date, companyId, _txn);

            const oldStatus = entry.status;
            await entry.update({
                status: 'posted',
                posted_by: userId,
                posted_at: new Date()
            }, { transaction: _txn });

            await AuditService.log({
                companyId,
                entityType: 'JournalEntry',
                entityId: entry.id,
                action: 'post',
                userId,
                oldValues: { status: oldStatus },
                newValues: { status: 'posted' },
                description: `Posted journal entry ${entry.entry_number}`
            }, _txn);

            if (!transaction) await _txn.commit();
            return entry;
        } catch (err) {
            if (!transaction) await _txn.rollback();
            throw err;
        }
    }

    /**
     * Cancel a posted entry by creating a reversal entry.
     */
    static async cancelEntry(entryId, companyId, { userId = null, transaction = null } = {}) {
        const _txn = transaction || await sequelize.transaction();
        try {
            const entry = await JournalEntry.findOne({
                where: { id: entryId, company_id: companyId },
                include: { model: JournalLine, as: 'lines' },
                transaction: _txn
            });

            if (!entry) throw new Error('Entry not found.');
            if (entry.status !== 'posted') throw new Error('Only posted entries can be cancelled (reversed).');

            await FiscalService.assertOpenPeriod(entry.entry_date, companyId, _txn);

            // Create reversal lines (swap debit/credit)
            const reversedLines = entry.lines.map(l => ({
                account_id: l.account_id,
                debit: parseFloat(l.credit),
                credit: parseFloat(l.debit),
                cost_center_id: l.cost_center_id,
                party_type: l.party_type,
                party_id: l.party_id,
                description: `Reversal of: ${l.description || ''}`
            }));

            // Create the reversing entry
            const reversalEntry = await this.createJournalEntry({
                entry_date: entry.entry_date,
                reference: `REV-${entry.entry_number}`,
                description: `Reversal of ${entry.entry_number}`,
                status: 'posted',
                lines: reversedLines
            }, companyId, { userId, transaction: _txn });

            // Mark original as cancelled
            await entry.update({
                status: 'cancelled',
                cancelled_by: userId,
                cancelled_at: new Date()
            }, { transaction: _txn });

            await AuditService.log({
                companyId,
                entityType: 'JournalEntry',
                entityId: entry.id,
                action: 'cancel',
                userId,
                oldValues: { status: 'posted' },
                newValues: { status: 'cancelled', reversal_entry: reversalEntry.entry_number },
                description: `Cancelled ${entry.entry_number}, reversal: ${reversalEntry.entry_number}`
            }, _txn);

            if (!transaction) await _txn.commit();
            return { cancelledEntry: entry, reversalEntry };
        } catch (err) {
            if (!transaction) await _txn.rollback();
            throw err;
        }
    }
}

module.exports = JournalService;
