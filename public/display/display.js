const socket = io();

const idleMsg = document.getElementById('idleMsg');
const stageCard = document.getElementById('stageCard');
const questionCenter = document.getElementById('questionCenter');
const revealCenter = document.getElementById('revealCenter');
const roundLabel = document.getElementById('roundLabel');
const difficultyBadge = document.getElementById('difficultyBadge');
const questionText = document.getElementById('questionText');
const questionCard = document.getElementById('questionCard');
const timerWrap = document.getElementById('timerWrap');
const statusLine = document.getElementById('statusLine');
const timerEl = document.getElementById('timer');
const progressBadge = document.getElementById('progressBadge');
const revealHeader = document.getElementById('revealHeader');
const revealGrid = document.getElementById('revealGrid');
const cornerScoreboardList = document.getElementById('cornerScoreboardList');
const scoreboardBody = document.getElementById('scoreboardBody');
const floatingLeaderboard = document.getElementById('floatingLeaderboard');
const floatingLeaderboardBody = document.getElementById('floatingLeaderboardBody');

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

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

<<<<<<< HEAD
  if (!showStage) {
    if (currentOuter !== 'idle') {
      crossfade(stageCard, idleMsg, 'block');
      currentOuter = 'idle';
      currentInner = null;
      currentAnswering = false;
=======
  idleMsg.style.display = 'none';
  questionCard.style.display = 'none';
  revealCard.style.display = 'none';

  if (phase === 'IDLE' || !question) {
    idleMsg.style.display = 'block';
    stopTicking();
  } else if (phase === 'ASK_QUESTION' || phase === 'ANSWERING') {
    questionCard.style.display = 'block';
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

    if (phase === 'ANSWERING' && timerEndAt) {
      startTicking(timerEndAt);
    } else {
      stopTicking();
      timerEl.textContent = '';
>>>>>>> b88dd54a1c51e24e4c9b60d17f341dc1f870f4ae
    }
    stopTicking();
<<<<<<< HEAD
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
=======
    renderReveal(reveal || [], phase);
  }

  // The big centered scoreboard only makes sense on the idle screen — once a
  // question is live (or being revealed), it scrolls off screen, so swap to
  // a small pinned panel in the corner instead.
  const isIdle = phase === 'IDLE' || !question;
  scoreboardCard.style.display = isIdle ? 'block' : 'none';
  floatingLeaderboard.style.display = isIdle ? 'none' : 'block';

  renderScoreboard(scoreboard || []);
  renderFloatingLeaderboard(scoreboard || []);
>>>>>>> b88dd54a1c51e24e4c9b60d17f341dc1f870f4ae
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

    // Points stay hidden while the admin is still scoring (REVEALED) —
    // only reveal them once scoring is finalized (SCORED).
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

<<<<<<< HEAD
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
=======
function renderScoreboard(scoreboard) {
  scoreboardBody.innerHTML = '';
  scoreboard.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="rank-cell">${i + 1}</td><td>${escapeHtml(row.teamName)}</td><td>${row.total}</td>`;
    scoreboardBody.appendChild(tr);
  });
>>>>>>> b88dd54a1c51e24e4c9b60d17f341dc1f870f4ae
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
<<<<<<< HEAD
=======

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
>>>>>>> b88dd54a1c51e24e4c9b60d17f341dc1f870f4ae
