// Rendu 3D du produit avec Three.js (chargé depuis jsDelivr).
// Geometrie procedurale et textures generees : a remplacer par des .glb et des photos de matiere en production.
const Viewer = (() => {
  let el = null, renderer = null, scene = null, camera = null, root = null;
  let productGroup = null, mannequinGroup = null, decalGroup = null, floor = null;
  let ready = false, builtFor = null, geomKey = '', lastView = null, lastType = null;
  let texKnit = null, texRib = null, texLeather = null;
  const matCache = {};
  let rotY = 0, targetRotY = 0, camZ = 5.4, targetCamZ = 5.4, camY = 0, targetCamY = 0;
  let dragging = false, moved = false, lastX = 0, lastState = null;
  let raycaster = null, onSelect = () => {};

  const VIEW_ROT = { face: 0, dos: Math.PI, g34: -0.75, d34: 0.75, detail: 0 };
  const VIEW_CAM = { face: [5.4, 0], dos: [5.4, 0], g34: [5.4, 0], d34: [5.4, 0], detail: [2.6, 0.35] };

  const isLight = () => document.body.classList.contains('light');
  const BACK_HIDE = ['zip', 'poches', 'boutons'];
  const sliders = st => Object.fromEntries(st.spec.sliders.map(s => [s.id, s.value]));

  /* ---------- Textures et matieres ---------- */

  function canvasTex(drawFn, size, rep) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    drawFn(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    return t;
  }

  function makeTextures() {
    texKnit = canvasTex((g, s) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 8) for (let x = 0; x < s; x += 8) {
        const v = 100 + Math.random() * 60;
        g.strokeStyle = `rgb(${v},${v},${v})`;
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, y + 7); g.lineTo(x + 4, y + 1); g.lineTo(x + 8, y + 7); g.stroke();
      }
    }, 256, 3);
    texRib = canvasTex((g, s) => {
      for (let x = 0; x < s; x += 16) {
        const grd = g.createLinearGradient(x, 0, x + 16, 0);
        grd.addColorStop(0, '#3a3a3a'); grd.addColorStop(0.5, '#e0e0e0'); grd.addColorStop(1, '#3a3a3a');
        g.fillStyle = grd;
        g.fillRect(x, 0, 16, s);
      }
    }, 256, 4);
    texLeather = canvasTex((g, s) => {
      g.fillStyle = '#7a7a7a';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        const v = 90 + Math.random() * 70;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    }, 256, 2);
  }

  const MAT_PROPS = {
    'molleton': { roughness: 0.92, sheen: 0.6, sheenRoughness: 0.6, bump: 'knit', bumpScale: 0.6 },
    'maille épaisse': { roughness: 0.95, sheen: 0.4, sheenRoughness: 0.7, bump: 'rib', bumpScale: 0.8 },
    'coton lourd': { roughness: 0.85, sheen: 0.3, sheenRoughness: 0.7, bump: 'knit', bumpScale: 0.4 },
    'cuir mat': { roughness: 0.6, bump: 'leather', bumpScale: 0.25 },
    'cuir brillant': { roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15, bump: 'leather', bumpScale: 0.08 },
    'microfibre haute densité': { roughness: 0.5, sheen: 0.5, sheenRoughness: 0.4, bump: 'knit', bumpScale: 0.15 },
    'métal': { roughness: 0.3, metalness: 1, bump: null }
  };

  function applyMaterial(mat, zone, selected) {
    const p = MAT_PROPS[zone.material] || MAT_PROPS['molleton'];
    const key = zone.material;
    mat.color.set(zone.hex);
    mat.roughness = p.roughness;
    mat.metalness = p.metalness || 0;
    mat.sheen = p.sheen || 0;
    mat.sheenRoughness = p.sheenRoughness || 0.5;
    mat.clearcoat = p.clearcoat || 0;
    mat.clearcoatRoughness = p.clearcoatRoughness || 0;
    const bumpMap = p.bump === 'knit' ? texKnit : p.bump === 'rib' ? texRib : p.bump === 'leather' ? texLeather : null;
    if (mat.userData.bumpKey !== key) {
      mat.bumpMap = bumpMap;
      mat.userData.bumpKey = key;
      mat.needsUpdate = true;
    }
    mat.bumpScale = p.bumpScale || 0;
    mat.emissive.set(selected ? 0x3a3428 : 0x000000);
    mat.emissiveIntensity = selected ? 1 : 0;
  }

  function materialFor(zoneId) {
    if (!matCache[zoneId]) {
      matCache[zoneId] = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide });
    }
    return matCache[zoneId];
  }

  /* ---------- Geometrie ---------- */

  function poly(points) {
    const s = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    return s;
  }

  function extrude(shape, depth, zOffset = 0) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 14
    });
    g.translate(0, 0, -depth / 2 + zOffset);
    return g;
  }

  function rrShape(x0, y0, x1, y1, r) {
    const s = new THREE.Shape();
    s.moveTo(x0 + r, y0);
    s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
    s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
    s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
    s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
  }

  function stud(x, y, z) {
    return new THREE.SphereGeometry(0.035, 16, 12).scale(1, 1, 0.5).translate(x, y, z);
  }

  function buildVest(v) {
    const bx = 0.82 + v.boxy * 0.005;
    const bottom = -1.05 - (v.longueur - 55) * 0.006;
    const colH = 0.12 + v.col_hauteur * 0.0035;
    const G = {};
    G.corps = [extrude(poly([
      [-0.2, 0.98], [-0.6, 0.9], [-0.78, 0.5], [-bx, 0.2], [-bx, bottom],
      [bx, bottom], [bx, 0.2], [0.78, 0.5], [0.6, 0.9], [0.2, 0.98]
    ]), 0.14)];
    G.manches = [
      extrude(poly([[-0.6, 0.9], [-0.2, 0.98], [-0.2, 0.72], [-0.66, 0.66]]), 0.1, 0.08),
      extrude(poly([[0.6, 0.9], [0.2, 0.98], [0.2, 0.72], [0.66, 0.66]]), 0.1, 0.08)
    ];
    G.col = [extrude(poly([[-0.24, 0.98], [-0.22, 0.98 + colH], [0.22, 0.98 + colH], [0.24, 0.98]]), 0.12, 0.02)];
    G.bords = [extrude(poly([[-bx - 0.01, bottom], [bx + 0.01, bottom], [bx + 0.01, bottom + 0.1], [-bx - 0.01, bottom + 0.1]]), 0.16)];
    G.zip = [new THREE.BoxGeometry(0.03, 0.98 - bottom, 0.03).translate(0, (0.98 + bottom) / 2, 0.13)];
    // Poches plaquees : deux pieces en relief sur la hanche, avec rabat et bouton
    G.poches = [
      extrude(rrShape(-0.6, -0.45, -0.2, -0.12, 0.03), 0.04, 0.12),
      extrude(rrShape(0.2, -0.45, 0.6, -0.12, 0.03), 0.04, 0.12)
    ];
    // Boutons et pressions : un bouton par rabat, deux pressions sur le col
    G.boutons = [
      stud(-0.4, -0.16, 0.2), stud(0.4, -0.16, 0.2),
      stud(-0.1, 1.02 + colH * 0.5, 0.11), stud(0.1, 1.02 + colH * 0.5, 0.11)
    ];
    // Coutures apparentes : surpiqures sur le haut des poches et le bas du corps
    G.couture = [
      new THREE.BoxGeometry(0.4, 0.01, 0.01).translate(-0.4, -0.12, 0.17),
      new THREE.BoxGeometry(0.4, 0.01, 0.01).translate(0.4, -0.12, 0.17),
      new THREE.BoxGeometry(2 * bx - 0.1, 0.01, 0.01).translate(0, bottom + 0.1, 0.12)
    ];
    return G;
  }

  function buildGlove(v) {
    const pad = 0.9 + v.rembourrage * 0.003;
    const mh = 0.5 + v.longueur_manchette * 0.008;
    const G = {};
    G.coque = [new THREE.SphereGeometry(1, 64, 40).scale(0.66 * pad, 0.72 * pad, 0.6 * pad).translate(0, 0.2, 0)];
    G.pouce = [new THREE.CapsuleGeometry(0.17, 0.32, 12, 24).rotateZ(0.5).translate(-0.52, -0.05, 0.14)];
    G.paume = [new THREE.SphereGeometry(1, 48, 32).scale(0.5, 0.42, 0.42).translate(0.08, -0.2, 0.34)];
    G.manchette = [new THREE.CylinderGeometry(0.5, 0.56, mh, 48, 1, true).translate(0, -0.35 - mh / 2, 0)];
    // Scratch de fermeture : bande velcro autour du poignet
    G.scratch = [new THREE.CylinderGeometry(0.535, 0.535, 0.16, 48, 1, true).translate(0, -0.35 - mh * 0.35, 0)];
    // Coutures : surpiqure a la jonction coque / manchette
    G.couture = [new THREE.TorusGeometry(0.5, 0.012, 8, 64).rotateX(Math.PI / 2).translate(0, -0.35, 0)];
    return G;
  }

  /* ---------- Mannequin ---------- */

  function mannequinMaterial() {
    return new THREE.MeshStandardMaterial({ color: isLight() ? 0xcfcac2 : 0x2a2c31, roughness: 0.9 });
  }

  function buildMannequin(type) {
    mannequinGroup.clear();
    const m = mannequinMaterial();
    const add = (geo, x, y, z, rz = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rz;
      mesh.castShadow = true;
      mannequinGroup.add(mesh);
    };
    if (type === 'apparel') {
      add(new THREE.CapsuleGeometry(0.55, 1.2, 12, 24).scale(1, 1, 0.55), 0, -0.15, 0);
      add(new THREE.CylinderGeometry(0.16, 0.18, 0.3, 24), 0, 1.1, 0);
      add(new THREE.SphereGeometry(0.26, 32, 24).scale(0.9, 1.1, 0.95), 0, 1.42, 0);
      add(new THREE.CapsuleGeometry(0.14, 0.9, 8, 16), -0.85, 0.05, 0, 0.18);
      add(new THREE.CapsuleGeometry(0.14, 0.9, 8, 16), 0.85, 0.05, 0, -0.18);
    } else {
      add(new THREE.CylinderGeometry(0.4, 0.42, 1.6, 32), 0, -1.0, 0);
    }
  }

  /* ---------- Construction du produit ---------- */

  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
  }

  function rebuildProduct(st) {
    const key = st.type + '|' + JSON.stringify(sliders(st));
    if (key === geomKey && builtFor === st.type) return;
    geomKey = key;
    clearGroup(productGroup);
    const v = sliders(st);
    const G = st.type === 'apparel' ? buildVest(v) : buildGlove(v);
    Object.entries(G).forEach(([zoneId, geos]) => {
      geos.forEach(geo => {
        const mesh = new THREE.Mesh(geo, materialFor(zoneId));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.zone = zoneId;
        productGroup.add(mesh);
      });
    });
    if (builtFor !== st.type) buildMannequin(st.type);
    builtFor = st.type;
  }

  function updateZones(st) {
    st.spec.zones.forEach(z => {
      const selected = st.selected === z.id;
      productGroup.children.forEach(mesh => {
        if (mesh.userData.zone === z.id) {
          mesh.visible = !(st.type === 'apparel' && BACK_HIDE.includes(z.id) && lastView === 'dos');
        }
      });
      applyMaterial(materialFor(z.id), z, selected);
    });
  }

  function patchTexture(label) {
    return canvasTex((g, s) => {
      g.fillStyle = '#1a1a1d';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#c8b89a';
      g.lineWidth = 6;
      g.strokeRect(14, 14, s - 28, s - 28);
      g.fillStyle = '#EDEBE7';
      g.font = '500 44px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, s / 2, s / 2);
    }, 256, 1);
  }

  function rebuildDecals(st) {
    clearGroup(decalGroup);
    const isVest = st.type === 'apparel';
    st.assets.forEach(a => {
      const tex = a.img ? new THREE.CanvasTexture(a.img) : patchTexture('PATCH');
      const ratio = a.img ? a.img.naturalHeight / a.img.naturalWidth : 1;
      const w = a.size * 2.2;
      const geo = new THREE.PlaneGeometry(w, w * ratio);
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(a.x * 1.4, a.y * 1.6 + (isVest ? 0.3 : -0.1), isVest ? 0.2 : 0.66);
      mesh.visible = lastView !== 'dos';
      decalGroup.add(mesh);
    });
  }

  /* ---------- Vues, interaction, boucle ---------- */

  function setView(view) {
    targetRotY = VIEW_ROT[view] ?? 0;
    targetCamZ = VIEW_CAM[view][0];
    targetCamY = VIEW_CAM[view][1];
  }

  function resize() {
    if (!renderer) return;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function pick(clientX, clientY) {
    const r = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(productGroup.children, false);
    const zone = hits.length ? hits[0].object.userData.zone : null;
    if (zone) onSelect(zone);
  }

  function bindPointer() {
    el.addEventListener('pointerdown', e => { dragging = true; moved = false; lastX = e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      if (Math.abs(dx) > 3) moved = true;
      lastX = e.clientX;
      targetRotY += dx * 0.01;
      rotY = targetRotY;
    });
    el.addEventListener('pointerup', e => {
      dragging = false;
      if (!moved) pick(e.clientX, e.clientY);
    });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      targetCamZ = Math.min(7, Math.max(2.2, targetCamZ + e.deltaY * 0.004));
    }, { passive: false });
  }

  function animate() {
    requestAnimationFrame(animate);
    rotY += (targetRotY - rotY) * 0.12;
    root.rotation.y = rotY;
    camZ += (targetCamZ - camZ) * 0.12;
    camY += (targetCamY - camY) * 0.12;
    camera.position.set(0, camY, camZ);
    camera.lookAt(0, camY, 0);
    renderer.render(scene, camera);
  }

  function studioEnvironment() {
    const s = new THREE.Scene();
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#f4f1ea'); gr.addColorStop(0.5, '#8d8a84'); gr.addColorStop(1, '#1a1a1c');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    const bg = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide }));
    s.add(bg);
    const box = (x, y, z, w, h, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      s.add(m);
    };
    box(4, 3, 4, 3, 3, 3);
    box(-4, 2, 3, 2, 4, 1.5);
    return s;
  }

  function init(canvas, selectFn) {
    el = canvas;
    onSelect = selectFn;
    if (!window.THREE) {
      el.parentElement.insertAdjacentHTML('beforeend', '<p class="fallback">Le rendu 3D n\'a pas pu charger (CDN injoignable).</p>');
      return;
    }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(studioEnvironment(), 0.04).texture;

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2.5, 3, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-3, 1, 2);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.35));

    floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: isLight() ? 0.12 : 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.45;
    floor.receiveShadow = true;
    scene.add(floor);

    root = new THREE.Group();
    scene.add(root);
    productGroup = new THREE.Group();
    mannequinGroup = new THREE.Group();
    decalGroup = new THREE.Group();
    root.add(mannequinGroup, productGroup, decalGroup);

    makeTextures();
    raycaster = new THREE.Raycaster();
    bindPointer();
    new ResizeObserver(resize).observe(el);
    resize();
    ready = true;
    animate();
  }

  function draw(st) {
    lastState = st;
    if (!ready) return;
    if (st.view !== lastView) {
      lastView = st.view;
      setView(st.view);
    }
    rebuildProduct(st);
    updateZones(st);
    rebuildDecals(st);
    mannequinGroup.visible = st.context === 'mannequin';
    if (mannequinGroup.visible) {
      mannequinGroup.children.forEach(m => { m.material.color.set(isLight() ? 0xcfcac2 : 0x2a2c31); });
    }
    floor.material.opacity = isLight() ? 0.12 : 0.35;
  }

  function toBlob(cb) {
    if (!renderer) return cb(null);
    renderer.render(scene, camera);
    renderer.domElement.toBlob(cb, 'image/png');
  }

  return { init, draw, toBlob };
})();
