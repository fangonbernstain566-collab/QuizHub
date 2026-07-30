const TOKEN_KEY = 'quizhub_token';
const socket = io();

// --- DOM Elements ---
const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const playerName = document.getElementById('playerName');
const teamNameInput = document.getElementById('teamName');
const joinBtn = document.getElementById('joinBtn');
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

// --- Helper Functions ---
function showToast(message) {
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function connectIdentify() {
  socket.emit('identify', { role: 'play', token: localStorage.getItem(TOKEN_KEY) });
}

// --- Socket Connection ---
socket.on('connect', connectIdentify);

// Make sure this matches your HTML button ID
joinBtn.onclick = () => {
  const pName = playerName.value.trim();
  const tName = teamNameInput.value.trim();

  if (!pName || !tName) {
    return showToast('Please enter both your name and team name.');
  }

  // Send player join request
  socket.emit('play:join', { playerName: pName, teamName: tName });
};

// Catch server errors (like invalid team name)
socket.on('play:joinError', (message) => {
  showToast(message);
});

socket.on('play:joined', ({ teamId, teamName, playerName: joinedPlayerName, token }) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  myTeamId = teamId;
  myTeamName.textContent = teamName;
  myPlayerName.textContent = joinedPlayerName;
  joinScreen.style.display = 'none';
  gameScreen.style.display = 'block';
});

socket.on('play:forceLogout', ({ reason }) => {
  localStorage.removeItem(TOKEN_KEY);
  myTeamId = null;
  joinScreen.style.display = 'block';
  gameScreen.style.display = 'none';
  showToast(reason || 'You were logged out by the game master.');
  connectIdentify();
});

// --- Gameplay & Answers ---
socket.on('play:myAnswer', ({ answerText }) => {
  if (answerText != null && !hasEditedSinceServer) {
    answerInput.value = answerText;
  }
  hasEditedSinceServer = false;
});

answerInput.addEventListener('input', () => { 
  hasEditedSinceServer = true; 
});

submitBtn.onclick = () => {
  socket.emit('play:submitAnswer', { answerText: answerInput.value });
  hasEditedSinceServer = false;
  statusEl.textContent = 'Answer submitted — you can still change it until time runs out.';
};

socket.on('error', ({ message }) => showToast(message));

// --- State & Rendering ---
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
    statusEl.textContent = iSubmitted 
      ? 'Answer submitted — you can still change it until time runs out.' 
      : 'Type your answer and submit before time runs out.';
    startTicking(timerEndAt);
  } else if (phase === 'REVEALED' || phase === 'SCORED') {
    answerInput.disabled = true;
    submitBtn.disabled = true;
    statusEl.textContent = iSubmitted 
      ? 'Answers revealed — check the display!' 
      : 'Time ran out before you submitted an answer.';
    stopTicking();
    timerEl.textContent = '';
  }
}

// --- Timer Ticking ---
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
  if (tickHandle) { 
    clearInterval(tickHandle); 
    tickHandle = null; 
  }
}