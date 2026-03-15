const fs = require('fs')
let c = fs.readFileSync('./src/server.js', 'utf8')

// Remove the duplicate delivery block
const duplicate = `// Delivery Module\nconst deliveryRoutes = require('./routes/delivery')\napp.use('/api/delivery', deliveryRoutes)\n// Delivery Module\nconst deliveryRoutes = require('./routes/delivery')\napp.use('/api/delivery', deliveryRoutes)`

const single = `// Delivery Module\nconst deliveryRoutes = require('./routes/delivery')\napp.use('/api/delivery', deliveryRoutes)`

c = c.replace(duplicate, single)

fs.writeFileSync('./src/server.js', c)
console.log('✅ Fixed duplicate deliveryRoutes in server.js')
console.log('Lines containing delivery:')
c.split('\n').forEach((line, i) => {
    if (line.toLowerCase().includes('delivery')) {
        console.log(`  ${i + 1}: ${line.trim()}`)
    }
})
