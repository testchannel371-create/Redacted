// Generates client/shared/guns.json - the single source of truth for all 50 weapons.
// Read by the game server, the browser client, and blender/make_assets.py.
// Run: node tools/build-guns.mjs
import fs from 'node:fs';

const BASE = {
  pistol:   { dmg: 30, rpm: 380, mag: 12,  reserve: 72,  reload: 1.4, spread: 0.012, auto: false, range: 35,  move: 1.00, zoom: 1.25, pellets: 1, recoil: 0.020 },
  smg:      { dmg: 20, rpm: 820, mag: 30,  reserve: 180, reload: 1.9, spread: 0.028, auto: true,  range: 28,  move: 1.06, zoom: 1.3,  pellets: 1, recoil: 0.010 },
  ar:       { dmg: 26, rpm: 640, mag: 30,  reserve: 150, reload: 2.2, spread: 0.020, auto: true,  range: 60,  move: 0.96, zoom: 1.5,  pellets: 1, recoil: 0.013 },
  shotgun:  { dmg: 14, rpm: 75,  mag: 6,   reserve: 36,  reload: 2.8, spread: 0.075, auto: false, range: 14,  move: 0.97, zoom: 1.2,  pellets: 8, recoil: 0.060 },
  lmg:      { dmg: 25, rpm: 700, mag: 100, reserve: 200, reload: 4.6, spread: 0.034, auto: true,  range: 60,  move: 0.86, zoom: 1.4,  pellets: 1, recoil: 0.012 },
  sniper:   { dmg: 100,rpm: 45,  mag: 5,   reserve: 25,  reload: 3.2, spread: 0.060, auto: false, range: 200, move: 0.90, zoom: 4.0,  pellets: 1, recoil: 0.090, scoped: true },
  marksman: { dmg: 46, rpm: 260, mag: 15,  reserve: 75,  reload: 2.4, spread: 0.010, auto: false, range: 100, move: 0.93, zoom: 2.5,  pellets: 1, recoil: 0.035 },
};

// Colour finishes used by the Blender generator.
const F = {
  black: '#1c1e21', gunmetal: '#3b3f45', tan: '#8f7a55', olive: '#4a5133', wood: '#6e4524',
  arctic: '#c7cbd0', carbon: '#111214', desert: '#a68c60', navy: '#252f40', gray: '#5a5e63',
  gold: '#d6a63c', chrome: '#c9ced6', red: '#a8261c', orange: '#e2781c', cyan: '#36c2d6',
  purple: '#6a3fa0', green: '#3c8c3a', crystal: '#7fe6ff', void: '#170f24', bone: '#d8cfb8',
};

// name, category, price, visual, stat overrides
const LIST = [
  // ---- FREE (first 10) ----
  ['Warden P9',      'pistol',   0, { body: F.black,    furn: F.black,   accent: F.gray,    style: 0, scope: 'none' }, {}],
  ['Rook .45',       'pistol',   0, { body: F.gunmetal, furn: F.wood,    accent: F.black,   style: 1, scope: 'none' }, { dmg: 40, rpm: 300, mag: 8, reserve: 56 }],
  ['Viper SMG',      'smg',      0, { body: F.black,    furn: F.black,   accent: F.gray,    style: 0, stock: 'folded', mag: 'straight', scope: 'none' }, {}],
  ['Hornet K',       'smg',      0, { body: F.olive,    furn: F.black,   accent: F.tan,     style: 1, stock: 'fixed', mag: 'curved', scope: 'none' }, { rpm: 900, dmg: 18 }],
  ['KR-47',          'ar',       0, { body: F.gunmetal, furn: F.wood,    accent: F.black,   style: 1, stock: 'wood', mag: 'curved', scope: 'none' }, { dmg: 30, rpm: 600, spread: 0.024 }],
  ['Patriot M4',     'ar',       0, { body: F.black,    furn: F.black,   accent: F.gray,    style: 0, stock: 'fixed', mag: 'straight', scope: 'dot', rail: true }, {}],
  ['Breacher 12',    'shotgun',  0, { body: F.black,    furn: F.wood,    accent: F.gray,    style: 0, stock: 'wood', mag: 'tube', scope: 'none' }, {}],
  ['Ranger DMR',     'marksman', 0, { body: F.olive,    furn: F.black,   accent: F.tan,     style: 0, stock: 'fixed', mag: 'straight', scope: 'acog', rail: true }, {}],
  ['Longbow 7',      'sniper',   0, { body: F.tan,      furn: F.tan,     accent: F.black,   style: 0, stock: 'fixed', mag: 'straight', scope: 'sniper' }, {}],
  ['Anvil LMG',      'lmg',      0, { body: F.olive,    furn: F.black,   accent: F.gray,    style: 0, stock: 'fixed', mag: 'box', scope: 'none', bipod: true }, {}],
  // ---- PAID ----
  ['Tempest Auto',   'pistol',  150, { body: F.gray,     furn: F.black,   accent: F.orange,  style: 2, scope: 'dot' }, { auto: true, rpm: 900, mag: 18, reserve: 108, dmg: 20, spread: 0.022 }],
  ['Specter SMG',    'smg',     200, { body: F.navy,     furn: F.black,   accent: F.cyan,    style: 2, stock: 'skeleton', mag: 'straight', scope: 'holo' }, { rpm: 1000, dmg: 17, mag: 33 }],
  ['Grizzly AR',     'ar',      250, { body: F.desert,   furn: F.black,   accent: F.black,   style: 2, stock: 'fixed', mag: 'straight', scope: 'none', grip: 'vert' }, { dmg: 34, rpm: 480, recoil: 0.018 }],
  ['Thunder Pump',   'shotgun', 300, { body: F.gunmetal, furn: F.black,   accent: F.red,     style: 1, stock: 'fixed', mag: 'tube', scope: 'none' }, { dmg: 16, rpm: 70 }],
  ['Sentinel DMR',   'marksman',350, { body: F.black,    furn: F.wood,    accent: F.gunmetal,style: 1, stock: 'wood', mag: 'straight', scope: 'acog' }, { dmg: 52, rpm: 220 }],
  ['Diamondback .50','pistol',  400, { body: F.chrome,   furn: F.black,   accent: F.black,   style: 3, scope: 'none' }, { dmg: 60, rpm: 200, mag: 7, reserve: 42, recoil: 0.06 }],
  ['Wraith SMG',     'smg',     450, { body: F.carbon,   furn: F.carbon,  accent: F.gray,    style: 0, stock: 'skeleton', mag: 'straight', scope: 'dot', supp: true }, { dmg: 19, rpm: 850 }],
  ['Nomad AR',       'ar',      500, { body: F.tan,      furn: F.tan,     accent: F.black,   style: 0, stock: 'skeleton', mag: 'curved', scope: 'holo', rail: true }, { dmg: 27, rpm: 680 }],
  ['Siege M60',      'lmg',     550, { body: F.gunmetal, furn: F.wood,    accent: F.black,   style: 1, stock: 'wood', mag: 'box', scope: 'none', bipod: true }, { dmg: 30, rpm: 560 }],
  ['Widowmaker',     'sniper',  600, { body: F.black,    furn: F.black,   accent: F.red,     style: 1, stock: 'skeleton', mag: 'straight', scope: 'sniper', bipod: true }, { dmg: 110, rpm: 50 }],
  ['Cobra PDW',      'smg',     650, { body: F.green,    furn: F.black,   accent: F.black,   style: 2, stock: 'folded', mag: 'curved', scope: 'dot' }, { rpm: 880, dmg: 19, mag: 40, reserve: 200 }],
  ['Valkyrie AR',    'ar',      700, { body: F.arctic,   furn: F.gray,    accent: F.black,   style: 1, stock: 'fixed', mag: 'straight', scope: 'dot', rail: true, grip: 'angled' }, { dmg: 26, rpm: 720, spread: 0.018 }],
  ['Hellfire Auto',  'shotgun', 750, { body: F.black,    furn: F.black,   accent: F.orange,  style: 2, stock: 'fixed', mag: 'straight', scope: 'dot' }, { auto: true, rpm: 220, dmg: 10, mag: 8, reserve: 48 }],
  ['Arbiter',        'marksman',800, { body: F.desert,   furn: F.black,   accent: F.black,   style: 2, stock: 'skeleton', mag: 'straight', scope: 'acog', rail: true }, { dmg: 44, rpm: 300 }],
  ['Banshee SMG',    'smg',     850, { body: F.purple,   furn: F.black,   accent: F.bone,    style: 1, stock: 'fixed', mag: 'drum', scope: 'holo' }, { mag: 50, reserve: 200, rpm: 800, dmg: 20 }],
  ['Talon AR',       'ar',      900, { body: F.navy,     furn: F.black,   accent: F.orange,  style: 2, stock: 'skeleton', mag: 'straight', scope: 'holo', rail: true, grip: 'vert' }, { dmg: 28, rpm: 660, spread: 0.017 }],
  ['Juggernaut',     'lmg',     950, { body: F.black,    furn: F.black,   accent: F.red,     style: 2, stock: 'fixed', mag: 'drum', scope: 'dot', bipod: true }, { mag: 120, rpm: 760 }],
  ['Executioner',    'sniper', 1000, { body: F.olive,    furn: F.wood,    accent: F.black,   style: 2, stock: 'wood', mag: 'straight', scope: 'sniper' }, { dmg: 120, rpm: 40 }],
  ['Reaper-9',       'smg',    1100, { body: F.black,    furn: F.red,     accent: F.red,     style: 2, stock: 'skeleton', mag: 'straight', scope: 'dot', supp: true }, { rpm: 950, dmg: 19 }],
  ['Hydra AR',       'ar',     1200, { body: F.green,    furn: F.black,   accent: F.bone,    style: 0, stock: 'fixed', mag: 'curved', scope: 'acog', grip: 'angled' }, { rpm: 780, dmg: 25 }],
  ['Mauler Drum',    'shotgun',1300, { body: F.desert,   furn: F.black,   accent: F.black,   style: 2, stock: 'skeleton', mag: 'drum', scope: 'holo' }, { auto: true, rpm: 260, dmg: 10, mag: 16, reserve: 48 }],
  ['Paladin DMR',    'marksman',1400,{ body: F.arctic,   furn: F.black,   accent: F.cyan,    style: 1, stock: 'fixed', mag: 'straight', scope: 'acog', supp: true }, { dmg: 50, rpm: 270 }],
  ['Hawkeye',        'sniper', 1500, { body: F.desert,   furn: F.desert,  accent: F.olive,   style: 0, stock: 'skeleton', mag: 'straight', scope: 'sniper', bipod: true, supp: true }, { dmg: 105, rpm: 55 }],
  ['Tundra AR',      'ar',     1600, { body: F.arctic,   furn: F.arctic,  accent: F.navy,    style: 2, stock: 'skeleton', mag: 'straight', scope: 'dot', rail: true, grip: 'vert' }, { dmg: 29, rpm: 650, spread: 0.016 }],
  ['Bulwark LMG',    'lmg',    1700, { body: F.tan,      furn: F.black,   accent: F.black,   style: 1, stock: 'skeleton', mag: 'box', scope: 'holo', bipod: true }, { dmg: 27, rpm: 720, spread: 0.03 }],
  ['Phantom SMG',    'smg',    1800, { body: F.carbon,   furn: F.carbon,  accent: F.purple,  style: 2, stock: 'folded', mag: 'straight', scope: 'holo', supp: true }, { rpm: 1050, dmg: 18, spread: 0.024 }],
  ['Ironclad AR',    'ar',     1900, { body: F.gunmetal, furn: F.gunmetal,accent: F.orange,  style: 1, stock: 'fixed', mag: 'curved', scope: 'acog', rail: true, grip: 'vert' }, { dmg: 31, rpm: 610, spread: 0.016 }],
  ["Dragon's Breath",'shotgun',2000, { body: F.black,    furn: F.red,     accent: F.orange,  style: 1, stock: 'fixed', mag: 'tube', scope: 'none' }, { dmg: 20, rpm: 80, pellets: 8 }],
  ['Ghost .338',     'sniper', 2100, { body: F.carbon,   furn: F.carbon,  accent: F.gray,    style: 1, stock: 'skeleton', mag: 'straight', scope: 'sniper', supp: true }, { dmg: 110, rpm: 55, reload: 2.8 }],
  ['Obsidian AR',    'ar',     2200, { body: F.carbon,   furn: F.carbon,  accent: F.purple,  style: 2, stock: 'skeleton', mag: 'straight', scope: 'holo', rail: true, supp: true }, { dmg: 28, rpm: 700, spread: 0.016 }],
  ['Titan LMG',      'lmg',    2400, { body: F.navy,     furn: F.black,   accent: F.orange,  style: 2, stock: 'fixed', mag: 'drum', scope: 'acog', bipod: true }, { dmg: 30, rpm: 680, mag: 150, reserve: 300 }],
  ['Raptor AR',      'ar',     2600, { body: F.black,    furn: F.black,   accent: F.cyan,    style: 2, stock: 'skeleton', mag: 'straight', scope: 'dot', rail: true, grip: 'angled' }, { dmg: 29, rpm: 740, spread: 0.015 }],
  ['Venom SMG',      'smg',    2800, { body: F.green,    furn: F.black,   accent: F.green,   style: 2, stock: 'skeleton', mag: 'drum', scope: 'holo', supp: true }, { rpm: 980, dmg: 20, mag: 45, reserve: 225 }],
  ['Spectre .50',    'sniper', 3000, { body: F.gray,     furn: F.black,   accent: F.orange,  style: 2, stock: 'fixed', mag: 'box', scope: 'sniper', bipod: true }, { dmg: 150, rpm: 45, mag: 6 }],
  ['Inferno AR',     'ar',     3200, { body: F.orange,   furn: F.black,   accent: F.black,   style: 0, stock: 'fixed', mag: 'curved', scope: 'holo', rail: true, grip: 'vert' }, { dmg: 30, rpm: 700, spread: 0.015 }],
  ['Royal Warden',   'pistol', 3500, { body: F.gold,     furn: F.black,   accent: F.gold,    style: 3, scope: 'none', metal: 1 }, { dmg: 55, rpm: 260, mag: 9, reserve: 54 }],
  ['Golden Viper',   'smg',    4000, { body: F.gold,     furn: F.black,   accent: F.gold,    style: 0, stock: 'folded', mag: 'straight', scope: 'dot', metal: 1 }, { rpm: 950, dmg: 21, mag: 36 }],
  ['Chrome Patriot', 'ar',     4500, { body: F.chrome,   furn: F.black,   accent: F.chrome,  style: 0, stock: 'fixed', mag: 'straight', scope: 'holo', rail: true, grip: 'vert', metal: 1 }, { dmg: 30, rpm: 720, spread: 0.014 }],
  ['Diamond Longbow','sniper', 5000, { body: F.crystal,  furn: F.chrome,  accent: F.crystal, style: 2, stock: 'skeleton', mag: 'straight', scope: 'sniper', glow: true, metal: 1 }, { dmg: 130, rpm: 55 }],
  ['Nightmare',      'ar',     6000, { body: F.void,     furn: F.void,    accent: F.purple,  style: 2, stock: 'skeleton', mag: 'drum', scope: 'holo', rail: true, glow: true, grip: 'angled' }, { dmg: 31, rpm: 780, mag: 45, spread: 0.014 }],
];

const guns = LIST.map(([name, cat, price, vis, ov], id) => {
  const s = { ...BASE[cat], ...ov };
  return {
    id, name, cat, price, free: price === 0,
    dmg: s.dmg, rpm: s.rpm, mag: s.mag, reserve: s.reserve, reload: s.reload, spread: s.spread,
    auto: s.auto, range: s.range, move: s.move, zoom: s.zoom, pellets: s.pellets, recoil: s.recoil,
    scoped: !!s.scoped,
    vis: { stock: 'fixed', mag: 'straight', scope: 'none', rail: false, supp: false, bipod: false, grip: 'none', metal: 0, glow: false, ...vis },
  };
});

fs.writeFileSync(new URL('../client/shared/guns.json', import.meta.url), JSON.stringify(guns, null, 1));
console.log('wrote', guns.length, 'guns');
