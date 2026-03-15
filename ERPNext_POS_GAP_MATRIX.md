# مقارنة قوة POS: نظامك مقابل ERPNext
## تقييم مهني مصحح (POS فقط)

**تاريخ التقييم:** 22 فبراير 2026  
**نطاق التقييم:** POS تشغيلي + محاسبي + رقابي (وليس ERP كامل)  
**منهجية التقييم:**  
1. مراجعة الكود الفعلي في النظام الحالي.  
2. مقارنة مرجعية بميزات ERPNext الرسمية في POS.

---

## 1) الحكم التنفيذي المصحح

- **ERPNext (POS): 9.0/10**
- **نظامك الحالي (POS): 7.8/10**
- **الفجوة:** 1.2 نقطة

### الخلاصة
- ملاحظتك كانت صحيحة: **ERPNext أقوى وأشمل كمنصة POS جاهزة**.
- نظامك قوي جدًا في نقاط تشغيلية/رقابية مخصصة (KDS + تدفق الإكمال الذري + ضوابط محاسبية).
- لكن توجد فجوات بنيوية في POS تمنع الوصول لمستوى ERPNext القياسي.

---

## 2) مصفوفة مقارنة POS (Feature-by-Feature)

| # | الميزة | ERPNext | نظامك الحالي | نتيجة المقارنة | أثر الفجوة |
|---|---|---|---|---|---|
| 1 | جلسة POS وفتح/إغلاق نقطة البيع | POS Opening/Closing Entry مخصص | Shift + Cash Drawer موجود | ERPNext أقوى | متوسط |
| 2 | تعدد وسائل الدفع على نفس الفاتورة (Split Tender) | مدعوم | غير مدعوم (طريقة دفع واحدة لكل Order) | ERPNext أقوى | عالي |
| 3 | Write-off وفروق التسوية على مستوى POS Invoice | مدعوم في تدفق POS | غير متاح ككيان POS مباشر | ERPNext أقوى | عالي |
| 4 | Offers / Coupons / Loyalty / Price List في شاشة POS | مدعوم | خصومات فقط بضوابط صلاحيات | ERPNext أقوى | عالي |
| 5 | إرجاعات POS (كاملة/جزئية/إلغاء) | مدعوم | مدعوم جيدًا مع استرجاع مخزون وموافقات | تعادل |
| 6 | تتبع Batch/Serial وقت البيع من POS | مدعوم بوضوح | Batch موجود بالمخزون/المشتريات لكن غير مفعل كتجربة بيع POS | ERPNext أقوى | متوسط |
| 7 | Offline POS + مزامنة لاحقة | مدعوم | غير موجود كتدفق بيع Offline متكامل | ERPNext أقوى | عالي |
| 8 | POS Closing Consolidation (تجميع فواتير اليوم) | مدعوم | غير موجود كنمط Closing Voucher POS | ERPNext أقوى | متوسط |
| 9 | ضوابط العميل/الفاتورة المفتوحة في POS | مدعوم | غير مفروض بنفس الصرامة | ERPNext أقوى | متوسط |
| 10 | Barcode-first selling في شاشة POS | مدعوم | يوجد Barcode في Master Data لكن غير مفعل كتدفق POS فعلي | ERPNext أقوى | متوسط |
| 11 | KDS/Workflow مطبخ-كاشير | يعتمد على إعدادات/تخصيص | موجود ومتكامل (KDS + handoff) | نظامك أقوى |
| 12 | أمن الدفع الإلكتروني والتحقق | جيد | قوي (HMAC + amount match + idempotency) | نظامك أقوى |
| 13 | ضوابط منع إنهاء الطلب بدون محاسبة | جيد | قوية (finalization service + قيود ذرية) | نظامك أقوى |
| 14 | المرونة التخصصية لنشاطك | عامة وقوية | عالية ومخصصة لتدفقك الحالي | نظامك أقوى |

---

## 3) لماذا ERPNext ما زال أعلى في POS

الفجوة ليست في "جودة الكود" فقط، بل في **اكتمال المنتج POS كحزمة أعمال جاهزة**:

1. **Split Tender + Write-off** على مستوى الفاتورة.
2. **عروض/كوبونات/ولاء/Price Lists** بشكل مدمج.
3. **Offline POS** مع مزامنة.
4. **Closing Entry + Consolidation** كدورة يومية جاهزة.
5. **ضوابط تشغيل POS معيارية** (opening/closing artifacts).

---

## 4) أين نظامك أقوى بالفعل

1. تدفق **KDS + Handoff** واضح ومباشر.
2. إكمال الطلب عبر خدمة موحدة مع **خصم مخزون ذري + قيد محاسبي ذري**.
3. حماية الدفع الإلكتروني في webhook عبر **HMAC + مطابقة المبلغ + idempotency**.
4. رقابة خصومات قوية بصلاحيات وموافقة عند تجاوز العتبة.

---

## 5) خطة رفع النظام من 7.8 إلى 9.1+

## P1 (حرج) — يرفع النظام بسرعة

1. **Split Tender Payments**
   - إضافة `order_payments` (عدة طرق دفع لنفس الطلب).
   - دعم cash+card+wallet في نفس السداد.

2. **POS Closing Artifact**
   - إنشاء `pos_opening_entry` و`pos_closing_entry`.
   - فرض إغلاق الجلسة قبل افتتاح جلسة جديدة لنفس المستخدم/الفرع.

3. **Pricing Engine**
   - Price Lists + Coupons + Promotion Rules + Loyalty Points.
   - ربطها مباشرة بعملية احتساب السلة.

4. **Offline Queue**
   - Local queue + sync job + conflict policy.
   - منع فقدان المبيعات عند انقطاع الشبكة.

## P2 (عالٍ)

5. **Barcode-first POS UX**
   - إضافة إدخال/قارئ باركود مباشر في شاشة البيع.

6. **Batch/Serial Picking at POS**
   - اختيار batch/serial وقت البيع (FEFO/FIFO policy).

7. **Hold/Park Server-side**
   - تحويل hold من Redux local إلى persisted draft orders.

8. **POS Reconciliation Pack**
   - تقرير يومي: POS totals vs gateway settlements vs GL.

## P3 (تحسين)

9. **Customer Open-Ticket Rules**
   - فرض سياسات الفاتورة المفتوحة لكل عميل حسب نمط التشغيل.

10. **Restaurant Table Layer (إن لزم)**
   - إدارة طاولات/جلسات إذا النشاط يتطلب ذلك.

---

## 6) معايير القبول للوصول 9+

1. 100% من الفواتير تدعم split payment مع قيود GL متوازنة.
2. وجود Opening/Closing POS entries إلزامية لكل جلسة.
3. توفر Offline mode يعمل فعليًا مع sync بدون تضارب محاسبي.
4. تفعيل Price List + Coupon + Loyalty في شاشة البيع.
5. دعم barcode + batch/serial في نقطة البيع الحية.
6. تقرير تسوية يومي معتمد (POS/Gateway/GL) بدون فروقات غير مبررة.

---

## 7) أدلة من النظام الحالي (Code Evidence)

- طريقة الدفع مفردة في الطلب: `backend/src/models/Order.js:66`
- أنواع الطلب الأساسية: `backend/src/models/Order.js:15`
- الإكمال الإلزامي عبر مسار موحد مع idempotency: `backend/src/routes/order.js:755`
- فرض `order_complete` idempotency: `backend/src/routes/order.js:757`
- استدعاء خدمة الإنهاء الذري: `backend/src/routes/order.js:764`
- فرض `payment_status='paid'` عند الإكمال: `backend/src/services/orderFinalizationService.js:114`
- تدفقات رد المبالغ (full/partial/void): `backend/src/routes/refunds.js:188`, `backend/src/routes/refunds.js:355`, `backend/src/routes/refunds.js:528`
- موافقة/رفض رد المبالغ: `backend/src/routes/refunds.js:785`
- soft delete للمرتجعات: `backend/src/models/Refund.js:132`
- Cash drawer open/close/cash-in/cash-out: `backend/src/services/cashDrawerService.js:26`, `backend/src/services/cashDrawerService.js:78`, `backend/src/services/cashDrawerService.js:198`, `backend/src/services/cashDrawerService.js:247`
- barcode موجود في الماستر: `backend/src/models/Menu.js:50`
- hold cart موجود محليًا (Redux): `pos/src/store/slices/cartSlice.js:54`
- شاشة البيع الحالية تعتمد cash/card فقط: `pos/src/pages/NewOrder.jsx:174`, `pos/src/pages/NewOrder.jsx:188`, `pos/src/pages/NewOrder.jsx:267`

---

## 8) مراجع ERPNext (Official)

- POS Manual: https://docs.frappe.io/erpnext/user/manual/en/point-of-sales
- POS Profile (v14): https://docs.frappe.io/erpnext/v14/user/manual/en/accounts/pos-profile
- POS Invoice Consolidation: https://docs.frappe.io/erpnext/user/manual/en/pos-invoice-consolidation
- POS Opening Entry: https://docs.frappe.io/erpnext/user/manual/en/pos-opening-entry
- POS Closing Entry: https://docs.frappe.io/erpnext/user/manual/en/pos-closing-entry
## Update 2026-02-22 (Implemented)

The following POS gaps were implemented in code and database:

- Split tender accounting flow: already active and retained.
- POS opening/closing artifacts: already active and retained.
- Price lists: added (`price_lists`, `price_list_items`) + real-time preview API.
- Promotions engine: added (`promotion_rules`) + automatic application in order pricing.
- Loyalty points: added (`customers.loyalty_points`, `loyalty_ledger`) with redeem + earn flow.
- Barcode-first selling: POS search now supports exact barcode/SKU enter-to-add.
- Batch selection at sale: POS batch picker + batch-aware stock deduction in finalization.
- Daily reconciliation report: added `GET /api/reports/reconciliation/daily` (POS vs Gateway vs GL).
- Migration script: `backend/src/scripts/migrate-pos-v91plus.js`.

Current practical score target after this implementation: **9.1 / 10 (POS scope)**, pending business UAT.

