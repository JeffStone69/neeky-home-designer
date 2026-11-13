import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WALL_HEIGHT } from "../js/constants.js";
import { layoutSheet, toDxf, toPdf, toSvg } from "../js/export-sheet.js";
import { materialsSheetLines, takeoff } from "../js/materials.js";
import { solarResultHtml } from "../js/panels.js";
import { POWER_NOTE, powerSheetLines, sizePower } from "../js/power.js";
import {
  BATTEN_SPACING,
  COVER_WIDTH,
  DEFAULT_EAVE,
  DEFAULT_GABLE,
  DEFAULT_PITCH,
  DEFAULT_RAINFALL,
  DOWNPIPE_RUN,
  RAFTER_SPACING,
  ROOF_LIMIT,
  RUNOFF,
  SOLAR_SETBACK,
  defaultRoof,
  roofFitCount,
  roofModel,
} from "../js/roof.js";
import { importPlanData, serializePlan } from "../js/schema.js";

// 4 m × 3 m centreline. Outside faces are 4.2 m × 3.2 m. North is +Z.
function room() {
  return {
    walls: [
      { id: "s", a: [0, 0], b: [4, 0] },
      { id: "e", a: [4, 0], b: [4, 3] },
      { id: "n", a: [4, 3], b: [0, 3] },
      { id: "w", a: [0, 3], b: [0, 0] },
    ],
    openings: [],
  };
}

function near(actual, expected, tol = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tol, `${actual} is not within ${tol} of ${expected}`);
}

const basePower = {
  source: "typed",
  dailyKwh: 20,
  peakSunHours: 5,
  losses: 0,
  panelW: 500,
  panelArea: 2,
  availableArea: 100,
  autonomyDays: 1,
  dod: 1,
  includeEv: false,
};

test("a skillion and a gable report area, pitch and overhangs", () => {
  assert.equal(DEFAULT_PITCH, 15);
  assert.equal(DEFAULT_EAVE, 0.3);
  assert.equal(DEFAULT_GABLE, 0.2);
  const walls = room().walls;
  const skill = roofModel(walls, defaultRoof());
  assert.equal(skill.shape, "skillion");
  assert.equal(skill.pitch, 15);
  assert.equal(skill.high, "south");
  assert.equal(skill.planes.length, 1);
  assert.equal(skill.planes[0].face, "north");
  near(skill.planes[0].slope, 3.934);
  near(skill.planes[0].area, 18.096);
  near(skill.catchment, 17.48);
  assert.equal(skill.ridge, null);
  near(skill.outline[0][0], -0.3);
  near(skill.outline[0][1], -0.4);
  near(skill.outline[2][0], 4.3);
  near(skill.outline[2][1], 3.4);

  const steep = roofModel(walls, { ...defaultRoof(), pitch: 30 });
  near(steep.planes[0].area, 20.185);
  assert.ok(steep.planes[0].area > skill.planes[0].area);

  const flat = roofModel(walls, { ...defaultRoof(), pitch: 0 });
  near(flat.planes[0].area, flat.catchment);

  const widerEave = roofModel(walls, { ...defaultRoof(), eave: 0.6 });
  near(widerEave.planes[0].area, 20.953);
  const noEave = roofModel(walls, { ...defaultRoof(), eave: 0 });
  near(noEave.planes[0].area, 15.24);
  assert.ok(noEave.planes[0].area < skill.planes[0].area);

  const gable = roofModel(walls, { ...defaultRoof(), shape: "gable" });
  assert.equal(gable.planes.length, 2);
  assert.deepEqual(gable.planes.map((p) => p.face).sort(), ["north", "south"]);
  near(gable.planes[0].area, 9.048);
  near(gable.planes[0].area + gable.planes[1].area, 18.096);
  near(gable.ridge[0][1], 1.5);
  near(gable.ridge[1][1], 1.5);
  const gableEave = roofModel(walls, { ...defaultRoof(), shape: "gable", eave: 0.6 });
  near(gableEave.planes[0].area, 10.479);
  const noVerge = roofModel(walls, { ...defaultRoof(), shape: "gable", gable: 0 });
  near(noVerge.planes[0].area + noVerge.planes[1].area, 16.522);

  assert.equal(roofModel(walls, { ...defaultRoof(), high: "north" }).planes[0].face, "south");
  assert.equal(roofModel(walls, { ...defaultRoof(), high: "east" }).planes[0].face, "west");
  assert.equal(roofModel(walls, { ...defaultRoof(), high: "west" }).planes[0].face, "east");

  const tall = [
    { id: "s", a: [0, 0], b: [3, 0] },
    { id: "e", a: [3, 0], b: [3, 6] },
    { id: "n", a: [3, 6], b: [0, 6] },
    { id: "w", a: [0, 6], b: [0, 0] },
  ];
  assert.deepEqual(
    roofModel(tall, { ...defaultRoof(), shape: "gable" }).planes.map((p) => p.face).sort(),
    ["east", "west"],
  );
  const square = [
    { id: "s", a: [0, 0], b: [4, 0] },
    { id: "e", a: [4, 0], b: [4, 4] },
    { id: "n", a: [4, 4], b: [0, 4] },
    { id: "w", a: [0, 4], b: [0, 0] },
  ];
  assert.deepEqual(
    roofModel(square, { shape: "gable" }).planes.map((p) => p.face).sort(),
    ["north", "south"],
  );

  const tan = Math.tan((15 * Math.PI) / 180);
  near(skill.height(0, 3.1), WALL_HEIGHT);
  near(skill.height(0, -0.1), WALL_HEIGHT + 3.2 * tan);
  near(skill.height(0, 3.4), WALL_HEIGHT - 0.3 * tan);
  near(gable.height(0, 1.5), WALL_HEIGHT + 1.6 * tan);
  near(gable.height(0, -0.1), WALL_HEIGHT);
  assert.equal(roofModel([], defaultRoof()), null);
});

test("roof framing and sheets use the materials wastage", () => {
  assert.equal(RAFTER_SPACING, 0.6);
  assert.equal(BATTEN_SPACING, 0.9);
  assert.equal(COVER_WIDTH, 0.762);
  const plain = takeoff({ ...room(), roof: defaultRoof() }, { wastage: 0 });
  assert.equal(plain.roof.rafters, 9);
  assert.equal(plain.roof.raftersOrder, 9);
  near(plain.roof.rafterLength, 3.934);
  assert.equal(plain.roof.battens, 6);
  near(plain.roof.battenLength, 4.6);
  assert.equal(plain.roof.sheets, 7);
  assert.equal(plain.roof.sheetsOrder, 7);
  near(plain.roof.sheetLength, 3.934);
  assert.equal(plain.roof.ridgeLength, 0);
  near(plain.roof.flashingLength, 4.6);
  const rafter = plain.cuts.find((c) => c.kind === "rafter");
  assert.equal(rafter.count, 9);
  assert.equal(rafter.stock, 4.2);
  assert.equal(rafter.sticks, 9);
  const batten = plain.cuts.find((c) => c.kind === "batten");
  assert.equal(batten.count, 6);
  assert.equal(batten.stock, 4.8);
  assert.equal(batten.sticks, 6);

  const wasted = takeoff({ ...room(), roof: defaultRoof() });
  assert.equal(wasted.wastage, 0.1);
  assert.equal(wasted.roof.raftersOrder, 10);
  assert.equal(wasted.roof.sheetsOrder, 8);
  assert.equal(wasted.cuts.find((c) => c.kind === "rafter").count, 10);
  assert.equal(wasted.cuts.find((c) => c.kind === "batten").count, 7);

  const gable = takeoff({ ...room(), roof: { ...defaultRoof(), shape: "gable" } }, { wastage: 0 });
  assert.equal(gable.roof.rafters, 18);
  assert.equal(gable.roof.battens, 8);
  assert.equal(gable.roof.sheets, 14);
  near(gable.roof.ridgeLength, 4.6);
  const bought = gable.cuts.find((c) => c.kind === "rafter");
  near(bought.length, 1.967);
  assert.equal(bought.count, 18);
  assert.equal(bought.stock, 6);
  assert.equal(bought.sticks, 6);

  const long = takeoff(
    {
      walls: [
        { id: "s", a: [0, 0], b: [4, 0] },
        { id: "e", a: [4, 0], b: [4, 10] },
        { id: "n", a: [4, 10], b: [0, 10] },
        { id: "w", a: [0, 10], b: [0, 0] },
      ],
      openings: [],
      roof: defaultRoof(),
    },
    { wastage: 0 },
  );
  near(long.roof.rafterLength, 11.181);
  assert.equal(long.cuts.filter((c) => c.kind === "rafter" && c.length === 6).length, 1);
  assert.equal(long.cuts.find((c) => c.kind === "rafter" && c.length === 6).count, 9);
  const tail = long.cuts.find((c) => c.kind === "rafter" && Math.abs(c.length - 5.181) < 1e-6);
  assert.equal(tail.count, 9);
  assert.equal(tail.stock, 5.4);

  const empty = takeoff({ walls: [], openings: [] });
  assert.equal(empty.roof, null);
  assert.equal(empty.cuts.length, 0);
});

test("solar panels are capped by what fits on the roof planes", () => {
  assert.equal(SOLAR_SETBACK, 0.2);
  const walls = room().walls;
  assert.equal(roofFitCount(walls, defaultRoof(), 2), 6);
  assert.equal(roofFitCount(walls, { ...defaultRoof(), shape: "gable" }, 2), 4);
  assert.equal(roofFitCount(walls, defaultRoof(), 0), 0);
  assert.equal(roofFitCount([], defaultRoof(), 2), null);
  const tiny = [
    { id: "s", a: [0, 0], b: [1, 0] },
    { id: "e", a: [1, 0], b: [1, 1] },
    { id: "n", a: [1, 1], b: [0, 1] },
    { id: "w", a: [0, 1], b: [0, 0] },
  ];
  assert.equal(roofFitCount(tiny, { ...defaultRoof(), eave: 0, gable: 0 }, 2), 0);

  const capped = sizePower(basePower, { roofFit: 4 });
  assert.equal(capped.neededCount, 8);
  assert.equal(capped.fitCount, 50);
  assert.equal(capped.panelCount, 4);
  assert.equal(capped.roofFit, 4);
  assert.equal(capped.roofCapped, true);
  assert.equal(capped.shortfall, true);
  const loose = sizePower(basePower, { roofFit: 20 });
  assert.equal(loose.panelCount, 8);
  assert.equal(loose.roofCapped, false);
  const untouched = sizePower({ ...basePower, dailyKwh: 5, availableArea: 20, autonomyDays: 2, dod: 0.5 });
  assert.equal(untouched.roofFit, null);
  assert.equal(untouched.panelCount, 2);
  assert.equal(untouched.roofCapped, false);

  const html = solarResultHtml(capped);
  assert.match(html, /Roof fits 4 panels/);
  assert.match(html, /200 mm/);
  assert.match(html, /caps the array at 4 of 8/);
  assert.match(html, /Planning estimate only/);
  const lines = powerSheetLines({ ...basePower, configured: true }, [], { roofFit: 4 });
  assert.ok(lines.some((line) => line.includes("Roof fits 4")));
  assert.ok(lines.some((line) => line.includes("Roof caps the array at 4")));
  assert.equal(lines.join(" ").includes(POWER_NOTE), true);
});

test("gutters, downpipes and rainwater use the stated rules", () => {
  assert.equal(RUNOFF, 0.9);
  assert.equal(DEFAULT_RAINFALL, 1600);
  assert.equal(DOWNPIPE_RUN, 10);
  const walls = room().walls;
  const skill = roofModel(walls, defaultRoof());
  assert.equal(skill.gutters.length, 1);
  assert.equal(skill.gutters[0].face, "north");
  near(skill.gutters[0].length, 4.6);
  near(skill.gutterLength, 4.6);
  assert.equal(skill.downpipes, 1);
  near(skill.litres, 25171.2);
  const wet = roofModel(walls, { ...defaultRoof(), rainfall: 1000 });
  near(wet.litres, 15732);
  const dry = roofModel(walls, { ...defaultRoof(), rainfall: 0 });
  assert.equal(dry.litres, 0);

  const gable = roofModel(walls, { ...defaultRoof(), shape: "gable" });
  assert.equal(gable.gutters.length, 2);
  near(gable.gutterLength, 9.2);
  assert.equal(gable.downpipes, 2);

  const wide = [
    { id: "s", a: [0, 0], b: [25, 0] },
    { id: "e", a: [25, 0], b: [25, 3] },
    { id: "n", a: [25, 3], b: [0, 3] },
    { id: "w", a: [0, 3], b: [0, 0] },
  ];
  const longEave = roofModel(wide, defaultRoof());
  near(longEave.gutters[0].length, 25.6);
  assert.equal(longEave.downpipes, 3);
  assert.equal(roofModel(wide, { ...defaultRoof(), shape: "gable" }).downpipes, 6);
});

test("the sheet block carries the roof order and the planning note", () => {
  const plan = { ...room(), materials: { wastage: 0 }, roof: defaultRoof(), title: "Roof sample" };
  assert.equal(takeoff(plan).roof.downpipes, 1);
  const sheet = materialsSheetLines(plan);
  assert.equal(sheet[0], "Materials");
  assert.ok(sheet.some((line) => line.startsWith("Skillion 15 deg")));
  assert.ok(sheet.some((line) => line.includes("Plane") && line.includes("north")));
  assert.ok(sheet.some((line) => line.includes("Rafters 9")));
  assert.ok(sheet.some((line) => line.includes("Sheets 7")));
  assert.ok(sheet.some((line) => line.includes("Gutter north")));
  assert.ok(sheet.some((line) => line.includes("Downpipes 1")));
  assert.ok(sheet.some((line) => line.includes("Rain 25171 L")));
  assert.equal(sheet.join(" ").includes(ROOF_LIMIT), true);
  assert.equal(sheet.join(" ").includes(POWER_NOTE), true);
  const model = layoutSheet(plan, { scale: 50, date: "2026-11-13" });
  const svg = toSvg(model);
  assert.match(svg, /Skillion 15 deg/);
  assert.match(svg, /Gutter north/);
  assert.match(svg, /Planning estimate only/);
  const pdf = toPdf(model);
  assert.match(pdf, /Skillion 15 deg/);
  assert.match(pdf, /Downpipes 1/);
  assert.match(pdf, /Planning estimate only/);
  assert.match(toDxf(plan), /ROOF/);
});

test("schema 4 gains a default roof and schema 5 round-trips", () => {
  const v4 = {
    app: "neeky-home-designer",
    version: 4,
    title: "Kept",
    walls: room().walls,
    openings: [],
    materials: { wastage: 0.12 },
  };
  const imported = importPlanData(v4);
  assert.equal(imported.roof.shape, "skillion");
  assert.equal(imported.roof.pitch, 15);
  assert.equal(imported.roof.eave, 0.3);
  assert.equal(imported.roof.gable, 0.2);
  assert.equal(imported.roof.high, "south");
  assert.equal(imported.roof.rainfall, 1600);
  assert.equal(imported.materials.wastage, 0.12);
  assert.equal(imported.title, "Kept");
  assert.deepEqual(imported.walls[0].a, [0, 0]);
  assert.deepEqual(imported.walls[0].b, [4, 0]);
  const saved = serializePlan({ ...imported, rooms: [] });
  assert.equal(saved.version, 5);
  assert.equal(saved.walls[0].a[0], 0);
  assert.equal(saved.walls[0].b[0], 4);
  saved.roof = { shape: "gable", pitch: 22, eave: 0.45, gable: 0.1, high: "east", rainfall: 900 };
  const back = importPlanData(saved);
  assert.equal(back.roof.shape, "gable");
  assert.equal(back.roof.pitch, 22);
  assert.equal(back.roof.eave, 0.45);
  assert.equal(back.roof.gable, 0.1);
  assert.equal(back.roof.high, "east");
  assert.equal(back.roof.rainfall, 900);
  assert.equal(back.walls.length, 4);
  assert.equal(back.title, "Kept");

  const file = JSON.parse(readFileSync(new URL("../plans/belli-park-6x9-plan.json", import.meta.url), "utf8"));
  const belli = importPlanData(file);
  assert.equal(file.version, 2);
  assert.equal(belli.roof.shape, "skillion");
  assert.equal(belli.roof.pitch, 15);
  const belliSaved = serializePlan({ ...belli, rooms: [] });
  assert.equal(belliSaved.version, 5);
  assert.equal(importPlanData(belliSaved).walls.length, belli.walls.length);

  const clamped = importPlanData({
    ...saved,
    roof: { shape: "skillion", pitch: 90, eave: -1, gable: 9, high: "north", rainfall: -20 },
  });
  assert.equal(clamped.roof.pitch, 60);
  assert.equal(clamped.roof.eave, 0);
  assert.equal(clamped.roof.gable, 2);
  assert.equal(clamped.roof.high, "north");
  assert.equal(clamped.roof.rainfall, 0);
  assert.throws(() => importPlanData({ ...saved, version: 6 }), /schema 6/);
  assert.throws(() => importPlanData({ ...saved, roof: { pitch: "steep" } }), /finite/);
  assert.throws(() => importPlanData({ ...saved, roof: { shape: "hip" } }), /skillion or a gable/);
});
