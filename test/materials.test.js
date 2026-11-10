import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { layoutSheet, toPdf, toSvg } from "../js/export-sheet.js";
import { grossFloorArea, normalizePlan } from "../js/geom.js";
import {
  STOCK_LENGTHS,
  materialsSheetLines,
  takeoff,
} from "../js/materials.js";
import { POWER_NOTE } from "../js/power.js";
import { importPlanData, serializePlan } from "../js/schema.js";

// 4 m × 3 m centreline rectangle. Door 0.90 × 2.10 centred on the south wall.
// Window 1.20 × 1.20 centred on the east wall. North is +Z.
function room() {
  return {
    walls: [
      { id: "s", a: [0, 0], b: [4, 0] },
      { id: "e", a: [4, 0], b: [4, 3] },
      { id: "n", a: [4, 3], b: [0, 3] },
      { id: "w", a: [0, 3], b: [0, 0] },
    ],
    openings: [
      { id: "d", type: "door", wallId: "s", t: 0.5, width: 0.9, height: 2.1, sill: 0 },
      { id: "win", type: "window", wallId: "e", t: 0.5, width: 1.2, height: 1.2, sill: 0.9 },
    ],
  };
}

function cut(list, kind, length) {
  return list.find((c) => c.kind === kind && Math.abs(c.length - length) < 1e-6);
}

test("a rectangular room with one door and one window has known stud, plate and sheet counts", () => {
  const r = takeoff(room(), { wastage: 0 });
  // 4 m walls: ceil(4 / 0.6) + 1 = 8 studs. 3 m walls: 6.
  // The door and the window each add two jack studs. Grid studs in the opening stay.
  assert.equal(r.studs, 32);
  assert.equal(r.studsOrder, 32);
  assert.equal(r.studLength, 2.7);
  const studs = cut(r.cuts, "stud", 2.7);
  assert.equal(studs.count, 32);
  assert.equal(studs.stock, 5.4);
  assert.equal(studs.sticks, 16);
  assert.equal(studs.per, 2);

  // Top plates: 4, 3, 4, 3. Bottom plates: door splits 4 m into 1.55 + 1.55.
  // The window leaves its 3 m bottom plate in one piece.
  const plates4 = cut(r.cuts, "plate", 4);
  const plates3 = cut(r.cuts, "plate", 3);
  const platesDoor = cut(r.cuts, "plate", 1.55);
  assert.equal(plates4.count, 3);
  assert.equal(plates4.stock, 4.2);
  assert.equal(plates4.sticks, 3);
  assert.equal(plates3.count, 4);
  assert.equal(plates3.stock, 6);
  assert.equal(plates3.sticks, 2);
  assert.equal(plates3.per, 2);
  assert.equal(platesDoor.count, 2);
  assert.equal(platesDoor.stock, 3.6);
  assert.equal(platesDoor.sticks, 1);
  assert.equal(platesDoor.per, 2);
  assert.ok(Math.abs(r.plateMetres - 27.1) < 1e-6);

  // One lining face and one cladding face on every external wall.
  // 14 m × 2.70 m minus the door (0.90 × 2.10) and the window (1.20 × 1.20).
  assert.ok(Math.abs(r.liningArea - 34.47) < 1e-6);
  assert.equal(r.liningSheets, 12);
  assert.ok(Math.abs(r.claddingArea - 34.47) < 1e-6);
  assert.equal(r.sheet.w, 1.2);
  assert.equal(r.sheet.h, 2.4);

  const floor = grossFloorArea(room().walls);
  assert.ok(Math.abs(floor - 4.2 * 3.2) < 1e-6);
  assert.ok(Math.abs(r.floorArea - floor) < 1e-6);
  assert.equal(r.floorSheets, 5);
});

test("ten percent wastage is the default and rounds orders up", () => {
  const plain = takeoff(room());
  const named = takeoff(room(), { wastage: 0.1 });
  assert.equal(plain.wastage, 0.1);
  assert.equal(named.wastage, 0.1);
  assert.equal(named.studs, 32);
  assert.equal(named.studsOrder, 36);
  const studs = cut(named.cuts, "stud", 2.7);
  assert.equal(studs.count, 36);
  assert.equal(studs.sticks, 18);
  assert.equal(studs.stock, 5.4);
  assert.equal(cut(named.cuts, "plate", 4).count, 4);
  assert.equal(cut(named.cuts, "plate", 4).sticks, 4);
  assert.equal(cut(named.cuts, "plate", 4).stock, 4.2);
  assert.equal(cut(named.cuts, "plate", 3).count, 5);
  assert.equal(cut(named.cuts, "plate", 3).stock, 3);
  assert.equal(cut(named.cuts, "plate", 3).sticks, 5);
  assert.equal(cut(named.cuts, "plate", 1.55).count, 3);
  assert.equal(cut(named.cuts, "plate", 1.55).stock, 4.8);
  assert.equal(cut(named.cuts, "plate", 1.55).per, 3);
  assert.equal(cut(named.cuts, "plate", 1.55).sticks, 1);
  assert.equal(named.liningSheets, 14);
  assert.equal(named.floorSheets, 6);
  assert.ok(Math.abs(named.claddingOrder - 34.47 * 1.1) < 1e-6);
  assert.equal(takeoff(room(), { wastage: -1 }).wastage, 0);
  assert.equal(takeoff(room(), { wastage: 4 }).wastage, 1);
});

test("an internal wall is lined on both faces and is not clad", () => {
  const plan = room();
  plan.walls.push({ id: "mid", a: [2, 0], b: [2, 3] });
  const r = takeoff(plan, { wastage: 0 });
  // External grid 8+6+8+6 plus two jacks, and the 3 m partition (6 studs, no opening).
  assert.equal(r.studs, 38);
  assert.ok(Math.abs(r.liningArea - (34.47 + 3 * 2.7 * 2)) < 1e-6);
  assert.ok(Math.abs(r.claddingArea - 34.47) < 1e-6);
  assert.equal(r.liningSheets, 18);
});

test("a plate longer than the longest stock is joined", () => {
  const r = takeoff(
    {
      walls: [{ id: "long", a: [0, 0], b: [7.5, 0] }],
      openings: [],
    },
    { wastage: 0 },
  );
  assert.equal(STOCK_LENGTHS.at(-1), 6);
  assert.equal(cut(r.cuts, "plate", 6).count, 2);
  assert.equal(cut(r.cuts, "plate", 6).stock, 6);
  assert.equal(cut(r.cuts, "plate", 6).sticks, 2);
  assert.equal(cut(r.cuts, "plate", 1.5).count, 2);
  assert.equal(cut(r.cuts, "plate", 1.5).stock, 3);
  assert.equal(cut(r.cuts, "plate", 1.5).sticks, 1);
});

test("an empty plan orders nothing", () => {
  const r = takeoff({ walls: [], openings: [] });
  assert.equal(r.studs, 0);
  assert.equal(r.studsOrder, 0);
  assert.equal(r.plateMetres, 0);
  assert.equal(r.liningSheets, 0);
  assert.equal(r.floorSheets, 0);
  assert.equal(r.claddingArea, 0);
  assert.equal(r.floorArea, 0);
  assert.deepEqual(r.cuts, []);
});

test("the sheet lists the order and the planning note", () => {
  const plan = { ...room(), materials: { wastage: 0.1 }, title: "Sample" };
  const lines = materialsSheetLines(plan);
  assert.equal(lines[0], "Materials");
  assert.ok(lines.some((line) => line.includes("Studs 36")));
  assert.ok(lines.some((line) => line.includes("14 sheets")));
  assert.equal(lines.join(" ").includes(POWER_NOTE), true);
  const svg = toSvg(layoutSheet(plan, { scale: 50, date: "2026-11-10" }));
  assert.match(svg, /Materials/);
  assert.match(svg, /Studs 36/);
  assert.match(svg, /Planning estimate only/);
  const pdf = toPdf(layoutSheet(plan, { scale: 50, date: "2026-11-10" }));
  assert.match(pdf, /Planning estimate only/);
  assert.match(pdf, /Studs 36/);
  const empty = toSvg(layoutSheet({ walls: [], openings: [] }, { scale: 50 }));
  assert.equal(empty.includes(POWER_NOTE), false);
});

test("schema 3 gains a wastage setting and round-trips", () => {
  const file = JSON.parse(readFileSync(new URL("../plans/belli-park-6x9-plan.json", import.meta.url), "utf8"));
  const imported = importPlanData(file);
  assert.equal(imported.materials.wastage, 0.1);
  const saved = serializePlan({ ...imported, rooms: [] });
  assert.equal(saved.version, 4);
  assert.equal(saved.materials.wastage, 0.1);
  saved.materials.wastage = 0.15;
  const back = importPlanData(saved);
  assert.equal(back.materials.wastage, 0.15);
  const plan = normalizePlan(back);
  const r = takeoff(plan);
  assert.equal(r.wastage, 0.15);
  assert.ok(r.studs > 0);
  assert.ok(r.studsOrder > 0);
  assert.ok(r.plateMetres > 0);
  assert.ok(r.liningSheets > 0);
  assert.ok(r.floorSheets > 0);
  assert.throws(
    () => importPlanData({ app: "neeky-home-designer", version: 5, walls: [] }),
    /schema 5/,
  );
});
