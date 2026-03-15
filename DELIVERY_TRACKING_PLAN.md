# 🚀 خطة تنفيذ نظام تتبع الديليفري وأنواع الطلبات

## 📋 الوضع الحالي (ما يوجد الآن)
| العنصر | الحالة |
|--------|--------|
| `order_type` في قاعدة البيانات | ✅ موجود: `online`, `walkin`, `delivery` |
| `delivery_person` في قاعدة البيانات | ✅ موجود (حقل نصي فقط) |
| تحديد نوع الطلب في POS (كاشير) | ❌ مفقود - دائماً يُسجَّل كـ `walkin` |
| ربط الديليفري بموظف معين | ❌ مفقود - مجرد نص بلا علاقة |
| لوحة متابعة الديليفري | ❌ مفقود |
| تقارير الديليفري | ❌ مفقود |

---

## 🎯 الهدف من التطوير
1. **تحديد نوع الطلب** عند إنشائه في POS: صالة (Dine-In) / تيك أواي / ديليفري
2. **ربط الديليفري بموظف محدد** (الديليفري بوي) وليس مجرد نص
3. **تتبع حالة الديليفري** من لحظة الاستلام حتى التسليم
4. **تقارير وإحصائيات** لكل موظف ديليفري

---

## 🗂️ المراحل

---

## 🔵 المرحلة الأولى: توسيع قاعدة البيانات

### 1.1 جدول `delivery_personnel` (موظفو الديليفري)
```sql
CREATE TABLE delivery_personnel (
  id UUID PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,         -- الاسم بالعربي
  name_en VARCHAR(100),                  -- الاسم بالإنجليزي
  phone VARCHAR(20) NOT NULL,            -- رقم الهاتف
  vehicle_type ENUM('motorcycle','car','bicycle','foot'), -- نوع المركبة
  vehicle_number VARCHAR(50),            -- رقم اللوحة
  branch_id UUID NOT NULL,              -- الفرع
  status ENUM('available','busy','offline') DEFAULT 'available',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 1.2 تعديل جدول `orders`
```sql
-- تغيير order_type ليشمل dine_in
ALTER TABLE orders MODIFY order_type ENUM('online','walkin','dine_in','takeaway','delivery');

-- تغيير delivery_person من نص إلى FK على جدول الديليفري
ALTER TABLE orders ADD COLUMN delivery_personnel_id UUID REFERENCES delivery_personnel(id);
ALTER TABLE orders ADD COLUMN delivery_address TEXT;          -- عنوان التوصيل
ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2) DEFAULT 0; -- رسوم التوصيل
ALTER TABLE orders ADD COLUMN delivery_status ENUM(
  'pending',       -- بانتظار التعيين
  'assigned',      -- تم تعيين ديليفري
  'picked_up',     -- استلم الطلب
  'in_transit',    -- في الطريق
  'delivered',     -- وصل
  'failed'         -- فشل التوصيل
) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN delivery_assigned_at TIMESTAMP NULL;
ALTER TABLE orders ADD COLUMN delivery_picked_up_at TIMESTAMP NULL;
ALTER TABLE orders ADD COLUMN delivery_completed_at TIMESTAMP NULL;
ALTER TABLE orders ADD COLUMN table_number VARCHAR(20) NULL; -- رقم الطاولة (للصالة)
```

---

## 🟢 المرحلة الثانية: الباك إند (Backend)

### 2.1 نموذج `DeliveryPersonnel.js` (جديد)
```javascript
// src/models/DeliveryPersonnel.js
const DeliveryPersonnel = sequelize.define('DeliveryPersonnel', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name_ar: { type: DataTypes.STRING(100), allowNull: false },
  name_en: { type: DataTypes.STRING(100), allowNull: true },
  phone: { type: DataTypes.STRING(20), allowNull: false },
  vehicle_type: { type: DataTypes.ENUM('motorcycle','car','bicycle','foot') },
  vehicle_number: { type: DataTypes.STRING(50) },
  branch_id: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.ENUM('available','busy','offline'), defaultValue: 'available' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
})
```

### 2.2 Routes الجديدة: `delivery.js`
```
GET    /api/delivery/personnel              → قائمة موظفي الديليفري
POST   /api/delivery/personnel              → إضافة موظف جديد
PUT    /api/delivery/personnel/:id          → تعديل موظف
PATCH  /api/delivery/personnel/:id/status  → تغيير حالة الموظف

GET    /api/delivery/orders                 → طلبات الديليفري النشطة
POST   /api/delivery/orders/:id/assign     → تعيين ديليفري لطلب
POST   /api/delivery/orders/:id/pickup     → تأكيد الاستلام
POST   /api/delivery/orders/:id/complete   → تأكيد التسليم
GET    /api/delivery/personnel/:id/history  → سجل الديليفري
GET    /api/delivery/reports               → تقارير الديليفري
```

### 2.3 تعديل `order.js` (Route الطلبات)
- قبول `order_type` من الكاشير: `dine_in`, `takeaway`, `delivery`
- قبول `delivery_personnel_id` و `delivery_address` للديليفري
- قبول `table_number` للصالة
- عند `order_type = delivery` → تغيير `delivery_status` إلى `pending`

---

## 🟡 المرحلة الثالثة: الفرونت إند (Frontend)

### 3.1 تعديل صفحة `NewOrder.jsx` (الكاشير)

**إضافة شريط اختيار نوع الطلب:**
```
[ 🪑 صالة ] [ 🥡 تيك أواي ] [ 🛵 ديليفري ]
```

**عند اختيار "صالة":**
- ظهور حقل `رقم الطاولة`

**عند اختيار "ديليفري":**
- ظهور قائمة اختيار الديليفري المتاحين (أخضر = متاح)
- ظهور حقل `عنوان التوصيل`
- ظهور حقل `رسوم التوصيل` (اختياري)

### 3.2 صفحة جديدة: `DeliveryBoard.jsx` (لوحة تتبع الديليفري)
**الشاشة تعرض:**
- بطاقات للطلبات في كل مرحلة (Kanban Board)
  - 📋 بانتظار التعيين
  - 🔄 تم التعيين
  - 🏃 في الطريق
  - ✅ تم التسليم
- قائمة موظفي الديليفري وحالتهم (متاح/مشغول/أوفلاين)
- زر "تعيين ديليفري" على كل بطاقة طلب

### 3.3 صفحة جديدة: `DeliveryManagement.jsx` (إدارة موظفي الديليفري)
- جدول بجميع موظفي الديليفري
- إضافة / تعديل / تفعيل / تعطيل موظف
- عرض إحصائيات كل موظف (عدد الطلبات، المتوسط، الإيرادات)

### 3.4 إضافة للتقارير
- تقرير: أداء كل موظف ديليفري (عدد طلبات، متوسط وقت التوصيل)
- تقرير: توزيع الطلبات حسب النوع (صالة / تيك أواي / ديليفري)
- تقرير: إيرادات رسوم التوصيل

---

## 📊 الـ UI الـ Mockup لشاشة الكاشير (بعد التعديل)

```
+------------------------------------------+
|           سلة الطلبات                     |
+------------------------------------------+
|  [ 🪑 صالة ]  [ 🥡 تيك أواي ]  [ 🛵 ديليفري ]  |
+------------------------------------------+
|  • عند صالة:                              |
|    رقم الطاولة: [___________]             |
|                                          |
|  • عند ديليفري:                           |
|    الديليفري: [ 🟢 أحمد محمد  ▼ ]         |
|    العنوان: [_________________]           |
|    رسوم التوصيل: [___] ر.س               |
+------------------------------------------+
|  محمد (081) ...                           |
|  العميل: [__________]                    |
|  ...                                     |
+------------------------------------------+
```

---

## 📱 لوحة تتبع الديليفري (DeliveryBoard)

```
+--------------------+-------------------+------------------+
|   ⏳ بانتظار تعيين  |   🔄 تم التعيين   |   ✅ تم التوصيل  |
+--------------------+-------------------+------------------+
| 📦 طلب #2045       | 📦 طلب #2044      | 📦 طلب #2040     |
| العميل: خالد       | العميل: فهد       | ✓ تم             |
| 85 ر.س             | 120 ر.س           |                  |
| [تعيين ديليفري ▼]  | 🛵 أحمد محمد      |                  |
|                    | [استلم] [وصل]     |                  |
+--------------------+-------------------+------------------+

👤 موظفو الديليفري:
🟢 أحمد محمد - مشغول (1 طلب)
🟢 محمود علي - متاح
🔴 سامي السيد - أوفلاين
```

---

## ⚙️ ملفات التنفيذ (ملخص)

| الملف | الإجراء |
|-------|---------|
| `backend/src/models/DeliveryPersonnel.js` | إنشاء جديد |
| `backend/src/models/Order.js` | تعديل - إضافة حقول |
| `backend/src/routes/delivery.js` | إنشاء جديد |
| `backend/src/routes/order.js` | تعديل - قبول order_type و delivery |
| `backend/alter_delivery.js` | سكريبت تعديل DB |
| `pos/src/pages/NewOrder.jsx` | تعديل - إضافة نوع الطلب |
| `pos/src/pages/DeliveryBoard.jsx` | إنشاء جديد |
| `pos/src/pages/DeliveryManagement.jsx` | إنشاء جديد |
| `pos/src/services/api.js` | إضافة `deliveryAPI` |
| `pos/src/App.jsx` أو `routes` | إضافة المسارات الجديدة |

---

## 🔢 ترتيب التنفيذ (Step by Step)

```
1. تعديل قاعدة البيانات (migration script)
2. إنشاء نموذج DeliveryPersonnel.js
3. تعديل نموذج Order.js
4. إنشاء routes/delivery.js
5. تعديل routes/order.js
6. إضافة deliveryAPI في api.js
7. تعديل NewOrder.jsx (UI الكاشير)
8. إنشاء DeliveryBoard.jsx
9. إنشاء DeliveryManagement.jsx
10. إضافة الصفحات للـ Navigation
```

---

## ⏱️ الوقت التقديري للتنفيذ
- المرحلة الأولى (DB): 10 دقائق
- المرحلة الثانية (Backend): 45 دقائق
- المرحلة الثالثة (Frontend): 90 دقائق
- **الإجمالي: ~2.5 ساعة**

---

## ✅ هل تريد البدء؟
كل ما عليك قوله: **"ابدأ التنفيذ"** وسأبدأ خطوة بخطوة فوراً! 🚀
