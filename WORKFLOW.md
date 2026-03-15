# Kitchen-Cashier Handoff Workflow

## نظرة عامة

هذا النظام يطبق **Kitchen-Cashier Handoff Workflow** وهو نفس المنطق المستخدم في أنظمة:
- McDonald's POS
- Talabat Kitchens
- Square POS
- Toast POS

## مسار الطلب (Order Status Lifecycle)

### طلبات الأونلاين (Online Orders)
```
pending → approved → preparing → ready → handed_to_cashier → completed
```

### طلبات نقاط البيع (POS Orders)
```
new → preparing → ready → handed_to_cashier → completed
```

## المسؤوليات حسب الدور

### 1. المدير (Admin)
**يرى:** جميع الحالات

**المسؤوليات:**
- قبول طلبات الأونلاين (`pending` → `approved`)
- رفض الطلبات غير المناسبة
- مراقبة سير العمل بالكامل

**الصفحات:**
- `/pending-orders` - طلبات الأونلاين الجديدة

### 2. المطبخ (Kitchen/KDS)
**يرى:** `approved`, `new`, `confirmed`, `preparing`

**المسؤوليات:**
- بدء التحضير (`new/approved` → `preparing`)
- تحديد جاهزية الطلب (`preparing` → `ready`)
- تسليم الطلب للكاشير (`ready` → `handed_to_cashier`)

**ممنوع من:**
- ❌ إكمال الطلب
- ❌ طباعة الفواتير
- ❌ التعامل مع المدفوعات

**الصفحات:**
- `/kds` - شاشة المطبخ

### 3. الكاشير (Cashier)
**يرى:** `ready`, `handed_to_cashier`

**المسؤوليات:**
- استلام الطلبات الجاهزة من المطبخ
- تعيين عامل التوصيل (للطلبات الـ delivery)
- طباعة الفاتورة
- إكمال الطلب (`handed_to_cashier` → `completed`)

**فقط الكاشير يمكنه:**
- ✅ تحديد الطلب كمكتمل
- ✅ تسجيل المبيعات
- ✅ إضافة المبلغ لإجمالي الوردية
- ✅ تحديث إحصائيات أداء الكاشير

**الصفحات:**
- `/cashier-queue` - طلبات جاهزة للتسليم
- `/new-order` - إنشاء طلبات جديدة

## لماذا هذا التصميم؟

### يحل 5 مشاكل خطيرة:

1. **يمنع تحضير طلبات بدون استلام**
   - الطلبات الأونلاين تنتظر موافقة المدير أولاً

2. **يمنع دخول فلوس وهمية في التقارير**
   - فقط الطلبات `completed` تحتسب في المبيعات

3. **يخلي المسؤولية واضحة**
   - المطبخ = جودة الطعام
   - الكاشير = المدفوعات والتوصيل

4. **يخلي الدليفري دايماً يطلع بإيصال رسمي**
   - الكاشير يطبع الفاتورة قبل التسليم

5. **يسمح بتتبع كامل**
   - وقت التحضير (`ready_at`)
   - وقت الانتظار (`handed_at`)
   - وقت التسليم (`completed_at`)
   - اسم عامل التوصيل (`delivery_person`)

## 🔐 Approval Gate (حماية المطبخ)

### المشكلة المحلولة:
طلبات الأونلاين كانت تذهب مباشرة للمطبخ بدون أي تحقق!

### الحل:
- طلبات الأونلاين تُنشأ بحالة `pending`
- **المطبخ لا يرى** أي طلب بحالة `pending`
- يجب على الأدمن/الكاشير الموافقة أولاً
- بعد الموافقة فقط، الطلب يظهر في المطبخ

### سجل التدقيق (Audit Log):
عند الموافقة على طلب، يتم تسجيل:
- `approved_by` - ID المستخدم الذي وافق
- `approved_at` - وقت الموافقة

```javascript
// عند الموافقة
await order.update({ 
    status: 'approved',
    approved_by: req.user.userId,
    approved_at: new Date()
})
```

## API Endpoints

### حالة الطلب
```
PUT /api/orders/:id/status
Body: { status: 'preparing' | 'ready' | ... }
```

### Workflow Actions
```
POST /api/orders/:id/approve   - Admin: قبول طلب أونلاين
POST /api/orders/:id/handoff   - Kitchen: تسليم للكاشير
POST /api/orders/:id/complete  - Cashier: إكمال الطلب
POST /api/orders/:id/cancel    - إلغاء الطلب
```

### قوائم الطلبات
```
GET /api/orders/kds/active      - طلبات المطبخ النشطة
GET /api/orders/cashier/ready   - طلبات جاهزة للكاشير
GET /api/orders/admin/pending   - طلبات أونلاين تنتظر الموافقة
```

## Socket Events

### للمطبخ (KDS)
- `order:new` - طلب جديد وصل
- `order:updated` - تحديث حالة طلب
- `order:removed` - طلب تم تسليمه للكاشير
- `order:cancelled` - طلب تم إلغاؤه

### للكاشير
- `order:ready_for_pickup` - طلب جاهز من المطبخ
- `order:handed` - طلب تم تسليمه للكاشير
- `order:removed` - طلب تم إكماله
- `order:cancelled` - طلب تم إلغاؤه

## 💰 الربط المالي (Financial & Revenue Tracking)

### ربط طلبات الأونلاين بالكاشير:
لضمان دقة التقارير المالية، لا يتم احتساب طلب الأونلاين في مبيعات الفرع إلا بعد موافقة الكاشير عليه.
- **عند الموافقة (Approve):** يتم ربط الطلب تلقائياً بـ `shift_id` الخاصة بالكاشير الذي وافق.
- **المسؤولية:** الكاشير الذي يوافق على الطلب هو المسؤول عنه مالياً وفي التقارير.

### احتساب إيرادات الوردية:
التقرير النهائي للوردية (Shift Report) يقسم المبيعات إلى:
1. **مبيعات POS:** الطلبات التي تم إنشاؤها مباشرة من الكاشير.
2. **مبيعات أونلاين:** الطلبات التي جاءت من الموقع ووافق عليها هذا الكاشير.

**القاعدة المالية:**
- `إجمالي مبيعات الوردية = (مبيعات POS) + (مبيعات الأونلاين المعتمدة)`
- `المبلغ النقدي المتوقع = (الرصيد الافتتاحي) + (المبيعات النقدية POS) + (المبيعات النقدية أونلاين إن وجدت)`

```javascript
// منطق الربط عند الموافقة
await order.update({
    status: 'approved',
    user_id: req.user.userId,    // ربط بالكاشير
    shift_id: activeShift.id,    // ربط بوردية الكاشير
    approved_by: req.user.userId,
    approved_at: new Date()
})
```

## API Endpoints

### حالة الطلب
```
PUT /api/orders/:id/status
Body: { status: 'preparing' | 'ready' | ... }
```

### Workflow Actions
```
POST /api/orders/:id/approve   - Admin/Cashier: قبول طلب أونلاين وربطه بالمالية
POST /api/orders/:id/handoff   - Kitchen: تسليم للكاشير
POST /api/orders/:id/complete  - Cashier: إكمال الطلب (يؤثر على الإيرادات)
POST /api/orders/:id/cancel    - إلغاء الطلب
```

### قوائم الطلبات
```
GET /api/orders/kds/active      - طلبات المطبخ النشطة (المعتمدة فقط)
GET /api/orders/cashier/ready   - طلبات جاهزة للكاشير
GET /api/orders/admin/pending   - طلبات أونلاين تنتظر الموافقة
```

## حساب المبيعات في الوردية

**قاعدة ذهبية:** فقط الطلبات ذات الحالة `completed` والمرتبطة بـ `shift_id` تحتسب في المبيعات النهائية.

```javascript
// ملخص الوردية يتضمن الآن:
{
  "pos_orders": 15,
  "online_orders": 5,
  "total_revenue": 2500.50,
  "cash_sales": 1800.00,
  "card_sales": 700.50
}
```
