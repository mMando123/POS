const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../backend/.env') });

const dialect = (process.env.DB_DIALECT || 'sqlite').trim();
let sequelize;

if (dialect === 'mysql') {
    sequelize = new Sequelize(
        process.env.DB_NAME || 'pos_restaurant',
        process.env.DB_USER || 'root',
        process.env.DB_PASSWORD || '',
        {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            dialect: 'mysql',
            logging: false,
            define: {
                timestamps: true,
                underscored: true,
                collate: 'utf8mb4_unicode_ci' // ensure utf8 support matching pos
            }
        }
    );
} else {
    // Fallback standalone SQLite config
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: path.join(__dirname, '..', 'accounting_module.sqlite'),
        logging: false,
        define: {
            timestamps: true,
            underscored: true
        }
    });
}

module.exports = { sequelize };
