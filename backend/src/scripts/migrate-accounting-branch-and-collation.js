#!/usr/bin/env node
/**
 * Accounting structural migration:
 * 1) Add branch_id columns to purchasing/AP source tables (if missing).
 * 2) Backfill branch_id in source tables.
 * 3) Normalize gl_journal_entries.source_id collation to utf8mb4_bin.
 * 4) Backfill branch_id on historical GL entries from source documents.
 * 5) Standardize source_type transfer -> stock_transfer.
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { sequelize } = require('../models')
const { QueryTypes } = require('sequelize')

async function columnExists(table, column) {
    const rows = await sequelize.query(
        `
        SELECT COUNT(*) AS cnt
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = :table
          AND column_name = :column
        `,
        {
            replacements: { table, column },
            type: QueryTypes.SELECT
        }
    )
    return Number(rows[0]?.cnt || 0) > 0
}

async function indexExists(table, indexName) {
    const rows = await sequelize.query(
        `
        SELECT COUNT(*) AS cnt
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = :table
          AND index_name = :indexName
        `,
        {
            replacements: { table, indexName },
            type: QueryTypes.SELECT
        }
    )
    return Number(rows[0]?.cnt || 0) > 0
}

async function ensureBranchColumn(table, afterColumn, indexName) {
    const hasColumn = await columnExists(table, 'branch_id')
    if (!hasColumn) {
        await sequelize.query(
            `ALTER TABLE ${table} ADD COLUMN branch_id CHAR(36) NULL AFTER ${afterColumn}`
        )
        console.log(`Added ${table}.branch_id`)
    } else {
        console.log(`${table}.branch_id already exists`)
    }

    const hasIndex = await indexExists(table, indexName)
    if (!hasIndex) {
        await sequelize.query(`CREATE INDEX ${indexName} ON ${table} (branch_id)`)
        console.log(`Added index ${indexName}`)
    } else {
        console.log(`Index ${indexName} already exists`)
    }
}

async function printBranchNullStats(label) {
    const rows = await sequelize.query(
        `
        SELECT
            source_type,
            SUM(CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END) AS null_branch,
            COUNT(*) AS total
        FROM gl_journal_entries
        WHERE status='posted'
          AND source_type IN ('order','order_cogs','purchase_receipt','supplier_payment','purchase_return','stock_adjustment','stock_transfer','transfer')
        GROUP BY source_type
        ORDER BY source_type
        `,
        { type: QueryTypes.SELECT }
    )
    console.log(`\n${label}`)
    for (const row of rows) {
        console.log(`- ${row.source_type}: null=${row.null_branch}, total=${row.total}`)
    }
}

async function run() {
    await sequelize.authenticate()
    console.log('Connected to DB')

    await printBranchNullStats('Before migration')

    // 1) Ensure columns + indexes
    await ensureBranchColumn('purchase_receipts', 'warehouse_id', 'purchase_branch_idx')
    await ensureBranchColumn('purchase_returns', 'warehouse_id', 'return_branch_idx')
    await ensureBranchColumn('supplier_payments', 'supplier_id', 'supplier_payment_branch_idx')

    // 2) Backfill branch_id in source docs
    const [, u1] = await sequelize.query(
        `
        UPDATE purchase_receipts pr
        JOIN warehouses w ON w.id = pr.warehouse_id
        SET pr.branch_id = w.branch_id
        WHERE pr.branch_id IS NULL
        `
    )
    console.log(`Backfilled purchase_receipts.branch_id: ${u1.affectedRows || 0}`)

    const [, u2] = await sequelize.query(
        `
        UPDATE purchase_returns pr
        JOIN warehouses w ON w.id = pr.warehouse_id
        SET pr.branch_id = w.branch_id
        WHERE pr.branch_id IS NULL
        `
    )
    console.log(`Backfilled purchase_returns.branch_id: ${u2.affectedRows || 0}`)

    const [, u3] = await sequelize.query(
        `
        UPDATE supplier_payments sp
        JOIN purchase_orders po ON po.id = sp.purchase_order_id
        JOIN warehouses w ON w.id = po.warehouse_id
        SET sp.branch_id = w.branch_id
        WHERE sp.branch_id IS NULL
          AND sp.purchase_order_id IS NOT NULL
        `
    )
    console.log(`Backfilled supplier_payments.branch_id via PO: ${u3.affectedRows || 0}`)

    const [, u4] = await sequelize.query(
        `
        UPDATE supplier_payments sp
        JOIN (
            SELECT supplier_id, MAX(branch_id) AS branch_id
            FROM purchase_receipts
            WHERE branch_id IS NOT NULL
            GROUP BY supplier_id
        ) x ON x.supplier_id = sp.supplier_id
        SET sp.branch_id = x.branch_id
        WHERE sp.branch_id IS NULL
        `
    )
    console.log(`Backfilled supplier_payments.branch_id via supplier receipts: ${u4.affectedRows || 0}`)

    // 3) Normalize collation for source_id to match UUID char columns
    await sequelize.query(
        `
        ALTER TABLE gl_journal_entries
        MODIFY source_id VARCHAR(100)
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_bin
        NULL
        `
    )
    console.log('Normalized gl_journal_entries.source_id collation -> utf8mb4_bin')

    // 4) Standardize transfer source naming
    const [, u5] = await sequelize.query(
        `
        UPDATE gl_journal_entries
        SET source_type = 'stock_transfer'
        WHERE source_type = 'transfer'
        `
    )
    console.log(`Standardized source_type transfer->stock_transfer: ${u5.affectedRows || 0}`)

    // 5) Backfill branch_id in GL from source docs
    const [, g1] = await sequelize.query(
        `
        UPDATE gl_journal_entries je
        JOIN purchase_receipts pr ON BINARY pr.id = BINARY je.source_id
        SET je.branch_id = pr.branch_id
        WHERE je.status='posted'
          AND je.source_type='purchase_receipt'
          AND je.branch_id IS NULL
          AND pr.branch_id IS NOT NULL
        `
    )
    console.log(`Backfilled JE branch from purchase_receipt: ${g1.affectedRows || 0}`)

    const [, g2] = await sequelize.query(
        `
        UPDATE gl_journal_entries je
        JOIN purchase_returns pr ON BINARY pr.id = BINARY je.source_id
        SET je.branch_id = pr.branch_id
        WHERE je.status='posted'
          AND je.source_type='purchase_return'
          AND je.branch_id IS NULL
          AND pr.branch_id IS NOT NULL
        `
    )
    console.log(`Backfilled JE branch from purchase_return: ${g2.affectedRows || 0}`)

    const [, g3] = await sequelize.query(
        `
        UPDATE gl_journal_entries je
        JOIN supplier_payments sp ON BINARY sp.id = BINARY je.source_id
        SET je.branch_id = sp.branch_id
        WHERE je.status='posted'
          AND je.source_type='supplier_payment'
          AND je.branch_id IS NULL
          AND sp.branch_id IS NOT NULL
        `
    )
    console.log(`Backfilled JE branch from supplier_payment: ${g3.affectedRows || 0}`)

    const [, g4] = await sequelize.query(
        `
        UPDATE gl_journal_entries je
        JOIN stock_transfers st ON BINARY st.id = BINARY je.source_id
        JOIN warehouses wf ON wf.id = st.from_warehouse_id
        SET je.branch_id = wf.branch_id
        WHERE je.status='posted'
          AND je.source_type='stock_transfer'
          AND je.branch_id IS NULL
          AND wf.branch_id IS NOT NULL
        `
    )
    console.log(`Backfilled JE branch from stock_transfer: ${g4.affectedRows || 0}`)

    await printBranchNullStats('After migration')
}

if (require.main === module) {
    run()
        .then(async () => {
            try { await sequelize.close() } catch (_) {}
            process.exit(0)
        })
        .catch(async (err) => {
            console.error('Migration failed:', err.message)
            try { await sequelize.close() } catch (_) {}
            process.exit(1)
        })
}

module.exports = { run }
