const TOKEN_KEY = 'quizhub_token';

const socket = io();


// =========================================================
// DOM ELEMENTS
// =========================================================

const joinScreen =
  document.getElementById('joinScreen');

const gameScreen =
  document.getElementById('gameScreen');

const playerName =
  document.getElementById('playerName');

const teamNameInput =
  document.getElementById('teamName');

const teamPasswordInput =
  document.getElementById('teamPassword');

const joinBtn =
  document.getElementById('joinBtn');

const myPlayerName =
  document.getElementById('myPlayerName');

const myTeamName =
  document.getElementById('myTeamName');

const phaseBadge =
  document.getElementById('phaseBadge');

const timerEl =
  document.getElementById('timer');

const questionMeta =
  document.getElementById('questionMeta');

const roundLabel =
  document.getElementById('roundLabel');

const difficultyBadge =
  document.getElementById('difficultyBadge');

const questionText =
  document.getElementById('questionText');

const statusEl =
  document.getElementById('status');

const answerA =
  document.getElementById('answerA');

const answerB =
  document.getElementById('answerB');

const toast =
  document.getElementById('toast');


// =========================================================
// CONSTANTS / STATE
// =========================================================

const DIFFICULTY_LABEL = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
};

let myTeamId = null;

let latestState = null;

let myAnswer = null;

let myAnswerQuestionId = null;

let tickHandle = null;


// =========================================================
// TOAST
// =========================================================

function showToast(message) {

  toast.textContent = message;

  toast.style.display = 'block';

  clearTimeout(showToast._t);

  showToast._t = setTimeout(() => {

    toast.style.display = 'none';

  }, 3000);
}


// =========================================================
// IDENTIFY PLAYER
// =========================================================

function connectIdentify() {

  socket.emit('identify', {
    role: 'play',
    token: localStorage.getItem(TOKEN_KEY)
  });

}


// =========================================================
// SOCKET CONNECTION
// =========================================================

socket.on('connect', connectIdentify);


// =========================================================
// JOIN GAME
// =========================================================

joinBtn.onclick = () => {

  const pName =
    playerName.value.trim();

  const tName =
    teamNameInput.value.trim();

  const tPassword =
    teamPasswordInput.value;


  if (!pName || !tName || !tPassword) {

    return showToast(
      'Please enter your name, team name, and team password.'
    );

  }


  socket.emit('play:join', {
    playerName: pName,
    teamName: tName,
    password: tPassword
  });

};


// =========================================================
// JOIN ERROR
// =========================================================

socket.on(
  'play:joinError',
  (message) => {

    showToast(message);

  }
);


// =========================================================
// JOIN SUCCESS
// =========================================================

socket.on(
  'play:joined',
  ({
    teamId,
    teamName,
    playerName: joinedPlayerName,
    token
  }) => {

    if (token) {

      localStorage.setItem(
        TOKEN_KEY,
        token
      );

    }


    myTeamId = teamId;

    myTeamName.textContent =
      teamName;

    myPlayerName.textContent =
      joinedPlayerName;


    joinScreen.style.display =
      'none';

    gameScreen.style.display =
      'flex';

  }
);


// =========================================================
// FORCE LOGOUT
// =========================================================

socket.on(
  'play:forceLogout',
  ({ reason }) => {

    localStorage.removeItem(
      TOKEN_KEY
    );


    myTeamId = null;


    joinScreen.style.display =
      'flex';

    gameScreen.style.display =
      'none';


    myAnswer = null;

    myAnswerQuestionId = null;

    updateSelectedButton();

    answerA.disabled = true;

    answerB.disabled = true;


    showToast(
      reason ||
      'You were logged out by the game master.'
    );


    connectIdentify();

  }
);


// =========================================================
// SERVER CONFIRMED MY ANSWER
// =========================================================

socket.on(
  'play:myAnswer',
  ({ answerText }) => {

    myAnswer = answerText;

    myAnswerQuestionId =
      latestState &&
      latestState.question
        ? latestState.question.id
        : null;

    updateSelectedButton();

  }
);


// =========================================================
// SELECT AN ANSWER (A / B)
// =========================================================

function updateSelectedButton() {

  answerA.classList.toggle('selected', myAnswer === 'A');

  answerB.classList.toggle('selected', myAnswer === 'B');

}

function selectAnswer(choice) {

  myAnswer = choice;

  myAnswerQuestionId =
    latestState &&
    latestState.question
      ? latestState.question.id
      : null;

  updateSelectedButton();


  socket.emit(
    'play:submitAnswer',
    {
      answerText: choice
    }
  );


  statusEl.textContent =
    'Answer submitted — you can still change it until time runs out.';

}

answerA.onclick = () => selectAnswer('A');
answerB.onclick = () => selectAnswer('B');


// =========================================================
// SOCKET ERRORS
// =========================================================

socket.on(
  'error',
  ({ message }) => {

    showToast(message);

  }
);


// =========================================================
// STATE UPDATE
// =========================================================

socket.on(
  'state:update',
  (state) => {

    latestState = state;

    render();

  }
);


// =========================================================
// RENDER GAME
// =========================================================

function render() {

  if (!latestState) {
    return;
  }


  const {
    phase,
    question,
    timerEndAt,
    answeredTeamIds
  } = latestState;


  // -------------------------------------------------------
  // PHASE
  // -------------------------------------------------------

  phaseBadge.textContent =
    phase;


  phaseBadge.className =
    'badge' +
    (
      phase === 'ANSWERING'
        ? ' active'
        : ''
    );


  // -------------------------------------------------------
  // NO QUESTION / SESSION ENDED
  // -------------------------------------------------------

  if (!question) {

    questionMeta.style.display =
      'none';


    const sessionEnded = phase === 'SESSION_ENDED';

    questionText.textContent = sessionEnded
      ? 'This game session has ended. Waiting for the next session…'
      : 'Waiting for the host to start a question…';


    questionText.classList.add(
      'muted'
    );


    answerA.disabled = true;

    answerB.disabled = true;


    statusEl.textContent = sessionEnded
      ? 'The game master has finished this session.'
      : '';


    myAnswer = null;

    myAnswerQuestionId = null;

    updateSelectedButton();


    stopTicking();


    timerEl.textContent = '';

    return;

  }


  // -------------------------------------------------------
  // NEW QUESTION
  // -------------------------------------------------------

  if (
    question.id !==
    myAnswerQuestionId
  ) {

    myAnswer = null;

    myAnswerQuestionId =
      question.id;

    updateSelectedButton();

  }


  // -------------------------------------------------------
  // QUESTION META
  // -------------------------------------------------------

  questionMeta.style.display =
    'flex';


  roundLabel.textContent =
    `Round ${question.roundNumber} — Q${question.questionNumber}`;


  difficultyBadge.textContent =
    question.difficulty
      ? `${DIFFICULTY_LABEL[question.difficulty]} · ${question.points} pts`
      : '';


  difficultyBadge.className =
    `badge diff-${question.difficulty || ''}`;


  // -------------------------------------------------------
  // QUESTION TEXT
  // -------------------------------------------------------

  questionText.textContent =
    question.text || '';


  questionText.classList.remove(
    'muted'
  );


  // -------------------------------------------------------
  // ANSWERED STATUS
  // -------------------------------------------------------

  const iSubmitted =
    myTeamId != null &&
    answeredTeamIds.includes(
      myTeamId
    );


  // =======================================================
  // ASK QUESTION
  // =======================================================

  if (phase === 'ASK_QUESTION') {

    answerA.disabled = true;

    answerB.disabled = true;


    statusEl.textContent =
      'Listen up — the game master is reading the question aloud.';


    stopTicking();


    timerEl.textContent = '';

    return;
  }


  // =======================================================
  // ANSWERING
  // =======================================================

  if (phase === 'ANSWERING') {

    answerA.disabled = false;

    answerB.disabled = false;


    statusEl.textContent =
      iSubmitted
        ? 'Answer submitted — you can still change it until time runs out.'
        : 'Tap A or B before time runs out.';


    startTicking(
      timerEndAt
    );

    return;
  }


  // =======================================================
  // REVEALED / SCORED
  // =======================================================

  if (
    phase === 'REVEALED' ||
    phase === 'SCORED'
  ) {

    answerA.disabled = true;

    answerB.disabled = true;


    statusEl.textContent =
      iSubmitted
        ? 'Answers revealed — check the display!'
        : 'Time ran out before you submitted an answer.';


    stopTicking();


    timerEl.textContent = '';

  }

}


// =========================================================
// TIMER
// =========================================================

function startTicking(timerEndAt) {

  stopTicking();


  const tick = () => {

    const remainingMs =
      timerEndAt - Date.now();


    const remaining =
      Math.max(
        0,
        Math.ceil(
          remainingMs / 1000
        )
      );


    timerEl.textContent =
      remaining + 's';


    timerEl.className =
      'timer' +
      (
        remaining <= 5
          ? ' low'
          : ''
      );


    if (remainingMs <= 0) {

      answerA.disabled = true;

      answerB.disabled = true;


      stopTicking();

    }

  };


  tick();


  tickHandle =
    setInterval(
      tick,
      250
    );

}


// =========================================================
// STOP TIMER
// =========================================================

function stopTicking() {

  if (tickHandle) {

    clearInterval(
      tickHandle
    );

    tickHandle = null;

  }

}
