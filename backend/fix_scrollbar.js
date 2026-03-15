const fs = require('fs')
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', 'utf8')

// Fix 1: Main cart container - ensure overflowX hidden
c = c.replace(
    `<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, overflowY: 'auto', overflowX: 'hidden' }}>`,
    `<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, overflowY: 'auto', overflowX: 'hidden', minWidth: 0, width: '100%' }}>`
)

// Fix 2: Cart items box - add minWidth:0 to prevent expansion
c = c.replace(
    `sx={{\n        mb: 2,\n        maxHeight: isMobile ? 220 : 280,\n        overflowY: 'auto',\n        overflowX: 'hidden',\n        border: '1px solid',\n        borderColor: 'divider',\n        borderRadius: 2,\n        p: 1\n      }}>`,
    `sx={{\n        mb: 2,\n        maxHeight: isMobile ? 220 : 280,\n        overflowY: 'auto',\n        overflowX: 'hidden',\n        border: '1px solid',\n        borderColor: 'divider',\n        borderRadius: 2,\n        p: 1,\n        minWidth: 0\n      }}>`
)

// Fix 3: The delivery order type section - add maxWidth: '100%' and prevent overflow
c = c.replace(
    `            {/* === نوع الطلب === */}
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>`,
    `            {/* === نوع الطلب === */}
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2, width: '100%', overflow: 'hidden', minWidth: 0 }}>`
)

// Fix 4: ToggleButtonGroup should not cause horizontal overflow
c = c.replace(
    `              <ToggleButtonGroup
                value={orderType}
                exclusive
                onChange={(e, v) => { if (v) setOrderType(v) }}
                fullWidth
                size="small"
              >`,
    `              <ToggleButtonGroup
                value={orderType}
                exclusive
                onChange={(e, v) => { if (v) setOrderType(v) }}
                fullWidth
                size="small"
                sx={{ width: '100%', minWidth: 0 }}
              >`
)

// Fix 5: Right side cart Paper container - add overflow hidden
c = c.replace(
    `elevation={0}
        sx={{
          width: 400,
          flexShrink: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper'
        }}>`,
    `elevation={0}
        sx={{
          width: 400,
          flexShrink: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
          overflow: 'hidden'
        }}>`
)

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', c)
console.log('✅ Fixed horizontal scrollbar in NewOrder.jsx')
