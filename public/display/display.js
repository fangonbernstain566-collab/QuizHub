const socket = io();

const idleMsg = document.getElementById('idleMsg');
const stageCard = document.getElementById('stageCard');
const questionCenter = document.getElementById('questionCenter');
const revealCenter = document.getElementById('revealCenter');
const roundLabel = document.getElementById('roundLabel');
const questionText = document.getElementById('questionText');
const timerWrap = document.getElementById('timerWrap');
const timerEl = document.getElementById('timer');
const progressBadge = document.getElementById('progressBadge');
const revealHeader = document.getElementById('revealHeader');
const revealGrid = document.getElementById('revealGrid');
const cornerScoreboardList = document.getElementById('cornerScoreboardList');

let tickHandle = null;

const FADE_MS = 350;
let currentOuter = null; // 'idle' | 'stage'
let currentInner = null; // 'question' | 'reveal'
let currentAnswering = false;

socket.on('connect', () => socket.emit('identify', { role: 'display' }));

socket.on('state:update', (state) => render(state));

// Fades hideEl out (then display:none) and/or showEl in (then display:displayValue).
// Either side may be null to only do one half of the crossfade (e.g. the timer badge).
function crossfade(hideEl, showEl, displayValue) {
  if (hideEl) {
    hideEl.classList.add('fading-out');
    setTimeout(() => {
      hideEl.style.display = 'none';
      hideEl.classList.remove('fading-out');
    }, FADE_MS);
  }
  if (showEl) {
    showEl.style.display = displayValue;
    showEl.classList.add('fading-out');
    void showEl.offsetWidth; // force reflow so the next class change transitions
    requestAnimationFrame(() => showEl.classList.remove('fading-out'));
  }
}

function render(state) {
  const { phase, question, timerEndAt, answeredTeamIds, reveal, scoreboard, teams } = state;
  const showStage = !(phase === 'IDLE' || !question);

  if (!showStage) {
    if (currentOuter !== 'idle') {
      crossfade(stageCard, idleMsg, 'block');
      currentOuter = 'idle';
      currentInner = null;
      currentAnswering = false;
    }
    stopTicking();
    return;
  }

  if (currentOuter !== 'stage') {
    crossfade(idleMsg, stageCard, 'flex');
    currentOuter = 'stage';
  }

  roundLabel.innerHTML = `Round ${question.roundNumber}<br>Question ${question.questionNumber}`;
  renderCornerScoreboard(scoreboard || []);

  const isReveal = phase === 'REVEALED' || phase === 'SCORED';
  const nextInner = isReveal ? 'reveal' : 'question';

  if (nextInner !== currentInner) {
    if (nextInner === 'reveal') crossfade(questionCenter, revealCenter, 'flex');
    else crossfade(revealCenter, questionCenter, 'flex');
    currentInner = nextInner;
  }

  if (isReveal) {
    stopTicking();
    currentAnswering = false;
    revealHeader.textContent = `Question ${question.questionNumber}`;
    renderReveal(reveal || []);
    return;
  }

  const isAnswering = phase === 'ANSWERING' && !!timerEndAt;
  if (isAnswering !== currentAnswering) {
    if (isAnswering) crossfade(null, timerWrap, 'block');
    else crossfade(timerWrap, null, 'block');
    currentAnswering = isAnswering;
  }

  questionText.textContent = `Question ${question.questionNumber}`;
  questionText.classList.toggle('secondary', isAnswering);

  if (isAnswering) {
    progressBadge.textContent = `${answeredTeamIds.length} / ${teams.length} teams answered`;
    startTicking(timerEndAt);
  } else {
    progressBadge.textContent = 'Get ready…';
    stopTicking();
  }
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

function renderCornerScoreboard(scoreboard) {
  const sorted = [...scoreboard].sort((a, b) => b.total - a.total);
  cornerScoreboardList.innerHTML = '';
  for (const row of sorted) {
    const line = document.createElement('div');
    line.className = 'corner-score-row';
    const name = document.createElement('span');
    name.textContent = row.teamName;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = row.total;
    line.appendChild(name);
    line.appendChild(score);
    cornerScoreboardList.appendChild(line);
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
