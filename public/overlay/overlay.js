// Game screen shown in TikTok LIVE Studio / OBS.
import { connect } from '/shared/socket.js';
import { Confetti } from '/overlay/confetti.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');

// Scale the fixed 1080x1920 stage to fit the window.
function fit() {
  const s = Math.min(innerWidth / 1080, innerHeight / 1920);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit);
fit();

const MAX_ROWS = 10;
const confetti = new Confetti($('confetti'));
let state = { phase: 'idle' };
let phaseEndsAt = 0;
const fxConfetti = new Confetti($('fxConfetti'));

connect('overlay', {
  onOpen: () => $('offline').classList.remove('show'),
  onClose: () => $('offline').classList.add('show'),
  onMessage(msg) {
    if (msg.type === 'events') msg.events.forEach(handleEvent);
    if (msg.type === 'state') { render(msg.state); renderLikes(msg.likes, msg.state); }
    if (msg.type === 'effects') msg.effects.forEach(playEffect);
  },
});

// --- Game state ------------------------------------------------------------------
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const ROUND_PHASES = ['question', 'reveal', 'winner'];

function render(next) {
  const prev = state;
  state = next;
  phaseEndsAt = performance.now() + next.phaseRemaining;
  stage.dataset.phase = next.phase;
  stage.dataset.game = next.game?.key ?? '';
  stage.classList.toggle('is-paused', next.paused);

  const phaseChanged = prev.phase !== next.phase || prev.roundNumber !== next.roundNumber;
  if (phaseChanged && next.phase !== 'idle') clearList();

  renderRoundInfo(next);
  $('prompt').classList.remove('text');
  if (!ROUND_PHASES.includes(next.phase)) $('options').replaceChildren();

  if (next.phase === 'idle') {
    $('gameName').textContent = 'Waiting for the game to start';
    $('prompt').textContent = '?';
    $('sub').textContent = '';
    $('panelTitle').textContent = 'Live chat';
    $('answerCount').textContent = '';
    $('more').textContent = '';
    if (phaseChanged) clearList();
  }

  if (next.phase === 'ready') {
    $('gameName').textContent = next.multiplier > 1 ? `Double points! ${next.game?.name ?? ''}` : 'Next up';
    $('sub').textContent = next.game?.instructions ?? '';
    $('panelTitle').textContent = next.game?.name ?? '';
    $('answerCount').textContent = '';
    $('more').textContent = '';
    $('list').innerHTML = '<li class="empty-hint">Get ready…</li>';
  }

  if (ROUND_PHASES.includes(next.phase)) {
    const q = next.question;
    $('gameName').textContent = next.game?.name ?? '';
    $('sub').textContent = '';
    const revealed = next.phase !== 'question';
    $('prompt').textContent = revealed && next.result?.revealDisplay ? next.result.revealDisplay : q.display;
    $('prompt').classList.toggle('text', Boolean(q.options));
    renderOptions(q.options, revealed ? next.result?.correctAnswer : null, phaseChanged);
    $('panelTitle').textContent = 'Fastest correct answers';
    $('answerCount').textContent = `${next.answerCount} ${next.answerCount === 1 ? 'answer' : 'answers'}`;
    renderCorrect(next.correct, next.correctCount);
  }

  if (next.phase === 'winner' && phaseChanged) showWinner(next.result);
  if (next.phase !== 'winner') confetti.stop();
  if (next.phase === 'leaderboard' && phaseChanged) renderBoard(next.leaderboard);
  if (next.phase === 'vote') renderVote(next.vote);
}

function renderRoundInfo(st) {
  const info = $('roundInfo');
  info.textContent = st.roundNumber ? `Round ${st.roundNumber}` : '';
  const mult = st.phase === 'vote' || st.phase === 'leaderboard' ? st.nextMultiplier : st.multiplier;
  if (st.roundNumber && mult > 1) {
    const badge = document.createElement('span');
    badge.className = 'mult';
    badge.textContent = `${mult}× points`;
    info.append(badge);
  }
}

// Quiz and true/false answer tiles. After the question the right one lights up.
function renderOptions(options, correctLetter, rebuild) {
  const box = $('options');
  if (!options) return box.replaceChildren();
  if (rebuild || box.children.length !== options.length) {
    box.replaceChildren(...options.map((o) => {
      const el = document.createElement('div');
      el.className = 'opt';
      el.dataset.letter = o.letter;
      el.innerHTML = '<span class="letter"></span><span class="text"></span>';
      el.querySelector('.letter').textContent = o.letter;
      el.querySelector('.text').textContent = o.text;
      return el;
    }));
  }
  box.classList.toggle('reveal', Boolean(correctLetter));
  for (const el of box.children) el.classList.toggle('right', el.dataset.letter === correctLetter);
}

// Keyed by name so only NEW names slide in; existing rows stay put.
function renderCorrect(rows, total) {
  const list = $('list');
  if (!rows.length) {
    list.innerHTML = state.phase === 'question' ? '<li class="empty-hint">Be the first to answer!</li>' : '<li class="empty-hint">Nobody got it right</li>';
    $('more').textContent = '';
    return;
  }
  list.querySelector('.empty-hint')?.remove();
  const existing = new Map([...list.children].map((li) => [li.dataset.name, li]));
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    let li = existing.get(r.name);
    if (li) li.classList.add('old');
    else {
      li = document.createElement('li');
      li.dataset.name = r.name;
      li.innerHTML = '<span class="rank"></span><span class="who"></span><span class="streak"></span><span class="ms"></span>';
    }
    li.querySelector('.rank').textContent = `${r.rank}.`;
    li.querySelector('.who').textContent = r.name;
    li.querySelector('.streak').textContent = r.streak >= 2 ? `🔥${r.streak}` : '';
    li.querySelector('.ms').textContent = seconds(r.ms);
    frag.append(li);
  }
  list.replaceChildren(frag);
  // When quiz options take up room, fewer rows fit: hide the overflow and count it as "others".
  while (list.children.length > 1 && list.scrollHeight > list.clientHeight + 2) list.lastChild.remove();
  const others = total - list.children.length;
  $('more').textContent = others > 0 ? `+ ${others} ${others === 1 ? 'other' : 'others'}` : '';
}

function clearList() {
  $('list').replaceChildren();
}

function showWinner(result) {
  const w = result?.winner;
  $('winnerLabel').textContent = w ? 'Round winner' : 'Nobody got it right!';
  $('winnerName').textContent = w ? w.name : '😮';
  $('winnerTime').textContent = w ? `${seconds(w.ms)} · +${w.points} points` : 'Better luck next round';
  $('winnerBonus').textContent = w?.bonus ? `🔥 ${w.streak} in a row: +${w.bonus} streak bonus` : '';
  $('winnerAnswer').textContent = result?.answerLabel ?? result?.correctAnswer ?? '';
  $('winnerStats').textContent = `${result?.correctCount ?? 0} of ${result?.answerCount ?? 0} answered correctly`;
  const medals = ['🥇', '🥈', '🥉'];
  $('podium').replaceChildren(...(result?.top3 ?? []).map((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<b></b><span></span>';
    li.querySelector('b').textContent = `${medals[i]} ${r.name}`;
    li.querySelector('span').textContent = seconds(r.ms);
    return li;
  }));
  if (w) confetti.start();
}

function renderBoard(rows = []) {
  const list = $('boardList');
  if (!rows.length) {
    list.innerHTML = '<li class="empty-hint">No points yet. Answer to get on the board!</li>';
    return;
  }
  list.replaceChildren(...rows.map((r, i) => {
    const li = document.createElement('li');
    li.style.animationDelay = `${i * 70}ms`;
    li.innerHTML = '<span class="rank"></span><span class="who"></span><span class="streak"></span><span class="pts"></span>';
    li.querySelector('.rank').textContent = `${r.rank}.`;
    li.querySelector('.who').textContent = r.name;
    li.querySelector('.streak').textContent = r.streak >= 2 ? `🔥${r.streak}` : '';
    li.querySelector('.pts').textContent = r.points.toLocaleString('en');
    return li;
  }));
}

function renderVote(vote) {
  if (!vote) return;
  $('gameName').textContent = 'Vote for the next game!';
  $('prompt').textContent = 'Next game?';
  $('prompt').classList.add('text');
  $('sub').textContent = '';
  $('panelTitle').textContent = `Type ${vote.options.map((o) => o.number).join(' or ')} in the chat`;
  $('answerCount').textContent = `${vote.total} ${vote.total === 1 ? 'vote' : 'votes'}`;
  $('more').textContent = '';
  const max = Math.max(1, ...vote.options.map((o) => o.votes));
  $('list').replaceChildren(...vote.options.map((o) => {
    const li = document.createElement('li');
    li.className = 'vote-row old';
    li.innerHTML = '<span class="num"></span><div class="body"><div class="name"></div><div class="bar"><div></div></div></div><span class="votes"></span>';
    li.querySelector('.num').textContent = o.number;
    li.querySelector('.name').textContent = o.name;
    li.querySelector('.bar div').style.width = `${(o.votes / max) * 100}%`;
    li.querySelector('.votes').textContent = o.votes;
    return li;
  }));
}

// Timer bar and the 3-2-1 countdown run locally, smoothly, at 60 fps.
function tick() {
  const remaining = state.paused ? state.phaseRemaining : Math.max(0, phaseEndsAt - performance.now());
  const frac = state.phaseDuration ? remaining / state.phaseDuration : 0;
  $('timerBar').style.transform = `scaleX(${['question', 'vote'].includes(state.phase) ? frac : state.phase === 'ready' ? 1 : 0})`;
  if (state.phase === 'ready') $('prompt').textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// --- Chat (only while waiting) ----------------------------------------------------
function handleEvent(e) {
  // Chat is only shown while no game is running, so nobody can copy answers.
  if (e.type === 'chat' && state.phase === 'idle') addChatRow(e.user.name, e.text);
}

function addChatRow(name, text) {
  const li = document.createElement('li');
  li.innerHTML = '<span class="who"></span><span class="what"></span>';
  li.querySelector('.who').textContent = name;
  li.querySelector('.what').textContent = text;
  const list = $('list');
  list.prepend(li);
  while (list.children.length > MAX_ROWS) list.lastChild.remove();
}

// --- Like meter ------------------------------------------------------------------
let lastLikes = 0;
function renderLikes(likes, st) {
  if (!likes) return;
  $('likeCount').textContent = likes.total.toLocaleString('en');
  $('likeFill').style.width = `${Math.min(100, (likes.meter / likes.goal) * 100)}%`;
  const box = document.querySelector('.likes');
  box.classList.toggle('ready', likes.pendingDoubles > 0);
  const left = Math.max(0, likes.goal - likes.meter).toLocaleString('en');
  $('likeText').textContent = st.multiplier > 1 && ['ready', 'question'].includes(st.phase)
    ? '🔥 2× points this round!'
    : likes.pendingDoubles > 0 ? `2× points next round! (${left} likes for another)` : `${left} likes to unlock 2× points!`;
  if (likes.total > lastLikes) {
    box.classList.add('bump');
    setTimeout(() => box.classList.remove('bump'), 150);
  }
  lastLikes = likes.total;
}

// --- Gift and like effects --------------------------------------------------------
const MAX_PARTICLES = 90;
const MAX_POPS = 4;

function playEffect(fx) {
  if (fx.kind === 'gift') {
    const what = `${fx.count > 1 ? fx.count + '× ' : ''}${fx.gift}`;
    showPop(`🎁 ${fx.name} sent ${what}`, fx.bonus ? `+${fx.bonus}` : '', fx.big);
    if (fx.effect === 'hearts') particles(['❤️', '💖', '💕', '💗'], 10, 'rise');
    else if (fx.effect === 'fireworks') {
      bigBanner(`${fx.name}`, `sent ${what}! 🎆`);
      fxConfetti.start();
      setTimeout(() => fxConfetti.stop(), 3500);
    } else particles(['✨', '⭐', '🌟', '💫'], 12, 'burst');
  }
  if (fx.kind === 'likeGoal') {
    bigBanner('❤️ LIKE GOAL! ❤️', 'Next round: DOUBLE POINTS');
    particles(['❤️', '💖', '💕'], 24, 'rise');
  }
  if (fx.kind === 'follow') showPop(`➕ ${fx.name} followed`);
  if (fx.kind === 'share') showPop(`🔁 ${fx.name} shared the LIVE`);
}

function showPop(text, bonus = '', big = false) {
  const box = $('gifts');
  while (box.children.length >= MAX_POPS) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = `gift-pop${big ? ' big' : ''}`;
  el.textContent = text;
  if (bonus) {
    const b = document.createElement('span');
    b.className = 'bonus';
    b.textContent = bonus;
    el.append(b);
  }
  box.append(el);
  setTimeout(() => el.remove(), 2700);
}

function particles(emojis, count, kind) {
  const layer = $('fx');
  const room = MAX_PARTICLES - layer.children.length;
  for (let i = 0; i < Math.min(count, room); i++) {
    const p = document.createElement('span');
    p.className = `particle ${kind}`;
    p.textContent = emojis[i % emojis.length];
    if (kind === 'rise') {
      p.style.left = `${700 + Math.random() * 320}px`;
      p.style.top = '1700px';
      p.style.setProperty('--dx', `${-200 + Math.random() * 300}px`);
      p.style.animationDelay = `${Math.random() * 0.6}s`;
    } else {
      p.style.left = `${480 + Math.random() * 120}px`;
      p.style.top = `${900 + Math.random() * 120}px`;
      const a = Math.random() * Math.PI * 2;
      const r = 250 + Math.random() * 300;
      p.style.setProperty('--dx', `${Math.cos(a) * r}px`);
      p.style.setProperty('--dy', `${Math.sin(a) * r}px`);
    }
    p.addEventListener('animationend', () => p.remove());
    layer.append(p);
  }
}

let bannerTimer;
function bigBanner(title, subtitle) {
  const el = $('bigBanner');
  el.textContent = title;
  const small = document.createElement('small');
  small.textContent = subtitle;
  el.append(small);
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 3300);
}
