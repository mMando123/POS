/**
 * Migration: add supplier_id to gl_journal_entries and backfill from legacy notes JSON.
 *
 * Why:
 * - M-01 required removing dependence on notes parsing for supplier AP balance.
 * - New entries now store supplier_id directly on journal header.
 *
 * Run:
 *   node src/scripts/migrate-journal-supplier-id.js
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })
const { sequelize, getDialect } = require('../config/database')

function extractSupplierId(notes) {
    if (!notes) return null
    if (typeof notes === 'object' && notes.supplier_id) return notes.supplier_id
    if (typeof notes !== 'string') return null

    try {
        const parsed = JSON.parse(notes)
        if (parsed && typeof parsed.supplier_id === 'string') return parsed.supplier_id
    } catch (_) {
        // Legacy rows may have non-JSON notes. Ignore safely.
    }
    return null
}

async function ensureColumnAndIndex(dialect) {
    if (dialect === 'mysql') {
        const [columns] = await sequelize.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'gl_journal_entries'
              AND COLUMN_NAME = 'supplier_id'
        `)

        if (columns.length === 0) {
            await sequelize.query(`
                ALTER TABLE gl_journal_entries
                ADD COLUMN supplier_id CHAR(36) NULL
            `)
            console.log('Added column gl_journal_entries.supplier_id')
        } else {
            console.log('Column gl_journal_entries.supplier_id already exists')
        }

        const [indexes] = await sequelize.query(`
            SELECT INDEX_NAME
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'gl_journal_entries'
              AND INDEX_NAME = 'gl_je_supplier_idx'
        `)

        if (indexes.length === 0) {
            await sequelize.query(`
                CREATE INDEX gl_je_supplier_idx
                ON gl_journal_entries(supplier_id)
            `)
            console.log('Added index gl_je_supplier_idx')
        } else {
            console.log('Index gl_je_supplier_idx already exists')
        }
        return
    }

    // SQLite fallback
    const tableInfo = await sequelize.query(
        `PRAGMA table_info(gl_journal_entries)`,
        { type: sequelize.QueryTypes.SELECT }
    )
    const hasSupplierId = tableInfo.some(c => c.name === 'supplier_id')

    if (!hasSupplierId) {
        await sequelize.query(`
            ALTER TABLE gl_journal_entries
            ADD COLUMN supplier_id TEXT
        `)
        console.log('Added column gl_journal_entries.supplier_id (sqlite)')
    } else {
        console.log('Column gl_journal_entries.supplier_id already exists (sqlite)')
    }

    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS gl_je_supplier_idx
        ON gl_journal_entries(supplier_id)
    `)
    console.log('Ensured index gl_je_supplier_idx (sqlite)')
}

async function backfillSupplierIds() {
    const rows = await sequelize.query(
        `
        SELECT id, notes
        FROM gl_journal_entries
        WHERE supplier_id IS NULL
          AND notes IS NOT NULL
        `,
        { type: sequelize.QueryTypes.SELECT }
    )

    let updated = 0
    let scanned = 0

    for (const row of rows) {
        scanned++
        const supplierId = extractSupplierId(row.notes)
        if (!supplierId) continue

        await sequelize.query(
            `
            UPDATE gl_journal_entries
            SET supplier_id = :supplierId
            WHERE id = :id
              AND supplier_id IS NULL
            `,
            {
                replacements: { supplierId, id: row.id }
            }
        )
        updated++
    }

    return { scanned, updated }
}

async function backfillSupplierIdsFromSource(dialect) {
    let updatedFromSource = 0

    if (dialect === 'mysql') {
        const [, u1] = await sequelize.query(`
            UPDATE gl_journal_entries je
            JOIN purchase_receipts pr ON pr.id = je.source_id
            SET je.supplier_id = pr.supplier_id
            WHERE je.status = 'posted'
              AND je.source_type = 'purchase_receipt'
              AND je.supplier_id IS NULL
              AND pr.supplier_id IS NOT NULL
        `)

        const [, u2] = await sequelize.query(`
            UPDATE gl_journal_entries je
            JOIN supplier_payments sp ON sp.id = je.source_id
            SET je.supplier_id = sp.supplier_id
            WHERE je.status = 'posted'
              AND je.source_type = 'supplier_payment'
              AND je.supplier_id IS NULL
              AND sp.supplier_id IS NOT NULL
        `)

        const [, u3] = await sequelize.query(`
            UPDATE gl_journal_entries je
            JOIN purchase_returns prt ON prt.id = je.source_id
            SET je.supplier_id = prt.supplier_id
            WHERE je.status = 'posted'
              AND je.source_type = 'purchase_return'
              AND je.supplier_id IS NULL
              AND prt.supplier_id IS NOT NULL
        `)

        updatedFromSource += Number(u1?.affectedRows || 0)
        updatedFromSource += Number(u2?.affectedRows || 0)
        updatedFromSource += Number(u3?.affectedRows || 0)
        return { updatedFromSource }
    }

    // SQLite fallback (correlated subqueries)
    const [, u1] = await sequelize.query(`
        UPDATE gl_journal_entries
        SET supplier_id = (
            SELECT pr.supplier_id
            FROM purchase_receipts pr
            WHERE pr.id = gl_journal_entries.source_id
        )
        WHERE status = 'posted'
          AND source_type = 'purchase_receipt'
          AND supplier_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM purchase_receipts pr
              WHERE pr.id = gl_journal_entries.source_id
                AND pr.supplier_id IS NOT NULL
          )
    `)

    const [, u2] = await sequelize.query(`
        UPDATE gl_journal_entries
        SET supplier_id = (
            SELECT sp.supplier_id
            FROM supplier_payments sp
            WHERE sp.id = gl_journal_entries.source_id
        )
        WHERE status = 'posted'
          AND source_type = 'supplier_payment'
          AND supplier_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM supplier_payments sp
              WHERE sp.id = gl_journal_entries.source_id
                AND sp.supplier_id IS NOT NULL
          )
    `)

    const [, u3] = await sequelize.query(`
        UPDATE gl_journal_entries
        SET supplier_id = (
            SELECT prt.supplier_id
            FROM purchase_returns prt
            WHERE prt.id = gl_journal_entries.source_id
        )
        WHERE status = 'posted'
          AND source_type = 'purchase_return'
          AND supplier_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM purchase_returns prt
              WHERE prt.id = gl_journal_entries.source_id
                AND prt.supplier_id IS NOT NULL
          )
    `)

    updatedFromSource += Number(u1?.changes || 0)
    updatedFromSource += Number(u2?.changes || 0)
    updatedFromSource += Number(u3?.changes || 0)
    return { updatedFromSource }
}

async function migrate() {
    const dialect = getDialect()
    console.log(`Running journal supplier_id migration (${dialect})...`)

    await sequelize.authenticate()
    await ensureColumnAndIndex(dialect)
    const result = await backfillSupplierIds()
    const sourceResult = await backfillSupplierIdsFromSource(dialect)

    console.log(`Backfill from notes complete: scanned=${result.scanned}, updated=${result.updated}`)
    console.log(`Backfill from source documents complete: updated=${sourceResult.updatedFromSource}`)
    console.log('Migration completed successfully.')
}

if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('Migration failed:', err.message)
            process.exit(1)
        })
}

module.exports = { migrate }
