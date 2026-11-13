import {
  APP,
  DIM_MODES,
  SCHEMA_VERSION,
  STUMP_HEIGHT,
  STUMP_SIZE,
  WALL_HEIGHT,
  WALL_THICK,
} from "./constants.js";
import { uid } from "./geom.js";
import { cloneMaterials, defaultMaterials } from "./materials.js";
import { EQUIP_KINDS, MOUNTS, cleanEquipment, clonePower, defaultPower } from "./power.js";
import { ROOF_HIGHS, ROOF_SHAPES, cloneRoof, defaultRoof } from "./roof.js";

export class PlanError extends Error {
  constructor(message) {
    super(Array.isArray(message) ? message.join(" ") : message);
    this.name = "PlanError";
  }
}

function finitePair(p) {
  if (!Array.isArray(p) || p.length < 2) return null;
  const x = Number(p[0]);
  const z = Number(p[1]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return [x, z];
}

function finiteNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function migratePlan(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new PlanError("The file is not a plan object.");
  }
  let version = data.version == null ? 1 : data.version;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new PlanError("Plan version is not a whole number this app understands.");
  }
  if (version > SCHEMA_VERSION) {
    throw new PlanError(
      `This plan uses schema ${version}. Neeky ${SCHEMA_VERSION} can open plans up to schema ${SCHEMA_VERSION}.`,
    );
  }
  if (version < 1) throw new PlanError(`Plan schema ${version} is not a Neeky plan.`);
  let cur = { ...data, version };
  while (cur.version < SCHEMA_VERSION) {
    if (cur.version === 1) cur = migrateV1(cur);
    else if (cur.version === 2) cur = migrateV2(cur);
    else if (cur.version === 3) cur = migrateV3(cur);
    else if (cur.version === 4) cur = migrateV4(cur);
    else throw new PlanError(`No migration from schema ${cur.version}.`);
  }
  return cur;
}

function migrateV1(data) {
  return {
    ...data,
    version: 2,
    title: typeof data.title === "string" ? data.title : "",
    dimMode: DIM_MODES.includes(data.dimMode) ? data.dimMode : "centreline",
    decks: Array.isArray(data.decks) ? data.decks : [],
    steps: Array.isArray(data.steps) ? data.steps : [],
    stumps: Array.isArray(data.stumps) ? data.stumps : [],
  };
}

function migrateV2(data) {
  const power = data.power && typeof data.power === "object" && !Array.isArray(data.power) ? data.power : defaultPower();
  return {
    ...data,
    version: 3,
    power,
    equipment: Array.isArray(data.equipment) ? data.equipment : [],
  };
}

function migrateV3(data) {
  const materials =
    data.materials && typeof data.materials === "object" && !Array.isArray(data.materials)
      ? data.materials
      : defaultMaterials();
  return {
    ...data,
    version: 4,
    materials,
  };
}

function migrateV4(data) {
  const roof = data.roof && typeof data.roof === "object" && !Array.isArray(data.roof) ? data.roof : defaultRoof();
  return {
    ...data,
    version: 5,
    roof,
  };
}

export function validatePlan(data) {
  const errors = [];
  if (!data || typeof data !== "object") return ["The file is not a plan object."];
  if (data.app !== APP) errors.push("Not a Neeky plan file.");
  if (data.version !== SCHEMA_VERSION) errors.push(`Expected schema ${SCHEMA_VERSION}.`);
  if (data.dimMode != null && !DIM_MODES.includes(data.dimMode)) {
    errors.push("Dimension mode must be outside, inside, or centreline.");
  }
  const walls = data.walls;
  if (walls != null && !Array.isArray(walls)) errors.push("Walls must be a list.");
  (Array.isArray(walls) ? walls : []).forEach((w, i) => {
    if (!w || !finitePair(w.a) || !finitePair(w.b)) {
      errors.push(`Wall ${i + 1} has a coordinate that is not a finite number.`);
    }
  });
  const wallCount = Array.isArray(walls) ? walls.length : 0;
  (Array.isArray(data.openings) ? data.openings : []).forEach((o, i) => {
    if (!o || typeof o !== "object") {
      errors.push(`Opening ${i + 1} is not an object.`);
      return;
    }
    const idx = Number(o.wallIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= wallCount) {
      errors.push(`Opening ${i + 1} does not sit on a wall.`);
    }
    for (const key of ["t", "width", "height"]) {
      if (!Number.isFinite(Number(o[key]))) errors.push(`Opening ${i + 1} has a ${key} that is not a finite number.`);
    }
    if (o.sill != null && !Number.isFinite(Number(o.sill))) errors.push(`Opening ${i + 1} has a sill that is not a finite number.`);
    if (o.type != null && o.type !== "door" && o.type !== "window") errors.push(`Opening ${i + 1} is not a door or a window.`);
  });
  (Array.isArray(data.rooms) ? data.rooms : []).forEach((r, i) => {
    if (!r || !finitePair(r.labelAt)) errors.push(`Room label ${i + 1} has a coordinate that is not a finite number.`);
  });
  (Array.isArray(data.furniture) ? data.furniture : []).forEach((f, i) => {
    if (!f || typeof f !== "object") {
      errors.push(`Furniture ${i + 1} is not an object.`);
      return;
    }
    if (!Number.isFinite(Number(f.x)) || !Number.isFinite(Number(f.z))) {
      errors.push(`Furniture ${i + 1} has a coordinate that is not a finite number.`);
    }
    for (const key of ["rot", "w", "d"]) {
      if (f[key] != null && !Number.isFinite(Number(f[key]))) {
        errors.push(`Furniture ${i + 1} has a ${key} that is not a finite number.`);
      }
    }
  });
  (Array.isArray(data.pins) ? data.pins : []).forEach((p, i) => {
    if (!finitePair(p)) errors.push(`Pin ${i + 1} has a coordinate that is not a finite number.`);
  });
  (Array.isArray(data.decks) ? data.decks : []).forEach((d, i) => {
    if (!d || ["x", "z", "w", "d"].some((k) => !Number.isFinite(Number(d[k])))) {
      errors.push(`Deck ${i + 1} has a size or position that is not a finite number.`);
    } else if (d.kind != null && d.kind !== "deck" && d.kind !== "veranda") {
      errors.push(`Deck ${i + 1} must be a deck or a veranda.`);
    }
  });
  (Array.isArray(data.steps) ? data.steps : []).forEach((s, i) => {
    if (!s || !Number.isFinite(Number(s.x)) || !Number.isFinite(Number(s.z))) {
      errors.push(`Steps ${i + 1} have a coordinate that is not a finite number.`);
      return;
    }
    const count = Number(s.count);
    if (!Number.isInteger(count) || count < 1 || count > 24) errors.push(`Steps ${i + 1} need a riser count from 1 to 24.`);
    for (const key of ["width", "rise", "going", "rot"]) {
      if (s[key] != null && !Number.isFinite(Number(s[key]))) errors.push(`Steps ${i + 1} have a ${key} that is not a finite number.`);
    }
  });
  (Array.isArray(data.stumps) ? data.stumps : []).forEach((s, i) => {
    if (!s || !Number.isFinite(Number(s.x)) || !Number.isFinite(Number(s.z))) {
      errors.push(`Stump ${i + 1} has a coordinate that is not a finite number.`);
    }
  });
  if (data.power != null && (typeof data.power !== "object" || Array.isArray(data.power))) {
    errors.push("Power settings must be an object.");
  } else if (data.power) {
    for (const key of ["dailyKwh", "peakSunHours", "autonomyDays", "losses", "panelW", "panelArea", "availableArea", "dod", "evKw", "evHours"]) {
      if (data.power[key] != null && !Number.isFinite(Number(data.power[key]))) {
        errors.push(`Power ${key} is not a finite number.`);
      }
    }
    if (data.power.source != null && data.power.source !== "typed" && data.power.source !== "appliances") {
      errors.push("Power source must be typed or appliances.");
    }
    if (data.power.appliances != null && !Array.isArray(data.power.appliances)) errors.push("Appliances must be a list.");
    (Array.isArray(data.power.appliances) ? data.power.appliances : []).forEach((a, i) => {
      if (!a || typeof a !== "object") {
        errors.push(`Appliance ${i + 1} is not an object.`);
        return;
      }
      if (a.watts != null && !Number.isFinite(Number(a.watts))) errors.push(`Appliance ${i + 1} has watts that are not a finite number.`);
      if (a.hours != null && !Number.isFinite(Number(a.hours))) errors.push(`Appliance ${i + 1} has hours that are not a finite number.`);
    });
  }
  if (data.materials != null && (typeof data.materials !== "object" || Array.isArray(data.materials))) {
    errors.push("Materials settings must be an object.");
  } else if (data.materials && data.materials.wastage != null && !Number.isFinite(Number(data.materials.wastage))) {
    errors.push("Materials wastage is not a finite number.");
  }
  if (data.roof != null && (typeof data.roof !== "object" || Array.isArray(data.roof))) {
    errors.push("Roof settings must be an object.");
  } else if (data.roof) {
    if (data.roof.shape != null && !ROOF_SHAPES.includes(data.roof.shape)) {
      errors.push("Roof shape must be a skillion or a gable.");
    }
    if (data.roof.high != null && !ROOF_HIGHS.includes(data.roof.high)) {
      errors.push("Roof high side must be north, south, east, or west.");
    }
    for (const key of ["pitch", "eave", "gable", "rainfall"]) {
      if (data.roof[key] != null && !Number.isFinite(Number(data.roof[key]))) {
        errors.push(`Roof ${key} is not a finite number.`);
      }
    }
  }
  if (data.equipment != null && !Array.isArray(data.equipment)) errors.push("Equipment must be a list.");
  (Array.isArray(data.equipment) ? data.equipment : []).forEach((e, i) => {
    if (!e || typeof e !== "object") {
      errors.push(`Equipment ${i + 1} is not an object.`);
      return;
    }
    if (!EQUIP_KINDS.includes(e.kind)) errors.push(`Equipment ${i + 1} is not a power object this app understands.`);
    for (const key of ["x", "z", "w", "d"]) {
      if (!Number.isFinite(Number(e[key]))) errors.push(`Equipment ${i + 1} has a ${key} that is not a finite number.`);
    }
    if (e.tilt != null && !Number.isFinite(Number(e.tilt))) errors.push(`Equipment ${i + 1} has a tilt that is not a finite number.`);
    if (e.azimuth != null && !Number.isFinite(Number(e.azimuth))) errors.push(`Equipment ${i + 1} has an azimuth that is not a finite number.`);
    if (e.mount != null && !MOUNTS.includes(e.mount)) errors.push(`Equipment ${i + 1} must sit on the ground, a deck, or a flat area.`);
  });
  if (data.walls != null && !Array.isArray(data.walls)) errors.push("Walls must be a list.");
  return errors;
}

export function serializePlan(state) {
  const walls = (state.walls || []).map((w) => ({ a: [w.a[0], w.a[1]], b: [w.b[0], w.b[1]] }));
  const openings = [];
  for (const o of state.openings || []) {
    const wallIndex = state.walls.findIndex((w) => w.id === o.wallId);
    if (wallIndex < 0) continue;
    openings.push({
      type: o.type === "window" ? "window" : "door",
      wallIndex,
      t: o.t,
      width: o.width,
      height: o.height,
      sill: o.sill ?? 0,
    });
  }
  return {
    app: APP,
    version: SCHEMA_VERSION,
    title: state.title || "",
    unit: "m",
    dimMode: DIM_MODES.includes(state.dimMode) ? state.dimMode : "centreline",
    wallHeight: WALL_HEIGHT,
    wallThickness: WALL_THICK,
    pins: (state.pins || []).map((p) => [p[0], p[1]]),
    walls,
    openings,
    rooms: (state.rooms || []).map((r) => ({ name: r.name, labelAt: [r.centroid[0], r.centroid[1]] })),
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
    decks: (state.decks || []).map((d) => ({
      kind: d.kind === "veranda" ? "veranda" : "deck",
      name: d.name || "",
      x: d.x,
      z: d.z,
      w: d.w,
      d: d.d,
    })),
    steps: (state.steps || []).map((s) => ({
      x: s.x,
      z: s.z,
      rot: s.rot || 0,
      width: s.width,
      count: s.count,
      rise: s.rise,
      going: s.going,
    })),
    stumps: (state.stumps || []).map((s) => ({
      x: s.x,
      z: s.z,
      size: s.size ?? STUMP_SIZE,
      height: s.height ?? STUMP_HEIGHT,
    })),
    power: clonePower(state.power),
    materials: cloneMaterials(state.materials),
    roof: cloneRoof(state.roof),
    equipment: (state.equipment || []).map((e) => {
      const item = cleanEquipment(e);
      if (!item) return null;
      return {
        kind: item.kind,
        name: item.name,
        mount: item.mount,
        x: item.x,
        z: item.z,
        w: item.w,
        d: item.d,
        tilt: item.tilt,
        azimuth: item.azimuth,
      };
    }).filter(Boolean),
  };
}

export function deserializePlan(data) {
  const walls = (data.walls || []).map((w) => ({
    id: uid("w"),
    a: finitePair(w.a),
    b: finitePair(w.b),
  }));
  const openings = (data.openings || []).map((o) => {
    const wall = walls[o.wallIndex];
    return {
      id: uid(o.type === "window" ? "win" : "d"),
      type: o.type === "window" ? "window" : "door",
      wallId: wall.id,
      t: Number(o.t),
      width: Number(o.width),
      height: Number(o.height),
      sill: Number(o.sill || 0),
    };
  });
  const labels = (data.rooms || []).map((r) => ({
    name: String(r.name || "Room"),
    at: finitePair(r.labelAt),
  }));
  const furniture = (data.furniture || []).map((f) => ({
    id: uid("f"),
    type: String(f.type || "plant"),
    x: Number(f.x),
    z: Number(f.z),
    rot: finiteNum(f.rot, 0),
    w: finiteNum(f.w, 0.45),
    d: finiteNum(f.d, 0.45),
    hidden: !!f.hidden,
    auto: !!f.auto,
    name: f.name ? String(f.name) : "",
    locked: !!f.locked,
  }));
  const pins = (data.pins || []).map((p) => finitePair(p));
  const decks = (data.decks || []).map((d) => ({
    id: uid("deck"),
    kind: d.kind === "veranda" ? "veranda" : "deck",
    name: d.name ? String(d.name) : d.kind === "veranda" ? "Veranda" : "Deck",
    x: Number(d.x),
    z: Number(d.z),
    w: Number(d.w),
    d: Number(d.d),
  }));
  const steps = (data.steps || []).map((s) => ({
    id: uid("steps"),
    x: Number(s.x),
    z: Number(s.z),
    rot: finiteNum(s.rot, 0),
    width: finiteNum(s.width, 1.2),
    count: Number(s.count),
    rise: finiteNum(s.rise, 0.15),
    going: finiteNum(s.going, 0.28),
  }));
  const stumps = (data.stumps || []).map((s) => ({
    id: uid("stump"),
    x: Number(s.x),
    z: Number(s.z),
    size: finiteNum(s.size, STUMP_SIZE),
    height: finiteNum(s.height, STUMP_HEIGHT),
  }));
  const equipment = (data.equipment || []).map((e) => {
    const item = cleanEquipment(e);
    return item ? { ...item, id: uid("eq") } : null;
  }).filter(Boolean);
  return {
    title: data.title ? String(data.title) : "",
    dimMode: DIM_MODES.includes(data.dimMode) ? data.dimMode : "centreline",
    walls,
    openings,
    labels,
    furniture,
    pins,
    decks,
    steps,
    stumps,
    power: clonePower(data.power),
    materials: cloneMaterials(data.materials),
    roof: cloneRoof(data.roof),
    equipment,
  };
}

export function importPlanData(data) {
  if (typeof data === "string") {
    try {
      data = JSON.parse(String(data).replace(/^\uFEFF/, ""));
    } catch {
      throw new PlanError("That file is not valid JSON.");
    }
  }
  const migrated = migratePlan(data);
  const errors = validatePlan(migrated);
  if (errors.length) throw new PlanError(errors);
  return deserializePlan(migrated);
}
