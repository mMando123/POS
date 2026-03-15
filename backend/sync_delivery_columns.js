/**
 * Add missing delivery columns to MySQL orders table
 */
require('dotenv').config()
const db = require('./src/models/index')

async function addDeliveryColumns() {
    const qi = db.sequelize.getQueryInterface()
    const { DataTypes } = require('sequelize')

    const columns = [
        ['delivery_status', { type: DataTypes.STRING(20), allowNull: true }],
        ['delivery_assigned_at', { type: DataTypes.DATE, allowNull: true }],
        ['delivery_picked_up_at', { type: DataTypes.DATE, allowNull: true }],
        ['delivery_completed_at', { type: DataTypes.DATE, allowNull: true }],
        ['delivery_fee', { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 }],
        ['delivery_address', { type: DataTypes.TEXT, allowNull: true }],
    ]

    for (const [colName, colDef] of columns) {
        try {
            await qi.addColumn('orders', colName, colDef)
            console.log(`✅ Added column: ${colName}`)
        } catch (e) {
            if (e.message.includes('Duplicate column') || e.original?.code === 'ER_DUP_FIELDNAME') {
                console.log(`⏩ Column already exists: ${colName}`)
            } else {
                console.error(`❌ Error adding ${colName}:`, e.message)
            }
        }
    }

    // Also check delivery_personnel_id
    try {
        await qi.addColumn('orders', 'delivery_personnel_id', {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'delivery_personnel', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        })
        console.log('✅ Added column: delivery_personnel_id')
    } catch (e) {
        if (e.message.includes('Duplicate column') || e.original?.code === 'ER_DUP_FIELDNAME') {
            console.log('⏩ Column already exists: delivery_personnel_id')
        } else {
            console.error('❌ Error adding delivery_personnel_id:', e.message)
        }
    }

    console.log('\n🎉 Done!')
    process.exit(0)
}

addDeliveryColumns()
