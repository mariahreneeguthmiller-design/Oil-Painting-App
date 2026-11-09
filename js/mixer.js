/*
 * Pigment & Light — recipe search.
 *
 * Searches combinations of one, two, or three paints from the inventory and
 * estimates proportions (by weight, in whole percent) whose simulated mix is
 * closest to the target color. The simulation uses each paint's editable
 * swatch and optional relative tinting strength with a simplified
 * Kubelka–Munk model, so results are starting estimates only.
 */
(function (root, factory) {
  'use strict';
  var C = (root && root.PLColor) || (typeof require === 'function' ? require('./color.js') : null);
  var api = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PLMix = api;
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var TRIPLES_TO_REFINE = 10;
  // A simpler recipe is preferred when it is nearly as close as the best one.
  var MARGIN_ONE_PAINT = 1.0;
  var MARGIN_TWO_PAINTS = 0.6;

  function clampStrength(s) {
    var n = Number(s);
    if (!isFinite(n) || n <= 0) return 1;
    return C.clamp(n, 0.1, 10);
  }

  function prepare(paints) {
    return paints.map(function (p) {
      var lin = C.hexToLinear(p.hex);
      return {
        paint: p,
        ks: [C.reflectanceToKS(lin[0]), C.reflectanceToKS(lin[1]), C.reflectanceToKS(lin[2])],
        strength: clampStrength(p.strength)
      };
    });
  }

  /** Simulated linear-light color of a mix. amounts are relative weights. */
  function mixLinear(prepped, idxs, amounts) {
    var total = 0, k0 = 0, k1 = 0, k2 = 0;
    for (var i = 0; i < idxs.length; i++) {
      var p = prepped[idxs[i]];
      var w = amounts[i] * p.strength;
      total += w;
      k0 += w * p.ks[0];
      k1 += w * p.ks[1];
      k2 += w * p.ks[2];
    }
    if (total <= 0) return [0, 0, 0];
    return [
      C.ksToReflectance(k0 / total),
      C.ksToReflectance(k1 / total),
      C.ksToReflectance(k2 / total)
    ];
  }

  function score(prepped, idxs, amounts, targetLab) {
    return C.deltaE2000(C.linearToLab(mixLinear(prepped, idxs, amounts)), targetLab);
  }

  function makeRecipe(prepped, idxs, pcts, dE) {
    var items = idxs.map(function (idx, i) {
      return { paint: prepped[idx].paint, pct: pcts[i] };
    }).sort(function (a, b) { return b.pct - a.pct; });
    return {
      items: items,
      count: items.length,
      dE: dE,
      mixHex: C.linearToHex(mixLinear(prepped, idxs, pcts)),
      key: idxs.map(function (i) { return prepped[i].paint.id; }).sort().join('|')
    };
  }

  function bestPair(prepped, i, j, targetLab) {
    var best = Infinity, bestA = 50;
    var idxs = [i, j];
    for (var a = 1; a <= 99; a++) {
      var d = score(prepped, idxs, [a, 100 - a], targetLab);
      if (d < best) { best = d; bestA = a; }
    }
    return makeRecipe(prepped, idxs, [bestA, 100 - bestA], best);
  }

  // Non-uniform grid: fine near small amounts (tints/glazes), coarser mid-range.
  var LEVELS = [1, 2, 4, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 94, 97];

  function coarseTriple(prepped, idxs, targetLab) {
    var best = Infinity, bestA = 0, bestB = 0;
    for (var ia = 0; ia < LEVELS.length; ia++) {
      var a = LEVELS[ia];
      for (var ib = 0; ib < LEVELS.length; ib++) {
        var b = LEVELS[ib];
        if (100 - a - b < 1) break;
        var d = score(prepped, idxs, [a, b, 100 - a - b], targetLab);
        if (d < best) { best = d; bestA = a; bestB = b; }
      }
    }
    return { idxs: idxs, a: bestA, b: bestB, dE: best };
  }

  // Hill-climb in 1% steps from the coarse optimum.
  var MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  function refineTriple(prepped, coarse, targetLab) {
    var best = coarse.dE, a = coarse.a, b = coarse.b;
    for (var iter = 0; iter < 200; iter++) {
      var improved = false;
      for (var m = 0; m < MOVES.length; m++) {
        var na = a + MOVES[m][0], nb = b + MOVES[m][1], nc = 100 - na - nb;
        if (na < 1 || nb < 1 || nc < 1) continue;
        var d = score(prepped, coarse.idxs, [na, nb, nc], targetLab);
        if (d < best - 1e-9) { best = d; a = na; b = nb; improved = true; }
      }
      if (!improved) break;
    }
    return makeRecipe(prepped, coarse.idxs, [a, b, 100 - a - b], best);
  }

  function byDelta(a, b) { return a.dE - b.dE; }

  /**
   * Find starting recipes for a target color.
   * @param {Array} paints inventory records ({id, hex, strength, available, ...})
   * @param {string} targetHex
   * @param {{maxPaints?: number}} [options]
   * @returns {{recommended: object|null, options: Array, paintCount: number}}
   */
  function findRecipes(paints, targetHex, options) {
    var maxPaints = Math.max(1, Math.min(3, (options && options.maxPaints) || 3));
    var targetLab = C.hexToLab(targetHex);
    var usable = (paints || []).filter(function (p) {
      return p && p.available !== false && C.normalizeHex(p.hex);
    });
    if (!targetLab || !usable.length) return { recommended: null, options: [], paintCount: usable.length };

    var prepped = prepare(usable);
    var n = prepped.length;
    var singles = [], pairs = [], triples = [];

    for (var i = 0; i < n; i++) {
      singles.push(makeRecipe(prepped, [i], [100], score(prepped, [i], [1], targetLab)));
    }
    if (maxPaints >= 2) {
      for (i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) pairs.push(bestPair(prepped, i, j, targetLab));
      }
    }
    if (maxPaints >= 3 && n >= 3) {
      var coarse = [];
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          for (var k = j + 1; k < n; k++) coarse.push(coarseTriple(prepped, [i, j, k], targetLab));
        }
      }
      coarse.sort(byDelta);
      triples = coarse.slice(0, TRIPLES_TO_REFINE).map(function (c) {
        return refineTriple(prepped, c, targetLab);
      });
    }
    singles.sort(byDelta);
    pairs.sort(byDelta);
    triples.sort(byDelta);

    var all = singles.concat(pairs, triples);
    var bestOverall = all.reduce(function (m, r) { return r.dE < m ? r.dE : m; }, Infinity);

    var recommended;
    if (singles[0].dE <= bestOverall + MARGIN_ONE_PAINT) recommended = singles[0];
    else if (pairs.length && pairs[0].dE <= bestOverall + MARGIN_TWO_PAINTS) recommended = pairs[0];
    else recommended = triples[0] || pairs[0] || singles[0];

    // A few distinct alternatives across recipe sizes.
    var pool = [singles[0], singles[1], pairs[0], pairs[1], pairs[2], triples[0], triples[1], triples[2]];
    var seen = {};
    seen[recommended.key] = true;
    var alternatives = pool.filter(function (r) {
      if (!r || seen[r.key]) return false;
      seen[r.key] = true;
      return true;
    }).sort(byDelta).slice(0, 4);

    return {
      recommended: recommended,
      options: [recommended].concat(alternatives),
      paintCount: n
    };
  }

  /** Grams for each percentage in a batch. */
  function gramsFor(pct, batchGrams) {
    return (batchGrams * pct) / 100;
  }

  return {
    findRecipes: findRecipes,
    mixLinear: mixLinear,
    prepare: prepare,
    gramsFor: gramsFor
  };
});
