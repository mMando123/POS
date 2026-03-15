# COA Financial UAT Evidence
## Header/Subaccounts Cutover Sign-off Pack

- Generated At: 2026-02-23T11:53:53.715Z
- Cutover Date: 2026-02-24
- Scope Period: - to 2026-02
- Scope Branch: ALL

## Summary

- Total Checks: 7
- Passed: 7
- Failed: 0
- Pass Rate: 100%
- Overall Status: **PASS**

## Check Matrix

| ID | Check | Status | Key Result |
|---|---|---|---|
| AC-01 | No posted lines on Header accounts after cutover | PASS | 0 |
| AC-02 | All active gl_account_defaults point to active posting accounts | PASS | 0 |
| AC-03 | Trial Balance is balanced (global debits = credits) | PASS | 0 |
| AC-04 | Balance Sheet is balanced (Assets = Liabilities + Equity) | PASS | 0 |
| AC-05 | Tax separation is valid (1300 Asset/Dr, 2100 Liability/Cr) | PASS | 1 |
| AC-06 | Inter-branch clearing account family 1105 ends at zero balance | PASS | 0 |
| AC-07 | Cutover adoption event exists in GL audit log | PASS | 1 |

## Detailed Evidence

### AC-01 — No posted lines on Header accounts after cutover
- Status: PASS
- value: 0
- violating_entries: 0
- expected: 0

### AC-02 — All active gl_account_defaults point to active posting accounts
- Status: PASS
- value: 0
- expected: 0

### AC-03 — Trial Balance is balanced (global debits = credits)
- Status: PASS
- value: 0
- total_debits: 18197230.31
- total_credits: 18197230.31
- expected: 0

### AC-04 — Balance Sheet is balanced (Assets = Liabilities + Equity)
- Status: PASS
- value: 0
- assets_total: 18190518.11
- liabilities_plus_equity_total: 18190518.11
- expected: 0

### AC-05 — Tax separation is valid (1300 Asset/Dr, 2100 Liability/Cr)
- Status: PASS
- value: 1
- account_1300: {"code":"1300","account_type":"asset","normal_balance":"debit","is_header":true,"is_active":true}
- account_2100: {"code":"2100","account_type":"liability","normal_balance":"credit","is_header":true,"is_active":true}

### AC-06 — Inter-branch clearing account family 1105 ends at zero balance
- Status: PASS
- value: 0
- expected: 0

### AC-07 — Cutover adoption event exists in GL audit log
- Status: PASS
- value: 1
- expected_min: 1

