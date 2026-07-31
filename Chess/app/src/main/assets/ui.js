/* ui.js — board rendering, input, and game flow. */
(function () {
  'use strict';

  var C = window.Chess;
  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var stage = document.getElementById('stage');

  // ---- persisted settings -------------------------------------------------
  var defaults = {
    level: 3, style: 'wood', side: 'w', flipped: false,
    coords: true, dots: true, arrow: true, sound: true
  };
  var S = load();

  function load() {
    var o = {};
    for (var k in defaults) o[k] = defaults[k];
    try {
      var raw = localStorage.getItem('chess.settings');
      if (raw) { var j = JSON.parse(raw); for (var k2 in j) if (k2 in o) o[k2] = j[k2]; }
    } catch (e) { /* storage unavailable — use defaults */ }
    return o;
  }
  function save() {
    try { localStorage.setItem('chess.settings', JSON.stringify(S)); } catch (e) {}
  }

  // ---- game state ---------------------------------------------------------
  var pos = new C.Position().reset();
  var sanLine = [];
  var lastMove = null;
  var selected = -1, targets = [];
  var thinking = false, gameOver = false;
  var anim = null, drag = null, pendingPromo = null;
  var hintMove = null;

  // ---- textures -----------------------------------------------------------
  var tex = { light: null, dark: null, w: null, b: null }, texReady = false;

  function loadStyle(name, done) {
    texReady = false;
    var need = 4, files = {
      light: 'tex/' + name + '_light.jpg', dark: 'tex/' + name + '_dark.jpg',
      w: 'tex/' + name + '_wpiece.jpg',   b: 'tex/' + name + '_bpiece.jpg'
    };
    Object.keys(files).forEach(function (k) {
      var img = new Image();
      img.onload = img.onerror = function () { if (--need === 0) { texReady = true; done && done(); } };
      img.src = files[k];
      tex[k] = img;
    });
  }

  // ---- layout -------------------------------------------------------------
  var cell = 0, boardPx = 0, dpr = 1;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    var vw = stage.clientWidth, vh = stage.clientHeight;
    boardPx = Math.floor(Math.min(vw, vh));
    cell = boardPx / 8;
    canvas.style.width = boardPx + 'px';
    canvas.style.height = boardPx + 'px';
    canvas.width = Math.round(boardPx * dpr);
    canvas.height = Math.round(boardPx * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // decide where the chrome lives so it never covers the board
    var gx = (vw - boardPx) / 2, gy = (vh - boardPx) / 2;
    var mode = gy >= 86 ? 'p' : (gx >= 112 ? 'l' : 'c');
    document.body.classList.toggle('lay-p', mode === 'p');
    document.body.classList.toggle('lay-l', mode === 'l');
    document.body.classList.toggle('lay-c', mode === 'c');
    document.documentElement.style.setProperty('--gutter', Math.floor(gx) + 'px');

    window.Pieces.clearCache();
    updateChrome();
    draw();
  }

  // ---- square <-> screen --------------------------------------------------
  function colRow(s) {
    var f = C.fileOf(s), r = C.rankOf(s);
    return S.flipped ? [7 - f, r] : [f, 7 - r];
  }
  function sqXY(s) { var cr = colRow(s); return [cr[0] * cell, cr[1] * cell]; }
  function xyToSq(x, y) {
    var col = Math.floor(x / cell), row = Math.floor(y / cell);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    var f = S.flipped ? 7 - col : col, r = S.flipped ? row : 7 - row;
    return C.sq(f, r);
  }

  // ---- drawing ------------------------------------------------------------
  function draw() {
    if (!cell) return;
    ctx.clearRect(0, 0, boardPx, boardPx);
    drawSquares();
    drawHighlights();
    drawPieces();
    drawArrow();
    drawCoords();
  }

  var patCache = {};
  function pattern(img, key) {
    if (patCache[key]) return patCache[key];
    if (!img || !img.complete || !img.naturalWidth) return null;
    var p = ctx.createPattern(img, 'repeat');
    var s = cell / img.naturalWidth;
    p.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    patCache[key] = p;
    return p;
  }

  function drawSquares() {
    patCache = {};
    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 8; col++) {
        var f = S.flipped ? 7 - col : col, r = S.flipped ? row : 7 - row;
        var light = (f + r) % 2 === 1;
        var x = col * cell, y = row * cell;
        ctx.save();
        ctx.translate(x, y);
        var p = pattern(light ? tex.light : tex.dark, light ? 'l' : 'd');
        ctx.fillStyle = p || (light ? '#c8b18a' : '#6a4a30');
        ctx.fillRect(0, 0, cell + .5, cell + .5);
        // per-square inner shading gives the board some depth
        var g = ctx.createLinearGradient(0, 0, 0, cell);
        g.addColorStop(0, 'rgba(255,255,255,.07)');
        g.addColorStop(1, 'rgba(0,0,0,.10)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cell + .5, cell + .5);
        ctx.restore();
      }
    }
    // global lighting across the whole board
    var vg = ctx.createRadialGradient(boardPx * .38, boardPx * .28, boardPx * .1,
                                      boardPx * .5, boardPx * .5, boardPx * .82);
    vg.addColorStop(0, 'rgba(255,247,230,.13)');
    vg.addColorStop(.6, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.30)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, boardPx, boardPx);
  }

  function drawHighlights() {
    var i, xy;

    if (lastMove) {
      [lastMove.from, lastMove.to].forEach(function (s) {
        var p = sqXY(s);
        ctx.fillStyle = 'rgba(211,169,95,.22)';
        ctx.fillRect(p[0], p[1], cell, cell);
      });
    }

    if (selected >= 0) {
      xy = sqXY(selected);
      ctx.save();
      ctx.strokeStyle = 'rgba(211,169,95,.95)';
      ctx.lineWidth = Math.max(2, cell * .045);
      ctx.strokeRect(xy[0] + ctx.lineWidth / 2, xy[1] + ctx.lineWidth / 2,
                     cell - ctx.lineWidth, cell - ctx.lineWidth);
      ctx.restore();
    }

    if (S.dots) {
      for (i = 0; i < targets.length; i++) {
        var t = targets[i];
        xy = sqXY(t.to);
        var cx = xy[0] + cell / 2, cy = xy[1] + cell / 2;
        ctx.save();
        if (t.capture) {
          ctx.strokeStyle = 'rgba(20,14,8,.42)';
          ctx.lineWidth = cell * .085;
          ctx.beginPath();
          ctx.arc(cx, cy, cell * .40, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(20,14,8,.34)';
          ctx.beginPath();
          ctx.arc(cx, cy, cell * .15, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // king in check
    if (!gameOver && pos.inCheck()) {
      var k = pos.kings[pos.turn ? 1 : 0];
      var p2 = sqXY(k);
      var g = ctx.createRadialGradient(p2[0] + cell / 2, p2[1] + cell / 2, cell * .1,
                                       p2[0] + cell / 2, p2[1] + cell / 2, cell * .62);
      g.addColorStop(0, 'rgba(209,85,63,.72)');
      g.addColorStop(1, 'rgba(209,85,63,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p2[0] - cell * .12, p2[1] - cell * .12, cell * 1.24, cell * 1.24);
    }
  }

  function drawPieces() {
    var animFrom = anim ? anim.from : -1;
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      var p = pos.board[s];
      if (!p) continue;
      if (drag && drag.sq === s) continue;
      if (anim && s === anim.to) continue;
      var xy = sqXY(s);
      paintPiece(p, xy[0], xy[1]);
    }

    if (anim) {
      var k = Math.min(1, (performance.now() - anim.t0) / anim.dur);
      var e = 1 - Math.pow(1 - k, 3);
      var a = sqXY(anim.from), b = sqXY(anim.to);
      paintPiece(anim.piece, a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, 1.04);
      if (k >= 1) {
        var after = anim.after; anim = null;
        if (after) after();
      } else { requestAnimationFrame(draw); }
    }

    if (drag) {
      paintPiece(pos.board[drag.sq], drag.x - cell / 2, drag.y - cell / 2, 1.12);
    }
  }

  function paintPiece(p, x, y, scale) {
    scale = scale || 1;
    var sprite = window.Pieces.sprite(C.typeOf(p), C.colourOf(p), cell * .86, S.style, tex);
    // draw the sprite centred in the square, sitting slightly low
    var dw = cell * .92 * scale, dh = dw * (sprite.height / sprite.width);
    var dx = x + (cell - dw) / 2, dy = y + (cell - dh) / 2 + cell * .02;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = cell * .10 * scale;
    ctx.shadowOffsetY = cell * .045 * scale;
    ctx.drawImage(sprite, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawArrow() {
    if (!S.arrow || !lastMove || anim) return;
    var a = sqXY(lastMove.from), b = sqXY(lastMove.to);
    var x1 = a[0] + cell / 2, y1 = a[1] + cell / 2;
    var x2 = b[0] + cell / 2, y2 = b[1] + cell / 2;
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 1) return;
    var ux = dx / len, uy = dy / len;
    var head = cell * .30, width = cell * .105;
    var sx = x1 + ux * cell * .26, sy = y1 + uy * cell * .26;
    var ex = x2 - ux * cell * .18, ey = y2 - uy * cell * .18;
    var bx = ex - ux * head, by = ey - uy * head;
    var px = -uy, py = ux;

    ctx.save();
    ctx.globalAlpha = .82;
    ctx.fillStyle = 'rgba(211,169,95,.9)';
    ctx.strokeStyle = 'rgba(40,28,12,.45)';
    ctx.lineWidth = Math.max(1, cell * .012);
    ctx.beginPath();
    ctx.moveTo(sx + px * width, sy + py * width);
    ctx.lineTo(bx + px * width, by + py * width);
    ctx.lineTo(bx + px * head * .55, by + py * head * .55);
    ctx.lineTo(ex, ey);
    ctx.lineTo(bx - px * head * .55, by - py * head * .55);
    ctx.lineTo(bx - px * width, by - py * width);
    ctx.lineTo(sx - px * width, sy - py * width);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCoords() {
    if (!S.coords) return;
    ctx.save();
    ctx.font = '600 ' + Math.round(cell * .17) + 'px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';
    for (var i = 0; i < 8; i++) {
      var fileChar = String.fromCharCode(97 + (S.flipped ? 7 - i : i));
      var rankChar = String(S.flipped ? i + 1 : 8 - i);
      // file letters along the bottom edge
      ctx.fillStyle = ((i + 7) % 2 === 1) ? 'rgba(20,14,8,.5)' : 'rgba(245,236,220,.55)';
      ctx.fillText(fileChar, i * cell + cell * .07, boardPx - cell * .24);
      // rank numbers along the left edge
      ctx.fillStyle = (i % 2 === 1) ? 'rgba(20,14,8,.5)' : 'rgba(245,236,220,.55)';
      ctx.fillText(rankChar, cell * .07, i * cell + cell * .06);
    }
    ctx.restore();
  }

  // ---- sound --------------------------------------------------------------
  var actx = null;
  function beep(kind) {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime;
      var o = actx.createOscillator(), g = actx.createGain();
      var freq = kind === 'capture' ? 180 : kind === 'end' ? 320 : 440;
      o.type = kind === 'capture' ? 'square' : 'triangle';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * .55, t + .09);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === 'capture' ? .22 : .13, t + .008);
      g.gain.exponentialRampToValueAtTime(.0001, t + .16);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + .18);
    } catch (e) {}
  }

  // ---- status / captured --------------------------------------------------
  var statusEl = document.getElementById('status');
  var takenEl = document.getElementById('takenByWhite');
  var edgeEl = document.getElementById('edgeTop');
  var VAL = [0, 1, 3, 3, 5, 9, 0];

  function humanTurn() {
    if (S.side === '2') return true;
    return (pos.turn === C.WHITE) === (S.side === 'w');
  }

  function updateChrome() {
    // captured pieces + material edge
    var counts = {}, s, p;
    for (s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      p = pos.board[s];
      if (p) counts[p] = (counts[p] || 0) + 1;
    }
    var start = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1, 9: 8, 10: 2, 11: 2, 12: 2, 13: 1 };
    var missing = [], edge = 0;
    Object.keys(start).forEach(function (k) {
      var n = start[k] - (counts[k] || 0);
      var code = +k;
      for (var i = 0; i < n; i++) missing.push(code);
      edge += (C.colourOf(code) ? -1 : 1) * n * VAL[C.typeOf(code)];
    });
    missing.sort(function (a, b) {
      return (C.colourOf(a) - C.colourOf(b)) || (VAL[C.typeOf(b)] - VAL[C.typeOf(a)]);
    });

    takenEl.innerHTML = '';
    var mini = Math.min(22, Math.max(14, Math.round(window.innerWidth / 20)));
    missing.forEach(function (code) {
      var sp = window.Pieces.sprite(C.typeOf(code), C.colourOf(code), mini, S.style, tex);
      var c2 = document.createElement('canvas');
      c2.width = sp.width; c2.height = sp.height;
      c2.style.width = sp.width + 'px'; c2.style.height = sp.height + 'px';
      c2.getContext('2d').drawImage(sp, 0, 0);
      takenEl.appendChild(c2);
    });
    edgeEl.textContent = edge > 0 ? '+' + edge : edge < 0 ? String(edge) : '';

    // status text
    var st = pos.status();
    statusEl.className = '';
    if (st === 'checkmate') {
      statusEl.textContent = (pos.turn === C.WHITE ? 'Black' : 'White') + ' wins';
      gameOver = true;
    } else if (st === 'stalemate') { statusEl.textContent = 'Stalemate'; gameOver = true; }
    else if (st === 'fifty')      { statusEl.textContent = 'Draw \u2014 50 moves'; gameOver = true; }
    else if (st === 'material')   { statusEl.textContent = 'Draw \u2014 material'; gameOver = true; }
    else if (st === 'repetition') { statusEl.textContent = 'Draw \u2014 repetition'; gameOver = true; }
    else if (thinking) { statusEl.textContent = 'Thinking\u2026'; statusEl.className = 'think'; }
    else if (st === 'check') { statusEl.textContent = 'Check'; statusEl.className = 'check'; }
    else if (S.side === '2') statusEl.textContent = (pos.turn === C.WHITE ? 'White' : 'Black') + ' to move';
    else statusEl.textContent = humanTurn() ? 'Your move' : 'Thinking\u2026';

    document.getElementById('btnUndo').disabled = sanLine.length === 0 || thinking;
    document.getElementById('btnHint').disabled = thinking || gameOver || !humanTurn();

    // move list
    var out = '';
    sanLine.forEach(function (m, i) { out += (i % 2 === 0 ? (i / 2 + 1) + '. ' : '') + m + ' '; });
    document.getElementById('moves').textContent = out.trim() || '\u2014';
  }

  // ---- move application ---------------------------------------------------
  function applyMove(m, animate) {
    var from = C.mFrom(m), to = C.mTo(m);
    var capture = !!pos.board[to] || C.mFlag(m) === C.F_EP;
    selected = -1; targets = []; hintMove = null;

    sanLine.push(pos.moveToSan(m));
    var piece = pos.board[from];

    if (animate) {
      anim = { piece: piece, from: from, to: to, t0: performance.now(), dur: 170,
               after: function () { finishMove(m, capture); } };
      pos.makeMove(m);
      pos.repetition.push(pos.key());
      lastMove = { from: from, to: to };
      requestAnimationFrame(draw);
    } else {
      pos.makeMove(m);
      pos.repetition.push(pos.key());
      lastMove = { from: from, to: to };
      finishMove(m, capture);
      draw();
    }
  }

  function finishMove(m, capture) {
    beep(capture ? 'capture' : 'move');
    updateChrome();
    draw();
    if (gameOver) { beep('end'); return; }
    if (!humanTurn()) scheduleAI();
  }

  function scheduleAI() {
    if (gameOver || humanTurn()) return;
    thinking = true;
    updateChrome();
    draw();
    // let the browser paint "Thinking…" before the (synchronous) search runs
    setTimeout(function () {
      var r = pos.think(S.level, sanLine);
      thinking = false;
      if (!r) { updateChrome(); return; }
      applyMove(r.move, true);
    }, 40);
  }

  // ---- input --------------------------------------------------------------
  function legalFrom(s) {
    var all = pos.legalMoves(false), out = [];
    for (var i = 0; i < all.length; i++) {
      if (C.mFrom(all[i]) === s) {
        out.push({ to: C.mTo(all[i]), move: all[i],
                   capture: !!pos.board[C.mTo(all[i])] || C.mFlag(all[i]) === C.F_EP });
      }
    }
    return out;
  }

  function pick(s) {
    var p = pos.board[s];
    if (p && C.colourOf(p) === pos.turn) {
      selected = s;
      targets = legalFrom(s);
      return true;
    }
    return false;
  }

  function tryMove(to) {
    var matches = targets.filter(function (t) { return t.to === to; });
    if (!matches.length) return false;
    if (matches.length > 1) {          // promotion — ask which piece
      pendingPromo = matches;
      showPromo();
      return true;
    }
    applyMove(matches[0].move, false);
    return true;
  }

  function evPos(e) {
    var r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (thinking || gameOver || anim || pendingPromo) return;
    if (!humanTurn()) return;
    e.preventDefault();
    var xy = evPos(e), s = xyToSq(xy[0], xy[1]);
    if (s < 0) return;

    if (selected >= 0 && tryMove(s)) return;
    if (pick(s)) {
      drag = { sq: s, x: xy[0], y: xy[1] };
      canvas.setPointerCapture(e.pointerId);
    } else {
      selected = -1; targets = [];
    }
    draw();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    e.preventDefault();
    var xy = evPos(e);
    drag.x = xy[0]; drag.y = xy[1];
    draw();
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!drag) return;
    e.preventDefault();
    var xy = evPos(e), s = xyToSq(xy[0], xy[1]);
    var from = drag.sq;
    drag = null;
    if (s >= 0 && s !== from) { if (tryMove(s)) return; }
    draw();
  });

  canvas.addEventListener('pointercancel', function () { drag = null; draw(); });

  // ---- promotion ----------------------------------------------------------
  var promoEl = document.getElementById('promo');
  function showPromo() {
    if (!promoEl) return;
    var card = promoEl.querySelector('.card');
    card.innerHTML = '';
    pendingPromo.forEach(function (t) {
      var type = C.mPromo(t.move);
      var sp = window.Pieces.sprite(type, pos.turn, Math.min(72, cell), S.style, tex);
      var c2 = document.createElement('canvas');
      c2.width = sp.width; c2.height = sp.height;
      c2.style.width = (sp.width) + 'px'; c2.style.height = (sp.height) + 'px';
      c2.getContext('2d').drawImage(sp, 0, 0);
      c2.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        promoEl.classList.remove('on');
        var mv = t.move;
        pendingPromo = null;
        applyMove(mv, false);
      });
      card.appendChild(c2);
    });
    promoEl.classList.add('on');
  }

  // ---- controls -----------------------------------------------------------
  function newGame() {
    pos = new C.Position().reset();
    sanLine = []; lastMove = null; selected = -1; targets = [];
    gameOver = false; thinking = false; anim = null; drag = null; hintMove = null;
    updateChrome(); draw();
    if (!humanTurn()) scheduleAI();
  }

  document.getElementById('btnNew').addEventListener('click', newGame);

  document.getElementById('btnUndo').addEventListener('click', function () {
    if (thinking || !sanLine.length) return;
    var back = (S.side === '2') ? 1 : Math.min(2, sanLine.length);
    for (var i = 0; i < back; i++) {
      pos.unmakeMove(); pos.repetition.pop(); sanLine.pop();
    }
    gameOver = false; lastMove = null; selected = -1; targets = [];
    updateChrome(); draw();
  });

  document.getElementById('btnHint').addEventListener('click', function () {
    if (thinking || gameOver) return;
    thinking = true; updateChrome();
    setTimeout(function () {
      var r = pos.think(Math.max(3, S.level), sanLine);
      thinking = false;
      if (r) { lastMove = { from: C.mFrom(r.move), to: C.mTo(r.move) }; }
      updateChrome(); draw();
    }, 40);
  });

  var scrim = document.getElementById('scrim'), sheet = document.getElementById('sheet');
  function openSheet(on) {
    scrim.classList.toggle('on', on);
    sheet.classList.toggle('on', on);
  }
  document.getElementById('btnMore').addEventListener('click', function () { openSheet(true); });
  document.getElementById('btnClose').addEventListener('click', function () { openSheet(false); });
  scrim.addEventListener('click', function () { openSheet(false); });

  document.getElementById('btnFlip').addEventListener('click', function () {
    S.flipped = !S.flipped; save(); draw();
  });

  document.getElementById('btnCopy').addEventListener('click', function () {
    var pgn = '';
    sanLine.forEach(function (m, i) { pgn += (i % 2 === 0 ? (i / 2 + 1) + '. ' : '') + m + ' '; });
    pgn = pgn.trim();
    try { navigator.clipboard.writeText(pgn); } catch (e) {}
    var b = document.getElementById('btnCopy'), old = b.textContent;
    b.textContent = 'Copied'; setTimeout(function () { b.textContent = old; }, 1200);
  });

  function wireSeg(id, key, cb) {
    var el = document.getElementById(id);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var v = b.dataset.v;
      S[key] = (key === 'level') ? +v : v;
      save(); syncSeg(id, key); cb && cb();
    });
  }
  function syncSeg(id, key) {
    var el = document.getElementById(id);
    Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', String(S[key]) === b.dataset.v);
    });
  }

  wireSeg('segLevel', 'level');
  wireSeg('segStyle', 'style', function () {
    window.Pieces.clearCache();
    loadStyle(S.style, function () { patCache = {}; updateChrome(); draw(); });
  });
  wireSeg('segSide', 'side', function () {
    S.flipped = (S.side === 'b'); save(); newGame();
  });

  document.getElementById('segOpts').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var k = b.dataset.k;
    S[k] = !S[k]; save(); syncOpts(); draw();
  });
  function syncOpts() {
    Array.prototype.forEach.call(document.querySelectorAll('#segOpts button'), function (b) {
      b.classList.toggle('on', !!S[b.dataset.k]);
    });
  }

  // ---- Android back button ------------------------------------------------
  window.__handleBack = function () {
    if (pendingPromo) { promoEl.classList.remove('on'); pendingPromo = null; draw(); return true; }
    if (sheet.classList.contains('on')) { openSheet(false); return true; }
    if (selected >= 0) { selected = -1; targets = []; draw(); return true; }
    return false;
  };

  // ---- boot ---------------------------------------------------------------
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 120); });

  syncSeg('segLevel', 'level'); syncSeg('segStyle', 'style');
  syncSeg('segSide', 'side'); syncOpts();

  loadStyle(S.style, function () {
    layout();
    updateChrome();
    if (!humanTurn()) scheduleAI();
  });
  layout();
  updateChrome();

})();
