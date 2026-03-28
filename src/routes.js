const express = require('express');
const db = require('./db');

const router = express.Router();

// Helpers de data
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(decimalHours) {
  const h = Math.floor(decimalHours || 0);
  const m = Math.round(((decimalHours || 0) - h) * 60);
  return `${h}h ${m}m`;
}

function formatSessions(sessions) {
  return sessions.map(s => {
    s.formatted_time = formatTime(s.hours);
    s.accuracy = s.questions > 0 ? Math.round((s.correct / s.questions) * 100) + '%' : '-';
    return s;
  });
}

// Middleware para calcular a ofensiva (streak)
router.use((req, res, next) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (err, row) => {
    const dailyGoal = row ? parseFloat(row.value) : 1;
    db.all('SELECT date, SUM(hours) as total_hours FROM study_sessions GROUP BY date', (err, rows) => {
      let streak = 0;
      let isTodayMet = false;
      if (rows && !err) {
        const dailyHoursMap = {};
        rows.forEach(s => {
          dailyHoursMap[s.date] = s.total_hours;
        });

        let checkDate = new Date();
        const todayStr = formatDate(checkDate);
        const todayHours = dailyHoursMap[todayStr] || 0;
        isTodayMet = todayHours >= dailyGoal;

        checkDate.setDate(checkDate.getDate() - 1);
        
        while (true) {
          let dateStr = formatDate(checkDate);
          let hours = dailyHoursMap[dateStr] || 0;
          if (hours >= dailyGoal) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }

        if (isTodayMet) streak++;
      }
      res.locals.streak = streak;
      res.locals.goalMetToday = isTodayMet;
      next();
    });
  });
});

// Redirecionar raiz para o dashboard
router.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Dashboard com resumo rápido
router.get('/dashboard', (req, res) => {
  const today = new Date();
  const todayStr = formatDate(today);

  const weekStart = new Date();
  weekStart.setDate(today.getDate() - 6);
  const weekStartStr = formatDate(weekStart);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);        
  const monthStartStr = formatDate(monthStart);

  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (errGoal, rowGoal) => {
    const dailyGoal = rowGoal ? parseFloat(rowGoal.value) : 4; // default 4h

    db.get(
      `SELECT COALESCE(SUM(hours), 0) as total_hours,
              COALESCE(SUM(questions), 0) as total_questions,
              COALESCE(SUM(correct), 0) as total_correct
         FROM study_sessions
         WHERE date = ?`,
      [todayStr],
      (errToday, todayStats) => {
        if (errToday) return res.status(500).send('Erro ao carregar resumo de hoje');

        db.get(
          `SELECT COALESCE(SUM(hours), 0) as total_hours
             FROM study_sessions
             WHERE date BETWEEN ? AND ?`,
          [weekStartStr, todayStr],
          (errWeek, weekStats) => {
            if (errWeek) return res.status(500).send('Erro ao carregar resumo da semana');

            db.get(
              `SELECT COALESCE(SUM(hours), 0) as total_hours
                 FROM study_sessions
                 WHERE date BETWEEN ? AND ?`,
              [monthStartStr, todayStr],
              (errMonth, monthStats) => {
                if (errMonth) return res.status(500).send('Erro ao carregar resumo do mês');

                db.get(
                  `SELECT COALESCE(SUM(hours), 0) as total_hours
                     FROM study_sessions`, 
                  [],
                  (errAllTime, allTimeStats) => {
                    if (errAllTime) return res.status(500).send('Erro ao carregar resumo total');

                    db.all(
                      `SELECT s.id, s.date, s.hours, s.questions, s.correct, sub.name AS subject_name
                         FROM study_sessions s
                         JOIN subjects sub ON s.subject_id = sub.id
                         ORDER BY s.date DESC, s.id DESC
                         LIMIT 5`,
                      [],
                      (errSessions, sessions) => {
                        if (errSessions) return res.status(500).send('Erro ao carregar últimos estudos');

                        // Insight simples: comparar com a média da semana
                        const weekAvg = weekStats.total_hours / 7;
                        let insight = "";
                        if (todayStats.total_hours > dailyGoal) {
                          insight = `🚀 Parabéns! Você bateu sua meta diária de ${dailyGoal}h.`;
                        } else if (todayStats.total_hours > weekAvg && todayStats.total_hours > 0) {
                          insight = `📈 Muito bom! Você já estudou mais do que sua média semanal (${formatTime(weekAvg)}).`;
                        } else if (todayStats.total_hours === 0) {
                          insight = "💡 Comece agora! Cada minuto conta para o seu sucesso.";
                        } else {
                          insight = "🔥 Continue focado! O importante é manter a constância.";
                        }

                        res.render('dashboard', {
                          todayStats,
                          todayHoursFmt: formatTime(todayStats.total_hours),
                          weekHours: formatTime(weekStats.total_hours),
                          monthHours: formatTime(monthStats.total_hours),
                          allTimeHours: formatTime(allTimeStats.total_hours),
                          sessions: formatSessions(sessions),
                          dailyGoal,
                          insight
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

// Página de registro
router.get('/study', (req, res) => {
  db.all('SELECT * FROM subjects ORDER BY name', [], (err, subjects) => {
    if (err) return res.status(500).send('Erro ao carregar matérias');
    res.render('study', { subjects });
  });
});

// Registrar estudo
router.post('/study', (req, res) => {
  const { date, subject_id, hours, minutes, questions, correct } = req.body;

  if (!date || !subject_id) {
    return res.status(400).send('Data e Matéria são obrigatórios');
  }

  const h = parseFloat(hours) || 0;
  const m = parseFloat(minutes) || 0;
  
  if (h === 0 && m === 0) {
     return res.status(400).send('Preencha as horas ou minutos estudados');
  }

  const totalHours = h + (m / 60);
  const q = parseInt(questions, 10) || 0;
  const c = parseInt(correct, 10) || 0;

  const stmt = `INSERT INTO study_sessions (date, subject_id, hours, questions, correct)
                VALUES (?, ?, ?, ?, ?)`;
  db.run(stmt, [date, subject_id, totalHours, q, c], (err) => {        
    if (err) return res.status(500).send('Erro ao salvar estudo');
    res.redirect('/history');
  });
});

// Histórico de estudos
router.get('/history', (req, res) => {
  const { subject_id } = req.query;

  db.all('SELECT * FROM subjects ORDER BY name', [], (errSubjects, subjects) => {
    if (errSubjects) return res.status(500).send('Erro ao carregar matérias');

    let totalQuery = 'SELECT COALESCE(SUM(hours), 0) as total_hours FROM study_sessions';
    let totalParams = [];
    if (subject_id) {
       totalQuery += ' WHERE subject_id = ?';
       totalParams.push(subject_id);
    }

    db.get(totalQuery, totalParams, (errTotal, totalRow) => {
      let query = `SELECT s.id, s.date, s.hours, s.questions, s.correct, sub.name AS subject_name
                     FROM study_sessions s
                     JOIN subjects sub ON s.subject_id = sub.id`;
      const params = [];

      if (subject_id) {
        query += ' WHERE s.subject_id = ?';
        params.push(subject_id);
      }

      query += ' ORDER BY s.date DESC, s.id DESC LIMIT 50';

      db.all(query, params, (err, sessions) => {
        if (err) return res.status(500).send('Erro ao carregar histórico');      

        res.render('history', {
          subjects,
          sessions: formatSessions(sessions),
          selectedSubjectId: subject_id || '',
          totalHoursFilter: formatTime(totalRow ? totalRow.total_hours : 0)
        });
      });
    });
  });
});

// Listar/gerenciar matérias
router.get('/subjects', (req, res) => {
  db.all('SELECT * FROM subjects ORDER BY name', [], (err, subjects) => {
    if (err) return res.status(500).send('Erro ao carregar matérias');
    res.render('subjects', { subjects });
  });
});

router.post('/subjects', (req, res) => {
  const { name } = req.body;
  if (!name) return res.redirect('/subjects');

  db.run('INSERT OR IGNORE INTO subjects(name) VALUES (?)', [name], (err) => {
    if (err) return res.status(500).send('Erro ao criar matéria');
    res.redirect('/subjects');
  });
});

// Relatório mensal
router.get('/report', (req, res) => {
  const { year, month, subject_id } = req.query;

  db.all('SELECT * FROM subjects ORDER BY name', [], (err, subjects) => {
    if (err) return res.status(500).send('Erro ao carregar matérias');

    if (!year || !month) {
      return res.render('report', { subjects, chartData: null, filters: { year, month, subject_id } });
    }

    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-31`;

    let query = `SELECT date, SUM(hours) as total_hours, SUM(questions) as total_questions, SUM(correct) as total_correct
                 FROM study_sessions
                 WHERE date BETWEEN ? AND ?`;
    const params = [startDate, endDate];

    if (subject_id) {
      query += " AND subject_id = ?";
      params.push(subject_id);
    }

    query += " GROUP BY date ORDER BY date";

    db.all(query, params, (err2, rows) => {
      if (err2) return res.status(500).send("Erro ao gerar relatorio");

      const labels = rows.map(r => r.date);
      const dataHours = rows.map(r => r.total_hours);
      const dataQuestions = rows.map(r => r.total_questions);
      const dataCorrect = rows.map(r => r.total_correct);
      
      const displayHours = rows.map(r => formatTime(r.total_hours));
      const displayAccuracy = rows.map(r => r.total_questions > 0 ? Math.round((r.total_correct / r.total_questions) * 100) + "%" : "-");

      const chartData = {
        labels,
        dataHours,
        dataQuestions,
        dataCorrect,
        displayHours,
        displayAccuracy
      };

      res.render('report', {
        subjects,
        chartData,
        filters: { year, month, subject_id }
      });
    });
  });
});


// Editar Sessão
router.get('/edit/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM study_sessions WHERE id = ?', [id], (err, session) => {
    if (err || !session) return res.status(404).send('Sessão não encontrada');
    db.all('SELECT * FROM subjects ORDER BY name', [], (errSub, subjects) => {
      res.render('edit', { session, subjects });
    });
  });
});

router.post('/edit/:id', (req, res) => {
  const { id } = req.params;
  const { date, subject_id, hours, minutes, questions, correct } = req.body;
  const h = parseFloat(hours) || 0;
  const m = parseFloat(minutes) || 0;
  const totalHours = h + (m / 60);
  const q = parseInt(questions, 10) || 0;
  const c = parseInt(correct, 10) || 0;

  db.run(`UPDATE study_sessions SET date = ?, subject_id = ?, hours = ?, questions = ?, correct = ? WHERE id = ?`,
    [date, subject_id, totalHours, q, c, id],
    (err) => {
      if (err) return res.status(500).send('Erro ao editar sessão');
      res.redirect('/history');
    }
  );
});

// Excluir Sessão
router.post('/delete/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM study_sessions WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).send('Erro ao excluir sessão');
    res.redirect('/history');
  });
});

// Pomodoro
router.get('/pomodoro', (req, res) => {
  res.render('pomodoro');
});

// Backup / Exportar BD
const path = require('path');
router.get('/export', (req, res) => {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'study-tracker.db');
  res.download(dbPath, 'backup-study-tracker.db');
});


// Configurações e Metas
router.get('/settings', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (err, row) => {
    const goal = row ? row.value : 4;
    res.render('settings', { goal });
  });
});

router.post('/settings', (req, res) => {
  const { daily_goal } = req.body;
  if(daily_goal) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['daily_goal', daily_goal], (err) => {
      res.redirect('/dashboard');
    });
  } else {
    res.redirect('/settings');
  }
});


// Calendário
router.get('/calendar', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (err, row) => {
    const dailyGoal = row ? parseFloat(row.value) : 4;
    
    db.all('SELECT date, SUM(hours) as total_hours FROM study_sessions GROUP BY date', [], (err2, rows) => {
      if (err2) return res.status(500).send('Erro ao carregar calendário');
      res.render('calendar', { data: rows || [], dailyGoal });
    });
  });
});

module.exports = router;
