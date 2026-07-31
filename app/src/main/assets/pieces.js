/* pieces.js — Staunton piece artwork.
   Each piece is a set of sub-paths drawn in a 100x100 box, filled with the
   board style's material and lit from the upper left: ambient occlusion at
   the foot, a soft form gradient, a rim light along the lit edge and a
   specular sheen on the turned surfaces. */
(function (root) {
  'use strict';

  var BASE   = 'M22.5,94 H77.5 C77.5,88 74,85.8 70,84.3 H30 C26,85.8 22.5,88 22.5,94 Z';
  var COLLAR = 'M28.5,84.3 H71.5 L68.6,79 H31.4 Z';

  var PATHS = {
    // pawn
    1: [
      'M45,47 C44.6,56 41,66 38,79 H62 C59,66 55.4,56 55,47 Z',
      'M43.6,42.4 H56.4 L55.2,47.4 H44.8 Z',
      'M50,21.6 C55.2,21.6 59.4,25.8 59.4,31 C59.4,36.2 55.2,40.4 50,40.4 ' +
      'C44.8,40.4 40.6,36.2 40.6,31 C40.6,25.8 44.8,21.6 50,21.6 Z',
      COLLAR, BASE
    ],
    // knight
    2: [
      'M67.5,79 C67.5,64.5 70.5,52.5 70.5,41.5 C70.5,29.5 66.5,19.5 58.6,13.4 ' +
      'L57.1,8.8 L52.2,2.6 L49.2,11.7 C43.3,12.7 37.4,15.7 32.5,20.7 ' +
      'C27.6,25.7 23.9,32.2 22.4,37.7 C21.6,40.8 23.1,43.8 26.1,44.8 ' +
      'L31.5,44.8 C33,46.8 34,49 34.5,51.6 C35.4,59.7 32.4,68.8 31,79 Z',
      'M57.7,13.9 C63.1,18.9 66.4,26.4 67.2,35.4 C68,44.4 67.2,54.4 65.2,62.8 ' +
      'L61.3,60.8 C63.1,51.4 63.9,41.4 63.1,33 C62.3,25 60.3,19 55.8,15.8 Z',
      COLLAR, BASE
    ],
    // bishop
    3: [
      'M43,50.5 C42.5,60.5 38.4,69.5 35.4,79 H64.6 C61.6,69.5 57.5,60.5 57,50.5 Z',
      'M41,45.8 H59 L57.6,50.9 H42.4 Z',
      'M50,11.5 C57.8,16.2 63.4,23.6 63.4,31.4 C63.4,40 57.8,46.4 50,46.4 ' +
      'C42.2,46.4 36.6,40 36.6,31.4 C36.6,23.6 42.2,16.2 50,11.5 Z',
      'M50,2.8 C53.1,2.8 55.6,5.3 55.6,8.4 C55.6,11.5 53.1,14 50,14 ' +
      'C46.9,14 44.4,11.5 44.4,8.4 C44.4,5.3 46.9,2.8 50,2.8 Z',
      COLLAR, BASE
    ],
    // rook
    4: [
      'M30.5,15.5 H38.4 V23.8 H45.6 V15.5 H54.4 V23.8 H61.6 V15.5 H69.5 V35 H30.5 Z',
      'M28,35 H72 L68.8,41.4 H31.2 Z',
      'M34.5,41.4 C34.5,54 32.6,66.5 31.5,79 H68.5 C67.4,66.5 65.5,54 65.5,41.4 Z',
      COLLAR, BASE
    ],
    // queen
    5: [
      'M28,28.5 L33.6,42 L39,19.5 L44.6,33.6 L50,15.5 L55.4,33.6 L61,19.5 ' +
      'L66.4,42 L72,28.5 L67.6,54 H32.4 Z',
      'M28,24 C30.5,24 32.5,26 32.5,28.5 C32.5,31 30.5,33 28,33 ' +
      'C25.5,33 23.5,31 23.5,28.5 C23.5,26 25.5,24 28,24 Z',
      'M72,24 C74.5,24 76.5,26 76.5,28.5 C76.5,31 74.5,33 72,33 ' +
      'C69.5,33 67.5,31 67.5,28.5 C67.5,26 69.5,24 72,24 Z',
      'M39,15 C41.5,15 43.5,17 43.5,19.5 C43.5,22 41.5,24 39,24 ' +
      'C36.5,24 34.5,22 34.5,19.5 C34.5,17 36.5,15 39,15 Z',
      'M61,15 C63.5,15 65.5,17 65.5,19.5 C65.5,22 63.5,24 61,24 ' +
      'C58.5,24 56.5,22 56.5,19.5 C56.5,17 58.5,15 61,15 Z',
      'M50,10.2 C52.9,10.2 55.3,12.6 55.3,15.5 C55.3,18.4 52.9,20.8 50,20.8 ' +
      'C47.1,20.8 44.7,18.4 44.7,15.5 C44.7,12.6 47.1,10.2 50,10.2 Z',
      'M32.4,54 H67.6 L65.2,60.2 H34.8 Z',
      'M36.4,60.2 C35.9,68 33.4,73.8 31.2,79 H68.8 C66.6,73.8 64.1,68 63.6,60.2 Z',
      COLLAR, BASE
    ],
    // king
    6: [
      'M46,1.8 H54 V9.8 H61.6 V17.8 H54 V27 H46 V17.8 H38.4 V9.8 H46 Z',
      'M33,32.5 C33,26 40.6,23.4 50,23.4 C59.4,23.4 67,26 67,32.5 L65,46 H35 Z',
      'M32.6,46 H67.4 L65,52.2 H35 Z',
      'M37,52.2 C36.5,62 33.4,71.2 31,79 H69 C66.6,71.2 63.5,62 63,52.2 Z',
      COLLAR, BASE
    ]
  };

  // carved detail marks, drawn after the shading
  var DETAIL = {
    2: [{ t: 'dot',  x: 47,   y: 25,   r: 2.3 },
        { t: 'dot',  x: 25.8, y: 38.6, r: 1.4 },
        { t: 'line', d: 'M23.6,43.6 L31,43.3' }],
    3: [{ t: 'line', d: 'M52.6,17.5 C58.4,22.8 60.6,27.6 60.6,33.4' }]
  };

  var cache = {};
  var SS = 2;                       // supersample factor — keeps edges crisp

  function pathFrom(d, m) {
    var p = new Path2D();
    p.addPath(new Path2D(d), m);
    return p;
  }

  /* Offscreen canvas holding one lit piece.
     size = on-board pixel size, tex = { w, b } material images. */
  function sprite(type, colour, size, style, tex) {
    size = Math.max(8, Math.round(size));
    var key = style + '|' + type + '|' + colour + '|' + size;
    if (cache[key]) return cache[key];

    var pad = Math.round(size * 0.05);
    var dim = (size + pad * 2) * SS;
    var c = document.createElement('canvas');
    c.width = dim; c.height = dim;
    var g = c.getContext('2d');

    var scale = size * SS / 100, off = pad * SS;
    var dark = !!colour;
    var img = dark ? tex.b : tex.w;

    var path = new Path2D();
    var m = new DOMMatrix([scale, 0, 0, scale, off, off]);
    PATHS[type].forEach(function (d) { path.addPath(new Path2D(d), m); });

    var top = off, h = size * SS, left = off, w = size * SS;

    g.save();
    g.clip(path);

    // 1 — material
    if (img && img.complete && img.naturalWidth) {
      var p = g.createPattern(img, 'repeat');
      var ts = (size * SS * 1.5) / img.naturalWidth;
      p.setTransform(new DOMMatrix([ts, 0, 0, ts, 0, 0]));
      g.fillStyle = p;
    } else {
      g.fillStyle = dark ? '#2b2622' : '#ded2ba';
    }
    g.fillRect(0, 0, dim, dim);

    // 2 — overall form: lit from above, darkening into the foot
    var vg = g.createLinearGradient(0, top, 0, top + h);
    vg.addColorStop(0.00, dark ? 'rgba(255,246,228,.30)' : 'rgba(255,250,238,.46)');
    vg.addColorStop(0.26, 'rgba(255,255,255,0)');
    vg.addColorStop(0.62, dark ? 'rgba(0,0,0,.20)' : 'rgba(60,40,18,.13)');
    vg.addColorStop(0.88, dark ? 'rgba(0,0,0,.52)' : 'rgba(48,32,14,.36)');
    vg.addColorStop(1.00, dark ? 'rgba(0,0,0,.70)' : 'rgba(40,26,10,.52)');
    g.fillStyle = vg;
    g.fillRect(0, 0, dim, dim);

    // 3 — lateral roundness: bright a third in from the left, falling to a dark right edge
    var hg = g.createLinearGradient(left, 0, left + w, 0);
    hg.addColorStop(0.00, 'rgba(0,0,0,.42)');
    hg.addColorStop(0.13, dark ? 'rgba(255,244,222,.16)' : 'rgba(255,252,244,.34)');
    hg.addColorStop(0.30, dark ? 'rgba(255,244,222,.22)' : 'rgba(255,252,244,.44)');
    hg.addColorStop(0.55, 'rgba(255,255,255,0)');
    hg.addColorStop(0.84, 'rgba(0,0,0,.26)');
    hg.addColorStop(1.00, 'rgba(0,0,0,.50)');
    g.fillStyle = hg;
    g.fillRect(0, 0, dim, dim);

    // 4 — specular sheen on the upper body
    var sg = g.createRadialGradient(left + w * 0.34, top + h * 0.26, 1,
                                    left + w * 0.34, top + h * 0.26, w * 0.42);
    sg.addColorStop(0, dark ? 'rgba(255,250,235,.20)' : 'rgba(255,255,255,.34)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, dim, dim);

    // 5 — ambient occlusion where the piece meets the board
    var ao = g.createLinearGradient(0, top + h * 0.80, 0, top + h);
    ao.addColorStop(0, 'rgba(0,0,0,0)');
    ao.addColorStop(1, dark ? 'rgba(0,0,0,.55)' : 'rgba(38,24,8,.42)');
    g.fillStyle = ao;
    g.fillRect(0, 0, dim, dim);

    // 6 — rim light: an inner stroke, brightest along the top-left edge
    var rim = g.createLinearGradient(left, top, left + w * 0.9, top + h * 0.9);
    rim.addColorStop(0.00, dark ? 'rgba(255,238,205,.55)' : 'rgba(255,255,250,.80)');
    rim.addColorStop(0.42, 'rgba(255,255,255,0)');
    rim.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.strokeStyle = rim;
    g.lineWidth = Math.max(1, size * SS * 0.022);
    g.lineJoin = 'round';
    g.stroke(path);
    g.restore();

    // 7 — outline
    g.strokeStyle = dark ? 'rgba(0,0,0,.72)' : 'rgba(72,50,24,.48)';
    g.lineWidth = Math.max(1, size * SS * 0.014);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke(path);

    // 8 — carved details
    var det = DETAIL[type];
    if (det) {
      g.save();
      g.strokeStyle = dark ? 'rgba(0,0,0,.62)' : 'rgba(80,58,28,.46)';
      g.fillStyle = g.strokeStyle;
      g.lineWidth = Math.max(1, size * SS * 0.017);
      g.lineCap = 'round';
      det.forEach(function (o) {
        if (o.t === 'dot') {
          g.beginPath();
          g.arc(off + o.x * scale, off + o.y * scale, o.r * scale, 0, Math.PI * 2);
          g.fill();
        } else {
          g.stroke(pathFrom(o.d, m));
        }
      });
      g.restore();
    }

    c._pad = pad; c._size = size;
    cache[key] = c;
    return c;
  }

  /* Soft contact shadow, drawn on the board underneath a piece.
     lift 0..1 raises the piece: the shadow grows, softens and slides away. */
  function contactShadow(ctx, cx, cy, cell, lift) {
    lift = lift || 0;
    var rx = cell * (0.30 + lift * 0.13);
    var ry = cell * (0.10 + lift * 0.035);
    var oy = cell * (0.30 + lift * 0.12);
    var ox = cell * lift * 0.10;
    var alpha = 0.40 - lift * 0.16;

    ctx.save();
    ctx.translate(cx + ox, cy + oy);
    ctx.scale(1, ry / rx);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(0,0,0,' + alpha.toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(0,0,0,' + (alpha * 0.5).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function clearCache() { cache = {}; }

  root.Pieces = {
    sprite: sprite,
    contactShadow: contactShadow,
    clearCache: clearCache,
    PATHS: PATHS
  };

})(typeof window !== 'undefined' ? window : globalThis);
