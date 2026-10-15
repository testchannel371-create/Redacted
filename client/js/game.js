// In-match client: movement + collision, shooting + hit detection, viewmodel, remote players, HUD, minimap.
import * as THREE from 'three';
import { MAPS, mapData, raycastMap, rayBox, HITBOX } from '../shared/maps.js';
import { MODES, TEAMS, EYE, EYE_CROUCH, F_ALIVE, F_CROUCH, F_MOVE, F_SPRINT, F_ADS, F_RELOAD, F_AIR } from '../shared/core.js';
import { A, makeOperator, setOperatorSkin, setOperatorGun, animateOperator, cloneGun, opMaterial, loadGun, setGunIcon } from './assets.js';
import { buildWorld, applyMapLighting, minimapImage } from './world.js';

const $ = (id) => document.getElementById(id);
const HW = 0.35, STAND_H = 1.8, CROUCH_H = 1.25;
const CUSTOM = ['skin', 'shirt', 'pants', 'gear', 'hat'];
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

function softTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 60);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
  x.fillStyle = g;
  for (let i = 0; i < 7; i++) {
    x.rotate(Math.PI * 2 / 7);
    x.beginPath(); x.moveTo(-9, 0); x.lineTo(0, -62); x.lineTo(9, 0); x.fill();
  }
  x.beginPath(); x.arc(0, 0, 26, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function markerTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = color; x.strokeStyle = 'rgba(0,0,0,0.8)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(16, 30); x.lineTo(4, 10); x.lineTo(28, 10); x.closePath(); x.stroke(); x.fill();
  return new THREE.CanvasTexture(c);
}
const lerpAngle = (a, b, t) => a + ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * t;

export class Game {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.lights = { hemi: new THREE.HemisphereLight(), sun: new THREE.DirectionalLight() };
    this.scene.add(this.lights.hemi, this.lights.sun);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 10, 2);
    this.scene.add(this.flashLight);
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
    this.vmLights = { hemi: new THREE.HemisphereLight(), sun: new THREE.DirectionalLight() };
    this.vmScene.add(this.vmLights.hemi, this.vmLights.sun);
    this.vmFlashLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.vmFlashLight.position.set(0.1, -0.05, -0.8);
    this.vmScene.add(this.vmFlashLight);

    this.players = new Map();   // id -> info
    this.remote = new Map();    // id -> render state
    this.kd = new Map();
    this.active = false;
    this.world = null;
    this.mapId = -1;
    this.me = {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: false, crouch: false, crouchT: 0,
      alive: false, hp: 100, gun: 0, ammo: 0, reserve: 0, reloadT: 0, lastShot: -9, adsT: 0, sprint: false, bloom: 0,
      deadAt: 0, killer: null,
    };
    this.keys = new Set();
    this.mouse = { l: false, r: false, fresh: false, dx: 0, dy: 0 };
    this.recoil = { kick: 0, rot: 0, side: 0 };
    this.sway = { x: 0, y: 0 };
    this.bobT = 0;
    this.sendT = 0;
    this.mmT = 0;
    this.nameT = 0;
    this.timeLeft = 0;
    this.scores = [];
    this.ended = false;
    this.mmCtx = $('minimap').getContext('2d');
    this.markerMats = TEAMS.map(t => new THREE.SpriteMaterial({ map: markerTexture(t.color), depthTest: false, sizeAttenuation: false }));
    this.initFx();
    this.bindInput();
  }

  // ------------------------------------------------------------------ effects pools
  initFx() {
    const tg = new THREE.BoxGeometry(0.03, 0.03, 1).translate(0, 0, 0.5);
    this.tracers = [];
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.visible = false; m.userData.life = 0; m.frustumCulled = false;
      this.scene.add(m); this.tracers.push(m);
    }
    const dust = softTexture('rgba(200,190,170,0.9)', 'rgba(200,190,170,0)');
    const blood = softTexture('rgba(150,10,5,0.95)', 'rgba(120,0,0,0)');
    this.puffs = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dust, transparent: true, depthWrite: false }));
      s.visible = false; s.userData = { life: 0, dust, blood };
      this.scene.add(s); this.puffs.push(s);
    }
    const ft = flashTexture();
    this.flashes = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      s.visible = false; s.userData.life = 0; s.scale.setScalar(0.6);
      this.scene.add(s); this.flashes.push(s);
    }
    this.vmFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.vmFlash.visible = false;
    this.vmFlash.renderOrder = 10;
  }

  tracer(from, to, mine) {
    const t = this.tracers.find(t => !t.visible) || this.tracers[0];
    t.position.copy(from);
    t.lookAt(to);
    t.scale.set(mine ? 0.6 : 1, mine ? 0.6 : 1, Math.max(0.01, from.distanceTo(to)));
    t.material.opacity = mine ? 0.55 : 0.8;
    t.userData.life = 0.06;
    t.visible = true;
  }

  puff(at, blood) {
    const p = this.puffs.find(p => !p.visible) || this.puffs[0];
    p.position.copy(at);
    p.material.map = blood ? p.userData.blood : p.userData.dust;
    p.material.color.set(blood ? 0xffffff : (this.world ? MAPS[this.mapId].ground.c : 0xffffff)).lerp(new THREE.Color(0xffffff), 0.5);
    p.userData.life = p.userData.max = blood ? 0.3 : 0.45;
    p.userData.blood = p.userData.blood || null;
    p.userData.isBlood = blood;
    p.visible = true;
  }

  flash(at) {
    const f = this.flashes.find(f => !f.visible) || this.flashes[0];
    f.position.copy(at);
    f.material.rotation = Math.random() * 6;
    f.userData.life = 0.05;
    f.visible = true;
  }

  updateFx(dt) {
    for (const t of this.tracers) if (t.visible) { t.userData.life -= dt; t.material.opacity *= 0.7; if (t.userData.life <= 0) t.visible = false; }
    for (const p of this.puffs) if (p.visible) {
      p.userData.life -= dt;
      const k = 1 - p.userData.life / p.userData.max;
      p.scale.setScalar((p.userData.isBlood ? 0.35 : 0.25) + k * 0.7);
      p.material.opacity = 1 - k;
      if (p.userData.life <= 0) p.visible = false;
    }
    for (const f of this.flashes) if (f.visible) { f.userData.life -= dt; if (f.userData.life <= 0) f.visible = false; }
    if (this.vmFlash.visible) { this.vmFlash.userData.life -= dt; if (this.vmFlash.userData.life <= 0) this.vmFlash.visible = false; }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 120);
    this.vmFlashLight.intensity = Math.max(0, this.vmFlashLight.intensity - dt * 60);
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Tab') { e.preventDefault(); this.showBoard(true); }
      if (document.pointerLockElement) {
        if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'ShiftLeft', 'KeyR'].includes(e.code)) e.preventDefault();
        this.keys.add(e.code);
        if (e.code === 'KeyR') this.startReload();
        const adm = this.app.admin;
        if (adm?.on && (e.code === 'KeyF' || e.code === 'KeyG') && !e.repeat) {
          if (e.code === 'KeyF') adm.fly = !adm.fly; else adm.esp = !adm.esp;
          this.renderAdmin();
          this.app.sfx.ui();
        }
      }
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Tab') this.showBoard(false);
    });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    addEventListener('mousedown', (e) => {
      if (!this.active || !document.pointerLockElement) return;
      if (e.button === 0) { this.mouse.l = true; this.mouse.fresh = true; }
      if (e.button === 2) this.mouse.r = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    });
    addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
    addEventListener('mousemove', (e) => {
      if (!this.active || !document.pointerLockElement) return;
      // ignore the giant spikes some Chromebooks report on lock
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.active) return;
      const locked = !!document.pointerLockElement;
      $('pause').hidden = locked || this.ended;
      if (locked) $('deploy').hidden = true;
      if (!locked) { this.keys.clear(); this.mouse.l = this.mouse.r = false; }
    });
    $('deploy-btn').onclick = () => this.lock();
    $('pause-resume').onclick = () => this.lock();
    $('pause-leave').onclick = () => this.leave();
  }

  lock() {
    this.app.sfx.init();
    const c = this.app.renderer.domElement;
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { c.requestPointerLock(); } catch {} });
    } catch { try { c.requestPointerLock(); } catch {} }
  }

  // ------------------------------------------------------------------ net messages
  handle(m) {
    switch (m.t) {
      case 'start': return this.onStart(m);
      case 'spawn': return this.onSpawn(m);
      case 's': return this.onSnap(m);
      case 'sc': this.scores = m.s; this.timeLeft = m.tl; this.renderScores(); return;
      case 'fx': return this.onFx(m);
      case 'dmg': return this.onDamage(m);
      case 'hm': return this.onHitmarker(m);
      case 'kill': return this.onKill(m);
      case 'end': return this.onEnd(m);
      case 'pj': this.addPlayer(m.p); return;
      case 'pl': this.removePlayer(m.id); return;
      case 'pi': this.updatePlayer(m.p); return;
      case 'pos': this.me.pos.set(m.x, m.y, m.z); this.me.vel.set(0, 0, 0); return;
    }
  }

  onStart(m) {
    const first = !this.active;
    this.active = true;
    this.mode = MODES[m.mode];
    this.myId = m.you;
    this.myTeam = m.team;
    this.limit = m.limit;
    this.timeLeft = m.time;
    this.scores = m.scores;
    this.ended = false;
    if (this.mapId !== m.map || !this.world) this.loadMap(m.map);
    const ids = new Set(m.players.map(p => p.id));
    for (const id of [...this.remote.keys()]) if (!ids.has(id)) this.removePlayer(id);
    this.players.clear();
    this.kd.clear();
    for (const p of m.players) this.addPlayer(p);
    document.body.classList.add('ingame');
    $('hud').hidden = false;
    $('winner').hidden = true;
    $('scoreboard').hidden = true;
    $('hud-mode').textContent = this.mode.name + (this.mode.teams ? ' · ' + TEAMS[this.myTeam].name : '');
    $('hud-map').textContent = MAPS[m.map].name;
    $('deploy-map').textContent = MAPS[m.map].name;
    $('deploy-sub').textContent = MAPS[m.map].sub + ' · ' + this.mode.name + ' · ROUND ' + m.round;
    this.renderScores();
    if (!document.pointerLockElement) { $('deploy').hidden = false; $('pause').hidden = true; }
    if (first) this.app.onEnterGame();
    this.toastMap(m);
    this.renderAdmin();
  }

  toastMap(m) {
    const el = $('hud-hint');
    el.textContent = MAPS[m.map].name + ' — ' + MAPS[m.map].sub;
    clearTimeout(this.hintTO);
    this.hintTO = setTimeout(() => { el.textContent = ''; }, 3500);
  }

  loadMap(id) {
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
    const map = MAPS[id];
    this.mapId = id;
    this.md = mapData(id);
    // static sun shadows (rendered once per map; off on LOW quality)
    const r = this.app.renderer, wantShadows = this.app.settings.quality !== 'low';
    if (r.shadowMap.enabled !== wantShadows) {
      r.shadowMap.enabled = wantShadows;
      for (const sc of [this.scene, this.vmScene]) sc.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    }
    this.world = buildWorld(map, { lowFx: this.app.settings.quality === 'low' });
    this.scene.add(this.world.group);
    applyMapLighting(this.scene, map, this.lights);
    const sun = this.lights.sun, B = map.half + 14;
    sun.castShadow = wantShadows;
    Object.assign(sun.shadow.camera, { left: -B, right: B, top: B, bottom: -B, near: 1, far: 420 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    this.shadowDirty = true;
    this.vmLights.hemi.color.copy(this.lights.hemi.color);
    this.vmLights.hemi.groundColor.copy(this.lights.hemi.groundColor);
    this.vmLights.hemi.intensity = this.lights.hemi.intensity * 0.9;
    this.vmLights.sun.color.copy(this.lights.sun.color);
    this.vmLights.sun.intensity = this.lights.sun.intensity * 0.8;
    this.vmLights.sun.position.set(0.4, 1, 0.6);
    this.mm = minimapImage(map);
  }

  addPlayer(p) {
    this.players.set(p.id, p);
    if (!this.kd.has(p.id)) this.kd.set(p.id, { k: p.k || 0, d: p.d || 0 });
    if (p.id === this.myId) return;
    const R = this.remote.get(p.id);
    if (R) { R.info = p; this.refreshRemote(R); return; }
    this.remote.set(p.id, { id: p.id, info: p, op: null, buf: [], seen: 0, fireT: -1e9, alive: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, f: 0, marker: null });
  }

  updatePlayer(p) {
    const old = this.players.get(p.id);
    this.players.set(p.id, { ...old, ...p });
    if (p.id === this.myId) return;
    const R = this.remote.get(p.id);
    if (R) { R.info = this.players.get(p.id); this.refreshRemote(R); }
  }

  refreshRemote(R) {
    if (!R.op) return;
    setOperatorSkin(R.op, R.info.skin);
    setOperatorGun(R.op, R.info.gun);
    this.setMarker(R);
  }

  setMarker(R) {
    const friend = this.mode && this.mode.teams && R.info.team === this.myTeam;
    if (friend && !R.marker) {
      R.marker = new THREE.Sprite(this.markerMats[R.info.team]);
      R.marker.scale.set(0.022, 0.022, 1);
      R.marker.position.y = 2.25;
      R.marker.renderOrder = 5;
      R.op.root.add(R.marker);
    } else if (!friend && R.marker) { R.op.root.remove(R.marker); R.marker = null; }
  }

  removePlayer(id) {
    const R = this.remote.get(id);
    if (R && R.op) this.scene.remove(R.op.root);
    this.remote.delete(id);
    this.players.delete(id);
  }

  onSpawn(m) {
    const me = this.me;
    me.pos.set(m.x, m.y, m.z);
    me.vel.set(0, 0, 0);
    me.yaw = m.yaw; me.pitch = 0;
    me.alive = true; me.hp = 100; me.crouch = false;
    me.killer = null;
    this.equip(m.gun);
    document.body.classList.remove('dead');
    $('eliminated').hidden = true;
    $('vignette').style.opacity = 0;
  }

  equip(i) {
    const me = this.me;
    me.gun = i;
    this.g = A.gunData[i];
    me.ammo = this.g.mag;
    me.reserve = this.g.reserve;
    me.reloadT = 0;
    me.lastShot = -9;
    if (A.guns[i]) this.buildViewmodel();
    else {
      // weapon file still downloading: show nothing until it arrives
      if (this.vm) { this.vmScene.remove(this.vm); this.vm = null; }
      loadGun(i).then(() => { if (this.me.gun === i) this.buildViewmodel(); }, () => {});
    }
    setGunIcon($('hud-gun'), i);
    $('hud-gunname').textContent = this.g.name.toUpperCase();
  }

  onSnap(m) {
    const now = performance.now();
    if (this.me.alive && m.hp != null) this.me.hp = m.hp;
    for (const e of m.p) {
      const id = e[0];
      if (id === this.myId) continue;
      const R = this.remote.get(id);
      if (!R) continue;
      R.buf.push({ t: now, x: e[1] / 100, y: e[2] / 100, z: e[3] / 100, yaw: e[4] / 1000, pitch: e[5] / 1000, f: e[6] });
      if (R.buf.length > 8) R.buf.shift();
      R.seen = now;
    }
  }

  isEnemyInfo(info) { return this.mode.teams === 0 || info.team !== this.myTeam; }

  onFx(m) {
    if (m.id === this.myId) return;
    const R = this.remote.get(m.id);
    if (!R || !R.op) return;
    R.fireT = performance.now();
    const from = v1.copy(R.pos);
    from.y += (R.f & F_CROUCH) ? EYE_CROUCH : EYE;
    if (R.op.gun && A.guns[R.op.gunIndex]) { R.op.gun.updateWorldMatrix(true, false); R.op.gun.localToWorld(v2.copy(A.guns[R.op.gunIndex].muzzle)); }
    else v2.copy(from);
    const d = v3.set(m.d[0] / 1000, m.d[1] / 1000, m.d[2] / 1000);
    const end = from.clone().addScaledVector(d, m.l || 100);
    this.tracer(v2, end, false);
    this.flash(v2);
    if (m.l < 150) this.puff(end, false);
    const g = A.gunData[R.info.gun];
    const dist = R.pos.distanceTo(this.me.pos);
    // stereo pan from relative bearing
    const dx = R.pos.x - this.me.pos.x, dz = R.pos.z - this.me.pos.z;
    const right = dx * Math.cos(this.me.yaw) - dz * Math.sin(this.me.yaw);
    this.app.sfx.shot(g.cat, { dist, pan: right / (dist + 1), supp: g.vis.supp });
  }

  onDamage(m) {
    const me = this.me;
    me.hp = m.hp;
    const v = $('vignette');
    v.style.opacity = Math.min(1, (100 - m.hp) / 80 + 0.25);
    clearTimeout(this.vigTO);
    this.vigTO = setTimeout(() => { v.style.opacity = Math.max(0, (100 - this.me.hp) / 140); }, 450);
    const dx = m.x / 100 - me.pos.x, dz = m.z / 100 - me.pos.z;
    const fwd = dx * -Math.sin(me.yaw) + dz * -Math.cos(me.yaw);
    const rgt = dx * Math.cos(me.yaw) + dz * -Math.sin(me.yaw);
    const ang = Math.atan2(rgt, fwd);
    const el = document.createElement('div');
    el.className = 'dmg-ind';
    el.style.transform = `rotate(${ang}rad)`;
    $('dmg-indicators').appendChild(el);
    setTimeout(() => el.remove(), 1200);
    this.app.sfx.hurt();
  }

  onHitmarker(m) {
    const h = $('hitmarker');
    h.classList.remove('show', 'kill');
    void h.offsetWidth;
    h.classList.add('show');
    if (m.k) h.classList.add('kill');
    this.app.sfx.hit(m.h);
    if (m.k) this.app.sfx.kill();
  }

  onKill(m) {
    const kd = (id) => { if (!this.kd.has(id)) this.kd.set(id, { k: 0, d: 0 }); return this.kd.get(id); };
    if (m.k !== m.v) kd(m.k).k++;
    kd(m.v).d++;
    const K = this.players.get(m.k), V = this.players.get(m.v);
    const col = (p) => (p && this.mode.teams ? TEAMS[p.team].color : (p && p.id === this.myId ? '#f5a524' : '#ebe6da'));
    const row = document.createElement('div');
    row.className = 'kf';
    const esc = (s) => String(s ?? '?').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    row.innerHTML = `<span style="color:${col(K)}">${esc(K?.name)}</span><span class="g">[${esc(A.gunData[m.g]?.name)}]</span>${m.h ? '<span class="hs">HEADSHOT</span>' : ''}<span style="color:${col(V)}">${esc(V?.name)}</span>`;
    const kf = $('killfeed');
    kf.appendChild(row);
    while (kf.children.length > 5) kf.firstChild.remove();
    setTimeout(() => row.remove(), 6000);
    if (m.v === this.myId) this.die(K);
    else if (m.k === this.myId) {
      const pop = $('kill-pop');
      pop.innerHTML = `<div class="pop">${m.h ? 'HEADSHOT · ' : ''}ELIMINATED ${esc(V?.name)} <span style="color:#fff">+100</span></div>`;
    }
    this.renderScores();
  }

  die(killer) {
    const me = this.me;
    me.alive = false;
    me.hp = 0;
    me.deadAt = performance.now();
    me.killer = killer ? killer.id : null;
    document.body.classList.add('dead');
    $('eliminated').hidden = false;
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, '');
    $('elim-by').innerHTML = killer && killer.id !== this.myId ? `Eliminated by <b>${esc(killer.name)}</b> · ${esc(A.gunData[killer.gun]?.name)}` : '';
    this.mouse.l = this.mouse.r = false;
    this.app.sfx.eliminated();
  }

  onEnd(m) {
    this.ended = true;
    this.me.alive = false;
    this.me.deadAt = 0;
    this.me.vel.set(0, 0, 0);
    $('eliminated').hidden = true;
    document.body.classList.remove('dead');
    $('pause').hidden = true;
    $('winner').hidden = false;
    const wt = $('win-text');
    if (m.won) {
      wt.textContent = 'WINNER';
      wt.className = 'win-text';
      $('win-sub').textContent = this.mode.teams ? `TEAM ${m.winner} WINS` : 'FIRST PLACE';
      $('win-coins').innerHTML = `<span class="coin-ico"></span>+${m.coins} COINS`;
      this.app.sfx.winner();
      this.app.onCoins(m.coins);
    } else {
      wt.textContent = 'MATCH OVER';
      wt.className = 'win-text lose';
      $('win-sub').textContent = 'WINNER: ' + m.winner;
      $('win-coins').textContent = `Win to earn ${50 + 50 * Math.max(0, Math.ceil((m.players - 10) / 5))} coins (${m.players} players)`;
    }
    let left = m.next;
    $('win-next').textContent = `NEXT MAP IN ${left}`;
    clearInterval(this.nextTI);
    this.nextTI = setInterval(() => {
      left--;
      if (left <= 0 || !this.ended) { clearInterval(this.nextTI); return; }
      $('win-next').textContent = `NEXT MAP IN ${left}`;
    }, 1000);
    this.board = m.board;
    this.showBoard(true, true);
  }

  leave() {
    this.app.net.send({ t: 'leave' });
    this.exit();
    this.app.onLeave();
  }

  exit() {
    this.active = false;
    this.ended = false;
    clearInterval(this.nextTI);
    if (document.pointerLockElement) document.exitPointerLock();
    for (const id of [...this.remote.keys()]) this.removePlayer(id);
    this.players.clear();
    document.body.classList.remove('ingame', 'dead');
    $('hud').hidden = true;
    $('pause').hidden = true;
    $('deploy').hidden = true;
    $('eliminated').hidden = true;
    $('winner').hidden = true;
  }

  // ------------------------------------------------------------------ viewmodel
  buildViewmodel() {
    if (this.vm) this.vmScene.remove(this.vm);
    const i = this.me.gun, gi = A.guns[i], gd = A.gunData[i];
    const vm = new THREE.Group();
    const gun = cloneGun(i);
    vm.add(gun);
    const skin = this.app.profile.skin;
    const part = (name) => {
      const o = A.vm[name].clone(true);
      o.traverse(c => { if (c.isMesh) { c.material = opMaterial(c.userData.mat, CUSTOM.includes(c.userData.mat) ? skin[c.userData.mat] : null); c.frustumCulled = false; } });
      return o;
    };
    const ar = part('vm_arm_R'); ar.position.set(0.005, -0.02, 0.02); vm.add(ar);
    const al = part('vm_arm_L'); al.position.copy(gi.lh); al.position.y -= 0.025; vm.add(al);
    if (skin.gloves) {
      const gr = part('vm_glove_R'); gr.position.copy(ar.position); vm.add(gr);
      const gl = part('vm_glove_L'); gl.position.copy(al.position); vm.add(gl);
    }
    this.vmFlash.position.copy(gi.muzzle);
    this.vmFlash.position.z -= 0.04;
    vm.add(this.vmFlash);
    const pistol = gd.cat === 'pistol';
    const S = 0.6; // viewmodel scale: real-size guns look huge this close to the eye
    vm.scale.setScalar(S);
    this.vmPose = {
      hip: new THREE.Vector3(pistol ? 0.1 : 0.13, pistol ? -0.12 : -0.15, pistol ? -0.4 : -0.42),
      ads: new THREE.Vector3(0, -gi.sight * S, pistol ? -0.36 : -0.34),
    };
    vm.position.copy(this.vmPose.hip);
    this.vm = vm;
    this.vmGun = gun;
    this.vmScene.add(vm);
  }

  // ------------------------------------------------------------------ weapons
  startReload() {
    const me = this.me, g = this.g;
    if (!me.alive || me.reloadT > 0 || me.ammo >= g.mag || me.reserve <= 0) return;
    me.reloadT = g.reload;
    this.app.sfx.reload();
  }

  fire(now) {
    const me = this.me, g = this.g;
    if (now - me.lastShot < 60 / g.rpm || me.reloadT > 0) return;
    if (me.ammo <= 0) {
      if (this.mouse.fresh) { this.app.sfx.dry(); this.startReload(); }
      this.mouse.fresh = false;
      return;
    }
    if (!g.auto && !this.mouse.fresh) return;
    this.mouse.fresh = false;
    me.lastShot = now;
    me.ammo--;
    me.sprintLock = 0.25;

    const cam = this.camera;
    const o = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = v1.set(1, 0, 0).applyQuaternion(cam.quaternion).clone();
    const up = v2.set(0, 1, 0).applyQuaternion(cam.quaternion).clone();
    const moving = Math.hypot(me.vel.x, me.vel.z) > 1;
    let spread = g.spread * (1 - me.adsT * (g.scoped ? 0.985 : 0.65));
    if (moving) spread *= 1.5;
    if (!me.onGround) spread *= 2.2;
    if (me.crouch) spread *= 0.75;
    spread += me.bloom;
    const muzzle = this.muzzleWorld();
    const hits = new Map();
    let firstDir = null, firstLen = 0;
    const tmp = new THREE.Vector3();
    for (let p = 0; p < g.pellets; p++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const dir = tmp.copy(fwd).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize().clone();
      const mapT = raycastMap(this.md, o.x, o.y, o.z, dir.x, dir.y, dir.z, 300);
      let best = mapT, hitId = null, head = false;
      for (const R of this.remote.values()) {
        if (!R.alive || !R.op || !this.isEnemyInfo(R.info)) continue;
        const s = (R.f & F_CROUCH) ? HITBOX.crouchScale : 1;
        const px = R.pos.x, py = R.pos.y, pz = R.pos.z;
        const hh = HITBOX.headHalf, hy = py + HITBOX.headY * s;
        const th = rayBox(o.x, o.y, o.z, dir.x, dir.y, dir.z, px - hh, hy - hh, pz - hh, px + hh, hy + hh, pz + hh);
        if (th >= 0 && th < best) { best = th; hitId = R.id; head = true; }
        const [bx, by, bz] = HITBOX.bodyHalf, cy = py + HITBOX.bodyY * s;
        const tb = rayBox(o.x, o.y, o.z, dir.x, dir.y, dir.z, px - bx, cy - by * s, pz - bz, px + bx, cy + by * s, pz + bz);
        if (tb >= 0 && tb < best) { best = tb; hitId = R.id; head = false; }
      }
      const end = o.clone().addScaledVector(dir, best);
      if (hitId != null) {
        const key = hitId * 2 + (head ? 1 : 0);
        hits.set(key, (hits.get(key) || 0) + 1);
        this.puff(end, true);
      } else if (mapT < 300) this.puff(end, false);
      if (p < 3) this.tracer(muzzle, end, true);
      if (!firstDir) { firstDir = dir; firstLen = best; }
    }
    const h = [...hits].map(([key, n]) => [Math.floor(key / 2), key % 2, n]);
    this.app.net.send({ t: 'sh', d: [+firstDir.x.toFixed(4), +firstDir.y.toFixed(4), +firstDir.z.toFixed(4)], l: Math.round(firstLen), h });
    this.app.sfx.shot(g.cat, { supp: g.vis.supp });
    // recoil
    const rk = g.recoil * (1 - me.adsT * 0.35) * (0.85 + Math.random() * 0.3);
    me.pitch = Math.min(1.55, me.pitch + rk);
    me.yaw += (Math.random() - 0.5) * rk * 0.6;
    me.bloom = Math.min(g.spread * 1.5, me.bloom + g.spread * 0.12);
    this.recoil.kick += 0.03 + g.recoil * 0.5;
    this.recoil.rot += 0.04 + g.recoil * 1.2;
    this.vmFlash.visible = !g.vis.supp;
    this.vmFlash.userData.life = 0.045;
    this.vmFlash.material.rotation = Math.random() * 6;
    this.vmFlash.scale.setScalar(g.cat === 'pistol' ? 0.16 : 0.24);
    if (!g.vis.supp) { this.flashLight.position.copy(o).addScaledVector(fwd, 1); this.flashLight.intensity = 5; this.vmFlashLight.intensity = 3; }
    if (me.ammo === 0) setTimeout(() => this.startReload(), 250);
  }

  muzzleWorld() {
    // viewmodel muzzle (camera space) mapped into world space
    if (!this.vm) return this.camera.getWorldPosition(new THREE.Vector3());
    this.vm.updateMatrixWorld(true);
    const p = this.vmGun.localToWorld(A.guns[this.me.gun].muzzle.clone());
    return this.camera.localToWorld(p);
  }

  // ------------------------------------------------------------------ physics
  overlaps(pos, h, list) {
    for (const s of list) {
      if (pos.x + HW > s.minX && pos.x - HW < s.maxX && pos.z + HW > s.minZ && pos.z - HW < s.maxZ && pos.y + h > s.minY && pos.y < s.maxY - 1e-4) return s;
    }
    return null;
  }

  moveAxis(axis, amt, h) {
    const me = this.me, pos = me.pos;
    if (amt === 0) return;
    pos[axis] += amt;
    const list = this.md.query(pos.x - HW - 0.6, pos.z - HW - 0.6, pos.x + HW + 0.6, pos.z + HW + 0.6, this._q || (this._q = []));
    let s = this.overlaps(pos, h, list), guard = 0;
    while (s && guard++ < 6) {
      if (axis === 'y') {
        if (amt < 0) { pos.y = s.maxY; me.onGround = true; } else pos.y = s.minY - h - 1e-3;
        me.vel.y = 0;
      } else {
        // step up onto low obstacles (curbs, small crates)
        const stepH = s.maxY - pos.y;
        if (me.wasGround && stepH > 0 && stepH <= 0.55) {
          const oy = pos.y;
          pos.y = s.maxY + 1e-3;
          if (!this.overlaps(pos, h, list)) { me.stepSmooth = (me.stepSmooth || 0) - stepH; return; }
          pos.y = oy;
        }
        if (axis === 'x') pos.x = amt > 0 ? s.minX - HW - 1e-3 : s.maxX + HW + 1e-3;
        else pos.z = amt > 0 ? s.minZ - HW - 1e-3 : s.maxZ + HW + 1e-3;
        me.vel[axis] = 0;
      }
      s = this.overlaps(pos, h, list);
    }
  }

  updateMe(dt, now) {
    const me = this.me, g = this.g, K = this.keys;
    const locked = !!document.pointerLockElement && !this.ended;
    // look
    const sens = this.app.settings.sens * 0.0022 * (this.camera.fov / this.app.settings.fov);
    me.yaw -= this.mouse.dx * sens;
    me.pitch = Math.max(-1.55, Math.min(1.55, me.pitch - this.mouse.dy * sens));
    this.sway.x += this.mouse.dx * 0.00006; this.sway.y += this.mouse.dy * 0.00006;
    this.mouse.dx = this.mouse.dy = 0;
    if (!me.alive) return;

    const f = locked ? (K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0) : 0;
    const s = locked ? (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0) : 0;
    const flying = !!(this.app.admin?.on && this.app.admin.fly);
    const wantCrouch = locked && K.has('KeyC') && !flying;
    if (wantCrouch) me.crouch = true;
    else if (me.crouch) {
      const list = this.md.query(me.pos.x - 1, me.pos.z - 1, me.pos.x + 1, me.pos.z + 1, []);
      if (!this.overlaps(me.pos, STAND_H, list)) me.crouch = false;
    }
    me.sprintLock = Math.max(0, (me.sprintLock || 0) - dt);
    const ads = locked && this.mouse.r && me.reloadT <= 0;
    me.sprint = !flying && locked && K.has('ShiftLeft') && f > 0 && !ads && !me.crouch && me.sprintLock <= 0 && !this.mouse.l;
    const speed = (me.sprint ? 7.4 : me.crouch ? 2.9 : ads ? 3.4 : 5.3) * g.move;
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
    if (flying) {
      // admin fly: no gravity or collisions, move where you look; SPACE up, C down, SHIFT fast
      const cp = Math.cos(me.pitch), up = locked ? (K.has('Space') ? 1 : 0) - (K.has('KeyC') ? 1 : 0) : 0;
      let vx = -sy * cp * f + cy * s, vy = Math.sin(me.pitch) * f + up, vz = -cy * cp * f - sy * s;
      const l = Math.hypot(vx, vy, vz);
      const fs = (locked && K.has('ShiftLeft') ? 34 : 13) / Math.max(1, l);
      const lim = this.md.map.half + 38;
      me.pos.x = Math.max(-lim, Math.min(lim, me.pos.x + vx * fs * dt));
      me.pos.y = Math.max(0, Math.min(190, me.pos.y + vy * fs * dt));
      me.pos.z = Math.max(-lim, Math.min(lim, me.pos.z + vz * fs * dt));
      me.vel.set(0, 0, 0);
      me.onGround = me.pos.y <= 0.01;
      me.crouch = false;
    } else {
      let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
      const wl = Math.hypot(wx, wz);
      if (wl > 0) { wx /= wl; wz /= wl; }
      const acc = me.onGround ? 13 : 2.5;
      const k = Math.min(1, acc * dt);
      me.vel.x += (wx * speed - me.vel.x) * k;
      me.vel.z += (wz * speed - me.vel.z) * k;
      if (locked && K.has('Space') && me.onGround) { me.vel.y = 7.2; me.onGround = false; }
      me.vel.y -= 22 * dt;
      const h = me.crouch ? CROUCH_H : STAND_H;
      me.wasGround = me.onGround; // remembered so stairs / curbs can be stepped onto this frame
      me.onGround = false;
      this.moveAxis('x', me.vel.x * dt, h);
      this.moveAxis('z', me.vel.z * dt, h);
      this.moveAxis('y', me.vel.y * dt, h);
      if (me.pos.y <= 0) { me.pos.y = 0; me.vel.y = 0; me.onGround = true; }
    }
    me.stepSmooth = (me.stepSmooth || 0) * Math.exp(-dt * 14);

    // weapon
    me.adsT += ((ads && !me.sprint ? 1 : 0) - me.adsT) * Math.min(1, dt * (g.scoped ? 9 : 12));
    me.bloom *= Math.exp(-dt * 6);
    if (me.reloadT > 0) {
      me.reloadT -= dt;
      if (me.reloadT <= 0) {
        const take = Math.min(g.mag - me.ammo, me.reserve);
        me.ammo += take; me.reserve -= take; me.reloadT = 0;
      }
    }
    if (locked && this.mouse.l && !me.sprint) this.fire(now / 1000);

    // network (20 Hz)
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.05;
      const moving = Math.hypot(me.vel.x, me.vel.z) > 0.6;
      const fl = (me.crouch ? F_CROUCH : 0) | (moving ? F_MOVE : 0) | (me.sprint ? F_SPRINT : 0) | (me.adsT > 0.5 ? F_ADS : 0) | (me.reloadT > 0 ? F_RELOAD : 0) | (me.onGround ? 0 : F_AIR);
      this.app.net.send({ t: 'in', x: +me.pos.x.toFixed(3), y: +me.pos.y.toFixed(3), z: +me.pos.z.toFixed(3), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), f: fl });
    }
  }

  updateCamera(dt, now) {
    const me = this.me;
    me.crouchT += ((me.crouch ? 1 : 0) - me.crouchT) * Math.min(1, dt * 12);
    let eye = EYE + (EYE_CROUCH - EYE) * me.crouchT + (me.stepSmooth || 0);
    let yaw = me.yaw, pitch = me.pitch, roll = 0;
    if (!me.alive && me.deadAt) {
      const t = Math.min(1, (now - me.deadAt) / 900);
      eye = EYE - t * 1.25;
      roll = t * 0.35;
      const K = me.killer != null ? this.remote.get(me.killer) : null;
      if (K) {
        const want = Math.atan2(-(K.pos.x - me.pos.x), -(K.pos.z - me.pos.z));
        me.yaw = lerpAngle(me.yaw, want, Math.min(1, dt * 3));
        me.pitch += (0.15 - me.pitch) * Math.min(1, dt * 3);
        yaw = me.yaw; pitch = me.pitch;
      }
    }
    this.camera.position.set(me.pos.x, me.pos.y + eye, me.pos.z);
    this.camera.rotation.set(pitch, yaw, roll);
    const base = this.app.settings.fov;
    const zoom = this.g ? this.g.zoom : 1;
    const fov = base / (1 + (zoom - 1) * me.adsT);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  updateViewmodel(dt, now) {
    const me = this.me, vm = this.vm;
    if (!vm) return;
    const scoped = this.g.scoped && me.adsT > 0.85;
    vm.visible = me.alive && !scoped;
    $('scope').hidden = !(scoped && me.alive);
    $('crosshair').classList.toggle('hide', me.adsT > 0.4 || !me.alive);
    if (!vm.visible) return;
    const P = this.vmPose;
    const t = me.adsT;
    const moving = me.onGround && Math.hypot(me.vel.x, me.vel.z) > 0.8;
    this.bobT += dt * (moving ? (me.sprint ? 14 : 9.5) : 1.4);
    const bobAmt = (moving ? (me.sprint ? 1.8 : 1) : 0.15) * (1 - t * 0.85);
    this.recoil.kick *= Math.exp(-dt * 16);
    this.recoil.rot *= Math.exp(-dt * 13);
    this.sway.x *= Math.exp(-dt * 8); this.sway.y *= Math.exp(-dt * 8);
    const sw = 1 - t * 0.7;
    vm.position.set(
      P.hip.x + (P.ads.x - P.hip.x) * t + Math.sin(this.bobT) * 0.012 * bobAmt - this.sway.x * sw,
      P.hip.y + (P.ads.y - P.hip.y) * t - Math.abs(Math.cos(this.bobT)) * 0.009 * bobAmt + this.sway.y * sw - (me.stepSmooth || 0) * 0.1,
      P.hip.z + (P.ads.z - P.hip.z) * t + this.recoil.kick * (1 - t * 0.5),
    );
    let rx = this.recoil.rot * (1 - t * 0.6), ry = (1 - t) * 0.03, rz = 0;
    if (me.reloadT > 0) {
      const p = 1 - me.reloadT / this.g.reload;
      const k = Math.sin(Math.min(1, p) * Math.PI);
      rx -= k * 0.7; rz += k * 0.35;
      vm.position.y -= k * 0.08;
    }
    me.sprintT = (me.sprintT || 0) + (((me.sprint && moving) ? 1 : 0) - (me.sprintT || 0)) * Math.min(1, dt * 9);
    rx -= me.sprintT * 0.35; ry += me.sprintT * 0.75; vm.position.x += me.sprintT * 0.03; vm.position.y -= me.sprintT * 0.04;
    vm.rotation.set(rx, ry, rz);
  }

  updateRemotes(dt, now) {
    const rt = now - 110;
    for (const R of this.remote.values()) {
      const b = R.buf;
      if (!b.length || now - R.seen > 700) { if (R.op) R.op.root.visible = false; continue; }
      if (!R.op) {
        R.op = makeOperator(R.info.skin);
        setOperatorGun(R.op, R.info.gun);
        this.scene.add(R.op.root);
        this.setMarker(R);
      }
      let a = b[0], c = b[b.length - 1], k = 0;
      if (rt <= a.t) c = a;
      else if (rt >= c.t) a = c;
      else for (let i = 0; i < b.length - 1; i++) if (b[i].t <= rt && rt < b[i + 1].t) { a = b[i]; c = b[i + 1]; k = (rt - a.t) / (c.t - a.t); break; }
      const alive = !!(c.f & F_ALIVE);
      if (alive && !R.alive && b.length > 1) { R.buf = [b[b.length - 1]]; a = c = R.buf[0]; k = 0; }
      R.alive = alive;
      R.pos.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
      R.yaw = lerpAngle(a.yaw, c.yaw, k);
      R.pitch = a.pitch + (c.pitch - a.pitch) * k;
      R.f = c.f || a.f;
      const op = R.op;
      op.root.visible = true;
      op.root.position.copy(R.pos);
      op.root.rotation.y = R.yaw;
      const far = R.pos.distanceToSquared(this.me.pos) > 2500;
      if (!far || (this.frame & 1)) {
        animateOperator(op, { moving: !!(R.f & F_MOVE), sprint: !!(R.f & F_SPRINT), crouch: !!(R.f & F_CROUCH), pitch: R.pitch, dead: !alive, dt: far ? dt * 2 : dt });
      }
      if (!alive) op.root.position.y = R.pos.y + (op.deadT * 0.15);
      op.shadow.visible = alive;
      if (R.marker) R.marker.visible = alive;
    }
  }

  // ------------------------------------------------------------------ HUD
  renderScores() {
    const el = $('hud-scores');
    if (!this.mode) return;
    let html = '';
    if (this.mode.teams) {
      this.scores.forEach((s, i) => {
        html += `<div class="sc-row ${i === this.myTeam ? 'mine' : ''}"><span style="color:${TEAMS[i].color}">${TEAMS[i].name}</span><span class="bar"><i style="width:${Math.min(100, s / this.limit * 100)}%;background:${TEAMS[i].color}"></i></span><b>${s}</b></div>`;
      });
    } else {
      const top = this.scores || [];
      const mine = this.kd.get(this.myId)?.k ?? 0;
      const esc = (s) => String(s ?? '').replace(/[&<>]/g, '');
      top.forEach(([id, k]) => {
        const p = this.players.get(id);
        html += `<div class="sc-row ${id === this.myId ? 'mine' : ''}"><span>${esc(p?.name).slice(0, 9)}</span><span class="bar"><i style="width:${Math.min(100, k / this.limit * 100)}%;background:${id === this.myId ? '#f5a524' : '#ebe6da'}"></i></span><b>${k}</b></div>`;
      });
      if (!top.some(([id]) => id === this.myId)) html += `<div class="sc-row mine"><span>YOU</span><span class="bar"><i style="width:${Math.min(100, mine / this.limit * 100)}%;background:#f5a524"></i></span><b>${mine}</b></div>`;
    }
    el.innerHTML = html;
  }

  showBoard(show, final) {
    const el = $('scoreboard');
    if (!show) { if (!this.ended) el.hidden = true; return; }
    if (!this.active) return;
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, '');
    let rows = final && this.board ? this.board : [...this.players.values()].map(p => ({ ...p, k: this.kd.get(p.id)?.k ?? 0, d: this.kd.get(p.id)?.d ?? 0 }));
    rows = rows.slice().sort((a, b) => (this.mode.teams ? a.team - b.team : 0) || b.k - a.k);
    const body = rows.slice(0, 24).map(p => `<tr class="${p.id === this.myId ? 'me' : ''}"><td>${this.mode.teams ? `<span class="tdot" style="background:${TEAMS[p.team].color}"></span>` : ''}${esc(p.name)}</td><td class="n">${p.k}</td><td class="n">${p.d}</td><td class="n">${p.k * 100}</td></tr>`).join('');
    el.innerHTML = `<h3><span>${this.mode.name}</span><span>${MAPS[this.mapId].name}</span></h3><table><tr><th>OPERATOR</th><th class="n">KILLS</th><th class="n">DEATHS</th><th class="n">SCORE</th></tr>${body}</table>`;
    el.hidden = false;
    el.classList.toggle('final', !!final);
  }

  updateHud(dt, now) {
    const me = this.me, g = this.g;
    if (!g) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    const tl = Math.ceil(this.timeLeft);
    const ts = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
    if (this._ts !== ts) { $('hud-timer').textContent = ts; this._ts = ts; }
    if (this._am !== me.ammo) { const e = $('ammo-mag'); e.textContent = me.ammo; e.classList.toggle('low', me.ammo <= Math.ceil(g.mag * 0.25)); this._am = me.ammo; }
    if (this._ar !== me.reserve) { $('ammo-res').textContent = me.reserve; this._ar = me.reserve; }
    const hint = me.reloadT > 0 ? 'RELOADING' : (me.ammo === 0 && me.reserve === 0 ? 'NO AMMO' : (me.ammo <= Math.ceil(g.mag * 0.25) ? 'PRESS R TO RELOAD' : ''));
    if (this._rh !== hint) { $('reload-hint').textContent = hint; this._rh = hint; }
    const hp = Math.max(0, Math.round(me.hp));
    if (this._hp !== hp) { const e = $('hp-fill'); e.style.width = hp + '%'; e.classList.toggle('low', hp < 35); this._hp = hp; }
    if (!me.alive && me.deadAt && !this.ended) {
      const left = Math.max(0, 4 - (now - me.deadAt) / 1000);
      $('elim-timer').textContent = left > 0.05 ? `RESPAWN IN ${left.toFixed(1)}` : 'RESPAWNING…';
    }
    // dynamic crosshair gap
    const moving = Math.hypot(me.vel.x, me.vel.z) > 1;
    const gap = 6 + (g.spread * (moving ? 1.5 : 1) * (me.onGround ? 1 : 2.2) + me.bloom) * 380;
    $('crosshair').style.setProperty('--g', gap.toFixed(1) + 'px');
    // name under crosshair (10 Hz)
    this.nameT -= dt;
    if (this.nameT <= 0) { this.nameT = 0.1; this.updateTargetName(); }
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 0.05; this.drawMinimap(now); }
    if (this.app.settings.showFps) $('fps').textContent = Math.round(this.app.fps) + ' FPS · ' + this.app.renderScale.toFixed(2) + 'x';
  }

  updateTargetName() {
    const el = $('target-name');
    if (!this.me.alive || !this.mode) { el.textContent = ''; return; }
    const o = this.camera.position, d = this.camera.getWorldDirection(v3);
    const mapT = raycastMap(this.md, o.x, o.y, o.z, d.x, d.y, d.z, 70);
    let best = mapT, who = null;
    for (const R of this.remote.values()) {
      if (!R.alive || !R.op || !R.op.root.visible) continue;
      const s = (R.f & F_CROUCH) ? HITBOX.crouchScale : 1;
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, R.pos.x - 0.4, R.pos.y, R.pos.z - 0.4, R.pos.x + 0.4, R.pos.y + 1.85 * s, R.pos.z + 0.4);
      if (t >= 0 && t < best) { best = t; who = R; }
    }
    const enemy = who && this.isEnemyInfo(who.info);
    el.textContent = who ? who.info.name : '';
    el.classList.toggle('friend', !!who && !enemy);
    $('crosshair').classList.toggle('enemy', !!enemy);
  }

  drawMinimap(now) {
    const c = this.mmCtx, me = this.me, W = 200, S = 2.6;
    const map = MAPS[this.mapId];
    c.clearRect(0, 0, W, W);
    c.save();
    c.translate(W / 2, W / 2);
    c.rotate(me.yaw);
    const k = S / this.mm.scale;
    c.drawImage(this.mm.canvas, (-map.half - me.pos.x) * S, (-map.half - me.pos.z) * S, this.mm.canvas.width * k, this.mm.canvas.height * k);
    for (const R of this.remote.values()) {
      if (!R.alive || now - R.seen > 700) continue;
      const friend = this.mode.teams && R.info.team === this.myTeam;
      const firing = now - R.fireT < 2200;
      if (!friend && !firing) continue;
      const x = (R.pos.x - me.pos.x) * S, y = (R.pos.z - me.pos.z) * S;
      c.fillStyle = friend ? TEAMS[R.info.team].color : '#ff3b2b';
      c.beginPath(); c.arc(x, y, friend ? 4 : 4.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.2; c.stroke();
    }
    c.restore();
    // view cone + player arrow
    const fovHalf = (this.camera.fov * (W / 2) / 100) * Math.PI / 360;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.beginPath(); c.moveTo(W / 2, W / 2); c.arc(W / 2, W / 2, 90, -Math.PI / 2 - fovHalf * 1.4, -Math.PI / 2 + fovHalf * 1.4); c.closePath(); c.fill();
    c.fillStyle = '#f5a524';
    c.beginPath(); c.moveTo(W / 2, W / 2 - 8); c.lineTo(W / 2 + 5.5, W / 2 + 6); c.lineTo(W / 2, W / 2 + 3); c.lineTo(W / 2 - 5.5, W / 2 + 6); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 1; c.stroke();
  }

  // ------------------------------------------------------------------ admin
  renderAdmin() {
    const a = this.app.admin, el = $('admin-ind');
    el.hidden = !a?.on;
    if (a?.on) el.textContent = 'ADMIN' + (a.fly ? ' · FLY' : '') + (a.esp ? ' · ESP' : '') + (!a.fly && !a.esp ? ' · F = FLY · G = ESP' : '');
  }

  // ESP: a box, name and distance for every player, drawn on top of everything (through walls)
  drawEsp() {
    const cv = $('esp'), a = this.app.admin;
    if (!(a?.on && a.esp)) {
      if (this._espOn) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); this._espOn = false; }
      return;
    }
    this._espOn = true;
    const W = innerWidth, H = innerHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d');
    c.clearRect(0, 0, W, H);
    const cam = this.camera;
    cam.updateMatrixWorld();
    c.font = '600 13px Rajdhani, sans-serif';
    c.textAlign = 'center';
    const toScreen = (x, y, z) => {
      v3.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
      if (v3.z > -0.2) return null; // behind the camera
      v3.applyMatrix4(cam.projectionMatrix);
      return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * H];
    };
    const now = performance.now();
    for (const R of this.remote.values()) {
      if (!R.alive || !R.buf.length || now - R.seen > 1500) continue;
      const s = (R.f & F_CROUCH) ? HITBOX.crouchScale : 1;
      const top = toScreen(R.pos.x, R.pos.y + 1.9 * s, R.pos.z), bot = toScreen(R.pos.x, R.pos.y, R.pos.z);
      if (!top || !bot) continue;
      const h = Math.max(6, bot[1] - top[1]), w = h * 0.45;
      const enemy = this.isEnemyInfo(R.info);
      const col = enemy ? '#ff3b2b' : (this.mode.teams ? TEAMS[R.info.team].color : '#4aa8ff');
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3; c.strokeRect(top[0] - w / 2, top[1], w, h);
      c.strokeStyle = col; c.lineWidth = 1.5; c.strokeRect(top[0] - w / 2, top[1], w, h);
      const label = `${R.info.name} · ${Math.round(R.pos.distanceTo(this.me.pos))}m`;
      c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillText(label, top[0] + 1, top[1] - 4);
      c.fillStyle = col; c.fillText(label, top[0], top[1] - 5);
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt, now) {
    if (!this.active || !this.md) return;
    this.frame = (this.frame || 0) + 1;
    if (this.g) this.updateMe(dt, now);
    this.updateCamera(dt, now);
    this.updateRemotes(dt, now);
    if (this.g) this.updateViewmodel(dt, now);
    this.updateFx(dt);
    if (this.world) this.world.update(dt, this.camera.position);
    this.updateHud(dt, now);
    this.drawEsp();
  }

  resize(w, h) {
    this.camera.aspect = this.vmCam.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCam.updateProjectionMatrix();
  }

  render(r) {
    if (this.shadowDirty) { r.shadowMap.needsUpdate = true; this.shadowDirty = false; }
    r.render(this.scene, this.camera);
    if (this.vm && this.vm.visible) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vmScene, this.vmCam);
      r.autoClear = true;
    }
  }
}
