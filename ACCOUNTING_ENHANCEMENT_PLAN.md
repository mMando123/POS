# خطة التحسينات الشاملة للنظام المحاسبي
## POS/ERP Accounting Enhancement Plan — Enterprise-Grade Roadmap

> **الهدف:** تحويل النظام المحاسبي من "جيد للمنشآت الصغيرة" إلى **متين، قوي، ومرن يتهيأ لأي شي**  
> **التاريخ:** 21 فبراير 2026  
> **بناءً على:** مراجعة 22 إصلاح سابق + فحص شامل لكل ملف في النظام

---

## 📋 ملخص تنفيذي

النظام الحالي **جيد** ولكن لديه **15 نقطة ضعف** يمكن أن تسبب مشاكل عند التوسع. هذه الخطة تُقسم التحسينات إلى **4 مراحل** حسب الأهمية:

| المرحلة | الاسم | الأولوية | الهدف |
|---------|-------|----------|-------|
| **Phase 1** | الأمان والسلامة | 🔴 فوري | حماية البيانات وضمان الدقة |
| **Phase 2** | المرونة والتوسع | 🟡 قريب | دعم سيناريوهات متعددة |
| **Phase 3** | التقارير الاحترافية | 🟢 متوسط | تقارير بمستوى مكاتب المحاسبة |
| **Phase 4** | Enterprise-Grade | 🔵 بعيد | جاهزية المؤسسات الكبيرة |

---

## 🔴 Phase 1 — الأمان والسلامة (أولوية فورية)

### ENH-01: إقفال سنوي آلي (Year-End Close)
**المشكلة:** لا يوجد آلية لإقفال السنة المالية وترحيل الأرباح.  
**الأثر:** حسابات الإيرادات والمصروفات تتراكم للأبد، والميزانية تعتمد على حساب ذكي (FIX-14) بدلاً من إقفال حقيقي.

**الحل المقترح:**
```javascript
// إضافة دالة في accountingService.js
static async performYearEndClose(year, { userId }) {
    // 1. حساب صافي الربح/الخسارة للسنة
    const pnl = await this.getProfitAndLoss({
        periodFrom: `${year}-01`,
        periodTo: `${year}-12`
    })
    
    // 2. إنشاء قيد إقفال: ترحيل الأرباح إلى حساب 3002
    // DR جميع حسابات الإيرادات (4xxx) ← تصفيرها
    // CR جميع حسابات المصروفات (5xxx) ← تصفيرها
    // DR/CR الأرباح المحتجزة (3002) ← الفرق
    
    // 3. إقفال جميع فترات السنة (locked)
    for (let m = 1; m <= 12; m++) {
        await this.lockPeriod(`${year}-${String(m).padStart(2,'0')}`, {
            userId, permanent: true
        })
    }
    
    return { netIncome: pnl.netIncome, year, status: 'closed' }
}
```

**الملفات المتأثرة:**
- `accountingService.js` — إضافة `performYearEndClose()`
- `accounting.js` (routes) — endpoint جديد `POST /year-end-close`
- يتطلب صلاحية `admin` فقط

---

### ENH-02: سجل تدقيق مستقل للعمليات المحاسبية (GL Audit Log)
**المشكلة:** التعديلات على الحسابات والقيود تُسجل في LOG فقط — لا يوجد جدول مستقل قابل للبحث والمراجعة.

**الحل المقترح:**
```javascript
// نموذج جديد: GLAuditLog
const GLAuditLog = sequelize.define('GLAuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    
    event_type: {
        type: DataTypes.ENUM(
            'journal_entry_created',    // قيد جديد
            'journal_entry_reversed',   // عكس قيد
            'period_closed',            // إقفال فترة
            'period_reopened',          // إعادة فتح
            'period_locked',            // قفل دائم
            'account_created',          // حساب جديد
            'account_deactivated',      // تعطيل حساب
            'balance_recalculated',     // إعادة حساب رصيد
            'year_end_close',           // إقفال سنوي
            'manual_adjustment'         // تعديل يدوي
        ),
        allowNull: false
    },
    
    entity_type: { type: DataTypes.STRING(50) },   // 'journal_entry', 'account', 'period'
    entity_id: { type: DataTypes.STRING(100) },     // UUID
    
    user_id: { type: DataTypes.UUID },
    branch_id: { type: DataTypes.UUID },
    
    old_value: { type: DataTypes.TEXT },  // JSON — القيمة قبل التعديل
    new_value: { type: DataTypes.TEXT },  // JSON — القيمة بعد التعديل
    
    ip_address: { type: DataTypes.STRING(50) },
    notes: { type: DataTypes.TEXT }
})
```

**المكان:** `models/GLAuditLog.js` (جديد)  
**الربط:** يُستدعى تلقائياً من `createJournalEntry()` و `reverseJournalEntry()` و `lockPeriod()` و `reopenPeriod()`

---

### ENH-03: فحص سلامة دوري آلي (Integrity Health Check)
**المشكلة:** لا يوجد فحص آلي يتحقق من:
- توازن الميزانية (`Assets = Liabilities + Equity`)  
- صفرية حساب الوسيط بين الفروع (1105)
- صفرية عهدة الصندوق (1005) عند عدم وجود ورديات مفتوحة
- تطابق أرصدة الحسابات المُخزنة مع GL الفعلي

**الحل المقترح:**
```javascript
// إضافة في accountingService.js
static async runIntegrityCheck() {
    const issues = []
    
    // 1. فحص التوازن
    const trialBalance = await this.getTrialBalance()
    if (trialBalance.totalDebits !== trialBalance.totalCredits) {
        issues.push({
            severity: 'CRITICAL',
            check: 'TRIAL_BALANCE',
            message: `ميزان المراجعة غير متوازن! مدين: ${trialBalance.totalDebits}, دائن: ${trialBalance.totalCredits}`
        })
    }
    
    // 2. فحص حساب الوسيط
    const clearingAccount = await this.getAccountByCode('1105')
    if (clearingAccount && parseFloat(clearingAccount.current_balance) !== 0) {
        issues.push({
            severity: 'WARNING',
            check: 'CLEARING_ACCOUNT',
            message: `حساب الوسيط (1105) رصيده ${clearingAccount.current_balance} — يجب أن يكون صفراً`
        })
    }
    
    // 3. فحص تطابق الأرصدة المُخزنة مع GL
    const accounts = await Account.findAll({ where: { is_active: true, is_header: false } })
    for (const account of accounts) {
        const glBalance = await this._calculateGLBalance(account.id)
        if (Math.abs(parseFloat(account.current_balance) - glBalance) > 0.01) {
            issues.push({
                severity: 'ERROR',
                check: 'BALANCE_DRIFT',
                account: account.code,
                stored: account.current_balance,
                calculated: glBalance
            })
        }
    }
    
    // 4. فحص القيود اليتيمة (بدون أسطر)
    // 5. فحص الأسطر اليتيمة (بدون قيد)
    // 6. فحص عهدة الصندوق مقابل الورديات المفتوحة
    
    return {
        healthy: issues.length === 0,
        issues,
        checkedAt: new Date().toISOString()
    }
}
```

**الملفات المتأثرة:**
- `accountingService.js` — إضافة `runIntegrityCheck()` و `_calculateGLBalance()`
- `accounting.js` — endpoint جديد `GET /health-check`
- إضافة Cron Job يومي (اختياري)

---

### ENH-04: حماية `PUT /status` من تجاوز المحاسبة
**المشكلة (FIX-22):** مسار `PUT /:id/status` يسمح بالتحويل إلى `completed` مع خصم المخزون بدون قيد محاسبي.

**الحل المقترح:**
```javascript
// في order.js — PUT /:id/status
// حجب حالة completed تماماً من هذا المسار
const validTransitions = {
    'pending': ['approved', 'cancelled'],
    'approved': ['preparing', 'cancelled'],
    'new': ['preparing', 'cancelled'],
    'confirmed': ['preparing', 'cancelled'],
    'preparing': ['ready', 'cancelled'],           // ← حذف completed
    'ready': ['handed_to_cashier', 'cancelled'],    // ← حذف completed
    'handed_to_cashier': ['cancelled'],             // ← حذف completed
    'completed': [],
    'cancelled': []
}

// مع رسالة واضحة:
if (status === 'completed') {
    return res.status(400).json({
        message: 'لإكمال الطلب، استخدم POST /:id/complete لضمان التسجيل المحاسبي',
        redirect: `POST /api/orders/${id}/complete`
    })
}
```

**الملفات المتأثرة:** `routes/order.js` فقط

---

### ENH-05: إعادة حساب الأرصدة (Balance Recalculation)
**المشكلة:** إذا انحرف `current_balance` في جدول الحسابات لأي سبب (خلل، انقطاع كهرباء أثناء commit)، لا توجد طريقة لإعادة الحساب من GL.

**الحل المقترح:**
```javascript
static async recalculateAllBalances({ dryRun = true } = {}) {
    const accounts = await Account.findAll({
        where: { is_active: true, is_header: false }
    })
    
    const results = []
    for (const account of accounts) {
        const glBalance = await this._calculateGLBalance(account.id)
        const storedBalance = parseFloat(account.current_balance)
        const drift = Math.round((glBalance - storedBalance) * 100) / 100
        
        if (Math.abs(drift) > 0.01) {
            if (!dryRun) {
                await account.update({ current_balance: glBalance })
            }
            results.push({
                code: account.code,
                name: account.name_ar,
                stored: storedBalance,
                calculated: glBalance,
                drift,
                fixed: !dryRun
            })
        }
    }
    
    return { drifted: results.length, accounts: results, dryRun }
}

static async _calculateGLBalance(accountId) {
    const result = await JournalLine.findOne({
        attributes: [
            [sequelize.fn('SUM', sequelize.col('debit_amount')), 'totalDebit'],
            [sequelize.fn('SUM', sequelize.col('credit_amount')), 'totalCredit']
        ],
        where: { account_id: accountId },
        include: [{
            model: JournalEntry,
            where: { status: 'posted' },
            attributes: []
        }],
        raw: true
    })
    
    const debit = parseFloat(result?.totalDebit || 0)
    const credit = parseFloat(result?.totalCredit || 0)
    const account = await Account.findByPk(accountId)
    
    return account.normal_balance === 'debit'
        ? Math.round((debit - credit) * 100) / 100
        : Math.round((credit - debit) * 100) / 100
}
```

**الملفات المتأثرة:**
- `accountingService.js` — إضافة `recalculateAllBalances()` و `_calculateGLBalance()`
- `accounting.js` — endpoints `GET /recalculate` (dry-run) و `POST /recalculate` (تنفيذ)

---

## 🟡 Phase 2 — المرونة والتوسع (أولوية قريبة)

### ENH-06: قيود متعددة العملات (Multi-Currency Support)
**المشكلة:** النظام يعمل بعملة واحدة فقط — لا يدعم فروع في دول مختلفة أو تحويلات بعملة أجنبية.

**الحل المقترح:**
```
1. إضافة حقول في JournalLine:
   - currency: STRING(3)           ← 'SAR', 'USD', 'EGP'
   - exchange_rate: DECIMAL(10,6)  ← سعر التحويل وقت القيد
   - original_amount: DECIMAL(15,2) ← المبلغ بالعملة الأصلية
   
2. إضافة جدول ExchangeRate:
   - from_currency, to_currency
   - rate, date
   
3. تعديل createJournalEntry لقبول currency + auto-convert

4. تعديل التقارير لعرض:
   - بالعملة المحلية (الأساسية)
   - بالعملة الأصلية (اختياري)
```

---

### ENH-07: مراكز التكلفة (Cost Centers)
**المشكلة:** لا يمكن تحليل المصروفات حسب القسم/المشروع/الفرع بشكل مفصل.

**الحل المقترح:**
```
1. جدول جديد: CostCenter
   - id, code, name_ar, name_en
   - parent_id (هرمي)
   - is_active
   
2. إضافة حقل cost_center_id إلى JournalLine (اختياري)

3. تقارير جديدة:
   - P&L by Cost Center
   - Expense Analysis by Cost Center
```

---

### ENH-08: ميزانيات تقديرية (Budget vs Actual)
**المشكلة:** لا توجد ميزانيات تقديرية للمقارنة مع الأداء الفعلي.

**الحل المقترح:**
```
1. جدول جديد: Budget
   - account_id
   - period (YYYY-MM)
   - budgeted_amount
   - notes

2. تقرير Budget vs Actual:
   - لكل حساب مصروف: الميزانية vs الفعلي vs الانحراف %
   - تنبيه تلقائي عند تجاوز 90% أو 100%
```

---

### ENH-09: قيود متكررة (Recurring Journal Entries)
**المشكلة:** مصروفات متكررة (إيجار شهري، رواتب) يجب إنشاؤها يدوياً كل شهر.

**الحل المقترح:**
```
1. جدول جديد: RecurringEntry
   - template_lines: JSON       ← أسطر القيد
   - frequency: 'monthly' | 'quarterly' | 'yearly'
   - next_execution_date
   - last_executed_at
   - is_active
   
2. Cron Job يومي يتحقق من القيود المستحقة وينشئها تلقائياً

3. API لإدارة القيود المتكررة (CRUD)
```

---

### ENH-10: تسوية بنكية (Bank Reconciliation)
**المشكلة:** لا توجد أداة لمطابقة كشف البنك مع حساب 1002 في GL.

**الحل المقترح:**
```
1. endpoint لرفع كشف البنك (CSV/Excel)
2. مطابقة تلقائية بناءً على:
   - المبلغ + التاريخ (±1 يوم)
   - المرجع (order_number, payment_number)
3. عرض:
   - حركات مطابقة ✅
   - حركات غير مطابقة في GL ❌
   - حركات في البنك بدون GL ❌
4. تقرير تسوية بنكية
```

---

### ENH-11: دعم الضريبة المتقدم (Advanced Tax)
**المشكلة:** النظام يدعم ضريبة واحدة فقط (VAT). لا يدعم:
- معدلات ضريبة مختلفة حسب الصنف
- إعفاءات ضريبية
- تقارير ضريبية (إقرار VAT)

**الحل المقترح:**
```
1. جدول TaxRate:
   - code, name_ar, rate
   - tax_type: 'vat' | 'withholding' | 'exempt'
   
2. ربط Menu (الأصناف) بـ tax_rate_id

3. تعديل recordSale لحساب الضريبة حسب الصنف

4. تقرير إقرار ضريبي:
   - مجموع ضريبة المخرجات (2100)
   - مجموع ضريبة المدخلات (1300)
   - صافي المستحق = 2100 - 1300
```

---

## 🟢 Phase 3 — التقارير الاحترافية (أولوية متوسطة)

### ENH-12: قائمة تدفقات نقدية مُصنفة (Classified Cash Flow)
**المشكلة الحالية:** قائمة التدفقات النقدية **مبسطة** — كل شيء ضمن "تشغيلي".

**الحل المقترح:**
```
تصنيف التدفقات حسب source_type:

أنشطة تشغيلية:
  ├── مقبوضات من عملاء (order)
  ├── مدفوعات لموردين (supplier_payment)
  ├── مصروفات تشغيلية (expense)
  ├── مرتجعات (refund)
  └── فروقات صندوق (shift)

أنشطة استثمارية:
  ├── شراء معدات (asset_purchase)
  └── بيع معدات (asset_sale)

أنشطة تمويلية:
  ├── ضخ رأس مال (capital_injection)
  ├── سحب مالك (owner_withdrawal)
  └── قروض (loan)
```

---

### ENH-13: تقرير أعمار الذمم (Aging Report)
**للعملاء (AR):** فواتير آجلة غير مُحصلة حسب العمر (30/60/90/120+ يوم)
**للموردين (AP):** مستحقات غير مدفوعة حسب العمر

```
مثال تقرير أعمار الذمم الدائنة:
┌──────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ المورد       │ حالي     │ 1-30 يوم │ 31-60    │ 61-90    │ +90 يوم │
├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ مورد أ       │ 5,000    │ 2,000    │ -        │ -        │ -       │
│ مورد ب       │ -        │ 8,000    │ 3,000    │ 1,500    │ -       │
│ مورد ج       │ 1,200    │ -        │ -        │ -        │ 4,000   │
└──────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

---

### ENH-14: لوحة مؤشرات مالية (Financial Dashboard KPIs)
```
إضافة API endpoint يُرجع:

1. نسب الربحية:
   - إجمالي هامش الربح (Gross Margin %)
   - صافي هامش الربح (Net Margin %)
   - معدل دوران المخزون (Inventory Turnover)
   
2. نسب السيولة:
   - معدل السيولة الجارية (Current Ratio)
   - الرصيد النقدي الفوري
   
3. مؤشرات التشغيل:
   - متوسط قيمة الطلب (Avg Order Value)
   - نسبة المرتجعات للمبيعات (Return Rate %)
   - عجز الصندوق التراكمي
   
4. مقارنات:
   - هذا الشهر vs الشهر السابق
   - هذا الشهر vs نفس الشهر العام الماضي
```

---

### ENH-15: تصدير التقارير (Export)
```
دعم تصدير جميع التقارير بصيغ:
- PDF (مع شعار الشركة وترويسة)
- Excel (مع فلاتر ورسوم بيانية)
- CSV (للتحليل الخارجي)

الملفات: مسار جديد GET /reports/:type/export?format=pdf|excel|csv
```

---

## 🔵 Phase 4 — Enterprise-Grade (أولوية بعيدة)

### ENH-16: قاعدة بيانات المحاسبة — ترقية إلى PostgreSQL
**المشكلة:** SQLite لا يدعم:
- `CHECK` constraints عبر صفوف
- Concurrent writes (قيود متزامنة)
- Row-level locking الحقيقي
- Full-text search على الوصف

**الحل:** ترحيل جداول GL إلى PostgreSQL مع:
- `CHECK` constraint حقيقي على مستوى DB: `SUM(debit) = SUM(credit)`
- `TRIGGER` لتحديث الأرصدة تلقائياً
- `MATERIALIZED VIEW` لميزان المراجعة (أداء فوري)

---

### ENH-17: نظام صلاحيات محاسبية دقيق (RBAC for Accounting)
```
أدوار جديدة:
- accountant:         عرض + قيود يدوية
- senior_accountant:  + عكس قيود + إقفال فترات
- financial_manager:  + إعادة فتح + إقفال سنوي
- auditor:            عرض فقط + تقارير + سجل التدقيق (read-only)

مع:
- فصل القيود اليدوية عن القيود التلقائية
- موافقة ثنائية على القيود فوق مبلغ معين
- تنبيهات لنشاط مشبوه
```

---

### ENH-18: قيود آلية عند الأحداث الإضافية
```
أحداث حالياً بدون ربط محاسبي:
1. ✅ إلغاء طلب (cancelled) — يجب عكس المخزون إذا كان مخصوماً
2. ✅ خصم على مستوى الفاتورة — حالياً مُضمن، لكن بدون قيد منفصل
3. ❌ رسوم التوصيل — إذا كان هناك رسوم delivery
4. ❌ الإكراميات (tips) — إذا كانت تُحصل
5. ❌ كسر جزء (fractional rounding) — فروقات التقريب
```

---

### ENH-19: نسخ احتياطي محاسبي مستقل
```
دالة تُنشئ نسخة SQL كاملة لجداول GL فقط:
- gl_accounts
- gl_journal_entries
- gl_journal_lines  
- gl_fiscal_periods
- gl_cash_drawers
- gl_audit_log (الجديد)

مع:
- ضغط gzip
- اسم ملف بالتاريخ والوقت
- تنبيه إذا مضى أكثر من 24 ساعة بدون نسخة
```

---

## 📊 جدول التنفيذ المقترح

### الأسبوع 1-2: Phase 1 (الأمان)
| الرقم | التحسين | الجهد المقدر | التعقيد |
|-------|---------|-------------|---------|
| ENH-01 | إقفال سنوي | 4 ساعات | متوسط |
| ENH-02 | سجل تدقيق GL | 3 ساعات | منخفض |
| ENH-03 | فحص سلامة | 3 ساعات | متوسط |
| ENH-04 | حماية PUT /status | 30 دقيقة | منخفض |
| ENH-05 | إعادة حساب أرصدة | 2 ساعة | متوسط |

### الأسبوع 3-4: Phase 2 (المرونة)
| الرقم | التحسين | الجهد المقدر | التعقيد |
|-------|---------|-------------|---------|
| ENH-06 | Multi-Currency | 8 ساعات | عالي |
| ENH-07 | مراكز التكلفة | 4 ساعات | متوسط |
| ENH-08 | ميزانيات | 4 ساعات | متوسط |
| ENH-09 | قيود متكررة | 5 ساعات | متوسط |
| ENH-10 | تسوية بنكية | 6 ساعات | عالي |
| ENH-11 | ضريبة متقدمة | 6 ساعات | عالي |

### الأسبوع 5-6: Phase 3 (التقارير)
| الرقم | التحسين | الجهد المقدر | التعقيد |
|-------|---------|-------------|---------|
| ENH-12 | Cash Flow مصنف | 3 ساعات | متوسط |
| ENH-13 | أعمار الذمم | 4 ساعات | متوسط |
| ENH-14 | KPIs Dashboard | 4 ساعات | متوسط |
| ENH-15 | تصدير PDF/Excel | 6 ساعات | عالي |

### مرحلة لاحقة: Phase 4 (Enterprise)
| الرقم | التحسين | الجهد المقدر | التعقيد |
|-------|---------|-------------|---------|
| ENH-16 | PostgreSQL | 12 ساعة | عالي جداً |
| ENH-17 | RBAC محاسبي | 8 ساعات | عالي |
| ENH-18 | قيود أحداث إضافية | 6 ساعات | متوسط |
| ENH-19 | نسخ احتياطي GL | 2 ساعة | منخفض |

---

## 🎯 ترتيب الأولويات — ماذا أنفذ أولاً؟

إذا كان وقتك محدود وتريد **أكبر تأثير بأقل جهد**، نفذ بالترتيب:

| # | التحسين | السبب | الجهد |
|---|---------|-------|-------|
| 1️⃣ | **ENH-04** | حماية فورية — 30 دقيقة فقط | ⚡ |
| 2️⃣ | **ENH-05** | شبكة أمان — إذا انحرف أي رصيد | ⚡ |
| 3️⃣ | **ENH-03** | فحص يومي يكشف أي خلل | ⚡⚡ |
| 4️⃣ | **ENH-02** | سجل تدقيق — مطلب قانوني غالباً | ⚡⚡ |
| 5️⃣ | **ENH-01** | إقفال سنوي — قبل نهاية السنة المالية | ⚡⚡ |
| 6️⃣ | **ENH-14** | KPIs — قيمة بصرية فورية للإدارة | ⚡⚡⚡ |
| 7️⃣ | **ENH-09** | قيود متكررة — توفير وقت يومي | ⚡⚡⚡ |
| 8️⃣ | **ENH-13** | أعمار الذمم — إدارة تدفق نقدي | ⚡⚡⚡ |

---

## ✅ الخلاصة

بتنفيذ **Phase 1 فقط** (5 تحسينات)، النظام يصبح:
- ✅ **آمن** — سجل تدقيق + فحص سلامة + حماية المسارات
- ✅ **دقيق** — إعادة حساب أرصدة + إقفال سنوي
- ✅ **موثوق** — يكتشف الأخطاء قبل أن تتراكم

بتنفيذ **Phase 1 + 2**، النظام يصبح:
- ✅ **مرن** — عملات متعددة + مراكز تكلفة + ميزانيات + تسوية بنكية
- ✅ **ذكي** — قيود متكررة + ضريبة متقدمة
- ✅ **يتهيأ على أي شي** — سواء فرع واحد أو 50 فرع

بتنفيذ **كل المراحل الأربع**:
- ✅ **Enterprise-Grade** — يُنافس أنظمة مثل Odoo و QuickBooks في القدرات المحاسبية

---

> **ملاحظة:** هذه الخطة مبنية على تحليل الكود الفعلي (22 إصلاح + فحص شامل لكل ملف). كل تحسين مُصمم ليكون **إضافياً** (لا يكسر الكود الحالي) و**تدريجياً** (يمكن تنفيذه مستقلاً).

> **هل تريد أبدأ بتنفيذ Phase 1 الآن؟** 🚀
