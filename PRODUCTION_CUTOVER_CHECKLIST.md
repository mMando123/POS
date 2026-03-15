# Production Cutover Checklist (Accounting)

## 1) Freeze And Backup
1. Freeze non-critical changes.
2. Run backup:
   - `cd backend`
   - `node src/scripts/backup-before-migration.js`
3. Confirm latest snapshot exists:
   - `backend/data/pre-migration-snapshot.json`

## 2) Harden Environment
Ensure these flags are set in production environment:
- `ACCOUNTING_STRICT_DEFAULTS=true`
- `ACCOUNTING_AUTO_REMAP_POSTING=false`
- `ACCOUNTING_ALLOW_GLOBAL_FALLBACK=false`

## 3) Structural Integrity
Run:
- `cd backend`
- `node src/scripts/verify-erpnext-migration.js`

Acceptance:
- 29/29 checks pass.

## 4) Preprod Gate
Run:
- `cd backend`
- `node src/scripts/preprod-gate-check.js`

Acceptance:
- Gate result is `Gate Passed: true`
- JSON report saved under `backend/src/scripts/reports`.

## 5) Operational Readiness
1. Enable centralized backend logs and alert webhook.
2. Run backup + restore test:
   - `cd backend`
   - `npm run ops:backup:test`
3. Install/verify daily scheduler:
   - `npm run ops:schedule:install`
4. Validate rollback dry-run:
   - `npm run ops:rollback -- --file=./data/backups/daily/<backup-file>.sql`
5. Follow full runbook:
   - `PRODUCTION_OPS_RUNBOOK.md`

## 6) Financial UAT Signoff
1. Execute finance UAT scenarios:
   - Sale, Refund, Purchase Receipt, Purchase Return, Supplier Payment, Expense.
2. Validate reports:
   - Trial Balance, P&L, Balance Sheet, Supplier Aging, Supplier Statement.
3. Signoff document:
   - `COA_FINANCIAL_UAT_SIGNOFF_TEMPLATE.md`

## Go/No-Go Rule
- Go-Live only if all sections above are completed with evidence.
