// REDACTED game server: serves the client and runs multiplayer over WebSocket (/ws).
// Start:  npm start      (PORT env var, default 3000)
// Tuning: MAX_PLAYERS (default 200), MAX_PER_MATCH (default 64), ROUND_SECONDS (default: 6 min FFA, 8 min teams)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameServer } from './client/shared/core.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client');
const PORT = Number(process.env.PORT) || 3000;
const guns = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'guns.json'), 'utf8'));

// ------------------------------------------------------------------ admin password
// Checked only here on the server (this file is never sent to browsers). Set ADMIN_PASSWORD on your host
// to change it; the built-in default is the one the game was made with.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Divan is soo cool';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const adminTries = new Map(); // ip -> { n, since }
function adminCheck(pw, conn) {
  const now = Date.now(), ip = conn.ip || '?';
  const t = adminTries.get(ip) || { n: 0, since: now };
  if (now - t.since > 10 * 60 * 1000) { t.n = 0; t.since = now; }
  t.n++;
  adminTries.set(ip, t);
  if (t.n > 15) return false; // max 15 tries per address per 10 minutes
  const ok = crypto.timingSafeEqual(sha(pw), sha(ADMIN_PASSWORD));
  if (ok) console.log(`[admin] unlocked from ${ip}`);
  return ok;
}

const game = new GameServer({
  guns,
  adminCheck,
  maxPlayers: Number(process.env.MAX_PLAYERS) || 200,
  maxPerMatch: Number(process.env.MAX_PER_MATCH) || 64,
  roundSeconds: Number(process.env.ROUND_SECONDS) || 0,
});

// ------------------------------------------------------------------ static files (gzip + cache)
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.wasm': 'application/wasm',
};
const cache = new Map();

function load(file) {
  const st = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const raw = fs.readFileSync(file);
  const ext = path.extname(file);
  const gz = ['.html', '.js', '.css', '.json', '.glb', '.svg'].includes(ext) ? zlib.gzipSync(raw, { level: 9 }) : null;
  const entry = { raw, gz, mtime: st.mtimeMs, type: TYPES[ext] || 'application/octet-stream' };
  cache.set(file, entry);
  return entry;
}

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok ' + game.clients.size); }
  if (url.endsWith('/')) url += 'index.html';
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  const f = load(file);
  const headers = { 'content-type': f.type, 'cache-control': url.startsWith('/vendor/') || url.startsWith('/fonts/') ? 'public, max-age=604800' : 'no-cache' };
  if (f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    headers['content-encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(f.gz);
  } else {
    res.writeHead(200, headers);
    res.end(f.raw);
  }
});

// ------------------------------------------------------------------ websocket
const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false, maxPayload: 8 * 1024 });

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const client = game.connect({
    ip,
    send: (o) => { if (ws.readyState === 1 && ws.bufferedAmount < 512 * 1024) ws.send(JSON.stringify(o)); },
  });
  if (!client) return ws.close(1013, 'server full');
  let budget = 90, last = Date.now();
  ws.on('message', (data) => {
    const now = Date.now();
    budget = Math.min(90, budget + (now - last) * 0.09); // ~90 messages / second
    last = now;
    if (budget < 1) return;
    budget--;
    let m;
    try { m = JSON.parse(data); } catch { return; }
    try { game.message(client, m); } catch (e) { console.error('message error', e); }
  });
  ws.on('close', () => game.disconnect(client));
  ws.on('error', () => {});
});

// ------------------------------------------------------------------ game loop (20 Hz)
let prev = performance.now();
let tickSum = 0, tickMax = 0, ticks = 0;
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.25, (now - prev) / 1000);
  prev = now;
  try { game.tick(dt); } catch (e) { console.error('tick error', e); }
  const took = performance.now() - now;
  tickSum += took; ticks++; tickMax = Math.max(tickMax, took);
}, 50);

// status line every 30 s (players online, matches, how long each 50 ms game tick takes)
setInterval(() => {
  if (game.clients.size) {
    console.log(`[status] ${game.clients.size} players, ${game.matches.size} matches, tick avg ${(tickSum / ticks).toFixed(1)} ms, max ${tickMax.toFixed(1)} ms`);
  }
  tickSum = 0; tickMax = 0; ticks = 0;
}, Number(process.env.STATUS_SECONDS || 30) * 1000);

server.listen(PORT, () => {
  console.log(`REDACTED server running on http://localhost:${PORT}  (max ${game.maxPlayers} players, ${game.maxPerMatch} per match)`);
});
