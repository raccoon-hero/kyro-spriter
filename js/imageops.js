/* Kyro's Spriter — pixel-level image operations (no DOM state). */
'use strict';

const ImageOps = (() => {
  const MAX_DIST = 441.6729559300637; // sqrt(3 * 255^2)

  /** Euclidean RGB distance as a percentage (0–100). */
  function colorDist(r, g, b, br, bg, bb) {
    const dr = r - br, dg = g - bg, db = b - bb;
    return Math.sqrt(dr * dr + dg * dg + db * db) / MAX_DIST * 100;
  }

  /** Fraction of pixels with alpha below 128. */
  function transparentFraction(img) {
    const d = img.data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 128) n++;
    return n / (img.width * img.height);
  }

  /**
   * Guess the background color from the image border.
   * Returns { color:[r,g,b], uniformity } where uniformity is the share of
   * opaque border pixels within ~6% of the chosen color.
   */
  function estimateBackground(img) {
    const { width: w, height: h, data: d } = img;
    const buckets = new Map();
    const samples = [];
    const add = (x, y) => {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 128) return;
      samples.push(i);
      const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      let b = buckets.get(k);
      if (!b) { b = [0, 0, 0, 0]; buckets.set(k, b); }
      b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++;
    };
    const step = Math.max(1, Math.floor((w + h) / 4000));
    for (let x = 0; x < w; x += step) { add(x, 0); add(x, h - 1); }
    for (let y = 0; y < h; y += step) { add(0, y); add(w - 1, y); }
    let best = null;
    for (const b of buckets.values()) if (!best || b[3] > best[3]) best = b;
    if (!best) return null;
    const color = [Math.round(best[0] / best[3]), Math.round(best[1] / best[3]), Math.round(best[2] / best[3])];
    let close = 0;
    for (const i of samples) if (colorDist(d[i], d[i + 1], d[i + 2], color[0], color[1], color[2]) < 6) close++;
    return { color, uniformity: close / samples.length };
  }

  /** Separable box blur of a Float32 field (edge-clamped). */
  function boxBlur(src, w, h, r) {
    if (r <= 0) return src;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const k = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[row + Math.min(w - 1, Math.max(0, i))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / k;
        acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / k;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  /** Color-distance field to `color` (transparent pixels → 0), optionally denoised. */
  function distanceToColor(img, color, alphaThr, denoise) {
    const { width: w, height: h, data: src } = img;
    const N = w * h;
    const dist = new Float32Array(N);
    const [br, bg, bb] = color;
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      dist[p] = src[i + 3] < alphaThr ? 0 : colorDist(src[i], src[i + 1], src[i + 2], br, bg, bb);
    }
    return denoise > 0 ? boxBlur(dist, w, h, denoise) : dist;
  }

  /**
   * Suggest a tolerance from how noisy the background is along the image border
   * (compression noise), so sticker borders a shade off the background survive.
   */
  function suggestTolerance(img, color, denoise = 1) {
    const { width: w, height: h, data: d } = img;
    const D = distanceToColor(img, color, 8, denoise);
    const band = Math.max(2, Math.min(8, Math.floor(Math.min(w, h) / 20)));
    const vals = [];
    const take = (x, y) => { const p = y * w + x; if (d[p * 4 + 3] >= 128) vals.push(D[p]); };
    for (let y = 0; y < h; y++) {
      if (y < band || y >= h - band) { for (let x = 0; x < w; x++) take(x, y); }
      else { for (let x = 0; x < band; x++) { take(x, y); take(w - 1 - x, y); } }
    }
    if (vals.length < 16) return null;
    vals.sort((a, b) => a - b);
    // Most of the border is background; ignore the top 3% (sprites touching the edge).
    const p97 = vals[Math.floor(vals.length * 0.97)];
    return Math.round(Math.min(30, Math.max(0.8, p97 * 1.4 + 0.5)) * 2) / 2;
  }

  /**
   * Make background pixels transparent.
   * opts: { color:[r,g,b], tolerance (0-100), softness (0-100), denoise (px), smooth (px),
   *         mode: 'edges' | 'global' | 'seed', seed:[x,y], defringe, alphaThr, outline (px) }
   * Returns { image: new ImageData, cleared } — the input is never mutated.
   */
  function removeBackground(img, opts) {
    const { width: w, height: h } = img;
    const src = img.data;
    const out = new Uint8ClampedArray(src);
    const N = w * h;
    const tol = opts.tolerance;
    const smooth = Math.max(0, opts.smooth | 0);
    const soft = smooth ? 0 : Math.max(0, opts.softness);
    const alphaThr = opts.alphaThr ?? 8;
    const mode = opts.mode;
    let color = opts.color;

    if (mode === 'seed') {
      const [sx, sy] = opts.seed;
      const i = (sy * w + sx) * 4;
      if (src[i + 3] < alphaThr) return { image: img, cleared: 0 };
      color = [src[i], src[i + 1], src[i + 2]];
    }
    const [br, bg, bb] = color;

    const transparent = new Uint8Array(N);
    for (let p = 0, i = 3; p < N; p++, i += 4) if (src[i] < alphaThr) transparent[p] = 1;
    const denoise = Math.max(0, opts.denoise | 0);
    const raw = distanceToColor(img, color, alphaThr, 0);
    const dist = denoise ? boxBlur(raw, w, h, denoise) : raw;
    // Background if the pixel itself OR its neighbourhood average is close to the bg color:
    // the average beats compression noise, the raw value keeps narrow gaps open.
    const isBg = (p) => raw[p] <= tol || dist[p] <= tol;

    // state: 0 foreground, 1 background, 2 soft edge
    const state = new Uint8Array(N);
    if (mode === 'global') {
      for (let p = 0; p < N; p++) {
        if (transparent[p]) { state[p] = 1; continue; }
        if (isBg(p)) state[p] = 1;
        else if (soft > 0 && dist[p] <= tol + soft) state[p] = 2;
      }
    } else {
      // Flood fill (4-connected) from the border, or from a single seed.
      const passTransparent = mode === 'edges';
      const queue = new Int32Array(N);
      let qh = 0, qt = 0;
      const visit = (p) => {
        if (state[p]) return;
        if (transparent[p]) {
          if (passTransparent) { state[p] = 1; queue[qt++] = p; }
          return;
        }
        const d = dist[p];
        if (isBg(p)) { state[p] = 1; queue[qt++] = p; }
        else if (soft > 0 && d <= tol + soft) state[p] = 2;
      };
      if (mode === 'seed') {
        const p = opts.seed[1] * w + opts.seed[0];
        state[p] = 1; queue[qt++] = p;
      } else {
        for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
        for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
      }
      while (qh < qt) {
        const p = queue[qh++];
        const x = p % w;
        if (x > 0) visit(p - 1);
        if (x < w - 1) visit(p + 1);
        if (p >= w) visit(p - w);
        if (p < N - w) visit(p + w);
      }
    }

    // Drop tiny foreground islands left in the background (compression noise).
    if (mode !== 'seed') {
      const minIsland = opts.minIsland ?? 10;
      const fg = new Uint8Array(N);
      for (let p = 0; p < N; p++) if (state[p] !== 1 && !transparent[p]) fg[p] = 1;
      const { labels, count } = labelComponents(fg, w, h);
      if (count) {
        const area = new Int32Array(count + 1);
        for (let p = 0; p < N; p++) if (labels[p]) area[labels[p]]++;
        for (let p = 0; p < N; p++) if (labels[p] && area[labels[p]] < minIsland) state[p] = 1;
      }
    }

    const unmix = (i, f) => {
      out[i] = (src[i] - (1 - f) * br) / f;
      out[i + 1] = (src[i + 1] - (1 - f) * bg) / f;
      out[i + 2] = (src[i + 2] - (1 - f) * bb) / f;
    };

    let cleared = 0;
    if (smooth > 0) {
      // Smooth the silhouette: blur the background/foreground mask and re-threshold
      // with a ~1px anti-aliased ramp. Straightens jagged, noisy borders.
      const newBg = new Uint8Array(N);
      const F = new Float32Array(N);
      for (let p = 0; p < N; p++) {
        if (state[p] === 1) { if (!transparent[p]) newBg[p] = 1; }
        else if (!transparent[p]) F[p] = 1;
      }
      const region = dilate(newBg, w, h, smooth * 2 + 2);
      const B = boxBlur(boxBlur(F, w, h, smooth), w, h, smooth);
      // Smoothing may trim bumps freely but only grow the shape by 1px (anti-aliasing),
      // so it never bridges narrow gaps between neighbouring stickers.
      const fgMask = new Uint8Array(N);
      for (let p = 0; p < N; p++) if (F[p]) fgMask[p] = 1;
      const allow = dilate(fgMask, w, h, 1);
      const gain = (2 * smooth + 1) / 1.4;
      const core = tol + 10;
      for (let p = 0; p < N; p++) {
        if (transparent[p]) continue;
        const i = p * 4;
        if (!region[p]) continue;
        let a = allow[p] ? Math.min(1, Math.max(0, (B[p] - 0.5) * gain + 0.5)) : 0;
        if (!F[p] && a > 0.5) a = 0.5; // grown edge pixels stay soft
        if (state[p] !== 1 && dist[p] > core) a = 1; // keep clearly-not-background detail crisp
        const na = src[i + 3] * a;
        if (na < 1) { out[i + 3] = 0; cleared++; continue; }
        out[i + 3] = na;
        if (opts.defringe && a < 0.98) unmix(i, a);
      }
    } else {
      for (let p = 0; p < N; p++) {
        if (transparent[p]) continue;
        const i = p * 4;
        if (state[p] === 1) { out[i + 3] = 0; cleared++; }
        else if (state[p] === 2) {
          const f = Math.min(1, (dist[p] - tol) / soft);
          out[i + 3] = Math.round(src[i + 3] * f);
          if (opts.defringe && f > 0.02) unmix(i, f);
        }
      }
    }

    if (opts.outline > 0) restoreOutline(src, out, w, h, opts.outline);
    return { image: new ImageData(out, w, h), cleared };
  }

  /**
   * Bring back original pixels within `r` px of what survived removal — keeps a
   * smooth sticker border (e.g. white outline on a white background).
   */
  function restoreOutline(src, out, w, h, r) {
    const N = w * h;
    const fg = new Uint8Array(N);
    for (let p = 0; p < N; p++) if (out[p * 4 + 3] > 127) fg[p] = 1;
    const d = edt(fg, w, h);
    for (let p = 0; p < N; p++) {
      if (fg[p]) continue;
      const cover = r + 0.5 - d[p];
      if (cover <= 0) continue;
      const i = p * 4;
      const a = src[i + 3] * Math.min(1, cover);
      if (a > out[i + 3]) {
        out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = a;
      }
    }
  }

  /** Exact Euclidean distance transform (Felzenszwalb–Huttenlocher) to the nearest set pixel. */
  function edt(mask, w, h) {
    const INF = 1e20;
    const n = Math.max(w, h);
    const f = new Float64Array(n), dd = new Float64Array(n), z = new Float64Array(n + 1);
    const v = new Int32Array(n);
    const grid = new Float64Array(w * h);
    for (let p = 0; p < w * h; p++) grid[p] = mask[p] ? 0 : INF;
    const pass = (len) => {
      let k = 0;
      v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < len; q++) {
        while (z[k + 1] < q) k++;
        dd[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
      }
    };
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
      pass(h);
      for (let y = 0; y < h; y++) grid[y * w + x] = dd[y];
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) f[x] = grid[row + x];
      pass(w);
      for (let x = 0; x < w; x++) out[row + x] = Math.sqrt(dd[x]);
    }
    return out;
  }

  /**
   * Draw an anti-aliased outline of `r` px in `color` behind the opaque shape of an
   * RGBA ImageData (which must already have ≥ r+1 px of transparent padding).
   */
  function addOutline(imgData, r, color) {
    const { width: w, height: h, data: d } = imgData;
    const N = w * h;
    const mask = new Uint8Array(N);
    for (let p = 0; p < N; p++) if (d[p * 4 + 3] >= 128) mask[p] = 1;
    const dist = edt(mask, w, h);
    const [cr, cg, cb] = color;
    for (let p = 0; p < N; p++) {
      const ao = Math.min(1, Math.max(0, r + 0.5 - dist[p]));
      if (!ao) continue;
      const i = p * 4;
      const as = d[i + 3] / 255;
      const a = as + ao * (1 - as);
      if (a <= 0) continue;
      const wo = ao * (1 - as);
      d[i] = (d[i] * as + cr * wo) / a;
      d[i + 1] = (d[i + 1] * as + cg * wo) / a;
      d[i + 2] = (d[i + 2] * as + cb * wo) / a;
      d[i + 3] = a * 255;
    }
    return imgData;
  }

  /** 8-connected component labelling. Returns { labels:Int32Array, count }. */
  function labelComponents(mask, w, h) {
    const labels = new Int32Array(w * h);
    let parent = new Int32Array(4096);
    let next = 1;
    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    const union = (a, b) => {
      a = find(a); b = find(b);
      if (a === b) return;
      if (a < b) parent[b] = a; else parent[a] = b;
    };
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const p = row + x;
        if (!mask[p]) continue;
        let l = 0, n;
        if (x > 0 && (n = labels[p - 1])) l = n;
        if (y > 0) {
          const up = p - w;
          if (x > 0 && (n = labels[up - 1])) { if (!l) l = n; else if (n !== l) union(l, n); }
          if ((n = labels[up])) { if (!l) l = n; else if (n !== l) union(l, n); }
          if (x < w - 1 && (n = labels[up + 1])) { if (!l) l = n; else if (n !== l) union(l, n); }
        }
        if (!l) {
          if (next >= parent.length) {
            const np = new Int32Array(parent.length * 2);
            np.set(parent);
            parent = np;
          }
          parent[next] = next;
          l = next++;
        }
        labels[p] = l;
      }
    }
    const remap = new Int32Array(next);
    let count = 0;
    for (let i = 1; i < next; i++) {
      const r = find(i);
      remap[i] = r === i ? ++count : remap[r];
    }
    for (let p = 0; p < labels.length; p++) if (labels[p]) labels[p] = remap[labels[p]];
    return { labels, count };
  }

  /** Square (Chebyshev) dilation of a 0/1 mask by radius r. O(N). */
  function dilate(mask, w, h, r) {
    if (r <= 0) return mask;
    const tmp = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let last = -1e9;
      for (let x = 0; x < w; x++) {
        if (mask[row + x]) last = x;
        if (x - last <= r) tmp[row + x] = 1;
      }
      last = 1e9;
      for (let x = w - 1; x >= 0; x--) {
        if (mask[row + x]) last = x;
        if (last - x <= r) tmp[row + x] = 1;
      }
    }
    for (let x = 0; x < w; x++) {
      let last = -1e9;
      for (let y = 0; y < h; y++) {
        if (tmp[y * w + x]) last = y;
        if (y - last <= r) out[y * w + x] = 1;
      }
      last = 1e9;
      for (let y = h - 1; y >= 0; y--) {
        if (tmp[y * w + x]) last = y;
        if (last - y <= r) out[y * w + x] = 1;
      }
    }
    return out;
  }

  /** Per-component bounding boxes, areas and a representative pixel. */
  function componentStats(labels, count, w) {
    const x0 = new Int32Array(count + 1).fill(1e9), y0 = new Int32Array(count + 1).fill(1e9);
    const x1 = new Int32Array(count + 1).fill(-1), y1 = new Int32Array(count + 1).fill(-1);
    const area = new Int32Array(count + 1), rep = new Int32Array(count + 1).fill(-1);
    for (let p = 0; p < labels.length; p++) {
      const l = labels[p];
      if (!l) continue;
      const x = p % w, y = (p - x) / w;
      if (x < x0[l]) x0[l] = x;
      if (x > x1[l]) x1[l] = x;
      if (y < y0[l]) y0[l] = y;
      if (y > y1[l]) y1[l] = y;
      area[l]++;
      if (rep[l] < 0) rep[l] = p;
    }
    return { x0, y0, x1, y1, area, rep };
  }

  /**
   * Full scan: alpha mask → components → groups (sprites).
   * opts: { alphaThr, gap, absorb, minSpeck }
   * Returns { labels, count, stats, groups:[{comps:[ids], x0,y0,x1,y1, area}] }
   */
  function detect(img, opts) {
    const { width: w, height: h, data: d } = img;
    const N = w * h;
    const mask = new Uint8Array(N);
    const thr = opts.alphaThr;
    for (let p = 0, i = 3; p < N; p++, i += 4) if (d[i] > thr) mask[p] = 1;

    const split = Math.max(0, opts.split | 0);
    let labels, count, base = mask;
    if (split > 0) {
      // Cores come from solid pixels only: touching stickers usually meet through soft edge pixels.
      const solid = new Uint8Array(N);
      for (let p = 0, i = 3; p < N; p++, i += 4) if (d[i] >= 224) solid[p] = 1;
      ({ labels, count, core: base } = splitTouching(mask, w, h, split, solid));
    }
    else ({ labels, count } = labelComponents(mask, w, h));
    const stats = componentStats(labels, count, w);

    const parent = new Int32Array(count + 1);
    for (let i = 0; i <= count; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };

    // Merge parts closer than `gap` pixels.
    if (opts.gap > 0 && count > 1) {
      const dm = dilate(base, w, h, Math.ceil(opts.gap / 2) + split);
      const { labels: dl } = labelComponents(dm, w, h);
      const first = new Map();
      for (let c = 1; c <= count; c++) {
        const k = dl[stats.rep[c]];
        if (!k) continue;
        const f = first.get(k);
        if (f === undefined) first.set(k, c); else union(f, c);
      }
    }

    const buildGroups = () => {
      const map = new Map();
      for (let c = 1; c <= count; c++) {
        if (!stats.area[c]) continue;
        const r = find(c);
        let g = map.get(r);
        if (!g) { g = { comps: [], x0: 1e9, y0: 1e9, x1: -1, y1: -1, area: 0 }; map.set(r, g); }
        g.comps.push(c);
        g.x0 = Math.min(g.x0, stats.x0[c]); g.y0 = Math.min(g.y0, stats.y0[c]);
        g.x1 = Math.max(g.x1, stats.x1[c]); g.y1 = Math.max(g.y1, stats.y1[c]);
        g.area += stats.area[c];
      }
      return [...map.values()];
    };

    let groups = buildGroups();

    // Absorb small groups that sit fully inside a bigger group's bounds.
    if (opts.absorb && groups.length > 1 && groups.length < 6000) {
      const bigFirst = groups.slice().sort((a, b) => b.area - a.area);
      for (let i = 1; i < bigFirst.length; i++) {
        const g = bigFirst[i];
        let host = null, hostArea = Infinity;
        for (let j = 0; j < i; j++) {
          const o = bigFirst[j];
          if (o.x0 <= g.x0 && o.y0 <= g.y0 && o.x1 >= g.x1 && o.y1 >= g.y1) {
            const a = (o.x1 - o.x0 + 1) * (o.y1 - o.y0 + 1);
            if (a < hostArea) { host = o; hostArea = a; }
          }
        }
        if (host) union(host.comps[0], g.comps[0]);
      }
      groups = buildGroups();
    }

    groups = groups.filter((g) => g.area >= opts.minSpeck);
    return { labels, count, stats, groups };
  }

  /**
   * Label a mask so that blobs touching through thin necks become separate parts:
   * erode by r to find cores, then grow each core back over the mask (geodesic BFS).
   * Thin pieces with no core keep their own labels. Returns { labels, count, core }.
   */
  function splitTouching(mask, w, h, r, solid = mask) {
    const N = w * h;
    const inv = new Uint8Array(N);
    for (let p = 0; p < N; p++) inv[p] = solid[p] ? 0 : 1;
    const grown = dilate(inv, w, h, r);
    const core = new Uint8Array(N);
    for (let p = 0; p < N; p++) if (solid[p] && !grown[p]) core[p] = 1;
    const { labels: cl, count: cc } = labelComponents(core, w, h);
    const labels = new Int32Array(N);
    const queue = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let p = 0; p < N; p++) if (cl[p]) { labels[p] = cl[p]; queue[qt++] = p; }
    while (qh < qt) {
      const p = queue[qh++];
      const x = p % w, y = (p - x) / w;
      const l = labels[p];
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !labels[q]) { labels[q] = l; queue[qt++] = q; }
        }
      }
    }
    let count = cc;
    const rest = new Uint8Array(N);
    let any = false;
    for (let p = 0; p < N; p++) if (mask[p] && !labels[p]) { rest[p] = 1; any = true; }
    if (any) {
      const { labels: rl, count: rc } = labelComponents(rest, w, h);
      for (let p = 0; p < N; p++) if (rl[p]) labels[p] = cc + rl[p];
      count = cc + rc;
    }
    // Soft edge pixels where two separated parts meet belong to neither — otherwise
    // the contact point leaves a little tick on one sticker's border.
    const drop = [];
    for (let p = 0; p < N; p++) {
      const l = labels[p];
      if (!l || solid[p]) continue;
      const x = p % w, y = (p - x) / w;
      search: for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const m = labels[yy * w + xx];
          if (m && m !== l) { drop.push(p); break search; }
        }
      }
    }
    for (const p of drop) labels[p] = 0;
    return { labels, count, core };
  }

  /** Ray-casting point-in-polygon. pts: [[x,y],...] */
  function pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function polyBounds(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
  }

  /** True when pts is an axis-aligned rectangle (4 points). */
  function isAxisRect(pts) {
    if (pts.length !== 4) return false;
    const xs = new Set(pts.map((p) => p[0])), ys = new Set(pts.map((p) => p[1]));
    return xs.size === 2 && ys.size === 2;
  }

  let rasterCanvas = null;
  /**
   * Rasterize polygons into an 8-bit coverage array for the box (bx,by,bw,bh).
   * Anti-aliased coverage, union of all polygons.
   */
  function rasterizePolys(polys, bx, by, bw, bh) {
    const cov = new Uint8ClampedArray(bw * bh);
    if (!polys.length || bw <= 0 || bh <= 0) return cov;
    const nonRect = [];
    for (const pts of polys) {
      if (isAxisRect(pts)) {
        const b = polyBounds(pts);
        const xa = Math.max(0, Math.round(b.x0) - bx), xb = Math.min(bw, Math.round(b.x1) - bx);
        const ya = Math.max(0, Math.round(b.y0) - by), yb = Math.min(bh, Math.round(b.y1) - by);
        for (let y = ya; y < yb; y++) cov.fill(255, y * bw + xa, y * bw + xb);
      } else nonRect.push(pts);
    }
    if (nonRect.length) {
      if (!rasterCanvas) rasterCanvas = document.createElement('canvas');
      rasterCanvas.width = bw; rasterCanvas.height = bh;
      const ctx = rasterCanvas.getContext('2d', { willReadFrequently: true });
      ctx.setTransform(1, 0, 0, 1, -bx, -by);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      for (const pts of nonRect) {
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
      }
      ctx.fill('nonzero');
      const a = ctx.getImageData(0, 0, bw, bh).data;
      for (let p = 0, i = 3; p < cov.length; p++, i += 4) if (a[i] > cov[p]) cov[p] = a[i];
    }
    return cov;
  }

  /** Ramer–Douglas–Peucker polyline simplification. */
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      let maxD = 0, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  return {
    colorDist, transparentFraction, estimateBackground, suggestTolerance, removeBackground, addOutline, edt,
    labelComponents, dilate, componentStats, detect,
    pointInPoly, polyBounds, isAxisRect, rasterizePolys, simplify,
  };
})();
