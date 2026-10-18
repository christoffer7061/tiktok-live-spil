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
let likes = 0;
let likeGoal = 1000;

connect('overlay', {
  onOpen: () => $('offline').classList.remove('show'),
  onClose: () => $('offline').classList.add('show'),
  onMessage(msg) {
    if (msg.type === 'hello') likeGoal = msg.config?.likes?.meterGoal ?? likeGoal;
    if (msg.type === 'events') msg.events.forEach(handleEvent);
    if (msg.type === 'state') render(msg.state);
  },
});

// --- Game state ------------------------------------------------------------------
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

function render(next) {
  const prev = state;
  state = next;
  phaseEndsAt = performance.now() + next.phaseRemaining;
  stage.dataset.phase = next.phase;
  stage.classList.toggle('is-paused', next.paused);

  const phaseChanged = prev.phase !== next.phase || prev.roundNumber !== next.roundNumber;
  if (phaseChanged && next.phase !== 'idle') clearList();

  $('roundInfo').textContent = next.roundNumber ? `Round ${next.roundNumber}` : '';

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
    $('gameName').textContent = 'Next up';
    $('sub').textContent = next.game?.instructions ?? '';
    $('panelTitle').textContent = next.game?.name ?? '';
    $('answerCount').textContent = '';
    $('more').textContent = '';
    $('list').innerHTML = '<li class="empty-hint">Get ready…</li>';
  }

  if (['question', 'reveal', 'winner'].includes(next.phase)) {
    $('gameName').textContent = next.game?.name ?? '';
    $('sub').textContent = '';
    $('prompt').textContent = next.phase === 'question'
      ? next.question.display
      : next.question.display.replace('?', next.result?.correctAnswer ?? '?');
    $('panelTitle').textContent = 'Fastest correct answers';
    $('answerCount').textContent = `${next.answerCount} ${next.answerCount === 1 ? 'answer' : 'answers'}`;
    renderCorrect(next.correct, next.correctCount);
  }

  if (next.phase === 'winner' && phaseChanged) showWinner(next.result);
  if (next.phase !== 'winner') confetti.stop();
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
      li.innerHTML = '<span class="rank"></span><span class="who"></span><span class="ms"></span>';
    }
    li.querySelector('.rank').textContent = `${r.rank}.`;
    li.querySelector('.who').textContent = r.name;
    li.querySelector('.ms').textContent = seconds(r.ms);
    frag.append(li);
  }
  list.replaceChildren(frag);
  const others = total - rows.length;
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
  $('winnerAnswer').textContent = result?.correctAnswer ?? '';
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

// Timer bar and the 3-2-1 countdown run locally, smoothly, at 60 fps.
function tick() {
  const remaining = state.paused ? state.phaseRemaining : Math.max(0, phaseEndsAt - performance.now());
  const frac = state.phaseDuration ? remaining / state.phaseDuration : 0;
  $('timerBar').style.transform = `scaleX(${state.phase === 'question' ? frac : state.phase === 'ready' ? 1 : 0})`;
  if (state.phase === 'ready') $('prompt').textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// --- Likes, gifts, chat ---------------------------------------------------------
function handleEvent(e) {
  // Chat is only shown while no question is open, so nobody can copy answers.
  if (e.type === 'chat' && state.phase === 'idle') addChatRow(e.user.name, e.text);
  if (e.type === 'like') {
    likes += e.likeCount;
    $('likeCount').textContent = likes.toLocaleString('en');
    $('likeFill').style.width = `${Math.min(100, ((likes % likeGoal) / likeGoal) * 100)}%`;
  }
  if (e.type === 'gift') showGift(`🎁 ${e.user.name} sent ${e.gift.count > 1 ? e.gift.count + '× ' : ''}${e.gift.name}`);
  if (e.type === 'follow') showGift(`➕ ${e.user.name} followed`);
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

function showGift(text) {
  const el = document.createElement('div');
  el.className = 'gift-pop';
  el.textContent = text;
  $('gifts').append(el);
  setTimeout(() => el.remove(), 2700);
}
