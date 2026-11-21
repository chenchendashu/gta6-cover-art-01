// cover.js — the Vice Frame cover engine.
//
// Everything a Vice Frame cover is made of lives here: the panel layouts,
// the colour grades (per-pixel gradient maps built from stop lists), the
// caption lettering, and the decorations (panel frames, the heat-star meter,
// the season badge, grain and vignette). renderCover() paints a whole cover
// onto any canvas at any size, so the editor's preview and the exported PNG
// are the same drawing at two scales.
//
// No Rockstar artwork, logo or font is used anywhere: the lettering is the
// SIL-OFL faces vendored under app/fonts/, and every shape is drawn here.

// ---------------------------------------------------------------- sizes

export const POST_SIZES = {
  square: { w: 1080, h: 1080, label: 'Square · 1080 × 1080' },
  portrait: { w: 1080, h: 1350, label: 'Portrait · 1080 × 1350' },
  wide: { w: 1920, h: 1080, label: 'Wide · 1920 × 1080' },
};

// ---------------------------------------------------------------- grades
// A grade is a gradient map (shadows -> highlights) blended over the photo
// after a saturation/contrast pass. The stops are the whole look: sunset
// runs plum -> magenta -> ember -> gold, neon runs ink -> deep sea -> hot
// pink -> ice.

export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    stops: [[0.0, '#160a2e'], [0.32, '#6d1a56'], [0.58, '#d63a4e'], [0.8, '#ff8438'], [1.0, '#ffd98c']],
    blend: 0.47, saturation: 1.3, contrast: 1.07,
  },
  neon: {
    label: 'Neon Nights',
    stops: [[0.0, '#040814'], [0.3, '#0a2c50'], [0.55, '#8c1d70'], [0.78, '#00b8c4'], [1.0, '#ffe6f6']],
    blend: 0.46, saturation: 1.38, contrast: 1.1,
  },
  gold: {
    label: 'Golden Hour',
    stops: [[0.0, '#1d0f04'], [0.35, '#6e3410'], [0.62, '#c97a24'], [0.85, '#f7b733'], [1.0, '#fff3c4']],
    blend: 0.44, saturation: 1.18, contrast: 1.05,
  },
  noir: {
    label: 'Midnight Noir',
    stops: [[0.0, '#05060a'], [0.4, '#232838'], [0.7, '#5d6a86'], [1.0, '#f2f5ff']],
    blend: 0.62, saturation: 0.72, contrast: 1.16,
  },
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Build the 256-entry lookup table for one grade once, then reuse it.
const lutCache = new Map();
export function gradeLut(grade) {
  if (lutCache.has(grade)) return lutCache.get(grade);
  const stops = GRADES[grade].stops.map(([at, hex]) => [at, hexToRgb(hex)]);
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0], b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const f = (t - a[0]) / Math.max(0.0001, b[0] - a[0]);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * f);
  }
  lutCache.set(grade, lut);
  return lut;
}

// Paint one photo into a fresh canvas of exactly w x h, cover-fitted with
// the panel's pan/zoom view, then run the grade's pixel pass over it.
export function gradedPhotoCanvas(img, w, h, view, gradeKey) {
  const out = document.createElement('canvas');
  out.width = Math.max(2, Math.round(w));
  out.height = Math.max(2, Math.round(h));
  const g = out.getContext('2d', { willReadFrequently: true });
  const grade = GRADES[gradeKey];

  if (img) {
    const scale = Math.max(out.width / img.naturalWidth, out.height / img.naturalHeight) * view.zoom;
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const slackX = Math.max(0, (dw - out.width) / 2);
    const slackY = Math.max(0, (dh - out.height) / 2);
    const dx = (out.width - dw) / 2 + view.panX * slackX;
    const dy = (out.height - dh) / 2 + view.panY * slackY;
    g.drawImage(img, dx, dy, dw, dh);
  } else {
    // An empty panel still gets the grade's own sunset, so a half-filled
    // cover already looks finished.
    const grad = g.createLinearGradient(0, out.height, 0, 0);
    const stops = GRADES[gradeKey].stops;
    for (const [at, hex] of stops) grad.addColorStop(at, hex);
    g.fillStyle = grad;
    g.fillRect(0, 0, out.width, out.height);
  }

  const lut = gradeLut(gradeKey);
  const blend = grade.blend, sat = grade.saturation, con = grade.contrast;
  const data = g.getImageData(0, 0, out.width, out.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], gg = px[i + 1], b = px[i + 2];
    // contrast around mid-grey, then saturation around the pixel's luma
    r = (r - 128) * con + 128; gg = (gg - 128) * con + 128; b = (b - 128) * con + 128;
    const luma = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    r = luma + (r - luma) * sat; gg = luma + (gg - luma) * sat; b = luma + (b - luma) * sat;
    const li = Math.max(0, Math.min(255, Math.round(luma))) * 3;
    px[i] = r + (lut[li] - r) * blend;
    px[i + 1] = gg + (lut[li + 1] - gg) * blend;
    px[i + 2] = b + (lut[li + 2] - b) * blend;
  }
  g.putImageData(data, 0, 0);
  return out;
}

// ---------------------------------------------------------------- layouts
// A layout is panels plus a title zone, all in fractions of the canvas.
// computeLayout turns them into pixels for a concrete canvas size.

function gridPanels(cols, rows, box, gapFrac) {
  const panels = [];
  const cw = (box.w - gapFrac * (cols - 1)) / cols;
  const ch = (box.h - gapFrac * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      panels.push({ x: box.x + c * (cw + gapFrac), y: box.y + r * (ch + gapFrac), w: cw, h: ch });
    }
  }
  return panels;
}

export const LAYOUTS = {
  poster: {
    label: 'Poster Grid',
    blurb: 'The classic collage: six framed panels under a big title.',
    build(aspect) {
      const titleH = aspect >= 1.4 ? 0.34 : aspect >= 0.9 ? 0.3 : 0.25;
      return {
        panels: gridPanels(3, 2, { x: 0.035, y: titleH + 0.03, w: 0.93, h: 0.97 - titleH - 0.03 }, 0.016),
        title: { x: 0.05, y: 0.03, w: 0.9, h: titleH - 0.03, align: 'left' },
      };
    },
  },
  duet: {
    label: 'Hero Duet',
    blurb: 'Two tall heroes side by side, title riding the bottom.',
    build() {
      return {
        panels: [
          { x: 0.03, y: 0.03, w: 0.455, h: 0.94 },
          { x: 0.515, y: 0.03, w: 0.455, h: 0.94 },
        ],
        title: { x: 0.08, y: 0.6, w: 0.84, h: 0.36, align: 'center' },
      };
    },
  },
  grid9: {
    label: 'Nine Lives',
    blurb: 'A full 3 × 3 wall of panels with the title plated in the middle.',
    build() {
      return {
        panels: gridPanels(3, 3, { x: 0.03, y: 0.03, w: 0.94, h: 0.94 }, 0.014),
        title: { x: 0.19, y: 0.36, w: 0.62, h: 0.28, align: 'center', plate: true },
      };
    },
  },
  strip: {
    label: 'Title Strip',
    blurb: 'A bold title column beside a 2 × 2 stack of scenes.',
    build() {
      return {
        panels: gridPanels(2, 2, { x: 0.375, y: 0.035, w: 0.59, h: 0.93 }, 0.016),
        title: { x: 0.045, y: 0.06, w: 0.3, h: 0.88, align: 'left' },
      };
    },
  },
};

export function computeLayout(layoutKey, w, h) {
  const frac = LAYOUTS[layoutKey].build(w / h);
  const px = (r) => ({ x: r.x * w, y: r.y * h, w: r.w * w, h: r.h * h });
  return { panels: frac.panels.map(px), title: { ...px(frac.title), align: frac.title.align, plate: !!frac.title.plate } };
}

// ---------------------------------------------------------------- lettering

const TITLE_FONT = '"Anton", "Arial Narrow", sans-serif';
const SCRIPT_FONT = '"Pacifico", cursive';
const KICKER_FONT = '"Anton", "Arial Narrow", sans-serif';

// Fit the whole caption block — kicker, title lines and script — into the
// zone: the face shrinks until the widest title line fits the width AND the
// stacked block fits the height, so no line is ever pushed off the cover.
function fitTitle(g, lines, box, caption) {
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `100px ${TITLE_FONT}`;
  const widestAt100 = Math.max(...lines.map((line) => g.measureText(line.toUpperCase()).width));
  const sizeForWidth = (100 * box.w) / Math.max(1, widestAt100);
  const heightFactor =
    0.98 * lines.length +
    (caption.script ? 0.34 * 1.25 : 0) +
    (caption.kicker ? 0.17 * 1.9 : 0);
  const sizeForHeight = box.h / heightFactor;
  return Math.max(12, Math.min(sizeForWidth, sizeForHeight));
}

export function drawTitleBlock(g, zone, caption, w, h) {
  const lines = caption.title.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return;
  const u = w / 1080; // a unit so strokes scale with the canvas

  if (zone.plate) {
    g.save();
    g.fillStyle = 'rgba(10, 4, 22, 0.82)';
    g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    g.lineWidth = 3 * u;
    const pad = 18 * u;
    g.beginPath();
    g.roundRect(zone.x - pad, zone.y - pad, zone.w + pad * 2, zone.h + pad * 2, 10 * u);
    g.fill();
    g.stroke();
    g.restore();
  } else {
    // a soft scrim so the lettering holds over busy photos
    const scrim = g.createLinearGradient(0, zone.y - zone.h * 0.25, 0, zone.y + zone.h * 1.15);
    scrim.addColorStop(0, 'rgba(8, 3, 18, 0)');
    scrim.addColorStop(0.45, 'rgba(8, 3, 18, 0.42)');
    scrim.addColorStop(1, 'rgba(8, 3, 18, 0)');
    g.fillStyle = scrim;
    g.fillRect(0, zone.y - zone.h * 0.25, w, zone.h * 1.4);
  }

  const size = fitTitle(g, lines, zone, caption);
  const lineH = size * 0.98;
  const scriptSize = caption.script ? size * 0.34 : 0;
  const kickerSize = caption.kicker ? size * 0.17 : 0;
  const blockH = lineH * lines.length + (scriptSize ? scriptSize * 1.25 : 0) + (kickerSize ? kickerSize * 1.9 : 0);
  let cursorY = zone.y + (zone.h - blockH) / 2;
  const alignX = zone.align === 'center' ? zone.x + zone.w / 2 : zone.x;
  g.textAlign = zone.align === 'center' ? 'center' : 'left';

  if (caption.kicker) {
    g.save();
    g.font = `${kickerSize}px ${KICKER_FONT}`;
    try { g.letterSpacing = `${kickerSize * 0.42}px`; } catch { /* older canvas: no tracking */ }
    g.fillStyle = '#ffd98c';
    g.shadowColor = 'rgba(0,0,0,0.65)';
    g.shadowBlur = 6 * u;
    g.shadowOffsetY = 2 * u;
    cursorY += kickerSize;
    g.fillText(caption.kicker.toUpperCase(), alignX, cursorY);
    g.restore();
    cursorY += kickerSize * 0.9;
  }

  // The title itself: a warm vertical gradient, a heavy dark outline and a
  // hard offset shadow, leaned a few degrees like a poster should.
  const grad = g.createLinearGradient(0, cursorY, 0, cursorY + lineH * lines.length);
  grad.addColorStop(0, '#fff8e2');
  grad.addColorStop(0.45, '#ffc46b');
  grad.addColorStop(0.78, '#ff5e7a');
  grad.addColorStop(1, '#e63d8f');
  g.save();
  g.font = `${size}px ${TITLE_FONT}`;
  g.lineJoin = 'round';
  g.strokeStyle = '#17081f';
  g.lineWidth = size * 0.16;
  g.shadowColor = 'rgba(10, 2, 20, 0.55)';
  g.shadowBlur = 0;
  g.shadowOffsetX = size * 0.045;
  g.shadowOffsetY = size * 0.06;
  const lean = -0.055;
  lines.forEach((line, i) => {
    const baseline = cursorY + size * 0.82 + i * lineH;
    g.save();
    g.translate(alignX, baseline);
    g.transform(1, 0, lean, 1, 0, 0);
    g.translate(-alignX, -baseline);
    g.strokeText(line.toUpperCase(), alignX, baseline);
    g.fillStyle = grad;
    g.fillText(line.toUpperCase(), alignX, baseline);
    g.restore();
  });
  g.restore();
  cursorY += lineH * lines.length;

  if (caption.script) {
    g.save();
    g.font = `${scriptSize}px ${SCRIPT_FONT}`;
    g.fillStyle = '#7df3ff';
    g.shadowColor = 'rgba(0, 229, 255, 0.8)';
    g.shadowBlur = 14 * u;
    cursorY += scriptSize * 1.15;
    g.fillText(caption.script, alignX, cursorY);
    g.restore();
  }
}

// ---------------------------------------------------------------- decorations

export function drawHeatStars(g, x, y, size, count) {
  // The five-star "heat" meter, top corner, gold on ink.
  g.save();
  for (let i = 0; i < 5; i++) {
    const cx = x + i * size * 1.18;
    const lit = i < count;
    g.beginPath();
    for (let p = 0; p < 10; p++) {
      const r = p % 2 === 0 ? size / 2 : size / 5;
      const a = -Math.PI / 2 + (p * Math.PI) / 5;
      const vx = cx + Math.cos(a) * r;
      const vy = y + Math.sin(a) * r;
      if (p === 0) g.moveTo(vx, vy); else g.lineTo(vx, vy);
    }
    g.closePath();
    g.fillStyle = lit ? '#ffc93c' : 'rgba(20, 10, 30, 0.55)';
    g.strokeStyle = lit ? '#7a4b00' : 'rgba(255,255,255,0.5)';
    g.lineWidth = size * 0.06;
    g.fill();
    g.stroke();
  }
  g.restore();
}

export function drawSeasonBadge(g, cx, cy, r) {
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(12, 5, 24, 0.88)';
  g.fill();
  g.lineWidth = r * 0.07;
  g.strokeStyle = '#ff5e7a';
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  g.lineWidth = r * 0.03;
  g.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#ffd98c';
  g.font = `${r * 0.42}px ${TITLE_FONT}`;
  g.fillText('VICE', cx, cy - r * 0.05);
  g.fillStyle = '#7df3ff';
  g.font = `${r * 0.3}px ${TITLE_FONT}`;
  g.fillText('SEASON', cx, cy + r * 0.32);
  g.restore();
}

let grainPattern = null;
function makeGrain(g) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const cg = c.getContext('2d');
  const img = cg.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  cg.putImageData(img, 0, 0);
  grainPattern = g.createPattern(c, 'repeat');
}

export function drawFinish(g, w, h) {
  // film grain, then a vignette to seat the edges
  if (!grainPattern) makeGrain(g);
  g.save();
  g.globalAlpha = 0.05;
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = grainPattern;
  g.fillRect(0, 0, w, h);
  g.restore();
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(5, 2, 12, 0.42)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

// A retro sun for the poster layout's title band: a gradient disc cut by
// slats painted in the backdrop's own gradient, the oldest trick on the
// coast. (Not destination-out: the exported PNG must stay fully opaque.)
export function drawSunDisc(g, cx, cy, r, gradeKey, backdropFill) {
  const stops = GRADES[gradeKey].stops;
  g.save();
  const grad = g.createLinearGradient(0, cy - r, 0, cy + r);
  grad.addColorStop(0, stops[4][1]);
  grad.addColorStop(0.55, stops[3][1]);
  grad.addColorStop(1, stops[2][1]);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.globalAlpha = 0.92;
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = backdropFill;
  const slatH = r * 0.07;
  for (let i = 0; i < 3; i++) {
    const y = cy + r * (0.12 + i * 0.26);
    g.fillRect(cx - r, y, r * 2, slatH * (1 + i * 0.45));
  }
  g.restore();
}

// ---------------------------------------------------------------- the cover

// opts: { w, h, layout, grade, panels: [{img, panX, panY, zoom}], caption:
// {title, script, kicker}, stars, badge }
export function renderCover(canvas, opts) {
  canvas.width = opts.w;
  canvas.height = opts.h;
  const g = canvas.getContext('2d');
  const { w, h } = opts;

  // backdrop: deep plum with a warm glow rising from the bottom edge
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#150826');
  bg.addColorStop(0.62, '#2a0f3d');
  bg.addColorStop(1, '#471336');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w / 2, h * 1.05, 10, w / 2, h * 1.05, w * 0.75);
  glow.addColorStop(0, 'rgba(255, 110, 64, 0.35)');
  glow.addColorStop(1, 'rgba(255, 110, 64, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  const layout = computeLayout(opts.layout, w, h);
  const frameW = Math.max(4, w * 0.007);

  if (opts.layout === 'poster') {
    drawSunDisc(g, w * 0.815, layout.title.y + layout.title.h * 0.52, w * 0.105, opts.grade, bg);
  }

  layout.panels.forEach((rect, i) => {
    const panel = opts.panels[i] || { img: null, panX: 0, panY: 0, zoom: 1 };
    const tile = gradedPhotoCanvas(panel.img, rect.w, rect.h, panel, opts.grade);
    g.drawImage(tile, rect.x, rect.y);
    // the white frame every panel of the genre wears, with a hairline of ink
    g.strokeStyle = '#f7f3ea';
    g.lineWidth = frameW;
    g.strokeRect(rect.x + frameW / 2, rect.y + frameW / 2, rect.w - frameW, rect.h - frameW);
    g.strokeStyle = 'rgba(10, 4, 18, 0.85)';
    g.lineWidth = Math.max(1.5, frameW * 0.22);
    const inset = frameW + Math.max(1, frameW * 0.2);
    g.strokeRect(rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2);
  });

  drawTitleBlock(g, layout.title, opts.caption, w, h);

  if (opts.stars > 0) {
    const size = w * 0.032;
    drawHeatStars(g, w - size * 6.1, size * 0.95, size, opts.stars);
  }
  if (opts.badge) {
    drawSeasonBadge(g, w * 0.945, h * 0.925, w * 0.042);
  }

  drawFinish(g, w, h);
}
