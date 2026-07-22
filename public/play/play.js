const TOKEN_KEY = 'quizhub_token';
const socket = io();

const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const teamsList = document.getElementById('teamsList');
const playerName = document.getElementById('playerName');
const newTeamName = document.getElementById('newTeamName');
const newTeamPassword = document.getElementById('newTeamPassword');
const createTeamBtn = document.getElementById('createTeamBtn');
const myPlayerName = document.getElementById('myPlayerName');
const myTeamName = document.getElementById('myTeamName');
const phaseBadge = document.getElementById('phaseBadge');
const timerEl = document.getElementById('timer');
const questionText = document.getElementById('questionText');
const statusEl = document.getElementById('status');
const answerInput = document.getElementById('answerInput');
const submitBtn = document.getElementById('submitBtn');
const toast = document.getElementById('toast');

let myTeamId = null;
let latestState = null;
let hasEditedSinceServer = false;
let tickHandle = null;

function showToast(message) {
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function connectIdentify() {
  socket.emit('identify', { role: 'play', token: localStorage.getItem(TOKEN_KEY) });
}

socket.on('connect', connectIdentify);

socket.on('teams:needSelection', ({ teams }) => {
  joinScreen.style.display = 'block';
  gameScreen.style.display = 'none';
  teamsList.innerHTML = '';
  if (teams.length === 0) {
    teamsList.innerHTML = '<div class="muted">No teams yet — create the first one below.</div>';
  }
  for (const t of teams) {
    const row = document.createElement('div');
    row.className = 'team-row';

    const name = document.createElement('div');
    name.className = 'team-name';
    name.textContent = t.name;

    const password = document.createElement('input');
    password.type = 'password';
    password.placeholder = 'Team password';

    const btn = document.createElement('button');
    btn.textContent = 'Log in';
    btn.onclick = () => {
      if (!playerName.value.trim()) return showToast('Enter your name first');
      socket.emit('play:selectTeam', { teamId: t.id, password: password.value, playerName: playerName.value.trim() });
    };

    row.append(name, password, btn);
    teamsList.appendChild(row);
  }
});

createTeamBtn.onclick = () => {
  const name = newTeamName.value.trim();
  const password = newTeamPassword.value;
  if (!name) return;
  if (!playerName.value.trim()) return showToast('Enter your name first');
  socket.emit('play:createTeam', { name, password, playerName: playerName.value.trim() });
};

socket.on('play:forceLogout', ({ reason }) => {
  localStorage.removeItem(TOKEN_KEY);
  myTeamId = null;
  showToast(reason || 'You were logged out by the game master.');
  connectIdentify();
});

socket.on('play:joined', ({ teamId, teamName, playerName: joinedPlayerName, token }) => {
  localStorage.setItem(TOKEN_KEY, token);
  myTeamId = teamId;
  myTeamName.textContent = teamName;
  myPlayerName.textContent = joinedPlayerName;
  joinScreen.style.display = 'none';
  gameScreen.style.display = 'block';
});

socket.on('play:myAnswer', ({ answerText }) => {
  if (answerText != null) {
    answerInput.value = answerText;
  }
  hasEditedSinceServer = false;
});

answerInput.addEventListener('input', () => { hasEditedSinceServer = true; });

submitBtn.onclick = () => {
  socket.emit('play:submitAnswer', { answerText: answerInput.value });
  hasEditedSinceServer = false;
  statusEl.textContent = 'Answer submitted — you can still change it until time runs out.';
};

socket.on('error', ({ message }) => showToast(message));

socket.on('state:update', (state) => {
  latestState = state;
  render();
});

function render() {
  if (!latestState) return;
  const { phase, question, timerEndAt, answeredTeamIds } = latestState;

  phaseBadge.textContent = phase;
  phaseBadge.className = 'badge ' + (phase === 'ANSWERING' ? 'on' : 'off');

  if (!question) {
    questionText.textContent = 'Waiting for the host to start a question…';
    answerInput.disabled = true;
    submitBtn.disabled = true;
    statusEl.textContent = '';
    stopTicking();
    timerEl.textContent = '';
    return;
  }

  questionText.textContent = `Round ${question.roundNumber} — Question ${question.questionNumber}`;

  const iSubmitted = myTeamId != null && answeredTeamIds.includes(myTeamId);

  if (phase === 'ASK_QUESTION') {
    answerInput.disabled = true;
    submitBtn.disabled = true;
    statusEl.textContent = 'Listen up — the game master is reading the question aloud.';
    stopTicking();
    timerEl.textContent = '';
  } else if (phase === 'ANSWERING') {
    answerInput.disabled = false;
    submitBtn.disabled = false;
    statusEl.textContent = iSubmitted ? 'Answer submitted — you can still change it until time runs out.' : 'Type your answer and submit before time runs out.';
    startTicking(timerEndAt);
  } else if (phase === 'REVEALED' || phase === 'SCORED') {
    answerInput.disabled = true;
    submitBtn.disabled = true;
    statusEl.textContent = iSubmitted ? 'Answers revealed — check the display!' : 'Time ran out before you submitted an answer.';
    stopTicking();
    timerEl.textContent = '';
  }
}

function startTicking(timerEndAt) {
  stopTicking();
  const tick = () => {
    const remainingMs = timerEndAt - Date.now();
    const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
    timerEl.textContent = remaining + 's';
    timerEl.className = 'timer' + (remaining <= 5 ? ' low' : '');
    if (remainingMs <= 0) {
      answerInput.disabled = true;
      submitBtn.disabled = true;
      stopTicking();
    }
  };
  tick();
  tickHandle = setInterval(tick, 250);
}

function stopTicking() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}
