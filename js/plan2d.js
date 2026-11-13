import { COLORS, MAJOR, MINOR } from "./constants.js";
import { deckCorners, elementPoints, normalizeDeck, stepCorners } from "./elements.js";
import { EQUIP, equipmentCorners, normalizeEquip } from "./power.js";
import { roofModel } from "./roof.js";
import { drawFurniture2d } from "./furniture.js";
import {
  dimensionBox,
  dist,
  fmt,
  fmtArea,
  internalArea,
  nearestWall,
  sceneBounds,
  wallLen,
} from "./geom.js";

export function createPlan2D(canvas, getState, actions) {
  const ctx = canvas.getContext("2d");
  let dpr = 1;
  let w = 1;
  let h = 1;

  function origin() {
    return { x: w / 2, y: h / 2 };
  }

  function toScreen(p, cam) {
    const o = origin();
    return {
      x: o.x + (p[0] - cam.x) * cam.zoom,
      y: o.y - (p[1] - cam.z) * cam.zoom,
    };
  }

  function toWorld(s, cam) {
    const o = origin();
    return [(s.x - o.x) / cam.zoom + cam.x, cam.z - (s.y - o.y) / cam.zoom];
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function resize() {
    const el = canvas.parentElement || canvas;
    const rect = el.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.max(1, Math.floor(w * dpr));
    const bh = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    canvas.style.width = "";
    canvas.style.height = "";
    draw();
  }

  function drawGrid(cam) {
    const tl = toWorld({ x: 0, y: 0 }, cam);
    const br = toWorld({ x: w, y: h }, cam);
    const x0 = Math.floor(Math.min(tl[0], br[0]) / MINOR) * MINOR;
    const x1 = Math.max(tl[0], br[0]);
    const z0 = Math.floor(Math.min(tl[1], br[1]) / MINOR) * MINOR;
    const z1 = Math.max(tl[1], br[1]);
    ctx.lineCap = "butt";
    for (let x = x0; x <= x1 + MINOR; x += MINOR) {
      const a = toScreen([x, z0], cam);
      const b = toScreen([x, z1], cam);
      const major = Math.abs(x / MAJOR - Math.round(x / MAJOR)) < 1e-6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = major ? "rgba(28,25,23,0.14)" : "rgba(28,25,23,0.05)";
      ctx.lineWidth = major ? 1 : 0.7;
      ctx.stroke();
    }
    for (let z = z0; z <= z1 + MINOR; z += MINOR) {
      const a = toScreen([x0, z], cam);
      const b = toScreen([x1, z], cam);
      const major = Math.abs(z / MAJOR - Math.round(z / MAJOR)) < 1e-6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = major ? "rgba(28,25,23,0.14)" : "rgba(28,25,23,0.05)";
      ctx.lineWidth = major ? 1 : 0.7;
      ctx.stroke();
    }
  }

  function polyScreen(pts, cam) {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const q = toScreen(p, cam);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
  }

  function drawDeck(d, cam, ghost) {
    const r = normalizeDeck(d);
    if (r.w < 0.05 || r.d < 0.05) return;
    polyScreen(deckCorners(r), cam);
    ctx.fillStyle = d.kind === "veranda" ? "rgba(47,93,80,0.14)" : "rgba(166,138,96,0.32)";
    ctx.fill();
    ctx.strokeStyle = ghost ? COLORS.accent : "#6b6459";
    ctx.lineWidth = ghost ? 1.6 : 1.3;
    ctx.setLineDash(ghost ? [5, 4] : [7, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!ghost) {
      const mid = toScreen([r.x + r.w / 2, r.z + r.d / 2], cam);
      ctx.fillStyle = COLORS.ink;
      ctx.font = "500 12px IBM Plex Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.name || (d.kind === "veranda" ? "Veranda" : "Deck"), mid.x, mid.y);
    }
  }

  function drawEquip(eq, cam, ghost) {
    const r = normalizeEquip(eq);
    if (r.w < 0.05 || r.d < 0.05) return;
    const selected = !ghost && getState().selection?.kind === "equipment" && getState().selection.id === eq.id;
    polyScreen(equipmentCorners(r), cam);
    const fills = {
      array: "rgba(47,93,80,0.28)",
      battery: "rgba(47,93,80,0.82)",
      inverter: "rgba(44,42,40,0.88)",
      charger: "rgba(47,93,80,0.55)",
      generator: "rgba(107,83,68,0.9)",
    };
    ctx.fillStyle = ghost ? "rgba(47,93,80,0.16)" : fills[eq.kind] || fills.battery;
    ctx.fill();
    if (eq.kind === "array" && !ghost) {
      ctx.save();
      polyScreen(equipmentCorners(r), cam);
      ctx.clip();
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const z = r.z + (r.d * i) / 4;
        const a = toScreen([r.x, z], cam);
        const b = toScreen([r.x + r.w, z], cam);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = "rgba(28,25,23,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      const az = ((Number(eq.azimuth) || 0) * Math.PI) / 180;
      const len = Math.min(r.w, r.d) * 0.35;
      const cx = r.x + r.w / 2;
      const cz = r.z + r.d / 2;
      const a = toScreen([cx, cz], cam);
      const b = toScreen([cx + Math.sin(az) * len, cz + Math.cos(az) * len], cam);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.strokeStyle = ghost || selected ? COLORS.accent : COLORS.ink;
    ctx.lineWidth = selected ? 2 : 1.2;
    ctx.setLineDash(ghost ? [5, 4] : []);
    polyScreen(equipmentCorners(r), cam);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!ghost && cam.zoom * Math.max(r.w, r.d) > 16) {
      const mid = toScreen([r.x + r.w / 2, r.z + r.d / 2], cam);
      ctx.fillStyle = eq.kind === "array" || eq.kind === "charger" ? COLORS.ink : COLORS.paper;
      ctx.font = "500 12px IBM Plex Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(eq.name || EQUIP[eq.kind]?.label || "Power", mid.x, mid.y);
    }
  }

  function drawSteps(step, cam, ghost) {
    const corners = stepCorners(step);
    polyScreen(corners, cam);
    ctx.fillStyle = ghost ? "rgba(47,93,80,0.12)" : "rgba(232,224,208,0.9)";
    ctx.fill();
    ctx.strokeStyle = ghost ? COLORS.accent : COLORS.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const n = step.count || 1;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const a = [corners[0][0] + (corners[3][0] - corners[0][0]) * t, corners[0][1] + (corners[3][1] - corners[0][1]) * t];
      const b = [corners[1][0] + (corners[2][0] - corners[1][0]) * t, corners[1][1] + (corners[2][1] - corners[1][1]) * t];
      const sa = toScreen(a, cam);
      const sb = toScreen(b, cam);
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();
    }
  }

  function drawStump(s, cam, selected) {
    const half = Math.max(2.5, ((s.size || 0.15) / 2) * cam.zoom);
    const c = toScreen([s.x, s.z], cam);
    ctx.fillStyle = selected ? COLORS.accent : "#5c5348";
    ctx.fillRect(c.x - half, c.y - half, half * 2, half * 2);
    ctx.strokeStyle = COLORS.paper;
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x - half, c.y - half, half * 2, half * 2);
  }

  function drawNorth() {
    const x = w - 28;
    const y = 34;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 2);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.font = "600 11px IBM Plex Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 0, -22);
    ctx.restore();
  }

  function drawDimensions(cam, mode) {
    const s = getState();
    const box = dimensionBox(s.walls, mode || s.dimMode || "centreline");
    if (!box || box.w <= 0.2) return;
    const sw = toScreen([box.minX, box.minZ], cam);
    const se = toScreen([box.maxX, box.minZ], cam);
    const nw = toScreen([box.minX, box.maxZ], cam);
    ctx.strokeStyle = COLORS.muted;
    ctx.fillStyle = COLORS.muted;
    ctx.lineWidth = 1;
    ctx.font = "500 11px IBM Plex Mono, ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const y = Math.max(sw.y, se.y) + 18;
    ctx.beginPath();
    ctx.moveTo(sw.x, sw.y + 4);
    ctx.lineTo(sw.x, y + 5);
    ctx.moveTo(se.x, se.y + 4);
    ctx.lineTo(se.x, y + 5);
    ctx.moveTo(sw.x, y);
    ctx.lineTo(se.x, y);
    ctx.stroke();
    ctx.fillText(fmt(box.w), (sw.x + se.x) / 2, y + 12);
    const x = Math.min(sw.x, nw.x) - 18;
    ctx.beginPath();
    ctx.moveTo(sw.x - 4, sw.y);
    ctx.lineTo(x - 5, sw.y);
    ctx.moveTo(nw.x - 4, nw.y);
    ctx.lineTo(x - 5, nw.y);
    ctx.moveTo(x, sw.y);
    ctx.lineTo(x, nw.y);
    ctx.stroke();
    ctx.save();
    ctx.translate(x - 12, (sw.y + nw.y) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(fmt(box.h), 0, 0);
    ctx.restore();
  }

  function drawRoof(cam) {
    const model = roofModel(getState().walls, getState().roof);
    if (!model) return;
    polyScreen(model.outline, cam);
    ctx.save();
    ctx.strokeStyle = COLORS.muted;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    if (model.ridge) {
      const a = toScreen(model.ridge[0], cam);
      const b = toScreen(model.ridge[1], cam);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    const s = getState();
    if (!ctx || w < 2) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, w, h);
    const cam = s.camera2d;
    drawGrid(cam);
    drawRoof(cam);

    for (const d of s.decks || []) {
      const on = s.selection?.kind === "deck" && s.selection.id === d.id;
      drawDeck(d, cam, false);
      if (on) {
        polyScreen(deckCorners(d), cam);
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.stroke();
      }
    }
    if (s.draft?.type === "deck") drawDeck(s.draft, cam, true);
    for (const eq of s.equipment || []) drawEquip(eq, cam, false);
    if (s.draft?.type === "array") drawEquip(s.draft, cam, true);
    for (const step of s.steps || []) drawSteps(step, cam, false);
    if (s.draft?.type === "steps") drawSteps(s.draft, cam, true);

    for (const room of s.rooms) {
      if (room.points.length < 3) continue;
      polyScreen(room.points, cam);
      const sel = s.selection?.kind === "room" && s.selection.id === room.id;
      ctx.fillStyle = sel ? "rgba(47,93,80,0.18)" : "rgba(28,25,23,0.045)";
      ctx.fill();
    }

    for (const f of s.furniture || []) {
      if (f.hidden) continue;
      drawFurniture2d(ctx, f, cam, toScreen, {
        selected: s.selection?.kind === "furniture" && s.selection.id === f.id,
      });
    }
    if (s.ghost) {
      drawFurniture2d(ctx, s.ghost, cam, toScreen, { ghost: true, invalid: s.ghost.valid === false });
    }

    for (const wall of s.walls) {
      const a = toScreen(wall.a, cam);
      const b = toScreen(wall.b, cam);
      const sel = s.selection?.kind === "wall" && s.selection.id === wall.id;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = sel ? COLORS.accent : COLORS.ink;
      ctx.lineWidth = Math.max(3, 0.2 * cam.zoom);
      ctx.lineCap = "butt";
      ctx.stroke();
    }

    for (const op of s.openings) {
      const wall = s.walls.find((wn) => wn.id === op.wallId);
      if (!wall) continue;
      const L = wallLen(wall);
      const t0 = op.t - op.width / 2 / L;
      const t1 = op.t + op.width / 2 / L;
      const p0 = [wall.a[0] + (wall.b[0] - wall.a[0]) * t0, wall.a[1] + (wall.b[1] - wall.a[1]) * t0];
      const p1 = [wall.a[0] + (wall.b[0] - wall.a[0]) * t1, wall.a[1] + (wall.b[1] - wall.a[1]) * t1];
      const a = toScreen(p0, cam);
      const b = toScreen(p1, cam);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = COLORS.paper;
      ctx.lineWidth = Math.max(5, 0.22 * cam.zoom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = op.type === "door" ? COLORS.accent : COLORS.muted;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(op.type === "window" ? [4, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.selection?.kind === "opening" && s.selection.id === op.id) {
        ctx.strokeStyle = COLORS.accent;
        ctx.strokeRect(Math.min(a.x, b.x) - 6, Math.min(a.y, b.y) - 6, Math.abs(b.x - a.x) + 12, Math.abs(b.y - a.y) + 12);
      }
    }

    for (const stump of s.stumps || []) {
      drawStump(stump, cam, s.selection?.kind === "stump" && s.selection.id === stump.id);
    }
    if (s.draft?.type === "stump") drawStump(s.draft, cam, true);

    if (s.chain?.length) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.chain.forEach((p, i) => {
        const q = toScreen(p, cam);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      if (s.preview) {
        const q = toScreen(s.preview, cam);
        ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.preview && s.chain.length) {
        const last = s.chain[s.chain.length - 1];
        const d = dist(last, s.preview);
        const mid = toScreen([(last[0] + s.preview[0]) / 2, (last[1] + s.preview[1]) / 2], cam);
        ctx.fillStyle = COLORS.ink;
        ctx.font = "500 12px IBM Plex Sans, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(fmt(d), mid.x, mid.y - 8);
      }
    }

    for (const room of s.rooms) {
      const c = toScreen(room.centroid, cam);
      const area = internalArea(room);
      if (area * cam.zoom < 28) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of room.points) {
        const q = toScreen(p, cam);
        minX = Math.min(minX, q.x);
        maxX = Math.max(maxX, q.x);
        minY = Math.min(minY, q.y);
        maxY = Math.max(maxY, q.y);
      }
      const boxW = maxX - minX;
      const boxH = maxY - minY;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "500 13px IBM Plex Sans, sans-serif";
      const nameW = ctx.measureText(room.name).width;
      if (nameW < boxW - 8 && boxH > 28) {
        ctx.fillStyle = COLORS.ink;
        ctx.fillText(room.name, c.x, c.y - 7);
      }
      ctx.font = "400 11px IBM Plex Mono, ui-monospace, monospace";
      const areaText = fmtArea(area);
      if (ctx.measureText(areaText).width < boxW - 8 && boxH > 16) {
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(areaText, c.x, nameW < boxW - 8 && boxH > 28 ? c.y + 9 : c.y);
      }
    }

    if (s.selection?.kind === "wall") {
      const wall = s.walls.find((wn) => wn.id === s.selection.id);
      if (wall) {
        const mid = toScreen([(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2], cam);
        ctx.fillStyle = COLORS.accent;
        ctx.font = "500 12px IBM Plex Mono, ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(fmt(wallLen(wall)), mid.x, mid.y - 12);
        for (const p of [wall.a, wall.b]) {
          const spt = toScreen(p, cam);
          ctx.fillStyle = COLORS.paper;
          ctx.strokeStyle = COLORS.accent;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(spt.x - 4, spt.y - 4, 8, 8);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    drawDimensions(cam, s.dimMode);
    drawNorth();

    if (!s.walls.length && !s.chain && !(s.decks || []).length) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "500 16px IBM Plex Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Draw a wall, or generate a home.", w / 2, h / 2);
    }
  }

  function fit() {
    const s = getState();
    const roofPts = roofModel(s.walls, s.roof)?.outline || [];
    const b = sceneBounds(s.walls, elementPoints(s).concat(roofPts));
    if (!b) {
      actions.setCamera2d({ x: 6, z: 5, zoom: 42 });
      return;
    }
    const zoom = Math.min((w - 120) / Math.max(b.w, 1), (h - 120) / Math.max(b.h, 1), 64);
    actions.setCamera2d({ x: b.minX + b.w / 2, z: b.minZ + b.h / 2, zoom: Math.max(18, zoom) });
  }

  let gesture = null;
  const pointers = new Map();
  let holdTimer = 0;

  function clearHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = 0;
    }
  }

  function clientOf(pt) {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + pt.x, y: r.top + pt.y };
  }

  function pinchInfo() {
    const pts = [...pointers.values()];
    if (pts.length < 2) return null;
    const a = pts[0];
    const b = pts[1];
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  function beginPinch() {
    const info = pinchInfo();
    if (!info) return;
    clearHold();
    const s = getState();
    const world = toWorld(info.mid, s.camera2d);
    gesture = { type: "pinch", dist: info.dist, mid: info.mid, zoom: s.camera2d.zoom, world };
  }

  function applyPinch() {
    const info = pinchInfo();
    if (!info || gesture?.type !== "pinch") return;
    const zoom = Math.max(12, Math.min(90, gesture.zoom * (info.dist / gesture.dist)));
    const o = origin();
    actions.setCamera2d({
      zoom,
      x: gesture.world[0] - (info.mid.x - o.x) / zoom,
      z: gesture.world[1] + (info.mid.y - o.y) / zoom,
    });
  }

  canvas.addEventListener("pointerdown", (e) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
    const s = getState();
    const pt = local(e);
    pointers.set(e.pointerId, pt);
    const world = toWorld(pt, s.camera2d);
    if (pointers.size >= 2) {
      beginPinch();
      return;
    }
    if (e.button === 2) {
      gesture = { type: "menu" };
      return;
    }
    const pan = e.button === 1 || s.space;
    if (pan) {
      gesture = { type: "pan", last: pt };
      return;
    }
    if (e.pointerType === "touch" && s.tool === "select" && !s.space) {
      gesture = { type: "hold", start: pt, world, pointerId: e.pointerId };
      clearHold();
      holdTimer = window.setTimeout(() => {
        if (gesture?.type !== "hold") return;
        const g = gesture;
        gesture = { type: "menu" };
        actions.contextMenu?.(g.world, g.start, clientOf(g.start));
      }, 520);
      return;
    }
    if (e.pointerType === "touch") {
      gesture = { type: "pending", start: pt, world, pointerId: e.pointerId };
      return;
    }
    actions.pointerDown(world, pt, e);
    gesture = { type: "tool", start: pt, world };
  });

  canvas.addEventListener("pointermove", (e) => {
    const pt = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pt);
    if (pointers.size >= 2) {
      if (gesture?.type !== "pinch") beginPinch();
      applyPinch();
      return;
    }
    const s = getState();
    const world = toWorld(pt, s.camera2d);
    if (gesture?.type === "pan") {
      const cam = s.camera2d;
      actions.setCamera2d({
        x: cam.x - (pt.x - gesture.last.x) / cam.zoom,
        z: cam.z + (pt.y - gesture.last.y) / cam.zoom,
        zoom: cam.zoom,
      });
      gesture.last = pt;
      return;
    }
    if (gesture?.type === "pending" && e.pointerId === gesture.pointerId) {
      if (Math.hypot(pt.x - gesture.start.x, pt.y - gesture.start.y) > 8) {
        actions.pointerDown(gesture.world, gesture.start, e);
        gesture = { type: "tool", start: gesture.start, world: gesture.world };
        actions.pointerMove(world, pt);
      }
      return;
    }
    if (gesture?.type === "hold" && e.pointerId === gesture.pointerId) {
      if (Math.hypot(pt.x - gesture.start.x, pt.y - gesture.start.y) > 12) {
        clearHold();
        const startWorld = gesture.world;
        const start = gesture.start;
        actions.pointerDown(startWorld, start, e);
        gesture = { type: "tool", start, world: startWorld };
        actions.pointerMove(world, pt);
      }
      return;
    }
    if (gesture?.type === "menu" || gesture?.type === "pinch") return;
    actions.pointerMove(world, pt);
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    const pt = local(e);
    const s = getState();
    if (gesture?.type === "pinch") {
      if (pointers.size >= 2) applyPinch();
      else gesture = null;
      clearHold();
      return;
    }
    if (gesture?.type === "pending" && (!e.pointerId || e.pointerId === gesture.pointerId)) {
      clearHold();
      actions.pointerDown(gesture.world, gesture.start, e);
      actions.pointerUp(toWorld(pt, s.camera2d), pt);
      gesture = null;
      return;
    }
    if (gesture?.type === "hold" && (!e.pointerId || e.pointerId === gesture.pointerId)) {
      clearHold();
      actions.pointerDown(gesture.world, gesture.start, e);
      actions.pointerUp(toWorld(pt, s.camera2d), pt);
      gesture = null;
      return;
    }
    if (gesture?.type === "menu") {
      clearHold();
      gesture = null;
      return;
    }
    clearHold();
    actions.pointerUp(toWorld(pt, s.camera2d), pt);
    gesture = null;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const s = getState();
      const pt = local(e);
      const world = toWorld(pt, s.camera2d);
      const zoom = Math.max(12, Math.min(90, s.camera2d.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      const o = origin();
      actions.setCamera2d({
        zoom,
        x: world[0] - (pt.x - o.x) / zoom,
        z: world[1] + (pt.y - o.y) / zoom,
      });
    },
    { passive: false },
  );

  canvas.addEventListener("dblclick", (e) => {
    if (e.button !== 0) return;
    const s = getState();
    const pt = local(e);
    const world = toWorld(pt, s.camera2d);
    if (actions.doubleClick?.(world, pt)) return;
    const hit = nearestWall(world, s.walls, 0.3);
    if (!hit) fit();
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const s = getState();
    const pt = local(e);
    actions.contextMenu?.(toWorld(pt, s.camera2d), pt, { x: e.clientX, y: e.clientY });
  });

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);
  resize();

  return {
    draw,
    fit,
    resize,
    toWorld,
    local,
    dispose() {
      clearHold();
      ro.disconnect();
    },
  };
}

export function hitHandles(world, wall, cam, screen, origin) {
  const hitR = 10;
  for (const which of ["a", "b"]) {
    const p = wall[which];
    const sx = origin.x + (p[0] - cam.x) * cam.zoom;
    const sy = origin.y - (p[1] - cam.z) * cam.zoom;
    if (Math.abs(sx - screen.x) <= hitR && Math.abs(sy - screen.y) <= hitR) return which;
  }
  return null;
}
