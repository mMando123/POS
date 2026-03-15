const fs = require('fs');
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/backend/src/models/PurchaseReceipt.js', 'utf8');
c = c.replace('status: {', `payment_method: {
        type: DataTypes.ENUM('credit', 'cash', 'bank_transfer', 'check', 'card'),
        allowNull: false,
        defaultValue: 'credit'
    },
    payment_account_code: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    status: {`);
fs.writeFileSync('c:/Users/activ/Desktop/pos/backend/src/models/PurchaseReceipt.js', c);
console.log('Done');
