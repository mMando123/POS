#!/usr/bin/env node
/**
 * Rebuild gl_accounts.current_balance from posted GL lines.
 * This restores cache integrity after legacy manual fixes or historical scripts.
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize, Account } = require('../models')
const { QueryTypes } = require('sequelize')

function round2(v) {
    return Math.round((parseFloat(v || 0) + Number.EPSILON) * 100) / 100
}

async function run() {
    await sequelize.authenticate()
    const t = await sequelize.transaction()

    try {
        const rows = await sequelize.query(
            `
            SELECT
                a.id,
                a.code,
                a.name_en,
                a.normal_balance,
                a.current_balance AS cached_balance,
                COALESCE(SUM(
                    CASE
                        WHEN a.normal_balance = 'debit'
                            THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
                        ELSE COALESCE(jl.credit_amount, 0) - COALESCE(jl.debit_amount, 0)
                    END
                ), 0) AS ledger_balance
            FROM gl_accounts a
            LEFT JOIN gl_journal_lines jl
                ON jl.account_id = a.id
            LEFT JOIN gl_journal_entries je
                ON je.id = jl.journal_entry_id
               AND je.status = 'posted'
            WHERE a.is_active = 1
            GROUP BY a.id, a.code, a.name_en, a.normal_balance, a.current_balance
            ORDER BY a.code
            `,
            { type: QueryTypes.SELECT, transaction: t }
        )

        let updated = 0
        for (const row of rows) {
            const cached = round2(row.cached_balance)
            const ledger = round2(row.ledger_balance)
            if (Math.abs(cached - ledger) > 0.01) {
                await Account.update(
                    { current_balance: ledger },
                    { where: { id: row.id }, transaction: t }
                )
                updated++
                console.log(`Updated ${row.code} (${row.name_en}): ${cached} -> ${ledger}`)
            }
        }

        await t.commit()
        console.log(`Rebuild complete. Updated accounts: ${updated}`)
    } catch (err) {
        await t.rollback()
        throw err
    }
}

if (require.main === module) {
    run()
        .then(async () => {
            try { await sequelize.close() } catch (_) {}
            process.exit(0)
        })
        .catch(async (err) => {
            console.error('Rebuild failed:', err.message)
            try { await sequelize.close() } catch (_) {}
            process.exit(1)
        })
}

module.exports = { run }
