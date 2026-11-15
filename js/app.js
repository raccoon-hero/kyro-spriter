/* Kyro's Spriter — app state, canvas interaction, sprite list and export. */
'use strict';

(() => {
  const $ = (s) => document.querySelector(s);
  const t = I18N.t;
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ───────────────────────── Settings ───────────────────────── */

  const DEFAULTS = {
    bgColor: [255, 255, 255], tolerance: 4, softness: 8, denoise: 1, smooth: 2, outline: 0, bgMode: 'edges', defringe: true,
    alphaThr: 20, gap: 0, split: 2, absorb: true, minSpeck: 24,
    grid: { by: 'count', cols: 4, rows: 4, cw: 64, ch: 64, ox: 0, oy: 0, sx: 0, sy: 0, skipEmpty: true },
    filter: { minW: '', minH: '', maxW: '', maxH: '' },
    exp: {
      scale: 1, pad: 0, format: 'png', prefix: 'sprite', trim: true, pixel: false, json: false,
      tg: { shape: 'square', margin: 0, outline: 0, outlineColor: [255, 255, 255] },
    },
    carve: true, sort: 'rows', lang: 'en',
  };
  const STORE_KEY = 'spritecutter.settings.v2';

  function merge(base, over) {
    for (const k of Object.keys(base)) {
      if (!(k in over)) continue;
      const b = base[k], o = over[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) merge(b, o || {});
      else if (Array.isArray(b) ? Array.isArray(o) : (typeof o === typeof b || (b === '' && typeof o === 'number'))) base[k] = o;
    }
    return base;
  }
  const settings = (() => {
    const d = structuredClone(DEFAULTS);
    try { return merge(d, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch { return d; }
  })();
  const saveSettings = debounce(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
  }, 300);

  /* ───────────────────────── State ───────────────────────── */

  let VER = 0;
  const S = {
    fileName: 'sprites',
    original: null, img: null, w: 0, h: 0, imgVer: 0,
    imgCanvas: document.createElement('canvas'),
    labels: null, compCount: 0, stats: null,
    compOwner: null, claim: null, claimBoxes: [],
    sprites: [], nextId: 1, suppress: [],
    info: new Map(), order: [], rows: [], indexOf: new Map(),
    selection: new Set(), hoverId: 0,
    tool: 'select', prevTool: 'select', mode: 'scan',
    view: { scale: 1, ox: 0, oy: 0 },
    bgLive: null,
  };

  const byId = (id) => S.sprites.find((s) => s.id === id);
  const newSprite = (kind, { comps = [], polys = [] } = {}) =>
    ({ id: S.nextId++, kind, comps, polys, name: null, edited: false, ver: ++VER });
  const touch = (s) => { s.ver = ++VER; s.edited = true; };
  const cloneSprites = (arr) => arr.map((s) => ({
    ...s, comps: s.comps.slice(), polys: s.polys.map((p) => ({ neg: p.neg, pts: p.pts.map((q) => q.slice()) })),
  }));

  /* ───────────────────────── Undo / redo ───────────────────────── */

  const undoStack = [], redoStack = [];
  const snap = () => ({
    img: S.img, labels: S.labels, compCount: S.compCount, stats: S.stats,
    sprites: cloneSprites(S.sprites), nextId: S.nextId, mode: S.mode,
    sel: [...S.selection], bgLive: S.bgLive, suppress: S.suppress.slice(),
  });
  function pushUndo() {
    if (!S.img) return;
    undoStack.push(snap());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
  }
  function applySnap(sn) {
    const imgChanged = sn.img !== S.img;
    Object.assign(S, {
      img: sn.img, labels: sn.labels, compCount: sn.compCount, stats: sn.stats,
      sprites: cloneSprites(sn.sprites), nextId: sn.nextId, mode: sn.mode, bgLive: sn.bgLive, suppress: sn.suppress.slice(),
    });
    S.selection = new Set(sn.sel);
    if (imgChanged) onImageChanged();
    updateModeUI();
    refresh();
  }
  function undo() {
    if (!undoStack.length) return;
    cancelDraft();
    redoStack.push(snap());
    applySnap(undoStack.pop());
    updateUndoButtons();
  }
  function redo() {
    if (!redoStack.length) return;
    cancelDraft();
    undoStack.push(snap());
    applySnap(redoStack.pop());
    updateUndoButtons();
  }
  function updateUndoButtons() {
    $('#btnUndo').disabled = !undoStack.length;
    $('#btnRedo').disabled = !redoStack.length;
  }
  /** For sliders: push one undo step per drag gesture. */
  let gestureArmed = false;
  const undoOncePerGesture = () => { if (!gestureArmed) { pushUndo(); gestureArmed = true; } };
  window.addEventListener('pointerup', () => { gestureArmed = false; });
  window.addEventListener('keyup', () => { gestureArmed = false; });

  /* ───────────────────────── Image loading ───────────────────────── */

  function loadImageEl(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
  }

  async function loadFile(file) {
    const looksLikeImage = file && (/^image\//.test(file.type) || /\.(png|apng|jpe?g|webp|gif|bmp|avif|svg)$/i.test(file.name || ''));
    if (!looksLikeImage) { toast(t('t_not_image'), { kind: 'warn' }); return; }
    const url = URL.createObjectURL(file);
    try {
      setImage(await loadImageEl(url), file.name || 'pasted.png');
    } catch {
      toast(t('t_cant_read'), { kind: 'warn' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function setImage(el, name) {
    const c = document.createElement('canvas');
    c.width = el.naturalWidth; c.height = el.naturalHeight;
    if (!c.width || !c.height) { toast(t('t_empty_img'), { kind: 'warn' }); return; }
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(el, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);

    cancelDraft();
    S.fileName = name.replace(/\.[^.]+$/, '') || 'sprites';
    S.original = data; S.img = data; S.w = data.width; S.h = data.height;
    S.sprites = []; S.selection.clear(); S.suppress = []; S.bgLive = null;
    S.labels = null; S.stats = null; S.compCount = 0;
    undoStack.length = 0; redoStack.length = 0; updateUndoButtons();
    thumbCache.clear(); tintCache.clear();

    $('#fileName').textContent = `${name} · ${S.w}×${S.h}`;
    $('#empty').classList.add('hidden');
    onImageChanged();
    fitView();
    detect();

    // Opaque image? Offer (or just do) background removal.
    hideBanner();
    if (ImageOps.transparentFraction(data) < 0.01) {
      const est = ImageOps.estimateBackground(data);
      if (est) {
        settings.bgColor = est.color;
        const tol = ImageOps.suggestTolerance(data, est.color, settings.denoise);
        if (tol != null) settings.tolerance = tol;
        updateBgUI(); saveSettings();
        if (est.uniformity > 0.8) {
          removeBg({ auto: true });
        } else {
          showBanner(
            t('banner_no_transparency', { swatch: `<span class="swatch" style="background:${rgbHex(est.color)}"></span>`, hex: rgbHex(est.color) }),
            t('remove_bg'), () => removeBg(),
          );
        }
      }
    }
  }

  function onImageChanged() {
    S.imgVer++;
    const c = S.imgCanvas;
    c.width = S.w; c.height = S.h;
    c.getContext('2d').putImageData(S.img, 0, 0);
    tintCache.clear();
    updateStatusSize();
  }

  /* ───────────────────────── Background removal ───────────────────────── */

  const bgOpts = (extra = {}) => ({
    color: settings.bgColor, tolerance: settings.tolerance, softness: settings.softness, outline: settings.outline,
    denoise: settings.denoise, smooth: settings.smooth,
    mode: settings.bgMode, defringe: settings.defringe, alphaThr: 8, ...extra,
  });

  function removeBg({ auto = false } = {}) {
    if (!S.img) return;
    pushUndo();
    const base = S.img;
    const r = ImageOps.removeBackground(base, bgOpts());
    S.img = r.image;
    S.bgLive = { base, result: r.image };
    onImageChanged();
    detect();
    hideBanner();
    // Lots of tiny fragments usually means sticker borders matched the background.
    const tiny = S.order.filter((s) => { const i = S.info.get(s.id); return Math.max(i.w, i.h) < 48; }).length;
    if (!settings.outline && S.order.length > 30 && tiny > S.order.length * 0.4) {
      showBanner(t('banner_fragments'),
        t('ring_6'), () => {
          settings.outline = 6; $('#outline').value = 6; $('#outlineOut').textContent = '6px'; saveSettings();
          liveBg();
        });
    }
    const pct = Math.round(r.cleared / (S.w * S.h) * 100);
    toast(auto ? t('t_bg_auto', { hex: rgbHex(settings.bgColor) }) : t('t_bg_removed', { pct }),
      { action: t('undo'), onAction: undo });
  }

  /** Re-run the last background removal from its base while sliders move. */
  const liveBg = debounce(() => {
    if (!S.bgLive || S.bgLive.result !== S.img) return;
    const r = ImageOps.removeBackground(S.bgLive.base, bgOpts());
    S.img = r.image;
    S.bgLive = { base: S.bgLive.base, result: r.image };
    onImageChanged();
    detect();
  }, 90);

  function magicErase(ix, iy) {
    const x = Math.floor(ix), y = Math.floor(iy);
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) return;
    const r = ImageOps.removeBackground(S.img, bgOpts({ mode: 'seed', seed: [x, y] }));
    if (!r.cleared) { toast(t('t_nothing_erase')); return; }
    pushUndo();
    S.img = r.image;
    S.bgLive = null;
    onImageChanged();
    detect();
  }

  function pickColor(ix, iy) {
    const x = Math.floor(ix), y = Math.floor(iy);
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) return;
    const i = (y * S.w + x) * 4, d = S.img.data;
    settings.bgColor = [d[i], d[i + 1], d[i + 2]];
    updateBgUI(); saveSettings();
    setTool(S.prevTool === 'pick' ? 'select' : S.prevTool);
    toast(t('t_bg_color_set', { hex: rgbHex(settings.bgColor) }), { action: t('remove_now'), onAction: () => removeBg() });
  }

  function resetImage() {
    if (!S.original || S.img === S.original) return;
    pushUndo();
    S.img = S.original; S.bgLive = null;
    onImageChanged();
    detect();
    toast(t('t_restored'), { action: t('undo'), onAction: undo });
  }

  /* ───────────────────────── Detection ───────────────────────── */

  function gridCells() {
    const g = settings.grid;
    let cols, rows, cw, ch;
    const ox = +g.ox || 0, oy = +g.oy || 0, sx = +g.sx || 0, sy = +g.sy || 0;
    if (g.by === 'count') {
      cols = Math.max(1, g.cols | 0); rows = Math.max(1, g.rows | 0);
      cw = (S.w - ox - sx * (cols - 1)) / cols;
      ch = (S.h - oy - sy * (rows - 1)) / rows;
    } else {
      cw = Math.max(1, +g.cw || 1); ch = Math.max(1, +g.ch || 1);
      cols = Math.max(1, Math.floor((S.w - ox + sx) / (cw + sx)));
      rows = Math.max(1, Math.floor((S.h - oy + sy) / (ch + sy)));
    }
    if (cw < 1 || ch < 1) return [];
    const cells = [];
    for (let r = 0; r < rows && cells.length < 4096; r++) {
      for (let c = 0; c < cols && cells.length < 4096; c++) {
        const x0 = Math.round(ox + c * (cw + sx)), y0 = Math.round(oy + r * (ch + sy));
        const x1 = Math.min(S.w, Math.round(ox + c * (cw + sx) + cw)), y1 = Math.min(S.h, Math.round(oy + r * (ch + sy) + ch));
        if (x1 > x0 && y1 > y0) cells.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
      }
    }
    return cells;
  }

  /**
   * (Re)build automatic sprites. Hand-drawn shapes are always kept; auto sprites
   * the user edited (merged, split, renamed, reshaped) are carried over too.
   */
  function detect() {
    if (!S.img) return;
    const manual = S.sprites.filter((s) => s.kind === 'manual');
    const oldStats = S.stats;
    let edited = [], auto = [];

    if (S.mode === 'scan') {
      const r = ImageOps.detect(S.img, {
        alphaThr: settings.alphaThr, gap: settings.gap, split: settings.split, absorb: settings.absorb, minSpeck: settings.minSpeck,
      });
      if (oldStats) {
        edited = S.sprites.filter((s) => s.kind === 'auto' && s.edited);
        for (const s of edited) {
          s.comps = [...new Set(s.comps.map((c) => (oldStats.rep[c] >= 0 ? r.labels[oldStats.rep[c]] : 0)).filter(Boolean))];
          s.ver = ++VER;
        }
        edited = edited.filter((s) => s.comps.length || s.polys.length);
      }
      const taken = new Set(edited.flatMap((s) => s.comps));
      const suppressed = new Set(S.suppress.map((p) => r.labels[p]).filter(Boolean));
      for (const g of r.groups) {
        const comps = g.comps.filter((c) => !taken.has(c));
        if (!comps.length || comps.some((c) => suppressed.has(c))) continue;
        auto.push(newSprite('auto', { comps }));
      }
      S.labels = r.labels; S.compCount = r.count; S.stats = r.stats;
    } else {
      S.labels = null; S.compCount = 0; S.stats = null;
      auto = gridCells().map((pts) => newSprite('grid', { polys: [{ pts, neg: false }] }));
    }

    S.sprites = [...auto, ...edited, ...manual];
    refresh();
  }

  /* ───────────────────────── Ownership, info, ordering ───────────────────────── */

  function clipBox(x0, y0, x1, y1) {
    const x = Math.max(0, Math.floor(x0)), y = Math.max(0, Math.floor(y0));
    const xe = Math.min(S.w, Math.ceil(x1)), ye = Math.min(S.h, Math.ceil(y1));
    if (xe <= x || ye <= y) return null;
    return { x, y, w: xe - x, h: ye - y };
  }

  function rebuildOwnership() {
    S.compOwner = S.compCount ? new Int32Array(S.compCount + 1) : null;
    if (S.compOwner) for (const s of S.sprites) for (const c of s.comps) S.compOwner[c] = s.id;

    S.claim = null; S.claimBoxes = [];
    if (!settings.carve || !S.labels) return;
    const manual = S.sprites.filter((s) => s.kind === 'manual');
    for (const s of manual) {
      for (const p of s.polys) {
        if (p.neg) continue;
        const b = ImageOps.polyBounds(p.pts);
        const box = clipBox(b.x0, b.y0, b.x1, b.y1);
        if (!box) continue;
        if (!S.claim) S.claim = new Int32Array(S.w * S.h);
        const cov = ImageOps.rasterizePolys([p.pts], box.x, box.y, box.w, box.h);
        for (let yy = 0; yy < box.h; yy++) {
          const row = (box.y + yy) * S.w + box.x;
          for (let xx = 0; xx < box.w; xx++) if (cov[yy * box.w + xx] >= 128) S.claim[row + xx] = s.id;
        }
        S.claimBoxes.push(box);
      }
    }
  }

  /** Coverage mask (0–255) of a sprite over its candidate box. */
  function spriteMask(s) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const st = S.stats;
    if (s.comps.length && st) {
      for (const c of s.comps) {
        x0 = Math.min(x0, st.x0[c]); y0 = Math.min(y0, st.y0[c]);
        x1 = Math.max(x1, st.x1[c] + 1); y1 = Math.max(y1, st.y1[c] + 1);
      }
    }
    const pos = [], neg = [];
    for (const p of s.polys) (p.neg ? neg : pos).push(p.pts);
    for (const pts of pos) {
      const b = ImageOps.polyBounds(pts);
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    const box = clipBox(x0, y0, x1, y1);
    if (!box) return null;
    const { x, y, w, h } = box;
    const cov = new Uint8ClampedArray(w * h);
    if (s.comps.length && S.labels) {
      const L = S.labels, own = S.compOwner, cl = S.claim, W = S.w, id = s.id;
      for (let yy = 0; yy < h; yy++) {
        let p = (y + yy) * W + x;
        for (let xx = 0; xx < w; xx++, p++) {
          const l = L[p];
          if (l && own[l] === id && (!cl || cl[p] === 0 || cl[p] === id)) cov[yy * w + xx] = 255;
        }
      }
    }
    if (pos.length) {
      const pc = ImageOps.rasterizePolys(pos, x, y, w, h);
      for (let i = 0; i < cov.length; i++) if (pc[i] > cov[i]) cov[i] = pc[i];
    }
    if (neg.length) {
      const nc = ImageOps.rasterizePolys(neg, x, y, w, h);
      for (let i = 0; i < cov.length; i++) if (nc[i]) cov[i] = cov[i] * (255 - nc[i]) / 255;
    }
    return { x, y, w, h, cov };
  }

  const boxesIntersect = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  function computeInfo() {
    S.info.clear();
    const f = settings.filter;
    const thr = settings.alphaThr;
    const d = S.img.data;
    for (const s of S.sprites) {
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, area = 0;
      const st = S.stats;
      let fast = s.comps.length && !s.polys.length && st;
      if (fast) {
        for (const c of s.comps) {
          x0 = Math.min(x0, st.x0[c]); y0 = Math.min(y0, st.y0[c]);
          x1 = Math.max(x1, st.x1[c] + 1); y1 = Math.max(y1, st.y1[c] + 1);
          area += st.area[c];
        }
        const bb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        if (S.claimBoxes.some((cb) => boxesIntersect(cb, bb))) fast = false;
      }
      if (!fast) {
        x0 = Infinity; y0 = Infinity; x1 = -1; y1 = -1; area = 0;
        const m = spriteMask(s);
        if (m) {
          for (let yy = 0; yy < m.h; yy++) {
            for (let xx = 0; xx < m.w; xx++) {
              if (m.cov[yy * m.w + xx] < 128) continue;
              if (d[((m.y + yy) * S.w + m.x + xx) * 4 + 3] <= thr) continue;
              area++;
              const X = m.x + xx, Y = m.y + yy;
              if (X < x0) x0 = X; if (X >= x1) x1 = X + 1;
              if (Y < y0) y0 = Y; if (Y >= y1) y1 = Y + 1;
            }
          }
          if (!area) { x0 = m.x; y0 = m.y; x1 = m.x + m.w; y1 = m.y + m.h; }
        } else { x0 = y0 = 0; x1 = y1 = 0; }
      }
      const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
      let hidden = false;
      if (s.kind === 'auto' && !s.polys.length) {
        // Leftover slivers after a hand-drawn shape took most of a sprite are hidden.
        let full = 0;
        if (st) for (const c of s.comps) full += st.area[c];
        hidden = area < Math.max(1, settings.minSpeck, fast ? 0 : full * 0.08);
      }
      else if (s.kind === 'grid') hidden = settings.grid.skipEmpty && area === 0;
      const filtered = !hidden && (
        (f.minW !== '' && w < f.minW) || (f.minH !== '' && h < f.minH) ||
        (f.maxW !== '' && w > f.maxW) || (f.maxH !== '' && h > f.maxH));
      S.info.set(s.id, { x0, y0, x1, y1, w, h, area, hidden, filtered });
    }
  }

  function groupRows(list) {
    if (!list.length) return [];
    const items = list.map((s) => ({ s, i: S.info.get(s.id) }));
    const hs = items.map((it) => it.i.h).sort((a, b) => a - b);
    const med = hs[hs.length >> 1] || 1;
    // Each sprite gets a vertical "band": its middle half. Unusually tall sprites
    // (e.g. a full-body character spanning two rows) use a band at their top instead
    // and are placed afterwards, so they don't glue two rows together.
    const normal = [], tall = [];
    for (const it of items) {
      const { y0, y1, h } = it.i;
      if (items.length > 2 && h > med * 1.8) { it.b0 = y0; it.b1 = y0 + med; tall.push(it); }
      else { it.b0 = y0 + h * 0.25; it.b1 = y1 - h * 0.25; normal.push(it); }
    }
    normal.sort((a, b) => a.b0 - b.b0);
    const rows = [];
    let cur = null;
    for (const it of normal) {
      if (cur && it.b0 <= cur.b1) { cur.items.push(it); cur.b1 = Math.max(cur.b1, it.b1); }
      else { cur = { items: [it], b0: it.b0, b1: it.b1 }; rows.push(cur); }
    }
    for (const it of tall) {
      let best = null, bestOv = 0;
      for (const r of rows) {
        const ov = Math.min(it.b1, r.b1) - Math.max(it.b0, r.b0);
        if (ov > bestOv) { best = r; bestOv = ov; }
      }
      if (best) best.items.push(it); else rows.push({ items: [it], b0: it.b0, b1: it.b1 });
    }
    rows.sort((a, b) => a.b0 - b.b0);
    return rows.map((r) => r.items.sort((a, b) => a.i.x0 - b.i.x0).map((it) => it.s));
  }

  function computeOrder() {
    const vis = S.sprites.filter((s) => { const i = S.info.get(s.id); return !i.hidden && !i.filtered; });
    let rows = groupRows(vis);
    let order = rows.flat();
    if (settings.sort === 'size') {
      order = vis.slice().sort((a, b) => S.info.get(b.id).area - S.info.get(a.id).area);
      rows = [order];
    } else if (settings.sort === 'flat') rows = [order];
    S.order = order; S.rows = rows;
    S.indexOf = new Map(order.map((s, i) => [s.id, i + 1]));
  }

  function displayName(s) {
    if (s.name) return s.name;
    const idx = S.indexOf.get(s.id);
    const n = idx ? String(idx).padStart(String(S.order.length).length < 2 ? 2 : String(S.order.length).length, '0') : `x${s.id}`;
    return `${settings.exp.prefix || 'sprite'}_${n}`;
  }

  function refresh() {
    if (!S.img) return;
    S.selection = new Set([...S.selection].filter((id) => byId(id)));
    rebuildOwnership();
    computeInfo();
    computeOrder();
    renderList();
    renderSelbar();
    render();
  }

  /* ───────────────────────── Sprite rendering / export ───────────────────────── */

  /** Cut a sprite's pixels out of the sheet. Returns { canvas, srcX, srcY, w, h } or null. */
  function renderSprite(s, { trim = true, pad = 0 } = {}) {
    const m = spriteMask(s);
    if (!m) return null;
    const src = S.img.data, W = S.w, thr = settings.alphaThr;
    const out = new ImageData(m.w, m.h);
    const o = out.data;
    let tx0 = m.w, ty0 = m.h, tx1 = -1, ty1 = -1;
    for (let yy = 0; yy < m.h; yy++) {
      for (let xx = 0; xx < m.w; xx++) {
        const c = m.cov[yy * m.w + xx];
        if (!c) continue;
        const si = ((m.y + yy) * W + m.x + xx) * 4;
        const a = c === 255 ? src[si + 3] : src[si + 3] * c / 255;
        if (a < 1) continue;
        const di = (yy * m.w + xx) * 4;
        o[di] = src[si]; o[di + 1] = src[si + 1]; o[di + 2] = src[si + 2]; o[di + 3] = a;
        if (a > thr) {
          if (xx < tx0) tx0 = xx; if (xx > tx1) tx1 = xx;
          if (yy < ty0) ty0 = yy; if (yy > ty1) ty1 = yy;
        }
      }
    }
    let cx = 0, cy = 0, cw = m.w, ch = m.h;
    if (trim) {
      if (tx1 < 0) return null;
      cx = tx0; cy = ty0; cw = tx1 - tx0 + 1; ch = ty1 - ty0 + 1;
    }
    const c = document.createElement('canvas');
    c.width = cw + pad * 2; c.height = ch + pad * 2;
    c.getContext('2d').putImageData(out, pad - cx, pad - cy, cx, cy, cw, ch);
    return { canvas: c, srcX: m.x + cx, srcY: m.y + cy, w: cw, h: ch };
  }

  /**
   * Final export canvas.
   * target 'normal'   → original size with scale + padding.
   * target 'telegram' → fitted into 512 (square canvas, or longest side 512), with optional outline.
   */
  function exportCanvas(s, target = 'normal') {
    const e = settings.exp;
    const tgMode = target === 'telegram';
    const base = renderSprite(s, { trim: tgMode ? true : e.trim, pad: tgMode ? 0 : Math.max(0, e.pad | 0) });
    if (!base) return null;
    const draw = (W, H, src, dx, dy, dw, dh) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = !e.pixel;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, dx, dy, dw, dh);
      return c;
    };
    if (!tgMode) {
      const k = Math.max(1, e.scale | 0);
      const bw = base.canvas.width, bh = base.canvas.height;
      const canvas = k === 1 ? base.canvas : draw(bw * k, bh * k, base.canvas, 0, 0, bw * k, bh * k);
      return { canvas, src: base };
    }
    const t = e.tg;
    const T = 512;
    const margin = clamp(t.margin | 0, 0, 200);
    const R = clamp(t.outline | 0, 0, 64);
    const avail = Math.max(8, T - margin * 2 - R * 2);
    const k = Math.min(avail / base.w, avail / base.h);
    const dw = Math.max(1, Math.round(base.w * k)), dh = Math.max(1, Math.round(base.h * k));
    // Scaled sprite with room for the outline, outline drawn at final resolution.
    const pad = R + 1;
    let layer = draw(dw + pad * 2, dh + pad * 2, base.canvas, pad, pad, dw, dh);
    if (R > 0) {
      const g = layer.getContext('2d', { willReadFrequently: true });
      const id = g.getImageData(0, 0, layer.width, layer.height);
      g.putImageData(ImageOps.addOutline(id, R, t.outlineColor), 0, 0);
    }
    const ow = dw + R * 2, oh = dh + R * 2; // visible size incl. outline
    const canvas = document.createElement('canvas');
    if (t.shape === 'fit') { canvas.width = ow + margin * 2; canvas.height = oh + margin * 2; }
    else { canvas.width = T; canvas.height = T; }
    const ctx = canvas.getContext('2d');
    ctx.drawImage(layer, Math.round((canvas.width - ow) / 2) - 1, Math.round((canvas.height - oh) / 2) - 1);
    return { canvas, src: base };
  }

  function exportSizeLabel(info, target = 'normal') {
    const e = settings.exp;
    if (target === 'telegram') {
      if (e.tg.shape !== 'fit') return '512×512';
      const m = clamp(e.tg.margin | 0, 0, 200), R = clamp(e.tg.outline | 0, 0, 64);
      const k = (512 - 2 * m - 2 * R) / Math.max(info.w, info.h, 1);
      return `${Math.round(info.w * k) + 2 * (m + R)}×${Math.round(info.h * k) + 2 * (m + R)}`;
    }
    const k = Math.max(1, e.scale | 0), p = e.pad | 0;
    return `${(info.w + 2 * p) * k}×${(info.h + 2 * p) * k}`;
  }

  const toBlob = (canvas) => new Promise((res) => {
    const webp = settings.exp.format === 'webp';
    canvas.toBlob(res, webp ? 'image/webp' : 'image/png', webp ? 0.95 : undefined);
  });

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const safeName = (n) => n.replace(/[\/:*?"<>|\x00-\x1f]+/g, '_').trim() || 'sprite';

  /** Download sprites: one file directly, several as a ZIP. target: 'normal' | 'telegram'. */
  async function downloadSprites(list, zipBase, target = 'normal') {
    list = list.filter((s) => s && !S.info.get(s.id)?.hidden);
    if (!list.length) { toast(t('t_nothing_dl')); return; }
    const ext = settings.exp.format === 'webp' ? 'webp' : 'png';
    const tg = target === 'telegram';
    const suffix = tg ? '_tg' : '';
    let tooBig = 0;

    if (list.length === 1) {
      const r = exportCanvas(list[0], target);
      if (!r) { toast(t('t_sprite_empty')); return; }
      const blob = await toBlob(r.canvas);
      if (tg && blob.size > 512 * 1024) tooBig++;
      saveBlob(blob, `${safeName(displayName(list[0]))}${suffix}.${ext}`);
    } else {
      const busy = toast(t(tg ? 't_packing_tg' : 't_packing', { n: list.length }), { sticky: true });
      const used = new Map();
      const files = [], meta = [];
      for (const s of list) {
        const r = exportCanvas(s, target);
        if (!r) continue;
        let base = safeName(displayName(s));
        const n = (used.get(base) || 0) + 1;
        used.set(base, n);
        if (n > 1) base += `_${n}`;
        const blob = await toBlob(r.canvas);
        if (tg && blob.size > 512 * 1024) tooBig++;
        files.push({ name: `${base}.${ext}`, data: new Uint8Array(await blob.arrayBuffer()) });
        meta.push({ name: base, file: `${base}.${ext}`, x: r.src.srcX, y: r.src.srcY, w: r.src.w, h: r.src.h, outW: r.canvas.width, outH: r.canvas.height });
      }
      if (settings.exp.json) {
        const json = JSON.stringify({ image: S.fileName, width: S.w, height: S.h, sprites: meta }, null, 2);
        files.push({ name: `${safeName(S.fileName)}.json`, data: new TextEncoder().encode(json) });
      }
      saveBlob(Zip.build(files), `${zipBase}${tg ? '_telegram' : ''}.zip`);
      busy.remove();
      toast(t(tg ? 't_downloaded_tg' : 't_downloaded', { n: meta.length }));
    }
    if (tooBig) toast(t('t_too_big', { n: tooBig }), { kind: 'warn' });
  }

  /* ───────────────────────── Editing actions ───────────────────────── */

  function setSel(ids, { scrollList = true } = {}) {
    S.selection = new Set(ids);
    onSelChange(scrollList);
  }
  function toggleSel(id) {
    if (S.selection.has(id)) S.selection.delete(id); else S.selection.add(id);
    onSelChange(true);
  }
  function onSelChange(scrollList) {
    for (const el of $$('.card')) el.classList.toggle('sel', S.selection.has(+el.dataset.id));
    if (scrollList && S.selection.size) {
      const el = document.querySelector(`.card[data-id="${[...S.selection].at(-1)}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
    renderSelbar();
    render();
  }

  const selected = () => [...S.selection].map(byId).filter(Boolean);

  function deleteSelected() {
    const list = selected();
    if (!list.length) return;
    pushUndo();
    for (const s of list) {
      if (s.kind === 'auto' && s.comps.length && S.stats) S.suppress.push(S.stats.rep[s.comps[0]]);
    }
    const ids = new Set(list.map((s) => s.id));
    S.sprites = S.sprites.filter((s) => !ids.has(s.id));
    S.selection.clear();
    refresh();
    toast(t('t_removed', { n: list.length }), { action: t('undo'), onAction: undo });
  }

  function mergeSelected() {
    const list = selected();
    if (list.length < 2) return;
    pushUndo();
    const comps = list.flatMap((s) => s.comps);
    const polys = list.flatMap((s) => s.polys);
    const kind = comps.length ? 'auto' : list.every((s) => s.kind === 'grid') ? 'grid' : 'manual';
    const m = newSprite(kind, { comps, polys });
    m.name = list.find((s) => s.name)?.name || null;
    m.edited = true;
    const ids = new Set(list.map((s) => s.id));
    S.sprites = [...S.sprites.filter((s) => !ids.has(s.id)), m];
    S.selection = new Set([m.id]);
    refresh();
  }

  function splitSelected() {
    const list = selected().filter((s) => s.comps.length + s.polys.filter((p) => !p.neg).length > 1);
    if (!list.length) { toast(t('t_nothing_split')); return; }
    pushUndo();
    const newIds = [];
    for (const s of list) {
      const neg = s.polys.filter((p) => p.neg);
      const parts = [
        ...s.comps.map((c) => newSprite('auto', { comps: [c], polys: neg.map((p) => ({ ...p })) })),
        ...s.polys.filter((p) => !p.neg).map((p) => newSprite(s.kind === 'grid' ? 'grid' : 'manual', { polys: [p] })),
      ];
      for (const p of parts) { p.edited = true; newIds.push(p.id); }
      const i = S.sprites.indexOf(s);
      S.sprites.splice(i, 1, ...parts);
    }
    refresh();
    const visible = newIds.filter((id) => !S.info.get(id)?.hidden);
    setSel(visible);
    const hiddenSpecks = newIds.length - visible.length;
    toast(t('t_split', { n: visible.length }) + (hiddenSpecks ? ` (${t('t_split_specks', { n: hiddenSpecks })})` : ''));
  }

  function commitShape(pts, mods) {
    const sel = S.selection.size === 1 ? byId([...S.selection][0]) : null;
    pushUndo();
    if (mods.altKey && sel) {
      sel.polys.push({ pts, neg: true });
      touch(sel);
    } else if (mods.shiftKey && sel) {
      sel.polys.push({ pts, neg: false });
      touch(sel);
    } else {
      const s = newSprite('manual', { polys: [{ pts, neg: false }] });
      S.sprites.push(s);
      S.selection = new Set([s.id]);
    }
    refresh();
    onSelChange(true);
  }

  function setMode(mode) {
    if (mode === S.mode || !S.img) { S.mode = mode; updateModeUI(); return; }
    pushUndo();
    S.mode = mode;
    updateModeUI();
    detect();
  }

  /* ───────────────────────── Canvas view ───────────────────────── */

  const stage = $('#stage');
  const cvs = $('#view');
  const ctx = cvs.getContext('2d');
  let checker = null;
  function checkerPattern() {
    if (checker) return checker;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#26262c'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#303037'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
    checker = ctx.createPattern(c, 'repeat');
    return checker;
  }

  function fitView() {
    if (!S.img) return;
    const cw = cvs.clientWidth, ch = cvs.clientHeight - 26;
    const k = Math.min((cw - 48) / S.w, (ch - 48) / S.h, 8);
    S.view.scale = Math.max(0.02, k);
    S.view.ox = Math.round((cw - S.w * S.view.scale) / 2);
    S.view.oy = Math.round((ch - S.h * S.view.scale) / 2);
    updateZoomLabel();
    render();
  }
  function zoomAt(sx, sy, factor) {
    const k = S.view.scale, k2 = clamp(k * factor, 0.02, 64);
    S.view.ox = sx - (sx - S.view.ox) * (k2 / k);
    S.view.oy = sy - (sy - S.view.oy) * (k2 / k);
    S.view.scale = k2;
    updateZoomLabel();
    render();
  }
  const zoomCenter = (f) => zoomAt(cvs.clientWidth / 2, (cvs.clientHeight - 26) / 2, f);
  function zoomTo(k) { zoomCenter(k / S.view.scale); }
  function updateZoomLabel() { $('#zoomVal').textContent = `${Math.round(S.view.scale * 100)}%`; }

  function panToSprite(id) {
    const i = S.info.get(id);
    if (!i) return;
    const { scale: k, ox, oy } = S.view;
    const cw = cvs.clientWidth, ch = cvs.clientHeight - 26;
    const sx0 = ox + i.x0 * k, sy0 = oy + i.y0 * k, sx1 = ox + i.x1 * k, sy1 = oy + i.y1 * k;
    if (sx0 >= 0 && sy0 >= 0 && sx1 <= cw && sy1 <= ch) return;
    S.view.ox = cw / 2 - ((i.x0 + i.x1) / 2) * k;
    S.view.oy = ch / 2 - ((i.y0 + i.y1) / 2) * k;
    render();
  }

  const toScreen = (x, y) => [S.view.ox + x * S.view.scale, S.view.oy + y * S.view.scale];
  function evPos(e) {
    const r = cvs.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { sx, sy, ix: (sx - S.view.ox) / S.view.scale, iy: (sy - S.view.oy) / S.view.scale };
  }

  const tintCache = new Map();
  function tintFor(s) {
    const key = `${s.ver}|${S.imgVer}|${claimSig()}`;
    const hit = tintCache.get(s.id);
    if (hit && hit.key === key) return hit;
    const m = spriteMask(s);
    if (!m) return null;
    const c = document.createElement('canvas');
    c.width = m.w; c.height = m.h;
    const g = c.getContext('2d');
    const id = g.createImageData(m.w, m.h);
    const o = id.data, d = S.img.data, thr = settings.alphaThr;
    for (let yy = 0; yy < m.h; yy++) {
      for (let xx = 0; xx < m.w; xx++) {
        const i = yy * m.w + xx;
        if (m.cov[i] < 128 || d[((m.y + yy) * S.w + m.x + xx) * 4 + 3] <= thr) continue;
        o[i * 4] = 150; o[i * 4 + 1] = 100; o[i * 4 + 2] = 255; o[i * 4 + 3] = 80;
      }
    }
    g.putImageData(id, 0, 0);
    const t = { key, canvas: c, x: m.x, y: m.y, w: m.w, h: m.h };
    tintCache.set(s.id, t);
    return t;
  }

  let raf = 0;
  function render() { if (!raf) raf = requestAnimationFrame(draw); }

  const COLORS = {
    accent: '#9d6bff', auto: 'rgba(76,195,255,.85)', manual: '#ffb547', grid: 'rgba(255,255,255,.45)',
    filtered: 'rgba(160,160,175,.35)', neg: '#ff6b6b',
  };

  function tracePoly(pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => { const [a, b] = toScreen(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.closePath();
  }

  function draw() {
    raf = 0;
    const dpr = window.devicePixelRatio || 1;
    const cw = cvs.clientWidth, ch = cvs.clientHeight;
    if (cvs.width !== Math.round(cw * dpr) || cvs.height !== Math.round(ch * dpr)) {
      cvs.width = Math.round(cw * dpr); cvs.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (!S.img) return;
    const { scale: k, ox, oy } = S.view;

    ctx.fillStyle = checkerPattern();
    ctx.fillRect(ox, oy, S.w * k, S.h * k);
    ctx.imageSmoothingEnabled = k < 1.5;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.imgCanvas, ox, oy, S.w * k, S.h * k);
    ctx.imageSmoothingEnabled = true;

    const dragId = drag && (drag.type === 'vertex' || drag.type === 'move') ? drag.id : 0;

    // Selected-sprite pixel tint
    if (S.selection.size <= 40) {
      for (const id of S.selection) {
        if (id === dragId) continue;
        const s = byId(id);
        const t = s && tintFor(s);
        if (t) ctx.drawImage(t.canvas, ox + t.x * k, oy + t.y * k, t.w * k, t.h * k);
      }
    }

    // Outlines
    for (const s of S.sprites) {
      const inf = S.info.get(s.id);
      if (!inf || inf.hidden) continue;
      const sel = S.selection.has(s.id), hov = S.hoverId === s.id;
      const color = sel ? COLORS.accent : inf.filtered ? COLORS.filtered : COLORS[s.kind];
      ctx.lineWidth = sel ? 2 : 1;
      if (s.comps.length || !s.polys.length) {
        const [x, y] = toScreen(inf.x0, inf.y0);
        const w = inf.w * k, h = inf.h * k;
        if (hov && !sel) { ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(x, y, w, h); }
        ctx.strokeStyle = color;
        ctx.setLineDash(s.comps.length && s.polys.length ? [5, 3] : []);
        ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
      }
      for (const p of s.polys) {
        tracePoly(p.pts);
        if (!p.neg && hov && !sel) { ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill(); }
        ctx.setLineDash(p.neg ? [4, 3] : []);
        ctx.strokeStyle = p.neg ? COLORS.neg : color;
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Index badges
    ctx.font = '600 10px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'middle';
    for (const s of S.order) {
      const inf = S.info.get(s.id);
      if (inf.w * k < 16 || inf.h * k < 12) continue;
      const label = `#${S.indexOf.get(s.id)}`;
      const [x, y] = toScreen(inf.x0, inf.y0);
      const tw = ctx.measureText(label).width + 8;
      const by = y - 15 >= 0 ? y - 15 : y + 1;
      ctx.fillStyle = S.selection.has(s.id) ? COLORS.accent : 'rgba(10,10,14,.75)';
      ctx.fillRect(Math.round(x), Math.round(by), tw, 14);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, Math.round(x) + 4, Math.round(by) + 7.5);
    }

    // Vertex handles for the single selected shape
    const hs = handleSprite();
    if (hs) {
      for (const p of hs.polys) {
        for (const [x, y] of p.pts) {
          const [a, b] = toScreen(x, y);
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = p.neg ? COLORS.neg : COLORS.accent;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.rect(a - 3.5, b - 3.5, 7, 7); ctx.fill(); ctx.stroke();
        }
      }
    }

    // In-progress drawing
    ctx.lineWidth = 1.5;
    const draftColor = draftMods.altKey ? COLORS.neg : COLORS.accent;
    if (drag && (drag.type === 'rect' || drag.type === 'marquee')) {
      const [x0, y0] = toScreen(Math.min(drag.a[0], drag.b[0]), Math.min(drag.a[1], drag.b[1]));
      const [x1, y1] = toScreen(Math.max(drag.a[0], drag.b[0]), Math.max(drag.a[1], drag.b[1]));
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = drag.type === 'marquee' ? 'rgba(255,255,255,.7)' : draftColor;
      ctx.fillStyle = drag.type === 'marquee' ? 'rgba(255,255,255,.06)' : 'rgba(157,107,255,.1)';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
    }
    if (drag && drag.type === 'lasso' && drag.pts.length > 1) {
      tracePoly(drag.pts);
      ctx.fillStyle = 'rgba(157,107,255,.1)'; ctx.fill();
      ctx.strokeStyle = draftColor; ctx.stroke();
    }
    if (polyDraft) {
      const pts = [...polyDraft.pts, polyDraft.cur];
      ctx.beginPath();
      pts.forEach(([x, y], i) => { const [a, b] = toScreen(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
      ctx.strokeStyle = draftColor; ctx.stroke();
      if (pts.length > 2) {
        tracePoly(pts); ctx.fillStyle = 'rgba(157,107,255,.08)'; ctx.fill();
      }
      polyDraft.pts.forEach(([x, y], i) => {
        const [a, b] = toScreen(x, y);
        ctx.beginPath(); ctx.arc(a, b, i === 0 ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? COLORS.accent : '#fff'; ctx.fill();
      });
    }
  }

  /* ───────────────────────── Hit testing ───────────────────────── */

  function handleSprite() {
    if (S.selection.size !== 1 || S.tool !== 'select') return null;
    const s = byId([...S.selection][0]);
    return s && s.polys.length ? s : null;
  }

  function hitHandle(sx, sy) {
    const s = handleSprite();
    if (!s) return null;
    for (let pi = s.polys.length - 1; pi >= 0; pi--) {
      const pts = s.polys[pi].pts;
      for (let vi = 0; vi < pts.length; vi++) {
        const [a, b] = toScreen(pts[vi][0], pts[vi][1]);
        if (Math.abs(a - sx) <= 6 && Math.abs(b - sy) <= 6) return { id: s.id, pi, vi };
      }
    }
    return null;
  }

  function hitEdge(sx, sy) {
    const s = handleSprite();
    if (!s) return null;
    let best = null, bestD = 7;
    s.polys.forEach((p, pi) => {
      const pts = p.pts;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = toScreen(...pts[i]), [bx, by] = toScreen(...pts[(i + 1) % pts.length]);
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
        const t = clamp(((sx - ax) * dx + (sy - ay) * dy) / len2, 0, 1);
        const d = Math.hypot(ax + t * dx - sx, ay + t * dy - sy);
        if (d < bestD) { bestD = d; best = { s, pi, i }; }
      }
    });
    return best;
  }

  function hitSprite(ix, iy) {
    for (let i = S.sprites.length - 1; i >= 0; i--) {
      const s = S.sprites[i];
      if (!s.polys.length || S.info.get(s.id)?.hidden) continue;
      const inPos = s.polys.some((p) => !p.neg && ImageOps.pointInPoly(ix, iy, p.pts));
      if (inPos && !s.polys.some((p) => p.neg && ImageOps.pointInPoly(ix, iy, p.pts))) return s.id;
    }
    const x = Math.floor(ix), y = Math.floor(iy);
    if (S.labels && x >= 0 && y >= 0 && x < S.w && y < S.h) {
      const p = y * S.w + x;
      const l = S.labels[p];
      if (l) {
        const id = (S.claim && S.claim[p]) || S.compOwner[l];
        if (id && !S.info.get(id)?.hidden) return id;
      }
    }
    let best = 0, bestA = Infinity;
    for (const s of S.sprites) {
      const inf = S.info.get(s.id);
      if (!inf || inf.hidden) continue;
      if (ix >= inf.x0 && ix < inf.x1 && iy >= inf.y0 && iy < inf.y1 && inf.w * inf.h < bestA) {
        best = s.id; bestA = inf.w * inf.h;
      }
    }
    return best;
  }

  /* ───────────────────────── Pointer interaction ───────────────────────── */

  let drag = null;
  let polyDraft = null;
  let spaceDown = false;
  let draftMods = { shiftKey: false, altKey: false };
  const roundPt = (x, y) => [Math.round(x * 2) / 2, Math.round(y * 2) / 2];

  function cancelDraft() {
    polyDraft = null;
    if (drag && drag.type !== 'pan') drag = null;
    render();
  }

  function finishPoly(mods) {
    if (!polyDraft) return;
    const eps = 1 / S.view.scale;
    const pts = [];
    for (const p of polyDraft.pts) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) pts.push(p);
    }
    polyDraft = null;
    if (pts.length >= 3) commitShape(pts, mods); else render();
  }

  cvs.addEventListener('contextmenu', (e) => e.preventDefault());

  cvs.addEventListener('pointerdown', (e) => {
    if (!S.img) return;
    const { sx, sy, ix, iy } = evPos(e);
    draftMods = { shiftKey: e.shiftKey, altKey: e.altKey };
    if (e.button === 1 || (e.button === 0 && (spaceDown || S.tool === 'pan'))) {
      e.preventDefault();
      cvs.setPointerCapture(e.pointerId);
      drag = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: S.view.ox, oy: S.view.oy };
      stage.classList.add('dragging');
      return;
    }
    if (e.button === 2) {
      const h = S.tool === 'select' && hitHandle(sx, sy);
      if (h) {
        const s = byId(h.id), pts = s.polys[h.pi].pts;
        if (pts.length > 3) { pushUndo(); pts.splice(h.vi, 1); touch(s); refresh(); }
        else toast(t('t_min_points'));
      }
      return;
    }
    if (e.button !== 0) return;
    cvs.setPointerCapture(e.pointerId);

    switch (S.tool) {
      case 'select': {
        const h = hitHandle(sx, sy);
        if (h) { drag = { type: 'vertex', ...h, moved: false }; return; }
        const id = hitSprite(ix, iy);
        if (id) {
          if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleSel(id); return; }
          if (!S.selection.has(id) || S.selection.size > 1) setSel([id]);
          const s = byId(id);
          if (s.polys.length && !s.comps.length) drag = { type: 'move', id, last: [ix, iy], acc: [0, 0], moved: false };
        } else {
          if (!e.shiftKey) setSel([]);
          drag = { type: 'marquee', a: [ix, iy], b: [ix, iy], add: e.shiftKey };
        }
        return;
      }
      case 'rect': drag = { type: 'rect', a: [ix, iy], b: [ix, iy] }; return;
      case 'lasso': drag = { type: 'lasso', pts: [roundPt(ix, iy)], last: [sx, sy] }; return;
      case 'poly': {
        const p = roundPt(ix, iy);
        if (!polyDraft) { polyDraft = { pts: [p], cur: p }; render(); return; }
        const [fx, fy] = toScreen(...polyDraft.pts[0]);
        if (polyDraft.pts.length >= 3 && Math.hypot(fx - sx, fy - sy) < 9) { finishPoly(e); return; }
        polyDraft.pts.push(p);
        render();
        return;
      }
      case 'wand': magicErase(ix, iy); return;
      case 'pick': pickColor(ix, iy); return;
    }
  });

  cvs.addEventListener('pointermove', (e) => {
    if (!S.img) return;
    const { sx, sy, ix, iy } = evPos(e);
    updateStatusPixel(ix, iy);
    draftMods = { shiftKey: e.shiftKey, altKey: e.altKey };
    if (drag) {
      switch (drag.type) {
        case 'pan':
          S.view.ox = drag.ox + e.clientX - drag.sx;
          S.view.oy = drag.oy + e.clientY - drag.sy;
          break;
        case 'rect': case 'marquee': drag.b = [ix, iy]; break;
        case 'lasso':
          if (Math.hypot(sx - drag.last[0], sy - drag.last[1]) > 3) { drag.pts.push(roundPt(ix, iy)); drag.last = [sx, sy]; }
          break;
        case 'vertex': {
          if (!drag.moved) { pushUndo(); drag.moved = true; }
          const s = byId(drag.id);
          s.polys[drag.pi].pts[drag.vi] = roundPt(clamp(ix, 0, S.w), clamp(iy, 0, S.h));
          break;
        }
        case 'move': {
          drag.acc[0] += ix - drag.last[0]; drag.acc[1] += iy - drag.last[1];
          drag.last = [ix, iy];
          const dx = Math.trunc(drag.acc[0]), dy = Math.trunc(drag.acc[1]);
          if (dx || dy) {
            if (!drag.moved) { pushUndo(); drag.moved = true; }
            drag.acc[0] -= dx; drag.acc[1] -= dy;
            for (const p of byId(drag.id).polys) for (const q of p.pts) { q[0] += dx; q[1] += dy; }
          }
          break;
        }
      }
      render();
      return;
    }
    if (polyDraft) { polyDraft.cur = roundPt(ix, iy); render(); }
    if (S.tool === 'select') {
      const onHandle = !!hitHandle(sx, sy);
      stage.classList.toggle('on-handle', onHandle);
      const id = onHandle ? 0 : hitSprite(ix, iy);
      if (id !== S.hoverId) { S.hoverId = id; render(); }
    }
  });

  cvs.addEventListener('pointerleave', () => {
    if (S.hoverId) { S.hoverId = 0; render(); }
    $('#stPos').textContent = ''; $('#stPixel').innerHTML = '';
  });

  cvs.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove('dragging');
    const mods = { shiftKey: e.shiftKey, altKey: e.altKey };
    switch (d.type) {
      case 'rect': {
        const x0 = clamp(Math.floor(Math.min(d.a[0], d.b[0])), 0, S.w), x1 = clamp(Math.ceil(Math.max(d.a[0], d.b[0])), 0, S.w);
        const y0 = clamp(Math.floor(Math.min(d.a[1], d.b[1])), 0, S.h), y1 = clamp(Math.ceil(Math.max(d.a[1], d.b[1])), 0, S.h);
        if ((x1 - x0) * S.view.scale < 4 || (y1 - y0) * S.view.scale < 4) { render(); return; }
        commitShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], mods);
        return;
      }
      case 'lasso': {
        const pts = ImageOps.simplify(d.pts, Math.max(0.3, 1.2 / S.view.scale));
        if (pts.length >= 3) commitShape(pts, mods); else render();
        return;
      }
      case 'vertex': case 'move':
        if (d.moved) { touch(byId(d.id)); refresh(); } else render();
        return;
      case 'marquee': {
        const x0 = Math.min(d.a[0], d.b[0]), x1 = Math.max(d.a[0], d.b[0]);
        const y0 = Math.min(d.a[1], d.b[1]), y1 = Math.max(d.a[1], d.b[1]);
        if ((x1 - x0) * S.view.scale < 3 && (y1 - y0) * S.view.scale < 3) { render(); return; }
        const ids = S.sprites.filter((s) => {
          const i = S.info.get(s.id);
          return !i.hidden && i.x0 < x1 && i.x1 > x0 && i.y0 < y1 && i.y1 > y0;
        }).map((s) => s.id);
        setSel(d.add ? [...S.selection, ...ids] : ids);
        return;
      }
      default: render();
    }
  });

  cvs.addEventListener('dblclick', (e) => {
    if (!S.img) return;
    if (S.tool === 'poly' && polyDraft) { finishPoly(e); return; }
    if (S.tool === 'select') {
      const { sx, sy, ix, iy } = evPos(e);
      if (hitHandle(sx, sy)) return;
      const edge = hitEdge(sx, sy);
      if (edge) {
        pushUndo();
        edge.s.polys[edge.pi].pts.splice(edge.i + 1, 0, roundPt(ix, iy));
        touch(edge.s);
        refresh();
      }
    }
  });

  cvs.addEventListener('wheel', (e) => {
    if (!S.img) return;
    e.preventDefault();
    const { sx, sy } = evPos(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.shiftKey && !e.ctrlKey) {
      S.view.ox -= (e.deltaY || e.deltaX) * unit; render(); return;
    }
    zoomAt(sx, sy, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  new ResizeObserver(() => render()).observe(stage);

  /* ───────────────────────── Tools ───────────────────────── */



  function setTool(tool) {
    if (tool !== S.tool) { if (tool === 'pick') S.prevTool = S.tool; cancelDraft(); }
    S.tool = tool;
    stage.dataset.tool = tool;
    for (const b of $$('#rail [data-tool]')) b.classList.toggle('on', b.dataset.tool === tool);
    $('#stHint').textContent = t(`hint_${S.tool}`);
    stage.classList.remove('on-handle');
    render();
  }

  /* ───────────────────────── Sprite list ───────────────────────── */

  const thumbCache = new Map();
  const claimSig = () => (settings.carve ? S.sprites.filter((s) => s.kind === 'manual').map((s) => s.ver).join(',') : '-');

  function thumbFor(s) {
    const key = `${s.ver}|${S.imgVer}|${s.kind === 'auto' ? claimSig() : ''}|${settings.alphaThr}`;
    const hit = thumbCache.get(s.id);
    if (hit && hit.key === key) return hit.canvas;
    const r = renderSprite(s, { trim: true });
    const c = document.createElement('canvas');
    const SIZE = 144;
    if (r) {
      const k = Math.min(SIZE / r.w, SIZE / r.h, 6);
      c.width = Math.max(1, Math.round(r.w * k)); c.height = Math.max(1, Math.round(r.h * k));
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = k < 1;
      g.imageSmoothingQuality = 'high';
      g.drawImage(r.canvas, 0, 0, c.width, c.height);
    } else { c.width = c.height = 1; }
    thumbCache.set(s.id, { key, canvas: c });
    return c;
  }

  const ICON_DL = '<svg viewBox="0 0 24 24" class="ic"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 24 24" class="ic"><path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  const ICON_TG = '<svg viewBox="0 0 24 24" class="ic"><path d="M21.5 3.5 2.8 10.7c-.9.4-.9 1.6 0 1.9l4.6 1.6 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.5 4.9 3.6c.6.4 1.4.1 1.6-.6L22.9 4.8c.2-.9-.6-1.6-1.4-1.3z"/><path d="m7.4 14.2 9.8-6.7-6.9 7.9"/></svg>';
  const ICON_SEL = '<svg viewBox="0 0 24 24" class="ic"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5"/></svg>';

  function cardEl(s) {
    const inf = S.info.get(s.id);
    const el = document.createElement('div');
    el.className = 'card' + (S.selection.has(s.id) ? ' sel' : '');
    el.dataset.id = s.id;
    el.title = `${displayName(s)} — ${inf.w}×${inf.h}`;
    const th = document.createElement('div');
    th.className = 'thumb';
    th.append(thumbFor(s));
    el.append(th);
    el.insertAdjacentHTML('beforeend',
      `<span class="idx">${S.indexOf.get(s.id)}</span>${s.kind === 'manual' ? `<span class="tag" title="${t('tag_manual')}"></span>` : ''}` +
      `<div class="acts"><button data-act="dl" title="${t('dl_fmt', { fmt: settings.exp.format.toUpperCase() })}">${ICON_DL}</button><button data-act="tg" title="${t('dl_tg_card')}">${ICON_TG}</button><button data-act="del" title="${t('remove')}">${ICON_DEL}</button></div>`);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = displayName(s);
    const dm = document.createElement('div'); dm.className = 'dm'; dm.textContent = `${inf.w}×${inf.h}`;
    el.append(nm, dm);
    return el;
  }

  function renderList() {
    const list = $('#spriteList');
    list.innerHTML = '';
    list.classList.toggle('flat', settings.sort !== 'rows');
    $('#spriteCount').textContent = S.order.length;
    // drop stale thumbnails
    const live = new Set(S.sprites.map((s) => s.id));
    for (const id of thumbCache.keys()) if (!live.has(id)) thumbCache.delete(id);

    if (!S.order.length) {
      list.innerHTML = `<div class="sp-empty">${t(S.img ? 'list_empty_img' : 'list_empty')}</div>`;
    } else if (settings.sort === 'rows') {
      S.rows.forEach((row, r) => {
        const sec = document.createElement('div');
        sec.className = 'sp-row';
        sec.innerHTML = `<div class="sp-row-head"><b>${t('row_n', { n: r + 1 })}</b><span>${t('n_sprites', { n: row.length })}</span><span class="spacer"></span>` +
          `<button class="icon-btn sm" data-row-sel="${r}" title="${t('select_row')}">${ICON_SEL}</button>` +
          `<button class="icon-btn sm" data-row-dl="${r}" title="${t('dl_row')}">${ICON_DL}</button>` +
          `<button class="icon-btn sm" data-row-tg="${r}" title="${t('dl_row_tg')}">${ICON_TG}</button></div>`;
        const grid = document.createElement('div');
        grid.className = 'sp-grid';
        for (const s of row) grid.append(cardEl(s));
        sec.append(grid);
        list.append(sec);
      });
    } else {
      const grid = document.createElement('div');
      grid.className = 'sp-grid';
      for (const s of S.order) grid.append(cardEl(s));
      list.append(grid);
    }

    let filtered = 0;
    for (const i of S.info.values()) if (i.filtered) filtered++;
    $('#spFoot').textContent = filtered ? t('foot_filtered', { n: filtered }) : '';
  }

  $('#spriteList').addEventListener('click', (e) => {
    const rs = e.target.closest('[data-row-sel]');
    if (rs) { setSel(S.rows[+rs.dataset.rowSel].map((s) => s.id), { scrollList: false }); return; }
    const rd = e.target.closest('[data-row-dl]');
    if (rd) { const r = +rd.dataset.rowDl; downloadSprites(S.rows[r], `${safeName(S.fileName)}_row${r + 1}`); return; }
    const rt = e.target.closest('[data-row-tg]');
    if (rt) { const r = +rt.dataset.rowTg; downloadSprites(S.rows[r], `${safeName(S.fileName)}_row${r + 1}`, 'telegram'); return; }
    const card = e.target.closest('.card');
    if (!card) return;
    const id = +card.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'dl') { downloadSprites([byId(id)]); return; }
    if (act === 'tg') { downloadSprites([byId(id)], '', 'telegram'); return; }
    if (act === 'del') { setSel([id], { scrollList: false }); deleteSelected(); return; }
    if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSel(id);
    else { setSel([id], { scrollList: false }); panToSprite(id); }
  });
  $('#spriteList').addEventListener('dblclick', (e) => {
    if (e.target.closest('.card') && !e.target.closest('[data-act]')) { $('#selName').focus(); $('#selName').select(); }
  });

  function renderSelbar() {
    const list = selected();
    const bar = $('#selbar');
    if (!list.length || !S.img) { bar.classList.add('hidden'); renderTgPreview(); return; }
    bar.classList.remove('hidden');
    const s = list[0], inf = S.info.get(s.id);
    const pc = $('#selCanvas');
    const r = renderSprite(s, { trim: true });
    if (r) {
      const k = Math.min(192 / r.w, 192 / r.h, 8);
      pc.width = Math.max(1, Math.round(r.w * k)); pc.height = Math.max(1, Math.round(r.h * k));
      const g = pc.getContext('2d');
      g.imageSmoothingEnabled = k < 1; g.imageSmoothingQuality = 'high';
      g.drawImage(r.canvas, 0, 0, pc.width, pc.height);
    } else { pc.width = pc.height = 1; }

    const name = $('#selName');
    const ext = settings.exp.format.toUpperCase();
    if (list.length === 1) {
      name.disabled = false;
      if (document.activeElement !== name) name.value = displayName(s);
      const kind = t(`kind_${s.kind}`);
      $('#selMeta').innerHTML = `${t('sel_meta', { w: inf.w, h: inf.h, x: inf.x0, y: inf.y0, kind })}<br>${ext} ${exportSizeLabel(inf)} · Telegram ${exportSizeLabel(inf, 'telegram')}` +
        (inf.filtered ? `<br><span style="color:#d9a441">${t('hidden_filter')}</span>` : '');
      $('#selDlLabel').textContent = ext;
      $('#selTgLabel').textContent = t('telegram');
    } else {
      name.disabled = true;
      name.value = t('n_selected', { n: list.length });
      $('#selMeta').textContent = t('sel_multi_hint');
      $('#selDlLabel').textContent = `${ext} ZIP`;
      $('#selTgLabel').textContent = t('telegram_zip');
    }
    $('#btnMerge').disabled = list.length < 2;
    $('#btnSplit').disabled = !list.some((x) => x.comps.length + x.polys.filter((p) => !p.neg).length > 1);
    renderTgPreview();
  }

  /** Live preview of the selected (or first) sprite as a Telegram sticker. */
  function renderTgPreview() {
    const box = $('#tgPreview');
    const s = selected()[0] || S.order[0];
    const c = $('#tgPreviewCanvas');
    if (!s || !S.img) { box.classList.add('hidden'); return; }
    const r = exportCanvas(s, 'telegram');
    if (!r) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    c.width = r.canvas.width; c.height = r.canvas.height;
    c.getContext('2d').drawImage(r.canvas, 0, 0);
    $('#tgPreviewLabel').textContent = `${displayName(s)} · ${r.canvas.width}×${r.canvas.height}`;
  }

  $('#selName').addEventListener('change', (e) => {
    const list = selected();
    if (list.length !== 1) return;
    const v = e.target.value.trim();
    list[0].name = v || null;
    list[0].edited = true;
    renderList();
    renderSelbar();
  });
  $('#selName').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); });

  $('#btnSelDownload').addEventListener('click', () => {
    const list = selected();
    downloadSprites(list, `${safeName(S.fileName)}_selection`);
  });
  $('#btnSelTelegram').addEventListener('click', () => {
    downloadSprites(selected(), `${safeName(S.fileName)}_selection`, 'telegram');
  });
  $('#btnMerge').addEventListener('click', mergeSelected);
  $('#btnSplit').addEventListener('click', splitSelected);
  $('#btnDelete').addEventListener('click', deleteSelected);
  $('#btnDownloadAll').addEventListener('click', () => downloadSprites(S.order, `${safeName(S.fileName)}_sprites`));
  $('#btnDownloadAllTg').addEventListener('click', () => downloadSprites(S.order, `${safeName(S.fileName)}_sprites`, 'telegram'));

  /* ───────────────────────── Settings UI ───────────────────────── */

  const rgbHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  function updateBgUI() {
    $('#bgColor').value = rgbHex(settings.bgColor);
    $('#tolerance').value = settings.tolerance;
    $('#toleranceOut').textContent = `${settings.tolerance}%`;
  }

  const outputRefreshers = [];
  function bindRange(id, get, set, fmt, onInput) {
    const el = $('#' + id), out = $('#' + id + 'Out');
    el.value = get();
    if (out) out.textContent = fmt(get());
    if (out) outputRefreshers.push(() => { out.textContent = fmt(get()); });
    el.addEventListener('input', () => {
      set(+el.value);
      if (out) out.textContent = fmt(+el.value);
      saveSettings();
      onInput();
    });
  }
  function bindNum(id, get, set, onInput, { allowEmpty = false } = {}) {
    const el = $('#' + id);
    el.value = get();
    el.addEventListener('input', () => {
      if (el.value === '' && allowEmpty) set('');
      else if (el.value === '' || isNaN(+el.value)) return;
      else set(+el.value);
      saveSettings();
      onInput();
    });
  }
  function bindCheck(id, get, set, onChange) {
    const el = $('#' + id);
    el.checked = get();
    el.addEventListener('change', () => { set(el.checked); saveSettings(); onChange(); });
  }
  function bindSelect(id, get, set, onChange) {
    const el = $('#' + id);
    el.value = String(get());
    el.addEventListener('change', () => { set(el.value); saveSettings(); onChange(); });
  }

  // Background
  updateBgUI();
  $('#bgColor').addEventListener('input', (e) => { settings.bgColor = hexRgb(e.target.value); saveSettings(); liveBg(); });
  $('#btnAutoBg').addEventListener('click', () => {
    if (!S.img) return;
    const est = ImageOps.estimateBackground(S.bgLive?.base || S.img);
    if (!est) { toast(t('t_border_transparent')); return; }
    settings.bgColor = est.color;
    const tol = ImageOps.suggestTolerance(S.bgLive?.base || S.img, est.color, settings.denoise);
    if (tol != null) settings.tolerance = tol;
    updateBgUI(); saveSettings(); liveBg();
    toast(t('t_bg_guess', { hex: rgbHex(est.color), tol: settings.tolerance }));
  });
  $('#btnPickTool').addEventListener('click', () => setTool('pick'));
  bindRange('tolerance', () => settings.tolerance, (v) => { settings.tolerance = v; }, (v) => `${v}%`, () => liveBg());
  bindRange('softness', () => settings.softness, (v) => { settings.softness = v; }, (v) => `${v}%`, () => liveBg());
  bindRange('outline', () => settings.outline, (v) => { settings.outline = v; }, (v) => (v ? `${v}px` : t('off')), () => liveBg());
  bindRange('denoise', () => settings.denoise, (v) => { settings.denoise = v; }, (v) => (v ? `${v}px` : t('off')), () => liveBg());
  bindRange('smooth', () => settings.smooth, (v) => { settings.smooth = v; }, (v) => (v ? `${v}px` : t('off')), () => liveBg());
  bindSelect('bgMode', () => settings.bgMode, (v) => { settings.bgMode = v; }, () => liveBg());
  bindCheck('defringe', () => settings.defringe, (v) => { settings.defringe = v; }, () => liveBg());
  $('#btnRemoveBg').addEventListener('click', () => { if (S.img) removeBg(); else toast(t('t_open_first')); });
  $('#btnResetImg').addEventListener('click', resetImage);

  // Detection
  const redetect = debounce(() => { if (S.img && S.mode === 'scan') detect(); }, 120);
  const redetectUndoable = () => { if (S.img && S.mode === 'scan') { undoOncePerGesture(); redetect(); } };
  bindRange('gap', () => settings.gap, (v) => { settings.gap = v; }, (v) => `${v}px`, redetectUndoable);
  bindRange('split', () => settings.split, (v) => { settings.split = v; }, (v) => (v ? `${v}px` : t('off')), redetectUndoable);
  bindRange('alphaThr', () => settings.alphaThr, (v) => { settings.alphaThr = v; }, (v) => `${v}`, redetectUndoable);
  bindNum('minSpeck', () => settings.minSpeck, (v) => { settings.minSpeck = Math.max(0, v); }, redetectUndoable);
  bindCheck('absorb', () => settings.absorb, (v) => { settings.absorb = v; }, redetectUndoable);

  // Grid
  const regrid = debounce(() => { if (S.img && S.mode === 'grid') detect(); }, 120);
  const regridUndoable = () => { if (S.img && S.mode === 'grid') { undoOncePerGesture(); regrid(); } };
  const G = settings.grid;
  bindNum('gCols', () => G.cols, (v) => { G.cols = Math.max(1, v | 0); }, regridUndoable);
  bindNum('gRows', () => G.rows, (v) => { G.rows = Math.max(1, v | 0); }, regridUndoable);
  bindNum('gCw', () => G.cw, (v) => { G.cw = Math.max(1, v | 0); }, regridUndoable);
  bindNum('gCh', () => G.ch, (v) => { G.ch = Math.max(1, v | 0); }, regridUndoable);
  bindNum('gOx', () => G.ox, (v) => { G.ox = Math.max(0, v | 0); }, regridUndoable);
  bindNum('gOy', () => G.oy, (v) => { G.oy = Math.max(0, v | 0); }, regridUndoable);
  bindNum('gSx', () => G.sx, (v) => { G.sx = Math.max(0, v | 0); }, regridUndoable);
  bindNum('gSy', () => G.sy, (v) => { G.sy = Math.max(0, v | 0); }, regridUndoable);
  bindCheck('gSkipEmpty', () => G.skipEmpty, (v) => { G.skipEmpty = v; }, () => refresh());
  function updateGridBy() {
    for (const b of $$('#gridBySeg button')) b.classList.toggle('on', b.dataset.by === G.by);
    $('.by-count').classList.toggle('hidden', G.by !== 'count');
    $('.by-size').classList.toggle('hidden', G.by !== 'size');
  }
  $('#gridBySeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    G.by = b.dataset.by; saveSettings(); updateGridBy(); regridUndoable();
  });
  updateGridBy();

  // Manual / filter
  bindCheck('carve', () => settings.carve, (v) => { settings.carve = v; }, () => refresh());
  const F = settings.filter;
  for (const [id, key] of [['fMinW', 'minW'], ['fMinH', 'minH'], ['fMaxW', 'maxW'], ['fMaxH', 'maxH']]) {
    bindNum(id, () => F[key], (v) => { F[key] = v; }, () => refresh(), { allowEmpty: true });
  }

  // Export
  const E = settings.exp;
  bindSelect('expScale', () => E.scale, (v) => { E.scale = +v; }, () => renderSelbar());
  bindNum('expPad', () => E.pad, (v) => { E.pad = Math.max(0, v | 0); }, () => renderSelbar());
  const T = E.tg;
  const tgPreviewSoon = debounce(() => renderTgPreview(), 60);
  bindSelect('tgShape', () => T.shape, (v) => { T.shape = v; }, () => { renderSelbar(); });
  bindNum('tgMargin', () => T.margin, (v) => { T.margin = clamp(v | 0, 0, 200); }, () => renderSelbar());
  bindRange('tgOutline', () => T.outline, (v) => { T.outline = v; }, (v) => (v ? `${v}px` : t('off')), tgPreviewSoon);
  $('#tgOutline').addEventListener('change', () => renderSelbar());
  $('#tgOutlineColor').value = rgbHex(T.outlineColor);
  $('#tgOutlineColor').addEventListener('input', (e) => { T.outlineColor = hexRgb(e.target.value); saveSettings(); tgPreviewSoon(); });
  bindSelect('expFormat', () => E.format, (v) => { E.format = v; }, () => renderSelbar());
  $('#expPrefix').value = E.prefix;
  $('#expPrefix').addEventListener('input', (e) => { E.prefix = safeName(e.target.value.trim() || 'sprite'); saveSettings(); if (S.img) { renderList(); renderSelbar(); } });
  bindCheck('expTrim', () => E.trim, (v) => { E.trim = v; }, () => renderSelbar());
  bindCheck('expPixel', () => E.pixel, (v) => { E.pixel = v; }, () => {});
  bindCheck('expJson', () => E.json, (v) => { E.json = v; }, () => {});

  bindSelect('sortMode', () => settings.sort, (v) => { settings.sort = v; }, () => refresh());

  // Mode
  function updateModeUI() {
    for (const b of $$('#modeSeg button')) b.classList.toggle('on', b.dataset.mode === S.mode);
    $('#secScan').classList.toggle('hidden', S.mode !== 'scan');
    $('#secGrid').classList.toggle('hidden', S.mode !== 'grid');
  }
  $('#modeSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  $('#btnDetect').addEventListener('click', () => {
    if (!S.img) { toast(t('t_open_first')); return; }
    pushUndo();
    // A fresh detect: forget deletions and edits of auto sprites, keep hand-drawn shapes.
    S.suppress = [];
    S.sprites = S.sprites.filter((s) => s.kind === 'manual');
    detect();
    toast(t('t_found', { n: S.order.length }), { action: t('undo'), onAction: undo });
  });

  /* ───────────────────────── Top bar, rail, zoom ───────────────────────── */

  $('#btnOpen').addEventListener('click', () => $('#fileInput').click());
  $('#btnOpen2').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#rail').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  $('#btnHelp').addEventListener('click', () => $('#helpDlg').showModal());
  $('#btnZoomIn').addEventListener('click', () => zoomCenter(1.25));
  $('#btnZoomOut').addEventListener('click', () => zoomCenter(0.8));
  $('#btnFit').addEventListener('click', fitView);
  $('#zoomVal').addEventListener('click', () => zoomTo(1));

  // Example sheet (only when served over http and the file exists)
  if (location.protocol.startsWith('http')) {
    fetch('samples/example-sheet.webp', { method: 'HEAD' }).then((r) => {
      if (r.ok) $('#btnSample').classList.remove('hidden');
    }).catch(() => {});
  }
  async function loadExample() {
    try {
      const res = await fetch('samples/example-sheet.webp');
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      await loadFile(new File([blob], 'example-sheet.webp', { type: 'image/webp' }));
      return true;
    } catch {
      toast(t('t_cant_example'), { kind: 'warn' });
      return false;
    }
  }
  $('#btnSample').addEventListener('click', loadExample);

  /* ───────────────────────── Drop / paste ───────────────────────── */

  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('#dropOverlay').classList.remove('hidden'); });
  window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $('#dropOverlay').classList.add('hidden'); } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('#dropOverlay').classList.add('hidden');
    const f = [...e.dataTransfer.files].find((x) => /^image\//.test(x.type) || /\.(png|apng|jpe?g|webp|gif|bmp|avif|svg)$/i.test(x.name));
    if (f) loadFile(f); else toast(t('t_drop_image'), { kind: 'warn' });
  });
  window.addEventListener('paste', (e) => {
    if (e.target.matches?.('input, textarea')) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); loadFile(item.getAsFile()); }
  });

  /* ───────────────────────── Keyboard ───────────────────────── */

  const TOOL_KEYS = { v: 'select', r: 'rect', p: 'poly', l: 'lasso', w: 'wand', i: 'pick', h: 'pan' };

  window.addEventListener('keydown', (e) => {
    const typing = e.target.matches?.('input:not([type=range]):not([type=checkbox]):not([type=color]), select, textarea');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { if (typing) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { if (typing) return; e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#fileInput').click(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (S.img) downloadSprites(S.order, `${safeName(S.fileName)}_sprites`); return; }
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(S.order.map((s) => s.id), { scrollList: false }); return; }
    if (mod) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!spaceDown) { spaceDown = true; stage.classList.add('panning'); }
      return;
    }
    if (polyDraft) {
      if (e.key === 'Enter') { e.preventDefault(); finishPoly(e); return; }
      if (e.key === 'Escape') { cancelDraft(); return; }
      if (e.key === 'Backspace') {
        e.preventDefault();
        polyDraft.pts.pop();
        if (!polyDraft.pts.length) polyDraft = null;
        render();
        return;
      }
    }
    if (drag && e.key === 'Escape') { drag = null; stage.classList.remove('dragging'); render(); return; }

    const k = e.key.toLowerCase();
    if (TOOL_KEYS[k]) { setTool(TOOL_KEYS[k]); return; }
    switch (e.key) {
      case 'Escape': if (S.selection.size) setSel([]); else if (S.tool !== 'select') setTool('select'); break;
      case 'Delete': case 'Backspace': e.preventDefault(); deleteSelected(); break;
      case 'm': case 'M': mergeSelected(); break;
      case 'u': case 'U': splitSelected(); break;
      case 'f': case 'F': fitView(); break;
      case '0': zoomTo(1); break;
      case '+': case '=': zoomCenter(1.25); break;
      case '-': case '_': zoomCenter(0.8); break;
      case '?': $('#helpDlg').showModal(); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; stage.classList.remove('panning'); }
  });
  window.addEventListener('blur', () => { spaceDown = false; stage.classList.remove('panning'); });

  /* ───────────────────────── Status, banner, toasts ───────────────────────── */

  function updateStatusPixel(ix, iy) {
    const x = Math.floor(ix), y = Math.floor(iy);
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) { $('#stPos').textContent = ''; $('#stPixel').innerHTML = ''; return; }
    const i = (y * S.w + x) * 4, d = S.img.data;
    $('#stPos').textContent = `${x}, ${y}`;
    $('#stPixel').innerHTML = `<span class="sw" style="background:rgba(${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3] / 255})"></span>${rgbHex([d[i], d[i + 1], d[i + 2]])} α${d[i + 3]}`;
  }
  function updateStatusSize() { $('#stSize').textContent = S.img ? `${S.w}×${S.h}` : ''; }

  function showBanner(html, actionLabel, fn) {
    $('#bannerText').innerHTML = html;
    const b = $('#bannerAction');
    b.textContent = actionLabel;
    b.onclick = () => { hideBanner(); fn(); };
    $('#banner').classList.remove('hidden');
  }
  function hideBanner() { $('#banner').classList.add('hidden'); }
  $('#bannerClose').addEventListener('click', hideBanner);

  function toast(msg, { action, onAction, kind, sticky } = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    const span = document.createElement('span');
    span.textContent = msg;
    el.append(span);
    if (action) {
      const b = document.createElement('button');
      b.className = 'btn sm';
      b.textContent = action;
      b.onclick = () => { el.remove(); onAction(); };
      el.append(b);
    }
    const box = $('#toasts');
    box.append(el);
    while (box.children.length > 3) box.firstChild.remove();
    if (!sticky) setTimeout(() => el.remove(), action ? 6000 : 3500);
    return el;
  }

  /* ───────────────────────── Language ───────────────────────── */

  function setLanguage(lang) {
    settings.lang = I18N.languages.includes(lang) ? lang : 'en';
    saveSettings();
    I18N.setLang(settings.lang);
    for (const b of $$('#langSeg button')) b.classList.toggle('on', b.dataset.lang === settings.lang);
    for (const f of outputRefreshers) f();
    $('#stHint').textContent = t(`hint_${S.tool}`);
    if (S.img) { renderList(); renderSelbar(); } else renderList();
  }
  $('#langSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (b) setLanguage(b.dataset.lang); });

  /* ───────────────────────── Init ───────────────────────── */

  setLanguage(settings.lang);

  setTool('select');
  updateModeUI();
  updateUndoButtons();
  renderList();

  // URL options: ?example opens the demo sheet, &select=N selects sprite #N, ?lang=en|uk sets the language.
  const params = new URLSearchParams(location.search);
  if (params.has('lang')) setLanguage(params.get('lang'));
  if (params.has('example') && location.protocol.startsWith('http')) {
    loadExample().then((ok) => {
      const s = ok && S.order[(parseInt(params.get('select'), 10) || 0) - 1];
      if (s) setSel([s.id]);
    });
  }

  // Debug/test hook
  window.SpriteCutter = { S, settings, loadFile, detect, refresh, exportCanvas, renderSprite, setTool, setSel, toBlob };
})();
