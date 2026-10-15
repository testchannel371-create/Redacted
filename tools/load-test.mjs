// Load test: connects N fake players that join matches, run around and shoot.
// Usage: node tools/load-test.mjs [players=200] [url=ws://localhost:3000/ws] [seconds=40]
import WebSocket from 'ws';

const N = Number(process.argv[2] || 200);
const URL = process.argv[3] || 'ws://localhost:3000/ws';
const SECS = Number(process.argv[4] || 40);
const modes = ['ffa', 'tdm', 'four'];
let open = 0, starts = 0, bytes = 0, msgs = 0, closed = 0;
const socks = [];

for (let i = 0; i < N; i++) {
  setTimeout(() => {
    const ws = new WebSocket(URL);
    const me = { x: 0, z: 0, yaw: 0, alive: false };
    ws.on('open', () => {
      open++;
      ws.send(JSON.stringify({ t: 'hello', name: 'Load' + i, gun: i % 10 }));
      ws.send(JSON.stringify({ t: 'play', mode: modes[i % 3], bots: { on: false, count: 1 } }));
    });
    ws.on('message', (d) => {
      bytes += d.length; msgs++;
      const m = JSON.parse(d);
      if (m.t === 'start') starts++;
      if (m.t === 'spawn' || m.t === 'pos') { me.x = m.x; me.z = m.z; me.alive = true; }
    });
    ws.on('close', () => { closed++; });
    ws.on('error', () => {});
    socks.push({ ws, me });
  }, i * 4);
}

const timer = setInterval(() => {
  for (const { ws, me } of socks) {
    if (ws.readyState !== 1 || !me.alive) continue;
    me.yaw += (Math.random() - 0.5) * 0.4;
    me.x += -Math.sin(me.yaw) * 0.25; me.z += -Math.cos(me.yaw) * 0.25;
    ws.send(JSON.stringify({ t: 'in', x: me.x, y: 0, z: me.z, yaw: me.yaw, pitch: 0, f: 4 }));
    if (Math.random() < 0.1) ws.send(JSON.stringify({ t: 'sh', d: [-Math.sin(me.yaw), 0, -Math.cos(me.yaw)], l: 30, h: [] }));
  }
}, 50);

let t = 0;
const rep = setInterval(() => {
  t += 5;
  console.log(`${t}s: connected ${open}/${N}, in matches ${starts}, closed ${closed}, recv ${(bytes / 5 / 1024 / 1024).toFixed(1)} MB/s (${Math.round(msgs / 5)} msg/s) total`);
  bytes = 0; msgs = 0;
  if (t >= SECS) { clearInterval(rep); clearInterval(timer); for (const { ws } of socks) ws.close(); setTimeout(() => process.exit(0), 500); }
}, 5000);
