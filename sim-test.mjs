// Headless check of the game core: parties, matchmaking, bots fighting, round end + map rotation, coins.
// Run: node tools/sim-test.mjs
import fs from 'node:fs';
import { GameServer, coinsFor } from '../client/shared/core.js';
import { MAPS, mapData } from '../client/shared/maps.js';

const guns = JSON.parse(fs.readFileSync(new URL('../client/shared/guns.json', import.meta.url)));
for (const m of MAPS) {
  const d = mapData(m.id);
  console.log(`map ${m.name}: ${m.boxes.length} boxes, ${d.solids.length} solid, ${d.spawns.length} spawns, walkable ${d.nav.walk.reduce((a, b) => a + b, 0)}/${d.nav.walk.length}`);
}
console.log('coins:', [2, 10, 11, 15, 16, 20, 21, 64].map(n => `${n}p=${coinsFor(n)}`).join(' '));

const gs = new GameServer({ guns });
const inbox = { a: [], b: [] };
const a = gs.connect({ send: (o) => inbox.a.push(o) });
const b = gs.connect({ send: (o) => inbox.b.push(o) });
gs.message(a, { t: 'hello', name: 'Divan', gun: 4 });
gs.message(b, { t: 'hello', name: 'Friend', gun: 2 });
gs.message(a, { t: 'party_create' });
const code = inbox.a.find(m => m.t === 'party').party.code;
gs.message(b, { t: 'party_join', code });
console.log('party', code, 'members', inbox.b.filter(m => m.t === 'party').at(-1).party.members.map(m => m.name));
gs.message(b, { t: 'play', mode: 'tdm' });
console.log('non-leader play ->', inbox.b.at(-1));
gs.message(a, { t: 'play', mode: 'tdm', bots: { on: true, count: 10 } });
const sa = inbox.a.find(m => m.t === 'start'), sb = inbox.b.find(m => m.t === 'start');
console.log('start map', MAPS[sa.map].name, 'teams a/b', sa.team, sb.team, 'players', sa.players.length);

// make both humans stand still far away so bots decide the match; fast-forward
let kills = 0, ends = [], starts = 0;
for (let i = 0; i < 20 * 60 * 20; i++) {
  gs.tick(0.05);
  if (i % 4 === 0) for (const c of [a, b]) gs.message(c, { t: 'in', x: c.match ? [...c.match.players.values()].find(p => p.id === c.id).x : 0, y: 0, z: 0, yaw: 0, pitch: 0, f: 0 });
  for (const m of inbox.a.splice(0)) {
    if (m.t === 'kill') kills++;
    if (m.t === 'end') ends.push(m);
    if (m.t === 'start') starts++;
  }
  inbox.b.length = 0;
  if (ends.length >= 2) break;
}
console.log('kills seen', kills, 'rounds ended', ends.length, 'new rounds started', starts);
for (const e of ends) console.log(' winner', e.winner, 'won', e.won, 'coins', e.coins, 'players', e.players, 'top', e.board.slice(0, 3).map(p => `${p.name}:${p.k}`).join(', '));
