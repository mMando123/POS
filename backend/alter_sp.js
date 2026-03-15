const fs = require('fs');
const { sequelize } = require('./src/config/database');

async function run() {
    try {
        await sequelize.query("ALTER TABLE supplier_payments ADD COLUMN payment_account_code VARCHAR(50) DEFAULT NULL");
        console.log("Column added successfully");
    } catch (e) {
        console.log("Error or already exists:", e.message);
    }
    process.exit(0);
}

run();
