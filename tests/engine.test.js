// Run with: node tests/engine.test.js
'use strict';
const assert = require('assert');
const C = require('../js/color.js');
const M = require('../js/mixer.js');

// CIEDE2000 reference pairs (Sharma, Wu & Dalal 2005).
const pairs = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082]
];
for (const [a, b, expected] of pairs) {
  assert.ok(Math.abs(C.deltaE2000(a, b) - expected) < 1e-3, `dE2000 ${C.deltaE2000(a, b)} != ${expected}`);
}

assert.strictEqual(C.normalizeHex('abc'), '#AABBCC');
assert.strictEqual(C.normalizeHex('#c69a4a'), '#C69A4A');
assert.strictEqual(C.normalizeHex('nope'), null);
assert.strictEqual(C.linearToHex(C.hexToLinear('#354C87')), '#354C87');

const paints = [
  ['Titanium White', '#F3F0E4'], ['Yellow Ochre', '#C69A4A'], ['Cadmium Red Light', '#C74732'],
  ['French Ultramarine', '#354C87'], ['Burnt Umber', '#684532'], ['Permanent Sap Green', '#5A7140'],
  ['Permanent Alizarin Crimson', '#7C293C'], ['Ivory Black', '#33312F']
].map(([name, hex], i) => ({ id: 'p' + i, name, hex, strength: 1, available: true }));

// A paint's own color should be matched by that paint alone.
let r = M.findRecipes(paints, '#C69A4A');
assert.strictEqual(r.recommended.count, 1);
assert.strictEqual(r.recommended.items[0].paint.name, 'Yellow Ochre');
assert.ok(r.recommended.dE < 0.01);

// Percentages always sum to 100 and every option uses inventory paints only.
for (const hex of ['#B08463', '#8FA3B8', '#2E3B2A', '#E8C9B5', '#6E2B2B']) {
  r = M.findRecipes(paints, hex);
  for (const opt of r.options) {
    assert.strictEqual(opt.items.reduce((s, it) => s + it.pct, 0), 100);
    assert.ok(opt.items.every((it) => paints.includes(it.paint)));
    assert.ok(opt.items.length >= 1 && opt.items.length <= 3);
  }
}

// maxPaints and availability are respected.
r = M.findRecipes(paints, '#8FA3B8', { maxPaints: 2 });
assert.ok(r.options.every((o) => o.count <= 2));
const limited = paints.map((p) => ({ ...p, available: p.name === 'Ivory Black' }));
r = M.findRecipes(limited, '#8FA3B8');
assert.strictEqual(r.paintCount, 1);
assert.strictEqual(r.recommended.items[0].paint.name, 'Ivory Black');
assert.strictEqual(M.findRecipes([], '#123456').recommended, null);

// Performance with a larger inventory.
const many = Array.from({ length: 30 }, (_, i) => ({
  id: 'm' + i, hex: C.rgbToHex((i * 53) % 256, (i * 97) % 256, (i * 151) % 256), strength: 1
}));
const t0 = Date.now();
M.findRecipes(many, '#7A6A55');
console.log('30-paint search ms:', Date.now() - t0);
console.log('All engine tests passed.');
