import { SNAP, STORAGE_BACKUP_KEY, STORAGE_KEY } from "./constants.js";
import { cloneFurn } from "./furniture.js";
import { cloneMaterials, defaultMaterials } from "./materials.js";
import { clonePower, defaultPower } from "./power.js";
import { cloneRoof, defaultRoof } from "./roof.js";
import { importPlanData, serializePlan } from "./schema.js";

export function createState() {
  return {
    walls: [],
    openings: [],
    labels: [],
    rooms: [],
    furniture: [],
    decks: [],
    steps: [],
    stumps: [],
    equipment: [],
    power: defaultPower(),
    materials: defaultMaterials(),
    roof: defaultRoof(),
    title: "",
    dimMode: "centreline",
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
    draft: null,
    camera2d: { x: 8, z: 6, zoom: 36 },
    past: [],
    future: [],
    pins: [],
    note: "",
    menuAt: null,
    focusField: null,
  };
}

export function snapshot(state) {
  return {
    walls: state.walls.map((w) => ({ ...w, a: [...w.a], b: [...w.b] })),
    openings: state.openings.map((o) => ({ ...o })),
    labels: state.labels.map((l) => ({ ...l, at: [...l.at] })),
    furniture: state.furniture.map(cloneFurn),
    pins: (state.pins || []).map((p) => [...p]),
    decks: (state.decks || []).map((d) => ({ ...d })),
    steps: (state.steps || []).map((s) => ({ ...s })),
    stumps: (state.stumps || []).map((s) => ({ ...s })),
    equipment: (state.equipment || []).map((e) => ({ ...e })),
    power: clonePower(state.power),
    materials: cloneMaterials(state.materials),
    roof: cloneRoof(state.roof),
    title: state.title || "",
  };
}

export function applySnapshot(state, s) {
  state.walls = s.walls;
  state.openings = s.openings;
  state.labels = s.labels;
  state.furniture = s.furniture || [];
  state.pins = (s.pins || []).map((p) => [...p]);
  state.decks = (s.decks || []).map((d) => ({ ...d }));
  state.steps = (s.steps || []).map((d) => ({ ...d }));
  state.stumps = (s.stumps || []).map((d) => ({ ...d }));
  state.equipment = (s.equipment || []).map((e) => ({ ...e }));
  state.power = clonePower(s.power);
  state.materials = cloneMaterials(s.materials);
  state.roof = cloneRoof(s.roof);
  state.title = s.title || "";
}

export function checkpoint(state) {
  state.past.push(snapshot(state));
  if (state.past.length > 60) state.past.shift();
  state.future = [];
}

export function readAutosave(raw) {
  if (raw == null || raw === "") return { ok: true, plan: null, raw: raw ?? null };
  try {
    return { ok: true, plan: importPlanData(raw), raw };
  } catch (err) {
    return {
      ok: false,
      plan: null,
      raw,
      error: err instanceof Error ? err.message : "Could not open the saved plan.",
    };
  }
}

export function keepUnreadableAutosave(raw, storage) {
  if (raw == null) return;
  const box = storage || globalThis.localStorage;
  try {
    box.setItem(STORAGE_BACKUP_KEY, raw);
  } catch {
    /* ignore quota and private-mode failures */
  }
}

export function createPersist(getState, storage) {
  const box = storage || globalThis.localStorage;
  let armed = true;
  let timer = 0;
  function write() {
    if (!armed) return;
    try {
      box.setItem(STORAGE_KEY, JSON.stringify(serializePlan(getState())));
    } catch {
      /* ignore quota and private-mode failures */
    }
  }
  return {
    persist() {
      if (!armed) return;
      clearTimeout(timer);
      timer = setTimeout(write, 280);
    },
    persistNow() {
      if (!armed) return;
      clearTimeout(timer);
      timer = 0;
      write();
    },
    hold() {
      armed = false;
      clearTimeout(timer);
      timer = 0;
    },
    release() {
      armed = true;
    },
    cancel() {
      clearTimeout(timer);
      timer = 0;
    },
  };
}
