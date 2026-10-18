import {
  DOOR_H,
  DOOR_W,
  SNAP_FINE,
  STUMP_HEIGHT,
  STUMP_SIZE,
  WIN_H,
  WIN_SILL,
  WIN_W,
} from "./constants.js";
import { normalizeDeck, stumpGrid } from "./elements.js";
import { ARRAY_TILT, EQUIP, defaultPower, normalizeEquip } from "./power.js";
import {
  FURN,
  cloneFurn,
  ensurePlants,
  placeFurniture,
  snapTank,
} from "./furniture.js";
import {
  axisAlign,
  bounds,
  clamp,
  clampOpening,
  dist,
  mergeCollinear,
  nearestWall,
  openingFits,
  planarize,
  pointInPoly,
  projectOnSeg,
  rebindOpenings,
  snapPt,
  uid,
  wallLen,
} from "./geom.js";
import { objectBy } from "./pick.js";

export function createCommands(state, api) {
  function edit(fn) {
    api.checkpoint();
    const ok = fn();
    if (ok === false) {
      state.past.pop();
      api.render();
      return;
    }
    api.commit();
  }

  function addFurniture(ghost) {
    const spec = FURN[ghost.type];
    state.furniture.push({
      id: uid("f"),
      type: ghost.type,
      x: ghost.x,
      z: ghost.z,
      rot: ghost.rot || 0,
      w: ghost.w || spec?.w || 0.45,
      d: ghost.d || spec?.d || 0.45,
      auto: false,
      hidden: false,
    });
    state.selection = { kind: "furniture", id: state.furniture.at(-1).id };
  }

  function removeFurniture(id) {
    const f = state.furniture.find((x) => x.id === id);
    if (!f) return;
    if (f.type === "plant" && f.auto) f.hidden = true;
    else state.furniture = state.furniture.filter((x) => x.id !== id);
    if (state.selection?.kind === "furniture" && state.selection.id === id) state.selection = null;
  }

  function addWall(a, b) {
    if (dist(a, b) < 0.2) return;
    const oldWalls = state.walls;
    state.walls = planarize(mergeCollinear([...state.walls, { id: uid("w"), a: [...a], b: [...b] }], state.pins || []));
    state.openings = rebindOpenings(state.openings, oldWalls, state.walls);
    api.refreshRooms();
    ensurePlants(state);
  }

  function placeOpening(world, type) {
    const hit = nearestWall(world, state.walls, 0.45);
    if (!hit) return;
    const width = type === "door" ? DOOR_W : WIN_W;
    if (!openingFits(hit.wall, hit.t, Math.min(width, wallLen(hit.wall) - 0.2))) return;
    const w = Math.min(width, wallLen(hit.wall) - 0.2);
    api.checkpoint();
    state.openings.push({
      id: uid(type === "door" ? "d" : "win"),
      type,
      wallId: hit.wall.id,
      t: clampOpening(hit.wall, hit.t, w),
      width: w,
      height: type === "door" ? DOOR_H : WIN_H,
      sill: type === "door" ? 0 : WIN_SILL,
    });
    state.selection = { kind: "opening", id: state.openings.at(-1).id };
    api.commit();
  }

  function deleteHit(hit) {
    if (!hit) return;
    if (hit.kind === "furniture") {
      api.checkpoint();
      removeFurniture(hit.id);
      api.commit();
      return;
    }
    if (hit.kind === "opening") {
      api.checkpoint();
      state.openings = state.openings.filter((o) => o.id !== hit.id);
      api.commit();
      return;
    }
    if (hit.kind === "wall") {
      api.checkpoint();
      state.openings = state.openings.filter((o) => o.wallId !== hit.id);
      state.walls = state.walls.filter((w) => w.id !== hit.id);
      api.refreshRooms();
      api.commit();
      return;
    }
    if (hit.kind === "deck" || hit.kind === "steps" || hit.kind === "stump") {
      api.checkpoint();
      removeSite(hit.kind, hit.id);
      api.commit();
      return;
    }
    if (hit.kind === "equipment") {
      api.checkpoint();
      removeEquip(hit.id);
      api.commit();
    }
  }

  function removeSite(kind, id) {
    if (kind === "deck") state.decks = state.decks.filter((d) => d.id !== id);
    if (kind === "steps") state.steps = state.steps.filter((d) => d.id !== id);
    if (kind === "stump") state.stumps = state.stumps.filter((d) => d.id !== id);
    if (state.selection?.kind === kind && state.selection.id === id) state.selection = null;
  }

  function removeEquip(id) {
    state.equipment = (state.equipment || []).filter((e) => e.id !== id);
    if (state.selection?.kind === "equipment" && state.selection.id === id) state.selection = null;
  }

  function markPower() {
    if (!state.power) state.power = defaultPower();
    state.power.configured = true;
  }

  function placeDeck(draft) {
    const d = normalizeDeck(draft);
    if (d.w < 0.4 || d.d < 0.4) return false;
    state.decks.push({
      id: uid("deck"),
      kind: draft.kind === "veranda" ? "veranda" : "deck",
      name: draft.name || (draft.kind === "veranda" ? "Veranda" : "Deck"),
      x: d.x,
      z: d.z,
      w: d.w,
      d: d.d,
    });
    state.selection = { kind: "deck", id: state.decks.at(-1).id };
    return true;
  }

  function placeSteps(world, rot = Math.PI / 2) {
    const g = state.alt ? SNAP_FINE : state.snap;
    const p = snapPt(world, g);
    state.steps.push({
      id: uid("steps"),
      x: p[0],
      z: p[1],
      rot,
      width: 1.2,
      count: 3,
      rise: 0.15,
      going: 0.28,
    });
    state.selection = { kind: "steps", id: state.steps.at(-1).id };
  }

  function placeArray(draft) {
    const d = normalizeEquip(draft);
    if (d.w < 0.6 || d.d < 0.6) return false;
    markPower();
    state.equipment.push({
      id: uid("eq"),
      kind: "array",
      name: EQUIP.array.label,
      mount: "ground",
      x: d.x,
      z: d.z,
      w: d.w,
      d: d.d,
      tilt: ARRAY_TILT,
      azimuth: 0,
    });
    state.selection = { kind: "equipment", id: state.equipment.at(-1).id };
    return true;
  }

  function placeEquip(kind, world) {
    const spec = EQUIP[kind];
    if (!spec || kind === "array") return false;
    const g = state.alt ? SNAP_FINE : state.snap;
    const p = snapPt(world, g);
    markPower();
    state.equipment.push({
      id: uid("eq"),
      kind,
      name: spec.label,
      mount: "ground",
      x: p[0] - spec.w / 2,
      z: p[1] - spec.d / 2,
      w: spec.w,
      d: spec.d,
      tilt: 0,
      azimuth: 0,
    });
    state.selection = { kind: "equipment", id: state.equipment.at(-1).id };
    return true;
  }

  function placeStump(world) {
    const g = state.alt ? SNAP_FINE : state.snap;
    const p = snapPt(world, g);
    if ((state.stumps || []).some((s) => Math.hypot(s.x - p[0], s.z - p[1]) < 0.2)) return false;
    state.stumps.push({ id: uid("stump"), x: p[0], z: p[1], size: STUMP_SIZE, height: STUMP_HEIGHT });
    state.selection = { kind: "stump", id: state.stumps.at(-1).id };
    return true;
  }

  function fillStumps() {
    const b = bounds(state.walls);
    if (!b) {
      api.flash("Draw the house before the stump grid");
      return false;
    }
    const grid = stumpGrid(b);
    const have = new Set((state.stumps || []).map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`));
    let added = 0;
    for (const s of grid) {
      const k = `${s.x.toFixed(3)},${s.z.toFixed(3)}`;
      if (have.has(k)) continue;
      state.stumps.push(s);
      added += 1;
    }
    if (!added) {
      api.flash("Stump grid already filled");
      return false;
    }
    return true;
  }

  function refitOpenings(wall) {
    const L = wallLen(wall);
    for (const op of state.openings) {
      if (op.wallId !== wall.id) continue;
      op.width = Math.min(op.width, Math.max(0.35, L - 0.2));
      op.t = clampOpening(wall, op.t, op.width);
    }
  }

  function setWallLength(wall, len) {
    const L = wallLen(wall);
    if (!(L > 1e-6)) return;
    len = clamp(len, 0.4, 40);
    const dx = (wall.b[0] - wall.a[0]) / L;
    const dz = (wall.b[1] - wall.a[1]) / L;
    const nb = [wall.a[0] + dx * len, wall.a[1] + dz * len];
    const oldB = [...wall.b];
    const delta = [nb[0] - oldB[0], nb[1] - oldB[1]];
    if (Math.hypot(delta[0], delta[1]) < 1e-6) return;
    const hits = [];
    for (const w of state.walls) {
      for (const which of ["a", "b"]) {
        if (dist(w[which], oldB) < 1e-3) hits.push([w, which]);
      }
    }
    const moved = [oldB[0] + delta[0], oldB[1] + delta[1]];
    for (const [w, which] of hits) w[which] = [...moved];
    state.pins = (state.pins || []).map((p) => (dist(p, oldB) < 1e-3 ? [...moved] : p));
    for (const w of state.walls) refitOpenings(w);
    api.refreshRooms();
  }

  function duplicateFurn(f) {
    const copy = cloneFurn(f);
    copy.id = uid("f");
    copy.auto = false;
    copy.locked = false;
    let placed = false;
    for (const [dx, dz] of [
      [0.4, 0.4],
      [0.45, 0],
      [0, 0.45],
      [-0.4, 0.3],
    ]) {
      const x = f.x + dx;
      const z = f.z + dz;
      if (f.type === "tank") {
        const s = snapTank([x, z], state);
        if (!s.valid) continue;
        copy.x = s.x;
        copy.z = s.z;
        copy.rot = s.rot;
        copy.w = s.w;
        copy.d = s.d;
        placed = true;
        break;
      }
      if (state.rooms.some((r) => pointInPoly([x, z], r.points))) {
        copy.x = x;
        copy.z = z;
        placed = true;
        break;
      }
    }
    if (!placed) {
      copy.x = f.x + 0.4;
      copy.z = f.z + 0.4;
    }
    state.furniture.push(copy);
    state.selection = { kind: "furniture", id: copy.id };
  }

  function changeFurnType(f, type) {
    if (!type || type === f.type || !FURN[type]) return false;
    if (type === "tank") {
      const s = snapTank([f.x, f.z], state);
      if (!s.valid) {
        api.flash(s.reason === "door" ? "Doorway is in the way" : "Needs a clear wall");
        return false;
      }
      f.type = "tank";
      f.x = s.x;
      f.z = s.z;
      f.rot = s.rot;
      f.w = s.w;
      f.d = s.d;
      f.auto = false;
      return true;
    }
    const spec = FURN[type];
    f.type = type;
    f.w = spec.w;
    f.d = spec.d;
    f.auto = false;
    if (type === "plant") f.rot = 0;
    return true;
  }

  function splitWall(wall, t) {
    t = clamp(t, 0.08, 0.92);
    const p = [wall.a[0] + (wall.b[0] - wall.a[0]) * t, wall.a[1] + (wall.b[1] - wall.a[1]) * t];
    const L = wallLen(wall);
    const w1 = { id: wall.id, a: [...wall.a], b: [...p] };
    const w2 = { id: uid("w"), a: [...p], b: [...wall.b] };
    for (const op of state.openings) {
      if (op.wallId !== wall.id) continue;
      const along = op.t * L;
      const host = along <= t * L ? w1 : w2;
      const local = host === w1 ? along : along - t * L;
      const hostL = Math.max(wallLen(host), 1e-6);
      op.wallId = host.id;
      op.width = Math.min(op.width, Math.max(0.35, hostL * 0.72));
      op.t = clampOpening(host, local / hostL, op.width);
    }
    const i = state.walls.findIndex((w) => w.id === wall.id);
    state.walls.splice(i, 1, w1, w2);
    state.pins = state.pins || [];
    state.pins.push(p);
    state.selection = { kind: "wall", id: w1.id };
  }

  function addOpeningOn(wall, type) {
    const L = wallLen(wall);
    const want = type === "door" ? DOOR_W : WIN_W;
    if (L < want + 0.2) {
      api.flash("Wall is too short");
      return false;
    }
    const width = Math.min(want, L - 0.2);
    const op = {
      id: uid(type === "door" ? "d" : "win"),
      type,
      wallId: wall.id,
      width,
      t: clampOpening(wall, 0.5, width),
      height: type === "door" ? DOOR_H : WIN_H,
      sill: type === "door" ? 0 : WIN_SILL,
    };
    state.openings.push(op);
    state.selection = { kind: "opening", id: op.id };
    return true;
  }

  function splitParam(wall) {
    if (!state.menuAt) return null;
    const pr = projectOnSeg(state.menuAt, wall.a, wall.b);
    if (pr.dist > 0.45 || pr.t < 0.12 || pr.t > 0.88) return null;
    return pr.t;
  }

  function runFurn(f, act, ds) {
    if (act === "nudge") {
      const dx = Number(ds.x || 0) * 0.1;
      const dz = Number(ds.z || 0) * 0.1;
      edit(() => {
        if (f.type === "tank") {
          const s = snapTank([f.x + dx, f.z + dz], state);
          if (!s.valid) {
            api.flash(s.reason === "door" ? "Doorway is in the way" : "Needs a clear wall");
            return false;
          }
          f.x = s.x;
          f.z = s.z;
          f.rot = s.rot;
          return;
        }
        f.x += dx;
        f.z += dz;
      });
      return;
    }
    edit(() => {
      if (act === "rot90") f.rot = (f.rot || 0) + Math.PI / 2;
      else if (act === "rot45") f.rot = (f.rot || 0) + Math.PI / 4;
      else if (act === "turn") f.rot = (f.rot || 0) + Math.PI;
      else if (act === "mirror") f.rot = -(f.rot || 0);
      else if (act === "swap") {
        const w = f.w;
        f.w = f.d;
        f.d = w;
      } else if (act === "align") {
        const hit = nearestWall([f.x, f.z], state.walls, 4);
        if (!hit) {
          api.flash("No wall nearby");
          return false;
        }
        f.rot = Math.atan2(hit.wall.b[1] - hit.wall.a[1], hit.wall.b[0] - hit.wall.a[0]);
      } else if (act === "realign") {
        const s = snapTank([f.x, f.z], state);
        if (!s.valid) {
          api.flash(s.reason === "door" ? "Doorway is in the way" : "Needs a clear wall");
          return false;
        }
        f.x = s.x;
        f.z = s.z;
        f.rot = s.rot;
        f.w = s.w;
        f.d = s.d;
      } else if (act === "dup") duplicateFurn(f);
      else if (act === "center") {
        const room = state.rooms.find((r) => pointInPoly([f.x, f.z], r.points));
        if (!room) {
          api.flash("Not inside a room");
          return false;
        }
        f.x = room.centroid[0];
        f.z = room.centroid[1];
      } else if (act === "reset") {
        const spec = FURN[f.type];
        if (!spec) return false;
        f.w = spec.w;
        f.d = spec.d;
      } else if (act === "lock") f.locked = !f.locked;
      else if (act === "hide") {
        f.hidden = true;
        state.selection = null;
      } else if (act === "retype") return changeFurnType(f, ds.type);
      else if (act === "del") removeFurniture(f.id);
      else return false;
    });
  }

  function runWall(wall, act) {
    edit(() => {
      if (act === "split-half") splitWall(wall, 0.5);
      else if (act === "split-here") {
        const t = splitParam(wall);
        if (t == null) return false;
        splitWall(wall, t);
      } else if (act === "straighten") {
        const aligned = axisAlign(wall.a, wall.b);
        if (dist(aligned, wall.b) < 1e-4) {
          api.flash("Already straight");
          return false;
        }
        wall.b = [...aligned];
        refitOpenings(wall);
      } else if (act === "add-door") return addOpeningOn(wall, "door");
      else if (act === "add-window") return addOpeningOn(wall, "window");
      else if (act === "del") {
        state.openings = state.openings.filter((o) => o.wallId !== wall.id);
        state.walls = state.walls.filter((w) => w.id !== wall.id);
        state.selection = null;
      } else return false;
    });
  }

  function runOpening(op, act) {
    const wall = state.walls.find((w) => w.id === op.wallId);
    if (!wall) return;
    edit(() => {
      if (act === "center-op") op.t = clampOpening(wall, 0.5, op.width);
      else if (act === "widen") {
        op.width = Math.max(0.4, wallLen(wall) - 0.24);
        op.t = clampOpening(wall, 0.5, op.width);
      } else if (act === "to-window") {
        op.type = "window";
        op.height = WIN_H;
        op.sill = WIN_SILL;
        op.width = Math.min(Math.max(op.width, 0.6), Math.max(0.5, wallLen(wall) - 0.2));
        op.t = clampOpening(wall, op.t, op.width);
      } else if (act === "to-door") {
        op.type = "door";
        op.height = DOOR_H;
        op.sill = 0;
        op.width = Math.min(DOOR_W, Math.max(0.5, wallLen(wall) - 0.2));
        op.t = clampOpening(wall, op.t, op.width);
      } else if (act === "del") {
        state.openings = state.openings.filter((o) => o.id !== op.id);
        state.selection = null;
      } else return false;
    });
  }

  function runRoom(room, act) {
    if (act === "rename") {
      state.focusField = "name";
      api.markInspectorDirty();
      api.render();
      return;
    }
    const plants = state.furniture.filter((f) => f.type === "plant" && pointInPoly([f.x, f.z], room.points));
    if (!plants.length) {
      api.flash("No plants in this room");
      return;
    }
    edit(() => {
      if (act === "plants-hide") plants.forEach((f) => (f.hidden = true));
      else if (act === "plants-show") plants.forEach((f) => (f.hidden = false));
      else return false;
    });
  }

  function runEquip(obj, act) {
    edit(() => {
      if (act === "del") {
        removeEquip(obj.id);
        return;
      }
      if (act === "mount-ground" || act === "mount-deck" || act === "mount-flat") {
        obj.mount = act.slice("mount-".length);
        return;
      }
      return false;
    });
  }

  function runSite(obj, act) {
    edit(() => {
      if (act === "del") {
        removeSite(state.selection.kind, obj.id);
        return;
      }
      if (act === "veranda" && state.selection.kind === "deck") {
        obj.kind = obj.kind === "veranda" ? "deck" : "veranda";
        if (!obj.name || obj.name === "Deck" || obj.name === "Veranda") obj.name = obj.kind === "veranda" ? "Veranda" : "Deck";
        return;
      }
      if (act === "rot90" && state.selection.kind === "steps") {
        obj.rot = (obj.rot || 0) + Math.PI / 2;
        return;
      }
      return false;
    });
  }

  function runAction(act, ds) {
    const sel = state.selection;
    const obj = objectBy(state, sel?.kind, sel?.id);
    if (!sel || !obj) return;
    if (sel.kind === "furniture") runFurn(obj, act, ds);
    else if (sel.kind === "wall") runWall(obj, act);
    else if (sel.kind === "opening") runOpening(obj, act);
    else if (sel.kind === "room") runRoom(obj, act);
    else if (sel.kind === "deck" || sel.kind === "steps" || sel.kind === "stump") runSite(obj, act);
    else if (sel.kind === "equipment") runEquip(obj, act);
  }

  return {
    edit,
    addFurniture,
    removeFurniture,
    addWall,
    placeOpening,
    deleteHit,
    placeDeck,
    placeSteps,
    placeStump,
    placeArray,
    placeEquip,
    fillStumps,
    setWallLength,
    refitOpenings,
    splitParam,
    runAction,
    placeFurniture,
  };
}
