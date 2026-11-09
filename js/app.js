/* Pigment & Light — application UI */
(function () {
  'use strict';

  var C = window.PLColor;
  var M = window.PLMix;

  var STORAGE_KEYS = {
    paints: 'pigmentLight.paints.v1',
    mixes: 'pigmentLight.mixes.v1',
    settings: 'pigmentLight.settings.v1'
  };
  var BACKUP_APP_ID = 'pigment-and-light';
  var BACKUP_VERSION = 1;

  var SAMPLE_NOTE = 'Sample entry. Replace with your own tube details and adjust the swatch to match a paint-out.';
  var SAMPLE_PAINTS = [
    ['Winsor & Newton', 'Titanium White', 'PW6', '#F3F0E4'],
    ['Gamblin', 'Yellow Ochre', 'PY43', '#C69A4A'],
    ['Gamblin', 'Cadmium Red Light', 'PR108', '#C74732'],
    ['Winsor & Newton', 'French Ultramarine', 'PB29', '#354C87'],
    ['Gamblin', 'Burnt Umber', 'PBr7', '#684532'],
    ['Winsor & Newton', 'Permanent Sap Green', 'PG7 / PY110', '#5A7140'],
    ['Winsor & Newton', 'Permanent Alizarin Crimson', 'PR83', '#7C293C'],
    ['Gamblin', 'Ivory Black', 'PBk9', '#33312F']
  ];

  var DEFAULT_SETTINGS = {
    batch: 2,
    maxPaints: 3,
    sampleSize: 'medium',
    target: '#B08463',
    source: 'Color picker'
  };

  // Radius in canvas pixels (canvas is at most 1600 px on its long side).
  var SAMPLE_RADII = { small: 2, medium: 6, large: 14 };
  var MAX_CANVAS = 1600;

  /* ---------------- helpers ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function str(v, max) {
    return (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max || 200);
  }

  function num(v, fallback, lo, hi) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return fallback;
    return C.clamp(n, lo, hi);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function formatGrams(g) {
    if (g >= 100) return g.toFixed(0) + ' g';
    if (g >= 10) return g.toFixed(1) + ' g';
    return g.toFixed(2) + ' g';
  }

  function formatBatch(g) {
    return (Math.round(g * 100) / 100).toString() + ' g';
  }

  function formatDate(iso, withTime) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var opts = { year: 'numeric', month: 'short', day: 'numeric' };
    if (withTime) { opts.hour = 'numeric'; opts.minute = '2-digit'; }
    try { return d.toLocaleString(undefined, opts); } catch (e) { return d.toDateString(); }
  }

  function todayStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function rgbText(hex) {
    var c = C.hexToRgb(hex);
    return c ? c.r + ', ' + c.g + ', ' + c.b : '—';
  }

  function describeDelta(dE) {
    if (dE < 1) return 'Very close on screen';
    if (dE < 2.5) return 'Close — fine-tune by eye';
    if (dE < 5) return 'Moderate difference — plan to adjust';
    if (dE < 10) return 'Noticeable difference — treat as a rough start';
    return 'Large difference — your inventory may lack a paint near this color';
  }

  function paintLabel(p) {
    return p.brand ? p.brand + ' ' + p.name : p.name;
  }

  /* ---------------- storage ---------------- */

  var storageWarned = false;
  function load(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function persist(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (!storageWarned) {
        storageWarned = true;
        toast('Couldn’t save on this device. Storage may be full or turned off (for example in Private Browsing).');
      }
      return false;
    }
  }

  function sanitizePaint(p) {
    p = p || {};
    return {
      id: str(p.id, 80) || uid(),
      brand: str(p.brand, 80),
      name: str(p.name, 100) || 'Untitled paint',
      pigments: str(p.pigments, 80),
      notes: str(p.notes, 600),
      tube: str(p.tube, 40),
      hex: C.normalizeHex(p.hex) || '#808080',
      strength: num(p.strength, 1, 0.1, 10),
      available: p.available !== false,
      sample: p.sample === true,
      createdAt: str(p.createdAt, 40) || new Date().toISOString(),
      updatedAt: str(p.updatedAt, 40) || new Date().toISOString()
    };
  }

  function sanitizeMix(m) {
    m = m || {};
    var items = Array.isArray(m.items) ? m.items.slice(0, 3).map(function (it) {
      it = it || {};
      return {
        paintId: str(it.paintId, 80),
        brand: str(it.brand, 80),
        name: str(it.name, 100),
        pigments: str(it.pigments, 80),
        hex: C.normalizeHex(it.hex) || '#808080',
        pct: num(it.pct, 0, 0, 100)
      };
    }) : [];
    var crop = typeof m.crop === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(m.crop) && m.crop.length < 300000 ? m.crop : null;
    return {
      id: str(m.id, 80) || uid(),
      name: str(m.name, 100) || 'Untitled mix',
      notes: str(m.notes, 1500),
      createdAt: str(m.createdAt, 40) || new Date().toISOString(),
      targetHex: C.normalizeHex(m.targetHex) || '#808080',
      estimateHex: C.normalizeHex(m.estimateHex),
      dE: typeof m.dE === 'number' && isFinite(m.dE) ? m.dE : null,
      batch: num(m.batch, 2, 0.1, 2000),
      source: str(m.source, 40),
      items: items,
      crop: crop
    };
  }

  function sanitizeSettings(s) {
    s = s || {};
    return {
      batch: num(s.batch, DEFAULT_SETTINGS.batch, 0.1, 2000),
      maxPaints: Math.round(num(s.maxPaints, 3, 1, 3)),
      sampleSize: SAMPLE_RADII[s.sampleSize] ? s.sampleSize : DEFAULT_SETTINGS.sampleSize,
      target: C.normalizeHex(s.target) || DEFAULT_SETTINGS.target,
      source: str(s.source, 40) || DEFAULT_SETTINGS.source
    };
  }

  function samplePalette() {
    var now = new Date().toISOString();
    return SAMPLE_PAINTS.map(function (row) {
      return sanitizePaint({
        id: uid(), brand: row[0], name: row[1], pigments: row[2], hex: row[3],
        notes: SAMPLE_NOTE, tube: '', strength: 1, available: true, sample: true,
        createdAt: now, updatedAt: now
      });
    });
  }

  /* ---------------- state ---------------- */

  var state = {
    paints: [],
    mixes: [],
    settings: sanitizeSettings(null),
    recipes: null,        // { options: [...], paintCount }
    selected: 0,
    image: null,          // { width, height, data }
    point: null           // { x, y } in canvas pixels
  };

  function initState() {
    var storedPaints = load(STORAGE_KEYS.paints, null);
    if (Array.isArray(storedPaints)) {
      state.paints = storedPaints.map(sanitizePaint);
    } else {
      state.paints = samplePalette();
      persist(STORAGE_KEYS.paints, state.paints);
    }
    var storedMixes = load(STORAGE_KEYS.mixes, []);
    state.mixes = Array.isArray(storedMixes) ? storedMixes.map(sanitizeMix) : [];
    state.settings = sanitizeSettings(load(STORAGE_KEYS.settings, null));
  }

  function savePaints() { persist(STORAGE_KEYS.paints, state.paints); }
  function saveMixes() { persist(STORAGE_KEYS.mixes, state.mixes); }
  var saveSettings = debounce(function () { persist(STORAGE_KEYS.settings, state.settings); }, 300);

  /* ---------------- toast & announcements ---------------- */

  var toastTimer;
  function toast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 3600);
  }

  var announce = debounce(function (message) {
    var el = $('#sr-status');
    el.textContent = '';
    setTimeout(function () { el.textContent = message; }, 30);
  }, 700);

  /* ---------------- routing ---------------- */

  var VIEWS = {
    mixer: 'Color mixer',
    inventory: 'My paint inventory',
    saved: 'Saved mixes'
  };
  var currentView = null;

  function route() {
    var name = (location.hash || '').replace('#', '');
    if (!VIEWS[name]) name = currentView || 'mixer';
    var changed = currentView !== null && currentView !== name;
    currentView = name;
    $all('.view').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== name; });
    $all('.tab').forEach(function (t) {
      if (t.getAttribute('data-view') === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    document.title = VIEWS[name] + ' · Pigment & Light';
    if (changed) {
      $all('dialog').forEach(function (d) { if (d.open) closeDialog(d); });
      window.scrollTo(0, 0);
      var heading = $('#view-' + name + ' h1');
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  /* ---------------- target color ---------------- */

  function setTarget(hex, source, opts) {
    var n = C.normalizeHex(hex);
    if (!n) return;
    opts = opts || {};
    state.settings.target = n;
    state.settings.source = source;
    saveSettings();
    renderTarget();
    if (opts.immediate) {
      computeRecipes();
    } else {
      scheduleRecipes();
    }
  }

  function renderTarget() {
    var hex = state.settings.target;
    $('#target-swatch').style.background = hex;
    $('#target-swatch').setAttribute('aria-label', 'Target color swatch, ' + hex);
    $('#target-hex').textContent = hex;
    $('#target-rgb').textContent = rgbText(hex);
    $('#target-source').textContent = state.settings.source;
    var picker = $('#color-picker');
    if (picker.value.toUpperCase() !== hex) picker.value = hex.toLowerCase();
    var hexInput = $('#hex-input');
    if (document.activeElement !== hexInput) {
      hexInput.value = hex;
      hexInput.removeAttribute('aria-invalid');
    }
  }

  /* ---------------- recipes ---------------- */

  var recipeTimer;
  function scheduleRecipes() {
    clearTimeout(recipeTimer);
    recipeTimer = setTimeout(computeRecipes, 140);
  }

  function computeRecipes() {
    clearTimeout(recipeTimer);
    state.recipes = M.findRecipes(state.paints, state.settings.target, { maxPaints: state.settings.maxPaints });
    state.selected = 0;
    renderRecipe();
    var r = currentRecipe();
    if (r) {
      announce('Target ' + state.settings.target + '. Starting recipe: ' + recipeSummary(r) + '. Approximate difference ' + r.dE.toFixed(1) + '.');
    }
  }

  function currentRecipe() {
    if (!state.recipes || !state.recipes.options.length) return null;
    return state.recipes.options[state.selected] || state.recipes.options[0];
  }

  function recipeSummary(r) {
    return r.items.map(function (it) { return it.pct + '% ' + it.paint.name; }).join(', ');
  }

  function renderRecipe() {
    var body = $('#recipe-body');
    var est = $('#estimate-swatch');
    var r = currentRecipe();
    var batch = state.settings.batch;

    $all('.chip[data-batch]').forEach(function (chip) {
      chip.setAttribute('aria-pressed', String(Number(chip.getAttribute('data-batch')) === batch));
    });

    $('#save-mix-btn').disabled = !r;
    $('#print-mix-btn').disabled = !r;

    if (!r) {
      est.style.background = '';
      est.classList.add('is-empty');
      est.setAttribute('aria-label', 'No estimated mix');
      $('#delta-value').textContent = '—';
      $('#delta-desc').textContent = '';
      var total = state.paints.length;
      body.innerHTML = '<div class="recipe-empty">' +
        (total
          ? '<p><strong>No paints are switched on for mixing.</strong></p><p>Turn on “Use in mixer” for at least one paint in <a href="#inventory">My paints</a>.</p>'
          : '<p><strong>Your inventory is empty.</strong></p><p>Add your paints in <a href="#inventory">My paints</a> to get a recipe.</p>') +
        '</div>';
      $('#alternatives').hidden = true;
      return;
    }

    est.classList.remove('is-empty');
    est.style.background = r.mixHex;
    est.setAttribute('aria-label', 'Estimated mix swatch, approximately ' + r.mixHex);
    $('#delta-value').textContent = r.dE.toFixed(1);
    $('#delta-desc').textContent = describeDelta(r.dE);

    var tiny = false;
    var rows = r.items.map(function (it) {
      var g = M.gramsFor(it.pct, batch);
      if (g < 0.05) tiny = true;
      var p = it.paint;
      return '<li class="recipe-item">' +
        '<span class="recipe-swatch" style="background:' + p.hex + '" aria-hidden="true"></span>' +
        '<div><div class="recipe-name">' + esc(p.name) + '</div>' +
        '<div class="recipe-meta">' + esc(p.brand || 'Brand not set') +
        (p.pigments ? ' · <span class="pigment">' + esc(p.pigments) + '</span>' : '') + '</div></div>' +
        '<div class="recipe-amount"><span class="recipe-pct">' + it.pct + '%</span>' +
        '<span class="recipe-grams">' + formatGrams(g) + '</span></div>' +
        '</li>';
    }).join('');

    body.innerHTML =
      '<ol class="recipe-list" aria-label="Recipe for ' + esc(formatBatch(batch)) + ' batch">' + rows + '</ol>' +
      '<div class="recipe-total" aria-hidden="true"><span>Total batch</span><span>100% · ' + esc(formatBatch(batch)) + '</span></div>' +
      (tiny ? '<p class="recipe-note">Some amounts are very small to weigh. Try a larger batch size, or weigh on a scale that reads to 0.01 g.</p>' : '') +
      '<p class="fine-print">Proportions by weight, estimated from your swatches with ' + state.recipes.paintCount +
      ' paint' + (state.recipes.paintCount === 1 ? '' : 's') + ' switched on for mixing.</p>';

    var opts = state.recipes.options;
    var altWrap = $('#alternatives');
    if (opts.length > 1) {
      altWrap.hidden = false;
      $('#alt-list').innerHTML = opts.map(function (o, i) {
        var title = (i === 0 ? 'Suggested · ' : '') + o.count + ' paint' + (o.count === 1 ? '' : 's');
        return '<button type="button" class="alt-btn" data-index="' + i + '" aria-pressed="' + (i === state.selected) + '">' +
          '<span class="alt-swatch" style="background:' + o.mixHex + '" aria-hidden="true"></span>' +
          '<span class="alt-text"><span class="alt-title">' + esc(title) + '</span>' +
          '<span class="alt-summary">' + esc(recipeSummary(o)) + '</span></span>' +
          '<span class="alt-delta">ΔE ' + o.dE.toFixed(1) + '</span>' +
          '</button>';
      }).join('');
    } else {
      altWrap.hidden = true;
    }
  }

  /* ---------------- reference image ---------------- */

  var canvas, ctx;

  function openImagePicker() {
    var input = $('#image-input');
    input.value = '';
    input.click();
  }

  function loadImageFile(file) {
    if (!file) return;
    if (file.type && file.type.indexOf('image/') !== 0) {
      toast('Please choose an image file.');
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () {
      try {
        drawImage(img);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast('This image couldn’t be opened in this browser. Try a JPEG or PNG.');
    };
    img.src = url;
  }

  function drawImage(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) { toast('This image appears to be empty.'); return; }
    var scale = Math.min(1, MAX_CANVAS / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    canvas.width = w;
    canvas.height = h;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    try {
      state.image = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      state.image = null;
      toast('Couldn’t read colors from this image.');
      return;
    }
    state.point = null;
    $('#sample-marker').hidden = true;
    $('#dropzone').hidden = true;
    $('#viewer').hidden = false;
    updateMarkerSize();
    toast('Image loaded. Tap or drag on it to sample a color.');
  }

  function clearImage() {
    state.image = null;
    state.point = null;
    if (canvas) { canvas.width = 1; canvas.height = 1; }
    $('#viewer').hidden = true;
    $('#dropzone').hidden = false;
    $('#sample-marker').hidden = true;
    $('#upload-btn').focus();
  }

  /** Average color in linear light over a circle around (x, y). */
  function sampleAt(x, y) {
    var img = state.image;
    if (!img) return null;
    var r = SAMPLE_RADII[state.settings.sampleSize] || SAMPLE_RADII.medium;
    var cx = Math.round(x), cy = Math.round(y);
    var data = img.data, w = img.width, h = img.height;
    var lut = C.SRGB_TO_LINEAR;
    var sr = 0, sg = 0, sb = 0, total = 0;
    var r2 = r * r + r;
    for (var dy = -r; dy <= r; dy++) {
      var py = cy + dy;
      if (py < 0 || py >= h) continue;
      for (var dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        var px = cx + dx;
        if (px < 0 || px >= w) continue;
        var i = (py * w + px) * 4;
        var a = data[i + 3] / 255;
        if (a === 0) continue;
        sr += lut[data[i]] * a;
        sg += lut[data[i + 1]] * a;
        sb += lut[data[i + 2]] * a;
        total += a;
      }
    }
    if (!total) return null;
    return C.linearToHex([sr / total, sg / total, sb / total]);
  }

  function setPoint(x, y, immediate) {
    if (!state.image) return;
    x = C.clamp(x, 0, state.image.width - 1);
    y = C.clamp(y, 0, state.image.height - 1);
    state.point = { x: x, y: y };
    var hex = sampleAt(x, y);
    updateMarker(hex);
    if (hex) setTarget(hex, 'Image sample', { immediate: immediate });
  }

  function updateMarker(hex) {
    var marker = $('#sample-marker');
    if (!state.point || !state.image) { marker.hidden = true; return; }
    var fx = state.point.x / state.image.width;
    var fy = state.point.y / state.image.height;
    marker.hidden = false;
    marker.style.left = (fx * 100) + '%';
    marker.style.top = (fy * 100) + '%';
    marker.classList.toggle('bubble-below', fy < 0.2);
    marker.classList.toggle('bubble-left', fx > 0.88);
    marker.classList.toggle('bubble-right', fx < 0.12);
    if (hex) $('#sample-bubble').style.background = hex;
  }

  function updateMarkerSize() {
    if (!state.image) return;
    var r = SAMPLE_RADII[state.settings.sampleSize] || SAMPLE_RADII.medium;
    $('#sample-marker').style.width = (((2 * r + 1) / state.image.width) * 100) + '%';
  }

  function eventToCanvas(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function bindCanvas() {
    canvas = $('#ref-canvas');
    var dragging = false;
    var pending = null;
    var frame = 0;

    function flush() {
      frame = 0;
      if (pending) { setPoint(pending.x, pending.y, false); pending = null; }
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (!state.image) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      var p = eventToCanvas(e);
      setPoint(p.x, p.y, false);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      e.preventDefault();
      pending = eventToCanvas(e);
      if (!frame) frame = requestAnimationFrame(flush);
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (pending) { setPoint(pending.x, pending.y, false); pending = null; }
      computeRecipes();
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('keydown', function (e) {
      if (!state.image) return;
      var keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      var move = keys[e.key];
      if (!move && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      var base = state.point || { x: state.image.width / 2, y: state.image.height / 2 };
      if (!move) { setPoint(base.x, base.y, true); return; }
      var step = Math.max(1, Math.round(Math.max(state.image.width, state.image.height) / 160)) * (e.shiftKey ? 8 : 1);
      setPoint(base.x + move[0] * step, base.y + move[1] * step, false);
    });

    var dz = $('#dropzone');
    ['dragenter', 'dragover'].forEach(function (type) {
      dz.addEventListener(type, function (e) { e.preventDefault(); dz.classList.add('is-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      dz.addEventListener(type, function () { dz.classList.remove('is-dragover'); });
    });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadImageFile(f);
    });
    // Allow dropping a new image on the viewer too.
    var viewer = $('#viewer');
    viewer.addEventListener('dragover', function (e) { e.preventDefault(); });
    viewer.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadImageFile(f);
    });
  }

  function cropAroundPoint() {
    if (!state.image || !state.point || !canvas) return null;
    try {
      var size = Math.max(24, Math.round(Math.max(state.image.width, state.image.height) * 0.08));
      var sx = C.clamp(Math.round(state.point.x - size / 2), 0, Math.max(0, canvas.width - size));
      var sy = C.clamp(Math.round(state.point.y - size / 2), 0, Math.max(0, canvas.height - size));
      var sw = Math.min(size, canvas.width), sh = Math.min(size, canvas.height);
      var out = document.createElement('canvas');
      out.width = 96; out.height = 96;
      out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, 96, 96);
      return out.toDataURL('image/jpeg', 0.72);
    } catch (e) {
      return null;
    }
  }

  /* ---------------- mixes ---------------- */

  function snapshotCurrentMix(name, notes) {
    var r = currentRecipe();
    if (!r) return null;
    var batch = state.settings.batch;
    return sanitizeMix({
      id: uid(),
      name: name,
      notes: notes,
      createdAt: new Date().toISOString(),
      targetHex: state.settings.target,
      estimateHex: r.mixHex,
      dE: Math.round(r.dE * 100) / 100,
      batch: batch,
      source: state.settings.source,
      items: r.items.map(function (it) {
        return {
          paintId: it.paint.id, brand: it.paint.brand, name: it.paint.name,
          pigments: it.paint.pigments, hex: it.paint.hex, pct: it.pct
        };
      }),
      crop: state.settings.source === 'Image sample' ? cropAroundPoint() : null
    });
  }

  function defaultMixName() {
    var r = currentRecipe();
    var lead = r && r.items[0] ? r.items[0].paint.name : 'Mix';
    return 'Mix ' + state.settings.target + (r ? ' — ' + lead + (r.count > 1 ? ' blend' : '') : '');
  }

  function openSaveDialog() {
    var r = currentRecipe();
    if (!r) { toast('Add paints to your inventory to make a recipe first.'); return; }
    $('#mf-name').value = defaultMixName();
    $('#mf-notes').value = '';
    $('#mix-form-error').hidden = true;
    $('#mix-dialog-preview').innerHTML =
      '<span class="mix-swatch" style="background:' + state.settings.target + '" aria-hidden="true"></span>' +
      '<span class="mix-swatch" style="background:' + r.mixHex + '" aria-hidden="true"></span>' +
      '<p>' + esc(recipeSummary(r)) + '<br>Batch ' + esc(formatBatch(state.settings.batch)) + ' · ΔE ≈ ' + r.dE.toFixed(1) + '</p>';
    openDialog($('#mix-dialog'));
    setTimeout(function () { $('#mf-name').select(); }, 50);
  }

  function renderMixes() {
    var list = $('#mix-list');
    var mixes = state.mixes;
    $('#mix-empty').hidden = mixes.length > 0;
    $('#mix-count').textContent = mixes.length ? mixes.length + ' saved on this device.' : '';
    list.innerHTML = mixes.map(function (m) {
      var recipe = m.items.map(function (it) {
        var g = M.gramsFor(it.pct, m.batch);
        return '<li><span class="dot" style="background:' + it.hex + '" aria-hidden="true"></span>' +
          '<span>' + esc(it.name) + (it.pigments ? ' <span class="pigment">' + esc(it.pigments) + '</span>' : '') + '</span>' +
          '<span class="pct">' + it.pct + '% · ' + formatGrams(g) + '</span></li>';
      }).join('');
      return '<li class="mix-card" data-id="' + esc(m.id) + '">' +
        '<div class="mix-head">' +
          '<div class="mix-swatches">' +
            (m.crop ? '<img class="mix-crop" src="' + m.crop + '" alt="Reference image crop around the sampled point">' : '') +
            '<span class="mix-swatch" style="background:' + m.targetHex + '" role="img" aria-label="Target ' + m.targetHex + '"></span>' +
            (m.estimateHex ? '<span class="mix-swatch small" style="background:' + m.estimateHex + '" role="img" aria-label="Estimated mix ' + m.estimateHex + '"></span>' : '') +
          '</div>' +
          '<div><h2 class="mix-title">' + esc(m.name) + '</h2>' +
          '<p class="mix-meta">' + esc(formatDate(m.createdAt, true)) + ' · ' + m.targetHex +
          ' · ' + esc(formatBatch(m.batch)) + (m.dE != null ? ' · ΔE ≈ ' + m.dE.toFixed(1) : '') + '</p></div>' +
        '</div>' +
        '<ul class="mix-recipe" aria-label="Recipe">' + recipe + '</ul>' +
        (m.notes ? '<p class="mix-notes">' + esc(m.notes) + '</p>' : '') +
        '<div class="mix-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-mix-action="print">Print card</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-mix-action="open">Open in mixer</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-mix-action="notes">Edit notes</button>' +
          '<button type="button" class="btn btn-danger-ghost btn-sm" data-mix-action="delete">Delete</button>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  var editingMixId = null;

  function handleMixAction(action, id) {
    var mix = state.mixes.find(function (m) { return m.id === id; });
    if (!mix) return;
    if (action === 'print') {
      printCard(mix);
    } else if (action === 'open') {
      state.settings.batch = mix.batch;
      $('#batch-input').value = mix.batch;
      setTarget(mix.targetHex, 'Saved mix', { immediate: true });
      location.hash = '#mixer';
      toast('Loaded ' + mix.targetHex + '. Recipe recalculated with your current paints.');
    } else if (action === 'notes') {
      editingMixId = id;
      $('#mix-dialog-title').textContent = 'Edit saved mix';
      $('#mf-submit').textContent = 'Save changes';
      $('#mf-name').value = mix.name;
      $('#mf-notes').value = mix.notes;
      $('#mix-form-error').hidden = true;
      $('#mix-dialog-preview').innerHTML =
        '<span class="mix-swatch" style="background:' + mix.targetHex + '" aria-hidden="true"></span>' +
        '<p>' + esc(formatDate(mix.createdAt, true)) + '</p>';
      openDialog($('#mix-dialog'));
    } else if (action === 'delete') {
      if (!window.confirm('Delete the saved mix “' + mix.name + '”? This can’t be undone.')) return;
      state.mixes = state.mixes.filter(function (m) { return m.id !== id; });
      saveMixes();
      renderMixes();
      toast('Mix deleted.');
    }
  }

  function submitMixForm(e) {
    e.preventDefault();
    var name = str($('#mf-name').value, 100);
    var notes = str($('#mf-notes').value, 1500);
    if (!name) {
      var err = $('#mix-form-error');
      err.textContent = 'Please give this mix a name.';
      err.hidden = false;
      $('#mf-name').setAttribute('aria-invalid', 'true');
      $('#mf-name').focus();
      return;
    }
    $('#mf-name').removeAttribute('aria-invalid');
    if (editingMixId) {
      var mix = state.mixes.find(function (m) { return m.id === editingMixId; });
      if (mix) { mix.name = name; mix.notes = notes; }
      saveMixes();
      renderMixes();
      closeDialog($('#mix-dialog'));
      toast('Mix updated.');
      return;
    }
    var snap = snapshotCurrentMix(name, notes);
    if (!snap) return;
    state.mixes.unshift(snap);
    var ok = persist(STORAGE_KEYS.mixes, state.mixes);
    if (!ok && snap.crop) {
      // Retry without the image crop in case storage is nearly full.
      snap.crop = null;
      ok = persist(STORAGE_KEYS.mixes, state.mixes);
    }
    renderMixes();
    closeDialog($('#mix-dialog'));
    toast(ok ? 'Mix saved to this device.' : 'Mix kept for now, but it couldn’t be stored on this device.');
  }

  /* ---------------- printing ---------------- */

  function svgSwatch(hex, label) {
    return '<svg viewBox="0 0 100 60" preserveAspectRatio="none" role="img" aria-label="' + esc(label) + '">' +
      '<rect x="0.5" y="0.5" width="99" height="59" rx="3" fill="' + hex + '" stroke="#777" stroke-width="0.6"/></svg>';
  }

  function svgDot(hex) {
    return '<svg class="pc-dot" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="0.5" y="0.5" width="13" height="13" rx="2" fill="' + hex + '" stroke="#777" stroke-width="0.6"/></svg>';
  }

  function printCard(mix) {
    var rows = mix.items.map(function (it) {
      return '<tr><td>' + svgDot(it.hex) + '<strong>' + esc(it.name) + '</strong><br><span style="color:#555">' + esc(it.brand || '') + '</span></td>' +
        '<td class="pc-mono">' + esc(it.pigments || '—') + '</td>' +
        '<td class="num">' + it.pct + '%</td>' +
        '<td class="num">' + formatGrams(M.gramsFor(it.pct, mix.batch)) + '</td>' +
        '<td class="num">________</td></tr>';
    }).join('');

    var html =
      '<article class="print-card">' +
        '<header class="pc-head"><div><p class="pc-brand">Pigment &amp; Light · Mixing card</p>' +
        '<h1>' + esc(mix.name) + '</h1></div>' +
        '<p class="pc-date">' + esc(formatDate(mix.createdAt)) + '<br>Printed ' + esc(formatDate(new Date().toISOString())) + '</p></header>' +
        '<section class="pc-colors">' +
          '<div class="pc-color">' + svgSwatch(mix.targetHex, 'Target color ' + mix.targetHex) +
            '<p><strong>Target</strong><br><span class="pc-mono">HEX ' + mix.targetHex + '</span><br><span class="pc-mono">RGB ' + rgbText(mix.targetHex) + '</span></p></div>' +
          (mix.estimateHex ? '<div class="pc-color">' + svgSwatch(mix.estimateHex, 'Estimated mix ' + mix.estimateHex) +
            '<p><strong>Estimated mix</strong> (on-screen approximation)<br><span class="pc-mono">HEX ' + mix.estimateHex + '</span>' +
            (mix.dE != null ? '<br>Approx. difference ΔE2000 ≈ ' + mix.dE.toFixed(1) : '') + '</p></div>' : '') +
          (mix.crop ? '<div class="pc-color"><img src="' + mix.crop + '" alt="Reference crop"><p><strong>Reference</strong><br>Area around sample point</p></div>' : '') +
        '</section>' +
        '<h2>Starting recipe</h2>' +
        '<table class="pc-recipe"><thead><tr><th>Paint</th><th>Pigment code</th><th class="num">%</th><th class="num">Grams</th><th class="num">Actual</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr><td colspan="2">Total batch</td><td class="num">100%</td><td class="num">' + esc(formatBatch(mix.batch)) + '</td><td></td></tr></tfoot></table>' +
        '<p class="pc-facts"><strong>Batch size:</strong> ' + esc(formatBatch(mix.batch)) + ' (by weight)' +
          (mix.source ? ' &nbsp;·&nbsp; <strong>Target from:</strong> ' + esc(mix.source) : '') + '</p>' +
        '<h2>Test swatches</h2>' +
        '<div class="pc-tests"><div class="pc-test">Test 1</div><div class="pc-test">Test 2</div><div class="pc-test">Test 3</div></div>' +
        '<div class="pc-notes-block"><h2>Test notes</h2>' +
          (mix.notes ? '<div class="pc-saved-notes">' + esc(mix.notes) + '</div>' : '') +
          '<div class="pc-lines">' +
            '<div class="pc-line">Adjustments made:</div><div class="pc-line"></div>' +
            '<div class="pc-line">Wet vs. dry, lighting, surface:</div><div class="pc-line"></div>' +
            '<div class="pc-line">Final recipe / what worked:</div><div class="pc-line"></div>' +
          '</div></div>' +
        '<p class="pc-caveat">Starting estimate only, calculated from on-screen swatch colors with a simplified subtractive mixing model. ' +
        'Actual results depend on pigment concentration, opacity, tinting strength, paint brand, medium, surface, and lighting. Pigment codes are for reference and don’t determine exact mixing behavior. Mix a test, compare, and adjust.</p>' +
      '</article>';

    var area = $('#print-area');
    area.innerHTML = html;
    var imgs = $all('img', area);
    Promise.all(imgs.map(function (img) {
      return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
    })).then(function () {
      setTimeout(function () { window.print(); }, 30);
    });
  }

  function printCurrent() {
    var snap = snapshotCurrentMix('Mixing card ' + state.settings.target, '');
    if (!snap) { toast('Add paints to your inventory to make a recipe first.'); return; }
    printCard(snap);
  }

  /* ---------------- inventory ---------------- */

  function renderInventory() {
    var list = $('#paint-list');
    var paints = state.paints;
    var sampleCount = paints.filter(function (p) { return p.sample; }).length;
    var activeCount = paints.filter(function (p) { return p.available; }).length;

    $('#paint-empty').hidden = paints.length > 0;
    $('#paint-count').textContent = paints.length
      ? paints.length + ' paint' + (paints.length === 1 ? '' : 's') + ', ' + activeCount + ' used in the mixer.'
      : '';

    var notice = $('#sample-notice');
    notice.hidden = sampleCount === 0;
    if (sampleCount) {
      $('#sample-notice-text').textContent =
        (sampleCount === 1 ? '1 paint is still a sample entry. ' : sampleCount + ' paints are still sample entries. ') +
        'They’re here so you can try the mixer right away, and their swatches are only approximate. Replace them with your actual tubes: edit each one, adjust the swatch to match a paint-out of your own paint, then uncheck “Sample entry”. Delete any you don’t own.';
    }

    list.innerHTML = paints.map(function (p) {
      return '<li class="paint-card' + (p.available ? '' : ' is-unavailable') + '" data-id="' + esc(p.id) + '">' +
        '<div class="paint-top">' +
          '<button type="button" class="paint-swatch" style="background:' + p.hex + '" data-paint-action="edit" aria-label="Edit swatch for ' + esc(paintLabel(p)) + ', currently ' + p.hex + '"></button>' +
          '<div class="paint-info">' +
            '<p class="paint-brand">' + esc(p.brand || 'Brand not set') + '</p>' +
            '<h2 class="paint-name">' + esc(p.name) + '</h2>' +
            '<p class="paint-line"><span class="pigment">' + esc(p.pigments || 'No pigment code') + '</span> · <span class="pc-mono">' + p.hex + '</span></p>' +
            (p.tube ? '<p class="paint-line">Tube: ' + esc(p.tube) + '</p>' : '') +
            (p.strength !== 1 ? '<p class="paint-line">Tinting strength: ' + p.strength + '×</p>' : '') +
            (p.notes ? '<p class="paint-notes">' + esc(p.notes) + '</p>' : '') +
            (p.sample ? '<div class="paint-badges"><span class="badge badge-terra">Sample — replace</span></div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="paint-foot">' +
          '<label class="check"><input type="checkbox" data-paint-action="toggle"' + (p.available ? ' checked' : '') + '> <span>Use in mixer</span></label>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-paint-action="edit" aria-label="Edit ' + esc(paintLabel(p)) + '">Edit</button>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  var editingPaintId = null;

  function syncSwatchInputs(hex) {
    var n = C.normalizeHex(hex);
    if (!n) return;
    $('#pf-color').value = n.toLowerCase();
    $('#pf-hex').value = n;
    $('#pf-hex').removeAttribute('aria-invalid');
  }

  function openPaintDialog(id) {
    var p = id ? state.paints.find(function (x) { return x.id === id; }) : null;
    editingPaintId = p ? p.id : null;
    $('#paint-dialog-title').textContent = p ? 'Edit paint' : 'Add paint';
    $('#pf-brand').value = p ? p.brand : '';
    $('#pf-name').value = p ? p.name : '';
    $('#pf-pigments').value = p ? p.pigments : '';
    $('#pf-tube').value = p ? p.tube : '';
    $('#pf-notes').value = p ? p.notes : '';
    $('#pf-strength').value = p ? p.strength : 1;
    $('#pf-available').checked = p ? p.available : true;
    $('#pf-sample').checked = p ? p.sample : false;
    $('#pf-delete').hidden = !p;
    syncSwatchInputs(p ? p.hex : '#B59A7A');
    $('#paint-form-error').hidden = true;
    $all('#paint-form [aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    openDialog($('#paint-dialog'));
    setTimeout(function () { (p ? $('#pf-name') : $('#pf-brand')).focus(); }, 50);
  }

  function submitPaintForm(e) {
    e.preventDefault();
    var errors = [];
    var brand = str($('#pf-brand').value, 80);
    var name = str($('#pf-name').value, 100);
    var hex = C.normalizeHex($('#pf-hex').value);
    var strength = parseFloat($('#pf-strength').value);
    var firstBad = null;

    function mark(el, bad) {
      if (bad) { el.setAttribute('aria-invalid', 'true'); if (!firstBad) firstBad = el; }
      else el.removeAttribute('aria-invalid');
    }
    mark($('#pf-brand'), !brand);
    if (!brand) errors.push('a brand');
    mark($('#pf-name'), !name);
    if (!name) errors.push('a paint name');
    mark($('#pf-hex'), !hex);
    if (!hex) errors.push('a valid 6-digit HEX swatch (like #C69A4A)');
    var strengthBad = $('#pf-strength').value !== '' && (!isFinite(strength) || strength < 0.1 || strength > 10);
    mark($('#pf-strength'), strengthBad);
    if (strengthBad) errors.push('a tinting strength between 0.1 and 10');

    var errEl = $('#paint-form-error');
    if (errors.length) {
      errEl.textContent = 'Please enter ' + errors.join(', ') + '.';
      errEl.hidden = false;
      firstBad.focus();
      return;
    }
    errEl.hidden = true;

    var now = new Date().toISOString();
    var data = {
      brand: brand, name: name,
      pigments: str($('#pf-pigments').value, 80),
      tube: str($('#pf-tube').value, 40),
      notes: str($('#pf-notes').value, 600),
      hex: hex,
      strength: isFinite(strength) ? strength : 1,
      available: $('#pf-available').checked,
      sample: $('#pf-sample').checked,
      updatedAt: now
    };
    if (!data.sample && data.notes === SAMPLE_NOTE) data.notes = '';
    if (editingPaintId) {
      var idx = state.paints.findIndex(function (x) { return x.id === editingPaintId; });
      if (idx >= 0) state.paints[idx] = sanitizePaint(Object.assign({}, state.paints[idx], data));
    } else {
      state.paints.push(sanitizePaint(Object.assign({ id: uid(), createdAt: now }, data)));
    }
    savePaints();
    renderInventory();
    computeRecipes();
    closeDialog($('#paint-dialog'));
    toast(editingPaintId ? 'Paint updated.' : 'Paint added.');
  }

  function deleteEditingPaint() {
    var p = state.paints.find(function (x) { return x.id === editingPaintId; });
    if (!p) return;
    if (!window.confirm('Delete ' + paintLabel(p) + ' from your inventory? Saved mixes that use it will keep their recipe.')) return;
    state.paints = state.paints.filter(function (x) { return x.id !== p.id; });
    savePaints();
    renderInventory();
    computeRecipes();
    closeDialog($('#paint-dialog'));
    toast('Paint deleted.');
  }

  function removeSamples() {
    var n = state.paints.filter(function (p) { return p.sample; }).length;
    if (!n) return;
    if (!window.confirm('Remove ' + n + ' sample paint' + (n === 1 ? '' : 's') + ' from your inventory? Paints you’ve marked as your own stay.')) return;
    state.paints = state.paints.filter(function (p) { return !p.sample; });
    savePaints();
    renderInventory();
    computeRecipes();
    toast('Sample paints removed.');
  }

  function addSamples() {
    var existing = {};
    state.paints.forEach(function (p) { existing[(p.brand + '|' + p.name).toLowerCase()] = true; });
    var toAdd = samplePalette().filter(function (p) { return !existing[(p.brand + '|' + p.name).toLowerCase()]; });
    if (!toAdd.length) { toast('The sample paints are already in your inventory.'); return; }
    state.paints = state.paints.concat(toAdd);
    savePaints();
    renderInventory();
    computeRecipes();
    toast('Added ' + toAdd.length + ' sample paint' + (toAdd.length === 1 ? '' : 's') + '. Replace them with your own tubes.');
  }

  /* ---------------- export / backup ---------------- */

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    // Neutralize spreadsheet formulas.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    if (!state.paints.length) { toast('There are no paints to export yet.'); return; }
    var header = ['Brand', 'Paint name', 'Pigment codes', 'Ingredients / notes', 'Tube amount', 'Swatch HEX', 'Swatch RGB', 'Relative tinting strength', 'Use in mixer', 'Sample entry'];
    var lines = [header.map(csvCell).join(',')].concat(state.paints.map(function (p) {
      return [p.brand, p.name, p.pigments, p.notes, p.tube, p.hex, rgbText(p.hex), p.strength, p.available ? 'yes' : 'no', p.sample ? 'yes' : 'no']
        .map(csvCell).join(',');
    }));
    download('pigment-and-light-paints-' + todayStamp() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('Paint list exported as CSV.');
  }

  function backupJson() {
    var payload = {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      paints: state.paints,
      mixes: state.mixes,
      settings: state.settings
    };
    download('pigment-and-light-backup-' + todayStamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup downloaded. Keep it somewhere safe, like Files or iCloud Drive.');
  }

  function openRestore() {
    var input = $('#restore-input');
    input.value = '';
    input.click();
  }

  function restoreFromFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('That file is too large to be a Pigment & Light backup.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (e) {
        toast('That file isn’t valid JSON. Choose a Pigment & Light backup file.');
        return;
      }
      if (!data || typeof data !== 'object' || !Array.isArray(data.paints) || (data.app && data.app !== BACKUP_APP_ID)) {
        toast('That file doesn’t look like a Pigment & Light backup.');
        return;
      }
      var paints = data.paints.map(sanitizePaint);
      var mixes = Array.isArray(data.mixes) ? data.mixes.map(sanitizeMix) : [];
      var when = data.exportedAt ? ' from ' + formatDate(data.exportedAt, true) : '';
      var msg = 'Restore this backup' + when + '?\n\nIt contains ' + paints.length + ' paint' + (paints.length === 1 ? '' : 's') +
        ' and ' + mixes.length + ' saved mix' + (mixes.length === 1 ? '' : 'es') +
        '. This replaces the paints and mixes currently on this device.';
      if (!window.confirm(msg)) return;
      state.paints = paints;
      state.mixes = mixes;
      if (data.settings) {
        var s = sanitizeSettings(data.settings);
        state.settings.batch = s.batch;
        state.settings.maxPaints = s.maxPaints;
        state.settings.sampleSize = s.sampleSize;
      }
      savePaints();
      saveMixes();
      saveSettings();
      applySettingsToControls();
      renderInventory();
      renderMixes();
      computeRecipes();
      toast('Backup restored.');
    };
    reader.onerror = function () { toast('Couldn’t read that file.'); };
    reader.readAsText(file);
  }

  /* ---------------- dialogs ---------------- */

  var lastFocus = null;

  function openDialog(dlg) {
    lastFocus = document.activeElement;
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }

  function closeDialog(dlg) {
    if (typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.removeAttribute('open');
  }

  function bindDialogs() {
    $all('dialog').forEach(function (dlg) {
      dlg.addEventListener('click', function (e) {
        if (e.target === dlg) closeDialog(dlg); // backdrop
        if (e.target.closest('[data-close]')) closeDialog(dlg);
      });
      dlg.addEventListener('close', function () {
        if (dlg.id === 'mix-dialog') {
          editingMixId = null;
          $('#mix-dialog-title').textContent = 'Save mix';
          $('#mf-submit').textContent = 'Save mix';
        }
        if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === 'function') {
          lastFocus.focus({ preventScroll: true });
        }
      });
    });
  }

  /* ---------------- controls ---------------- */

  function applySettingsToControls() {
    $('#batch-input').value = state.settings.batch;
    $('#max-paints').value = String(state.settings.maxPaints);
    $all('input[name="sample-size"]').forEach(function (r) { r.checked = r.value === state.settings.sampleSize; });
  }

  function setBatch(value, fromInput) {
    var n = parseFloat(value);
    var input = $('#batch-input');
    if (!isFinite(n) || n <= 0) {
      if (!fromInput) input.value = state.settings.batch;
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    input.removeAttribute('aria-invalid');
    state.settings.batch = C.clamp(Math.round(n * 100) / 100, 0.1, 2000);
    if (!fromInput) input.value = state.settings.batch;
    saveSettings();
    renderRecipe();
  }

  function bindControls() {
    $('#upload-btn').addEventListener('click', openImagePicker);
    $('#change-image-btn').addEventListener('click', openImagePicker);
    $('#clear-image-btn').addEventListener('click', clearImage);
    $('#image-input').addEventListener('change', function (e) {
      loadImageFile(e.target.files && e.target.files[0]);
    });

    $all('input[name="sample-size"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        state.settings.sampleSize = radio.value;
        saveSettings();
        updateMarkerSize();
        if (state.point) setPoint(state.point.x, state.point.y, true);
      });
    });

    $('#color-picker').addEventListener('input', function (e) { setTarget(e.target.value, 'Color picker'); });
    $('#color-picker').addEventListener('change', function (e) { setTarget(e.target.value, 'Color picker', { immediate: true }); });

    var hexInput = $('#hex-input');
    function applyHex() {
      var n = C.normalizeHex(hexInput.value);
      if (!n) {
        if (hexInput.value.trim()) { hexInput.setAttribute('aria-invalid', 'true'); toast('Enter a HEX color like #B08463.'); }
        return;
      }
      hexInput.removeAttribute('aria-invalid');
      hexInput.value = n;
      if (n !== state.settings.target || state.settings.source !== 'HEX entry') setTarget(n, 'HEX entry', { immediate: true });
    }
    hexInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } });
    hexInput.addEventListener('change', applyHex);
    hexInput.addEventListener('blur', function () { if (!C.normalizeHex(hexInput.value)) renderTarget(); });

    var batchInput = $('#batch-input');
    batchInput.addEventListener('input', function () { setBatch(batchInput.value, true); });
    batchInput.addEventListener('change', function () { setBatch(batchInput.value, false); });
    $all('.chip[data-batch]').forEach(function (chip) {
      chip.addEventListener('click', function () { setBatch(chip.getAttribute('data-batch'), false); });
    });

    $('#max-paints').addEventListener('change', function (e) {
      state.settings.maxPaints = Math.round(num(e.target.value, 3, 1, 3));
      saveSettings();
      computeRecipes();
    });

    $('#alt-list').addEventListener('click', function (e) {
      var btn = e.target.closest('.alt-btn');
      if (!btn) return;
      state.selected = Number(btn.getAttribute('data-index')) || 0;
      renderRecipe();
      var focusBtn = $('#alt-list .alt-btn[data-index="' + state.selected + '"]');
      if (focusBtn) focusBtn.focus();
      var r = currentRecipe();
      if (r) announce('Selected recipe: ' + recipeSummary(r) + '. Approximate difference ' + r.dE.toFixed(1) + '.');
    });

    $('#save-mix-btn').addEventListener('click', openSaveDialog);
    $('#print-mix-btn').addEventListener('click', printCurrent);
    $('#mix-form').addEventListener('submit', submitMixForm);

    $('#mix-list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-mix-action]');
      if (!btn) return;
      var card = btn.closest('.mix-card');
      handleMixAction(btn.getAttribute('data-mix-action'), card && card.getAttribute('data-id'));
    });

    // Inventory
    $('#add-paint-btn').addEventListener('click', function () { openPaintDialog(null); });
    $('#remove-samples-btn').addEventListener('click', removeSamples);
    $('#paint-list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-paint-action="edit"]');
      if (!btn) return;
      var card = btn.closest('.paint-card');
      openPaintDialog(card && card.getAttribute('data-id'));
    });
    $('#paint-list').addEventListener('change', function (e) {
      if (e.target.getAttribute('data-paint-action') !== 'toggle') return;
      var card = e.target.closest('.paint-card');
      var p = state.paints.find(function (x) { return x.id === card.getAttribute('data-id'); });
      if (!p) return;
      p.available = e.target.checked;
      p.updatedAt = new Date().toISOString();
      card.classList.toggle('is-unavailable', !p.available);
      savePaints();
      var active = state.paints.filter(function (x) { return x.available; }).length;
      $('#paint-count').textContent = state.paints.length + ' paint' + (state.paints.length === 1 ? '' : 's') + ', ' + active + ' used in the mixer.';
      computeRecipes();
    });

    $('#paint-form').addEventListener('submit', submitPaintForm);
    $('#pf-delete').addEventListener('click', deleteEditingPaint);
    $('#pf-color').addEventListener('input', function (e) { syncSwatchInputs(e.target.value); });
    $('#pf-hex').addEventListener('input', function (e) {
      var n = C.normalizeHex(e.target.value);
      if (n) { $('#pf-color').value = n.toLowerCase(); e.target.removeAttribute('aria-invalid'); }
    });
    $('#pf-hex').addEventListener('blur', function (e) {
      var n = C.normalizeHex(e.target.value);
      if (n) e.target.value = n;
      else if (e.target.value.trim()) e.target.setAttribute('aria-invalid', 'true');
    });
    $('#pf-use-target').addEventListener('click', function () {
      syncSwatchInputs(state.settings.target);
      toast('Swatch set to ' + state.settings.target + '.');
    });

    // Shared data actions (present on several screens)
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      var action = el.getAttribute('data-action');
      if (action === 'export-csv') exportCsv();
      else if (action === 'backup-json') backupJson();
      else if (action === 'restore-json') openRestore();
      else if (action === 'add-samples') addSamples();
      else if (action === 'add-paint') openPaintDialog(null);
    });
    $('#restore-input').addEventListener('change', function (e) {
      restoreFromFile(e.target.files && e.target.files[0]);
    });

    $('#about-btn').addEventListener('click', function () { openDialog($('#about-dialog')); });

    // Close dialogs before following in-page links inside them.
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;
      var dlg = link.closest('dialog');
      if (dlg) closeDialog(dlg);
    });

    window.addEventListener('hashchange', route);

    // Keep other open tabs in sync.
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEYS.paints || e.key === STORAGE_KEYS.mixes) {
        var p = load(STORAGE_KEYS.paints, null);
        if (Array.isArray(p)) state.paints = p.map(sanitizePaint);
        var m = load(STORAGE_KEYS.mixes, []);
        state.mixes = Array.isArray(m) ? m.map(sanitizeMix) : [];
        renderInventory();
        renderMixes();
        computeRecipes();
      }
    });
  }

  /* ---------------- boot ---------------- */

  function init() {
    initState();
    bindCanvas();
    bindDialogs();
    bindControls();
    applySettingsToControls();
    renderTarget();
    renderInventory();
    renderMixes();
    computeRecipes();
    route();

    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(function () {});
    }
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
