// Admin page: game controls, connection status and the simulator.
import { connect } from '/shared/socket.js';

const $ = (id) => document.getElementById(id);
const name = () => $('simName').value.trim() || 'Tester';

const socket = connect('admin', {
  onOpen: () => setStatus({ state: 'connected', source: 'server', detail: 'Server connected' }),
  onClose: () => setStatus({ state: 'offline', detail: 'Server not running, reconnecting…' }),
  onMessage(msg) {
    if (msg.type === 'status') {
      setStatus(msg.status);
      $('botsToggle').checked = msg.simulator?.bots ?? false;
      $('stressToggle').checked = msg.simulator?.stress ?? false;
    }
    if (msg.type === 'events') logEvents(msg);
    if (msg.type === 'state') { renderState(msg.state); renderLikes(msg.likes); }
  },
});

const STATE_TEXT = { connected: 'Connected', waiting: 'Not live', error: 'Error', offline: 'Offline' };
function setStatus(s) {
  $('status').className = `status ${s.state}`;
  const label = STATE_TEXT[s.state] ?? s.state;
  $('statusText').textContent = `${s.source ? s.source + ': ' : ''}${label}${s.detail ? ' · ' + s.detail : ''}`;
}

$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('simText').value;
  if (!text.trim()) return;
  socket.send({ cmd: 'sim.chat', name: name(), text });
  $('simText').value = '';
  $('simText').focus();
});
document.querySelectorAll('[data-like]').forEach((b) =>
  b.addEventListener('click', () => socket.send({ cmd: 'sim.like', name: name(), count: Number(b.dataset.like) })));
$('giftBtn').addEventListener('click', () => socket.send({ cmd: 'sim.gift', name: name(), gift: $('giftName').value, count: Number($('giftCount').value) }));
$('followBtn').addEventListener('click', () => socket.send({ cmd: 'sim.follow', name: name() }));
$('botsToggle').addEventListener('change', (e) => socket.send({ cmd: 'sim.bots', on: e.target.checked }));
$('stressToggle').addEventListener('change', (e) => socket.send({ cmd: 'sim.stress', on: e.target.checked }));
document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.cmd === 'game.resetPoints' && !confirm('Reset all points?')) return;
  socket.send({ cmd: b.dataset.cmd });
}));

// Event log, plus events per second so the stress test is easy to read.
let count = 0;
setInterval(() => { $('rate').textContent = `${count} events/s`; count = 0; }, 1000);

function logEvents({ events, total }) {
  count += total;
  const log = $('log');
  const time = new Date().toLocaleTimeString('en-GB');
  for (const e of events.slice(-15)) {
    const li = document.createElement('li');
    const what = e.type === 'chat' ? `💬 ${e.text}`
      : e.type === 'like' ? `❤️ ×${e.likeCount}`
      : e.type === 'gift' ? `🎁 ${e.gift.count}× ${e.gift.name} (${e.gift.diamonds} 💎)`
      : e.type;
    li.innerHTML = `<span class="t">${time}</span>`;
    li.append(`${e.user.name}: ${what}`);
    log.prepend(li);
  }
  while (log.children.length > 100) log.lastChild.remove();
}

// Game state panel. The admin page also sees the correct answer.
function renderState(st) {
  $('phase').textContent = st.paused ? `${st.phase} (paused)` : st.phase;
  $('round').textContent = st.roundNumber || '–';
  $('game').textContent = st.game?.name ?? '–';
  $('difficulty').textContent = st.difficulty ?? '–';
  $('questionText').textContent = st.question?.display ?? '–';
  $('answer').textContent = st.correctAnswer ?? st.result?.correctAnswer ?? '–';
  $('answers').textContent = st.answerCount != null ? `${st.correctCount} correct / ${st.answerCount}` : '–';
  $('startBtn').textContent = st.paused ? 'Resume' : 'Start';
  $('startBtn').disabled = st.phase !== 'idle' && !st.paused;
  $('pauseBtn').textContent = st.paused ? 'Resume' : 'Pause';
  $('pauseBtn').disabled = st.phase === 'idle';
  if (st.vote) $('answers').textContent = st.vote.options.map((o) => `${o.number}. ${o.name}: ${o.votes}`).join(' · ');
  $('players').textContent = st.players ? `${st.players} players` : '';
  const rows = st.leaderboard ?? [];
  $('board').replaceChildren(...(rows.length ? rows : [null]).map((r) => {
    const li = document.createElement('li');
    if (!r) { li.className = 'muted'; li.textContent = 'No points yet'; return li; }
    li.textContent = r.name + (r.streak >= 2 ? ` 🔥${r.streak}` : '');
    const pts = document.createElement('span');
    pts.textContent = r.points.toLocaleString('en');
    li.append(pts);
    return li;
  }));
}

function renderLikes(likes) {
  if (!likes) return;
  $('likes').textContent = `${likes.meter.toLocaleString('en')} / ${likes.goal.toLocaleString('en')} (total ${likes.total.toLocaleString('en')})`;
  $('doubles').textContent = likes.pendingDoubles;
}
