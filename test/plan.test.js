import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STORAGE_BACKUP_KEY, STORAGE_KEY, STUMP_HEIGHT, STUMP_SIZE } from "../js/constants.js";
import { stumpGrid } from "../js/elements.js";
import { layoutSheet, toDxf, toPdf, toSvg } from "../js/export-sheet.js";
import { familyPlan } from "../js/generate.js";
import {
  computeRooms,
  dimensionBox,
  grossFloorArea,
  indexPoints,
  internalArea,
  nearestWall,
  normalizePlan,
  offsetPolygon,
  planarize,
  projectOnSeg,
  wallLen,
} from "../js/geom.js";
import { statusBarHtml } from "../js/panels.js";
import { importPlanData, serializePlan } from "../js/schema.js";
import { createPersist, createState, keepUnreadableAutosave, readAutosave } from "../js/store.js";

const original = JSON.parse(readFileSync(new URL("./fixtures/belli-v1.json", import.meta.url), "utf8"));

function rectWalls(x0, z0, x1, z1) {
  return [
    { id: "s", a: [x0, z0], b: [x1, z0] },
    { id: "e", a: [x1, z0], b: [x1, z1] },
    { id: "n", a: [x1, z1], b: [x0, z1] },
    { id: "w", a: [x0, z1], b: [x0, z0] },
  ];
}

test("vertex index collapses points that share a cell", () => {
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push([i / 10, 0]);
  for (let i = 0; i < 40; i++) pts.push([i / 10 + 1e-8, 0]);
  const { ids, verts } = indexPoints(pts);
  assert.equal(verts.length, 40);
  assert.equal(ids[0], ids[40]);
});

test("planarize splits a T-junction so both rooms appear", () => {
  const walls = [
    { id: "s", a: [0, 0], b: [4, 0] },
    { id: "e", a: [4, 0], b: [4, 3] },
    { id: "n", a: [4, 3], b: [0, 3] },
    { id: "w", a: [0, 3], b: [0, 0] },
    { id: "m", a: [2, 0], b: [2, 3] },
  ];
  assert.equal(computeRooms(walls).length, 1);
  const split = planarize(walls);
  const rooms = computeRooms(split);
  assert.equal(rooms.length, 2);
  const areas = rooms.map((r) => Math.round(r.area * 100) / 100).sort();
  assert.deepEqual(areas, [6, 6]);
});

test("dimension modes offset the centreline box by half the wall", () => {
  const walls = rectWalls(0, 0, 9, 6);
  const centre = dimensionBox(walls, "centreline");
  const outside = dimensionBox(walls, "outside");
  const inside = dimensionBox(walls, "inside");
  assert.equal(centre.w, 9);
  assert.equal(centre.h, 6);
  assert.ok(Math.abs(outside.w - 9.2) < 1e-9);
  assert.ok(Math.abs(outside.h - 6.2) < 1e-9);
  assert.ok(Math.abs(inside.w - 8.8) < 1e-9);
  assert.ok(Math.abs(inside.h - 5.8) < 1e-9);
});

test("internal area and gross floor area use the wall faces", () => {
  const walls = rectWalls(0, 0, 3, 3);
  const [room] = computeRooms(walls);
  assert.ok(Math.abs(internalArea(room) - 2.8 * 2.8) < 1e-6);
  assert.ok(Math.abs(grossFloorArea(walls) - 3.2 * 3.2) < 1e-6);
  const inset = offsetPolygon(room.points, -0.1);
  assert.equal(inset.length, 4);
});

test("v1 Belli Park file migrates, normalises, and keeps four rooms", () => {
  const plan = normalizePlan(importPlanData(original));
  assert.equal(plan.walls.length > 0, true);
  assert.equal(plan.rooms.length, 4);
  const names = plan.rooms.map((r) => r.name).sort();
  assert.deepEqual(names, ["Bath + Laundry", "Bedroom 1", "Bedroom 2", "Living + Kitchen"]);
  const again = serializePlan(plan);
  const back = normalizePlan(importPlanData(again));
  assert.equal(back.rooms.length, 4);
  assert.equal(back.version, undefined);
  assert.equal(again.version, 4);
  assert.equal(again.decks.length, 0);
  const openings = back.openings.length;
  assert.equal(openings, original.openings.length);
});

test("import rejects coordinates that are not finite numbers", () => {
  assert.throws(
    () =>
      importPlanData({
        app: "neeky-home-designer",
        walls: [{ a: [0, 0], b: ["north", 3] }],
      }),
    /finite number/,
  );
  assert.throws(() => importPlanData("{"), /valid JSON/);
  assert.throws(() => importPlanData({ app: "other", walls: [] }), /Not a Neeky/);
  assert.throws(() => importPlanData({ app: "neeky-home-designer", version: 9, walls: [] }), /schema 9/);
});

test("family plan survives normalise with its openings", () => {
  const plan = normalizePlan(familyPlan());
  assert.ok(plan.rooms.length >= 8);
  assert.equal(plan.openings.length, familyPlan().openings.length);
  assert.ok(plan.walls.every((w) => wallLen(w) > 0.05));
});

test("stump grid hits both ends of a 6 by 9 centreline", () => {
  const posts = stumpGrid({ minX: 0, minZ: 0, maxX: 9, maxZ: 6 });
  assert.equal(posts.length, 7 * 5);
  assert.equal(posts[0].size, STUMP_SIZE);
  assert.equal(posts[0].height, STUMP_HEIGHT);
  assert.ok(posts.some((p) => p.x === 9 && p.z === 6));
});

test("v1.3 Belli Park plan keeps the deck, steps and stump grid", () => {
  const file = JSON.parse(readFileSync(new URL("../plans/belli-park-6x9-plan.json", import.meta.url), "utf8"));
  const plan = normalizePlan(importPlanData(file));
  assert.equal(file.version, 2);
  assert.equal(plan.rooms.length, 4);
  assert.equal(plan.decks.length, 1);
  assert.equal(plan.decks[0].name, "North deck");
  assert.ok(Math.abs(plan.decks[0].d - 2) < 1e-9);
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.stumps.length, 42);
  assert.ok(plan.furniture.some((f) => f.type === "bench"));
  assert.ok(plan.furniture.some((f) => f.type === "robe"));
  assert.ok(plan.furniture.some((f) => f.type === "wc"));
  assert.ok(Math.abs(grossFloorArea(plan.walls) - 57.04) < 0.02);
});

test("sheet export carries scale, north, title block, and DXF walls", () => {
  const plan = normalizePlan(importPlanData(original));
  plan.title = "Belli Park";
  plan.dimMode = "outside";
  const model = layoutSheet(plan, { scale: 50, date: "2026-10-18" });
  assert.equal(model.scale, 50);
  const svg = toSvg(model);
  assert.match(svg, /1:50/);
  assert.match(svg, />N</);
  assert.match(svg, /Belli Park/);
  assert.match(svg, /GFA/);
  const pdf = toPdf(model);
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /Belli Park/);
  const dxf = toDxf(plan);
  assert.match(dxf, /WALLS/);
  assert.match(dxf, /\nLINE\n/);
  assert.match(dxf, /\$INSUNITS/);
  assert.equal(model.w, 420);
  assert.equal(model.h, 297);
});

const xssPayload = `<img src=x onerror="window.__xss=1">`;

test("status strip escapes room and furniture names", () => {
  const html = statusBarHtml({
    snap: "0.25",
    dim: "Outside",
    tool: "Select",
    action: "",
    summary: `1 rooms · net 10.24 m² · GFA 12.96 m² · ${xssPayload} 10.24 m² · ${xssPayload}`,
  });
  assert.equal(html.includes("<img"), false);
  assert.match(html, /&lt;img src=x onerror=&quot;window\.__xss=1&quot;&gt;/);
});

test("unreadable autosave is kept and not overwritten until released", async () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
  };
  const raw = JSON.stringify({
    app: "neeky-home-designer",
    version: 9,
    title: "keep me",
    walls: [
      { a: [0, 0], b: [4, 0] },
      { a: [4, 0], b: [4, 3] },
      { a: [4, 3], b: [0, 3] },
      { a: [0, 3], b: [0, 0] },
    ],
  });
  storage.setItem(STORAGE_KEY, raw);
  const read = readAutosave(raw);
  assert.equal(read.ok, false);
  assert.match(read.error, /schema 9/);
  keepUnreadableAutosave(raw, storage);
  const state = createState();
  const persist = createPersist(() => state, storage);
  persist.hold();
  persist.persist();
  persist.persistNow();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(storage.getItem(STORAGE_BACKUP_KEY), raw);
  persist.release();
  state.title = "edited";
  persist.persistNow();
  const written = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(written.version, 4);
  assert.equal(written.title, "edited");
  assert.equal(storage.getItem(STORAGE_BACKUP_KEY), raw);
  const migrated = readAutosave(JSON.stringify({ app: "neeky-home-designer", walls: raw && JSON.parse(raw).walls }));
  assert.equal(migrated.ok, true);
  assert.equal(migrated.plan.walls.length, 4);
});

test("nearestWall spatial index matches a full scan", () => {
  const walls = [];
  let n = 0;
  for (let x = 0; x <= 12; x += 3) walls.push({ id: `v${n++}`, a: [x, 0], b: [x, 9] });
  for (let z = 0; z <= 9; z += 3) walls.push({ id: `h${n++}`, a: [0, z], b: [12, z] });
  walls.push({ id: "long", a: [0.2, 0.2], b: [11.5, 8.4] });
  walls.push({ id: "tie-a", a: [1, 1], b: [1, 2] });
  walls.push({ id: "tie-b", a: [1, 1], b: [2, 1] });
  function linear(p, maxDist) {
    let best = null;
    for (const w of walls) {
      const pr = projectOnSeg(p, w.a, w.b);
      if (pr.dist <= maxDist && (!best || pr.dist < best.dist)) best = { id: w.id, dist: pr.dist, t: pr.t };
    }
    return best;
  }
  assert.equal(nearestWall([0, 0], [], 1), null);
  assert.equal(nearestWall([0, 0], walls, Number.NaN), null);
  for (const maxDist of [0, 0.05, 0.25, 0.45, 4, 99]) {
    for (let x = -1; x <= 13; x += 0.5) {
      for (let z = -1; z <= 10; z += 0.5) {
        const p = [x, z];
        const got = nearestWall(p, walls, maxDist);
        const exp = linear(p, maxDist);
        if (!exp) assert.equal(got, null, `${maxDist} ${x},${z}`);
        else {
          assert.equal(got.wall.id, exp.id, `${maxDist} ${x},${z}`);
          assert.ok(Math.abs(got.dist - exp.dist) < 1e-9);
          assert.ok(Math.abs(got.t - exp.t) < 1e-9);
        }
      }
    }
  }
});

test("sheet export keeps 1:50 when the family plan does not fit on A3", () => {
  const plan = normalizePlan(familyPlan());
  plan.dimMode = "outside";
  plan.title = "Family";
  const model = layoutSheet(plan, { scale: 50, date: "2026-10-18" });
  assert.equal(model.scale, 50);
  assert.ok(model.w > 420 || model.h > 297);
  const svg = toSvg(model);
  assert.match(svg, /1:50/);
  assert.equal(svg.includes("1:64"), false);
  const at100 = layoutSheet(plan, { scale: 100, date: "2026-10-18" });
  assert.equal(at100.scale, 100);
  assert.match(toSvg(at100), /1:100/);
});
