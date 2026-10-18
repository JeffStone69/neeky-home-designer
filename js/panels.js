import { APP_VERSION_LABEL } from "./constants.js";
import { FURN, furnLabel } from "./furniture.js";
import { fmtArea, internalArea } from "./geom.js";
import { EQUIP, POWER_NOTE, SUNSHINE_COAST_PSH, formatNum } from "./power.js";

export const ICONS = {
  select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4 l14 8 -8 2 -2 8 z"/></svg>`,
  wall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 18 V6 h4 v12 H4zm6 0 V10 h4 v8 h-4zm6 0 V8 h4 v10 h-4z"/></svg>`,
  door: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 20 V5 h10 v15"/><path d="M14.5 12.5 h.01"/><path d="M8 20 h10"/></svg>`,
  window: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="5" width="14" height="14" rx="1"/><path d="M12 5 v14 M5 12 h14"/></svg>`,
  room: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 16 V8 l7-3 7 3 v8"/><path d="M9 16 v-4 h6 v4"/></svg>`,
  del: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 8 h12 l-1 12 H7z"/><path d="M9 8 V6 h6 v2"/><path d="M10 11 v6 M14 11 v6"/></svg>`,
  deck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 15 h16"/><path d="M6 15 v4 M10 15 v4 M14 15 v4 M18 15 v4"/><path d="M4 11 h16"/></svg>`,
  steps: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 18 h5 v-4 h5 V10 h6"/></svg>`,
  stumps: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7" cy="8" r="1.4"/><circle cx="12" cy="8" r="1.4"/><circle cx="17" cy="8" r="1.4"/><circle cx="7" cy="13" r="1.4"/><circle cx="12" cy="13" r="1.4"/><circle cx="17" cy="13" r="1.4"/><circle cx="7" cy="18" r="1.4"/><circle cx="12" cy="18" r="1.4"/><circle cx="17" cy="18" r="1.4"/></svg>`,
  gen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 4 v3 M12 17 v3 M4 12 h3 M17 12 h3"/><circle cx="12" cy="12" r="4.5"/></svg>`,
  solar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8" cy="7" r="2.1"/><path d="M8 2.6 v1.5 M8 9.8 v1.4 M3.4 7 H4.9 M11.1 7 h1.5 M4.6 3.6 l1 1 M11.4 3.6 l-1 1"/><path d="M3 15.2 h18 l-1.4 4 H4.4 z"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 8 H5 v3"/><path d="M6 10 c2-4 12-4 14 3"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M16 8 h3 v3"/><path d="M18 10 c-2-4 -12-4 -14 3"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 4 h7 l5 5 v11 H7z"/><path d="M14 4 v5 h5"/></svg>`,
  furnish: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 13 h14 v6 H5z"/><path d="M7 13 V8 h10 v5"/><path d="M8 19 v2 M16 19 v2"/></svg>`,
  plant: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 20 h6 l-1.1-6 H10.1z"/><path d="M12 14 c0-6 4-8 4-8 s0 5-4 8"/><path d="M12 14 c0-6 -4-8 -4-8 s0 5 4 8"/><path d="M12 14 c-1.5-5 2-8 2-8"/></svg>`,
  sofa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="11" width="16" height="6" rx="1.4"/><path d="M6 11 V8 h12 v3"/><path d="M7 17 v2 M17 17 v2"/></svg>`,
  bed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 16 V10 h16 v6"/><path d="M4 10 V7 h6 v3"/><path d="M3 16 h18"/></svg>`,
  table: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="8" width="16" height="3" rx="0.4"/><path d="M6 11 v8 M18 11 v8"/></svg>`,
  bench: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 10 h18"/><path d="M5 10 v7 M19 10 v7"/><path d="M4 17 h16"/></svg>`,
  robe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="4" width="14" height="16" rx="1"/><path d="M12 4 v16"/></svg>`,
  wc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="14" rx="4" ry="5"/><rect x="8" y="4" width="8" height="4" rx="1"/></svg>`,
  lizard: `<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="13.5" rx="3" ry="6.2"/><circle cx="12" cy="6.2" r="2.1"/><ellipse cx="6.8" cy="10.5" rx="2.4" ry="1"/><ellipse cx="17.2" cy="10.5" rx="2.4" ry="1"/><ellipse cx="7.2" cy="16.5" rx="2.2" ry="0.9"/><ellipse cx="16.8" cy="16.5" rx="2.2" ry="0.9"/><rect x="11.2" y="3.2" width="1.6" height="1.4" rx="0.4" fill="#2f6aa0"/></svg>`,
};

function toolBtn(id, label, icon) {
  return `<button type="button" class="tool" data-tool="${id}" title="${label}" aria-label="${label}">${icon}</button>`;
}

export function shellHtml() {
  return `
  <div class="app">
    <header class="toolbar">
      <div class="brand">
        <span class="mark" aria-hidden="true"><svg viewBox="0 0 16 18"><circle cx="5.7" cy="8.7" r="3.15" fill="#62c47a"/><circle cx="10.6" cy="9.05" r="2.9" fill="#3e8f5a"/><circle cx="8.15" cy="6.15" r="2.35" fill="#b7ebbb"/><path fill="#f0d2b0" d="M2.1 11.2h11.8v1.65H2.1z"/><path fill="#c47b45" d="M3.3 12.65h9.4l-1.25 4.2H4.55z"/></svg></span>
        <div class="titles">
          <strong>Neeky</strong>
          <span>Home Designer ${APP_VERSION_LABEL}</span>
          <span class="tagline">...a plant in every corner</span>
        </div>
      </div>
      <div class="cluster tools-cluster">
        <div class="group">
          ${toolBtn("select", "Select", ICONS.select)}
          ${toolBtn("wall", "Wall", ICONS.wall)}
          ${toolBtn("door", "Door", ICONS.door)}
          ${toolBtn("window", "Window", ICONS.window)}
          ${toolBtn("room", "Room name", ICONS.room)}
          ${toolBtn("delete", "Delete", ICONS.del)}
          ${toolBtn("deck", "Deck", ICONS.deck)}
          ${toolBtn("steps", "Steps", ICONS.steps)}
          ${toolBtn("stumps", "Stumps", ICONS.stumps)}
        </div>
        <button type="button" class="tool" id="furnish-btn" title="Furnish">${ICONS.furnish}<span>Furnish</span></button>
        <button type="button" class="tool" id="solar-btn" title="Solar">${ICONS.solar}<span>Solar</span></button>
        <button type="button" class="tool" id="gen-btn" title="Generate">${ICONS.gen}<span>Generate</span></button>
      </div>
      <div class="cluster view-cluster">
        <div class="group view-group">
          <button type="button" class="tool" data-view="split">Split</button>
          <button type="button" class="tool" data-view="plan">Plan</button>
          <button type="button" class="tool" data-view="model">3D</button>
          <button type="button" class="tool" data-view="top">Top</button>
        </div>
        <div class="group">
          <button type="button" class="tool" id="undo-btn" title="Undo">${ICONS.undo}</button>
          <button type="button" class="tool" id="redo-btn" title="Redo">${ICONS.redo}</button>
          <button type="button" class="tool" id="file-btn" title="File">${ICONS.file}</button>
        </div>
      </div>
    </header>
    <aside class="palette" id="palette">
      <p class="pop-title">Furnish</p>
      <div class="furn-grid" id="furn-grid"></div>
      <button type="button" class="plants-toggle" id="plants-toggle">Hide plants</button>
      <p class="dim-note">Drag onto the plan. Select anything to edit it. Right-click, or Tools, for more.</p>
    </aside>
    <div class="stage">
      <div class="pane plan-pane">
        <canvas id="plan-canvas"></canvas>
      </div>
      <div class="pane view-pane"><canvas id="view-canvas"></canvas></div>
    </div>
    <footer class="status" id="status"></footer>
    <div id="toast" class="toast" hidden></div>
    <div id="inspector" class="inspector" hidden></div>
    <div id="ctx-menu" class="ctx-menu" hidden role="menu"></div>
    <div id="popover" class="popover" hidden></div>
    <input id="file-in" type="file" accept="application/json,.json" hidden />
  </div>`;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function statusBarHtml({ snap, dim, tool, action = "", summary }) {
  return `<button type="button" class="snap-btn" data-act="snap">Snap ${escapeHtml(snap)} m</button>
      <button type="button" class="snap-btn" data-act="dim">Dims ${escapeHtml(dim)}</button>
      <span>${escapeHtml(tool)}</span>
      ${action}
      <span class="grow"></span>
      <span class="mono">${escapeHtml(summary)}</span>
      <span class="hint">Right-click for tools · ⌫ delete · R rotate · ⌘Z undo</span>`;
}

export function paletteHtml() {
  const item = (id, name, dim) => {
    const icon = id === "tank" ? ICONS.lizard : ICONS[id];
    return `<button type="button" class="furn-item${id === "tank" ? " furn-tank" : ""}" data-furn="${id}">${icon}<span class="copy"><strong>${name}</strong><span class="dim">${dim}</span></span></button>`;
  };
  return [
    item("plant", "Plant", "0.45 m"),
    item("sofa", "Sofa", "2.20 × 0.90 m"),
    item("bed", "Bed", "2.00 × 1.60 m"),
    item("table", "Table", "1.40 × 0.80 m"),
    item("bench", "Bench", "2.40 × 0.60 m"),
    item("robe", "Robe", "1.80 × 0.60 m"),
    item("wc", "WC", "0.40 × 0.70 m"),
    item("tank", "Blue-tongue", "1.80 × 0.60 m · wall"),
  ].join("");
}

export function applianceRowHtml(a = {}) {
  return `<div class="solar-app">
    <input data-k="name" maxlength="32" autocomplete="off" aria-label="Appliance" value="${escapeHtml(a.name || "")}" />
    <input data-k="watts" inputmode="decimal" autocomplete="off" aria-label="Watts" value="${escapeHtml(a.watts ?? "")}" />
    <input data-k="hours" inputmode="decimal" autocomplete="off" aria-label="Hours per day" value="${escapeHtml(a.hours ?? "")}" />
    <button type="button" data-act="remove-app" aria-label="Remove appliance">×</button>
  </div>`;
}

function solarInput(name, label, value, span) {
  return `<label class="${span ? "span2" : ""}">${label}<input name="${name}" inputmode="decimal" autocomplete="off" value="${escapeHtml(value)}" /></label>`;
}

export function solarResultHtml(result) {
  const nominal = result.nominalKwh == null ? "-" : `${formatNum(result.nominalKwh)} kWh nominal`;
  const short = result.shortfall
    ? `<p>Available area fits ${result.panelCount} of ${result.neededCount == null ? "-" : result.neededCount} panels.</p>`
    : "";
  const ev = result.evKwh > 0 ? ` including ${formatNum(result.evKwh)} kWh for the EV` : "";
  return `<strong>${result.panelCount} panels · ${formatNum(result.arrayKw)} kW</strong>
    <p>${formatNum(result.expectedDailyKwh)} kWh/day · ${formatNum(result.expectedYearlyKwh, 0)} kWh/year</p>
    <p>Battery ${formatNum(result.usableKwh)} kWh usable · ${nominal} · DoD ${formatNum(result.dod * 100, 0)}%</p>
    <p>Inverter ${formatNum(result.inverterKw)} kW · generator ${formatNum(result.generatorKva)} kVA</p>
    <p>Daily load ${formatNum(result.dailyKwh)} kWh${ev}</p>
    ${short}
    <p class="solar-note">${escapeHtml(POWER_NOTE)}</p>`;
}

export function solarFormHtml(power, resultHtml) {
  const p = power || {};
  const typed = p.source !== "appliances";
  const rows = (p.appliances || []).map((a) => applianceRowHtml(a)).join("");
  return `<form class="pop-form" id="solar-form" autocomplete="off">
    <p class="pop-title">Solar and backup</p>
    <div class="chips">
      <button type="button" class="chip${typed ? " active" : ""}" data-source="typed">Typed kWh</button>
      <button type="button" class="chip${typed ? "" : " active"}" data-source="appliances">Appliances</button>
    </div>
    <div id="solar-typed" class="solar-grid"${typed ? "" : " hidden"}>
      ${solarInput("dailyKwh", "Daily use kWh", formatNum(p.dailyKwh, p.dailyKwh % 1 ? 2 : 0), true)}
    </div>
    <div id="solar-apps"${typed ? " hidden" : ""}>
      <div class="solar-app solar-head"><span>Name</span><span>Watts</span><span>Hours</span><span></span></div>
      <div id="solar-app-list">${rows}</div>
      <button type="button" data-act="add-app">Add appliance</button>
    </div>
    <div class="solar-grid">
      ${solarInput("peakSunHours", "Peak sun hours", formatNum(p.peakSunHours ?? SUNSHINE_COAST_PSH, 1))}
      ${solarInput("autonomyDays", "Autonomy days", formatNum(p.autonomyDays, 0))}
      ${solarInput("lossesPct", "Losses %", formatNum((p.losses ?? 0.2) * 100, 0))}
      ${solarInput("panelW", "Panel W", formatNum(p.panelW, 0))}
      ${solarInput("panelArea", "Panel m²", formatNum(p.panelArea, 2))}
      ${solarInput("availableArea", "Available m²", formatNum(p.availableArea, 2))}
      ${solarInput("dodPct", "Discharge %", formatNum((p.dod ?? 0.8) * 100, 0), true)}
    </div>
    <p class="solar-note">Peak sun hours default to ${formatNum(SUNSHINE_COAST_PSH, 1)} for the Sunshine Coast, about 26.5°S. Discharge % is the battery depth of discharge.</p>
    <label class="keep"><input type="checkbox" name="includeEv"${p.includeEv ? " checked" : ""} /> Include an EV charger</label>
    <div class="solar-grid">
      ${solarInput("evKw", "Charger kW", formatNum(p.evKw, 1))}
      ${solarInput("evHours", "Hours / day", formatNum(p.evHours, 1))}
    </div>
    <p class="solar-note">Hours add kilowatt-hours. The charger kilowatts also size the inverter and generator.</p>
    <button type="button" data-act="use-arrays">Use placed array area</button>
    <div id="solar-result" class="solar-result">${resultHtml || ""}</div>
    <p class="pop-title">Place on the plan</p>
    <div class="chips">
      <button type="button" class="chip" data-place="array">Array</button>
      <button type="button" class="chip" data-place="battery">Battery</button>
      <button type="button" class="chip" data-place="inverter">Inverter</button>
      <button type="button" class="chip" data-place="charger">EV charger</button>
      <button type="button" class="chip" data-place="generator">Generator</button>
    </div>
    <p class="solar-note">No roof yet. An array sits on the ground, on a deck, or on a flat area. Azimuth 0 faces north.</p>
  </form>`;
}

export function mountField(value) {
  const opt = (id, label) => `<option value="${id}"${value === id ? " selected" : ""}>${label}</option>`;
  return `<label class="insp-field span2">Mount<select data-field="mount">${opt("ground", "Ground")}${opt("deck", "Deck")}${opt("flat", "Flat area")}</select></label>`;
}

export function inspField(name, label, value, span) {
  return `<label class="insp-field${span ? " span2" : ""}">${label}<input data-field="${name}" inputmode="decimal" autocomplete="off" value="${escapeHtml(value)}" /></label>`;
}

export function nameField(value) {
  return `<label class="insp-field span2">Name<input data-field="name" maxlength="32" autocomplete="off" value="${escapeHtml(value)}" /></label>`;
}

export function menuHtml(state, obj, splitT) {
  const sel = state.selection;
  if (!sel || !obj) return "";
  const rows = [];
  const act = (id, label, extra = "") => rows.push(`<button type="button" role="menuitem" data-act="${id}" ${extra}>${label}</button>`);
  const sep = () => rows.push(`<div class="ctx-sep"></div>`);
  const heading = (t) => rows.push(`<div class="ctx-label">${t}</div>`);
  if (sel.kind === "furniture") {
    heading("Nudge 0.10 m");
    rows.push(`<div class="ctx-nudge">
      <button type="button" data-act="nudge" data-x="-1" data-z="0">Left</button>
      <button type="button" data-act="nudge" data-x="1" data-z="0">Right</button>
      <button type="button" data-act="nudge" data-x="0" data-z="1">Up</button>
      <button type="button" data-act="nudge" data-x="0" data-z="-1">Down</button>
    </div>`);
    sep();
    if (obj.type !== "tank" && obj.type !== "plant") {
      act("rot90", "Rotate 90°");
      act("rot45", "Rotate 45°");
      act("turn", "Turn around");
      act("mirror", "Mirror");
      act("swap", "Swap width and depth");
      sep();
      act("align", "Align to nearest wall");
    }
    if (obj.type === "tank") act("realign", "Realign to wall");
    act("dup", "Duplicate");
    if (obj.type !== "tank") act("center", "Center in room");
    if (obj.type !== "tank") act("reset", "Reset size");
    act("lock", obj.locked ? "Unlock" : "Lock position");
    act("hide", "Hide");
    sep();
    heading("Change to");
    for (const [id, spec] of Object.entries(FURN)) {
      if (id === obj.type) continue;
      act("retype", spec.label, `data-type="${id}"`);
    }
    sep();
    act("del", "Delete", `class="danger"`);
  } else if (sel.kind === "wall") {
    act("split-half", "Split in half");
    if (splitT != null && Math.abs(splitT - 0.5) > 0.08) act("split-here", "Split here");
    act("straighten", "Straighten to axis");
    sep();
    act("add-door", "Add door");
    act("add-window", "Add window");
    sep();
    act("del", "Delete wall", `class="danger"`);
  } else if (sel.kind === "opening") {
    act("center-op", "Center on wall");
    act("widen", "Fit wall width");
    act(obj.type === "door" ? "to-window" : "to-door", obj.type === "door" ? "Make window" : "Make door");
    sep();
    act("del", "Delete", `class="danger"`);
  } else if (sel.kind === "room") {
    act("plants-hide", "Hide plants in this room");
    act("plants-show", "Show plants in this room");
    act("rename", "Rename");
  } else if (sel.kind === "deck") {
    act("veranda", obj.kind === "veranda" ? "Make deck" : "Make veranda");
    sep();
    act("del", "Delete", `class="danger"`);
  } else if (sel.kind === "steps") {
    act("rot90", "Rotate 90°");
    sep();
    act("del", "Delete", `class="danger"`);
  } else if (sel.kind === "stump") {
    act("del", "Delete stump", `class="danger"`);
  } else if (sel.kind === "equipment") {
    if (obj.kind === "array") {
      act("mount-ground", "Ground mount");
      act("mount-deck", "Deck mount");
      act("mount-flat", "Flat area");
      sep();
    }
    act("del", "Delete", `class="danger"`);
  }
  return rows.join("");
}

export function kickerFor(sel, obj) {
  if (!sel || !obj) return "";
  if (sel.kind === "wall") return "Wall";
  if (sel.kind === "opening") return obj.type === "window" ? "Window" : "Door";
  if (sel.kind === "room") return "Room";
  if (sel.kind === "deck") return obj.kind === "veranda" ? "Veranda" : "Deck";
  if (sel.kind === "steps") return "Steps";
  if (sel.kind === "stump") return "Stump";
  if (sel.kind === "equipment") return EQUIP[obj.kind]?.label || "Equipment";
  const type = obj.type === "tank" ? "Blue-tongue" : FURN[obj.type]?.label || furnLabel(obj);
  return obj.locked ? `${type} · Locked` : type;
}

export function roomAreaText(room) {
  return fmtArea(internalArea(room));
}
