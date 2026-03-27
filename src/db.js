const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Diretório e arquivo do banco podem ser configurados por variável de ambiente
// para permitir uso de disco persistente em provedores como Render.
const dbDir = process.env.DB_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'study-tracker.db');
const db = new sqlite3.Database(dbPath);

// Criação das tabelas
const init = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);

    // Inserir meta padrão de 4 horas se não existir
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_goal', '4')`);

    db.run(`CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      hours REAL NOT NULL,
      questions INTEGER NOT NULL,
      correct INTEGER NOT NULL,
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    )`);
  });
};

init();

module.exports = db;
