// The camera presets and the tour the page plays when nobody is touching it: a list of operator moves, and a cursor
// that travels to the control it is about to press. Any click, drag, wheel or key hands control to the visitor.
import {DIM} from './model.js';

// target in metres, azimuth and elevation in degrees (azimuth measured from +z toward +x), distance in metres
const V = (tx, ty, tz, az, el, d, sx = 0, sy = 0) => ({tx, ty, tz, az, el, d, sx, sy});

export const VIEW_FN = {
  hero: (s) => V(0, 0.072, -0.016, 36 + s * 0.55, 25, 0.96, 0, -46),
  top: (s) => V(0, 0.012, -0.052, 0.2 + s * 0.3, 84, 0.92, 0, -46),
  front: (s) => V(0, 0.084, 0.004, 0 + s * 0.25, 9, 0.80, 0, -46),
  side: (s) => V(0.004, 0.072, -0.030, 86 - s * 0.3, 14, 0.78, 0, -40),
  under: (s) => V(0, 0.004, -0.004, 22 + s * 0.5, -54, 0.88, 0, -30),
  lid: (s) => V(0.100, 0.015, -0.104, 144 + s * 0.8, 29, 0.255, 0, -28),
  macro: (s) => V(-0.020, 0.008, -0.062, 24 + s * 1.1, 33, 0.20, 0, -30),
};
export const CAM_KEYS = Object.keys(VIEW_FN);

/** The moves, in seconds. cam / mode / sel / load / ov are what the operator sets; spot is what they click. */
export const SCRIPT = [
  {t: 0, cam: 'hero', mode: 'open', load: 0.08, sel: null},
  {t: 4.5, cam: 'front', mode: 'closed', spot: 'btn:closed'},
  {t: 8.0, cam: 'under', spot: 'btn:under'},
  {t: 12.0, mode: 'open', cam: 'hero', spot: 'btn:open'},
  {t: 15.5, load: 0.96, spot: 'knob:load:0.96'},
  {t: 19.5, cam: 'top', spot: 'btn:top'},
  {t: 23.0, sel: 'keys', spot: 'chip:keys'},
  {t: 27.5, sel: 'touchpad', spot: 'chip:touchpad'},
  {t: 32.0, mode: 'xray', sel: null, spot: 'btn:xray'},
  {t: 36.0, sel: 'battery', spot: 'chip:battery'},
  {t: 41.0, mode: 'explode', cam: 'hero', sel: null, spot: 'btn:explode'},
  {t: 48.0, sel: 'fan', spot: 'chip:fan'},
  {t: 53.0, sel: 'heatpipe', spot: 'chip:heatpipe'},
  {t: 58.0, cam: 'macro', sel: 'soc', spot: 'btn:macro'},
  {t: 63.5, mode: 'section', cam: 'side', sel: null, spot: 'btn:section'},
  {t: 69.0, sel: 'ram', spot: 'chip:ram'},
  {t: 74.0, mode: 'open', cam: 'hero', sel: null, load: 0.12, spot: 'btn:open'},
];
export const DURATION = 80;

const last = (t, key) => {
  let v = SCRIPT[0][key];
  for (const e of SCRIPT) {
    if (e.t > t) break;
    if (key in e) v = e[key];
  }
  return v;
};
export const camName = (t) => last(t, 'cam') || 'hero';
export const modeAt = (t) => last(t, 'mode') || 'open';
export const loadAt = (t) => {
  const v = last(t, 'load');
  return v === undefined ? 0.1 : v;
};
export const selAt = (t) => last(t, 'sel') ?? null;
/** When the current camera move started, so the drift in VIEW_FN runs from there. */
export const sinceCam = (t) => {
  let t0 = 0;
  for (const e of SCRIPT) {
    if (e.t > t) break;
    if (e.cam) t0 = e.t;
  }
  return t - t0;
};
export const camAt = (t) => VIEW_FN[camName(t)](sinceCam(t));

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoother = (x) => {
  const u = clamp01(x);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

/**
 * The operator's cursor. It leaves the previous control, arrives on the next one 0.3 s before the move lands,
 * presses, and a ring spreads from where it pressed.
 */
export function makeCursor(ui) {
  const resolve = (spot) => {
    const [kind, a, b] = spot.split(':');
    if (kind === 'btn') return ui.spots[a];
    if (kind === 'chip') return ui.chipSpot(a);
    if (kind === 'knob') return ui.knobAt(a)(Number(b));
    return [800, 450];
  };
  const stops = SCRIPT.filter((e) => e.spot).map((e) => ({t: e.t, spot: e.spot}));
  const park = [820, 470];
  return (t) => {
    let prev = {t: -6, spot: null};
    let next = null;
    for (const s of stops) {
      if (s.t <= t) prev = s;
      else {
        next = s;
        break;
      }
    }
    const pp = prev.spot ? resolve(prev.spot) : park;
    let x;
    let y;
    if (!next) {
      x = pp[0];
      y = pp[1];
    } else {
      const np = resolve(next.spot);
      const travel = Math.min(2.0, (next.t - prev.t) * 0.55);
      const t0 = next.t - 0.3 - travel;
      const k = smoother((t - t0) / travel);
      x = pp[0] + (np[0] - pp[0]) * k;
      y = pp[1] + (np[1] - pp[1]) * k;
    }
    const dt = t - prev.t;
    const press = dt > -0.04 && dt < 0.2;
    const ring = dt >= 0 && dt < 0.6 ? 1 - dt / 0.6 : 0;
    return {x, y, press, ring, ringX: pp[0], ringY: pp[1]};
  };
}

export const LID_OPEN = 112;
export const HINGE_MAX = DIM.hinge.maxDeg;
