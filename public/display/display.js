const socket = io();

const idleMsg = document.getElementById('idleMsg');
const questionCard = document.getElementById('questionCard');
const revealCard = document.getElementById('revealCard');
const scoreboardCard = document.getElementById('scoreboardCard');
const roundLabel = document.getElementById('roundLabel');
const questionText = document.getElementById('questionText');
const timerEl = document.getElementById('timer');
const progressBadge = document.getElementById('progressBadge');
const revealGrid = document.getElementById('revealGrid');
const scoreboardBody = document.getElementById('scoreboardBody');

let tickHandle = null;

socket.on('connect', () => socket.emit('identify', { role: 'display' }));

socket.on('state:update', (state) => render(state));

function render(state) {
  const { phase, question, timerEndAt, answeredTeamIds, reveal, scoreboard, teams } = state;

  idleMsg.style.display = 'none';
  questionCard.style.display = 'none';
  revealCard.style.display = 'none';

  if (phase === 'IDLE' || !question) {
    idleMsg.style.display = 'block';
    stopTicking();
  } else if (phase === 'ASK_QUESTION' || phase === 'ANSWERING') {
    questionCard.style.display = 'block';
    roundLabel.textContent = `Round ${question.roundNumber} — Question ${question.questionNumber}`;
    questionText.textContent = phase === 'ANSWERING' ? 'Answer on your phones!' : 'Get ready…';
    progressBadge.textContent = `${answeredTeamIds.length} / ${teams.length} teams answered`;

    if (phase === 'ANSWERING' && timerEndAt) {
      startTicking(timerEndAt);
    } else {
      stopTicking();
      timerEl.textContent = 'Get ready…';
    }
  } else if (phase === 'REVEALED' || phase === 'SCORED') {
    revealCard.style.display = 'block';
    stopTicking();
    renderReveal(reveal || []);
  }

  renderScoreboard(scoreboard || []);
}

function renderReveal(reveal) {
  revealGrid.innerHTML = '';
  for (const r of reveal) {
    const tile = document.createElement('div');
    tile.className = 'answer-tile' + (r.submitted ? '' : ' no-answer');
    const name = document.createElement('div');
    name.className = 'team-name';
    name.textContent = r.teamName;
    const answer = document.createElement('div');
    answer.className = 'answer-text';
    answer.textContent = r.submitted ? r.answerText : 'No answer';
    tile.appendChild(name);
    tile.appendChild(answer);
    if (r.points != null) {
      const pts = document.createElement('div');
      pts.className = 'points';
      pts.textContent = `+${r.points} pts`;
      tile.appendChild(pts);
    }
    revealGrid.appendChild(tile);
  }
}

function renderScoreboard(scoreboard) {
  scoreboardBody.innerHTML = '';
  for (const row of scoreboard) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(row.teamName)}</td><td>${row.total}</td>`;
    scoreboardBody.appendChild(tr);
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
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
