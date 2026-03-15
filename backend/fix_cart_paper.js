const fs = require('fs')
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', 'utf8')

// If the block is missing, let's look for `            {/* Mobile Cart Drawer */}`
// and re-insert the Paper block right before it.

const missingBlock = `            {/* Right Side: Cart (Desktop) */}
            {!isMobile &&
      <Paper
        elevation={0}
        sx={{
          width: { md: 400, lg: 480, xl: 520 },
          flexShrink: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
          overflow: 'hidden'
        }}>
        
                    {cartContent}
                </Paper>
      }

            {/* Mobile Cart Drawer */}`

c = c.replace(
    `            {/* Mobile Cart Drawer */}`,
    missingBlock
)

// Let's also update max-width on mobile
c = c.replace(
    `width: '85%', maxWidth: 400`,
    `width: '85%', maxWidth: 500`
)

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/NewOrder.jsx', c)
console.log('✅ Cart width fixed')
