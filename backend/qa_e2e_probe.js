require('dotenv').config();
const { sequelize } = require('./src/config/database.js');

async function run() {
    try {
        await sequelize.authenticate();
        console.log('=== DB CONNECTION: OK ===\n');

        // GL Journal Entries
        const [gle] = await sequelize.query('SELECT id, source_type, source_id, entry_number, total_amount, status, created_at FROM gl_journal_entries ORDER BY created_at DESC LIMIT 5');
        console.log('GL JOURNAL ENTRIES (latest):', JSON.stringify(gle, null, 2));

        // Stock Movements
        const [sm] = await sequelize.query(`SELECT sm.id, sm.movement_type, sm.quantity, sm.unit_cost, sm.source_type, sm.source_id, m.name_ar FROM stock_movements sm LEFT JOIN menu m ON sm.menu_id = m.id ORDER BY sm.created_at DESC LIMIT 10`);
        console.log('\nSTOCK MOVEMENTS:', JSON.stringify(sm, null, 2));

        // Stuck orders
        const [stuck] = await sequelize.query("SELECT id, order_number, order_type, status, payment_status, created_at FROM orders WHERE status = 'handed_to_cashier'");
        console.log('\nSTUCK ORDERS (handed_to_cashier):', JSON.stringify(stuck, null, 2));

        // Delivery orders
        const [delOrders] = await sequelize.query("SELECT id, order_number, order_type, status, delivery_status, delivery_personnel_id, created_at FROM orders WHERE order_type IN ('delivery','online') ORDER BY created_at DESC LIMIT 5");
        console.log('\nDELIVERY/ONLINE ORDERS:', JSON.stringify(delOrders, null, 2));

        // Journal Lines for latest JE
        if (gle.length > 0) {
            const [jl] = await sequelize.query('SELECT jl.account_id, jl.debit, jl.credit, jl.description FROM gl_journal_lines jl WHERE jl.journal_entry_id = ? LIMIT 10', { replacements: [gle[0].id] });
            console.log('\nJOURNAL LINES for', gle[0].entry_number, ':', JSON.stringify(jl, null, 2));
        }

        // Notifications
        const [notifs] = await sequelize.query('SELECT id, type, title, entity_type, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 5');
        console.log('\nNOTIFICATIONS:', JSON.stringify(notifs, null, 2));

        // KDS active orders
        const [kdsOrders] = await sequelize.query("SELECT id, order_number, order_type, status FROM orders WHERE status IN ('approved','new','confirmed','preparing','ready') ORDER BY created_at ASC LIMIT 5");
        console.log('\nKDS ACTIVE ORDERS:', JSON.stringify(kdsOrders, null, 2));

        // Stock issues
        const [si] = await sequelize.query('SELECT id, issue_number, status, warehouse_id, created_at FROM stock_issues ORDER BY created_at DESC LIMIT 3');
        console.log('\nSTOCK ISSUES:', JSON.stringify(si, null, 2));

        // Count totals
        const [totals] = await sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM orders) as total_orders,
        (SELECT COUNT(*) FROM orders WHERE status='completed') as completed_orders,
        (SELECT COUNT(*) FROM orders WHERE status='cancelled') as cancelled_orders,
        (SELECT COUNT(*) FROM orders WHERE status='handed_to_cashier') as stuck_orders,
        (SELECT COUNT(*) FROM gl_journal_entries) as journal_entries,
        (SELECT COUNT(*) FROM stock_movements) as stock_movements,
        (SELECT COUNT(*) FROM notifications) as notifications,
        (SELECT COUNT(*) FROM refunds) as refunds_count,
        (SELECT COUNT(*) FROM delivery_personnel WHERE is_active=1) as active_drivers
    `);
        console.log('\n=== SYSTEM TOTALS ===', JSON.stringify(totals[0], null, 2));

        // Check if online orders have GL entries
        const [onlineOrders] = await sequelize.query("SELECT id, order_number FROM orders WHERE order_type='online' AND status='completed' LIMIT 3");
        for (const ord of onlineOrders) {
            const [je] = await sequelize.query("SELECT COUNT(*) as cnt FROM gl_journal_entries WHERE source_id = ?", { replacements: [ord.id] });
            console.log(`Order ${ord.order_number}: GL entries = ${je[0].cnt}`);
        }

        // Check if stock was deducted for completed walkin orders
        const [walkinDone] = await sequelize.query("SELECT id, order_number FROM orders WHERE order_type='walkin' AND status='completed' ORDER BY created_at DESC LIMIT 2");
        for (const ord of walkinDone) {
            const [moves] = await sequelize.query("SELECT COUNT(*) as cnt FROM stock_movements WHERE source_id = ? AND source_type='order'", { replacements: [ord.id] });
            console.log(`Walkin Order ${ord.order_number}: stock movements = ${moves[0].cnt}`);
        }

        // Idempotency keys
        const [idem] = await sequelize.query("SELECT id, key_hash, endpoint_name, created_at FROM idempotency_keys ORDER BY created_at DESC LIMIT 3");
        console.log('\nIDEMPOTENCY KEYS:', JSON.stringify(idem, null, 2));

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        sequelize.close();
    }
}
run();
