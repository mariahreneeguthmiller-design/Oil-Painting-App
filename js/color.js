/*
 * Pigment & Light — color math helpers.
 * sRGB <-> linear light, CIELAB (D65), CIEDE2000, and a simplified
 * single-constant Kubelka–Munk reflectance model used for mix estimates.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PLColor = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Returns '#RRGGBB' (uppercase) or null when the input is not a valid hex color. */
  function normalizeHex(input) {
    if (typeof input !== 'string') return null;
    var s = input.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) {
      s = s.split('').map(function (c) { return c + c; }).join('');
    }
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    return '#' + s.toUpperCase();
  }

  function hexToRgb(hex) {
    var n = normalizeHex(hex);
    if (!n) return null;
    return {
      r: parseInt(n.slice(1, 3), 16),
      g: parseInt(n.slice(3, 5), 16),
      b: parseInt(n.slice(5, 7), 16)
    };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }

  function srgbToLinear(c8) {
    var c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(v) {
    v = clamp(v, 0, 1);
    var c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return c * 255;
  }

  /** Lookup table: 8-bit sRGB channel -> linear light (0..1). */
  var SRGB_TO_LINEAR = new Float64Array(256);
  for (var i = 0; i < 256; i++) SRGB_TO_LINEAR[i] = srgbToLinear(i);

  function hexToLinear(hex) {
    var c = hexToRgb(hex);
    if (!c) return null;
    return [SRGB_TO_LINEAR[c.r], SRGB_TO_LINEAR[c.g], SRGB_TO_LINEAR[c.b]];
  }

  function linearToHex(lin) {
    return rgbToHex(linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2]));
  }

  var EPS = 216 / 24389;
  var KAPPA = 24389 / 27;
  function labF(t) {
    return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
  }

  /** Linear sRGB (D65) -> CIELAB (D65 reference white). */
  function linearToLab(lin) {
    var r = lin[0], g = lin[1], b = lin[2];
    var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    var y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
    var z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
    var fx = labF(x), fy = labF(y), fz = labF(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function hexToLab(hex) {
    var lin = hexToLinear(hex);
    return lin ? linearToLab(lin) : null;
  }

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;
  var POW25_7 = 6103515625; // 25^7

  /** CIEDE2000 color difference between two CIELAB colors. */
  function deltaE2000(lab1, lab2) {
    var L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
    var L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    var C1 = Math.sqrt(a1 * a1 + b1 * b1);
    var C2 = Math.sqrt(a2 * a2 + b2 * b2);
    var Cbar7 = Math.pow((C1 + C2) / 2, 7);
    var G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
    var a1p = (1 + G) * a1;
    var a2p = (1 + G) * a2;
    var C1p = Math.sqrt(a1p * a1p + b1 * b1);
    var C2p = Math.sqrt(a2p * a2p + b2 * b2);
    var h1p = (a1p === 0 && b1 === 0) ? 0 : (Math.atan2(b1, a1p) * DEG + 360) % 360;
    var h2p = (a2p === 0 && b2 === 0) ? 0 : (Math.atan2(b2, a2p) * DEG + 360) % 360;

    var dLp = L2 - L1;
    var dCp = C2p - C1p;
    var dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * RAD) / 2);

    var Lbarp = (L1 + L2) / 2;
    var Cbarp = (C1p + C2p) / 2;
    var hbarp;
    if (C1p * C2p === 0) hbarp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;

    var T = 1 -
      0.17 * Math.cos((hbarp - 30) * RAD) +
      0.24 * Math.cos(2 * hbarp * RAD) +
      0.32 * Math.cos((3 * hbarp + 6) * RAD) -
      0.20 * Math.cos((4 * hbarp - 63) * RAD);
    var dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
    var Cbarp7 = Math.pow(Cbarp, 7);
    var Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
    var Lm50sq = (Lbarp - 50) * (Lbarp - 50);
    var Sl = 1 + (0.015 * Lm50sq) / Math.sqrt(20 + Lm50sq);
    var Sc = 1 + 0.045 * Cbarp;
    var Sh = 1 + 0.015 * Cbarp * T;
    var Rt = -Math.sin(2 * dTheta * RAD) * Rc;

    var tL = dLp / Sl, tC = dCp / Sc, tH = dHp / Sh;
    return Math.sqrt(tL * tL + tC * tC + tH * tH + Rt * tC * tH);
  }

  /*
   * Simplified Kubelka–Munk (single-constant) per RGB channel.
   * Treats each linear-light channel as a reflectance and converts it to an
   * absorption/scattering ratio K/S, which mixes roughly linearly by amount.
   * This is a rough model of subtractive mixing, not a spectral simulation.
   */
  var R_MIN = 0.001;
  var R_MAX = 0.999;

  function reflectanceToKS(R) {
    R = clamp(R, R_MIN, R_MAX);
    return ((1 - R) * (1 - R)) / (2 * R);
  }

  function ksToReflectance(ks) {
    return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
  }

  return {
    clamp: clamp,
    normalizeHex: normalizeHex,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    srgbToLinear: srgbToLinear,
    linearToSrgb: linearToSrgb,
    SRGB_TO_LINEAR: SRGB_TO_LINEAR,
    hexToLinear: hexToLinear,
    linearToHex: linearToHex,
    linearToLab: linearToLab,
    hexToLab: hexToLab,
    deltaE2000: deltaE2000,
    reflectanceToKS: reflectanceToKS,
    ksToReflectance: ksToReflectance
  };
});
