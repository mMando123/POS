const { Sequelize } = require('sequelize');
const path = require('path');

const seq = new Sequelize('pos_restaurant', 'root', 'Mando123@#', {
  host: 'localhost',
  port: 3306,
  dialect: 'mysql',
  logging: false
});

(async () => {
  try {
    // Get all tables
    const [tables] = await seq.query("SHOW TABLES");
    const tableNames = tables.map(t => Object.values(t)[0]);
    
    // Load all models
    const modelsDir = path.join(__dirname, 'src', 'models');
    const fs = require('fs');
    const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));
    
    const missing = [];
    
    for (const file of modelFiles) {
      try {
        const modelDef = require(path.join(modelsDir, file));
        if (typeof modelDef === 'function') {
          const Model = modelDef(seq, Sequelize.DataTypes);
          if (Model && Model.tableName) {
            const tableName = Model.tableName;
            if (!tableNames.includes(tableName)) continue;
            
            const [columns] = await seq.query('SHOW COLUMNS FROM `' + tableName + '`');
            const dbCols = columns.map(c => c.Field);
            const modelCols = Object.keys(Model.rawAttributes || {});
            
            for (const mc of modelCols) {
              const field = Model.rawAttributes[mc].field || mc;
              if (!dbCols.includes(field)) {
                const attrType = Model.rawAttributes[mc].type;
                let sqlType = 'TEXT';
                const typeKey = attrType.key || (attrType.constructor && attrType.constructor.key) || '';
                if (typeKey === 'JSON') sqlType = 'JSON DEFAULT NULL';
                else if (typeKey === 'BOOLEAN') sqlType = 'TINYINT(1) DEFAULT 0';
                else if (typeKey === 'INTEGER') sqlType = 'INT DEFAULT NULL';
                else if (typeKey === 'FLOAT' || typeKey === 'DECIMAL' || typeKey === 'DOUBLE') sqlType = 'DECIMAL(15,2) DEFAULT NULL';
                else if (typeKey === 'DATE' || typeKey === 'DATEONLY') sqlType = 'DATETIME DEFAULT NULL';
                else if (typeKey === 'STRING' || typeKey === 'TEXT') sqlType = 'TEXT DEFAULT NULL';
                else if (typeKey === 'UUID') sqlType = 'VARCHAR(36) DEFAULT NULL';
                else if (typeKey === 'ENUM') sqlType = 'VARCHAR(255) DEFAULT NULL';
                
                missing.push({ table: tableName, col: field, sqlType: sqlType, model: file });
              }
            }
          }
        }
      } catch(e) {
        // skip models that fail to load
      }
    }
    
    if (missing.length === 0) {
      console.log('All model columns exist in database!');
    } else {
      console.log('Missing columns found (' + missing.length + '):');
      for (const m of missing) {
        console.log('  ' + m.table + '.' + m.col + ' (' + m.sqlType + ') [' + m.model + ']');
      }
      
      console.log('\nAdding missing columns...');
      for (const m of missing) {
        try {
          await seq.query('ALTER TABLE `' + m.table + '` ADD COLUMN `' + m.col + '` ' + m.sqlType);
          console.log('  ADDED: ' + m.table + '.' + m.col);
        } catch(e) {
          if (e.original && e.original.code === 'ER_DUP_FIELDNAME') {
            console.log('  EXISTS: ' + m.table + '.' + m.col);
          } else {
            console.error('  ERROR: ' + m.table + '.' + m.col + ' - ' + (e.original ? e.original.sqlMessage : e.message));
          }
        }
      }
    }
  } catch(e) {
    console.error('Fatal error:', e.message);
  }
  
  await seq.close();
  console.log('Done.');
})();
