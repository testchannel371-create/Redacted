// Boot, menus, shop, party, settings and the render loop.
import * as THREE from 'three';
import { loadAssets, A, iconHTML, setGunIcon, prefetchGuns } from './assets.js';
import { Net } from './net.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { MenuScene } from './menu3d.js';
import { DEFAULT_SKIN, cleanSkin, SKIN_OPTIONS, cleanBots, MAX_BOTS } from '../shared/core.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ saved profile (this browser only — no accounts)
const store = {
  get(k, d) { try { const v = localStorage.getItem('redacted.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('redacted.' + k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const profile = {
  name: store.get('name', 'Operator' + Math.floor(100 + Math.random() * 900)),
  coins: store.get('coins', 0),
  owned: store.get('owned', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  gun: store.get('gun', 4),
  skin: cleanSkin(store.get('skin', DEFAULT_SKIN)),
  bots: cleanBots(store.get('bots', null)),
};
const settings = { sens: 1, fov: 80, volume: 0.7, quality: 'auto', showFps: false, ...store.get('settings', {}) };
const save = () => {
  store.set('name', profile.name); store.set('coins', profile.coins); store.set('owned', profile.owned);
  store.set('gun', profile.gun); store.set('skin', profile.skin); store.set('settings', settings);
  store.set('bots', profile.bots);
};

// ------------------------------------------------------------------ renderer + adaptive resolution
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
const QUALITY = {
  low: { max: 0.6, min: 0.45 },
  med: { max: 0.85, min: 0.6 },
  high: { max: Math.min(devicePixelRatio, 1.5), min: 0.85 },
  auto: { max: Math.min(devicePixelRatio, 1), min: 0.5 },
};
const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 8) <= 4;
const app = {
  renderer, profile, settings, fps: 60,
  renderScale: settings.quality === 'auto' && lowEnd ? 0.75 : QUALITY[settings.quality].max,
};
renderer.setPixelRatio(app.renderScale);
renderer.setSize(innerWidth, innerHeight, false);
// Static sun shadows: drawn once when a map loads, never per frame (cheap on Chromebooks). Off on LOW.
renderer.shadowMap.enabled = settings.quality !== 'low';
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

function applyQuality() {
  const q = QUALITY[settings.quality] || QUALITY.auto;
  app.renderScale = Math.max(q.min, Math.min(q.max, app.renderScale));
  if (settings.quality !== 'auto') app.renderScale = q.max;
  renderer.setPixelRatio(app.renderScale);
}

// ------------------------------------------------------------------ boot
const net = new Net();
const sfx = new Sfx();
sfx.setVolume(settings.volume);
app.net = net; app.sfx = sfx;
let menu, game;

async function boot() {
  if (!Number.isInteger(profile.gun) || profile.gun < 0 || profile.gun > 49 || !profile.owned.includes(profile.gun)) profile.gun = 4;
  try {
    await loadAssets(profile.gun, (p) => { $('load-fill').style.width = Math.round(p * 90) + '%'; });
  } catch (e) {
    $('load-msg').textContent = 'Could not load game files. Start the server with "npm start" and open the address it prints.';
    console.error(e);
    return;
  }
  $('load-msg').textContent = 'Preparing armory';
  $('load-fill').style.width = '95%';
  // download the rest of the weapons quietly: yours and the bots' first
  setTimeout(() => prefetchGuns([...new Set([profile.gun, ...profile.owned, 0, 2, 3, 4, 5, 7, 9, 12, 17, 21, ...A.gunData.map(g => g.id)])]), 1500);
  menu = new MenuScene(profile.skin, profile.gun);
  game = new Game(app);
  window.__redacted = { app, menu, game, net, A, THREE };
  wireNet();
  buildMenu();
  buildShop();
  buildOperatorEditor();
  buildAdmin();
  updateCoins();
  updateLoadout();
  $('loading').hidden = true;
  showScreen('menu');
  requestAnimationFrame(frame);
  connect();
}

async function connect() {
  setStatus('CONNECTING…', '');
  const online = await net.connect(A.gunData);
  if (!online) setStatus('OFFLINE · PRACTICE VS BOTS', 'off');
}

function setStatus(text, cls) {
  const el = $('net-status');
  el.textContent = text;
  el.className = 'net ' + cls;
}

// ------------------------------------------------------------------ network handlers
let party = null, myId = null, serverInfo = null;

// ------------------------------------------------------------------ admin (password is checked by the server)
const admin = { on: false, fly: false, esp: false };
let adminPw = null; // kept in memory only for this tab, never saved
app.admin = admin;

function renderAdmin() {
  $('btn-admin').classList.toggle('on', admin.on);
  $('btn-admin').textContent = admin.on ? 'ADMIN ✓' : 'ADMIN';
  $('admin-login').hidden = admin.on;
  $('admin-panel').hidden = !admin.on;
  document.querySelectorAll('[data-admin]').forEach(b => b.classList.toggle('active', !!admin[b.dataset.admin]));
  updateCoins();
  if (screen === 'shop') renderShop();
  game?.renderAdmin?.();
}

function openAdmin() {
  sfx.init(); sfx.ui();
  $('admin-dlg').hidden = false;
  $('admin-err').textContent = '';
  renderAdmin();
  if (!admin.on) setTimeout(() => $('admin-pw').focus(), 30);
}

function buildAdmin() {
  $('btn-admin').addEventListener('click', openAdmin);
  const close = () => { $('admin-dlg').hidden = true; };
  const go = () => {
    const pw = $('admin-pw').value;
    if (!pw) return;
    if (!myId) { $('admin-err').textContent = 'Still connecting… try again in a second.'; return; }
    $('admin-err').textContent = 'Checking…';
    adminPw = null;
    net.send({ t: 'admin', pw });
  };
  $('admin-go').addEventListener('click', go);
  $('admin-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') close(); e.stopPropagation(); });
  $('admin-cancel').addEventListener('click', close);
  $('admin-close').addEventListener('click', close);
  $('admin-dlg').addEventListener('click', (e) => { if (e.target === $('admin-dlg')) close(); });
  $('admin-lock').addEventListener('click', () => {
    admin.on = admin.fly = admin.esp = false; adminPw = null;
    net.send({ t: 'admin_off' });
    renderAdmin(); close(); toast('Admin locked');
  });
  document.querySelectorAll('[data-admin]').forEach(b => b.addEventListener('click', () => {
    if (!admin.on) return;
    admin[b.dataset.admin] = !admin[b.dataset.admin];
    sfx.ui(); renderAdmin();
  }));
  renderAdmin();
}

// The bot setting that applies right now: yours, or the leader's if you are in someone else's party.
const amLeader = () => !party || party.leader === myId;
const activeBots = () => (amLeader() || !party.bots ? profile.bots : party.bots);

function updateModeNote() {
  const b = activeBots();
  const bots = b.on ? `BOTS ON: your party gets its own match with ${b.count} bot${b.count === 1 ? '' : 's'}.` : 'BOTS OFF: you are matched with real players only.';
  const where = net.online
    ? `Matches hold up to ${serverInfo ? serverInfo.perMatch : 64} players (server max ${serverInfo ? serverInfo.max : 200}).`
    : 'No server found, so this is offline practice. Run the server ("npm start") to play with friends.';
  $('mode-note').textContent = `${bots} ${where} Every round is on a random map. Change bots in PARTY.`;
}

function renderBots() {
  const b = activeBots(), lead = amLeader();
  const tg = $('bots-toggle');
  tg.classList.toggle('on', b.on);
  tg.setAttribute('aria-pressed', String(b.on));
  tg.querySelector('.bt-ico').textContent = b.on ? '✓' : '✗';
  tg.querySelector('.bt-lbl').textContent = b.on ? 'ON' : 'OFF';
  tg.disabled = !lead;
  $('bots-count-row').classList.toggle('off', !b.on || !lead);
  if (document.activeElement !== $('bots-num')) $('bots-num').value = b.count;
  $('bots-range').value = b.count;
  $('bots-range').disabled = $('bots-num').disabled = !lead;
  $('bots-hint').textContent = !lead
    ? `Only the party leader can change bots. Leader has bots ${b.on ? 'ON (' + b.count + ')' : 'OFF'}.`
    : b.on ? `Your party gets its own match with ${b.count} bot${b.count === 1 ? '' : 's'}. Bots don't count toward coin rewards.`
      : 'Bots off: you will be matched with real players only.';
  updateModeNote();
}

function setBots(patch) {
  if (!amLeader()) return;
  profile.bots = cleanBots({ ...profile.bots, ...patch });
  save();
  renderBots();
  clearTimeout(setBots.to);
  setBots.to = setTimeout(() => net.send({ t: 'bots', ...profile.bots }), 150);
}

function wireNet() {
  net.on('welcome', (m) => {
    myId = m.id;
    if (net.online) setStatus(`ONLINE · ${m.online} PLAYER${m.online === 1 ? '' : 'S'}`, 'on');
    net.send({ t: 'hello', name: profile.name, gun: profile.gun, skin: profile.skin });
    net.send({ t: 'bots', ...profile.bots });
    if (adminPw) net.send({ t: 'admin', pw: adminPw }); // log back in after a reconnect
    serverInfo = m;
    updateModeNote();
  });
  net.on('admin', (m) => {
    if (m.ok) {
      admin.on = true;
      $('admin-err').textContent = '';
      if (!adminPw) toast('Admin unlocked: fly (F), ESP (G), unlimited coins');
      adminPw = adminPw || $('admin-pw').value;
      $('admin-pw').value = '';
    } else {
      admin.on = false; admin.fly = false; admin.esp = false; adminPw = null;
      $('admin-err').textContent = m.msg || 'Wrong password';
    }
    renderAdmin();
  });
  net.on('online', (m) => { if (net.online) setStatus(`ONLINE · ${m.n} PLAYER${m.n === 1 ? '' : 'S'}`, 'on'); });
  let full = false;
  net.on('full', (m) => { full = m.max; });
  net.on('disconnected', () => {
    if (game.active) { game.exit(); showScreen('menu'); }
    party = null; renderParty();
    toast(full ? `The server is full (${full} players). Playing offline practice for now.` : 'Lost connection to the server. Switched to offline practice.');
    setStatus('OFFLINE · PRACTICE VS BOTS', 'off');
    net.goOffline();
  });
  net.on('party', (m) => { party = m.party; renderParty(); });
  net.on('party_err', (m) => { $('party-err').textContent = m.msg; toast(m.msg); });
  for (const t of ['start', 'spawn', 's', 'sc', 'fx', 'dmg', 'hm', 'kill', 'end', 'pj', 'pl', 'pi', 'pos']) net.on(t, (m) => game.handle(m));
}

app.onEnterGame = () => { showScreen(null); };
app.onLeave = () => { showScreen('menu'); };
app.onCoins = (n) => {
  profile.coins += n;
  save();
  updateCoins();
};

// ------------------------------------------------------------------ screens
let screen = 'menu';
function showScreen(name) {
  screen = name;
  $('menu').hidden = name !== 'menu';
  $('panel-play').hidden = name !== 'play';
  $('panel-party').hidden = name !== 'party';
  $('panel-shop').hidden = name !== 'shop';
  $('grain').hidden = false;
  if (!menu) return;
  if (name === 'shop') menu.setMode(shopTab === 'weapons' ? 'shop-weapons' : 'shop-operator');
  else menu.setMode(name === 'menu' ? 'menu' : 'panel');
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.to);
  toast.to = setTimeout(() => t.classList.remove('show'), 3200);
}

function buildMenu() {
  const name = $('name-input');
  name.value = profile.name;
  name.addEventListener('change', () => {
    profile.name = name.value.replace(/[^\w .\-]/g, '').trim().slice(0, 16) || profile.name;
    name.value = profile.name;
    save();
    net.send({ t: 'hello', name: profile.name, gun: profile.gun, skin: profile.skin });
  });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  const click = (id, fn) => $(id).addEventListener('click', () => { sfx.init(); sfx.ui(); fn(); });
  click('btn-play', () => {
    // in someone else's party only the leader can start: send friends to the party screen instead
    if (party && party.members.length > 1 && !amLeader()) {
      toast(`Waiting for ${leaderName()} (party leader) to start the match`);
      showScreen('party'); renderParty();
      return;
    }
    showScreen('play');
  });
  click('btn-shop', () => { showScreen('shop'); renderShop(); });
  click('btn-party', () => {
    showScreen('party');
    $('party-err').textContent = '';
    if (!party) net.send({ t: 'party_create' });
    renderParty();
  });
  document.querySelectorAll('.panel .back').forEach(b => b.addEventListener('click', () => { sfx.ui(); showScreen('menu'); }));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && screen && screen !== 'menu' && !game.active) showScreen('menu'); });
  // mode buttons on the PLAY screen and the START MATCH buttons on the PARTY screen
  document.querySelectorAll('.mode, .pmode').forEach(b => b.addEventListener('click', () => {
    sfx.init(); sfx.uiConfirm();
    if (!myId) return toast('Still connecting… try again in a second.');
    net.send({ t: 'loadout', gun: profile.gun, skin: profile.skin });
    net.send({ t: 'play', mode: b.dataset.mode, bots: profile.bots });
    toast(party && party.members.length > 1 ? `Starting a match for your party (${party.members.length} players)…` : 'Finding a match…');
  }));
  // party
  const pin = $('party-input');
  pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 5); });
  const join = () => {
    if (pin.value.length !== 5) { $('party-err').textContent = 'Party codes are 5 numbers'; return; }
    $('party-err').textContent = '';
    net.send({ t: 'party_join', code: pin.value });
  };
  $('party-join').addEventListener('click', () => { sfx.ui(); join(); });
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  $('party-new').addEventListener('click', () => { sfx.ui(); net.send({ t: 'party_create' }); });
  $('party-leave').addEventListener('click', () => { sfx.ui(); net.send({ t: 'party_leave' }); });
  // [BOTS] option
  $('bots-toggle').addEventListener('click', () => { sfx.init(); sfx.ui(); setBots({ on: !profile.bots.on }); });
  $('bots-range').addEventListener('input', (e) => setBots({ count: Number(e.target.value) }));
  const num = $('bots-num');
  num.max = MAX_BOTS; $('bots-range').max = MAX_BOTS;
  num.addEventListener('input', () => { const v = Number(num.value); if (v >= 1 && v <= MAX_BOTS) setBots({ count: v }); });
  num.addEventListener('change', () => { setBots({ count: Number(num.value) || 1 }); num.value = profile.bots.count; });
  renderBots();
  // pause-menu settings
  const bind = (id, key, fmt, apply) => {
    const el = $(id), out = $(id + '-v');
    if (el.type === 'checkbox') el.checked = !!settings[key]; else el.value = settings[key];
    const upd = () => {
      settings[key] = el.type === 'checkbox' ? el.checked : (el.tagName === 'SELECT' ? el.value : Number(el.value));
      if (out) out.textContent = fmt(settings[key]);
      apply && apply();
      save();
    };
    el.addEventListener('input', upd);
    if (out) out.textContent = fmt(settings[key]);
  };
  bind('set-sens', 'sens', v => v.toFixed(2));
  bind('set-fov', 'fov', v => v);
  bind('set-vol', 'volume', v => Math.round(v * 100), () => sfx.setVolume(settings.volume));
  bind('set-quality', 'quality', v => v, applyQuality);
  bind('set-fps', 'showFps', v => v, () => { $('fps').textContent = ''; });
}

function renderParty() {
  const code = party ? party.code : '-----';
  $('party-code').textContent = code;
  const ul = $('party-members');
  ul.innerHTML = party ? party.members.map(m => `<li>${esc(m.name)}${m.id === party.leader ? ' <span class="lead">LEADER</span>' : ''}${m.id === myId ? ' <span class="you">YOU</span>' : ''}${m.inMatch ? ' <span class="you">IN MATCH</span>' : ''}</li>`).join('') : '';
  $('party-leave').disabled = !party || party.members.length < 2;
  const multi = party && party.members.length > 1, lead = amLeader();
  $('party-sub').textContent = multi ? `Party ${party.code} · ${party.members.length} members` : 'Squad up with a code';
  $('play-sub').textContent = multi && !lead ? `Waiting for ${leaderName()} to start` : 'Free for all · 2 teams · 4 teams';
  // START MATCH box: the leader picks a mode here, everyone else waits for the leader
  $('party-modes').hidden = !lead;
  $('party-wait').textContent = lead
    ? (multi ? `Pick a mode and all ${party.members.length} of you join the same match and team.` : 'Pick a mode to start. Friends who join your code will come with you.')
    : `Waiting for ${leaderName()} (the party leader) to start the match…`;
  if (!net.online) $('party-err').textContent = 'Parties need the online server — friends cannot join offline practice.';
  renderBots();
}

function leaderName() {
  return party?.members.find(m => m.id === party.leader)?.name || 'the leader';
}

const canAfford = (price) => admin.on || profile.coins >= price;   // admins have unlimited coins

function updateCoins() {
  const txt = admin.on ? '∞' : profile.coins.toLocaleString();
  $('coin-count').textContent = txt;
  document.querySelectorAll('.coin-count').forEach(e => { e.textContent = txt; });
}

function updateLoadout() {
  setGunIcon($('lc-icon'), profile.gun);
  $('lc-name').textContent = A.gunData[profile.gun].name.toUpperCase();
}

// ------------------------------------------------------------------ shop: weapons
const CATS = [['all', 'ALL'], ['pistol', 'PISTOLS'], ['smg', 'SMGS'], ['ar', 'ASSAULT RIFLES'], ['shotgun', 'SHOTGUNS'], ['lmg', 'LMGS'], ['marksman', 'MARKSMAN'], ['sniper', 'SNIPERS']];
const CAT_NAME = { pistol: 'PISTOL', smg: 'SUBMACHINE GUN', ar: 'ASSAULT RIFLE', shotgun: 'SHOTGUN', lmg: 'LIGHT MACHINE GUN', marksman: 'MARKSMAN RIFLE', sniper: 'SNIPER RIFLE' };
let shopTab = 'weapons', shopCat = 'all', shopSel = 4;

function buildShop() {
  $('gun-filters').innerHTML = CATS.map(([k, l]) => `<button class="chip ${k === shopCat ? 'active' : ''}" data-cat="${k}">${l}</button>`).join('');
  $('gun-filters').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    sfx.ui(); shopCat = b.dataset.cat; renderShop();
  });
  $('gun-grid').innerHTML = A.gunData.map(g => `<button class="gcard" data-id="${g.id}"><span class="gp"></span>${iconHTML(g.id)}<div class="gn">${esc(g.name)}</div><div class="gc">${CAT_NAME[g.cat]}</div></button>`).join('');
  $('gun-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.gcard'); if (!b) return;
    sfx.ui(); shopSel = Number(b.dataset.id); renderShop();
  });
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    sfx.ui();
    shopTab = t.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    $('tab-weapons').hidden = shopTab !== 'weapons';
    $('tab-operator').hidden = shopTab !== 'operator';
    menu.setMode(shopTab === 'weapons' ? 'shop-weapons' : 'shop-operator');
  }));
  shopSel = profile.gun;
}

function renderShop() {
  document.querySelectorAll('#gun-filters .chip').forEach(c => c.classList.toggle('active', c.dataset.cat === shopCat));
  document.querySelectorAll('.gcard').forEach(c => {
    const g = A.gunData[Number(c.dataset.id)];
    c.hidden = shopCat !== 'all' && g.cat !== shopCat;
    const owned = profile.owned.includes(g.id);
    c.classList.toggle('sel', g.id === shopSel);
    c.classList.toggle('locked', !owned);
    const p = c.querySelector('.gp');
    if (g.id === profile.gun) { p.textContent = 'EQUIPPED'; p.className = 'gp eq'; }
    else if (owned) { p.textContent = g.free ? 'FREE' : 'OWNED'; p.className = 'gp ' + (g.free ? 'free' : 'own'); }
    else { p.textContent = g.price.toLocaleString(); p.className = 'gp'; }
  });
  renderDetail();
  menu.showGun(shopSel);
  updateCoins();
}

function renderDetail() {
  const g = A.gunData[shopSel];
  const owned = profile.owned.includes(g.id);
  const bar = (label, v, txt) => `<div class="stat"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></div></div><b>${txt}</b></div>`;
  const dmg = g.dmg * g.pellets;
  let action;
  if (g.id === profile.gun) action = `<button class="btn" disabled>EQUIPPED</button>`;
  else if (owned) action = `<button class="btn accent" id="gd-equip">EQUIP</button>`;
  else action = `<div class="gd-price"><span class="coin-ico"></span>${admin.on ? 'FREE (ADMIN)' : g.price.toLocaleString()}</div><button class="btn accent" id="gd-buy" ${canAfford(g.price) ? '' : 'disabled'}>BUY</button>`;
  $('gun-detail').innerHTML = `
    <div class="gd-cat">${CAT_NAME[g.cat]}${g.free ? ' · FREE' : ''}</div>
    <div class="gd-name">${esc(g.name.toUpperCase())}</div>
    ${iconHTML(g.id)}
    ${bar('DAMAGE', dmg / 150, Math.round(dmg))}
    ${bar('FIRE RATE', g.rpm / 1100, g.rpm)}
    ${bar('RANGE', g.range / 200, g.range + 'm')}
    ${bar('ACCURACY', 1 - g.spread / 0.08, '')}
    ${bar('CONTROL', 1 - g.recoil / 0.1, '')}
    ${bar('MOBILITY', (g.move - 0.8) / 0.3, '')}
    ${bar('MAGAZINE', Math.log(g.mag) / Math.log(150), g.mag)}
    <div class="gd-actions">${action}</div>
    <div class="gd-note" id="gd-note">${!owned && !canAfford(g.price) ? `You need ${(g.price - profile.coins).toLocaleString()} more coins. Win matches to earn coins.` : ''}</div>`;
  const eq = $('gd-equip');
  if (eq) eq.onclick = () => { sfx.uiConfirm(); equip(g.id); };
  const buy = $('gd-buy');
  if (buy) buy.onclick = () => {
    if (!canAfford(g.price)) return;
    if (!admin.on) profile.coins -= g.price;
    profile.owned.push(g.id);
    sfx.uiConfirm();
    toast(`Unlocked ${g.name}!`);
    equip(g.id);
  };
}

function equip(id) {
  profile.gun = id;
  save();
  menu.setGun(id);
  updateLoadout();
  net.send({ t: 'loadout', gun: profile.gun, skin: profile.skin });
  renderShop();
}

// ------------------------------------------------------------------ shop: operator customisation
const LABELS = {
  head: { none: 'NONE', helmet: 'HELMET', cap: 'CAP', beanie: 'BEANIE', boonie: 'BOONIE HAT', beret: 'BERET', headset: 'HEADSET' },
  face: { none: 'NONE', goggles: 'GOGGLES', gasmask: 'GAS MASK', bandana: 'BANDANA', balaclava: 'BALACLAVA', paint: 'FACE PAINT' },
  vest: { none: 'T-SHIRT', plate: 'PLATE CARRIER', jacket: 'FIELD JACKET', hoodie: 'HOODIE', bandolier: 'BANDOLIER' },
  back: { none: 'NONE', pack: 'BACKPACK', radio: 'RADIO' },
};
const SKIN_TONES = ['#f3d2b5', '#e5b48f', '#c68a63', '#a8704a', '#83532f', '#5e3a24', '#3f2618'];
const PALETTE = ['#3d4a35', '#4b5233', '#5b4a36', '#6b6f5a', '#8f7a55', '#a68c60', '#c7c2b0', '#2d3a4a', '#4a4f57', '#24262b', '#121314', '#7a2b25', '#3a5e3e', '#6a3fa0', '#e2781c', '#36c2d6'];

function buildOperatorEditor() {
  const ed = $('op-editor');
  const sec = (title, inner, full) => `<div class="op-sec ${full ? 'full' : ''}"><h4>${title}</h4>${inner}</div>`;
  const opts = (key) => `<div class="opts" data-key="${key}">${SKIN_OPTIONS[key].map(v => `<button class="opt" data-v="${v}">${LABELS[key][v]}</button>`).join('')}</div>`;
  const swatches = (key, list) => `<div class="swatches" data-key="${key}">${list.map(c => `<button class="sw" data-v="${c}" style="background:${c}" title="${c}"></button>`).join('')}<input type="color" data-key="${key}" title="Custom colour"></div>`;
  ed.innerHTML =
    sec('SKIN TONE', swatches('skin', SKIN_TONES), true) +
    sec('HEADGEAR', opts('head')) + sec('FACE', opts('face')) +
    sec('TORSO', opts('vest')) + sec('BACK', opts('back')) +
    sec('SHIRT COLOUR', swatches('shirt', PALETTE)) + sec('PANTS COLOUR', swatches('pants', PALETTE)) +
    sec('GEAR / VEST COLOUR', swatches('gear', PALETTE)) + sec('HEADGEAR COLOUR', swatches('hat', PALETTE)) +
    sec('EXTRAS', `<div class="toggle-row"><button class="opt" data-toggle="knees">KNEE PADS</button><button class="opt" data-toggle="gloves">GLOVES</button><button class="opt" data-toggle="rig">THIGH HOLSTER</button></div>`) +
    sec('PRESETS', `<div class="toggle-row"><button class="opt" id="op-random">RANDOMISE</button><button class="opt" id="op-reset">RESET</button></div>`);
  ed.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const s = { ...profile.skin };
    const wrap = b.closest('[data-key]');
    if (b.dataset.toggle) s[b.dataset.toggle] = !s[b.dataset.toggle];
    else if (b.id === 'op-random') {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      Object.assign(s, { skin: pick(SKIN_TONES), shirt: pick(PALETTE), pants: pick(PALETTE), gear: pick(PALETTE), hat: pick(PALETTE),
        head: pick(SKIN_OPTIONS.head), face: pick(SKIN_OPTIONS.face), vest: pick(SKIN_OPTIONS.vest), back: pick(SKIN_OPTIONS.back),
        knees: Math.random() < 0.5, gloves: Math.random() < 0.5, rig: Math.random() < 0.5 });
    } else if (b.id === 'op-reset') Object.assign(s, DEFAULT_SKIN);
    else if (wrap && b.dataset.v) s[wrap.dataset.key] = b.dataset.v;
    else return;
    sfx.ui();
    setSkin(s);
  });
  ed.addEventListener('input', (e) => {
    if (e.target.type === 'color') setSkin({ ...profile.skin, [e.target.dataset.key]: e.target.value });
  });
  renderOperatorEditor();
}

function setSkin(s) {
  profile.skin = cleanSkin(s);
  save();
  menu.setSkin(profile.skin);
  renderOperatorEditor();
  clearTimeout(setSkin.to);
  setSkin.to = setTimeout(() => net.send({ t: 'loadout', gun: profile.gun, skin: profile.skin }), 300);
}

function renderOperatorEditor() {
  const s = profile.skin;
  document.querySelectorAll('#op-editor [data-key]').forEach(w => {
    const k = w.dataset.key;
    w.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v.toLowerCase() === String(s[k]).toLowerCase()));
    const ci = w.querySelector('input[type=color]');
    if (ci) ci.value = s[k];
  });
  document.querySelectorAll('#op-editor [data-toggle]').forEach(b => b.classList.toggle('active', !!s[b.dataset.toggle]));
}

// ------------------------------------------------------------------ loop
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0, adaptT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (app.freeze) return; // debug: lets a tool render a custom view
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) {
    app.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    // only adapt while the tab is visible and focused (background tabs report fake low FPS)
    if (settings.quality === 'auto' && game.active && document.visibilityState === 'visible' && document.hasFocus()) {
      adaptT++;
      const q = QUALITY.auto;
      if (app.fps < 48 && app.renderScale > q.min + 0.01) { app.renderScale = Math.max(q.min, app.renderScale - 0.1); renderer.setPixelRatio(app.renderScale); adaptT = 0; }
      else if (app.fps > 58 && adaptT > 4 && app.renderScale < q.max - 0.01) { app.renderScale = Math.min(q.max, app.renderScale + 0.05); renderer.setPixelRatio(app.renderScale); adaptT = 0; }
    }
  }
  if (game.active) { game.update(dt, now); game.render(renderer); }
  else if (!document.hidden) { menu.update(dt); menu.render(renderer); }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  if (menu) menu.resize(innerWidth, innerHeight);
  if (game) game.resize(innerWidth, innerHeight);
});

boot();
