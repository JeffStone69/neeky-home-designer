// Off-grid / hybrid planning estimate. Not a CEC design.
//
// Daily load is the typed kWh, or the appliance list (watts × hours / 1000).
// An included EV charger adds evKw × evHours to that energy, and its kilowatts
// are a continuous load the inverter has to cover on their own.
//
// Array kW = daily kWh / (peak sun hours × (1 − losses)).
// Losses default to 20% for temperature, inverter, cabling, soiling, mismatch.
// Panel count is the required count, or fewer when the available area cannot
// fit that many modules. Expected kWh uses the panels that fit, × sun hours ×
// (1 − losses). The year is 365 of those days.
//
// Battery usable kWh = daily load × autonomy days.
// Nominal kWh = usable / depth of discharge. 0.80 is a LiFePO4 planning
// figure; lead-acid is nearer 0.50. A depth of discharge of 0 cannot be sized.
//
// Household peak kW is the daily household energy spread over 4 hours, and at
// least the largest appliance when the list is in use. The inverter is that
// peak, or the EV charger kilowatts, rounded up to 0.5 kW.
// Backup generator kVA = inverter kW × 1.25 / 0.8, rounded up to 0.5 kVA
// (25% headroom, 0.8 power factor).

// Sunshine Coast, Queensland, about 26.5°S (Belli Park).
// Bureau of Meteorology mean daily solar exposure along this coast is about
// 18 MJ/m², which is 5.0 kWh/m² on the horizontal (1 kWh/m² = 3.6 MJ/m²).
// A fixed array tilted near the latitude and facing north collects a similar
// amount over the year. 4.8 peak sun hours is that year-round planning figure.
// June is closer to 3 hours; autonomy and the generator cover the short months.
export const SUNSHINE_COAST_PSH = 4.8;

// Fixed tilt near |latitude| for Belli Park (about 26.5°S).
export const ARRAY_TILT = 27;

export const POWER_NOTE =
  "Planning estimate only. Have a licensed electrician / CEC-accredited designer confirm before purchase or install.";

export const EQUIP_KINDS = ["array", "battery", "inverter", "charger", "generator"];
export const MOUNTS = ["ground", "deck", "flat"];

export const EQUIP = {
  array: { w: 4, d: 2, h: 0.05, label: "Solar array" },
  battery: { w: 0.6, d: 0.4, h: 1.1, label: "Battery" },
  inverter: { w: 0.5, d: 0.22, h: 0.7, label: "Inverter" },
  charger: { w: 0.36, d: 0.18, h: 0.45, label: "EV charger" },
  generator: { w: 0.9, d: 0.55, h: 0.55, label: "Generator" },
};

export const TINY_HOME_APPLIANCES = [
  { name: "Fridge", watts: 80, hours: 24 },
  { name: "Lights", watts: 40, hours: 5 },
  { name: "Laptop", watts: 60, hours: 6 },
  { name: "Water pump", watts: 400, hours: 0.5 },
  { name: "Cooking", watts: 1200, hours: 0.4 },
];

const HOUSE_PEAK_HOURS = 4;
const GEN_HEADROOM = 1.25;
const GEN_PF = 0.8;

function finite(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function defaultPower() {
  return {
    configured: false,
    source: "typed",
    dailyKwh: 5,
    appliances: [],
    peakSunHours: SUNSHINE_COAST_PSH,
    autonomyDays: 2,
    losses: 0.2,
    panelW: 440,
    panelArea: 2,
    availableArea: 18,
    dod: 0.8,
    includeEv: false,
    evKw: 7,
    evHours: 2,
  };
}

export function normalizePower(raw) {
  const d = defaultPower();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const appliances = Array.isArray(raw.appliances)
    ? raw.appliances
        .filter((a) => a && typeof a === "object")
        .map((a) => ({
          name: String(a.name || "").slice(0, 32),
          watts: Math.max(0, finite(a.watts, 0)),
          hours: Math.max(0, finite(a.hours, 0)),
        }))
    : [];
  return {
    configured: raw.configured === true,
    source: raw.source === "appliances" ? "appliances" : "typed",
    dailyKwh: Math.max(0, finite(raw.dailyKwh, d.dailyKwh)),
    appliances,
    peakSunHours: Math.max(0, finite(raw.peakSunHours, d.peakSunHours)),
    autonomyDays: Math.max(0, finite(raw.autonomyDays, d.autonomyDays)),
    losses: Math.min(1, Math.max(0, finite(raw.losses, d.losses))),
    panelW: Math.max(0, finite(raw.panelW, d.panelW)),
    panelArea: Math.max(0, finite(raw.panelArea, d.panelArea)),
    availableArea: Math.max(0, finite(raw.availableArea, d.availableArea)),
    dod: Math.min(1, Math.max(0, finite(raw.dod, d.dod))),
    includeEv: raw.includeEv === true,
    evKw: Math.max(0, finite(raw.evKw, d.evKw)),
    evHours: Math.min(24, Math.max(0, finite(raw.evHours, d.evHours))),
  };
}

export function clonePower(power) {
  const p = normalizePower(power);
  return { ...p, appliances: p.appliances.map((a) => ({ ...a })) };
}

function roundUp(n, step) {
  if (!(n > 0)) return 0;
  return (Math.ceil(n / step - 1e-9) * step * 1000) / 1000;
}

function applianceKwh(list) {
  let sum = 0;
  for (const a of list || []) {
    sum += (Math.max(0, Number(a.watts) || 0) * Math.max(0, Number(a.hours) || 0)) / 1000;
  }
  return sum;
}

function maxApplianceKw(list) {
  let m = 0;
  for (const a of list || []) m = Math.max(m, Math.max(0, Number(a.watts) || 0) / 1000);
  return m;
}

export function sizePower(raw, opts = {}) {
  const p = normalizePower(raw);
  const houseKwh = p.source === "appliances" ? applianceKwh(p.appliances) : p.dailyKwh;
  const evKwh = p.includeEv ? p.evKw * p.evHours : 0;
  const dailyKwh = houseKwh + evKwh;
  const derate = p.losses >= 1 ? 0 : 1 - p.losses;
  const panelKw = p.panelW / 1000;
  let requiredKw = 0;
  let neededCount = 0;
  if (dailyKwh > 0) {
    if (!(p.peakSunHours > 0) || !(derate > 0) || !(panelKw > 0)) {
      requiredKw = Infinity;
      neededCount = null;
    } else {
      requiredKw = dailyKwh / (p.peakSunHours * derate);
      neededCount = Math.ceil(requiredKw / panelKw - 1e-9);
    }
  }
  const fitCount = p.panelArea > 0 ? Math.floor((p.availableArea + 1e-9) / p.panelArea) : 0;
  const roofFit =
    opts.roofFit == null || !Number.isFinite(Number(opts.roofFit))
      ? null
      : Math.max(0, Math.floor(Number(opts.roofFit) + 1e-9));
  const uncapped = neededCount == null ? 0 : Math.min(neededCount, Math.max(0, fitCount));
  const panelCount = roofFit == null ? uncapped : Math.min(uncapped, roofFit);
  const arrayKw = panelCount * panelKw;
  const expectedDailyKwh = arrayKw * p.peakSunHours * derate;
  const usableKwh = dailyKwh * p.autonomyDays;
  let nominalKwh = 0;
  if (usableKwh > 0) nominalKwh = p.dod > 0 ? usableKwh / p.dod : null;
  const housePeak = Math.max(houseKwh / HOUSE_PEAK_HOURS, p.source === "appliances" ? maxApplianceKw(p.appliances) : 0);
  const evPeak = p.includeEv ? p.evKw : 0;
  const inverterKw = roundUp(Math.max(housePeak, evPeak), 0.5);
  const generatorKva = roundUp((inverterKw * GEN_HEADROOM) / GEN_PF, 0.5);
  return {
    dailyKwh,
    houseKwh,
    evKwh,
    peakSunHours: p.peakSunHours,
    losses: p.losses,
    panelW: p.panelW,
    requiredKw,
    neededCount,
    fitCount,
    roofFit,
    roofCapped: roofFit != null && panelCount < uncapped,
    panelCount,
    arrayKw,
    expectedDailyKwh,
    expectedYearlyKwh: expectedDailyKwh * 365,
    autonomyDays: p.autonomyDays,
    usableKwh,
    dod: p.dod,
    nominalKwh,
    inverterKw,
    generatorKva,
    includeEv: p.includeEv,
    evKw: p.evKw,
    shortfall: dailyKwh > 0 && (neededCount == null || panelCount < neededCount),
  };
}

export function powerIsActive(power, equipment) {
  return !!(power?.configured || (equipment || []).length);
}

export function formatNum(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "-";
  const f = 10 ** digits;
  return (Math.round(Number(n) * f) / f).toFixed(digits);
}

export function powerStatusLine(power, equipment, opts) {
  if (!powerIsActive(power, equipment)) return "";
  const r = sizePower(power, opts);
  const battery = r.nominalKwh == null ? r.usableKwh : r.nominalKwh;
  return `solar ${formatNum(r.arrayKw)} kW · battery ${formatNum(battery)} kWh`;
}

export function powerInspectorText(power, opts) {
  const r = sizePower(power, opts);
  const nominal = r.nominalKwh == null ? "-" : `${formatNum(r.nominalKwh)} kWh`;
  return `${r.panelCount} panels · ${formatNum(r.arrayKw)} kW · ${formatNum(r.expectedDailyKwh)} kWh/day · battery ${formatNum(r.usableKwh)} / ${nominal} · inverter ${formatNum(r.inverterKw)} kW · generator ${formatNum(r.generatorKva)} kVA`;
}

export function wrapWords(text, max) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (`${cur} ${w}`.length <= max) cur = `${cur} ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function powerSheetLines(power, equipment, opts) {
  if (!powerIsActive(power, equipment)) return [];
  const r = sizePower(power, opts);
  const nominal = r.nominalKwh == null ? "-" : `${formatNum(r.nominalKwh)} kWh`;
  const lines = [
    "Power",
    `Daily load ${formatNum(r.dailyKwh)} kWh`,
    `Panels ${r.panelCount} x ${formatNum(r.panelW, 0)} W`,
    `Array ${formatNum(r.arrayKw)} kW`,
    `Expected ${formatNum(r.expectedDailyKwh)} kWh/day`,
    `Year ${formatNum(r.expectedYearlyKwh, 0)} kWh`,
    `Battery ${formatNum(r.usableKwh)} usable`,
    `Nominal ${nominal}`,
    `DoD ${formatNum(r.dod * 100, 0)}%`,
    `Inverter ${formatNum(r.inverterKw)} kW`,
    `Generator ${formatNum(r.generatorKva)} kVA`,
  ];
  if (r.roofFit != null) lines.push(`Roof fits ${r.roofFit} panels`);
  if (r.roofCapped) lines.push(`Roof caps the array at ${r.panelCount} of ${r.neededCount == null ? "-" : r.neededCount}`);
  else if (r.shortfall) lines.push(`Fits ${r.panelCount} of ${r.neededCount == null ? "-" : r.neededCount} panels`);
  lines.push(...wrapWords(POWER_NOTE, 40));
  return lines;
}

export function normalizeEquip(e) {
  const w = Number(e?.w) || 0;
  const d = Number(e?.d) || 0;
  return {
    ...e,
    x: w < 0 ? (Number(e.x) || 0) + w : Number(e.x) || 0,
    z: d < 0 ? (Number(e.z) || 0) + d : Number(e.z) || 0,
    w: Math.abs(w),
    d: Math.abs(d),
  };
}

export function equipmentCorners(eq) {
  const r = normalizeEquip(eq);
  return [
    [r.x, r.z],
    [r.x + r.w, r.z],
    [r.x + r.w, r.z + r.d],
    [r.x, r.z + r.d],
  ];
}

export function pointInEquipment(p, eq) {
  const c = equipmentCorners(eq);
  return p[0] >= c[0][0] - 1e-6 && p[0] <= c[2][0] + 1e-6 && p[1] >= c[0][1] - 1e-6 && p[1] <= c[2][1] + 1e-6;
}

export function cleanEquipment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = EQUIP_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!kind) return null;
  const spec = EQUIP[kind];
  const rect = normalizeEquip({
    x: finite(raw.x, 0),
    z: finite(raw.z, 0),
    w: finite(raw.w, spec.w),
    d: finite(raw.d, spec.d),
  });
  let azimuth = finite(raw.azimuth, 0);
  azimuth = ((azimuth % 360) + 360) % 360;
  return {
    kind,
    name: String(raw.name || spec.label).slice(0, 40),
    mount: MOUNTS.includes(raw.mount) ? raw.mount : "ground",
    x: rect.x,
    z: rect.z,
    w: rect.w,
    d: rect.d,
    tilt: Math.min(90, Math.max(0, finite(raw.tilt, kind === "array" ? ARRAY_TILT : 0))),
    azimuth,
  };
}
