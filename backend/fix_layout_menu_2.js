const fs = require('fs')
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/components/Layout.jsx', 'utf8')

const target = `        {
            id: 'dashboard',
            title: t('sidebar.dashboard') || 'لوحة التحكم',
            icon: <DashboardIcon />,
            roles: ['admin', 'manager'],
            path: '/',
        },
        icon: <InventoryIcon />`

const p1 = c.indexOf(target)
if (p1 !== -1) {
    const replacement = `        {
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
            icon: <InventoryIcon />`

    c = c.replace(target, replacement)
    fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/components/Layout.jsx', c)
    console.log('✅ Menu restored correctly via string replace')
} else {
    console.log('❌ Could not find exact corrupted block')
}
