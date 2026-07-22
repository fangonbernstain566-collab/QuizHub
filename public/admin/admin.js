const socket = io();

const phaseBadge = document.getElementById('phaseBadge');
const currentQuestionLabel = document.getElementById('currentQuestionLabel');
const startAnsweringBtn = document.getElementById('startAnsweringBtn');
const revealBtn = document.getElementById('revealBtn');
const finalizeBtn = document.getElementById('finalizeBtn');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');

const startQuestionCard = document.getElementById('startQuestionCard');
const startRound = document.getElementById('startRound');
const startTime = document.getElementById('startTime');
const startQuestionBtn = document.getElementById('startQuestionBtn');

const scoringCard = document.getElementById('scoringCard');
const scoringGrid = document.getElementById('scoringGrid');

const newTeamName = document.getElementById('newTeamName');
const newTeamPassword = document.getElementById('newTeamPassword');
const addTeamBtn = document.getElementById('addTeamBtn');
const teamsBody = document.getElementById('teamsBody');

const scoreboardBody = document.getElementById('scoreboardBody');
const toast = document.getElementById('toast');

let latestState = null;

function showToast(message) {
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

socket.on('connect', () => socket.emit('identify', { role: 'admin' }));
socket.on('error', ({ message }) => showToast(message));

socket.on('state:update', (state) => {
  latestState = state;
  render();
});

// ---------------- Teams ----------------

addTeamBtn.onclick = () => {
  const name = newTeamName.value.trim();
  const password = newTeamPassword.value;
  if (!name) return;
  socket.emit('admin:createTeam', { name, password });
  newTeamName.value = '';
  newTeamPassword.value = '';
};

// ---------------- Start Question ----------------

startQuestionBtn.onclick = () => {
  socket.emit('admin:startQuestion', {
    roundNumber: Number(startRound.value) || 1,
    timeLimitSeconds: Number(startTime.value) || 30,
  });
};

// ---------------- Control bar ----------------

startAnsweringBtn.onclick = () => socket.emit('admin:startAnswering');
revealBtn.onclick = () => socket.emit('admin:reveal');
finalizeBtn.onclick = () => socket.emit('admin:finalizeScoring');
nextQuestionBtn.onclick = () => socket.emit('admin:nextQuestion');

function render() {
  if (!latestState) return;
  const { phase, question, teams, reveal, scoreboard } = latestState;

  phaseBadge.textContent = phase;
  currentQuestionLabel.textContent = question ? `Round ${question.roundNumber} — Question ${question.questionNumber}` : '';

  startQuestionBtn.disabled = phase !== 'IDLE';
  startAnsweringBtn.disabled = phase !== 'ASK_QUESTION';
  revealBtn.disabled = phase !== 'ANSWERING';
  finalizeBtn.disabled = phase !== 'REVEALED';
  nextQuestionBtn.disabled = phase !== 'SCORED';

  scoringCard.style.display = phase === 'REVEALED' || phase === 'SCORED' ? 'block' : 'none';
  if (phase === 'REVEALED' || phase === 'SCORED') renderScoring(reveal || []);

  renderTeams(teams || []);
  renderScoreboard(scoreboard || []);
}

function renderScoring(reveal) {
  scoringGrid.innerHTML = '';
  for (const r of reveal) {
    const tile = document.createElement('div');
    tile.className = 'answer-tile' + (r.submitted ? '' : ' no-answer');

    const name = document.createElement('div');
    name.className = 'team-name';
    name.textContent = r.teamName;

    const answer = document.createElement('div');
    answer.className = 'answer-text';
    answer.textContent = r.submitted ? r.answerText : 'No answer';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = r.points != null ? r.points : 0;
    input.onchange = () => socket.emit('admin:setScore', { teamId: r.teamId, points: Number(input.value) || 0 });

    tile.append(name, answer, input);
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
    tdStatus.innerHTML = `<span class="badge ${t.connected ? 'on' : 'off'}">${t.connected ? 'online' : 'offline'}</span>`;

    const tdPlayers = document.createElement('td');
    tdPlayers.textContent = (t.players || []).length
      ? t.players.map((p) => `${p.name}${p.connected ? '' : ' (offline)'}`).join(', ')
      : '—';

    const tdReset = document.createElement('td');
    const row = document.createElement('div');
    row.className = 'row';
    const pwInput = document.createElement('input');
    pwInput.type = 'password';
    pwInput.placeholder = 'New password';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'secondary';
    resetBtn.textContent = 'Set';
    resetBtn.onclick = () => {
      if (!pwInput.value) return;
      socket.emit('admin:setTeamPassword', { teamId: t.id, password: pwInput.value });
      pwInput.value = '';
    };
    row.append(pwInput, resetBtn);
    tdReset.appendChild(row);

    tr.append(tdName, tdStatus, tdPlayers, tdReset);
    teamsBody.appendChild(tr);
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
