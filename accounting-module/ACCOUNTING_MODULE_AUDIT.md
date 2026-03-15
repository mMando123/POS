# 📋 تقرير مراجعة شامل لموديول المحاسبة (Accounting Module Audit Report)

**تاريخ المراجعة:** 2026-02-23  
**المراجع:** استشاري ERP/POS محاسبي متخصص  
**النظام:** Standalone Accounting Module (ERPNext-Inspired)  
**التقنية:** Node.js + Sequelize + MySQL  

---

## 📊 ملخص تنفيذي (Executive Summary)

تم بناء موديول محاسبي مستقل (Standalone) يحاكي البنية الأساسية لنظام ERPNext، ويشمل: شجرة حسابات هرمية، محرك قيود مزدوجة (Double Entry Engine)، إدارة فترات مالية، تقارير مالية أساسية، وآلية ربط الكيانات التشغيلية بالحسابات.

### التقييم العام:

| المعيار | التقييم | ملاحظة |
|---------|---------|--------|
| البنية المعمارية | ⭐⭐⭐⭐ (4/5) | معمارية نظيفة ومنفصلة |
| نموذج البيانات (Schema) | ⭐⭐⭐ (3/5) | يحتاج تحسينات جوهرية |
| محرك القيود (Journal Engine) | ⭐⭐⭐ (3/5) | أساس قوي لكن بأخطاء حرجة |
| التقارير المالية | ⭐⭐⭐ (3/5) | تعمل ولكن ناقصة |
| الأمان والتحقق (Validation) | ⭐⭐ (2/5) | ضعيف ويحتاج تعزيز كبير |
| جاهزية الإنتاج | ⭐⭐ (2/5) | لا يصلح للإنتاج في وضعه الحالي |

---

## 🔴 أخطاء حرجة يجب إصلاحها فوراً (Critical Bugs)

### 1. ❌ رقم القيد عشوائي (Entry Number is Random)
**الملف:** `services/journalService.js` — السطر 97  
**المشكلة:**
```javascript
const entryNumber = `JV-${yearStr.substring(0,4)}-${Math.floor(Math.random() * 99999).toString().padStart(5, '0')}`;
```
- يستخدم `Math.random()` لتوليد رقم القيد.
- **في بيئة الإنتاج:** ستحدث تصادمات (Collisions) حتمية عند إنشاء أكثر من عدة مئات من القيود.
- **المعيار المحاسبي:** رقم القيد يجب أن يكون **تسلسلي صارم (Sequential)** بدون فجوات، لأن أي فجوة تعني احتمال حذف قيد وهذا مخالف لقوانين المراجعة.

**الحل المطلوب:**
```javascript
// استخدام عداد تسلسلي مخزّن في جدول أو قفل قاعدة البيانات
const lastEntry = await JournalEntry.findOne({
    where: { company_id: companyId },
    order: [['created_at', 'DESC']],
    lock: true, // row lock
    transaction: _txn
});
const nextNum = (lastEntry ? parseInt(lastEntry.entry_number.split('-')[2]) + 1 : 1);
const entryNumber = `JV-${yearStr}-${nextNum.toString().padStart(5, '0')}`;
```

---

### 2. ❌ لا يوجد Audit Log (سجل تدقيق)
**المشكلة:** النظام يعد بسجل تدقيق (Audit Trail) لكن لا يوجد:
- لا يوجد جدول `acm_audit_logs`.
- لا يوجد Model مخصص لـ AuditLog.
- لا توجد أي آلية لتسجيل من أنشأ القيد، من عدّله، من رحّله، من ألغاه.

**في ERPNext:** كل عملية تُسجل بـ: `user_id`, `action`, `timestamp`, `old_value`, `new_value`.

**الخطورة المحاسبية:** بدون Audit Log، لا يمكن اجتياز أي تدقيق مالي (Financial Audit).

---

### 3. ❌ لا يوجد `created_by` / `posted_by` / `cancelled_by`
**الملف:** `models/JournalEntry.js`  
**المشكلة:** القيد المحاسبي لا يسجل:
- من أنشأ القيد (`created_by`)
- من رحّله (`posted_by`)
- من ألغاه (`cancelled_by`)
- تواريخ كل عملية (`posted_at`, `cancelled_at`)

**متطلب إلزامي في كل نظام ERP.**

---

### 4. ❌ فحص توازن القيد يستخدم النقطة العائمة (Float Comparison)
**الملف:** `services/journalService.js` — السطر 86-91  
```javascript
totalDebit = parseFloat(totalDebit.toFixed(6));
totalCredit = parseFloat(totalCredit.toFixed(6));
if (totalDebit !== totalCredit) { ... }
```
**المشكلة:**
- `parseFloat` و `.toFixed()` لا يعالج مشاكل الدقة الرياضية بشكل نهائي.
- مبلغ مثل `0.1 + 0.2` في JavaScript لا يساوي `0.3`.
- القيمة `DECIMAL(15,2)` في MySQL تعود كـ `string` من Sequelize.

**الحل الصحيح:**
```javascript
// تحويل لأعداد صحيحة (هللات) أو استخدام مكتبة مثل decimal.js
const toInt = (val) => Math.round(parseFloat(val) * 100);
const totalDebitInt = lines.reduce((sum, l) => sum + toInt(l.debit), 0);
const totalCreditInt = lines.reduce((sum, l) => sum + toInt(l.credit), 0);
if (totalDebitInt !== totalCreditInt) throw new Error('Unbalanced');
```

---

### 5. ❌ `is_active` check غير موجود عند إنشاء القيود
**الملف:** `services/journalService.js`  
**المشكلة:** عند إنشاء قيد، يتم التحقق أن الحساب ليس `is_group` ولكن **لا يتم التحقق أن الحساب `is_active=true`**. يمكن للمستخدم الترحيل على حساب معطّل.

---

### 6. ❌ Trial Balance Route يستدعي `_getAggregatedAccountBalances` بلا داعٍ
**الملف:** `routes/reports.js` — السطر 34  
```javascript
const tbData = await ReportService._getAggregatedAccountBalances(...); // ← بلا داعي
const report = await ReportService.getTrialBalance(...); // ← يستدعيها مرة ثانية داخلياً
```
**المشكلة:** يتم استدعاء نفس الدالة الثقيلة مرتين. هذا هدر للموارد ويضاعف حمل الاستعلام.

---

## 🟡 نقاط ضعف هيكلية (Structural Weaknesses)

### 7. ⚠️ نموذج `Company` ناقص جداً
**الحالي:** لا يحتوي إلا على `name, abbr, currency, is_active`.  
**المطلوب في ERPNext:**
- `tax_id` (الرقم الضريبي)
- `default_cost_center_id`
- `default_currency`
- `fiscal_year_start_month`
- `address`
- `phone`
- `email`
- `parent_company_id` (للشركات الفرعية)

---

### 8. ⚠️ نموذج `Account` لا يدعم الاسم العربي
**المشكلة:** يوجد حقل `name` واحد فقط.  
**المطلوب في سوق سعودي:** حقلان: `name_ar`, `name_en` لدعم التقارير ثنائية اللغة وإلزامات هيئة الزكاة والضريبة (ZATCA).

---

### 9. ⚠️ لا يوجد جدول `Currency` ولا دعم متعدد العملات
**المشكلة:** نظام ERP دولي يجب أن يدعم:
- تعدد العملات في كل سطر قيد (`currency`, `exchange_rate`, `amount_in_company_currency`)
- جدول أسعار الصرف

**الأثر:** حالياً يعمل بالريال السعودي فقط. أي عميل لديه تعاملات بالدولار أو اليورو لن يُخدم.

---

### 10. ⚠️ `AccountDefault` يحتوي على 9 مفاتيح فقط بدلاً من 15+
**الحالي:**
```
default_cash_account, default_bank_account, default_receivable_account,
default_inventory_account, default_payable_account, default_tax_output_account,
default_tax_input_account, default_income_account, default_cogs_account
```
**الناقص (مطلوب في ERPNext):**
- `default_purchase_discount_account`
- `default_sales_discount_account`
- `default_write_off_account`
- `default_exchange_gain_loss_account`
- `default_rounding_account`
- `default_advance_received_account`
- `default_advance_paid_account`

---

### 11. ⚠️ `JournalLine` لا يحتوي على `party_type` و `party_id`
**في ERPNext:** كل سطر في القيد يمكن أن يُربط بطرف ثالث (Customer, Supplier, Employee).  
بدون هذين الحقلين، لا يمكن:
- عمل كشف حساب عميل محدد.
- عمل كشف حساب مورد محدد.
- تتبع الأرصدة المعلقة لكل طرف.

---

### 12. ⚠️ شجرة الحسابات الأولية ناقصة
**الموجود:** 27 حساب فقط.  
**الناقص:**
- `1200 - Fixed Assets` (أصول ثابتة)
- `1210 - Accumulated Depreciation` (مجمع الإهلاك)
- `2200 - Long-Term Liabilities` (خصوم طويلة الأجل)
- `5300 - Administrative Expenses` (مصاريف إدارية)
- `5240 - Depreciation Expense` (مصروف الإهلاك)
- `5250 - Insurance Expense` (مصروف التأمين)
- `4300 - Other Income` (إيرادات أخرى)
- `2130 - Employee Benefits Payable` (مستحقات الموظفين)

---

### 13. ⚠️ `AccountResolver` لا يطبق Fallback Strategy
**المواصفة الأصلية:**
```
Specific Mapping → Default Account Setting → Strict Error
```
**الحالي:** يرمي خطأ مباشرة إذا لم يجد الـ Mapping. لا يحاول الرجوع لـ `AccountDefault`.

---

### 14. ⚠️ لا يوجد Input Validation Middleware
**الملف:** `routes/accounts.js`, `routes/journals.js`  
**المشكلة:** لا تتحقق الـ Route من مدخلات المستخدم:
- لا يفحص أن `companyId` هو UUID صالح.
- لا يفحص أن `entry_date` بصيغة تاريخ صحيحة.
- لا يفحص أن `debit` و `credit` أرقام موجبة.
- لا يمنع إرسال حقول خبيثة (Mass Assignment).

**الحل:** استخدام `express-validator` أو `joi`.

---

### 15. ⚠️ `Balance Sheet` لا تحسب الأرصدة الافتتاحية (Opening Balances)
**المشكلة:** عند بداية سنة مالية جديدة، يجب ترحيل الأرصدة (Closing Balance → Opening Balance). حالياً لا توجد آلية لذلك.

---

### 16. ⚠️ `Seed` يستخدم `force: true` مما يمسح كل البيانات
**الملف:** `seeders/run-all.js`  
```javascript
await sequelize.sync({ force: true }); // ← يحذف كل الجداول والبيانات!
```
**الخطورة:** إذا شُغّل بالخطأ في الإنتاج، سيمحو كل البيانات المحاسبية.  
**الحل:** يجب أن يكون idempotent (يتحقق قبل الإنشاء).

---

## 🟢 نقاط القوة (Strengths)

| # | النقطة | التفصيل |
|---|--------|---------|
| 1 | **بنية معمارية نظيفة** | فصل واضح بين Models, Services, Routes (Clean Architecture) |
| 2 | **Double Entry مُطبّق** | محرك القيود يرفض أي قيد غير متوازن |
| 3 | **حماية Group Accounts** | يمنع الترحيل على الحسابات التجميعية |
| 4 | **Reversal Logic** | إلغاء القيد يتم بقيد عكسي (وليس حذف)، وهذا صحيح محاسبياً 100% |
| 5 | **Fiscal Period Control** | يمنع الترحيل في فترة مغلقة |
| 6 | **Multi-Company Isolation** | كل بيانات المحاسبة مُعزلة بـ `company_id` |
| 7 | **Entity Mapping Pattern** | ربط PaymentMethod / ExpenseType / Warehouse بحسابات |
| 8 | **Modular Monolith** | الموديول مستقل لكنه مدمج في نفس العملية |

---

## 📐 مقارنة مع ERPNext

| المكون | ERPNext | النظام الحالي | الفجوة |
|--------|---------|---------------|--------|
| Chart of Accounts | 100+ حساب + قوالب جاهزة لكل دولة | 27 حساب ثابت | كبيرة |
| Multi-Currency | ✅ كامل مع أسعار صرف | ❌ غير موجود | حرجة |
| Party Ledger | ✅ (Customer/Supplier sub-ledger) | ❌ غير موجود | حرجة |
| Audit Log | ✅ كل عملية مسجلة | ❌ غير موجود | حرجة |
| Sequential Numbering | ✅ تسلسلي بدون فجوات | ❌ عشوائي | حرجة |
| Opening Balances | ✅ ترحيل آلي | ❌ غير موجود | متوسطة |
| Tax Integration | ✅ ZATCA, VAT | ❌ جدول فقط | كبيرة |
| Budget Management | ✅ ميزانيات تقديرية | ❌ غير موجود | متوسطة |
| Bank Reconciliation | ✅ مطابقة بنكية | ❌ غير موجود | كبيرة |
| Aging Report | ✅ أعمار الديون | ❌ غير موجود | متوسطة |

---

# 🗺️ خطة التطوير (Development Roadmap)

## المرحلة 1: إصلاح الأخطاء الحرجة (Critical Fixes) ← أسبوع 1

### 1.1 إصلاح ترقيم القيود (Sequential Entry Numbering)
- [ ] إنشاء جدول `acm_sequences` لحفظ العدادات.
- [ ] تعديل `journalService.js` لاستخدام عداد تسلسلي مع قفل (Lock).
- [ ] ضمان عدم وجود فجوات في الأرقام.

### 1.2 إنشاء نظام Audit Log
- [ ] إنشاء Model `AuditLog.js`:
  ```
  acm_audit_logs: id, company_id, entity_type, entity_id,
  action (create/update/post/cancel), user_id, old_values (JSON),
  new_values (JSON), ip_address, created_at
  ```
- [ ] إنشاء `auditService.js` يسجل كل عملية تلقائياً.
- [ ] تعديل `journalService` لتسجيل: create, post, cancel.

### 1.3 إضافة حقول المسؤولية للقيد
- [ ] إضافة لـ `JournalEntry`:
  - `created_by` (UUID)
  - `posted_by` (UUID)
  - `cancelled_by` (UUID)
  - `posted_at` (DATETIME)
  - `cancelled_at` (DATETIME)

### 1.4 إصلاح الدقة الرياضية
- [ ] تثبيت مكتبة `decimal.js` أو تحويل المعاملات بالهللات (cents).
- [ ] تعديل كل حسابات `parseFloat` في `journalService` و `reportService`.

### 1.5 إضافة فحص `is_active` عند إنشاء القيود
- [ ] تعديل `journalService.createJournalEntry` لرفض الحسابات المعطلة.

---

## المرحلة 2: تعزيز النماذج (Model Enhancement) ← أسبوع 2

### 2.1 تحسين نموذج Company
- [ ] إضافة: `tax_id`, `address`, `phone`, `email`, `parent_company_id`, `default_cost_center_id`, `fiscal_year_start_month`.

### 2.2 دعم الاسم العربي
- [ ] تعديل `Account` ليحتوي: `name_ar`, `name_en` بدلاً من `name`.
- [ ] تعديل `CostCenter` بالمثل.
- [ ] تعديل كل التقارير لتدعم اللغتين.

### 2.3 إضافة `party_type` و `party_id` للقيود
- [ ] إضافة لـ `JournalLine`:
  - `party_type` (ENUM: 'Customer', 'Supplier', 'Employee', NULL)
  - `party_id` (UUID, NULL)
- [ ] تحديث التقارير لتتمكن من تصفية كشف الحساب بالطرف.

### 2.4 استكمال AccountDefaults
- [ ] إضافة المفاتيح الناقصة:
  `default_purchase_discount_account`, `default_sales_discount_account`,
  `default_write_off_account`, `default_exchange_gain_loss_account`,
  `default_rounding_account`, `default_advance_received_account`.

---

## المرحلة 3: توسعة شجرة الحسابات + Validation ← أسبوع 3

### 3.1 توسعة شجرة الحسابات (COA Template)
- [ ] إضافة حسابات الأصول الثابتة ومجمع الإهلاك.
- [ ] إضافة الخصوم طويلة الأجل.
- [ ] إضافة المصاريف الإدارية والتأمينية.
- [ ] إنشاء COA Template خاص بالمملكة العربية السعودية.
- [ ] دعم استيراد شجرة من ملف JSON/Excel.

### 3.2 Input Validation Middleware
- [ ] تثبيت `express-validator` أو `joi`.
- [ ] إنشاء `validators/journalValidator.js`.
- [ ] إنشاء `validators/accountValidator.js`.
- [ ] التحقق من UUID Format لكل `companyId`.
- [ ] التحقق من تنسيق التاريخ.
- [ ] منع Mass Assignment.

### 3.3 تطبيق Fallback Strategy في AccountResolver
- [ ] تعديل `resolvePaymentMethod` لتطبيق:
  ```
  PaymentMethod.account_id → default_cash_account → Error
  ```

---

## المرحلة 4: تقارير متقدمة ← أسبوع 4

### 4.1 كشف حساب طرف ثالث (Party Ledger)
- [ ] بناء `getPartyLedger(companyId, partyType, partyId, startDate, endDate)`.

### 4.2 تقرير أعمار الديون (Aging Report)
- [ ] بناء `getAgingReport(companyId, partyType, asOfDate)`.
- [ ] تصنيف الأرصدة: 0-30 يوم، 31-60، 61-90، 90+.

### 4.3 تقرير حركة المخزون المحاسبية (Stock Ledger)
- [ ] بناء تقرير يُظهر حركة حسابات المخزون لكل مستودع.

### 4.4 تقرير الضرائب (Tax Report)
- [ ] جمع حسابات الضريبة (VAT Input vs Output) وحساب الفرق = المستحق.

### 4.5 Opening Balances (أرصدة الافتتاحية)
- [ ] بناء `openingBalanceService.js` لترحيل أرصدة الإغلاق كأرصدة افتتاح.

---

## المرحلة 5: ربط الـ POS بمحرك المحاسبة ← أسبوع 5-6

### 5.1 Auto Journal from POS Sale
- [ ] عند إتمام طلب POS مع الدفع:
  ```
  Dr: Cash/Bank Account (from PaymentMethod)
  Cr: Sales Revenue (from AccountDefault)
  ```

### 5.2 Auto Journal from Purchase
- [ ] عند استلام مشتريات:
  ```
  Dr: Inventory Account (from Warehouse)
  Cr: Accounts Payable/Cash
  ```

### 5.3 Auto Journal for COGS
- [ ] عند البيع (لكل صنف):
  ```
  Dr: COGS
  Cr: Inventory Account (from item's warehouse)
  ```

### 5.4 Auto Journal for Expenses
- [ ] عند تسجيل مصروف:
  ```
  Dr: Expense Account (from ExpenseType)
  Cr: Cash/Bank Account
  ```

---

## المرحلة 6: دعم متعدد العملات ← أسبوع 7

- [ ] إنشاء جدول `acm_currencies`.
- [ ] إنشاء جدول `acm_exchange_rates`.
- [ ] إضافة لـ `JournalLine`: `currency`, `exchange_rate`, `amount_in_company_currency`.
- [ ] حساب فروقات العملة تلقائياً.

---

## المرحلة 7: التكامل مع هيئة الزكاة (ZATCA) ← أسبوع 8

- [ ] دعم الفوترة الإلكترونية (E-Invoicing Phase 2).
- [ ] إعداد تقرير ضريبي ربع سنوي.
- [ ] تصدير بيانات بصيغ ZATCA المطلوبة.

---

## ⚡ أولويات التنفيذ الفورية

```
🔴 حرج (يجب قبل الإنتاج):
  1. إصلاح ترقيم القيود (Sequential)
  2. إنشاء Audit Log
  3. إصلاح الدقة الرياضية
  4. إضافة فحص is_active
  5. Input Validation Middleware

🟡 مهم (يجب قبل ربط الـ POS):
  6. party_type / party_id
  7. created_by / posted_by
  8. Fallback Strategy
  9. توسعة شجرة الحسابات

🟢 تحسينات (بعد الربط):
  10. Multi-Currency
  11. Aging Report
  12. ZATCA Integration
  13. Budget Management
```

---

## ✅ الخلاصة

الموديول الحالي يُعتبر **MVP (نسخة أولية تجريبية)** جيدة من ناحية الهيكل المعماري. الأساس سليم (Double Entry, Group Protection, Fiscal Control, Modular Design) ويمكن البناء عليه.

**لكنه لا يصلح للإنتاج في وضعه الحالي** بسبب غياب: الترقيم التسلسلي، Audit Log، الدقة الرياضية، و Input Validation.

**التوصية:** تنفيذ المرحلة 1 (Critical Fixes) فوراً قبل أي مرحلة أخرى، ثم بالتوازي تنفيذ المرحلة 2 و 3، ثم ربط الـ POS.

---

*هذا التقرير مُعد بواسطة استشاري ERP محاسبي متخصص.*
