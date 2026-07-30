const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PHASES = {
  IDLE: 'IDLE',
  ASK_QUESTION: 'ASK_QUESTION',
  ANSWERING: 'ANSWERING',
  REVEALED: 'REVEALED',
  SCORED: 'SCORED',
};

class GameManager {
  constructor(db, io) {
    this.db = db;
    this.io = io;
    this.revealTimer = null;

    // socket.id -> { role, teamId, playerId }
    this.sockets = new Map();
    // teamId -> Set<socket.id>, tracks which teams have a live connection
    this.teamSockets = new Map();

    const row = db.prepare('SELECT * FROM game_state WHERE id = 1').get();
    this.phase = row.phase;
    this.currentQuestionId = row.current_question_id;
    this.timerEndAt = row.timer_end_at;

    // Fallback if server restarted mid-countdown
    if (this.phase === PHASES.ANSWERING) {
      this.phase = PHASES.ASK_QUESTION;
      this.timerEndAt = null;
      this.persistState();
    }
  }

  persistState() {
    this.db
      .prepare('UPDATE game_state SET phase = ?, current_question_id = ?, timer_end_at = ? WHERE id = 1')
      .run(this.phase, this.currentQuestionId, this.timerEndAt);
  }

  // ---------------- Teams ----------------

  listTeams() {
    return this.db.prepare('SELECT id, name FROM teams ORDER BY name').all();
  }

  createTeam(name, password) {
    name = String(name || '').trim();
    if (!name) throw new Error('Team name required');
    if (name.length > 40) throw new Error('Team name too long');
    
    // Optional password default for admin creation
    password = String(password || '1234');
    
    const existing = this.db.prepare('SELECT id FROM teams WHERE LOWER(name) = LOWER(?)').get(name);
    if (existing) throw new Error('Team name already taken');
    
    const token = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    const info = this.db
      .prepare('INSERT INTO teams (name, password_hash, token, created_at) VALUES (?, ?, ?, ?)')
      .run(name, passwordHash, token, Date.now());
      
    const teamId = Number(info.lastInsertRowid);
    this.broadcastState();
    return { id: teamId, name, token };
  }

  setTeamPassword(teamId, newPassword) {
    const team = this.getTeamById(teamId);
    if (!team) throw new Error('Team not found');
    newPassword = String(newPassword || '');
    if (newPassword.length < 4) throw new Error('Password must be at least 4 characters');
    const passwordHash = hashPassword(newPassword);
    this.db.prepare('UPDATE teams SET password_hash = ?, token = ? WHERE id = ?').run(passwordHash, crypto.randomUUID(), team.id);
    this.forceLogoutTeam(team.id, 'The game master reset your team password. Please log in again.');
  }

  forceLogoutTeam(teamId, reason) {
    this.io.to(`team:${teamId}`).emit('play:forceLogout', { reason: reason || 'You were logged out by the game master.' });
    this.db.prepare('DELETE FROM players WHERE team_id = ?').run(teamId);
    if (this.teamSockets.has(teamId)) {
      for (const sid of this.teamSockets.get(teamId)) {
        const meta = this.sockets.get(sid);
        if (meta) {
          meta.teamId = null;
          meta.playerId = null;
        }
      }
      this.teamSockets.delete(teamId);
    }
    this.broadcastState();
  }

  getTeamByToken(token) {
    return this.db.prepare('SELECT * FROM teams WHERE token = ?').get(token);
  }

  getTeamById(id) {
    return this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  }

  getTeamByName(name) {
    return this.db.prepare('SELECT * FROM teams WHERE LOWER(name) = LOWER(?)').get(String(name).trim());
  }

  // ---------------- Players ----------------

  createPlayer(teamId, name) {
    const team = this.getTeamById(teamId);
    if (!team) throw new Error('Team not found');
    name = String(name || '').trim();
    if (!name) throw new Error('Player name required');
    if (name.length > 30) throw new Error('Player name too long');
    const token = crypto.randomUUID();
    const info = this.db
      .prepare('INSERT INTO players (team_id, name, token, created_at) VALUES (?, ?, ?, ?)')
      .run(teamId, name, token, Date.now());
    return { id: Number(info.lastInsertRowid), teamId, name, token };
  }

  getPlayerByToken(token) {
    return this.db.prepare('SELECT * FROM players WHERE token = ?').get(token);
  }

  getPlayerById(id) {
    return this.db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  }

  listPlayersForTeam(teamId) {
    return this.db.prepare('SELECT id, name FROM players WHERE team_id = ? ORDER BY created_at').all(teamId);
  }

  // ---------------- Questions ----------------

  createQuestion(roundNumber, timeLimitSeconds) {
    roundNumber = Number(roundNumber) || 1;
    timeLimitSeconds = Number(timeLimitSeconds) || 30;
    if (timeLimitSeconds < 5) throw new Error('Time limit must be at least 5 seconds');
    const countRow = this.db.prepare('SELECT COUNT(*) as c FROM questions WHERE round_number = ?').get(roundNumber);
    const orderIndex = countRow.c;
    const text = `Question ${orderIndex + 1}`;
    const info = this.db
      .prepare('INSERT INTO questions (text, round_number, order_index, time_limit_seconds) VALUES (?, ?, ?, ?)')
      .run(text, roundNumber, orderIndex, timeLimitSeconds);
    return Number(info.lastInsertRowid);
  }

  getQuestion(id) {
    if (!id) return null;
    return this.db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  }

  // ---------------- Game Flow ----------------

  startQuestion(roundNumber, timeLimitSeconds) {
    if (this.phase !== PHASES.IDLE) throw new Error('Finish the current question before starting a new one');
    const id = this.createQuestion(roundNumber, timeLimitSeconds);
    this.askQuestion(id);
    return { id };
  }

  askQuestion(questionId) {
    const q = this.getQuestion(questionId);
    if (!q) throw new Error('Question not found');
    this.clearRevealTimer();
    this.currentQuestionId = questionId;
    this.phase = PHASES.ASK_QUESTION;
    this.timerEndAt = null;
    this.persistState();
    this.broadcastState();
  }

  startAnswering() {
    if (this.phase !== PHASES.ASK_QUESTION) throw new Error('Not in ASK_QUESTION phase');
    const q = this.getQuestion(this.currentQuestionId);
    this.phase = PHASES.ANSWERING;
    this.timerEndAt = Date.now() + q.time_limit_seconds * 1000;
    this.persistState();

    this.clearRevealTimer();
    this.revealTimer = setTimeout(() => {
      if (this.phase === PHASES.ANSWERING) this.reveal();
    }, q.time_limit_seconds * 1000 + 250);

    this.broadcastState();
  }

  submitAnswer(teamId, answerText) {
    if (this.phase !== PHASES.ANSWERING) throw new Error('Not accepting answers right now');
    if (!this.timerEndAt || Date.now() > this.timerEndAt) throw new Error('Time is up');
    answerText = String(answerText || '').slice(0, 500);
    this.db
      .prepare(
        `INSERT INTO answers (question_id, team_id, answer_text, submitted_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(question_id, team_id) DO UPDATE SET answer_text = excluded.answer_text, submitted_at = excluded.submitted_at`
      )
      .run(this.currentQuestionId, teamId, answerText, Date.now());
    this.broadcastState();
  }

  reveal() {
    if (this.phase !== PHASES.ANSWERING && this.phase !== PHASES.ASK_QUESTION) {
      throw new Error('Cannot reveal from this phase');
    }
    this.clearRevealTimer();
    this.phase = PHASES.REVEALED;
    this.timerEndAt = null;
    this.persistState();
    this.broadcastState();
  }

  setScore(teamId, points) {
    if (this.phase !== PHASES.REVEALED && this.phase !== PHASES.SCORED) {
      throw new Error('Reveal answers before scoring');
    }
    points = Number(points) || 0;
    this.db
      .prepare(
        `INSERT INTO scores (question_id, team_id, points)
         VALUES (?, ?, ?)
         ON CONFLICT(question_id, team_id) DO UPDATE SET points = excluded.points`
      )
      .run(this.currentQuestionId, teamId, points);
    this.broadcastState();
  }

  finalizeScoring() {
    if (this.phase !== PHASES.REVEALED && this.phase !== PHASES.SCORED) {
      throw new Error('Nothing to finalize');
    }
    this.phase = PHASES.SCORED;
    this.persistState();
    this.broadcastState();
  }

  returnToAskQuestion() {
    this.currentQuestionId = null;
    this.phase = PHASES.IDLE;
    this.timerEndAt = null;
    this.persistState();
    this.broadcastState();
  }

  clearRevealTimer() {
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
  }

  // ---------------- Sockets ----------------

  handleConnection(socket) {
    socket.on('identify', (payload = {}) => this.onIdentify(socket, payload));
    socket.on('play:join', (payload = {}) => this.onPlayJoin(socket, payload));
    socket.on('play:submitAnswer', (payload = {}) => this.onSubmitAnswer(socket, payload));

    socket.on('admin:createTeam', (payload = {}) =>
      this.wrap(socket, () => this.createTeam(payload.name, payload.password))
    );
    socket.on('admin:setTeamPassword', (payload = {}) =>
      this.wrap(socket, () => this.setTeamPassword(payload.teamId, payload.password))
    );
    socket.on('admin:startQuestion', (payload = {}) =>
      this.wrap(socket, () => this.startQuestion(payload.roundNumber, payload.timeLimitSeconds))
    );
    socket.on('admin:startAnswering', () => this.wrap(socket, () => this.startAnswering()));
    socket.on('admin:reveal', () => this.wrap(socket, () => this.reveal()));
    socket.on('admin:setScore', (payload = {}) =>
      this.wrap(socket, () => this.setScore(payload.teamId, payload.points))
    );
    socket.on('admin:finalizeScoring', () => this.wrap(socket, () => this.finalizeScoring()));
    socket.on('admin:nextQuestion', () => this.wrap(socket, () => this.returnToAskQuestion()));

    socket.on('disconnect', () => this.onDisconnect(socket));
  }

  wrap(socket, fn) {
    try {
      const result = fn();
      if (result !== undefined) socket.emit('ack', { ok: true, result });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  }

  onIdentify(socket, { role, token }) {
    this.sockets.set(socket.id, { role, teamId: null });

    if (role === 'admin') socket.join('admins');
    if (role === 'display') socket.join('displays');

    if (role === 'play') {
      const player = token ? this.getPlayerByToken(token) : null;
      const team = player ? this.getTeamById(player.team_id) : null;
      if (player && team) {
        this.attachPlayer(socket, player.id, team.id);
        socket.emit('play:joined', { teamId: team.id, teamName: team.name, playerId: player.id, playerName: player.name, token: player.token });
        this.sendMyAnswer(socket, team.id);
      }
    }

    socket.emit('state:update', this.getPublicState());
  }

  // --- NEW STREAMLINED JOIN HANDLER ---
  onPlayJoin(socket, { playerName, teamName }) {
    try {
      playerName = String(playerName || '').trim();
      teamName = String(teamName || '').trim();

      if (!playerName || !teamName) {
        return socket.emit('play:joinError', 'Please enter both your name and team name.');
      }

      // Check if team exists in database (registered by admin)
      const team = this.getTeamByName(teamName);
      if (!team) {
        return socket.emit('play:joinError', `Team "${teamName}" does not exist. Please ask the Game Master to create it.`);
      }

      // Create player record for this valid team
      const player = this.createPlayer(team.id, playerName);

      this.attachPlayer(socket, player.id, team.id);
      socket.emit('play:joined', {
        teamId: team.id,
        teamName: team.name,
        playerId: player.id,
        playerName: player.name,
        token: player.token
      });

      this.sendMyAnswer(socket, team.id);
      this.broadcastState();
    } catch (err) {
      socket.emit('play:joinError', err.message);
    }
  }

  attachPlayer(socket, playerId, teamId) {
    const meta = this.sockets.get(socket.id) || {};
    meta.role = 'play';
    meta.teamId = teamId;
    meta.playerId = playerId;
    this.sockets.set(socket.id, meta);
    socket.join(`team:${teamId}`);
    if (!this.teamSockets.has(teamId)) this.teamSockets.set(teamId, new Set());
    this.teamSockets.get(teamId).add(socket.id);
    this.broadcastState();
  }

  sendMyAnswer(socket, teamId) {
    if (!this.currentQuestionId) return;
    const row = this.db
      .prepare('SELECT answer_text FROM answers WHERE question_id = ? AND team_id = ?')
      .get(this.currentQuestionId, teamId);
    socket.emit('play:myAnswer', { answerText: row ? row.answer_text : null });
  }

  onSubmitAnswer(socket, { answerText }) {
    const meta = this.sockets.get(socket.id);
    if (!meta || !meta.teamId) return socket.emit('error', { message: 'Join a team first' });
    try {
      this.submitAnswer(meta.teamId, answerText);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  }

  onDisconnect(socket) {
    const meta = this.sockets.get(socket.id);
    if (meta && meta.teamId && this.teamSockets.has(meta.teamId)) {
      this.teamSockets.get(meta.teamId).delete(socket.id);
    }
    this.sockets.delete(socket.id);
    this.broadcastState();
  }

  // ---------------- State Broadcasting ----------------

  connectedTeamIds() {
    const ids = new Set();
    for (const [teamId, set] of this.teamSockets.entries()) {
      if (set.size > 0) ids.add(teamId);
    }
    return ids;
  }

  connectedPlayerIds() {
    const ids = new Set();
    for (const meta of this.sockets.values()) {
      if (meta.playerId) ids.add(meta.playerId);
    }
    return ids;
  }

  getScoreboard() {
    return this.db
      .prepare(
        `SELECT teams.id as teamId, teams.name as teamName, COALESCE(SUM(scores.points), 0) as total
         FROM teams
         LEFT JOIN scores ON scores.team_id = teams.id
         GROUP BY teams.id
         ORDER BY total DESC, teams.name ASC`
      )
      .all();
  }

  getAnsweredTeamIds() {
    if (!this.currentQuestionId) return [];
    return this.db
      .prepare('SELECT team_id FROM answers WHERE question_id = ?')
      .all(this.currentQuestionId)
      .map((r) => r.team_id);
  }

  getReveal() {
    if (!this.currentQuestionId) return null;
    const teams = this.listTeams();
    const answers = this.db
      .prepare('SELECT team_id, answer_text FROM answers WHERE question_id = ?')
      .all(this.currentQuestionId);
    const byTeam = new Map(answers.map((a) => [a.team_id, a.answer_text]));
    const scores = this.db
      .prepare('SELECT team_id, points FROM scores WHERE question_id = ?')
      .all(this.currentQuestionId);
    const scoreByTeam = new Map(scores.map((s) => [s.team_id, s.points]));
    return teams.map((t) => ({
      teamId: t.id,
      teamName: t.name,
      answerText: byTeam.has(t.id) ? byTeam.get(t.id) : null,
      submitted: byTeam.has(t.id),
      points: scoreByTeam.has(t.id) ? scoreByTeam.get(t.id) : null,
    }));
  }

  getPublicState() {
    const question = this.getQuestion(this.currentQuestionId);
    const connected = this.connectedTeamIds();
    const connectedPlayers = this.connectedPlayerIds();
    return {
      phase: this.phase,
      question: question
        ? {
            id: question.id,
            roundNumber: question.round_number,
            questionNumber: question.order_index + 1,
            timeLimitSeconds: question.time_limit_seconds,
          }
        : null,
      timerEndAt: this.timerEndAt,
      answeredTeamIds: this.getAnsweredTeamIds(),
      reveal: this.phase === PHASES.REVEALED || this.phase === PHASES.SCORED ? this.getReveal() : null,
      scoreboard: this.getScoreboard(),
      teams: this.listTeams().map((t) => ({
        id: t.id,
        name: t.name,
        connected: connected.has(t.id),
        players: this.listPlayersForTeam(t.id).map((p) => ({ id: p.id, name: p.name, connected: connectedPlayers.has(p.id) })),
      })),
    };
  }

  broadcastState() {
    this.io.emit('state:update', this.getPublicState());
  }
}

module.exports = { GameManager, PHASES };