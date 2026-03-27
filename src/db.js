const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_t2apTi7gXzEJ@ep-weathered-recipe-annu2ok2-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: DATABASE_URL,
});

function convertSql(sql) {
  let paramIndex = 1;
  return sql
    .replace(/INSERT OR IGNORE INTO subjects\(name\) VALUES \(\?\)/g, "INSERT INTO subjects (name) VALUES ($1) ON CONFLICT (name) DO NOTHING")
    .replace(/INSERT OR REPLACE INTO settings \(key, value\) VALUES \(\?, \?\)/g, "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
    .replace(/\?/g, () => '$' + (paramIndex++));
}

function processRow(row) {
  if (!row) return row;
  // Convert any stringified floats back to numbers from SUM()
  if (typeof row.total_hours === 'string') row.total_hours = parseFloat(row.total_hours);
  if (typeof row.total_questions === 'string') row.total_questions = parseFloat(row.total_questions);
  if (typeof row.total_correct === 'string') row.total_correct = parseFloat(row.total_correct);
  if (typeof row.hours === 'string') row.hours = parseFloat(row.hours);
  return row;
}

const db = {
  all: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(convertSql(sql), params || [])
      .then(res => callback && callback(null, res.rows.map(processRow)))
      .catch(err => {
        console.error("DB.all err:", err, convertSql(sql));
        callback && callback(err);
      });
  },
  get: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(convertSql(sql), params || [])
      .then(res => callback && callback(null, res.rows[0] ? processRow(res.rows[0]) : null))
      .catch(err => {
        console.error("DB.get err:", err, convertSql(sql));
        callback && callback(err);
      });
  },
  run: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(convertSql(sql), params || [])
      .then(res => callback && callback(null))
      .catch(err => {
        console.error("DB.run err:", err, convertSql(sql));
        callback && callback(err);
      });
  }
};

const init = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    await pool.query(`
      INSERT INTO settings (key, value) 
      VALUES ('daily_goal', '4') 
      ON CONFLICT (key) DO NOTHING;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS study_sessions (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        subject_id INTEGER NOT NULL,
        hours REAL NOT NULL,
        questions INTEGER NOT NULL,
        correct INTEGER NOT NULL,
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
      );
    `);
    console.log("Banco de dados Postgres inicializado via Neon!");
  } catch(e){
    console.error("Erro ao inicializar DB:", e);
  }
};

init();

module.exports = db;
