require('dotenv').config();
const { sequelize } = require('./src/config/database');

async function run() {
    try {
        await sequelize.query("ALTER TABLE purchase_receipts ADD COLUMN payment_method VARCHAR(50) DEFAULT 'credit'");
    } catch (err) { }
    try {
        await sequelize.query("ALTER TABLE purchase_receipts ADD COLUMN payment_account_code VARCHAR(50) DEFAULT NULL");
        console.log("Success");
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}
run();
