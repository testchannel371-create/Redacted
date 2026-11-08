// Procedural animation for the operators (normal soldier and KNOCK OFF GHOST), third person.
// Every value is a continuous blend, so nothing snaps between states:
//   gait     feet follow a stride cycle whose length matches the real speed, so planted feet don't slide;
//            walk -> run -> sprint change the stride, lift and ground-contact time; any of 8+ directions
//   legs     two-bone IK (hip, knee, ankle) to each foot target; feet are placed on the ground under them
//            (steps, crates) and the heel rolls up instead of the foot sliding at full stretch
//   body     pelvis bob / sway / twist, shoulders counter-rotate, lean into acceleration and turns,
//            a damped spring gives the upper body and gear a little inertia, steady head, breathing
//   states   idle, walk, run, sprint, crouch, crouch-walk, slide, air, reload, death
// It runs once per visible soldier per frame and allocates nothing.
import * as THREE from 'three';

export const ANIM = {
  stride: { walk: [0.35, 0.18], run: [0.5, 0.24], maxHalf: 0.5 }, // one step (m) = a + b * speed; walk blends to run
  duty: { walk: 0.6, run: 0.27, sprint: 0.22, crouch: 0.66 }, // share of the cycle each foot is on the ground
  lift: { walk: 0.09, run: 0.34, crouch: 0.05 },  // how high the swinging foot rises (m)
  crouchDrop: 0.42, slideHeight: 0.36, moveDrop: [0.03, 0.07], // hips sit a little lower when walking / running
  // eased blend speeds (~90% after 3.9 / value s): crouch 0.24 s, slide in 0.2 s, out 0.35 s, first step 0.3 s
  blend: { crouch: 16, slideIn: 19.5, slideLegs: 13, slideOut: 11, air: 14, move: 13, sprint: 12, pose: 14, vel: 14, reload: 12 },
  lean: { accel: 0.022, accelMax: 0.2, turn: 0.03, turnMax: 0.22, strafe: 0.018 },
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (x) => x - Math.floor(x);
const smooth01 = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
// Critically damped blend (exact step): starts and ends gently, never overshoots, frame-rate independent.
// w is its speed: ~90% of the way after 3.9 / w seconds.
function ease(A, k, target, w, dt) {
  const v = k + 'V', y0 = A[k] - target, c = (A[v] || 0) + w * y0, e = Math.exp(-w * dt);
  A[k] = target + (y0 + c * dt) * e;
  A[v] = ((A[v] || 0) - w * c * dt) * e;
}

// Length of one step (m) at a speed: short quick steps when walking, long ones when running, shorter crouched.
// Shared with the first-person footsteps and head bob so they keep time with what others see.
export function stepLength(speed, crouch = 0) {
  const runW = smooth01(2.2, 5.0, speed) * (1 - crouch);
  const S = ANIM.stride;
  return lerp(S.walk[0] + S.walk[1] * speed, S.run[0] + S.run[1] * speed, runW) * (1 - 0.1 * crouch);
}

// arm poses: arm_R, forearm_R, arm_L, forearm_L, gun (Euler x y z). The gun hangs off the torso.
const POSE = {
  hold: [[0.55, 0, -0.12], [0.75, 0, 0], [1.32, 0, 0.32], [0, 0, 0], [0, 0, 0]],
  pistol: [[1.42, 0, -0.22], [0.05, 0, 0], [1.42, 0, 0.5], [0.05, 0, 0], [0, 0, 0]],
  sprint: [[0.35, 0, -0.1], [1.1, 0, 0], [0.9, 0, 0.45], [0.9, 0, 0], [-0.5, 0.7, 0]],
  // slide: the right hand keeps the weapon, the left arm goes out for balance
  slide: [[0.55, 0, -0.12], [0.75, 0, 0], [0.3, 0, -1.1], [0.4, 0, 0], [0.05, 0.12, 0]],
  slidePistol: [[1.3, 0, -0.22], [0.05, 0, 0], [0.3, 0, -1.1], [0.4, 0, 0], [0, 0, 0]],
  // reload: left hand drops to the vest for a fresh magazine, the weapon cants
  reload: [[0.55, 0, -0.12], [0.75, 0, 0], [0.75, 0, 0.3], [1.35, 0, 0], [0.3, 0, 0.45]],
  reloadPistol: [[1.3, 0, -0.22], [0.15, 0, 0], [0.6, 0, 0.25], [1.25, 0, 0], [0.25, 0, 0.35]],
};
const JOINTS = ['arm_R', 'forearm_R', 'arm_L', 'forearm_L'];

const Y = new THREE.Vector3(0, 1, 0);
const _h = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3();
const _k = new THREE.Vector3(), _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qf = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _tgt = { L: new THREE.Vector3(), R: new THREE.Vector3() };
const _pose = POSE.hold.map(j => j.slice());

function newState() {
  return {
    t: Math.random() * 10, phase: Math.random(), vf: 0, vr: 0, pvf: 0, acc: 0, turn: 0,
    crouch: 0, slide: 0, slideLeg: 0, air: 0, move: 0, sprint: 0, reload: 0, gAdj: 0, duty: 0.6, cyc: 1.2, lift: 0.09,
    foot: { L: { g: 0, pitch: 0, w: 1, z: 0, vz: 0 }, R: { g: 0, pitch: 0, w: 1, z: 0, vz: 0 } }, lead: 'L',
    spr: { x: 0, vx: 0, z: 0, vz: 0, y: 0, vy: 0 },
    arm: POSE.hold.map(j => j.slice()),
  };
}

// Damped spring (slightly under-damped so heavy gear overshoots a touch, then settles).
function spring(S, k, target, stiff, damp, dt) {
  const v = 'v' + k;
  S[v] += ((target - S[k]) * stiff - S[v] * damp) * dt;
  S[k] += S[v] * dt;
}

// Two-bone IK: thigh (leg_*), shin, foot. T is the ankle target in root space.
function solveLeg(op, side, T, footPitch, footYaw, poleX) {
  const L = op.rig.leg[side], P = op.P;
  const leg = P['leg_' + side], shin = P['shin_' + side], foot = P['foot_' + side];
  _h.copy(L.hipOff).applyQuaternion(P.pelvis.quaternion).add(P.pelvis.position); // the hip rides on the pelvis
  leg.position.copy(_h);
  _d.subVectors(T, _h);
  const Lmax = (L.L1 + L.L2) * 0.997;
  let lifted = 0;
  if (_d.length() > Lmax) {
    // out of reach: first roll up onto the toes (or heel) by up to 12 cm so the foot stays where it is,
    // and only then stretch toward it. Both steps change smoothly, so the leg never jumps.
    const horiz = Math.hypot(_d.x, _d.z);
    const fit = horiz < Lmax ? -Math.sqrt(Lmax * Lmax - horiz * horiz) : 0;
    const ny = Math.min(fit, _d.y + 0.12);
    lifted = ny - _d.y; _d.y = ny;
    if (_d.length() > Lmax) _d.setLength(Lmax);
  }
  let dist = Math.max(0.04, _d.length());
  // soft IK: ease into full stretch, so the knee never pops as the leg straightens
  const soft = 0.035 * (L.L1 + L.L2), dS = Lmax - soft;
  if (dist > dS) { const nd = dS + soft * (1 - Math.exp(-(dist - dS) / soft)); _d.multiplyScalar(nd / dist); dist = nd; }
  _n.copy(_d).divideScalar(dist);
  const a = clamp((L.L1 * L.L1 - L.L2 * L.L2 + dist * dist) / (2 * dist), -L.L1, L.L1);
  const hh = Math.sqrt(Math.max(0, L.L1 * L.L1 - a * a));
  // knees point forward (or out); the aim also leans up, so a foot swung far forward keeps the knee on top
  // instead of letting it flip sides when the leg lines up with the aim
  _p.set(poleX, 0.55, -1).applyAxisAngle(Y, footYaw);
  _p.addScaledVector(_n, -_p.dot(_n));
  if (_p.lengthSq() < 1e-6) _p.set(0, 0, -1);
  _p.normalize();
  _k.copy(_n).multiplyScalar(a).addScaledVector(_p, hh);         // knee, relative to the hip
  _u1.copy(_k).normalize();
  _u2.subVectors(_d, _k).normalize();
  _q1.setFromUnitVectors(L.t0, _u1);
  leg.quaternion.copy(_q1);
  _u2.applyQuaternion(_qi.copy(_q1).invert());
  _q2.setFromUnitVectors(L.s0, _u2);
  shin.quaternion.copy(_q2);
  // sole stays level with the ground; toes drop when the heel rolls up behind, rise on a long reach in front
  const roll = lifted > 0 ? (_d.z < 0 ? lifted * 2 : -lifted * 3.2) : 0;
  _e.set(clamp(footPitch + roll, -1.1, 0.7), footYaw, 0);
  _qf.setFromEuler(_e);
  foot.quaternion.copy(_q1.multiply(_q2).invert().multiply(_qf));
}

// s = { dt, dead, pitch, crouch, slide, sprint, air, reload, vel: {f, r} (m/s, forward / right), turn (rad/s),
//       moving (used when vel is missing), ground(x, z) -> ground height under a root-space point (optional),
//       onStep(side, speed) (optional) }
export function animateOperator(op, s) {
  const P = op.P, rig = op.rig;
  if (!rig) return;
  const A = op.anim || (op.anim = newState());
  const dt = Math.min(0.05, Math.max(0.001, s.dt || 0.016));
  if (s.dead) {
    op.deadT = Math.min(1, op.deadT + dt * 2.2);
    const e = 1 - (1 - op.deadT) ** 3;
    op.root.rotation.x = -e * Math.PI / 2;
    op.root.position.y += e * 0.15;
    return;
  }
  op.deadT = 0;
  op.root.rotation.x = 0;
  A.t += dt;

  // ---------------------------------------------------------------- inputs, smoothed
  let f = 0, r = 0;
  if (s.vel) { f = s.vel.f; r = s.vel.r; } else if (s.moving) f = s.sprint ? 7.4 : 5.5;
  ease(A, 'vf', f, ANIM.blend.vel, dt);
  ease(A, 'vr', r, ANIM.blend.vel, dt);
  ease(A, 'acc', clamp((A.vf - A.pvf) / dt, -30, 30), 8, dt);
  A.pvf = A.vf;
  ease(A, 'turn', clamp(s.turn || 0, -8, 8), 8, dt);
  const speed = Math.hypot(A.vf, A.vr);
  ease(A, 'crouch', s.crouch && !s.slide ? 1 : 0, ANIM.blend.crouch, dt); // a slide has its own pose; crouch follows it
  ease(A, 'slide', s.slide ? 1 : 0, s.slide ? ANIM.blend.slideIn : ANIM.blend.slideOut, dt);
  ease(A, 'slideLeg', s.slide ? 1 : 0, s.slide ? ANIM.blend.slideLegs : ANIM.blend.slideOut, dt); // legs settle just after the drop
  ease(A, 'air', s.air && !s.slide ? 1 : 0, ANIM.blend.air, dt);
  A.crouch = clamp(A.crouch, 0, 1); A.slide = clamp(A.slide, 0, 1); A.air = clamp(A.air, 0, 1);
  ease(A, 'sprint', s.sprint && speed > 3.5 ? 1 : 0, ANIM.blend.sprint, dt);
  ease(A, 'reload', s.reload && !s.slide ? 1 : 0, ANIM.blend.reload, dt);
  A.sprint = clamp(A.sprint, 0, 1); A.reload = clamp(A.reload, 0, 1);
  const sl = A.slide, cw = A.crouch * (1 - sl), aw = A.air * (1 - sl);
  ease(A, 'move', smooth01(0.25, 1.1, speed), ANIM.blend.move, dt);          // the first / last step eases in and out
  const moveW = clamp(A.move, 0, 1) * (1 - sl) * (1 - aw);
  const runW = smooth01(2.2, 5.0, speed) * (1 - cw);
  const spW = A.sprint * (1 - sl);
  const pistol = !!op.pistol;

  // ---------------------------------------------------------------- gait cycle
  const dirF = speed > 0.05 ? A.vf / speed : 1, dirR = speed > 0.05 ? A.vr / speed : 0;
  let dutyT = lerp(ANIM.duty.walk, ANIM.duty.run, runW);
  dutyT = lerp(dutyT, ANIM.duty.sprint, spW * runW);
  dutyT = lerp(dutyT, ANIM.duty.crouch, cw);
  // a planted foot travels duty * cycle under the body; past what a leg can reach, step faster instead
  const cycleT = Math.min(2 * stepLength(speed, cw) * (0.6 + 0.4 * Math.abs(dirF)), (2 * ANIM.stride.maxHalf) / dutyT);
  const liftT = lerp(lerp(ANIM.lift.walk, ANIM.lift.run, runW), ANIM.lift.crouch, cw);
  // the stride's shape eases between gaits (changing it abruptly would jerk the feet), and holds during a slide
  if (!s.slide) { ease(A, 'duty', dutyT, 10, dt); ease(A, 'cyc', cycleT, 10, dt); ease(A, 'lift', liftT, 10, dt); }
  const duty = clamp(A.duty, 0.15, 0.75), cycle = Math.max(0.3, A.cyc), lift = A.lift;
  const prev = A.phase;
  A.phase += ((speed * dt) / cycle) * (1 - sl) * (1 - aw);          // the stride winds down as a slide / jump blends in
  if (Math.floor(A.phase * 2) > Math.floor(prev * 2) && moveW > 0.4) {
    // a foot just touched down: footstep, and the gear on the body takes the impact
    if (s.onStep) s.onStep(Math.floor(A.phase * 2) & 1 ? 'R' : 'L', speed);
    A.spr.vy -= 0.12 * (0.3 + runW) * moveW;
  }
  if (A.phase > 1e4) A.phase -= 1e4;
  const stepHalf = (duty * cycle) / 2;                  // the planted foot moves back at exactly the body's speed

  // ---------------------------------------------------------------- foot targets (root space)
  const slideYaw = clamp(Math.atan2(-A.vr, Math.max(0.3, A.vf)), -1, 1) * sl;             // body turns into the slide
  const hipsYaw = (speed > 0.5 ? clamp(A.vf >= 0 ? Math.atan2(-A.vr, A.vf) : Math.atan2(A.vr, -A.vf), -0.45, 0.45) * 0.5 : 0) * moveW;
  const footYaw = hipsYaw + slideYaw;
  const ankleH = rig.ankleH;
  // slide on the leg that is already swinging forward (it carries on its move); the other folds underneath
  if (s.slide && !A.sliding) A.lead = A.foot.L.vz <= A.foot.R.vz ? 'L' : 'R';
  A.sliding = !!s.slide;
  const lead = A.lead || 'L';
  for (const side of ['L', 'R']) {
    const L = rig.leg[side], F = A.foot[side], T = _tgt[side];
    const p = frac(A.phase + (side === 'R' ? 0.5 : 0));
    let along, h, pitch, w = 1;                                        // w: how much this foot bears weight
    if (p < duty) { const u = p / duty; along = stepHalf * (1 - 2 * u); h = 0; pitch = 0; }
    else {
      // swing: a Hermite curve that leaves and lands moving backward like the planted foot (no jolt at
      // toe-off or touch-down); running skews the lift early so the heel kicks up before the knee drives through
      const u = (p - duty) / (1 - duty), u2 = u * u, u3 = u2 * u;
      const m = 0.4 * (-2 / duty) * (1 - duty);                     // stance speed, in swing units, eased
      along = stepHalf * (-(2 * u3 - 3 * u2 + 1) + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) + (u3 - u2) * m);
      const us = u + 0.6 * runW * u * (1 - u);
      const sn = Math.sin(Math.PI * us);
      h = lift * sn * sn;                                            // rises and settles gently
      pitch = -(0.1 + 0.45 * runW) * Math.sin(Math.PI * clamp(u * 2, 0, 1)) + 0.22 * Math.sin(Math.PI * clamp(u * 2 - 1, 0, 1));
      w = 1 - smooth01(0, 0.25, u) + smooth01(0.8, 1, u);
    }
    F.w = lerp(1, w, moveW) * (1 - aw) * (1 - sl);
    along -= 0.15 * runW * stepHalf / 0.5;                            // runners land just ahead and push off far behind
    along *= moveW; h *= moveW; pitch *= moveW;
    const sgn = side === 'L' ? -1 : 1;
    const crouchZ = (side === 'L' ? -0.12 : 0.16) * cw * (1 - moveW); // tactical crouch: one foot ahead
    let tx = L.ankle.x + sgn * 0.02 * cw + dirR * along;
    let ty = ankleH + h;
    let tz = L.ankle.z + crouchZ - dirF * along;
    if (aw > 0) {                                                    // airborne: knees come up
      tx = lerp(tx, L.ankle.x, aw); ty = lerp(ty, ankleH + 0.24 + (side === 'L' ? 0.07 : 0), aw);
      tz = lerp(tz, L.ankle.z + (side === 'L' ? -0.14 : 0.1), aw); pitch = lerp(pitch, -0.3, aw);
    }
    const slL = clamp(A.slideLeg, 0, 1);
    if (slL > 0) {
      // slide: the lead leg out in front, the other folded underneath, both turned along the slide
      const isLead = side === lead;
      const lx = isLead ? L.ankle.x * 0.7 : L.ankle.x + sgn * 0.1, lz = isLead ? -0.8 : 0.08;
      const c = Math.cos(slideYaw), sn = Math.sin(slideYaw);
      tx = lerp(tx, lx * c + lz * sn, slL); tz = lerp(tz, -lx * sn + lz * c, slL);
      ty = lerp(ty, ankleH + (isLead ? 0.03 : 0.02), slL);
      pitch = lerp(pitch, isLead ? 0.3 : -0.75, slL);
    }
    F.vz = (tz - F.z) / dt; F.z = tz;
    if (s.ground) F.g = approach(F.g, clamp(s.ground(tx, tz), -0.6, 0.6), 18, dt);
    else F.g = approach(F.g, 0, 18, dt);
    T.set(tx, ty + F.g * (1 - aw), tz);
    F.pitch = pitch;
  }

  // ---------------------------------------------------------------- pelvis
  A.gAdj = approach(A.gAdj, Math.min(0, A.foot.L.g, A.foot.R.g), 10, dt);   // stepping down: sink to reach
  const mid = TAU * (A.phase - duty / 2);
  const bob = Math.cos(2 * mid) * lerp(0.018, -0.032, runW) * moveW;          // walk: up mid-stance, run: down
  const breath = Math.sin((A.t * TAU) / 3.4);
  spring(A.spr, 'y', 0, 140, 13, dt);
  const pel = rig.pelvis;
  let py = pel.y - 0.02 * (1 - moveW) * (1 - sl) - ANIM.crouchDrop * cw - (pel.y - ANIM.slideHeight) * sl
    - lerp(ANIM.moveDrop[0], ANIM.moveDrop[1], runW) * moveW + bob + A.gAdj + A.spr.y + breath * 0.003;
  const sway = -Math.cos(mid) * lerp(0.022, 0.04, cw) * moveW * (1 - 0.6 * runW);    // weight over the planted foot
  // the hips can't be higher than the planted legs reach: they dip as the stride opens (walking) instead of
  // the feet lifting off the ground. Running lets the heel roll up a little first.
  const want = py;
  for (const side of ['L', 'R']) {
    const F = A.foot[side];
    if (F.w <= 0.001) continue;
    const L = rig.leg[side], T = _tgt[side], Lmax = (L.L1 + L.L2) * 0.96; // knees stay slightly bent
    const hz = Math.hypot(T.x - (pel.x + sway + L.hipOff.x), T.z - (pel.z + L.hipOff.z));
    const top = T.y + 0.08 * runW + Math.sqrt(Math.max(0, Lmax * Lmax - hz * hz)) - L.hipOff.y;
    // (mostly a walking thing: a runner pushes off from the toes instead of dropping the hips)
    py = Math.min(py, lerp(py, Math.max(top, want - 0.15), F.w * (1 - 0.85 * runW)));
  }
  P.pelvis.position.set(pel.x + sway, py, pel.z);
  const twist = -0.1 * Math.cos(TAU * A.phase) * moveW * (0.5 + 0.5 * runW);        // hips swing with the legs
  const hipRoll = -0.035 * Math.cos(mid) * moveW * (1 - 0.5 * runW);
  const turnLean = clamp(A.turn * speed * ANIM.lean.turn, -ANIM.lean.turnMax, ANIM.lean.turnMax) * (1 - cw * 0.5);
  const strafeLean = -A.vr * ANIM.lean.strafe * (1 - sl);
  P.pelvis.rotation.set(0, twist + hipsYaw + slideYaw, hipRoll + turnLean + strafeLean);

  // ---------------------------------------------------------------- upper body
  const pitch = clamp(s.pitch || 0, -1.1, 1.1);
  spring(A.spr, 'x', clamp(A.acc * 0.008, -0.08, 0.08), 90, 11, dt);              // gear lags behind speed changes
  spring(A.spr, 'z', clamp(-A.turn * speed * 0.004, -0.06, 0.06), 90, 11, dt);
  const accLean = clamp(A.acc * ANIM.lean.accel, -0.12, ANIM.lean.accelMax) * (1 - sl) * (1 - cw * 0.5);
  const lean = -(0.04 * moveW + 0.07 * runW * moveW + 0.06 * spW + accLean) - 0.2 * cw + 0.33 * sl + A.spr.x;
  const counter = lerp(0.35, 1.4, spW);                                             // shoulders against the hips
  P.torso.rotation.set(pitch * 0.55 * (1 - 0.3 * sl) + lean + breath * 0.008, -twist * counter - hipsYaw * 0.8 - slideYaw * 0.55, -hipRoll * 0.7 + A.spr.z);
  P.torso.position.y = P.torso.userData.rest.y + breath * 0.002;
  const yawSoFar = twist + hipsYaw + slideYaw + P.torso.rotation.y;
  P.head.rotation.set(pitch * 0.4 - lean * 0.8, -yawSoFar * 0.9, -(hipRoll + turnLean + strafeLean) * 0.5); // eyes stay on target

  // arms: blend the hold, sprint, slide and reload poses, then ease toward them
  const base = pistol ? POSE.pistol : POSE.hold;
  const wSp = pistol ? 0 : spW, wSl = sl, wRe = A.reload * (1 - spW);
  const swing = Math.sin(TAU * A.phase) * spW * moveW;
  for (let j = 0; j < 5; j++) for (let k = 0; k < 3; k++) {
    let v = base[j][k];
    v = lerp(v, POSE.sprint[j][k], wSp);
    v = lerp(v, (pistol ? POSE.reloadPistol : POSE.reload)[j][k], wRe);
    v = lerp(v, (pistol ? POSE.slidePistol : POSE.slide)[j][k], wSl);
    _pose[j][k] = v;
  }
  if (!pistol) { _pose[0][0] += swing * 0.12; _pose[2][0] -= swing * 0.08; }
  if (wRe > 0.01) { const r = Math.sin(A.t * 7) * 0.12 * wRe; _pose[3][0] += r; }
  for (let j = 0; j < 5; j++) for (let k = 0; k < 3; k++) A.arm[j][k] = approach(A.arm[j][k], _pose[j][k], ANIM.blend.pose, dt);
  for (let j = 0; j < 4; j++) P[JOINTS[j]].rotation.set(A.arm[j][0], A.arm[j][1], A.arm[j][2]);
  if (op.gun) op.gun.rotation.set(A.arm[4][0], A.arm[4][1], A.arm[4][2]);

  // ---------------------------------------------------------------- legs
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? -1 : 1;
    const pole = sgn * lerp(0.12 + 0.2 * cw, side === (A.lead || 'L') ? 0.1 : 1.0, clamp(A.slideLeg, 0, 1)); // folded leg: knee forward-out
    solveLeg(op, side, _tgt[side], A.foot[side].pitch, footYaw, pole);
  }
}

// Rest data the IK needs, from the model's bone positions (root space, metres).
export function makeRig(world) {
  const leg = {};
  for (const side of ['L', 'R']) {
    const hip = world['leg_' + side], knee = world['shin_' + side], ankle = world['foot_' + side];
    const t0 = knee.clone().sub(hip), s0 = ankle.clone().sub(knee);
    leg[side] = { hipOff: hip.clone().sub(world.pelvis), ankle: ankle.clone(), L1: t0.length(), L2: s0.length(), t0: t0.normalize(), s0: s0.normalize() };
  }
  return { pelvis: world.pelvis.clone(), leg, ankleH: (world.foot_L.y + world.foot_R.y) / 2 };
}
