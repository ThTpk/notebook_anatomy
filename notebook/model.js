// The notebook's numbers. No three.js in here: real dimensions in millimetres, one thermal/power model, and the
// part table. Every gauge, chart and label on the page reads from this file, so nothing on screen can disagree with
// what the geometry is doing.
//
// Reference machine: Framework Laptop 13 (13.5-inch 3:2). Published figures:
//   296.63 x 228.98 x 15.85 mm, 1.3 kg, 61 Wh battery (55 Wh on the first generation),
//   bottom cover on 5 captive T5 fasteners (the bottom-left one lifts the input cover),
//   battery on 3 captive fasteners, fan on 2, heatsink on 3 removed in the order 3-2-1,
//   2 memory sockets and 1 M.2 2280 slot whose modules rise to 20 degrees, magnetic input cover.
// Everything else below is the standard geometry of the parts themselves (SO-DIMM 69.6 x 30 mm, M.2 2280,
// M.2 2230, 18.7 mm key pitch, 13.5-inch 3:2 = 285.3 x 190.2 mm active area).

export const MM = 0.001;

// ---------------------------------------------------------------- the chassis
export const DIM = {
  W: 296.63, // width, x: -148.3 .. +148.3
  D: 228.98, // depth, z: -114.5 (rear) .. +114.5 (front)
  H: 15.85, // closed height
  wall: 1.3, // bottom cover wall thickness
  floor: 0.9, // bottom cover floor thickness
  baseH: 11.25, // bottom cover outer height
  coverT: 0.95, // input cover plate
  lidT: 4.6, // lid thickness (11.25 + 4.6 = 15.85)
  lidD: 209.2, // lid depth
  corner: 7.0, // corner radius
  panel: {w: 285.3, h: 190.2, diag: 342.9}, // 13.5-inch 3:2 active area
  hinge: {x: 100, r: 4.0, len: 34, maxDeg: 135},
};

// ---------------------------------------------------------------- the thermal model
// One lumped heatsink node (fins + heatpipe + base, 55 J/K) and a quasi-static die: the die sits above the sink by
// the heat it is passing through two fixed resistances, and the sink loses heat to the room through a resistance
// that falls as the fan moves more air. The whole fan curve, the throttle and the heat-soak lag come out of this.
export const TH = {
  amb: 25, // room, degC
  Rjc: 0.26, // die -> heatpipe base, K/W
  Rhp: 0.34, // heatpipe -> fin stack, K/W
  Chs: 55, // heatsink thermal mass, J/K
  Tmax: 95, // throttle target, degC
  PL1: 28, // sustained package power, W
  PL2: 60, // boost package power, W
  tau: 28, // boost window, s
  idle: 2.4, // package power at rest, W
  fan: {on: 49, full: 92, min: 1350, max: 5500, dia: 65},
};

/** Fan PWM curve: silent below 49 degC, then a straight ramp to 5500 rpm at 92. */
export const fanRpm = (T) => {
  if (T < TH.fan.on) return 0;
  const k = Math.min(1, (T - TH.fan.on) / (TH.fan.full - TH.fan.on));
  return TH.fan.min + k * (TH.fan.max - TH.fan.min);
};
/** A 65 mm blower: 4.2 CFM at free air and full speed, falling off with the square of speed near stall. */
export const cfm = (rpm) => 4.2 * Math.pow(Math.max(0, rpm) / TH.fan.max, 1.15);
/** Fin stack to room. Still air is a blanket; moving air is most of the cooling. */
export const Rsa = (q) => 1.35 + 3.9 / (1 + Math.pow(q / 0.9, 1.1));
/**
 * Air leaving the vent, degC. The fin stack hands (Ths - amb) / Rsa watts to a stream carrying kgs * 1005 W/K, so
 * the rise of the air follows from the same resistance that sets the fin temperature; it can never pass the metal.
 */
export const ventTemp = (Ths, q) => {
  const kgs = q * 0.000566 * 1.16; // CFM -> m3/s -> kg/s at 1.16 kg/m3
  if (kgs < 1e-5) return TH.amb + (Ths - TH.amb) * 0.5;
  const rise = (Ths - TH.amb) / (Rsa(q) * kgs * 1005);
  return TH.amb + Math.min(rise, (Ths - TH.amb) * 0.92);
};

/** What the silicon asks for: idle, then the boost ceiling while the budget lasts, then the sustained ceiling. */
export const demand = (load, boostLeft) => {
  const ceiling = boostLeft > 0 ? TH.PL2 : TH.PL1;
  return TH.idle + load * (ceiling - TH.idle);
};

/**
 * One step of the machine. s = {Ths, T, rpm, boost, fanTh, P}, load 0..1, dt seconds.
 * Mutates and returns s: the sink integrates, the die follows it, the fan chases its curve with a 0.9 s lag, the
 * boost budget drains while the package is over PL1 and refills when it is under.
 */
export function step(s, load, dt) {
  const q = cfm(s.rpm);
  const Pwant = demand(load, s.boost);
  // the package is cut back so the die holds at Tmax: the sink is already this hot, the die may only add so much
  const headroom = Math.max(0, (TH.Tmax - s.Ths) / (TH.Rjc + TH.Rhp));
  const P = Math.max(TH.idle * 0.6, Math.min(Pwant, headroom));
  s.P = P;
  s.throttled = Pwant - P > 0.6;
  s.boost = Math.max(0, Math.min(TH.tau, s.boost + (P > TH.PL1 + 0.5 ? -dt : dt * 0.42)));
  // the sink: heat in, heat out through Rsa
  const out = (s.Ths - TH.amb) / Rsa(q);
  s.Ths += ((P - out) / TH.Chs) * dt;
  s.Ths = Math.max(TH.amb, s.Ths);
  // the die: a short lag onto the sink temperature plus its own drop
  const Tdie = s.Ths + P * (TH.Rjc + TH.Rhp);
  s.T += (Tdie - s.T) * (1 - Math.exp(-dt / 0.55));
  // the fan
  const want = fanRpm(s.T);
  s.rpm += (want - s.rpm) * (1 - Math.exp(-dt / 0.9));
  if (s.rpm < 40) s.rpm = want < 40 ? 0 : s.rpm;
  s.fanTh = (s.fanTh + (s.rpm / 60) * 360 * dt) % 360;
  s.q = cfm(s.rpm);
  s.Tvent = ventTemp(s.Ths, s.q);
  s.Rsa = Rsa(s.q);
  return s;
}

export const freshState = () => ({Ths: TH.amb, T: TH.amb + 4, rpm: 0, boost: TH.tau, fanTh: 0, P: TH.idle, q: 0, Tvent: TH.amb, Rsa: Rsa(0), throttled: false});

// ---------------------------------------------------------------- power and battery
export const BAT = {wh: 61, v: 11.55, cells: 3, ah: 61 / 11.55};
/** Everything the pack is carrying, W: package through the VRM, plus panel, board, SSD and fan. */
export const sysPower = (P, rpm, lid) => P / 0.88 + (lid > 4 ? 2.6 : 0.2) + 1.9 + 0.55 + (rpm / TH.fan.max) * 0.85;
export const packCurrent = (W) => W / BAT.v;
export const runtimeH = (soc, W) => (soc * BAT.wh) / Math.max(1.5, W);

// ---------------------------------------------------------------- the keyboard
// 18.7 mm pitch, 1.5 mm travel. Row widths in units; a laptop function row is shorter than the rest.
export const KB = {pitch: 18.7, cap: 15.6, travel: 1.5, gap: 1.6};
export const KB_ROWS = [
  {h: 0.62, keys: [['esc', 1], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1], ['F5', 1], ['F6', 1], ['F7', 1], ['F8', 1], ['F9', 1], ['F10', 1], ['F11', 1], ['F12', 1], ['del', 1]]},
  {h: 1, keys: [['~', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['⌫', 1]]},
  {h: 1, keys: [['tab', 1.4], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 0.6]]},
  {h: 1, keys: [['caps', 1.7], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['enter', 1.3]]},
  {h: 1, keys: [['shift', 2.2], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['shift', 1.8]]},
  {h: 1, keys: [['ctrl', 1.2], ['fn', 1], ['⊞', 1], ['alt', 1], ['', 5.6], ['alt', 1], ['◂', 1], ['▴▾', 1], ['▸', 1], ['ctrl', 1]]},
];
/** Keycap centres and sizes in mm, laid out from the row table. Deck is centred on x = 0. */
export function keyLayout() {
  const out = [];
  const rows = KB_ROWS.length;
  KB_ROWS.forEach((row, r) => {
    const units = row.keys.reduce((a, k) => a + k[1], 0);
    const w = units * KB.pitch;
    let x = -w / 2;
    const z = KB.z0 + r * KB.pitch;
    for (const [label, u] of row.keys) {
      const kw = u * KB.pitch - KB.gap;
      const kh = row.h * KB.pitch - KB.gap;
      out.push({label, x: x + (u * KB.pitch) / 2, z, w: kw, d: kh, row: r});
      x += u * KB.pitch;
    }
  });
  return out;
}
KB.z0 = -88.65; // the rear row's centre; the rows run forward from here
KB.deck = {w: 14 * KB.pitch, d: 6 * KB.pitch};

// ---------------------------------------------------------------- the part table
// layer = teardown order, the order the real guides take things out in. ex = where the part goes at full explode
// (mm, the page's own axes). at = the point a callout leader lands on. Thai lines are what the page explains with.
export const LAYERS = [
  {id: 'shell', name: 'BOTTOM COVER', th: 'ฝาล่าง', lift: 0},
  {id: 'input', name: 'INPUT COVER', th: 'ฝาแป้นพิมพ์', lift: 62},
  {id: 'power', name: 'BATTERY', th: 'แบตเตอรี่', lift: 40},
  {id: 'modules', name: 'MEMORY & STORAGE', th: 'หน่วยความจำ', lift: 86},
  {id: 'cooling', name: 'COOLING', th: 'ระบบระบายความร้อน', lift: 112},
  {id: 'board', name: 'MAINBOARD', th: 'เมนบอร์ด', lift: 18},
  {id: 'io', name: 'I/O & AUDIO', th: 'พอร์ตและเสียง', lift: 140},
  {id: 'display', name: 'DISPLAY', th: 'จอแสดงผล', lift: 0},
];
export const LAYER_I = Object.fromEntries(LAYERS.map((l, i) => [l.id, i]));

const P = (o) => o;
export const PARTS = [
  P({
    id: 'cover', layer: 'shell', name: 'Bottom cover', th: 'ฝาล่าง (โครงล่าง)', qty: 1, mass: 148,
    at: [-120, 2, 88], ex: [0, 0, 0],
    spec: [['MATERIAL', 'Aluminium, 1.3 mm'], ['FASTENERS', '5 x captive T5'], ['OPENS', 'Hand driver, no heat, no glue']],
    desc: 'โครงอะลูมิเนียมที่รับน้ำหนักทุกชิ้นด้านใน ขันด้วยสกรู T5 ห้าตัวที่ยึดติดกับฝาไม่หลุดหาย ตัวซ้ายล่างทำหน้าที่ดันฝาแป้นพิมพ์ให้ยกขึ้นด้วย',
  }),
  P({
    id: 'feet', layer: 'shell', name: 'Rubber feet', th: 'ยางรองเครื่อง', qty: 2, mass: 4,
    at: [0, -1, 100], ex: [0, -40, 0],
    spec: [['TYPE', 'Moulded strip, 1.1 mm'], ['JOB', 'Air gap under the intake']],
    desc: 'ยางสองเส้นยกเครื่องขึ้นจากโต๊ะประมาณ 1 มม. ช่องนี้คือทางเข้าของอากาศทั้งหมดที่พัดลมใช้ วางเครื่องบนที่นอนแล้วร้อนก็เพราะปิดช่องนี้',
  }),
  P({
    id: 'inputcover', layer: 'input', name: 'Input cover', th: 'ฝาแป้นพิมพ์', qty: 1, mass: 96,
    at: [-100, 12, -96], ex: [0, 124, 0],
    spec: [['HELD BY', 'Magnets + the 5 bottom screws'], ['CARRIES', 'Keyboard, touchpad, fingerprint reader'], ['CABLE', '1 x touchpad FPC, latched']],
    desc: 'แผ่นเดียวที่รวมแป้นพิมพ์ ทัชแพด และตัวอ่านลายนิ้วมือไว้ด้วยกัน ยึดด้วยแม่เหล็กจึงถอดออกมาทั้งแผ่นได้ แล้วด้านในทั้งเครื่องก็เปิดโล่ง',
  }),
  P({
    id: 'keys', layer: 'input', name: 'Keyboard', th: 'แป้นพิมพ์', qty: 1, mass: 62,
    at: [-60, 12, -42], ex: [0, 124, 0],
    spec: [['MECHANISM', 'Scissor, 1.5 mm travel'], ['PITCH', '18.7 mm'], ['KEYS', '79'], ['BACKLIGHT', 'White LED, 3 levels']],
    desc: 'ใต้คีย์แคปแต่ละตัวมีกรรไกรพลาสติกสองชิ้นกับยางโดมที่ดันปุ่มกลับขึ้น กดลงลึก 1.5 มม. แล้วแผ่นวงจรใต้ยางจะแตะกันจนเกิดสัญญาณ',
  }),
  P({
    id: 'touchpad', layer: 'input', name: 'Touchpad', th: 'ทัชแพด', qty: 1, mass: 34,
    at: [0, 12, 62], ex: [0, 124, 0],
    spec: [['SIZE', '115 x 78 mm glass'], ['SENSING', 'Projected capacitance grid'], ['CLICK', 'Hinged plate, dome switch']],
    desc: 'กระจกบางวางบนตารางตัวนำ นิ้วที่แตะทำให้ความจุไฟฟ้าของจุดตัดนั้นเปลี่ยน ชิปจะอ่านทั้งตารางหลายร้อยครั้งต่อวินาทีแล้วคำนวณเป็นตำแหน่งนิ้ว',
  }),
  P({
    id: 'battery', layer: 'power', name: 'Battery', th: 'แบตเตอรี่', qty: 1, mass: 232,
    at: [0, 5, 70], ex: [0, 66, 54],
    spec: [['CAPACITY', '61 Wh (55 Wh gen 1)'], ['PACK', '3S Li-ion pouch, 11.55 V'], ['CHARGE', '5.28 Ah'], ['FASTENERS', '3 x captive']],
    desc: 'ถุงลิเทียมสามถุงต่ออนุกรมได้ 11.55 โวลต์ กินพื้นที่หน้าเครื่องเกือบทั้งแถบเพราะเป็นชิ้นที่หนักและใหญ่ที่สุด ถอดได้ด้วยสกรูสามตัวกับขั้วต่อหนึ่งจุด',
  }),
  P({
    id: 'ram', layer: 'modules', name: 'Memory', th: 'แรม (หน่วยความจำหลัก)', qty: 2, mass: 22,
    at: [-60, 10, -42], ex: [-34, 178, 22],
    spec: [['FORM', 'SO-DIMM, 69.6 x 30 mm'], ['SOCKETS', '2, stacked'], ['INSERT', 'Clip at 20 degrees, press flat'], ['NOTE', 'Channel 0 is the right socket']],
    desc: 'ที่พักงานของซีพียู ข้อมูลที่กำลังใช้อยู่ทั้งหมดอยู่ที่นี่ และหายทันทีเมื่อไฟดับ เสียบเอียง 20 องศาแล้วกดลงให้คลิปล็อก',
  }),
  P({
    id: 'ssd', layer: 'modules', name: 'SSD', th: 'เอสเอสดี (ที่เก็บข้อมูล)', qty: 1, mass: 8,
    at: [-5, 7, -58], ex: [26, 178, 30],
    spec: [['FORM', 'M.2 2280, 22 x 80 mm'], ['BUS', 'PCIe 4.0 x4, NVMe'], ['FASTENER', '1 x T5'], ['HOLDS', 'Data with the power off']],
    desc: 'ชิปหน่วยความจำแฟลชที่เก็บข้อมูลไว้ได้แม้ไม่มีไฟ ต่อตรงเข้าเลน PCIe สี่เลนของซีพียู จึงอ่านเขียนได้เร็วกว่าฮาร์ดดิสก์จานหมุนหลายสิบเท่า',
  }),
  P({
    id: 'wifi', layer: 'modules', name: 'Wi-Fi module', th: 'การ์ด Wi-Fi', qty: 1, mass: 3,
    at: [-114, 7, -80], ex: [-58, 178, -14],
    spec: [['FORM', 'M.2 2230, 22 x 30 mm'], ['RADIO', 'Wi-Fi 6E + Bluetooth'], ['ANTENNAS', '2 x coax up the hinge']],
    desc: 'การ์ดวิทยุขนาดเล็กที่สุดในเครื่อง สายอากาศสองเส้นเดินขึ้นไปซ่อนในขอบจอ เพราะตัวเครื่องเป็นอะลูมิเนียมที่กันคลื่น',
  }),
  P({
    id: 'fan', layer: 'cooling', name: 'Blower fan', th: 'พัดลม', qty: 1, mass: 26,
    at: [56, 8, -68], ex: [26, 246, 10],
    spec: [['TYPE', 'Centrifugal blower, 65 mm'], ['SPEED', '0 - 5500 rpm'], ['FLOW', '4.2 CFM at full speed'], ['FASTENERS', '2 x T5']],
    desc: 'ดูดอากาศเข้าทางช่องบนและล่างแล้วเหวี่ยงออกด้านข้างด้วยแรงเหวี่ยง ใบพัดวางไม่เท่ากันเพื่อไม่ให้เสียงรวมเป็นโทนเดียว',
  }),
  P({
    id: 'heatpipe', layer: 'cooling', name: 'Heatpipe', th: 'ฮีตไปป์ (ท่อนำความร้อน)', qty: 1, mass: 18,
    at: [52, 10, -98], ex: [-16, 246, -26],
    spec: [['SECTION', 'Flattened copper, 8 x 2.6 mm'], ['INSIDE', 'Wick + water, near vacuum'], ['CARRIES', 'Up to 28 W'], ['R', '0.34 K/W']],
    desc: 'ท่อทองแดงแบนที่ข้างในเกือบเป็นสุญญากาศและมีน้ำอยู่น้อยมาก ปลายร้อนทำให้น้ำเดือดเป็นไอวิ่งไปปลายเย็น กลั่นตัวแล้วไหลกลับตามไส้ในท่อ จึงพาความร้อนได้ดีกว่าทองแดงแท่งหลายเท่า',
  }),
  P({
    id: 'fins', layer: 'cooling', name: 'Fin stack', th: 'ครีบระบายความร้อน', qty: 1, mass: 14,
    at: [111, 7, -70], ex: [46, 246, -8],
    spec: [['FINS', '42 x 0.12 mm copper'], ['PITCH', '1.0 mm'], ['AREA', 'About 0.06 m2'], ['R TO AIR', '1.35 - 5.25 K/W']],
    desc: 'จุดที่ความร้อนออกจากเครื่องจริง ๆ ครีบบางสี่สิบกว่าแผ่นเพิ่มพื้นที่สัมผัสอากาศ และค่าความต้านทานความร้อนของมันลดลงเกือบสี่เท่าเมื่อพัดลมเป่าผ่าน',
  }),
  P({
    id: 'board', layer: 'board', name: 'Mainboard', th: 'เมนบอร์ด', qty: 1, mass: 118,
    at: [-74, 6, -94], ex: [0, 34, -40],
    spec: [['SIZE', '270 x 92 mm, 10 layers'], ['CARRIES', 'SoC, VRM, PCIe, USB4'], ['SWAPPABLE', 'Fits every generation of the shell']],
    desc: 'แผ่นวงจรที่เชื่อมทุกชิ้นถึงกัน ทองแดงสิบชั้นซ้อนกันเป็นเส้นทางสัญญาณและไฟเลี้ยง เปลี่ยนแผ่นนี้แผ่นเดียวก็เท่ากับเปลี่ยนรุ่นเครื่องทั้งเครื่อง',
  }),
  P({
    id: 'soc', layer: 'board', name: 'Processor', th: 'ซีพียู (หน่วยประมวลผล)', qty: 1, mass: 9,
    at: [-20, 8, -62], ex: [0, 34, -40],
    spec: [['PACKAGE', 'BGA, 25 x 25 mm'], ['POWER', '2.4 W idle, 28 W sustained, 60 W boost'], ['R TO LID', '0.26 K/W'], ['ON DIE', 'CPU, GPU, memory controller, PCIe']],
    desc: 'ซิลิคอนแผ่นเดียวที่รวมซีพียู การ์ดจอ ตัวคุมแรมและ PCIe ไว้ด้วยกัน ความร้อนทุกวัตต์ที่เห็นบนหน้าปัดเกิดขึ้นที่นี่ แล้วเดินทางออกไปตามฮีตไปป์',
  }),
  P({
    id: 'vrm', layer: 'board', name: 'Power stage', th: 'วงจรจ่ายไฟ (VRM)', qty: 1, mass: 12,
    at: [-62, 7, -74], ex: [0, 34, -40],
    spec: [['JOB', '11.55 V pack -> 0.7 - 1.2 V core'], ['PHASES', 'Multi-phase buck'], ['EFFICIENCY', 'About 88 percent']],
    desc: 'ลดแรงดันจากแบตเตอรี่ลงมาเหลือไม่ถึงหนึ่งโวลต์แต่จ่ายกระแสได้หลายสิบแอมป์ ขดลวดกับตัวเก็บประจุแถวนี้คือตัวเก็บพลังงานสลับกันหลายเฟส',
  }),
  P({
    id: 'cmos', layer: 'board', name: 'RTC cell', th: 'ถ่านนาฬิกา', qty: 1, mass: 3,
    at: [-60, 7, -95], ex: [0, 34, -40],
    spec: [['CELL', 'Coin lithium, 3 V'], ['KEEPS', 'Clock and firmware settings']],
    desc: 'ถ่านเหรียญที่เลี้ยงนาฬิกากับค่าตั้งเฟิร์มแวร์เอาไว้ตอนถอดแบตออก เครื่องที่วันที่เพี้ยนทุกครั้งที่เปิดมักเป็นเพราะถ่านก้อนนี้หมด',
  }),
  P({
    id: 'cards', layer: 'io', name: 'Expansion cards', th: 'การ์ดพอร์ต', qty: 4, mass: 9,
    at: [147, 6, -86], ex: [0, 0, 0],
    spec: [['BAYS', '4, two per side'], ['EACH', 'USB-C to the board'], ['SWAP', 'By hand, powered on']],
    desc: 'ช่องเสียบสี่ช่องที่ข้างเครื่อง ด้านในเป็น USB-C ทั้งหมด เลือกได้ว่าจะให้ช่องไหนเป็น HDMI, USB-A, การ์ดอ่านหน่วยความจำ หรือ USB-C ตามงาน',
  }),
  P({
    id: 'speakers', layer: 'io', name: 'Speakers', th: 'ลำโพง', qty: 2, mass: 28,
    at: [-126, 5, 78], ex: [0, 112, 34],
    spec: [['DRIVERS', '2 x sealed box'], ['POWER', '2 W each'], ['FIRING', 'Down and out of the side']],
    desc: 'ลำโพงกล่องปิดสองตัวที่มุมหน้าเครื่อง ยิงเสียงลงพื้นแล้วสะท้อนขึ้นมา กล่องปิดเล็ก ๆ จึงให้เสียงทุ้มได้น้อยตามขนาดอากาศที่มีให้ดัน',
  }),
  P({
    id: 'audio', layer: 'io', name: 'Audio board', th: 'บอร์ดเสียง', qty: 1, mass: 6,
    at: [-138, 6, -8], ex: [-40, 112, 0],
    spec: [['CARRIES', '3.5 mm jack, codec, amp'], ['WHY SEPARATE', 'Keeps analogue away from the SoC']],
    desc: 'แยกออกมาเป็นบอร์ดเล็กเพื่อให้สัญญาณเสียงอะนาล็อกอยู่ห่างจากสัญญาณความถี่สูงบนเมนบอร์ด เสียงรบกวนจึงน้อยลง และหักหัวแจ็คแล้วเปลี่ยนแค่ชิ้นนี้',
  }),
  P({
    id: 'lid', layer: 'display', name: 'Display assembly', th: 'ชุดจอ', qty: 1, mass: 268,
    at: [0, 120, -60], ex: [0, 0, 0],
    spec: [['PANEL', '13.5-inch 3:2, 285.3 x 190.2 mm'], ['LAYERS', 'Backlight, LCD, glass'], ['HINGE', '0 - 135 degrees']],
    desc: 'ชุดจอทั้งฝา ด้านในเรียงเป็นชั้น ไฟ LED ที่ขอบส่องเข้าแผ่นกระจายแสง ผ่านชั้นผลึกเหลวที่บิดแสงเป็นภาพ แล้วออกมาที่กระจกหน้า',
  }),
  P({
    id: 'hinges', layer: 'display', name: 'Hinges', th: 'บานพับ', qty: 2, mass: 44,
    at: [100, 8, -110], ex: [0, 0, -56],
    spec: [['TRAVEL', '0 - 135 degrees'], ['TYPE', 'Friction, constant torque'], ['CABLES', 'Display + 2 antennas pass through']],
    desc: 'บานพับฝืดที่ต้องแน่นพอให้จอค้างอยู่กับที่ แต่เบาพอให้เปิดด้วยมือเดียว สายจอกับสายอากาศสองเส้นลอดผ่านรูข้างแกนนี้',
  }),
  P({
    id: 'webcam', layer: 'display', name: 'Camera module', th: 'กล้องและไมโครโฟน', qty: 1, mass: 4,
    at: [0, 196, -104], ex: [0, 0, 0],
    spec: [['SENSOR', '1080p, fixed focus'], ['MICS', '2, beam-formed'], ['SWITCHES', 'Hardware kill for both']],
    desc: 'กล้องกับไมค์สองตัวในแท่งเดียวที่ขอบบนจอ มีสวิตช์ตัดไฟทางฮาร์ดแวร์แยกของแต่ละตัว ปิดแล้วซอฟต์แวร์เรียกใช้ไม่ได้จริง ๆ',
  }),
];
export const PART = Object.fromEntries(PARTS.map((p) => [p.id, p]));
export const TOTAL_MASS = PARTS.reduce((a, p) => a + p.mass * p.qty, 0);

/** The signal path a part sits on, for the block diagram in the overlay. */
export const CHAIN = [
  {id: 'battery', label: 'PACK'},
  {id: 'vrm', label: 'VRM'},
  {id: 'soc', label: 'SoC'},
  {id: 'ram', label: 'RAM'},
  {id: 'ssd', label: 'SSD'},
  {id: 'lid', label: 'PANEL'},
];
