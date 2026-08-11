const socket = io();

const idleMsg = document.getElementById('idleMsg');
const roundLabel = document.getElementById('roundLabel');
const difficultyBadge = document.getElementById('difficultyBadge');
const questionText = document.getElementById('questionText');
const questionCard = document.getElementById('questionCard');
const revealCard = document.getElementById('revealCard');
const scoreboardCard = document.getElementById('scoreboardCard');
const timerWrap = document.getElementById('timerWrap');
const statusLine = document.getElementById('statusLine');
const timerEl = document.getElementById('timer');
const progressBadge = document.getElementById('progressBadge');
const revealGrid = document.getElementById('revealGrid');
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

  idleMsg.style.display = 'none';
  questionCard.style.display = 'none';
  revealCard.style.display = 'none';
  timerWrap.style.display = isAnswering ? 'block' : 'none';

  if (isIdle) {
    idleMsg.style.display = 'block';
    stopTicking();
    timerEl.textContent = '';
  } else if (isReveal) {
    revealCard.style.display = 'flex';
    stopTicking();
    timerEl.textContent = '';
    renderReveal(reveal || [], phase);
  } else if (phase === 'ASK_QUESTION' || phase === 'ANSWERING') {
    questionCard.style.display = 'flex';
    roundLabel.textContent = `Round ${question.roundNumber} — Question ${question.questionNumber}`;
    difficultyBadge.textContent = question.difficulty
      ? `${DIFFICULTY_LABEL[question.difficulty]} · ${question.points} pts`
      : '';
    difficultyBadge.className = `badge diff-${question.difficulty || ''}`;

    // The actual question, always shown once it's live
    questionText.textContent = question.text || '';

    statusLine.textContent = phase === 'ANSWERING'
      ? 'Answer on your phones!'
      : 'Get ready…';

    progressBadge.textContent = `${answeredTeamIds.length} / ${teams.length} teams answered`;

    if (isAnswering) {
      startTicking(timerEndAt);
    } else {
      stopTicking();
      timerEl.textContent = '';
    }
  }

  // The big centered scoreboard only makes sense on the idle screen — once a
  // question is live (or being revealed), it scrolls off screen, so swap to
  // a small pinned panel in the corner instead.
  scoreboardCard.style.display = isIdle ? 'block' : 'none';
  floatingLeaderboard.style.display = isIdle ? 'none' : 'block';

  renderScoreboard(scoreboard || []);
  renderFloatingLeaderboard(scoreboard || []);
}

function renderFloatingLeaderboard(scoreboard) {
  flipRows(floatingLeaderboardBody, scoreboard, (row, i) => {
    const r = document.createElement('div');
    r.className = 'fl-row';
    r.dataset.teamId = row.teamId;
    r.innerHTML = `
      <span class="fl-rank">${i + 1}</span>
      <span class="fl-name">${escapeHtml(row.teamName)}</span>
      <span class="fl-score">${row.total}</span>
    `;
    return r;
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
  flipRows(scoreboardBody, scoreboard, (row, i) => {
    const tr = document.createElement('tr');
    tr.dataset.teamId = row.teamId;
    tr.innerHTML = `<td class="rank-cell">${i + 1}</td><td>${escapeHtml(row.teamName)}</td><td>${row.total}</td>`;
    return tr;
  });
}

// Re-renders `container`'s rows in the new `scoreboard` order using the FLIP
// technique: capture each existing row's position (by teamId) before the
// reorder, then after the DOM is rebuilt, offset each row back to where it
// used to be and transition it to its new spot — so a team that jumps to the
// top visibly slides there instead of just teleporting.
function flipRows(container, scoreboard, buildRow) {
  const first = new Map();
  for (const child of container.children) {
    first.set(child.dataset.teamId, child.getBoundingClientRect());
  }

  container.innerHTML = '';
  scoreboard.forEach((row, i) => {
    container.appendChild(buildRow(row, i));
  });

  for (const child of container.children) {
    const from = first.get(child.dataset.teamId);
    if (!from) continue; // new row, just fade/slide in with no prior position
    const to = child.getBoundingClientRect();
    const deltaY = from.top - to.top;
    if (!deltaY) continue;
    child.style.transform = `translateY(${deltaY}px)`;
    child.style.transition = 'none';
    requestAnimationFrame(() => {
      child.style.transition = 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)';
      child.style.transform = '';
    });
  }
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
