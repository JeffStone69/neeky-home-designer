# Neeky Home Designer

...a plant in every corner

A calm metric floor-plan studio. Draw walls in metres, snap to a grid, then orbit the same plan as a 3D house. This folder is the whole app: no account, and no network after you have unzipped it.

Version 1.3.

## Download

On this GitHub page choose **Code → Download ZIP**, or take the zip on the latest Release. Unzip it anywhere.

## Open it

**Double-click `Neeky.html`.** That one file is the studio (code, fonts, and 3D library included). It works offline. You do not need the script for that.

If a browser blocks the double-clicked file, start the local server from this folder:

```
python3 start.sh
```

Then open http://127.0.0.1:8080/ . On Windows, double-click `start.bat` instead. Needs Python 3.

If port 8080 is already taken (the FLUX desk uses it too), pick another:

```
PORT=8090 python3 start.sh
```

Do not open `index.html` by double-click. The editable source uses JavaScript modules, and browsers only load those from the local server above.

## Units

- Working unit is **metres** only.
- Snap is **0.25 m**. Hold Alt, or click **Snap** in the status strip, for **0.05 m**.
- Walls 0.20 m thick × 2.70 m high. Doors 0.90 × 2.10 m. Windows 1.20 × 1.20 m on a 0.90 m sill.

## Files you save

Plans autosave in this browser (`localStorage`, key `neeky-home-designer-v2`). A different browser, or the double-clicked file versus the local server, keeps a separate plan. If a saved plan cannot be read, the raw copy stays under `neeky-home-designer-v2-unreadable` and is not replaced until you edit or open another file.

**Plan file → Save JSON** downloads `neeky-plan.json` (schema 3). **Open JSON** checks the file, migrates older plans, and repairs T-junctions before drawing. **Download .glb** saves the current 3D house. **Plan SVG** and **Plan PDF** are drawn at 1:50 or 1:100, on A3 when the plan fits and on a larger sheet at that same scale when it does not, with dimensions, a north arrow, and a title block. **DXF** is the same drawing in metres for CAD.

The status strip switches dimensions between **outside** faces, **inside** faces, and wall **centrelines**, and always shows gross floor area (outside faces). North is up on the plan.

## Generate

**Generate** is local and deterministic. Type a brief (`2 bedroom apartment, 75 m², open living kitchen`) or pick Studio / Two-bed / Family. Tick **Plants, Sofa, Bed, Table, Blue-tongue** to place those pieces. First visit loads the Family 160 m² plan.

## Solar

**Solar** sizes an off-grid or hybrid system from daily energy (typed in, or watts × hours), peak sun hours, battery days, losses, panel wattage, and the area you can fill. It reports panel count, array output, battery kilowatt-hours, inverter kilowatts, and a backup generator. Tick an EV charger (for example 7 kW) to include that load. Place the array, battery, inverter, charger, and generator on the plan. They are saved in the file and drawn as simple boxes in 3D. There is no roof model yet, so an array sits on the ground, on a deck, or on a flat area.

The plan SVG and PDF include the estimate. It is a planning figure only. A licensed electrician or CEC-accredited designer has to confirm it before anything is bought or installed.

## Furniture

Every room starts with a plant. Hide one from the status strip, or move it. **Furnish** places a sofa, bed, table, kitchen bench, robe, WC, extra plant, or a **Blue-tongue** tank.

**Deck** drags an outdoor platform (the object menu can turn it into a veranda). **Steps** and **Stumps** are site layers, not walls. **Plan file → Stump grid under house** drops posts on a 1.5 m grid along the wall centrelines. A sample is `plans/belli-park-6x9-plan.json` (6 m × 9 m at Belli Park, with a 2 m north deck).

The tank is 1.80 × 0.60 m. It snaps to a wall, shows a lizard on the plan, and will not sit in a doorway. Delete furniture the same way as a wall: Delete tool or Backspace.

Select an object to edit its size in the floating inspector. Right-click (or long-press, or **Tools**) for rotate, nudge, duplicate, lock, and the rest.

## Layout

| Path | What it is |
| --- | --- |
| `Neeky.html` | Double-click studio. One file, rebuilt from the source. |
| `index.html`, `js/`, `styles.css` | Same studio as separate files, for editing. Serve with `start.sh` / `start.bat`. |
| `js/vendor/three.module.js` | Three.js r170 (MIT), bundled so the 3D view works offline. |
| `fonts/` | IBM Plex (OFL). See `fonts/OFL.txt`. |
| `plans/` | Example plans, including the Belli Park tiny home. |
| `LICENSE`, `NOTICE` | MIT for the app. Fonts stay under their own OFL. |

## Rebuild the single file

Editing `js/` or `styles.css` does not change `Neeky.html` until you rebuild it. Needs Node 22.

```
npm install
npm test
npm run build
```

`npm run build:check` fails if `Neeky.html` has drifted. `npm run e2e` serves the folder and opens the Belli Park plan in a browser.
