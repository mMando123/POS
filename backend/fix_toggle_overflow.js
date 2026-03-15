const fs = require('fs')
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', 'utf8')

// Shorten the ToggleButton labels and prevent overflow
c = c.replace(
    `                <ToggleButton value="walkin" sx={{ flexDirection: 'column', py: 1, gap: 0.3 }}>
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
                </ToggleButton>`,
    `                <ToggleButton value="walkin" sx={{ flexDirection: 'column', py: 0.8, gap: 0.2, flex: 1, minWidth: 0, px: 0.5 }}>
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
                </ToggleButton>`
)

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', c)
console.log('✅ ToggleButtons fixed - no overflow')
