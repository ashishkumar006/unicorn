const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'travel.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database', err);
  } else {
    console.log('✅ Connected to SQLite database (root db.js)');
    
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        message TEXT,
        sender TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      
      db.run(`CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        planData TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      
      console.log('✅ Database tables initialized');
    });
  }
});

module.exports = db;
