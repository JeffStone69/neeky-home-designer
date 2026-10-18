import { APP_VERSION_LABEL, WALL_HEIGHT, WALL_THICK } from "./constants.js";
import { deckCorners, normalizeDeck, stepCorners } from "./elements.js";
import {
  dimensionBox,
  fmt,
  fmtArea,
  grossFloorArea,
  internalArea,
  pointInPoly,
  sceneBounds,
  wallLen,
} from "./geom.js";

const PAPER = { w: 420, h: 297 };

function round(n) {
  return Math.round(n * 1000) / 1000;
}

export function planEntities(state) {
  const entities = [];
  const line = (layer, a, b) => entities.push({ kind: "line", layer, a: [...a], b: [...b] });
  const poly = (layer, pts) => entities.push({ kind: "poly", layer, pts: pts.map((p) => [...p]) });
  const text = (layer, at, value, h = 0.18) => entities.push({ kind: "text", layer, at: [...at], text: String(value), h });

  for (const d of state.decks || []) {
    const c = deckCorners(d);
    poly(d.kind === "veranda" ? "VERANDA" : "DECK", c);
    const r = normalizeDeck(d);
    text("LABELS", [r.x + r.w / 2, r.z + r.d / 2], d.name || (d.kind === "veranda" ? "Veranda" : "Deck"), 0.22);
  }
  for (const s of state.steps || []) {
    const c = stepCorners(s);
    poly("STEPS", c);
    const ang = s.rot || 0;
    const len = (s.count || 1) * (s.going || 0.28);
    for (let i = 1; i < (s.count || 1); i++) {
      const t = (i * (s.going || 0.28)) / len;
      const along = [c[0][0] + (c[3][0] - c[0][0]) * (i / s.count), c[0][1] + (c[3][1] - c[0][1]) * (i / s.count)];
      const along2 = [c[1][0] + (c[2][0] - c[1][0]) * (i / s.count), c[1][1] + (c[2][1] - c[1][1]) * (i / s.count)];
      void t;
      void ang;
      line("STEPS", along, along2);
    }
  }
  for (const s of state.stumps || []) {
    const h = (s.size || 0.15) / 2;
    poly("STUMPS", [
      [s.x - h, s.z - h],
      [s.x + h, s.z - h],
      [s.x + h, s.z + h],
      [s.x - h, s.z + h],
    ]);
  }
  for (const w of state.walls || []) line("WALLS", w.a, w.b);
  for (const op of state.openings || []) {
    const wall = state.walls.find((w) => w.id === op.wallId);
    if (!wall) continue;
    const L = wallLen(wall) || 1;
    const t0 = op.t - op.width / 2 / L;
    const t1 = op.t + op.width / 2 / L;
    const p0 = [wall.a[0] + (wall.b[0] - wall.a[0]) * t0, wall.a[1] + (wall.b[1] - wall.a[1]) * t0];
    const p1 = [wall.a[0] + (wall.b[0] - wall.a[0]) * t1, wall.a[1] + (wall.b[1] - wall.a[1]) * t1];
    line("GAPS", p0, p1);
    if (op.type === "door" && op.width <= 1.25) {
      const mx = (p0[0] + p1[0]) / 2;
      const mz = (p0[1] + p1[1]) / 2;
      const ang = Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]);
      let nx = -Math.sin(ang);
      let nz = Math.cos(ang);
      const inside = (state.rooms || []).some((r) => pointInPoly([mx + nx * 0.35, mz + nz * 0.35], r.points));
      if (!inside) {
        nx = -nx;
        nz = -nz;
      }
      const hinge = p0;
      const closed = Math.atan2(p1[1] - hinge[1], p1[0] - hinge[0]);
      let delta = Math.atan2(nz, nx) - closed;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const stepsN = 6;
      let prev = p1;
      for (let i = 1; i <= stepsN; i++) {
        const a = closed + delta * (i / stepsN);
        const q = [hinge[0] + Math.cos(a) * op.width, hinge[1] + Math.sin(a) * op.width];
        line("OPENINGS", prev, q);
        prev = q;
      }
      line("OPENINGS", hinge, prev);
    }
  }
  for (const room of state.rooms || []) {
    text("ROOMS", room.centroid, room.name, 0.22);
    text("ROOMS", [room.centroid[0], room.centroid[1] - 0.28], fmtArea(internalArea(room)), 0.16);
  }
  const mode = state.dimMode || "centreline";
  const box = dimensionBox(state.walls, mode);
  if (box && box.w > 0.2) {
    const gap = 0.45;
    const z = box.minZ - gap;
    line("DIMS", [box.minX, box.minZ], [box.minX, z - 0.12]);
    line("DIMS", [box.maxX, box.minZ], [box.maxX, z - 0.12]);
    line("DIMS", [box.minX, z], [box.maxX, z]);
    text("DIMS", [(box.minX + box.maxX) / 2, z - 0.28], fmt(box.w), 0.2);
    const x = box.minX - gap;
    line("DIMS", [box.minX, box.minZ], [x - 0.12, box.minZ]);
    line("DIMS", [box.minX, box.maxZ], [x - 0.12, box.maxZ]);
    line("DIMS", [x, box.minZ], [x, box.maxZ]);
    text("DIMS", [x - 0.28, (box.minZ + box.maxZ) / 2], fmt(box.h), 0.2);
  }
  return entities;
}

export function layoutSheet(state, opts = {}) {
  const scale = opts.scale === 100 ? 100 : 50;
  const date = opts.date || "";
  const entities = planEntities(state);
  const extra = [];
  for (const e of entities) {
    if (e.kind === "line") extra.push(e.a, e.b);
    else if (e.kind === "poly") extra.push(...e.pts);
    else if (e.kind === "text") extra.push(e.at);
  }
  const b = sceneBounds(state.walls, extra) || { minX: 0, minZ: 0, maxX: 10, maxZ: 8, w: 10, h: 8 };
  const pad = 1.1;
  const worldW = Math.max(b.w + pad * 2, 1);
  const worldH = Math.max(b.h + pad * 2, 1);
  const margin = 14;
  const titleW = 86;
  const titleH = 46;
  const availW = PAPER.w - margin * 2 - titleW - 8;
  const availH = PAPER.h - margin * 2;
  const exact = 1000 / scale;
  const fit = Math.min(availW / worldW, availH / worldH);
  const mmPerM = Math.min(exact, fit);
  const usedScale = Math.max(1, Math.round(1000 / mmPerM));
  const drawW = worldW * mmPerM;
  const drawH = worldH * mmPerM;
  const originX = margin + (availW - drawW) / 2;
  const originY = margin + (availH - drawH) / 2;
  const minX = b.minX - pad;
  const maxZ = b.maxZ + pad;
  const map = (p) => [originX + (p[0] - minX) * mmPerM, originY + (maxZ - p[1]) * mmPerM];

  const items = [];
  const fill = (pts, color) => items.push({ op: "fill", pts, color });
  const stroke = (pts, color, width, dash) => items.push({ op: "stroke", pts, color, width, close: false, dash });
  const strokeClosed = (pts, color, width) => items.push({ op: "stroke", pts: [...pts, pts[0]], color, width });
  const label = (x, y, text, size, anchor = "start", weight = 500) =>
    items.push({ op: "text", x, y, text, size, anchor, color: "#1c1917", weight });

  items.push({ op: "fill", pts: [[0, 0], [PAPER.w, 0], [PAPER.w, PAPER.h], [0, PAPER.h]], color: "#f7f4ec" });
  stroke([[margin / 2, margin / 2], [PAPER.w - margin / 2, margin / 2], [PAPER.w - margin / 2, PAPER.h - margin / 2], [margin / 2, PAPER.h - margin / 2], [margin / 2, margin / 2]], "#d4cdc0", 0.3);

  for (const e of entities) {
    if (e.kind === "poly" && (e.layer === "DECK" || e.layer === "VERANDA")) {
      const pts = e.pts.map(map);
      fill(pts, e.layer === "VERANDA" ? "#e4ebe6" : "#e7dcc8");
      strokeClosed(pts, "#6b6459", 0.35);
    }
  }
  for (const e of entities) {
    if (e.kind === "poly" && e.layer === "STEPS") {
      const pts = e.pts.map(map);
      fill(pts, "#efe6d6");
      strokeClosed(pts, "#6b6459", 0.3);
    } else if (e.kind === "line" && e.layer === "STEPS") {
      stroke([map(e.a), map(e.b)], "#6b6459", 0.25);
    }
  }
  for (const e of entities) {
    if (e.kind === "poly" && e.layer === "STUMPS") {
      const pts = e.pts.map(map);
      fill(pts, "#6b6459");
    }
  }
  for (const e of entities) {
    if (e.kind === "line" && e.layer === "WALLS") {
      stroke([map(e.a), map(e.b)], "#1c1917", Math.max(0.6, WALL_THICK * mmPerM));
    }
  }
  for (const e of entities) {
    if (e.kind === "line" && e.layer === "GAPS") {
      stroke([map(e.a), map(e.b)], "#f7f4ec", Math.max(0.8, WALL_THICK * mmPerM + 0.4));
    }
  }
  for (const e of entities) {
    if (e.kind === "line" && (e.layer === "OPENINGS" || e.layer === "GAPS")) {
      stroke([map(e.a), map(e.b)], "#2f5d50", 0.35);
    } else if (e.kind === "line" && e.layer === "DIMS") {
      stroke([map(e.a), map(e.b)], "#6b6459", 0.25);
    }
  }
  for (const e of entities) {
    if (e.kind !== "text") continue;
    const p = map(e.at);
    const size = Math.max(2.2, e.h * mmPerM);
    label(p[0], p[1], e.text, e.layer === "ROOMS" && e.h > 0.2 ? size : size, "middle", e.layer === "ROOMS" && e.h > 0.2 ? 600 : 400);
  }

  const nx = PAPER.w - margin - titleW / 2;
  const ny = margin + 8;
  items.push({
    op: "fill",
    pts: [
      [nx, ny + 14],
      [nx + 4, ny + 2],
      [nx, ny + 5],
      [nx - 4, ny + 2],
    ],
    color: "#1c1917",
  });
  label(nx, ny - 1, "N", 4, "middle", 600);

  const tbx = PAPER.w - margin - titleW;
  const tby = PAPER.h - margin - titleH;
  stroke(
    [
      [tbx, tby],
      [tbx + titleW, tby],
      [tbx + titleW, tby + titleH],
      [tbx, tby + titleH],
      [tbx, tby],
    ],
    "#1c1917",
    0.4,
  );
  const gfa = state.walls?.length ? grossFloorArea(state.walls) : 0;
  const mode = state.dimMode || "centreline";
  const modeLabel = mode === "outside" ? "outside faces" : mode === "inside" ? "inside faces" : "centrelines";
  const rows = [
    [`Neeky Home Designer ${APP_VERSION_LABEL}`, 600],
    [state.title || "Untitled plan", 500],
    [`Scale 1:${usedScale}    metres`, 400],
    [`Dimensions: ${modeLabel}`, 400],
    [`GFA ${fmtArea(gfa)}`, 500],
    [`Walls ${WALL_THICK.toFixed(2)} m × ${WALL_HEIGHT.toFixed(2)} m`, 400],
    [date ? `Date ${date}` : "Offline sheet", 400],
  ];
  rows.forEach((row, i) => label(tbx + 3, tby + 6 + i * 5.6, row[0], 3.1, "start", row[1]));
  return { w: PAPER.w, h: PAPER.h, scale: usedScale, items };
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toSvg(model) {
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${model.w}mm" height="${model.h}mm" viewBox="0 0 ${model.w} ${model.h}">`,
  ];
  for (const item of model.items) {
    if (item.op === "fill" || item.op === "stroke") {
      const d =
        item.pts.map((p, i) => `${i ? "L" : "M"}${round(p[0])} ${round(p[1])}`).join(" ") +
        (item.op === "fill" || item.close ? " Z" : "");
      if (item.op === "fill") parts.push(`<path d="${d}" fill="${item.color}"/>`);
      else {
        const dash = item.dash ? ` stroke-dasharray="${item.dash.join(" ")}"` : "";
        parts.push(
          `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="${item.width}" stroke-linecap="butt" stroke-linejoin="miter"${dash}/>`,
        );
      }
    } else if (item.op === "text") {
      const anchor = item.anchor === "middle" ? "middle" : item.anchor === "end" ? "end" : "start";
      parts.push(
        `<text x="${round(item.x)}" y="${round(item.y)}" fill="${item.color || "#1c1917"}" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif" font-size="${item.size}" font-weight="${item.weight || 500}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(item.text)}</text>`,
      );
    }
  }
  parts.push(`</svg>`);
  return parts.join("\n");
}

function ascii(s) {
  return String(s)
    .replace(/²/g, "2")
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7e]/g, "");
}

function pdfEscape(s) {
  return ascii(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function rgb(hex) {
  const n = String(hex || "#1c1917").replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

export function toPdf(model) {
  const pt = (mm) => (mm * 72) / 25.4;
  const W = pt(model.w);
  const H = pt(model.h);
  const x = (mm) => pt(mm).toFixed(2);
  const y = (mm) => (H - pt(mm)).toFixed(2);
  const cmds = [];
  for (const item of model.items) {
    if (item.op === "fill" || item.op === "stroke") {
      const pts = item.pts;
      if (!pts?.length) continue;
      cmds.push(`${x(pts[0][0])} ${y(pts[0][1])} m`);
      for (let i = 1; i < pts.length; i++) cmds.push(`${x(pts[i][0])} ${y(pts[i][1])} l`);
      if (item.op === "fill") {
        cmds.push("h");
        cmds.push(`${rgb(item.color)} rg`);
        cmds.push("f");
      } else {
        cmds.push(`${rgb(item.color)} RG`);
        cmds.push(`${pt(item.width || 0.3).toFixed(2)} w`);
        cmds.push("S");
      }
    } else if (item.op === "text") {
      const size = pt(item.size || 3);
      let tx = pt(item.x);
      const text = pdfEscape(item.text);
      if (item.anchor === "middle") tx -= size * 0.27 * text.length;
      else if (item.anchor === "end") tx -= size * 0.5 * text.length;
      const ty = H - pt(item.y) - size * 0.35;
      cmds.push("BT");
      cmds.push(`/F1 ${size.toFixed(2)} Tf`);
      cmds.push(`${rgb(item.color)} rg`);
      cmds.push(`${tx.toFixed(2)} ${ty.toFixed(2)} Td`);
      cmds.push(`(${text}) Tj`);
      cmds.push("ET");
    }
  }
  return buildPdf(W, H, cmds.join("\n"));
}

function buildPdf(w, h, stream) {
  const body = stream;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const xref = [0];
  objects.forEach((obj, i) => {
    xref.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < xref.length; i++) pdf += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return pdf;
}

function dxfPair(code, value) {
  return `${code}\n${value}\n`;
}

export function toDxf(state) {
  const entities = planEntities(state);
  let out = "";
  out += dxfPair(0, "SECTION");
  out += dxfPair(2, "HEADER");
  out += dxfPair(9, "$INSUNITS");
  out += dxfPair(70, 6);
  out += dxfPair(9, "$MEASUREMENT");
  out += dxfPair(70, 1);
  out += dxfPair(0, "ENDSEC");
  out += dxfPair(0, "SECTION");
  out += dxfPair(2, "ENTITIES");
  const line = (layer, a, b) => {
    out += dxfPair(0, "LINE");
    out += dxfPair(8, layer);
    out += dxfPair(10, round(a[0]));
    out += dxfPair(20, round(a[1]));
    out += dxfPair(30, 0);
    out += dxfPair(11, round(b[0]));
    out += dxfPair(21, round(b[1]));
    out += dxfPair(31, 0);
  };
  for (const e of entities) {
    if (e.kind === "line") line(e.layer, e.a, e.b);
    else if (e.kind === "poly") {
      const pts = e.pts;
      for (let i = 0; i < pts.length; i++) line(e.layer, pts[i], pts[(i + 1) % pts.length]);
    } else if (e.kind === "text") {
      out += dxfPair(0, "TEXT");
      out += dxfPair(8, e.layer);
      out += dxfPair(10, round(e.at[0]));
      out += dxfPair(20, round(e.at[1]));
      out += dxfPair(30, 0);
      out += dxfPair(40, round(e.h || 0.2));
      out += dxfPair(1, ascii(e.text).slice(0, 80));
    }
  }
  out += dxfPair(0, "ENDSEC");
  out += dxfPair(0, "EOF");
  return out;
}
