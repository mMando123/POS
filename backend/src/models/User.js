const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')
const bcrypt = require('bcryptjs')

const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    name_ar: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    name_en: {
        type: DataTypes.STRING(100)
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: {
            isEmail: true
        }
    },
    role: {
        type: DataTypes.ENUM('admin', 'manager', 'cashier', 'chef', 'supervisor', 'accountant'),
        allowNull: false,
        defaultValue: 'cashier'
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    default_warehouse_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    last_login: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'users',
    hooks: {
        beforeCreate: async (user) => {
            if (user.password_hash && !user.password_hash.startsWith('$2')) {
                user.password_hash = await bcrypt.hash(user.password_hash, 10)
            }
        },
        beforeUpdate: async (user) => {
            if (user.changed('password_hash') && !user.password_hash.startsWith('$2')) {
                user.password_hash = await bcrypt.hash(user.password_hash, 10)
            }
        }
    }
})

User.prototype.validatePassword = async function (password) {
    return bcrypt.compare(password, this.password_hash)
}

module.exports = User
