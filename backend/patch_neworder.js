const fs = require('fs')

let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', 'utf8')

// 1. Add deliveryAPI to import
c = c.replace(
    "import { menuAPI, categoryAPI, orderAPI, couponAPI, settingsAPI, pricingAPI, loyaltyAPI, inventoryAPI, warehouseAPI } from '../services/api';",
    "import { menuAPI, categoryAPI, orderAPI, couponAPI, settingsAPI, pricingAPI, loyaltyAPI, inventoryAPI, warehouseAPI, deliveryAPI } from '../services/api';"
)

// 2. Add new icons for order type
c = c.replace(
    "  ReceiptLong as ReceiptIcon,\r\n  CreditCard as CardIcon,\r\n  Payments as CashIcon } from\r\n'@mui/icons-material';",
    "  ReceiptLong as ReceiptIcon,\n  CreditCard as CardIcon,\n  Payments as CashIcon,\n  TableRestaurant as DineInIcon,\n  TakeoutDining as TakeawayIcon,\n  DeliveryDining as DeliveryIcon } from\n'@mui/icons-material';"
)

// 3. Add ToggleButton imports (after Alert in MUI imports)
c = c.replace(
    "  Alert,\r\n  MenuItem } from\r\n'@mui/material';",
    "  Alert,\n  MenuItem,\n  ToggleButton,\n  ToggleButtonGroup,\n  Divider as Div2,\n  Tooltip } from\n'@mui/material';"
)

// 4. Add state variables after splitPayment state
c = c.replace(
    "  const [offlineCount, setOfflineCount] = useState(offlineQueue.count());",
    `  const [offlineCount, setOfflineCount] = useState(offlineQueue.count());
  // Order type & delivery
  const [orderType, setOrderType] = useState('walkin');
  const [tableNumber, setTableNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [deliveryPersonnelId, setDeliveryPersonnelId] = useState('');
  const [deliveryPersonnel, setDeliveryPersonnel] = useState([]);`
)

// 5. Load delivery personnel when orderType=delivery
const effectInsert = `
  useEffect(() => {
    if (orderType === 'delivery' && deliveryPersonnel.length === 0) {
      deliveryAPI.getPersonnel({ status: 'available', active: 'true' })
        .then(r => setDeliveryPersonnel(r.data.data || []))
        .catch(() => {})
    }
  }, [orderType]);
`
c = c.replace(
    "  // Fetch Data\r\n  useEffect(() => {",
    effectInsert + "\n  // Fetch Data\n  useEffect(() => {"
)

// 6. Update submitOrder to pass order_type, table_number, delivery fields
c = c.replace(
    "    const orderData = {\r\n      order_type: 'walkin',",
    `    const orderData = {
      order_type: orderType,
      ...(orderType === 'dine_in' && tableNumber ? { table_number: tableNumber } : {}),
      ...(orderType === 'delivery' && deliveryAddress ? { delivery_address: deliveryAddress } : {}),
      ...(orderType === 'delivery' && deliveryFee ? { delivery_fee: parseFloat(deliveryFee) || 0 } : {}),
      ...(orderType === 'delivery' && deliveryPersonnelId ? { delivery_personnel_id: deliveryPersonnelId, delivery_status: 'assigned' } : { delivery_status: orderType === 'delivery' ? 'pending' : undefined }),`
)

// 7. Add order type selector UI + delivery fields in the cart area
// Insert after "سلة الطلبات" heading
const orderTypeSelectorUI = `
            {/* === نوع الطلب === */}
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                نوع الطلب
              </Typography>
              <ToggleButtonGroup
                value={orderType}
                exclusive
                onChange={(e, v) => { if (v) setOrderType(v) }}
                fullWidth
                size="small"
              >
                <ToggleButton value="walkin" sx={{ flexDirection: 'column', py: 1, gap: 0.3 }}>
                  <TakeawayIcon fontSize="small" />
                  <Typography variant="caption">تيك أواي</Typography>
                </ToggleButton>
                <ToggleButton value="dine_in" sx={{ flexDirection: 'column', py: 1, gap: 0.3 }}>
                  <DineInIcon fontSize="small" />
                  <Typography variant="caption">صالة</Typography>
                </ToggleButton>
                <ToggleButton value="delivery" sx={{ flexDirection: 'column', py: 1, gap: 0.3 }}>
                  <DeliveryIcon fontSize="small" />
                  <Typography variant="caption">ديليفري</Typography>
                </ToggleButton>
              </ToggleButtonGroup>
              {/* Dine-in: table number */}
              {orderType === 'dine_in' && (
                <TextField
                  fullWidth size="small" label="رقم الطاولة"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  sx={{ mt: 1 }}
                />
              )}
              {/* Delivery fields */}
              {orderType === 'delivery' && (
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <TextField
                    select fullWidth size="small" label="موظف الديليفري"
                    value={deliveryPersonnelId}
                    onChange={e => setDeliveryPersonnelId(e.target.value)}
                  >
                    <MenuItem value="">بدون تعيين الآن</MenuItem>
                    {deliveryPersonnel.map(r => (
                      <MenuItem key={r.id} value={r.id}>
                        🛵 {r.name_ar} — {r.phone}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    fullWidth size="small" label="عنوان التوصيل"
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    multiline rows={2}
                  />
                  <TextField
                    fullWidth size="small" label="رسوم التوصيل (ر.س)"
                    value={deliveryFee} type="number"
                    onChange={e => setDeliveryFee(e.target.value)}
                  />
                </Box>
              )}
            </Box>
`

c = c.replace(
    `  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                 <Typography variant="h6" fontWeight="bold" sx={{ flexGrow: 1 }}>سلة الطلبات</Typography>`,
    `  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                 <Typography variant="h6" fontWeight="bold" sx={{ flexGrow: 1 }}>سلة الطلبات</Typography>` + '\n' + orderTypeSelectorUI
)

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', c)
console.log('✅ NewOrder.jsx updated successfully!')
