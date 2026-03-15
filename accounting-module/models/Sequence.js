const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Sequence = sequelize.define('Sequence', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    company_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    prefix: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'e.g. JV for Journal Voucher'
    },
    fiscal_year: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: 'e.g. 2026'
    },
    current_value: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Last used number'
    }
}, {
    tableName: 'acm_sequences',
    indexes: [
        { unique: true, fields: ['company_id', 'prefix', 'fiscal_year'] }
    ]
});

module.exports = Sequence;
