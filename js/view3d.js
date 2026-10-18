import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { GLTFExporter } from "./vendor/GLTFExporter.js";
import { COLORS, MAJOR, MINOR, WALL_HEIGHT, WALL_THICK } from "./constants.js";
import { deckCorners, elementPoints, normalizeDeck } from "./elements.js";
import { EQUIP } from "./power.js";
import { sceneBounds, wallLen } from "./geom.js";
import { addFurniture3d } from "./furniture.js";

export function createView3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(COLORS.paper, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.paper);
  scene.fog = new THREE.Fog(COLORS.paper, 40, 90);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  camera.position.set(12, 14, 16);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 4;
  controls.maxDistance = 80;
  controls.target.set(6, 0, 6);

  const hemi = new THREE.HemisphereLight(0xf2f5f8, 0xc9c0b0, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6e8, 1.05);
  sun.position.set(12, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 48),
    new THREE.MeshLambertMaterial({ color: COLORS.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const house = new THREE.Group();
  scene.add(house);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let roomMeshes = [];
  let onRoomClick = null;
  let onFurnClick = null;
  let onEquipClick = null;
  let onContext = null;
  let selectedRoomId = null;
  let raf = 0;
  let running = true;

  const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.wall3d, side: THREE.DoubleSide });
  const wallSel = new THREE.MeshLambertMaterial({ color: COLORS.accent, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshLambertMaterial({ color: COLORS.floor });
  const floorSel = new THREE.MeshLambertMaterial({ color: 0xb7cfc0 });
  const frameMat = new THREE.MeshLambertMaterial({ color: COLORS.frame });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0xcbb79a });

  function resize() {
    const el = canvas.parentElement || canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function clearHouse() {
    while (house.children.length) {
      const ch = house.children[0];
      house.remove(ch);
      ch.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    roomMeshes = [];
  }

  function addGrid(b) {
    if (!b) return;
    const pts = [];
    const pad = 4;
    const x0 = Math.floor(b.minX - pad);
    const x1 = Math.ceil(b.maxX + pad);
    const z0 = Math.floor(b.minZ - pad);
    const z1 = Math.ceil(b.maxZ + pad);
    for (let x = x0; x <= x1 + 1e-6; x += MINOR) {
      const major = Math.abs(x / MAJOR - Math.round(x / MAJOR)) < 1e-6;
      pts.push({ major, a: [x, z0], b: [x, z1] });
    }
    for (let z = z0; z <= z1 + 1e-6; z += MINOR) {
      const major = Math.abs(z / MAJOR - Math.round(z / MAJOR)) < 1e-6;
      pts.push({ major, a: [x0, z], b: [x1, z] });
    }
    const maj = [];
    const min = [];
    for (const g of pts) {
      const arr = g.major ? maj : min;
      arr.push(g.a[0], 0.001, g.a[1], g.b[0], 0.001, g.b[1]);
    }
    const mk = (arr, color, opacity) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      const line = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      );
      house.add(line);
    };
    mk(min, 0x1c1917, 0.05);
    mk(maj, 0x1c1917, 0.12);
  }

  function wallMesh(wall, openings, selected) {
    const dx = wall.b[0] - wall.a[0];
    const dz = wall.b[1] - wall.a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const ang = Math.atan2(dz, dx);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(len, 0);
    shape.lineTo(len, WALL_HEIGHT);
    shape.lineTo(0, WALL_HEIGHT);
    shape.closePath();
    for (const op of openings) {
      const cx = op.t * len;
      const x0 = cx - op.width / 2;
      const x1 = cx + op.width / 2;
      const y0 = op.sill || 0;
      const y1 = y0 + op.height;
      const hole = new THREE.Path();
      hole.moveTo(x0, y0);
      hole.lineTo(x0, y1);
      hole.lineTo(x1, y1);
      hole.lineTo(x1, y0);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: WALL_THICK,
      bevelEnabled: false,
      steps: 1,
    });
    geo.translate(0, 0, -WALL_THICK / 2);
    const mesh = new THREE.Mesh(geo, selected ? wallSel : wallMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.y = -ang;
    mesh.position.set(wall.a[0], 0, wall.a[1]);
    mesh.userData.wallId = wall.id;
    house.add(mesh);

    for (const op of openings) decorateOpening(wall, op, ang, len);
  }

  function decorateOpening(wall, op, ang, len) {
    const cx = op.t * len;
    const px = wall.a[0] + Math.cos(ang) * cx;
    const pz = wall.a[1] + Math.sin(ang) * cx;
    const y0 = op.sill || 0;
    const y1 = y0 + op.height;
    const midY = (y0 + y1) / 2;
    const nx = -Math.sin(ang);
    const nz = Math.cos(ang);

    const tag = (m) => {
      m.userData.openingId = op.id;
      return m;
    };

    if (op.type === "door" && op.width <= 1.2) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(op.width, op.height, 0.04), doorMat);
      leaf.position.set(px + nx * 0.14, op.height / 2, pz + nz * 0.14);
      leaf.rotation.y = -ang + 1.15;
      leaf.castShadow = true;
      tag(leaf);
      house.add(leaf);
      return;
    }

    const ft = 0.045;
    const depth = WALL_THICK + 0.03;
    const alongX = Math.cos(ang);
    const alongZ = Math.sin(ang);
    const put = (bw, bh, bd, along, y, nOff) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), frameMat);
      m.position.set(px + alongX * along + nx * nOff, y, pz + alongZ * along + nz * nOff);
      m.rotation.y = -ang;
      tag(m);
      house.add(m);
    };
    put(op.width + ft * 2, ft, depth, 0, y1, 0);
    put(op.width + ft * 2, ft, depth, 0, y0, 0);
    put(ft, op.height, depth, -(op.width / 2), midY, 0);
    put(ft, op.height, depth, op.width / 2, midY, 0);

    if (op.type === "window") {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.1, op.width - 0.04), Math.max(0.1, op.height - 0.04), 0.02),
        new THREE.MeshLambertMaterial({
          color: 0x8eacb8,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
        }),
      );
      glass.position.set(px, midY, pz);
      glass.rotation.y = -ang;
      tag(glass);
      house.add(glass);
      put(0.03, op.height - 0.04, 0.03, 0, midY, 0);
    }
  }

  function floorMesh(room, selected) {
    if (room.points.length < 3) return;
    const shape = new THREE.Shape();
    room.points.forEach((p, i) => {
      if (i === 0) shape.moveTo(p[0], p[1]);
      else shape.lineTo(p[0], p[1]);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, selected ? floorSel : floorMat);
    mesh.position.y = 0.01;
    mesh.receiveShadow = true;
    mesh.userData.roomId = room.id;
    house.add(mesh);
    roomMeshes.push(mesh);
  }

  const timber = new THREE.MeshLambertMaterial({ color: 0xc4a574 });
  const stumpMat = new THREE.MeshLambertMaterial({ color: 0x6b5344 });
  const bearerMat = new THREE.MeshLambertMaterial({ color: 0x5c4636 });
  const stepMat = new THREE.MeshLambertMaterial({ color: 0xd9cbb6 });

  function addDeck(deck, drop) {
    const r = normalizeDeck(deck);
    if (r.w < 0.05 || r.d < 0.05) return;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.08, r.d), timber);
    slab.position.set(r.x + r.w / 2, 0.04, r.z + r.d / 2);
    slab.receiveShadow = true;
    slab.castShadow = true;
    slab.userData.deckId = deck.id;
    house.add(slab);
    if (deck.kind === "veranda") {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(r.w, 0.05, r.d),
        new THREE.MeshLambertMaterial({ color: 0xefece4 }),
      );
      roof.position.set(r.x + r.w / 2, 2.35, r.z + r.d / 2);
      house.add(roof);
      for (const p of deckCorners(r)) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.35 + drop, 0.09), stumpMat);
        post.position.set(p[0], 2.35 / 2 - drop / 2, p[1]);
        house.add(post);
      }
    }
  }

  function addSteps(step) {
    const g = new THREE.Group();
    g.position.set(step.x, 0, step.z);
    g.rotation.y = -(step.rot || 0);
    g.userData.stepId = step.id;
    const rise = step.rise || 0.15;
    const going = step.going || 0.28;
    const count = step.count || 3;
    const width = step.width || 1.2;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, going - 0.01), Math.max(0.04, rise - 0.01), width), stepMat);
      mesh.position.set(going * (i + 0.5), -rise * (i + 0.5), 0);
      mesh.castShadow = true;
      g.add(mesh);
    }
    house.add(g);
  }

  function addStumps(stumps) {
    const rows = new Map();
    for (const s of stumps) {
      const drop = s.height || 0.45;
      const post = new THREE.Mesh(new THREE.BoxGeometry(s.size || 0.15, drop, s.size || 0.15), stumpMat);
      post.position.set(s.x, -drop / 2, s.z);
      post.castShadow = true;
      post.userData.stumpId = s.id;
      house.add(post);
      const k = s.z.toFixed(3);
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push(s);
    }
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      row.sort((a, b) => a.x - b.x);
      const span = row[row.length - 1].x - row[0].x;
      if (span < 0.2) continue;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.09, 0.07), bearerMat);
      beam.position.set((row[0].x + row[row.length - 1].x) / 2, -0.05, row[0].z);
      house.add(beam);
    }
  }

  function addArray(eq, drop, selected) {
    const w = Math.abs(Number(eq.w) || 0);
    const d = Math.abs(Number(eq.d) || 0);
    if (w < 0.05 || d < 0.05) return;
    const tilt = Math.min(Math.PI / 2, Math.max(0, ((Number(eq.tilt) || 0) * Math.PI) / 180));
    const azimuth = ((Number(eq.azimuth) || 0) * Math.PI) / 180;
    const base = eq.mount === "deck" ? 0.16 : eq.mount === "flat" ? -drop + 0.05 : -drop + 0.4;
    const g = new THREE.Group();
    g.position.set((Number(eq.x) || 0) + w / 2, base, (Number(eq.z) || 0) + d / 2);
    g.rotation.y = -azimuth;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.05, d),
      new THREE.MeshLambertMaterial({ color: selected ? 0x6ea894 : 0x1b3330 }),
    );
    panel.rotation.x = tilt;
    panel.position.y = Math.sin(tilt) * (d / 2);
    panel.castShadow = true;
    panel.receiveShadow = true;
    panel.userData.equipId = eq.id;
    g.userData.equipId = eq.id;
    g.add(panel);
    house.add(g);
  }

  function addEquipBox(eq, drop, selected) {
    const spec = EQUIP[eq.kind] || EQUIP.battery;
    const w = Math.max(0.1, Math.abs(Number(eq.w) || spec.w));
    const d = Math.max(0.1, Math.abs(Number(eq.d) || spec.d));
    const h = spec.h;
    const onSoil = eq.kind === "generator";
    const colors = { battery: 0x2f5d50, inverter: 0x2c2a28, charger: 0x3d6b4f, generator: 0x6b5344 };
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: selected ? 0x8fb9a4 : colors[eq.kind] || 0x2f5d50 }),
    );
    mesh.position.set((Number(eq.x) || 0) + w / 2, (onSoil ? -drop : 0) + h / 2, (Number(eq.z) || 0) + d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.equipId = eq.id;
    house.add(mesh);
  }

  function addEquipment(list, drop, selectedId) {
    for (const eq of list || []) {
      const selected = eq.id === selectedId;
      if (eq.kind === "array") addArray(eq, drop, selected);
      else addEquipBox(eq, drop, selected);
    }
  }

  function planBox(plan) {
    return sceneBounds(plan.walls, elementPoints(plan));
  }

  function rebuild(plan) {
    clearHouse();
    const stumps = plan.stumps || [];
    const drop = stumps.length ? Math.max(...stumps.map((s) => s.height || 0.45)) : 0;
    ground.position.y = -drop - 0.02;
    const b = planBox(plan);
    addGrid(b);
    if (stumps.length) addStumps(stumps);
    for (const deck of plan.decks || []) addDeck(deck, drop);
    for (const step of plan.steps || []) addSteps(step);
    const selWall = plan.selection?.kind === "wall" ? plan.selection.id : null;
    const selRoom = plan.selection?.kind === "room" ? plan.selection.id : selectedRoomId;
    for (const w of plan.walls) {
      const ops = plan.openings.filter((o) => o.wallId === w.id);
      wallMesh(w, ops, w.id === selWall);
    }
    for (const r of plan.rooms) {
      floorMesh(r, r.id === selRoom);
    }
    const selEq = plan.selection?.kind === "equipment" ? plan.selection.id : null;
    addEquipment(plan.equipment, drop, selEq);
    const selFurn = plan.selection?.kind === "furniture" ? plan.selection.id : null;
    for (const f of plan.furniture || []) {
      if (f.hidden) continue;
      addFurniture3d(THREE, house, f, f.id === selFurn);
    }
  }

  function fit(plan) {
    const b = planBox(plan);
    if (!b) {
      camera.position.set(12, 14, 16);
      controls.target.set(6, 0, 6);
      return;
    }
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const span = Math.max(b.w, b.h, 8);
    camera.position.set(cx + span * 0.85, span * 0.75, cz + span * 0.95);
    controls.target.set(cx, 0.4, cz);
    controls.update();
  }

  function topView(plan) {
    const b = planBox(plan);
    const cx = b ? (b.minX + b.maxX) / 2 : 6;
    const cz = b ? (b.minZ + b.maxZ) / 2 : 6;
    const span = b ? Math.max(b.w, b.h, 8) : 12;
    camera.position.set(cx, span * 1.6, cz + 0.05);
    controls.target.set(cx, 0, cz);
    controls.update();
  }

  function tick() {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  function pickHit(e) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(house.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData.furnId) return { kind: "furniture", id: o.userData.furnId };
        if (o.userData.equipId) return { kind: "equipment", id: o.userData.equipId };
        if (o.userData.openingId) return { kind: "opening", id: o.userData.openingId };
        if (o.userData.wallId) return { kind: "wall", id: o.userData.wallId };
        if (o.userData.roomId) return { kind: "room", id: o.userData.roomId };
        o = o.parent;
      }
    }
    return null;
  }

  let rightActive = false;
  let rightDrag = false;
  let rightAt = { x: 0, y: 0 };
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 2) return;
    rightActive = true;
    rightDrag = false;
    rightAt = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!rightActive || rightDrag) return;
    if (Math.hypot(e.clientX - rightAt.x, e.clientY - rightAt.y) > 5) rightDrag = true;
  });
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const dragged = rightDrag;
    rightActive = false;
    rightDrag = false;
    if (dragged || !onContext) return;
    const hit = pickHit(e);
    if (hit) onContext(hit, e.clientX, e.clientY);
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (!onRoomClick && !onFurnClick && !onEquipClick) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(house.children, true);
    if (!hits[0]) return;
    let o = hits[0].object;
    while (o && !o.userData.furnId && !o.userData.roomId && !o.userData.equipId) o = o.parent;
    if (o?.userData.furnId && onFurnClick) onFurnClick(o.userData.furnId);
    else if (o?.userData.equipId && onEquipClick) onEquipClick(o.userData.equipId);
    else if (o?.userData.roomId && onRoomClick) onRoomClick(o.userData.roomId);
  });

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);
  resize();
  tick();

  return {
    rebuild,
    fit,
    resize,
    topView,
    setOnRoomClick(fn) {
      onRoomClick = fn;
    },
    setOnFurnClick(fn) {
      onFurnClick = fn;
    },
    setOnEquipClick(fn) {
      onEquipClick = fn;
    },
    setOnContext(fn) {
      onContext = fn;
    },
    setSelectedRoom(id) {
      selectedRoomId = id;
    },
    exportGLTF() {
      return new Promise((resolve, reject) => {
        const exp = new GLTFExporter();
        exp.parse(
          house,
          (res) => resolve(res),
          (err) => reject(err),
          { binary: true },
        );
      });
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}

void wallLen;
