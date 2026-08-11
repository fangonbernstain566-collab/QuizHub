const TOKEN_KEY = 'quizhub_token';
const socket = io();

// --- DOM Elements ---
const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const playerName = document.getElementById('playerName');
const teamNameInput = document.getElementById('teamName');
const teamPasswordInput = document.getElementById('teamPassword');
const joinBtn = document.getElementById('joinBtn');
const myPlayerName = document.getElementById('myPlayerName');
const myTeamName = document.getElementById('myTeamName');
const phaseBadge = document.getElementById('phaseBadge');
const timerEl = document.getElementById('timer');
const questionMeta = document.getElementById('questionMeta');
const roundLabel = document.getElementById('roundLabel');
const difficultyBadge = document.getElementById('difficultyBadge');
const questionText = document.getElementById('questionText');
const statusEl = document.getElementById('status');
const answerA = document.getElementById('answerA');
const answerB = document.getElementById('answerB');
const toast = document.getElementById('toast');

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

let myTeamId = null;
let latestState = null;
let myAnswer = null;
let myAnswerQuestionId = null;
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

joinBtn.onclick = () => {
  const pName = playerName.value.trim();
  const tName = teamNameInput.value.trim();
  const tPassword = teamPasswordInput.value;

  if (!pName || !tName || !tPassword) {
    return showToast('Please enter your name, team name, and team password.');
  }

  socket.emit('play:join', { playerName: pName, teamName: tName, password: tPassword });
};

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
  myAnswer = answerText;
  myAnswerQuestionId = latestState && latestState.question ? latestState.question.id : null;
  updateSelectedButton();
});

function updateSelectedButton() {
  answerA.classList.toggle('selected', myAnswer === 'A');
  answerB.classList.toggle('selected', myAnswer === 'B');
}

function selectAnswer(choice) {
  myAnswer = choice;
  myAnswerQuestionId = latestState && latestState.question ? latestState.question.id : null;
  updateSelectedButton();
  socket.emit('play:submitAnswer', { answerText: choice });
  statusEl.textContent = 'Answer submitted — you can still change it until time runs out.';
}

answerA.onclick = () => selectAnswer('A');
answerB.onclick = () => selectAnswer('B');

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
  phaseBadge.className = 'badge' + (phase === 'ANSWERING' ? ' active' : '');

  if (!question) {
    questionMeta.style.display = 'none';
    questionText.textContent = 'Waiting for the host to start a question…';
    answerA.disabled = true;
    answerB.disabled = true;
    statusEl.textContent = '';
    stopTicking();
    timerEl.textContent = '';
    return;
  }

  if (question.id !== myAnswerQuestionId) {
    myAnswer = null;
    myAnswerQuestionId = question.id;
    updateSelectedButton();
  }

  questionMeta.style.display = 'flex';
  roundLabel.textContent = `Round ${question.roundNumber} — Q${question.questionNumber}`;
  difficultyBadge.textContent = question.difficulty
    ? `${DIFFICULTY_LABEL[question.difficulty]} · ${question.points} pts`
    : '';
  difficultyBadge.className = `badge diff-${question.difficulty || ''}`;

  // The actual question text, shown as soon as it's live
  questionText.textContent = question.text || '';
  questionText.classList.remove('muted');

  const iSubmitted = myTeamId != null && answeredTeamIds.includes(myTeamId);

  if (phase === 'ASK_QUESTION') {
    answerA.disabled = true;
    answerB.disabled = true;
    statusEl.textContent = 'Listen up — the game master is reading the question aloud.';
    stopTicking();
    timerEl.textContent = '';
  } else if (phase === 'ANSWERING') {
    answerA.disabled = false;
    answerB.disabled = false;
    statusEl.textContent = iSubmitted
      ? 'Answer submitted — you can still change it until time runs out.'
      : 'Tap A or B before time runs out.';
    startTicking(timerEndAt);
  } else if (phase === 'REVEALED' || phase === 'SCORED') {
    answerA.disabled = true;
    answerB.disabled = true;
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
      answerA.disabled = true;
      answerB.disabled = true;
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