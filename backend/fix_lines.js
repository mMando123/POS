const fs = require('fs');
const p = './src/routes/inventory.js';
let lines = fs.readFileSync(p, 'utf8').split('\n');

lines[178] = "                    title: 'تنبيه: مخزون منخفض',";
lines[179] = "                    message: `المنتج \"${item.productName}\" وصل إلى ${item.quantity} قطعة. (الحد الأدنى: ${item.minStock})`,";

lines[204] = "                    title: 'تنبيه: نفاذ المخزون!',";
lines[205] = "                    message: `المنتج \"${s.Menu?.name_ar}\" انتهى تماماً من مستودع ${s.Warehouse?.name_ar}`,";

lines[413] = "                message: 'تم تعديل المخزون بنجاح',";

fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('Fixed lines directly by index.');
