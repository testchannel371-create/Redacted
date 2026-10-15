// Renders a map: procedural textures, all boxes merged into one mesh per material (a handful of draw calls),
// fake ambient occlusion baked into vertex colours, ground with holes for water, sky + clouds,
// distant scenery, weather particles, smoke and painted signs. Static sun shadows are set up by game.js.
import * as THREE from 'three';

// ------------------------------------------------------------------ procedural textures (generated once)
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const TEX = {};

function canvasTex(key, S, draw, { alpha = false, srgb = true } = {}) {
  if (TEX[key]) return TEX[key];
  seed = 12345 + key.length * 977;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  draw(x, S);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.premultiplyAlpha = false;
  TEX[key] = t;
  return t;
}
function noise(x, S, amp, mono = true) {
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    d[i] += n; d[i + 1] += mono ? n : (rnd() - 0.5) * amp; d[i + 2] += mono ? n : (rnd() - 0.5) * amp;
  }
  x.putImageData(img, 0, 0);
}
function blotches(x, S, n, rgb, a0, a1, r0, r1) {
  for (let i = 0; i < n; i++) {
    const px = rnd() * S, py = rnd() * S, r = r0 + rnd() * (r1 - r0), a = a0 + rnd() * (a1 - a0);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
    }
  }
}
function cracks(x, S, n, a = 0.25) {
  x.strokeStyle = `rgba(40,35,30,${a})`; x.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    let px = rnd() * S, py = rnd() * S;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (rnd() - 0.5) * 22; py += (rnd() - 0.5) * 22; x.lineTo(px, py); }
    x.stroke();
  }
}
const shade = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;

const GEN = {
  plaster: () => canvasTex('plaster', 256, (x, S) => { x.fillStyle = '#ebe7de'; x.fillRect(0, 0, S, S); noise(x, S, 14); blotches(x, S, 40, '90,80,65', 0.04, 0.12, 10, 50); cracks(x, S, 10, 0.18); }),
  stone: () => canvasTex('stone', 256, (x, S) => {
    x.fillStyle = '#8a857c'; x.fillRect(0, 0, S, S);
    const rh = 32;
    for (let r = 0; r < S / rh; r++) {
      let px = -rnd() * 40;
      while (px < S) {
        const w = 36 + rnd() * 52, v = 196 + rnd() * 40;
        x.fillStyle = shade(v); x.fillRect(px + 2, r * rh + 2, w - 3, rh - 3);
        x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(px + 2, r * rh + 2, w - 3, 2);
        x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(px + 2, r * rh + rh - 4, w - 3, 2);
        px += w;
      }
    }
    noise(x, S, 22); blotches(x, S, 30, '70,65,55', 0.04, 0.1, 8, 30);
  }),
  brick: () => canvasTex('brick', 256, (x, S) => {
    x.fillStyle = '#ece8e0'; x.fillRect(0, 0, S, S);
    const bh = 16, bw = 42;
    for (let r = 0; r < S / bh; r++) for (let c = -1; c < S / bw + 1; c++) {
      const v = 188 + rnd() * 44, px = c * bw + (r % 2) * bw / 2;
      x.fillStyle = shade(v); x.fillRect(px + 2, r * bh + 2, bw - 3, bh - 3);
    }
    noise(x, S, 18); blotches(x, S, 20, '60,50,40', 0.04, 0.1, 10, 40);
  }),
  concrete: () => canvasTex('concrete', 256, (x, S) => {
    x.fillStyle = '#d9d7d1'; x.fillRect(0, 0, S, S); noise(x, S, 20); blotches(x, S, 34, '80,78,70', 0.04, 0.12, 12, 60);
    x.fillStyle = 'rgba(60,58,52,0.35)'; x.fillRect(0, 0, S, 2); x.fillRect(0, 0, 2, S);
    for (let i = 0; i < 12; i++) { const px = rnd() * S; const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(70,65,55,0.12)'); g.addColorStop(1, 'rgba(70,65,55,0)'); x.fillStyle = g; x.fillRect(px, 0, 3 + rnd() * 6, S * rnd()); }
    cracks(x, S, 8, 0.22);
  }),
  panel: () => canvasTex('panel', 256, (x, S) => {
    x.fillStyle = '#dcdad4'; x.fillRect(0, 0, S, S); noise(x, S, 16); blotches(x, S, 20, '80,78,70', 0.04, 0.1, 12, 40);
    x.fillStyle = 'rgba(50,48,44,0.4)';
    for (let i = 0; i <= 2; i++) x.fillRect(0, i * 128, S, 3);
    x.fillRect(0, 0, 3, S); x.fillRect(128, 0, 3, S);
    x.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 4; i++) x.fillRect((i % 2) * 128 + 14, ((i / 2) | 0) * 128 + 14, 100, 100);
    noise(x, S, 6);
  }),
  roof: () => canvasTex('roof', 256, (x, S) => {
    x.fillStyle = '#7a6e66'; x.fillRect(0, 0, S, S);
    const rh = 32, tw = 26;
    for (let r = 0; r < S / rh; r++) for (let c = -1; c < S / tw + 1; c++) {
      const px = c * tw + (r % 2) * tw / 2, v = 200 + rnd() * 40;
      const g = x.createLinearGradient(px, 0, px + tw, 0);
      g.addColorStop(0, shade(v * 0.62)); g.addColorStop(0.45, shade(v)); g.addColorStop(1, shade(v * 0.55));
      x.fillStyle = g; x.fillRect(px, r * rh, tw - 1, rh - 3);
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(px, r * rh + rh - 4, tw, 3);
    }
    noise(x, S, 16); blotches(x, S, 20, '60,55,45', 0.05, 0.14, 10, 40);
  }),
  metal: () => canvasTex('metal', 256, (x, S) => {
    for (let px = 0; px < S; px++) { const v = 200 + Math.sin(px / S * PI2 * 16) * 26; x.fillStyle = shade(v); x.fillRect(px, 0, 1, S); }
    noise(x, S, 12); blotches(x, S, 18, '80,60,40', 0.05, 0.14, 8, 30);
  }),
  wood: () => canvasTex('wood', 256, (x, S) => {
    for (let r = 0; r < S / 32; r++) {
      const v = 190 + rnd() * 40; x.fillStyle = shade(v); x.fillRect(0, r * 32, S, 32);
      x.strokeStyle = 'rgba(60,40,20,0.18)';
      for (let k = 0; k < 6; k++) { x.beginPath(); const yy = r * 32 + 3 + rnd() * 26; x.moveTo(0, yy); for (let px = 0; px <= S; px += 32) x.lineTo(px, yy + (rnd() - 0.5) * 4); x.stroke(); }
      x.fillStyle = 'rgba(30,20,10,0.45)'; x.fillRect(0, r * 32, S, 2);
    }
    noise(x, S, 14);
  }),
  cobble: () => canvasTex('cobble', 256, (x, S) => {
    x.fillStyle = '#8a857c'; x.fillRect(0, 0, S, S);
    const cs = 28;
    for (let r = 0; r < S / cs + 1; r++) for (let c = 0; c < S / cs + 1; c++) {
      const cx = c * cs + (r % 2) * cs / 2 + (rnd() - 0.5) * 5, cy = r * cs + (rnd() - 0.5) * 5, v = 178 + rnd() * 46;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        x.fillStyle = shade(v); x.beginPath(); x.ellipse(cx + ox, cy + oy, cs * 0.44, cs * 0.38, rnd() * 0.5, 0, PI2); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.15)'; x.beginPath(); x.ellipse(cx + ox - 2, cy + oy - 3, cs * 0.26, cs * 0.18, 0, 0, PI2); x.fill();
      }
    }
    noise(x, S, 16);
  }),
  paving: () => canvasTex('paving', 256, (x, S) => {
    x.fillStyle = '#7e7a72'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { x.fillStyle = shade(196 + rnd() * 36); x.fillRect(c * 64 + 2, r * 64 + 2, 61, 61); }
    noise(x, S, 18); blotches(x, S, 26, '60,58,50', 0.05, 0.14, 8, 40); cracks(x, S, 6, 0.2);
  }),
  asphalt: () => canvasTex('asphalt', 256, (x, S) => { x.fillStyle = '#a2a2a2'; x.fillRect(0, 0, S, S); noise(x, S, 40); blotches(x, S, 30, '40,40,40', 0.05, 0.15, 10, 50); cracks(x, S, 12, 0.3); }),
  grass: () => canvasTex('grass', 256, (x, S) => {
    x.fillStyle = '#c4c4c4'; x.fillRect(0, 0, S, S); noise(x, S, 40);
    for (let i = 0; i < 900; i++) { x.strokeStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,40,40'},0.18)`; const px = rnd() * S, py = rnd() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.5) * 3, py - 4 - rnd() * 4); x.stroke(); }
    blotches(x, S, 20, '50,50,30', 0.06, 0.16, 12, 40);
  }),
  snow: () => canvasTex('snow', 256, (x, S) => { x.fillStyle = '#fbfcfe'; x.fillRect(0, 0, S, S); blotches(x, S, 40, '170,190,215', 0.05, 0.16, 10, 60); noise(x, S, 8); }),
  dirt: () => canvasTex('dirt', 256, (x, S) => { x.fillStyle = '#d6cdc0'; x.fillRect(0, 0, S, S); noise(x, S, 30); for (let i = 0; i < 160; i++) { x.fillStyle = shade(120 + rnd() * 100); x.beginPath(); x.arc(rnd() * S, rnd() * S, 1 + rnd() * 2.5, 0, PI2); x.fill(); } }),
  rock: () => canvasTex('rock', 256, (x, S) => { x.fillStyle = '#cdcdcd'; x.fillRect(0, 0, S, S); noise(x, S, 34); blotches(x, S, 40, '40,40,40', 0.06, 0.18, 8, 40); cracks(x, S, 24, 0.35); }),
  foliage: () => canvasTex('foliage', 256, (x, S) => {
    x.fillStyle = '#8e8e8e'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '235,235,235' : '40,40,40'},${0.12 + rnd() * 0.2})`; x.beginPath(); x.ellipse(rnd() * S, rnd() * S, 2 + rnd() * 5, 1.5 + rnd() * 3, rnd() * 3, 0, PI2); x.fill(); }
  }),
  camo: () => canvasTex('camo', 256, (x, S) => {
    x.fillStyle = '#5c6a3e'; x.fillRect(0, 0, S, S);
    for (const col of ['#3d4a2a', '#7a6a44', '#8c8c5c', '#4c5a34']) blotches(x, S, 26, col.match(/\w\w/g).map(h => parseInt(h, 16)).join(','), 0.7, 0.95, 10, 26);
    noise(x, S, 18, false);
  }),
  cloth: () => canvasTex('cloth', 128, (x, S) => { x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, S, S); for (let i = 0; i < S; i += 2) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(i, 0, 1, S); x.fillRect(0, i, S, 1); } noise(x, S, 14); }),
  window: () => canvasTex('window', 128, (x, S) => {
    const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#5b7584'); g.addColorStop(1, '#1d2a33');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.fillStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.moveTo(S * 0.15, 0); x.lineTo(S * 0.45, 0); x.lineTo(S * 0.05, S); x.lineTo(-S * 0.25, S); x.fill();
    x.fillStyle = '#e6e2d8'; x.fillRect(S / 2 - 3, 0, 6, S); x.fillRect(0, S * 0.42, S, 6);
  }),
  litwin: () => canvasTex('litwin', 128, (x, S) => {
    const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#ffe4a8'); g.addColorStop(1, '#e0a050');
    x.fillStyle = g; x.fillRect(0, 0, S, S); blotches(x, S, 6, '120,70,30', 0.2, 0.4, 10, 30);
    x.fillStyle = '#2a2a2a'; x.fillRect(S / 2 - 3, 0, 6, S); x.fillRect(0, S * 0.42, S, 6);
  }),
  facade: () => canvasTex('facade', 256, (x, S) => {
    x.fillStyle = '#e4e0d8'; x.fillRect(0, 0, S, S); noise(x, S, 12);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      x.fillStyle = rnd() < 0.12 ? '#e8c27a' : '#2d3a44'; x.fillRect(c * 42 + 12, r * 42 + 10, 18, 24);
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(c * 42 + 10, r * 42 + 34, 22, 3);
    }
  }),
  fence: () => canvasTex('fence', 128, (x, S) => {
    x.clearRect(0, 0, S, S); x.strokeStyle = 'rgba(70,74,78,1)'; x.lineWidth = 2;
    for (let i = -S; i < S * 2; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); x.beginPath(); x.moveTo(i + S, 0); x.lineTo(i, S); x.stroke(); }
  }),
  water: () => canvasTex('water', 256, (x, S) => {
    x.fillStyle = '#9fb4bc'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(255,255,255,${0.1 + rnd() * 0.25})`; x.lineWidth = 1 + rnd() * 2; const px = rnd() * S, py = rnd() * S, l = 8 + rnd() * 26; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + l / 2, py - 3, px + l, py); x.stroke(); }
    blotches(x, S, 20, '30,50,60', 0.1, 0.25, 15, 50);
  }),
};
const PI2 = Math.PI * 2;

// material key -> { tex, scale (metres per texture repeat), kind }
const MATDEF = {
  plain: { scale: 1 }, paint: { scale: 1, kind: 'paint' }, plaster: { tex: 'plaster', scale: 4 }, stone: { tex: 'stone', scale: 2.6 }, brick: { tex: 'brick', scale: 1.7 },
  concrete: { tex: 'concrete', scale: 3.5 }, panel: { tex: 'panel', scale: 3.2 }, roof: { tex: 'roof', scale: 1.7 }, metal: { tex: 'metal', scale: 1.6 },
  wood: { tex: 'wood', scale: 1.6 }, cobble: { tex: 'cobble', scale: 2.4 }, paving: { tex: 'paving', scale: 2.8 }, asphalt: { tex: 'asphalt', scale: 7 },
  grass: { tex: 'grass', scale: 5 }, snow: { tex: 'snow', scale: 6 }, dirt: { tex: 'dirt', scale: 6 }, rock: { tex: 'rock', scale: 3 }, foliage: { tex: 'foliage', scale: 2.2 },
  camo: { tex: 'camo', scale: 3.5 }, cloth: { tex: 'cloth', scale: 1.2 }, facade: { tex: 'facade', scale: 9 },
  window: { tex: 'window', local: 1, kind: 'glass' }, litwin: { tex: 'litwin', local: 1, kind: 'basic' }, glow: { kind: 'basic' },
  fence: { tex: 'fence', scale: 1.2, kind: 'cutout' }, wire: { tex: 'fence', scale: 0.6, kind: 'cutout' }, water: { tex: 'water', scale: 4, kind: 'glass' },
};

function makeMaterial(key) {
  const def = MATDEF[key] || MATDEF.plain;
  const map = def.tex ? GEN[def.tex]() : null;
  if (def.kind === 'basic') return new THREE.MeshBasicMaterial({ vertexColors: true, map });
  if (def.kind === 'glass') return new THREE.MeshPhongMaterial({ vertexColors: true, map, shininess: 90, specular: 0x555555 });
  if (def.kind === 'paint') return new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: 0x333333 });
  if (def.kind === 'cutout') return new THREE.MeshLambertMaterial({ vertexColors: true, map, alphaTest: 0.5, side: THREE.DoubleSide });
  return new THREE.MeshLambertMaterial({ vertexColors: true, map });
}

// ------------------------------------------------------------------ geometry accumulation
class Acc {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; }
  vert(px, py, pz, nx, ny, nz, u, v, r, g, b) { this.p.push(px, py, pz); this.n.push(nx, ny, nz); this.u.push(u, v); this.c.push(r, g, b); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
const _c = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion();
const _s = new THREE.Vector3(), _t = new THREE.Vector3(), _nm = new THREE.Matrix3();

function colorFor(b, i, wy, ny, def) {
  _c.set(b.c);
  if (def.kind === 'basic' || def.local) return 1;
  let k = 0.9 + hash(i + 1) * 0.14;
  if (!b.flat) k *= 0.58 + 0.42 * Math.min(1, Math.max(0, wy) / 1.7);
  if (ny > 0.6) k *= 1.06;
  return k;
}

function uvFor(def, b, wx, wy, wz, nx, ny, nz) {
  const s = def.scale || 1;
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= ax && ay >= az) return b.uvSwap ? [wz / s, wx / s] : [wx / s, wz / s];
  if (ax >= az) return [wz / s, wy / s];
  return [wx / s, wy / s];
}

const FACES = [ // normal, 4 corners (as -/+ per axis) in CCW order seen from outside
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];
const LUV = [[0, 0], [1, 0], [1, 1], [0, 1]];

function addBox(acc, b, i, def) {
  const hw = b.w / 2, hh = b.h / 2, hd = b.d / 2, cy = b.y + hh;
  const rot = b.rot;
  if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ'));
  const skipBottom = !rot && b.y <= 0.01;
  for (let f = 0; f < 6; f++) {
    if (f === 3 && skipBottom) continue;
    const [fn, corners] = FACES[f];
    _n.set(fn[0], fn[1], fn[2]);
    if (rot) _n.applyQuaternion(_q);
    const pts = corners.map(([sx, sy, sz]) => {
      _v.set(sx * hw, sy * hh, sz * hd);
      if (rot) _v.applyQuaternion(_q);
      return [_v.x + b.x, _v.y + cy, _v.z + b.z];
    });
    const out = pts.map((p, k) => {
      const k2 = colorFor(b, i, p[1], _n.y, def);
      const uv = def.local ? LUV[k] : uvFor(def, b, p[0], p[1], p[2], _n.x, _n.y, _n.z);
      return [p, uv, k2];
    });
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const [p, uv, kk] = out[k];
      acc.vert(p[0], p[1], p[2], _n.x, _n.y, _n.z, uv[0], uv[1], _c.r * kk, _c.g * kk, _c.b * kk);
    }
  }
}

const TEMPLATES = {};
function template(b) {
  const seg = b.seg ?? 12;
  const key = b.s + ':' + seg + ':' + (b.det ?? 0) + ':' + (b.s === 'cyl' && b.r2 != null ? (b.r2 / b.w).toFixed(3) : '');
  if (TEMPLATES[key]) return TEMPLATES[key];
  let g;
  switch (b.s) {
    case 'cyl': g = new THREE.CylinderGeometry(b.r2 != null ? b.r2 / b.w : 0.5, 0.5, 1, seg); break;
    case 'cone': g = new THREE.CylinderGeometry(0, 0.5, 1, seg); break;
    case 'ico': g = new THREE.IcosahedronGeometry(0.5, b.det ?? 0); break;
    case 'dome': g = new THREE.SphereGeometry(0.5, Math.max(seg, 14), 6, 0, PI2, 0, Math.PI / 2); g.scale(1, 2, 1); g.translate(0, -0.5, 0); break;
    case 'dish': { g = new THREE.SphereGeometry(0.5, 16, 4, 0, PI2, 0, 0.9); const y0 = 0.5 * Math.cos(0.9); g.translate(0, -(0.5 + y0) / 2, 0); g.scale(1 / 0.78, 1 / (0.5 - y0), 1 / 0.78); break; }
    case 'tri': {
      g = new THREE.BufferGeometry();
      const P = b.ax === 'z'
        ? [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0, 0.5, -0.5], [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0, 0.5, 0.5]]
        : [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0]];
      const T = b.ax === 'z' ? [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4] : [0, 1, 2, 3, 5, 4, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2];
      g.setAttribute('position', new THREE.Float32BufferAttribute(T.flatMap(i => P[i]), 3));
      break;
    }
    default: g = new THREE.BoxGeometry(1, 1, 1);
  }
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal || ['ico', 'tri', 'dish'].includes(b.s)) g.computeVertexNormals();
  return (TEMPLATES[key] = g);
}

function hipGeometry(w, h, d) {
  const g = new THREE.BufferGeometry();
  const bw = w / 2, bd = d / 2, t = h / 2, bo = -h / 2;
  let P;
  if (w >= d) {
    const r = (w - d) / 2;
    P = [[-bw, bo, bd], [bw, bo, bd], [r, t, 0], [-bw, bo, bd], [r, t, 0], [-r, t, 0],
      [bw, bo, -bd], [-bw, bo, -bd], [-r, t, 0], [bw, bo, -bd], [-r, t, 0], [r, t, 0],
      [bw, bo, bd], [bw, bo, -bd], [r, t, 0], [-bw, bo, -bd], [-bw, bo, bd], [-r, t, 0]];
  } else {
    const r = (d - w) / 2;
    P = [[bw, bo, bd], [bw, bo, -bd], [0, t, -r], [bw, bo, bd], [0, t, -r], [0, t, r],
      [-bw, bo, -bd], [-bw, bo, bd], [0, t, r], [-bw, bo, -bd], [0, t, r], [0, t, -r],
      [-bw, bo, bd], [bw, bo, bd], [0, t, r], [bw, bo, -bd], [-bw, bo, -bd], [0, t, -r]];
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  g.computeVertexNormals();
  return g;
}

function addShape(acc, b, i, def) {
  let g, unit = true;
  if (b.s === 'hip') { g = hipGeometry(b.w, b.h, b.d); unit = false; }
  else g = template(b);
  const pos = g.attributes.position, nor = g.attributes.normal;
  _s.set(unit ? b.w : 1, unit ? b.h : 1, unit ? b.d : 1);
  _q.identity();
  if (b.rot) _q.setFromEuler(_e.set(b.rot[0], b.rot[1], b.rot[2], 'YXZ'));
  _t.set(b.x, b.y + b.h / 2, b.z);
  _m.compose(_t, _q, _s);
  _nm.getNormalMatrix(_m);
  const flat = ['ico', 'tri', 'dish', 'hip'].includes(b.s);
  const emit = (reverse) => {
    for (let t = 0; t < pos.count; t += 3) {
      const tri = reverse ? [t, t + 2, t + 1] : [t, t + 1, t + 2];
      const P = tri.map(k => _v.fromBufferAttribute(pos, k).applyMatrix4(_m).toArray());
      let fnx = 0, fny = 0, fnz = 0;
      if (flat) {
        const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2];
        const bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
        fnx = ay * bz - az * by; fny = az * bx - ax * bz; fnz = ax * by - ay * bx;
        const l = Math.hypot(fnx, fny, fnz) || 1; fnx /= l; fny /= l; fnz /= l;
      }
      tri.forEach((k, j) => {
        if (!flat) { _n.fromBufferAttribute(nor, k).applyMatrix3(_nm).normalize(); if (reverse) _n.negate(); fnx = _n.x; fny = _n.y; fnz = _n.z; }
        const p = P[j];
        const kk = colorFor(b, i, p[1], fny, def);
        const uv = def.local ? [hash(k) , hash(k + 3)] : uvFor(def, b, p[0], p[1], p[2], fnx, fny, fnz);
        acc.vert(p[0], p[1], p[2], fnx, fny, fnz, uv[0], uv[1], _c.r * kk, _c.g * kk, _c.b * kk);
      });
    }
  };
  emit(false);
  if (b.ds) emit(true);
}

// ------------------------------------------------------------------ ground with holes (rectangle subtraction)
function groundRects(outer, holes) {
  const xs = new Set([outer.x0, outer.x1]);
  for (const h of holes) { xs.add(Math.max(outer.x0, Math.min(outer.x1, h.x - h.w / 2))); xs.add(Math.max(outer.x0, Math.min(outer.x1, h.x + h.w / 2))); }
  const X = [...xs].sort((a, b) => a - b), out = [];
  for (let i = 0; i < X.length - 1; i++) {
    const x0 = X[i], x1 = X[i + 1], mx = (x0 + x1) / 2;
    if (x1 - x0 < 1e-3) continue;
    const cuts = holes.filter(h => mx > h.x - h.w / 2 && mx < h.x + h.w / 2).map(h => [h.z - h.d / 2, h.z + h.d / 2]).sort((a, b) => a[0] - b[0]);
    let z = outer.z0;
    for (const [a, b] of cuts) { if (a > z) out.push([x0, z, x1, Math.min(a, outer.z1)]); z = Math.max(z, b); }
    if (z < outer.z1) out.push([x0, z, x1, outer.z1]);
  }
  return out;
}

// ------------------------------------------------------------------ signs
function signTexture(s) {
  const W = 512, Hh = Math.max(64, Math.round(512 * s.h / s.w));
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const x = c.getContext('2d');
  const font = (px) => `700 ${px}px Teko, Impact, 'Arial Narrow', sans-serif`;
  if (s.style === 'emblem') {
    c.height = W;
    x.fillStyle = '#f4f6f8'; x.beginPath(); x.arc(256, 256, 250, 0, PI2); x.fill();
    x.strokeStyle = '#2e4a7a'; x.lineWidth = 18; x.beginPath(); x.arc(256, 256, 226, 0, PI2); x.stroke();
    x.strokeStyle = '#2e6aa8'; x.lineWidth = 14;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.beginPath(); x.moveTo(256, 200); x.lineTo(256 + Math.cos(a) * 110, 200 + Math.sin(a) * 110); x.stroke(); }
    x.fillStyle = '#c8372a'; x.beginPath(); x.moveTo(90, 360); x.quadraticCurveTo(256, 290, 422, 360); x.quadraticCurveTo(256, 330, 90, 380); x.fill();
    x.fillStyle = '#2e6aa8'; x.beginPath(); x.moveTo(110, 400); x.quadraticCurveTo(256, 340, 402, 400); x.quadraticCurveTo(256, 380, 110, 420); x.fill();
  } else if (s.style === 'clock') {
    c.height = W;
    x.fillStyle = '#efe9da'; x.beginPath(); x.arc(256, 256, 244, 0, PI2); x.fill();
    x.strokeStyle = '#2a2622'; x.lineWidth = 16; x.stroke();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.fillStyle = '#2a2622'; x.fillRect(256 + Math.cos(a) * 200 - 8, 256 + Math.sin(a) * 200 - 8, 16, 16); }
    x.lineCap = 'round'; x.lineWidth = 16; x.beginPath(); x.moveTo(256, 256); x.lineTo(256 + 100, 256 - 60); x.stroke();
    x.lineWidth = 10; x.beginPath(); x.moveTo(256, 256); x.lineTo(256 - 30, 256 - 170); x.stroke();
  } else {
    if (s.style === 'banner' || s.style === 'plate') {
      x.fillStyle = s.bg || '#2f7a52'; x.fillRect(0, 0, W, c.height);
      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 6; x.strokeRect(8, 8, W - 16, c.height - 16);
    }
    x.fillStyle = s.fg || '#ffffff';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    let px = c.height * 0.86;
    x.font = font(px);
    while (x.measureText(s.text).width > W * 0.92 && px > 10) { px -= 4; x.font = font(px); }
    if (s.style === 'letters') { x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 6; x.shadowOffsetY = 3; }
    x.fillText(s.text, W / 2, c.height * 0.56);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ distant scenery
function backdrop(map, addBoxes) {
  const H = map.half, list = [];
  let i = 0;
  const R = () => hash(++i * 1.37 + map.id * 11);
  const ring = (n, r0, r1, fn) => { for (let k = 0; k < n; k++) { const a = (k / n) * PI2 + R() * 0.2, r = r0 + R() * (r1 - r0); fn(Math.cos(a) * r, Math.sin(a) * r, a); } };
  const blocked = (x, z, s) => (map.holes || []).some(h => Math.abs(x - h.x) < h.w / 2 + s && Math.abs(z - h.z) < h.d / 2 + s);
  switch (map.backdrop) {
    case 'sea':
      ring(12, 170, 330, (x, z) => { const s = 30 + R() * 60; list.push({ x, z, w: s, d: s * (0.6 + R() * 0.6), h: 18 + R() * 30, y: map.sea.y - 6, c: 0x5f6458, s: 'ico', det: 1, m: 'rock' }); list.push({ x, z, w: s * 0.75, d: s * 0.6, h: 10 + R() * 10, y: map.sea.y + 6, c: 0x4a5a3a, s: 'ico', det: 1, m: 'foliage' }); });
      break;
    case 'snowpeaks':
      ring(26, H + 50, H + 170, (x, z) => { const s = 50 + R() * 70, h = 50 + R() * 70; list.push({ x, z, w: s, d: s, h, y: -4, c: 0x6d7682, s: 'cone', seg: 7, m: 'rock' }); list.push({ x, z, w: s * 0.5, d: s * 0.5, h: h * 0.5, y: -4 + h * 0.5, c: 0xf2f5f8, s: 'cone', seg: 7, m: 'snow' }); });
      break;
    case 'city':
      ring(140, H + 14, H + 150, (x, z) => { if (blocked(x, z, 6)) return; const w = 10 + R() * 14, h = 10 + R() * (R() < 0.15 ? 40 : 18); list.push({ x, z, w, d: w * (0.7 + R() * 0.6), h, y: 0, c: [0x8b4a36, 0xd9cbb0, 0x8d9094, 0x5e3a2c, 0xe4dfd4][(R() * 5) | 0], m: 'facade' }); });
      ring(4, H + 80, H + 140, (x, z) => { list.push({ x, z, w: 8, d: 8, h: 38, y: 0, c: 0x7a3d2c, m: 'brick' }); list.push({ x, z, w: 9, d: 9, h: 16, y: 38, c: 0x40464b, s: 'cone', seg: 4, m: 'metal' }); });
      break;
    case 'industrial':
      ring(60, H + 20, H + 160, (x, z) => { const w = 14 + R() * 20, h = R() < 0.5 ? 25 + R() * 20 : 8 + R() * 10; list.push({ x, z, w, d: 10 + R() * 8, h, y: 0, c: [0xcfccc2, 0xb8b4aa, 0xd8d4ca][(R() * 3) | 0], m: 'facade' }); });
      ring(6, H + 60, H + 150, (x, z) => list.push({ x, z, w: 6, d: 6, h: 60 + R() * 30, y: 0, c: 0x9a6a54, s: 'cyl', m: 'brick', r2: 2 }));
      break;
    case 'hills':
      ring(22, H + 40, H + 120, (x, z) => { const s = 60 + R() * 70; list.push({ x, z, w: s, d: s, h: 16 + R() * 26, y: -6, c: 0x6a7a45, s: 'ico', det: 2, m: 'foliage' }); });
      ring(18, H + 140, H + 260, (x, z) => { const s = 90 + R() * 80; list.push({ x, z, w: s, d: s, h: 70 + R() * 70, y: -4, c: 0x7f8f9c, s: 'cone', seg: 8, m: 'rock' }); });
      ring(30, H + 30, H + 90, (x, z) => { if (R() < 0.4) return; const w = 6 + R() * 5; list.push({ x, z, w, d: w, h: 6 + R() * 4, y: 4 + R() * 10, c: [0xd9b44e, 0xe2d4b4, 0xd98b4b, 0xd8998a][(R() * 4) | 0], m: 'plaster' }); });
      break;
  }
  addBoxes(list);
}

// ------------------------------------------------------------------ world
export function buildWorld(map, opts = {}) {
  const group = new THREE.Group();
  const accs = new Map();
  const addBoxes = (list, base = 0) => list.forEach((b, i) => {
    if (b.inv) return;
    const key = b.glow ? 'glow' : (b.m || 'plain');
    const def = MATDEF[key] || MATDEF.plain;
    if (!accs.has(key)) accs.set(key, new Acc());
    if (b.s) addShape(accs.get(key), b, i + base, def); else addBox(accs.get(key), b, i + base, def);
  });
  addBoxes(map.boxes);
  if (!opts.noBackdrop) backdrop(map, (l) => addBoxes(l, 100000));

  const meshes = [];
  for (const [key, acc] of accs) {
    if (!acc.p.length) continue;
    const mesh = new THREE.Mesh(acc.build(), makeMaterial(key));
    mesh.castShadow = mesh.receiveShadow = !['glow', 'litwin'].includes(key);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    meshes.push(mesh);
  }

  // ground (holes cut out for canals; islands only have the island)
  const H = map.half, far = 420;
  const outer = map.island ? { x0: -H - 1.2, x1: H + 1.2, z0: -H - 1.2, z1: H + 1.2 } : { x0: -far, x1: far, z0: -far, z1: far };
  const gacc = new Acc(), gdef = MATDEF[map.ground.m] || MATDEF.plain;
  _c.set(map.ground.c);
  for (const [x0, z0, x1, z1] of groundRects(outer, map.holes || [])) {
    const s = gdef.scale || 4;
    const q = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
    for (const k of [0, 1, 2, 0, 2, 3]) gacc.vert(q[k][0], 0, q[k][1], 0, 1, 0, q[k][0] / s, q[k][1] / s, _c.r, _c.g, _c.b);
  }
  const ground = new THREE.Mesh(gacc.build(), makeMaterial(map.ground.m));
  ground.receiveShadow = true;
  group.add(ground);

  // water
  const waters = [];
  const waterTex = GEN.water();
  const waterMat = (c, rep) => {
    const t = waterTex.clone(); t.needsUpdate = true; t.repeat.set(rep[0], rep[1]);
    const m = new THREE.MeshPhongMaterial({ color: c, map: t, specular: 0x9ab0c0, shininess: 80, transparent: true, opacity: 0.94 });
    waters.push(t);
    return m;
  };
  for (const w of map.water || []) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.d), waterMat(map.waterC ?? 0x3a5859, [w.w / 6, w.d / 6]));
    m.rotation.x = -Math.PI / 2; m.position.set(w.x, w.y, w.z);
    m.receiveShadow = true;
    group.add(m);
  }
  if (map.sea) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), waterMat(map.sea.c, [140, 140]));
    m.rotation.x = -Math.PI / 2; m.position.y = map.sea.y;
    group.add(m);
  }

  // sky dome + clouds + sun
  const skyGeo = new THREE.SphereGeometry(460, 24, 14);
  const top = new THREE.Color(map.sky[0]), hor = new THREE.Color(map.sky[1]);
  const sc = new Float32Array(skyGeo.attributes.position.count * 3);
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {
    const y = skyGeo.attributes.position.getY(i) / 460;
    const c = hor.clone().lerp(top, Math.max(0, Math.min(1, y * 1.7)));
    sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  group.add(sky);
  const cloudTex = canvasTex('clouds', 512, (x, S) => {
    x.clearRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      const px = rnd() * S, py = rnd() * S, r = 20 + rnd() * 70;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
        g.addColorStop(0, `rgba(255,255,255,${0.25 + rnd() * 0.25})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
      }
    }
  });
  cloudTex.repeat.set(3, 3);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(440, 24, 8, 0, PI2, 0, Math.PI * 0.42), new THREE.MeshBasicMaterial({
    map: cloudTex, transparent: true, opacity: map.clouds ?? 0.6, fog: false, depthWrite: false, color: map.weather ? 0xb8c0c8 : 0xffffff,
  }));
  clouds.renderOrder = -9;
  group.add(clouds);
  if (!map.weather) {
    const sunTex = canvasTex('sun', 128, (x, S) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.15, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,220,160,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); });
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    sun.position.set(...map.sun[2]).normalize().multiplyScalar(400);
    sun.scale.setScalar(110);
    sun.renderOrder = -8;
    group.add(sun);
  }

  // signs
  for (const s of map.signs || []) {
    const t = signTexture(s);
    const h = s.style === 'emblem' || s.style === 'clock' ? s.w : s.h;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, h), new THREE.MeshLambertMaterial({ map: t, transparent: s.style === 'letters', alphaTest: s.style === 'letters' ? 0.3 : 0, emissive: 0x111111 }));
    m.position.set(s.x, s.y + h / 2, s.z);
    m.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[s.face] ?? 0;
    group.add(m);
  }

  // weather and smoke
  const q = opts.lowFx ? 0.5 : 1;
  const fx = [];
  if (map.weather === 'rain') {
    const N = Math.round(1400 * q), pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 50, y = Math.random() * 26, z = (Math.random() - 0.5) * 50; pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.03], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc6d2dc, transparent: true, opacity: 0.45, fog: false }));
    lines.frustumCulled = false;
    group.add(lines);
    fx.push({ kind: 'rain', obj: lines, N });
  } else if (map.weather === 'snow') {
    const N = Math.round(2600 * q), pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * 60, Math.random() * 24, (Math.random() - 0.5) * 60], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = canvasTex('flake', 32, (x) => { const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); });
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: dot, size: 0.11, transparent: true, depthWrite: false, opacity: 0.9 }));
    pts.frustumCulled = false;
    group.add(pts);
    fx.push({ kind: 'snow', obj: pts, N });
  }
  const puffTex = canvasTex('puff', 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(90,90,90,0.7)'); g.addColorStop(1, 'rgba(90,90,90,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
  const smokes = [];
  for (const s of map.smoke || []) {
    for (let i = 0; i < Math.round(14 * q); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: 0x6a6a6a }));
      sp.userData = { s, t: i / 14 };
      group.add(sp);
      smokes.push(sp);
    }
  }

  let time = 0;
  return {
    group,
    update(dt, cam) {
      time += dt;
      for (const t of waters) { t.offset.x = time * 0.012; t.offset.y = time * 0.02; }
      clouds.rotation.y = time * 0.004;
      for (const f of fx) {
        const p = f.obj.geometry.attributes.position, a = p.array;
        if (f.kind === 'rain') {
          for (let i = 0; i < f.N; i++) {
            const k = i * 6;
            let y = a[k + 1] - dt * 24;
            if (y < cam.y - 4) {
              y += 26;
              a[k] = cam.x + (Math.random() - 0.5) * 50; a[k + 2] = cam.z + (Math.random() - 0.5) * 50;
            }
            a[k + 1] = y; a[k + 3] = a[k] + 0.05; a[k + 4] = y - 0.7; a[k + 5] = a[k + 2] + 0.03;
          }
        } else {
          for (let i = 0; i < f.N; i++) {
            const k = i * 3;
            a[k] += Math.sin(time * 0.8 + i) * dt * 0.6 + dt * 1.6;
            a[k + 1] -= dt * (1.1 + (i % 5) * 0.2);
            a[k + 2] += Math.cos(time * 0.6 + i * 0.7) * dt * 0.5;
            if (a[k + 1] < cam.y - 3 || Math.abs(a[k] - cam.x) > 32 || Math.abs(a[k + 2] - cam.z) > 32) {
              a[k] = cam.x + (Math.random() - 0.5) * 60; a[k + 1] = cam.y + 2 + Math.random() * 20; a[k + 2] = cam.z + (Math.random() - 0.5) * 60;
            }
          }
        }
        p.needsUpdate = true;
      }
      for (const sp of smokes) {
        const u = sp.userData;
        u.t += dt * 0.07;
        if (u.t > 1) u.t -= 1;
        const s = u.s.s;
        sp.position.set(u.s.x + u.t * 9 * s + Math.sin(u.t * 6 + u.s.x) * 1.5, u.s.y + u.t * 24 * s, u.s.z + u.t * 4 * s);
        sp.scale.setScalar((2 + u.t * 10) * s);
        sp.material.opacity = Math.sin(u.t * Math.PI) * 0.75;
      }
    },
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map && !Object.values(TEX).includes(o.material.map)) o.material.map.dispose(); o.material.dispose(); }
      });
    },
  };
}

export function grungeTexture() { return GEN.concrete(); }

export function applyMapLighting(scene, map, lights) {
  scene.fog = new THREE.Fog(map.fog, map.fogNear, map.fogFar);
  scene.background = new THREE.Color(map.fog);
  lights.hemi.color.set(map.hemi[0]);
  lights.hemi.groundColor.set(map.hemi[1]);
  lights.hemi.intensity = map.hemi[2] * 2.0;
  lights.sun.color.set(map.sun[0]);
  lights.sun.intensity = map.sun[1] * 1.75;
  lights.sun.position.set(...map.sun[2]).normalize().multiplyScalar(160);
}

// Top-down picture of the map for the minimap (3 px per metre).
export function minimapImage(map) {
  const S = 3, size = Math.ceil(map.half * 2 * S);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const toPx = (v) => (v + map.half) * S;
  const g = new THREE.Color(map.ground.c).multiplyScalar(0.45);
  x.fillStyle = `rgb(${(g.r * 255) | 0},${(g.g * 255) | 0},${(g.b * 255) | 0})`;
  x.fillRect(0, 0, size, size);
  x.fillStyle = 'rgba(40,90,120,0.9)';
  for (const h of map.holes || []) x.fillRect(toPx(h.x - h.w / 2), toPx(h.z - h.d / 2), h.w * S, h.d * S);
  const boxes = map.boxes.filter(b => (!b.nc && !b.inv) || (b.flat && !b.s)).slice().sort((a, b) => (a.y + a.h) - (b.y + b.h));
  for (const b of boxes) {
    const top = b.y + b.h;
    const col = new THREE.Color(b.c);
    if (b.flat) col.multiplyScalar(0.6);
    else col.lerp(new THREE.Color(0xffffff), 0.25).multiplyScalar(0.5 + Math.min(0.5, top * 0.06));
    x.fillStyle = `rgb(${Math.min(255, col.r * 255) | 0},${Math.min(255, col.g * 255) | 0},${Math.min(255, col.b * 255) | 0})`;
    const px = toPx(b.x - b.w / 2), pz = toPx(b.z - b.d / 2);
    if (b.s === 'cyl') { x.beginPath(); x.arc(px + b.w * S / 2, pz + b.d * S / 2, b.w * S / 2, 0, Math.PI * 2); x.fill(); }
    else x.fillRect(px, pz, b.w * S, b.d * S);
  }
  return { canvas: c, scale: S };
}
