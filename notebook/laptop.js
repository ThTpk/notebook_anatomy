// The notebook itself, built from code at the real dimensions in model.js. Nothing is keyframed: update(s) poses
// every part from the explode stroke, the hinge angle, the fan angle and the thermal state.
//
// Millimetres throughout, scaled by S once at the geometry. Origin at the centre of the bottom cover's floor:
// x across the width (-148.3 .. +148.3), z from the rear (-114.5) to the front (+114.5), y up.
//
// The height budget, which every part below is placed against:
//   0.0  .. 0.9    bottom cover floor
//   2.3            mainboard top
//   5.15           processor lid (the heatsink's contact face)
//   1.5  .. 7.9    fan and fin stack
//   4.3  / 7.3     the two memory sockets, stacked
//   9.6  .. 9.9    keyboard well floor
//   9.9  .. 11.13  keycaps, just under the deck
//   10.3 .. 11.25  input cover plate and the touchpad glass, flush
//   11.25.. 15.85  the lid, closed
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rng} from 'teardown-kit/util.js';
import {DIM, KB, keyLayout, MM, PARTS} from './model.js';

const V3 = THREE.Vector3;
const S = MM;
const deg = Math.PI / 180;

/** The five captive fasteners; the bottom-left one lifts the input cover. */
export const SCREWS = [[-126, -96], [126, -96], [-126, 96], [126, 96], [0, 104]];

// the places every part is put, so the panels and the geometry quote the same numbers
export const LAY = {
  boardY: 2.3,
  socTop: 5.15,
  fan: {x: 56, z: -68, r: 32.5, h: 6.4, y: 4.7},
  fins: {x0: 90.5, n: 42, pitch: 1.0, z: -70, h: 5.4},
  pipeY: 7.6,
  ram: {x: -60, z: -42, y: [4.3, 7.3]},
  ssd: {x: -5, z: -62, socketZ: -21},
  wifi: {x: -114, z: -80, socketZ: -62},
  bays: [[-131.3, -86], [-131.3, -36], [131.3, -30], [131.3, 14]],
  spk: {x: 126, z: 78},
  bat: {w: 214, d: 75, h: 7.0, z: 68},
  well: {y: 9.6, z: -41.9},
  deck: {y: 10.775},
  cap: {y: 10.5, h: 1.25, face: 11.13},
  pad: {w: 115, d: 78, z: 62},
  lidY: 13.55,
  lidZ: -(DIM.D / 2 - 6.5),
};

// ---------------------------------------------------------------- shapes
function roundShape(w, d, r) {
  const x = w / 2;
  const y = d / 2;
  r = Math.max(0.2, Math.min(r, Math.min(x, y) - 0.05));
  const s = new THREE.Shape();
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}
/** Extrude a shape (in mm) upward into a solid h tall, centred on y, lying in the xz plane. */
function extrude(shape, h, seg = 5) {
  const g = new THREE.ExtrudeGeometry(shape, {depth: h, bevelEnabled: false, curveSegments: seg});
  g.rotateX(-Math.PI / 2);
  g.translate(0, -h / 2, 0);
  g.scale(S, S, S);
  return g;
}
const slab = (w, d, h, r = 0.6, seg = 3) => extrude(roundShape(w, d, r), h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w * S, h * S, d * S);
const cyl = (r, h, seg = 20) => new THREE.CylinderGeometry(r * S, r * S, h * S, seg);
const at = (m, x, y, z) => {
  m.position.set(x * S, y * S, z * S);
  return m;
};
function starShape(R, r, n) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rad = i % 2 ? r : R;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  return s;
}

// ---------------------------------------------------------------- textures, drawn once at load
function pcbTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 700;
  const g = c.getContext('2d');
  const r = rng(90210);
  g.fillStyle = '#15503c';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#17583f';
  for (let i = 0; i < 14; i++) g.fillRect(r() * 1900, r() * 620, 60 + r() * 220, 40 + r() * 120);
  g.lineCap = 'round';
  for (let b = 0; b < 170; b++) {
    const n = 2 + Math.floor(r() * 7);
    const x = r() * 2000;
    const y = r() * 680;
    const dir = r() < 0.5 ? 1 : -1;
    g.strokeStyle = r() < 0.25 ? 'rgba(198,166,74,.45)' : 'rgba(27,104,76,.95)';
    g.lineWidth = 0.9 + r() * 1.4;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.moveTo(x, y + i * 3.2);
      let cx = x;
      let cy = y + i * 3.2;
      for (let k = 0; k < 3; k++) {
        const len = 30 + r() * 170;
        if (k % 2 === 0) cx += len * dir;
        else cy += (r() < 0.5 ? -1 : 1) * len * 0.5;
        g.lineTo(cx, cy);
      }
      g.stroke();
    }
  }
  for (let i = 0; i < 1300; i++) {
    g.fillStyle = 'rgba(190,160,80,.7)';
    g.beginPath();
    g.arc(r() * 2040, r() * 690, 1.1 + r() * 0.9, 0, 7);
    g.fill();
  }
  const grid = (x0, y0, n, m, p) => {
    g.fillStyle = 'rgba(205,175,90,.85)';
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      g.beginPath();
      g.arc(x0 + i * p, y0 + j * p, p * 0.3, 0, 7);
      g.fill();
    }
  };
  grid(770, 250, 26, 26, 6.4);
  grid(300, 170, 14, 14, 6);
  g.fillStyle = 'rgba(236,240,243,.8)';
  g.font = '600 15px monospace';
  const tags = ['U1', 'U7', 'J4', 'PD1', 'L3', 'C104', 'FAN1', 'M.2', 'BAT', 'TP2', 'U22', 'SW1', 'D9', 'Q3'];
  for (let i = 0; i < 44; i++) g.fillText(tags[Math.floor(r() * tags.length)], r() * 1980, 20 + r() * 660);
  g.strokeStyle = 'rgba(236,240,243,.45)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 16; i++) g.strokeRect(r() * 1900, r() * 620, 40 + r() * 90, 30 + r() * 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function batteryTexture() {
  const c = document.createElement('canvas');
  c.width = 1400;
  c.height = 420;
  const g = c.getContext('2d');
  g.fillStyle = '#8f959c';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#868d94';
  for (let i = 0; i < 3; i++) g.fillRect(16, 16 + i * 130, c.width - 32, 120);
  g.strokeStyle = 'rgba(74,80,86,.75)';
  g.lineWidth = 3;
  for (let i = 0; i < 3; i++) g.strokeRect(16, 16 + i * 130, c.width - 32, 120);
  g.fillStyle = '#16181b';
  g.font = '800 58px Inter, sans-serif';
  g.fillText('61 Wh', 64, 104);
  g.font = '600 30px Inter, sans-serif';
  g.fillStyle = '#20242a';
  g.fillText('11.55 V   ·   5280 mAh   ·   3S Li-ion pouch', 64, 152);
  g.fillStyle = '#d6182b';
  g.fillRect(64, 196, 230, 6);
  g.font = '600 22px monospace';
  g.fillStyle = '#20242a';
  g.fillText('DO NOT PUNCTURE   ·   DO NOT INCINERATE', 64, 300);
  g.fillText('CELL 1 / 3            CELL 2 / 3            CELL 3 / 3', 64, 344);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A 16 x 16 atlas of keycap legends; every key's top face gets its own tile. */
function legendAtlas(keys) {
  const N = 16;
  const TILE = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N * TILE;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2f34';
  g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  keys.forEach((k, i) => {
    if (!k.label) return;
    const cx = (i % N) * TILE + TILE / 2;
    const cy = Math.floor(i / N) * TILE + TILE / 2;
    const n = k.label.length;
    g.fillStyle = '#e7e9eb';
    g.font = `600 ${n === 1 ? 32 : n > 3 ? 15 : 19}px Inter, sans-serif`;
    g.fillText(k.label, cx, cy + 1);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function grilleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#30353b';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#0a0c0e';
  for (let y = 0; y < 256; y += 14) for (let x = 0; x < 256; x += 14) {
    g.beginPath();
    g.arc(x + ((y / 14) % 2) * 7, y, 4.1, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- the build
export function buildLaptop() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    alu: std({color: '#c3c7cc', metalness: 0.7, roughness: 0.47, envMapIntensity: 0.55}),
    aluIn: std({color: '#9ea4ab', metalness: 0.58, roughness: 0.64, envMapIntensity: 0.5}),
    lidSkin: std({color: '#b9bec4', metalness: 0.72, roughness: 0.45, envMapIntensity: 0.55}),
    dark: std({color: '#22262b', metalness: 0.2, roughness: 0.66}),
    deep: std({color: '#15181c', metalness: 0.16, roughness: 0.5}),
    rubber: std({color: '#2a2d31', metalness: 0, roughness: 0.92}),
    pcb: std({color: '#15503c', metalness: 0.1, roughness: 0.62}),
    pcbDark: std({color: '#0f3a2c', metalness: 0.1, roughness: 0.6}),
    copper: std({color: '#b4702f', metalness: 0.82, roughness: 0.4, envMapIntensity: 0.6}),
    copperFin: std({color: '#c07e3c', metalness: 0.78, roughness: 0.46}),
    gold: std({color: '#c2a034', metalness: 0.86, roughness: 0.33}),
    ihs: std({color: '#d7dade', metalness: 0.88, roughness: 0.24, envMapIntensity: 0.6}),
    laminate: std({color: '#9aa0a6', metalness: 0.3, roughness: 0.54}),
    keycap: std({color: '#2b2f34', metalness: 0.05, roughness: 0.66}),
    glass: std({color: '#101316', metalness: 0.32, roughness: 0.12, envMapIntensity: 0.9}),
    white: std({color: '#e4e6e9', metalness: 0.1, roughness: 0.6}),
    cap: std({color: '#4a5056', metalness: 0.5, roughness: 0.5}),
    coil: std({color: '#3a3f45', metalness: 0.4, roughness: 0.62}),
  };
  // the panel: a canvas the page redraws, used as both colour and glow
  const scr = document.createElement('canvas');
  scr.width = 768;
  scr.height = 512;
  const screenTex = new THREE.CanvasTexture(scr);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  M.screen = std({color: '#ffffff', map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.9, metalness: 0.0, roughness: 0.3});

  const root = new THREE.Group();
  const base = new THREE.Group();
  root.add(base);
  const lidPivot = new THREE.Group();
  at(lidPivot, 0, LAY.lidY, LAY.lidZ);
  root.add(lidPivot);

  const groups = {};
  const partMats = {};
  const pickables = [];
  const subHome = {};

  const partGroup = (id, parent = base) => {
    const g = new THREE.Group();
    g.name = id;
    groups[id] = g;
    partMats[id] = [];
    parent.add(g);
    return g;
  };
  const mk = (geo, mat, pid, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.pid = pid;
    (parent || groups[pid]).add(m);
    pickables.push(m);
    return m;
  };
  const inst = (geo, mat, n, pid, parent) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.pid = pid;
    (parent || groups[pid]).add(m);
    pickables.push(m);
    return m;
  };
  const T = new THREE.Object3D();
  const put = (m, i, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    T.position.set(x * S, y * S, z * S);
    T.rotation.set(rx, ry, rz);
    T.scale.set(sx, sy, sz);
    T.updateMatrix();
    m.setMatrixAt(i, T.matrix);
  };
  const sub = (id, parent, x, y, z) => {
    const g = new THREE.Group();
    groups[id] = g;
    subHome[id] = [x, y, z];
    g.position.set(x * S, y * S, z * S);
    parent.add(g);
    return g;
  };

  // ============================================================== bottom cover
  {
    const g = partGroup('cover');
    // the tub: a rounded outline with the inside taken out, so it reads as a wall of real thickness
    const outline = roundShape(DIM.W, DIM.D, DIM.corner);
    outline.holes.push(roundShape(DIM.W - 2 * DIM.wall, DIM.D - 2 * DIM.wall, DIM.corner - DIM.wall));
    const wall = mk(extrude(outline, DIM.baseH - DIM.floor), M.alu, 'cover');
    at(wall, 0, DIM.floor + (DIM.baseH - DIM.floor) / 2, 0);
    at(mk(slab(DIM.W - 0.3, DIM.D - 0.3, DIM.floor, DIM.corner), M.alu, 'cover'), 0, DIM.floor / 2, 0);
    at(mk(slab(DIM.W - 2 * DIM.wall - 0.8, DIM.D - 2 * DIM.wall - 0.8, 0.22, 4), M.aluIn, 'cover'), 0, DIM.floor + 0.18, 0);
    // the intake, right under the fan: this is where every cubic foot of air comes from
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(78 * S, 78 * S), std({map: grilleTexture(), roughness: 0.8, metalness: 0.2}));
    grille.rotation.x = Math.PI / 2;
    at(grille, LAY.fan.x, -0.03, LAY.fan.z);
    grille.userData.pid = 'cover';
    g.add(grille);
    pickables.push(grille);
    // the rear vent, opposite the fin stack
    at(mk(box(46, 5.8, 0.5), M.deep, 'cover'), 111, LAY.fan.y, -(DIM.D / 2 - 0.8));
    const bars = inst(box(0.9, 5.2, 1.1), M.dark, 18, 'cover');
    for (let i = 0; i < 18; i++) put(bars, i, 111 - 22 + i * 2.6, LAY.fan.y, -(DIM.D / 2 - 1.4));
    bars.instanceMatrix.needsUpdate = true;
    // five captive T5 fasteners
    const heads = inst(cyl(2.1, 1.3, 14), M.cap, 5, 'cover');
    const stars = inst(extrude(starShape(1.3, 0.64, 6), 0.5, 1), M.deep, 5, 'cover');
    SCREWS.forEach((p, i) => {
      put(heads, i, p[0], -0.32, p[1]);
      put(stars, i, p[0], -0.99, p[1]);
    });
    heads.instanceMatrix.needsUpdate = true;
    stars.instanceMatrix.needsUpdate = true;
  }
  {
    partGroup('feet');
    for (const z of [92, -98]) at(mk(slab(196, 7, 1.1, 3), M.rubber, 'feet'), 0, -0.55, z);
  }

  // ============================================================== battery
  {
    const B = LAY.bat;
    partGroup('battery');
    const cellMat = std({map: batteryTexture(), color: '#ffffff', metalness: 0.26, roughness: 0.56});
    at(mk(slab(B.w, B.d, B.h, 2.4), cellMat, 'battery'), 0, DIM.floor + B.h / 2 + 0.25, B.z);
    const seams = inst(box(B.w - 10, 0.45, 0.8), M.laminate, 2, 'battery');
    for (let i = 0; i < 2; i++) put(seams, i, 0, DIM.floor + B.h + 0.2, B.z - B.d / 2 + (i + 1) * (B.d / 3));
    seams.instanceMatrix.needsUpdate = true;
    at(mk(box(16, 3.6, 7), M.deep, 'battery'), -92, DIM.floor + 2.1, B.z - B.d / 2 - 5.5);
    at(mk(box(13, 0.5, 9), M.gold, 'battery'), -92, DIM.floor + 0.8, B.z - B.d / 2 - 11.5);
    const f = inst(cyl(2.0, 1.4, 12), M.cap, 3, 'battery');
    [-86, 0, 86].forEach((x, i) => put(f, i, x, DIM.floor + B.h + 0.9, B.z - B.d / 2 + 5));
    f.instanceMatrix.needsUpdate = true;
  }

  // ============================================================== mainboard
  const BW = 270;
  const BD = 92;
  const BZ = -64;
  {
    partGroup('board');
    const topMat = std({map: pcbTexture(), color: '#ffffff', metalness: 0.12, roughness: 0.6});
    at(mk(slab(BW, BD, 1.0, 2), topMat, 'board'), 0, LAY.boardY - 0.5, BZ);
    const st = inst(cyl(2.6, 1.4, 10), M.aluIn, 6, 'board');
    [[-120, -28], [-40, -28], [60, -28], [-120, -104], [0, -104], [120, -104]].forEach((p, i) => put(st, i, p[0], DIM.floor + 0.7, p[1]));
    st.instanceMatrix.needsUpdate = true;
    const r = rng(4242);
    const chips = inst(box(1, 1, 1), M.deep, 44, 'board');
    for (let i = 0; i < 44; i++) {
      const w = 3 + r() * 9;
      const d = 3 + r() * 7;
      const h = 0.7 + r() * 0.9;
      put(chips, i, -124 + r() * 248, LAY.boardY + h / 2, BZ - BD / 2 + 6 + r() * (BD - 12), 0, 0, 0, w, h, d);
    }
    chips.instanceMatrix.needsUpdate = true;
    const caps = inst(cyl(1.6, 2.6, 10), M.cap, 24, 'board');
    for (let i = 0; i < 24; i++) put(caps, i, -126 + r() * 252, LAY.boardY + 1.3, BZ - BD / 2 + 5 + r() * (BD - 10));
    caps.instanceMatrix.needsUpdate = true;
    const fing = inst(box(0.6, 0.35, 7), M.gold, 48, 'board');
    let k = 0;
    for (const bay of LAY.bays) for (let i = 0; i < 12; i++) put(fing, k++, Math.sign(bay[0]) * (BW / 2 - 2), LAY.boardY + 0.2, bay[1] - 4 + i * 0.8);
    fing.instanceMatrix.needsUpdate = true;
  }
  {
    partGroup('soc');
    at(mk(slab(25, 25, 1.1, 0.4), M.deep, 'soc'), -20, LAY.boardY + 0.55, -62);
    at(mk(slab(20.4, 20.4, 1.3, 0.3), M.ihs, 'soc'), -20, LAY.boardY + 2.2, -62);
    at(mk(slab(9, 11, 0.1, 0.2), M.dark, 'soc'), -20, LAY.socTop + 0.05, -62);
  }
  {
    partGroup('vrm');
    const coils = inst(box(6.6, 3.0, 6.6), M.coil, 7, 'vrm');
    for (let i = 0; i < 7; i++) put(coils, i, -84 + i * 8.6, LAY.boardY + 1.5, -78);
    coils.instanceMatrix.needsUpdate = true;
    const pack = inst(box(5, 1.1, 5), M.deep, 7, 'vrm');
    for (let i = 0; i < 7; i++) put(pack, i, -84 + i * 8.6, LAY.boardY + 0.55, -70);
    pack.instanceMatrix.needsUpdate = true;
    const bulk = inst(cyl(2.6, 4.0, 12), M.cap, 4, 'vrm');
    for (let i = 0; i < 4; i++) put(bulk, i, -92 + i * 9, LAY.boardY + 2.0, -90);
    bulk.instanceMatrix.needsUpdate = true;
  }
  {
    partGroup('cmos');
    at(mk(cyl(6, 3.0, 20), M.ihs, 'cmos'), -60, LAY.boardY + 1.5, -95);
    at(mk(box(14, 0.4, 3), M.gold, 'cmos'), -60, LAY.boardY + 0.2, -89);
  }

  // ============================================================== memory, storage, radio
  {
    const g = partGroup('ram');
    LAY.ram.y.forEach((sy, i) => {
      at(mk(box(74, 3.0, 7.0), M.deep, 'ram'), LAY.ram.x, sy, LAY.ram.z);
      const mod = sub(`ramMod${i}`, g, LAY.ram.x, sy, LAY.ram.z + 1.5);
      const p = new THREE.Mesh(slab(69.6, 30, 1.0, 1), M.pcbDark);
      p.castShadow = p.receiveShadow = true;
      p.userData.pid = 'ram';
      mod.add(p);
      pickables.push(p);
      const ch = new THREE.InstancedMesh(box(10.5, 1.1, 8.5), M.deep, 8);
      ch.userData.pid = 'ram';
      ch.castShadow = true;
      for (let j = 0; j < 8; j++) put(ch, j, -27 + (j % 4) * 11.4, 1.05, j < 4 ? -8 : 8);
      ch.instanceMatrix.needsUpdate = true;
      mod.add(ch);
      pickables.push(ch);
      const fg = new THREE.InstancedMesh(box(0.55, 0.2, 2.4), M.gold, 60);
      fg.userData.pid = 'ram';
      for (let j = 0; j < 60; j++) put(fg, j, -32 + j * 1.08, -0.1, -14.2);
      fg.instanceMatrix.needsUpdate = true;
      mod.add(fg);
      const lab = new THREE.Mesh(slab(44, 13, 0.1, 0.5), M.white);
      lab.position.set(0, 1.68 * S, 0);
      lab.userData.pid = 'ram';
      mod.add(lab);
    });
  }
  {
    const g = partGroup('ssd');
    at(mk(box(24, 2.2, 10), M.deep, 'ssd'), LAY.ssd.x, LAY.boardY + 1.1, LAY.ssd.socketZ);
    const mod = sub('ssdMod', g, LAY.ssd.x, LAY.boardY + 1.15, LAY.ssd.z);
    const p = new THREE.Mesh(slab(22, 80, 0.9, 0.8), M.pcbDark);
    p.castShadow = p.receiveShadow = true;
    p.userData.pid = 'ssd';
    mod.add(p);
    pickables.push(p);
    const ch = new THREE.InstancedMesh(box(11, 1.1, 13), M.deep, 3);
    ch.userData.pid = 'ssd';
    ch.castShadow = true;
    [-20, 2, 24].forEach((z, i) => put(ch, i, 0, 1.0, z));
    ch.instanceMatrix.needsUpdate = true;
    mod.add(ch);
    pickables.push(ch);
    const fg = new THREE.InstancedMesh(box(0.5, 0.18, 2.2), M.gold, 36);
    fg.userData.pid = 'ssd';
    for (let j = 0; j < 36; j++) put(fg, j, -9.6 + (j % 18) * 1.14, j < 18 ? 0.55 : -0.55, 38.8);
    fg.instanceMatrix.needsUpdate = true;
    mod.add(fg);
    const lab = new THREE.Mesh(slab(20, 32, 0.1, 0.5), M.white);
    lab.position.set(0, 1.62 * S, -12 * S);
    lab.userData.pid = 'ssd';
    mod.add(lab);
  }
  {
    const g = partGroup('wifi');
    at(mk(box(24, 2.2, 10), M.deep, 'wifi'), LAY.wifi.x, LAY.boardY + 1.1, LAY.wifi.socketZ);
    const mod = sub('wifiMod', g, LAY.wifi.x, LAY.boardY + 1.15, LAY.wifi.z);
    const p = new THREE.Mesh(slab(22, 30, 0.9, 0.8), M.pcbDark);
    p.castShadow = true;
    p.userData.pid = 'wifi';
    mod.add(p);
    pickables.push(p);
    const can = new THREE.Mesh(slab(16, 15, 1.1, 0.4), M.ihs);
    can.position.set(0, 1 * S, -3 * S);
    can.userData.pid = 'wifi';
    mod.add(can);
    pickables.push(can);
    // the two antenna coaxes, up and out through the hinges
    for (const sx of [-1, 1]) {
      const pts = [[-110, 3.5, -78], [-80, 3.5, -100], [sx * 70, 4.5, -106], [sx * DIM.hinge.x, 7, -108], [sx * DIM.hinge.x, 11, -109]]
        .map((p) => new V3(p[0] * S, p[1] * S, p[2] * S));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.6 * S, 6), M.dark);
      tube.userData.pid = 'wifi';
      g.add(tube);
    }
  }

  // ============================================================== cooling
  const rotor = new THREE.Group();
  {
    const g = partGroup('fan');
    const F = LAY.fan;
    // the scroll: a wall around most of the circle, open where the air leaves
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(F.r * S, F.r * S, (F.h + 1.6) * S, 40, 1, true, -0.55, Math.PI * 1.72),
      M.dark,
    );
    housing.material.side = THREE.DoubleSide;
    at(housing, F.x, F.y, F.z);
    housing.userData.pid = 'fan';
    g.add(housing);
    pickables.push(housing);
    for (const sy of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.RingGeometry(13.5 * S, (F.r + 1.2) * S, 36), M.dark);
      sh.rotation.x = (-Math.PI / 2) * sy;
      at(sh, F.x, F.y + (sy * (F.h + 1.6)) / 2, F.z);
      sh.userData.pid = 'fan';
      sh.material.side = THREE.DoubleSide;
      g.add(sh);
    }
    at(mk(box(26, F.h + 2, 24), M.dark, 'fan'), F.x + 22, F.y, F.z - 2);
    // the rotor: a hub and 39 blades, unevenly pitched so the noise is not a single tone
    at(rotor, F.x, F.y, F.z);
    g.add(rotor);
    const hub = new THREE.Mesh(cyl(9, F.h - 1.2, 24), M.deep);
    hub.userData.pid = 'fan';
    rotor.add(hub);
    pickables.push(hub);
    const N = 39;
    const blade = new THREE.InstancedMesh(box(0.9, F.h - 1.6, 15), M.white, N);
    blade.userData.pid = 'fan';
    blade.castShadow = true;
    const r = rng(777);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.07;
      put(blade, i, Math.sin(a) * 17, 0, Math.cos(a) * 17, 0, a + 0.45, 0);
    }
    blade.instanceMatrix.needsUpdate = true;
    rotor.add(blade);
    pickables.push(blade);
  }
  {
    // the heatpipe: flattened copper from the processor, round the back of the fan, into the fin stack
    partGroup('heatpipe');
    const pts = [[-20, 0, -62], [4, 0, -74], [30, 0, -96], [62, 0, -102], [90, 0, -92], [100, 0, -78], [102, 0, -70]]
      .map((p) => new V3(p[0] * S, 0, p[2] * S));
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 3.2 * S, 14);
    tube.scale(1, 0.62, 1);
    tube.translate(0, LAY.pipeY * S, 0);
    mk(tube, M.copper, 'heatpipe');
    at(mk(slab(27, 27, 1.9, 1), M.copper, 'heatpipe'), -20, LAY.socTop + 0.95, -62);
    const f = inst(cyl(2.0, 1.5, 12), M.cap, 3, 'heatpipe');
    [[-34, -50], [-6, -74], [-34, -76]].forEach((p, i) => put(f, i, p[0], LAY.socTop + 2.6, p[1]));
    f.instanceMatrix.needsUpdate = true;
  }
  {
    partGroup('fins');
    const F = LAY.fins;
    const fin = inst(box(0.12, F.h, 20), M.copperFin, F.n, 'fins');
    for (let i = 0; i < F.n; i++) put(fin, i, F.x0 + i * F.pitch, LAY.fan.y, F.z);
    fin.instanceMatrix.needsUpdate = true;
    const cx = F.x0 + ((F.n - 1) * F.pitch) / 2;
    at(mk(box(F.n * F.pitch + 2, 1.2, 20), M.copper, 'fins'), cx, LAY.fan.y + F.h / 2 + 0.6, F.z);
    at(mk(box(F.n * F.pitch + 2, 1.2, 20), M.copper, 'fins'), cx, LAY.fan.y - F.h / 2 - 0.6, F.z);
  }

  // ============================================================== I/O and audio
  {
    const g = partGroup('cards');
    LAY.bays.forEach((bay, i) => {
      const sx = Math.sign(bay[0]);
      const cg = sub(`card${i}`, g, bay[0], DIM.floor + 4.2, bay[1]);
      cg.userData.dir = sx;
      const shell = new THREE.Mesh(slab(32, 29, 7.2, 1.2), M.alu);
      shell.castShadow = shell.receiveShadow = true;
      shell.userData.pid = 'cards';
      cg.add(shell);
      pickables.push(shell);
      const port = new THREE.Mesh(box(9.4, 3.0, 2.2), M.deep);
      port.position.set(sx * 13 * S, 0, 0);
      port.userData.pid = 'cards';
      cg.add(port);
      const edge = new THREE.Mesh(box(2, 1.0, 11), M.gold);
      edge.position.set(-sx * 15 * S, 0, 0);
      edge.userData.pid = 'cards';
      cg.add(edge);
    });
  }
  {
    const g = partGroup('speakers');
    [-1, 1].forEach((sx, i) => {
      const sg = sub(`spk${i}`, g, sx * LAY.spk.x, DIM.floor + 4.3, LAY.spk.z);
      sg.userData.dir = sx;
      const encl = new THREE.Mesh(slab(38, 46, 7.4, 1.5), M.dark);
      encl.castShadow = encl.receiveShadow = true;
      encl.userData.pid = 'speakers';
      sg.add(encl);
      pickables.push(encl);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(11 * S, 5 * S, 3.2 * S, 22, 1, true), M.deep);
      cone.material.side = THREE.DoubleSide;
      cone.position.set(0, -1 * S, 0);
      cone.userData.pid = 'speakers';
      sg.add(cone);
      const dust = new THREE.Mesh(cyl(4.4, 1.0, 16), M.cap);
      dust.position.set(0, 0.6 * S, 0);
      dust.userData.pid = 'speakers';
      sg.add(dust);
    });
  }
  {
    partGroup('audio');
    at(mk(slab(44, 22, 1.0, 1), M.pcbDark, 'audio'), -138, LAY.boardY - 0.5, -8);
    const jack = mk(cyl(3.4, 11, 16), M.ihs, 'audio');
    jack.rotation.z = Math.PI / 2;
    at(jack, -138, LAY.boardY + 1.9, -8);
    at(mk(box(7, 1.2, 7), M.deep, 'audio'), -124, LAY.boardY + 0.6, -8);
  }

  // ============================================================== input cover
  const keys = keyLayout();
  const WELL = {w: KB.deck.w + 6, d: KB.deck.d + 6};
  {
    partGroup('inputcover');
    // the plate, with the keyboard well and the touchpad cut out of it
    const face = roundShape(DIM.W - 0.8, DIM.D - 0.8, DIM.corner - 0.4);
    face.holes.push(roundShape(WELL.w, WELL.d, 2).clone());
    const kw = new THREE.Path();
    {
      // the keyboard well, offset to its own place
      const s = roundShape(WELL.w, WELL.d, 2);
      const pts = s.getPoints(16).map((p) => p.clone().add(new THREE.Vector2(0, -LAY.well.z)));
      kw.setFromPoints(pts);
    }
    const pad = new THREE.Path();
    {
      const s = roundShape(LAY.pad.w + 2, LAY.pad.d + 2, 2.4);
      const pts = s.getPoints(16).map((p) => p.clone().add(new THREE.Vector2(0, -LAY.pad.z)));
      pad.setFromPoints(pts);
    }
    face.holes = [kw, pad];
    at(mk(extrude(face, DIM.coverT), M.alu, 'inputcover'), 0, LAY.deck.y, 0);
    // the well floor the keyboard is screwed to
    at(mk(slab(WELL.w + 1, WELL.d + 1, 0.3, 2), M.aluIn, 'inputcover'), 0, LAY.well.y + 0.15, LAY.well.z);
    // the magnets that hold the whole cover down
    const mag = inst(box(9, 1.1, 9), M.deep, 8, 'inputcover');
    [[-120, -100], [0, -106], [120, -100], [-140, 0], [140, 0], [-120, 104], [0, 110], [120, 104]]
      .forEach((p, i) => put(mag, i, p[0], LAY.deck.y - DIM.coverT / 2 - 0.5, p[1]));
    mag.instanceMatrix.needsUpdate = true;
  }
  {
    // the keyboard: one merged mesh of keycap bodies, one of legend faces reading an atlas
    const g = partGroup('keys');
    const bodies = [];
    const tops = [];
    const N = 16;
    keys.forEach((k, i) => {
      const b = box(k.w, LAY.cap.h, k.d);
      b.translate(k.x * S, LAY.cap.y * S, k.z * S);
      bodies.push(b);
      const p = new THREE.PlaneGeometry(k.w * 0.9 * S, k.d * 0.9 * S);
      p.rotateX(-Math.PI / 2);
      p.translate(k.x * S, LAY.cap.face * S, k.z * S);
      const uv = p.attributes.uv;
      const ox = (i % N) / N;
      const oy = 1 - Math.floor(i / N) / N - 1 / N;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, ox + uv.getX(j) / N, oy + uv.getY(j) / N);
      uv.needsUpdate = true;
      tops.push(p);
    });
    const bm = new THREE.Mesh(mergeGeometries(bodies), M.keycap);
    bm.castShadow = bm.receiveShadow = true;
    bm.userData.pid = 'keys';
    g.add(bm);
    pickables.push(bm);
    const atlas = legendAtlas(keys);
    const legend = std({map: atlas, emissiveMap: atlas, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.6, metalness: 0.03});
    const tm = new THREE.Mesh(mergeGeometries(tops), legend);
    tm.userData.pid = 'keys';
    g.add(tm);
    pickables.push(tm);
  }
  {
    partGroup('touchpad');
    at(mk(slab(LAY.pad.w, LAY.pad.d, 0.9, 2), M.glass, 'touchpad'), 0, LAY.deck.y, LAY.pad.z);
    at(mk(slab(LAY.pad.w + 3, LAY.pad.d + 3, 0.4, 2.4), M.aluIn, 'touchpad'), 0, LAY.deck.y - 0.8, LAY.pad.z);
  }

  // ============================================================== the lid
  const LD = DIM.lidD;
  const LCZ = LD / 2 - 6.5; // the lid's centre, forward of the hinge
  {
    const g = partGroup('lid', lidPivot);
    // an aluminium tub, the same way the bottom cover is made, so the outside of the lid is metal all round
    const skin = roundShape(DIM.W, LD, DIM.corner);
    skin.holes.push(roundShape(DIM.W - 7, LD - 7, DIM.corner - 3.5));
    at(mk(extrude(skin, DIM.lidT), M.lidSkin, 'lid'), 0, 0, LCZ);
    at(mk(slab(DIM.W - 1, LD - 1, 1.2, DIM.corner - 0.5), M.lidSkin, 'lid'), 0, 1.7, LCZ);
    // the bezel, inside the rim, with the panel set 0.4 mm into it
    const frame = roundShape(DIM.W - 7.4, LD - 7.4, DIM.corner - 3.5);
    frame.holes.push(roundShape(DIM.panel.w, DIM.panel.h, 1.2));
    at(mk(extrude(frame, 2.6), M.deep, 'lid'), 0, -1.0, LCZ);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(DIM.panel.w * S, DIM.panel.h * S), M.screen);
    panel.rotation.x = Math.PI / 2;
    at(panel, 0, -1.9, LCZ);
    panel.userData.pid = 'lid';
    g.add(panel);
    pickables.push(panel);
    at(mk(slab(DIM.panel.w + 3, DIM.panel.h + 3, 0.5, 1), M.white, 'lid'), 0, -1.4, LCZ);
  }
  {
    partGroup('webcam', lidPivot);
    const cz = LCZ + DIM.panel.h / 2 + 4.6;
    at(mk(box(26, 1.4, 4.6), M.deep, 'webcam'), 0, -1.6, cz);
    at(mk(cyl(1.7, 0.9, 14), M.glass, 'webcam'), 0, -2.2, cz);
    for (const sx of [-1, 1]) at(mk(cyl(0.7, 0.6, 8), M.deep, 'webcam'), sx * 9, -2.3, cz);
  }
  {
    partGroup('hinges');
    for (const sx of [-1, 1]) {
      const bar = mk(cyl(3.0, DIM.hinge.len, 20), M.cap, 'hinges');
      bar.rotation.z = Math.PI / 2;
      at(bar, sx * DIM.hinge.x, LAY.lidY, LAY.lidZ);
      // the two knuckles the barrel turns in, standing proud of the chassis at the back
      for (const d of [-1, 1]) at(mk(slab(7, 13, 7.2, 2.4), M.cap, 'hinges'), sx * DIM.hinge.x + d * 13, LAY.lidY - 0.4, LAY.lidZ - 1);
      // the leaf that bolts down to the chassis floor
      at(mk(box(34, 1.4, 16), M.cap, 'hinges'), sx * DIM.hinge.x, DIM.floor + 0.7, LAY.lidZ + 4);
      at(mk(box(5, 9, 14), M.cap, 'hinges'), sx * DIM.hinge.x, DIM.floor + 5, LAY.lidZ + 2);
    }
  }

  // ---------------------------------------------------------------- register: one set of materials per part
  const allMats = [];
  for (const p of PARTS) {
    const g = groups[p.id];
    if (!g) continue;
    g.userData.home = g.position.clone();
    const seen = new Map();
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.pid = p.id;
      if (!seen.has(o.material)) {
        const c = o.material.clone();
        c.transparent = false;
        seen.set(o.material, c);
        partMats[p.id].push(c);
        allMats.push(c);
      }
      o.material = seen.get(o.material);
    });
  }
  const legendMat = partMats.keys.find((m) => m.emissiveMap);
  const pipeMats = partMats.heatpipe.filter((m) => m.color);
  const finMats = partMats.fins.filter((m) => m.color);

  // ---------------------------------------------------------------- airflow
  const flow = (() => {
    const F = LAY.fan;
    const pts = [
      [F.x, -10, F.z], [F.x, -1, F.z], [F.x, F.y, F.z], [F.x + 26, F.y, F.z - 4],
      [LAY.fins.x0 + 6, F.y, LAY.fins.z], [111, F.y, LAY.fins.z], [120, F.y, -92], [118, F.y, -126],
    ].map((p) => new V3(p[0] * S, p[1] * S, p[2] * S));
    const curve = new THREE.CatmullRomCurve3(pts);
    const N = 26;
    const mat = new THREE.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false});
    const geo = new THREE.CapsuleGeometry(0.85 * S, 5.5 * S, 3, 6);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, mat, N);
    m.frustumCulled = false;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    root.add(m);
    return {m, curve, N, mat, cool: new THREE.Color('#3d8fe0'), hot: new THREE.Color('#f05a23'), tmp: new THREE.Color()};
  })();

  // ---------------------------------------------------------------- state
  const clipPlane = new THREE.Plane(new V3(-1, 0, 0), 0.05);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const VEIL = new Set(['cover', 'inputcover', 'keys', 'touchpad', 'lid']);
  let xrayK = 0;
  let soloId = null;
  let soloK = 0;

  const setXray = (k) => (xrayK = k);
  const setSolo = (id, k) => {
    soloId = id;
    soloK = k;
  };
  const setClip = (on, xmm) => {
    clipPlane.constant = (xmm ?? 40) * S;
    for (const m of allMats) {
      m.clippingPlanes = on ? [clipPlane] : null;
      m.side = on ? THREE.DoubleSide : m.userData.side ?? THREE.FrontSide;
      m.needsUpdate = true;
    }
  };
  for (const m of allMats) m.userData.side = m.side;

  const update = (s) => {
    const e = easeOut(s.explode);
    for (const p of PARTS) {
      const g = groups[p.id];
      if (!g) continue;
      const h = g.userData.home;
      g.position.set(h.x + p.ex[0] * S * e, h.y + p.ex[1] * S * e, h.z + p.ex[2] * S * e);
    }
    // the modules tilt to the 20 degrees their sockets release them at, then rise
    const tilt = clamp01(s.explode / 0.45);
    for (let i = 0; i < 2; i++) {
      const m = groups[`ramMod${i}`];
      const h = subHome[`ramMod${i}`];
      m.rotation.z = -20 * deg * tilt;
      m.position.set(h[0] * S, (h[1] + 3.4 * tilt) * S, h[2] * S);
    }
    groups.ssdMod.rotation.x = -20 * deg * tilt;
    groups.ssdMod.position.y = (subHome.ssdMod[1] + 7 * tilt) * S;
    groups.wifiMod.rotation.x = -20 * deg * tilt;
    groups.wifiMod.position.y = (subHome.wifiMod[1] + 3 * tilt) * S;
    // the cards and speakers slide out of the sides
    for (let i = 0; i < 4; i++) {
      const g = groups[`card${i}`];
      g.position.x = (subHome[`card${i}`][0] + g.userData.dir * 30 * e) * S;
    }
    for (let i = 0; i < 2; i++) {
      const g = groups[`spk${i}`];
      g.position.x = (subHome[`spk${i}`][0] + g.userData.dir * 24 * e) * S;
    }
    lidPivot.position.set(0, (LAY.lidY + 155 * e) * S, (LAY.lidZ - 74 * e) * S);
    lidPivot.rotation.x = -s.lid * deg;
    rotor.rotation.y = -s.fanTh * deg;
    if (legendMat) legendMat.emissiveIntensity = (0.1 + 0.55 * (s.backlight ?? 0)) * (1 - soloK * (soloId === 'keys' ? 0 : 1));
    for (const m of partMats.lid) if (m.emissiveMap) m.emissiveIntensity = 0.9 * (1 - xrayK * 0.8) * (soloId && soloId !== 'lid' ? 1 - soloK : 1);

    // the copper warms as the die does: one number, two parts, no separate animation
    const warm = clamp01((s.T - 40) / 58);
    for (const m of pipeMats) m.color.setRGB(0.705 + warm * 0.24, 0.44 - warm * 0.11, 0.185 - warm * 0.05);
    for (const m of finMats) m.color.setRGB(0.753 + warm * 0.2, 0.494 - warm * 0.13, 0.235 - warm * 0.07);

    const show = (s.airflow ?? 0) * clamp01(s.rpm / 700);
    flow.mat.opacity = 0.6 * show;
    flow.m.visible = show > 0.01;
    if (flow.m.visible) {
      for (let i = 0; i < flow.N; i++) {
        const u = (i / flow.N + s.flowPhase) % 1;
        const p = flow.curve.getPointAt(u);
        const tg = flow.curve.getTangentAt(u);
        T.position.copy(p);
        T.lookAt(p.clone().add(tg));
        T.scale.set(1, 1, 0.5 + 1.2 * Math.sin(Math.PI * Math.min(1, u * 1.35)));
        T.updateMatrix();
        flow.m.setMatrixAt(i, T.matrix);
        flow.tmp.copy(flow.cool).lerp(flow.hot, clamp01((u - 0.3) / 0.28));
        flow.m.setColorAt(i, flow.tmp);
      }
      flow.m.instanceMatrix.needsUpdate = true;
      flow.m.instanceColor.needsUpdate = true;
    }

    // x-ray opens the shells; isolate fades everything but one part
    for (const p of PARTS) {
      let op = 1;
      if (VEIL.has(p.id)) op = 1 - xrayK * 0.9;
      if (soloK > 0 && soloId && p.id !== soloId) op = Math.min(op, 1 - soloK * 0.95);
      for (const m of partMats[p.id]) {
        const want = op < 0.995;
        if (m.transparent !== want) {
          m.transparent = want;
          m.needsUpdate = true;
        }
        m.opacity = op;
        m.depthWrite = !want;
      }
      const g = groups[p.id];
      if (g) g.traverse((o) => {
        if (o.isMesh) o.castShadow = op > 0.55;
      });
    }
  };

  /** Where a part's callout leader lands, in world space, after update(). */
  const anchor = (id) => {
    const p = PARTS.find((x) => x.id === id);
    if (!p) return new V3();
    const g = groups[id];
    if (id === 'lid' || id === 'webcam') {
      lidPivot.updateMatrixWorld();
      const l = new V3(p.at[0] * S, 0, (p.at[2] + LCZ + 60) * S);
      return l.applyMatrix4(lidPivot.matrixWorld);
    }
    const v = new V3(p.at[0] * S, p.at[1] * S, p.at[2] * S);
    if (g) v.add(g.position.clone().sub(g.userData.home));
    return v;
  };
  const bboxOf = (id) => {
    const g = groups[id];
    if (!g) return null;
    const b = new THREE.Box3().setFromObject(g);
    return b.isEmpty() ? null : b;
  };

  return {root, base, lidPivot, groups, partMats, pickables, update, setXray, setSolo, setClip, anchor, bboxOf, M, allMats, clipPlane, screen: {canvas: scr, ctx: scr.getContext('2d'), tex: screenTex}};
}
