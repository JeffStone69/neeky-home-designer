import { COLORS, MAJOR, MINOR, SNAP } from "./constants.js";
import {
  bounds,
  clampOpening,
  dist,
  fmt,
  fmtArea,
  insetArea,
  nearestWall,
  projectOnSeg,
  snapPt,
  wallLen,
} from "./geom.js";
import { drawFurniture2d } from "./furniture.js";

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
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
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

  function draw() {
    const s = getState();
    if (!ctx || w < 2) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, w, h);
    const cam = s.camera2d;
    drawGrid(cam);

    for (const room of s.rooms) {
      if (room.points.length < 3) continue;
      ctx.beginPath();
      room.points.forEach((p, i) => {
        const q = toScreen(p, cam);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
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
      const wall = s.walls.find((w) => w.id === op.wallId);
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
      if (insetArea(room) * cam.zoom < 28) continue;
      ctx.fillStyle = COLORS.ink;
      ctx.font = "500 13px IBM Plex Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(room.name, c.x, c.y - 7);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "400 11px IBM Plex Mono, ui-monospace, monospace";
      ctx.fillText(fmtArea(insetArea(room)), c.x, c.y + 9);
    }

    if (s.selection?.kind === "wall") {
      const wall = s.walls.find((w) => w.id === s.selection.id);
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

    const b = bounds(s.walls);
    if (b && b.w > 0.2) {
      const sw = toScreen([b.minX, b.minZ], cam);
      const ne = toScreen([b.maxX, b.maxZ], cam);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "500 11px IBM Plex Mono, ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(fmt(b.w), (sw.x + ne.x) / 2, Math.max(sw.y, ne.y) + 16);
      ctx.save();
      ctx.translate(Math.min(sw.x, ne.x) - 14, (sw.y + ne.y) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(fmt(b.h), 0, 0);
      ctx.restore();
    }

    if (!s.walls.length && !s.chain) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "500 16px IBM Plex Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Draw a wall, or generate a home.", w / 2, h / 2);
    }
  }

  function fit() {
    const s = getState();
    const b = bounds(s.walls);
    if (!b) {
      actions.setCamera2d({ x: 6, z: 5, zoom: 42 });
      return;
    }
    const zoom = Math.min((w - 80) / Math.max(b.w, 1), (h - 80) / Math.max(b.h, 1), 64);
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
    actions.pointerDown(world, pt, e);
    gesture = { type: "tool", start: pt, world };
  });

  canvas.addEventListener("pointermove", (e) => {
    const pt = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pt);
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
    if (gesture?.type === "menu") return;
    actions.pointerMove(world, pt);
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    const pt = local(e);
    const s = getState();
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
  ro.observe(canvas);

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

void clampOpening;
void SNAP;
void projectOnSeg;
void hitHandles;
