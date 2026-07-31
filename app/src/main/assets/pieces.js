/* pieces.js — original Staunton-style vector artwork, drawn in a 100x100 box
   and filled with the board-style material texture. */
(function (root) {
  'use strict';

  // Shared foot and collar used by every piece.
  var BASE   = 'M20,93 H80 C80,87.5 76,85.5 72,84 H28 C24,85.5 20,87.5 20,93 Z';
  var COLLAR = 'M27.5,84 H72.5 L69.5,78.5 H30.5 Z';

  var PATHS = {
    // --- pawn -------------------------------------------------------------
    1: [
      'M43,44 C42.5,54 38,64 34.5,78.5 H65.5 C62,64 57.5,54 57,44 Z',
      'M41,39.5 H59 L57.5,44.5 H42.5 Z',
      'M50,15 C56.9,15 62.5,20.6 62.5,27.5 C62.5,34.4 56.9,40 50,40 C43.1,40 37.5,34.4 37.5,27.5 C37.5,20.6 43.1,15 50,15 Z',
      COLLAR, BASE
    ],
    // --- knight -----------------------------------------------------------
    2: [
      'M68,78.5 C68,64 71,52 71,41 C71,29 67,19 59,13 L57.5,8.5 L52.5,2.5 ' +
      'L49.5,11.5 C43.5,12.5 37.5,15.5 32.5,20.5 C27.5,25.5 23.8,32 22.3,37.5 ' +
      'C21.5,40.6 23,43.6 26,44.6 L31.5,44.6 C33,46.6 34,48.8 34.5,51.4 ' +
      'C35.4,59.5 32,68.5 30.5,78.5 Z',
      'M58,13.5 C63.5,18.5 66.8,26 67.6,35 C68.4,44 67.6,54 65.6,62.4 ' +
      'L61.6,60.4 C63.4,51 64.2,41 63.4,32.6 C62.6,24.6 60.6,18.6 56,15.4 Z',
      COLLAR, BASE
    ],
    // --- bishop -----------------------------------------------------------
    3: [
      'M42,50 C41.5,59 37.5,68 34.5,78.5 H65.5 C62.5,68 58.5,59 58,50 Z',
      'M40,45.5 H60 L58.5,50.5 H41.5 Z',
      'M50,15.5 C58.5,15.5 64,23 64,31.5 C64,39.5 58.5,46 50,46 ' +
      'C41.5,46 36,39.5 36,31.5 C36,23 41.5,15.5 50,15.5 Z',
      'M50,5.5 C52.6,5.5 54.7,7.6 54.7,10.2 C54.7,12.8 52.6,14.9 50,14.9 ' +
      'C47.4,14.9 45.3,12.8 45.3,10.2 C45.3,7.6 47.4,5.5 50,5.5 Z',
      COLLAR, BASE
    ],
    // --- rook -------------------------------------------------------------
    4: [
      'M29,17 H38 V25.5 H45.5 V17 H54.5 V25.5 H62 V17 H71 V36.5 H29 Z',
      'M26.5,36.5 H73.5 L70,43 H30 Z',
      'M33,43 C33,55 31.5,67 30.5,78.5 H69.5 C68.5,67 67,55 67,43 Z',
      COLLAR, BASE
    ],
    // --- queen ------------------------------------------------------------
    5: [
      'M27,30 L33,41 L38.5,21 L44,35 L50,17 L56,35 L61.5,21 L67,41 L73,30 L68,53 H32 Z',
      'M27,25.5 C29.5,25.5 31.5,27.5 31.5,30 C31.5,32.5 29.5,34.5 27,34.5 ' +
      'C24.5,34.5 22.5,32.5 22.5,30 C22.5,27.5 24.5,25.5 27,25.5 Z',
      'M73,25.5 C75.5,25.5 77.5,27.5 77.5,30 C77.5,32.5 75.5,34.5 73,34.5 ' +
      'C70.5,34.5 68.5,32.5 68.5,30 C68.5,27.5 70.5,25.5 73,25.5 Z',
      'M38.5,16.5 C41,16.5 43,18.5 43,21 C43,23.5 41,25.5 38.5,25.5 ' +
      'C36,25.5 34,23.5 34,21 C34,18.5 36,16.5 38.5,16.5 Z',
      'M61.5,16.5 C64,16.5 66,18.5 66,21 C66,23.5 64,25.5 61.5,25.5 ' +
      'C59,25.5 57,23.5 57,21 C57,18.5 59,16.5 61.5,16.5 Z',
      'M50,12 C52.8,12 55,14.2 55,17 C55,19.8 52.8,22 50,22 ' +
      'C47.2,22 45,19.8 45,17 C45,14.2 47.2,12 50,12 Z',
      'M31,53 H69 L66.5,59.5 H33.5 Z',
      'M35,59.5 C34.5,67 32.5,73 30.5,78.5 H69.5 C67.5,73 65.5,67 65,59.5 Z',
      COLLAR, BASE
    ],
    // --- king -------------------------------------------------------------
    6: [
      'M45.5,2 H54.5 V10 H62 V18.5 H54.5 V27 H45.5 V18.5 H38 V10 H45.5 Z',
      'M32,32.5 C32,26 40,23.5 50,23.5 C60,23.5 68,26 68,32.5 L66,45.5 H34 Z',
      'M31.5,45.5 H68.5 L66,52 H34 Z',
      'M36,52 C35.5,61 32.5,71 30.5,78.5 H69.5 C67.5,71 64.5,61 64,52 Z',
      COLLAR, BASE
    ]
  };

  // Small darker detail marks (eye, bishop's mitre slit) drawn after shading.
  var DETAIL = {
    2: [{ type: 'dot', x: 47, y: 25, r: 2.4 },
        { type: 'dot', x: 26, y: 38.5, r: 1.4 },
        { type: 'line', d: 'M24,43.5 L31,43.2' }],
    3: [{ type: 'line', d: 'M53,20 C57,24 58.5,28 58.5,32' }]
  };

  var cache = {};

  /* Render one piece to an offscreen canvas.
     type   1..6, colour 0 = white / 8 = black
     size   pixel size of the square the piece sits in
     style  style name, used for the cache key
     tex    { w: Image, b: Image } material textures  */
  function sprite(type, colour, size, style, tex) {
    var key = style + '|' + type + '|' + colour + '|' + Math.round(size);
    if (cache[key]) return cache[key];

    var pad = Math.round(size * 0.04);
    var dim = Math.round(size) + pad * 2;
    var c = document.createElement('canvas');
    c.width = dim; c.height = dim;
    var g = c.getContext('2d');

    var scale = size / 100;
    var img = colour ? tex.b : tex.w;
    var dark = !!colour;

    // Build the outline as one Path2D in device pixels.
    var path = new Path2D();
    var m = new DOMMatrix([scale, 0, 0, scale, pad, pad]);
    PATHS[type].forEach(function (d) { path.addPath(new Path2D(d), m); });

    // 1. material fill
    g.save();
    g.clip(path);
    if (img && img.complete && img.naturalWidth) {
      var p = g.createPattern(img, 'repeat');
      // scale the texture so roughly one tile covers the piece
      var ts = (size * 1.35) / img.naturalWidth;
      p.setTransform(new DOMMatrix([ts, 0, 0, ts, 0, 0]));
      g.fillStyle = p;
    } else {
      g.fillStyle = dark ? '#2c2723' : '#d9cdb4';
    }
    g.fillRect(0, 0, dim, dim);

    // 2. vertical form shading — light from above
    var vg = g.createLinearGradient(0, pad, 0, pad + size);
    vg.addColorStop(0,    dark ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.34)');
    vg.addColorStop(0.30, 'rgba(255,255,255,0)');
    vg.addColorStop(0.72, dark ? 'rgba(0,0,0,.30)' : 'rgba(0,0,0,.18)');
    vg.addColorStop(1,    dark ? 'rgba(0,0,0,.62)' : 'rgba(0,0,0,.42)');
    g.fillStyle = vg;
    g.fillRect(0, 0, dim, dim);

    // 3. lateral roundness — bright left rim, dark right edge
    var hg = g.createLinearGradient(pad, 0, pad + size, 0);
    hg.addColorStop(0,    'rgba(0,0,0,.34)');
    hg.addColorStop(0.16, dark ? 'rgba(255,255,255,.20)' : 'rgba(255,255,255,.40)');
    hg.addColorStop(0.5,  'rgba(255,255,255,0)');
    hg.addColorStop(0.86, 'rgba(0,0,0,.22)');
    hg.addColorStop(1,    'rgba(0,0,0,.44)');
    g.fillStyle = hg;
    g.fillRect(0, 0, dim, dim);
    g.restore();

    // 4. outline
    g.strokeStyle = dark ? 'rgba(0,0,0,.85)' : 'rgba(60,44,26,.62)';
    g.lineWidth = Math.max(1, size * 0.016);
    g.lineJoin = 'round';
    g.stroke(path);

    // 5. carved details
    var det = DETAIL[type];
    if (det) {
      g.save();
      g.strokeStyle = dark ? 'rgba(0,0,0,.7)' : 'rgba(70,52,30,.55)';
      g.fillStyle = g.strokeStyle;
      g.lineWidth = Math.max(1, size * 0.018);
      g.lineCap = 'round';
      det.forEach(function (o) {
        if (o.type === 'dot') {
          g.beginPath();
          g.arc(pad + o.x * scale, pad + o.y * scale, o.r * scale, 0, Math.PI * 2);
          g.fill();
        } else {
          g.stroke(pathFrom(o.d, m));
        }
      });
      g.restore();
    }

    cache[key] = c;
    return c;
  }

  // helper: Path2D from svg data with a matrix applied
  function pathFrom(d, m) {
    var p = new Path2D();
    p.addPath(new Path2D(d), m);
    return p;
  }

  function clearCache() { cache = {}; }

  root.Pieces = { sprite: sprite, clearCache: clearCache, PATHS: PATHS };

})(typeof window !== 'undefined' ? window : globalThis);
