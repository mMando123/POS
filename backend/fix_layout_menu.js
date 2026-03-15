const fs = require('fs')
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/components/Layout.jsx', 'utf8')

// The replace tool broke it. Let's find dashboard and inventory and put sales back in exactly.
const p1 = c.indexOf(`        {
            id: 'dashboard',`)
const p2 = c.indexOf(`            icon: <InventoryIcon />,
            roles: ['admin', 'manager'],
            items: [`)

if (p1 !== -1 && p2 !== -1) {
    // Need to include the dashboard part since we'll replace from p1 to p2 to rebuild correctly
    const before = c.substring(0, p1)
    const after = c.substring(p2)

    const rebuilt = `        {
            id: 'dashboard',
            title: t('sidebar.dashboard') || 'لوحة التحكم',
            icon: <DashboardIcon />,
            roles: ['admin', 'manager'],
            path: '/',
        },
        {
            id: 'sales',
            title: t('sidebar.sales'),
            icon: <SalesIcon />,
            roles: [],
            items: [
                { text: t('sidebar.directSale'), icon: <NewOrderIcon />, path: '/new-order', roles: [] },
                { text: 'لوحة الدليفري', icon: <DashboardIcon />, path: '/delivery-board', roles: [] },
                { text: 'إدارة الدليفري', icon: <DeliveryIcon />, path: '/delivery-management', roles: ['admin', 'manager'] },
                { text: t('sidebar.onlineOrders'), icon: <DeliveryIcon />, path: '/pending-orders', roles: [] },
                { text: t('sidebar.readyOrders'), icon: <ReadyOrdersIcon />, path: '/cashier-queue', roles: [] },
                { text: t('sidebar.orderHistory'), icon: <OrderIcon />, path: '/orders', roles: [] },
                { text: 'فواتير البيع المباشر', icon: <ReceiptIcon />, path: '/sales-invoices', roles: [] },
                { text: t('sidebar.refunds'), icon: <RefundIcon />, path: '/refunds', roles: ['admin', 'manager', 'supervisor'] },
                { text: 'إدارة الكوبونات', icon: <CouponIcon />, path: '/coupons', roles: ['admin', 'manager'] },
                { text: 'العملاء', icon: <UsersIcon />, path: '/customers', roles: ['admin', 'manager'] },
            ]
        },
        {
            id: 'inventory',
            title: t('sidebar.inventory'),
`
    fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/components/Layout.jsx', before + rebuilt + after)
    console.log('✅ Rebuilt sales menu correctly with Delivery options')
} else {
    console.log('❌ Could not find boundaries')
}
