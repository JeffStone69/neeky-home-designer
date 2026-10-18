import { expect, test } from "@playwright/test";
import fs from "node:fs";

const planPath = "plans/belli-park-6x9-plan.json";

function watch(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function openPlan(page, path) {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.locator("#plan-canvas").waitFor();
  await page.setInputFiles("#file-in", planPath);
  await expect(page.locator("#status")).toContainText("4 rooms");
  await expect(page.locator("#status")).toContainText("GFA");
  await expect(page.locator("#toast")).toBeHidden();
}

test("Belli Park loads in the source app without console errors", async ({ page }) => {
  const errors = watch(page);
  await openPlan(page, "/");
  await page.click('[data-view="split"]');
  await page.click('[data-view="plan"]');
  await page.waitForTimeout(80);
  const canvas = await page.locator("#plan-canvas").boundingBox();
  const pane = await page.locator(".plan-pane").boundingBox();
  expect(canvas.width).toBeGreaterThan(1000);
  expect(Math.abs(canvas.width - pane.width)).toBeLessThan(2);
  const inline = await page.locator("#plan-canvas").evaluate((el) => el.style.width);
  expect(inline).toBe("");
  await page.click('[data-view="model"]');
  await page.waitForTimeout(400);
  await page.click("#file-btn");
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-f="svg"][data-scale="50"]').click();
  const download = await downloadPromise;
  const file = await download.path();
  const svg = fs.readFileSync(file, "utf8");
  expect(svg).toContain("North deck");
  expect(svg).toContain("1:50");
  expect(svg).toContain(">N<");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Belli Park loads from the single-file build", async ({ page }) => {
  const errors = watch(page);
  await openPlan(page, "/Neeky.html");
  await page.click('[data-view="plan"]');
  await page.waitForTimeout(80);
  const canvas = await page.locator("#plan-canvas").boundingBox();
  const pane = await page.locator(".plan-pane").boundingBox();
  expect(Math.abs(canvas.width - pane.width)).toBeLessThan(2);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("phone toolbar and plan stay usable", async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlan(page, "/");
  const tool = await page.locator('[data-tool="wall"]').boundingBox();
  expect(tool.height).toBeGreaterThanOrEqual(44);
  await page.click('[data-view="plan"]');
  await page.waitForTimeout(80);
  const canvas = await page.locator("#plan-canvas").boundingBox();
  const pane = await page.locator(".plan-pane").boundingBox();
  expect(Math.abs(canvas.width - pane.width)).toBeLessThan(2);
  expect(canvas.height).toBeGreaterThan(400);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("a room name from a file cannot run as HTML", async ({ page }) => {
  const errors = watch(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#plan-canvas").waitFor();
  await page.setInputFiles("#file-in", "test/fixtures/xss-name.json");
  await expect(page.locator("#status")).toContainText("1 rooms");
  await page.click('[data-view="plan"]');
  await page.waitForTimeout(120);
  const box = await page.locator("#plan-canvas").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => window.__xss || 0)).toBe(0);
  const html = await page.locator("#status").innerHTML();
  expect(await page.locator("#status img").count()).toBe(0);
  expect(html).not.toContain("<img");
  expect(html).toContain('&lt;img src=x onerror="window.__xss=1"&gt;');
  expect(errors, errors.join("\n")).toEqual([]);
});

test("an unreadable autosave is kept and reported", async ({ page }) => {
  const errors = watch(page);
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
  await page.addInitScript((value) => {
    localStorage.setItem("neeky-home-designer-v2", value);
  }, raw);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#plan-canvas").waitFor();
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("schema 9");
  await expect(page.locator("#toast")).toContainText("neeky-home-designer-v2-unreadable");
  const stored = await page.evaluate(() => ({
    main: localStorage.getItem("neeky-home-designer-v2"),
    backup: localStorage.getItem("neeky-home-designer-v2-unreadable"),
  }));
  expect(stored.main).toBe(raw);
  expect(stored.backup).toBe(raw);
  expect(errors, errors.join("\n")).toEqual([]);
});
