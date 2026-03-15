# 📒 النظام المحاسبي — التوثيق الكامل
# Accounting System — Full Documentation

> **آخر تحديث:** فبراير 2026  
> **الإصدار:** Phase 3 (ERP-Ready Dynamic Account Resolution)  
> **المؤلف:** Generated from codebase audit  

---

## 📋 فهرس المحتويات

1. [نظرة عامة](#-نظرة-عامة)
2. [الهيكل المعماري](#-الهيكل-المعماري)
3. [النماذج (Models)](#-النماذج-models)
4. [الخدمات (Services)](#-الخدمات-services)
5. [شجرة الحسابات (COA)](#-شجرة-الحسابات-chart-of-accounts)
6. [القيود المحاسبية التلقائية](#-القيود-المحاسبية-التلقائية)
7. [نظام الفترات المالية](#-نظام-الفترات-المالية)
8. [التقارير المالية](#-التقارير-المالية)
9. [نظام حل الحسابات الديناميكي (Phase 3)](#-نظام-حل-الحسابات-الديناميكي-phase-3)
10. [API Endpoints](#-api-endpoints)
11. [إعداد النظام](#-إعداد-النظام)
12. [تقييم الوضع الحالي](#-تقييم-الوضع-الحالي)
13. [القيود والتحسينات المستقبلية](#-القيود-والتحسينات-المستقبلية)

---

## 🌟 نظرة عامة

النظام المحاسبي مبني على مبدأ **القيد المزدوج (Double-Entry Accounting)** ومتكامل مع نظام نقاط البيع (POS). كل عملية تجارية (بيع، شراء، مرتجع، إلخ) تنتج قيود محاسبية متوازنة تلقائياً.

### المبادئ الأساسية

| المبدأ | التطبيق |
|--------|---------|
| **القيد المزدوج** | كل entry: `sum(debit) = sum(credit)` — يتم التحقق قبل الحفظ |
| **عدم التعديل** | القيود المنشورة لا تُعدَّل أبداً — التصحيح يتم عبر **قيد عكسي** |
| **مرجع المصدر** | كل قيد مربوط بمصدره (`source_type` + `source_id`) |
| **حماية التكرار** | Idempotency guards تمنع القيود المكررة |
| **الفترات المالية** | يمكن قفل فترات شهرية لمنع التعديل |

---

## 🏗 الهيكل المعماري

```
📁 backend/src/
├── 📁 models/
│   ├── Account.js          ← شجرة الحسابات (gl_accounts)
│   ├── AccountDefault.js   ← ربط ديناميكي — مفتاح وظيفي ↔ حساب (gl_account_defaults)
│   ├── JournalEntry.js     ← رأس القيد (gl_journal_entries)
│   ├── JournalLine.js      ← سطور القيد (gl_journal_lines)
│   └── FiscalPeriod.js     ← الفترات المالية (gl_fiscal_periods)
│
├── 📁 services/
│   ├── accountingService.js   ← المحرك المحاسبي الرئيسي (1779 سطر)
│   ├── accountResolver.js     ← حل الحسابات الديناميكي (Phase 3)
│   ├── accountingHooks.js     ← ربط الأحداث بالقيود (Event-driven)
│   └── cashDrawerService.js   ← إدارة الصندوق والورديات
│
├── 📁 routes/
│   └── accounting.js          ← API endpoints (784 سطر)
│
└── 📁 scripts/
    ├── seed-chart-of-accounts.js    ← بذر شجرة الحسابات الأولية
    ├── seed-audit-accounts.js       ← بذر حسابات المراجعة
    └── seed-account-defaults.js     ← بذر الإعدادات الافتراضية (Phase 3)
```

### تدفق البيانات

```
  عملية تجارية (بيع/شراء/مرتجع)
           │
           ▼
  AccountingHooks (الربط)
           │
           ▼
  AccountResolver (أي حساب؟)  ───→  gl_account_defaults (DB)
           │                          ↓ fallback
           │                    LEGACY_ACCOUNTS (hard-coded)
           ▼
  AccountingService.createJournalEntry()
           │
           ├──→ gl_journal_entries (القيد)
           ├──→ gl_journal_lines   (السطور)
           └──→ gl_accounts        (تحديث الأرصدة)
```

---

## 📊 النماذج (Models)

### 1. Account (`gl_accounts`)

| العمود | النوع | الوصف |
|--------|------|-------|
| `id` | UUID | المعرف الفريد |
| `code` | STRING(20) | رمز الحساب (1001, 2002, ...) — فريد |
| `name_ar` | STRING(200) | اسم عربي |
| `name_en` | STRING(200) | اسم إنجليزي |
| `account_type` | ENUM | `asset`, `liability`, `equity`, `income`, `expense` |
| `normal_balance` | ENUM | `debit` أو `credit` |
| `parent_id` | UUID | الحساب الأب (هيكل شجري) |
| `is_header` | BOOLEAN | حساب رئيسي (لا يقبل قيود مباشرة) |
| `is_system` | BOOLEAN | حساب نظامي (لا يمكن حذفه) |
| `branch_id` | UUID | فرع محدد أو NULL = عام |
| `current_balance` | DECIMAL(15,2) | الرصيد الجاري (مُحدَّث تلقائياً) |

### 2. JournalEntry (`gl_journal_entries`)

| العمود | النوع | الوصف |
|--------|------|-------|
| `id` | UUID | المعرف الفريد |
| `entry_number` | STRING(30) | رقم تسلسلي بشري (JE-2026-00001) |
| `entry_date` | DATEONLY | التاريخ المحاسبي |
| `description` | STRING(500) | وصف العملية |
| `source_type` | STRING(50) | مصدر القيد: `order`, `refund`, `shift`, `expense`, إلخ |
| `source_id` | STRING(100) | معرف المصدر |
| `total_amount` | DECIMAL(15,2) | مجموع الجانب المدين (= الدائن) |
| `status` | ENUM | `draft`, `posted`, `reversed` |
| `reversal_of` | UUID | إذا كان قيد عكسي |
| `reversed_by` | UUID | إذا تم عكسه |
| `fiscal_period` | STRING(7) | الفترة المالية (YYYY-MM) |
| `branch_id` | UUID | الفرع |
| `notes` | TEXT | ملاحظات (تحتوي JSON metadata للموردين) |

### 3. JournalLine (`gl_journal_lines`)

| العمود | النوع | الوصف |
|--------|------|-------|
| `journal_entry_id` | UUID | القيد الأب |
| `account_id` | UUID | الحساب المتأثر |
| `debit_amount` | DECIMAL(15,2) | المبلغ المدين (0 إذا كان دائن) |
| `credit_amount` | DECIMAL(15,2) | المبلغ الدائن (0 إذا كان مدين) |
| `description` | STRING(300) | وصف السطر |
| `line_number` | INTEGER | ترتيب العرض |

### 4. AccountDefault (`gl_account_defaults`) — Phase 3

| العمود | النوع | الوصف |
|--------|------|-------|
| `account_key` | STRING(60) | المفتاح الوظيفي (مثل `default_cash_account`) |
| `account_id` | UUID | الحساب الفعلي من الشجرة |
| `company_id` | UUID | NULL = عام، UUID = شركة محددة |
| `branch_id` | UUID | NULL = كل الفروع، UUID = فرع محدد |
| `description` | STRING(300) | وصف عربي |
| `is_active` | BOOLEAN | مفعّل أم لا |

### 5. FiscalPeriod (`gl_fiscal_periods`)

| العمود | النوع | الوصف |
|--------|------|-------|
| `period` | STRING(7) | الفترة (YYYY-MM) — فريد |
| `status` | ENUM | `open`, `closed`, `locked` |
| `closed_by` / `closed_at` | UUID / DATE | من أقفلها ومتى |
| `closing_balance_snapshot` | TEXT(long) | نسخة من ميزان المراجعة وقت الإقفال |

---

## ⚙ الخدمات (Services)

### AccountingService — المحرك الرئيسي

هذه هي الخدمة المركزية. كل القيود تمر من خلالها.

#### الدالة الأساسية: `createJournalEntry(params)`

```javascript
// إنشاء قيد محاسبي متوازن
const entry = await AccountingService.createJournalEntry({
    description: 'بيع فاتورة #1234',
    entryDate: '2026-02-21',
    sourceType: 'order',
    sourceId: 'uuid-of-order',
    branchId: 'uuid-of-branch',
    createdBy: 'uuid-of-user',
    // السطور — MUST be balanced
    lines: [
        { accountCode: '1001', debit: 115, credit: 0, description: 'نقدي مستلم' },
        { accountCode: '4001', debit: 0, credit: 100, description: 'إيراد مبيعات' },
        { accountCode: '2100', debit: 0, credit: 15, description: 'ضريبة مخرجات' }
    ],
    transaction  // optional Sequelize transaction
});
```

#### دوال القيود التلقائية

| الدالة | الاستخدام | القيد |
|------|---------|------|
| `recordSale(order)` | عند إتمام طلب | DR نقد/بنك ← CR إيراد + CR ضريبة |
| `recordCOGS(order)` | تكلفة البضاعة المباعة | DR COGS ← CR مخزون |
| `recordDiscount(order, amount)` | خصم منفصل | DR خصومات (contra-revenue) ← CR نقد |
| `recordRefund(refund, order)` | مرتجع عميل | DR خسائر مرتجعات ← CR نقد/بنك |
| `recordRefundCOGSReversal(refund, order)` | عكس COGS عند مرتجع | DR مخزون ← CR COGS |
| `recordPurchaseReceipt(receipt)` | استلام بضاعة | DR مخزون + DR ضريبة مدخلات ← CR ذمم دائنة |
| `recordSupplierPayment(payment)` | دفع لمورد | DR ذمم دائنة ← CR نقد/بنك |
| `recordPurchaseReturn(return)` | مرتجع مشتريات | DR ذمم دائنة ← CR مخزون |
| `recordStockTransfer(transfer)` | تحويل مخزون | DR/CR مخزون + حساب المقاصة (بين فروع) |
| `recordStockAdjustment(adj)` | تعديل مخزون | DR هبوط مخزون ← CR مخزون (أو العكس) |
| `recordDrawerOpening(shift)` | فتح وردية | DR نقد ← CR عهدة صندوق |
| `recordCashVariance(shift, var)` | فرق نقدي | DR عجز صندوق ← CR نقد (أو العكس) |
| `reversePurchaseReceipt(id)` | إلغاء استلام | قيد عكسي كامل |
| `reverseJournalEntry(id)` | عكس أي قيد | تبديل المدين والدائن |

#### دوال التقارير

| الدالة | الوصف |
|------|------|
| `getTrialBalance(params)` | ميزان المراجعة |
| `getProfitAndLoss(params)` | قائمة الدخل |
| `getBalanceSheet(params)` | الميزانية العمومية |
| `getCashFlow(params)` | التدفقات النقدية |
| `getChartOfAccounts()` | شجرة الحسابات |
| `getAccountLedger(code)` | دفتر الأستاذ لحساب محدد |
| `getSupplierGLBalance(supplierId)` | رصيد مورد من الدفاتر |
| `reconcileAllSuppliers()` | تسوية أرصدة كل الموردين |

---

### AccountResolver — حل الحسابات الديناميكي (Phase 3)

بدلاً من الرموز المحفورة في الكود، يحل هذا النظام المفاتيح الوظيفية:

```javascript
// الطريقة القديمة (Phase 1-2):
const cashCode = ACCOUNTS.CASH  // دائماً '1001'

// الطريقة الجديدة (Phase 3):
const cashCode = await AccountResolver.resolve(
    ACCOUNT_KEYS.CASH,       // 'default_cash_account'
    { branchId: order.branch_id }
)
// يمكن أن يُعيد '1001' عام أو '1111' لفرع الرياض
```

#### أولوية الحل (Resolution Priority)

```
1. فرع + شركة محددة  → الأكثر تحديداً (Branch + Company)
2. فرع فقط           → (Branch only)
3. شركة فقط          → (Company only)
4. عام — بلا تحديد    → (Global default)
5. القيمة القديمة     → (Legacy ACCOUNTS fallback)
```

#### المفاتيح الوظيفية (26 مفتاح)

| المفتاح | الوصف | القيمة الافتراضية |
|---------|------|---------------|
| **الأصول** | | |
| `default_cash_account` | الصندوق | 1001 |
| `default_bank_account` | البنك | 1002 |
| `default_receivable_account` | العملاء | 1003 |
| `default_drawer_float_account` | عهدة الصندوق | 1005 |
| `default_clearing_account` | وسيط التحويلات | 1105 |
| `default_stock_in_hand_account` | المخزون | 1100 |
| `default_input_vat_account` | ضريبة المدخلات | 1300 |
| `default_advance_payment_account` | دفعات مقدمة | 1400 |
| **الخصوم** | | |
| `default_customer_deposit_account` | ودائع عملاء | 2001 |
| `default_payable_account` | ذمم دائنة | 2002 |
| `default_output_vat_account` | ضريبة المخرجات | 2100 |
| **حقوق الملكية** | | |
| `default_capital_account` | رأس المال | 3001 |
| `default_retained_earnings_account` | أرباح محتجزة | 3002 |
| **الإيرادات** | | |
| `default_income_account` | إيراد المبيعات | 4001 |
| `default_discount_account` | الخصومات | 4002 |
| `default_other_income_account` | إيرادات أخرى | 4100 |
| **المصروفات** | | |
| `default_cogs_account` | تكلفة البضاعة | 5001 |
| `default_refund_expense_account` | خسائر مرتجعات | 5002 |
| `default_cash_shortage_account` | عجز الصندوق | 5003 |
| `default_shrinkage_account` | هبوط المخزون | 5004 |
| `default_general_expense_account` | مصروفات عامة | 5100 |
| `default_salaries_expense_account` | رواتب | 5101 |
| `default_rent_expense_account` | إيجار | 5102 |
| `default_utilities_expense_account` | خدمات | 5103 |
| `default_marketing_expense_account` | تسويق | 5104 |
| `default_maintenance_expense_account` | صيانة | 5105 |

---

### AccountingHooks — الربط بالأحداث

هذه الخدمة هي الجسر بين عمليات الـ POS والتسجيل المحاسبي:

```javascript
// يُستدعى تلقائياً عند إتمام طلب
await AccountingHooks.onOrderCompleted(order)
// يُنشئ قيدين: 1. recordSale  2. recordCOGS

// يُستدعى عند الموافقة على مرتجع
await AccountingHooks.onRefundApproved(refund, originalOrder)
// يُنشئ قيدين: 1. recordRefund  2. recordRefundCOGSReversal

// يُستدعى عند استلام مشتريات
await AccountingHooks.onPurchaseReceived(receipt)

// يُستدعى عند دفع لمورد
await AccountingHooks.onSupplierPayment(payment)

// يُستدعى عند فتح وردية
await AccountingHooks.onShiftOpened(shift)

// يُستدعى عند إغلاق وردية
await AccountingHooks.onShiftClosed(shift)

// أداة إصلاح: قيود تاريخية مفقودة
await AccountingHooks.backfillOrders({ branchId, limit: 100 })
```

---

### CashDrawerService — إدارة الصندوق

```javascript
// فتح صندوق مع رصيد افتتاحي
await CashDrawerService.openDrawer({
    shiftId, userId, branchId, openingBalance: 500
})

// إغلاق صندوق مع العد الفعلي
await CashDrawerService.closeDrawer({
    shiftId, actualBalance: 487.50, userId, notes: 'عد نهاية الوردية'
})
// → يُحسب الفرق ويُسجل قيد عجز/فائض تلقائياً

// إدخال نقدي يدوي
await CashDrawerService.recordCashIn({
    shiftId, amount: 100, reason: 'تغيير فكة', userId
})

// سحب نقدي يدوي
await CashDrawerService.recordCashOut({
    shiftId, amount: 50, reason: 'مصروف نثرية', userId
})

// حالة الصندوق
const status = await CashDrawerService.getDrawerStatus(shiftId)
```

---

## 🌳 شجرة الحسابات (Chart of Accounts)

```
1000  الأصول (Assets) ── header
├── 1001  الصندوق (Cash)
├── 1002  البنك (Bank)
├── 1003  العملاء – مدينون (Accounts Receivable)
├── 1005  عهدة صندوق (Drawer Float)
├── 1100  المخزون (Inventory)
├── 1105  وسيط تحويلات (Inter-branch Clearing)
├── 1300  ضريبة المدخلات (Input VAT)
└── 1400  دفعات مقدمة للموردين (Advance Payments)

2000  الالتزامات (Liabilities) ── header
├── 2001  ودائع العملاء (Customer Deposits)
├── 2002  الذمم الدائنة (Accounts Payable)
├── 2100  ضريبة المخرجات (Output VAT)
└── 2200  رواتب مستحقة (Accrued Salaries)

3000  حقوق الملكية (Equity) ── header
├── 3001  رأس مال المالك (Owner Capital)
└── 3002  الأرباح المحتجزة (Retained Earnings)

4000  الإيرادات (Income) ── header
├── 4001  إيرادات المبيعات (Sales Revenue)
├── 4002  الخصومات الممنوحة (Discounts Given) — contra
└── 4100  إيرادات أخرى (Other Income)

5000  المصروفات (Expenses) ── header
├── 5001  تكلفة البضاعة المباعة (COGS)
├── 5002  خسائر المرتجعات (Refund Losses)
├── 5003  عجز الصندوق (Cash Shortage)
├── 5004  هبوط المخزون (Shrinkage)
├── 5100  مصروفات عامة (General & Admin)
├── 5101  رواتب (Salaries)
├── 5102  إيجار (Rent)
├── 5103  خدمات (Utilities)
├── 5104  تسويق (Marketing)
└── 5105  صيانة (Maintenance)
```

---

## 🔄 القيود المحاسبية التلقائية

### 1. بيع نقدي (115 ريال شامل 15% ضريبة)

```
القيد: بيع فاتورة ORD-001
────────────────────────────────────
مدين │ 1001 الصندوق          │ 115.00
دائن │ 4001 إيرادات المبيعات │        │ 100.00
دائن │ 2100 ضريبة المخرجات   │        │  15.00
────────────────────────────────────
المجموع                      │ 115.00 │ 115.00 ✓
```

### 2. تكلفة البضاعة المباعة (COGS)

```
القيد: تكلفة بيع ORD-001
────────────────────────────────
مدين │ 5001 COGS     │ 60.00
دائن │ 1100 المخزون  │       │ 60.00
────────────────────────────────
```

### 3. استلام مشتريات (مع ضريبة)

```
القيد: استلام مشتريات PO-001
────────────────────────────────────
مدين │ 1100 المخزون        │ 1000.00
مدين │ 1300 ضريبة مدخلات   │  150.00
دائن │ 2002 ذمم دائنة      │         │ 1150.00
────────────────────────────────────
```

### 4. دفع لمورد

```
القيد: دفعة لمورد SUP-001
────────────────────────────
مدين │ 2002 ذمم دائنة │ 500.00
دائن │ 1001 الصندوق   │        │ 500.00
────────────────────────────
```

### 5. مرتجع عميل

```
القيد: مرتجع REF-001
────────────────────────────────────
مدين │ 5002 خسائر مرتجعات │ 50.00
دائن │ 1001 الصندوق       │       │ 50.00
────────────────────────────────────

قيد إضافي: عكس COGS
────────────────────────────────
مدين │ 1100 المخزون │ 30.00
دائن │ 5001 COGS    │       │ 30.00
────────────────────────────────
```

### 6. فتح وردية

```
القيد: فتح وردية SHIFT-001
────────────────────────────────
مدين │ 1001 الصندوق       │ 500.00
دائن │ 1005 عهدة الصندوق  │        │ 500.00
────────────────────────────────
```

### 7. عجز صندوق عند الإغلاق

```
القيد: عجز وردية SHIFT-001 (فرق -12.50)
────────────────────────────────────
مدين │ 5003 عجز الصندوق │ 12.50
دائن │ 1001 الصندوق     │       │ 12.50
────────────────────────────────────
```

---

## 📅 نظام الفترات المالية

```
open    ← يقبل قيود جديدة
closed  ← مقفلة (يمكن للأدمن إعادة فتحها)
locked  ← مقفلة نهائياً (لا يمكن فتحها)
```

### الاستخدام عبر API

```bash
# قفل فترة
POST /api/accounting/periods/2026-01/close
Body: { "notes": "إقفال يناير 2026" }

# إعادة فتح فترة
POST /api/accounting/periods/2026-01/reopen

# قائمة الفترات
GET /api/accounting/periods
```

---

## 📈 التقارير المالية

### ميزان المراجعة (Trial Balance)

```bash
GET /api/accounting/reports/trial-balance?periodFrom=2026-01&periodTo=2026-02
```

يعيد كل الحسابات مع مجموع المدين والدائن. إذا `balanced: true` → الدفاتر سليمة.

### قائمة الدخل (Profit & Loss)

```bash
GET /api/accounting/reports/profit-loss?periodFrom=2026-01&periodTo=2026-02
```

```
إيراد المبيعات         100,000
(-) الخصومات            (5,000)
──────────────────────
صافي الإيرادات          95,000
(-) تكلفة البضاعة      (55,000)
──────────────────────
الربح الإجمالي          40,000
(-) مصروفات تشغيلية    (15,000)
──────────────────────
صافي الربح              25,000
```

### الميزانية العمومية (Balance Sheet)

```bash
GET /api/accounting/reports/balance-sheet?asOfDate=2026-02-28
```

```
الأصول                  80,000
──────────────────────
الالتزامات              30,000
حقوق الملكية           50,000
──────────────────────
الالتزامات + ح.م       80,000  ✓ متوازنة
```

### التدفقات النقدية (Cash Flow)

```bash
GET /api/accounting/reports/cash-flow?periodFrom=2026-01&periodTo=2026-02
```

---

## 🔌 API Endpoints

### شجرة الحسابات

| Method | Endpoint | الوصف |
|--------|---------|-------|
| `GET` | `/api/accounting/coa` | شجرة الحسابات كاملة |
| `GET` | `/api/accounting/ledger/:code` | دفتر أستاذ حساب معين |

### القيود المحاسبية

| Method | Endpoint | الوصف |
|--------|---------|-------|
| `GET` | `/api/accounting/journal-entries` | قائمة القيود (مع فلترة) |
| `GET` | `/api/accounting/journal-entries/:id` | قيد محدد مع سطوره |
| `POST` | `/api/accounting/journal-entries` | إنشاء قيد يدوي |
| `POST` | `/api/accounting/journal-entries/:id/reverse` | عكس قيد |

### التقارير

| Method | Endpoint | الوصف |
|--------|---------|-------|
| `GET` | `/api/accounting/reports/trial-balance` | ميزان المراجعة |
| `GET` | `/api/accounting/reports/profit-loss` | قائمة الدخل |
| `GET` | `/api/accounting/reports/balance-sheet` | الميزانية العمومية |
| `GET` | `/api/accounting/reports/cash-flow` | التدفقات النقدية |

### الفترات المالية

| Method | Endpoint | الوصف |
|--------|---------|-------|
| `GET` | `/api/accounting/periods` | قائمة الفترات |
| `POST` | `/api/accounting/periods/:period/close` | إقفال فترة |
| `POST` | `/api/accounting/periods/:period/reopen` | إعادة فتح فترة |

### إعدادات الحسابات (Phase 3)

| Method | Endpoint | الوصف |
|--------|---------|-------|
| `GET` | `/api/accounting/defaults` | قائمة كل الإعدادات |
| `GET` | `/api/accounting/defaults/keys` | المفاتيح مع حساباتها |
| `PUT` | `/api/accounting/defaults` | تعيين/تعديل إعداد |
| `DELETE` | `/api/accounting/defaults/:id` | إلغاء تنشيط |
| `POST` | `/api/accounting/defaults/reseed` | إعادة بذر |
| `POST` | `/api/accounting/defaults/clear-cache` | مسح الكاش |

### الصندوق

| Method | Endpoint | الوصف |
|--------|---------|-------|
| `POST` | `/api/accounting/drawer/cash-in` | إدخال نقدي |
| `POST` | `/api/accounting/drawer/cash-out` | سحب نقدي |
| `GET` | `/api/accounting/drawer/:shiftId` | حالة الصندوق |

### الموردين

| Method | Endpoint | الوصف |
|--------|---------|-------|
| `GET` | `/api/accounting/supplier/:id/gl-balance` | رصيد مورد من GL |
| `POST` | `/api/accounting/supplier/:id/sync-balance` | مزامنة رصيد مورد |
| `POST` | `/api/accounting/suppliers/reconcile` | تسوية كل الموردين |

---

## 🚀 إعداد النظام

### الخطوة 1: مزامنة قاعدة البيانات

```bash
cd backend
node src/scripts/initDatabase.js
```

### الخطوة 2: بذر شجرة الحسابات

```bash
node src/scripts/seed-chart-of-accounts.js
```

### الخطوة 3: بذر حسابات المراجعة (اختياري)

```bash
node src/scripts/seed-audit-accounts.js
```

### الخطوة 4: بذر الإعدادات الافتراضية (Phase 3)

```bash
node src/scripts/seed-account-defaults.js
```

### الخطوة 5: قيود تاريخية مفقودة (اختياري)

```bash
# عبر API
POST /api/accounting/backfill
Body: { "limit": 500 }
```

---

## ⭐ تقييم الوضع الحالي

### نقاط القوة 💪

| الميزة | التقييم | التعليق |
|--------|--------|---------|
| **القيد المزدوج** | ✅ ممتاز | كل عملية تنتج قيداً متوازناً محققاً |
| **حماية التكرار** | ✅ ممتاز | Idempotency guards على كل الدوال الحساسة |
| **عدم التعديل** | ✅ ممتاز | القيود لا تُعدَّل — تصحيح عبر قيد عكسي فقط |
| **الفترات المالية** | ✅ جيد جداً | قفل شهري مع 3 مستويات (open/closed/locked) |
| **تسوية الموردين** | ✅ جيد جداً | رصيد GL المرجعي + تسوية تلقائية |
| **ربط الأحداث** | ✅ جيد جداً | Hook-based — لا تعديل على الكود الأصلي |
| **التقارير** | ✅ جيد | ميزان + قائمة دخل + ميزانية + تدفقات |
| **COGS** | ✅ جيد | محسوب على مستوى الأصناف |
| **ضريبة القيمة المضافة** | ✅ جيد | فصل مدخلات/مخرجات |
| **Phase 3 — Dynamic Resolution** | ✅ جيد جداً | مفاتيح وظيفية + caching + branch override |
| **Backward Compatibility** | ✅ ممتاز | Legacy fallback يضمن عدم التوقف |
| **التوثيق في الكود** | ✅ ممتاز | JSDoc تفصيلي + تعليقات عربية |

### نقاط الضعف / ملاحظات ⚠️

| الملاحظة | الخطورة | التفصيل |
|---------|--------|---------|
| **SQLite كقاعدة** | 🟡 متوسطة | SQLite ممتازة للـ POS المحلي، لكنها ليست مناسبة لبيئة production متقدمة مع concurrency عالية |
| **الكاش in-memory** | 🟡 منخفضة | يعمل جيداً لـ single-process، لكن في حالة multi-instance/cluster يحتاج Redis مشترك |
| **لا يوجد Audit Log** | 🟡 متوسطة | تغييرات AccountDefault لا تُسجَّل في log مستقل |
| **لا يوجد صلاحيات دقيقة** | 🟡 منخفضة | الصلاحية الآن binary: admin أو لا. لا يوجد role-based granular permissions |
| **current_balance cache** | 🟡 متوسطة | الأرصدة المخزنة مؤقتة يمكن أن تتعارض في سيناريوهات race condition (مع SQLite WAL mode هذا نادر) |
| **Multi-Company** | 🔵 مخطط | البنية جاهزة (`company_id`) لكن التنفيذ لم يكتمل |
| **لا يوجد Depreciation** | 🔵 خارج النطاق | الأصول الثابتة والإهلاك غير مدعومة حالياً |
| **لا يوجد Multi-Currency** | 🔵 خارج النطاق | العملاء والموردون بعملة واحدة فقط |

### التقييم الإجمالي

> **8.5/10** — نظام محاسبي قوي ومتماسك لنظام POS. التصميم معماري مميز بفصل الطبقات
> (Hooks → Resolver → Service → DB) مع backward compatibility ممتازة.
> الانتقال من Phase 2 (hard-coded) إلى Phase 3 (dynamic) تم بشكل نظيف وبدون كسر.
> الـ COA بسيطة لكنها كافية لمعظم أعمال التجزئة/المطاعم.

---

## 🔮 القيود والتحسينات المستقبلية

### المستوى 1 — قريب (Quick Wins)

- [ ] **Audit Trail** لتغييرات Account Defaults — تسجيل من غيّر أي إعداد ومتى
- [ ] **دعم الفروع الكامل في UI** — تعيين حسابات مختلفة لكل فرع
- [ ] **تنبيه ذكي** عند عدم توازن ميزان المراجعة
- [ ] **تصدير PDF** للتقارير المالية

### المستوى 2 — متوسط

- [ ] **Multi-Currency** — حسابات بعملات مختلفة مع أسعار صرف
- [ ] **Cost Centers** — مراكز تكلفة لتحليل أداء الأقسام
- [ ] **Budget Module** — ميزانيات تقديرية شهرية مع مقارنة الفعلي
- [ ] **Recurring Entries** — قيود دورية تلقائية (إيجار شهري مثلاً)

### المستوى 3 — بعيد (ERP-Level)

- [ ] **Fixed Assets & Depreciation** — أصول ثابتة وإهلاك
- [ ] **Full Multi-Company** — كل شركة بشجرة حسابات منفصلة
- [ ] **Consolidation** — توحيد القوائم المالية لمجموعة شركات
- [ ] **IFRS/SOCPA Compliance** — توافق مع المعايير المحاسبية الدولية/السعودية
- [ ] **ERPNext Integration** — تصدير القيود إلى ERPNext

---

## 📎 ملاحظات تقنية مهمة

### 1. حماية التكرار (Idempotency)

كل دالة تسجيل فيها حارس تكرار مشابه لـ:

```javascript
// البحث عن قيد موجود لنفس المصدر
const existing = await JournalEntry.findOne({
    where: { source_type: 'order', source_id: order.id }
})
if (existing) {
    logger.info(`⏭️ Idempotency: JE already exists for order ${order.id}`)
    return existing
}
```

### 2. الـ Caching في AccountResolver

```javascript
// الكاش مبني على مفتاح مركب:
// accountKey|branchId|companyId
// مثال: "default_cash_account|uuid-branch|*"

// المدة: 5 دقائق
static _cacheExpiry = 5 * 60 * 1000

// مسح الكاش يتم تلقائياً عند:
// - تعديل إعداد عبر setDefault()
// - حذف إعداد عبر API
// - استدعاء clearCache() يدوياً
```

### 3. حماية القيد المتوازن

```javascript
// في createJournalEntry — أهم validation في النظام
const totalDebit = lines.reduce((s, l) => s + parseFloat(l.debit || 0), 0)
const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit || 0), 0)

if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`UNBALANCED_ENTRY: Debit(${totalDebit}) ≠ Credit(${totalCredit})`)
}
```

---

> **⚡ هام:** هذا النظام يعمل بشكل **مستقل** عن أي ERP. لكنه مصمم بحيث يمكن ربطه
> مع ERPNext أو أي نظام محاسبي آخر عبر تصدير القيود (Journal Entry export)
> أو عبر مزامنة Account Defaults مع COA خارجي.
