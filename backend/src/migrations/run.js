require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function runMigrations() {
    console.log('🔄 Running database migrations...\n');

    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    for (const file of files) {
        console.log(`📄 Running: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

        try {
            await db.query(sql);
            console.log(`✅ ${file} completed successfully\n`);
        } catch (err) {
            console.error(`❌ Error in ${file}:`, err.message);
            process.exit(1);
        }
    }

    console.log('✅ All migrations completed successfully!');
    process.exit(0);
}

runMigrations();
