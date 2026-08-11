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

const answerInput =
  document.getElementById('answerInput');

const submitAnswerBtn =
  document.getElementById('submitAnswerBtn');

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


  if (!pName || !tName) {

    return showToast(
      'Please enter both your name and team name.'
    );

  }


  socket.emit('play:join', {
    playerName: pName,
    teamName: tName
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


    answerInput.value = '';

    answerInput.disabled = true;

    submitAnswerBtn.disabled = true;

    submitAnswerBtn.textContent =
      'Submit answer';

    submitAnswerBtn.classList.remove(
      'submitted'
    );


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


    answerInput.value =
      answerText || '';


    // Show submitted state
    if (answerText) {

      submitAnswerBtn.textContent =
        'Answer submitted';

      submitAnswerBtn.classList.add(
        'submitted'
      );

    }

  }
);


// =========================================================
// SUBMIT ANSWER
// =========================================================

function submitAnswer() {

  const answer =
    answerInput.value.trim();


  if (!answer) {

    return showToast(
      'Please enter an answer first.'
    );

  }


  myAnswer = answer;


  myAnswerQuestionId =
    latestState &&
    latestState.question
      ? latestState.question.id
      : null;


  socket.emit(
    'play:submitAnswer',
    {
      answerText: answer
    }
  );


  statusEl.textContent =
    'Answer submitted — you can still change it until time runs out.';


  // Change button appearance
  submitAnswerBtn.textContent =
    'Answer submitted';

  submitAnswerBtn.classList.add(
    'submitted'
  );

}


// =========================================================
// SUBMIT BUTTON
// =========================================================

submitAnswerBtn.onclick =
  submitAnswer;


// =========================================================
// CTRL + ENTER TO SUBMIT
// =========================================================
//
// Normal Enter = new line
// Ctrl + Enter = submit answer
//

answerInput.addEventListener(
  'keydown',
  (event) => {

    if (
      event.key === 'Enter' &&
      event.ctrlKey
    ) {

      event.preventDefault();

      submitAnswer();

    }

  }
);


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
  // NO QUESTION
  // -------------------------------------------------------

  if (!question) {

    questionMeta.style.display =
      'none';


    questionText.textContent =
      'Waiting for the host to start a question…';


    questionText.classList.add(
      'muted'
    );


    answerInput.disabled =
      true;


    submitAnswerBtn.disabled =
      true;


    statusEl.textContent = '';


    answerInput.value = '';

    myAnswer = null;

    myAnswerQuestionId = null;


    submitAnswerBtn.textContent =
      'Submit answer';

    submitAnswerBtn.classList.remove(
      'submitted'
    );


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


    answerInput.value = '';


    // Reset button for new question
    submitAnswerBtn.textContent =
      'Submit answer';

    submitAnswerBtn.classList.remove(
      'submitted'
    );

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

    answerInput.disabled =
      true;


    submitAnswerBtn.disabled =
      true;


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

    answerInput.disabled =
      false;


    submitAnswerBtn.disabled =
      false;


    statusEl.textContent =
      iSubmitted
        ? 'Answer submitted — you can still change it until time runs out.'
        : 'Type your answer and submit before time runs out.';


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

    answerInput.disabled =
      true;


    submitAnswerBtn.disabled =
      true;


    statusEl.textContent =
      iSubmitted
        ? 'Answer submitted — check the display!'
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

      answerInput.disabled =
        true;

      submitAnswerBtn.disabled =
        true;


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