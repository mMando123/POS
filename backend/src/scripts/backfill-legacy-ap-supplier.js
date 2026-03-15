/**
 * Backfill missing supplier_id for legacy AP journal entries.
 *
 * Scope:
 * - gl_journal_entries where source_type in ('purchase_receipt','supplier_payment','purchase_return')
 *   and supplier_id is null.
 *
 * Resolution order per entry:
 * 1) Source document supplier_id
 * 2) Related purchase_order.supplier_id (for receipts)
 * 3) supplier_id embedded in notes JSON
 * 4) Legacy fallback supplier (created if missing)
 *
 * Default mode: DRY RUN
 * Use --apply to persist changes.
 *
 * Usage:
 *   node src/scripts/backfill-legacy-ap-supplier.js
 *   node src/scripts/backfill-legacy-ap-supplier.js --apply
 *   node src/scripts/backfill-legacy-ap-supplier.js --legacy-code=SUP-LEGACY
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const {
    sequelize,
    JournalEntry,
    PurchaseReceipt,
    PurchaseOrder,
    SupplierPayment,
    PurchaseReturn,
    Supplier
} = require('../models')
const { Op } = require('sequelize')
const AccountingService = require('../services/accountingService')

function parseArgs(argv) {
    const args = {
        apply: false,
        legacyCode: 'SUP-LEGACY',
        legacyNameAr: 'مورد تسويات تاريخية',
        legacyNameEn: 'Legacy AP Supplier'
    }

    for (const arg of argv.slice(2)) {
        if (arg === '--apply') args.apply = true
        if (arg.startsWith('--legacy-code=')) args.legacyCode = arg.slice('--legacy-code='.length)
        if (arg.startsWith('--legacy-name-ar=')) args.legacyNameAr = arg.slice('--legacy-name-ar='.length)
        if (arg.startsWith('--legacy-name-en=')) args.legacyNameEn = arg.slice('--legacy-name-en='.length)
    }
    return args
}

function safeParseNotes(notes) {
    if (!notes) return {}
    if (typeof notes === 'object') return notes
    try {
        const parsed = JSON.parse(notes)
        return parsed && typeof parsed === 'object' ? parsed : { _raw_notes: String(notes) }
    } catch (_) {
        return { _raw_notes: String(notes) }
    }
}

function nowStamp() {
    return new Date().toISOString()
}

async function ensureLegacySupplier(args, transaction) {
    let supplier = await Supplier.findOne({
        where: { code: args.legacyCode },
        transaction
    })

    if (!supplier) {
        supplier = await Supplier.create({
            code: args.legacyCode,
            name_ar: args.legacyNameAr,
            name_en: args.legacyNameEn,
            status: 'active',
            notes: 'Auto-created for legacy AP entries with missing supplier mapping.'
        }, { transaction })
    }

    return supplier
}

async function resolveSupplierForEntry(entry, legacySupplierId, transaction) {
    const notesObj = safeParseNotes(entry.notes)
    const notesSupplierId = notesObj.supplier_id || null

    if (entry.source_type === 'purchase_receipt') {
        const receipt = await PurchaseReceipt.findByPk(entry.source_id, {
            attributes: ['id', 'supplier_id', 'purchase_order_id', 'receipt_number'],
            transaction
        })
        if (!receipt) {
            return {
                supplierId: legacySupplierId,
                sourceDoc: null,
                reason: 'source_receipt_missing'
            }
        }

        let supplierId = receipt.supplier_id || null
        let reason = 'receipt_supplier_id'

        if (!supplierId && receipt.purchase_order_id) {
            const po = await PurchaseOrder.findByPk(receipt.purchase_order_id, {
                attributes: ['id', 'supplier_id', 'po_number'],
                transaction
            })
            if (po && po.supplier_id) {
                supplierId = po.supplier_id
                reason = 'purchase_order_supplier_id'
            }
        }

        if (!supplierId && notesSupplierId) {
            supplierId = notesSupplierId
            reason = 'journal_notes_supplier_id'
        }

        if (!supplierId) {
            supplierId = legacySupplierId
            reason = 'legacy_fallback'
        }

        return {
            supplierId,
            sourceDoc: receipt,
            reason
        }
    }

    if (entry.source_type === 'supplier_payment') {
        const payment = await SupplierPayment.findByPk(entry.source_id, {
            attributes: ['id', 'supplier_id', 'payment_number'],
            transaction
        })
        const supplierId = payment?.supplier_id || notesSupplierId || legacySupplierId
        return {
            supplierId,
            sourceDoc: payment || null,
            reason: payment?.supplier_id ? 'payment_supplier_id' : (notesSupplierId ? 'journal_notes_supplier_id' : 'legacy_fallback')
        }
    }

    if (entry.source_type === 'purchase_return') {
        const purchaseReturn = await PurchaseReturn.findByPk(entry.source_id, {
            attributes: ['id', 'supplier_id', 'return_number'],
            transaction
        })
        const supplierId = purchaseReturn?.supplier_id || notesSupplierId || legacySupplierId
        return {
            supplierId,
            sourceDoc: purchaseReturn || null,
            reason: purchaseReturn?.supplier_id ? 'return_supplier_id' : (notesSupplierId ? 'journal_notes_supplier_id' : 'legacy_fallback')
        }
    }

    return {
        supplierId: legacySupplierId,
        sourceDoc: null,
        reason: 'unsupported_source_type_fallback'
    }
}

async function run() {
    const args = parseArgs(process.argv)
    await sequelize.authenticate()

    const entries = await JournalEntry.findAll({
        where: {
            status: 'posted',
            supplier_id: null,
            source_type: { [Op.in]: ['purchase_receipt', 'supplier_payment', 'purchase_return'] }
        },
        order: [['entry_date', 'ASC'], ['entry_number', 'ASC']]
    })

    const summary = {
        generated_at: nowStamp(),
        mode: args.apply ? 'apply' : 'dry-run',
        legacy_supplier_code: args.legacyCode,
        totals: {
            scanned: entries.length,
            updatable: 0,
            updated_entries: 0,
            updated_source_docs: 0,
            legacy_assigned: 0,
            failed: 0
        },
        details: [],
        errors: [],
        synced_suppliers: []
    }

    if (entries.length === 0) {
        const outDir = path.join(__dirname, '../../reports')
        fs.mkdirSync(outDir, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const outPath = path.join(outDir, `backfill-legacy-ap-supplier-summary-${stamp}.json`)
        fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8')
        console.log('No AP entries missing supplier_id found.')
        console.log(`Summary file: ${outPath}`)
        return
    }

    const t = await sequelize.transaction()
    const touchedSuppliers = new Set()
    let legacySupplier = null

    try {
        legacySupplier = await ensureLegacySupplier(args, t)
        touchedSuppliers.add(legacySupplier.id)

        for (const entry of entries) {
            try {
                const resolution = await resolveSupplierForEntry(entry, legacySupplier.id, t)
                const supplierId = resolution.supplierId

                if (!supplierId) {
                    summary.totals.failed++
                    summary.errors.push({
                        entry_number: entry.entry_number,
                        source_type: entry.source_type,
                        source_id: entry.source_id,
                        error: 'Unable to resolve supplier_id'
                    })
                    continue
                }

                summary.totals.updatable++
                if (supplierId === legacySupplier.id) summary.totals.legacy_assigned++
                touchedSuppliers.add(supplierId)

                const notes = safeParseNotes(entry.notes)
                notes.supplier_id = supplierId
                notes._meta = notes._meta || 'supplier_ap_entry'
                notes._legacy_backfill = {
                    applied_at: nowStamp(),
                    resolution_reason: resolution.reason
                }

                summary.details.push({
                    entry_number: entry.entry_number,
                    source_type: entry.source_type,
                    source_id: entry.source_id,
                    supplier_id: supplierId,
                    resolution_reason: resolution.reason
                })

                if (args.apply) {
                    await entry.update({
                        supplier_id: supplierId,
                        notes: JSON.stringify(notes)
                    }, { transaction: t })
                    summary.totals.updated_entries++

                    if (entry.source_type === 'purchase_receipt' && resolution.sourceDoc) {
                        if (!resolution.sourceDoc.supplier_id) {
                            await resolution.sourceDoc.update({ supplier_id: supplierId }, { transaction: t })
                            summary.totals.updated_source_docs++
                        }
                    }
                }
            } catch (err) {
                summary.totals.failed++
                summary.errors.push({
                    entry_number: entry.entry_number,
                    source_type: entry.source_type,
                    source_id: entry.source_id,
                    error: err.message
                })
            }
        }

        if (args.apply) {
            await t.commit()
        } else {
            await t.rollback()
        }
    } catch (err) {
        await t.rollback()
        throw err
    }

    if (args.apply) {
        for (const supplierId of touchedSuppliers) {
            try {
                const sync = await AccountingService.syncSupplierBalance(supplierId)
                summary.synced_suppliers.push(sync)
            } catch (err) {
                summary.errors.push({
                    supplier_id: supplierId,
                    error: `syncSupplierBalance failed: ${err.message}`
                })
            }
        }
    }

    const outDir = path.join(__dirname, '../../reports')
    fs.mkdirSync(outDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outPath = path.join(outDir, `backfill-legacy-ap-supplier-summary-${stamp}.json`)
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8')

    console.log('Legacy AP supplier backfill summary:')
    console.log(JSON.stringify(summary, null, 2))
    console.log(`Summary file: ${outPath}`)
}

if (require.main === module) {
    run()
        .then(async () => {
            try { await sequelize.close() } catch (_) {}
            process.exit(0)
        })
        .catch(async (err) => {
            console.error('Legacy AP supplier backfill failed:', err.message)
            try { await sequelize.close() } catch (_) {}
            process.exit(1)
        })
}

module.exports = { run }
