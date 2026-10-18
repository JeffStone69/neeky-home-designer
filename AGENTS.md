# Neeky Home Designer — agent notes

Version 1.3. The app is an offline metric floor-plan studio. There is no account and no network call at runtime. `Neeky.html` is the double-click build; `index.html` plus `js/` is the editable source and only runs from a local server (`python3 start.sh`).

## Layout

| Path | Role |
| --- | --- |
| `index.html`, `styles.css`, `fonts.css`, `fonts/` | Source shell, palette, IBM Plex (OFL). |
| `js/main.js` | Boots `mount()` on `#neeky-root`. |
| `js/app.js` | Wires tools, pointers, keyboard, and view switching. |
| `js/store.js` | State shape, undo snapshots, debounced `localStorage`. |
| `js/commands.js` | Undoable edits. Call `edit()` or `checkpoint` + `commit`. |
| `js/panels.js` | Toolbar shell, inspector and menu markup. |
| `js/io.js` | Open / save / sheet download. |
| `js/schema.js` | JSON schema, migrations, validation. |
| `js/geom.js` | Walls, rooms, snap, areas, `normalizePlan`. `nearestWall` hashes segments into a grid. |
| `js/elements.js` | Decks, steps, stump grids. |
| `js/plan2d.js`, `js/view3d.js` | Canvas views. 3D loads after first paint. |
| `js/furniture.js`, `js/generate.js` | Pieces and the local plan generator. |
| `js/export-sheet.js` | SVG, PDF, and DXF sheets. |
| `js/vendor/` | Three.js r170 (MIT). Do not fetch Three from the network. |
| `plans/` | Fixture plans. `belli-park-6x9-plan.json` is the CI plan. |
| `test/` | `node --test` unit tests. No DOM. |
| `e2e/` | Playwright smoke test. |
| `scripts/build-single.mjs` | Rebuilds `Neeky.html`. |
| `Neeky.html` | Single-file build. Generated. Do not hand-edit. |

## Schema

Saved plans are JSON, metres, `app: "neeky-home-designer"`.

- Schema **1** is a file with no `version` (v1.0 / v1.2). It migrates on open.
- Schema **2** is the current file (`version: 2`). A newer `version` is rejected with an error; the open plan is left alone.

Walls are centreline segments `{a:[x,z], b:[x,z]}`. Openings point at a wall by `wallIndex` and a centre parameter `t`. Rooms are labels (`name`, `labelAt`), not geometry. Furniture types are `plant`, `sofa`, `bed`, `table`, `bench`, `robe`, `wc`, `tank`.

v1.3 layers, all optional:

- `decks`: axis-aligned rectangles `{kind: "deck"|"veranda", name, x, z, w, d}`. Origin is the minimum corner after normalising.
- `steps`: `{x, z, rot, width, count, rise, going}`. `rot` is the run direction, radians, 0 = +X, π/2 = +Z (north).
- `stumps`: `{x, z, size, height}` posts. A 1.5 m grid on the wall centreline is the usual tiny-home footing.
- `dimMode`: `centreline`, `inside`, or `outside`.
- `title`: sheet title.

**North is +Z**, which is up on the plan. Wall thickness is 0.20 m and wall height is 2.70 m (`js/constants.js`). Overall dimensions in `outside` mode are the centreline bounding box expanded by half the thickness on every side. Gross floor area is the area inside the outside face of the external walls. Room labels are the area inside the inside faces.

`localStorage` key `neeky-home-designer-v2` is the storage slot, not the schema version. Keep the key so existing browsers still open. A value that fails validation is copied to `neeky-home-designer-v2-unreadable` and left in place until the user edits or opens a file. Do not write the Family preset over it on startup.

Sheet export keeps the scale the user picked (1:50 or 1:100). The page is A3 when the drawing fits, and larger at that same scale when it does not. Do not shrink the drawing and relabel the scale.

Opening a file parses JSON, migrates, validates finite coordinates, then `loadPlan` runs `normalizePlan` (`planarize` + `mergeCollinear` + opening rebind). Do not skip that path for imports.

## Conventions

- Working unit is metres. Default snap is 0.25 m; fine snap is 0.05 m.
- Keep the calm palette and IBM Plex. New UI uses the existing tokens in `styles.css`.
- Edits that change the plan go through `checkpoint` and `commit`. `commit` normalises walls and schedules a save. Persistence is debounced (~280 ms) and flushed on `pagehide`.
- Do not set `canvas.style.width` or `height` in pixels. Size the bitmap from the pane and let CSS (`width/height: 100%`) own the layout, or the plan stays half width after Split → Plan.
- Pure geometry stays free of `document` so `node --test` can import it.
- The 3D view is allowed to fail to start; the plan view must still work. Do not `console.error` for an expected, handled case.
- Vendor files and `fonts/` stay offline. Do not add a CDN script or font.

## Rebuild `Neeky.html`

From this folder, with Node 22:

```
npm install
npm test
npm run build
npm run build:check
npm run e2e
```

`npm run build` rewrites `Neeky.html` from `js/`, `styles.css`, `fonts.css`, and `favicon.svg` with esbuild. CI runs `build:check` and fails if the committed file drifts. After any source or style change, rebuild and commit `Neeky.html`.

Serve the folder with `python3 start.sh` (or `PORT=8090 python3 start.sh`) and open `http://127.0.0.1:8080/`. Double-click `Neeky.html` for the offline file. Do not double-click `index.html`.
