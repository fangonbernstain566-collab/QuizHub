const socket = io();

const idleMsg = document.getElementById('idleMsg');
const roundLabel = document.getElementById('roundLabel');
const difficultyBadge = document.getElementById('difficultyBadge');
const questionText = document.getElementById('questionText');
const questionCard = document.getElementById('questionCard');
const revealCard = document.getElementById('revealCard');
const timerWrap = document.getElementById('timerWrap');
const statusLine = document.getElementById('statusLine');
const timerEl = document.getElementById('timer');
const progressBadge = document.getElementById('progressBadge');
const revealGrid = document.getElementById('revealGrid');
const scoreboardCard = document.getElementById('scoreboardCard');
const scoreboardBody = document.getElementById('scoreboardBody');
const floatingLeaderboard = document.getElementById('floatingLeaderboard');
const floatingLeaderboardBody = document.getElementById('floatingLeaderboardBody');

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

let tickHandle = null;

socket.on('connect', () => socket.emit('identify', { role: 'display' }));

socket.on('state:update', (state) => render(state));

function render(state) {
  const { phase, question, timerEndAt, answeredTeamIds, reveal, scoreboard, teams } = state;
  const isIdle = phase === 'IDLE' || !question;
  const isReveal = phase === 'REVEALED' || phase === 'SCORED';
  const isAnswering = phase === 'ANSWERING' && !!timerEndAt;

  idleMsg.style.display = isIdle ? 'block' : 'none';
  questionCard.style.display = isIdle || isReveal ? 'none' : 'block';
  revealCard.style.display = isReveal ? 'block' : 'none';
  timerWrap.style.display = isAnswering ? 'block' : 'none';

  scoreboardCard.style.display = isIdle ? 'block' : 'none';
  floatingLeaderboard.style.display = isIdle ? 'none' : 'block';

  if (isIdle) {
    stopTicking();
    timerEl.textContent = '';
    renderScoreboard(scoreboard || []);
    renderFloatingLeaderboard(scoreboard || []);
    return;
  }

  if (isReveal) {
    stopTicking();
    timerEl.textContent = '';
    renderReveal(reveal || [], phase);
    renderScoreboard(scoreboard || []);
    renderFloatingLeaderboard(scoreboard || []);
    return;
  }

  roundLabel.textContent = `Round ${question.roundNumber} — Question ${question.questionNumber}`;
  difficultyBadge.textContent = question.difficulty
    ? `${DIFFICULTY_LABEL[question.difficulty]} · ${question.points} pts`
    : '';
  difficultyBadge.className = `badge diff-${question.difficulty || ''}`;

  questionText.textContent = question.text || '';
  statusLine.textContent = phase === 'ANSWERING' ? 'Answer on your phones!' : 'Get ready…';
  progressBadge.textContent = `${answeredTeamIds.length} / ${teams.length} teams answered`;

  if (isAnswering) {
    startTicking(timerEndAt);
  } else {
    stopTicking();
    timerEl.textContent = '';
  }

  renderScoreboard(scoreboard || []);
  renderFloatingLeaderboard(scoreboard || []);
}

function renderFloatingLeaderboard(scoreboard) {
  floatingLeaderboardBody.innerHTML = '';
  scoreboard.forEach((row, i) => {
    const r = document.createElement('div');
    r.className = 'fl-row';
    r.innerHTML = `
      <span class="fl-rank">${i + 1}</span>
      <span class="fl-name">${escapeHtml(row.teamName)}</span>
      <span class="fl-score">${row.total}</span>
    `;
    floatingLeaderboardBody.appendChild(r);
  });
}

function renderReveal(reveal, phase) {
  revealGrid.innerHTML = '';
  for (const r of reveal) {
    const tile = document.createElement('div');
    tile.className = 'answer-tile' + (r.submitted ? '' : ' no-answer');

    const label = document.createElement('div');
    label.className = 'team-label';
    label.textContent = r.teamName;

    const answer = document.createElement('div');
    answer.className = 'answer-text';
    answer.textContent = r.submitted ? r.answerText : 'No answer';

    tile.append(label, answer);

    if (phase === 'SCORED' && r.points != null) {
      const pts = document.createElement('div');
      pts.className = 'points';
      pts.textContent = `+${r.points} pts`;
      tile.appendChild(pts);
    } else if (phase === 'REVEALED') {
      const pending = document.createElement('div');
      pending.className = 'points pending';
      pending.textContent = 'Scoring…';
      tile.appendChild(pending);
    }

    revealGrid.appendChild(tile);
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

function startTicking(timerEndAt) {
  stopTicking();
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
    timerEl.textContent = remaining + 's';
    timerEl.className = 'timer' + (remaining <= 5 ? ' low' : '');
  };
  tick();
  tickHandle = setInterval(tick, 250);
}

function stopTicking() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
