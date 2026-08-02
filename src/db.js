const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

function initDb() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseSync(path.join(dataDir, 'quiz.db'));

  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS question_bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      points INTEGER NOT NULL DEFAULT 20,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      points INTEGER NOT NULL DEFAULT 0,
      bank_question_id INTEGER,
      round_number INTEGER NOT NULL DEFAULT 1,
      order_index INTEGER NOT NULL DEFAULT 0,
      time_limit_seconds INTEGER NOT NULL DEFAULT 30
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      answer_text TEXT NOT NULL,
      submitted_at INTEGER NOT NULL,
      UNIQUE(question_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      UNIQUE(question_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS game_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      phase TEXT NOT NULL DEFAULT 'IDLE',
      current_question_id INTEGER,
      timer_end_at INTEGER
    );
  `);

  // Migration: existing quiz.db files were created before difficulty/points/
  // bank_question_id existed on `questions`. CREATE TABLE IF NOT EXISTS won't
  // add columns to an already-existing table, so add them by hand if missing.
  const existingColumns = db.prepare('PRAGMA table_info(questions)').all().map((c) => c.name);
  if (!existingColumns.includes('difficulty')) {
    db.exec(`ALTER TABLE questions ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'medium'`);
  }
  if (!existingColumns.includes('points')) {
    db.exec(`ALTER TABLE questions ADD COLUMN points INTEGER NOT NULL DEFAULT 0`);
  }
  if (!existingColumns.includes('bank_question_id')) {
    db.exec(`ALTER TABLE questions ADD COLUMN bank_question_id INTEGER`);
  }

  const row = db.prepare('SELECT id FROM game_state WHERE id = 1').get();
  if (!row) {
    db.prepare(
      'INSERT INTO game_state (id, phase, current_question_id, timer_end_at) VALUES (1, ?, NULL, NULL)'
    ).run('IDLE');
  }

  return db;
}

module.exports = { initDb };