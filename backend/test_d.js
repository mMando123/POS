const db = require('./src/models/index');
async function run() {
    try {
        console.log('Testing Orders...');
        const orders = await db.Order.findAll({ limit: 1 });
        console.log('Orders OK:', orders.length);

        console.log('Testing DeliveryPersonnel...');
        const personnel = await db.DeliveryPersonnel.findAll({ limit: 1 });
        console.log('Personnel OK:', personnel.length);

        console.log('Testing include...');
        const ordersWithRider = await db.Order.findAll({
            where: { order_type: 'delivery' },
            include: [
                { model: db.OrderItem, as: 'items' },
                { model: db.DeliveryPersonnel, as: 'deliveryRider', required: false },
                { model: db.Customer, attributes: ['id', 'name', 'phone'], required: false }
            ],
            limit: 1
        });
        console.log('Include OK:', ordersWithRider.length);
    } catch (e) {
        console.error('ERROR:', e);
    }
}
run();
