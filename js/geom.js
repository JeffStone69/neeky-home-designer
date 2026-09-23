import { JOIN_TOL, MIN_ROOM_AREA, SNAP, WALL_THICK } from "./constants.js";

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export function snapVal(v, g) {
  return Math.round(v / g) * g;
}

export function snapPt(p, g) {
  return [snapVal(p[0], g), snapVal(p[1], g)];
}

export function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function almost(a, b, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function fmt(n) {
  return `${(Math.round(n * 100) / 100).toFixed(2)} m`;
}

export function fmtArea(n) {
  return `${(Math.round(n * 100) / 100).toFixed(2)} m²`;
}

export function wallLen(w) {
  return dist(w.a, w.b);
}

export function axisAlign(from, to) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  if (Math.abs(dx) >= Math.abs(dz)) return [to[0], from[1]];
  return [from[0], to[1]];
}

export function projectOnSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-12) return { t: 0, point: [...a], dist: dist(p, a) };
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2, 0, 1);
  const point = [a[0] + dx * t, a[1] + dz * t];
  return { t, point, dist: dist(p, point) };
}

export function edgeKey(a, b) {
  const k1 = `${a[0].toFixed(4)},${a[1].toFixed(4)}`;
  const k2 = `${b[0].toFixed(4)},${b[1].toFixed(4)}`;
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

export function joinPoint(p, walls, g) {
  let best = snapPt(p, g);
  let bestD = g * 0.51;
  for (const w of walls) {
    for (const q of [w.a, w.b]) {
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = [...q];
      }
    }
    const pr = projectOnSeg(p, w.a, w.b);
    if (pr.dist < bestD) {
      bestD = pr.dist;
      best = [...pr.point];
    }
  }
  return best;
}

export function mergeCollinear(walls, pins = []) {
  const degree = new Map();
  const bump = (p) => {
    const k = `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
    degree.set(k, (degree.get(k) || 0) + 1);
  };
  for (const w of walls) {
    bump(w.a);
    bump(w.b);
  }
  const pinned = (p) => pins.some((q) => dist(q, p) < 1e-3);
  const used = new Set();
  const out = [];
  const collinear = (u, v) => {
    const d1 = [u.b[0] - u.a[0], u.b[1] - u.a[1]];
    const d2 = [v.b[0] - v.a[0], v.b[1] - v.a[1]];
    const c = d1[0] * d2[1] - d1[1] * d2[0];
    return Math.abs(c) < 1e-8;
  };
  const share = (u, v) => {
    const pts = [u.a, u.b, v.a, v.b];
    for (let i = 0; i < 2; i++) {
      for (let j = 2; j < 4; j++) {
        if (dist(pts[i], pts[j]) < 1e-6) return pts[i];
      }
    }
    return null;
  };
  for (let i = 0; i < walls.length; i++) {
    if (used.has(i)) continue;
    let acc = { ...walls[i], a: [...walls[i].a], b: [...walls[i].b] };
    used.add(i);
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < walls.length; j++) {
        if (used.has(j)) continue;
        const s = share(acc, walls[j]);
        if (!s) continue;
        const k = `${s[0].toFixed(4)},${s[1].toFixed(4)}`;
        if ((degree.get(k) || 0) !== 2) continue;
        if (pinned(s)) continue;
        if (!collinear(acc, walls[j])) continue;
        const pts = [acc.a, acc.b, walls[j].a, walls[j].b];
        let maxD = -1;
        let a = pts[0];
        let b = pts[1];
        for (let p = 0; p < 4; p++) {
          for (let q = p + 1; q < 4; q++) {
            const d = dist(pts[p], pts[q]);
            if (d > maxD) {
              maxD = d;
              a = pts[p];
              b = pts[q];
            }
          }
        }
        acc = { ...acc, a: [...a], b: [...b] };
        used.add(j);
        grew = true;
      }
    }
    if (wallLen(acc) > 1e-4) out.push(acc);
  }
  return out;
}

export function planarize(walls) {
  let segs = walls.map((w) => ({ ...w, a: [...w.a], b: [...w.b] }));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 12) {
    changed = false;
    const pts = [];
    for (const w of segs) {
      pts.push(w.a, w.b);
    }
    const next = [];
    for (const w of segs) {
      const cuts = [];
      for (const p of pts) {
        const pr = projectOnSeg(p, w.a, w.b);
        if (pr.dist < 1e-4 && pr.t > 0.004 && pr.t < 0.996) {
          cuts.push({ t: pr.t, p: pr.point });
        }
      }
      if (!cuts.length) {
        next.push(w);
        continue;
      }
      changed = true;
      cuts.sort((a, b) => a.t - b.t);
      const uniq = [];
      for (const c of cuts) {
        if (!uniq.length || dist(uniq[uniq.length - 1].p, c.p) > 1e-4) uniq.push(c);
      }
      let prev = w.a;
      let first = true;
      for (const c of uniq) {
        if (dist(prev, c.p) > 1e-4) {
          next.push({ ...w, id: first ? w.id : uid("w"), a: [...prev], b: [...c.p] });
          first = false;
        }
        prev = c.p;
      }
      if (dist(prev, w.b) > 1e-4) {
        next.push({ ...w, id: first ? w.id : uid("w"), a: [...prev], b: [...w.b] });
      }
    }
    segs = next;
  }
  const seen = new Map();
  const out = [];
  for (const w of segs) {
    if (dist(w.a, w.b) < 1e-4) continue;
    const k = edgeKey(w.a, w.b);
    if (seen.has(k)) continue;
    seen.set(k, true);
    out.push(w);
  }
  return out;
}

export function rebindOpenings(openings, oldWalls, newWalls) {
  return openings
    .map((op) => {
      const wall = oldWalls.find((w) => w.id === op.wallId);
      const p = wall
        ? [
            wall.a[0] + (wall.b[0] - wall.a[0]) * op.t,
            wall.a[1] + (wall.b[1] - wall.a[1]) * op.t,
          ]
        : null;
      if (!p) return null;
      const hit = nearestWall(p, newWalls, 0.25);
      if (!hit) return null;
      return { ...op, wallId: hit.wall.id, t: clampOpening(hit.wall, hit.t, op.width) };
    })
    .filter(Boolean);
}

function shoelace(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function centroid(pts) {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

function angle(from, to) {
  return Math.atan2(to[1] - from[1], to[0] - from[0]);
}

export function computeRooms(walls) {
  const verts = [];
  const vid = (p) => {
    const i = verts.findIndex((v) => dist(v, p) < 1e-4);
    if (i >= 0) return i;
    verts.push([...p]);
    return verts.length - 1;
  };
  const edges = [];
  for (const w of walls) {
    const u = vid(w.a);
    const v = vid(w.b);
    if (u !== v) edges.push({ u, v, wallId: w.id });
  }
  const adj = verts.map(() => []);
  for (const e of edges) {
    adj[e.u].push({ to: e.v, wallId: e.wallId });
    adj[e.v].push({ to: e.u, wallId: e.wallId });
  }
  for (let i = 0; i < verts.length; i++) {
    adj[i].sort((A, B) => angle(verts[i], verts[A.to]) - angle(verts[i], verts[B.to]));
  }
  function nextHE(from, to) {
    const list = adj[to];
    const idx = list.findIndex((n) => n.to === from);
    if (idx < 0) return null;
    const n = list[(idx - 1 + list.length) % list.length];
    return { from: to, to: n.to, wallId: n.wallId };
  }
  const used = new Set();
  const rooms = [];
  for (const e of edges) {
    for (const dir of [
      { from: e.u, to: e.v, wallId: e.wallId },
      { from: e.v, to: e.u, wallId: e.wallId },
    ]) {
      const startK = `${dir.from}>${dir.to}`;
      if (used.has(startK)) continue;
      const cycle = [];
      let cur = dir;
      let guard = 0;
      while (guard++ < 400) {
        const k = `${cur.from}>${cur.to}`;
        if (used.has(k) && cycle.length) break;
        used.add(k);
        cycle.push(cur);
        const nxt = nextHE(cur.from, cur.to);
        if (!nxt) break;
        cur = nxt;
        if (nxt.from === dir.from && nxt.to === dir.to) break;
      }
      if (cycle.length < 3) continue;
      const pts = cycle.map((h) => verts[h.from]);
      const area = shoelace(pts);
      const c = centroid(pts);
      const base = `rm_${c[0].toFixed(2)}_${c[1].toFixed(2)}`;
      let id = base;
      let n = 2;
      while (rooms.some((r) => r.id === id)) id = `${base}_${n++}`;
      if (area >= MIN_ROOM_AREA) {
        rooms.push({
          id,
          points: pts,
          area,
          centroid: c,
          name: "Room",
        });
      }
    }
  }
  rooms.sort((a, b) => a.area - b.area);
  const kept = [];
  for (const r of rooms) {
    if (kept.some((n) => pointInPoly(n.centroid, r.points))) continue;
    kept.push(r);
  }
  return kept;
}

export function assignLabels(rooms, labels) {
  const used = new Set();
  for (const room of rooms) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < labels.length; i++) {
      if (used.has(i)) continue;
      if (pointInPoly(labels[i].at, room.points)) {
        best = i;
        bestD = 0;
        break;
      }
      const d = dist(labels[i].at, room.centroid);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best != null && bestD < 4) {
      room.name = labels[best].name;
      used.add(best);
    }
  }
  return rooms;
}

export function pointInPoly(p, pts) {
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

export function nearestWall(p, walls, maxDist) {
  let best = null;
  for (const w of walls) {
    const pr = projectOnSeg(p, w.a, w.b);
    if (pr.dist <= maxDist && (!best || pr.dist < best.dist)) {
      best = { wall: w, ...pr };
    }
  }
  return best;
}

export function openingFits(wall, t, width) {
  const L = wallLen(wall);
  if (L < width + 0.1) return false;
  const half = width / 2 / L;
  return t - half >= 0.02 && t + half <= 0.98;
}

export function clampOpening(wall, t, width) {
  const L = wallLen(wall);
  const half = width / 2 / Math.max(L, 1e-6);
  return clamp(t, half + 0.02, 1 - half - 0.02);
}

export function bounds(walls) {
  if (!walls.length) return null;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.a[0], w.b[0]);
    minZ = Math.min(minZ, w.a[1], w.b[1]);
    maxX = Math.max(maxX, w.a[0], w.b[0]);
    maxZ = Math.max(maxZ, w.a[1], w.b[1]);
  }
  return { minX, minZ, maxX, maxZ, w: maxX - minX, h: maxZ - minZ };
}

export function insetArea(room) {
  const a = room.area;
  const peri = room.points.reduce((s, p, i) => {
    const q = room.points[(i + 1) % room.points.length];
    return s + dist(p, q);
  }, 0);
  return Math.max(0.1, a - (peri * WALL_THICK) / 2);
}

export function serializePlan(state) {
  const walls = state.walls.map((w) => ({ a: w.a, b: w.b }));
  const openings = state.openings.map((o) => {
    const wallIndex = state.walls.findIndex((w) => w.id === o.wallId);
    return {
      type: o.type,
      wallIndex,
      t: o.t,
      width: o.width,
      height: o.height,
      sill: o.sill ?? 0,
    };
  });
  return {
    app: "neeky-home-designer",
    unit: "m",
    wallHeight: 2.7,
    wallThickness: 0.2,
    pins: (state.pins || []).map((p) => [p[0], p[1]]),
    walls,
    openings,
    rooms: state.rooms.map((r) => ({ name: r.name, labelAt: r.centroid })),
    furniture: (state.furniture || []).map((f) => ({
      type: f.type,
      x: f.x,
      z: f.z,
      rot: f.rot || 0,
      w: f.w,
      d: f.d,
      hidden: !!f.hidden,
      auto: !!f.auto,
      name: f.name || "",
      locked: !!f.locked,
    })),
  };
}

export function deserializePlan(data) {
  if (!data || data.app !== "neeky-home-designer") throw new Error("Not a Neeky plan file.");
  const walls = (data.walls || []).map((w) => ({
    id: uid("w"),
    a: [Number(w.a[0]), Number(w.a[1])],
    b: [Number(w.b[0]), Number(w.b[1])],
  }));
  const openings = (data.openings || [])
    .map((o) => {
      const wall = walls[o.wallIndex];
      if (!wall) return null;
      return {
        id: uid(o.type === "window" ? "win" : "d"),
        type: o.type === "window" ? "window" : "door",
        wallId: wall.id,
        t: Number(o.t),
        width: Number(o.width),
        height: Number(o.height),
        sill: Number(o.sill || 0),
      };
    })
    .filter(Boolean);
  const labels = (data.rooms || []).map((r) => ({
    name: String(r.name || "Room"),
    at: [Number(r.labelAt[0]), Number(r.labelAt[1])],
  }));
  const furniture = (data.furniture || []).map((f) => ({
    id: uid("f"),
    type: String(f.type || "plant"),
    x: Number(f.x),
    z: Number(f.z),
    rot: Number(f.rot || 0),
    w: Number(f.w || 0.45),
    d: Number(f.d || 0.45),
    hidden: !!f.hidden,
    auto: !!f.auto,
    name: f.name ? String(f.name) : "",
    locked: !!f.locked,
  }));
  const pins = (data.pins || []).map((p) => [Number(p[0]), Number(p[1])]).filter((p) => p.every(Number.isFinite));
  return { walls, openings, labels, furniture, pins };
}

export function labelsFromRooms(rooms) {
  return rooms.map((r) => ({ name: r.name, at: [...r.centroid] }));
}
