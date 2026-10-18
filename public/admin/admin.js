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
$('giftBtn').addEventListener('click', () => socket.send({ cmd: 'sim.gift', name: name(), gift: $('giftName').value }));
$('followBtn').addEventListener('click', () => socket.send({ cmd: 'sim.follow', name: name() }));
$('botsToggle').addEventListener('change', (e) => socket.send({ cmd: 'sim.bots', on: e.target.checked }));
$('stressToggle').addEventListener('change', (e) => socket.send({ cmd: 'sim.stress', on: e.target.checked }));
document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => socket.send({ cmd: b.dataset.cmd })));

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
