// Entry point: `npm start`.
// Serves the overlay (game screen) and admin page, and talks to both over WebSocket.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { loadConfig, ROOT } from './config.js';
import { Hub } from './hub.js';
import { Simulator } from './connection/simulator.js';

const config = loadConfig();
const hub = new Hub();
const simulator = new Simulator(hub);

const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};
const ROUTES = { '/': '/overlay/index.html', '/overlay': '/overlay/index.html', '/admin': '/admin/index.html' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = ROUTES[url.pathname.replace(/\/$/, '') || '/'] ?? url.pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

// --- WebSocket ---------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = { overlay: new Set(), admin: new Set() };

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(role, msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients[role]) if (ws.readyState === ws.OPEN) ws.send(data);
}
const broadcastAll = (msg) => { broadcast('overlay', msg); broadcast('admin', msg); };

wss.on('connection', (ws, req) => {
  const role = new URL(req.url, 'http://localhost').searchParams.get('role') === 'admin' ? 'admin' : 'overlay';
  clients[role].add(ws);
  send(ws, { type: 'hello', role, config: publicConfig() });
  send(ws, { type: 'status', status: hub.connectionStatus, simulator: simulator.status() });

  ws.on('message', (raw) => {
    if (role !== 'admin') return; // only the admin page may control the game
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handleAdmin(msg);
  });
  ws.on('close', () => clients[role].delete(ws));
});

function publicConfig() {
  return { screen: config.screen, round: config.round, gameTypes: config.gameTypes, sound: config.sound, likes: config.likes };
}

function handleAdmin(msg) {
  const name = String(msg.name || 'Tester').slice(0, 40);
  switch (msg.cmd) {
    case 'sim.chat': simulator.chat(name, String(msg.text ?? '').slice(0, 200)); break;
    case 'sim.like': simulator.like(name, Number(msg.count) || 1); break;
    case 'sim.gift': simulator.gift(name, msg.gift, Number(msg.count) || 1); break;
    case 'sim.follow': simulator.follow(name); break;
    case 'sim.bots': simulator.setBots(msg.on); break;
    case 'sim.stress': simulator.setStress(msg.on); break;
    default: hub.emit('admin', msg); // game commands are handled by the engine
  }
  broadcast('admin', { type: 'status', status: hub.connectionStatus, simulator: simulator.status() });
}

// --- Events -> pages -----------------------------------------------------------
// Chat can arrive at 50+ per second, so events are batched every 100 ms
// instead of sending one WebSocket message per comment.
let pending = [];
hub.on('event', (e) => pending.push(e));
setInterval(() => {
  if (!pending.length) return;
  const batch = pending.slice(-60).map(({ type, user, text, likeCount, gift }) => ({ type, user: { name: user.name }, text, likeCount, gift }));
  const total = pending.length;
  pending = [];
  broadcastAll({ type: 'events', events: batch, total });
}, 100);

hub.on('status', (status) => broadcastAll({ type: 'status', status, simulator: simulator.status() }));

simulator.start();

server.listen(config.port, () => {
  const base = `http://localhost:${config.port}`;
  console.log('\n  TikTok LIVE game is running\n');
  console.log(`  Game screen (overlay): ${base}/`);
  console.log(`  Admin + simulator:     ${base}/admin\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { simulator.stop(); server.close(); process.exit(0); });
}

export { hub, simulator, broadcastAll };
