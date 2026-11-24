// Etat, interface, copilote (parseur local) et export du prototype.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEW_LABELS = { face: 'Face', dos: 'Dos', g34: '3/4 Gauche', d34: '3/4 Droit', detail: 'Détail' };
const ASSET_SLOTS = { manchette: [0, 0.34], coque: [0, -0.12], corps: [0.12, -0.02], bords: [0, 0.2], col: [0, -0.3] };
const CHIPS = {
  apparel: ['Passe le corps en noir mat', 'Rends la coupe plus boxy', 'Remonte le col', 'Ajoute mon patch sur les bords-côtes'],
  gear: ['Passe la coque en noir mat, le pouce en rouge', 'La manchette en cuir blanc', 'Ajoute mon patch sur le poignet', 'Ajoute du rembourrage']
};

const state = { type: 'apparel', view: 'face', context: 'isolated', selected: null, spec: null, assets: [], imageEl: null, messages: [] };

function freshSpec(type) {
  const b = BASES[type];
  return { zones: b.zones.map(z => ({ ...z })), sliders: b.sliders.map(s => ({ ...s })) };
}

function zoneOf(id) { return state.spec.zones.find(z => z.id === id); }
function zoneLabel(id) { const z = zoneOf(id); return z ? z.label : id; }
function draw() { Viewer.draw(state); setStatus(); }
function setStatus() {
  $('#status').textContent = `${BASES[state.type].name} · Vue ${VIEW_LABELS[state.view]} · ${state.context === 'isolated' ? 'Isolé' : 'Avec mannequin'} · ${state.spec.zones.length} zones`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
}

/* ---------- Rendu des panneaux ---------- */

function renderZones() {
  $('#zones').innerHTML = state.spec.zones.map(z => {
    const mats = [...new Set([z.material, ...MATERIALS])];
    return `
    <div class="zone ${state.selected === z.id ? 'sel' : ''}" data-zone="${z.id}">
      <div class="zone-head"><span class="swatch" style="background:${z.hex}"></span><strong>${esc(z.label)}</strong><span class="muted">${esc(z.material)}</span></div>
      <div class="zone-row">
        <input type="color" value="${z.hex}" data-hex="${z.id}" aria-label="Couleur ${esc(z.label)}">
        <span class="advanced-only"><input type="text" value="${z.hex}" maxlength="7" data-hextext="${z.id}" aria-label="Code HEX ${esc(z.label)}"></span>
        <select data-mat="${z.id}" aria-label="Matière ${esc(z.label)}">${mats.map(m => `<option ${m === z.material ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      </div>
    </div>`;
  }).join('');
}

function renderSliders() {
  $('#sliders').innerHTML = state.spec.sliders.map(s => `
    <div class="slider">
      <label><span>${esc(s.label)}</span><span data-val="${s.id}">${s.value}</span></label>
      <input type="range" min="${s.min}" max="${s.max}" value="${s.value}" data-slider="${s.id}">
    </div>`).join('');
}

function renderAssets() {
  const html = state.assets.map(a => `
    <div class="asset" data-asset="${a.id}">
      <div class="asset-head"><span>${esc(a.name)}</span><button class="linkbtn" data-remove="${a.id}">Retirer</button></div>
      <select data-kind="${a.id}" aria-label="Type">${['logo', 'patch', 'label'].map(k => `<option ${k === a.kind ? 'selected' : ''}>${k}</option>`).join('')}</select>
      ${[['x', 'Position X', -0.4, 0.4, 0.01], ['y', 'Position Y', -0.5, 0.5, 0.01], ['size', 'Taille', 0.05, 0.4, 0.01]].map(([k, l, mn, mx, st]) => `
      <div class="slider"><label><span>${l}</span></label><input type="range" min="${mn}" max="${mx}" step="${st}" value="${a[k]}" data-akey="${k}"></div>`).join('')}
    </div>`).join('');
  $('#assets').innerHTML = html || '<p class="muted small">Aucun logo ni patch. Importez un fichier ou demandez-le au copilote.</p>';
}

function renderChips() {
  $('#chips').innerHTML = CHIPS[state.type].map(c => `<button class="chip" data-prompt="${esc(c)}">${esc(c)}</button>`).join('');
}

function renderChat() {
  const box = $('#messages');
  box.innerHTML = state.messages.map(m => `<div class="msg ${m.role}">${esc(m.text)}${m.pre ? `<pre>${esc(m.pre)}</pre>` : ''}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}

function addMsg(role, text, pre) {
  state.messages.push({ role, text, pre });
  renderChat();
}

/* ---------- Bases, import, pipeline ---------- */

function setBase(type) {
  state.type = type;
  state.spec = freshSpec(type);
  state.selected = null;
  $$('#baseSeg button').forEach(b => b.classList.toggle('active', b.dataset.base === type));
  $('#baseDesc').textContent = `${BASES[type].name} : ${BASES[type].zones.map(z => z.label).join(', ')}.`;
  renderZones();
  renderSliders();
  renderChips();
  draw();
}

function loadImage(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.imageEl = img;
    const pv = $('#preview');
    pv.src = url;
    pv.hidden = false;
    const ri = $('#refImg');
    ri.innerHTML = '';
    const pi = document.createElement('img');
    pi.src = url;
    pi.alt = 'Photo de référence du produit';
    ri.appendChild(pi);
    $('#dropText').hidden = true;
    toast('Image importée');
  };
  img.src = url;
}

function loadAsset(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.assets.push({ id: uid(), name: file.name, kind: 'logo', img, x: 0, y: -0.1, size: 0.22 });
    renderAssets();
    draw();
    toast('Logo ajouté à la scène');
  };
  img.src = url;
  $('#logoInput').value = '';
}

function dominantColors(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data;
  const bins = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = (r + g + b) / 3;
    if (lum > 235 || lum < 25) continue;
    const key = [r, g, b].map(v => Math.min(255, Math.round(v / 32) * 32));
    const k = key.join(',');
    const e = bins.get(k) || { n: 0, c: key };
    e.n++;
    bins.set(k, e);
  }
  return [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map(e => '#' + e.c.map(v => v.toString(16).padStart(2, '0')).join(''));
}

function setStep(n, cls, text) {
  const li = $('#step-' + n);
  li.className = cls;
  li.querySelector('.step-state').textContent = text;
}

async function runPipeline() {
  const btn = $('#analyzeBtn');
  btn.disabled = true;
  state.spec = freshSpec(state.type);
  state.selected = null;
  ['1', '2', '3'].forEach(n => setStep(n, '', 'En attente'));
  const log = [];

  setStep('1', 'run', 'En cours');
  await sleep(700);
  setStep('1', 'done', 'Terminé');

  setStep('2', 'run', 'En cours');
  await sleep(900);
  if (state.imageEl) {
    const [main, second] = dominantColors(state.imageEl);
    const mainId = state.type === 'apparel' ? 'corps' : 'coque';
    const secId = state.type === 'apparel' ? 'bords' : 'manchette';
    if (main) { zoneOf(mainId).hex = main; log.push(`Couleur principale ${main} appliquée à ${zoneLabel(mainId)}.`); }
    if (second) { zoneOf(secId).hex = second; log.push(`Couleur secondaire ${second} appliquée à ${zoneLabel(secId)}.`); }
  } else {
    log.push('Aucune image importée : base 3D par défaut utilisée.');
  }
  log.push('Éclatement simulé localement : Claude Vision le remplacera en Phase 2.');
  setStep('2', 'done', 'Terminé');

  setStep('3', 'run', 'En cours');
  await sleep(500);
  renderZones();
  renderSliders();
  draw();
  setStep('3', 'done', 'Terminé');

  $('#analysisLog').innerHTML = log.map(l => `<div>${esc(l)}</div>`).join('');
  btn.disabled = false;
  toast('Pipeline terminé');
}

/* ---------- Copilote : parseur local (le LLM remplacera cette fonction en Phase 3) ---------- */

function buildMatcher() {
  const terms = [];
  const add = (t, kind, value) => terms.push({ t: t.toLowerCase(), kind, value });
  Object.entries(ZONE_ALIASES).forEach(([id, al]) => al.forEach(a => add(a, 'zone', id)));
  COLORS.forEach(([name, hex]) => add(name, 'color', { name, hex }));
  MATERIAL_TERMS.forEach(([t, v]) => add(t, 'material', v));
  KEYWORDS.forEach(([t, kind]) => add(t, kind, kind));
  const map = new Map();
  terms.forEach(x => { if (!map.has(x.t)) map.set(x.t, x); });
  const esc2 = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = [...map.keys()].sort((a, b) => b.length - a.length).map(esc2);
  const re = new RegExp('(?<!\\p{L})(' + keys.join('|') + ')(?!\\p{L})', 'giu');
  return { re, map };
}
const MATCH = buildMatcher();

function parseCommand(text) {
  const valid = BASES[state.type].zones.map(z => z.id);
  const hits = [...text.toLowerCase().matchAll(MATCH.re)]
    .map(m => MATCH.map.get(m[1].toLowerCase()))
    .filter(Boolean);
  const patches = [];
  let zone = null, colorDone = false, pendingPatch = false, pendingRaise = false;

  hits.forEach(({ kind, value }) => {
    if (kind === 'zone') {
      if (!valid.includes(value)) return;
      zone = value;
      colorDone = false;
      if (pendingPatch) { patches.push({ op: 'add_patch', zone }); pendingPatch = false; }
      if (pendingRaise && value === 'col') { patches.push({ op: 'slider', id: 'col_hauteur', delta: 20 }); pendingRaise = false; }
    } else if (kind === 'color') {
      if (zone && !colorDone) { patches.push({ op: 'set_color', zone, hex: value.hex, label: value.name }); colorDone = true; }
    } else if (kind === 'material') {
      if (zone) patches.push({ op: 'set_material', zone, material: value });
    } else if (kind === 'patch') {
      pendingPatch = true;
    } else if (kind === 'boxy' && state.type === 'apparel') {
      patches.push({ op: 'slider', id: 'boxy', delta: 20 });
    } else if (kind === 'raise') {
      pendingRaise = true;
    } else if (kind === 'pad' && state.type === 'gear') {
      patches.push({ op: 'slider', id: 'rembourrage', delta: 15 });
    }
  });
  if (pendingPatch && zone) patches.push({ op: 'add_patch', zone });
  return patches;
}

function applyPatches(patches) {
  const lines = [];
  patches.forEach(p => {
    if (p.op === 'set_color') {
      const z = zoneOf(p.zone);
      if (z) z.hex = p.hex;
      lines.push(`${zoneLabel(p.zone)} : ${p.label} (${p.hex})`);
    } else if (p.op === 'set_material') {
      const z = zoneOf(p.zone);
      if (z) z.material = p.material;
      lines.push(`${zoneLabel(p.zone)} : matière ${p.material}`);
    } else if (p.op === 'slider') {
      const s = state.spec.sliders.find(x => x.id === p.id);
      if (s) {
        s.value = clamp(s.value + p.delta, s.min, s.max);
        lines.push(`${s.label} : ${s.value}`);
      }
    } else if (p.op === 'add_patch') {
      const slot = ASSET_SLOTS[p.zone] || [0, 0];
      state.assets.push({ id: uid(), name: `Patch ${zoneLabel(p.zone)}`, kind: 'patch', img: null, x: slot[0], y: slot[1], size: 0.14 });
      lines.push(`Patch ajouté sur ${zoneLabel(p.zone)}`);
    }
  });
  return lines;
}

/* ---------- Export ---------- */

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function exportPack() {
  const base = BASES[state.type];
  const pack = {
    project: $('#project').value,
    product_type: state.type,
    category: base.name,
    generated_at: new Date().toISOString(),
    zones: state.spec.zones.map(({ id, label, hex, material }) => ({ id, label, hex, material })),
    sliders: state.spec.sliders.map(({ id, label, value }) => ({ id, label, value })),
    assets: state.assets.map(a => ({ asset_type: a.kind, name: a.name, placement: { x: a.x, y: a.y, size: a.size } })),
    specs_table: base.specs
  };
  download(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }), `techpack-${state.type}.json`);
  Viewer.toBlob(blob => download(blob, `techpack-${state.type}-vue.png`));
  toast('Dossier exporté (JSON et PNG). Le PDF multi-pages et le ZIP sont prévus en Phase 4.');
}

/* ---------- Evenements ---------- */

function bind() {
  $$('#baseSeg button').forEach(b => b.addEventListener('click', () => setBase(b.dataset.base)));

  $$('#viewSeg button').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    $$('#viewSeg button').forEach(x => x.classList.toggle('active', x === b));
    draw();
  }));

  $$('#ctxSeg button').forEach(b => b.addEventListener('click', () => {
    state.context = b.dataset.context;
    $$('#ctxSeg button').forEach(x => x.classList.toggle('active', x === b));
    draw();
  }));

  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    $('#tab-zones').hidden = t.dataset.tab !== 'zones';
    $('#tab-chat').hidden = t.dataset.tab !== 'chat';
  }));

  const dz = $('#dropzone');
  dz.addEventListener('dragover', e => e.preventDefault());
  dz.addEventListener('drop', e => { e.preventDefault(); loadImage(e.dataTransfer.files[0]); });
  $('#fileInput').addEventListener('change', e => loadImage(e.target.files[0]));
  $('#analyzeBtn').addEventListener('click', runPipeline);
  $('#logoInput').addEventListener('change', e => loadAsset(e.target.files[0]));
  $('#exportBtn').addEventListener('click', exportPack);
  $('#compareBtn').addEventListener('click', e => {
    const on = document.body.classList.toggle('compare');
    e.currentTarget.setAttribute('aria-pressed', on);
  });
  $('#themeBtn').addEventListener('click', e => {
    const light = document.body.classList.toggle('light');
    e.currentTarget.textContent = light ? 'Thème sombre' : 'Thème clair';
    e.currentTarget.setAttribute('aria-pressed', light);
    draw();
  });
  $('#advBtn').addEventListener('click', e => {
    const on = document.body.classList.toggle('adv');
    e.currentTarget.setAttribute('aria-pressed', on);
  });

  $('#zones').addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.hex) return;
    const z = zoneOf(t.dataset.hex);
    z.hex = t.value;
    const card = t.closest('.zone');
    card.querySelector('.swatch').style.background = t.value;
    card.querySelector('[data-hextext]').value = t.value;
    draw();
  });

  $('#zones').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.hextext) {
      const v = t.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) {
        zoneOf(t.dataset.hextext).hex = v.toLowerCase();
      } else {
        toast('Code HEX invalide (format #RRGGBB)');
      }
      renderZones();
      draw();
    }
    if (t.dataset.mat) {
      zoneOf(t.dataset.mat).material = t.value;
      renderZones();
      draw();
    }
  });

  $('#zones').addEventListener('click', e => {
    const card = e.target.closest('.zone');
    if (!card || e.target.matches('input, select')) return;
    state.selected = card.dataset.zone;
    renderZones();
    draw();
  });

  $('#sliders').addEventListener('input', e => {
    const t = e.target;
    const s = state.spec.sliders.find(x => x.id === t.dataset.slider);
    if (!s) return;
    s.value = +t.value;
    $(`[data-val="${s.id}"]`).textContent = s.value;
    draw();
  });

  $('#assets').addEventListener('input', e => {
    const t = e.target;
    const id = t.closest('[data-asset]') && t.closest('[data-asset]').dataset.asset;
    const a = state.assets.find(x => x.id === id);
    if (a && t.dataset.akey) { a[t.dataset.akey] = +t.value; draw(); }
  });

  $('#assets').addEventListener('change', e => {
    const t = e.target;
    const a = state.assets.find(x => x.id === t.dataset.kind);
    if (a) { a.kind = t.value; renderAssets(); }
  });

  $('#assets').addEventListener('click', e => {
    const id = e.target.dataset.remove;
    if (!id) return;
    state.assets = state.assets.filter(a => a.id !== id);
    renderAssets();
    draw();
  });

  $('#chips').addEventListener('click', e => {
    const p = e.target.dataset.prompt;
    if (!p) return;
    $('#chatInput').value = p;
    $('#chatForm').requestSubmit();
  });

  $('#chatForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#chatInput').value.trim();
    if (!text) return;
    $('#chatInput').value = '';
    addMsg('user', text);
    const patches = parseCommand(text);
    if (!patches.length) {
      addMsg('assistant', 'Je n\'ai pas reconnu de modification. Essayez par exemple : « passe la coque en noir mat » ou « rends la coupe plus boxy ».');
      return;
    }
    const lines = applyPatches(patches);
    renderZones();
    renderSliders();
    renderAssets();
    draw();
    addMsg('assistant', 'Patch appliqué à la scène :\n' + lines.map(l => '- ' + l).join('\n'), JSON.stringify({ patches }, null, 2));
  });
}

function init() {
  Viewer.init($('#viewer'), id => {
    state.selected = id;
    renderZones();
    draw();
  });
  setBase('apparel');
  renderAssets();
  addMsg('system', 'Copilote prêt. Décrivez un ajustement en français : le patch est appliqué à la scène.');
  bind();
}

init();
