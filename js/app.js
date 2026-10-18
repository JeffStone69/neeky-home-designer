import { SNAP, SNAP_FINE, STORAGE_BACKUP_KEY, STORAGE_KEY } from "./constants.js";
import { createCommands } from "./commands.js";
import { normalizeDeck } from "./elements.js";
import { FURN, cloneFurn, ensurePlants, furnLabel, moveFurniture, placeDefaultFurniture, placeFurniture } from "./furniture.js";
import { PRESETS, familyPlan, generateFromSpec, parseBrief, studioPlan, twoBedPlan } from "./generate.js";
import {
  assignLabels,
  axisAlign,
  clamp,
  clampOpening,
  computeRooms,
  dist,
  fmt,
  fmtArea,
  grossFloorArea,
  internalArea,
  joinPoint,
  labelsFromRooms,
  nearestWall,
  normalizePlan,
  pointInPoly,
  snapPt,
  wallLen,
} from "./geom.js";
import { downloadBlob, downloadText, exportSheet, readPlanText } from "./io.js";
import { createPlan2D } from "./plan2d.js";
import { objectBy, pickHit, selectedObj } from "./pick.js";
import {
  escapeHtml,
  inspField,
  kickerFor,
  menuHtml,
  nameField,
  paletteHtml,
  roomAreaText,
  shellHtml,
  statusBarHtml,
} from "./panels.js";
import { serializePlan } from "./schema.js";
import { applySnapshot, checkpoint, createPersist, createState, keepUnreadableAutosave, readAutosave, snapshot } from "./store.js";

const DIM_ORDER = ["centreline", "inside", "outside"];
const DIM_LABEL = { centreline: "Centreline", inside: "Inside", outside: "Outside" };

export function mount(root) {
  if (!root) return () => {};
  root.innerHTML = shellHtml();
  const $ = (sel) => root.querySelector(sel);
  const canvas2d = $("#plan-canvas");
  const canvas3d = $("#view-canvas");
  const status = $("#status");
  const pop = $("#popover");
  const appEl = root.querySelector(".app");
  $("#furn-grid").innerHTML = paletteHtml();

  const state = createState();
  const persist = createPersist(() => state);
  let view3d = null;
  let dragging = null;
  let inspectorSig = "";
  let flashTimer = 0;
  let toastTimer = 0;
  let alive = true;

  function refreshRooms() {
    state.rooms = assignLabels(computeRooms(state.walls), state.labels);
    state.labels = labelsFromRooms(state.rooms);
  }

  function commit() {
    const norm = normalizePlan(state);
    state.walls = norm.walls;
    state.openings = norm.openings;
    state.pins = norm.pins;
    state.rooms = norm.rooms;
    state.labels = norm.labels;
    persist.release();
    persist.persist();
    render();
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

  function showError(msg, opts = {}) {
    const el = $("#toast");
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(toastTimer);
    if (!opts.sticky) {
      toastTimer = setTimeout(() => {
        el.hidden = true;
      }, 6500);
    }
  }

  function saveNow() {
    persist.release();
    persist.persistNow();
  }

  const commands = createCommands(state, {
    checkpoint: () => checkpoint(state),
    commit,
    render: () => render(),
    refreshRooms,
    flash,
    markInspectorDirty() {
      inspectorSig = "";
    },
  });

  function coarse() {
    return window.matchMedia?.("(pointer: coarse)")?.matches;
  }

  function viewBox() {
    return { width: canvas2d.clientWidth, height: canvas2d.clientHeight, coarse: coarse() };
  }

  function pick(world, screen) {
    return pickHit(state, world, screen, viewBox());
  }

  function loadPlan(plan, pushHistory, opts = {}) {
    if (pushHistory) checkpoint(state);
    const norm = normalizePlan({
      walls: plan.walls || [],
      openings: plan.openings || [],
      labels: plan.labels || [],
      pins: plan.pins || [],
      furniture: plan.furniture || [],
      decks: plan.decks || [],
      steps: plan.steps || [],
      stumps: plan.stumps || [],
      title: plan.title || "",
    });
    state.walls = norm.walls;
    state.openings = norm.openings;
    state.labels = norm.labels;
    state.rooms = norm.rooms;
    state.pins = norm.pins;
    state.furniture = (norm.furniture || []).map(cloneFurn);
    state.decks = (norm.decks || []).map((d) => ({ ...d }));
    state.steps = (norm.steps || []).map((s) => ({ ...s }));
    state.stumps = (norm.stumps || []).map((s) => ({ ...s }));
    state.title = plan.title || "";
    if (plan.dimMode) state.dimMode = plan.dimMode;
    state.chain = null;
    state.preview = null;
    state.ghost = null;
    state.draft = null;
    state.selection = null;
    state.menuAt = null;
    state.focusField = null;
    state.note = "";
    ensurePlants(state);
    state.tool = "select";
    if (opts.hold) persist.hold();
    else saveNow();
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
      if (state.tool === "deck") {
        const p = snapPt(world, g);
        state.draft = { type: "deck", kind: "deck", name: "Deck", x: p[0], z: p[1], w: 0, d: 0 };
        dragging = { type: "deck" };
        render();
        return;
      }
      if (state.tool === "steps") {
        commands.edit(() => {
          commands.placeSteps(world, Math.PI / 2);
        });
        return;
      }
      if (state.tool === "stumps") {
        commands.edit(() => commands.placeStump(world));
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
            checkpoint(state);
            commands.addWall(last, state.chain[0]);
            state.chain = null;
            state.preview = null;
            commit();
            return;
          }
          if (dist(last, end) >= g) {
            checkpoint(state);
            commands.addWall(last, end);
            state.chain.push(end);
            commit();
          }
        }
        render();
        return;
      }
      if (state.tool === "door" || state.tool === "window") {
        commands.placeOpening(world, state.tool);
        return;
      }
      if (state.tool === "room") {
        const room = state.rooms.find((r) => pointInPoly(world, r.points));
        if (room) namePopover(room, screen);
        return;
      }
      if (state.tool === "delete") {
        commands.deleteHit(pick(world, screen));
        return;
      }
      const hit = pick(world, screen);
      if (hit?.kind === "handle") {
        checkpoint(state);
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
        checkpoint(state);
        dragging = { type: "furniture", id: hit.id };
        render();
        return;
      }
      if (hit?.kind === "opening") {
        checkpoint(state);
        dragging = { type: "opening", id: hit.id };
        state.selection = { kind: "opening", id: hit.id };
        render();
        return;
      }
      if (hit?.kind === "deck") {
        const deck = state.decks.find((d) => d.id === hit.id);
        state.selection = { kind: "deck", id: hit.id };
        checkpoint(state);
        dragging = { type: "move-deck", id: hit.id, dx: world[0] - deck.x, dz: world[1] - deck.z };
        render();
        return;
      }
      if (hit?.kind === "steps") {
        const step = state.steps.find((s) => s.id === hit.id);
        state.selection = { kind: "steps", id: hit.id };
        checkpoint(state);
        dragging = { type: "move-steps", id: hit.id, dx: world[0] - step.x, dz: world[1] - step.z };
        render();
        return;
      }
      if (hit?.kind === "stump") {
        state.selection = { kind: "stump", id: hit.id };
        checkpoint(state);
        dragging = { type: "move-stump", id: hit.id };
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
      if (dragging?.type === "deck" && state.draft) {
        const p = snapPt(world, g);
        state.draft.w = p[0] - state.draft.x;
        state.draft.d = p[1] - state.draft.z;
        plan2d.draw();
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
        return;
      }
      if (dragging?.type === "move-deck") {
        const deck = state.decks.find((d) => d.id === dragging.id);
        if (!deck) return;
        const p = snapPt([world[0] - dragging.dx, world[1] - dragging.dz], g);
        deck.x = p[0];
        deck.z = p[1];
        render();
        return;
      }
      if (dragging?.type === "move-steps") {
        const step = state.steps.find((s) => s.id === dragging.id);
        if (!step) return;
        const p = snapPt([world[0] - dragging.dx, world[1] - dragging.dz], g);
        step.x = p[0];
        step.z = p[1];
        render();
        return;
      }
      if (dragging?.type === "move-stump") {
        const stump = state.stumps.find((s) => s.id === dragging.id);
        if (!stump) return;
        const p = snapPt(world, g);
        stump.x = p[0];
        stump.z = p[1];
        render();
      }
    },
    pointerUp() {
      if (dragging?.type === "deck") {
        const draft = state.draft;
        state.draft = null;
        dragging = null;
        if (draft && Math.abs(draft.w) >= 0.4 && Math.abs(draft.d) >= 0.4) {
          checkpoint(state);
          commands.placeDeck(draft);
          commit();
        } else render();
        return;
      }
      if (dragging?.type === "place") {
        if (state.ghost?.valid) {
          checkpoint(state);
          commands.addFurniture(state.ghost);
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
      state.draft = null;
      dragging = null;
      state.selection = { kind: hit.kind === "handle" ? "wall" : hit.kind, id: hit.kind === "handle" ? hit.wallId : hit.id };
      state.menuAt = [...world];
      hidePop();
      render();
      openMenu(client.x, client.y);
    },
    doubleClick(world, screen) {
      if (["wall", "door", "window", "delete", "furnish", "deck", "steps", "stumps"].includes(state.tool)) return false;
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

  function render() {
    plan2d.draw();
    view3d?.setSelectedRoom(state.selection?.kind === "room" ? state.selection.id : null);
    view3d?.rebuild(state);
    updateStatus();
    syncTools();
    syncInspector();
  }

  function updateStatus() {
    const net = state.rooms.reduce((s, r) => s + internalArea(r), 0);
    const gfa = state.walls.length ? grossFloorArea(state.walls) : 0;
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
      if (r) extra = ` · ${r.name} ${roomAreaText(r)}`;
    } else if (state.selection?.kind === "furniture") {
      const f = state.furniture.find((x) => x.id === state.selection.id);
      if (f) {
        extra = ` · ${furnLabel(f)}${f.locked ? " · locked" : ""}${f.type === "tank" ? " 1.80 × 0.60 m" : ""}`;
        if (f.type === "plant" && !f.hidden) action = `<button type="button" class="snap-btn" data-act="hide-plant">Hide plant</button>`;
      }
    } else if (state.preview && state.chain?.length) {
      extra = ` · ${fmt(dist(state.chain.at(-1), state.preview))}`;
    } else if (state.tool === "furnish") {
      extra = ` · ${FURN[state.furnish]?.label || "Furnish"} — drag to place`;
    } else if (state.tool === "deck") extra = " · drag a deck rectangle";
    else if (state.tool === "steps") extra = " · click to place steps";
    else if (state.tool === "stumps") extra = " · click to place a stump";
    if (state.note) extra += ` · ${state.note}`;
    const summary = `${state.rooms.length} rooms · net ${fmtArea(net)} · GFA ${fmtArea(gfa)}${extra}`;
    const toolName = {
      select: "Select",
      wall: "Wall",
      door: "Door",
      window: "Window",
      room: "Room name",
      delete: "Delete",
      furnish: "Furnish",
      deck: "Deck",
      steps: "Steps",
      stumps: "Stumps",
    }[state.tool];
    status.innerHTML = statusBarHtml({
      snap: state.snap.toFixed(2),
      dim: DIM_LABEL[state.dimMode] || "Centreline",
      tool: toolName,
      action,
      summary,
    });
    status.querySelector("[data-act=snap]")?.addEventListener("click", () => {
      state.snap = state.snap === SNAP ? SNAP_FINE : SNAP;
      updateStatus();
    });
    status.querySelector("[data-act=dim]")?.addEventListener("click", () => {
      const i = DIM_ORDER.indexOf(state.dimMode);
      state.dimMode = DIM_ORDER[(i + 1) % DIM_ORDER.length];
      saveNow();
      render();
    });
    status.querySelector("[data-act=hide-plant]")?.addEventListener("click", () => {
      const f = state.furniture.find((x) => x.id === state.selection?.id);
      if (f) {
        checkpoint(state);
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
    state.draft = null;
    if (t !== "furnish") state.ghost = null;
    hidePop();
    hideMenu();
    render();
  }

  function setView(v) {
    if (v === "top") {
      state.view = "model";
      view3d?.topView(state);
    } else state.view = v;
    syncTools();
    requestAnimationFrame(() => {
      plan2d.resize();
      view3d?.resize();
      view3d?.rebuild(state);
    });
  }

  function undo() {
    const prev = state.past.pop();
    if (!prev) return;
    state.future.push(snapshot(state));
    applySnapshot(state, prev);
    refreshRooms();
    saveNow();
    render();
  }
  function redo() {
    const nxt = state.future.pop();
    if (!nxt) return;
    state.past.push(snapshot(state));
    applySnapshot(state, nxt);
    refreshRooms();
    saveNow();
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
        checkpoint(state);
        room.name = b.dataset.n;
        state.labels = labelsFromRooms(state.rooms);
        hidePop();
        commit();
      }),
    );
    pop.querySelector("#name-form").addEventListener("submit", (e) => {
      e.preventDefault();
      checkpoint(state);
      room.name = input.value.trim() || "Room";
      state.labels = labelsFromRooms(state.rooms);
      hidePop();
      commit();
    });
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
        <div class="gen-row"><span class="gen-label">Bedrooms</span><div class="chips">
          <button type="button" class="chip" data-beds="0">Studio</button>
          <button type="button" class="chip" data-beds="1">1</button>
          <button type="button" class="chip" data-beds="2">2</button>
          <button type="button" class="chip active" data-beds="3">3</button>
          <button type="button" class="chip" data-beds="4">4</button>
        </div></div>
        <div class="gen-row"><span class="gen-label">Baths</span><div class="chips">
          <button type="button" class="chip" data-baths="1">1</button>
          <button type="button" class="chip active" data-baths="2">2</button>
        </div></div>
        <div class="gen-row"><span class="gen-label">About</span><div class="chips">
          <button type="button" class="chip" data-area="45">45 m²</button>
          <button type="button" class="chip" data-area="85">85 m²</button>
          <button type="button" class="chip active" data-area="160">160 m²</button>
        </div></div>
        <div class="gen-row"><span class="gen-label">Kitchen</span><div class="chips">
          <button type="button" class="chip active" data-kit="open">Open</button>
          <button type="button" class="chip" data-kit="separate">Separate</button>
        </div></div>
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
      return { plants: onChip("plants"), sofa: onChip("sofa"), bed: onChip("bed"), table: onChip("table"), tank: onChip("tank") };
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
      persist.persistNow();
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
    requestAnimationFrame(() => area.focus({ preventScroll: false }));
  }

  function filePopover(anchor) {
    showPop(
      anchor,
      `<div class="pop-form">
        <p class="pop-title">Plan file</p>
        <button type="button" data-f="new">New</button>
        <button type="button" data-f="open">Open JSON</button>
        <button type="button" data-f="save">Save JSON</button>
        <button type="button" data-f="glb">Download .glb</button>
        <p class="pop-title">Sheet</p>
        <button type="button" data-f="svg" data-scale="50">Plan SVG 1:50</button>
        <button type="button" data-f="svg" data-scale="100">Plan SVG 1:100</button>
        <button type="button" data-f="pdf" data-scale="50">Plan PDF 1:50</button>
        <button type="button" data-f="pdf" data-scale="100">Plan PDF 1:100</button>
        <button type="button" data-f="dxf">DXF</button>
        <p class="pop-title">Site</p>
        <button type="button" data-f="stumps">Stump grid under house</button>
      </div>`,
      280,
    );
    pop.querySelector("[data-f=new]").onclick = () => {
      loadPlan({ walls: [], openings: [], labels: [], furniture: [], decks: [], steps: [], stumps: [] }, true);
      hidePop();
    };
    pop.querySelector("[data-f=open]").onclick = () => {
      $("#file-in").click();
      hidePop();
    };
    pop.querySelector("[data-f=save]").onclick = () => {
      downloadText("neeky-plan.json", JSON.stringify(serializePlan(state), null, 2), "application/json");
      hidePop();
    };
    pop.querySelector("[data-f=glb]").onclick = async () => {
      const bin = await view3d.exportGLTF();
      downloadBlob("neeky-house.glb", new Blob([bin], { type: "model/gltf-binary" }));
      hidePop();
    };
    pop.querySelectorAll("[data-f=svg], [data-f=pdf], [data-f=dxf]").forEach((btn) => {
      btn.onclick = () => {
        const kind = btn.dataset.f;
        const file = exportSheet(state, kind === "dxf" ? "dxf" : kind, Number(btn.dataset.scale || 50));
        downloadBlob(file.name, file.blob);
        hidePop();
      };
    });
    pop.querySelector("[data-f=stumps]").onclick = () => {
      commands.edit(() => commands.fillStumps());
      hidePop();
    };
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

  function anchorWorld() {
    const sel = state.selection;
    const obj = selectedObj(state);
    if (!sel || !obj) return null;
    if (sel.kind === "furniture") return [obj.x, obj.z];
    if (sel.kind === "stump" || sel.kind === "steps") return [obj.x, obj.z];
    if (sel.kind === "deck") {
      const d = normalizeDeck(obj);
      return [d.x + d.w / 2, d.z + d.d / 2];
    }
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

  function inspectorSignature() {
    const sel = state.selection;
    const obj = selectedObj(state);
    if (!sel || !obj || state.chain) return "";
    if (sel.kind === "furniture") return `f:${obj.id}:${obj.type}:${obj.locked ? 1 : 0}`;
    if (sel.kind === "opening") return `o:${obj.id}:${obj.type}`;
    if (sel.kind === "wall") return `w:${obj.id}`;
    if (sel.kind === "room") return `r:${obj.id}`;
    if (sel.kind === "deck") return `deck:${obj.id}:${obj.kind}`;
    if (sel.kind === "steps") return `steps:${obj.id}`;
    if (sel.kind === "stump") return `stump:${obj.id}`;
    return "";
  }

  function fieldValue(obj, field) {
    const sel = state.selection;
    if (field === "name") {
      if (sel?.kind === "room" || sel?.kind === "deck") return obj.name || "";
      return obj.name || (obj.type === "tank" ? "Blue-tongue" : FURN[obj.type]?.label || "");
    }
    if (field === "len") return fmtNum(wallLen(obj));
    if (field === "width") return fmtNum(obj.width);
    if (field === "height") return fmtNum(obj.height);
    if (field === "sill") return fmtNum(obj.sill || 0);
    if (field === "w" || field === "dia") return fmtNum(obj.w);
    if (field === "d") return fmtNum(obj.d);
    if (field === "rot") return String(rotDeg(obj.rot));
    if (field === "count") return String(obj.count || 0);
    if (field === "going") return fmtNum(obj.going);
    if (field === "size") return fmtNum(obj.size);
    return "";
  }

  function writeField(obj, field, raw, kind = state.selection?.kind) {
    if (field === "name") {
      const text = String(raw).trim().slice(0, 32);
      if (kind === "room") {
        obj.name = text || "Room";
        state.labels = labelsFromRooms(state.rooms);
        return;
      }
      if (kind === "deck") {
        obj.name = text || (obj.kind === "veranda" ? "Veranda" : "Deck");
        return;
      }
      const fallback = obj.type === "tank" ? "Blue-tongue" : FURN[obj.type]?.label || "";
      obj.name = !text || text === fallback ? "" : text;
      return;
    }
    const n = typeof raw === "number" ? raw : parseLen(raw);
    if (n == null) return;
    if (kind === "wall" && field === "len") {
      commands.setWallLength(obj, n);
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
    if (kind === "deck" && (field === "w" || field === "d")) {
      obj[field] = clamp(n, 0.4, 40);
      return;
    }
    if (kind === "steps") {
      if (field === "width") obj.width = clamp(n, 0.6, 4);
      else if (field === "count") obj.count = clamp(Math.round(n), 1, 20);
      else if (field === "going") obj.going = clamp(n, 0.15, 0.5);
      return;
    }
    if (kind === "stump" && field === "size") {
      obj.size = clamp(n, 0.08, 0.45);
      return;
    }
    if (kind !== "furniture") return;
    if (field === "dia") {
      const d = clamp(n, 0.15, 1.8);
      obj.w = d;
      obj.d = d;
    } else if (field === "w" || field === "d") obj[field] = clamp(n, 0.25, 6);
    else if (field === "rot") obj.rot = ((((n % 360) + 360) % 360) * Math.PI) / 180;
  }

  function inspectorBody() {
    const sel = state.selection;
    const obj = selectedObj(state);
    if (!sel || !obj) return "";
    if (sel.kind === "wall") return inspField("len", "Length m", fieldValue(obj, "len"), true);
    if (sel.kind === "opening") {
      const bits = [inspField("width", "Width m", fieldValue(obj, "width")), inspField("height", "Height m", fieldValue(obj, "height"))];
      if (obj.type === "window") bits.push(inspField("sill", "Sill m", fieldValue(obj, "sill"), true));
      return bits.join("");
    }
    if (sel.kind === "room") return `${nameField(obj.name || "")}<p class="insp-read">${escapeHtml(roomAreaText(obj))}</p>`;
    if (sel.kind === "deck") {
      return [nameField(obj.name || ""), inspField("w", "Width m", fieldValue(obj, "w")), inspField("d", "Depth m", fieldValue(obj, "d"))].join("");
    }
    if (sel.kind === "steps") {
      return [inspField("width", "Width m", fieldValue(obj, "width")), inspField("count", "Risers", fieldValue(obj, "count")), inspField("going", "Going m", fieldValue(obj, "going"), true)].join("");
    }
    if (sel.kind === "stump") return inspField("size", "Size m", fieldValue(obj, "size"), true);
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
        base = snapshot(state);
        input.dataset.kind = state.selection?.kind || "";
        input.dataset.sid = state.selection?.id || "";
        if (input.dataset.field !== "name") requestAnimationFrame(() => input.select());
      });
      input.addEventListener("input", () => {
        const obj = objectBy(state, input.dataset.kind, input.dataset.sid) || selectedObj(state);
        if (!obj) return;
        writeField(obj, input.dataset.field, input.value, input.dataset.kind || state.selection?.kind);
        paintLive();
      });
      input.addEventListener("blur", () => {
        if (!base) return;
        const obj = objectBy(state, input.dataset.kind, input.dataset.sid);
        if (obj) writeField(obj, input.dataset.field, input.value, input.dataset.kind);
        const prev = base;
        base = null;
        if (JSON.stringify(snapshot(state)) === JSON.stringify(prev)) {
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
    const obj = selectedObj(state);
    if (!obj) return;
    const kicker = el.querySelector(".insp-kicker");
    if (kicker) kicker.textContent = kickerFor(state.selection, obj);
    el.querySelectorAll("[data-field]").forEach((input) => {
      if (input === document.activeElement) return;
      const next = fieldValue(obj, input.dataset.field);
      if (input.value !== next) input.value = next;
    });
    const read = el.querySelector(".insp-read");
    if (read && state.selection?.kind === "room") read.textContent = roomAreaText(obj);
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
      el.innerHTML = `<div class="insp-bar"><span class="insp-kicker">${escapeHtml(kickerFor(state.selection, selectedObj(state)))}</span><button type="button" class="insp-more" id="insp-more" aria-haspopup="menu" title="Object tools">Tools</button></div><div class="insp-grid">${inspectorBody()}</div>`;
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

  function openMenu(clientX, clientY) {
    const menu = $("#ctx-menu");
    const obj = selectedObj(state);
    const splitT = state.selection?.kind === "wall" && obj ? commands.splitParam(obj) : null;
    const html = menuHtml(state, obj, splitT);
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

  const plan2d = createPlan2D(canvas2d, () => state, actions);
  import("./view3d.js")
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
        state.draft = null;
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
      checkpoint(state);
      for (const f of state.furniture) if (f.type === "plant") f.hidden = visible;
      commit();
    }
    if (e.target.closest("#file-btn")) filePopover(e.target.closest("#file-btn"));
    if (e.target.closest("#undo-btn")) undo();
    if (e.target.closest("#redo-btn")) redo();
  });

  $("#toast").addEventListener("click", () => {
    $("#toast").hidden = true;
    clearTimeout(toastTimer);
  });

  $("#file-in").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      loadPlan(readPlanText(await file.text()), true);
    } catch (err) {
      showError(err.message || "Could not open that file");
    }
  });

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
  window.addEventListener("pagehide", () => persist.persistNow());
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
    if (btn.dataset.act !== "nudge") hideMenu();
    commands.runAction(btn.dataset.act, btn.dataset);
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
      state.draft = null;
      dragging = null;
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
          checkpoint(state);
          f.rot = (f.rot || 0) + Math.PI / 2;
          commit();
        }
      } else if (state.selection?.kind === "steps") {
        const step = state.steps.find((s) => s.id === state.selection.id);
        if (step) {
          checkpoint(state);
          step.rot = (step.rot || 0) + Math.PI / 2;
          commit();
        }
      }
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (state.selection?.kind === "wall") {
        const id = state.selection.id;
        checkpoint(state);
        state.openings = state.openings.filter((o) => o.wallId !== id);
        state.walls = state.walls.filter((w) => w.id !== id);
        state.selection = null;
        refreshRooms();
        commit();
      } else if (state.selection?.kind === "opening") {
        checkpoint(state);
        state.openings = state.openings.filter((o) => o.id !== state.selection.id);
        state.selection = null;
        commit();
      } else if (state.selection?.kind === "furniture") {
        checkpoint(state);
        commands.removeFurniture(state.selection.id);
        commit();
      } else if (["deck", "steps", "stump"].includes(state.selection?.kind)) {
        commands.deleteHit(state.selection);
      }
    }
    const map = { v: "select", w: "wall", d: "door", n: "window" };
    if (map[e.key.toLowerCase()] && !e.metaKey && !e.ctrlKey) setTool(map[e.key.toLowerCase()]);
  }

  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest("#gen-btn, #file-btn, [data-tool=room]")) hidePop();
    const menu = $("#ctx-menu");
    if (menu && !menu.hidden && !menu.contains(e.target) && !e.target.closest("#insp-more")) hideMenu();
  });

  let saved = null;
  let rawSaved = null;
  let startupError = null;
  try {
    rawSaved = localStorage.getItem(STORAGE_KEY);
  } catch {
    rawSaved = null;
  }
  if (rawSaved) {
    const read = readAutosave(rawSaved);
    if (read.ok) saved = read.plan;
    else startupError = read.error || "Could not open the saved plan.";
  }
  if (startupError) keepUnreadableAutosave(rawSaved);
  if (saved?.walls?.length) loadPlan(saved, false);
  else loadPlan(familyPlan(), false, { hold: !!startupError });
  if (startupError) {
    showError(
      `Could not open the plan saved in this browser (${startupError}). That copy is kept under ${STORAGE_BACKUP_KEY} and will not be replaced until you edit or open another file.`,
      { sticky: true },
    );
  }

  return () => {
    alive = false;
    clearTimeout(flashTimer);
    clearTimeout(toastTimer);
    persist.persistNow();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
    plan2d.dispose();
    view3d?.dispose();
    root.innerHTML = "";
  };
}
