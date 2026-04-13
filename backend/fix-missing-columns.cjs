const { Sequelize } = require('sequelize');

const seq = new Sequelize('pos_restaurant', 'root', 'Mando123@#', {
  host: 'localhost',
  port: 3306,
  dialect: 'mysql',
  logging: false
});

const columnsToAdd = [
  { table: 'menu', col: 'option_groups', type: 'JSON DEFAULT NULL' },
];

(async () => {
  for (const c of columnsToAdd) {
    try {
      await seq.query('ALTER TABLE `' + c.table + '` ADD COLUMN `' + c.col + '` ' + c.type);
      console.log('ADDED: ' + c.table + '.' + c.col);
    } catch(e) {
      if (e.original && e.original.code === 'ER_DUP_FIELDNAME') {
        console.log('EXISTS: ' + c.table + '.' + c.col);
      } else {
        console.error('ERROR ' + c.table + '.' + c.col + ':', e.original ? e.original.sqlMessage : e.message);
      }
    }
  }
  await seq.close();
  console.log('Done.');
})();
