const fs = require('fs')

let content = fs.readFileSync('./src/models/index.js', 'utf8')

// 1. Add require after TrainingProgram
content = content.replace(
    "const TrainingProgram = require('./TrainingProgram')\n",
    "const TrainingProgram = require('./TrainingProgram')\nconst DeliveryPersonnel = require('./DeliveryPersonnel')\n"
)

// 2. Add associations after Order associations
const assocInsert = `
// Delivery Personnel associations
DeliveryPersonnel.hasMany(Order, { foreignKey: 'delivery_personnel_id', as: 'deliveryOrders' })
Order.belongsTo(DeliveryPersonnel, { foreignKey: 'delivery_personnel_id', as: 'deliveryRider' })
`
content = content.replace(
    "Branch.hasMany(Order, { foreignKey: 'branch_id' })\n    Order.belongsTo(Branch, { foreignKey: 'branch_id' })",
    "Branch.hasMany(Order, { foreignKey: 'branch_id' })\n    Order.belongsTo(Branch, { foreignKey: 'branch_id' })\n" + assocInsert
)

// 3. Add to exports before TrainingProgram
content = content.replace(
    '    TrainingProgram,\n    initDatabase',
    '    TrainingProgram,\n    DeliveryPersonnel,\n    initDatabase'
)

fs.writeFileSync('./src/models/index.js', content)
console.log('✅ models/index.js updated')
