// Map-building toolkit shared by the server and the client.
// A map is a list of boxes {x, y, z, w, h, d, c, ...}: (x, z) centre, y bottom, sizes in metres, c colour.
// Flags:  nc  = decoration only (no collision)      inv = invisible collider
//         pc  = blocks players but not bullets (railings, fences, canal edges)
//         m   = material/texture key (plaster, stone, brick, roof, ...)   flat = ground decal (no AO)
//         s   = shape: cyl, cone, ico, dome, dish, tri, hip (rendering only; collision is always the box)
//         rot = [rx, ry, rz] rotation for decorations (order YXZ)          ax = axis for tri/hip/roof shapes
// Collision is axis-aligned boxes only, so rotated / curved things are decoration with simple colliders.

export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PI = Math.PI;

export function builder(seed) {
  const R = rng(seed);
  const boxes = [], holes = [], water = [], signs = [], smoke = [];
  const b = { R, boxes, holes, waters: water, signs, smokes: smoke };
  const B = (x, z, w, d, h, c, y = 0, opt) => {
    const o = { x, y, z, w, h, d, c };
    if (opt) Object.assign(o, opt);
    boxes.push(o);
    return o;
  };
  b.box = B;
  b.dec = (x, z, w, d, h, c, y = 0, opt) => B(x, z, w, d, h, c, y, opt ? { nc: 1, ...opt } : { nc: 1 });
  b.inv = (x, z, w, d, h, y = 0) => B(x, z, w, d, h, 0, y, { inv: 1 });
  b.pc = (x, z, w, d, h, y = 0) => B(x, z, w, d, h, 0, y, { inv: 1, pc: 1 });
  b.patch = (x, z, w, d, c, m, top = 0.02) => B(x, z, w, d, 0.02, c, top - 0.02, { nc: 1, m, flat: 1 });
  b.rand = (a, c) => a + R() * (c - a);
  b.pick = (arr) => arr[Math.floor(R() * arr.length)];

  // ---------------------------------------------------------------- walls
  b.wallX = (x1, x2, z, h, c, ops = [], t = 0.3, y = 0, opt) => segWall(b, 'x', x1, x2, z, h, c, ops, t, y, opt);
  b.wallZ = (z1, z2, x, h, c, ops = [], t = 0.3, y = 0, opt) => segWall(b, 'z', z1, z2, x, h, c, ops, t, y, opt);

  // map boundary: visible wall + tall invisible collider
  b.bounds = (half, h, c, m = 'stone') => {
    for (const [x, z, w, d] of [[0, -half - 0.6, half * 2 + 2.4, 1.2], [0, half + 0.6, half * 2 + 2.4, 1.2], [-half - 0.6, 0, 1.2, half * 2], [half + 0.6, 0, 1.2, half * 2]]) {
      if (h > 0) B(x, z, w, d, h, c, 0, { m });
      b.inv(x, z, w, d, 12, 0);
    }
  };

  // jagged ruined wall (solid segments of random height)
  b.ruin = (x1, z1, x2, z2, hmin, hmax, c, m = 'stone', t = 0.7) => {
    const ax = z1 === z2 ? 'x' : 'z';
    const a = ax === 'x' ? Math.min(x1, x2) : Math.min(z1, z2), e = ax === 'x' ? Math.max(x1, x2) : Math.max(z1, z2);
    for (let p = a; p < e - 0.05; p += 1.4) {
      const len = Math.min(1.4, e - p), hh = b.rand(hmin, hmax);
      if (ax === 'x') B(p + len / 2, z1, len, t, hh, c, 0, { m });
      else B(x1, p + len / 2, t, len, hh, c, 0, { m });
    }
  };

  // ---------------------------------------------------------------- stairs / railings / catwalks
  // dir = direction you walk while going up ('n' = toward -z). Returns the far end coordinate.
  b.stairs = (x, z, dir, w, rise, c = 0x8f8e8a, m = 'concrete') => {
    const n = Math.max(1, Math.ceil(rise / 0.26)), sh = rise / n, run = 0.34;
    for (let i = 0; i < n; i++) {
      const top = (i + 1) * sh, a = (i + 0.5) * run;
      if (dir === 'n') B(x, z - a, w, run + 0.01, top, c, 0, { m });
      else if (dir === 's') B(x, z + a, w, run + 0.01, top, c, 0, { m });
      else if (dir === 'e') B(x + a, z, run + 0.01, w, top, c, 0, { m });
      else B(x - a, z, run + 0.01, w, top, c, 0, { m });
    }
    return n * run;
  };

  b.rail = (x1, z1, x2, z2, y = 0, c = 0x2b2d30, h = 1.0, solid = true) => {
    const ax = Math.abs(z1 - z2) < 1e-6 ? 'x' : 'z';
    const len = ax === 'x' ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const rl = (yy) => ax === 'x' ? b.dec(cx, cz, len, 0.06, 0.06, c, yy) : b.dec(cx, cz, 0.06, len, 0.06, c, yy);
    rl(y + h - 0.06); rl(y + h * 0.5);
    const n = Math.max(1, Math.round(len / 1.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b.dec(ax === 'x' ? Math.min(x1, x2) + t * len : cx, ax === 'z' ? Math.min(z1, z2) + t * len : cz, 0.07, 0.07, h, c, y);
    }
    if (solid) ax === 'x' ? b.pc(cx, cz, len, 0.14, h + 0.5, y) : b.pc(cx, cz, 0.14, len, h + 0.5, y);
  };

  // flat walkway at height y (thin slab, you can walk underneath)
  b.catwalk = (x, z, w, d, y, c = 0x55595e) => {
    B(x, z, w, d, 0.2, c, y - 0.2, { m: 'metal' });
    b.dec(x, z, w + 0.06, d + 0.06, 0.06, 0x2d3034, y - 0.26);
  };

  // ---------------------------------------------------------------- structures
  b.lattice = (x, z, base, top, h, cA, cB = cA, y0 = 0, legs = true) => {
    const n = Math.max(2, Math.round(h / 2.5)), sh = h / n;
    for (let i = 0; i < n; i++) {
      const ya = y0 + i * sh, wa = base + (top - base) * i / n, wb = base + (top - base) * (i + 1) / n, wm = (wa + wb) / 2;
      const col = i % 2 ? cB : cA;
      const lean = Math.atan(((wa - wb) / 2) / sh);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.dec(x + sx * wm / 2, z + sz * wm / 2, 0.16, 0.16, sh * 1.03, col, ya, { rot: [-sz * lean, 0, sx * lean] });
      }
      for (const s of [-1, 1]) {
        b.dec(x, z + s * wb / 2, wb, 0.1, 0.1, col, ya + sh - 0.05);
        b.dec(x + s * wb / 2, z, 0.1, wb, 0.1, col, ya + sh - 0.05);
        const ang = Math.atan2(sh, wm) * (i % 2 ? 1 : -1), diag = Math.hypot(wm, sh);
        b.dec(x, z + s * wm / 2, diag, 0.07, 0.07, col, ya + sh / 2, { rot: [0, 0, ang] });
        b.dec(x + s * wm / 2, z, 0.07, diag, 0.07, col, ya + sh / 2, { rot: [-ang, 0, 0] });
      }
    }
    b.dec(x, z, top + 1.2, top + 1.2, 0.15, 0x3a3d40, y0 + h, { m: 'metal' });
    if (legs && y0 < 0.5) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + sx * base / 2, z + sz * base / 2, 0.3, 0.3, 2, 0, 0, { inv: 1 });
  };

  // satellite dish: rim diameter 2r, facing yaw (0 = +z), tilted up by `tilt`
  b.dish = (x, y, z, r, yaw, tilt, c = 0xdfe2e4) => {
    b.dec(x, z, r * 2, r * 2, r * 0.45, c, y - r * 0.22, { s: 'dish', rot: [-(PI / 2 + tilt), yaw, 0], ds: 1 });
    const dx = Math.sin(yaw) * Math.cos(tilt), dy = Math.sin(tilt), dz = Math.cos(yaw) * Math.cos(tilt);
    b.dec(x + dx * r * 0.5, z + dz * r * 0.5, 0.05, 0.05, r * 1.0, 0x9a9da0, y + dy * r * 0.5 - r * 0.5, { s: 'cyl', rot: [PI / 2 - tilt, yaw, 0] });
    b.dec(x - dx * 0.15, z - dz * 0.15, 0.3, 0.3, 0.5, 0x6d7073, y - 0.25, { m: 'metal' });
  };

  b.tree = (x, z, kind = 'oak', s = 1, c, snow = false) => {
    const trunkC = 0x5a4330;
    if (kind === 'pine') {
      c = c ?? 0x2f4a36;
      B(x, z, 0.35 * s, 0.35 * s, 1.6 * s, trunkC, 0, { s: 'cyl', m: 'wood' });
      for (let i = 0; i < 4; i++) {
        const r = (2.2 - i * 0.45) * s, y = (0.9 + i * 1.15) * s;
        b.dec(x, z, r * 2, r * 2, 2.3 * s, c, y, { s: 'cone', m: 'foliage', seg: 9 });
        if (snow) b.dec(x, z, r * 1.5, r * 1.5, 1.1 * s, 0xf2f5f8, y + 1.25 * s, { s: 'cone', m: 'snow', seg: 9 });
      }
    } else if (kind === 'poplar') {
      c = c ?? 0x5b7a36;
      B(x, z, 0.3 * s, 0.3 * s, 2.5 * s, trunkC, 0, { s: 'cyl', m: 'wood' });
      b.dec(x, z, 2.2 * s, 2.2 * s, 7.5 * s, c, 1.6 * s, { s: 'ico', det: 1, m: 'foliage' });
      b.dec(x + 0.3, z - 0.2, 1.6 * s, 1.6 * s, 4 * s, c, 6 * s, { s: 'ico', det: 1, m: 'foliage' });
    } else if (kind === 'cypress') {
      c = c ?? 0x2f4a2c;
      B(x, z, 0.3 * s, 0.3 * s, 1 * s, trunkC, 0, { s: 'cyl', m: 'wood' });
      b.dec(x, z, 1.5 * s, 1.5 * s, 7 * s, c, 0.5 * s, { s: 'ico', det: 1, m: 'foliage' });
    } else if (kind === 'bush') {
      b.dec(x, z, 1.6 * s, 1.6 * s, 1.1 * s, c ?? 0x4d6532, 0, { s: 'ico', det: 1, m: 'foliage' });
    } else {
      c = c ?? 0x4f6b35;
      B(x, z, 0.45 * s, 0.45 * s, 2.4 * s, trunkC, 0, { s: 'cyl', m: 'wood' });
      b.dec(x, z, 3.6 * s, 3.6 * s, 2.8 * s, c, 2.0 * s, { s: 'ico', det: 1, m: 'foliage' });
      b.dec(x + 0.9 * s, z + 0.4 * s, 2.4 * s, 2.4 * s, 2.0 * s, c, 3.2 * s, { s: 'ico', det: 1, m: 'foliage' });
      b.dec(x - 0.8 * s, z - 0.6 * s, 2.2 * s, 2.2 * s, 1.8 * s, c, 3.0 * s, { s: 'ico', det: 1, m: 'foliage' });
    }
  };

  b.rock = (x, z, w, d, h, c = 0x7d7f80, snow = false) => {
    b.dec(x, z, w, d, h * 1.15, c, -h * 0.12, { s: 'ico', det: 0, m: 'rock', rot: [b.rand(-0.2, 0.2), b.rand(0, 6.28), b.rand(-0.2, 0.2)] });
    if (snow) b.dec(x, z, w * 0.85, d * 0.85, h * 0.45, 0xf1f4f7, h * 0.62, { s: 'ico', det: 0, m: 'snow', rot: [0, b.rand(0, 6.28), 0] });
    if (h > 0.5) b.inv(x, z, w * 0.72, d * 0.72, h * 0.92);
  };

  // ---------------------------------------------------------------- vehicles (decoration + simple collider)
  const wheel = (x, y, z, r, axis, c = 0x1a1a1a) => b.dec(x, z, r * 2, r * 2, 0.32, c, y - 0.16, { s: 'cyl', seg: 12, rot: axis === 'x' ? [0, 0, PI / 2] : [PI / 2, 0, 0] });
  const along = (ax, x, z, a, s) => ax === 'x' ? [x + a, z + s] : [x + s, z + a];
  const sz = (ax, l, w) => ax === 'x' ? [l, w] : [w, l];

  b.car = (x, z, ax, c) => {
    const [w, d] = sz(ax, 4.2, 1.8);
    b.dec(x, z, w, d, 0.75, c, 0.3, { m: 'paint' });
    const [cw, cd] = sz(ax, 2.2, 1.6);
    const [cx, cz] = along(ax, x, z, -0.2, 0);
    b.dec(cx, cz, cw, cd, 0.6, 0xffffff, 1.05, { m: 'window' });
    b.dec(cx, cz, cw + 0.05, cd + 0.05, 0.07, c, 1.63, { m: 'paint' });
    for (const s of [-1, 1]) {
      const [bx, bz] = along(ax, x, z, s * 2.12, 0);
      b.dec(bx, bz, ...sz(ax, 0.1, 1.7), 0.18, 0x2a2a2a, 0.38);
      const [lx, lz] = along(ax, x, z, 2.11, s * 0.6);
      b.dec(lx, lz, ...sz(ax, 0.06, 0.3), 0.14, 0xfff4d6, 0.72, { m: 'glow' });
      for (const t of [-1.35, 1.35]) { const [wx, wz] = along(ax, x, z, t, s * 0.86); wheel(wx, 0.34, wz, 0.33, ax === 'x' ? 'z' : 'x'); }
    }
    b.inv(x, z, w, d, 1.65);
  };

  b.van = (x, z, ax, c) => {     // small three-wheeler / delivery van
    const [w, d] = sz(ax, 3.4, 1.5);
    const [fx, fz] = along(ax, x, z, 1.05, 0);
    b.dec(fx, fz, ...sz(ax, 1.2, 1.4), 1.3, c, 0.35, { m: 'paint' });
    const [gx, gz] = along(ax, x, z, 1.62, 0);
    b.dec(gx, gz, ...sz(ax, 0.05, 1.2), 0.55, 0xffffff, 0.95, { m: 'window' });
    const [rx, rz] = along(ax, x, z, -0.6, 0);
    b.dec(rx, rz, ...sz(ax, 2.1, 1.5), 1.25, c, 0.45, { m: 'paint' });
    b.dec(rx, rz, ...sz(ax, 2.15, 1.55), 0.08, 0xe8e2d4, 1.7);
    for (const [t, s] of [[1.2, 0], [-1.1, -0.65], [-1.1, 0.65]]) { const [wx, wz] = along(ax, x, z, t, s); wheel(wx, 0.28, wz, 0.27, ax === 'x' ? 'z' : 'x'); }
    b.inv(x, z, w, d, 1.75);
  };

  b.truck = (x, z, ax, c, bed = 0x5a5a4a) => {
    const [w, d] = sz(ax, 7.4, 2.4);
    const [hx, hz] = along(ax, x, z, 3.0, 0);
    b.dec(hx, hz, ...sz(ax, 1.4, 2.0), 0.9, c, 0.7, { m: 'paint' });
    const [cx, cz] = along(ax, x, z, 1.75, 0);
    b.dec(cx, cz, ...sz(ax, 1.4, 2.3), 1.9, c, 0.7, { m: 'paint' });
    const [gx, gz] = along(ax, x, z, 2.46, 0);
    b.dec(gx, gz, ...sz(ax, 0.05, 2.0), 0.7, 0xffffff, 1.6, { m: 'window' });
    const [px, pz] = along(ax, x, z, -1.4, 0);
    b.dec(px, pz, ...sz(ax, 4.6, 2.4), 0.25, 0x2c2c2a, 0.95);
    for (const s of [-1, 1]) { const [sx2, sz2] = along(ax, x, z, -1.4, s * 1.15); b.dec(sx2, sz2, ...sz(ax, 4.6, 0.1), 0.65, bed, 1.2, { m: 'wood' }); }
    const [ex, ez] = along(ax, x, z, -3.65, 0);
    b.dec(ex, ez, ...sz(ax, 0.1, 2.4), 0.65, bed, 1.2, { m: 'wood' });
    for (const t of [2.6, -0.6, -2.4]) for (const s of [-1, 1]) { const [wx, wz] = along(ax, x, z, t, s * 1.0); wheel(wx, 0.5, wz, 0.48, ax === 'x' ? 'z' : 'x'); }
    b.inv(x, z, w, d, 2.6);
  };

  b.bus = (x, z, ax, c, c2 = 0xe9e4d6, L = 11) => {
    const [w, d] = sz(ax, L, 2.5);
    b.dec(x, z, w, d, 1.25, c, 0.45, { m: 'paint' });
    b.dec(x, z, w, d, 0.95, c2, 1.7, { m: 'paint' });
    b.dec(x, z, ...sz(ax, L - 0.6, 2.54), 0.85, 0xffffff, 1.75, { m: 'window' });
    b.dec(x, z, ...sz(ax, L - 0.1, 2.4), 0.18, c, 2.65, { m: 'paint' });
    for (const t of [L / 2 - 1.8, -L / 2 + 2.0]) for (const s of [-1, 1]) { const [wx, wz] = along(ax, x, z, t, s * 1.12); wheel(wx, 0.5, wz, 0.48, ax === 'x' ? 'z' : 'x'); }
    b.inv(x, z, w, d, 2.9);
  };

  b.tram = (x, z, ax, c = 0xe8c23a, c2 = 0x2f4f8a) => {
    b.bus(x, z, ax, c2, c, 14);
    const [p1x, p1z] = along(ax, x, z, 1, 0);
    b.dec(p1x, p1z, 0.1, 0.1, 1.2, 0x333333, 2.85, { rot: ax === 'x' ? [0, 0, 0.6] : [0.6, 0, 0] });
  };

  b.heli = (x, z, ax = 'z', c = 0x7e888e) => {
    b.dec(x, z, ...sz(ax, 8, 3.0), 2.7, c, 0.55, { s: 'ico', det: 1, m: 'paint' });
    const [nx, nz] = along(ax, x, z, 3.2, 0);
    b.dec(nx, nz, ...sz(ax, 1.8, 2.2), 1.5, 0xffffff, 1.3, { s: 'ico', det: 1, m: 'window' });
    const [tx, tz] = along(ax, x, z, -6.5, 0);
    b.dec(tx, tz, ...sz(ax, 6, 0.6), 0.6, c, 1.9, { m: 'paint' });
    const [fx, fz] = along(ax, x, z, -9.2, 0);
    b.dec(fx, fz, ...sz(ax, 1.0, 0.15), 1.8, c, 2.0, { m: 'paint' });
    b.dec(fx, fz, ...sz(ax, 0.1, 0.1), 2.4, 0x222222, 1.8, { rot: ax === 'x' ? [0.7, 0, 0] : [0, 0, 0.7] });
    b.dec(x, z, 1.4, 1.4, 0.5, 0x3a3f44, 3.2, { s: 'cyl', m: 'metal' });
    for (let i = 0; i < 4; i++) b.dec(x, z, 13, 0.4, 0.06, 0x222222, 3.75, { rot: [0, i * PI / 4 + 0.3, 0] });
    for (const s of [-1, 1]) {
      const [sx2, sz2] = along(ax, x, z, 0, s * 1.3);
      b.dec(sx2, sz2, ...sz(ax, 5.5, 0.12), 0.12, 0x2a2a2a, 0.05);
      for (const t of [-1.4, 1.4]) { const [qx, qz] = along(ax, x, z, t, s * 1.2); b.dec(qx, qz, 0.1, 0.1, 0.7, 0x2a2a2a, 0.05); }
    }
    b.inv(x, z, ...sz(ax, 8, 3), 3.0);
  };

  b.boat = (x, z, ax, c = 0x6a7680, y = 0, trailer = false) => {
    const [w, d] = sz(ax, 7, 2.4);
    if (trailer) {
      b.dec(x, z, ...sz(ax, 7, 1.4), 0.15, 0x2a2a2a, 0.45);
      for (const s of [-1, 1]) { const [wx, wz] = along(ax, x, z, -0.8, s * 1.0); wheel(wx, 0.4, wz, 0.38, ax === 'x' ? 'z' : 'x'); }
      y = 0.6;
    }
    b.dec(x, z, w, d, 1.2, c, y, { m: 'paint' });
    const [bx, bz] = along(ax, x, z, 3.5, 0);
    b.dec(bx, bz, 1.7, 1.7, 1.2, c, y, { m: 'paint', rot: [0, PI / 4, 0] });
    b.dec(x, z, w + 0.1, d + 0.1, 0.14, 0xe0ddd5, y + 1.2);
    const [cx, cz] = along(ax, x, z, -0.8, 0);
    b.dec(cx, cz, ...sz(ax, 2.4, 1.8), 1.1, 0xe8e6e0, y + 1.3, { m: 'paint' });
    b.dec(cx, cz, ...sz(ax, 2.45, 1.85), 0.45, 0xffffff, y + 1.75, { m: 'window' });
    if (trailer || y >= 0) b.inv(x, z, w, d, y + 2.2);
  };

  b.snowcat = (x, z, ax, c = 0xd8661f) => {
    for (const s of [-1, 1]) { const [tx, tz] = along(ax, x, z, 0, s * 1.15); b.dec(tx, tz, ...sz(ax, 4.6, 0.7), 0.85, 0x1d1e20, 0, { m: 'metal' }); }
    b.dec(x, z, ...sz(ax, 4.2, 2.0), 1.0, c, 0.8, { m: 'paint' });
    const [cx, cz] = along(ax, x, z, 0.5, 0);
    b.dec(cx, cz, ...sz(ax, 2.4, 1.9), 1.1, c, 1.8, { m: 'paint' });
    b.dec(cx, cz, ...sz(ax, 2.45, 1.95), 0.6, 0xffffff, 2.1, { m: 'window' });
    b.dec(cx, cz, ...sz(ax, 0.3, 1.6), 0.12, 0xfff3c4, 2.95, { m: 'glow' });
    b.inv(x, z, ...sz(ax, 4.6, 3.0), 2.9);
  };

  b.boxcar = (x, z, ax, c = 0x6a3a2a) => {
    const [w, d] = sz(ax, 12, 3);
    b.box(x, z, w, d, 3.2, c, 0.9, { m: 'metal' });
    b.dec(x, z, ...sz(ax, 12.2, 3.1), 0.2, 0x3a3a3a, 4.1, { m: 'metal' });
    b.dec(x, z, ...sz(ax, 3, 3.08), 2.6, 0x4e2c20, 1.1, { m: 'wood' });
    for (const t of [-4.5, 4.5]) { const [wx, wz] = along(ax, x, z, t, 0); b.dec(wx, wz, ...sz(ax, 2.4, 2.2), 0.7, 0x1e1e1e, 0.2, { m: 'metal' }); }
    b.inv(x, z, w, d, 1.0);
  };

  b.container = (x, z, ax, c, y = 0) => {
    const [w, d] = sz(ax, 6.1, 2.44);
    B(x, z, w, d, 2.6, c, y, { m: 'metal' });
    const [ex, ez] = along(ax, x, z, 3.06, 0);
    b.dec(ex, ez, ...sz(ax, 0.06, 2.3), 2.4, c, y + 0.1, { m: 'metal' });
  };

  // ---------------------------------------------------------------- props
  b.crate = (x, z, s = 1.1, c = 0x8a6b45, y = 0) => { B(x, z, s, s, s, c, y, { m: 'wood' }); };
  b.ammo = (x, z, ax = 'x', y = 0) => { const [w, d] = sz(ax, 1.2, 0.6); B(x, z, w, d, 0.55, 0x46553a, y, { m: 'paint' }); b.dec(x, z, w + 0.04, d + 0.04, 0.08, 0x2f3a28, y + 0.47); };
  b.barrel = (x, z, c = 0x3c5a3a, y = 0) => { B(x, z, 0.62, 0.62, 0.92, c, y, { s: 'cyl', m: 'metal', seg: 10 }); };
  b.barrels = (x, z, n, c) => { for (let i = 0; i < n; i++) b.barrel(x + (i % 3) * 0.66 - 0.66, z + Math.floor(i / 3) * 0.66, c); };
  b.cone = (x, z) => { b.dec(x, z, 0.36, 0.36, 0.55, 0xe56a1f, 0, { s: 'cone', seg: 8 }); b.dec(x, z, 0.44, 0.44, 0.04, 0xe56a1f); };
  b.barrier = (x, z, ax) => { const [w, d] = sz(ax, 3, 0.6); B(x, z, w, d, 0.9, 0xb4b0a6, 0, { m: 'concrete' }); b.dec(x, z, ...sz(ax, 3, 0.75), 0.25, 0xa8a49a, 0, { m: 'concrete' }); };
  b.sandbags = (x, z, len, ax, h = 1.0, c = 0x9c8f6c) => {
    const [w, d] = sz(ax, len, 0.8);
    B(x, z, w, d, h, c, 0, { m: 'cloth' });
    const n = Math.round(len / 0.7);
    for (let r = 0; r < 3; r++) for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5 + (r % 2) * 0.5) * (len / (n + 0.5));
      const [bx, bz] = along(ax, x, z, t, 0);
      b.dec(bx, bz, ...sz(ax, 0.66, 0.84), h / 3 * 0.9, c, r * h / 3, { s: 'ico', det: 1, m: 'cloth' });
    }
  };
  b.lamp = (x, z, h = 4.5, glow = 0xfff0c8, dir = [1, 0]) => {
    B(x, z, 0.14, 0.14, h, 0x2a2c2e, 0, { s: 'cyl', seg: 8, m: 'metal' });
    b.dec(x + dir[0] * 0.6, z + dir[1] * 0.6, dir[0] ? 1.2 : 0.08, dir[1] ? 1.2 : 0.08, 0.08, 0x2a2c2e, h - 0.1);
    b.dec(x + dir[0] * 1.15, z + dir[1] * 1.15, 0.45, 0.45, 0.2, 0x2a2c2e, h - 0.3);
    b.dec(x + dir[0] * 1.15, z + dir[1] * 1.15, 0.36, 0.36, 0.06, glow, h - 0.34, { m: 'glow' });
  };
  b.tank = (x, z, r, h, c = 0xc9ccd0) => {
    B(x, z, r * 2, r * 2, h, c, 0, { s: 'cyl', seg: 18, m: 'metal' });
    b.dec(x, z, r * 2, r * 2, r * 0.45, c, h, { s: 'dome', m: 'metal' });
    b.dec(x + r * 0.98, z, 0.08, 0.5, h, 0x55595e, 0);
    for (let i = 0; i < h / 0.5; i++) b.dec(x + r + 0.04, z, 0.06, 0.5, 0.05, 0x55595e, i * 0.5);
  };
  b.fenceChain = (x1, z1, x2, z2, h = 2.4, c = 0x6a6e72) => {
    const ax = Math.abs(z1 - z2) < 1e-6 ? 'x' : 'z';
    const len = ax === 'x' ? Math.abs(x2 - x1) : Math.abs(z2 - z1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    b.dec(cx, cz, ...(ax === 'x' ? [len, 0.04] : [0.04, len]), h, 0xffffff, 0, { m: 'fence' });
    const n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) b.dec(ax === 'x' ? Math.min(x1, x2) + len * i / n : cx, ax === 'z' ? Math.min(z1, z2) + len * i / n : cz, 0.08, 0.08, h + 0.1, c, 0, { s: 'cyl', seg: 6 });
    b.dec(cx, cz, ...(ax === 'x' ? [len, 0.06] : [0.06, len]), 0.06, c, h);
    ax === 'x' ? b.pc(cx, cz, len, 0.12, h + 1) : b.pc(cx, cz, 0.12, len, h + 1);
  };
  b.fencePanel = (x1, z1, x2, z2, h = 2.8, wire = true, c = 0xb7b3a8) => {
    const ax = Math.abs(z1 - z2) < 1e-6 ? 'x' : 'z';
    const len = ax === 'x' ? Math.abs(x2 - x1) : Math.abs(z2 - z1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    B(cx, cz, ...(ax === 'x' ? [len, 0.2] : [0.2, len]), h, c, 0, { m: 'panel' });
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) b.dec(ax === 'x' ? Math.min(x1, x2) + len * i / n : cx, ax === 'z' ? Math.min(z1, z2) + len * i / n : cz, 0.3, 0.3, h + 0.15, 0xa8a499, 0, { m: 'concrete' });
    if (wire) {
      b.dec(cx, cz, ...(ax === 'x' ? [len, 0.04] : [0.04, len]), 0.5, 0x555555, h, { m: 'fence' });
      // rotated shapes spin about their centre, so y = desired centre - length / 2
      b.dec(cx, cz, 0.35, 0.35, len, 0x6a6a6a, h + 0.15 - len / 2, { s: 'cyl', seg: 8, m: 'wire', rot: ax === 'x' ? [0, 0, PI / 2] : [PI / 2, 0, 0] });
    }
  };
  b.planter = (x, z, w, d, flowers = [0xd94a3a, 0xe8b84a]) => {
    B(x, z, w, d, 0.5, 0xa8603e, 0, { m: 'plaster' });
    for (let i = 0; i < Math.max(2, Math.round(w * d * 2)); i++) b.dec(x + b.rand(-w / 2 + 0.2, w / 2 - 0.2), z + b.rand(-d / 2 + 0.2, d / 2 - 0.2), 0.35, 0.35, 0.3, i % 2 ? b.pick(flowers) : 0x4f7a35, 0.45, { s: 'ico', det: 0 });
  };
  b.bench = (x, z, ax) => {
    const [w, d] = sz(ax, 1.8, 0.5);
    b.dec(x, z, w, d, 0.08, 0x6b4a2e, 0.42, { m: 'wood' });
    b.dec(...along(ax, x, z, 0, 0.22), ...sz(ax, 1.8, 0.06), 0.4, 0x6b4a2e, 0.55, { m: 'wood' });
    for (const s of [-0.8, 0.8]) b.dec(...along(ax, x, z, s, 0), ...sz(ax, 0.08, 0.5), 0.42, 0x2a2a2a);
  };
  b.awning = (x, z, w, d, y, c, stripes = 0xf2ede0) => {
    for (let i = 0; i < Math.round(w / 0.5); i++) b.dec(x - w / 2 + 0.25 + i * 0.5, z, 0.5, d, 0.08, i % 2 ? stripes : c, y, { m: 'cloth' });
  };

  // ---------------------------------------------------------------- water / text / effects
  b.hole = (x, z, w, d) => holes.push({ x, z, w, d });
  b.water = (x, z, w, d, y) => water.push({ x, z, w, d, y });
  // face: which way the sign looks ('n' = toward -z, 's' = +z, 'e' = +x, 'w' = -x)
  b.sign = (x, y, z, w, h, face, text, o = {}) => signs.push({ x, y, z, w, h, face, text, ...o });
  b.smoke = (x, y, z, s = 1) => smoke.push({ x, y, z, s });

  // horizontal pipe / round beam between two points, centred at height y
  b.pipe = (x1, z1, x2, z2, y, r, c = 0x8d949b, m = 'metal') => {
    const ax = Math.abs(z1 - z2) < 1e-6 ? 'x' : 'z';
    const len = ax === 'x' ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    b.dec((x1 + x2) / 2, (z1 + z2) / 2, r * 2, r * 2, len, c, y - len / 2, { s: 'cyl', seg: 10, m, rot: ax === 'x' ? [0, 0, PI / 2] : [PI / 2, 0, 0] });
  };
  // semicircular arch band on a wall face: centre (x, z), wall runs along ax, springs at height `top`
  b.arch = (x, z, ax, w, top, c, m = 'stone', n = 7) => {
    const r = w / 2;
    for (let i = 0; i < n; i++) {
      const a0 = PI * i / n, a1 = PI * (i + 1) / n;
      const px = (Math.cos(a0) + Math.cos(a1)) / 2 * r, py = (Math.sin(a0) + Math.sin(a1)) / 2 * r;
      const dx = (Math.cos(a1) - Math.cos(a0)) * r, dy = (Math.sin(a1) - Math.sin(a0)) * r, len = Math.hypot(dx, dy) + 0.06;
      if (ax === 'x') b.dec(x + px, z, len, 0.5, 0.32, c, top + py - 0.16, { m, rot: [0, 0, Math.atan2(dy, dx)] });
      else b.dec(x, z + px, 0.5, len, 0.32, c, top + py - 0.16, { m, rot: [Math.atan2(-dy, dx), 0, 0] });
    }
  };

  b.building = (o) => building(b, o);
  return b;
}

// Wall running along `axis` from a1 to a2 at the fixed coordinate. ops: [{at, w, y0, y1}] openings.
export function segWall(b, axis, a1, a2, fixed, h, c, ops, t, y, opt) {
  const sorted = [...ops].sort((p, q) => p.at - q.at);
  let cur = a1;
  const put = (s, e, y0, y1) => {
    if (e - s < 0.05 || y1 - y0 < 0.05) return;
    const mid = (s + e) / 2, len = e - s;
    if (axis === 'x') b.box(mid, fixed, len, t, y1 - y0, c, y + y0, opt);
    else b.box(fixed, mid, t, len, y1 - y0, c, y + y0, opt);
  };
  for (const o of sorted) {
    const s = o.at - o.w / 2, e = o.at + o.w / 2;
    put(cur, s, 0, h);
    put(s, e, 0, o.y0);
    put(s, e, o.y1, h);
    cur = e;
  }
  put(cur, a2, 0, h);
}

// ------------------------------------------------------------------ buildings
// o: {x, z, w, d, h, m, c, floors, doors:{n:[offsets]...}, open:{...}, split:{y, c, m}, base:{h, c, m},
//     roof:{type: flat|gable|hip, ax, c, rise, over, camo, chimneys, antenna}, win: false, winStyle: frame|lit|band|industrial,
//     shutters: colour, trim, quoins, flowers, solid (no interior), floorC, floorM, doorW}
function building(b, o) {
  const { x, z, w, d } = o;
  const h = o.h ?? 3.6, t = 0.3, m = o.m ?? 'plaster', c = o.c ?? 0xd8cdb5;
  const trim = o.trim ?? 0xe6e1d6;
  const doorW = o.doorW ?? 1.6, doorH = Math.min(o.doorH ?? 2.5, h - 0.3);
  const floors = o.floors ?? Math.max(1, Math.round(h / 3.2));
  const fh = h / floors;
  const doors = { n: [], s: [], e: [], w: [], ...o.doors };
  const open = { n: [], s: [], e: [], w: [], ...o.open };
  const sides = [
    { k: 'n', ax: 'x', a1: x - w / 2, a2: x + w / 2, f: z - d / 2, base: x, out: -1 },
    { k: 's', ax: 'x', a1: x - w / 2, a2: x + w / 2, f: z + d / 2, base: x, out: 1 },
    { k: 'w', ax: 'z', a1: z - d / 2 + t / 2, a2: z + d / 2 - t / 2, f: x - w / 2, base: z, out: -1 },
    { k: 'e', ax: 'z', a1: z - d / 2 + t / 2, a2: z + d / 2 - t / 2, f: x + w / 2, base: z, out: 1 },
  ];
  // decoration on the outside of a wall: centred at `at` along it, bottom at y
  const face = (S, at, y, sa, sh, depth, off, col, opt) => {
    const f = S.f + S.out * (t / 2 + off + depth / 2);
    if (S.ax === 'x') b.dec(at, f, sa, depth, sh, col, y, opt);
    else b.dec(f, at, depth, sa, sh, col, y, opt);
  };
  if (o.solid) b.box(x, z, w, d, h, c, 0, { m });
  else b.patch(x, z, w - 0.5, d - 0.5, o.floorC ?? 0x6e6255, o.floorM ?? 'wood', 0.035);
  if (!o.solid && floors > 1) b.dec(x, z, w - 0.6, d - 0.6, 0.2, 0xd6d0c4, Math.min(3.4, fh) - 0.05);

  for (const S of sides) {
    const ops = o.solid ? [] : [...doors[S.k].map(v => ({ at: S.base + v, w: doorW, y0: 0, y1: doorH })),
      ...open[S.k].map(v => ({ at: S.base + v, w: 1.3, y0: 1.0, y1: 2.2 }))];
    const wall = (y0, hh, col, mm, list) => segWall(b, S.ax, S.a1, S.a2, S.f, hh, col, list, t, y0, { m: mm });
    if (!o.solid) {
      if (o.split) { wall(0, o.split.y, c, m, ops); wall(o.split.y, h - o.split.y, o.split.c, o.split.m ?? m, []); }
      else wall(0, h, c, m, ops);
    } else if (o.split) face(S, (S.a1 + S.a2) / 2, o.split.y, S.a2 - S.a1 + 0.06, h - o.split.y, 0.04, -0.01, o.split.c, { m: o.split.m ?? m });

    const allDoors = o.solid ? (o.fakeDoors?.[S.k] || []).map(v => ({ at: S.base + v, w: doorW })) : ops;
    // base / plinth
    if (o.base) {
      const fixed = S.f + S.out * (t / 2 + 0.035);
      segWall(b, S.ax, S.a1 - (S.ax === 'x' ? 0.07 : 0), S.a2 + (S.ax === 'x' ? 0.07 : 0), fixed, o.base.h, o.base.c,
        allDoors.filter(q => q.y0 === 0 || q.y0 === undefined).map(q => ({ ...q, y0: 0, y1: o.base.h })), 0.07, 0, { nc: 1, m: o.base.m ?? 'stone' });
    }
    // cornice
    if (o.cornice !== false) face(S, (S.a1 + S.a2) / 2, h - 0.28, S.a2 - S.a1 + (S.ax === 'x' ? 0.28 : 0), 0.28, 0.14, 0, o.corniceC ?? trim, { m: 'plaster' });
    // band between floors
    if (o.band && floors > 1) for (let f = 1; f < floors; f++) face(S, (S.a1 + S.a2) / 2, f * fh - 0.1, S.a2 - S.a1 + (S.ax === 'x' ? 0.14 : 0), 0.2, 0.07, 0, o.band, { m: 'plaster' });
    // stripe
    if (o.stripe) face(S, (S.a1 + S.a2) / 2, o.stripe.y, S.a2 - S.a1 + (S.ax === 'x' ? 0.1 : 0), o.stripe.h, 0.05, 0, o.stripe.c, { m: 'paint' });

    // door frames, fake (closed) doors, garage doors
    for (const q of allDoors) {
      if (q.y0 > 0) continue;
      const dw = q.w, top = o.solid ? 2.4 : doorH;
      face(S, q.at - dw / 2 - 0.07, 0, 0.14, top + 0.14, 0.08, 0, o.doorTrim ?? trim);
      face(S, q.at + dw / 2 + 0.07, 0, 0.14, top + 0.14, 0.08, 0, o.doorTrim ?? trim);
      face(S, q.at, top, dw + 0.28, 0.14, 0.08, 0, o.doorTrim ?? trim);
      if (o.solid) face(S, q.at, 0, dw, top, 0.05, 0, o.doorC ?? 0x4a3524, { m: 'wood' });
      face(S, q.at, 0, dw + 0.3, 0.1, 0.5, 0, 0x8d8a84, { m: 'stone' });
      if (o.awning === S.k) b.awning(...(S.ax === 'x' ? [q.at, S.f + S.out * 0.75] : [S.f + S.out * 0.75, q.at]), ...(S.ax === 'x' ? [dw + 1.2, 1.3] : [1.3, dw + 1.2]), top + 0.25, o.awningC ?? 0x8a2f25);
    }
    for (const g of (o.closed?.[S.k] || [])) {
      face(S, S.base + g, 0, doorW, doorH, 0.05, 0, o.closedC ?? 0x6f9a86, { m: 'metal' });
      face(S, S.base + g, 0, doorW + 0.2, 0.25, 0.07, 0, 0xa8392b);
    }

    // windows
    if (o.win === false) continue;
    const style = o.winStyle ?? 'frame';
    const ww = o.winW ?? (style === 'industrial' ? 2.6 : 1.1);
    const wh = o.winH ?? Math.min(style === 'industrial' ? 2.4 : 1.6, fh * (style === 'industrial' ? 0.55 : 0.42));
    const gap = o.winGap ?? (style === 'industrial' ? 3.4 : 2.7);
    const mat = style === 'lit' ? 'litwin' : 'window';
    for (let f = (o.skipGround ? 1 : 0); f < floors; f++) {
      const y0 = f * fh + Math.max(f === 0 ? 0.95 : 0.8, (fh - wh) * 0.55);
      const L = S.a2 - S.a1;
      if (style === 'band') {
        face(S, (S.a1 + S.a2) / 2, y0 - 0.1, L - 1.0, wh + 0.2, 0.06, 0, trim);
        face(S, (S.a1 + S.a2) / 2, y0, L - 1.2, wh, 0.04, 0.04, 0xffffff, { m: f === 0 && !o.litGround ? 'window' : 'litwin' });
        for (let p = S.a1 + 1.1; p < S.a2 - 0.8; p += 1.6) face(S, p, y0, 0.08, wh, 0.05, 0.06, trim);
        continue;
      }
      const usable = L - 2.2;
      if (usable < 0) continue;
      const n = Math.floor(usable / gap) + 1;
      const start = S.a1 + 1.1 + (usable - (n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) {
        const at = start + i * gap;
        if (f === 0 && allDoors.some(q => Math.abs(q.at - at) < q.w / 2 + ww / 2 + 0.25)) continue;
        if (f === 0 && (o.closed?.[S.k] || []).some(g => Math.abs(S.base + g - at) < doorW / 2 + ww / 2 + 0.25)) continue;
        face(S, at, y0 - 0.12, ww + 0.24, wh + 0.24, 0.06, 0, trim);
        face(S, at, y0, ww, wh, 0.04, 0.04, 0xffffff, { m: mat });
        face(S, at, y0 - 0.2, ww + 0.36, 0.1, 0.22, 0, trim, { m: 'stone' });
        if (o.shutters != null) for (const sg of [-1, 1]) face(S, at + sg * (ww / 2 + 0.33), y0 - 0.02, 0.55, wh + 0.04, 0.05, 0.02, o.shutters, { m: 'wood' });
        if (o.flowers && f > 0 && b.R() < 0.4) {
          face(S, at, y0 - 0.42, ww + 0.1, 0.24, 0.26, 0.05, 0x7a4a2a, { m: 'wood' });
          for (let k = 0; k < 3; k++) face(S, at - ww / 3 + k * ww / 3, y0 - 0.2, 0.32, 0.26, 0.26, 0.05, b.pick(o.flowers), { s: 'ico', det: 0 });
        }
      }
    }
    // real window openings get frames too
    for (const v of open[S.k]) {
      if (o.solid) continue;
      face(S, S.base + v - 0.72, 0.95, 0.14, 1.32, 0.08, 0, trim);
      face(S, S.base + v + 0.72, 0.95, 0.14, 1.32, 0.08, 0, trim);
      face(S, S.base + v, 0.88, 1.6, 0.12, 0.24, 0, trim, { m: 'stone' });
    }
  }

  // quoins on corners
  if (o.quoins) for (const cx of [-1, 1]) for (const cz of [-1, 1]) for (let y = 0.2; y < h - 0.5; y += 0.9) {
    b.dec(x + cx * (w / 2 - 0.25 + 0.04), z + cz * (d / 2 - 0.25 + 0.04), 0.58, 0.58, 0.42, o.quoins, y, { m: 'stone' });
  }
  if (o.ivy) for (let i = 0; i < o.ivy; i++) {
    const S = b.pick(sides), at = b.rand(S.a1 + 0.5, S.a2 - 0.5), hh = b.rand(1.2, h * 0.8);
    face(S, at, 0, b.rand(0.8, 2.2), hh, 0.12, 0, b.pick([0x4a6a2e, 0x3f5f2a, 0x56763a]), { m: 'foliage' });
  }
  roof(b, o, h, c, m);
}

function roof(b, o, h, wallC, wallM) {
  const r = o.roof ?? { type: 'flat' };
  const { x, z, w, d } = o;
  const rc = r.c ?? 0xa8553a, over = r.over ?? 0.45;
  if (r.type === 'flat') {
    b.box(x, z, w + 0.2, d + 0.2, 0.3, r.c ?? 0x6c6a66, h, { m: r.m ?? 'concrete' });
    const ph = r.parapet ?? 0.55;
    if (ph > 0) for (const [px, pz, pw, pd] of [[x, z - d / 2, w + 0.2, 0.25], [x, z + d / 2, w + 0.2, 0.25], [x - w / 2, z, 0.25, d], [x + w / 2, z, 0.25, d]]) {
      b.dec(px, pz, pw, pd, ph, r.pc ?? wallC, h + 0.3, { m: wallM });
      if (r.access) b.pc(px, pz, pw, pd, ph + 0.3, h + 0.3);
    }
  } else {
    b.box(x, z, w, d, 0.25, wallC, h - 0.25, { m: wallM });
    const ax = r.ax ?? (w >= d ? 'x' : 'z');
    const span = ax === 'x' ? d : w, len = (ax === 'x' ? w : d) + over * 2;
    const rise = r.rise ?? span * 0.3;
    if (r.type === 'hip') {
      b.dec(x, z, w + over * 2, d + over * 2, rise, rc, h, { s: 'hip', m: 'roof', uvSwap: ax === 'z' ? 1 : 0 });
      b.dec(x, z, w + 0.04, d + 0.04, 0.12, 0xd8d0c0, h - 0.1);
    } else {
      const a = Math.atan2(rise, span / 2), run = span / 2 + over, L = run / Math.cos(a), th = 0.16;
      b.dec(x, z, w, d, rise, wallC, h, { s: 'tri', ax, m: wallM });
      for (const sgn of [-1, 1]) {
        const off = sgn * run / 2, yMid = h + rise - (run / 2) * Math.tan(a);
        if (ax === 'x') b.dec(x, z + off, len, L, th, rc, yMid - th / 2, { m: 'roof', rot: [sgn * a, 0, 0] });
        else b.dec(x + off, z, L, len, th, rc, yMid - th / 2, { m: 'roof', rot: [0, 0, -sgn * a], uvSwap: 1 });
      }
      b.dec(x, z, ax === 'x' ? len : 0.26, ax === 'x' ? 0.26 : len, 0.16, rc, h + rise - 0.06, { m: 'roof' });
    }
    if (r.camo) {
      b.dec(x, z, w + over * 2 + 0.7, d + over * 2 + 0.7, rise + 0.3, 0xffffff, h - 0.05, { s: 'hip', m: 'camo' });
      for (const [px, pz, pw, pd] of [[x, z - d / 2 - over - 0.3, w + 1.6, 0.06], [x, z + d / 2 + over + 0.3, w + 1.6, 0.06], [x - w / 2 - over - 0.3, z, 0.06, d + 1.6], [x + w / 2 + over + 0.3, z, 0.06, d + 1.6]]) {
        b.dec(px, pz, pw, pd, 1.2, 0xffffff, h - 1.15, { m: 'camo' });
      }
    }
    for (let i = 0; i < (r.chimneys ?? 0); i++) {
      const cx = x + b.rand(-w * 0.3, w * 0.3), cz = z + b.rand(-d * 0.3, d * 0.3);
      b.dec(cx, cz, 0.7, 0.7, rise + 1.1, r.chimC ?? wallC, h, { m: wallM });
      b.dec(cx, cz, 0.9, 0.9, 0.15, 0x8a8478, h + rise + 1.1, { m: 'stone' });
      b.dec(cx, cz, 0.5, 0.9, 0.25, rc, h + rise + 1.25, { m: 'roof' });
    }
    if (r.antenna) {
      const ax2 = x + w * 0.2, az2 = z - d * 0.1;
      b.dec(ax2, az2, 0.05, 0.05, rise + 2.2, 0x777a7d, h);
      for (let i = 0; i < 4; i++) b.dec(ax2, az2, 1.4 - i * 0.25, 0.04, 0.04, 0x777a7d, h + rise + 1.2 + i * 0.3);
    }
  }
}

// ------------------------------------------------------------------ derived data (collision, spawns, nav)
export function deriveMap(m) {
  const solids = m.boxes.filter(b => !b.nc).map(b => ({
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minY: b.y, maxY: b.y + b.h, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, pc: !!b.pc,
  }));
  const CELL = 8, N = Math.ceil((m.half * 2 + 6) / CELL), off = m.half + 3;
  const grid = Array.from({ length: N * N }, () => []);
  solids.forEach((s, i) => {
    const x0 = Math.max(0, Math.floor((s.minX + off) / CELL)), x1 = Math.min(N - 1, Math.floor((s.maxX + off) / CELL));
    const z0 = Math.max(0, Math.floor((s.minZ + off) / CELL)), z1 = Math.min(N - 1, Math.floor((s.maxZ + off) / CELL));
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) grid[gz * N + gx].push(i);
  });
  const seen = new Uint32Array(solids.length);
  let stamp = 0;
  const query = (minX, minZ, maxX, maxZ, out = []) => {
    out.length = 0;
    const x0 = Math.max(0, Math.floor((minX + off) / CELL)), x1 = Math.min(N - 1, Math.floor((maxX + off) / CELL));
    const z0 = Math.max(0, Math.floor((minZ + off) / CELL)), z1 = Math.min(N - 1, Math.floor((maxZ + off) / CELL));
    stamp++;
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      for (const i of grid[gz * N + gx]) if (seen[i] !== stamp) { seen[i] = stamp; out.push(solids[i]); }
    }
    return out;
  };

  // nav grid (2 m cells) for bots: walkable if a standing player fits on the ground
  const NC = 2, NN = Math.floor((m.half * 2) / NC), noff = m.half;
  const walk = new Uint8Array(NN * NN);
  const tmp = [];
  // water (holes in the ground) is not walkable, except where a bridge deck crosses it
  const decks = solids.filter(s => s.minY < -0.1 && s.maxY <= 0.36 && !s.pc);
  const onDeck = (px, pz) => decks.some(s => px > s.minX && px < s.maxX && pz > s.minZ && pz < s.maxZ);
  const inHole = (px, pz) => (m.holes || []).some(h => Math.abs(px - h.x) < h.w / 2 + 0.6 && Math.abs(pz - h.z) < h.d / 2 + 0.6) && !onDeck(px, pz);
  for (let gz = 0; gz < NN; gz++) for (let gx = 0; gx < NN; gx++) {
    const cx = gx * NC - noff + NC / 2, cz = gz * NC - noff + NC / 2, r = 0.55;
    let ok = Math.abs(cx) < m.half - 1 && Math.abs(cz) < m.half - 1 && !inHole(cx, cz);
    if (ok) for (const s of query(cx - r, cz - r, cx + r, cz + r, tmp)) {
      if (s.maxY > 0.35 && s.minY < 1.9 && cx + r > s.minX && cx - r < s.maxX && cz + r > s.minZ && cz - r < s.maxZ) { ok = false; break; }
    }
    walk[gz * NN + gx] = ok ? 1 : 0;
  }
  // keep only the largest connected area (no spawning in sealed pockets)
  const comp = new Int32Array(NN * NN).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  for (let i = 0; i < NN * NN; i++) {
    if (!walk[i] || comp[i] >= 0) continue;
    const stack = [i]; comp[i] = id; let size = 0;
    while (stack.length) {
      const cur = stack.pop(); size++;
      const cx = cur % NN, cz = (cur / NN) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= NN || nz >= NN) continue;
        const ni = nz * NN + nx;
        if (walk[ni] && comp[ni] < 0) { comp[ni] = id; stack.push(ni); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
    id++;
  }
  for (let i = 0; i < NN * NN; i++) if (walk[i] && comp[i] !== best) walk[i] = 0;
  // spawn points: walkable cells with all 8 neighbours walkable, spread out
  const spawns = [];
  for (let gz = 2; gz < NN - 2; gz += 3) for (let gx = 2; gx < NN - 2; gx += 3) {
    let ok = true;
    for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) if (!walk[(gz + dz) * NN + gx + dx]) { ok = false; break; }
    if (ok) spawns.push({ x: gx * NC - noff + NC / 2, z: gz * NC - noff + NC / 2 });
  }
  return { map: m, solids, query, spawns, nav: { walk, N: NN, cell: NC, off: noff } };
}

// Ray vs boxes (ignores player-only colliders). Returns distance to first solid hit (or maxT).
export function raycastMap(md, ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  const list = md.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), raycastMap.tmp || (raycastMap.tmp = []));
  for (const s of list) {
    if (s.pc) continue;
    const t = rayBox(ox, oy, oz, dx, dy, dz, s.minX, s.minY, s.minZ, s.maxX, s.maxY, s.maxZ);
    if (t >= 0 && t < best) best = t;
  }
  if (dy < 0) { const tg = -oy / dy; if (tg >= 0 && tg < best) best = tg; }
  return best;
}

export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; }
  else { let a = (x0 - ox) / dx, b = (x1 - ox) / dx; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; }
  else { let a = (y0 - oy) / dy, b = (y1 - oy) / dy; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; }
  else { let a = (z0 - oz) / dz, b = (z1 - oz) / dz; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (tmax < Math.max(tmin, 0)) return -1;
  return tmin >= 0 ? tmin : 0;
}
