const fs = require('fs')
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', 'utf8')

// Find the start and end of cartContent
const startMarker = '  const cartContent =\n'
const endMarker = '        </Box>;\n'

const startIdx = c.indexOf(startMarker)
// Find the closing Box that ends cartContent (line 1139)
const endIdx = c.indexOf(endMarker, startIdx)

if (startIdx === -1 || endIdx === -1) {
    // Try with \r\n
    const startMarker2 = '  const cartContent =\r\n'
    const endMarker2 = '        </Box>;\r\n'
    const s2 = c.indexOf(startMarker2)
    const e2 = c.indexOf(endMarker2, s2)
    console.log('startIdx2:', s2, 'endIdx2:', e2)
} else {
    console.log('Found cartContent from', startIdx, 'to', endIdx)
}

// Use regex to find the block
const cartStart = c.search(/const cartContent =\s*\n/)
const cartStartAlt = c.search(/const cartContent =\r?\n/)
console.log('cartStart regex:', cartStart, 'alt:', cartStartAlt)

// Find by counting - look for specific unique markers
const headerLine = '  const cartContent ='
const closingLine = '        </Box>;'
const si = c.indexOf(headerLine)
let ei = c.indexOf(closingLine, si)
// Make sure we get the right closing - it's after <CartSummary
const cartSummaryIdx = c.indexOf('<CartSummary', si)
ei = c.indexOf(closingLine, cartSummaryIdx)

console.log('si:', si, 'cartSummaryIdx:', cartSummaryIdx, 'ei:', ei)

if (si > 0 && ei > 0) {
    const newCartContent = `  const cartContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ─── FIXED TOP: Header + Order Type ─── */}
      <Box sx={{ flexShrink: 0, px: 2, pt: 2 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="h6" fontWeight="bold" sx={{ flexGrow: 1 }}>سلة الطلبات</Typography>
          <IconButton color="error" onClick={() => dispatch(clearCart())} disabled={cartItems.length === 0} size="small">
            <Delete />
          </IconButton>
          {isMobile && <IconButton onClick={() => setCartOpen(false)} size="small"><Close /></IconButton>}
        </Box>

        {/* نوع الطلب */}
        <Box sx={{ mb: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <ToggleButtonGroup
            value={orderType}
            exclusive
            onChange={(e, v) => { if (v) setOrderType(v) }}
            fullWidth
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                flexDirection: 'column', py: 1, gap: 0.3,
                fontSize: 11, border: 'none',
                '&.Mui-selected': { bgcolor: 'primary.main', color: 'white' }
              }
            }}
          >
            <ToggleButton value="walkin">
              <TakeawayIcon sx={{ fontSize: 18 }} />
              <span>تيك أواي</span>
            </ToggleButton>
            <ToggleButton value="dine_in">
              <DineInIcon sx={{ fontSize: 18 }} />
              <span>صالة</span>
            </ToggleButton>
            <ToggleButton value="delivery">
              <DeliveryIcon sx={{ fontSize: 18 }} />
              <span>ديليفري</span>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Extra fields for dine_in */}
        {orderType === 'dine_in' && (
          <TextField
            fullWidth size="small" label="🪑 رقم الطاولة"
            value={tableNumber}
            onChange={e => setTableNumber(e.target.value)}
            sx={{ mb: 1 }}
          />
        )}

        {/* Extra fields for delivery */}
        {orderType === 'delivery' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
            <TextField
              select fullWidth size="small" label="🛵 موظف الديليفري"
              value={deliveryPersonnelId}
              onChange={e => setDeliveryPersonnelId(e.target.value)}
            >
              <MenuItem value="">— بدون تعيين الآن —</MenuItem>
              {deliveryPersonnel.map(r => (
                <MenuItem key={r.id} value={r.id}>{r.name_ar} • {r.phone}</MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth size="small" label="📍 عنوان التوصيل"
              value={deliveryAddress}
              onChange={e => setDeliveryAddress(e.target.value)}
            />
            <TextField
              fullWidth size="small" label="💰 رسوم التوصيل (ر.س)"
              value={deliveryFee} type="number"
              onChange={e => setDeliveryFee(e.target.value)}
            />
          </Box>
        )}
      </Box>

      {/* ─── SCROLLABLE MIDDLE ─── */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 2, pb: 1 }}>

        {/* Cart Items */}
        <Box sx={{
          mb: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: 1,
          minHeight: 80
        }}>
          {cartItems.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
              <ShoppingCart sx={{ fontSize: 44, opacity: 0.2, mb: 1 }} />
              <Typography variant="body2">السلة فارغة</Typography>
            </Box>
          ) : (
            cartItems.map((item) => (
              <CartItem
                key={item.menu_id}
                item={item}
                onUpdate={(id, qty) => dispatch(updateQuantity({ menu_id: id, quantity: qty }))}
                formatCurrency={formatCurrency}
              />
            ))
          )}
        </Box>

        {offlineCount > 0 && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            يوجد {offlineCount} طلب محفوظ أوفلاين
          </Alert>
        )}

        <TextField fullWidth size="small" label="رقم العميل (اختياري)"
          value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} sx={{ mb: 1 }} />

        <TextField fullWidth size="small" label="اسم العميل (اختياري)"
          value={customerName} onChange={(e) => setCustomerName(e.target.value)} sx={{ mb: 1 }} />

        <TextField select fullWidth size="small" label="قائمة الأسعار"
          value={selectedPriceListId} onChange={(e) => setSelectedPriceListId(e.target.value)} sx={{ mb: 1 }}>
          <MenuItem value="">افتراضي</MenuItem>
          {priceLists.map((list) => <MenuItem key={list.id} value={list.id}>{list.name}</MenuItem>)}
        </TextField>

        {loyaltyInfo?.customer && (
          <Alert severity="info" sx={{ mb: 1 }}>رصيد النقاط: <b>{loyaltyInfo.customer.loyalty_points}</b></Alert>
        )}

        <TextField fullWidth size="small" label="استخدام نقاط الولاء" type="number"
          value={redeemPoints} onChange={(e) => setRedeemPoints(e.target.value)}
          inputProps={{ min: 0, max: loyaltyInfo?.customer?.loyalty_points || undefined }}
          sx={{ mb: 1 }} />

        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField size="small" fullWidth label="كود الكوبون"
            value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
          <Button variant="outlined" onClick={handleApplyCoupon} disabled={couponLoading || cartItems.length === 0}>
            {couponLoading ? '...' : 'تطبيق'}
          </Button>
        </Box>

        {couponInfo && (
          <Alert severity="success" sx={{ mb: 1 }}
            action={<Button color="inherit" size="small" onClick={() => { setCouponInfo(null); setCouponCode('') }}>إزالة</Button>}>
            كوبون {couponInfo.code} — خصم {formatCurrency(localCouponDiscount)}
          </Alert>
        )}

        {pricingLoading && <Alert severity="info" sx={{ mb: 1 }}>جارٍ احتساب التسعير...</Alert>}
        {pricingError && <Alert severity="error" sx={{ mb: 1 }}>{pricingError}</Alert>}

        {pricingPreview?.applied?.promotions?.length > 0 && (
          <Alert severity="success" sx={{ mb: 1 }}>
            عروض: {pricingPreview.applied.promotions.map((x) => x.name).join(', ')}
          </Alert>
        )}

        {cartItems.length > 0 && (
          <Paper variant="outlined" sx={{ mb: 1.5, p: 1.5, borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>تعديل الكمية</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 160, overflowY: 'auto' }}>
              {cartItems.map((item) => (
                <Box key={\`qty-\${item.menu_id}\`}
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 0.75 }}>
                  <Typography variant="body2" noWrap sx={{ maxWidth: '55%' }}>
                    {item.name_ar || item.name_en || item.sku || \`#\${item.menu_id}\`}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'grey.100', borderRadius: 1.5 }}>
                    <IconButton size="small" color="error"
                      onClick={() => dispatch(updateQuantity({ menu_id: item.menu_id, quantity: Math.max(0, item.quantity - 1) }))}>
                      <Remove fontSize="small" />
                    </IconButton>
                    <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 20, textAlign: 'center' }}>
                      {item.quantity}
                    </Typography>
                    <IconButton size="small" color="primary"
                      onClick={() => dispatch(updateQuantity({ menu_id: item.menu_id, quantity: item.quantity + 1 }))}>
                      <Add fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        )}

      </Box>

      {/* ─── FIXED BOTTOM: Summary + Checkout ─── */}
      <Box sx={{ flexShrink: 0, px: 2, pb: 2 }}>
        <CartSummary
          rawSubtotal={effectiveSubtotal}
          discount={discountAmount}
          subtotal={discountedSubtotal}
          tax={tax}
          total={grandTotal}
          taxRate={taxRate}
          onCheckout={handleCheckout}
          loading={loading}
          formatCurrency={formatCurrency}
        />
      </Box>

    </Box>
  );`

    const before = c.substring(0, si)
    const after = c.substring(ei + closingLine.length)
    const result = before + newCartContent + after
    fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', result)
    console.log('✅ cartContent completely rewritten!')
    console.log('New file length:', result.length)
} else {
    console.log('❌ Could not find cartContent boundaries')
    console.log('si:', si, 'ei:', ei)
}
