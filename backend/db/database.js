/**
 * DATABASE LAYER - SQLite3 Persistence
 * 
 * Handles:
 * - Chat history storage
 * - Plan persistence
 * - RAG document storage
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    const dbPath = path.resolve(__dirname, '../travel.db');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Database connection error:', err);
      } else {
        console.log('✅ Connected to SQLite database');
        this.initTables();
      }
    });
  }

  /**
   * Initialize database tables
   */
  initTables() {
    this.db.serialize(() => {
      // Conversations table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          message TEXT,
          sender TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(userId) REFERENCES users(id)
        )
      `);

      // Plans table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          planId TEXT UNIQUE,
          destination TEXT,
          groupSize INTEGER,
          budget REAL,
          planData TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(userId) REFERENCES users(id)
        )
      `);

      // Users table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // RAG Documents table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS rag_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          docId TEXT UNIQUE,
          userId TEXT NOT NULL,
          documentData TEXT,
          keywords TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(userId) REFERENCES users(id)
        )
      `);

      console.log('✅ Database tables initialized');
    });
  }

  /**
   * Save conversation message
   */
  saveMessage(userId, message, sender) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO conversations (userId, message, sender) VALUES (?, ?, ?)',
        [userId, message, sender],
        function(err) {
          if (err) {
            console.error('[DB] Error saving message:', { userId, sender, error: err.message });
            reject(err);
          } else {
            console.log('[DB] ✅ Message saved:', { userId, sender, messageLength: message.length, id: this.lastID });
            resolve(this.lastID);
          }
        }
      );
    });
  }

  /**
   * Get conversation history
   */
  getConversationHistory(userId, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM conversations WHERE userId = ? ORDER BY timestamp DESC LIMIT ?',
        [userId, limit],
        (err, rows) => {
          if (err) {
            console.error('[DB] Error getting conversation history:', { userId, error: err.message });
            reject(err);
          } else {
            console.log('[DB] 📜 Retrieved conversation history:', { userId, count: rows ? rows.length : 0 });
            resolve(rows ? rows.reverse() : []);
          }
        }
      );
    });
  }

  /**
   * Save plan
   */
  savePlan(userId, planId, planData, metadata = {}) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO plans (userId, planId, destination, groupSize, budget, planData)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          planId,
          metadata.destination,
          metadata.groupSize,
          metadata.budget,
          JSON.stringify(planData)
        ],
        function(err) {
          if (err) reject(err);
          else resolve(planId);
        }
      );
    });
  }

  /**
   * Get user's plans
   */
  getUserPlans(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM plans WHERE userId = ? ORDER BY createdAt DESC',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const plans = rows ? rows.map(row => ({
              ...row,
              planData: JSON.parse(row.planData)
            })) : [];
            resolve(plans);
          }
        }
      );
    });
  }

  /**
   * Save RAG document
   */
  saveRAGDocument(userId, docId, documentData, keywords = []) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO rag_documents (docId, userId, documentData, keywords)
         VALUES (?, ?, ?, ?)`,
        [docId, userId, JSON.stringify(documentData), JSON.stringify(keywords)],
        function(err) {
          if (err) reject(err);
          else resolve(docId);
        }
      );
    });
  }

  /**
   * Get RAG documents for user
   */
  getUserRAGDocuments(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM rag_documents WHERE userId = ? ORDER BY createdAt DESC',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const docs = rows ? rows.map(row => ({
              id: row.docId,
              data: JSON.parse(row.documentData),
              keywords: JSON.parse(row.keywords)
            })) : [];
            resolve(docs);
          }
        }
      );
    });
  }

  /**
   * Close database
   */
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = new Database();
