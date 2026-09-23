import {
  DOOR_H,
  DOOR_W,
  SNAP,
  SNAP_FINE,
  STORAGE_KEY,
  WIN_H,
  WIN_SILL,
  WIN_W,
} from "./constants.js";
import {
  assignLabels,
  axisAlign,
  clamp,
  clampOpening,
  computeRooms,
  deserializePlan,
  dist,
  fmt,
  fmtArea,
  insetArea,
  joinPoint,
  labelsFromRooms,
  mergeCollinear,
  nearestWall,
  openingFits,
  planarize,
  pointInPoly,
  projectOnSeg,
  rebindOpenings,
  serializePlan,
  snapPt,
  uid,
  wallLen,
} from "./geom.js";
import { PRESETS, familyPlan, generateFromSpec, parseBrief, studioPlan, twoBedPlan } from "./generate.js";
import { createPlan2D } from "./plan2d.js";
import {
  FURN,
  cloneFurn,
  containsPoint,
  ensurePlants,
  furnLabel,
  moveFurniture,
  placeDefaultFurniture,
  placeFurniture,
  snapTank,
} from "./furniture.js";

const ICONS = {
  select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4 l14 8 -8 2 -2 8 z"/></svg>`,
  wall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 18 V6 h4 v12 H4zm6 0 V10 h4 v8 h-4zm6 0 V8 h4 v10 h-4z"/></svg>`,
  door: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 20 V5 h10 v15"/><path d="M14.5 12.5 h.01"/><path d="M8 20 h10"/></svg>`,
  window: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="5" width="14" height="14" rx="1"/><path d="M12 5 v14 M5 12 h14"/></svg>`,
  room: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 16 V8 l7-3 7 3 v8"/><path d="M9 16 v-4 h6 v4"/></svg>`,
  del: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 8 h12 l-1 12 H7z"/><path d="M9 8 V6 h6 v2"/><path d="M10 11 v6 M14 11 v6"/></svg>`,
  gen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 4 v3 M12 17 v3 M4 12 h3 M17 12 h3"/><circle cx="12" cy="12" r="4.5"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 8 H5 v3"/><path d="M6 10 c2-4 12-4 14 3"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M16 8 h3 v3"/><path d="M18 10 c-2-4 -12-4 -14 3"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 4 h7 l5 5 v11 H7z"/><path d="M14 4 v5 h5"/></svg>`,
  furnish: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 13 h14 v6 H5z"/><path d="M7 13 V8 h10 v5"/><path d="M8 19 v2 M16 19 v2"/></svg>`,
  plant: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 20 h6 l-1.1-6 H10.1z"/><path d="M12 14 c0-6 4-8 4-8 s0 5-4 8"/><path d="M12 14 c0-6 -4-8 -4-8 s0 5 4 8"/><path d="M12 14 c-1.5-5 2-8 2-8"/></svg>`,
  sofa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="11" width="16" height="6" rx="1.4"/><path d="M6 11 V8 h12 v3"/><path d="M7 17 v2 M17 17 v2"/></svg>`,
  bed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 16 V10 h16 v6"/><path d="M4 10 V7 h6 v3"/><path d="M3 16 h18"/></svg>`,
  table: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="8" width="16" height="3" rx="0.4"/><path d="M6 11 v8 M18 11 v8"/></svg>`,
  lizard: `<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="13.5" rx="3" ry="6.2"/><circle cx="12" cy="6.2" r="2.1"/><ellipse cx="6.8" cy="10.5" rx="2.4" ry="1"/><ellipse cx="17.2" cy="10.5" rx="2.4" ry="1"/><ellipse cx="7.2" cy="16.5" rx="2.2" ry="0.9"/><ellipse cx="16.8" cy="16.5" rx="2.2" ry="0.9"/><rect x="11.2" y="3.2" width="1.6" height="1.4" rx="0.4" fill="#2f6aa0"/></svg>`,
};

export function mount(root) {
  if (!root) return () => {};
  root.innerHTML = shellHtml();
  const $ = (sel) => root.querySelector(sel);
  const canvas2d = $("#plan-canvas");
  const canvas3d = $("#view-canvas");
  const status = $("#status");
  const pop = $("#popover");
  const appEl = root.querySelector(".app");
  fillPalette();

  const state = {
    walls: [],
    openings: [],
    labels: [],
    rooms: [],
    furniture: [],
    tool: "wall",
    furnish: "plant",
    view: "split",
    snap: SNAP,
    space: false,
    alt: false,
    selection: null,
    chain: null,
    preview: null,
    ghost: null,
    camera2d: { x: 8, z: 6, zoom: 36 },
    past: [],
    future: [],
    pins: [],
    note: "",
    menuAt: null,
    focusField: null,
  };

  let view3d = null;
  let dragging = null;
  let inspectorSig = "";
  let flashTimer = 0;

  function roomsOf() {
    return assignLabels(computeRooms(state.walls), state.labels);
  }

  function refreshRooms() {
    state.rooms = roomsOf();
    state.labels = labelsFromRooms(state.rooms);
  }

  function snapshot() {
    return {
      walls: state.walls.map((w) => ({ ...w, a: [...w.a], b: [...w.b] })),
      openings: state.openings.map((o) => ({ ...o })),
      labels: state.labels.map((l) => ({ ...l, at: [...l.at] })),
      furniture: state.furniture.map(cloneFurn),
      pins: (state.pins || []).map((p) => [...p]),
    };
  }

  function applySnap(s) {
    state.walls = s.walls;
    state.openings = s.openings;
    state.labels = s.labels;
    state.furniture = s.furniture || [];
    state.pins = (s.pins || []).map((p) => [...p]);
    refreshRooms();
  }

  function checkpoint() {
    state.past.push(snapshot());
    if (state.past.length > 60) state.past.shift();
    state.future = [];
  }

  function prunePins() {
    const verts = [];
    for (const w of state.walls) verts.push(w.a, w.b);
    state.pins = (state.pins || []).filter((p) => verts.some((v) => dist(v, p) < 1e-3));
  }

  function commit() {
    const oldWalls = state.walls;
    state.walls = mergeCollinear(planarize(state.walls), state.pins || []);
    state.openings = rebindOpenings(state.openings, oldWalls, state.walls);
    prunePins();
    refreshRooms();
    persist();
    render();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializePlan({ ...state, rooms: state.rooms })));
    } catch {
      /* ignore */
    }
  }

  function loadPlan(plan, pushHistory) {
    if (pushHistory) {
      state.past.push(snapshot());
      state.future = [];
    }
    state.walls = plan.walls;
    state.openings = plan.openings;
    state.labels = plan.labels;
    state.furniture = (plan.furniture || []).map(cloneFurn);
    state.pins = (plan.pins || []).map((p) => [p[0], p[1]]);
    state.chain = null;
    state.preview = null;
    state.ghost = null;
    state.selection = null;
    state.menuAt = null;
    state.focusField = null;
    state.note = "";
    refreshRooms();
    ensurePlants(state);
    persist();
    state.tool = "select";
    render();
    requestAnimationFrame(() => {
      plan2d.fit();
      view3d?.fit(state);
    });
  }

  const actions = {
    setCamera2d(c) {
      state.camera2d = c;
      plan2d.draw();
    },
    pointerDown(world, screen) {
      hideMenu();
      const g = state.alt ? SNAP_FINE : state.snap;
      if (state.tool === "furnish") {
        const placed = placeFurniture(state.furnish, world, state, state.ghost?.rot || 0);
        state.ghost = placed;
        dragging = { type: "place", rot: placed?.rot || 0 };
        render();
        return;
      }
      if (state.tool === "wall") {
        const p = joinPoint(snapPt(world, g), state.walls, g);
        if (!state.chain) {
          state.chain = [p];
          state.preview = p;
        } else {
          const last = state.chain[state.chain.length - 1];
          const aligned = axisAlign(last, p);
          const end = joinPoint(snapPt(aligned, g), state.walls, g);
        if (dist(end, state.chain[0]) < g && state.chain.length >= 3) {
            checkpoint();
            addWall(last, state.chain[0]);
            state.chain = null;
            state.preview = null;
            commit();
            return;
          }
          if (dist(last, end) >= g) {
            checkpoint();
            addWall(last, end);
            state.chain.push(end);
            commit();
          }
        }
        render();
        return;
      }
      if (state.tool === "door" || state.tool === "window") {
        placeOpening(world, state.tool);
        return;
      }
      if (state.tool === "room") {
        const room = state.rooms.find((r) => pointInPoly(world, r.points));
        if (room) namePopover(room, screen);
        return;
      }
      if (state.tool === "delete") {
        deleteAt(world);
        return;
      }
      const hit = pick(world, screen);
      if (hit?.kind === "handle") {
        checkpoint();
        dragging = { type: "handle", wallId: hit.wallId, which: hit.which };
        state.selection = { kind: "wall", id: hit.wallId };
        return;
      }
      if (hit?.kind === "furniture") {
        const item = state.furniture.find((f) => f.id === hit.id);
        state.selection = { kind: "furniture", id: hit.id };
        if (item?.locked) {
          render();
          return;
        }
        checkpoint();
        dragging = { type: "furniture", id: hit.id };
        render();
        return;
      }
      if (hit?.kind === "opening") {
        checkpoint();
        dragging = { type: "opening", id: hit.id };
        state.selection = { kind: "opening", id: hit.id };
        render();
        return;
      }
      if (hit?.kind === "wall") {
        state.selection = { kind: "wall", id: hit.id };
        render();
        return;
      }
      if (hit?.kind === "room") {
        state.selection = { kind: "room", id: hit.id };
        render();
        return;
      }
      state.selection = null;
      render();
    },
    pointerMove(world) {
      const g = state.alt ? SNAP_FINE : state.snap;
      if (state.tool === "furnish" && (!dragging || dragging.type === "place")) {
        state.ghost = placeFurniture(state.furnish, world, state, state.ghost?.rot || dragging?.rot || 0);
        plan2d.draw();
        updateStatus();
        return;
      }
      if (state.chain) {
        const last = state.chain[state.chain.length - 1];
        state.preview = joinPoint(snapPt(axisAlign(last, world), g), state.walls, g);
        plan2d.draw();
        updateStatus();
        return;
      }
      if (dragging?.type === "handle") {
        const wall = state.walls.find((w) => w.id === dragging.wallId);
        if (!wall) return;
        const p = joinPoint(snapPt(world, g), state.walls.filter((w) => w.id !== wall.id), g);
        wall[dragging.which] = p;
        refreshRooms();
        render();
        return;
      }
      if (dragging?.type === "furniture") {
        const item = state.furniture.find((f) => f.id === dragging.id);
        if (!item) return;
        const placed = moveFurniture(item, world, state);
        if (placed?.valid) {
          item.x = placed.x;
          item.z = placed.z;
          item.rot = placed.rot;
          item.w = placed.w;
          item.d = placed.d;
        }
        state.ghost = placed?.valid ? null : placed;
        render();
        return;
      }
      if (dragging?.type === "opening") {
        const op = state.openings.find((o) => o.id === dragging.id);
        const wall = state.walls.find((w) => w.id === op?.wallId);
        if (!op || !wall) return;
        const pr = nearestWall(world, [wall], 99);
        if (pr) {
          op.t = clampOpening(wall, pr.t, op.width);
          render();
        }
      }
    },
    pointerUp() {
      if (dragging?.type === "place") {
        if (state.ghost?.valid) {
          checkpoint();
          addFurniture(state.ghost);
          commit();
        }
        state.ghost = null;
        dragging = null;
        render();
        return;
      }
      if (dragging?.type === "furniture") {
        state.ghost = null;
        dragging = null;
        commit();
        return;
      }
      if (dragging) {
        dragging = null;
        commit();
      }
    },
    contextMenu(world, screen, client) {
      const hit = pick(world, screen);
      if (!hit) {
        hideMenu();
        return;
      }
      state.chain = null;
      state.preview = null;
      state.ghost = null;
      dragging = null;
      state.selection = { kind: hit.kind === "handle" ? "wall" : hit.kind, id: hit.kind === "handle" ? hit.wallId : hit.id };
      state.menuAt = [...world];
      hidePop();
      render();
      openMenu(client.x, client.y);
    },
    doubleClick(world, screen) {
      if (state.tool === "wall" || state.tool === "door" || state.tool === "window" || state.tool === "delete" || state.tool === "furnish") {
        return false;
      }
      const hit = pick(world, screen);
      if (!hit || hit.kind === "handle") return false;
      state.selection = { kind: hit.kind, id: hit.id };
      state.focusField = hit.kind === "wall" ? "len" : hit.kind === "opening" ? "width" : "name";
      state.tool = "select";
      hideMenu();
      render();
      return true;
    },
  };

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
    refreshRooms();
    ensurePlants(state);
  }

  function placeOpening(world, type) {
    const hit = nearestWall(world, state.walls, 0.45);
    if (!hit) return;
    const width = type === "door" ? DOOR_W : WIN_W;
    if (!openingFits(hit.wall, hit.t, Math.min(width, wallLen(hit.wall) - 0.2))) return;
    const w = Math.min(width, wallLen(hit.wall) - 0.2);
    checkpoint();
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
    commit();
  }

  function deleteAt(world) {
    const hit = pick(world, { x: 0, y: 0 });
    if (hit?.kind === "furniture") {
      checkpoint();
      removeFurniture(hit.id);
      commit();
      return;
    }
    if (hit?.kind === "opening") {
      checkpoint();
      state.openings = state.openings.filter((o) => o.id !== hit.id);
      commit();
      return;
    }
    if (hit?.kind === "wall") {
      checkpoint();
      state.openings = state.openings.filter((o) => o.wallId !== hit.id);
      state.walls = state.walls.filter((w) => w.id !== hit.id);
      refreshRooms();
      commit();
    }
  }

  function pick(world, screen) {
    if (state.selection?.kind === "wall") {
      const wall = state.walls.find((w) => w.id === state.selection.id);
      if (wall) {
        const o = { x: canvas2d.clientWidth / 2, y: canvas2d.clientHeight / 2 };
        for (const which of ["a", "b"]) {
          const p = wall[which];
          const sx = o.x + (p[0] - state.camera2d.x) * state.camera2d.zoom;
          const sy = o.y - (p[1] - state.camera2d.z) * state.camera2d.zoom;
          if (Math.hypot(sx - screen.x, sy - screen.y) <= 10) {
            return { kind: "handle", wallId: wall.id, which };
          }
        }
      }
    }
    for (const f of state.furniture) {
      if (containsPoint(f, world)) return { kind: "furniture", id: f.id };
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
      if (Math.hypot(world[0] - q[0], world[1] - q[1]) < 0.25) return { kind: "opening", id: op.id };
    }
    const nw = nearestWall(world, state.walls, 0.28);
    if (nw) return { kind: "wall", id: nw.wall.id };
    const room = state.rooms.find((r) => pointInPoly(world, r.points));
    if (room) return { kind: "room", id: room.id };
    return null;
  }

  function render() {
    plan2d.draw();
    view3d?.setSelectedRoom(state.selection?.kind === "room" ? state.selection.id : null);
    view3d?.rebuild(state);
    updateStatus();
    syncTools();
    syncInspector();
  }

  function updateStatus() {
    const total = state.rooms.reduce((s, r) => s + insetArea(r), 0);
    let extra = "";
    let action = "";
    if (state.ghost && state.ghost.valid === false) {
      extra =
        state.ghost.reason === "door"
          ? " · cannot sit in a doorway"
          : state.ghost.reason === "wall"
            ? " · snap the tank to a wall"
            : " · drop inside a room";
    } else if (state.selection?.kind === "wall") {
      const w = state.walls.find((x) => x.id === state.selection.id);
      if (w) extra = ` · wall ${fmt(wallLen(w))}`;
    } else if (state.selection?.kind === "room") {
      const r = state.rooms.find((x) => x.id === state.selection.id);
      if (r) extra = ` · ${r.name} ${fmtArea(insetArea(r))}`;
    } else if (state.selection?.kind === "furniture") {
      const f = state.furniture.find((x) => x.id === state.selection.id);
      if (f) {
        extra = ` · ${furnLabel(f)}${f.locked ? " · locked" : ""}${f.type === "tank" ? " 1.80 × 0.60 m" : ""}`;
        if (f.type === "plant" && !f.hidden) {
          action = `<button type="button" class="snap-btn" data-act="hide-plant">Hide plant</button>`;
        }
      }
    } else if (state.preview && state.chain?.length) {
      extra = ` · ${fmt(dist(state.chain.at(-1), state.preview))}`;
    } else if (state.tool === "furnish") {
      extra = ` · ${FURN[state.furnish]?.label || "Furnish"} — drag to place`;
    }
    if (state.note) extra += ` · ${state.note}`;
    const toolName = {
      select: "Select",
      wall: "Wall",
      door: "Door",
      window: "Window",
      room: "Room name",
      delete: "Delete",
      furnish: "Furnish",
    }[state.tool];
    status.innerHTML = `<button type="button" class="snap-btn" data-act="snap">Snap ${state.snap.toFixed(2)} m</button>
      <span>${toolName}</span>
      ${action}
      <span class="grow"></span>
      <span class="mono">${state.rooms.length} rooms · ${fmtArea(total)}${extra}</span>
      <span class="hint">Right-click for tools · ⌫ delete · R rotate · ⌘Z undo</span>`;
    status.querySelector("[data-act=snap]")?.addEventListener("click", () => {
      state.snap = state.snap === SNAP ? SNAP_FINE : SNAP;
      updateStatus();
    });
    status.querySelector("[data-act=hide-plant]")?.addEventListener("click", () => {
      const f = state.furniture.find((x) => x.id === state.selection?.id);
      if (f) {
        checkpoint();
        f.hidden = true;
        state.selection = null;
        commit();
      }
    });
  }

  function syncTools() {
    if (appEl) {
      appEl.dataset.view = state.view;
      appEl.dataset.tool = state.tool;
    }
    root.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === state.tool);
    });
    root.querySelectorAll("[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === state.view);
    });
    $("#furnish-btn")?.classList.toggle("active", state.tool === "furnish");
    root.querySelectorAll("[data-furn]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.furn === state.furnish);
    });
    const toggle = $("#plants-toggle");
    if (toggle) {
      const visible = state.furniture.some((f) => f.type === "plant" && !f.hidden);
      toggle.textContent = visible ? "Hide plants" : "Show plants";
    }
    $("#undo-btn").disabled = state.past.length === 0;
    $("#redo-btn").disabled = state.future.length === 0;
  }

  function setTool(t) {
    state.tool = t;
    state.chain = null;
    state.preview = null;
    if (t !== "furnish") state.ghost = null;
    hidePop();
    hideMenu();
    render();
  }

  function setView(v) {
    if (v === "top") {
      state.view = "model";
      view3d?.topView(state);
    } else {
      state.view = v;
    }
    syncTools();
    requestAnimationFrame(() => {
      plan2d.resize();
      view3d?.rebuild(state);
    });
  }

  function undo() {
    const prev = state.past.pop();
    if (!prev) return;
    state.future.push(snapshot());
    applySnap(prev);
    persist();
    render();
  }
  function redo() {
    const nxt = state.future.pop();
    if (!nxt) return;
    state.past.push(snapshot());
    applySnap(nxt);
    persist();
    render();
  }

  function hidePop() {
    pop.hidden = true;
    pop.innerHTML = "";
  }

  function showPop(anchor, html, width = 320) {
    pop.innerHTML = html;
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const rootR = root.getBoundingClientRect();
    const maxW = Math.min(width, rootR.width - 16);
    pop.style.width = `${maxW}px`;
    const left = Math.max(8, Math.min(r.left - rootR.left, rootR.width - maxW - 8));
    pop.style.left = `${left}px`;
    pop.style.top = `${r.bottom - rootR.top + 8}px`;
    requestAnimationFrame(() => {
      const ph = pop.offsetHeight;
      let top = r.bottom - rootR.top + 8;
      if (top + ph > rootR.height - 8) top = Math.max(8, rootR.height - ph - 8);
      pop.style.top = `${top}px`;
    });
  }

  function namePopover(room) {
    showPop(
      $('[data-tool="room"]'),
      `<form class="pop-form" id="name-form">
      <label>Room name<input name="n" value="${escapeHtml(room.name)}" maxlength="32" /></label>
      <div class="chips">${["Living", "Kitchen", "Dining", "Bedroom", "Bath", "Hall", "Laundry"].map((n) => `<button type="button" class="chip" data-n="${n}">${n}</button>`).join("")}</div>
      <button type="submit" class="primary">Label</button>
    </form>`,
    );
    const input = pop.querySelector("input");
    input.focus();
    input.select();
    pop.querySelectorAll("[data-n]").forEach((b) =>
      b.addEventListener("click", () => {
        checkpoint();
        room.name = b.dataset.n;
        state.labels = labelsFromRooms(state.rooms);
        hidePop();
        commit();
      }),
    );
    pop.querySelector("#name-form").addEventListener("submit", (e) => {
      e.preventDefault();
      checkpoint();
      room.name = input.value.trim() || "Room";
      state.labels = labelsFromRooms(state.rooms);
      hidePop();
      commit();
    });
  }

  function furnishItem(id, name, dim) {
    const icon = id === "tank" ? ICONS.lizard : ICONS[id];
    return `<button type="button" class="furn-item${id === "tank" ? " furn-tank" : ""}" data-furn="${id}">${icon}<span class="copy"><strong>${name}</strong><span class="dim">${dim}</span></span></button>`;
  }

  function fillPalette() {
    const grid = $("#furn-grid");
    if (!grid) return;
    grid.innerHTML = [
      furnishItem("plant", "Plant", "0.45 m"),
      furnishItem("sofa", "Sofa", "2.20 × 0.90 m"),
      furnishItem("bed", "Bed", "2.00 × 1.60 m"),
      furnishItem("table", "Table", "1.40 × 0.80 m"),
      furnishItem("tank", "Blue-tongue", "1.80 × 0.60 m · wall"),
    ].join("");
  }

  function genPopover(anchor) {
    const hasType = (t) => state.furniture.some((f) => f.type === t && !f.hidden);
    const on = (t, fallback) => (hasType(t) || fallback ? "active" : "");
    const pressed = (t, fallback) => (hasType(t) || fallback ? "true" : "false");
    showPop(
      anchor,
      `<form class="pop-form gen-form" id="gen-form" autocomplete="off">
        <p class="pop-title">Generate a home</p>
        <label class="brief-label">Type a brief
          <textarea name="brief" id="gen-brief" rows="3" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="2 bedroom apartment, 75 m², open living kitchen"></textarea>
        </label>
        <p class="pop-title">Include from the palette</p>
        <p class="dim-note">Tick pieces you also place by hand — they are laid into the new plan.</p>
        <div class="chips keep-list">
          <button type="button" class="chip ${on("plant", true)}" data-inc="plants" aria-pressed="${pressed("plant", true)}">Plants</button>
          <button type="button" class="chip ${on("sofa")}" data-inc="sofa" aria-pressed="${pressed("sofa")}">Sofa</button>
          <button type="button" class="chip ${on("bed")}" data-inc="bed" aria-pressed="${pressed("bed")}">Bed</button>
          <button type="button" class="chip ${on("table")}" data-inc="table" aria-pressed="${pressed("table")}">Table</button>
          <button type="button" class="chip ${on("tank")}" data-inc="tank" aria-pressed="${pressed("tank")}">Blue-tongue</button>
        </div>
        <div class="chips">
          <button type="button" class="chip" data-preset="studio">Studio 45 m²</button>
          <button type="button" class="chip" data-preset="twoBed">Two-bed 85 m²</button>
          <button type="button" class="chip" data-preset="family">Family 160 m²</button>
        </div>
        <div class="gen-row">
          <span class="gen-label">Bedrooms</span>
          <div class="chips">
            <button type="button" class="chip" data-beds="0">Studio</button>
            <button type="button" class="chip" data-beds="1">1</button>
            <button type="button" class="chip" data-beds="2">2</button>
            <button type="button" class="chip active" data-beds="3">3</button>
            <button type="button" class="chip" data-beds="4">4</button>
          </div>
        </div>
        <div class="gen-row">
          <span class="gen-label">Baths</span>
          <div class="chips">
            <button type="button" class="chip" data-baths="1">1</button>
            <button type="button" class="chip active" data-baths="2">2</button>
          </div>
        </div>
        <div class="gen-row">
          <span class="gen-label">About</span>
          <div class="chips">
            <button type="button" class="chip" data-area="45">45 m²</button>
            <button type="button" class="chip" data-area="85">85 m²</button>
            <button type="button" class="chip active" data-area="160">160 m²</button>
          </div>
        </div>
        <div class="gen-row">
          <span class="gen-label">Kitchen</span>
          <div class="chips">
            <button type="button" class="chip active" data-kit="open">Open</button>
            <button type="button" class="chip" data-kit="separate">Separate</button>
          </div>
        </div>
        <div class="mode-row">
          <label class="radio"><input type="radio" name="mode" value="replace" checked /> Replace current</label>
          <label class="radio"><input type="radio" name="mode" value="new" /> New from this</label>
        </div>
        <button type="submit" class="primary">Generate plan</button>
      </form>`,
      360,
    );
    const form = pop.querySelector("#gen-form");
    const setGroup = (key, value) => {
      form.querySelectorAll(`[data-${key}]`).forEach((b) => b.classList.toggle("active", b.dataset[key] === String(value)));
    };
    form.querySelectorAll("[data-beds], [data-baths], [data-area], [data-kit]").forEach((b) => {
      b.addEventListener("click", () => {
        const key = ["beds", "baths", "area", "kit"].find((k) => k in b.dataset);
        setGroup(key, b.dataset[key]);
      });
    });
    form.querySelectorAll("[data-inc]").forEach((b) => {
      b.addEventListener("click", () => {
        const next = !b.classList.contains("active");
        b.classList.toggle("active", next);
        b.setAttribute("aria-pressed", next ? "true" : "false");
      });
    });
    const includeOf = () => {
      const onChip = (v) => form.querySelector(`[data-inc="${v}"]`)?.classList.contains("active");
      return {
        plants: onChip("plants"),
        sofa: onChip("sofa"),
        bed: onChip("bed"),
        table: onChip("table"),
        tank: onChip("tank"),
      };
    };
    const specOf = () => {
      const spec = {
        bedrooms: Number(form.querySelector("[data-beds].active")?.dataset.beds ?? 3),
        bathrooms: Number(form.querySelector("[data-baths].active")?.dataset.baths ?? 2),
        targetArea: Number(form.querySelector("[data-area].active")?.dataset.area ?? 160),
        openKitchen: form.querySelector("[data-kit].active")?.dataset.kit !== "separate",
      };
      const brief = String(form.querySelector("#gen-brief")?.value || "").trim();
      if (brief) return { ...spec, ...parseBrief(brief) };
      return spec;
    };
    const run = (plan) => {
      const mode = form.querySelector('input[name="mode"]:checked')?.value || "replace";
      const include = includeOf();
      if (mode === "new") {
        state.past = [];
        state.future = [];
      }
      loadPlan({ ...plan, furniture: [] }, mode === "replace");
      placeDefaultFurniture(state, include);
      persist();
      render();
      hidePop();
    };
    pop.querySelectorAll("[data-preset]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.preset;
        const preset = PRESETS[id] || PRESETS.family;
        setGroup("beds", preset.bedrooms);
        setGroup("baths", preset.bathrooms);
        setGroup("area", preset.targetArea);
        setGroup("kit", preset.openKitchen ? "open" : "separate");
        const plan = id === "studio" ? studioPlan() : id === "twoBed" ? twoBedPlan() : familyPlan();
        run(plan);
      }),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      run(generateFromSpec(specOf()));
    });
    const area = form.querySelector("#gen-brief");
    const stopKeys = (e) => e.stopPropagation();
    area.addEventListener("keydown", stopKeys);
    area.addEventListener("keyup", stopKeys);
    area.addEventListener("keypress", stopKeys);
    requestAnimationFrame(() => {
      area.focus({ preventScroll: false });
    });
  }

  function filePopover(anchor) {
    showPop(
      anchor,
      `<div class="pop-form">
        <p class="pop-title">Plan file</p>
        <button type="button" data-f="new">New</button>
        <button type="button" data-f="open">Open JSON</button>
        <button type="button" data-f="save">Save JSON</button>
        <button type="button" data-f="gltf">Download .gltf</button>
      </div>`,
    );
    pop.querySelector("[data-f=new]").onclick = () => {
      loadPlan({ walls: [], openings: [], labels: [], furniture: [] }, true);
      hidePop();
    };
    pop.querySelector("[data-f=open]").onclick = () => {
      $("#file-in").click();
      hidePop();
    };
    pop.querySelector("[data-f=save]").onclick = () => {
      download(`neeky-plan.json`, JSON.stringify(serializePlan({ ...state, rooms: state.rooms }), null, 2), "application/json");
      hidePop();
    };
    pop.querySelector("[data-f=gltf]").onclick = async () => {
      const bin = await view3d.exportGLTF();
      const blob = new Blob([bin], { type: "model/gltf-binary" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "neeky-house.glb";
      a.click();
      hidePop();
    };
  }

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "\u0026amp;")
      .replace(/</g, "\u0026lt;")
      .replace(/>/g, "\u0026gt;")
      .replace(/"/g, "\u0026quot;");
  }

  function flash(msg) {
    state.note = msg;
    updateStatus();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      state.note = "";
      updateStatus();
    }, 2200);
  }

  function fmtNum(n) {
    if (!Number.isFinite(n)) return "";
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function parseLen(v) {
    const n = Number(String(v).trim().replace(/m$/i, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function rotDeg(rot) {
    const d = Math.round((((rot || 0) * 180) / Math.PI) % 360);
    return (d + 360) % 360;
  }

  function selectedObj() {
    const sel = state.selection;
    if (!sel) return null;
    if (sel.kind === "furniture") return state.furniture.find((f) => f.id === sel.id) || null;
    if (sel.kind === "wall") return state.walls.find((w) => w.id === sel.id) || null;
    if (sel.kind === "opening") return state.openings.find((o) => o.id === sel.id) || null;
    if (sel.kind === "room") return state.rooms.find((r) => r.id === sel.id) || null;
    return null;
  }

  function anchorWorld() {
    const sel = state.selection;
    const obj = selectedObj();
    if (!sel || !obj) return null;
    if (sel.kind === "furniture") return [obj.x, obj.z];
    if (sel.kind === "wall") return [(obj.a[0] + obj.b[0]) / 2, (obj.a[1] + obj.b[1]) / 2];
    if (sel.kind === "room") return obj.centroid;
    const wall = state.walls.find((w) => w.id === obj.wallId);
    if (!wall) return null;
    return [wall.a[0] + (wall.b[0] - wall.a[0]) * obj.t, wall.a[1] + (wall.b[1] - wall.a[1]) * obj.t];
  }

  function worldToRoot(p) {
    const cam = state.camera2d;
    const rect = canvas2d.getBoundingClientRect();
    const rootR = root.getBoundingClientRect();
    const sx = rect.width / 2 + (p[0] - cam.x) * cam.zoom;
    const sy = rect.height / 2 - (p[1] - cam.z) * cam.zoom;
    return { x: rect.left - rootR.left + sx, y: rect.top - rootR.top + sy };
  }

  function kickerText() {
    const sel = state.selection;
    const obj = selectedObj();
    if (!sel || !obj) return "";
    if (sel.kind === "wall") return "Wall";
    if (sel.kind === "opening") return obj.type === "window" ? "Window" : "Door";
    if (sel.kind === "room") return "Room";
    const type = obj.type === "tank" ? "Blue-tongue" : FURN[obj.type]?.label || "Piece";
    return obj.locked ? `${type} · Locked` : type;
  }

  function inspectorSignature() {
    const sel = state.selection;
    const obj = selectedObj();
    if (!sel || !obj || state.chain) return "";
    if (sel.kind === "furniture") return `f:${obj.id}:${obj.type}:${obj.locked ? 1 : 0}`;
    if (sel.kind === "opening") return `o:${obj.id}:${obj.type}`;
    if (sel.kind === "wall") return `w:${obj.id}`;
    if (sel.kind === "room") return `r:${obj.id}`;
    return "";
  }

  function fieldValue(obj, field) {
    const sel = state.selection;
    if (field === "name") {
      if (sel?.kind === "room") return obj.name || "";
      return obj.name || (obj.type === "tank" ? "Blue-tongue" : FURN[obj.type]?.label || "");
    }
    if (field === "len") return fmtNum(wallLen(obj));
    if (field === "width") return fmtNum(obj.width);
    if (field === "height") return fmtNum(obj.height);
    if (field === "sill") return fmtNum(obj.sill || 0);
    if (field === "w" || field === "dia") return fmtNum(obj.w);
    if (field === "d") return fmtNum(obj.d);
    if (field === "rot") return String(rotDeg(obj.rot));
    return "";
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
    refreshRooms();
  }

  function objectBy(kind, id) {
    if (kind === "furniture") return state.furniture.find((f) => f.id === id) || null;
    if (kind === "wall") return state.walls.find((w) => w.id === id) || null;
    if (kind === "opening") return state.openings.find((o) => o.id === id) || null;
    if (kind === "room") return state.rooms.find((r) => r.id === id) || null;
    return null;
  }

  function writeField(obj, field, raw, kind = state.selection?.kind) {
    if (field === "name") {
      const text = String(raw).trim().slice(0, 32);
      if (kind === "room") {
        obj.name = text || "Room";
        state.labels = labelsFromRooms(state.rooms);
        return;
      }
      const fallback = obj.type === "tank" ? "Blue-tongue" : FURN[obj.type]?.label || "";
      obj.name = !text || text === fallback ? "" : text;
      return;
    }
    const n = typeof raw === "number" ? raw : parseLen(raw);
    if (n == null) return;
    if (kind === "wall" && field === "len") {
      setWallLength(obj, n);
      return;
    }
    if (kind === "opening") {
      const wall = state.walls.find((w) => w.id === obj.wallId);
      if (field === "width") {
        const max = wall ? Math.max(0.4, wallLen(wall) - 0.2) : 3;
        obj.width = clamp(n, 0.4, max);
        if (wall) obj.t = clampOpening(wall, obj.t, obj.width);
      } else if (field === "height") obj.height = clamp(n, 0.3, 2.6);
      else if (field === "sill") obj.sill = clamp(n, 0, 2.2);
      const sill = obj.sill || 0;
      if (sill + obj.height > 2.65) {
        if (field === "sill") obj.sill = Math.max(0, 2.65 - obj.height);
        else obj.height = Math.max(0.3, 2.65 - sill);
      }
      return;
    }
    if (kind !== "furniture") return;
    if (field === "dia") {
      const d = clamp(n, 0.15, 1.8);
      obj.w = d;
      obj.d = d;
    } else if (field === "w" || field === "d") obj[field] = clamp(n, 0.25, 6);
    else if (field === "rot") obj.rot = (((n % 360) + 360) % 360 * Math.PI) / 180;
  }

  function inspField(name, label, value, span) {
    return `<label class="insp-field${span ? " span2" : ""}">${label}<input data-field="${name}" inputmode="decimal" autocomplete="off" value="${escapeHtml(value)}" /></label>`;
  }

  function nameField(value) {
    return `<label class="insp-field span2">Name<input data-field="name" maxlength="32" autocomplete="off" value="${escapeHtml(value)}" /></label>`;
  }

  function inspectorBody() {
    const sel = state.selection;
    const obj = selectedObj();
    if (!sel || !obj) return "";
    if (sel.kind === "wall") return inspField("len", "Length m", fieldValue(obj, "len"), true);
    if (sel.kind === "opening") {
      const bits = [inspField("width", "Width m", fieldValue(obj, "width")), inspField("height", "Height m", fieldValue(obj, "height"))];
      if (obj.type === "window") bits.push(inspField("sill", "Sill m", fieldValue(obj, "sill"), true));
      return bits.join("");
    }
    if (sel.kind === "room") return `${nameField(obj.name || "")}<p class="insp-read">${escapeHtml(fmtArea(insetArea(obj)))}</p>`;
    if (obj.type === "tank") return `${nameField(fieldValue(obj, "name"))}<p class="insp-read">1.80 × 0.60 m · snaps to a wall</p>`;
    if (obj.type === "plant") return `${nameField(fieldValue(obj, "name"))}${inspField("dia", "Diameter m", fieldValue(obj, "dia"), true)}`;
    return [
      nameField(fieldValue(obj, "name")),
      inspField("w", "Width m", fieldValue(obj, "w")),
      inspField("d", "Depth m", fieldValue(obj, "d")),
      inspField("rot", "Angle °", fieldValue(obj, "rot"), true),
    ].join("");
  }

  function bindInspectorFields(el) {
    el.querySelectorAll("[data-field]").forEach((input) => {
      let base = null;
      input.addEventListener("focus", () => {
        base = snapshot();
        input.dataset.kind = state.selection?.kind || "";
        input.dataset.sid = state.selection?.id || "";
        if (input.dataset.field !== "name") requestAnimationFrame(() => input.select());
      });
      input.addEventListener("input", () => {
        const obj = objectBy(input.dataset.kind, input.dataset.sid) || selectedObj();
        if (!obj) return;
        writeField(obj, input.dataset.field, input.value, input.dataset.kind || state.selection?.kind);
        paintLive();
      });
      input.addEventListener("blur", () => {
        if (!base) return;
        const obj = objectBy(input.dataset.kind, input.dataset.sid);
        if (obj) writeField(obj, input.dataset.field, input.value, input.dataset.kind);
        const prev = base;
        base = null;
        if (JSON.stringify(snapshot()) === JSON.stringify(prev)) {
          refreshInspectorValues();
          return;
        }
        state.past.push(prev);
        if (state.past.length > 60) state.past.shift();
        state.future = [];
        commit();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });
    });
    el.querySelector("#insp-more")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!$("#ctx-menu").hidden) {
        hideMenu();
        return;
      }
      state.menuAt = anchorWorld();
      const r = e.currentTarget.getBoundingClientRect();
      openMenu(r.left, r.bottom + 6);
    });
  }

  function refreshInspectorValues() {
    const el = $("#inspector");
    const obj = selectedObj();
    if (!obj) return;
    const kicker = el.querySelector(".insp-kicker");
    if (kicker) kicker.textContent = kickerText();
    el.querySelectorAll("[data-field]").forEach((input) => {
      if (input === document.activeElement) return;
      const next = fieldValue(obj, input.dataset.field);
      if (input.value !== next) input.value = next;
    });
    const read = el.querySelector(".insp-read");
    if (read && state.selection?.kind === "room") read.textContent = fmtArea(insetArea(obj));
  }

  function placeInspector() {
    const el = $("#inspector");
    if (el.hidden) return;
    const narrow = root.clientWidth < 760;
    const dock = state.view === "model" || narrow;
    el.classList.toggle("docked", dock);
    if (dock) {
      el.style.left = "";
      el.style.top = "";
      return;
    }
    const world = anchorWorld();
    if (!world) return;
    const p = worldToRoot(world);
    const rootR = root.getBoundingClientRect();
    const w = el.offsetWidth || 240;
    const h = el.offsetHeight || 128;
    let x = p.x - w / 2;
    let y = p.y - h - 16;
    if (y < 64) y = p.y + 18;
    x = Math.max(8, Math.min(x, rootR.width - w - 8));
    y = Math.max(64, Math.min(y, rootR.height - h - 44));
    if (x + w > rootR.width - 116 && y + h > rootR.height - 72) x = Math.max(8, rootR.width - 116 - w);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  let liveQueued = false;
  function paintLive() {
    if (liveQueued) return;
    liveQueued = true;
    requestAnimationFrame(() => {
      liveQueued = false;
      plan2d.draw();
      view3d?.setSelectedRoom(state.selection?.kind === "room" ? state.selection.id : null);
      view3d?.rebuild(state);
      updateStatus();
      refreshInspectorValues();
      placeInspector();
    });
  }

  function syncInspector() {
    const el = $("#inspector");
    const sig = inspectorSignature();
    if (!sig) {
      inspectorSig = "";
      el.hidden = true;
      return;
    }
    if (sig !== inspectorSig) {
      inspectorSig = sig;
      el.hidden = false;
      el.innerHTML = `<div class="insp-bar"><span class="insp-kicker">${escapeHtml(kickerText())}</span><button type="button" class="insp-more" id="insp-more" aria-haspopup="menu" title="Object tools">Tools</button></div><div class="insp-grid">${inspectorBody()}</div>`;
      bindInspectorFields(el);
    } else {
      el.hidden = false;
      refreshInspectorValues();
    }
    if (state.focusField) {
      const field = state.focusField;
      state.focusField = null;
      const input = el.querySelector(`[data-field="${field}"]`);
      input?.focus();
      input?.select?.();
    }
    placeInspector();
  }

  function hideMenu() {
    const menu = $("#ctx-menu");
    menu.hidden = true;
    menu.innerHTML = "";
  }

  function splitParam(wall) {
    if (!state.menuAt) return null;
    const pr = projectOnSeg(state.menuAt, wall.a, wall.b);
    if (pr.dist > 0.45 || pr.t < 0.12 || pr.t > 0.88) return null;
    return pr.t;
  }

  function menuHtml() {
    const sel = state.selection;
    const obj = selectedObj();
    if (!sel || !obj) return "";
    const rows = [];
    const act = (id, label, extra = "") => rows.push(`<button type="button" role="menuitem" data-act="${id}" ${extra}>${label}</button>`);
    const sep = () => rows.push(`<div class="ctx-sep"></div>`);
    const heading = (t) => rows.push(`<div class="ctx-label">${t}</div>`);
    if (sel.kind === "furniture") {
      heading("Nudge 0.10 m");
      rows.push(`<div class="ctx-nudge">
        <button type="button" data-act="nudge" data-x="-1" data-z="0">Left</button>
        <button type="button" data-act="nudge" data-x="1" data-z="0">Right</button>
        <button type="button" data-act="nudge" data-x="0" data-z="1">Up</button>
        <button type="button" data-act="nudge" data-x="0" data-z="-1">Down</button>
      </div>`);
      sep();
      if (obj.type !== "tank" && obj.type !== "plant") {
        act("rot90", "Rotate 90°");
        act("rot45", "Rotate 45°");
        act("turn", "Turn around");
        act("mirror", "Mirror");
        act("swap", "Swap width and depth");
        sep();
        act("align", "Align to nearest wall");
      }
      if (obj.type === "tank") act("realign", "Realign to wall");
      act("dup", "Duplicate");
      if (obj.type !== "tank") act("center", "Center in room");
      if (obj.type !== "tank") act("reset", "Reset size");
      act("lock", obj.locked ? "Unlock" : "Lock position");
      act("hide", "Hide");
      sep();
      heading("Change to");
      for (const [id, spec] of Object.entries(FURN)) {
        if (id === obj.type) continue;
        act("retype", spec.label, `data-type="${id}"`);
      }
      sep();
      act("del", "Delete", `class="danger"`);
    } else if (sel.kind === "wall") {
      act("split-half", "Split in half");
      const t = splitParam(obj);
      if (t != null && Math.abs(t - 0.5) > 0.08) act("split-here", "Split here");
      act("straighten", "Straighten to axis");
      sep();
      act("add-door", "Add door");
      act("add-window", "Add window");
      sep();
      act("del", "Delete wall", `class="danger"`);
    } else if (sel.kind === "opening") {
      act("center-op", "Center on wall");
      act("widen", "Fit wall width");
      act(obj.type === "door" ? "to-window" : "to-door", obj.type === "door" ? "Make window" : "Make door");
      sep();
      act("del", "Delete", `class="danger"`);
    } else if (sel.kind === "room") {
      act("plants-hide", "Hide plants in this room");
      act("plants-show", "Show plants in this room");
      act("rename", "Rename");
    }
    return rows.join("");
  }

  function openMenu(clientX, clientY) {
    const menu = $("#ctx-menu");
    const html = menuHtml();
    if (!html) {
      hideMenu();
      return;
    }
    menu.innerHTML = html;
    menu.hidden = false;
    const rootR = root.getBoundingClientRect();
    const pad = 8;
    const topMin = 60;
    const bottomMax = rootR.height - 44;
    menu.style.maxHeight = `${Math.max(180, bottomMax - topMin)}px`;
    const w = menu.offsetWidth || 210;
    const h = menu.offsetHeight || 180;
    let x = clientX - rootR.left;
    let y = clientY - rootR.top;
    if (x + w > rootR.width - pad) x = rootR.width - w - pad;
    if (y + h > bottomMax) y = bottomMax - h;
    if (y < topMin) y = topMin;
    menu.style.left = `${Math.max(pad, Math.round(x))}px`;
    menu.style.top = `${Math.round(y)}px`;
  }

  function edit(fn) {
    checkpoint();
    const ok = fn();
    if (ok === false) {
      state.past.pop();
      render();
      return;
    }
    commit();
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
        flash(s.reason === "door" ? "Doorway is in the way" : "Needs a clear wall");
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
      flash("Wall is too short");
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

  function runFurn(f, act, ds) {
    if (act === "nudge") {
      const dx = Number(ds.x || 0) * 0.1;
      const dz = Number(ds.z || 0) * 0.1;
      edit(() => {
        if (f.type === "tank") {
          const s = snapTank([f.x + dx, f.z + dz], state);
          if (!s.valid) {
            flash(s.reason === "door" ? "Doorway is in the way" : "Needs a clear wall");
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
          flash("No wall nearby");
          return false;
        }
        f.rot = Math.atan2(hit.wall.b[1] - hit.wall.a[1], hit.wall.b[0] - hit.wall.a[0]);
      } else if (act === "realign") {
        const s = snapTank([f.x, f.z], state);
        if (!s.valid) {
          flash(s.reason === "door" ? "Doorway is in the way" : "Needs a clear wall");
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
          flash("Not inside a room");
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
          flash("Already straight");
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
      inspectorSig = "";
      render();
      return;
    }
    const plants = state.furniture.filter((f) => f.type === "plant" && pointInPoly([f.x, f.z], room.points));
    if (!plants.length) {
      flash("No plants in this room");
      return;
    }
    edit(() => {
      if (act === "plants-hide") plants.forEach((f) => (f.hidden = true));
      else if (act === "plants-show") plants.forEach((f) => (f.hidden = false));
      else return false;
    });
  }

  function runAction(act, ds) {
    if (act !== "nudge") hideMenu();
    const sel = state.selection;
    const obj = selectedObj();
    if (!sel || !obj) return;
    if (sel.kind === "furniture") runFurn(obj, act, ds);
    else if (sel.kind === "wall") runWall(obj, act);
    else if (sel.kind === "opening") runOpening(obj, act);
    else if (sel.kind === "room") runRoom(obj, act);
  }

  const plan2d = createPlan2D(canvas2d, () => state, actions);
  let alive = true;
  let view3dReady = import("./view3d.js")
    .then((mod) => {
      if (!alive) return null;
      view3d = mod.createView3D(canvas3d);
      view3d.setOnRoomClick((id) => {
        hideMenu();
        state.selection = { kind: "room", id };
        render();
      });
      view3d.setOnFurnClick((id) => {
        hideMenu();
        state.selection = { kind: "furniture", id };
        render();
      });
      view3d.setOnContext((hit, x, y) => {
        if (!hit) {
          hideMenu();
          return;
        }
        state.chain = null;
        state.preview = null;
        state.ghost = null;
        dragging = null;
        state.selection = { kind: hit.kind, id: hit.id };
        state.menuAt = anchorWorld();
        hidePop();
        render();
        openMenu(x, y);
      });
      view3d.rebuild(state);
      view3d.fit(state);
      return view3d;
    })
    .catch((err) => {
      console.error(err);
      return null;
    });

  root.addEventListener("click", (e) => {
    const tool = e.target.closest("[data-tool]");
    if (tool) setTool(tool.dataset.tool);
    const view = e.target.closest("[data-view]");
    if (view) setView(view.dataset.view);
    if (e.target.closest("#gen-btn")) genPopover(e.target.closest("#gen-btn"));
    if (e.target.closest("#furnish-btn")) setTool(state.tool === "furnish" ? "select" : "furnish");
    const furn = e.target.closest("[data-furn]");
    if (furn) {
      state.furnish = furn.dataset.furn;
      state.tool = "furnish";
      state.ghost = null;
      render();
    }
    if (e.target.closest("#plants-toggle")) {
      const visible = state.furniture.some((f) => f.type === "plant" && !f.hidden);
      checkpoint();
      for (const f of state.furniture) if (f.type === "plant") f.hidden = visible;
      commit();
    }
    if (e.target.closest("#file-btn")) filePopover(e.target.closest("#file-btn"));
    if (e.target.closest("#undo-btn")) undo();
    if (e.target.closest("#redo-btn")) redo();
  });

  $("#file-in").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      loadPlan(deserializePlan(data), true);
    } catch (err) {
      const mono = status.querySelector(".mono");
      if (mono) mono.textContent = err.message || "Could not open file";
    }
  });

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
  pop.addEventListener("keydown", (e) => e.stopPropagation());
  pop.addEventListener("keyup", (e) => e.stopPropagation());
  pop.addEventListener("keypress", (e) => e.stopPropagation());
  pop.addEventListener("click", (e) => e.stopPropagation());
  pop.addEventListener("pointerdown", (e) => e.stopPropagation());
  $("#inspector").addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (!e.target.closest("#insp-more")) hideMenu();
  });
  $("#ctx-menu").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("#ctx-menu").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    e.stopPropagation();
    runAction(btn.dataset.act, btn.dataset);
  });
  function isTypingTarget(el) {
    if (!(el instanceof Element)) return false;
    return !!el.closest("input, textarea, select, [contenteditable='true']");
  }
  function onKey(e) {
    const typing = isTypingTarget(e.target);
    const popOpen = !pop.hidden;
    if (typing || (popOpen && e.key !== "Escape")) {
      if (e.key === "Escape" && e.type === "keydown") {
        hidePop();
        hideMenu();
        if (e.target instanceof HTMLElement) e.target.blur();
        render();
      }
      return;
    }
    if (e.code === "Space") {
      state.space = e.type === "keydown";
      if (e.type === "keydown") e.preventDefault();
    }
    state.alt = e.altKey;
    if (e.type !== "keydown") return;
    if (e.key === "Escape") {
      const menuOpen = !$("#ctx-menu").hidden;
      state.chain = null;
      state.preview = null;
      state.ghost = null;
      hidePop();
      hideMenu();
      if (menuOpen) {
        render();
        return;
      }
      state.selection = null;
      render();
      return;
    }
    if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && state.selection) {
      e.preventDefault();
      const btn = $("#insp-more");
      if (!btn) return;
      state.menuAt = anchorWorld();
      const r = btn.getBoundingClientRect();
      openMenu(r.left, r.bottom + 6);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
      if (state.tool === "furnish" && state.furnish !== "tank" && state.ghost) {
        state.ghost.rot = (state.ghost.rot || 0) + Math.PI / 2;
        plan2d.draw();
      } else if (state.selection?.kind === "furniture") {
        const f = state.furniture.find((x) => x.id === state.selection.id);
        if (f && f.type !== "tank") {
          checkpoint();
          f.rot = (f.rot || 0) + Math.PI / 2;
          commit();
        }
      }
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (state.selection?.kind === "wall") {
        const id = state.selection.id;
        checkpoint();
        state.openings = state.openings.filter((o) => o.wallId !== id);
        state.walls = state.walls.filter((w) => w.id !== id);
        state.selection = null;
        refreshRooms();
        commit();
      } else if (state.selection?.kind === "opening") {
        checkpoint();
        state.openings = state.openings.filter((o) => o.id !== state.selection.id);
        state.selection = null;
        commit();
      } else if (state.selection?.kind === "furniture") {
        checkpoint();
        removeFurniture(state.selection.id);
        commit();
      }
    }
    const map = { v: "select", w: "wall", d: "door", n: "window" };
    if (map[e.key.toLowerCase()] && !e.metaKey && !e.ctrlKey) setTool(map[e.key.toLowerCase()]);
  }

  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest("#gen-btn, #file-btn, [data-tool=room]")) {
      hidePop();
    }
    const menu = $("#ctx-menu");
    if (menu && !menu.hidden && !menu.contains(e.target) && !e.target.closest("#insp-more")) hideMenu();
  });

  let saved = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) saved = deserializePlan(JSON.parse(raw));
  } catch {
    saved = null;
  }
  if (saved?.walls?.length) loadPlan(saved, false);
  else loadPlan(familyPlan(), false);

  void PRESETS;

  return () => {
    alive = false;
    clearTimeout(flashTimer);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
    plan2d.dispose();
    view3d?.dispose();
    root.innerHTML = "";
  };
}

function shellHtml() {
  return `
  <div class="app">
    <header class="toolbar">
      <div class="brand">
        <span class="mark" aria-hidden="true"></span>
        <div class="titles">
          <strong>Neeky</strong>
          <span>Home Designer</span>
        </div>
      </div>
      <div class="group">
        ${toolBtn("select", "Select", ICONS.select)}
        ${toolBtn("wall", "Wall", ICONS.wall)}
        ${toolBtn("door", "Door", ICONS.door)}
        ${toolBtn("window", "Window", ICONS.window)}
        ${toolBtn("room", "Room name", ICONS.room)}
        ${toolBtn("delete", "Delete", ICONS.del)}
      </div>
      <button type="button" class="tool" id="furnish-btn" title="Furnish">${ICONS.furnish}<span>Furnish</span></button>
      <button type="button" class="tool" id="gen-btn" title="Generate">${ICONS.gen}<span>Generate</span></button>
      <div class="group view-group">
        <button type="button" class="tool" data-view="split">Split</button>
        <button type="button" class="tool" data-view="plan">Plan</button>
        <button type="button" class="tool" data-view="model">3D</button>
        <button type="button" class="tool" data-view="top">Top</button>
      </div>
      <div class="group">
        <button type="button" class="tool" id="undo-btn" title="Undo">${ICONS.undo}</button>
        <button type="button" class="tool" id="redo-btn" title="Redo">${ICONS.redo}</button>
        <button type="button" class="tool" id="file-btn" title="File">${ICONS.file}</button>
      </div>
    </header>
    <aside class="palette" id="palette">
      <p class="pop-title">Furnish</p>
      <div class="furn-grid" id="furn-grid"></div>
      <button type="button" class="plants-toggle" id="plants-toggle">Hide plants</button>
      <p class="dim-note">Drag onto the plan. Select anything to edit it. Right-click, or Tools, for more.</p>
    </aside>
    <div class="stage">
      <div class="pane plan-pane">
        <canvas id="plan-canvas"></canvas>
      </div>
      <div class="pane view-pane"><canvas id="view-canvas"></canvas></div>
    </div>
    <footer class="status" id="status"></footer>
    <div id="inspector" class="inspector" hidden></div>
    <div id="ctx-menu" class="ctx-menu" hidden role="menu"></div>
    <div id="popover" class="popover" hidden></div>
    <input id="file-in" type="file" accept="application/json,.json" hidden />
  </div>`;
}

function toolBtn(id, label, icon) {
  return `<button type="button" class="tool" data-tool="${id}" title="${label}" aria-label="${label}">${icon}</button>`;
}
