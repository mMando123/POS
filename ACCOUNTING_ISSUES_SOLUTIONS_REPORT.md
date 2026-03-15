# تقرير المشاكل والحلول المحاسبية
## POS/ERP — تحديث تنفيذي بعد المعالجة الفعلية على MySQL

**تاريخ التحديث:** 22 فبراير 2026  
**نوع المراجعة:** Accounting Integrity (تنفيذ + تحقق)  
**بيئة التنفيذ:** قاعدة البيانات الفعلية (MySQL)

---

## 1) الملخص التنفيذي

تم تنفيذ البنود المطلوبة عمليًا وليس نظريًا فقط:

1. تشغيل backfill الكامل على MySQL.
2. معالجة حالات `completed + payment_status=pending`.
3. تسوية أرصدة الموردين بعد الترحيل.
4. تنفيذ تحسين `M-01` بإضافة `supplier_id` مباشر في `gl_journal_entries` مع migration/backfill.
5. استخراج قائمة أوامر بدون COGS وتوليد/ترحيل تسويات تاريخية لها.
6. إقفال فجوة تقييم المخزون عبر قيد تسوية نهائي (Inventory Reconciliation JE).

**الخلاصة الحالية:**
- دورة المبيعات والشراء والـ AP أصبحت أكثر اتساقًا.
- فجوة COGS **المطلوبة فعليًا** أُغلقت بالكامل (`completed_without_required_cogs_je = 0`).
- فجوة المخزون مقابل GL تم إغلاقها بالكامل (Gap = 0).
- تم إغلاق ربط `supplier_id` لقيود AP التاريخية بالكامل عبر مورد Legacy تجميعي.
- المتبقي الآن هو **مراجعة رقابية** لحالتين شاذتين عاليتي القيمة بدون حركة مخزون.

---

## 2) النتائج الرقمية بعد التنفيذ

### 2.1 الأوامر والمبيعات

- `completed_orders`: **102**
- `completed_pending`: **0** ✅
- `completed_without_sales_je`: **0** ✅
- `completed_without_cogs_je` (إجمالي): **2** ℹ️
- `completed_without_required_cogs_je` (مع وجود حركة مخزون): **0** ✅
- `completed_without_stock_and_without_cogs`: **2** ℹ️

### 2.1.1 حالة تسوية COGS التاريخي

- تم توليد مقترحات لـ **70** أمر.
- تم ترحيل قيود فعلية لـ **68** أمر.
- إجمالي المبلغ المرحّل: **1913.94**.
- الحالتان المتبقيتان لا تحتويان على حركة مخزون أصلًا، لذلك لا تُصنّفان حاليًا كـ COGS مطلوب:
  - `20260131-0022` (إجمالي: `9,090,000.00`)
  - `20260131-0028` (إجمالي: `9,090,000.00`)

### 2.2 المشتريات والموردون

- `purchase_receipts_without_je`: **0** ✅
- `purchase_receipts_without_je_amount`: **0.00** ✅
- `supplier_mismatches` (GL vs current_balance): **0** ✅

### 2.3 تغطية `supplier_id` داخل القيود (M-01)

- AP posted entries (`purchase_receipt`, `supplier_payment`, `purchase_return`): **24**
- entries with direct `supplier_id`: **24** ✅
- entries without direct `supplier_id`: **0** ✅
- تم إنشاء مورد Legacy تجميعي: `SUP-LEGACY` برصيد حالي **2375.00** لتجميع القيود التاريخية غير القابلة للإسناد الفردي.

### 2.4 المخزون مقابل GL

- `inventory_gl (1100)`: **3975.36**
- `stock_valuation (qty × avg_cost)`: **3975.36**
- `inventory_gap`: **0.00** ✅

---

## 3) حالة البنود المطلوبة

| ID | البند | الحالة الحالية | ملاحظات |
|---|---|---|---|
| C-02 | حالات `completed + pending` | ✅ مغلق تشغيليًا | تم إصلاح 4 حالات بإستراتيجية `reopen_order` |
| C-06 | فجوة COGS التاريخية المطلوبة | ✅ مغلق | جميع الطلبات ذات حركة المخزون لديها قيد COGS |
| C-06A | أوامر شاذة بدون حركة مخزون | ⚠️ ملاحظة رقابية | حالتان عاليتا القيمة بدون `stock_movements` (ليستا COGS gap تقنيًا) |
| I-RECON | فجوة المخزون مقابل GL | ✅ مغلق | تم ترحيل القيد `JE-2026-000164` بقيمة `1943.86` |
| M-02 | Audit Trail مستقل | ✅ مغلق | `GLAuditLog` + logging + endpoint |
| M-03 | Year-End Close آلي | ✅ مغلق | `performYearEndClose` + endpoint |
| M-01 | الاعتماد على notes للمورد | ✅ مغلق | `supplier_id` مكتمل لكل قيود AP (مع Legacy fallback موثق) |

---

## 4) ما تم تنفيذه فعليًا

### 4.1 تشغيل backfill والتسوية

- تم تشغيل:

```bash
node backend/src/scripts/run-accounting-backfill.js
```

- نتائج التشغيل الأهم:
  - إصلاح حالات الأوامر غير المتسقة (`completed/pending`) = **4**
  - إنشاء COGS تقديري إضافي = **32** (في أول تشغيل)
  - لا فروقات موردين بعد التسوية

### 4.2 إغلاق M-01 تقنيًا

تم تنفيذ التالي:

1. إضافة عمود `supplier_id` إلى `gl_journal_entries` في الموديل.
2. تمرير `supplierId` من دوال AP (`purchase_receipt`, `supplier_payment`, `purchase_return`) عند إنشاء القيد.
3. تعديل احتساب رصيد المورد في `getSupplierGLBalance` ليعتمد على:
   - `supplier_id` مباشرة (أساسي)
   - fallback للـ notes القديمة (legacy)
4. تنفيذ migration:

```bash
node backend/src/scripts/migrate-journal-supplier-id.js
```

- migration أضاف العمود + index + backfill:
  - من notes: **8**
  - من source documents: **6**

### 4.3 استخراج وترحيل COGS التاريخي

تم تنفيذ خطوتين:

1. توليد مقترحات التسوية:

```bash
node backend/src/scripts/generate-missing-cogs-settlements.js
```

2. ترحيل القيود المعتمدة تلقائيًا:

```bash
node backend/src/scripts/post-missing-cogs-settlements.js --apply
```

**نتيجة الترحيل الفعلي:**
- `proposals_in_file`: **70**
- `candidates`: **68**
- `posted`: **68**
- `failed`: **0**
- `total_posted_amount`: **1913.94**

**مخرجات التقارير:**
- `backend/reports/missing-cogs-settlement-proposals-2026-02-22T12-53-31-323Z.json`
- `backend/reports/missing-cogs-settlement-proposals-2026-02-22T12-53-31-323Z.csv`
- `backend/reports/missing-cogs-settlement-proposals-2026-02-22T12-53-31-323Z.md`
- `backend/reports/post-missing-cogs-settlements-summary-2026-02-22T12-52-06-964Z.json`

### 4.4 تسوية فجوة المخزون (Inventory Reconciliation)

تم إضافة وتشغيل سكربت تسوية المخزون:

```bash
node backend/src/scripts/reconcile-inventory-gl.js --apply
```

**نتيجة التنفيذ الفعلي:**
- تم ترحيل قيد: **`JE-2026-000164`**
- القيد: `Dr 1100 / Cr 3002` بمبلغ **1943.86**
- بعد التنفيذ: `inventory_gap = 0.00` ✅

**ملف التوثيق:**
- `backend/reports/inventory-gl-reconciliation-2026-02-22T13-08-21-723Z.json`

### 4.5 تجهيز معالجة الحالتين الشاذتين (Manual COGS Outliers)

تم إضافة سكربت تشغيلي للإدخال اليدوي المعتمد للحالات الشاذة (اختياري عند الحاجة المحاسبية):

```bash
node backend/src/scripts/post-manual-cogs-outliers.js
```

ويتم الترحيل بعد اعتماد المبالغ بهذه الصيغة:

```bash
node backend/src/scripts/post-manual-cogs-outliers.js --set=20260131-0022:10.50,20260131-0028:12.00 --apply
```

### 4.6 إغلاق قيود AP التاريخية بدون `supplier_id`

تم إضافة وتشغيل سكربت Backfill لمشكلة `supplier_id` المفقود:

```bash
node backend/src/scripts/backfill-legacy-ap-supplier.js --apply
```

**نتيجة التنفيذ الفعلي:**
- `scanned`: **10**
- `updated_entries`: **10**
- `updated_source_docs`: **10** (purchase receipts)
- `legacy_assigned`: **10**
- `failed`: **0**

**مخرجات:**
- `backend/reports/backfill-legacy-ap-supplier-summary-2026-02-22T14-16-15-681Z.json`

---

## 5) المتبقي لإغلاق التقرير 100%

1. **مراجعة رقابية لحالتين شاذتين في المبيعات:**
   - الأوامر: `20260131-0022` و`20260131-0028`.
   - الملاحظة: قيمة كل أمر مرتفعة جدًا (`9,090,000.00`) ولا توجد لهما حركة مخزون.
   - تحقق فني: `menu_id` المرتبط بالبند غير موجود حاليًا في جدول `menu` ولا توجد له مشتريات تاريخية في `purchase_receipt_items`.
   - المطلوب: قرار إداري/تدقيقي (تأكيد صحة العملية، أو عكسها محاسبيًا إن كانت عملية اختبار/خطأ إدخال).

---

## 6) الحكم النهائي المحدث

- **من ناحية التنفيذ:** تم تنفيذ النقاط التي طلبتها وتشغيلها فعليًا.
- **من ناحية الجاهزية التدقيقية:** النظام الآن قوي محاسبيًا على مستوى الدورة اليومية، مع بقاء ملاحظة رقابية تخص عمليتين شاذتين تحتاجان قرار إدارة.

**التقييم الحالي:**
- جاهز تشغيليًا للمحاسبة اليومية ✅
- جاهز تدقيقيًا بشكل مشروط ⚠️ بعد توثيق قرار الإدارة بشأن العمليتين الشاذتين

---

## 7) تحديث إصلاحي إضافي (22 فبراير 2026 — تنفيذ فعلي)

تم تنفيذ إصلاحات هيكلية إضافية بعد التقرير أعلاه لمعالجة نقاط التدقيق المفتوحة:

### 7.1 بُعد الفروع (Multi-Branch Accounting) — ✅ مغلق

**تنفيذ تقني:**
- إضافة `branch_id` إلى:
  - `purchase_receipts`
  - `purchase_returns`
  - `supplier_payments`
- تحديث المسارات لضمان تعبئة `branch_id` عند الإنشاء:
  - `backend/src/routes/purchases.js`
  - `backend/src/routes/purchaseReturns.js`
  - `backend/src/routes/suppliers.js`
- إضافة fallback داخل `AccountingService` لاشتقاق الفرع من المستودع/أمر الشراء عند غيابه.

**ترحيل البيانات التاريخية:**

```bash
node backend/src/scripts/migrate-accounting-branch-and-collation.js
```

**نتيجة بعد التنفيذ:**
- `purchase_receipt` قيود بدون branch: **0**
- `purchase_return` قيود بدون branch: **0**
- `supplier_payment` قيود بدون branch: **0**

### 7.2 تعارض Collation في الربط المرجعي — ✅ مغلق

تم توحيد `gl_journal_entries.source_id` إلى `utf8mb4_bin` ليتوافق مع UUID columns.

**نتيجة بعد التنفيذ:**
- `orders.id`, `stock_movements.source_id`, `gl_journal_entries.source_id` كلها بنفس collation (`utf8mb4_bin`).

### 7.3 منع COGS غير القابل للتتبع مستقبلًا — ✅ مغلق للمستقبل

تم تعزيز `recordCOGS` في:
- `backend/src/services/accountingService.js`

**السلوك الجديد:**
- إذا كان الطلب يحتوي أصناف `track_stock=true` ولا توجد حركات `stock OUT` مقابلة، يتم **رمي خطأ محاسبي** وإلغاء المعاملة (rollback).
- تم منع قبول COGS ناقص/غير متتبع في المسار التشغيلي الحي.

### 7.4 إصلاح انحراف `gl_accounts.current_balance` عن الدفتر — ✅ مغلق

تم اكتشاف فروقات كاشية في بعض الحسابات (`current_balance`) مقابل الرصيد الحقيقي من القيود.

**إصلاح منفذ:**

```bash
node backend/src/scripts/rebuild-account-balances.js
```

**نتيجة:**
- عدد الحسابات المصححة: **7**
- فروقات الكاش بعد الإصلاح: **0**

### 7.5 تسوية نهائية لفجوة المخزون مقابل GL — ✅ مغلق

تم تحديث سكربت التسوية ليحسب من قيود `posted` مباشرة (وليس من cache)، ثم تطبيق التسوية:

```bash
node backend/src/scripts/reconcile-inventory-gl.js --counter-account=3002 --apply
```

**نتيجة:**
- قيد التسوية: **JE-2026-000165**
- بعد التسوية:
  - `GL Inventory (1100) = 3975.36`
  - `Stock Valuation = 3975.36`
  - **Gap = 0.00**

### 7.6 شفافية COGS التاريخي غير المتتبع — ✅ موثق

تم تعليم كل قيود `order_cogs` التاريخية غير المرتبطة بحركة مخزون بإشارة تدقيقية داخل `notes`:

```bash
node backend/src/scripts/flag-untraceable-cogs.js
```

**نتيجة:**
- قيود COGS الموسومة كـ untraceable: **100**

> ملاحظة تدقيقية: هذا الإجراء لا يغيّر المبالغ التاريخية، بل يحولها من “مخفية” إلى “معلنة وموسومة” لشفافية المراجعة.

---

## 8) الحالة النهائية بعد آخر إصلاحات

### مغلق بالكامل
- سلامة القيد المزدوج (debit=credit) ✅
- Orphan / duplicate JE integrity ✅
- completed/pending inconsistency ✅
- branch dimension في دورة المشتريات/AP ✅
- collation mismatch في source linking ✅
- inventory vs GL reconciliation gap ✅
- current_balance cache integrity ✅

### مغلق للمستقبل + موثق تاريخيًا
- COGS traceability: تم **منع الخلل مستقبلًا** + **وسم كل الحالات التاريخية غير المتتبعة**.

### المتبقي إداري/تدقيقي (ليس خلل كود)
- اعتماد سياسة التعامل مع COGS التاريخي الموسوم (100 قيد):  
  إما القبول كمبالغ تاريخية موثقة كمقدرة، أو إعادة تقييمها يدويًا حسب سياسة المراجع الخارجي.

---

## 9) تحديث تنفيذي إضافي (23 فبراير 2026 — تنفيذ فعلي)

تم تنفيذ مرحلة COA Header/Subaccounts عمليًا مع تحصين يمنع الارتداد عند التشغيل:

### 9.1 تنفيذ ترقية Header/Subaccounts على MySQL — ✅ مكتمل

**الأمر المنفذ:**

```bash
node backend/src/scripts/migrate-coa-header-subaccounts.js --apply --promote-headers --remap-defaults
```

**نتيجة التحقق:**
- قاعدة البيانات المستهدفة: `pos_restaurant` (MySQL)
- عدد الحسابات الفرعية (`code` يحتوي `-`): **29**
- جميع `gl_account_defaults` مرتبطة بحسابات تشغيلية `is_header=false`: **✅**
- لا يوجد mapping افتراضي على حساب Header: **0**

### 9.2 تحصين Account Resolver ضد أي mapping قديم — ✅ مكتمل

**ملف محدث:**
- `backend/src/services/accountResolver.js`

**التحسين:**
- إضافة تحقق إلزامي أن الحساب النهائي Active + Posting.
- إذا وصل resolver لكود Header/Legacy (مثل `1002`) يتم التحويل تلقائيًا إلى أول حساب فرعي تشغيلي متاح (مثل `1002-01`) مع تحذير في السجل.
- منع فشل القيود مستقبلًا بسبب mapping قديم أو بيئة غير مهيأة بالكامل.

### 9.3 تصحيح تقرير المطابقة اليومية للبنك — ✅ مكتمل

**ملف محدث:**
- `backend/src/routes/reports.js`

**التحسين:**
- التقرير لم يعد يعتمد على `a.code = '1002'` فقط.
- أصبح يعتمد على حساب البنك الفعلي من `AccountResolver` مع تغطية:
  - الكود المحدد
  - الكود الجذري
  - كل الحسابات الفرعية (`1002-*`)

**الأثر:**
- إيقاف ظهور قيم GL صفرية كاذبة في المطابقة البنكية عند استخدام بنوك فرعية.

### 9.4 منع سكربت Seed من تخريب الشجرة بعد الإقلاع — ✅ مكتمل

**ملف محدث:**
- `backend/src/scripts/seed-chart-of-accounts.js`

**المشكلة السابقة:**
- عند كل تشغيل كان seed يعيد ربط بعض الحسابات (مثل `5101..5105`) على الأب القديم، فيفك الهيكل الجديد.

**الإصلاح:**
- ربط `parent_id` أصبح يتم فقط إذا:
  - الحساب تم إنشاؤه الآن، أو
  - الحساب لا يملك `parent_id` أصلًا.
- أي شجرة مخصصة موجودة مسبقًا تبقى محفوظة ولا يعاد كسرها.

**تحقق بعد الإصلاح:**
- تشغيل seed ثم فحص الأبناء `5101..5105` قبل/بعد أثبت ثبات الربط تحت `5100` بدون ارتداد.

### 9.5 ملاحظة تدقيقية متبقية (تاريخية)

- توجد قيود تاريخية سابقة على حسابات أصبحت Header الآن (عددها عند الفحص: **417** سطر قيد).
- هذا **ليس خلل تشغيل حالي**، لكنه يحتاج قرار سياسة:
  - إما الإبقاء مع اعتماد تاريخ قطع (Cutover) وتوثيق رسمي.
  - أو تنفيذ إعادة تصنيف تاريخية Controlled Reclass كمرحلة مستقلة.

---

## 10) تنفيذ سياسة Cutover (23 فبراير 2026 — تنفيذ فعلي)

تم اعتماد وتنفيذ خيار **Cutover** فعليًا (الموصى به محاسبيًا) بدل إعادة التصنيف التاريخي الفوري.

### 10.1 تاريخ القطع المعتمد

- **Cutover Date:** `2026-02-24`
- المعنى المحاسبي:
  - كل ما قبل هذا التاريخ يُعامل كـ **Legacy تاريخي موثق**.
  - من هذا التاريخ فصاعدًا لا يُقبل أي ترحيل على Header.

### 10.2 سكربت التنفيذ

**ملف جديد:**
- `backend/src/scripts/apply-coa-cutover-policy.js`

**أوامر التنفيذ:**

```bash
node backend/src/scripts/apply-coa-cutover-policy.js --cutover=2026-02-24
node backend/src/scripts/apply-coa-cutover-policy.js --cutover=2026-02-24 --apply
```

### 10.3 نتائج فعلية بعد التنفيذ

- `header_lines_total`: **417**
- `legacy_header_lines` (قبل القطع): **417**
- `post_cutover_header_lines` (بعد القطع): **0**
- عدد القيود الموسومة كـ legacy داخل `notes`: **214**
- تم تسجيل حدث تدقيقي في `gl_audit_logs`:
  - `event_type = coa_cutover_adopted`
  - `source_id = coa_cutover:2026-02-24`

### 10.4 مخرجات تدقيقية محفوظة

- تقرير JSON:
  - `backend/reports/coa-cutover-policy-2026-02-23T11-23-14-639Z.json`

### 10.5 الحكم بعد Cutover

- **تشغيليًا:** لا يوجد خرق بعد تاريخ القطع ✅
- **تدقيقيًا:** التاريخ السابق أصبح معلنًا وموسومًا (Legacy) وقابلًا للتتبع ✅
- **المتبقي:** إعادة تصنيف تاريخي كامل اختيارية (قرار إدارة)، وليست شرطًا للتشغيل اليومي.

---

## 11) إكمال المرحلة 5 (التقارير والاعتماد) — 23 فبراير 2026

### 11.1 تطوير التقارير المحاسبية — ✅ مكتمل تقنيًا

تم توسيع تقارير المحاسبة لدعم:
- عرض هرمي `Header + Subaccounts` (`includeHierarchy=true`)
- فلاتر تشغيلية:
  - `branchId`
  - `sourceType/sourceId` (مرجعية مستند/مشروع)
  - `accountCode/accountCodePrefix` (فلترة حساب فرعي/عائلة)

**ملفات محدثة:**
- `backend/src/services/accountingService.js`
- `backend/src/routes/accounting.js`

### 11.2 متابعة دورية لالتزام Cutover — ✅ مكتمل

**ملف جديد:**
- `backend/src/scripts/check-coa-cutover-compliance.js`

**تشغيل فعلي:**
```bash
node backend/src/scripts/check-coa-cutover-compliance.js --cutover=2026-02-24 --strict
```

**النتيجة الحالية:**
- `compliant = true`
- `violating_lines = 0`

### 11.3 مخرجات إغلاق وتحقق نهائي — ✅ تم إصدارها

- `COA_PHASE_CLOSURE_REPORT.md`
- `COA_FINAL_VERIFICATION_REPORT.md`

---

## 12) إقفال المتبقي الإداري (UAT) — 23 فبراير 2026

### 12.1 حزمة إثبات UAT مالي — ✅ تمت إضافتها

**سكربت جديد:**
- `backend/src/scripts/generate-coa-uat-evidence.js`

**الهدف:**
- إصدار تقرير Evidence آلي (JSON + MD) بمعيار PASS/FAIL ل بنود القبول المحاسبي.

**أمر التشغيل:**
```bash
node backend/src/scripts/generate-coa-uat-evidence.js --cutover=2026-02-24 --periodTo=2026-02
```

**بنود الفحص داخل التقرير:**
- عدم وجود ترحيل Post-cutover على Header.
- سلامة ربط `gl_account_defaults` بحسابات Posting فقط.
- اتزان Trial Balance.
- اتزان Balance Sheet.
- فصل ضريبة المدخلات/المخرجات (1300/2100).
- تصفير رصيد عائلة 1105 ضمن نطاق الفترة.
- وجود حدث اعتماد Cutover داخل `gl_audit_logs`.

### 12.2 نموذج توقيع رسمي — ✅ تمت إضافته

- `COA_FINANCIAL_UAT_SIGNOFF_TEMPLATE.md`

النموذج يتضمن:
- أوامر الإثبات الإلزامية.
- Checklist مالي Pass/Fail.
- قرار Go/No-Go.
- توقيع CFO + المراجع الداخلي + مسؤول النظام.

### 12.3 أوامر npm تشغيلية — ✅ تمت إضافتها

في `backend/package.json`:

```bash
npm run coa:cutover:check
npm run coa:uat:evidence
```

**الأثر:**
- المتبقي لم يعد تقنيًا؛ المتبقي الآن توقيع اعتماد UAT من الإدارة المالية فقط.
