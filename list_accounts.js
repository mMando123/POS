
const { Account, sequelize } = require('./backend/src/models');

async function listAccounts() {
    try {
        const accounts = await Account.findAll({ order: [['code', 'ASC']] });
        console.log('--- Current Accounts ---');
        accounts.forEach(a => {
            console.log(`${a.code}: ${a.name_ar} (${a.account_type})`);
        });
        console.log('------------------------');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

listAccounts();
