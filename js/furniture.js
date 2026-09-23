import { COLORS, SNAP, SNAP_FINE, WALL_THICK } from "./constants.js";
import { clamp, dist, insetArea, nearestWall, pointInPoly, snapPt, uid, wallLen } from "./geom.js";

export const FURN = {
  plant: { w: 0.45, d: 0.45, label: "Plant" },
  sofa: { w: 2.2, d: 0.9, label: "Sofa" },
  bed: { w: 2.0, d: 1.6, label: "Bed" },
  table: { w: 1.4, d: 0.8, label: "Table" },
  tank: { w: 1.8, d: 0.6, label: "Blue-tongue" },
};

const TANK_W = 1.8;
const TANK_D = 0.6;

export function furnLabel(f) {
  if (f?.name && String(f.name).trim()) return String(f.name).trim();
  if (f?.type === "tank") return "Blue-tongue";
  return FURN[f?.type]?.label || "Furniture";
}

export function cloneFurn(f) {
  return { ...f };
}

function bbox(points) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    minZ = Math.min(minZ, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxZ = Math.max(maxZ, p[1]);
  }
  return { minX, minZ, maxX, maxZ };
}

export function plantPos(room) {
  const b = bbox(room.points);
  const inset = Math.min(0.7, Math.max(0.32, Math.min(b.maxX - b.minX, b.maxZ - b.minZ) * 0.22));
  const candidates = [
    [b.minX + inset, b.minZ + inset],
    [b.maxX - inset, b.minZ + inset],
    [b.minX + inset, b.maxZ - inset],
    [b.maxX - inset, b.maxZ - inset],
    [room.centroid[0] - 0.85, room.centroid[1] - 0.6],
    [room.centroid[0] + 0.7, room.centroid[1] - 0.55],
    [...room.centroid],
  ];
  for (const p of candidates) {
    if (pointInPoly(p, room.points) && dist(p, room.centroid) > 0.4) return p;
  }
  return [...room.centroid];
}

export function ensurePlants(state) {
  if (!state.rooms?.length) return;
  for (const room of state.rooms) {
    const has = state.furniture.some((f) => f.type === "plant" && pointInPoly([f.x, f.z], room.points));
    if (has) continue;
    const p = plantPos(room);
    const size = insetArea(room) < 4 ? 0.32 : 0.45;
    state.furniture.push({
      id: uid("f"),
      type: "plant",
      x: p[0],
      z: p[1],
      rot: 0,
      w: size,
      d: size,
      auto: true,
      hidden: false,
    });
  }
}

export function aabbOf(f) {
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  const hw = f.w / 2;
  const hd = f.d / 2;
  const xs = [];
  const zs = [];
  for (const [lx, lz] of [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]) {
    xs.push(f.x + c * lx - s * lz);
    zs.push(f.z + s * lx + c * lz);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function aabbOverlap(a, b) {
  return a.minX < b.maxX - 1e-6 && a.maxX > b.minX + 1e-6 && a.minZ < b.maxZ - 1e-6 && a.maxZ > b.minZ + 1e-6;
}

function openingClearance(wall, op) {
  const ang = Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]);
  const cx = wall.a[0] + (wall.b[0] - wall.a[0]) * op.t;
  const cz = wall.a[1] + (wall.b[1] - wall.a[1]) * op.t;
  return aabbOf({ x: cx, z: cz, rot: ang, w: op.width + 0.2, d: 0.9 });
}


export function hitsDoorway(f, walls, openings) {
  for (const op of openings) {
    if (op.type !== "door") continue;
    const wall = walls.find((w) => w.id === op.wallId);
    if (!wall) continue;
    if (aabbOverlap(aabbOf(f), openingClearance(wall, op))) return true;
  }
  return false;
}

export function containsPoint(f, p) {
  if (f.hidden) return false;
  if (f.type === "plant") return dist(p, [f.x, f.z]) <= Math.max(f.w, f.d) / 2 + 0.08;
  const c = Math.cos(-f.rot);
  const s = Math.sin(-f.rot);
  const dx = p[0] - f.x;
  const dz = p[1] - f.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= f.w / 2 + 0.06 && Math.abs(lz) <= f.d / 2 + 0.06;
}

function insideRoom(p, rooms) {
  return rooms.some((r) => pointInPoly(p, r.points));
}

export function snapTank(world, state) {
  const hit = nearestWall(world, state.walls, 6);
  if (!hit || wallLen(hit.wall) < TANK_W + 0.2) {
    return {
      type: "tank",
      x: world[0],
      z: world[1],
      rot: 0,
      w: TANK_W,
      d: TANK_D,
      valid: false,
      reason: "wall",
    };
  }
  const wall = hit.wall;
  const L = wallLen(wall);
  const ang = Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]);
  const half = TANK_W / 2;
  const t = clamp(hit.t, (half + 0.06) / L, 1 - (half + 0.06) / L);
  const cx = wall.a[0] + (wall.b[0] - wall.a[0]) * t;
  const cz = wall.a[1] + (wall.b[1] - wall.a[1]) * t;
  const nx = -Math.sin(ang);
  const nz = Math.cos(ang);
  const inset = WALL_THICK / 2 + TANK_D / 2 + 0.01;
  const p1 = [cx + nx * inset, cz + nz * inset];
  const p2 = [cx - nx * inset, cz - nz * inset];
  const in1 = insideRoom(p1, state.rooms);
  const in2 = insideRoom(p2, state.rooms);
  let pos;
  if (in1 && !in2) pos = p1;
  else if (in2 && !in1) pos = p2;
  else if (in1 && in2) pos = dist(world, p1) <= dist(world, p2) ? p1 : p2;
  else {
    return { type: "tank", x: p1[0], z: p1[1], rot: ang, w: TANK_W, d: TANK_D, valid: false, reason: "room" };
  }
  const item = { type: "tank", x: pos[0], z: pos[1], rot: ang, w: TANK_W, d: TANK_D, valid: true };
  if (hitsDoorway(item, state.walls, state.openings)) {
    item.valid = false;
    item.reason = "door";
  }
  return item;
}

export function placeFurniture(type, world, state, rot = 0) {
  const spec = FURN[type];
  if (!spec) return null;
  if (type === "tank") return snapTank(world, state);
  const g = state.alt ? SNAP_FINE : state.snap || SNAP;
  const pt = snapPt(world, g);
  const item = {
    type,
    x: pt[0],
    z: pt[1],
    rot,
    w: spec.w,
    d: spec.d,
    valid: insideRoom(pt, state.rooms),
    reason: "room",
  };
  if (!item.valid) item.reason = "room";
  else item.reason = "";
  return item;
}

export function moveFurniture(f, world, state) {
  if (f.type === "tank") {
    const s = snapTank(world, state);
    return s;
  }
  return placeFurniture(f.type, world, state, f.rot);
}

function roomByName(rooms, pred) {
  return rooms.find(pred);
}

function seedInRoom(state, type, room, rot = 0) {
  if (!room) return null;
  const spec = FURN[type];
  if (!spec) return null;
  const b = bbox(room.points);
  const insetX = Math.min(spec.w / 2 + 0.45, Math.max(0.4, (b.maxX - b.minX) * 0.28));
  const insetZ = Math.min(spec.d / 2 + 0.45, Math.max(0.4, (b.maxZ - b.minZ) * 0.28));
  const tries = [
    [room.centroid[0], b.minZ + insetZ, 0],
    [room.centroid[0], b.maxZ - insetZ, Math.PI],
    [b.minX + insetX, room.centroid[1], Math.PI / 2],
    [b.maxX - insetX, room.centroid[1], -Math.PI / 2],
    [...room.centroid, rot],
  ];
  for (const [x, z, r] of tries) {
    if (!pointInPoly([x, z], room.points)) continue;
    const item = {
      id: uid("f"),
      type,
      x,
      z,
      rot: r,
      w: spec.w,
      d: spec.d,
      auto: false,
      hidden: false,
    };
    state.furniture.push(item);
    return item;
  }
  state.furniture.push({
    id: uid("f"),
    type,
    x: room.centroid[0],
    z: room.centroid[1],
    rot,
    w: spec.w,
    d: spec.d,
    auto: false,
    hidden: false,
  });
  return state.furniture.at(-1);
}

function seedTank(state) {
  const prefer = ["Living", "Kitchen", "Hall"];
  const rooms = [...state.rooms].sort((a, b) => {
    const ia = prefer.indexOf(a.name);
    const ib = prefer.indexOf(b.name);
    return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
  });
  for (const room of rooms) {
    const b = bbox(room.points);
    const tries = [
      [b.minX + 0.35, (b.minZ + b.maxZ) / 2],
      [b.maxX - 0.35, (b.minZ + b.maxZ) / 2],
      [(b.minX + b.maxX) / 2, b.maxZ - 0.35],
      [(b.minX + b.maxX) / 2, b.minZ + 0.35],
      [...room.centroid],
    ];
    for (const p of tries) {
      const s = snapTank(p, state);
      if (!s.valid) continue;
      state.furniture.push({
        id: uid("f"),
        type: "tank",
        x: s.x,
        z: s.z,
        rot: s.rot,
        w: s.w,
        d: s.d,
        auto: false,
        hidden: false,
      });
      return;
    }
  }
}

export function placeDefaultFurniture(state, include = {}) {
  if (include.plants !== false) ensurePlants(state);
  else {
    for (const f of state.furniture) if (f.type === "plant") f.hidden = true;
  }
  if (include.sofa) {
    seedInRoom(
      state,
      "sofa",
      roomByName(state.rooms, (r) => r.name === "Living") || state.rooms[0],
      0,
    );
  }
  if (include.table) {
    seedInRoom(
      state,
      "table",
      roomByName(state.rooms, (r) => r.name === "Kitchen") ||
        roomByName(state.rooms, (r) => r.name === "Living") ||
        state.rooms[0],
      0,
    );
  }
  if (include.bed) {
    const beds = state.rooms.filter((r) => /^Bedroom/.test(r.name));
    for (const room of beds.length ? beds : state.rooms.filter((r) => r.name === "Living")) {
      seedInRoom(state, "bed", room, 0);
    }
  }
  if (include.tank) seedTank(state);
}

export function drawFurniture2d(ctx, f, cam, toScreen, opts = {}) {
  if (f.hidden) return;
  const ghost = !!opts.ghost;
  const invalid = !!opts.invalid || f.valid === false;
  const selected = !!opts.selected;
  const c = toScreen([f.x, f.z], cam);
  const sx = f.w * cam.zoom;
  const sy = f.d * cam.zoom;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(-f.rot);
  ctx.globalAlpha = ghost ? 0.7 : 1;

  if (f.type === "plant") {
    const r = Math.max(sx, sy) / 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = invalid ? "rgba(143,61,50,0.18)" : selected ? "rgba(47,93,80,0.22)" : "rgba(61,107,79,0.2)";
    ctx.fill();
    ctx.strokeStyle = invalid ? "#8f3d32" : selected ? COLORS.accent : "#3d6b4f";
    ctx.lineWidth = selected ? 2 : 1.2;
    ctx.setLineDash(ghost ? [4, 3] : f.locked ? [3, 2] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#2f5d50";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.35);
    ctx.quadraticCurveTo(-r * 0.55, -r * 0.1, -r * 0.15, -r * 0.7);
    ctx.moveTo(0, r * 0.35);
    ctx.quadraticCurveTo(r * 0.55, -r * 0.05, r * 0.2, -r * 0.72);
    ctx.moveTo(0, r * 0.35);
    ctx.quadraticCurveTo(0.05 * r, -r * 0.4, -0.05 * r, -r * 0.85);
    ctx.stroke();
    ctx.fillStyle = "#a65b3b";
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, r * 0.25);
    ctx.lineTo(r * 0.45, r * 0.25);
    ctx.lineTo(r * 0.32, r * 0.85);
    ctx.lineTo(-r * 0.32, r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  const fill =
    f.type === "tank"
      ? invalid
        ? "rgba(143,61,50,0.16)"
        : "rgba(196, 176, 138, 0.85)"
      : f.type === "bed"
        ? "rgba(232, 224, 212, 0.95)"
        : f.type === "sofa"
          ? "rgba(92, 107, 98, 0.88)"
          : "rgba(166, 138, 96, 0.9)";
  ctx.fillStyle = fill;
  ctx.strokeStyle = invalid ? "#8f3d32" : selected ? COLORS.accent : COLORS.ink;
  ctx.lineWidth = selected ? 2 : 1.2;
  ctx.setLineDash(ghost ? [5, 4] : f.locked ? [3, 2] : []);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(-sx / 2, -sy / 2, sx, sy, Math.min(6, cam.zoom * 0.08));
  else ctx.rect(-sx / 2, -sy / 2, sx, sy);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  if (f.type === "sofa") {
    ctx.fillStyle = "rgba(28,25,23,0.12)";
    ctx.fillRect(-sx / 2, -sy / 2, sx, sy * 0.28);
    ctx.fillRect(-sx / 2, -sy / 2, sx * 0.08, sy);
    ctx.fillRect(sx / 2 - sx * 0.08, -sy / 2, sx * 0.08, sy);
  } else if (f.type === "bed") {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(-sx / 2 + 4, -sy / 2 + 4, sx * 0.22, sy - 8);
    ctx.strokeStyle = "rgba(28,25,23,0.25)";
    ctx.strokeRect(-sx / 2 + 3, -sy / 2 + 3, sx - 6, sy - 6);
  } else if (f.type === "table") {
    ctx.strokeStyle = "rgba(28,25,23,0.35)";
    ctx.strokeRect(-sx / 2 + 6, -sy / 2 + 6, sx - 12, sy - 12);
  } else if (f.type === "tank") {
    ctx.strokeStyle = COLORS.frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(-sx / 2, -sy / 2, sx, sy);
    drawLizard(ctx, Math.min(sx, sy * 1.6));
    if (cam.zoom >= 20 && sx > 48) {
      ctx.fillStyle = COLORS.ink;
      ctx.font = "600 11px IBM Plex Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Blue-tongue", 0, sy * 0.28);
    }
  }

  ctx.restore();
}

function drawLizard(ctx, scale) {
  const s = Math.max(10, scale * 0.42);
  ctx.save();
  ctx.fillStyle = "#4a4530";
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.7, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s * 0.72, 0, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, 0);
  ctx.quadraticCurveTo(-s * 1.15, s * 0.12, -s * 1.28, 0);
  ctx.quadraticCurveTo(-s * 1.15, -s * 0.12, -s * 0.55, 0);
  ctx.fill();
  for (const [lx, ly] of [
    [0.28, 0.28],
    [0.28, -0.28],
    [-0.18, 0.28],
    [-0.18, -0.28],
  ]) {
    ctx.beginPath();
    ctx.ellipse(s * lx, s * ly, s * 0.14, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#2f6aa0";
  ctx.fillRect(s * 0.88, -s * 0.035, s * 0.16, s * 0.07);
  ctx.restore();
}

function hashId(id) {
  let h = 0;
  for (const ch of String(id || "")) h = (h * 33 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function addFurniture3d(THREE, parent, f, selected) {
  const group = new THREE.Group();
  group.position.set(f.x, 0, f.z);
  group.rotation.y = -(f.rot || 0);
  group.userData.furnId = f.id;
  if (f.type !== "plant") {
    const spec = FURN[f.type];
    if (spec) group.scale.set((f.w || spec.w) / spec.w, 1, (f.d || spec.d) / spec.d);
  }
  const accent = selected ? 0x2f5d50 : null;
  if (f.type === "plant") addPlant3d(THREE, group, f, hashId(f.id));
  else if (f.type === "sofa") addSofa3d(THREE, group, selected);
  else if (f.type === "bed") addBed3d(THREE, group, selected);
  else if (f.type === "table") addTable3d(THREE, group, selected);
  else if (f.type === "tank") addTank3d(THREE, group, f, selected);
  if (accent) {
    group.traverse((o) => {
      if (o.material && o.material.emissive) o.material.emissive = new THREE.Color(0x1a3d32);
    });
  }
  parent.add(group);
  return group;
}

function addPlant3d(THREE, group, f, h) {
  const scale = (f.w || 0.45) / 0.45;
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1 * scale, 0.12 * scale, 0.14 * scale, 12),
    new THREE.MeshLambertMaterial({ color: 0xa65b3b }),
  );
  pot.position.y = 0.07 * scale;
  pot.castShadow = true;
  group.add(pot);
  const dirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09 * scale, 0.09 * scale, 0.02, 12),
    new THREE.MeshLambertMaterial({ color: 0x3a2a22 }),
  );
  dirt.position.y = 0.14 * scale;
  group.add(dirt);
  const greens = [0x3d6b4f, 0x4f7d58, 0x2f5d50];
  const n = 3 + (h % 2);
  for (let i = 0; i < n; i++) {
    const r = (0.16 + (i % 3) * 0.04) * scale;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 8),
      new THREE.MeshLambertMaterial({ color: greens[i % greens.length] }),
    );
    const a = (h % 7) * 0.3 + i * 2.1;
    ball.position.set(Math.cos(a) * 0.06 * scale, 0.28 * scale + (i % 2) * 0.08 * scale, Math.sin(a) * 0.06 * scale);
    ball.castShadow = true;
    group.add(ball);
  }
}

function addSofa3d(THREE, group, selected) {
  const cloth = new THREE.MeshLambertMaterial({ color: selected ? 0x4e6a5c : 0x5c6b62 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.38, 0.72), cloth);
  seat.position.set(0, 0.28, 0.04);
  seat.castShadow = true;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.48, 0.18), cloth);
  back.position.set(0, 0.5, -0.32);
  back.castShadow = true;
  group.add(back);
  for (const x of [-1.04, 1.04]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.74), cloth);
    arm.position.set(x, 0.36, 0.02);
    group.add(arm);
  }
  const feet = new THREE.MeshLambertMaterial({ color: 0x3a2e24 });
  for (const [x, z] of [
    [-0.9, 0.28],
    [0.9, 0.28],
    [-0.9, -0.28],
    [0.9, -0.28],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), feet);
    leg.position.set(x, 0.05, z);
    group.add(leg);
  }
}

function addBed3d(THREE, group, selected) {
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4e37 });
  const linen = new THREE.MeshLambertMaterial({ color: selected ? 0xd5e0d6 : 0xe8e0d4 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 1.6), wood);
  base.position.y = 0.16;
  base.castShadow = true;
  group.add(base);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.16, 1.52), linen);
  mattress.position.y = 0.34;
  group.add(mattress);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 1.6), wood);
  head.position.set(-0.96, 0.45, 0);
  group.add(head);
  const pillow = new THREE.MeshLambertMaterial({ color: 0xf4f0e8 });
  for (const z of [-0.32, 0.32]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.52), pillow);
    p.position.set(-0.62, 0.46, z);
    group.add(p);
  }
}

function addTable3d(THREE, group) {
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.8), wood);
  top.position.y = 0.74;
  top.castShadow = true;
  group.add(top);
  for (const [x, z] of [
    [-0.58, -0.3],
    [0.58, -0.3],
    [-0.58, 0.3],
    [0.58, 0.3],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), wood);
    leg.position.set(x, 0.36, z);
    leg.castShadow = true;
    group.add(leg);
  }
}

function addTank3d(THREE, group, f, selected) {
  const w = f.w || TANK_W;
  const d = f.d || TANK_D;
  const h = 0.52;
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({
      color: selected ? 0x9ec4b8 : 0xb7cdd4,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  glass.position.y = h / 2;
  group.add(glass);
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.02, 0.03, d + 0.02),
    new THREE.MeshLambertMaterial({ color: 0x2c2a28 }),
  );
  rim.position.y = h;
  group.add(rim);
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.05, 0.05, d - 0.05),
    new THREE.MeshLambertMaterial({ color: 0xd2b48c }),
  );
  sand.position.y = 0.04;
  group.add(sand);
  const hide = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.14, 0.24),
    new THREE.MeshLambertMaterial({ color: 0x6b5344 }),
  );
  hide.position.set(-w * 0.28, 0.11, 0);
  group.add(hide);
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.08, 0.03, 12),
    new THREE.MeshLambertMaterial({ color: 0x4a7ea8 }),
  );
  dish.position.set(w * 0.22, 0.08, d * 0.18);
  group.add(dish);
  const skink = skinkMesh(THREE);
  skink.position.set(0.12, 0.07, -0.02);
  group.add(skink);
}

function skinkMesh(THREE) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x5a5138 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.14), mat);
  body.position.set(0.04, 0.06, 0);
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.11), mat);
  head.position.set(0.28, 0.07, 0);
  g.add(head);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.06), mat);
  tail.position.set(-0.28, 0.05, 0);
  tail.rotation.z = 0.18;
  g.add(tail);
  for (const [x, z] of [
    [0.12, 0.09],
    [0.12, -0.09],
    [-0.08, 0.09],
    [-0.08, -0.09],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.08), mat);
    leg.position.set(x, 0.03, z);
    g.add(leg);
  }
  const tongue = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.012, 0.022),
    new THREE.MeshLambertMaterial({ color: 0x2f6aa0 }),
  );
  tongue.position.set(0.36, 0.055, 0);
  g.add(tongue);
  return g;
}
