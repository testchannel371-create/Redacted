// The 3D scene behind the menus: the player's operator in a dim war room, and a weapon showcase for the shop.
import * as THREE from 'three';
import { A, makeOperator, setOperatorSkin, setOperatorGun, animateOperator, cloneGun, loadGun } from './assets.js';
import { grungeTexture } from './world.js';

export class MenuScene {
  constructor(skin, gun) {
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x232a2f);
    s.fog = new THREE.Fog(0x232a2f, 7, 17);
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 60);
    this.camera.position.set(0, 1.3, 5.4);
    this.lookAt = new THREE.Vector3(0, 1.05, 0);

    s.add(new THREE.HemisphereLight(0x9fb4c8, 0x2a2420, 2.1));
    const key = new THREE.DirectionalLight(0xffd6a0, 2.8); key.position.set(1, 3.5, 5); s.add(key);
    const rim = new THREE.DirectionalLight(0x6fa8ff, 2.2); rim.position.set(-3, 2.5, -4); s.add(rim);

    const tex = grungeTexture().clone(); tex.needsUpdate = true; tex.repeat.set(10, 10);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x3a3e40, map: tex }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const wallTex = grungeTexture().clone(); wallTex.needsUpdate = true; wallTex.repeat.set(6, 2);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshLambertMaterial({ color: 0x3b4246, map: wallTex }));
    wall.position.set(0, 5, -4.5);
    s.add(wall);
    // amber light strips + a map board on the wall (war room)
    const strip = new THREE.MeshBasicMaterial({ color: 0xf5a524 });
    for (const x of [-5.5, 5.5]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.2, 0.05), strip); m.position.set(x, 1.8, -4.4); s.add(m); }
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.9, 0.05), new THREE.MeshLambertMaterial({ color: 0x55604f, emissive: 0x111a10 }));
    board.position.set(-2.2, 2.3, -4.38);
    s.add(board);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xc03a2a });
    for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.7 + i * 0.2, 0.025, 0.02), lineMat); l.position.set(-2.6 + i * 0.25, 2.0 + i * 0.25, -4.34); l.rotation.z = 0.4 - i * 0.3; s.add(l); }
    // crates and sandbags
    const crate = new THREE.MeshLambertMaterial({ color: 0x5d5038, map: tex });
    for (const [x, z, sz, r] of [[-3.2, -1.5, 1.0, 0.3], [-2.4, -2.4, 0.8, -0.2], [3.6, -2.2, 1.1, 0.5], [-3.2, -1.5, 0.6, 0.1]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), crate);
      c.position.set(x, sz / 2 + (sz === 0.6 ? 1.0 : 0), z); c.rotation.y = r; s.add(c);
    }
    // floor spotlight
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,214,160,0.38)'); g.addColorStop(1, 'rgba(255,214,160,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    this.spot = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.spot.rotation.x = -Math.PI / 2; this.spot.position.y = 0.01;
    s.add(this.spot);
    // dust motes
    const N = 160, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 9; pos[i * 3 + 1] = Math.random() * 4; pos[i * 3 + 2] = (Math.random() - 0.5) * 6; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffe2b0, size: 0.025, transparent: true, opacity: 0.55, depthWrite: false }));
    s.add(this.dust);

    this.op = makeOperator(skin);
    setOperatorGun(this.op, gun);
    s.add(this.op.root);
    this.showcase = new THREE.Group();
    this.showcase.visible = false;
    s.add(this.showcase);
    this.t = 0;
    this.mode = 'menu';
    this.target = new THREE.Vector3(1.9, 0, 0.3);
    this.setMode('menu');
  }

  setSkin(skin) { setOperatorSkin(this.op, skin); }
  setGun(i) { setOperatorGun(this.op, i); }

  showGun(i) {
    this.showcaseGun = i;
    this.showcase.clear();
    if (!A.guns[i]) { loadGun(i).then(() => { if (this.showcaseGun === i) this.showGun(i); }, () => {}); return; }
    const gun = cloneGun(i);
    const box = A.guns[i].box, c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    gun.position.set(-c.x, -c.y, -c.z);
    const scale = 2.1 / Math.max(0.5, sz.z);
    this.showcase.scale.setScalar(Math.min(4.2, scale));
    this.showcase.add(gun);
  }

  setMode(mode) {
    this.mode = mode;
    const shopW = mode === 'shop-weapons';
    // the weapon showcase only has room beside the shop panels on very wide screens
    this.showcase.visible = shopW && innerWidth >= 1800;
    this.op.root.visible = !shopW;
    // keep the operator on the right third of the screen whatever the aspect ratio
    const half = Math.tan((this.camera.fov / 2) * Math.PI / 180) * 5.4 * this.camera.aspect;
    if (mode === 'menu') this.target.set(half * 0.78, 0, 0.2);
    else if (mode === 'shop-operator') this.target.set(half * 0.5, 0, 0.7);
    else this.target.set(half * 0.75, 0, 0.0);
    this.showcase.position.set(half * 0.66, 1.35, 1.2);
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.setMode(this.mode); }

  update(dt) {
    this.t += dt;
    const r = this.op.root;
    r.position.lerp(this.target, Math.min(1, dt * 4));
    // model faces -Z; PI turns it toward the camera, slight angle toward the screen centre
    r.rotation.y = Math.PI - 0.55 + Math.sin(this.t * 0.35) * 0.3 + (this.mode === 'shop-operator' ? (this.t * 0.4) % (Math.PI * 2) : 0);
    animateOperator(this.op, { moving: false, pitch: Math.sin(this.t * 0.8) * 0.03, dt });
    this.op.P.torso.position.y = this.op.P.torso.userData.rest.y + Math.sin(this.t * 1.6) * 0.006;
    this.spot.position.x = r.position.x; this.spot.position.z = r.position.z;
    this.showcase.rotation.y = -Math.PI / 2 + Math.sin(this.t * 0.6) * 0.55;
    this.showcase.rotation.x = Math.sin(this.t * 0.4) * 0.08;
    const p = this.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * 0.05; if (y > 4) y = 0; p.setY(i, y); }
    p.needsUpdate = true;
    this.camera.position.x = Math.sin(this.t * 0.2) * 0.08;
    this.camera.lookAt(this.lookAt);
  }

  render(r) { r.render(this.scene, this.camera); }
}
