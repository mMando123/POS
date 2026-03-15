const fs = require('fs')
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/components/Layout.jsx', 'utf8')

// 1. Add delivery section after purchases section
const purchasesSectionEnd = `                { text: t('sidebar.purchaseReturns'), icon: <ReturnIcon />, path: '/purchase-returns', roles: ['admin', 'manager'] },
            ]
        },`

const deliverySection = `                { text: t('sidebar.purchaseReturns'), icon: <ReturnIcon />, path: '/purchase-returns', roles: ['admin', 'manager'] },
            ]
        },
        {
            id: 'delivery',
            title: 'الديليفري والتوصيل',
            icon: <DeliveryIcon />,
            roles: ['admin', 'manager'],
            items: [
                { text: 'لوحة تتبع الطلبات', icon: <DeliveryIcon />, path: '/delivery-board', roles: ['admin', 'manager', 'cashier'] },
                { text: 'إدارة موظفي الديليفري', icon: <UsersIcon />, path: '/delivery-management', roles: ['admin', 'manager'] },
            ]
        },`

c = c.replace(purchasesSectionEnd, deliverySection)

// 2. Also update the path list for cashier group check (optional - not critical)
// to include /delivery-board in cashier allowed paths
c = c.replace(
    "['/new-order', '/orders', '/sales-invoices', '/cashier-queue', '/pending-orders', '/refunds', '/coupons', '/customers'].includes(path)",
    "['/new-order', '/orders', '/sales-invoices', '/cashier-queue', '/pending-orders', '/refunds', '/coupons', '/customers', '/delivery-board'].includes(path)"
)

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/components/Layout.jsx', c)
console.log('✅ Layout.jsx updated with delivery menu items')
