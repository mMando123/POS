# تحليل مقارن: هيكل المحاسبة الحالي vs ERPNext
## هل الأساس المحاسبي الحالي يصلح للتحول إلى ERP؟

> **التاريخ:** 21 فبراير 2026  
> **الهدف:** تقييم جاهزية الهيكل المحاسبي للتحول من POS إلى ERP متكامل

---

## 1. كيف تعمل المحاسبة في ERPNext بالضبط؟

### ❌ خطأ شائع: ERPNext يعطيك شجرة فاضية

هذا **ليس دقيقاً 100%**. الحقيقة:

ERPNext يعطيك **قالب شجرة حسابات جاهز حسب الدولة** (Country Template).  
مثلاً لما تختار "Saudi Arabia" يُنشئ لك شجرة حسابات **سعودية جاهزة** فيها 100+ حساب.

لكن الفكرة الأساسية صحيحة: **أنت بتعدّل عليها حسب نشاطك**.

### منهج ERPNext الفعلي:

```
1. عند إنشاء Company جديدة:
   ├── يسألك: ما الدولة؟
   ├── يحمّل قالب COA الخاص بالدولة
   ├── يضيف حسابات افتراضية (Receivable, Payable, Stock, etc.)
   └── يربط كل "Account Type" بحساب افتراضي

2. أنت بتعدّل:
   ├── تضيف حسابات فرعية (sub-accounts) حسب نشاطك
   ├── تحذف/تعطل الحسابات اللي ما تناسبك
   └── تغير الأسماء حسب متطلباتك

3. النظام يستخدم "Account Types" مش "Account Codes":
   ├── "Default Receivable Account" → ممكن يكون أي حساب
   ├── "Default Payable Account" → ممكن يكون أي حساب
   ├── "Stock In Hand" → ممكن يكون أي حساب
   └── أنت بتربط الحسابات بالأنواع في الإعدادات
```

### الفرق الجوهري بين ERPNext ونظامك:

| النقطة | ERPNext 🏢 | نظامك الحالي 📟 |
|--------|-----------|-----------------|
| **كيف يعرف حساب المبيعات؟** | `company.default_income_account` ← ديناميكي | `ACCOUNTS.SALES_REVENUE = '4001'` ← Hard-coded |
| **كيف يعرف حساب المخزون؟** | `item_group.default_expense_account` ← ديناميكي | `ACCOUNTS.INVENTORY = '1100'` ← Hard-coded |
| **كيف يعرف حساب الصندوق؟** | `mode_of_payment.default_account` ← ديناميكي | `ACCOUNTS.CASH = '1001'` ← Hard-coded |
| **هل يدعم عدة شركات؟** | ✅ كل شركة لها COA مستقل | ❌ شركة واحدة فقط |
| **هل يدعم عدة أكواد لنفس النوع؟** | ✅ (حساب صندوق لكل فرع) | ❌ صندوق واحد للكل |
| **شجرة الحسابات** | شجرة عميقة (5+ مستويات) | مستويان فقط (header → detail) |

---

## 2. ما المشكلة في نظامك الحالي؟

### 🔴 المشكلة الأساسية: **Account Codes مطبوخة في الكود**

```javascript
// هذا هو جذر المشكلة:
const ACCOUNTS = {
    CASH: '1001',           // ← لو العميل يبغى يغير الكود، لازم يغير الكود!
    BANK: '1002',           // ← لو يبغى بنكين (أهلي + راجحي)، ما يقدر
    INVENTORY: '1100',      // ← لو يبغى مخزون لكل فرع، ما يقدر
    SALES_REVENUE: '4001',  // ← لو يبغى يفصل مبيعات مطعم عن مبيعات كافيه، ما يقدر
}
```

كل `recordSale()` و `recordCOGS()` و `recordRefund()` تستخدم هذه الأكواد **مباشرة**.

**الأثر:**
- العميل **ما يقدر** يغير شجرة الحسابات بدون تعديل الكود
- ما تقدر تدعم **عدة فروع بحسابات منفصلة**
- ما تقدر تدعم **عدة شركات**
- ما تقدر تدعم **أنشطة متعددة** (مطعم + كافيه + تجزئة)

---

## 3. الحل: Account Type Resolution (على طريقة ERPNext)

### الفكرة:

بدل ما الكود يقول: `accountCode: '1001'`  
الكود يقول: `accountType: 'cash'`  
والنظام **يحلها ديناميكياً** حسب الإعدادات.

### الخطوات التفصيلية:

### الخطوة 1: إضافة جدول Account Defaults (الإعدادات الافتراضية)

```javascript
// Model جديد: AccountDefault.js
const AccountDefault = sequelize.define('AccountDefault', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    
    // المفتاح الوظيفي (ثابت في الكود)
    account_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'مفتاح وظيفي مثل: default_cash, default_bank, default_inventory'
    },
    
    // الحساب الفعلي في COA (ديناميكي — يغيره العميل)
    account_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'مرجع لحساب في gl_accounts'
    },
    
    // نطاق التطبيق
    company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'NULL = عام, UUID = شركة معينة'
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'NULL = كل الفروع, UUID = فرع معين'
    }
}, {
    tableName: 'gl_account_defaults',
    indexes: [
        { unique: true, fields: ['account_key', 'company_id', 'branch_id'] }
    ]
})
```

### الخطوة 2: المفاتيح الوظيفية (بديل ACCOUNTS constant)

```javascript
// بدل كذا (الحالي):
const ACCOUNTS = {
    CASH: '1001',
    BANK: '1002',
    INVENTORY: '1100',
}

// يصبح كذا (الجديد):
const ACCOUNT_KEYS = {
    // Assets
    CASH: 'default_cash_account',
    BANK: 'default_bank_account',
    ACCOUNTS_RECEIVABLE: 'default_receivable_account',
    DRAWER_FLOAT: 'default_drawer_float_account',
    INTER_BRANCH_CLEARING: 'default_clearing_account',
    INVENTORY: 'default_stock_in_hand_account',
    INPUT_VAT: 'default_input_vat_account',
    ADVANCE_PAYMENTS: 'default_advance_payment_account',
    
    // Liabilities
    CUSTOMER_DEPOSITS: 'default_customer_deposit_account',
    ACCOUNTS_PAYABLE: 'default_payable_account',
    TAXES_PAYABLE: 'default_output_vat_account',
    
    // Equity
    OWNER_CAPITAL: 'default_capital_account',
    RETAINED_EARNINGS: 'default_retained_earnings_account',
    
    // Income
    SALES_REVENUE: 'default_income_account',
    DISCOUNTS_GIVEN: 'default_discount_account',
    OTHER_INCOME: 'default_other_income_account',
    
    // Expenses
    COGS: 'default_cogs_account',
    REFUND_LOSSES: 'default_refund_expense_account',
    CASH_SHORTAGE: 'default_cash_shortage_account',
    INVENTORY_SHRINKAGE: 'default_shrinkage_account',
    GENERAL_EXPENSE: 'default_general_expense_account',
}
```

### الخطوة 3: Account Resolver (محلل الحسابات)

```javascript
// service جديد: AccountResolver.js
class AccountResolver {
    // Cache لعدم الذهاب للـ DB في كل عملية
    static _cache = new Map()
    static _cacheExpiry = 5 * 60 * 1000 // 5 دقائق

    /**
     * الدالة الأساسية: حل مفتاح وظيفي إلى كود حساب فعلي
     * 
     * الأولوية: فرع محدد → شركة محددة → عام
     */
    static async resolve(accountKey, { branchId = null, companyId = null } = {}) {
        const cacheKey = `${accountKey}:${branchId || 'global'}:${companyId || 'global'}`
        
        // تحقق من الكاش
        const cached = this._cache.get(cacheKey)
        if (cached && Date.now() - cached.timestamp < this._cacheExpiry) {
            return cached.accountCode
        }
        
        // البحث بالترتيب: فرع → شركة → عام
        let accountDefault = null
        
        // 1. ابحث: مفتاح + فرع + شركة
        if (branchId && companyId) {
            accountDefault = await AccountDefault.findOne({
                where: { account_key: accountKey, branch_id: branchId, company_id: companyId },
                include: [{ model: Account, as: 'account' }]
            })
        }
        
        // 2. ابحث: مفتاح + شركة فقط
        if (!accountDefault && companyId) {
            accountDefault = await AccountDefault.findOne({
                where: { account_key: accountKey, company_id: companyId, branch_id: null },
                include: [{ model: Account, as: 'account' }]
            })
        }
        
        // 3. ابحث: مفتاح فقط (عام)
        if (!accountDefault) {
            accountDefault = await AccountDefault.findOne({
                where: { account_key: accountKey, company_id: null, branch_id: null },
                include: [{ model: Account, as: 'account' }]
            })
        }
        
        if (!accountDefault) {
            throw new Error(`ACCOUNTING_CONFIG_ERROR: No account mapped for key "${accountKey}"`)
        }
        
        const accountCode = accountDefault.account.code
        
        // خزّن في الكاش
        this._cache.set(cacheKey, { accountCode, timestamp: Date.now() })
        
        return accountCode
    }
    
    /**
     * حل عدة مفاتيح دفعة واحدة (أكثر كفاءة)
     */
    static async resolveMany(keys, context = {}) {
        const results = {}
        // يمكن تحسينها لاحقاً بـ batch query
        for (const [name, key] of Object.entries(keys)) {
            results[name] = await this.resolve(key, context)
        }
        return results
    }
    
    /**
     * مسح الكاش (عند تغيير الإعدادات)
     */
    static clearCache() {
        this._cache.clear()
    }
}
```

### الخطوة 4: تعديل accountingService.js (قبل وبعد)

```javascript
// ============== قبل (الحالي) ==============
static async recordSale(order, { transaction = null } = {}) {
    const paymentAccount = order.payment_method === 'cash'
        ? ACCOUNTS.CASH        // ← Hard-coded '1001'
        : ACCOUNTS.BANK        // ← Hard-coded '1002'

    const lines = [
        { accountCode: paymentAccount, debit: total, credit: 0 },
        { accountCode: ACCOUNTS.SALES_REVENUE, debit: 0, credit: subtotal },
        // ...
    ]
}

// ============== بعد (الجديد) ==============
static async recordSale(order, { transaction = null } = {}) {
    const context = { branchId: order.branch_id }
    
    // حل الحسابات ديناميكياً
    const accounts = await AccountResolver.resolveMany({
        cash: ACCOUNT_KEYS.CASH,
        bank: ACCOUNT_KEYS.BANK,
        revenue: ACCOUNT_KEYS.SALES_REVENUE,
        tax: ACCOUNT_KEYS.TAXES_PAYABLE,
    }, context)

    const paymentAccount = order.payment_method === 'cash'
        ? accounts.cash         // ← ديناميكي! يتغير حسب الفرع
        : accounts.bank         // ← ديناميكي! ممكن بنك مختلف لكل فرع

    const lines = [
        { accountCode: paymentAccount, debit: total, credit: 0 },
        { accountCode: accounts.revenue, debit: 0, credit: subtotal },
        // ...
    ]
}
```

---

## 4. شجرة الحسابات: كيف تصبح مرنة؟

### الحالي (مستويان فقط):
```
1000 الأصول (header)
├── 1001 الصندوق
├── 1002 البنك
├── 1100 المخزون
└── 1300 ضريبة المدخلات
```

### المقترح (على طريقة ERPNext — هرمي متعدد المستويات):
```
1000 الأصول (header)
├── 1100 الأصول المتداولة (header)
│   ├── 1110 النقد وما يعادله (header)
│   │   ├── 1111 صندوق الفرع الرئيسي
│   │   ├── 1112 صندوق فرع الرياض
│   │   ├── 1113 صندوق فرع جدة
│   │   ├── 1121 بنك الراجحي
│   │   ├── 1122 بنك الأهلي
│   │   └── 1130 عهدة الصندوق
│   │
│   ├── 1200 المدينون (header)
│   │   ├── 1210 العملاء — تجزئة
│   │   └── 1220 العملاء — جملة
│   │
│   ├── 1300 المخزون (header)
│   │   ├── 1310 مخزون الفرع الرئيسي
│   │   ├── 1320 مخزون فرع الرياض
│   │   ├── 1330 مخزون فرع جدة
│   │   └── 1390 بضاعة في الطريق
│   │
│   └── 1400 مستحقات ضريبية (header)
│       ├── 1410 ضريبة مدخلات
│       └── 1420 دفعات مقدمة لموردين
│
├── 1500 الأصول الثابتة (header)        ← جديد (للـ ERP)
│   ├── 1510 أثاث ومعدات
│   ├── 1520 أجهزة كمبيوتر
│   ├── 1530 سيارات
│   └── 1590 مجمع الإهلاك (contra)
│
└── 1900 حسابات وسيطة (header)
    └── 1910 وسيط تحويلات بين الفروع

4000 الإيرادات (header)
├── 4100 إيرادات تشغيلية (header)
│   ├── 4110 مبيعات — مطعم
│   ├── 4120 مبيعات — كافيه
│   ├── 4130 مبيعات — أونلاين
│   └── 4190 خصومات ممنوحة (contra)
│
└── 4200 إيرادات غير تشغيلية (header)
    ├── 4210 فوائض نقدية
    └── 4220 أرباح بيع أصول

5000 المصروفات (header)
├── 5100 تكلفة المبيعات (header)
│   ├── 5110 تكلفة بضاعة مباعة — مطعم
│   ├── 5120 تكلفة بضاعة مباعة — كافيه
│   └── 5130 هبوط المخزون
│
├── 5200 مصروفات تشغيلية (header)
│   ├── 5210 رواتب وأجور
│   ├── 5220 إيجارات
│   ├── 5230 خدمات (كهرباء/ماء)
│   ├── 5240 تسويق وإعلان
│   ├── 5250 صيانة
│   ├── 5260 عجز صندوق
│   └── 5270 خسائر مرتجعات
│
├── 5300 مصروفات إدارية (header)          ← جديد (للـ ERP)
│   ├── 5310 مصروفات قانونية
│   ├── 5320 تأمين
│   └── 5330 رسوم حكومية
│
└── 5900 إهلاك (header)                   ← جديد (للـ ERP)
    └── 5910 مصروف الإهلاك
```

---

## 5. التعديلات المطلوبة (ترتيب التنفيذ)

### المرحلة A: البنية التحتية (بدون كسر الكود الحالي)

| # | التعديل | التفصيل | الأثر |
|---|---------|---------|-------|
| A1 | إنشاء `AccountDefault` model | جدول الإعدادات الافتراضية | لا يكسر شي ← إضافة فقط |
| A2 | إنشاء `AccountResolver` service | محلل الحسابات الديناميكي | لا يكسر شي ← إضافة فقط |
| A3 | Seed الإعدادات من ACCOUNTS الحالي | نقل القيم الحالية لجدول الإعدادات | ACCOUNTS يظل يعمل |
| A4 | إضافة `account_key` لجدول Account | حقل اختياري يربط الحساب بالمفتاح | لا يكسر شي |

### المرحلة B: الترحيل التدريجي (Gradual Migration)

| # | التعديل | التفصيل |
|---|---------|---------|
| B1 | تعديل `recordSale` لاستخدام AccountResolver | ACCOUNTS.CASH → AccountResolver.resolve('default_cash') |
| B2 | تعديل `recordCOGS` | ACCOUNTS.COGS → AccountResolver.resolve('default_cogs') |
| B3 | تعديل `recordRefund` | نفس النمط |
| B4 | تعديل `recordPurchaseReceipt` | نفس النمط |
| B5 | تعديل `recordSupplierPayment` | نفس النمط |
| B6 | تعديل `recordStockAdjustment` | نفس النمط |
| B7 | تعديل `recordInterBranchTransfer` | نفس النمط |
| B8 | تعديل `recordDrawerOpening` | نفس النمط |
| B9 | تعديل `recordCashVariance` | نفس النمط |
| B10 | تعديل `cashDrawerService` (cash-in/cash-out) | نفس النمط |

### المرحلة C: التطوير

| # | التعديل | التفصيل |
|---|---------|---------|
| C1 | واجهة إدارة شجرة الحسابات | CRUD + سحب وإفلات لتغيير الهرمية |
| C2 | واجهة إعدادات Account Defaults | ربط كل مفتاح بحساب — حسب الشركة/الفرع |
| C3 | COA Templates | قوالب جاهزة (مطعم، تجزئة، خدمات) |
| C4 | Multi-Company | دعم عدة شركات بشجرة حسابات مستقلة |

---

## 6. هل التفكير ده صح على المدى الطويل؟

### ✅ نعم — 100% صح

وهذا بالضبط ما يفعله كل نظام ERP ناجح:

| النظام | المنهج |
|--------|--------|
| **ERPNext** | Account Types + Default Accounts per Company |
| **Odoo** | Account Tags + Fiscal Position |
| **SAP** | Account Determination + Configuration |
| **QuickBooks** | Account Templates + Categories |

**الفكرة الذهبية:** النظام **لا يعرف** أكواد الحسابات — بل يعرف **أنواعها الوظيفية** فقط:
- "أنا محتاج حساب الصندوق" → النظام يروح يشوف الإعدادات: أيّ حساب مربوط بـ `default_cash`؟
- "أنا محتاج حساب المخزون لفرع جدة" → النظام يشوف: هل فيه حساب مخزون خاص بفرع جدة؟ إذا لا، يأخذ العام.

### لماذا هذا أفضل؟

```
السيناريو: عميل عنده 3 فروع ويبغى فصل المحاسبة

المنهج الحالي (Hard-coded):
❌ ACCOUNTS.CASH = '1001' ← صندوق واحد لكل الفروع
❌ مافيه طريقة لفصلهم بدون تعديل الكود
❌ لو العميل غيّر الكود، يحتاج مبرمج

المنهج الجديد (Account Resolver):
✅ فرع الرياض → default_cash → 1111 (صندوق الرياض)
✅ فرع جدة → default_cash → 1112 (صندوق جدة)
✅ فرع الدمام → default_cash → 1113 (صندوق الدمام)
✅ العميل يغير من لوحة التحكم بدون مبرمج
```

---

## 7. التوافق مع ERPNext (للمستقبل)

لو قررت في المستقبل تحول لـ ERPNext أو تبني ERP خاص، الهيكل الجديد يُسهل:

| Feature | ERPNext | نظامك بعد التعديل |
|---------|---------|-------------------|
| Account Types | ✅ | ✅ (account_key) |
| Multi-Company COA | ✅ | ✅ (company_id) |
| Branch-Specific Accounts | ✅ | ✅ (branch_id) |
| Hierarchical COA (5+ levels) | ✅ | ✅ (parent_id already exists) |
| Dynamic Account Resolution | ✅ | ✅ (AccountResolver) |
| COA Templates | ✅ | 🔄 (سهل الإضافة) |
| Data Migration to ERPNext | N/A | ✅ (هيكل متوافق) |

---

## 8. الخلاصة والتوصية

### هل أنت على الطريق الصحيح؟

**نعم، 100%.** تثبيت الهيكل المحاسبي من الآن هو **القرار الأذكى** لأن:

1. **تغيير الهيكل لاحقاً = كابوس**  
   كل قيد يومي مرتبط بحساب. لو غيرت الهيكل بعد سنة عمل، تحتاج ترحيل آلاف القيود.

2. **ERP = محاسبة + وحدات أخرى**  
   المحاسبة هي **القلب**. لو القلب ضعيف، كل الوحدات (HR, Projects, Manufacturing) تعاني.

3. **العملاء لا يحبون القيود**  
   كل عميل يبغى يخصص حساباته. النظام المرن = عملاء أكثر.

### التوصية النهائية:

| الأولوية | التعديل | لماذا؟ |
|----------|---------|--------|
| 🔴 **الآن** | إنشاء AccountDefault + AccountResolver | شبكة أمان — الكود الحالي يظل يعمل + المستقبل مؤمن |
| 🟡 **قريب** | ترحيل accountingService لاستخدام Resolver | فك الارتباط بين الكود وأكواد الحسابات |
| 🟢 **متوسط** | واجهة إدارة الشجرة + الإعدادات | العميل يدير حساباته بنفسه |
| 🔵 **بعيد** | Multi-Company + COA Templates | جاهزية ERP كاملة |

> **القاعدة الذهبية:** الكود يعرف **ماذا** يريد (صندوق، بنك، مخزون)  
> الكود **لا يعرف** أين يجده (1001, 1002, 1100)  
> **الإعدادات** هي من تقول له أين.

---

> هل تريد أبدأ بتنفيذ المرحلة A (البنية التحتية) الحين؟  
> هي 3 ملفات جديدة فقط ولا تكسر أي كود حالي! 🚀
