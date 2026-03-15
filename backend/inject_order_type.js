const fs = require('fs')
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', 'utf8')

// The exact target to insert after (line 889-890 area)
const target = `            </Box>\r\n\r\n            <Box\n      sx={{\n        mb: 2,`

const replacement = `            </Box>

            {/* === نوع الطلب === */}
            <Box sx={{ mb: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 2, width: '100%', overflow: 'hidden' }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                نوع الطلب
              </Typography>
              <ToggleButtonGroup
                value={orderType}
                exclusive
                onChange={(e, v) => { if (v) setOrderType(v) }}
                fullWidth
                size="small"
                sx={{ width: '100%' }}
              >
                <ToggleButton value="walkin" sx={{ flexDirection: 'column', py: 0.8, gap: 0.2, flex: 1, minWidth: 0, px: 0.5 }}>
                  <TakeawayIcon fontSize="small" />
                  <Typography variant="caption" noWrap sx={{ fontSize: 10 }}>تيك أواي</Typography>
                </ToggleButton>
                <ToggleButton value="dine_in" sx={{ flexDirection: 'column', py: 0.8, gap: 0.2, flex: 1, minWidth: 0, px: 0.5 }}>
                  <DineInIcon fontSize="small" />
                  <Typography variant="caption" noWrap sx={{ fontSize: 10 }}>صالة</Typography>
                </ToggleButton>
                <ToggleButton value="delivery" sx={{ flexDirection: 'column', py: 0.8, gap: 0.2, flex: 1, minWidth: 0, px: 0.5 }}>
                  <DeliveryIcon fontSize="small" />
                  <Typography variant="caption" noWrap sx={{ fontSize: 10 }}>ديليفري</Typography>
                </ToggleButton>
              </ToggleButtonGroup>

              {orderType === 'dine_in' && (
                <TextField
                  fullWidth size="small" label="رقم الطاولة"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  sx={{ mt: 1 }}
                />
              )}

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

            <Box
      sx={{
        mb: 2,`

// Find the exact pattern and replace it
const lines = c.split('\n')
let insertIdx = -1
for (let i = 0; i < lines.length; i++) {
    // Find line 889: </Box> followed by blank line followed by <Box
    if (lines[i].includes('</Box>') &&
        i + 2 < lines.length &&
        lines[i + 2].includes('<Box') &&
        lines[i + 3] && lines[i + 3].includes('sx={{') &&
        lines[i + 4] && lines[i + 4].includes('mb: 2,')) {
        insertIdx = i
        console.log('Found target at line', i + 1, ':', lines[i])
        break
    }
}

if (insertIdx === -1) {
    console.log('Target not found! Trying alternative...')
    // Try to find the cart items box by its unique props
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('maxHeight: isMobile ? 220 : 280,')) {
            insertIdx = i - 4
            console.log('Found via maxHeight at line', i + 1, ', inserting at', insertIdx + 1)
            break
        }
    }
}

if (insertIdx >= 0) {
    const orderTypeSection = `
            {/* === نوع الطلب === */}
            <Box sx={{ mb: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 2, width: '100%', overflow: 'hidden' }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                نوع الطلب
              </Typography>
              <ToggleButtonGroup
                value={orderType}
                exclusive
                onChange={(e, v) => { if (v) setOrderType(v) }}
                fullWidth
                size="small"
                sx={{ width: '100%' }}
              >
                <ToggleButton value="walkin" sx={{ flexDirection: 'column', py: 0.8, gap: 0.2, flex: 1, minWidth: 0, px: 0.5 }}>
                  <TakeawayIcon fontSize="small" />
                  <Typography variant="caption" noWrap sx={{ fontSize: 10 }}>تيك أواي</Typography>
                </ToggleButton>
                <ToggleButton value="dine_in" sx={{ flexDirection: 'column', py: 0.8, gap: 0.2, flex: 1, minWidth: 0, px: 0.5 }}>
                  <DineInIcon fontSize="small" />
                  <Typography variant="caption" noWrap sx={{ fontSize: 10 }}>صالة</Typography>
                </ToggleButton>
                <ToggleButton value="delivery" sx={{ flexDirection: 'column', py: 0.8, gap: 0.2, flex: 1, minWidth: 0, px: 0.5 }}>
                  <DeliveryIcon fontSize="small" />
                  <Typography variant="caption" noWrap sx={{ fontSize: 10 }}>ديليفري</Typography>
                </ToggleButton>
              </ToggleButtonGroup>

              {orderType === 'dine_in' && (
                <TextField
                  fullWidth size="small" label="رقم الطاولة"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  sx={{ mt: 1 }}
                />
              )}

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
    lines.splice(insertIdx + 2, 0, orderTypeSection)
    fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', lines.join('\n'))
    console.log('✅ Order type section successfully inserted at line', insertIdx + 2)
} else {
    console.log('❌ Could not find insertion point')
}
