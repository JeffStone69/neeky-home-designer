import { DOOR_H, DOOR_W, SNAP, WIN_H, WIN_SILL, WIN_W } from "./constants.js";
import { uid } from "./geom.js";

function snap(v) {
  return Math.round(v / SNAP) * SNAP;
}

function rect(name, x, z, w, h) {
  return { name, x: snap(x), z: snap(z), w: snap(w), h: snap(h) };
}

export function roomsToPlan(rects, openPairs = []) {
  const open = new Set(openPairs.map((p) => [p[0], p[1]].sort().join("|")));
  const horiz = [];
  const vert = [];
  for (const r of rects) {
    horiz.push({ k: r.z, a: r.x, b: r.x + r.w, name: r.name });
    horiz.push({ k: r.z + r.h, a: r.x, b: r.x + r.w, name: r.name });
    vert.push({ k: r.x, a: r.z, b: r.z + r.h, name: r.name });
    vert.push({ k: r.x + r.w, a: r.z, b: r.z + r.h, name: r.name });
  }

  const segs = [];
  emitSplit(horiz, true, segs);
  emitSplit(vert, false, segs);

  const walls = [];
  const meta = [];
  for (const s of segs) {
    if (s.names.length === 2) {
      const pair = [...s.names].sort().join("|");
      if (open.has(pair) && s.names.every((n) => n === "Hall")) continue;
    }
    if (s.L < 0.2) continue;
    const wall = { id: uid("w"), a: [...s.a], b: [...s.b] };
    walls.push(wall);
    meta.push({ wall, names: s.names, L: s.L });
  }

  const openings = [];
  const hallish = (n) => n === "Hall" || n === "Entry";
  const livingish = (n) => n === "Living" || n === "Kitchen" || n === "Dining";
  const minZ = Math.min(...rects.map((r) => r.z));

  for (const m of meta) {
    const names = m.names;
    const L = m.L;
    const wall = m.wall;
    if (names.length === 2) {
      const [a, b] = names;
      const pair = [a, b].sort().join("|");
      if (open.has(pair) && !names.every((n) => n === "Hall")) {
        openings.push({
          id: uid("d"),
          type: "door",
          wallId: wall.id,
          t: 0.5,
          width: Math.min(2.4, L - 0.3),
          height: DOOR_H,
          sill: 0,
        });
        continue;
      }
      const connectHall = hallish(a) !== hallish(b);
      const connectLive = livingish(a) && livingish(b);
      const ensuite = (a === "Ensuite" && b.startsWith("Bedroom")) || (b === "Ensuite" && a.startsWith("Bedroom"));
      if ((connectHall || connectLive || ensuite) && L >= 1.0) {
        openings.push({
          id: uid("d"),
          type: "door",
          wallId: wall.id,
          t: 0.5,
          width: Math.min(DOOR_W, L - 0.2),
          height: DOOR_H,
          sill: 0,
        });
      }
    } else if (names.length === 1) {
      const n = names[0];
      const horizontal = almostEq(wall.a[1], wall.b[1]);
      const z = Math.min(wall.a[1], wall.b[1]);
      const isSouth = horizontal && Math.abs(z - minZ) < 1e-6;
      if (hallish(n) && isSouth && L >= 1.0) {
        openings.push({
          id: uid("d"),
          type: "door",
          wallId: wall.id,
          t: 0.45,
          width: DOOR_W,
          height: DOOR_H,
          sill: 0,
        });
      } else if (!hallish(n) && L >= 1.6) {
        if (!openings.some((o) => o.wallId === wall.id)) {
          openings.push({
            id: uid("win"),
            type: "window",
            wallId: wall.id,
            t: 0.5,
            width: Math.min(WIN_W, L - 0.4),
            height: WIN_H,
            sill: WIN_SILL,
          });
        }
      }
    }
  }

  const labels = rects.map((r) => ({
    name: r.name,
    at: [r.x + r.w / 2, r.z + r.h / 2],
  }));
  return { walls, openings, labels };
}

function emitSplit(lines, horizontal, out) {
  const groups = new Map();
  for (const ln of lines) {
    const key = ln.k.toFixed(4);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ln);
  }
  for (const lns of groups.values()) {
    const cuts = new Set();
    for (const ln of lns) {
      cuts.add(ln.a);
      cuts.add(ln.b);
    }
    const ts = [...cuts].sort((x, y) => x - y);
    const k = lns[0].k;
    for (let i = 0; i < ts.length - 1; i++) {
      const a = ts[i];
      const b = ts[i + 1];
      const L = b - a;
      if (L < 0.05) continue;
      const mid = (a + b) / 2;
      const names = [];
      for (const ln of lns) {
        const lo = Math.min(ln.a, ln.b);
        const hi = Math.max(ln.a, ln.b);
        if (mid > lo + 1e-9 && mid < hi - 1e-9) names.push(ln.name);
      }
      if (!names.length) continue;
      out.push({
        a: horizontal ? [a, k] : [k, a],
        b: horizontal ? [b, k] : [k, b],
        names,
        L,
      });
    }
  }
}

function almostEq(a, b) {
  return Math.abs(a - b) < 1e-6;
}

export function parseBrief(text) {
  const t = (text || "").toLowerCase();
  let bedrooms = 3;
  if (/\bstudio\b/.test(t)) bedrooms = 0;
  else {
    const m = t.match(/(\d+)\s*-?\s*bed/);
    if (m) bedrooms = Number(m[1]);
    else if (/two-bed|two bed|2 bed/.test(t)) bedrooms = 2;
    else if (/one-bed|one bed|1 bed/.test(t)) bedrooms = 1;
    else if (/family/.test(t)) bedrooms = 3;
  }
  let bathrooms = bedrooms >= 3 ? 2 : 1;
  const bm = t.match(/(\d+)\s*-?\s*bath/);
  if (bm) bathrooms = Number(bm[1]);
  else if (/two baths|2 baths/.test(t)) bathrooms = 2;
  let targetArea = bedrooms === 0 ? 45 : bedrooms === 1 ? 60 : bedrooms === 2 ? 85 : 160;
  const am = t.match(/(\d+(?:\.\d+)?)\s*(m²|m2|sqm|m\^2)/i);
  if (am) targetArea = Number(am[1]);
  else {
    const about = t.match(/about\s+(\d+)/);
    if (about) targetArea = Number(about[1]);
  }
  const openKitchen = bedrooms === 0 || /open/.test(t) || /kitchen to living/.test(t) || !/separate kitchen/.test(t);
  return { bedrooms, bathrooms, openKitchen, targetArea };
}

export function layoutRooms(spec) {
  const beds = spec.bedrooms;
  const baths = Math.max(1, spec.bathrooms);
  const area = spec.targetArea;

  if (beds <= 0) {
    const w = snap(Math.max(7.5, Math.sqrt(area * 1.4)));
    const d = snap(Math.max(5.25, area / w + 0.5));
    const bathW = 2.0;
    return [
      rect("Kitchen", 0, 0, w - bathW, 2.25),
      rect("Bath", w - bathW, 0, bathW, 2.25),
      rect("Living", 0, 2.25, w, d - 2.25),
    ];
  }

  const southH = 3.5;
  const hallH = 1.25;
  const hallW = 1.25;
  const wetW = 2.0;
  const ensuite = baths >= 2;
  const laundry = area >= 90 || beds >= 2;
  const placed = [];
  let x = 0;

  if (beds >= 4) {
    placed.push(rect("Bedroom 4", x, 0, 3.0, southH));
    x += 3.0;
  }
  if (beds >= 3) {
    placed.push(rect("Bedroom 3", x, 0, 3.5, southH));
    x += 3.5;
  }
  if (beds === 2) {
    placed.push(rect("Bedroom 2", x, 0, 3.5, southH));
    x += 3.5;
  }

  if (laundry) {
    placed.push(rect("Bath", x, 0, wetW, 2.25));
    placed.push(rect("Laundry", x, 2.25, wetW, 1.25));
  } else {
    placed.push(rect("Bath", x, 0, wetW, southH));
  }
  x += wetW;

  placed.push(rect("Hall", x, 0, hallW, southH));
  x += hallW;

  if (beds >= 3) {
    placed.push(rect("Bedroom 2", x, 0, 3.5, southH));
    x += 3.5;
  }

  if (ensuite) {
    placed.push(rect("Ensuite", x, 0, 1.75, southH));
    x += 1.75;
  }

  const bed1W = beds === 1 ? 4.5 : 4.0;
  placed.push(rect("Bedroom 1", x, 0, bed1W, southH));
  x += bed1W;

  const width = x;
  placed.push(rect("Hall", 0, southH, width, hallH));

  const used = placed.reduce((s, p) => s + p.w * p.h, 0);
  const northH = snap(Math.max(4.5, (area - used) / width));
  const kitW = spec.openKitchen ? snap(Math.max(3.5, width * 0.38)) : snap(Math.max(3.25, width * 0.32));
  const liveW = snap(width - kitW);
  const zN = southH + hallH;
  placed.push(rect("Living", 0, zN, liveW, northH));
  placed.push(rect("Kitchen", liveW, zN, kitW, northH));
  return placed;
}

export function generateFromSpec(spec) {
  const rects = layoutRooms(spec);
  const open = spec.openKitchen ? [["Living", "Kitchen"]] : [];
  open.push(["Hall", "Hall"]);
  return roomsToPlan(rects, open);
}

export const PRESETS = {
  studio: { bedrooms: 0, bathrooms: 1, openKitchen: true, targetArea: 45 },
  twoBed: { bedrooms: 2, bathrooms: 1, openKitchen: true, targetArea: 85 },
  family: { bedrooms: 3, bathrooms: 2, openKitchen: true, targetArea: 160 },
};

export function familyPlan() {
  const rects = [
    rect("Bedroom 3", 0, 0, 3.5, 3.5),
    rect("Bath", 3.5, 0, 2.0, 2.25),
    rect("Laundry", 3.5, 2.25, 2.0, 1.25),
    rect("Hall", 5.5, 0, 1.25, 3.5),
    rect("Bedroom 2", 6.75, 0, 3.5, 3.5),
    rect("Ensuite", 10.25, 0, 1.75, 3.5),
    rect("Bedroom 1", 12.0, 0, 4.0, 3.5),
    rect("Hall", 0, 3.5, 16.0, 1.25),
    rect("Living", 0, 4.75, 9.5, 6.5),
    rect("Kitchen", 9.5, 4.75, 6.5, 6.5),
  ];
  return roomsToPlan(rects, [
    ["Living", "Kitchen"],
    ["Hall", "Hall"],
  ]);
}

export function studioPlan() {
  const rects = [
    rect("Kitchen", 0, 0, 5.5, 2.25),
    rect("Bath", 5.5, 0, 2.0, 2.25),
    rect("Living", 0, 2.25, 7.5, 4.5),
  ];
  return roomsToPlan(rects, [["Living", "Kitchen"]]);
}

export function twoBedPlan() {
  const rects = [
    rect("Bedroom 2", 0, 0, 3.5, 3.5),
    rect("Bath", 3.5, 0, 2.0, 2.25),
    rect("Laundry", 3.5, 2.25, 2.0, 1.25),
    rect("Hall", 5.5, 0, 1.25, 3.5),
    rect("Bedroom 1", 6.75, 0, 4.0, 3.5),
    rect("Hall", 0, 3.5, 10.75, 1.25),
    rect("Living", 0, 4.75, 6.5, 5.0),
    rect("Kitchen", 6.5, 4.75, 4.25, 5.0),
  ];
  return roomsToPlan(rects, [
    ["Living", "Kitchen"],
    ["Hall", "Hall"],
  ]);
}