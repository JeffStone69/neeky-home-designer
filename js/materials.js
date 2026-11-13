// Planning quantities from the walls, openings, and gross floor area already
// on the plan. Not a structural design.
//
// Studs stand on a 600 mm grid along each wall centreline, including a stud
// at each end, plus two jack studs for every door or window. Studs that fall
// inside an opening are still counted: the plan has no stud layout to omit
// them. Stud length is the wall height. Plate thickness is not on the plan,
// so it is not deducted.
//
// Each wall has one top plate and one bottom plate. A door cuts the bottom
// plate; a window does not. Pieces longer than the longest stock are joined.
// Each length is then cut from the standard stock that uses the least timber,
// and on a tie the fewer sticks.
//
// Lining is 2400 × 1200 sheet on both faces of an internal wall and on the
// inside face of an external wall. Cladding is the outside face, reported as
// area. Floor sheets cover the gross floor area (outside faces). Openings
// are cut out of lining and cladding. Wastage is applied before rounding up
// to a whole stud, plate piece, or sheet. Roof rafters, battens, and roofing
// sheets from js/roof.js use the same wastage.

import { WALL_HEIGHT } from "./constants.js";
import { closedFaces, grossFloorArea, pointInPoly, wallLen } from "./geom.js";
import { POWER_NOTE, formatNum, wrapWords } from "./power.js";
import { roofModel, roofOrderLines } from "./roof.js";

export const STUD_SPACING = 0.6;
export const SHEET_W = 1.2;
export const SHEET_H = 2.4;
export const STOCK_LENGTHS = [2.4, 3.0, 3.6, 4.2, 4.8, 5.4, 6.0];
export const DEFAULT_WASTAGE = 0.1;
export const MATERIALS_NOTE = POWER_NOTE;
export const MATERIALS_LIMIT =
  "Studs are the full wall height. No lintels, noggings, or deck.";

const SHEET_AREA = SHEET_W * SHEET_H;
const MAX_STOCK = STOCK_LENGTHS[STOCK_LENGTHS.length - 1];

export function defaultMaterials() {
  return { wastage: DEFAULT_WASTAGE };
}

export function normalizeMaterials(raw) {
  const d = defaultMaterials();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  return { wastage: normalizeWastage(raw.wastage) };
}

export function cloneMaterials(raw) {
  return normalizeMaterials(raw);
}

export function normalizeWastage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_WASTAGE;
  return Math.min(1, Math.max(0, n));
}

function roundMm(n) {
  return Math.round(n * 1000) / 1000;
}

function orderCount(count, wastage) {
  if (!(count > 0)) return 0;
  return Math.ceil(count * (1 + wastage) - 1e-9);
}

function sheetCount(area, wastage) {
  if (!(area > 0)) return 0;
  return Math.ceil((area * (1 + wastage)) / SHEET_AREA - 1e-9);
}

function splitToStock(length) {
  const parts = [];
  let left = roundMm(length);
  if (!(left > 0)) return parts;
  while (left > MAX_STOCK + 1e-9) {
    parts.push(MAX_STOCK);
    left = roundMm(left - MAX_STOCK);
  }
  if (left > 1e-6) parts.push(left);
  return parts;
}

function bestBuy(length, count) {
  let best = null;
  for (const stock of STOCK_LENGTHS) {
    if (stock + 1e-9 < length) continue;
    const per = Math.floor((stock + 1e-9) / length);
    if (per < 1) continue;
    const sticks = Math.ceil(count / per - 1e-9);
    const metres = sticks * stock;
    const cand = { length, count, stock, per, sticks, metres };
    const better =
      !best ||
      metres < best.metres - 1e-9 ||
      (Math.abs(metres - best.metres) < 1e-9 && sticks < best.sticks) ||
      (Math.abs(metres - best.metres) < 1e-9 && sticks === best.sticks && stock < best.stock);
    if (better) best = cand;
  }
  return best;
}

function interiorFaces(walls) {
  return closedFaces(walls).filter((face) => face.area > 1e-4);
}

function faceCounts(wall, interiors) {
  const len = wallLen(wall);
  if (!(len > 1e-6)) return { lining: 0, cladding: 0, length: 0 };
  const dx = (wall.b[0] - wall.a[0]) / len;
  const dz = (wall.b[1] - wall.a[1]) / len;
  const mx = (wall.a[0] + wall.b[0]) / 2;
  const mz = (wall.a[1] + wall.b[1]) / 2;
  const nx = -dz;
  const nz = dx;
  let lining = 0;
  let cladding = 0;
  for (const sign of [1, -1]) {
    const p = [mx + nx * 0.05 * sign, mz + nz * 0.05 * sign];
    const inside = interiors.some((face) => pointInPoly(p, face.points));
    if (inside) lining += 1;
    else cladding += 1;
  }
  return { lining, cladding, length: len };
}

function openingSpan(opening, length) {
  const width = Math.min(Math.max(Number(opening.width) || 0, 0), length);
  const height = Math.min(Math.max(Number(opening.height) || 0, 0), WALL_HEIGHT);
  if (!(width > 0.01)) return null;
  const centre = length * (Number(opening.t) || 0);
  return {
    width,
    height,
    a: Math.max(0, centre - width / 2),
    b: Math.min(length, centre + width / 2),
    door: opening.type === "door",
  };
}

function platePieces(length, doors) {
  const gaps = doors
    .map((d) => ({ a: d.a, b: d.b }))
    .filter((d) => d.b - d.a > 1e-6)
    .sort((p, q) => p.a - q.a);
  const merged = [];
  for (const gap of gaps) {
    const last = merged[merged.length - 1];
    if (!last || gap.a > last.b + 1e-6) merged.push({ ...gap });
    else last.b = Math.max(last.b, gap.b);
  }
  const pieces = [];
  let cursor = 0;
  for (const gap of merged) {
    if (gap.a - cursor > 1e-4) pieces.push(roundMm(gap.a - cursor));
    cursor = gap.b;
  }
  if (length - cursor > 1e-4) pieces.push(roundMm(length - cursor));
  return pieces;
}

function memberCuts(kind, length, count, wastage) {
  const grouped = new Map();
  if (!(count > 0) || !(length > 0)) return [];
  for (let i = 0; i < count; i++) {
    for (const part of splitToStock(length)) {
      const key = part.toFixed(3);
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }
  }
  const cuts = [];
  for (const [key, n] of grouped) {
    const order = orderCount(n, wastage);
    if (!(order > 0)) continue;
    const buy = bestBuy(Number(key), order);
    if (buy) cuts.push({ kind, ...buy });
  }
  cuts.sort((a, b) => b.length - a.length);
  return cuts;
}

function roofSection(plan, wastage) {
  const model = roofModel(plan?.walls, plan?.roof);
  if (!model) return { section: null, cuts: [] };
  return {
    section: {
      shape: model.shape,
      pitch: model.pitch,
      high: model.high,
      planes: model.planes,
      catchment: model.catchment,
      litres: model.litres,
      rainfall: model.rainfall,
      runoff: model.runoff,
      gutters: model.gutters,
      gutterLength: model.gutterLength,
      downpipes: model.downpipes,
      rafterLength: model.rafterLength,
      rafters: model.rafterCount,
      raftersOrder: orderCount(model.rafterCount, wastage),
      battenLength: model.battenLength,
      battens: model.battenCount,
      battensOrder: orderCount(model.battenCount, wastage),
      sheetLength: model.sheetLength,
      sheets: model.sheetCount,
      sheetsOrder: orderCount(model.sheetCount, wastage),
      ridgeLength: model.ridgeLength,
      flashingLength: model.flashingLength,
    },
    cuts: [
      ...memberCuts("rafter", model.rafterLength, model.rafterCount, wastage),
      ...memberCuts("batten", model.battenLength, model.battenCount, wastage),
    ],
  };
}

function wastageOf(plan, opts) {
  if (opts && opts.wastage != null) return normalizeWastage(opts.wastage);
  if (plan?.materials && plan.materials.wastage != null) return normalizeWastage(plan.materials.wastage);
  return DEFAULT_WASTAGE;
}

export function takeoff(plan, opts = {}) {
  const walls = plan?.walls || [];
  const openings = plan?.openings || [];
  const wastage = wastageOf(plan, opts);
  const interiors = walls.length ? interiorFaces(walls) : [];
  let studs = 0;
  let liningArea = 0;
  let claddingArea = 0;
  let plateMetres = 0;
  const plateLengths = [];

  for (const wall of walls) {
    const faces = faceCounts(wall, interiors);
    if (!(faces.length > 1e-6)) continue;
    const spans = [];
    for (const opening of openings) {
      if (!opening || opening.wallId !== wall.id) continue;
      const span = openingSpan(opening, faces.length);
      if (span) spans.push(span);
    }
    const bays = Math.ceil(faces.length / STUD_SPACING - 1e-9);
    studs += bays + 1 + spans.length * 2;
    let hole = 0;
    for (const span of spans) hole += span.width * span.height;
    const faceArea = Math.max(0, faces.length * WALL_HEIGHT - hole);
    liningArea += faces.lining * faceArea;
    claddingArea += faces.cladding * faceArea;
    const doors = spans.filter((span) => span.door);
    const bottom = platePieces(faces.length, doors);
    const top = platePieces(faces.length, []);
    for (const piece of [...top, ...bottom]) {
      plateMetres += piece;
      plateLengths.push(piece);
    }
  }

  const cuts = [];
  const studsOrder = orderCount(studs, wastage);
  if (studsOrder > 0) {
    const buy = bestBuy(WALL_HEIGHT, studsOrder);
    if (buy) cuts.push({ kind: "stud", ...buy });
  }
  const grouped = new Map();
  for (const piece of plateLengths) {
    for (const part of splitToStock(piece)) {
      const key = part.toFixed(3);
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }
  }
  const plateCuts = [];
  for (const [key, count] of grouped) {
    const order = orderCount(count, wastage);
    if (!(order > 0)) continue;
    const buy = bestBuy(Number(key), order);
    if (buy) plateCuts.push({ kind: "plate", ...buy });
  }
  plateCuts.sort((a, b) => b.length - a.length);
  cuts.push(...plateCuts);

  const floorArea = walls.length ? grossFloorArea(walls) : 0;
  const roofed = roofSection(plan, wastage);
  cuts.push(...roofed.cuts);
  return {
    wastage,
    studSpacing: STUD_SPACING,
    studLength: WALL_HEIGHT,
    sheet: { w: SHEET_W, h: SHEET_H },
    studs,
    studsOrder,
    plateMetres,
    liningArea,
    liningSheets: sheetCount(liningArea, wastage),
    claddingArea,
    claddingOrder: claddingArea * (1 + wastage),
    floorArea,
    floorSheets: sheetCount(floorArea, wastage),
    cuts,
    roof: roofed.section,
  };
}

export function cutLabel(cut) {
  const names = { stud: "stud", plate: "plate", rafter: "rafter", batten: "batten" };
  const name = names[cut.kind] || cut.kind;
  return `${cut.count} x ${formatNum(cut.length)} m ${name} from ${cut.sticks} x ${formatNum(cut.stock)} m`;
}

export function materialsSheetLines(plan) {
  const walls = plan?.walls || [];
  if (!walls.some((wall) => wallLen(wall) > 1e-6)) return [];
  const r = takeoff(plan);
  const pct = r.wastage * 100;
  const lines = [
    "Materials",
    `Wastage ${formatNum(pct, pct % 1 ? 1 : 0)}%`,
    `Studs ${r.studsOrder} x ${formatNum(r.studLength)} m`,
    `Lining ${r.liningSheets} sheets`,
    `Cladding ${formatNum(r.claddingOrder)} m2`,
    `Floor ${formatNum(r.floorArea)} m2`,
    `Floor sheets ${r.floorSheets}`,
    "Cut list",
    ...r.cuts.map(cutLabel),
    ...roofOrderLines(r.roof),
  ];
  lines.push(...wrapWords(MATERIALS_NOTE, 40));
  lines.push(...wrapWords(MATERIALS_LIMIT, 40));
  return lines;
}
