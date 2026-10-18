import { layoutSheet, toDxf, toPdf, toSvg } from "./export-sheet.js";
import { importPlanData } from "./schema.js";

export function downloadBlob(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadText(name, text, type) {
  downloadBlob(name, new Blob([text], { type }));
}

export function readPlanText(text) {
  return importPlanData(text);
}

export function todayStamp() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function exportSheet(state, kind, scale) {
  const model = layoutSheet(state, { scale, date: todayStamp() });
  if (kind === "svg") return { name: `neeky-plan-1-${model.scale}.svg`, blob: new Blob([toSvg(model)], { type: "image/svg+xml" }) };
  if (kind === "pdf") return { name: `neeky-plan-1-${model.scale}.pdf`, blob: new Blob([toPdf(model)], { type: "application/pdf" }) };
  return { name: "neeky-plan.dxf", blob: new Blob([toDxf(state)], { type: "application/dxf" }) };
}
