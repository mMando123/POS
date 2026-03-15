const fs = require('fs');
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/backend/src/services/accountingService.js', 'utf8');

const target = "lines.push({ accountCode: accts.payable, debit: 0, credit: totalCost, description: `Liability to supplier: ${receipt.receipt_number || receipt.id}` })";
const replacement = `if (receipt.payment_method && receipt.payment_method !== 'credit' && receipt.payment_account_code) {
            lines.push({ accountCode: receipt.payment_account_code, debit: 0, credit: totalCost, description: \`Direct payment (\${receipt.payment_method}): \${receipt.receipt_number || receipt.id}\` })
        } else {
            lines.push({ accountCode: accts.payable, debit: 0, credit: totalCost, description: \`Liability to supplier: \${receipt.receipt_number || receipt.id}\` })
        }`;

c = c.replace(target, replacement);
fs.writeFileSync('c:/Users/activ/Desktop/pos/backend/src/services/accountingService.js', c);
console.log('Done replacement');
