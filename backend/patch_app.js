const fs = require('fs')
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/App.jsx', 'utf8')

// Add imports
c = c.replace(
    "import SalesInvoices from './pages/SalesInvoices'",
    "import SalesInvoices from './pages/SalesInvoices'\nimport DeliveryBoard from './pages/DeliveryBoard'\nimport DeliveryManagement from './pages/DeliveryManagement'"
)

// Add routes
c = c.replace(
    '<Route path="sales-invoices" element={<SalesInvoices />} />',
    `<Route path="sales-invoices" element={<SalesInvoices />} />
                            <Route path="delivery-board" element={<DeliveryBoard />} />
                            <Route path="delivery-management" element={<DeliveryManagement />} />`
)

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/App.jsx', c)
console.log('✅ App.jsx updated with delivery routes')
