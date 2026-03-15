const fs = require('fs');
const path = './src/routes/inventory.js';
const content = fs.readFileSync(path, 'utf8');

const updated = content.replace(/(['"`])([^'"`]*Ø[^'"`]*)(['"`])/g, (match, p1, p2, p3) => {
    try {
        const decoded = Buffer.from(p2, 'latin1').toString('utf8');
        if (/[\u0600-\u06FF]/.test(decoded)) {
            return p1 + decoded + p3;
        }
        return match;
    } catch (e) {
        return match;
    }
});

fs.writeFileSync(path, updated, 'utf8');
console.log('Fixed mojibake encoding!');
