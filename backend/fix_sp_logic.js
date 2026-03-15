const fs = require('fs');

// 1. Model
let model = fs.readFileSync('c:/Users/activ/Desktop/pos/backend/src/models/SupplierPayment.js', 'utf8');
model = model.replace("payment_method: {", "payment_account_code: {\n        type: DataTypes.STRING(50),\n        allowNull: true\n    },\n    payment_method: {");
fs.writeFileSync('c:/Users/activ/Desktop/pos/backend/src/models/SupplierPayment.js', model);
console.log("Model updated");

// 2. Routes
let routes = fs.readFileSync('c:/Users/activ/Desktop/pos/backend/src/routes/suppliers.js', 'utf8');
routes = routes.replace("const { amount, payment_method, payment_date, reference, notes, purchase_order_id } = req.body",
    "const { amount, payment_method, payment_date, reference, notes, purchase_order_id, payment_account_code } = req.body");
routes = routes.replace("amount,\n                payment_method,",
    "amount,\n                payment_method,\n                payment_account_code,");
fs.writeFileSync('c:/Users/activ/Desktop/pos/backend/src/routes/suppliers.js', routes);
console.log("Routes updated");

// 3. AccountingService
let actService = fs.readFileSync('c:/Users/activ/Desktop/pos/backend/src/services/accountingService.js', 'utf8');
const searchString = `        let creditAccount
        switch (payment_method) {
            case 'cash': creditAccount = accts.cash; break;
            case 'bank_transfer':
            case 'check':
            case 'card': creditAccount = accts.bank; break;
            default: creditAccount = accts.bank;
        }`;

const replaceString = `        // Determine credit account
        let creditAccount = payment.payment_account_code;
        if (!creditAccount) {
            switch (payment_method) {
                case 'cash': creditAccount = accts.cash; break;
                case 'bank_transfer':
                case 'check':
                case 'card': creditAccount = accts.bank; break;
                default: creditAccount = accts.bank;
            }
        }`;
actService = actService.replace(searchString, replaceString);
fs.writeFileSync('c:/Users/activ/Desktop/pos/backend/src/services/accountingService.js', actService);
console.log("AccountingService updated");

