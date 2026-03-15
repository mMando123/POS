const fs = require('fs')
let c = fs.readFileSync('./src/server.js', 'utf8')
c = c.replace(
    "// System Data Setup\r\napp.use('/api/system', systemRoutes)",
    "// Delivery Module\nconst deliveryRoutes = require('./routes/delivery')\napp.use('/api/delivery', deliveryRoutes)\n// System Data Setup\napp.use('/api/system', systemRoutes)"
)
c = c.replace(
    "// System Data Setup\napp.use('/api/system', systemRoutes)",
    "// Delivery Module\nconst deliveryRoutes = require('./routes/delivery')\napp.use('/api/delivery', deliveryRoutes)\n// System Data Setup\napp.use('/api/system', systemRoutes)"
)
fs.writeFileSync('./src/server.js', c)
console.log('✅ server.js updated')
