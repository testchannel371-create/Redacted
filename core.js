// Authoritative game logic: lobby, parties, matchmaking, matches, hit validation, scoring, bots.
// Runs on the Node server (server.js) and, unchanged, inside the browser for offline play.
// Transport-agnostic: each connection is an object with send(obj).
import { MAPS, mapData, raycastMap, HITBOX } from './maps.js';

export const MODES = {
  ffa:  { id: 'ffa',  name: 'FREE FOR ALL', teams: 0, limit: 25, time: 360 },
  tdm:  { id: 'tdm',  name: 'TWO TEAMS',    teams: 2, limit: 60, time: 480 },
  four: { id: 'four', name: 'FOUR TEAMS',   teams: 4, limit: 40, time: 480 },
};
export const TEAMS = [
  { name: 'RAVEN', color: '#4aa8ff' },
  { name: 'WOLF',  color: '#ff5a48' },
  { name: 'VIPER', color: '#5fd16a' },
  { name: 'JACKAL', color: '#ffc845' },
];
// 50 coins for a win; above 10 players +50 for every (started) group of 5 extra players.
export function coinsFor(n) { return 50 + 50 * Math.max(0, Math.ceil((n - 10) / 5)); }

export const EYE = 1.6, EYE_CROUCH = 1.15;
export const F_ALIVE = 1, F_CROUCH = 2, F_MOVE = 4, F_SPRINT = 8, F_ADS = 16, F_RELOAD = 32, F_AIR = 64;

const RESPAWN = 4, REGEN_DELAY = 4, REGEN_RATE = 35;
const BOT_GUNS = [0, 2, 3, 4, 5, 7, 9, 12, 17, 21];
const BOT_NAMES = ['Mason', 'Woods', 'Hudson', 'Bowman', 'Reznov', 'Weaver', 'Crosby', 'Harper', 'Salazar', 'Nikolai',
  'Dragovich', 'Kravchenko', 'Steiner', 'Adler', 'Sims', 'Lazar', 'Park', 'Bell', 'Stitch', 'Vargas', 'Hollow', 'Grim',
  'Ghost', 'Viking', 'Echo', 'Sierra', 'Tango', 'Nomad', 'Rook', 'Bishop', 'Kilo', 'Zulu'];
const COLOR = /^#[0-9a-fA-F]{6}$/;
const SKIN_ENUMS = {
  head: ['none', 'helmet', 'cap', 'beanie', 'boonie', 'beret', 'headset'],
  face: ['none', 'goggles', 'gasmask', 'bandana', 'balaclava', 'paint'],
  vest: ['none', 'plate', 'jacket', 'hoodie', 'bandolier'],
  back: ['none', 'pack', 'radio'],
};
export const DEFAULT_SKIN = {
  skin: '#c68a63', shirt: '#3d4a35', pants: '#3b3f33', gear: '#2b2e26', hat: '#3a3d33',
  head: 'helmet', face: 'none', vest: 'plate', back: 'none', knees: true, gloves: false, rig: true,
};

export function cleanSkin(s) {
  const o = { ...DEFAULT_SKIN };
  if (!s || typeof s !== 'object') return o;
  for (const k of ['skin', 'shirt', 'pants', 'gear', 'hat']) if (COLOR.test(s[k])) o[k] = s[k];
  for (const k in SKIN_ENUMS) if (SKIN_ENUMS[k].includes(s[k])) o[k] = s[k];
  for (const k of ['knees', 'gloves', 'rig']) if (typeof s[k] === 'boolean') o[k] = s[k];
  return o;
}
export const SKIN_OPTIONS = SKIN_ENUMS;

export const MAX_BOTS = 200;
export function cleanBots(b) {
  const count = b && b.count != null ? Math.round(Number(b.count)) : NaN;
  return {
    on: b && typeof b.on === 'boolean' ? b.on : true,
    count: Number.isFinite(count) ? Math.max(1, Math.min(MAX_BOTS, count)) : 8,
  };
}

function cleanName(n) {
  n = String(n ?? '').replace(/[^\w .\-]/g, '').trim().slice(0, 16);
  return n || 'Operator';
}
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100);
const r3 = (v) => Math.round(v * 1000);

export class GameServer {
  constructor({ guns, maxPlayers = 200, maxPerMatch = 64, roundSeconds = 0, adminCheck = () => false, log = () => {} }) {
    this.guns = guns;
    this.adminCheck = adminCheck; // (password, conn) => boolean | Promise<boolean>; the password itself never lives here
    this.roundSeconds = roundSeconds; // 0 = use each mode's default length
    this.maxPlayers = maxPlayers;
    this.maxPerMatch = maxPerMatch;
    this.log = log;
    this.clients = new Map();
    this.parties = new Map();
    this.matches = new Set();
    this.nextId = 1;
    this.nextMatch = 1;
    this.time = 0;
    this.statusT = 0;
  }

  connect(conn) {
    if (this.clients.size >= this.maxPlayers) { conn.send({ t: 'full', max: this.maxPlayers }); return null; }
    const c = { id: this.nextId++, conn, name: 'Operator', gun: 0, skin: cleanSkin(), bots: cleanBots(), party: null, match: null };
    this.clients.set(c.id, c);
    conn.send({ t: 'welcome', id: c.id, online: this.clients.size, max: this.maxPlayers, perMatch: this.maxPerMatch });
    return c;
  }

  disconnect(c) {
    if (!c) return;
    this.partyLeave(c, true);
    if (c.match) c.match.remove(c.id);
    this.clients.delete(c.id);
  }

  send(c, o) { try { c.conn.send(o); } catch { /* socket gone */ } }
  validGun(g) { return Number.isInteger(g) && g >= 0 && g < this.guns.length ? g : 0; }

  message(c, m) {
    if (!c || !m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello':
        c.name = cleanName(m.name); c.gun = this.validGun(m.gun); c.skin = cleanSkin(m.skin);
        if (c.party) this.partyBroadcast(this.parties.get(c.party));
        break;
      case 'loadout':
        c.gun = this.validGun(m.gun); c.skin = cleanSkin(m.skin);
        if (c.match) c.match.loadout(c);
        break;
      case 'party_create': this.partyCreate(c); break;
      case 'party_join': this.partyJoin(c, String(m.code ?? '')); break;
      case 'party_leave': this.partyLeave(c); break;
      case 'bots':
        c.bots = cleanBots(m);
        if (c.party) { const p = this.parties.get(c.party); if (p && p.leader === c.id) this.partyBroadcast(p); }
        break;
      case 'play':
        if (m.bots) c.bots = cleanBots(m.bots);
        this.play(c, m.mode);
        break;
      case 'leave': if (c.match) { c.match.remove(c.id); c.match = null; } break;
      case 'in': if (c.match) c.match.input(c, m); break;
      case 'sh': if (c.match) c.match.shoot(c, m); break;
      case 'ping': this.send(c, { t: 'pong', s: m.s }); break;
      case 'admin': this.adminLogin(c, m.pw); break;
      case 'admin_off': c.admin = false; break;
    }
  }

  // Admin login: limited tries per connection, checked by the host (server.js / offline hash).
  adminLogin(c, pw) {
    c.adminTries = (c.adminTries || 0) + 1;
    if (c.adminTries > 8 || this.time - (c.adminLast ?? -99) < 1.5) {
      c.adminLast = this.time;
      return this.send(c, { t: 'admin', ok: false, msg: 'Too many tries. Wait a bit and reload.' });
    }
    c.adminLast = this.time;
    Promise.resolve()
      .then(() => this.adminCheck(String(pw ?? '').slice(0, 100), c.conn))
      .then((ok) => { c.admin = !!ok; this.send(c, { t: 'admin', ok: !!ok, msg: ok ? '' : 'Wrong password' }); })
      .catch(() => this.send(c, { t: 'admin', ok: false, msg: 'Could not check the password' }));
  }

  // ---------------------------------------------------------------- parties
  partyCreate(c) {
    this.partyLeave(c, true);
    let code;
    do code = String(10000 + Math.floor(Math.random() * 90000)); while (this.parties.has(code));
    const p = { code, leader: c.id, members: [c.id] };
    this.parties.set(code, p);
    c.party = code;
    this.partyBroadcast(p);
  }

  partyJoin(c, code) {
    const p = this.parties.get(code);
    if (!p) return this.send(c, { t: 'party_err', msg: 'No party with code ' + code.replace(/\D/g, '').slice(0, 5) });
    if (p.members.includes(c.id)) return this.partyBroadcast(p);
    if (p.members.length >= 10) return this.send(c, { t: 'party_err', msg: 'That party is full (10 max)' });
    this.partyLeave(c, true);
    p.members.push(c.id);
    c.party = code;
    this.partyBroadcast(p);
  }

  partyLeave(c, silent) {
    const p = c.party && this.parties.get(c.party);
    c.party = null;
    if (!p) return;
    p.members = p.members.filter(id => id !== c.id);
    if (!p.members.length) this.parties.delete(p.code);
    else {
      if (p.leader === c.id) p.leader = p.members[0];
      this.partyBroadcast(p);
    }
    if (!silent) this.send(c, { t: 'party', party: null });
  }

  partyBroadcast(p) {
    if (!p) return;
    const members = p.members.map(id => this.clients.get(id)).filter(Boolean)
      .map(m => ({ id: m.id, name: m.name, inMatch: !!m.match }));
    const leader = this.clients.get(p.leader);
    const bots = leader ? leader.bots : cleanBots();
    for (const id of p.members) {
      const m = this.clients.get(id);
      if (m) this.send(m, { t: 'party', party: { code: p.code, leader: p.leader, members, bots } });
    }
  }

  // ---------------------------------------------------------------- matchmaking
  // Bots ON  -> the party gets its own private match with exactly that many bots.
  // Bots OFF -> public matchmaking with real players only.
  play(c, mode) {
    if (!MODES[mode]) return;
    let group = [c];
    if (c.party) {
      const p = this.parties.get(c.party);
      if (p && p.leader !== c.id) return this.send(c, { t: 'party_err', msg: 'Only the party leader can start a match' });
      if (p) group = p.members.map(id => this.clients.get(id)).filter(Boolean);
    }
    for (const g of group) if (g.match) { g.match.remove(g.id); g.match = null; }
    const botCount = c.bots.on ? c.bots.count : 0;
    let best = null;
    if (!botCount) {
      for (const m of this.matches) {
        if (m.mode.id !== mode || m.dead || m.priv) continue;
        if (m.humans() + group.length > this.maxPerMatch) continue;
        if (!best || m.humans() > best.humans()) best = m;
      }
    }
    if (!best) { best = new Match(this, mode, botCount); this.matches.add(best); }
    best.addGroup(group);
    if (c.party) this.partyBroadcast(this.parties.get(c.party));
  }

  tick(dt) {
    this.time += dt;
    for (const m of this.matches) {
      if (m.dead) { this.matches.delete(m); continue; }
      m.tick(dt);
    }
    this.statusT -= dt;
    if (this.statusT <= 0) {
      this.statusT = 5;
      const msg = { t: 'online', n: this.clients.size };
      for (const c of this.clients.values()) if (!c.match) this.send(c, msg);
    }
  }
}

// ==================================================================== Match
class Match {
  constructor(server, mode, botCount = 0) {
    this.s = server;
    this.mode = MODES[mode];
    this.priv = botCount > 0;   // private party match (no strangers)
    this.botCount = botCount;
    this.botSeq = 0;
    this.id = server.nextMatch++;
    this.players = new Map();
    this.round = 0;
    this.mapId = Math.floor(Math.random() * MAPS.length);
    this.dead = false;
    this.scoreT = 0;
    this.botNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    this.startRound(true);
  }

  get now() { return this.s.time; }
  humans() { let n = 0; for (const p of this.players.values()) if (p.client) n++; return n; }
  enemy(a, b) { return a !== b && (this.mode.teams === 0 || a.team !== b.team); }
  info(p) { return { id: p.id, name: p.name, team: p.team, gun: p.gun, skin: p.skin, bot: !p.client, k: p.kills, d: p.deaths }; }
  sendAll(o) { for (const p of this.players.values()) if (p.client) this.s.send(p.client, o); }
  sendNear(o, x, z, r) {
    const r2 = r * r;
    for (const p of this.players.values()) {
      if (!p.client) continue;
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < r2) this.s.send(p.client, o);
    }
  }

  scoreList() {
    if (this.mode.teams) return this.scores.slice();
    return [...this.players.values()].sort((a, b) => b.kills - a.kills).slice(0, 3).map(p => [p.id, p.kills]);
  }

  startMsg(p) {
    return {
      t: 'start', mode: this.mode.id, map: this.mapId, round: this.round, time: Math.round(this.timeLeft),
      limit: this.mode.limit, you: p.id, team: p.team, players: [...this.players.values()].map(q => this.info(q)),
      scores: this.scoreList(),
    };
  }

  startRound(first) {
    if (!first) {
      let n;
      do n = Math.floor(Math.random() * MAPS.length); while (n === this.mapId && MAPS.length > 1);
      this.mapId = n;
    }
    this.md = mapData(this.mapId);
    this.round++;
    this.state = 'playing';
    this.timeLeft = this.s.roundSeconds || this.mode.time;
    this.scores = this.mode.teams ? new Array(this.mode.teams).fill(0) : null;
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0;
      if (p.pendingGun != null) { p.gun = p.pendingGun; p.pendingGun = null; }
      this.spawn(p, true);
    }
    for (const p of this.players.values()) if (p.client) this.s.send(p.client, this.startMsg(p));
  }

  teamCounts() {
    const n = new Array(this.mode.teams).fill(0);
    for (const p of this.players.values()) if (p.team >= 0) n[p.team]++;
    return n;
  }

  smallestTeam() {
    const n = this.teamCounts();
    let t = 0;
    for (let i = 1; i < n.length; i++) if (n[i] < n[t]) t = i;
    return t;
  }

  newPlayer(id, name, team, gun, skin, client) {
    return {
      id, name, team, gun, skin, client, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, f: 0, hp: 100, alive: false,
      respawn: 0, kills: 0, deaths: 0, lastShot: -9, lastHit: -9, lastIn: this.now, pendingGun: null, bot: null,
    };
  }

  addGroup(clients) {
    // Bots are added first, then the whole party goes on the smallest team.
    this.balanceBots();
    const team = this.mode.teams ? this.smallestTeam() : -1;
    const added = [];
    for (const c of clients) {
      const p = this.newPlayer(c.id, c.name, team, c.gun, c.skin, c);
      c.match = this;
      this.players.set(p.id, p);
      added.push(p);
    }
    this.balanceBots();
    for (const p of added) {
      if (this.state === 'playing') this.spawn(p, false);
      this.s.send(p.client, this.startMsg(p));
    }
    for (const p of added) this.broadcastExcept({ t: 'pj', p: this.info(p) }, added);
  }

  broadcastExcept(o, skip) {
    for (const p of this.players.values()) if (p.client && !skip.includes(p)) this.s.send(p.client, o);
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (p.client && p.client.match === this) p.client.match = null;
    this.sendAll({ t: 'pl', id });
    if (this.humans() === 0) { this.dead = true; return; }
    this.balanceBots();
  }

  balanceBots() {
    const want = this.botCount; // set by the party's [BOTS] option (0 for public matches)
    const bots = [...this.players.values()].filter(p => !p.client);
    while (bots.length > want) {
      // remove from the largest team
      let pick = bots[0];
      if (this.mode.teams) {
        const n = this.teamCounts();
        pick = bots.reduce((a, b) => (n[b.team] > n[a.team] ? b : a), bots[0]);
      }
      bots.splice(bots.indexOf(pick), 1);
      this.players.delete(pick.id);
      this.sendAll({ t: 'pl', id: pick.id });
    }
    while (bots.length < want) {
      const id = this.s.nextId++;
      const n = this.botSeq++, L = this.botNames.length;
      const name = this.botNames[n % L] + (n >= L ? ' ' + (Math.floor(n / L) + 1) : '') + ' [BOT]';
      const team = this.mode.teams ? this.smallestTeam() : -1;
      const skin = randomSkin();
      const p = this.newPlayer(id, name, team, BOT_GUNS[Math.floor(Math.random() * BOT_GUNS.length)], skin, null);
      p.bot = { path: [], think: 0, target: null, react: 0, strafe: 1, strafeT: 0, burst: 0, pause: 0, stuckT: 0, lx: 0, lz: 0, repath: 0 };
      this.players.set(id, p);
      bots.push(p);
      if (this.state === 'playing') this.spawn(p, false);
      this.sendAll({ t: 'pj', p: this.info(p) });
    }
  }

  loadout(c) {
    const p = this.players.get(c.id);
    if (!p) return;
    p.skin = c.skin;
    if (p.alive) p.pendingGun = c.gun; else p.gun = c.gun;
    this.sendAll({ t: 'pi', p: this.info(p) });
  }

  // ---------------------------------------------------------------- spawning
  spawn(p, roundStart) {
    const sp = this.md.spawns;
    let cands = sp;
    if (roundStart && this.mode.teams && p.team >= 0) {
      const T = this.mode.teams;
      const off = this.mapId * 0.7;
      cands = sp.filter(s => {
        const a = (Math.atan2(s.z, s.x) + Math.PI * 3 + off) % (Math.PI * 2);
        return Math.floor(a / (Math.PI * 2 / T)) === p.team && Math.hypot(s.x, s.z) > this.md.map.half * 0.35;
      });
      if (!cands.length) cands = sp;
    }
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 14; i++) {
      const s = cands[Math.floor(Math.random() * cands.length)];
      let minE = 60, minT = 99;
      for (const q of this.players.values()) {
        if (!q.alive || q === p) continue;
        const d = Math.hypot(q.x - s.x, q.z - s.z);
        if (this.enemy(p, q)) minE = Math.min(minE, d); else minT = Math.min(minT, d);
      }
      // far from enemies, near (but never on top of) teammates
      const score = minE + (this.mode.teams && minT < 18 ? 8 : 0) - (Math.min(minE, minT) < 3 ? 60 : 0) + Math.random() * 4;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    p.x = best.x; p.y = 0; p.z = best.z;
    p.yaw = Math.atan2(p.x, p.z); // face the map centre
    p.pitch = 0;
    p.hp = 100; p.alive = true; p.f = F_ALIVE; p.lastIn = this.now;
    if (p.pendingGun != null) { p.gun = p.pendingGun; p.pendingGun = null; }
    if (p.bot) { p.bot.path = []; p.bot.target = null; }
    if (p.client) this.s.send(p.client, { t: 'spawn', x: p.x, y: p.y, z: p.z, yaw: p.yaw, gun: p.gun });
  }

  // ---------------------------------------------------------------- client input
  input(c, m) {
    const p = this.players.get(c.id);
    if (!p || !p.alive || this.state !== 'playing') return;
    if (!fin(m.x) || !fin(m.y) || !fin(m.z) || !fin(m.yaw) || !fin(m.pitch)) return;
    const dt = Math.max(0.05, this.now - p.lastIn);
    const dist = Math.hypot(m.x - p.x, m.z - p.z);
    p.lastIn = this.now;
    const admin = !!c.admin;               // admins may fly: no speed check, wider limits
    const H = this.md.map.half + (admin ? 40 : 0);
    if (!admin && dist > 13 * dt + 1.5) {
      // moved impossibly fast: snap them back
      this.s.send(c, { t: 'pos', x: p.x, y: p.y, z: p.z });
      return;
    }
    p.x = Math.max(-H, Math.min(H, m.x));
    p.z = Math.max(-H, Math.min(H, m.z));
    p.y = Math.max(0, Math.min(admin ? 200 : 40, m.y));
    p.yaw = m.yaw; p.pitch = Math.max(-1.6, Math.min(1.6, m.pitch));
    p.f = ((m.f | 0) & ~F_ALIVE & 127) | F_ALIVE;
  }

  eye(p) { return p.y + ((p.f & F_CROUCH) ? EYE_CROUCH : EYE); }

  los(a, b, head) {
    const ox = a.x, oy = this.eye(a), oz = a.z;
    const ty = b.y + (head ? HITBOX.headY : HITBOX.bodyY + 0.3) * ((b.f & F_CROUCH) ? HITBOX.crouchScale : 1);
    const dx = b.x - ox, dy = ty - oy, dz = b.z - oz;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    const t = raycastMap(this.md, ox, oy, oz, dx / d, dy / d, dz / d, d);
    return t >= d - 0.5;
  }

  shoot(c, m) {
    const p = this.players.get(c.id);
    if (!p || !p.alive || this.state !== 'playing' || !Array.isArray(m.d)) return;
    const g = this.s.guns[p.gun];
    if (this.now - p.lastShot < (60 / g.rpm) * 0.7) return;
    p.lastShot = this.now;
    let [dx, dy, dz] = m.d;
    if (!fin(dx) || !fin(dy) || !fin(dz)) return;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const len = fin(m.l) ? Math.max(0, Math.min(300, m.l)) : 100;
    this.sendNear({ t: 'fx', id: p.id, d: [r3(dx), r3(dy), r3(dz)], l: Math.round(len) }, p.x, p.z, 110);
    if (!Array.isArray(m.h)) return;
    const ox = p.x, oy = this.eye(p), oz = p.z;
    for (const h of m.h.slice(0, 16)) {
      if (!Array.isArray(h)) continue;
      const t = this.players.get(h[0]);
      if (!t || !t.alive || !this.enemy(p, t)) continue;
      const head = !!h[1];
      const count = Math.max(1, Math.min(g.pellets, h[2] | 0 || 1));
      const ty = t.y + (head ? HITBOX.headY : HITBOX.bodyY) * ((t.f & F_CROUCH) ? HITBOX.crouchScale : 1);
      const vx = t.x - ox, vy = ty - oy, vz = t.z - oz;
      const dist = Math.hypot(vx, vy, vz);
      if (dist > 320) continue;
      // direction sanity: the target must be roughly along the reported shot direction
      const along = (vx * dx + vy * dy + vz * dz);
      const lateral = Math.sqrt(Math.max(0, dist * dist - along * along));
      if (along < -0.5 || lateral > 2.5 + g.spread * dist * 1.5) continue;
      if (!this.los(p, t, head) && !this.los(p, t, !head)) continue;
      let dmg = g.dmg * count * (head ? (g.cat === 'sniper' ? 2 : 1.5) : 1);
      if (dist > g.range) dmg *= 0.7;
      this.damage(t, p, dmg, head);
    }
  }

  damage(t, a, dmg, head) {
    if (!t.alive) return;
    t.hp -= dmg;
    t.lastHit = this.now;
    if (t.client) this.s.send(t.client, { t: 'dmg', hp: Math.max(0, Math.round(t.hp)), from: a.id, x: r2(a.x), z: r2(a.z) });
    if (t.bot && !t.bot.target) { t.bot.target = a; t.bot.react = 0.3; }
    const killed = t.hp <= 0;
    if (a.client) this.s.send(a.client, { t: 'hm', k: killed ? 1 : 0, h: head ? 1 : 0 });
    if (killed) this.kill(t, a, head);
  }

  kill(t, a, head) {
    t.alive = false; t.hp = 0; t.f = 0; t.deaths++;
    t.respawn = this.now + RESPAWN;
    if (a !== t) {
      a.kills++;
      if (this.scores) this.scores[a.team]++;
    }
    this.sendAll({ t: 'kill', k: a.id, v: t.id, g: a.gun, h: head ? 1 : 0 });
    if (this.mode.teams) { if (this.scores[a.team] >= this.mode.limit) this.end({ team: a.team }); }
    else if (a.kills >= this.mode.limit) this.end({ id: a.id });
  }

  end(w) {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.endTimer = 12;
    const n = this.humans(); // only real people count toward the coin reward (no farming with bots)
    const coins = coinsFor(n);
    const board = [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map(p => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, bot: !p.client }));
    const wp = w.id != null ? this.players.get(w.id) : null;
    const name = this.mode.teams ? TEAMS[w.team].name : (wp ? wp.name : '???');
    for (const p of this.players.values()) {
      if (!p.client) continue;
      const won = this.mode.teams ? p.team === w.team : p.id === w.id;
      this.s.send(p.client, { t: 'end', winner: name, team: w.team ?? -1, won, coins: won ? coins : 0, players: n, board, next: 12 });
    }
  }

  // ---------------------------------------------------------------- tick
  tick(dt) {
    if (this.state === 'ended') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.startRound(false);
      return;
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      if (this.mode.teams) {
        let t = 0;
        for (let i = 1; i < this.scores.length; i++) if (this.scores[i] > this.scores[t]) t = i;
        this.end({ team: t });
      } else {
        let best = null;
        for (const p of this.players.values()) if (!best || p.kills > best.kills) best = p;
        this.end({ id: best.id });
      }
      return;
    }
    const now = this.now;
    for (const p of this.players.values()) {
      if (!p.alive) { if (now >= p.respawn) this.spawn(p, false); continue; }
      if (p.hp < 100 && now - p.lastHit > REGEN_DELAY) p.hp = Math.min(100, p.hp + REGEN_RATE * dt);
      if (p.bot) this.botThink(p, dt);
    }
    this.snapshots();
    this.scoreT -= dt;
    if (this.scoreT <= 0) {
      this.scoreT = 1;
      this.sendAll({ t: 'sc', s: this.scoreList(), tl: Math.round(this.timeLeft) });
    }
  }

  snapshots() {
    const all = [...this.players.values()];
    const enc = (p) => [p.id, r2(p.x), r2(p.y), r2(p.z), r3(p.yaw), r3(p.pitch), p.alive ? p.f : 0];
    const small = all.length <= 33;
    const shared = small ? all.map(enc) : null;
    for (const h of all) {
      if (!h.client) continue;
      let list = shared;
      if (!small && h.client.admin) list = all.filter(q => q !== h).map(enc); // admin ESP sees everyone
      else if (!small) {
        // interest management: only the 32 nearest players
        const near = all.filter(q => q !== h).map(q => [q, (q.x - h.x) ** 2 + (q.z - h.z) ** 2]);
        near.sort((a, b) => a[1] - b[1]);
        list = near.slice(0, 32).map(([q]) => enc(q));
      }
      this.s.send(h.client, { t: 's', hp: Math.round(h.hp), p: list });
    }
  }

  // ---------------------------------------------------------------- bots
  botThink(p, dt) {
    const B = p.bot;
    const g = this.s.guns[p.gun];
    B.think -= dt;
    if (B.think <= 0) {
      B.think = 0.22 + Math.random() * 0.12;
      if (B.target && (!B.target.alive || !this.players.has(B.target.id) || !this.los(p, B.target))) B.target = null;
      if (!B.target) {
        const cands = [];
        for (const q of this.players.values()) {
          if (!q.alive || !this.enemy(p, q)) continue;
          const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
          if (d < 65 * 65) cands.push([q, d]);
        }
        cands.sort((a, b) => a[1] - b[1]);
        for (const [q] of cands.slice(0, 6)) if (this.los(p, q)) { B.target = q; B.react = 0.5 + Math.random() * 0.6; break; }
      }
    }
    let mvx = 0, mvz = 0;
    const T = B.target;
    if (T) {
      const dx = T.x - p.x, dz = T.z - p.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(-dx, -dz);
      let diff = ((want - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      p.yaw += Math.max(-7 * dt, Math.min(7 * dt, diff));
      p.pitch = Math.atan2((T.y + 1.2) - (p.y + EYE), d);
      B.react -= dt;
      B.strafeT -= dt;
      if (B.strafeT <= 0) { B.strafe = Math.random() < 0.5 ? -1 : 1; B.strafeT = 0.6 + Math.random() * 1.2; }
      const fx = dx / (d || 1), fz = dz / (d || 1);
      mvx = -fz * B.strafe; mvz = fx * B.strafe;
      if (d > 16) { mvx += fx; mvz += fz; } else if (d < 5) { mvx -= fx * 0.6; mvz -= fz * 0.6; }
      // fire in bursts
      if (B.pause > 0) B.pause -= dt;
      else if (B.react <= 0 && Math.abs(diff) < 0.2 && this.now - p.lastShot >= 60 / Math.min(g.rpm, 650)) {
        p.lastShot = this.now;
        this.botFire(p, T, d, g);
        if (g.auto && ++B.burst >= 3 + Math.floor(Math.random() * 4)) { B.burst = 0; B.pause = 0.35 + Math.random() * 0.5; }
        if (!g.auto) B.pause = 0.15 + Math.random() * 0.3;
      }
    } else {
      B.repath -= dt;
      if (!B.path.length || B.repath <= 0) {
        const sp = this.md.spawns;
        const goal = sp[Math.floor(Math.random() * sp.length)];
        B.path = findPath(this.md.nav, p.x, p.z, goal.x, goal.z) || [];
        B.repath = 12;
      }
      if (B.path.length) {
        const [wx, wz] = B.path[0];
        const dx = wx - p.x, dz = wz - p.z, d = Math.hypot(dx, dz);
        if (d < 0.8) B.path.shift();
        else {
          mvx = dx / d; mvz = dz / d;
          const want = Math.atan2(-dx, -dz);
          const diff = ((want - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          p.yaw += Math.max(-5 * dt, Math.min(5 * dt, diff));
          p.pitch *= 0.9;
        }
      }
    }
    const ml = Math.hypot(mvx, mvz);
    let moving = false;
    if (ml > 0.01) {
      const sp = (T ? 3.6 : 4.6) * g.move * dt / ml;
      moveCircle(this.md, p, mvx * sp, mvz * sp);
      moving = true;
      B.stuckT += dt;
      if (B.stuckT > 1.2) {
        if (Math.hypot(p.x - B.lx, p.z - B.lz) < 0.8) { B.path = []; B.strafe *= -1; }
        B.stuckT = 0; B.lx = p.x; B.lz = p.z;
      }
    }
    p.f = F_ALIVE | (moving ? F_MOVE : 0);
  }

  botFire(p, T, d, g) {
    let chance = Math.max(0.05, Math.min(0.3, 0.32 - d * 0.0055));
    if (T.f & F_MOVE) chance *= 0.75;
    if (T.f & F_CROUCH) chance *= 0.85;
    let hits = 0;
    const pellets = g.pellets || 1;
    for (let i = 0; i < pellets; i++) if (Math.random() < chance * (pellets > 1 ? (d < g.range ? 2 : 0.3) : 1)) hits++;
    const head = hits > 0 && Math.random() < 0.12;
    // tracer direction: at the target, with scatter when missing
    const ty = T.y + 1.2, oy = this.eye(p);
    const miss = hits ? 0.15 : 0.9 + Math.random();
    let dx = T.x - p.x + (Math.random() - 0.5) * miss, dy = ty - oy + (Math.random() - 0.5) * miss, dz = T.z - p.z + (Math.random() - 0.5) * miss;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    this.sendNear({ t: 'fx', id: p.id, d: [r3(dx), r3(dy), r3(dz)], l: Math.round(hits ? d : raycastMap(this.md, p.x, oy, p.z, dx, dy, dz, 120)) }, p.x, p.z, 110);
    if (hits) {
      let dmg = g.dmg * hits * (head ? 1.5 : 1);
      if (d > g.range) dmg *= 0.7;
      this.damage(T, p, dmg, head);
    }
  }
}

// ==================================================================== helpers
function randomSkin() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return cleanSkin({
    skin: pick(['#f1c8a5', '#d9a47c', '#c68a63', '#a8704a', '#7d4f32', '#5a3826']),
    shirt: pick(['#3d4a35', '#4a4f57', '#5b4a36', '#2d3a4a', '#6b6f5a', '#3a2e2a']),
    pants: pick(['#3b3f33', '#2e3138', '#4d4234', '#3a4a3a', '#24262b']),
    gear: pick(['#2b2e26', '#4a4436', '#1f2124', '#3a4a3a', '#5c513e']),
    hat: pick(['#3a3d33', '#2a2c30', '#5c513e', '#4a5a40', '#1d1f22']),
    head: pick(SKIN_ENUMS.head), face: pick(SKIN_ENUMS.face), vest: pick(SKIN_ENUMS.vest), back: pick(SKIN_ENUMS.back),
    knees: Math.random() < 0.5, gloves: Math.random() < 0.5, rig: Math.random() < 0.5,
  });
}

// Circle (r=0.4) vs map boxes, X then Z, for bots on the ground.
function moveCircle(md, p, mx, mz) {
  const r = 0.4, tmp = moveCircle.tmp || (moveCircle.tmp = []);
  const blocked = (x, z) => {
    for (const s of md.query(x - r, z - r, x + r, z + r, tmp)) {
      if (s.maxY > p.y + 0.4 && s.minY < p.y + 1.7 && x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ) return true;
    }
    return false;
  };
  if (!blocked(p.x + mx, p.z)) p.x += mx;
  if (!blocked(p.x, p.z + mz)) p.z += mz;
  const H = md.map.half - 0.5;
  p.x = Math.max(-H, Math.min(H, p.x));
  p.z = Math.max(-H, Math.min(H, p.z));
}

// A* on the walkable grid. Returns [[x,z], ...] waypoints or null.
export function findPath(nav, sx, sz, gx, gz) {
  const { walk, N, cell, off } = nav;
  const ci = (x, z) => {
    const ix = Math.max(0, Math.min(N - 1, Math.floor((x + off) / cell)));
    const iz = Math.max(0, Math.min(N - 1, Math.floor((z + off) / cell)));
    return iz * N + ix;
  };
  const start = ci(sx, sz), goal = ci(gx, gz);
  if (!walk[goal]) return null;
  const g = new Float32Array(N * N).fill(Infinity);
  const from = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const heap = [];
  const push = (i, f) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) { const pk = (k - 1) >> 1; if (heap[pk][0] <= heap[k][0]) break; [heap[pk], heap[k]] = [heap[k], heap[pk]]; k = pk; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top[1];
  };
  const gxI = goal % N, gzI = (goal / N) | 0;
  const h = (i) => { const dx = Math.abs((i % N) - gxI), dz = Math.abs(((i / N) | 0) - gzI); return Math.max(dx, dz) + 0.41 * Math.min(dx, dz); };
  g[start] = 0;
  push(start, h(start));
  let iter = 0;
  while (heap.length && iter++ < 6000) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % N, cz = (cur / N) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const ni = nz * N + nx;
      if (!walk[ni] || closed[ni]) continue;
      if (dx && dz && (!walk[cz * N + nx] || !walk[nz * N + cx])) continue;
      const ng = g[cur] + (dx && dz ? 1.414 : 1);
      if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ni, ng + h(ni)); }
    }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const path = [];
  for (let i = goal; i !== start && i >= 0; i = from[i]) path.push([(i % N) * cell - off + cell / 2, ((i / N) | 0) * cell - off + cell / 2]);
  path.reverse();
  return path;
}
