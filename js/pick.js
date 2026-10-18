import { containsPoint } from "./furniture.js";
import { nearestWall, pointInPoly, wallLen } from "./geom.js";
import { pointInDeck, pointInStep } from "./elements.js";
import { pointInEquipment } from "./power.js";

export function selectedObj(state) {
  const sel = state.selection;
  if (!sel) return null;
  if (sel.kind === "furniture") return state.furniture.find((f) => f.id === sel.id) || null;
  if (sel.kind === "wall") return state.walls.find((w) => w.id === sel.id) || null;
  if (sel.kind === "opening") return state.openings.find((o) => o.id === sel.id) || null;
  if (sel.kind === "room") return state.rooms.find((r) => r.id === sel.id) || null;
  if (sel.kind === "deck") return (state.decks || []).find((d) => d.id === sel.id) || null;
  if (sel.kind === "steps") return (state.steps || []).find((s) => s.id === sel.id) || null;
  if (sel.kind === "stump") return (state.stumps || []).find((s) => s.id === sel.id) || null;
  if (sel.kind === "equipment") return (state.equipment || []).find((e) => e.id === sel.id) || null;
  return null;
}

export function objectBy(state, kind, id) {
  if (kind === "furniture") return state.furniture.find((f) => f.id === id) || null;
  if (kind === "wall") return state.walls.find((w) => w.id === id) || null;
  if (kind === "opening") return state.openings.find((o) => o.id === id) || null;
  if (kind === "room") return state.rooms.find((r) => r.id === id) || null;
  if (kind === "deck") return (state.decks || []).find((d) => d.id === id) || null;
  if (kind === "steps") return (state.steps || []).find((s) => s.id === id) || null;
  if (kind === "stump") return (state.stumps || []).find((s) => s.id === id) || null;
  if (kind === "equipment") return (state.equipment || []).find((e) => e.id === id) || null;
  return null;
}

export function pickHit(state, world, screen, view) {
  const coarse = !!view?.coarse;
  const handleR = coarse ? 22 : 10;
  const furnPad = coarse ? 0.18 : 0.06;
  const wallTol = coarse ? 0.45 : 0.28;
  const openTol = coarse ? 0.4 : 0.25;
  const o = { x: (view?.width || 1) / 2, y: (view?.height || 1) / 2 };
  if (state.selection?.kind === "wall") {
    const wall = state.walls.find((w) => w.id === state.selection.id);
    if (wall) {
      for (const which of ["a", "b"]) {
        const p = wall[which];
        const sx = o.x + (p[0] - state.camera2d.x) * state.camera2d.zoom;
        const sy = o.y - (p[1] - state.camera2d.z) * state.camera2d.zoom;
        if (Math.hypot(sx - screen.x, sy - screen.y) <= handleR) return { kind: "handle", wallId: wall.id, which };
      }
    }
  }
  for (const f of state.furniture) {
    if (containsPoint(f, world, furnPad)) return { kind: "furniture", id: f.id };
  }
  for (const op of state.openings) {
    const wall = state.walls.find((w) => w.id === op.wallId);
    if (!wall) continue;
    const L = wallLen(wall);
    const a = [
      wall.a[0] + (wall.b[0] - wall.a[0]) * (op.t - op.width / 2 / L),
      wall.a[1] + (wall.b[1] - wall.a[1]) * (op.t - op.width / 2 / L),
    ];
    const b = [
      wall.a[0] + (wall.b[0] - wall.a[0]) * (op.t + op.width / 2 / L),
      wall.a[1] + (wall.b[1] - wall.a[1]) * (op.t + op.width / 2 / L),
    ];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((world[0] - a[0]) * dx + (world[1] - a[1]) * dz) / l2));
    const q = [a[0] + dx * t, a[1] + dz * t];
    if (Math.hypot(world[0] - q[0], world[1] - q[1]) < openTol) return { kind: "opening", id: op.id };
  }
  for (const eq of state.equipment || []) {
    if (eq.kind === "array") continue;
    if (pointInEquipment(world, eq)) return { kind: "equipment", id: eq.id };
  }
  for (const s of state.stumps || []) {
    const r = Math.max(0.12, (s.size || 0.15) / 2) + (coarse ? 0.12 : 0.04);
    if (Math.hypot(world[0] - s.x, world[1] - s.z) <= r) return { kind: "stump", id: s.id };
  }
  for (const step of state.steps || []) {
    if (pointInStep(world, step)) return { kind: "steps", id: step.id };
  }
  const nw = nearestWall(world, state.walls, wallTol);
  if (nw) return { kind: "wall", id: nw.wall.id };
  for (const eq of state.equipment || []) {
    if (eq.kind !== "array") continue;
    if (pointInEquipment(world, eq)) return { kind: "equipment", id: eq.id };
  }
  for (const d of state.decks || []) {
    if (pointInDeck(world, d)) return { kind: "deck", id: d.id };
  }
  const room = state.rooms.find((r) => pointInPoly(world, r.points));
  if (room) return { kind: "room", id: room.id };
  return null;
}
