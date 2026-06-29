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

      this.db.run(`
        CREATE TABLE IF NOT EXISTS internal_memory_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(userId) REFERENCES users(id)
        )
      `);

      this.db.run('DROP TABLE IF EXISTS guest_recovery_codes');
      this.db.run(`
        CREATE TABLE guest_recovery_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          userId TEXT NOT NULL,
          sessionId TEXT NOT NULL,
          planId TEXT,
          planData TEXT,
          expiresAt DATETIME NOT NULL,
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
   * Save internal memory note
   */
  saveInternalMemoryNote(userId, title, content, tags = []) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO internal_memory_notes (userId, title, content, tags, updatedAt)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, title, content, JSON.stringify(tags)],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  /**
   * Get internal memory notes for a user
   */
  getInternalMemoryNotes(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM internal_memory_notes WHERE userId = ? ORDER BY createdAt DESC',
        [userId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          const notes = rows ? rows.map((row) => ({
            id: row.id,
            userId: row.userId,
            title: row.title,
            content: row.content,
            tags: row.tags ? JSON.parse(row.tags) : [],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })) : [];

          resolve(notes);
        }
      );
    });
  }

  /**
   * Delete an internal memory note
   */
  deleteInternalMemoryNote(userId, noteId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM internal_memory_notes WHERE userId = ? AND id = ?',
        [userId, noteId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  /**
   * Save guest recovery code
   */
  saveGuestRecoveryCode(code, userId, sessionId, planId, planData, ttlMinutes = 10080) {
    return new Promise((resolve, reject) => {
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
      this.db.run(
        `INSERT OR REPLACE INTO guest_recovery_codes (code, userId, sessionId, planId, planData, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [code, userId, sessionId, planId, planData ? JSON.stringify(planData) : null, expiresAt],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * Get guest recovery code
   */
  getGuestRecoveryCode(code) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM guest_recovery_codes WHERE code = ? AND expiresAt > CURRENT_TIMESTAMP',
        [code],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows ? rows[0] : null);
        }
      );
    });
  }

  /**
   * Delete guest recovery code
   */
  deleteGuestRecoveryCode(code) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM guest_recovery_codes WHERE code = ?',
        [code],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Cleanup expired guest recovery codes
   */
  cleanupExpiredGuestRecoveryCodes() {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM guest_recovery_codes WHERE expiresAt <= CURRENT_TIMESTAMP',
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
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
