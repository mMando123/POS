const fs = require('fs')

let content = fs.readFileSync('./src/models/index.js', 'utf8')

// If not already there, we'll add it forcefully. The previous code didn't match the string replacing due to crlf vs lf or something.
if (!content.includes('const DeliveryPersonnel')) {
    content = content.replace(
        "const TrainingProgram = require('./TrainingProgram')",
        "const TrainingProgram = require('./TrainingProgram')\nconst DeliveryPersonnel = require('./DeliveryPersonnel')"
    )

    // Associations
    const orderAssoc = "Branch.hasMany(Order, { foreignKey: 'branch_id' })"
    const deliveryAssoc = `\n// Delivery Personnel associations\nDeliveryPersonnel.hasMany(Order, { foreignKey: 'delivery_personnel_id', as: 'deliveryOrders' })\nOrder.belongsTo(DeliveryPersonnel, { foreignKey: 'delivery_personnel_id', as: 'deliveryRider' })\n`
    content = content.replace(orderAssoc, orderAssoc + deliveryAssoc)

    // Exports
    content = content.replace(
        "    TrainingProgram,\n    initDatabase",
        "    TrainingProgram,\n    DeliveryPersonnel,\n    initDatabase"
    )

    fs.writeFileSync('./src/models/index.js', content)
    console.log('Force applied DeliveryPersonnel to models/index.js')
} else {
    console.log('Already has DeliveryPersonnel... Wait, lets check exports.')
    if (!content.includes('    DeliveryPersonnel,\n    initDatabase')) {
        content = content.replace(
            "    TrainingProgram,\n    initDatabase",
            "    TrainingProgram,\n    DeliveryPersonnel,\n    initDatabase"
        )
        fs.writeFileSync('./src/models/index.js', content)
        console.log('Fixed exports for DeliveryPersonnel')
    }
}
