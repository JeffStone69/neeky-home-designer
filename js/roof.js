// Planning roof for the outside-face bounding box of the walls. Not a
// structural design, and not a roof that follows an L-shaped outline.
//
// North is +Z. A skillion falls away from its high side, so the plane faces
// the opposite compass point. A gable ridge runs along the longer side. A
// square ridge runs east-west, and the two planes face north and south.
//
// Eave overhang is the horizontal overhang on the edges the water runs off
// (both of them, including the high edge of a skillion). Gable overhang is
// the verge on the other two edges. Pitch is degrees from horizontal.
// Lengths below are rounded to the millimetre.
//
// Common rafters at 600 mm centres, one at each end, full slope length.
// Not trusses. No ceiling joists or birdsmouth deduction. Battens at 900 mm
// up the slope, one row at each end, and each gable plane has its own.
// Roof sheets are a corrugated / Trimdek cover of 762 mm (Lysaght Custom
// Orb and Trimdek), one sheet up the slope, no end lap.
//
// A gable reports the ridge length as ridge flashing. A skillion reports the
// high edge as apron flashing. Gutters sit on the low eaves only. Downpipes
// are one per 10 m of each eave, rounded up, at least one. Rain litres are
// the flat catchment, including overhangs, times annual rainfall times 0.90.
//
// Solar modules are packed on each plane after a 200 mm setback from every
// edge. A 2 m² module is 1.134 m by 1.762 m, and other areas scale both
// sides. Panels do not cross the ridge. South-facing planes still count.

import { WALL_HEIGHT } from "./constants.js";
import { dimensionBox } from "./geom.js";
import { POWER_NOTE, formatNum, wrapWords } from "./power.js";

export const RAFTER_SPACING = 0.6;
export const BATTEN_SPACING = 0.9;
export const COVER_WIDTH = 0.762;
export const SOLAR_SETBACK = 0.2;
export const PANEL_SHORT = 1.134;
export const PANEL_LONG = 1.762;
export const RUNOFF = 0.9;
export const DOWNPIPE_RUN = 10;
export const DEFAULT_PITCH = 15;
export const DEFAULT_EAVE = 0.3;
export const DEFAULT_GABLE = 0.2;
export const DEFAULT_RAINFALL = 1600;
export const ROOF_SHAPES = ["skillion", "gable"];
export const ROOF_HIGHS = ["north", "south", "east", "west"];
export const ROOF_NOTE = POWER_NOTE;
export const ROOF_LIMIT =
  "Common rafters at 600 mm, not trusses. Battens at 900 mm. Sheets are 762 mm cover. One downpipe per 10 m of gutter. Rain is flat roof area times rainfall times 0.90.";

const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" };

function finite(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function roundMm(n) {
  return Math.round(n * 1000) / 1000;
}

export function defaultRoof() {
  return {
    shape: "skillion",
    pitch: DEFAULT_PITCH,
    eave: DEFAULT_EAVE,
    gable: DEFAULT_GABLE,
    high: "south",
    rainfall: DEFAULT_RAINFALL,
  };
}

export function normalizeRoof(raw) {
  const d = defaultRoof();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  return {
    shape: raw.shape === "gable" ? "gable" : "skillion",
    pitch: clamp(finite(raw.pitch, d.pitch), 0, 60),
    eave: clamp(finite(raw.eave, d.eave), 0, 2),
    gable: clamp(finite(raw.gable, d.gable), 0, 2),
    high: ROOF_HIGHS.includes(raw.high) ? raw.high : d.high,
    rainfall: clamp(finite(raw.rainfall, d.rainfall), 0, 10000),
  };
}

export function cloneRoof(raw) {
  return normalizeRoof(raw);
}

function gridCount(length, spacing) {
  if (!(length > 1e-6)) return 0;
  return Math.ceil(length / spacing - 1e-9) + 1;
}

function downpipesFor(length) {
  if (!(length > 1e-6)) return 0;
  return Math.max(1, Math.ceil(length / DOWNPIPE_RUN - 1e-9));
}

function heightAt(spec, x, z) {
  const { shape, slopeAxis, high, box, tan } = spec;
  if (shape === "skillion") {
    if (slopeAxis === "z") {
      if (high === "south") return WALL_HEIGHT + (box.maxZ - z) * tan;
      return WALL_HEIGHT + (z - box.minZ) * tan;
    }
    if (high === "west") return WALL_HEIGHT + (box.maxX - x) * tan;
    return WALL_HEIGHT + (x - box.minX) * tan;
  }
  if (slopeAxis === "z") {
    const mid = (box.minZ + box.maxZ) / 2;
    return WALL_HEIGHT + (box.h / 2 - Math.abs(z - mid)) * tan;
  }
  const mid = (box.minX + box.maxX) / 2;
  return WALL_HEIGHT + (box.w / 2 - Math.abs(x - mid)) * tan;
}

export function roofModel(walls, roof) {
  const box = dimensionBox(walls || [], "outside");
  if (!box || !(box.w > 1e-6) || !(box.h > 1e-6)) return null;
  const spec = normalizeRoof(roof);
  const slopeAxis = spec.shape === "gable" ? (box.w >= box.h ? "z" : "x") : spec.high === "east" || spec.high === "west" ? "x" : "z";
  const span = slopeAxis === "z" ? box.h : box.w;
  const cross = slopeAxis === "z" ? box.w : box.h;
  const along = roundMm(cross + 2 * spec.gable);
  const run = roundMm(span + 2 * spec.eave);
  const pitchRad = (spec.pitch * Math.PI) / 180;
  const cos = Math.cos(pitchRad) || 1;
  const tan = Math.tan(pitchRad);
  const slope = roundMm(run / cos);
  const area = roundMm(slope * along);
  const eavePad = slopeAxis === "z" ? spec.eave : spec.gable;
  const vergePad = slopeAxis === "z" ? spec.gable : spec.eave;
  const minX = box.minX - vergePad;
  const maxX = box.maxX + vergePad;
  const minZ = box.minZ - eavePad;
  const maxZ = box.maxZ + eavePad;
  const outline = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  let planes;
  let quads;
  let ridge = null;
  if (spec.shape === "gable") {
    const halfRun = roundMm(span / 2 + spec.eave);
    const halfSlope = roundMm(halfRun / cos);
    const halfArea = roundMm(halfSlope * along);
    if (slopeAxis === "z") {
      const midZ = (box.minZ + box.maxZ) / 2;
      planes = [
        { face: "south", slope: halfSlope, along, area: halfArea },
        { face: "north", slope: halfSlope, along, area: halfArea },
      ];
      quads = [
        [
          [minX, minZ],
          [maxX, minZ],
          [maxX, midZ],
          [minX, midZ],
        ],
        [
          [minX, midZ],
          [maxX, midZ],
          [maxX, maxZ],
          [minX, maxZ],
        ],
      ];
      ridge = [
        [minX, midZ],
        [maxX, midZ],
      ];
    } else {
      const midX = (box.minX + box.maxX) / 2;
      planes = [
        { face: "west", slope: halfSlope, along, area: halfArea },
        { face: "east", slope: halfSlope, along, area: halfArea },
      ];
      quads = [
        [
          [minX, minZ],
          [midX, minZ],
          [midX, maxZ],
          [minX, maxZ],
        ],
        [
          [midX, minZ],
          [maxX, minZ],
          [maxX, maxZ],
          [midX, maxZ],
        ],
      ];
      ridge = [
        [midX, minZ],
        [midX, maxZ],
      ];
    }
  } else {
    planes = [{ face: OPPOSITE[spec.high], slope, along, area }];
    quads = [outline];
  }
  const usedSlope = planes[0].slope;
  const rafterCount = gridCount(along, RAFTER_SPACING) * planes.length;
  const battenCount = gridCount(usedSlope, BATTEN_SPACING) * planes.length;
  const sheetCount = (along > 1e-6 ? Math.ceil(along / COVER_WIDTH - 1e-9) : 0) * planes.length;
  const gutters = planes.map((plane) => ({ face: plane.face, length: plane.along }));
  const gutterLength = gutters.reduce((sum, gutter) => sum + gutter.length, 0);
  const catchment = roundMm(along * run);
  const heightSpec = { shape: spec.shape, slopeAxis, high: spec.high, box, tan };
  return {
    shape: spec.shape,
    pitch: spec.pitch,
    high: spec.high,
    rainfall: spec.rainfall,
    runoff: RUNOFF,
    box,
    slopeAxis,
    outline,
    quads,
    ridge,
    planes,
    catchment,
    litres: catchment * spec.rainfall * RUNOFF,
    gutters,
    gutterLength,
    downpipes: gutters.reduce((sum, gutter) => sum + downpipesFor(gutter.length), 0),
    rafterLength: usedSlope,
    rafterCount,
    battenLength: along,
    battenCount,
    sheetLength: usedSlope,
    sheetCount,
    ridgeLength: spec.shape === "gable" ? along : 0,
    flashingLength: along,
    height(x, z) {
      return heightAt(heightSpec, x, z);
    },
  };
}

function pack(along, slope, a, b) {
  if (!(along > 0) || !(slope > 0) || !(a > 0) || !(b > 0)) return 0;
  const n1 = Math.floor((along + 1e-9) / a) * Math.floor((slope + 1e-9) / b);
  const n2 = Math.floor((along + 1e-9) / b) * Math.floor((slope + 1e-9) / a);
  return Math.max(0, n1, n2);
}

export function roofFitCount(walls, roof, panelArea) {
  const model = roofModel(walls, roof);
  if (!model) return null;
  const area = Math.max(0, Number(panelArea) || 0);
  if (!(area > 0)) return 0;
  const base = PANEL_SHORT * PANEL_LONG;
  const scale = Math.sqrt(area / base);
  const short = PANEL_SHORT * scale;
  const long = PANEL_LONG * scale;
  let total = 0;
  for (const plane of model.planes) {
    total += pack(plane.along - 2 * SOLAR_SETBACK, plane.slope - 2 * SOLAR_SETBACK, short, long);
  }
  return total;
}

export function roofOrderLines(roof) {
  if (!roof) return [];
  const pitch = formatNum(roof.pitch, roof.pitch % 1 ? 1 : 0);
  const shape = roof.shape === "gable" ? "Gable" : "Skillion";
  const lines = [
    "Roof",
    `${shape} ${pitch} deg`,
    ...roof.planes.map((plane) => `Plane ${formatNum(plane.area)} m2 ${plane.face}`),
    `Rafters ${roof.raftersOrder} x ${formatNum(roof.rafterLength)} m`,
    `Battens ${roof.battensOrder} x ${formatNum(roof.battenLength)} m`,
    `Sheets ${roof.sheetsOrder} x ${formatNum(roof.sheetLength)} m`,
  ];
  if (roof.ridgeLength > 0) lines.push(`Ridge flashing ${formatNum(roof.ridgeLength)} m`);
  else lines.push(`Apron flashing ${formatNum(roof.flashingLength)} m`);
  for (const gutter of roof.gutters) lines.push(`Gutter ${gutter.face} ${formatNum(gutter.length)} m`);
  lines.push(`Downpipes ${roof.downpipes}`);
  lines.push(`Rain ${formatNum(roof.litres, 0)} L`);
  lines.push(...wrapWords(ROOF_LIMIT, 40));
  return lines;
}
