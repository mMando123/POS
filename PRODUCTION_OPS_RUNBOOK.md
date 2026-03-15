# Production Ops Runbook (Backend Accounting)

## 1) Scope
- Error monitoring with immediate alerting.
- Daily MySQL backup with restore validation.
- Controlled rollback process with safety gates.

## 2) Prerequisites
- Backend configured on MySQL (`DB_DIALECT=mysql`).
- MySQL client binaries available (`mysqldump`, `mysql`).
- Backend env configured in `backend/.env`.

## 3) Required Environment Variables
- `OPS_ALERTS_ENABLED=true`
- `OPS_ALERT_WEBHOOK_URL=<your_webhook>`
- `OPS_ALERT_MIN_INTERVAL_SECONDS=60`
- `OPS_ALERT_TIMEOUT_MS=8000`
- `OPS_BACKUP_SCHEDULE_TIME=02:30`
- `OPS_BACKUP_RETENTION_DAYS=14`
- Optional: `MYSQL_BIN_DIR=<path-to-mysql-bin>`

## 4) Error Monitoring + Immediate Alert
1. Enable flags above.
2. Restart backend.
3. Send test alert:
   - `cd backend`
   - `npm run ops:alert:test`

Expected:
- If webhook is set and reachable: result includes `sent: true`.
- If webhook is missing: script fails with clear reason.

## 5) Daily Backup + Restore Test
### Manual validation
1. Run:
   - `cd backend`
   - `npm run ops:backup:test`
2. Verify report created under:
   - `backend/src/scripts/reports/ops-backup-restore-report-*.json`
3. Verify SQL backup created under:
   - `backend/data/backups/daily/`

Acceptance:
- Report shows `status: passed` and `summary.ok: true`.
- Source/restored counts match for core tables.

### Install daily scheduler (Windows)
1. Run:
   - `cd backend`
   - `npm run ops:schedule:install`
2. Optional custom time:
   - `npm run ops:schedule:install -- --time=03:15`
3. Recommended for production servers (run even without logged-in user):
   - `npm run ops:schedule:install -- --time=02:30 --run-as-system`
4. Task name:
   - `SmartPOS-Daily-Backup-Restore`
5. Task runner file:
   - `backend/scripts/run-daily-backup-task.cmd`
6. Task log file:
   - `backend/logs/ops-daily-backup.log`

## 6) Rollback Policy (Clear And Controlled)
### Rules
- No direct rollback execution without explicit command approval.
- Dry-run first, then apply with explicit DB confirmation.
- Always create pre-rollback dump before replacing DB.

### Dry-run
- `cd backend`
- `npm run ops:rollback -- --file=./data/backups/daily/<backup-file>.sql`

### Apply rollback
- `npm run ops:rollback -- --apply --confirm-db=pos_restaurant --file=./data/backups/daily/<backup-file>.sql`

Safety controls in script:
- Requires `--apply`.
- Requires exact `--confirm-db=<target>`.
- Creates pre-rollback dump in:
  - `backend/data/backups/rollback/`
- Verifies backup by restoring to temporary DB before applying to target.

## 7) Operational Evidence (Latest Executed)
Execution date: **February 25, 2026**

- Alert self-test (mock webhook, immediate send success):
  - `backend/src/scripts/reports/ops-alert-test-report-2026-02-25T16-52-08-977Z.json`
- Backup + restore validation (PASS):
  - `backend/src/scripts/reports/ops-backup-restore-report-2026-02-25T16-43-32-872Z.json`
- Scheduled task verification (PASS, LastResult=0):
  - `backend/src/scripts/reports/ops-scheduler-report-2026-02-25T16-54-42-494Z.json`
- Strict accounting gate evidence (staging + production):
  - `backend/src/scripts/reports/preprod-gate-report-2026-02-25T15-51-27-202Z.json`
  - `backend/src/scripts/reports/preprod-gate-report-2026-02-25T15-51-58-137Z.json`
- Rollback dry-run executed successfully (command-level evidence):
  - `npm run ops:rollback -- --file=./data/backups/daily/daily-backup-2026-02-25T16-45-44-574Z.sql`

## 8) Go-Live Ops Acceptance Criteria
- Alert channel configured and test alert successful.
- Daily scheduler installed and visible in Task Scheduler.
- At least one successful backup+restore report in last 24h.
- Rollback dry-run validated and rollback procedure documented.

Current status from latest evidence: **PASS**

## 9) 24-48h Stability Test (POS + API + DB)
Run soak:
- `cd backend`
- `npm run ops:soak -- --hours=24 --interval=60`

Optional (48h):
- `npm run ops:soak -- --hours=48 --interval=60`

Artifacts:
- Events stream:
  - `backend/src/scripts/reports/stability-soak-events-<timestamp>.jsonl`
- Summary:
  - `backend/src/scripts/reports/stability-soak-summary-<timestamp>.json`

Acceptance:
- No prolonged API/POS outages (no long consecutive failure streaks).
- Pass rate >= 99%.
- DB ping remains healthy across run duration.
