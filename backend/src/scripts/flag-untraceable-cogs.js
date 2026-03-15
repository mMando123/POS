#!/usr/bin/env node
/**
 * Mark historical COGS entries that lack stock OUT traceability.
 * This does not change amounts; it adds disclosure metadata in notes.
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize, JournalEntry } = require('../models')
const { QueryTypes } = require('sequelize')

async function run() {
    await sequelize.authenticate()

    const rows = await sequelize.query(
        `
        SELECT je.id, je.notes, je.source_id
        FROM gl_journal_entries je
        WHERE je.status='posted'
          AND je.source_type='order_cogs'
          AND NOT EXISTS (
              SELECT 1
              FROM stock_movements sm
              WHERE sm.source_type='order'
                AND BINARY sm.source_id = BINARY je.source_id
          )
        `,
        { type: QueryTypes.SELECT }
    )

    let updated = 0
    for (const row of rows) {
        let meta = {}
        if (row.notes) {
            try {
                meta = typeof row.notes === 'string' ? JSON.parse(row.notes) : row.notes
            } catch (_) {
                meta = { legacy_notes: row.notes }
            }
        }

        meta.cogs_estimated = true
        meta.traceability_status = 'missing_stock_out_movement'
        meta.traceability_flagged_at = new Date().toISOString()
        meta.traceability_scope = 'historical'

        await JournalEntry.update(
            { notes: JSON.stringify(meta) },
            { where: { id: row.id } }
        )
        updated++
    }

    console.log(`Flagged untraceable COGS entries: ${updated}`)
}

if (require.main === module) {
    run()
        .then(async () => {
            try { await sequelize.close() } catch (_) {}
            process.exit(0)
        })
        .catch(async (err) => {
            console.error('Flag script failed:', err.message)
            try { await sequelize.close() } catch (_) {}
            process.exit(1)
        })
}

module.exports = { run }
