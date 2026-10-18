// The five maps. Each is built from boxes with the toolkit in mapkit.js (shared by server and client).
// Original layouts, themed after: a rainy coastal fortress, an arctic station in a blizzard, a canal city,
// a Soviet factory and an Italian hill village.
import { builder, deriveMap, raycastMap, rayBox } from './mapkit.js';

export { raycastMap, rayBox };
const PI = Math.PI;

// ================================================================== 0. CITADEL — coastal fortress in the rain
function citadel() {
  const b = builder(101);
  const H = 46;
  const STONE = 0x9a9183, STONE2 = 0x80786b, PLASTER = 0xd9d2c1, TERRA = 0xae5539, OLIVE = 0x56603f;
  b.bounds(H, 0, 0);
  // ramparts with merlons, cliffs below, rocks in the sea
  for (const [x, z, w, d, hh] of [[0, H + 0.6, H * 2 + 2.4, 1.2, 2.4], [-H - 0.6, 0, 1.2, H * 2, 2.4], [H + 0.6, 0, 1.2, H * 2, 2.4], [0, -H - 0.6, H * 2 + 2.4, 1.2, 4.2]]) {
    b.box(x, z, w, d, hh, STONE, 0, { m: 'stone' });
    const n = Math.round(Math.max(w, d) / 2.4);
    for (let i = 0; i < n; i++) {
      const t = -Math.max(w, d) / 2 + (i + 0.5) * Math.max(w, d) / n;
      if (i % 2) continue;
      b.dec(w > d ? x + t : x, w > d ? z : z + t, w > d ? 1.2 : 1.3, w > d ? 1.3 : 1.2, 0.8, STONE, hh, { m: 'stone' });
    }
    b.dec(x + Math.sign(x) * 3, z + Math.sign(z) * 3, w > d ? w + 8 : 6, w > d ? 6 : d + 8, 10, STONE2, -10, { m: 'rock' });
  }
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * PI * 2, r = H + 7 + b.rand(0, 6);
    const x = Math.max(-H - 9, Math.min(H + 9, Math.cos(a) * r * 1.3)), z = Math.max(-H - 9, Math.min(H + 9, Math.sin(a) * r * 1.3));
    b.dec(x, z, b.rand(3, 7), b.rand(3, 7), b.rand(2, 5), 0x6d675e, -8, { s: 'ico', det: 0, m: 'rock', rot: [0, b.rand(0, 6), 0] });
  }
  // north rampart walkway (players can climb up for a view over the fort)
  b.box(0, -44.35, 80, 3.3, 3.0, STONE, 0, { m: 'stone' });
  b.dec(0, -42.65, 80, 0.15, 0.25, STONE2, 2.9, { m: 'stone' });
  b.stairs(-14, -42.7 + 4.08, 'n', 2.4, 3.0, STONE, 'stone');
  b.stairs(22, -42.7 + 4.08, 'n', 2.4, 3.0, STONE, 'stone');
  b.crate(-30, -44.5, 1.1, 0x7d6544, 3); b.crate(5, -44.6, 1.2, 0x7d6544, 3); b.ammo(32, -44.4, 'x', 3);

  // the keep: round stone tower with a red/white radio mast and dishes
  const KX = -30, KZ = -27;
  b.dec(KX, KZ, 14, 14, 12, STONE, 0, { s: 'cyl', seg: 16, m: 'stone' });
  b.dec(KX, KZ, 15, 15, 0.9, STONE2, 11.6, { s: 'cyl', seg: 16, m: 'stone' });
  for (let i = 0; i < 16; i += 2) { const a = i / 16 * PI * 2; b.dec(KX + Math.cos(a) * 7.1, KZ + Math.sin(a) * 7.1, 1.1, 1.1, 0.9, STONE, 12.5, { m: 'stone' }); }
  for (const [a, y] of [[0.3, 3], [1.2, 6], [2.4, 4], [3.6, 7], [4.8, 3], [5.6, 8]]) b.dec(KX + Math.cos(a) * 7.0, KZ + Math.sin(a) * 7.0, 0.5, 0.5, 1.3, 0x1f1f20, y);
  b.dec(KX + 6.4, KZ + 2.8, 0.15, 2.6, 2.6, 0x4b4f52, 4.5, { m: 'fence' });
  b.inv(KX, KZ, 14, 8.6, 13); b.inv(KX, KZ, 8.6, 14, 13); b.inv(KX, KZ, 10.4, 10.4, 13);
  b.lattice(KX, KZ, 5, 1.8, 20, 0xb3342a, 0xe6e3dc, 12.4, false);
  b.dish(KX + 2.6, 16.5, KZ + 0.8, 2.4, 1.1, 0.12);
  b.dish(KX - 1.8, 19.5, KZ + 2.2, 1.9, -0.5, 0.18);
  b.dish(KX + 0.6, 24, KZ - 1.8, 1.5, 2.6, 0.3);
  b.dec(KX + 4, KZ - 3, 2.2, 1.6, 1.4, 0x8d9396, 12.4, { m: 'metal' });
  b.dec(KX - 4.2, KZ - 1, 1.2, 1.2, 1.0, 0x6e7275, 12.4, { m: 'metal' });
  b.dec(KX, KZ, 0.4, 0.4, 1.2, 0xff3a2a, 32.4, { m: 'glow' });
  b.ruin(-42, -15, -33, -15, 0.9, 2.4, STONE); b.ruin(-28, -15, -20, -15, 0.8, 2.0, STONE);

  // villa with camouflage net over the roof
  b.building({ x: 6, z: -31, w: 22, d: 12, h: 6.6, floors: 2, c: PLASTER, base: { h: 0.9, c: STONE }, doors: { s: [-6, 5], w: [0], e: [1] }, open: { s: [-1.5, 1.5], n: [-4, 4] },
    shutters: 0x4b5a63, quoins: STONE, ivy: 6, roof: { type: 'hip', c: TERRA, rise: 3, camo: true } });
  b.wallZ(-36.7, -25.3, 6, 3.4, 0xe2dccd, [{ at: -31, w: 1.5, y0: 0, y1: 2.4 }], 0.2);
  b.box(-1, -34, 2.4, 1.1, 0.85, 0x5a3b2a, 0, { m: 'wood' }); b.crate(12, -27.5); b.crate(13.2, -27.5, 0.9); b.ammo(0, -27, 'x');

  // helipad + helicopter
  b.dec(32, -27, 16, 16, 0.1, 0x7d7f80, 0, { s: 'cyl', seg: 32, m: 'concrete', flat: 1 });
  b.dec(32, -27, 12.6, 12.6, 0.11, 0xd8b23a, 0, { s: 'cyl', seg: 32, flat: 1 });
  b.dec(32, -27, 11.8, 11.8, 0.12, 0x7d7f80, 0, { s: 'cyl', seg: 32, m: 'concrete', flat: 1 });
  for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; b.dec(32 + Math.cos(a) * 7.6, -27 + Math.sin(a) * 7.6, 0.25, 0.25, 0.15, 0xffd27a, 0.05, { m: 'glow' }); }
  b.heli(32, -27, 'z');
  b.barrels(25, -17, 4, 0x8a3a2a);

  // terracotta house + barracks on the east side
  b.building({ x: 38, z: -7, w: 11, d: 9, h: 3.8, c: 0xe2dbc9, base: { h: 0.6, c: STONE }, doors: { w: [-1.5], s: [2] }, open: { n: [0] }, shutters: 0x3d6078,
    roof: { type: 'gable', ax: 'x', c: TERRA, chimneys: 1 } });
  b.building({ x: 38, z: 26, w: 11, d: 18, h: 3.8, c: 0xcfc6b2, base: { h: 0.6, c: STONE }, doors: { w: [-5, 5], n: [0] }, open: { w: [0] }, shutters: 0x5b4636,
    roof: { type: 'gable', ax: 'z', c: 0xa64f35, chimneys: 1 } });
  for (const z of [19, 23, 29, 33]) b.box(41.5, z, 2, 1, 0.6, 0x4e5a3c, 0, { m: 'cloth' });

  // central naval gun emplacement
  b.dec(0, -3, 15, 15, 0.9, 0x8e877b, 0, { s: 'cyl', seg: 28, m: 'stone' });
  b.dec(0, -3, 15.4, 15.4, 0.15, 0x7b746a, 0.85, { s: 'cyl', seg: 28, m: 'paving' });
  b.inv(0, -3, 15, 8.6, 0.9); b.inv(0, -3, 8.6, 15, 0.9); b.inv(0, -3, 11, 11, 0.9);
  b.stairs(0, -11.86, 's', 3, 0.9, STONE, 'stone'); b.stairs(0, 5.86, 'n', 3, 0.9, STONE, 'stone');
  b.stairs(8.86, -3, 'w', 3, 0.9, STONE, 'stone'); b.stairs(-8.86, -3, 'e', 3, 0.9, STONE, 'stone');
  b.dec(0, -3, 5.4, 5.4, 0.8, 0x7f868c, 0.9, { s: 'cyl', seg: 20, m: 'metal' });
  b.box(0, -3.3, 4, 4.6, 2.2, 0x9ea3a7, 1.7, { m: 'metal' });
  b.dec(0, -0.85, 4, 0.8, 1.7, 0x8e9397, 1.75, { m: 'metal', rot: [-0.35, 0, 0] });
  b.dec(0.9, -4.5, 1.2, 1.2, 0.35, 0x7d8286, 3.9, { s: 'cyl', m: 'metal' });
  for (const sx of [-0.75, 0.75]) b.dec(sx, 2.6, 0.38, 0.38, 6.5, 0x6e7377, 2.55 - 3.25, { s: 'cyl', seg: 10, m: 'metal', rot: [PI / 2, 0, 0] });
  b.ammo(-5, 1.5, 'z', 0.9); b.ammo(5.2, -6.5, 'x', 0.9);

  // missile launcher pit (west)
  b.dec(-31, 6, 9, 9, 0.45, 0x8a8b88, 0, { s: 'cyl', seg: 24, m: 'concrete' });
  b.inv(-31, 6, 9, 9, 0.45);
  b.box(-31, 6, 2.6, 2.6, 1.2, OLIVE, 0.45, { m: 'paint' });
  b.dec(-31, 6, 2.4, 4.4, 1.3, OLIVE, 2.0, { m: 'paint', rot: [-0.5, 0, 0] });
  for (const sx of [-0.6, 0.6]) b.dec(-31 + sx, 7.8, 0.55, 0.55, 0.05, 0x1a1a1a, 3.45, { s: 'cyl', rot: [-0.5 - PI / 2, 0, 0] });
  b.sandbags(-31, 11.6, 7, 'x'); b.sandbags(-37, 6, 6, 'z');

  // stone radio hut
  b.building({ x: -38, z: -6, w: 8, d: 7, h: 3.4, m: 'stone', c: STONE, doors: { e: [0] }, open: { s: [0] }, roof: { type: 'flat', c: 0x6d6a64 } });
  b.dec(-39.5, -7, 0.06, 0.06, 4, 0x8a8d90, 3.7); b.dish(-36.5, 4.6, -5, 0.8, 0.9, 0.3);

  // ruined chapel (south-west) with rubble and ivy
  b.patch(-24, 26, 16, 12, 0x8b867c, 'paving', 0.03);
  b.ruin(-32, 20, -26, 20, 1.2, 3.4, STONE); b.ruin(-23, 20, -16, 20, 1.0, 3.0, STONE);
  b.ruin(-32, 32, -21, 32, 0.8, 2.6, STONE); b.ruin(-32, 20.4, -32, 31.6, 1.2, 3.4, STONE); b.ruin(-16, 20.4, -16, 26, 0.8, 2.2, STONE);
  b.rock(-27, 27, 2.4, 2.0, 0.9, 0x8c857a); b.rock(-20, 30, 1.8, 1.6, 0.7, 0x8c857a); b.rock(-14, 22, 1.6, 1.4, 0.6, 0x8c857a);
  for (let i = 0; i < 8; i++) b.dec(b.rand(-32, -16), b.pick([19.6, 32.4]), b.rand(1, 2.5), 0.15, b.rand(1, 2.4), 0x4a6a2e, 0, { m: 'foliage' });
  b.tree(-38, 38, 'oak', 1.1); b.tree(-24, 38, 'bush', 1.2);

  // courtyard (south) — tarps, boat on trailer, generator containers, cover walls
  b.ruin(-14, 13, -4, 13, 0.8, 2.0, STONE); b.ruin(4, 13, 16, 13, 0.8, 1.8, STONE);
  b.planter(0, 14, 3, 3, [0xd94a3a]); b.tree(0, 14, 'oak', 0.85);
  b.patch(13, 23, 5, 3.5, 0x2f5f8a, 'cloth', 0.04); b.patch(4, 31, 4, 4, 0x2f5f8a, 'cloth', 0.04);
  b.boat(24, 24, 'z', 0x5e6a72, 0, true);
  b.container(8, 31, 'x', 0x3d4a3a); b.container(-4, 20, 'z', 0x434c38);
  for (const [x, z] of [[12, 19], [16, 27], [20, 31], [27, 18]]) b.cone(x, z);
  b.barrier(-12, 4, 'z'); b.barrier(12, 4, 'z'); b.barrier(-18, -14, 'x');
  b.truck(18, -14, 'x', OLIVE, 0x4a5236);
  b.crate(-8, 26); b.crate(-8, 27.2, 0.9); b.ammo(-10, 30);
  for (const [x, z] of [[-8, -18], [20, -18], [30, 10], [-38, 28], [42, -40]]) b.tree(x, z, 'oak', b.rand(0.85, 1.1));
  for (let i = 0; i < 12; i++) b.tree(b.pick([-44, 44]) * 0.98, b.rand(-40, 40), 'bush', b.rand(0.8, 1.3));
  for (const [x, z, w, d] of [[-38, 38, 14, 12], [40, 40, 10, 8], [-40, -40, 10, 10], [0, 41, 36, 8], [44, 0, 4, 30], [-44, 10, 4, 40]]) b.patch(x, z, w, d, 0x5d6b3e, 'grass', 0.025);
  for (const [x, z, dx] of [[12, -16, 1], [-12, -16, -1], [24, 8, 1], [-22, 12, 1]]) b.lamp(x, z, 4.2, 0xffe6b0, [dx, 0]);
  return {
    id: 0, name: 'CITADEL', sub: 'ADRIATIC COAST, 1981', half: H, island: true,
    ground: { c: 0x9a968c, m: 'paving' }, sea: { y: -6.5, c: 0x2b5661 },
    sky: [0x56626e, 0x9aa6ad], fog: 0x8c989f, fogNear: 30, fogFar: 150,
    hemi: [0xc4ced6, 0x55524a, 0.9], sun: [0xe8eef4, 0.9, [0.45, 1, 0.55]], weather: 'rain', clouds: 0.95, backdrop: 'sea', ...pack(b),
  };
}

// ================================================================== 1. POLARIS — arctic research station in a blizzard
function polaris() {
  const b = builder(202);
  const H = 46;
  const NAVY = 0x2e3c5b, RED = 0xa83a2c, WHITE = 0xdfe3e6, STEEL = 0x8d949b, ROCK = 0x737a82;
  b.bounds(H, 0, 0);
  for (const [x, z, w, d] of [[0, H + 1.4, H * 2 + 6, 2.8], [0, -H - 1.4, H * 2 + 6, 2.8], [-H - 1.4, 0, 2.8, H * 2], [H + 1.4, 0, 2.8, H * 2]]) {
    b.box(x, z, w, d, 6.5, ROCK, 0, { m: 'rock' });
    b.dec(x, z, w + 0.4, d + 0.4, 0.6, 0xeef2f6, 6.5, { m: 'snow' });
  }
  for (let i = 0; i < 40; i++) {
    const side = i % 4, t = b.rand(-H + 3, H - 3), off = H - b.rand(0.5, 2.5);
    const [x, z] = side === 0 ? [t, off] : side === 1 ? [t, -off] : side === 2 ? [off, t] : [-off, t];
    b.rock(x, z, b.rand(2, 4.5), b.rand(2, 4.5), b.rand(1.2, 3.2), ROCK, true);
  }
  // plowed paths and concrete pads
  b.patch(0, -16, 70, 7, 0xc5ccd3, 'snow', 0.03); b.patch(-2, 8, 7, 40, 0xc5ccd3, 'snow', 0.03); b.patch(28, 0, 6, 60, 0xc5ccd3, 'snow', 0.03);
  b.patch(0, -22, 46, 3, 0x8f959b, 'concrete', 0.04);

  // main facility
  b.building({ x: 0, z: -31, w: 42, d: 13, h: 9.6, floors: 3, m: 'panel', c: WHITE, doors: { s: [-13, 0, 13] }, doorW: 2.6, doorH: 3.0, winStyle: 'band',
    stripe: { y: 6.3, h: 0.6, c: RED }, base: { h: 1.0, c: NAVY, m: 'metal' }, trim: 0xc9cdd1, roof: { type: 'flat', c: 0x5d636a, parapet: 0.8 } });
  for (const x of [-14, -7, 0, 7, 14]) b.box(x, -31, 0.6, 0.6, 9.6, 0x9aa0a6, 0, { m: 'concrete' });
  b.box(-17, -34, 3, 1.2, 1.4, 0x3d4650, 0, { m: 'metal' }); b.box(9, -35, 4, 1.4, 1.6, 0x3d4650, 0, { m: 'metal' });
  b.crate(-5, -28, 1.2, 0x6f7a84); b.crate(4, -27.6); b.crate(16, -33, 1.3, 0x6f7a84);
  for (let x = -19; x <= 19; x += 3.8) b.dec(x, -24.3, 1.1, 0.25, 0.12, 0xeaf4ff, 9.1, { m: 'glow' });
  b.sign(-16.5, 4.0, -24.28, 2.6, 2.6, 's', '', { style: 'emblem' });
  b.dec(12, -31, 5.5, 5.5, 2.8, 0xe8ecef, 9.9, { s: 'dome', m: 'metal' });
  b.lattice(-16, -33, 1.6, 0.6, 8, STEEL, STEEL, 9.9, false);
  b.dish(-12, 11.4, -29, 1.4, 0.4, 0.4);
  b.dec(-16, -33, 0.3, 0.3, 0.3, 0xff3a2a, 18, { m: 'glow' });

  // red / navy modules with an elevated catwalk bridge between them
  const module = (x, z, w, d, label, doors, awning) => {
    b.building({ x, z, w, d, h: 6.4, floors: 2, m: 'metal', c: NAVY, split: { y: 3.2, c: RED }, doors, awning, awningC: RED,
      stripe: { y: 3.1, h: 0.2, c: 0xe9ecee }, trim: 0xe9ecee, winW: 1.6, roof: { type: 'flat', c: 0x50565c, parapet: 0.3 } });
    b.rail(x - w / 2 + 0.3, z - d / 2 + 0.3, x + w / 2 - 0.3, z - d / 2 + 0.3, 6.7, 0x3a3e42, 1.0, false);
    b.rail(x - w / 2 + 0.3, z + d / 2 - 0.3, x + w / 2 - 0.3, z + d / 2 - 0.3, 6.7, 0x3a3e42, 1.0, false);
    b.dec(x + w / 4, z, 0.25, 0.25, 4.5, 0xc8ccd0, 6.7, { s: 'cyl' });
    for (let i = 0; i < 6; i++) b.dec(x - w / 2 + 1 + i * (w - 2) / 5, z + d / 2 + 0.25, 0.12, 0.12, b.rand(0.3, 0.8), 0xdff0ff, 6.0 - 0.2, { s: 'cone', rot: [PI, 0, 0], m: 'snow' });
    b.sign(x - w / 2 + 1.6, 1.0, z + d / 2 + 0.17, 1.8, 1.4, 's', label, { style: 'letters', fg: '#e9ecee' });
  };
  module(-18, -7, 12, 9, 'P1', { s: [-2.5], e: [1.5] });
  module(17, -3, 15, 10, 'P2', { s: [3], n: [-3] }, 's');
  b.catwalk(-10.9, -7, 1.8, 9, 3.2); b.stairs(-10.9, -2.5 + 4.42, 'n', 1.8, 3.2, 0x5a5f65, 'metal');
  b.rail(-10.0, -11.5, -10.0, -7.9, 3.2); b.rail(-10.0, -6.1, -10.0, -2.5, 3.2);
  b.catwalk(-0.7, -7, 18.6, 1.8, 3.2); b.rail(-10, -7.9, 8.6, -7.9, 3.2); b.rail(-10, -6.1, 8.6, -6.1, 3.2);
  for (const x of [-4, 3]) for (const z of [-7.8, -6.2]) b.box(x, z, 0.25, 0.25, 3.0, 0x4a4f55, 0, { m: 'metal' });
  b.catwalk(8.6, -3, 1.8, 10, 3.2); b.stairs(8.6, 2 + 4.42, 'n', 1.8, 3.2, 0x5a5f65, 'metal');
  b.rail(7.7, -6.1, 7.7, 2, 3.2); b.rail(7.7, -8, 9.5, -8, 3.2);
  b.crate(-17, -4, 1.2, 0x6f7a84); b.box(20, -6, 3, 1, 1.2, 0x3d4650, 0, { m: 'metal' });

  // floodlight towers and the beacon mast
  for (const [x, z] of [[-39, -39], [39, -39], [-39, 39], [39, 39]]) {
    b.lattice(x, z, 1.8, 1.0, 16, STEEL);
    b.dec(x, z, 2.6, 0.5, 0.9, 0x3a3e42, 15.6, { m: 'metal' });
    for (const s of [-0.6, 0.6]) b.dec(x + s, z + (z < 0 ? 0.28 : -0.28), 0.8, 0.06, 0.6, 0xf2f7ff, 15.75, { m: 'glow' });
  }
  b.lattice(38, 6, 2.2, 0.6, 22, 0xe6e3dc, 0xb3342a);
  b.dec(38, 6, 0.5, 0.5, 0.8, 0xff2a1a, 22.1, { m: 'glow' });
  for (const [y, a] of [[14, 0], [17, 1.6], [14, 3.1]]) b.dec(38 + Math.sin(a) * 1.2, 6 + Math.cos(a) * 1.2, 0.9, 0.9, 0.9, 0xd9dcdf, y, { s: 'cyl', rot: [PI / 2, a, 0] });

  // rocky outcrops with snowy pines
  b.rock(-2, 18, 5, 4, 2.6, ROCK, true); b.rock(1.6, 20.6, 3.6, 3, 1.8, ROCK, true); b.rock(-5.4, 21.4, 3, 2.6, 1.4, ROCK, true);
  b.tree(-4.5, 15, 'pine', 0.9, undefined, true); b.tree(3, 16.5, 'pine', 0.7, undefined, true);
  b.rock(-32, 22, 6, 5, 3.4, ROCK, true); b.rock(-27, 25, 4, 3.5, 2.2, ROCK, true); b.rock(-35, 27, 3.5, 3, 1.6, ROCK, true);
  for (const [x, z, s] of [[-30, 17, 1.1], [-25, 20, 0.8], [-37, 19, 1.2], [-22, 28, 0.9], [14, 32, 1], [-12, 36, 1.2], [20, 18, 0.8]]) b.tree(x, z, 'pine', s, undefined, true);

  // fuel tank farm, pipes, containers, vehicles
  b.tank(31, 30, 2.6, 6, 0xd6d9dc); b.tank(38, 30, 2.6, 6, 0xd6d9dc); b.tank(34.5, 37, 2.2, 5, 0xc4c8cc);
  b.fenceChain(26, 25, 30, 25, 2.2); b.fenceChain(34, 25, 42, 25, 2.2);
  for (let z = -22; z <= 22; z += 8) b.box(27, z, 0.4, 0.4, 2.7, 0x4a4f55, 0, { m: 'metal' });
  b.pipe(26.7, -24, 26.7, 24, 2.85, 0.25, STEEL); b.pipe(27.3, -24, 27.3, 24, 3.15, 0.18, 0xc9a24a);
  b.container(-34, -14, 'z', 0x2f5a8a); b.container(-34, -14, 'z', 0xa33a2c, 2.6); b.container(-29, -20, 'x', 0x4a6a7a);
  b.snowcat(8, 24, 'x');
  b.dec(-16, 30, 2.4, 2.4, 6, 0xd0d4d8, 0.6 + 1.2 - 3, { s: 'cyl', m: 'metal', rot: [0, 0, PI / 2] }); b.inv(-16, 30, 6, 2.4, 2.4);
  b.building({ x: -37, z: 36, w: 5, d: 5, h: 3, m: 'metal', c: RED, doors: { e: [0] }, winW: 0.9, roof: { type: 'flat', c: 0x50565c } });
  b.fenceChain(-44, 41, -8, 41, 2.4); b.fenceChain(-2, 41, 44, 41, 2.4);
  for (const [x, z] of [[-8, -14], [8, -14], [-12, 4], [24, -14], [24, 12], [-24, -14]]) b.lamp(x, z, 4.5, 0xe8f4ff, [0, 1]);
  for (let i = 0; i < 14; i++) b.dec(b.rand(-40, 40), b.rand(-40, 40), b.rand(3, 6), b.rand(2, 4), b.rand(0.4, 0.8), 0xf0f3f7, -0.2, { s: 'ico', det: 1, m: 'snow' });
  return {
    id: 1, name: 'POLARIS', sub: 'ARCTIC CIRCLE, 1979', half: H,
    ground: { c: 0xe8edf2, m: 'snow' },
    sky: [0x5b6d88, 0xbac8d6], fog: 0xb3c2d1, fogNear: 14, fogFar: 85,
    hemi: [0xd6e4ff, 0x7a8594, 1.0], sun: [0xdde9ff, 0.8, [-0.35, 1, -0.5]], weather: 'snow', clouds: 1, backdrop: 'snowpeaks', ...pack(b),
  };
}

// ================================================================== 2. GRACHT — canal city
function gracht() {
  const b = builder(303);
  const H = 50;
  const BRICK = 0x8b4a36, DBRICK = 0x5e3a2c, CREAM = 0xd9cbb0, GRAY = 0x8d9094, WHITE = 0xe4dfd4, OCHRE = 0xc79a5a, SLATE = 0x40464b;
  const palette = [[BRICK, 'brick'], [DBRICK, 'brick'], [CREAM, 'plaster'], [GRAY, 'plaster'], [WHITE, 'plaster'], [OCHRE, 'brick'], [0x7a4f3e, 'brick']];
  b.bounds(H, 0, 0);
  const WY = -1.3;
  // canals: A runs east-west through the middle, B runs north from A
  b.hole(0, 0, 700, 8); b.water(0, 0, 700, 8, WY);
  b.hole(23.5, -177, 7, 346); b.water(23.5, -177, 7, 346, WY);
  for (const z of [-3.85, 3.85]) b.dec(0, z, 300, 0.3, 1.6, 0x77736c, -1.6, { m: 'stone' });
  for (const x of [20.15, 26.85]) b.dec(x, -80, 0.3, 152, 1.6, 0x77736c, -1.6, { m: 'stone' });
  const bridgesA = [[-28, 7], [2, 8], [38, 7]];
  // bank colliders + railings with gaps for the bridges
  const bank = (z, a, e, gaps) => {
    let cur = a;
    for (const [gx, gw] of [...gaps, [e + 100, 0]].sort((p, q) => p[0] - q[0])) {
      const s = Math.min(gx - gw / 2, e);
      if (s - cur > 0.2) { b.pc((cur + s) / 2, z, s - cur, 0.3, 2.6); b.rail(cur, z, s, z, 0, 0x2a2c2e, 1.0, false); }
      cur = Math.max(cur, gx + gw / 2);
      if (cur >= e) break;
    }
  };
  bank(-4.1, -H, 20, bridgesA); bank(-4.1, 27, H, bridgesA); bank(4.1, -H, H, bridgesA);
  for (const x of [19.9, 27.1]) { b.pc(x, (-H - 29) / 2, 0.3, H - 29, 2.6); b.pc(x, (-23 - 4.1) / 2, 0.3, 18.9, 2.6); b.rail(x, -H, x, -29, 0, 0x2a2c2e, 1, false); b.rail(x, -23, x, -4.1, 0, 0x2a2c2e, 1, false); }
  // bridges
  for (const [bx, bw] of bridgesA) {
    b.box(bx, 0, bw, 11, 0.5, 0x8a8178, -0.5, { m: 'stone' });
    b.dec(bx, 0, bw, 8.4, 0.8, 0x7e766c, -1.3, { m: 'stone' });
    for (const s of [-1, 1]) b.pc(bx + s * (bw / 2 - 0.15), 0, 0.3, 8.6, 2.6);
    if (bx === 2) {   // red steel arch bridge
      for (const s of [-1, 1]) {
        const xs = bx + s * (bw / 2 - 0.25);
        b.dec(xs, 0, 0.12, 10, 0.08, 0xa82e26, 1.0); b.dec(xs, 0, 0.12, 10, 0.08, 0xa82e26, 0.5);
        const n = 10, R = 6.2, rise = 5;
        for (let i = 0; i < n; i++) {
          const a0 = PI - PI * i / n, a1 = PI - PI * (i + 1) / n;
          const z0 = Math.cos(a0) * R, y0 = Math.sin(a0) * rise, z1 = Math.cos(a1) * R, y1 = Math.sin(a1) * rise;
          const len = Math.hypot(z1 - z0, y1 - y0) + 0.1;
          b.dec(xs, (z0 + z1) / 2, 0.4, len, 0.4, 0xa82e26, (y0 + y1) / 2 - 0.2, { m: 'paint', rot: [Math.atan2(-(y1 - y0), z1 - z0), 0, 0] });
          if (i > 0) b.dec(xs, z0, 0.1, 0.1, Math.max(0.1, y0), 0x8a2620, 0);
        }
      }
      for (const z of [-2.5, 0, 2.5]) b.dec(bx, z, bw - 0.4, 0.3, 0.3, 0xa82e26, 4.6 - Math.abs(z) * 0.25, { m: 'paint' });
    } else {
      for (const s of [-1, 1]) { b.dec(bx + s * (bw / 2 - 0.2), 0, 0.4, 9.4, 0.9, 0x8f877d, 0, { m: 'stone' }); b.dec(bx + s * (bw / 2 - 0.2), 0, 0.5, 9.6, 0.12, 0x9c948a, 0.9, { m: 'stone' }); }
    }
  }
  b.box(23.5, -26, 9, 6, 0.5, 0x8a8178, -0.5, { m: 'stone' });
  for (const s of [-1, 1]) { b.pc(23.5, -26 + s * 2.85, 7.6, 0.3, 2.6); b.dec(23.5, -26 + s * 2.8, 7.4, 0.4, 0.9, 0x8f877d, 0, { m: 'stone' }); }
  // moored boats and canal-side trees / lamps
  for (const x of [-42, -14, 16, 46]) b.boat(x, -2.4, 'x', b.pick([0x2f4f6a, 0x6a2f2a, 0x3a5a3a]), WY + 0.1);
  for (const x of [-38, -6, 30]) b.boat(x, 2.4, 'x', b.pick([0x4a4a52, 0x2f4f6a, 0x7a5a2a]), WY + 0.1);
  b.boat(21.8, -40, 'z', 0x2f4f6a, WY + 0.1);
  for (const x of [-44, -36, -20, -12, 12, 30, 46]) { b.tree(x, -6.2, 'oak', 0.9, 0x5a7a3a); b.tree(x + 3, 6.2, 'oak', 0.85, 0x5a7a3a); }
  for (const x of [-40, -16, 8, 26, 44]) { b.lamp(x, -5, 4.2, 0xffe6b0, [0, 1]); b.lamp(x + 6, 5, 4.2, 0xffe6b0, [0, -1]); }

  // streets and tram tracks
  b.patch(-15, -7.5, 70, 6.5, 0x4f4f50, 'asphalt', 0.025); b.patch(-15, 7.5, 70, 6.5, 0x4f4f50, 'asphalt', 0.025);
  for (const z of [-7.9, -7.1, 7.1, 7.9]) b.patch(-15, z, 70, 0.08, 0x8a8c90, 'plain', 0.035);
  b.patch(-15, -27.5, 70, 12, 0x555556, 'asphalt', 0.025); b.patch(-12, 27.5, 76, 10, 0x555556, 'asphalt', 0.025);

  // rows of tall, narrow canal houses (steep gables facing the street)
  const row = (x0, x1, zc, d, face, alleys, enterEvery = 3) => {
    let x = x0, i = 0;
    const opp = face === 's' ? 'n' : 's';
    while (x < x1 - 3.9) {
      const al = alleys.find(a => x >= a[0] - 0.01 && x < a[1]);
      if (al) { x = al[1]; continue; }
      const next = alleys.filter(a => a[0] >= x).sort((p, q) => p[0] - q[0])[0];
      const limit = Math.min(x1, next ? next[0] : x1);
      let w = b.rand(5.6, 7.4);
      if (limit - (x + w) < 4) w = limit - x;
      if (w < 3.9) { x = limit; continue; }
      const floors = b.pick([3, 3, 4]);
      const [c, m] = b.pick(palette);
      const enter = i % enterEvery === 1;
      b.building({ x: x + w / 2, z: zc, w, d, h: floors * 3.1, floors, m, c, trim: 0xf0ece2, winGap: 1.9, winW: 1.0, winH: 1.5, cornice: true,
        solid: !enter, doors: enter ? { [face]: [0], [opp]: [0] } : undefined, fakeDoors: { [face]: [w > 6 ? -1.2 : 0] }, doorC: b.pick([0x2f4a3a, 0x3a2a24, 0x2a3550]),
        roof: { type: 'gable', ax: 'z', c: b.pick([SLATE, 0x4a3a34, 0x8e4630]), rise: w * 0.62, chimneys: b.R() < 0.4 ? 1 : 0 } });
      if (enter) { b.crate(x + w / 2 - 1.5, zc + 2, 0.9); b.box(x + w / 2 + 1.5, zc - 1.5, 1.2, 2.4, 0.9, 0x5a3b2a, 0, { m: 'wood' }); }
      x += w; i++;
    }
  };
  row(-H, 18, -16, 10, 's', [[-34, -31.5], [-8, -5], [10, 12.5]]);
  row(-H, 18, -39, 10, 's', [[-22, -19], [4, 7]]);
  row(-H, 26, 17, 10, 'n', [[-31, -28], [-5, -2], [13, 16]]);
  row(-H, 26, 38.5, 9, 'n', [[-19, -16], [7, 10]]);
  // church with clock tower (north-east)
  b.building({ x: 40, z: -28, w: 12, d: 18, h: 10, floors: 1, m: 'brick', c: 0x7a3d2c, doors: { w: [6], s: [0] }, open: { w: [-3] }, winW: 1.3, winH: 3.6, winGap: 3.2,
    roof: { type: 'gable', ax: 'z', c: SLATE, rise: 5.5 } });
  b.box(40, -40.5, 6, 6, 26, 0x7a3d2c, 0, { m: 'brick' });
  b.dec(40, -40.5, 6.6, 6.6, 0.5, 0xd8d2c4, 19, { m: 'stone' });
  for (const [dx, dz] of [[0, 3.05], [-3.05, 0], [3.05, 0]]) b.dec(40 + dx, -40.5 + dz, dz ? 1.4 : 0.1, dz ? 0.1 : 1.4, 2.4, 0x1c1c1e, 22);
  b.dec(40, -40.5, 6.4, 6.4, 9, SLATE, 26, { s: 'cone', seg: 4, rot: [0, PI / 4, 0], m: 'metal' });
  b.dec(40, -40.5, 0.12, 0.12, 2, 0xc9a24a, 35);
  b.sign(40, 16.2, -37.43, 3.4, 3.4, 's', '', { style: 'clock' });
  b.sign(36.93, 16.2, -40.5, 3.4, 3.4, 'w', '', { style: 'clock' });
  b.patch(38, -12, 22, 12, 0xa39b8f, 'paving', 0.03);
  b.awning(33, -13, 3.2, 2, 2.4, 0x2f6a4a); b.box(33, -13, 3, 1.2, 0.9, 0x6e4f33, 0, { m: 'wood' });
  b.awning(42, -10, 3.2, 2, 2.4, 0x8a2f25); b.box(42, -10, 3, 1.2, 0.9, 0x6e4f33, 0, { m: 'wood' });
  b.tree(46, -16, 'oak', 1.1, 0x5a7a3a); b.tree(30, -18, 'oak', 1, 0x5a7a3a);
  b.box(46, -6.5, 1.0, 1.0, 2.5, 0xb52a22, 0, { m: 'paint' }); b.dec(46, -6.5, 1.04, 1.04, 1.4, 0xffffff, 0.9, { m: 'window' });
  // department store (south-east)
  b.building({ x: 40, z: 31, w: 18, d: 24, h: 7.4, floors: 2, m: 'stone', c: 0xd4c8b0, doors: { w: [-6, 6], n: [0] }, doorW: 2.2, winW: 2.2, winGap: 3.4,
    base: { h: 0.8, c: 0x6f6a62 }, band: 0xbfb39b, roof: { type: 'flat', c: 0x5d5a55, parapet: 0.9 } });
  b.sign(40, 5.9, 18.83, 11, 1.2, 'n', 'WARENHUIS', { style: 'letters', fg: '#d8b04a' });
  for (const z of [24, 31, 38]) { b.box(36, z, 4, 0.8, 1.6, 0x6b5a48, 0, { m: 'wood' }); b.box(44, z, 4, 0.8, 1.6, 0x6b5a48, 0, { m: 'wood' }); }
  b.patch(38, 11.5, 22, 14, 0xa39b8f, 'paving', 0.03);
  for (const [x, z] of [[31, 10], [45, 14]]) b.tree(x, z, 'oak', 1, 0x5a7a3a);
  b.bench(38, 9, 'x'); b.bench(38, 15, 'x');
  // street life: tram, bus, cars, bikes, kiosk
  b.tram(-16, 7.5, 'x'); b.bus(6, 27.5, 'x', 0x9c2a22, 0xe9e2d2);
  for (const [x, z, ax] of [[-40, -9.8, 'x'], [-2, -9.8, 'x'], [14, 10.4, 'x'], [-36, 10.4, 'x'], [-30, -24, 'x'], [-6, -30, 'x'], [10, -24, 'x'], [-40, 24, 'x'], [-22, 31, 'x'], [20, 31, 'x']]) {
    b.car(x, z, ax, b.pick([0x7a2b25, 0x2c4d6e, 0x8a8f94, 0xc9b26a, 0x3a5e3e, 0xe0ddd5]));
  }
  for (const x of [-26, -24.8, 28, 29.2]) { b.dec(x, -10.9, 0.06, 1.7, 0.9, 0x1e1e1e, 0.1); }
  b.box(-12, -27, 2, 2, 2.6, 0x2f5a3a, 0, { m: 'paint' }); b.dec(-12, -27, 2.4, 2.4, 0.15, 0x24442c, 2.6);
  for (const x of [-44, -30, -16, -2]) b.tree(x, -27.5, 'oak', 0.9, 0x5a7a3a);
  for (const x of [-42, -28, -14, 0, 18]) b.tree(x, 23.4, 'oak', 0.9, 0x5a7a3a);
  b.smoke(-26, 12.5, -39, 1.2); b.smoke(12, 11, 38.5, 1);
  // distant streets beyond the map edge (decoration)
  for (const [x, z, w, d] of [[-H - 6, -27, 8, 46], [-H - 6, 27, 8, 46], [H + 6, -27, 8, 46], [H + 6, 27, 8, 46], [-15, H + 6, 70, 8], [-24, -H - 6, 88, 8], [40, -H - 6, 24, 8], [38, H + 6, 24, 8]]) {
    b.dec(x, z, w, d, b.rand(11, 15), b.pick([BRICK, CREAM, GRAY, DBRICK]), 0, { m: 'facade' });
  }
  return {
    id: 2, name: 'GRACHT', sub: 'AMSTERDAM, 1984', half: H,
    ground: { c: 0x8e877e, m: 'cobble' }, waterC: 0x3a5859,
    sky: [0x6d9cc8, 0xd6e0e6], fog: 0xc6d0d6, fogNear: 40, fogFar: 170,
    hemi: [0xeef4ff, 0x6b6052, 0.95], sun: [0xfff0d6, 1.6, [0.55, 1, 0.4]], clouds: 0.55, backdrop: 'city', ...pack(b),
  };
}

// ================================================================== 3. KOMBINAT — Soviet factory
function kombinat() {
  const b = builder(404);
  const H = 48;
  const WBRICK = 0xd8d4ca, GREEN = 0x5f8a6e, DOOR = 0x6e9a88, RED = 0xa8392b;
  b.bounds(H, 0, 0);
  // perimeter concrete panel fence with barbed wire
  b.fencePanel(-H, -H, H, -H); b.fencePanel(-H, H, H, H); b.fencePanel(-H, -H, -H, H); b.fencePanel(H, -H, H, H);
  b.patch(-9, -19, 78, 6, 0x5d5d5a, 'asphalt', 0.025); b.patch(24, 14, 6, 66, 0x5d5d5a, 'asphalt', 0.025);
  for (const [x, z, w, d] of [[-34, 30, 24, 20], [40, 6, 14, 14], [-40, -10, 12, 10], [10, 24, 16, 6], [-8, 34, 18, 6]]) b.patch(x, z, w, d, 0x6f7d48, 'grass', 0.03);

  // main hall
  b.building({ x: -8, z: -35, w: 50, d: 20, h: 13, floors: 2, m: 'brick', c: WBRICK, winStyle: 'industrial', winH: 3.2, base: { h: 1.1, c: 0x9c978c, m: 'concrete' },
    doors: { s: [-17, 0, 15], e: [0] }, doorW: 3.4, doorH: 4.2, trim: 0xcfcac0, band: 0xc4bfb4, roof: { type: 'flat', c: 0x5d5b56, parapet: 0.8 } });
  b.dec(-8, -35, 40, 5, 2.2, 0xcfcac0, 13.3, { m: 'brick' });
  for (const s of [-1, 1]) b.dec(-8, -35 + s * 2.52, 38, 0.06, 1.4, 0xffffff, 13.7, { m: 'window' });
  for (const x of [-23, -13, -3, 7]) b.box(x, -35, 0.7, 0.7, 13, 0xb9b4aa, 0, { m: 'concrete' });
  b.box(-26, -39, 6, 3, 2.4, 0x5d6a62, 0, { m: 'metal' }); b.box(-12, -31, 4, 2.5, 2.2, 0x6a5d4e, 0, { m: 'metal' });
  b.box(3, -40, 5, 3, 3, 0x5d6a62, 0, { m: 'metal' }); b.box(12, -30, 3, 3, 1.6, 0x6a5d4e, 0, { m: 'metal' });
  b.crate(-18, -29, 1.2); b.crate(-16.6, -29, 1.2); b.crate(-17.3, -29, 1.0, 0x8a6b45, 1.2);
  b.dec(-8, -41, 48, 0.4, 0.4, 0x4a4d50, 9.4, { m: 'metal' }); b.dec(-8, -29, 48, 0.4, 0.4, 0x4a4d50, 9.4, { m: 'metal' });
  b.dec(-4, -35, 0.6, 12.4, 0.8, 0xd8a83a, 9.2, { m: 'paint' });
  signFrame(b, -11, -24.6, 24, 13.3, 2.6);
  b.sign(-11, 13.45, -24.5, 23, 2.4, 's', 'СЛАВА ТРУДУ!', { style: 'letters', fg: '#c8372a' });

  // admin block with fire escape
  b.building({ x: 37, z: -26, w: 13, d: 20, h: 15.5, floors: 5, m: 'panel', c: 0xc9c6bc, doors: { w: [-5, 5], s: [0] }, winGap: 2.4, winW: 1.4,
    base: { h: 0.8, c: 0x8f8b82 }, roof: { type: 'flat', c: 0x5d5b56, parapet: 0.6 } });
  for (let f = 1; f < 5; f++) {
    b.dec(37, -15.6, 3, 1.2, 0.12, 0x3a3c3e, f * 3.1 - 0.1, { m: 'metal' });
    b.dec(37 + (f % 2 ? 0.7 : -0.7), -15.6, 2.4, 0.9, 0.1, 0x3a3c3e, f * 3.1 - 1.6, { m: 'metal', rot: [0, 0, f % 2 ? 0.9 : -0.9] });
  }
  b.sign(32, 2.2, -15.83, 1.2, 0.9, 's', '01', { style: 'plate', bg: '#f2efe6', fg: '#222' });

  // gantry crane over the west yard (with a container hanging from it)
  for (const [x, z] of [[-43, -13], [-43, 5], [-23, -13], [-23, 5]]) b.box(x, z, 1, 1, 15, GREEN, 0, { m: 'metal' });
  for (const x of [-43, -23]) {
    b.dec(x, -4, 1.2, 20, 1.2, GREEN, 15, { m: 'metal' });
    for (let i = 0; i < 6; i++) b.dec(x, -12 + i * 3.3, 0.18, 3.6, 0.18, GREEN, 13.4, { m: 'metal', rot: [i % 2 ? 0.6 : -0.6, 0, 0] });
    for (const z of [-13, 5]) b.dec(x, z, 0.25, 0.25, 15, GREEN, 0, { rot: [0, 0, 0.12] });
  }
  for (const z of [-5, -3]) b.dec(-33, z, 21, 0.9, 1.3, GREEN, 14.6, { m: 'metal' });
  b.dec(-31, -4, 3, 3, 1.2, 0xd8a83a, 13.6, { m: 'paint' });
  b.dec(-31, -4, 0.08, 0.08, 4.8, 0x222222, 8.8);
  b.dec(-31, -4, 6.1, 2.44, 2.6, 0x2f6a8a, 6.2, { m: 'metal' });
  for (const [x, z] of [[-38, -8], [-28, 0]]) { b.box(x, z, 3.6, 1.6, 1.2, 0xb4b0a6, 0, { m: 'concrete' }); b.box(x, z, 3.6, 1.6, 0.6, 0xa9a59b, 1.2, { m: 'concrete' }); }
  b.container(-36, 2, 'x', 0x9a4a2a); b.container(-27, -10, 'z', 0x3a5a7a);

  // garage building with slogans, open and closed bays
  b.building({ x: 6, z: 6, w: 30, d: 11, h: 5.4, m: 'brick', c: 0xdcd8cc, doors: { s: [-3.75, 11.25], n: [0] }, doorW: 4, doorH: 3.6, closed: { s: [-11.25, 3.75] },
    closedC: DOOR, winStyle: 'industrial', winW: 1.8, winH: 1.4, winGap: 3.6, trim: 0xd0ccc0, roof: { type: 'flat', c: 0x6a675f, parapet: 0.4 } });
  b.sign(6, 4.15, 11.83, 26, 0.85, 's', 'ПЯТИЛЕТКУ — В ЧЕТЫРЕ ГОДА!', { style: 'banner', bg: '#2f7a52', fg: '#f2efe6' });
  signFrame(b, 6, 11, 20, 5.7, 2.0);
  b.sign(6, 5.8, 11.1, 20, 1.8, 's', 'МИР · ТРУД · МАЙ', { style: 'letters', fg: '#c8372a' });
  b.sign(-6.5, 2.4, 11.83, 0.7, 0.7, 's', 'A', { style: 'plate', bg: '#2f8a4a', fg: '#fff' });
  b.truck(11.25, 5.2, 'z', RED);
  b.box(-3.75, 2.2, 3, 0.8, 0.9, 0x5a4a3a, 0, { m: 'wood' });
  // small annex "02"
  b.building({ x: -14, z: 18, w: 8, d: 7, h: 4, m: 'brick', c: 0xd3cfc4, doors: { s: [0] }, roof: { type: 'flat', c: 0x6a675f, parapet: 0.4 } });
  b.sign(-15.6, 2.7, 21.68, 0.7, 0.7, 's', 'B', { style: 'plate', bg: '#c8372a', fg: '#fff' });
  b.sign(-12.2, 2.7, 21.68, 0.8, 0.6, 's', '02', { style: 'plate', bg: '#f2efe6', fg: '#222' });

  // pipelines
  for (let z = -22; z <= 38; z += 6) b.box(-45, z, 0.5, 0.5, 4.3, 0x6a6e72, 0, { m: 'metal' });
  b.pipe(-45, -24, -45, 40, 4.6, 0.32, 0x9a9ea2); b.pipe(-44.4, -24, -44.4, 40, 4.9, 0.22, 0x8a5a3a);
  b.pipe(-45, -24, -33, -24, 4.6, 0.32, 0x9a9ea2);
  for (const x of [19, 30]) b.box(x, -19, 0.5, 0.5, 5.6, 0x6a6e72, 0, { m: 'metal' });
  b.pipe(17, -19, 30.5, -19, 5.9, 0.35, 0x9a9ea2);
  // inner fence, water tower, chimney, railway
  b.fencePanel(-22, 14, -22, 28, 2.6); b.fencePanel(-22, 33, -22, H - 0.2, 2.6);
  for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) b.box(-38 + dx, 36 + dz, 0.4, 0.4, 10, 0x6a7a6e, 0, { m: 'metal' });
  b.dec(-38, 36, 6.4, 6.4, 4.2, 0x8a9a8e, 10, { s: 'cyl', seg: 18, m: 'metal' }); b.dec(-38, 36, 6.6, 6.6, 1.6, 0x6a7a6e, 14.2, { s: 'cone', seg: 18, m: 'metal' });
  b.box(40, 40, 4.4, 4.4, 34, 0x9a5a44, 0, { s: 'cyl', seg: 16, m: 'brick', r2: 1.5 });
  for (const y of [28, 31]) b.dec(40, 40, 3.5, 3.5, 1.4, 0xd8d4ca, y, { s: 'cyl', seg: 16, m: 'paint', r2: 1.6 });
  b.smoke(40, 34.5, 40, 1.6);
  b.patch(-9, 42, 78, 2.6, 0x6b5a48, 'wood', 0.035);
  for (const z of [41.3, 42.7]) b.patch(-9, z, 78, 0.12, 0x6a6c70, 'metal', 0.05);
  b.boxcar(-6, 42, 'x'); b.boxcar(10, 42, 'x', 0x2f4f6a); b.boxcar(-30, 42, 'x', 0x5a3a2a);
  // vehicles and clutter
  b.truck(32, 18, 'z', RED); b.bus(-34, 22, 'z', 0x4f86a8, 0xd8d4c8);
  b.barrels(-4, -12, 6, 0xc4652b); b.barrels(-28, 16, 5, 0xc4652b); b.barrels(18, 30, 4, 0x3c5a3a);
  for (const [x, z] of [[-12, 30], [4, 34]]) { b.box(x, z, 1.8, 2.4, 2.4, 0x6b5a48, 0, { m: 'wood' }); b.dec(x, z, 0.3, 2.6, 2.6, 0x4a3a2a, 0, { s: 'cyl', rot: [0, 0, PI / 2], m: 'wood' }); }
  b.building({ x: -36, z: -20, w: 6, d: 5, h: 3.5, m: 'brick', c: 0xc9c4b8, doors: { e: [0] }, roof: { type: 'flat', c: 0x6a675f, parapet: 0.3 } });
  b.sign(-32.82, 2.0, -20, 0.8, 0.8, 'e', '⚡', { style: 'plate', bg: '#f2c21a', fg: '#111' });
  for (let z = -10; z <= 36; z += 8) b.tree(28.2, z, 'poplar', b.rand(0.9, 1.1), 0x5d7c3a);
  for (let x = -40; x <= 40; x += 9) b.tree(x + b.rand(-1, 1), -H + 1.8, 'poplar', b.rand(0.9, 1.15), 0x5d7c3a);
  for (let i = 0; i < 12; i++) b.tree(b.rand(-44, 44), b.rand(-10, 40), 'bush', b.rand(0.7, 1.2), 0x5a6e38);
  for (const [x, z] of [[-10, -14], [10, -14], [20, 0], [-20, 6], [16, 20]]) b.lamp(x, z, 5, 0xfff0c8, [0, 1]);
  return {
    id: 3, name: 'KOMBINAT', sub: 'SVERDLOVSK OBLAST, 1983', half: H,
    ground: { c: 0xa9a69c, m: 'concrete' },
    sky: [0x5d97d0, 0xdde6ec], fog: 0xcdd6dc, fogNear: 45, fogFar: 175,
    hemi: [0xf0f4ff, 0x6a6858, 0.95], sun: [0xfff2da, 1.7, [-0.5, 1, 0.42]], clouds: 0.75, backdrop: 'industrial', ...pack(b),
  };
}

// ================================================================== 4. BORGO — Italian hill village
function borgo() {
  const b = builder(505);
  const H = 44;
  const YEL = 0xd9b44e, ORA = 0xd98b4b, PINK = 0xd8998a, CREAM = 0xe2d4b4, RED = 0xb84a3a, STONEW = 0xc9c0ae, TERRA = 0xc06a44;
  const GSH = 0x4f7a3a, BSH = 0x6b4a2e, FLOW = [0xd94a3a, 0xe8b84a, 0xd9608a, 0xf0f0f0];
  b.bounds(H, 0, 0);
  for (const [x, z, w, d] of [[0, H + 0.6, H * 2 + 2.4, 1.2], [0, -H - 0.6, H * 2 + 2.4, 1.2], [-H - 0.6, 0, 1.2, H * 2], [H + 0.6, 0, 1.2, H * 2]]) {
    b.box(x, z, w, d, 4, STONEW, 0, { m: 'stone' });
    b.dec(x, z, w + 0.2, d + 0.2, 0.2, 0xb3aa98, 4, { m: 'stone' });
  }
  const house = (o) => b.building({ base: { h: 0.7, c: 0xa89f8c }, trim: 0xece4d2, flowers: FLOW, winW: 1.0, winGap: 2.6, ...o,
    roof: { type: 'hip', c: TERRA, chimneys: 1, antenna: b.R() < 0.5, ...(o.roof || {}) } });

  // piazza with fountain, olive trees and a market stall
  b.patch(0, 5, 20, 14, 0xb8b0a0, 'paving', 0.03);
  b.dec(0, 5, 4.6, 4.6, 0.7, 0xb3aa98, 0, { s: 'cyl', seg: 20, m: 'stone' }); b.inv(0, 5, 4.2, 4.2, 0.7);
  b.dec(0, 5, 4.0, 4.0, 0.05, 0x5a8a9a, 0.62, { s: 'cyl', seg: 20, m: 'water' });
  b.dec(0, 5, 0.6, 0.6, 1.8, 0xb3aa98, 0.7, { s: 'cyl', m: 'stone' }); b.dec(0, 5, 1.6, 1.6, 0.3, 0xb3aa98, 2.4, { s: 'cyl', m: 'stone' });
  b.tree(-7, 10, 'oak', 0.8, 0x6a7a45); b.tree(7, 10.5, 'oak', 0.75, 0x6a7a45);
  b.bench(-6, 1, 'x'); b.bench(6, 1, 'x');
  b.awning(6, -0.5, 3.2, 2, 2.4, 0x2f6a4a); b.box(6, -0.5, 3, 1.1, 0.9, 0x7a5a3a, 0, { m: 'wood' });
  for (const [x, z] of [[4.8, -0.6], [6, -0.6], [7.2, -0.6]]) b.dec(x, z, 0.5, 0.4, 0.3, b.pick([0xd94a3a, 0xe8b84a, 0x7aa83a]), 0.9, { s: 'ico', det: 0 });

  // north-west: three houses along the main street, then a second row and the church
  house({ x: -15, z: -7.5, w: 9, d: 9, h: 6.6, floors: 2, c: YEL, shutters: GSH, doors: { e: [1], s: [-2] }, open: { s: [2] } });
  house({ x: -27, z: -8, w: 9, d: 10, h: 7, floors: 2, c: ORA, shutters: BSH, quoins: STONEW, doors: { s: [0], n: [2] }, roof: { type: 'gable', ax: 'x' } });
  house({ x: -39, z: -9, w: 9, d: 12, h: 6.6, floors: 2, c: CREAM, shutters: GSH, doors: { s: [0], e: [-3] }, roof: { type: 'gable', ax: 'z' } });
  house({ x: -20, z: -24, w: 12, d: 9, h: 6.8, floors: 2, c: PINK, shutters: GSH, doors: { e: [0], s: [3] }, ivy: 3 });
  house({ x: -9.5, z: -24, w: 9, d: 9, h: 6.6, floors: 2, c: CREAM, shutters: BSH, doors: { e: [0], n: [0] } });
  house({ x: -36, z: -28, w: 10, d: 12, h: 6.4, floors: 2, m: 'stone', c: STONEW, shutters: BSH, doors: { e: [0], n: [0] }, roof: { type: 'gable', ax: 'x' } });
  // archway over the north street
  b.box(-1, -19.75, 8, 1.5, 1.6, STONEW, 3.2, { m: 'stone' });
  b.arch(-1, -18.95, 'x', 7.4, 0.2, 0xb3aa98); b.arch(-1, -20.55, 'x', 7.4, 0.2, 0xb3aa98);
  house({ x: 6, z: -16, w: 6, d: 8, h: 6.4, floors: 2, c: ORA, shutters: GSH, doors: { w: [2] } });
  // church + bell tower
  b.building({ x: -24, z: -39, w: 16, d: 9, h: 7.5, floors: 1, m: 'stone', c: 0xd3cab6, doors: { e: [0], s: [3] }, winW: 1.0, winH: 2.6, winGap: 3.4, quoins: 0xb3aa98,
    roof: { type: 'gable', ax: 'x', c: TERRA, rise: 3 } });
  b.box(-12, -39, 5, 5, 18, 0xd3cab6, 0, { m: 'stone' });
  for (const [dx, dz, w, d] of [[0, 2.52, 1.6, 0.05], [0, -2.52, 1.6, 0.05], [2.52, 0, 0.05, 1.6], [-2.52, 0, 0.05, 1.6]]) b.dec(-12 + dx, -39 + dz, w, d, 2.6, 0x1c1a18, 14.5);
  b.dec(-12, -39, 5.8, 5.8, 3.5, TERRA, 18, { s: 'hip', m: 'roof' });
  b.dec(-12, -39, 5.4, 5.4, 0.3, 0xb3aa98, 17.7, { m: 'stone' });
  b.patch(-14, -31, 20, 5, 0xb8b0a0, 'paving', 0.03);
  for (const [x, z] of [[-38.5, -42], [-35, -42.6]]) b.tree(x, z, 'cypress', 1.1);

  // north-east: arcade cantina, red house, tall stone house, yellow house, long orange house
  b.building({ x: 17, z: -8, w: 14, d: 10, h: 6.6, floors: 2, m: 'stone', c: STONEW, doors: { s: [-4, 0, 4] }, doorW: 2.6, doorH: 3.0, trim: 0xe6decb,
    base: { h: 0.6, c: 0xa89f8c }, shutters: BSH, skipGround: true, roof: { type: 'hip', c: TERRA, chimneys: 1 } });
  for (const x of [13, 17, 21]) b.arch(x, -2.83, 'x', 2.6, 3.0, 0xe6decb);
  b.sign(17, 4.0, -2.83, 6, 0.8, 's', 'CANTINA ROSSI', { style: 'banner', bg: '#8a2f25', fg: '#f4ede0' });
  for (let i = 0; i < 6; i++) b.dec(12 + i * 1.8, -11, 1.0, 1.0, 1.3, 0x6b4a2e, 0.5 - 0.65 + 0.15, { s: 'cyl', m: 'wood', rot: [PI / 2, 0, 0] });
  b.inv(17, -11, 11, 1.2, 1.2);
  house({ x: 34, z: -8, w: 10, d: 10, h: 6.6, floors: 2, c: RED, shutters: BSH, doors: { w: [0], s: [2] }, roof: { type: 'gable', ax: 'z' } });
  house({ x: 14, z: -28, w: 10, d: 10, h: 9.4, floors: 3, m: 'stone', c: 0xb9b2a2, shutters: GSH, doors: { w: [0], s: [-2] } });
  house({ x: 30, z: -26, w: 9, d: 13, h: 6.6, floors: 2, c: YEL, shutters: GSH, doors: { w: [2], s: [0] }, roof: { type: 'gable', ax: 'z' } });
  house({ x: 36, z: -40, w: 14, d: 7, h: 6.4, floors: 2, c: ORA, shutters: GSH, doors: { s: [-3, 3] }, roof: { type: 'gable', ax: 'x' } });

  // east terrace (raised, reached by stairs) with a pergola
  b.box(22, 7, 18, 14, 1.6, 0xb3aa98, 0, { m: 'stone' });
  b.patch(22, 7, 17.6, 13.6, 0xc4bba8, 'paving', 1.63);
  b.stairs(10.62, 7, 'e', 3, 1.6, 0xb3aa98, 'stone'); b.stairs(26, 16.38, 'n', 3, 1.6, 0xb3aa98, 'stone');
  for (const [x1, z1, x2, z2] of [[13, 0, 31, 0], [31, 0, 31, 14], [13, 14, 24.4, 14], [27.6, 14, 31, 14], [13, 0, 13, 5.4], [13, 8.6, 13, 14]]) {
    const ax = z1 === z2 ? 'x' : 'z', len = ax === 'x' ? x2 - x1 : z2 - z1;
    b.dec((x1 + x2) / 2, (z1 + z2) / 2, ax === 'x' ? len : 0.4, ax === 'z' ? len : 0.4, 0.8, 0xb3aa98, 1.6, { m: 'stone' });
    b.pc((x1 + x2) / 2, (z1 + z2) / 2, ax === 'x' ? len : 0.4, ax === 'z' ? len : 0.4, 1.4, 1.6);
  }
  for (const [x, z] of [[17, 3], [17, 11], [25, 3], [25, 11]]) b.box(x, z, 0.25, 0.25, 2.6, 0x6b4a2e, 1.6, { m: 'wood' });
  for (const z of [3, 7, 11]) b.dec(21, z, 8.4, 0.2, 0.2, 0x6b4a2e, 4.2, { m: 'wood' });
  b.dec(21, 7, 8, 8, 0.3, 0x5a7a35, 4.4, { m: 'foliage' });
  b.planter(15, 12.6, 2.4, 0.8, FLOW); b.planter(29.5, 2, 1.2, 2.4, FLOW); b.barrels(28.5, 11.5, 3, 0x6b4a2e);
  b.box(21, 7, 2.4, 1.2, 0.8, 0x7a5a3a, 1.6, { m: 'wood' });
  house({ x: 39.5, z: 7, w: 8, d: 12, h: 6.4, floors: 2, m: 'stone', c: STONEW, shutters: BSH, doors: { w: [0] } });

  // south-west: pink house, open barrel shed, yellow house, two more
  house({ x: -16, z: 15, w: 10, d: 8, h: 6.4, floors: 2, c: PINK, shutters: GSH, doors: { n: [-2], e: [0] }, open: { n: [2] } });
  b.wallX(-32, -22, 18, 3, 0xc9c0ae, [], 0.3, 0, { m: 'stone' }); b.wallZ(10.5, 18, -32, 3, 0xc9c0ae, [], 0.3, 0, { m: 'stone' }); b.wallZ(10.5, 18, -22, 3, 0xc9c0ae, [], 0.3, 0, { m: 'stone' });
  b.box(-27, 14.2, 10.6, 8.2, 0.2, 0x7a5a3a, 3.0, { m: 'wood' });
  b.dec(-27, 13.9, 11.2, 9.4, 0.14, TERRA, 3.25, { m: 'roof', rot: [-0.12, 0, 0] });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) b.dec(-30.5 + i * 1.6, 16.9, 1.1, 1.1, 1.3, 0x6b4a2e, 0.55 + r * 1.1 - 0.65, { s: 'cyl', m: 'wood', rot: [PI / 2, 0, 0] });
  b.inv(-27, 16.9, 9, 1.4, 2.2);
  house({ x: -39, z: 16, w: 9, d: 12, h: 6.6, floors: 2, c: YEL, shutters: BSH, quoins: STONEW, doors: { n: [0], e: [3] }, roof: { type: 'gable', ax: 'z' } });
  house({ x: -24, z: 32, w: 14, d: 9, h: 6.8, floors: 2, c: CREAM, shutters: GSH, doors: { n: [-3], e: [0] }, roof: { type: 'gable', ax: 'x' } });
  house({ x: -38, z: 36, w: 10, d: 10, h: 6.4, floors: 2, c: ORA, shutters: GSH, doors: { e: [0] } });
  house({ x: -10, z: 34, w: 8, d: 10, h: 6.6, floors: 2, c: RED, shutters: BSH, doors: { e: [0], n: [0] } });

  // south-east
  house({ x: 14, z: 26, w: 12, d: 9, h: 6.6, floors: 2, c: YEL, shutters: GSH, doors: { w: [0], n: [2] }, roof: { type: 'gable', ax: 'x' } });
  house({ x: 32, z: 24, w: 12, d: 10, h: 6.8, floors: 2, c: PINK, shutters: BSH, doors: { n: [0], w: [2] } });
  house({ x: 20, z: 39, w: 14, d: 8, h: 6.4, floors: 2, c: CREAM, shutters: GSH, doors: { n: [-3, 3] }, roof: { type: 'gable', ax: 'x' } });
  house({ x: 38, z: 38, w: 9, d: 9, h: 6.6, floors: 2, c: ORA, shutters: GSH, doors: { w: [0], n: [0] } });

  // street life
  b.van(0, 22, 'z', 0x5a9ac8); b.car(-31, 5, 'x', 0x9c2a22);
  b.barrels(-6, -12, 3, 0x6b4a2e); b.crate(9, 14, 1.1, 0x9a7a52); b.crate(9, 15.2, 0.9, 0x9a7a52); b.crate(-30, -18, 1.1, 0x9a7a52);
  for (const [x, z, w, d] of [[-30, 1.3, 3, 0.6], [-44 + 2, 24, 0.6, 3], [4, 33, 0.6, 3], [36, 15.5, 3, 0.6]]) b.box(x, z, w, d, 1.0, 0xb3aa98, 0, { m: 'stone' });
  for (const [x, z] of [[-8, -1.6], [8.5, 12.6], [-12, 21], [26, -17], [4, -33]]) b.planter(x, z, 1.4, 0.6, FLOW);
  for (const [x, z] of [[-26, -16.5], [24, -17], [-6, 28]]) {
    b.dec(x, z, 5, 0.03, 0.03, 0x333333, 4.6);
    for (let i = 0; i < 4; i++) b.dec(x - 1.8 + i * 1.2, z, 0.7, 0.04, 0.8, b.pick([0xf2f2f2, 0xd94a3a, 0x5a9ac8, 0xe8b84a]), 3.8, { m: 'cloth' });
  }
  for (const [x, z] of [[-43, -43], [-43, 43], [0, 43], [43, -30], [43, 25]]) b.tree(x * 0.97, z * 0.97, 'cypress', 1.1);
  for (const [x, z, w, d] of [[-36, 24, 10, 4], [36, 30, 6, 6], [-40, -20, 6, 6]]) b.patch(x, z, w, d, 0xa08a66, 'dirt', 0.025);
  return {
    id: 4, name: 'BORGO', sub: 'LIGURIA, 1977', half: H,
    ground: { c: 0xa69e8f, m: 'cobble' },
    sky: [0x6fa3d8, 0xe4ecf0], fog: 0xdae4e9, fogNear: 50, fogFar: 180,
    hemi: [0xfff4e2, 0x8a7a60, 1.0], sun: [0xfff0d2, 1.9, [0.45, 1.0, -0.35]], clouds: 0.35, backdrop: 'hills', ...pack(b),
  };
}

// open steel frame that rooftop slogan letters are mounted on
function signFrame(b, x, z, w, y, h) {
  for (const yy of [y, y + h - 0.1]) b.dec(x, z - 0.12, w, 0.1, 0.1, 0x3a3c3e, yy, { m: 'metal' });
  for (let i = 0; i <= Math.round(w / 2.5); i++) b.dec(x - w / 2 + i * w / Math.round(w / 2.5), z - 0.12, 0.1, 0.1, h, 0x3a3c3e, y, { m: 'metal' });
}

function pack(b) { return { boxes: b.boxes, holes: b.holes, water: b.waters, signs: b.signs, smoke: b.smokes }; }

export const MAPS = [citadel(), polaris(), gracht(), kombinat(), borgo()];

const derived = new Map();
export function mapData(id) {
  if (!derived.has(id)) derived.set(id, deriveMap(MAPS[id]));
  return derived.get(id);
}

// Player hitboxes relative to feet position. Shared so client hit tests match server checks.
export const HITBOX = { bodyHalf: [0.32, 0.68, 0.32], bodyY: 0.75, headHalf: 0.17, headY: 1.66, crouchScale: 0.72 };
