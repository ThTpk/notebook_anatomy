// The page you drive. The thermal model runs in real time, the geometry is posed from it, and every control is live:
// seven cameras, five modes, four overlays, three sliders, a cut plane, a chip for each of the 22 parts, and the
// parts themselves are clickable in the 3D. Drag orbits, the wheel zooms, SPACE freezes the machine while the camera
// stays free. Left alone the page plays its own tour with an operator's cursor; a click, drag, wheel or key hands
// control over, and 25 s of quiet hands it back.
import * as THREE from 'three';
import {warmComposer} from 'teardown-kit/warm.js';
import {CAMS, createConsole, MODES, OVERLAYS} from './console.js';
import {BAT, freshState, PART, PARTS, packCurrent, runtimeH, step, sysPower, TH} from './model.js';
import {createStage} from './stage.js';
import {camName, DURATION, LID_OPEN, loadAt, makeCursor, modeAt, selAt, SCRIPT, selAt as selOf, sinceCam, VIEW_FN} from './tour.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const MODE_TARGET = {
  closed: {lid: 0, explode: 0, xray: 0, clip: false},
  open: {lid: LID_OPEN, explode: 0, xray: 0, clip: false},
  explode: {lid: 104, explode: 1, xray: 0, clip: false},
  section: {lid: 82, explode: 0, xray: 0, clip: true},
  xray: {lid: LID_OPEN, explode: 0, xray: 1, clip: false},
};

// which parts get a callout when nothing is selected
const CALLOUT_SET = {
  closed: ['lid', 'cover', 'feet', 'hinges'],
  open: ['lid', 'keys', 'touchpad', 'cards'],
  explode: ['battery', 'board', 'fan', 'heatpipe', 'ram', 'inputcover'],
  section: ['battery', 'keys', 'board', 'heatpipe'],
  xray: ['battery', 'board', 'fan', 'ram'],
};

const CSS = `
html,body{background:#edeef0;overflow:hidden;margin:0}
#app{position:absolute!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{position:absolute;left:0;top:0;width:${W}px;height:${H}px;touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
#gl.over{cursor:pointer}
.tourchip{position:absolute;left:800px;top:58px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:21px;padding:0 11px;border:1px solid #e1e3e6;background:rgba(255,255,255,.95);color:#16181b;font:600 8.8px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto;z-index:60}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#d6182b}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:16px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#8b8f95;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:860px){.turn{display:block}}
`;

export function runLive() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createStage({canvas});
  const nb = st.nb;
  const ui = createConsole(app);
  const cursorAt = makeCursor(ui);

  // ------------------------------------------------------------ quality tiers
  const TIERS = [
    {samples: 8, ao: true, shadow: 4096, pr: 2},
    {samples: 4, ao: false, shadow: 2048, pr: 1.5},
    {samples: 2, ao: false, shadow: 1024, pr: 1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  ui.measure();
  addEventListener('resize', () => {
    fit();
    ui.measure();
  });
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(note);

  // ------------------------------------------------------------ state
  let T = 0;
  const S = freshState();
  let soc = 0.86;
  let load = 0.1;
  let loadTarget = 0.1;
  let paused = false;
  let spin = false;
  let hidden = false;
  let view = 'hero';
  let viewAt = 0;
  let mode = 'closed';
  let sel = null;
  let selAtT = -9;
  let cut = 56;
  let flowPhase = 0;
  const tgt = {lid: 0, explode: 0, xray: 0};
  const cur = {lid: 0, explode: 0, xray: 0};
  const ov = {callouts: 1, airflow: 1, isolate: 1, charts: 1};
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEW_FN.hero(0)};
  let clipOn = false;
  let ring = {t: -9, x: 0, y: 0};
  const hist = [];
  let histAt = 0;
  const pulse = (x, y) => (ring = {t: T, x, y});
  const pulseBtn = (k) => ui.spots[k] && pulse(...ui.spots[k]);

  const setMode = (m) => {
    mode = m;
    const t = MODE_TARGET[m];
    tgt.lid = t.lid;
    tgt.explode = t.explode;
    tgt.xray = t.xray;
    clipOn = t.clip;
    st.setClip(clipOn, cut);
  };
  const setView = (v) => {
    view = v;
    viewAt = T;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const select = (id) => {
    sel = sel === id ? null : id;
    selAtT = T;
  };

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.loop = 0;
    paused = false;
    spin = false;
    Object.assign(ov, {callouts: 1, airflow: 1, isolate: 1, charts: 1});
    Object.assign(off, {az: 0, el: 0, k: 1});
    cut = 56;
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    view = camName(cyc);
    viewAt = T - sinceCam(cyc);
    mode = modeAt(cyc);
    sel = selAt(cyc);
    loadTarget = loadAt(cyc);
    const m = MODE_TARGET[mode];
    clipOn = m.clip;
    st.setClip(clipOn, cut);
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });

  // ------------------------------------------------------------ controls
  for (const k of CAMS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      setView(k);
    });
  for (const k of MODES)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      setMode(k);
    });
  for (const k of OVERLAYS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      ov[k] = ov[k] ? 0 : 1;
    });
  ui.btn.pause.addEventListener('click', () => {
    takeOver();
    pulseBtn('pause');
    paused = !paused;
  });
  ui.btn.spin.addEventListener('click', () => {
    takeOver();
    pulseBtn('spin');
    spin = !spin;
  });
  ui.btn.reset.addEventListener('click', () => {
    takeOver();
    pulseBtn('reset');
    Object.assign(off, {az: 0, el: 0, k: 1});
    setView('hero');
    sel = null;
    spin = false;
  });
  for (const p of PARTS)
    ui.chips[p.id].node.addEventListener('click', () => {
      takeOver();
      pulse(...ui.chipSpot(p.id));
      select(p.id);
    });

  // the sliders
  const slider = (key, apply) => {
    const knobAt = ui.knobAt(key);
    const [x0, y] = knobAt(0);
    const [x1] = knobAt(1);
    const d = document.createElement('div');
    d.className = 'hit ew';
    Object.assign(d.style, {left: `${x0 - 9}px`, top: `${y - 12}px`, width: `${x1 - x0 + 18}px`, height: '24px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      apply(clamp((x - x0) / (x1 - x0), 0, 1));
      lastInput = T;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      d.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  };
  slider('load', (k) => (loadTarget = k));
  slider('explode', (k) => (tgt.explode = k));
  slider('lid', (k) => (tgt.lid = k * 135));
  slider('cut', (k) => {
    cut = Math.round(-148 + k * 296);
    if (!clipOn) setMode('section');
    st.setClip(true, cut);
  });

  // ------------------------------------------------------------ keys
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    takeOver();
    if (/^[1-7]$/.test(key)) setView(CAMS[+key - 1]);
    else if (key === ' ') paused = !paused;
    else if (key === 'h') hidden = !hidden;
    else if (key === 'escape') sel = null;
    else if (key === 'e') setMode(mode === 'explode' ? 'open' : 'explode');
    else if (key === 'x') setMode(mode === 'xray' ? 'open' : 'xray');
    else if (key === 'r') spin = !spin;
    else if (key === 'arrowup') loadTarget = clamp(loadTarget + 0.1, 0, 1);
    else if (key === 'arrowdown') loadTarget = clamp(loadTarget - 0.1, 0, 1);
    else if (key === 'arrowright') tgt.explode = clamp(tgt.explode + 0.12, 0, 1);
    else if (key === 'arrowleft') tgt.explode = clamp(tgt.explode - 0.12, 0, 1);
    else return;
    e.preventDefault();
  });

  // ------------------------------------------------------------ orbit, zoom, picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag = null;
  let moved = 0;
  const pick = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, st.camera);
    const hits = ray.intersectObjects(nb.pickables, false);
    for (const h of hits) {
      const pid = h.object.userData.pid;
      if (!pid) continue;
      const mat = h.object.material;
      if (mat && mat.transparent && mat.opacity < 0.25) continue; // see-through shells do not swallow the click
      return pid;
    }
    return null;
  };
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    moved = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      const over = pick(e.clientX, e.clientY);
      canvas.classList.toggle('over', !!over);
      return;
    }
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    moved += Math.abs(dx) + Math.abs(dy);
    off.az += dx * 0.3;
    off.el = clamp(off.el + dy * 0.2, -28, 62);
    drag = {x: e.clientX, y: e.clientY};
    lastInput = T;
  });
  const endDrag = (e) => {
    if (drag && moved < 5) {
      const pid = pick(e.clientX, e.clientY);
      if (pid) {
        pulse(...toStage(e.clientX, e.clientY));
        select(pid);
      } else sel = null;
    }
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => {
    drag = null;
    canvas.classList.remove('drag');
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.3, 2.4);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ the panel's own screen
  let screenAge = 99;
  const drawScreen = () => {
    const {canvas: c, ctx: g, tex} = nb.screen;
    g.fillStyle = '#0c0f13';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#d6182b';
    g.fillRect(56, 60, 70, 5);
    g.fillStyle = '#eef0f2';
    g.font = '700 42px Inter, sans-serif';
    g.fillText('Notebook · Anatomy', 56, 118);
    g.font = '600 22px Inter, sans-serif';
    g.fillStyle = '#8b9199';
    g.fillText('ONE THERMAL MODEL DRIVES EVERY NUMBER', 56, 154);
    g.fillStyle = '#d6182b';
    g.font = '800 128px Inter, sans-serif';
    g.fillText(`${Math.round(S.T)}°`, 52, 300);
    g.fillStyle = '#eef0f2';
    g.font = '600 26px Inter, sans-serif';
    g.fillText(`${Math.round(S.rpm)} rpm`, 330, 266);
    g.fillText(`${S.P.toFixed(1)} W`, 330, 300);
    // a sparkline of the recent die temperature
    g.strokeStyle = '#3d8fe0';
    g.lineWidth = 3;
    g.beginPath();
    hist.forEach((d, i) => {
      const x = 56 + (i / Math.max(1, hist.length - 1)) * 660;
      const y = 460 - ((d.T - 20) / 90) * 110;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
    g.strokeStyle = '#2a2f36';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(56, 462);
    g.lineTo(716, 462);
    g.stroke();
    tex.needsUpdate = true;
  };

  // ------------------------------------------------------------ callouts
  const V = new THREE.Vector3();
  const calloutsFor = (list, hotId) => {
    const out = [];
    for (const id of list) {
      const p = PART[id];
      if (!p) continue;
      const w = Math.max(84, p.name.length * 6.6 + 10);
      const a = st.project(nb.anchor(id));
      if (!a) continue;
      const flip = a[0] > 800; // the label goes into the margin opposite the part
      out.push({
        id,
        name: p.name,
        sub: p.qty > 1 ? `${p.qty} × · ${p.spec[0][1]}` : p.spec[0][1],
        at: a,
        w,
        flip,
        hot: id === hotId,
        label: [flip ? 322 : 1272 - w, a[1] - 6],
        o: 1,
      });
    }
    // one column of labels per margin, pushed apart so none covers another
    for (const side of [true, false]) {
      const col = out.filter((c) => c.flip === side).sort((a, b) => a.label[1] - b.label[1]);
      for (let i = 0; i < col.length; i++) {
        col[i].label[1] = clamp(col[i].label[1], 96 + i * 46, 716 - (col.length - 1 - i) * 46);
        if (i && col[i].label[1] - col[i - 1].label[1] < 46) col[i].label[1] = col[i - 1].label[1] + 46;
      }
    }
    return out;
  };

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    // drop a quality tier if the frames are not keeping up
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.022 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    // ---------------------------------------------------- the tour drives the controls, or the visitor does
    let cursor;
    let since;
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      const cyc = c - loop * DURATION;
      if (loop > AP.loop) AP.loop = loop;
      view = camName(cyc);
      since = sinceCam(cyc);
      const m = modeAt(cyc);
      if (m !== mode) setMode(m);
      const sl = selAt(cyc);
      if (sl !== sel) {
        sel = sl;
        selAtT = T;
      }
      loadTarget = loadAt(cyc);
      cursor = cursorAt(cyc);
      if (AP.loop > 0 && cyc < 0.8) {
        const end = cursorAt(DURATION - 0.01);
        const k = clamp01(cyc / 0.8);
        cursor = {...cursor, x: end.x + (cursor.x - end.x) * k, y: end.y + (cursor.y - end.y) * k};
      }
    } else {
      if (T - lastInput > IDLE) startTour();
      since = T - viewAt;
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    if (spin) off.az += dt * 11;

    // ---------------------------------------------------- the machine
    load += (loadTarget - load) * (1 - Math.exp(-dt / 0.5));
    if (!paused) {
      step(S, load, dt);
      flowPhase = (flowPhase + dt * (0.25 + (S.rpm / TH.fan.max) * 1.9)) % 1;
      soc = clamp(soc - (sysPower(S.P, S.rpm, cur.lid) * dt) / 3600 / BAT.wh, 0.04, 1);
    }
    const sysW = sysPower(S.P, S.rpm, cur.lid);
    histAt += dt;
    if (histAt > 0.35) {
      histAt = 0;
      hist.push({T: S.T, rpm: S.rpm});
      while (hist.length > 129) hist.shift();
    }

    // ---------------------------------------------------- the pose
    const ek = 1 - Math.exp(-dt / 0.42);
    cur.lid += (tgt.lid - cur.lid) * ek;
    cur.explode += (tgt.explode - cur.explode) * ek;
    cur.xray += (tgt.xray - cur.xray) * ek;
    const soloK = sel && ov.isolate ? clamp01((T - selAtT) / 0.45) : 0;
    nb.setXray(cur.xray);
    nb.setSolo(sel, soloK);
    nb.update({
      explode: cur.explode,
      lid: cur.lid,
      fanTh: S.fanTh,
      T: S.T,
      rpm: paused ? 0 : S.rpm,
      flowPhase,
      airflow: ov.airflow,
      backlight: cur.lid > 10 ? 1 : 0,
    });

    // ---------------------------------------------------- the camera
    const base = VIEW_FN[view](since);
    const want = {...base};
    // a shut machine is 16 mm tall and an open one is 200: the framing follows the hinge
    if (view !== 'macro' && view !== 'lid' && view !== 'under') {
      // the footprint does not change when the lid shuts, only the height: the look-at drops, the distance barely moves
      const lidK = 0.54 + 0.46 * clamp01(cur.lid / 100);
      want.d *= 0.8 + 0.2 * lidK;
      want.ty *= lidK;
    }
    // the teardown grows the subject upward, so the camera rises and backs off with the same stroke
    want.ty += 0.085 * cur.explode;
    want.d *= 1 + 0.5 * cur.explode;
    // a selected part pulls the camera in to frame it, without taking the orbit away
    if (sel && ov.isolate) {
      const b = nb.bboxOf(sel);
      if (b) {
        const c = b.getCenter(V.clone());
        const r = Math.max(0.018, b.getBoundingSphere(new THREE.Sphere()).radius);
        const k = soloK;
        // vertical half-angle of the 26 degree lens, with room left round the part
        const fit = clamp((r / Math.tan(13 * D2R)) * 1.75, 0.13, 0.78);
        want.tx += (c.x - want.tx) * k;
        want.ty += (c.y - want.ty) * k;
        want.tz += (c.z - want.tz) * k;
        want.d += (fit - want.d) * k;
      }
    }
    want.az += off.az;
    want.el = clamp(want.el + off.el, -78, 88);
    want.d *= off.k;
    const ck = 1 - Math.exp(-dt / (AP.on ? 0.2 : 0.36));
    cam.az += wrap(want.az - cam.az) * ck;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += (want[key] - cam[key]) * ck;
    st.frame({...cam, az: cam.az * D2R, el: cam.el * D2R});

    // ---------------------------------------------------- the overlay
    screenAge += 1;
    if (screenAge > 5) {
      screenAge = 0;
      drawScreen();
    }
    ui.root.style.display = hidden ? 'none' : '';
    if (!hidden) {
      const list = ov.callouts ? (sel ? [sel] : CALLOUT_SET[mode] || []) : [];
      ui.update({
        T: S.T,
        Ths: S.Ths,
        P: S.P,
        rpm: S.rpm,
        q: S.q,
        Tvent: S.Tvent,
        Rsa: S.Rsa,
        throttled: S.throttled,
        boost: S.boost,
        sysW,
        amps: packCurrent(sysW),
        runtime: runtimeH(soc, sysW),
        soc,
        load,
        explode: cur.explode,
        lid: cur.lid,
        cut,
        cam: view,
        mode,
        overlays: {...ov},
        paused,
        spin,
        sel,
        hist,
        callouts: calloutsFor(list, sel),
        cursor,
      });
    }
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK ANYWHERE TO TAKE OVER' : '▶ RESUME TOUR';
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };

  // every shader compiles at once, off the main thread, before the first frame
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {
    st,
    nb,
    cam,
    startTour,
    takeOver,
    get state() {
      return {T: S.T, rpm: S.rpm, P: S.P, mode, view, sel, tier};
    },
    set(k, v) {
      if (k === 'mode') setMode(v);
      else if (k === 'view') setView(v);
      else if (k === 'sel') {
        sel = v;
        selAtT = T - 9;
      } else if (k === 'load') loadTarget = v;
      else if (k === 'paused') paused = v;
      else if (k === 'tour') (v ? startTour : takeOver)();
    },
  };
}
