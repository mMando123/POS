const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Warehouse = sequelize.define('Warehouse', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'e.g. Main Warehouse, Jeddah Branch Store'
    },
    inventory_account_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'MUST link to an Asset (Inventory sub-ledger)'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'acm_warehouses',
    indexes: [
        { unique: true, fields: ['name', 'company_id'] },
        { fields: ['company_id'] },
        { fields: ['inventory_account_id'] }
    ]
});

module.exports = Warehouse;
