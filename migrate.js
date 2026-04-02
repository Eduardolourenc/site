const sqlite3 = require('sqlite3').verbose();
const pg = require('pg');

const localDb = new sqlite3.Database('./data/study-tracker.db');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_t2apTi7gXzEJ@ep-weathered-recipe-annu2ok2-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
});

async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS subjects (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
  await pool.query('CREATE TABLE IF NOT EXISTS study_sessions (id SERIAL PRIMARY KEY, date TEXT NOT NULL, subject_id INTEGER NOT NULL, hours REAL NOT NULL, questions INTEGER NOT NULL, correct INTEGER NOT NULL, FOREIGN KEY (subject_id) REFERENCES subjects(id))');

  localDb.all('SELECT * FROM subjects', [], async (err, subjects) => {
    if (err) console.error(err);
    for (const sub of (subjects || [])) {
      await pool.query('INSERT INTO subjects (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [sub.id, sub.name]);
    }
    
    localDb.all('SELECT * FROM study_sessions', [], async (err, sessions) => {
      if (err) console.error(err);
      for (const s of (sessions || [])) {
        await pool.query('INSERT INTO study_sessions (id, date, subject_id, hours, questions, correct) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING', [s.id, s.date, s.subject_id, s.hours, s.questions, s.correct]);
      }
      
      // Update sequences
      try {
        await pool.query(`SELECT setval('subjects_id_seq', (SELECT MAX(id) FROM subjects))`);
        await pool.query(`SELECT setval('study_sessions_id_seq', (SELECT MAX(id) FROM study_sessions))`);
      } catch (e) {
          console.warn("Sequence update error:", e.message);
      }

      console.log('Migração concluída com sucesso!');
      process.exit(0);
    });
  });
}
migrate();
