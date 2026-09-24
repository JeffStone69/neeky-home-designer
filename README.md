# Neeky Home Designer

A calm metric floor-plan studio. Draw walls in metres, snap to a grid, then orbit the same plan as a 3D house. This folder is the whole app: no account, no build step, and no network after you have unzipped it.

Latest release: [v1.0.1](https://github.com/JeffStone69/neeky-home-designer/releases/tag/v1.0.1).

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

Plans autosave in this browser (`localStorage`, key `neeky-home-designer-v2`). A different browser, or the double-clicked file versus the local server, keeps a separate plan.

**Plan file → Save JSON** downloads `neeky-plan.json`. **Open JSON** restores it. **Download .gltf** saves the current 3D house as `neeky-house.glb`.

## Generate

**Generate** is local and deterministic. Type a brief (`2 bedroom apartment, 75 m², open living kitchen`) or pick Studio / Two-bed / Family. Tick **Plants, Sofa, Bed, Table, Blue-tongue** to place those pieces. First visit loads the Family 160 m² plan.

## Furniture

Every room starts with a plant. Hide one from the status strip, or move it. **Furnish** places a sofa, bed, table, extra plant, or a **Blue-tongue** tank.

The tank is 1.80 × 0.60 m. It snaps to a wall, shows a lizard on the plan, and will not sit in a doorway. Delete furniture the same way as a wall: Delete tool or Backspace.

Select an object to edit its size in the floating inspector. Right-click (or long-press, or **Tools**) for rotate, nudge, duplicate, lock, and the rest.

## Layout

| Path | What it is |
| --- | --- |
| `Neeky.html` | Double-click studio. One file. |
| `index.html`, `js/`, `styles.css` | Same studio as separate files, for editing. Serve with `start.sh` / `start.bat`. |
| `js/vendor/three.module.js` | Three.js r170 (MIT), bundled so the 3D view works offline. |
| `fonts/` | IBM Plex (OFL). See `fonts/OFL.txt`. |
| `LICENSE`, `NOTICE` | MIT for the app. Fonts stay under their own OFL. |
