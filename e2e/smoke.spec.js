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
