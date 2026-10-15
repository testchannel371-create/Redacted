// Checks the [BOTS] option: a 200-bot private match stays fast, and bots-off players never join it.
// Run: node tools/bots-test.mjs
import fs from 'node:fs';
import { GameServer } from '../client/shared/core.js';

const guns = JSON.parse(fs.readFileSync(new URL('../client/shared/guns.json', import.meta.url)));
const gs = new GameServer({ guns });
const inbox = [];
const a = gs.connect({ send: (o) => inbox.push(o) });
gs.message(a, { t: 'play', mode: 'ffa', bots: { on: true, count: 200 } });
const st = inbox.find((m) => m.t === 'start');
console.log('200-bot match players:', st.players.length, '| start message', (JSON.stringify(st).length / 1024).toFixed(0), 'KB');

let worst = 0, sum = 0, kills = 0;
for (let i = 0; i < 20 * 60; i++) {
  const t0 = performance.now();
  gs.tick(0.05);
  const dt = performance.now() - t0;
  sum += dt; worst = Math.max(worst, dt);
  for (const m of inbox.splice(0)) if (m.t === 'kill') kills++;
}
console.log(`60 s with 200 bots: tick avg ${(sum / 1200).toFixed(2)} ms, worst ${worst.toFixed(1)} ms (budget 50 ms), kills ${kills}`);

const b = gs.connect({ send: () => {} });
gs.message(b, { t: 'play', mode: 'ffa', bots: { on: false, count: 5 } });
console.log('bots-off player put in the private bot match?', b.match === a.match,
  '| bots in its match:', [...b.match.players.values()].filter((p) => !p.client).length);
