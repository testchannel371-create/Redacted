// Loads the Blender-made GLB assets (Draco-compressed) and builds weapons and operators (soldiers) from them.
// Each weapon is its own small file, loaded on demand; weapon pictures are pre-rendered in Blender.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { animateOperator, makeRig } from './anim.js';

export const A = { guns: [], gunData: [], opTemplate: null, vm: {} };
const CUSTOM = ['skin', 'shirt', 'pants', 'gear', 'hat'];
const pad = (i) => String(i).padStart(2, '0');

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('vendor/draco/');
loader.setDRACOLoader(draco);
const loadGlb = (url, onProg) => new Promise((res, rej) => loader.load(url, res, (e) => { if (e.total && onProg) onProg(e.loaded / e.total); }, rej));

// Weapon pictures: one sheet (assets/icons.webp, 10 columns x 5 rows) shown with CSS background-position.
const iconPos = (i) => `${((i % 10) / 9) * 100}% ${(Math.floor(i / 10) / 4) * 100}%`;
export const iconHTML = (i) => `<div class="gun-icon" style="background-position:${iconPos(i)}"></div>`;
export function setGunIcon(el, i) { el.style.backgroundPosition = iconPos(i); }
export const gunReady = (i) => !!A.guns[i];

const phong = new Map();
function toPhong(m) {
  if (phong.has(m)) return phong.get(m);
  const metal = m.metalness ?? 0;
  const p = new THREE.MeshPhongMaterial({
    color: m.color, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity ?? 1,
    shininess: metal > 0.5 ? 90 : 22,
    specular: metal > 0.5 ? m.color.clone().lerp(new THREE.Color(1, 1, 1), 0.35) : new THREE.Color(0x202020),
  });
  p.name = m.name;
  phong.set(m, p);
  return p;
}

const gunLoads = new Map();
export function loadGun(i) {
  if (!gunLoads.has(i)) {
    const p = loadGlb(`assets/guns/gun_${pad(i)}.glb`).then((g) => {
      const name = 'gun_' + pad(i);
      const node = g.scene.getObjectByName(name);
      node.traverse(c => { if (c.isMesh) c.material = toPhong(c.material); });
      node.position.set(0, 0, 0); node.rotation.set(0, 0, 0);
      node.updateMatrixWorld(true);
      const mz = node.getObjectByName(name + '_mz'), lh = node.getObjectByName(name + '_lh'), sight = node.getObjectByName(name + '_sight');
      A.guns[i] = {
        obj: node, muzzle: mz ? mz.position.clone() : new THREE.Vector3(0, 0.05, -0.5),
        lh: lh ? lh.position.clone() : new THREE.Vector3(0, 0, -0.3), sight: sight ? sight.position.y : 0.06,
        box: new THREE.Box3().setFromObject(node),
      };
      return A.guns[i];
    }).catch((e) => { gunLoads.delete(i); throw e; });
    gunLoads.set(i, p);
  }
  return gunLoads.get(i);
}

// Quietly download the other weapons in the background, most likely ones first.
export async function prefetchGuns(order) {
  for (const i of order) {
    if (A.guns[i]) continue;
    try { await loadGun(i); } catch { /* retry later on demand */ }
    await new Promise(r => setTimeout(r, 30));
  }
}

export async function loadAssets(firstGun, onProgress) {
  A.gunData = await fetch('shared/guns.json').then(r => r.json());
  const prog = { g: 0, o: 0 };
  const report = () => onProgress?.(prog.g * 0.3 + prog.o * 0.7);
  const [o] = await Promise.all([
    loadGlb('assets/operator.glb', (p) => { prog.o = p; report(); }),
    loadGun(firstGun).then(() => { prog.g = 1; report(); }),
  ]);
  A.opTemplate = o.scene.getObjectByName('op_root');
  A.opTemplate.traverse(c => { if (c.isMesh) c.userData.mat = c.material.name; });
  for (const n of ['vm_arm_R', 'vm_arm_L', 'vm_glove_R', 'vm_glove_L']) {
    const ob = o.scene.getObjectByName(n);
    ob.traverse(c => { if (c.isMesh) c.userData.mat = c.material.name; });
    A.vm[n] = ob;
  }
  return A;
}

export function cloneGun(i) {
  const o = A.guns[i].obj.clone(true);
  o.traverse(c => { if (c.isMesh) c.frustumCulled = false; });
  return o;
}

// ------------------------------------------------------------------ operator materials
const matCache = new Map();
export function opMaterial(name, color) {
  const key = name + '|' + (color || '');
  if (matCache.has(key)) return matCache.get(key);
  let m;
  const base = { skin: 0xc68a63, shirt: 0x3d4a35, pants: 0x3b3f33, gear: 0x2b2e26, hat: 0x3a3d33, ...BASE_COL };
  if (name === 'lens') m = new THREE.MeshPhongMaterial({ color: 0x3a5562, shininess: 120, specular: 0x9ab0c0 });
  else if (name === 'brass') m = new THREE.MeshPhongMaterial({ color: 0xb58a3a, shininess: 80, specular: 0xb59a5a });
  else m = new THREE.MeshLambertMaterial({ color: color ? new THREE.Color(color) : (base[name] ?? 0x777777) });
  matCache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ operator (soldier) model
// 13 rigid parts (pelvis, torso, head, upper/lower arms, thigh/shin/foot per leg) driven as bones of ONE
// GPU-skinned mesh with all the clothing merged in and vertex-coloured: one draw call per soldier
// (two for the ghost, whose mask has a texture), however many joints the animation bends.
const BONES = ['pelvis', 'torso', 'head', 'arm_R', 'forearm_R', 'arm_L', 'forearm_L', 'leg_L', 'shin_L', 'foot_L', 'leg_R', 'shin_R', 'foot_R'];
const BONE_PARENT = { pelvis: null, torso: 'pelvis', head: 'torso', arm_R: 'torso', forearm_R: 'arm_R', arm_L: 'torso', forearm_L: 'arm_L',
  leg_L: null, shin_L: 'leg_L', foot_L: 'shin_L', leg_R: null, shin_R: 'leg_R', foot_R: 'shin_R' };
const BASE_COL = { boots: 0x201b16, opdark: 0x131415, hair: 0x1f1812, eye: 0x0c0c0c, lens: 0x3a5562, brass: 0xb58a3a };
const OP_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const SPHERE = new THREE.Sphere(new THREE.Vector3(0, 0.85, 0), 1.4); // culling bound for any pose
const IDENT = new THREE.Matrix4();
let tmpl = null;

// Bone rest positions (parent-relative) -> everything the skinning and the IK need.
function modelFrom(local) {
  const world = {};
  for (const b of BONES) world[b] = local[b].clone().add(BONE_PARENT[b] ? world[BONE_PARENT[b]] : new THREE.Vector3());
  return { local, world, rig: makeRig(world), inverses: BONES.map(b => new THREE.Matrix4().makeTranslation(-world[b].x, -world[b].y, -world[b].z)) };
}
let soldier = null;
function soldierModel() {
  if (soldier) return soldier;
  const { nodes } = analyseRig();
  return (soldier = modelFrom(Object.fromEntries(BONES.map(b => [b, nodes[b].obj.position.clone()]))));
}
// every vertex follows exactly one bone
function skinned(geo, bone) {
  const n = geo.attributes.position.count, bi = BONES.indexOf(bone);
  const si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 255; }
  geo.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(sw, 4, true));
  return geo;
}

function analyseRig() {
  if (tmpl) return tmpl;
  const nodes = {};
  A.opTemplate.updateMatrixWorld(true);
  A.opTemplate.traverse(o => {
    const name = o.userData.name;
    if (!name || name === 'op_root') return;
    const meshes = [];
    if (o.isMesh) meshes.push({ geo: o.geometry, mat: o.userData.mat, m: new THREE.Matrix4() });
    for (const c of o.children) if (c.isMesh && !c.userData.name) meshes.push({ geo: c.geometry, mat: c.userData.mat, m: c.matrix.clone() });
    nodes[name] = { obj: o, meshes, parent: o.parent && o.parent.userData.name, local: o.matrix.clone() };
  });
  const acc = Object.fromEntries(BONES.map(b => [b, []]));
  for (const n in nodes) if (!BONES.includes(n) && acc[nodes[n].parent]) acc[nodes[n].parent].push(n);
  return (tmpl = { nodes, acc });
}

export function partVisible(name, skin) {
  if (name.startsWith('hat_')) return name === 'hat_' + skin.head;
  if (name.startsWith('face_')) return name === 'face_' + skin.face;
  if (name.startsWith('vest_')) return name === 'vest_' + skin.vest;
  if (name.startsWith('back_')) return name === 'back_' + skin.back;
  if (name.startsWith('knee_pads_')) return !!skin.knees;
  if (name.startsWith('gloves_')) return !!skin.gloves;
  if (name === 'thigh_rig') return !!skin.rig;
  if (name === 'hair') return ['none', 'cap', 'beret', 'headset'].includes(skin.head) && skin.face !== 'balaclava';
  return true;
}

const _col = new THREE.Color();
function painted(geo, matrix, hex) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  g.setAttribute('normal', geo.attributes.normal.clone());
  if (geo.index) g.setIndex(geo.index.clone());
  g.applyMatrix4(matrix);
  _col.set(hex);
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = _col.r; c[i * 3 + 1] = _col.g; c[i * 3 + 2] = _col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function boneGeometry(bone, skin) {
  const { nodes, acc } = analyseRig();
  const parts = [];
  const add = (node, pre) => {
    for (const mm of node.meshes) {
      const hex = CUSTOM.includes(mm.mat) ? skin[mm.mat] : (BASE_COL[mm.mat] ?? 0x777777);
      parts.push(painted(mm.geo, pre.clone().multiply(mm.m), hex));
    }
  };
  add(nodes[bone], new THREE.Matrix4());
  for (const n of acc[bone]) if (partVisible(n, skin)) add(nodes[n], nodes[n].local);
  const merged = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return merged;
}

// The normal soldier's skinned geometry for one set of clothing choices (rest pose, root space).
function soldierGeometry(skin) {
  const M = soldierModel(), parts = [];
  for (const b of BONES) {
    const g = boneGeometry(b, skin);
    g.translate(M.world[b].x, M.world[b].y, M.world[b].z);
    parts.push(skinned(g, b));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return merged;
}

export function makeOperator(skin) {
  const root = new THREE.Group();
  const P = {};
  for (const b of BONES) { P[b] = new THREE.Bone(); P[b].name = b; }
  for (const b of BONES) (BONE_PARENT[b] ? P[BONE_PARENT[b]] : root).add(P[b]);
  P.pelvis.rotation.order = 'YXZ';
  const op = { root, P, meshes: [], skeleton: null, rig: null, anim: null, gun: null, gunIndex: -1, skin: null, deadT: 0 };
  setOperatorSkin(op, skin);
  // simple blob shadow
  const sh = new THREE.Mesh(blobGeo(), blobMat());
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.03;
  sh.renderOrder = -1;
  root.add(sh);
  op.shadow = sh;
  return op;
}

let _blobGeo, _blobMat;
function blobGeo() { return _blobGeo || (_blobGeo = new THREE.CircleGeometry(0.55, 14)); }
function blobMat() {
  if (_blobMat) return _blobMat;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  return _blobMat;
}

// ------------------------------------------------------------------ KNOCK OFF GHOST operator
// A separate, ready-made model (blender/make_ghost.py) cut into the same 13 parts, so the same animation
// drives it. Its geometry is shared by every ghost on screen, and the file only downloads once someone
// in view (or the player) picks it. Until it arrives the normal soldier stands in.
// Colours for the first-person arms when playing as the ghost: navy sleeves, black gloves.
export const GHOST_VM = { skin: '#252528', shirt: '#2c2f3b', gear: '#252528', gloves: true };
let ghostLoad = null;
export function loadGhost() {
  if (!ghostLoad) {
    ghostLoad = loadGlb('assets/ghost.glb').then((g) => {
      const root = g.scene.getObjectByName('ghost_root');
      const local = {}, body = [], face = [];
      root.traverse((o) => {
        const name = o.userData.name;
        if (!BONES.includes(name)) return;
        local[name] = o.position.clone();
        const take = (m, matrix) => { const geo = m.geometry.clone().applyMatrix4(matrix); (m.material.map ? face : body).push({ geo, bone: name, map: m.material.map }); };
        if (o.isMesh) take(o, IDENT);
        for (const c of o.children) if (c.isMesh && !c.userData.name) take(c, c.matrix);
      });
      if (BONES.some(b => !local[b])) throw new Error('ghost.glb is missing parts');
      const M = modelFrom(local);
      const build = (list, keep) => {
        const geos = list.map(({ geo, bone }) => {
          for (const k of Object.keys(geo.attributes)) if (!keep.includes(k)) geo.deleteAttribute(k);
          geo.translate(M.world[bone].x, M.world[bone].y, M.world[bone].z);
          return skinned(geo, bone);
        });
        const merged = mergeGeometries(geos, false);
        geos.forEach(x => x.dispose());
        return merged;
      };
      M.bodyGeo = build(body, ['position', 'normal', 'color']);
      M.faceGeo = face.length ? build(face, ['position', 'normal', 'uv']) : null;
      M.faceMat = face.length ? new THREE.MeshLambertMaterial({ map: face[0].map }) : null;
      A.ghost = M;
      return M;
    }).catch((e) => { ghostLoad = null; throw e; });
  }
  return ghostLoad;
}

export function setOperatorSkin(op, skin) {
  op.skin = skin;
  if (skin.ghost && !A.ghost) loadGhost().then(() => { if (op.skin === skin) setOperatorSkin(op, skin); }, () => {});
  const ghost = !!(skin.ghost && A.ghost);
  const M = ghost ? A.ghost : soldierModel();
  op.rig = M.rig; // each model has its own joint positions and limb lengths
  for (const b of BONES) {
    const B = op.P[b];
    B.position.copy(M.local[b]); B.quaternion.identity();
    B.userData.rest = B.position.clone();
  }
  for (const m of op.meshes) { op.root.remove(m); if (!m.userData.shared) m.geometry.dispose(); }
  if (op.skeleton) op.skeleton.dispose();
  const skeleton = op.skeleton = new THREE.Skeleton(BONES.map(b => op.P[b]), M.inverses);
  const add = (geo, mat, shared) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.bind(skeleton, IDENT);
    m.boundingSphere = SPHERE;
    m.userData.shared = shared; // the ghost's geometry belongs to every ghost: never dispose it
    op.root.add(m);
    return m;
  };
  op.meshes = ghost ? [add(M.bodyGeo, OP_MAT, true)].concat(M.faceGeo ? [add(M.faceGeo, M.faceMat, true)] : [])
    : [add(soldierGeometry(skin), OP_MAT, false)];
}

// third-person guns: one merged, vertex-coloured mesh per weapon, shared by every soldier
const gunGeoCache = new Map();
function gunGeometry(i) {
  if (gunGeoCache.has(i)) return gunGeoCache.get(i);
  const node = A.guns[i].obj;
  node.updateMatrixWorld(true);
  const inv = node.matrixWorld.clone().invert();
  const parts = [];
  node.traverse(c => {
    if (!c.isMesh) return;
    const m = c.material;
    const col = m.color.clone();
    if (m.emissive && m.emissiveIntensity > 0.5) col.add(m.emissive.clone().multiplyScalar(0.6));
    parts.push(painted(c.geometry, inv.clone().multiply(c.matrixWorld), col.getHex()));
  });
  const g = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  gunGeoCache.set(i, g);
  return g;
}

// Puts weapon i in the soldier's hands. If that weapon file isn't downloaded yet it appears once it is.
export function setOperatorGun(op, i) {
  if (op.gunIndex === i) return;
  if (op.gun) { op.P.torso.remove(op.gun); op.gun = null; }
  op.gunIndex = i;
  op.pistol = A.gunData[i].cat === 'pistol';
  const attach = () => {
    if (op.gunIndex !== i || op.gun) return;
    op.gun = new THREE.Mesh(gunGeometry(i), OP_MAT);
    op.gun.position.set(op.pistol ? 0.02 : 0.1, op.pistol ? 0.34 : 0.17, op.pistol ? -0.56 : -0.4);
    op.P.torso.add(op.gun);
  };
  if (A.guns[i]) attach();
  else loadGun(i).then(attach, () => {});
}

// The animation itself (gait, IK, crouch, slide...) lives in anim.js.
export { animateOperator };

