import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { layoutSheet, toDxf, toPdf, toSvg } from "../js/export-sheet.js";
import { normalizePlan } from "../js/geom.js";
import {
  POWER_NOTE,
  SUNSHINE_COAST_PSH,
  powerSheetLines,
  sizePower,
  wrapWords,
} from "../js/power.js";
import { importPlanData, serializePlan } from "../js/schema.js";

const base = {
  source: "typed",
  dailyKwh: 5,
  peakSunHours: 5,
  losses: 0,
  panelW: 500,
  panelArea: 2,
  availableArea: 20,
  autonomyDays: 2,
  dod: 0.5,
  includeEv: false,
  evKw: 7,
  evHours: 2,
};

test("a clean off-grid day sizes panels, battery, inverter and generator", () => {
  const r = sizePower(base);
  assert.equal(r.dailyKwh, 5);
  assert.equal(r.neededCount, 2);
  assert.equal(r.panelCount, 2);
  assert.equal(r.arrayKw, 1);
  assert.equal(r.expectedDailyKwh, 5);
  assert.equal(r.expectedYearlyKwh, 1825);
  assert.equal(r.usableKwh, 10);
  assert.equal(r.nominalKwh, 20);
  assert.equal(r.inverterKw, 1.5);
  assert.equal(r.generatorKva, 2.5);
  assert.equal(r.shortfall, false);
});

test("zero load sizes nothing", () => {
  const r = sizePower({ ...base, dailyKwh: 0, includeEv: true, evKw: 0, evHours: 5 });
  assert.equal(r.dailyKwh, 0);
  assert.equal(r.neededCount, 0);
  assert.equal(r.panelCount, 0);
  assert.equal(r.arrayKw, 0);
  assert.equal(r.expectedDailyKwh, 0);
  assert.equal(r.expectedYearlyKwh, 0);
  assert.equal(r.usableKwh, 0);
  assert.equal(r.nominalKwh, 0);
  assert.equal(r.inverterKw, 0);
  assert.equal(r.generatorKva, 0);
  assert.equal(r.shortfall, false);
  const negative = sizePower({ ...base, dailyKwh: -8 });
  assert.equal(negative.dailyKwh, 0);
  assert.equal(negative.panelCount, 0);
});

test("a tiny panel area keeps the battery and reports the shortfall", () => {
  const r = sizePower({ ...base, availableArea: 1 });
  assert.equal(r.neededCount, 2);
  assert.equal(r.fitCount, 0);
  assert.equal(r.panelCount, 0);
  assert.equal(r.arrayKw, 0);
  assert.equal(r.expectedDailyKwh, 0);
  assert.equal(r.shortfall, true);
  assert.equal(r.usableKwh, 10);
  assert.equal(r.nominalKwh, 20);
  const partial = sizePower({ ...base, availableArea: 2.2, dailyKwh: 10, autonomyDays: 1, dod: 1 });
  assert.equal(partial.neededCount, 4);
  assert.equal(partial.fitCount, 1);
  assert.equal(partial.panelCount, 1);
  assert.equal(partial.arrayKw, 0.5);
  assert.equal(partial.shortfall, true);
});

test("zero sun or a zero-watt panel cannot build an array", () => {
  for (const extra of [{ peakSunHours: 0 }, { panelW: 0 }, { losses: 1 }]) {
    const r = sizePower({ ...base, dailyKwh: 4, autonomyDays: 1, dod: 1, ...extra });
    assert.equal(r.panelCount, 0);
    assert.equal(r.neededCount, null);
    assert.equal(r.shortfall, true);
    assert.equal(r.expectedDailyKwh, 0);
    assert.equal(r.usableKwh, 4);
    assert.equal(r.nominalKwh, 4);
  }
});

test("a depth of discharge of zero leaves nominal battery capacity unset", () => {
  const r = sizePower({ ...base, dod: 0, autonomyDays: 1 });
  assert.equal(r.usableKwh, 5);
  assert.equal(r.nominalKwh, null);
});

test("appliance watts and an EV charger add to the load the inverter must cover", () => {
  const list = sizePower({
    ...base,
    source: "appliances",
    dailyKwh: 99,
    appliances: [
      { name: "Fridge", watts: 100, hours: 10 },
      { name: "Cooker", watts: 500, hours: 2 },
      { name: "Bad", watts: -100, hours: 10 },
    ],
    autonomyDays: 1,
    dod: 1,
  });
  assert.equal(list.houseKwh, 2);
  assert.equal(list.dailyKwh, 2);
  assert.equal(list.inverterKw, 0.5);
  const ev = sizePower({
    ...base,
    includeEv: true,
    evKw: 7,
    evHours: 2,
    autonomyDays: 1,
    dod: 0.8,
    availableArea: 100,
  });
  assert.equal(ev.dailyKwh, 19);
  assert.equal(ev.evKwh, 14);
  assert.equal(ev.neededCount, 8);
  assert.equal(ev.panelCount, 8);
  assert.equal(ev.arrayKw, 4);
  assert.equal(ev.expectedDailyKwh, 20);
  assert.equal(ev.inverterKw, 7);
  assert.equal(ev.generatorKva, 11);
  assert.equal(ev.usableKwh, 19);
  assert.equal(ev.nominalKwh, 23.75);
  const parked = sizePower({ ...base, includeEv: false, evKw: 7, evHours: 8 });
  assert.equal(parked.dailyKwh, 5);
  assert.equal(parked.inverterKw, 1.5);
});

test("the sheet note wraps without dropping words", () => {
  assert.equal(wrapWords(POWER_NOTE, 40).join(" "), POWER_NOTE);
});

test("v2 Belli Park migrates to schema 3 and keeps the deck", () => {
  const file = JSON.parse(readFileSync(new URL("../plans/belli-park-6x9-plan.json", import.meta.url), "utf8"));
  assert.equal(file.version, 2);
  const imported = importPlanData(file);
  assert.equal(imported.equipment.length, 0);
  assert.equal(imported.power.configured, false);
  assert.equal(imported.power.peakSunHours, SUNSHINE_COAST_PSH);
  assert.equal(imported.decks[0].name, "North deck");
  assert.equal(imported.stumps.length, 42);
  const saved = serializePlan({ ...imported, rooms: [] });
  assert.equal(saved.version, 5);
  assert.equal(saved.power.peakSunHours, SUNSHINE_COAST_PSH);
  assert.equal(saved.decks.length, 1);
  assert.equal(saved.equipment.length, 0);
  const back = importPlanData(saved);
  assert.equal(back.decks.length, 1);
  assert.equal(back.power.dailyKwh, 5);
});

test("v1 migrates through v2 to v3 and equipment round-trips", () => {
  const v1 = JSON.parse(readFileSync(new URL("./fixtures/belli-v1.json", import.meta.url), "utf8"));
  assert.equal(v1.version, undefined);
  const imported = importPlanData(v1);
  assert.equal(imported.equipment.length, 0);
  assert.equal(imported.power.peakSunHours, SUNSHINE_COAST_PSH);
  imported.equipment = [
    {
      id: "e1",
      kind: "array",
      name: "South array",
      mount: "deck",
      x: 1,
      z: 2,
      w: 4,
      d: 2,
      tilt: 27,
      azimuth: 90,
    },
    { id: "b1", kind: "battery", x: 0.2, z: 0.4, w: 0.6, d: 0.4 },
  ];
  const saved = serializePlan({ ...imported, rooms: [] });
  assert.equal(saved.version, 5);
  assert.equal(saved.equipment[0].id, undefined);
  assert.equal(saved.equipment[0].mount, "deck");
  assert.equal(saved.equipment[0].azimuth, 90);
  assert.equal(saved.equipment[1].kind, "battery");
  const back = importPlanData(saved);
  assert.equal(back.equipment.length, 2);
  assert.equal(back.equipment[0].kind, "array");
  assert.equal(back.equipment[0].mount, "deck");
  assert.equal(back.equipment[0].azimuth, 90);
  assert.ok(back.equipment[0].id);
  assert.equal(back.walls.length, imported.walls.length);
});

test("a newer schema and an unknown equipment kind are rejected", () => {
  assert.throws(
    () => importPlanData({ app: "neeky-home-designer", version: 6, walls: [] }),
    /schema 6/,
  );
  assert.throws(
    () =>
      importPlanData({
        app: "neeky-home-designer",
        version: 3,
        walls: [],
        equipment: [{ kind: "roof", x: 0, z: 0, w: 1, d: 1 }],
      }),
    /Equipment/,
  );
  assert.throws(
    () =>
      importPlanData({
        app: "neeky-home-designer",
        version: 3,
        walls: [],
        equipment: [{ kind: "battery", x: "north", z: 0, w: 1, d: 1 }],
      }),
    /finite number/,
  );
});

test("the sheet table carries the estimate and the caution", () => {
  const file = JSON.parse(readFileSync(new URL("../plans/belli-park-6x9-plan.json", import.meta.url), "utf8"));
  const plan = normalizePlan(importPlanData(file));
  plan.power = { ...plan.power, configured: true, dailyKwh: 5, peakSunHours: 5, losses: 0, panelW: 500, panelArea: 2, availableArea: 20, autonomyDays: 2, dod: 0.5 };
  plan.equipment = [
    { id: "a", kind: "array", name: "South array", mount: "ground", x: 0, z: -3, w: 4, d: 2, tilt: 27, azimuth: 0 },
  ];
  assert.equal(powerSheetLines(plan.power, []).length > 0, true);
  const model = layoutSheet(plan, { scale: 50, date: "2026-10-18" });
  const svg = toSvg(model);
  const text = [...svg.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]).join(" ");
  assert.ok(text.includes(POWER_NOTE));
  assert.match(svg, /South array/);
  assert.match(svg, /1:50/);
  const pdf = toPdf(model);
  assert.match(pdf, /Planning estimate only/);
  assert.match(pdf, /CEC-accredited designer/);
  assert.match(pdf, /confirm before purchase or install/);
  const dxf = toDxf(plan);
  assert.match(dxf, /ARRAY/);
  const quiet = layoutSheet(normalizePlan(importPlanData(file)), { scale: 50, date: "2026-10-18" });
  const quietText = [...toSvg(quiet).matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]).join(" ");
  assert.equal(quietText.includes("Daily load"), false);
  assert.equal(quietText.includes(POWER_NOTE), true);
});
