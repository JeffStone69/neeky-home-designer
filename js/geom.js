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

function createVertexIndex(tol = 1e-4) {
  const verts = [];
  const buckets = new Map();
  const scale = 1 / tol;
  const key = (ix, iz) => `${ix},${iz}`;
  return {
    verts,
    id(p) {
      const ix = Math.round(p[0] * scale);
      const iz = Math.round(p[1] * scale);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = buckets.get(key(ix + dx, iz + dz));
          if (!list) continue;
          for (const i of list) {
            if (dist(verts[i], p) < tol) return i;
          }
        }
      }
      const i = verts.length;
      verts.push([p[0], p[1]]);
      const k = key(ix, iz);
      let list = buckets.get(k);
      if (!list) {
        list = [];
        buckets.set(k, list);
      }
      list.push(i);
      return i;
    },
  };
}

export function indexPoints(points, tol = 1e-4) {
  const index = createVertexIndex(tol);
  const ids = points.map((p) => index.id(p));
  return { ids, verts: index.verts };
}

export function computeRooms(walls) {
  const index = createVertexIndex();
  const verts = index.verts;
  const vid = (p) => index.id(p);
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

function indexWalls(walls, cell) {
  const buckets = new Map();
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const minX = Math.min(w.a[0], w.b[0]);
    const maxX = Math.max(w.a[0], w.b[0]);
    const minZ = Math.min(w.a[1], w.b[1]);
    const maxZ = Math.max(w.a[1], w.b[1]);
    const i0 = Math.floor(minX / cell);
    const i1 = Math.floor(maxX / cell);
    const j0 = Math.floor(minZ / cell);
    const j1 = Math.floor(maxZ / cell);
    for (let ix = i0; ix <= i1; ix++) {
      for (let iz = j0; iz <= j1; iz++) {
        const k = `${ix},${iz}`;
        let list = buckets.get(k);
        if (!list) buckets.set(k, (list = []));
        list.push({ i, w });
      }
    }
  }
  return buckets;
}

// Segment lookup. Walls are hashed into grid cells so a query measures only
// segments near the point. Cell size is at least maxDist, so the 3×3 neighbourhood
// contains every wall that can win. Equal distances keep the earlier wall.
export function nearestWall(p, walls, maxDist) {
  if (!Array.isArray(walls) || !walls.length || !p) return null;
  if (!Number.isFinite(maxDist) || maxDist < 0) return null;
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  const cell = Math.max(maxDist, 0.25);
  const buckets = indexWalls(walls, cell);
  const ix = Math.floor(p[0] / cell);
  const iz = Math.floor(p[1] / cell);
  const seen = new Set();
  const candidates = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const list = buckets.get(`${ix + dx},${iz + dz}`);
      if (!list) continue;
      for (const item of list) {
        if (seen.has(item.i)) continue;
        seen.add(item.i);
        candidates.push(item);
      }
    }
  }
  candidates.sort((a, b) => a.i - b.i);
  let best = null;
  for (const item of candidates) {
    const pr = projectOnSeg(p, item.w.a, item.w.b);
    if (pr.dist <= maxDist && (!best || pr.dist < best.dist)) best = { wall: item.w, ...pr };
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

export function labelsFromRooms(rooms) {
  return rooms.map((r) => ({ name: r.name, at: [...r.centroid] }));
}

function graphOf(walls) {
  const index = createVertexIndex();
  const verts = index.verts;
  const edges = [];
  for (const w of walls) {
    const u = index.id(w.a);
    const v = index.id(w.b);
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
  return { verts, edges, adj };
}

function nextHalfEdge(adj, from, to) {
  const list = adj[to];
  const idx = list.findIndex((n) => n.to === from);
  if (idx < 0) return null;
  const n = list[(idx - 1 + list.length) % list.length];
  return { from: to, to: n.to, wallId: n.wallId };
}

export function closedFaces(walls) {
  const { verts, edges, adj } = graphOf(walls);
  const used = new Set();
  const faces = [];
  for (const e of edges) {
    for (const dir of [
      { from: e.u, to: e.v },
      { from: e.v, to: e.u },
    ]) {
      const startK = `${dir.from}>${dir.to}`;
      if (used.has(startK)) continue;
      const cycle = [];
      let cur = dir;
      let guard = 0;
      let closed = false;
      while (guard++ < 800) {
        const k = `${cur.from}>${cur.to}`;
        if (cycle.length && k === startK) {
          closed = true;
          break;
        }
        if (used.has(k)) break;
        used.add(k);
        cycle.push(cur);
        const nxt = nextHalfEdge(adj, cur.from, cur.to);
        if (!nxt) break;
        cur = nxt;
      }
      if (!closed || cycle.length < 3) continue;
      const points = cycle.map((h) => verts[h.from]);
      faces.push({ points, area: shoelace(points) });
    }
  }
  return faces;
}

export function outerRing(walls) {
  let best = null;
  for (const face of closedFaces(walls)) {
    if (face.area < -1e-4 && (!best || face.area < best.area)) best = face;
  }
  return best ? best.points.map((p) => [...p]) : null;
}

function simplifyRing(pts) {
  if (!pts || pts.length < 3) return pts;
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const cross = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]);
    if (Math.abs(cross) < 1e-8 && dist(prev, next) > 1e-6) continue;
    if (out.length && dist(out[out.length - 1], cur) < 1e-6) continue;
    out.push(cur);
  }
  if (out.length >= 2 && dist(out[0], out[out.length - 1]) < 1e-6) out.pop();
  return out.length >= 3 ? out : pts;
}

function intersectLines(p, d, q, e) {
  const det = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(det) < 1e-12) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / det;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

export function offsetPolygon(pts, dist) {
  const ring = simplifyRing(pts);
  if (!ring || ring.length < 3) return null;
  const area = shoelace(ring);
  if (Math.abs(area) < 1e-8) return null;
  const n = ring.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-8) return null;
    dx /= len;
    dz /= len;
    let nx = -dz;
    let nz = dx;
    const outward = area > 0 ? -1 : 1;
    nx *= outward;
    nz *= outward;
    lines.push({ p: [a[0] + nx * dist, a[1] + nz * dist], d: [dx, dz] });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i + n - 1) % n];
    const cur = lines[i];
    const hit = intersectLines(prev.p, prev.d, cur.p, cur.d);
    if (!hit) return null;
    out.push(hit);
  }
  if (Math.abs(shoelace(out)) < 1e-6) return null;
  return out;
}

export function dimensionBox(walls, mode = "centreline", thick = WALL_THICK) {
  const b = bounds(walls);
  if (!b) return null;
  const half = thick / 2;
  const delta = mode === "outside" ? half : mode === "inside" ? -half : 0;
  const minX = b.minX - delta;
  const maxX = b.maxX + delta;
  const minZ = b.minZ - delta;
  const maxZ = b.maxZ + delta;
  return { minX, minZ, maxX, maxZ, w: maxX - minX, h: maxZ - minZ, mode };
}

export function internalArea(room, thick = WALL_THICK) {
  const inset = offsetPolygon(room.points, -thick / 2);
  if (inset) {
    const a = Math.abs(shoelace(inset));
    if (Number.isFinite(a) && a > 0) return a;
  }
  return insetArea(room);
}

export function grossFloorArea(walls, thick = WALL_THICK) {
  const ring = outerRing(walls);
  if (ring) {
    const grown = offsetPolygon(ring, thick / 2);
    if (grown) {
      const a = Math.abs(shoelace(grown));
      if (Number.isFinite(a) && a > 0) return a;
    }
  }
  const box = dimensionBox(walls, "outside", thick);
  return box ? Math.max(0, box.w * box.h) : 0;
}

export function sceneBounds(walls, points = []) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const take = (p) => {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    minX = Math.min(minX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxZ = Math.max(maxZ, p[1]);
  };
  for (const w of walls || []) {
    take(w.a);
    take(w.b);
  }
  for (const p of points) take(p);
  if (!Number.isFinite(minX)) return null;
  return { minX, minZ, maxX, maxZ, w: maxX - minX, h: maxZ - minZ };
}

function prunePins(walls, pins) {
  const verts = [];
  for (const w of walls) verts.push(w.a, w.b);
  return (pins || []).filter((p) => verts.some((v) => dist(v, p) < 1e-3));
}

export function normalizePlan(plan) {
  const pins = (plan.pins || []).map((p) => [...p]);
  const oldWalls = (plan.walls || []).map((w) => ({ ...w, a: [...w.a], b: [...w.b] }));
  const walls = mergeCollinear(planarize(oldWalls), pins);
  const openings = rebindOpenings(plan.openings || [], oldWalls, walls);
  const rooms = assignLabels(computeRooms(walls), plan.labels || []);
  return {
    ...plan,
    walls,
    openings,
    pins: prunePins(walls, pins),
    rooms,
    labels: labelsFromRooms(rooms),
    furniture: plan.furniture || [],
    decks: plan.decks || [],
    steps: plan.steps || [],
    stumps: plan.stumps || [],
  };
}
