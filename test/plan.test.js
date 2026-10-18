import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STUMP_HEIGHT, STUMP_SIZE } from "../js/constants.js";
import { stumpGrid } from "../js/elements.js";
import { layoutSheet, toDxf, toPdf, toSvg } from "../js/export-sheet.js";
import { familyPlan } from "../js/generate.js";
import {
  computeRooms,
  dimensionBox,
  grossFloorArea,
  indexPoints,
  internalArea,
  normalizePlan,
  offsetPolygon,
  planarize,
  wallLen,
} from "../js/geom.js";
import { importPlanData, serializePlan } from "../js/schema.js";

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
  assert.equal(again.version, 2);
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
});
