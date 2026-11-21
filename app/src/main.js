// main.js — the Vice Frame editor.
//
// Wires the page to the cover engine in cover.js: photo intake (files from
// the person's own machine, read locally and never uploaded, plus the two
// bundled samples), per-panel crop and position (drag on the canvas, a zoom
// slider, a photo picker per panel), layout and grade pickers, the caption
// fields, and one-click PNG export in the three common post sizes.
//
// The ?shot= modes exist so the app's maker can photograph it: ?shot=cover
// shows only the cover, ?shot=editor opens the editor with the demo cover
// loaded. Both wait for fonts and photos, render, then raise
// window.__shotReady.

import { POST_SIZES, GRADES, LAYOUTS, computeLayout, renderCover } from './cover.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  sizeKey: 'wide',
  layout: 'poster',
  grade: 'sunset',
  photos: [], // [{ img, name }]
  panels: [], // [{ photo, panX, panY, zoom }] — photo is an index into photos, -1 for none
  caption: {
    kicker: 'Welcome back to the neon coast',
    title: 'NEON\nCOAST',
    script: 'leonida nights',
  },
  stars: 5,
  badge: true,
  selected: 0,
};

const stage = $('#stage');

// ------------------------------------------------------------ panel bookkeeping

function panelCount() {
  const probe = computeLayout(state.layout, 100, 100);
  return probe.panels.length;
}

function ensurePanels() {
  const n = panelCount();
  while (state.panels.length < n) {
    const i = state.panels.length;
    state.panels.push({
      photo: state.photos.length ? i % state.photos.length : -1,
      panX: 0, panY: 0, zoom: 1,
    });
  }
  state.panels.length = n;
  if (state.selected >= n) state.selected = 0;
}

// ------------------------------------------------------------ rendering

function previewDims() {
  const { w, h } = POST_SIZES[state.sizeKey];
  const maxSide = 920;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

function coverOpts(w, h) {
  return {
    w, h,
    layout: state.layout,
    grade: state.grade,
    panels: state.panels.map((p) => ({
      img: p.photo >= 0 && state.photos[p.photo] ? state.photos[p.photo].img : null,
      panX: p.panX, panY: p.panY, zoom: p.zoom,
    })),
    caption: state.caption,
    stars: state.stars,
    badge: state.badge,
  };
}

function draw() {
  const { w, h } = previewDims();
  renderCover(stage, coverOpts(w, h));
  markSelectedPanel();
  renderPanelList();
}

// Outline the selected panel on top of the finished preview so the person
// can see which panel a drag will move. The export never draws this.
function markSelectedPanel() {
  const { w, h } = previewDims();
  const layout = computeLayout(state.layout, w, h);
  const rect = layout.panels[state.selected];
  if (!rect) return;
  const g = stage.getContext('2d');
  g.save();
  g.strokeStyle = '#37e0d8';
  g.lineWidth = 3;
  g.setLineDash([12, 8]);
  g.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
  g.restore();
}

// ------------------------------------------------------------ photos

function addPhoto(img, name) {
  state.photos.push({ img, name });
  // fill any panel still waiting for a photo
  state.panels.forEach((p, i) => { if (p.photo < 0) p.photo = i % state.photos.length; });
  renderPhotoList();
  syncPanelControls();
  draw();
}

function loadPhotoFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => addPhoto(img, file.name);
  img.src = url;
}

function loadSample(path, name) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { addPhoto(img, name); resolve(); };
    img.onerror = () => resolve();
    img.src = path;
  });
}

function renderPhotoList() {
  const list = $('#photo-list');
  list.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const li = document.createElement('li');
    const thumb = document.createElement('img');
    thumb.src = photo.img.src;
    thumb.alt = '';
    const label = document.createElement('span');
    label.textContent = photo.name;
    li.append(thumb, label);
    li.title = `Photo ${i + 1}: ${photo.name}`;
    list.append(li);
  });
  if (!state.photos.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No photos yet — add your own or use a sample.';
    list.append(li);
  }
}

// ------------------------------------------------------------ panels UI

function renderPanelList() {
  const list = $('#panel-list');
  if (!list) return;
  list.innerHTML = '';
  state.panels.forEach((panel, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel-chip' + (i === state.selected ? ' active' : '');
    btn.textContent = `Panel ${i + 1}`;
    btn.addEventListener('click', () => {
      state.selected = i;
      syncPanelControls();
      draw();
    });
    list.append(btn);
  });
}

function syncPanelControls() {
  const panel = state.panels[state.selected];
  if (!panel) return;
  const picker = $('#panel-photo');
  picker.innerHTML = '';
  const none = document.createElement('option');
  none.value = '-1';
  none.textContent = 'Sunset (no photo)';
  picker.append(none);
  state.photos.forEach((photo, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `Photo ${i + 1} · ${photo.name}`;
    picker.append(opt);
  });
  picker.value = String(panel.photo);
  $('#panel-zoom').value = String(panel.zoom);
  $('#panel-name').textContent = `Panel ${state.selected + 1}`;
}

// Drag on the canvas pans the selected panel's photo; a click without a
// drag selects the panel under the pointer first.
let drag = null;
stage.addEventListener('pointerdown', (ev) => {
  const rect = stage.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * stage.width;
  const y = ((ev.clientY - rect.top) / rect.height) * stage.height;
  const layout = computeLayout(state.layout, stage.width, stage.height);
  const hit = layout.panels.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  if (hit >= 0 && hit !== state.selected) {
    state.selected = hit;
    syncPanelControls();
  }
  drag = { x: ev.clientX, y: ev.clientY };
  stage.setPointerCapture(ev.pointerId);
});
stage.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const panel = state.panels[state.selected];
  if (!panel || panel.photo < 0) return;
  const rect = stage.getBoundingClientRect();
  panel.panX = clamp(panel.panX + ((ev.clientX - drag.x) / rect.width) * 2.4, -1, 1);
  panel.panY = clamp(panel.panY + ((ev.clientY - drag.y) / rect.height) * 2.4, -1, 1);
  drag = { x: ev.clientX, y: ev.clientY };
  draw();
});
stage.addEventListener('pointerup', () => { drag = null; });

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ------------------------------------------------------------ controls

function buildPickers() {
  const layoutBox = $('#layout-picker');
  Object.entries(LAYOUTS).forEach(([key, layout]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice' + (key === state.layout ? ' active' : '');
    btn.innerHTML = `<strong>${layout.label}</strong><small>${layout.blurb}</small>`;
    btn.addEventListener('click', () => {
      state.layout = key;
      layoutBox.querySelectorAll('.choice').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ensurePanels();
      syncPanelControls();
      draw();
    });
    layoutBox.append(btn);
  });

  const gradeBox = $('#grade-picker');
  Object.entries(GRADES).forEach(([key, grade]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice swatch' + (key === state.grade ? ' active' : '');
    const stops = grade.stops.map(([at, hex]) => `${hex} ${at * 100}%`).join(', ');
    btn.innerHTML = `<span class="chip" style="background: linear-gradient(90deg, ${stops})"></span><strong>${grade.label}</strong>`;
    btn.addEventListener('click', () => {
      state.grade = key;
      gradeBox.querySelectorAll('.choice').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      draw();
    });
    gradeBox.append(btn);
  });

  const sizeBox = $('#size-picker');
  Object.entries(POST_SIZES).forEach(([key, size]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice size' + (key === state.sizeKey ? ' active' : '');
    btn.textContent = size.label;
    btn.addEventListener('click', () => {
      state.sizeKey = key;
      sizeBox.querySelectorAll('.choice').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      draw();
    });
    sizeBox.append(btn);
  });
}

function bindControls() {
  $('#photo-input').addEventListener('change', (ev) => {
    [...ev.target.files].forEach(loadPhotoFile);
    ev.target.value = '';
  });
  $('#sample-boulevard').addEventListener('click', () => loadSample('samples/boulevard.jpg', 'boulevard.jpg'));
  $('#sample-pier').addEventListener('click', () => loadSample('samples/pier.jpg', 'pier.jpg'));

  $('#panel-photo').addEventListener('change', (ev) => {
    state.panels[state.selected].photo = Number(ev.target.value);
    draw();
  });
  $('#panel-zoom').addEventListener('input', (ev) => {
    state.panels[state.selected].zoom = Number(ev.target.value);
    draw();
  });
  $('#panel-reset').addEventListener('click', () => {
    Object.assign(state.panels[state.selected], { panX: 0, panY: 0, zoom: 1 });
    syncPanelControls();
    draw();
  });

  const caption = state.caption;
  $('#cap-kicker').addEventListener('input', (ev) => { caption.kicker = ev.target.value; draw(); });
  $('#cap-title').addEventListener('input', (ev) => { caption.title = ev.target.value; draw(); });
  $('#cap-script').addEventListener('input', (ev) => { caption.script = ev.target.value; draw(); });
  $('#cap-stars').addEventListener('input', (ev) => { state.stars = Number(ev.target.value); draw(); });
  $('#cap-badge').addEventListener('change', (ev) => { state.badge = ev.target.checked; draw(); });

  $('#export-btn').addEventListener('click', exportPng);
  $('#export-btn-2').addEventListener('click', exportPng);
}

function exportPng() {
  const { w, h } = POST_SIZES[state.sizeKey];
  const out = document.createElement('canvas');
  renderCover(out, coverOpts(w, h));
  out.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-frame-${state.sizeKey}-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

// ------------------------------------------------------------ demo & shot modes

async function loadDemo() {
  await loadSample('samples/boulevard.jpg', 'boulevard.jpg');
  await loadSample('samples/pier.jpg', 'pier.jpg');
  // A deliberate arrangement per layout, planned against the two sample
  // photos: faces lead (both sitters keep their faces in the upper third of
  // their frames, so the pans ride high), then the details trade down the
  // grid — the convertible's mirror, the reel, the belt and jeans, the sea.
  const arrangements = {
    poster: [
      { photo: 0, panX: 0, panY: 0.72, zoom: 1.0 },
      { photo: 1, panX: -0.1, panY: 0.72, zoom: 1.0 },
      { photo: 0, panX: 0.45, panY: -0.7, zoom: 1.6 },
      { photo: 1, panX: -0.6, panY: -0.5, zoom: 1.5 },
      { photo: 0, panX: 0.75, panY: 0.75, zoom: 1.5 },
      { photo: 1, panX: 0.7, panY: -0.5, zoom: 1.5 },
    ],
    duet: [
      { photo: 0, panX: 0, panY: 0.35, zoom: 1.0 },
      { photo: 1, panX: -0.05, panY: 0.35, zoom: 1.0 },
    ],
    grid9: [
      { photo: 0, panX: 0, panY: 0.7, zoom: 1.05 },
      { photo: 1, panX: -0.1, panY: 0.7, zoom: 1.05 },
      { photo: 0, panX: 0.6, panY: 0.8, zoom: 1.5 },
      { photo: 1, panX: -0.7, panY: -0.2, zoom: 1.4 },
      { photo: 0, panX: 0.6, panY: -0.6, zoom: 1.5 },
      { photo: 1, panX: 0.55, panY: -0.1, zoom: 1.35 },
      { photo: 0, panX: -0.3, panY: -0.75, zoom: 1.45 },
      { photo: 1, panX: 0.7, panY: -0.5, zoom: 1.5 },
      { photo: 0, panX: 0.75, panY: 0.3, zoom: 1.6 },
    ],
    strip: [
      { photo: 0, panX: 0, panY: 0.6, zoom: 1.1 },
      { photo: 1, panX: -0.1, panY: 0.6, zoom: 1.1 },
      { photo: 0, panX: 0.45, panY: -0.65, zoom: 1.5 },
      { photo: 1, panX: -0.6, panY: -0.45, zoom: 1.45 },
    ],
  };
  const arrangement = arrangements[state.layout] || arrangements.poster;
  state.panels = state.panels.map((p, i) => ({ ...p, ...(arrangement[i] || {}) }));
  draw();
}

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
      document.fonts.ready,
    ]);
  } catch { /* fall back to the sans stack */ }
}

async function init() {
  buildPickers();
  bindControls();
  ensurePanels();
  syncPanelControls();
  renderPhotoList();
  draw();

  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (params.get('layout') && LAYOUTS[params.get('layout')]) state.layout = params.get('layout');
  if (params.get('grade') && GRADES[params.get('grade')]) state.grade = params.get('grade');
  if (params.get('size') && POST_SIZES[params.get('size')]) state.sizeKey = params.get('size');
  if (params.get('title')) state.caption.title = params.get('title');
  if (params.get('script')) state.caption.script = params.get('script');
  if (params.get('kicker')) state.caption.kicker = params.get('kicker');
  if (params.get('stars')) state.stars = Number(params.get('stars'));

  if (shot) {
    await fontsReady();
    ensurePanels();
    await loadDemo();
    // reflect the shot's choices back into the (possibly hidden) controls
    $('#cap-title').value = state.caption.title;
    $('#cap-script').value = state.caption.script;
    $('#cap-kicker').value = state.caption.kicker;
    if (shot === 'cover') {
      document.body.classList.add('shot-cover');
      const { w, h } = POST_SIZES[state.sizeKey];
      renderCover(stage, coverOpts(w, h));
      stage.style.width = '100vw';
      stage.style.height = '100vh';
    } else {
      draw();
    }
    window.__shotReady = true;
    document.title = 'VICE FRAME READY';
  }
}

init();
