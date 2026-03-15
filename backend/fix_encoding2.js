const fs = require('fs');
const p = './src/routes/inventory.js';
let c = fs.readFileSync(p, 'utf8');

const replacements = [
    {
        pattern: /res\.status\(500\)\.json\(\{\s*message:\s*'[^']+'\s*\}\)/,
        at: 'Get stock error',
        repl: "res.status(500).json({ message: 'خطأ في جلب بيانات المخزون' })"
    },
    {
        pattern: /res\.status\(500\)\.json\(\{\s*message:\s*'[^']+'\s*\}\)/,
        at: 'Get stock level error',
        repl: "res.status(500).json({ message: 'خطأ في جلب مستوى المخزون' })"
    },
    {
        pattern: /title:\s*'[^']+',\s*message:\s*`[^`]+`,/,
        at: 'low_stock items',
        repl: "title: 'تنبيه: مخزون منخفض',\n                    message: `المنتج \"${item.productName}\" وصل إلى ${item.quantity} قطعة. (الحد الأدنى: ${item.minStock})`,"
    },
    {
        pattern: /title:\s*'[^']+',\s*message:\s*`[^`]+`,/,
        at: 'out of stock',
        repl: "title: 'تنبيه: نفاذ المخزون!',\n                    message: `المنتج \"${s.Menu?.name_ar}\" انتهى تماماً من مستودع ${s.Warehouse?.name_ar}`,"
    },
    {
        pattern: /res\.status\(500\)\.json\(\{\s*message:\s*'[^']+'\s*\}\)/,
        at: 'Get alerts error',
        repl: "res.status(500).json({ message: 'خطأ في جلب التنبيهات' })"
    },
    {
        pattern: /res\.status\(500\)\.json\(\{\s*message:\s*'[^']+'\s*\}\)/,
        at: 'Get valuation error',
        repl: "res.status(500).json({ message: 'خطأ في حساب تقييم المخزون' })"
    },
    {
        pattern: /res\.status\(500\)\.json\(\{\s*message:\s*'[^']+'\s*\}\)/,
        at: 'Get movements error',
        repl: "res.status(500).json({ message: 'خطأ في جلب سجل الحركات' })"
    },
    {
        pattern: /body\('menu_id'\).*\.withMessage\('[^']+'\),/,
        at: "body('menu_id').isUUID",
        repl: "body('menu_id').isUUID().withMessage('معرف المنتج غير صالح'),"
    },
    {
        pattern: /body\('warehouse_id'\).*\.withMessage\('[^']+'\),/,
        at: "body('warehouse_id').isUUID",
        repl: "body('warehouse_id').isUUID().withMessage('معرف المستودع غير صالح'),"
    },
    {
        pattern: /body\('adjustment_type'\).*\.withMessage\('[^']+'\),/,
        at: "body('adjustment_type').is",
        repl: "body('adjustment_type').isIn(['damage', 'loss', 'theft', 'count', 'expired', 'other']).withMessage('نوع التعديل غير صالح'),"
    },
    {
        pattern: /body\('quantity_change'\).*\.withMessage\('[^']+'\),/,
        at: "body('quantity_change')",
        repl: "body('quantity_change').isFloat({ min: -10000, max: 10000 }).withMessage('الكمية غير صالحة أو خارج النطاق المسموح'),"
    },
    {
        pattern: /body\('reason'\).*\.withMessage\('[^']+'\)\.isLength\(.*\)\.withMessage\('[^']+'\)\.trim\(\)/,
        at: "body('reason').notEmpty",
        repl: "body('reason').notEmpty().withMessage('السبب مطلوب').isLength({ max: 500 }).withMessage('السبب يجب ألا يتجاوز 500 حرف').trim()"
    },
    {
        pattern: /return res\.status\(400\)\.json\(\{\s*message:\s*'[^']+'\s*\}\)/,
        at: "if (!menu?.allow_negative_stock)",
        repl: "return res.status(400).json({ message: 'لا يمكن أن يصبح المخزون سالباً' })"
    },
    {
        pattern: /message:\s*'[^']+',\s*data:\s*adjustment/,
        at: "res.status(201)",
        repl: "message: 'تم تعديل المخزون بنجاح',\n                data: adjustment"
    },
    {
        pattern: /res\.status\(500\)\.json\(\{\s*message:\s*error\.message\s*\|\|\s*'[^']+'\s*\}\)/,
        at: 'Adjustment error',
        repl: "res.status(500).json({ message: error.message || 'خطأ في تعديل المخزون' })"
    }
];

let lines = c.split('\n');
replacements.forEach(r => {
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(r.at) || (i > 0 && lines[i - 1].includes(r.at)) || (i > 1 && lines[i - 2].includes(r.at))) {
            let j = i;
            let replaced = false;
            // search forward up to 5 lines
            for (let k = 0; k < 5 && j + k < lines.length; k++) {
                if (r.pattern.test(lines[j + k])) {
                    lines[j + k] = lines[j + k].replace(r.pattern, r.repl);
                    replaced = true;
                    break;
                }
            }
            if (replaced) break;
        }
    }
});

fs.writeFileSync(p, lines.join('\n'));
console.log('Fixed completely!');
