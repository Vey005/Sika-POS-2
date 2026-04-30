const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'sikapos-electron', 'sikapos.db');
const db = new Database(dbPath);

const count = db.prepare('SELECT COUNT(*) as count FROM transactions').get();
console.log('Total Transactions:', count.count);

const dates = db.prepare('SELECT DISTINCT date(created_at) as d FROM transactions').all();
console.log('Available Dates:', dates.map(d => d.d));

const today = new Date().toISOString().slice(0, 10);
console.log('Today:', today);

const reportData = db.prepare(`
    SELECT COUNT(*) as count FROM transactions 
    WHERE status = 'completed' AND date(created_at) = date(?)
`).get(today);
console.log('Completed Transactions Today:', reportData.count);
