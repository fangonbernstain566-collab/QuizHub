const socket = io();

const phaseBadge = document.getElementById('phaseBadge');
const currentQuestionLabel = document.getElementById('currentQuestionLabel');
const startAnsweringBtn = document.getElementById('startAnsweringBtn');
const revealBtn = document.getElementById('revealBtn');
const finalizeBtn = document.getElementById('finalizeBtn');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');
const endGameBtn = document.getElementById('endGameBtn');
const newSessionBtn = document.getElementById('newSessionBtn');

const startQuestionCard = document.getElementById('startQuestionCard');
const questionSelect = document.getElementById('questionSelect');
const startRound = document.getElementById('startRound');
const startTime = document.getElementById('startTime');
const startQuestionBtn = document.getElementById('startQuestionBtn');

const newQuestionText = document.getElementById('newQuestionText');
const newQuestionDifficulty = document.getElementById('newQuestionDifficulty');
const addQuestionBtn = document.getElementById('addQuestionBtn');
const questionBankList = document.getElementById('questionBankList');
const qbankCard = document.getElementById('qbankCard');
const qbankHeader = qbankCard.querySelector('.qbank-header');
const qbankCount = document.getElementById('qbankCount');

// Curtain toggle: click the question bank header to expand/collapse.
qbankHeader.addEventListener('click', () => {
  qbankCard.classList.toggle('collapsed');
});

const scoringCard = document.getElementById('scoringCard');
const scoringGrid = document.getElementById('scoringGrid');

const newTeamName = document.getElementById('newTeamName');
const addTeamBtn = document.getElementById('addTeamBtn');
const teamsBody = document.getElementById('teamsBody');

const scoreboardBody = document.getElementById('scoreboardBody');
const toast = document.getElementById('toast');

const sessionTitle = document.getElementById('sessionTitle');
const sessionStatus = document.getElementById('sessionStatus');
const sessionWinner = document.getElementById('sessionWinner');
const sessionHistory = document.getElementById('sessionHistory');

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const DIFFICULTY_POINTS = { easy: 10, medium: 20, hard: 30 };

let latestState = null;
let autoScoredQuestionId = null;

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

socket.on('connect', () => socket.emit('identify', { role: 'admin' }));
socket.on('error', ({ message }) => showToast(message, true));

socket.on('state:update', (state) => {
  latestState = state;
  render();
});

// ---------------- Teams ----------------

addTeamBtn.onclick = () => {
  const name = newTeamName.value.trim();
  if (!name) return;
  socket.emit('admin:createTeam', { name });
  newTeamName.value = '';
};

// ---------------- Question bank ----------------

addQuestionBtn.onclick = () => {
  const text = newQuestionText.value.trim();
  const difficulty = newQuestionDifficulty.value;
  if (!text) return showToast('Enter question text first.');
  socket.emit('admin:addQuestion', { text, difficulty });
  newQuestionText.value = '';
};

function deleteQuestion(questionId) {
  socket.emit('admin:deleteQuestion', { questionId });
}

// ---------------- Start Question ----------------

startQuestionBtn.onclick = () => {
  const questionId = questionSelect.value;
  if (!questionId) return showToast('Pick a question from the bank first.');
  socket.emit('admin:startQuestion', {
    questionId,
    roundNumber: Number(startRound.value) || 1,
    timeLimitSeconds: Number(startTime.value) || 30,
  });
};

// ---------------- Control bar ----------------

startAnsweringBtn.onclick = () => socket.emit('admin:startAnswering');
revealBtn.onclick = () => socket.emit('admin:reveal');
finalizeBtn.onclick = () => socket.emit('admin:finalizeScoring');
nextQuestionBtn.onclick = () => socket.emit('admin:nextQuestion');

endGameBtn.onclick = () => {
  if (!confirm('End this game and announce the current winner?')) return;
  socket.emit('admin:endGame');
};

newSessionBtn.onclick = () => {
  if (!confirm('Start a new session? The current session score will be reset to 0. Teams and the question bank will stay.')) return;
  socket.emit('admin:startNewSession');
};

function render() {
  if (!latestState) return;
  const {
    phase,
    question,
    questionBank,
    teams,
    reveal,
    scoreboard,
    session,
    sessionHistory: history = [],
  } = latestState;

  phaseBadge.textContent = phase;
  currentQuestionLabel.textContent = question
    ? `Round ${question.roundNumber} — Question ${question.questionNumber} · ${DIFFICULTY_LABEL[question.difficulty] || ''} · ${question.points ?? ''} pts`
    : '';

  const canStart = phase === 'IDLE' && questionSelect.value;
  startQuestionBtn.disabled = !canStart;
  startAnsweringBtn.disabled = phase !== 'ASK_QUESTION';
  revealBtn.disabled = phase !== 'ANSWERING';
  finalizeBtn.disabled = phase !== 'REVEALED';
  nextQuestionBtn.disabled = phase !== 'SCORED';
  endGameBtn.disabled = phase !== 'SCORED';
  newSessionBtn.disabled = phase !== 'SESSION_ENDED';

  startQuestionCard.style.display = phase === 'SESSION_ENDED' ? 'none' : 'block';

  renderSession(session, history);

  scoringCard.style.display = phase === 'REVEALED' || phase === 'SCORED' ? 'block' : 'none';
  if (phase === 'REVEALED' || phase === 'SCORED') renderScoring(reveal || [], question);

  renderQuestionBank(questionBank || []);
  renderTeams(teams || []);
  renderScoreboard(scoreboard || []);
}

function renderSession(session, history) {
  const number = session?.number || 1;
  sessionTitle.textContent = `Session ${number}`;

  if (latestState.phase === 'SESSION_ENDED') {
    sessionStatus.textContent = 'Game finished. The winner has been recorded.';
  } else {
    sessionStatus.textContent = 'Current session is active.';
  }

  sessionWinner.style.display = 'none';
  sessionWinner.innerHTML = '';

  if (session?.winner) {
    sessionWinner.style.display = 'block';
    sessionWinner.innerHTML = `
      <span class="winner-label">Current winner</span>
      <strong>🏆 ${escapeHtml(session.winner.teamName)}</strong>
      <span>${session.winner.score} pts</span>
    `;
  }

  sessionHistory.innerHTML = '';

  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'session-history-empty';
    empty.textContent = 'No completed sessions yet.';
    sessionHistory.appendChild(empty);
    return;
  }

  const heading = document.createElement('div');
  heading.className = 'session-history-heading';
  heading.textContent = 'Completed sessions';
  sessionHistory.appendChild(heading);

  for (const item of [...history].reverse()) {
    const row = document.createElement('div');
    row.className = 'session-history-row';

    const winner = item.winner
      ? `🏆 ${escapeHtml(item.winner.teamName)} — ${item.winner.score} pts`
      : 'No winner';

    row.innerHTML = `
      <div class="session-history-number">Session ${item.sessionNumber}</div>
      <div class="session-history-winner">${winner}</div>
    `;

    sessionHistory.appendChild(row);
  }
}

function renderQuestionBank(questionBank) {
  // Preserve current dropdown selection across re-renders
  const previouslySelected = questionSelect.value;

  // Live count badge in the collapsed header.
  qbankCount.textContent = `${questionBank.length} question${questionBank.length === 1 ? '' : 's'}`;

  questionSelect.innerHTML = '';
  if (questionBank.length === 0) {
    questionSelect.innerHTML = '<option value="">Add a question to the bank first</option>';
  } else {
    questionSelect.innerHTML = '<option value="">Select a question…</option>';
    for (const q of questionBank) {
      const opt = document.createElement('option');
      opt.value = q.id;
      opt.textContent = `[${DIFFICULTY_LABEL[q.difficulty]} · ${q.points} pts] ${q.text}`;
      questionSelect.appendChild(opt);
    }
    if (questionBank.some((q) => String(q.id) === previouslySelected)) {
      questionSelect.value = previouslySelected;
    }
  }

  questionBankList.innerHTML = '';
  if (questionBank.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'qbank-empty';
    empty.textContent = 'No questions yet — add one above.';
    questionBankList.appendChild(empty);
    return;
  }
  for (const q of questionBank) {
    const item = document.createElement('div');
    item.className = 'qbank-item';

    const badge = document.createElement('span');
    badge.className = `badge diff-${q.difficulty}`;
    badge.textContent = `${DIFFICULTY_LABEL[q.difficulty]} · ${q.points} pts`;

    const text = document.createElement('span');
    text.className = 'qbank-text';
    text.textContent = q.text;

    const del = document.createElement('button');
    del.className = 'qbank-delete';
    del.textContent = 'Remove';
    del.onclick = () => deleteQuestion(q.id);

    item.append(badge, text, del);
    questionBankList.appendChild(item);
  }
}

questionSelect.addEventListener('change', () => {
  startQuestionBtn.disabled = !(latestState && latestState.phase === 'IDLE' && questionSelect.value);
});

function renderScoring(reveal, question) {
  scoringGrid.innerHTML = '';
  const suggestedPoints = question && DIFFICULTY_POINTS[question.difficulty] != null
    ? (question.points ?? DIFFICULTY_POINTS[question.difficulty])
    : 0;

  // The first time a question hits REVEALED, auto-persist the suggested
  // score for every team that answered but hasn't been scored yet — so a
  // score is saved even if the admin never touches that team's input.
  // Editing the input afterward still overrides it, same as before.
  if (question && autoScoredQuestionId !== question.id) {
    autoScoredQuestionId = question.id;
    for (const r of reveal) {
      if (r.submitted && r.points == null) {
        socket.emit('admin:setScore', { teamId: r.teamId, points: suggestedPoints });
      }
    }
  }

  for (const r of reveal) {
    const tile = document.createElement('div');
    tile.className = 'answer-tile' + (r.submitted ? '' : ' no-answer');

    const label = document.createElement('div');
    label.className = 'team-label';
    label.textContent = r.teamName;

    const answer = document.createElement('div');
    answer.className = 'answer-text';
    answer.textContent = r.submitted ? r.answerText : 'No answer';

    const scoreRow = document.createElement('div');
    scoreRow.className = 'score-row';

    const input = document.createElement('input');
    input.type = 'number';
    // Pre-fill with the question's difficulty points if the team answered
    // and the server hasn't already recorded a score; admin can override.
    input.value = r.points != null ? r.points : (r.submitted ? suggestedPoints : 0);
    input.onchange = () => socket.emit('admin:setScore', { teamId: r.teamId, points: Number(input.value) || 0 });

    scoreRow.appendChild(input);
    tile.append(label, answer, scoreRow);
    scoringGrid.appendChild(tile);
  }
}

function renderTeams(teams) {
  teamsBody.innerHTML = '';
  for (const t of teams) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = t.name;

    const tdStatus = document.createElement('td');
    tdStatus.innerHTML = `<span class="badge ${t.connected ? 'active' : ''}">${t.connected ? 'online' : 'offline'}</span>`;

    const tdPlayers = document.createElement('td');
    tdPlayers.textContent = (t.players || []).length;
    tdPlayers.title = (t.players || []).map((p) => `${p.name}${p.connected ? '' : ' (offline)'}`).join(', ');

    tr.append(tdName, tdStatus, tdPlayers);
    teamsBody.appendChild(tr);
  }
}

function renderScoreboard(scoreboard) {
  scoreboardBody.innerHTML = '';
  scoreboard.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="rank-cell">${i + 1}</td><td>${escapeHtml(row.teamName)}</td><td>${row.total}</td>`;
    scoreboardBody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}