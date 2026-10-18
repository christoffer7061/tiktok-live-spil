// Game screen shown in TikTok LIVE Studio / OBS.
import { connect } from '/shared/socket.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');

// Scale the fixed 1080x1920 stage to fit the window.
function fit() {
  const s = Math.min(innerWidth / 1080, innerHeight / 1920);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit);
fit();

let likes = 0;
let likeGoal = 1000;
const MAX_ROWS = 10;

connect('overlay', {
  onOpen: () => $('offline').classList.remove('show'),
  onClose: () => $('offline').classList.add('show'),
  onMessage(msg) {
    if (msg.type === 'hello') likeGoal = msg.config?.likes?.meterGoal ?? likeGoal;
    if (msg.type === 'events') msg.events.forEach(handleEvent);
  },
});

function handleEvent(e) {
  if (e.type === 'chat') addRow(e.user.name, e.text);
  if (e.type === 'like') {
    likes += e.likeCount;
    $('likeCount').textContent = likes.toLocaleString('en');
    $('likeFill').style.width = `${Math.min(100, ((likes % likeGoal) / likeGoal) * 100)}%`;
  }
  if (e.type === 'gift') showGift(`🎁 ${e.user.name} sent ${e.gift.count > 1 ? e.gift.count + '× ' : ''}${e.gift.name}`);
  if (e.type === 'follow') showGift(`➕ ${e.user.name} followed`);
}

function addRow(name, text) {
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
