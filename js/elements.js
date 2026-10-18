import { STUMP_HEIGHT, STUMP_SIZE, STUMP_SPACING } from "./constants.js";
import { uid } from "./geom.js";

export function normalizeDeck(d) {
  const x = d.w < 0 ? d.x + d.w : d.x;
  const z = d.d < 0 ? d.z + d.d : d.z;
  return { ...d, x, z, w: Math.abs(d.w), d: Math.abs(d.d) };
}

export function deckCorners(d) {
  const r = normalizeDeck(d);
  return [
    [r.x, r.z],
    [r.x + r.w, r.z],
    [r.x + r.w, r.z + r.d],
    [r.x, r.z + r.d],
  ];
}

export function pointInDeck(p, d) {
  const r = normalizeDeck(d);
  return p[0] >= r.x - 1e-6 && p[0] <= r.x + r.w + 1e-6 && p[1] >= r.z - 1e-6 && p[1] <= r.z + r.d + 1e-6;
}

export function stepCorners(step) {
  const ang = step.rot || 0;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const len = (step.count || 1) * (step.going || 0.28);
  const hw = (step.width || 1.2) / 2;
  const px = -s;
  const pz = c;
  const x = step.x;
  const z = step.z;
  return [
    [x + px * hw, z + pz * hw],
    [x - px * hw, z - pz * hw],
    [x + c * len - px * hw, z + s * len - pz * hw],
    [x + c * len + px * hw, z + s * len + pz * hw],
  ];
}

export function pointInStep(p, step) {
  const pts = stepCorners(step);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const zi = pts[i][1];
    const xj = pts[j][0];
    const zj = pts[j][1];
    const hit = zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function gridAxis(a, b, spacing) {
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const out = [round3(start)];
  let x = start;
  while (x + spacing < end - 1e-6) {
    x += spacing;
    out.push(round3(x));
  }
  if (Math.abs(out[out.length - 1] - end) > 1e-3) out.push(round3(end));
  return out;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export function stumpGrid(box, opts = {}) {
  if (!box) return [];
  const spacing = opts.spacing || STUMP_SPACING;
  const size = opts.size || STUMP_SIZE;
  const height = opts.height || STUMP_HEIGHT;
  const xs = gridAxis(box.minX, box.maxX, spacing);
  const zs = gridAxis(box.minZ, box.maxZ, spacing);
  const out = [];
  for (const z of zs) {
    for (const x of xs) {
      out.push({ id: uid("stump"), x, z, size, height });
    }
  }
  return out;
}

export function elementPoints(state) {
  const pts = [];
  for (const d of state.decks || []) pts.push(...deckCorners(d));
  for (const s of state.steps || []) pts.push(...stepCorners(s));
  for (const s of state.stumps || []) pts.push([s.x, s.z]);
  return pts;
}
