// The overlay: a fixed 1600 x 900 layout of panels. The die temperature and the thermal path on the left with the
// controls under them, the selected part, the rolling chart, the teardown stack and the toggles on the right, the
// part picker across the bottom, and callouts with thin leaders into the machine. update(s) redraws every live part
// from the frame's state, so nothing on screen can drift from the model.
import {BAT, LAYERS, PARTS, TH, TOTAL_MASS} from './model.js';

export const C = {
  ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6',
  panel: 'rgba(248,248,249,.94)', red: '#d6182b', blue: '#3d8fe0', orange: '#f05a23',
  grey: '#5d6670', green: '#2f8f5b', copper: '#b4702f',
};
export const CAMS = ['hero', 'top', 'front', 'side', 'under', 'lid', 'macro'];
export const MODES = ['closed', 'open', 'explode', 'section', 'xray'];
export const OVERLAYS = ['callouts', 'airflow', 'isolate', 'charts'];
export const CAM_LABEL = {hero: 'HERO', top: 'TOP', front: 'FRONT', side: 'SIDE', under: 'UNDER', lid: 'HINGE', macro: 'MACRO'};
export const MODE_LABEL = {closed: 'CLOSED', open: 'OPEN', explode: 'EXPLODED', section: 'SECTION', xray: 'X-RAY'};
export const LOAD_MAX = 1;

const TH_FONT = `'Noto Sans Thai','Leelawadee UI','Sarabun',Tahoma,Inter,sans-serif`;
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.th{font-family:${TH_FONT};letter-spacing:0}
.tb{position:absolute;height:19px;padding:0 7px;display:flex;align-items:center;justify-content:center;font-size:8.8px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap;pointer-events:auto;cursor:pointer}
.tb:hover{filter:brightness(.96)}
.chip{position:absolute;height:20px;padding:0 8px;display:flex;align-items:center;font-size:8.6px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;white-space:nowrap;pointer-events:auto;cursor:pointer}
.chip i{display:block;width:5px;height:5px;margin-right:6px;background:${C.faint}}
.chip:hover{filter:brightness(.96)}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:11.5px;font-weight:600;text-shadow:0 0 4px #eceef0,0 0 9px #eceef0,0 0 14px #eceef0}
.call span{display:block;font-size:8.6px;font-weight:500;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;margin-top:2px;text-shadow:0 0 4px #eceef0,0 0 9px #eceef0}
.hit{position:absolute;pointer-events:auto;cursor:pointer}
.hit.ew{cursor:ew-resize}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.red};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const f1 = (n) => n.toFixed(1);

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const btn = {};

  // ============================================================ title and the die temperature
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:46px;font-size:23px;font-weight:700;letter-spacing:-.2px">Notebook <span style="color:${C.red}">·</span> Anatomy</div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:78px;font-weight:500;font-size:9.1px;letter-spacing:1.5px">FRAMEWORK LAPTOP 13 &nbsp;•&nbsp; 13.5-INCH 3:2</div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:92px;font-weight:500;font-size:9.1px;letter-spacing:1.5px">296.6 × 229.0 × 15.9 MM &nbsp;•&nbsp; ${(TOTAL_MASS / 1000).toFixed(2)} KG</div>`);
  const tBig = add(`<div style="position:absolute;left:33px;top:108px;font-size:54px;font-weight:800;letter-spacing:-3px;color:${C.red};line-height:1"></div>`);
  const tUnit = add(`<div style="position:absolute;top:122px;font-size:11px;font-weight:600;letter-spacing:1px;line-height:1.35">°C<br><span class="mu" style="letter-spacing:1.5px">DIE TEMPERATURE</span></div>`);
  add(`<div style="position:absolute;left:35px;top:176px;width:265px;height:8px;background:#e6e7e9"></div>`);
  const tFill = add(`<div style="position:absolute;left:35px;top:176px;height:8px;background:${C.red}"></div>`);
  const tMark = add(`<div style="position:absolute;top:172px;width:1.5px;height:16px;background:${C.ink}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:190px;font-size:8.8px;font-weight:500">25</div>`);
  const throttle = add(`<div class="cp" style="position:absolute;left:35px;top:190px;width:265px;text-align:right;font-size:8.8px;font-weight:600;color:${C.red}"></div>`);

  // ============================================================ the thermal path
  add(`<div class="pn" style="left:35px;top:212px;width:265px;height:214px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:224px;font-weight:700">THERMAL PATH</div>`);
  const pathSub = add(`<div class="cp mu" style="position:absolute;left:35px;top:224px;width:254px;text-align:right;font-weight:500"></div>`);
  const pathSvg = add(`<svg style="position:absolute;left:46px;top:242px" width="243" height="138"></svg>`);
  add(`<div style="position:absolute;left:46px;top:386px;width:243px;height:1px;background:${C.line}"></div>`);
  const pathEq = add(`<div style="position:absolute;left:46px;top:393px;font-size:9.4px;color:${C.mute};font-family:'JetBrains Mono',monospace"></div>`);
  const pathEq2 = add(`<div style="position:absolute;left:46px;top:407px;font-size:9.4px;color:${C.mute};font-family:'JetBrains Mono',monospace"></div>`);

  // ============================================================ power and the pack
  add(`<div class="pn" style="left:35px;top:434px;width:265px;height:158px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:446px;font-weight:700">POWER</div>`);
  const powSub = add(`<div class="cp mu" style="position:absolute;left:35px;top:446px;width:254px;text-align:right;font-weight:500">61 Wh · 11.55 V</div>`);
  const powRows = add(`<div style="position:absolute;left:46px;top:464px;width:243px"></div>`);
  add(`<div style="position:absolute;left:46px;top:556px;width:243px;height:7px;background:#e6e7e9"></div>`);
  const socFill = add(`<div style="position:absolute;left:46px;top:556px;height:7px;background:${C.green}"></div>`);
  const socTxt = add(`<div class="cp mu" style="position:absolute;left:46px;top:569px;font-weight:500;font-size:8.8px"></div>`);

  // ============================================================ the controls
  add(`<div class="pn" style="left:35px;top:600px;width:265px;height:285px"></div>`);
  btn.pause = add(`<div class="tb" style="left:46px;top:611px;width:112px;height:27px;background:${C.red};color:#fff;border-color:${C.red};font-size:9.6px">❚❚ &nbsp;PAUSE</div>`);
  btn.spin = add(`<div class="tb" style="left:163px;top:611px;width:60px;height:27px;font-size:9.6px">SPIN</div>`);
  btn.reset = add(`<div class="tb" style="left:228px;top:611px;width:61px;height:27px;font-size:9.6px">RESET</div>`);
  const SL = {x: 47, w: 241};
  const sliders = {};
  const mkSlider = (key, title, y) => {
    add(`<div class="cp" style="position:absolute;left:46px;top:${y}px;font-weight:500">${title}</div>`);
    const val = add(`<div class="cp" style="position:absolute;left:46px;top:${y}px;width:243px;text-align:right;font-weight:700"></div>`);
    add(`<div style="position:absolute;left:${SL.x}px;top:${y + 18}px;width:${SL.w}px;height:2px;background:#e1e3e6"></div>`);
    const knob = add(`<div style="position:absolute;top:${y + 13}px;width:9px;height:12px;margin-left:-4.5px;background:${C.red}"></div>`);
    const ticks = add(`<svg style="position:absolute;left:${SL.x}px;top:${y + 22}px" width="${SL.w}" height="9"></svg>`);
    sliders[key] = {val, knob, y: y + 18, ticks};
    return sliders[key];
  };
  mkSlider('load', 'CPU LOAD', 652);
  mkSlider('explode', 'TEARDOWN', 712);
  mkSlider('lid', 'HINGE ANGLE', 772);
  add(`<div style="position:absolute;left:46px;top:828px;width:243px;height:1px;background:${C.line}"></div>`);
  const cutRow = add(`<div class="cp mu" style="position:absolute;left:46px;top:836px;font-weight:500"></div>`);
  add(`<div style="position:absolute;left:${SL.x}px;top:${866}px;width:${SL.w}px;height:2px;background:#e1e3e6"></div>`);
  const cutKnob = add(`<div style="position:absolute;top:861px;width:9px;height:12px;margin-left:-4.5px;background:${C.ink}"></div>`);
  sliders.cut = {knob: cutKnob, y: 866, val: null};

  // ============================================================ the selected part
  add(`<div class="pn" style="left:1300px;top:33px;width:265px;height:322px"></div>`);
  const selTag = add(`<div class="cp mu" style="position:absolute;left:1311px;top:44px;font-weight:500">SELECTED PART</div>`);
  const selQty = add(`<div class="cp mu" style="position:absolute;left:1300px;top:44px;width:254px;text-align:right;font-weight:500"></div>`);
  const selName = add(`<div style="position:absolute;left:1311px;top:58px;font-size:21px;font-weight:700;letter-spacing:-.2px"></div>`);
  const selThai = add(`<div class="th" style="position:absolute;left:1311px;top:85px;width:243px;height:36px;font-size:13px;line-height:1.35;font-weight:600;color:${C.red};overflow:hidden"></div>`);
  const selSpec = add(`<div style="position:absolute;left:1311px;top:124px;width:243px"></div>`);
  const selRule = add(`<div style="position:absolute;left:1311px;top:206px;width:243px;height:1px;background:${C.line}"></div>`);
  const selDesc = add(`<div class="th" style="position:absolute;left:1311px;top:214px;width:243px;font-size:12.2px;line-height:1.6;color:${C.grey};word-break:break-word"></div>`);

  // ============================================================ the rolling chart
  add(`<div class="pn" data-g="charts" style="left:1300px;top:363px;width:265px;height:150px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1311px;top:374px;font-weight:700">HEAT & FAN · LAST 45 s</div>`);
  const chartLeg = add(`<div class="cp" data-g="charts" style="position:absolute;left:1311px;top:390px;font-weight:500;font-size:8.8px"></div>`);
  const chart = add(`<svg data-g="charts" style="position:absolute;left:1308px;top:404px" width="249" height="100"></svg>`);

  // ============================================================ the teardown stack
  add(`<div class="pn" style="left:1300px;top:521px;width:265px;height:186px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1311px;top:532px;font-weight:700">TEARDOWN STACK</div>`);
  const stackSub = add(`<div class="cp mu" style="position:absolute;left:1300px;top:532px;width:254px;text-align:right;font-weight:500">OUT FIRST → LAST</div>`);
  const stack = add(`<div style="position:absolute;left:1311px;top:550px;width:243px"></div>`);

  // ============================================================ toggles
  const group = (title, keys, y, labels, x0 = 1311, x1 = 1558) => {
    add(`<div class="cp mu" style="position:absolute;left:${x0}px;top:${y}px;font-weight:500">${title}</div>`);
    let x = x0;
    let yy = y + 15;
    for (const k of keys) {
      const w = Math.round(labels[k].length * 5.95 + 14);
      if (x + w > x1) {
        x = x0;
        yy += 23;
      }
      btn[k] = add(`<div class="tb" style="left:${x}px;top:${yy}px;width:${w}px">${labels[k]}</div>`);
      x += w + 4;
    }
    return yy + 23;
  };
  add(`<div class="pn" style="left:1300px;top:688px;width:265px;height:197px"></div>`);
  const OVL = {callouts: 'CALLOUTS', airflow: 'AIRFLOW', isolate: 'ISOLATE', charts: 'CHARTS'};
  group('CAMERA', CAMS, 697, CAM_LABEL);
  group('MODE', MODES, 764, MODE_LABEL);
  group('OVERLAYS', OVERLAYS, 831, OVL);

  // ============================================================ the legend, top centre
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:36px;text-align:center;font-weight:500;font-size:9.4px">
    ${[['COOL AIR IN', C.blue], ['HEAT OUT', C.orange], ['COPPER', C.copper], ['SELECTED', C.red]]
      .map(([n, c]) => `<span style="margin:0 9px"><i style="display:inline-block;width:15px;height:2.4px;background:${c};vertical-align:middle;margin-right:6px"></i>${n}</span>`)
      .join('')}</div>`);

  // ============================================================ the part picker
  const CHIP_TOP = 748;
  add(`<div class="cp mu" style="position:absolute;left:316px;width:968px;top:${CHIP_TOP - 18}px;text-align:center;font-weight:500"><span style="color:${C.ink}">${PARTS.length} PARTS</span> &nbsp;— &nbsp;CLICK A CHIP, OR THE PART ITSELF IN THE 3D</div>`);
  const chipHost = add(`<div style="position:absolute;left:0;top:${CHIP_TOP}px;width:1600px;height:70px"></div>`);
  const chips = {};
  {
    // three centred rows inside the free band between the side panels, filled in teardown order
    const rows = [[], [], []];
    const w = [0, 0, 0];
    for (const p of PARTS) {
      const cw = Math.round(p.name.length * 5.5 + 29);
      let r = 0;
      for (let i = 1; i < 3; i++) if (w[i] < w[r]) r = i;
      rows[r].push({p, cw});
      w[r] += cw + 5;
    }
    rows.forEach((row, ri) => {
      const total = row.reduce((a, c) => a + c.cw + 5, 0) - 5;
      let x = Math.max(318, (1600 - total) / 2);
      for (const {p, cw} of row) {
        const c = el(`<div class="chip" style="left:${x}px;top:${ri * 23}px;width:${cw}px"><i></i>${p.name}</div>`);
        chipHost.appendChild(c);
        chips[p.id] = {node: c, x: x + cw / 2, y: CHIP_TOP + ri * 23 + 10};
        x += cw + 5;
      }
    });
  }
  add(`<div class="cp" style="position:absolute;left:316px;width:968px;top:828px;text-align:center;font-weight:500;color:${C.mute}">DRAG TO ORBIT &nbsp;·&nbsp; SCROLL TO ZOOM &nbsp;·&nbsp; SPACE FREEZES THE MACHINE &nbsp;·&nbsp; 1-7 CAMERAS &nbsp;·&nbsp; ESC CLEARS THE SELECTION</div>`);
  add(`<div class="cp" style="position:absolute;left:316px;width:968px;top:848px;text-align:center;font-weight:500;color:${C.faint}">H HIDES THE OVERLAY &nbsp;·&nbsp; EVERY NUMBER ON THIS PAGE COMES FROM ONE THERMAL MODEL, NOT A SCRIPT</div>`);

  // ============================================================ callouts and the pointer
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);

  const centre = (n) => {
    const r = n.getBoundingClientRect();
    const a = ui.getBoundingClientRect();
    const sc = a.width / 1600 || 1;
    return [(r.left - a.left) / sc + r.width / (2 * sc), (r.top - a.top) / sc + r.height / (2 * sc)];
  };
  // the buttons are measured after the page has been scaled to fit, so the tour's cursor lands on them
  const spots = {};
  const measure = () => {
    for (const [k, n] of Object.entries(btn)) spots[k] = centre(n);
    return spots;
  };
  const knobX = (v) => SL.x + v * SL.w;

  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String((c.ring || 0) * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - (c.ring || 0))).toFixed(3)})`;
  };

  // a tick row under a slider
  const tickRow = (svg, labels) => {
    svg.innerHTML = labels
      .map(([k, t]) => `<g><line x1="${(k * SL.w).toFixed(1)}" x2="${(k * SL.w).toFixed(1)}" y1="0" y2="3" stroke="${C.faint}"/><text x="${(k * SL.w).toFixed(1)}" y="9" font-size="6.4" letter-spacing=".6" text-anchor="${k < 0.05 ? 'start' : k > 0.95 ? 'end' : 'middle'}" fill="${C.mute}">${t}</text></g>`)
      .join('');
  };
  tickRow(sliders.load.ticks, [[0, 'IDLE'], [0.5, '50%'], [1, 'ALL CORES']]);
  tickRow(sliders.explode.ticks, [[0, 'ASSEMBLED'], [1, 'APART']]);
  tickRow(sliders.lid.ticks, [[0, 'SHUT'], [0.63, '85°'], [1, '135°']]);

  return {
    root: ui,
    btn,
    spots,
    measure,
    chips,
    chipSpot: (id) => [chips[id].x, chips[id].y],
    knobAt: (key) => (v) => [knobX(v), sliders[key].y],
    pointer,
    update(s) {
      // ---------------------------------------------------- die temperature
      tBig.textContent = Math.round(s.T);
      tUnit.style.left = `${34 + tBig.offsetWidth + 7}px`;
      const tk = Math.min(1, Math.max(0, (s.T - TH.amb) / (105 - TH.amb)));
      tFill.style.width = `${(tk * 265).toFixed(1)}px`;
      tMark.style.left = `${(35 + ((TH.Tmax - TH.amb) / (105 - TH.amb)) * 265).toFixed(1)}px`;
      throttle.textContent = s.throttled ? `THROTTLING AT ${TH.Tmax}°C` : `LIMIT ${TH.Tmax}°C`;
      throttle.style.color = s.throttled ? C.red : C.mute;

      // ---------------------------------------------------- the thermal path
      pathSub.innerHTML = `<b style="color:${C.ink}">${f1(s.P)}</b> W THROUGH`;
      {
        const Tpipe = s.Ths + s.P * TH.Rhp;
        const nodes = [
          ['DIE', s.T, C.red],
          ['PIPE', Tpipe, C.copper],
          ['FINS', s.Ths, C.copper],
          ['AIR', s.Tvent, C.blue],
        ];
        const links = [['Rjc', TH.Rjc], ['Rhp', TH.Rhp], ['Rsa', s.Rsa]];
        const W = 243;
        const bw = 44;
        const gap = (W - 4 * bw) / 3;
        let h = '';
        nodes.forEach(([n, v, col], i) => {
          const x = i * (bw + gap);
          h += `<rect x="${x}" y="22" width="${bw}" height="34" fill="#fff" stroke="${col}" stroke-width="1.3"/>`;
          h += `<text x="${x + bw / 2}" y="17" font-size="7" letter-spacing="1.1" text-anchor="middle" fill="${C.mute}">${n}</text>`;
          h += `<text x="${x + bw / 2}" y="44" font-size="15" font-weight="700" text-anchor="middle" fill="${C.ink}">${Math.round(v)}</text>`;
          h += `<text x="${x + bw / 2}" y="52" font-size="6" text-anchor="middle" fill="${C.mute}">°C</text>`;
          if (i < 3) {
            const x1 = x + bw;
            const x2 = x + bw + gap;
            h += `<line x1="${x1 + 2}" x2="${x2 - 5}" y1="39" y2="39" stroke="${C.ink}" stroke-width=".9"/>`;
            h += `<path d="M${x2 - 5} 39 l-4 -2.4 v4.8 z" fill="${C.ink}"/>`;
            h += `<text x="${(x1 + x2) / 2}" y="33" font-size="6.2" text-anchor="middle" fill="${C.mute}">${links[i][0]}</text>`;
            h += `<text x="${(x1 + x2) / 2}" y="51" font-size="6.6" font-weight="600" text-anchor="middle" fill="${C.ink}">${f1(links[i][1])}</text>`;
          }
        });
        // the fan's own curve, with the working point on it
        const cx0 = 2;
        const cy0 = 78;
        const cw = W - 10;
        const ch = 48;
        const X = (t) => cx0 + ((t - 30) / 70) * cw;
        const Y = (r) => cy0 + ch - (r / TH.fan.max) * ch;
        h += `<line x1="${cx0}" x2="${cx0 + cw}" y1="${cy0 + ch}" y2="${cy0 + ch}" stroke="${C.ink}" stroke-width=".8"/>`;
        h += `<line x1="${cx0}" x2="${cx0}" y1="${cy0}" y2="${cy0 + ch}" stroke="${C.ink}" stroke-width=".8"/>`;
        let p = '';
        for (let t = 30; t <= 100; t += 2) {
          const r = t < TH.fan.on ? 0 : TH.fan.min + Math.min(1, (t - TH.fan.on) / (TH.fan.full - TH.fan.on)) * (TH.fan.max - TH.fan.min);
          p += `${t === 30 ? 'M' : 'L'}${X(t).toFixed(1)} ${Y(r).toFixed(1)}`;
        }
        h += `<path d="${p}" fill="none" stroke="${C.grey}" stroke-width="1.3"/>`;
        h += `<circle cx="${X(s.T).toFixed(1)}" cy="${Y(s.rpm).toFixed(1)}" r="3.1" fill="${C.red}"/>`;
        h += `<text x="${cx0 + 3}" y="${cy0 - 3}" font-size="6.4" letter-spacing="1" fill="${C.mute}">FAN CURVE · RPM AGAINST DIE °C</text>`;
        h += `<text x="${cx0 + cw}" y="${cy0 + ch + 9}" font-size="6.4" text-anchor="end" fill="${C.mute}">100 °C</text>`;
        h += `<text x="${cx0}" y="${cy0 + ch + 9}" font-size="6.4" fill="${C.mute}">30 °C</text>`;
        pathSvg.innerHTML = h;
      }
      pathEq.textContent = `T = 25 + P · (Rjc + Rhp + Rsa)`;
      pathEq2.innerHTML = `Rsa <b style="color:${C.ink}">${f1(s.Rsa)}</b> K/W at <b style="color:${C.ink}">${f1(s.q)}</b> CFM · fan <b style="color:${C.ink}">${Math.round(s.rpm)}</b> rpm`;

      // ---------------------------------------------------- power
      const rows = [
        ['PACKAGE', `${f1(s.P)} W`, s.P > TH.PL1 + 0.5 ? C.red : C.ink],
        ['SYSTEM', `${f1(s.sysW)} W`, C.ink],
        ['PACK CURRENT', `${f1(s.amps)} A`, C.ink],
        ['BOOST BUDGET', `${Math.round(s.boost)} s`, s.boost < 4 ? C.red : C.ink],
        ['RUNTIME LEFT', `${Math.floor(s.runtime)} h ${Math.round((s.runtime % 1) * 60)} min`, C.ink],
      ];
      powRows.innerHTML = rows
        .map(([k, v, col]) => `<div class="cp" style="height:17.4px;display:flex;align-items:center;justify-content:space-between;font-weight:500;color:${C.mute}"><span>${k}</span><b style="color:${col};font-weight:700">${v}</b></div>`)
        .join('');
      socFill.style.width = `${(s.soc * 243).toFixed(1)}px`;
      socTxt.innerHTML = `CHARGE <b style="color:${C.ink}">${Math.round(s.soc * 100)}</b> % &nbsp;·&nbsp; ${f1(s.soc * BAT.wh)} OF ${BAT.wh} Wh`;

      // ---------------------------------------------------- controls
      btn.pause.innerHTML = s.paused ? '▶ &nbsp;RUN' : '❚❚ &nbsp;PAUSE';
      btn.spin.style.background = s.spin ? C.ink : '#fff';
      btn.spin.style.color = s.spin ? '#fff' : C.ink;
      btn.spin.style.borderColor = s.spin ? C.ink : C.line;
      sliders.load.val.innerHTML = `${Math.round(s.load * 100)} %`;
      sliders.load.knob.style.left = `${knobX(s.load).toFixed(1)}px`;
      sliders.explode.val.innerHTML = `${Math.round(s.explode * 100)} %`;
      sliders.explode.knob.style.left = `${knobX(s.explode).toFixed(1)}px`;
      sliders.lid.val.innerHTML = `${Math.round(s.lid)}°`;
      sliders.lid.knob.style.left = `${knobX(s.lid / 135).toFixed(1)}px`;
      cutRow.innerHTML = s.mode === 'section'
        ? `<span style="color:${C.ink}">CUT PLANE</span> &nbsp; x = <b style="color:${C.ink}">${Math.round(s.cut)}</b> mm`
        : `CUT PLANE &nbsp;— &nbsp;PICK SECTION TO USE IT`;
      cutKnob.style.left = `${knobX((s.cut + 148) / 296).toFixed(1)}px`;
      cutKnob.style.opacity = s.mode === 'section' ? '1' : '.3';

      // ---------------------------------------------------- the selected part
      const p = s.sel ? PARTS.find((x) => x.id === s.sel) : null;
      selTag.textContent = p ? 'SELECTED PART' : 'NO PART SELECTED';
      selQty.innerHTML = p ? `${p.qty > 1 ? `${p.qty} ×` : '1 ×'} &nbsp; ${p.mass} g EACH` : '';
      selName.textContent = p ? p.name : 'Pick a part';
      selThai.textContent = p ? p.th : 'แตะชื่อชิ้นส่วนด้านล่าง หรือคลิกที่ตัวเครื่องเลย';
      selSpec.innerHTML = p
        ? p.spec
            .map(([k, v]) => `<div class="cp" style="min-height:17px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;font-weight:500;color:${C.mute}"><span>${k}</span><b style="color:${C.ink};font-weight:600;text-align:right;white-space:normal;letter-spacing:.4px;text-transform:none;font-size:10.4px">${v}</b></div>`)
            .join('')
        : `<div class="cp mu" style="font-weight:500;line-height:1.9">ISOLATE SHOWS IT ALONE<br>TEARDOWN LIFTS IT OUT<br>X-RAY OPENS THE SHELLS</div>`;
      const specH = selSpec.offsetHeight || 80;
      selRule.style.top = `${124 + specH + 10}px`;
      selDesc.style.top = `${124 + specH + 19}px`;
      selDesc.textContent = p ? p.desc : 'หน้านี้ใช้โน้ตบุ๊กขนาด 13.5 นิ้วเครื่องหนึ่งเป็นตัวอย่าง ทุกตัวเลขบนหน้าปัดคำนวณจากแบบจำลองความร้อนชุดเดียวกับที่ทำให้พัดลมหมุน';

      // ---------------------------------------------------- the chart
      {
        const W = 249;
        const H = 100;
        const n = s.hist.length;
        const X = (i) => 14 + (i / Math.max(1, s.hist.length - 1)) * (W - 22);
        const YT = (v) => H - 14 - ((v - 20) / 90) * (H - 28);
        const YR = (v) => H - 14 - (v / TH.fan.max) * (H - 28);
        let h = `<line x1="14" x2="${W - 8}" y1="${H - 14}" y2="${H - 14}" stroke="${C.ink}" stroke-width=".8"/>`;
        for (const v of [40, 60, 80, 100]) h += `<line x1="14" x2="${W - 8}" y1="${YT(v).toFixed(1)}" y2="${YT(v).toFixed(1)}" stroke="${C.line}" stroke-width=".7"/><text x="11" y="${(YT(v) + 2).toFixed(1)}" font-size="6.2" text-anchor="end" fill="${C.mute}">${v}</text>`;
        h += `<line x1="14" x2="${W - 8}" y1="${YT(TH.Tmax).toFixed(1)}" y2="${YT(TH.Tmax).toFixed(1)}" stroke="${C.red}" stroke-width=".7" stroke-dasharray="3 2"/>`;
        if (n > 1) {
          let pt = '';
          let pr = '';
          s.hist.forEach((d, i) => {
            pt += `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${YT(d.T).toFixed(1)}`;
            pr += `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${YR(d.rpm).toFixed(1)}`;
          });
          h += `<path d="${pr}" fill="none" stroke="${C.blue}" stroke-width="1.2" opacity=".85"/>`;
          h += `<path d="${pt}" fill="none" stroke="${C.red}" stroke-width="1.6"/>`;
          h += `<circle cx="${X(n - 1).toFixed(1)}" cy="${YT(s.hist[n - 1].T).toFixed(1)}" r="2.6" fill="${C.red}"/>`;
        }
        h += `<text x="${W - 8}" y="${H - 4}" font-size="6.2" text-anchor="end" fill="${C.mute}">NOW</text>`;
        h += `<text x="14" y="${H - 4}" font-size="6.2" fill="${C.mute}">−45 s</text>`;
        chart.innerHTML = h;
        chartLeg.innerHTML = `<span style="color:${C.red}">—</span> DIE <b>${Math.round(s.T)}</b>°C &nbsp;&nbsp; <span style="color:${C.blue}">—</span> FAN <b>${Math.round(s.rpm)}</b> RPM`;
      }

      // ---------------------------------------------------- the stack
      stack.innerHTML = LAYERS.map((l, i) => {
        const on = s.explode > 0.04 && l.lift > 0;
        const cur = p && PARTS.find((x) => x.id === p.id)?.layer === l.id;
        return `<div style="height:17.2px;display:flex;align-items:center;gap:8px">
          <b class="cp" style="width:13px;color:${cur ? C.red : C.faint};font-weight:700">${i + 1}</b>
          <i style="display:block;width:${(on ? 10 + (l.lift / 140) * 26 : 8).toFixed(0)}px;height:2px;background:${cur ? C.red : on ? C.ink : C.line};transition:width .25s"></i>
          <span class="cp" style="font-weight:${cur ? 700 : 500};color:${cur ? C.ink : on ? C.ink : C.mute}">${l.name}</span>
          <span class="th" style="margin-left:auto;font-size:10px;color:${C.mute};max-width:106px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.th}</span>
        </div>`;
      }).join('');

      // ---------------------------------------------------- toggles and chips
      for (const k of CAMS) {
        const on = s.cam === k;
        btn[k].style.background = on ? C.ink : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.ink : C.line;
      }
      for (const k of MODES) {
        const on = s.mode === k;
        btn[k].style.background = on ? C.ink : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.ink : C.line;
      }
      for (const k of OVERLAYS) {
        const on = !!s.overlays[k];
        btn[k].style.background = on ? C.red : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.red : C.line;
      }
      for (const q of PARTS) {
        const c = chips[q.id].node;
        const on = s.sel === q.id;
        c.style.background = on ? C.red : '#fff';
        c.style.color = on ? '#fff' : C.ink;
        c.style.borderColor = on ? C.red : C.line;
        c.firstElementChild.style.background = on ? '#fff' : C.faint;
      }
      for (const n of ui.querySelectorAll('[data-g="charts"]')) n.style.visibility = s.overlays.charts ? '' : 'hidden';

      // ---------------------------------------------------- callouts
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const end = c.flip ? lx : lx + c.w;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${(c.flip ? lx + c.w : lx).toFixed(1)},${(ly + 16).toFixed(1)} ${end.toFixed(1)},${(ly + 16).toFixed(1)}" fill="none" stroke="${c.hot ? C.red : C.mute}" stroke-width=".9" opacity="${c.o.toFixed(2)}"/>`;
        lh += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.2" fill="${c.hot ? C.red : C.mute}" opacity="${c.o.toFixed(2)}"/>`;
        ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 10).toFixed(1)}px;opacity:${c.o.toFixed(2)};text-align:${c.flip ? 'right' : 'left'};width:${c.w}px"><b style="${c.hot ? `color:${C.red}` : ''}">${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
  };
}
