/* ui.js — board rendering, motion, input and game flow. */
(function () {
  'use strict';

  var C = window.Chess;
  var P = window.Pieces;
  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var stage = document.getElementById('stage');

  // ---- settings -----------------------------------------------------------
  var defaults = {
    level: 2, style: 'wood', side: 'w', flipped: false,
    coords: true, dots: true, arrow: false, sound: true
  };
  var S = (function () {
    var o = {};
    for (var k in defaults) o[k] = defaults[k];
    try {
      var raw = localStorage.getItem('chess.settings');
      if (raw) { var j = JSON.parse(raw); for (var k2 in j) if (k2 in o) o[k2] = j[k2]; }
    } catch (e) {}
    return o;
  })();
  function save() { try { localStorage.setItem('chess.settings', JSON.stringify(S)); } catch (e) {} }

  // ---- game state ---------------------------------------------------------
  var pos = new C.Position().reset();
  var sanLine = [];
  var lastMove = null;
  var selected = -1, targets = [];
  var thinking = false, gameOver = false;
  var pendingPromo = null;
  var anim = null, drag = null;
  var hintMove = null;

  // ---- animation state ----------------------------------------------------
  var fx = { lift: 0, liftT: 0, hl: 0, hlT: 0, check: 0, checkT: 0, pulse: 0, board: 0 };
  var running = false, lastFrame = 0;

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) { var c = 0.85, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  function kick() { if (!running) { running = true; lastFrame = performance.now(); requestAnimationFrame(frame); } }

  function frame(now) {
    var dt = Math.min(64, now - lastFrame) / 1000;
    lastFrame = now;

    // exponential smoothing, frame-rate independent
    var k = 1 - Math.pow(0.0016, dt);
    fx.lift += (fx.liftT - fx.lift) * k;
    fx.hl += (fx.hlT - fx.hl) * k;
    fx.check += (fx.checkT - fx.check) * k;
    fx.board += (1 - fx.board) * (1 - Math.pow(0.02, dt));
    fx.pulse = (fx.pulse + dt * 1.7) % (Math.PI * 2);

    if (anim) {
      var t = (now - anim.t0) / anim.dur;
      if (t >= 1) { var after = anim.after; anim = null; if (after) after(); }
    }

    draw();

    var busy = anim || Math.abs(fx.lift - fx.liftT) > 0.002 || Math.abs(fx.hl - fx.hlT) > 0.002 ||
               Math.abs(fx.check - fx.checkT) > 0.002 || fx.board < 0.999 ||
               fx.checkT > 0.5 || thinking || drag;
    if (busy) requestAnimationFrame(frame); else running = false;
  }

  // ---- textures -----------------------------------------------------------
  var tex = { light: null, dark: null, w: null, b: null };

  function loadStyle(name, done) {
    var need = 4, files = {
      light: 'tex/' + name + '_light.jpg', dark: 'tex/' + name + '_dark.jpg',
      w: 'tex/' + name + '_wpiece.jpg', b: 'tex/' + name + '_bpiece.jpg'
    };
    Object.keys(files).forEach(function (key) {
      var img = new Image();
      img.onload = img.onerror = function () { if (--need === 0 && done) done(); };
      img.src = files[key];
      tex[key] = img;
    });
  }

  // ---- layout -------------------------------------------------------------
  var cell = 0, boardPx = 0, dpr = 1, radius = 0;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    var vw = stage.clientWidth, vh = stage.clientHeight;
    boardPx = Math.floor(Math.min(vw, vh));
    cell = boardPx / 8;
    radius = Math.max(6, cell * 0.13);
    canvas.style.borderRadius = radius + 'px';
    canvas.style.width = boardPx + 'px';
    canvas.style.height = boardPx + 'px';
    canvas.width = Math.round(boardPx * dpr);
    canvas.height = Math.round(boardPx * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var gx = (vw - boardPx) / 2, gy = (vh - boardPx) / 2;
    var mode = gy >= 92 ? 'p' : (gx >= 118 ? 'l' : 'c');
    document.body.classList.toggle('lay-p', mode === 'p');
    document.body.classList.toggle('lay-l', mode === 'l');
    document.body.classList.toggle('lay-c', mode === 'c');
    document.documentElement.style.setProperty('--gutter', Math.floor(gx) + 'px');

    P.clearCache();
    patCache = {};
    updateChrome();
    kick();
  }

  // ---- coordinate mapping -------------------------------------------------
  function colRow(s) {
    var f = C.fileOf(s), r = C.rankOf(s);
    return S.flipped ? [7 - f, r] : [f, 7 - r];
  }
  function sqXY(s) { var cr = colRow(s); return [cr[0] * cell, cr[1] * cell]; }
  function xyToSq(x, y) {
    var col = Math.floor(x / cell), row = Math.floor(y / cell);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    return C.sq(S.flipped ? 7 - col : col, S.flipped ? row : 7 - row);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ---- drawing ------------------------------------------------------------
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

  function draw() {
    if (!cell) return;
    ctx.clearRect(0, 0, boardPx, boardPx);
    ctx.save();
    roundRect(ctx, 0, 0, boardPx, boardPx, radius);
    ctx.clip();

    drawSquares();
    drawLastMove();
    drawSelection();
    drawCheck();
    drawPieces();
    drawTargets();
    drawCoords();
    drawEdges();

    ctx.restore();
  }

  function drawSquares() {
    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 8; col++) {
        var f = S.flipped ? 7 - col : col, r = S.flipped ? row : 7 - row;
        var light = (f + r) % 2 === 1;
        var x = col * cell, y = row * cell;
        var p = pattern(light ? tex.light : tex.dark, light ? 'l' : 'd');
        ctx.fillStyle = p || (light ? '#c9b189' : '#6b4b31');
        ctx.save();
        ctx.translate(x, y);
        ctx.fillRect(-0.5, -0.5, cell + 1, cell + 1);
        ctx.restore();
      }
    }
    // one light across the whole board rather than per square
    var lg = ctx.createLinearGradient(0, 0, boardPx * 0.85, boardPx);
    lg.addColorStop(0, 'rgba(255,246,224,.17)');
    lg.addColorStop(0.42, 'rgba(255,250,235,.04)');
    lg.addColorStop(1, 'rgba(0,0,0,.24)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, boardPx, boardPx);

    var vg = ctx.createRadialGradient(boardPx * .42, boardPx * .36, boardPx * .12,
                                      boardPx * .5, boardPx * .5, boardPx * .84);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.30)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, boardPx, boardPx);
  }

  function squareWash(s, colour, inset) {
    var xy = sqXY(s);
    inset = inset || 0;
    ctx.fillStyle = colour;
    roundRect(ctx, xy[0] + inset, xy[1] + inset, cell - inset * 2, cell - inset * 2, cell * 0.14);
    ctx.fill();
  }

  function drawLastMove() {
    if (!lastMove) return;
    squareWash(lastMove.from, 'rgba(200,164,92,.20)');
    squareWash(lastMove.to, 'rgba(200,164,92,.28)');
  }

  function drawSelection() {
    if (selected < 0 || fx.hl < 0.01) return;
    var xy = sqXY(selected), a = fx.hl;
    var cx = xy[0] + cell / 2, cy = xy[1] + cell / 2;
    var g = ctx.createRadialGradient(cx, cy, cell * 0.1, cx, cy, cell * 0.72);
    g.addColorStop(0, 'rgba(232,212,160,' + (0.30 * a).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(232,212,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(xy[0] - cell * 0.2, xy[1] - cell * 0.2, cell * 1.4, cell * 1.4);

    ctx.save();
    ctx.strokeStyle = 'rgba(232,212,160,' + (0.85 * a).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.5, cell * 0.035);
    var i = ctx.lineWidth / 2 + cell * 0.02;
    roundRect(ctx, xy[0] + i, xy[1] + i, cell - i * 2, cell - i * 2, cell * 0.14);
    ctx.stroke();
    ctx.restore();
  }

  function drawTargets() {
    if (!S.dots || fx.hl < 0.01) return;
    var a = fx.hl;
    for (var i = 0; i < targets.length; i++) {
      var xy = sqXY(targets[i].to);
      var cx = xy[0] + cell / 2, cy = xy[1] + cell / 2;
      ctx.save();
      if (targets[i].capture) {
        ctx.strokeStyle = 'rgba(18,12,6,' + (0.36 * a).toFixed(3) + ')';
        ctx.lineWidth = cell * 0.075;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.415, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,244,220,' + (0.16 * a).toFixed(3) + ')';
        ctx.lineWidth = cell * 0.02;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.452, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        var g = ctx.createRadialGradient(cx, cy - cell * 0.02, 0, cx, cy, cell * 0.17);
        g.addColorStop(0, 'rgba(22,15,7,' + (0.34 * a).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(22,15,7,' + (0.22 * a).toFixed(3) + ')');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.155, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,246,225,' + (0.13 * a).toFixed(3) + ')';
        ctx.lineWidth = cell * 0.014;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawCheck() {
    if (fx.check < 0.01) return;
    var k = pos.kings[pos.turn ? 1 : 0];
    if (k < 0) return;
    var xy = sqXY(k);
    var cx = xy[0] + cell / 2, cy = xy[1] + cell / 2;
    var beat = 0.72 + 0.28 * Math.sin(fx.pulse * 1.5);
    var g = ctx.createRadialGradient(cx, cy, cell * 0.08, cx, cy, cell * 0.68);
    g.addColorStop(0, 'rgba(194,80,58,' + (0.70 * fx.check * beat).toFixed(3) + ')');
    g.addColorStop(0.6, 'rgba(194,80,58,' + (0.26 * fx.check * beat).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(194,80,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(xy[0] - cell * 0.3, xy[1] - cell * 0.3, cell * 1.6, cell * 1.6);
  }

  function pieceAt(s) { return pos.board[s]; }

  function drawPieces() {
    var now = performance.now();
    var animT = anim ? Math.min(1, (now - anim.t0) / anim.dur) : 1;
    var animE = anim ? easeOutBack(animT) : 1;

    // shadows first so no piece casts onto another
    var list = [];
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      var p = pos.board[s];
      if (!p) continue;
      if (drag && drag.sq === s) continue;
      if (anim && s === anim.to) continue;
      var xy = sqXY(s);
      list.push({ p: p, x: xy[0], y: xy[1], lift: 0 });
    }

    if (anim) {
      var a = sqXY(anim.from), b = sqXY(anim.to);
      list.push({
        p: anim.piece,
        x: a[0] + (b[0] - a[0]) * animE,
        y: a[1] + (b[1] - a[1]) * animE,
        lift: Math.sin(animT * Math.PI) * 0.55
      });
    }

    if (drag) {
      list.push({ p: pos.board[drag.sq], x: drag.x - cell / 2, y: drag.y - cell / 2, lift: fx.lift });
    } else if (selected >= 0 && fx.lift > 0.01) {
      var sx = sqXY(selected);
      list.push({ p: pos.board[selected], x: sx[0], y: sx[1] - cell * 0.05 * fx.lift, lift: fx.lift * 0.7,
                  replace: selected });
    }

    // fading capture
    if (anim && anim.captured) {
      var cxy = sqXY(anim.capturedSq);
      var fade = 1 - animT;
      ctx.save();
      ctx.globalAlpha = fade * fade;
      paintPiece(anim.captured, cxy[0], cxy[1], 0, 1 - 0.25 * animT);
      ctx.restore();
    }

    for (var i = 0; i < list.length; i++) {
      if (list[i].replace !== undefined) continue;
      P.contactShadow(ctx, list[i].x + cell / 2, list[i].y + cell / 2, cell, list[i].lift);
    }
    for (i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.replace !== undefined) {
        P.contactShadow(ctx, it.x + cell / 2, it.y + cell / 2, cell, it.lift);
      }
      paintPiece(it.p, it.x, it.y, it.lift, 1);
    }
  }

  function paintPiece(p, x, y, lift, alpha) {
    if (!p) return;
    var scale = 1 + (lift || 0) * 0.14;
    var sp = P.sprite(C.typeOf(p), C.colourOf(p), cell * 0.84, S.style, tex);
    var natural = sp._size + sp._pad * 2;
    var dw = natural * scale, dh = dw * (sp.height / sp.width);
    var dx = x + (cell - dw) / 2;
    var dy = y + (cell - dh) / 2 + cell * 0.03 - (lift || 0) * cell * 0.08;
    if (alpha !== undefined && alpha !== 1) { ctx.save(); ctx.globalAlpha *= alpha; }
    ctx.drawImage(sp, dx, dy, dw, dh);
    if (alpha !== undefined && alpha !== 1) ctx.restore();
  }

  function drawCoords() {
    if (!S.coords) return;
    ctx.save();
    ctx.font = '600 ' + Math.max(8, Math.round(cell * 0.155)) + 'px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';
    for (var i = 0; i < 8; i++) {
      var fileChar = String.fromCharCode(97 + (S.flipped ? 7 - i : i));
      var rankChar = String(S.flipped ? i + 1 : 8 - i);
      ctx.fillStyle = ((i + 7) % 2 === 1) ? 'rgba(20,13,6,.42)' : 'rgba(248,240,224,.46)';
      ctx.fillText(fileChar, i * cell + cell * 0.075, boardPx - cell * 0.225);
      ctx.fillStyle = (i % 2 === 1) ? 'rgba(20,13,6,.42)' : 'rgba(248,240,224,.46)';
      ctx.fillText(rankChar, cell * 0.075, i * cell + cell * 0.06);
    }
    ctx.restore();
  }

  function drawEdges() {
    ctx.save();
    roundRect(ctx, 0.5, 0.5, boardPx - 1, boardPx - 1, radius);
    ctx.strokeStyle = 'rgba(255,240,210,.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // ---- sound --------------------------------------------------------------
  var actx = null;
  function tone(kind) {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime;
      var spec = kind === 'capture' ? [150, 'triangle', 0.20, 0.20]
               : kind === 'end'     ? [300, 'sine', 0.16, 0.55]
               : kind === 'check'   ? [520, 'sine', 0.13, 0.22]
               : [330, 'sine', 0.11, 0.15];
      var o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2200;
      o.type = spec[1];
      o.frequency.setValueAtTime(spec[0], t);
      o.frequency.exponentialRampToValueAtTime(spec[0] * 0.6, t + spec[3] * 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(spec[2], t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + spec[3]);
      o.connect(f); f.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + spec[3] + 0.02);
    } catch (e) {}
  }

  // ---- engine worker ------------------------------------------------------
  var worker = null, workerBroken = false;

  function makeWorker() {
    if (worker || workerBroken) return worker;
    try {
      var glue =
        '\nvar __r={};ChessEngineModule(__r);var E=__r.Chess;\n' +
        'self.onmessage=function(ev){\n' +
        '  var d=ev.data;\n' +
        '  var p=new E.Position().setFen(d.fen);\n' +
        '  if(d.rep) p.repetition=d.rep;\n' +
        '  var r=p.think(d.level,d.line,function(pr){\n' +
        '    self.postMessage({type:"progress",depth:pr.depth,score:pr.score,nodes:pr.nodes});\n' +
        '  });\n' +
        '  if(!r){self.postMessage({type:"done",none:true});return;}\n' +
        '  self.postMessage({type:"done",from:E.mFrom(r.move),to:E.mTo(r.move),\n' +
        '    promo:E.mPromo(r.move),flag:E.mFlag(r.move),depth:r.depth,score:r.score,nodes:r.nodes});\n' +
        '};\n';
      var blob = new Blob([window.ChessEngineSource + glue], { type: 'text/javascript' });
      worker = new Worker(URL.createObjectURL(blob));
      worker.onerror = function () { workerBroken = true; worker = null; };
    } catch (e) {
      workerBroken = true; worker = null;
    }
    return worker;
  }

  var depthLabel = document.getElementById('depth');

  function requestMove(cb) {
    var w = makeWorker();
    if (w) {
      w.onmessage = function (ev) {
        var d = ev.data;
        if (d.type === 'progress') {
          if (depthLabel) depthLabel.textContent = 'depth ' + d.depth;
          return;
        }
        if (d.none) { cb(null); return; }
        var legal = pos.legalMoves(false);
        for (var i = 0; i < legal.length; i++) {
          if (C.mFrom(legal[i]) === d.from && C.mTo(legal[i]) === d.to &&
              (C.mFlag(legal[i]) !== C.F_PROMO || C.mPromo(legal[i]) === d.promo)) {
            cb(legal[i]); return;
          }
        }
        cb(legal.length ? legal[0] : null);
      };
      w.postMessage({ fen: pos.fen(), level: S.level, line: sanLine, rep: pos.repetition });
    } else {
      setTimeout(function () {
        var r = pos.think(S.level, sanLine);
        cb(r ? r.move : null);
      }, 30);
    }
  }

  // ---- chrome -------------------------------------------------------------
  var statusEl = document.getElementById('status');
  var takenEl = document.getElementById('takenByWhite');
  var edgeEl = document.getElementById('edgeTop');
  var barEl = document.getElementById('progress');
  var VAL = [0, 1, 3, 3, 5, 9, 0];

  function humanTurn() {
    if (S.side === '2') return true;
    return (pos.turn === C.WHITE) === (S.side === 'w');
  }

  function updateChrome() {
    var counts = {}, s, p;
    for (s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      p = pos.board[s];
      if (p) counts[p] = (counts[p] || 0) + 1;
    }
    var start = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1, 9: 8, 10: 2, 11: 2, 12: 2, 13: 1 };
    var missing = [], edge = 0;
    Object.keys(start).forEach(function (kk) {
      var code = +kk, n = start[kk] - (counts[kk] || 0);
      for (var i = 0; i < n; i++) missing.push(code);
      edge += (C.colourOf(code) ? -1 : 1) * n * VAL[C.typeOf(code)];
    });
    missing.sort(function (a, b) {
      return (C.colourOf(a) - C.colourOf(b)) || (VAL[C.typeOf(b)] - VAL[C.typeOf(a)]);
    });

    if (takenEl) {
      takenEl.innerHTML = '';
      var mini = Math.min(26, Math.max(15, Math.round(window.innerWidth / 19)));
      missing.forEach(function (code) {
        var sp = P.sprite(C.typeOf(code), C.colourOf(code), mini, S.style, tex);
        var d = sp._size + sp._pad * 2;
        var c2 = document.createElement('canvas');
        c2.width = sp.width; c2.height = sp.height;
        c2.style.width = d + 'px'; c2.style.height = d + 'px';
        c2.getContext('2d').drawImage(sp, 0, 0);
        takenEl.appendChild(c2);
      });
      edgeEl.textContent = edge > 0 ? '+' + edge : edge < 0 ? String(edge) : '';
    }

    var st = pos.status();
    statusEl.className = '';
    gameOver = false;
    if (st === 'checkmate') { statusEl.textContent = (pos.turn === C.WHITE ? 'Black' : 'White') + ' wins'; gameOver = true; }
    else if (st === 'stalemate') { statusEl.textContent = 'Stalemate'; gameOver = true; }
    else if (st === 'fifty') { statusEl.textContent = 'Draw \u00b7 fifty moves'; gameOver = true; }
    else if (st === 'material') { statusEl.textContent = 'Draw \u00b7 insufficient material'; gameOver = true; }
    else if (st === 'repetition') { statusEl.textContent = 'Draw \u00b7 repetition'; gameOver = true; }
    else if (thinking) { statusEl.textContent = 'Thinking'; statusEl.className = 'think'; }
    else if (st === 'check') { statusEl.textContent = 'Check'; statusEl.className = 'check'; }
    else if (S.side === '2') statusEl.textContent = (pos.turn === C.WHITE ? 'White' : 'Black') + ' to move';
    else statusEl.textContent = humanTurn() ? 'Your move' : 'Thinking';

    fx.checkT = (!gameOver && pos.inCheck()) ? 1 : 0;
    if (barEl) barEl.classList.toggle('on', thinking);
    if (depthLabel && !thinking) depthLabel.textContent = '';

    document.getElementById('btnUndo').disabled = sanLine.length === 0 || thinking;
    document.getElementById('btnHint').disabled = thinking || gameOver || !humanTurn();

    var out = '';
    sanLine.forEach(function (m, i) { out += (i % 2 === 0 ? (i / 2 + 1) + '. ' : '') + m + '  '; });
    var mv = document.getElementById('moves');
    if (mv) { mv.textContent = out.trim() || '\u2014'; mv.scrollTop = mv.scrollHeight; }
    kick();
  }

  // ---- move flow ----------------------------------------------------------
  function applyMove(m) {
    var from = C.mFrom(m), to = C.mTo(m), flag = C.mFlag(m);
    var captured = pos.board[to], capturedSq = to;
    if (flag === C.F_EP) { capturedSq = to + (pos.turn === C.WHITE ? -16 : 16); captured = pos.board[capturedSq]; }
    var piece = pos.board[from];

    selected = -1; targets = []; hintMove = null;
    fx.liftT = 0; fx.hlT = 0;

    sanLine.push(pos.moveToSan(m));
    pos.makeMove(m);
    pos.repetition.push(pos.key());
    lastMove = { from: from, to: to };

    anim = {
      piece: flag === C.F_PROMO ? (C.mPromo(m) | (piece & C.BLACK)) : piece,
      from: from, to: to, captured: captured, capturedSq: capturedSq,
      t0: performance.now(), dur: 230,
      after: function () {
        tone(captured ? 'capture' : (pos.inCheck() ? 'check' : 'move'));
        updateChrome();
        if (gameOver) { tone('end'); return; }
        if (!humanTurn()) startThinking();
      }
    };
    updateChrome();
    kick();
  }

  function startThinking() {
    if (gameOver || humanTurn()) return;
    thinking = true;
    updateChrome();
    requestMove(function (m) {
      thinking = false;
      if (!m) { updateChrome(); return; }
      applyMove(m);
    });
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
      fx.hlT = 1; fx.liftT = 1;
      return true;
    }
    return false;
  }

  function deselect() { selected = -1; targets = []; fx.hlT = 0; fx.liftT = 0; }

  function tryMove(to) {
    var matches = targets.filter(function (t) { return t.to === to; });
    if (!matches.length) return false;
    if (matches.length > 1) { pendingPromo = matches; showPromo(); return true; }
    applyMove(matches[0].move);
    return true;
  }

  function evPos(e) {
    var r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (thinking || gameOver || anim || pendingPromo || !humanTurn()) return;
    e.preventDefault();
    var xy = evPos(e), s = xyToSq(xy[0], xy[1]);
    if (s < 0) return;
    if (selected >= 0 && tryMove(s)) return;
    if (pick(s)) {
      drag = { sq: s, x: xy[0], y: xy[1], moved: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    } else deselect();
    kick();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    e.preventDefault();
    var xy = evPos(e);
    if (Math.abs(xy[0] - drag.x) > 3 || Math.abs(xy[1] - drag.y) > 3) drag.moved = true;
    drag.x = xy[0]; drag.y = xy[1];
    kick();
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!drag) return;
    e.preventDefault();
    var xy = evPos(e), s = xyToSq(xy[0], xy[1]), from = drag.sq, moved = drag.moved;
    drag = null;
    if (moved && s >= 0 && s !== from) { if (tryMove(s)) return; }
    if (moved && s === from) { fx.liftT = 0.35; }
    kick();
  });

  canvas.addEventListener('pointercancel', function () { drag = null; kick(); });

  // ---- promotion ----------------------------------------------------------
  var promoEl = document.getElementById('promo');
  function showPromo() {
    var card = promoEl.querySelector('.card');
    card.innerHTML = '';
    pendingPromo.forEach(function (t) {
      var type = C.mPromo(t.move);
      var sp = P.sprite(type, pos.turn, Math.min(76, cell * 1.1), S.style, tex);
      var d = sp._size + sp._pad * 2;
      var btn = document.createElement('button');
      btn.className = 'promo-pick';
      var c2 = document.createElement('canvas');
      c2.width = sp.width; c2.height = sp.height;
      c2.style.width = d + 'px'; c2.style.height = d + 'px';
      c2.getContext('2d').drawImage(sp, 0, 0);
      btn.appendChild(c2);
      btn.addEventListener('click', function () {
        promoEl.classList.remove('on');
        var mv = t.move;
        pendingPromo = null;
        applyMove(mv);
      });
      card.appendChild(btn);
    });
    promoEl.classList.add('on');
  }

  // ---- controls -----------------------------------------------------------
  function newGame() {
    if (worker) { worker.terminate(); worker = null; }
    pos = new C.Position().reset();
    sanLine = []; lastMove = null; deselect();
    gameOver = false; thinking = false; anim = null; drag = null; hintMove = null;
    fx.board = 0;
    updateChrome();
    if (!humanTurn()) startThinking();
  }

  document.getElementById('btnNew').addEventListener('click', newGame);

  document.getElementById('btnUndo').addEventListener('click', function () {
    if (thinking || !sanLine.length) return;
    var back = (S.side === '2') ? 1 : Math.min(2, sanLine.length);
    for (var i = 0; i < back; i++) { pos.unmakeMove(); pos.repetition.pop(); sanLine.pop(); }
    gameOver = false; lastMove = null; deselect(); anim = null;
    updateChrome();
  });

  document.getElementById('btnHint').addEventListener('click', function () {
    if (thinking || gameOver) return;
    thinking = true;
    updateChrome();
    requestMove(function (m) {
      thinking = false;
      if (m) { lastMove = { from: C.mFrom(m), to: C.mTo(m) }; }
      updateChrome();
    });
  });

  var scrim = document.getElementById('scrim'), sheet = document.getElementById('sheet');
  function openSheet(on) { scrim.classList.toggle('on', on); sheet.classList.toggle('on', on); }
  document.getElementById('btnMore').addEventListener('click', function () { openSheet(true); });
  document.getElementById('btnClose').addEventListener('click', function () { openSheet(false); });
  scrim.addEventListener('click', function () { openSheet(false); });

  document.getElementById('btnFlip').addEventListener('click', function () {
    S.flipped = !S.flipped; save(); kick();
  });

  document.getElementById('btnCopy').addEventListener('click', function () {
    var pgn = '';
    sanLine.forEach(function (m, i) { pgn += (i % 2 === 0 ? (i / 2 + 1) + '. ' : '') + m + ' '; });
    try { navigator.clipboard.writeText(pgn.trim()); } catch (e) {}
    var b = document.getElementById('btnCopy'), old = b.textContent;
    b.textContent = 'Copied'; setTimeout(function () { b.textContent = old; }, 1200);
  });

  function wireSeg(id, key, cb) {
    document.getElementById(id).addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      S[key] = (key === 'level') ? +b.dataset.v : b.dataset.v;
      save(); syncSeg(id, key); if (cb) cb();
    });
  }
  function syncSeg(id, key) {
    Array.prototype.forEach.call(document.getElementById(id).querySelectorAll('button'), function (b) {
      b.classList.toggle('on', String(S[key]) === b.dataset.v);
    });
  }

  wireSeg('segLevel', 'level');
  wireSeg('segStyle', 'style', function () {
    P.clearCache(); patCache = {};
    loadStyle(S.style, function () { patCache = {}; updateChrome(); kick(); });
  });
  wireSeg('segSide', 'side', function () { S.flipped = (S.side === 'b'); save(); newGame(); });

  document.getElementById('segOpts').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    S[b.dataset.k] = !S[b.dataset.k]; save(); syncOpts(); kick();
  });
  function syncOpts() {
    Array.prototype.forEach.call(document.querySelectorAll('#segOpts button'), function (b) {
      b.classList.toggle('on', !!S[b.dataset.k]);
    });
  }

  // ---- Android back -------------------------------------------------------
  window.__handleBack = function () {
    if (pendingPromo) { promoEl.classList.remove('on'); pendingPromo = null; kick(); return true; }
    if (sheet.classList.contains('on')) { openSheet(false); return true; }
    if (selected >= 0) { deselect(); kick(); return true; }
    return false;
  };

  // ---- boot ---------------------------------------------------------------
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 140); });

  syncSeg('segLevel', 'level'); syncSeg('segStyle', 'style');
  syncSeg('segSide', 'side'); syncOpts();

  loadStyle(S.style, function () {
    layout();
    document.body.classList.add('ready');
    if (!humanTurn()) startThinking();
  });
  layout();

})();
