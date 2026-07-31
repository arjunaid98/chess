/* engine.js — chess engine.
   Wrapped in a named function so the whole module can be stringified and
   re-instantiated inside a Blob Worker (a file:// page can't load a worker
   script by URL, but it can from a Blob). */

function ChessEngineModule(root) {
  'use strict';

  // ---- piece codes -------------------------------------------------------
  var EMPTY = 0, PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var WHITE = 0, BLACK = 8;
  var TYPE = 7;

  function colourOf(p) { return p & BLACK; }
  function typeOf(p) { return p & TYPE; }

  // ---- 0x88 helpers ------------------------------------------------------
  function sq(file, rank) { return rank * 16 + file; }
  function fileOf(s) { return s & 15; }
  function rankOf(s) { return s >> 4; }
  function onBoard(s) { return (s & 0x88) === 0; }

  var KNIGHT_DIRS = [33, 31, 18, 14, -14, -18, -31, -33];
  var BISHOP_DIRS = [17, 15, -15, -17];
  var ROOK_DIRS = [16, 1, -1, -16];
  var KING_DIRS = [17, 16, 15, 1, -1, -15, -16, -17];

  var CR_WK = 1, CR_WQ = 2, CR_BK = 4, CR_BQ = 8;
  var F_NORMAL = 0, F_DOUBLE = 1, F_EP = 2, F_CASTLE_K = 3, F_CASTLE_Q = 4, F_PROMO = 5;

  function mkMove(from, to, flag, promo) {
    return from | (to << 8) | ((promo || 0) << 16) | (flag << 20);
  }
  function mFrom(m) { return m & 0xff; }
  function mTo(m) { return (m >> 8) & 0xff; }
  function mPromo(m) { return (m >> 16) & 0xf; }
  function mFlag(m) { return (m >> 20) & 0xf; }

  // ---- zobrist -----------------------------------------------------------
  var _rs = 0x2545f491;
  function rnd32() {
    _rs ^= _rs << 13; _rs |= 0;
    _rs ^= _rs >>> 17;
    _rs ^= _rs << 5; _rs |= 0;
    return _rs;
  }
  var Z_PIECE_LO = [], Z_PIECE_HI = [], Z_EP_LO = [], Z_EP_HI = [],
      Z_CASTLE_LO = [], Z_CASTLE_HI = [], Z_SIDE_LO = 0, Z_SIDE_HI = 0;
  (function () {
    for (var p = 0; p < 16; p++) {
      Z_PIECE_LO[p] = []; Z_PIECE_HI[p] = [];
      for (var s = 0; s < 128; s++) { Z_PIECE_LO[p][s] = rnd32(); Z_PIECE_HI[p][s] = rnd32(); }
    }
    for (var i = 0; i < 128; i++) { Z_EP_LO[i] = rnd32(); Z_EP_HI[i] = rnd32(); }
    for (var c = 0; c < 16; c++) { Z_CASTLE_LO[c] = rnd32(); Z_CASTLE_HI[c] = rnd32(); }
    Z_SIDE_LO = rnd32(); Z_SIDE_HI = rnd32();
  })();

  // ---- position ----------------------------------------------------------
  function Position() {
    this.board = new Int8Array(128);
    this.turn = WHITE;
    this.castling = 0;
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.kings = [-1, -1];
    this.history = [];
    this.repetition = [];
    this.hashLo = 0; this.hashHi = 0;
  }

  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  var FEN_CHARS = {
    p: PAWN | BLACK, n: KNIGHT | BLACK, b: BISHOP | BLACK,
    r: ROOK | BLACK, q: QUEEN | BLACK, k: KING | BLACK,
    P: PAWN, N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING
  };

  Position.prototype.rehash = function () {
    var lo = 0, hi = 0;
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      var p = this.board[s];
      if (p) { lo ^= Z_PIECE_LO[p][s]; hi ^= Z_PIECE_HI[p][s]; }
    }
    lo ^= Z_CASTLE_LO[this.castling]; hi ^= Z_CASTLE_HI[this.castling];
    if (this.ep >= 0) { lo ^= Z_EP_LO[this.ep]; hi ^= Z_EP_HI[this.ep]; }
    if (this.turn === BLACK) { lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI; }
    this.hashLo = lo | 0; this.hashHi = hi | 0;
  };

  Position.prototype.setFen = function (fen) {
    var parts = fen.trim().split(/\s+/);
    this.board = new Int8Array(128);
    this.kings = [-1, -1];
    var rows = parts[0].split('/');
    for (var r = 0; r < 8; r++) {
      var rank = 7 - r, file = 0, row = rows[r];
      for (var i = 0; i < row.length; i++) {
        var c = row[i];
        if (c >= '1' && c <= '8') { file += +c; continue; }
        var piece = FEN_CHARS[c], s = sq(file, rank);
        this.board[s] = piece;
        if (typeOf(piece) === KING) this.kings[colourOf(piece) ? 1 : 0] = s;
        file++;
      }
    }
    this.turn = parts[1] === 'w' ? WHITE : BLACK;
    this.castling = 0;
    if (parts[2] && parts[2] !== '-') {
      if (parts[2].indexOf('K') >= 0) this.castling |= CR_WK;
      if (parts[2].indexOf('Q') >= 0) this.castling |= CR_WQ;
      if (parts[2].indexOf('k') >= 0) this.castling |= CR_BK;
      if (parts[2].indexOf('q') >= 0) this.castling |= CR_BQ;
    }
    this.ep = (parts[3] && parts[3] !== '-')
      ? sq(parts[3].charCodeAt(0) - 97, +parts[3][1] - 1) : -1;
    this.halfmove = parts[4] ? +parts[4] : 0;
    this.fullmove = parts[5] ? +parts[5] : 1;
    this.history = [];
    this.rehash();
    this.repetition = [this.hashLo];
    return this;
  };

  Position.prototype.reset = function () { return this.setFen(START_FEN); };

  Position.prototype.fen = function () {
    var out = '';
    for (var r = 7; r >= 0; r--) {
      var empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = this.board[sq(f, r)];
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        var ch = ' pnbrqk'[typeOf(p)];
        out += colourOf(p) ? ch : ch.toUpperCase();
      }
      if (empty) out += empty;
      if (r) out += '/';
    }
    var cs = (this.castling & CR_WK ? 'K' : '') + (this.castling & CR_WQ ? 'Q' : '') +
             (this.castling & CR_BK ? 'k' : '') + (this.castling & CR_BQ ? 'q' : '');
    return out + ' ' + (this.turn === WHITE ? 'w' : 'b') + ' ' + (cs || '-') + ' ' +
           (this.ep >= 0 ? String.fromCharCode(97 + fileOf(this.ep)) + (rankOf(this.ep) + 1) : '-') +
           ' ' + this.halfmove + ' ' + this.fullmove;
  };

  Position.prototype.key = function () { return this.hashLo; };

  // ---- attack detection --------------------------------------------------
  Position.prototype.attacked = function (s, by) {
    var b = this.board, i, d, t, p;
    var pd = by === WHITE ? -16 : 16;
    for (i = -1; i <= 1; i += 2) {
      t = s + pd + i;
      if (onBoard(t)) { p = b[t]; if (p && colourOf(p) === by && typeOf(p) === PAWN) return true; }
    }
    for (i = 0; i < 8; i++) {
      t = s + KNIGHT_DIRS[i];
      if (onBoard(t)) { p = b[t]; if (p && colourOf(p) === by && typeOf(p) === KNIGHT) return true; }
    }
    for (i = 0; i < 8; i++) {
      t = s + KING_DIRS[i];
      if (onBoard(t)) { p = b[t]; if (p && colourOf(p) === by && typeOf(p) === KING) return true; }
    }
    for (i = 0; i < 4; i++) {
      d = BISHOP_DIRS[i]; t = s + d;
      while (onBoard(t)) {
        p = b[t];
        if (p) { if (colourOf(p) === by && (typeOf(p) === BISHOP || typeOf(p) === QUEEN)) return true; break; }
        t += d;
      }
    }
    for (i = 0; i < 4; i++) {
      d = ROOK_DIRS[i]; t = s + d;
      while (onBoard(t)) {
        p = b[t];
        if (p) { if (colourOf(p) === by && (typeOf(p) === ROOK || typeOf(p) === QUEEN)) return true; break; }
        t += d;
      }
    }
    return false;
  };

  Position.prototype.inCheck = function (colour) {
    var c = colour === undefined ? this.turn : colour;
    var k = this.kings[c ? 1 : 0];
    if (k < 0) return false;
    return this.attacked(k, c === WHITE ? BLACK : WHITE);
  };

  // ---- move generation ---------------------------------------------------
  Position.prototype.genMoves = function (capturesOnly) {
    var moves = [], b = this.board, us = this.turn, them = us === WHITE ? BLACK : WHITE;
    var from, p, i, d, t, tp;

    for (from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      p = b[from];
      if (!p || colourOf(p) !== us) continue;
      var ty = typeOf(p);

      if (ty === PAWN) {
        var fwd = us === WHITE ? 16 : -16;
        var startRank = us === WHITE ? 1 : 6;
        var promoRank = us === WHITE ? 7 : 0;
        t = from + fwd;
        if (!capturesOnly && onBoard(t) && !b[t]) {
          if (rankOf(t) === promoRank) {
            moves.push(mkMove(from, t, F_PROMO, QUEEN), mkMove(from, t, F_PROMO, ROOK),
                       mkMove(from, t, F_PROMO, BISHOP), mkMove(from, t, F_PROMO, KNIGHT));
          } else {
            moves.push(mkMove(from, t, F_NORMAL, 0));
            var t2 = from + fwd * 2;
            if (rankOf(from) === startRank && !b[t2]) moves.push(mkMove(from, t2, F_DOUBLE, 0));
          }
        } else if (capturesOnly && onBoard(t) && !b[t] && rankOf(t) === promoRank) {
          moves.push(mkMove(from, t, F_PROMO, QUEEN));
        }
        for (i = -1; i <= 1; i += 2) {
          t = from + fwd + i;
          if (!onBoard(t)) continue;
          tp = b[t];
          if (tp && colourOf(tp) === them) {
            if (rankOf(t) === promoRank) {
              moves.push(mkMove(from, t, F_PROMO, QUEEN), mkMove(from, t, F_PROMO, ROOK),
                         mkMove(from, t, F_PROMO, BISHOP), mkMove(from, t, F_PROMO, KNIGHT));
            } else moves.push(mkMove(from, t, F_NORMAL, 0));
          } else if (!tp && t === this.ep) {
            moves.push(mkMove(from, t, F_EP, 0));
          }
        }
        continue;
      }

      if (ty === KNIGHT || ty === KING) {
        var dirs = ty === KNIGHT ? KNIGHT_DIRS : KING_DIRS;
        for (i = 0; i < 8; i++) {
          t = from + dirs[i];
          if (!onBoard(t)) continue;
          tp = b[t];
          if (tp && colourOf(tp) === us) continue;
          if (capturesOnly && !tp) continue;
          moves.push(mkMove(from, t, F_NORMAL, 0));
        }
      } else {
        var slide = ty === BISHOP ? BISHOP_DIRS : ty === ROOK ? ROOK_DIRS : KING_DIRS;
        var n = ty === QUEEN ? 8 : 4;
        for (i = 0; i < n; i++) {
          d = slide[i]; t = from + d;
          while (onBoard(t)) {
            tp = b[t];
            if (tp) { if (colourOf(tp) === them) moves.push(mkMove(from, t, F_NORMAL, 0)); break; }
            if (!capturesOnly) moves.push(mkMove(from, t, F_NORMAL, 0));
            t += d;
          }
        }
      }
    }

    if (!capturesOnly) {
      var kingSq = this.kings[us ? 1 : 0];
      if (us === WHITE && kingSq === 4) {
        if ((this.castling & CR_WK) && !b[5] && !b[6] &&
            !this.attacked(4, BLACK) && !this.attacked(5, BLACK) && !this.attacked(6, BLACK))
          moves.push(mkMove(4, 6, F_CASTLE_K, 0));
        if ((this.castling & CR_WQ) && !b[3] && !b[2] && !b[1] &&
            !this.attacked(4, BLACK) && !this.attacked(3, BLACK) && !this.attacked(2, BLACK))
          moves.push(mkMove(4, 2, F_CASTLE_Q, 0));
      } else if (us === BLACK && kingSq === 116) {
        if ((this.castling & CR_BK) && !b[117] && !b[118] &&
            !this.attacked(116, WHITE) && !this.attacked(117, WHITE) && !this.attacked(118, WHITE))
          moves.push(mkMove(116, 118, F_CASTLE_K, 0));
        if ((this.castling & CR_BQ) && !b[115] && !b[114] && !b[113] &&
            !this.attacked(116, WHITE) && !this.attacked(115, WHITE) && !this.attacked(114, WHITE))
          moves.push(mkMove(116, 114, F_CASTLE_Q, 0));
      }
    }
    return moves;
  };

  // ---- make / unmake -----------------------------------------------------
  var CASTLE_MASK = new Int8Array(128);
  (function () {
    for (var i = 0; i < 128; i++) CASTLE_MASK[i] = 15;
    CASTLE_MASK[0] = 15 & ~CR_WQ;
    CASTLE_MASK[7] = 15 & ~CR_WK;
    CASTLE_MASK[4] = 15 & ~(CR_WK | CR_WQ);
    CASTLE_MASK[112] = 15 & ~CR_BQ;
    CASTLE_MASK[119] = 15 & ~CR_BK;
    CASTLE_MASK[116] = 15 & ~(CR_BK | CR_BQ);
  })();

  Position.prototype.makeMove = function (m) {
    var b = this.board, from = mFrom(m), to = mTo(m), flag = mFlag(m);
    var piece = b[from], us = this.turn, them = us === WHITE ? BLACK : WHITE;
    var captured = b[to], capturedSq = to;
    var lo = this.hashLo, hi = this.hashHi;

    if (flag === F_EP) { capturedSq = to + (us === WHITE ? -16 : 16); captured = b[capturedSq]; }

    this.history.push({
      move: m, captured: captured, capturedSq: capturedSq,
      castling: this.castling, ep: this.ep, halfmove: this.halfmove,
      kings0: this.kings[0], kings1: this.kings[1],
      hashLo: this.hashLo, hashHi: this.hashHi
    });

    lo ^= Z_CASTLE_LO[this.castling]; hi ^= Z_CASTLE_HI[this.castling];
    if (this.ep >= 0) { lo ^= Z_EP_LO[this.ep]; hi ^= Z_EP_HI[this.ep]; }

    if (captured) {
      b[capturedSq] = EMPTY;
      lo ^= Z_PIECE_LO[captured][capturedSq]; hi ^= Z_PIECE_HI[captured][capturedSq];
    }
    lo ^= Z_PIECE_LO[piece][from]; hi ^= Z_PIECE_HI[piece][from];
    b[from] = EMPTY;

    var placed = flag === F_PROMO ? (mPromo(m) | us) : piece;
    b[to] = placed;
    lo ^= Z_PIECE_LO[placed][to]; hi ^= Z_PIECE_HI[placed][to];

    if (flag === F_CASTLE_K) {
      var rk = b[to + 1];
      b[to - 1] = rk; b[to + 1] = EMPTY;
      lo ^= Z_PIECE_LO[rk][to + 1] ^ Z_PIECE_LO[rk][to - 1];
      hi ^= Z_PIECE_HI[rk][to + 1] ^ Z_PIECE_HI[rk][to - 1];
    } else if (flag === F_CASTLE_Q) {
      var rq = b[to - 2];
      b[to + 1] = rq; b[to - 2] = EMPTY;
      lo ^= Z_PIECE_LO[rq][to - 2] ^ Z_PIECE_LO[rq][to + 1];
      hi ^= Z_PIECE_HI[rq][to - 2] ^ Z_PIECE_HI[rq][to + 1];
    }

    if (typeOf(piece) === KING) this.kings[us ? 1 : 0] = to;

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flag === F_DOUBLE ? (from + (us === WHITE ? 16 : -16)) : -1;
    this.halfmove = (typeOf(piece) === PAWN || captured) ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.turn = them;

    lo ^= Z_CASTLE_LO[this.castling]; hi ^= Z_CASTLE_HI[this.castling];
    if (this.ep >= 0) { lo ^= Z_EP_LO[this.ep]; hi ^= Z_EP_HI[this.ep]; }
    lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI;
    this.hashLo = lo | 0; this.hashHi = hi | 0;
    return true;
  };

  Position.prototype.unmakeMove = function () {
    var h = this.history.pop();
    if (!h) return false;
    var b = this.board, m = h.move, from = mFrom(m), to = mTo(m), flag = mFlag(m);

    this.turn = this.turn === WHITE ? BLACK : WHITE;
    if (this.turn === BLACK) this.fullmove--;

    var piece = b[to];
    if (flag === F_PROMO) piece = PAWN | this.turn;
    b[from] = piece;
    b[to] = EMPTY;

    if (flag === F_CASTLE_K) { b[to + 1] = b[to - 1]; b[to - 1] = EMPTY; }
    else if (flag === F_CASTLE_Q) { b[to - 2] = b[to + 1]; b[to + 1] = EMPTY; }

    if (h.captured) b[h.capturedSq] = h.captured;

    this.castling = h.castling; this.ep = h.ep; this.halfmove = h.halfmove;
    this.kings[0] = h.kings0; this.kings[1] = h.kings1;
    this.hashLo = h.hashLo; this.hashHi = h.hashHi;
    return true;
  };

  Position.prototype.makeNull = function () {
    this.history.push({
      move: -1, captured: 0, capturedSq: 0, castling: this.castling, ep: this.ep,
      halfmove: this.halfmove, kings0: this.kings[0], kings1: this.kings[1],
      hashLo: this.hashLo, hashHi: this.hashHi
    });
    var lo = this.hashLo, hi = this.hashHi;
    if (this.ep >= 0) { lo ^= Z_EP_LO[this.ep]; hi ^= Z_EP_HI[this.ep]; }
    this.ep = -1;
    this.turn = this.turn === WHITE ? BLACK : WHITE;
    lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI;
    this.hashLo = lo | 0; this.hashHi = hi | 0;
  };

  Position.prototype.unmakeNull = function () {
    var h = this.history.pop();
    this.turn = this.turn === WHITE ? BLACK : WHITE;
    this.ep = h.ep; this.castling = h.castling; this.halfmove = h.halfmove;
    this.hashLo = h.hashLo; this.hashHi = h.hashHi;
  };

  Position.prototype.legalMoves = function (capturesOnly) {
    var pseudo = this.genMoves(capturesOnly), out = [], us = this.turn;
    for (var i = 0; i < pseudo.length; i++) {
      this.makeMove(pseudo[i]);
      if (!this.attacked(this.kings[us ? 1 : 0], us === WHITE ? BLACK : WHITE)) out.push(pseudo[i]);
      this.unmakeMove();
    }
    return out;
  };

  Position.prototype.perft = function (depth) {
    if (depth === 0) return 1;
    var moves = this.genMoves(false), n = 0, us = this.turn;
    for (var i = 0; i < moves.length; i++) {
      this.makeMove(moves[i]);
      if (!this.attacked(this.kings[us ? 1 : 0], us === WHITE ? BLACK : WHITE)) {
        n += depth === 1 ? 1 : this.perft(depth - 1);
      }
      this.unmakeMove();
    }
    return n;
  };

  // ---- game state --------------------------------------------------------
  Position.prototype.insufficientMaterial = function () {
    var minors = 0, others = 0;
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      var p = this.board[s]; if (!p) continue;
      var t = typeOf(p);
      if (t === KING) continue;
      if (t === KNIGHT || t === BISHOP) minors++; else others++;
    }
    return others === 0 && minors <= 1;
  };

  Position.prototype.status = function () {
    if (this.legalMoves(false).length === 0) return this.inCheck() ? 'checkmate' : 'stalemate';
    if (this.halfmove >= 100) return 'fifty';
    if (this.insufficientMaterial()) return 'material';
    var k = this.hashLo, count = 0;
    for (var i = 0; i < this.repetition.length; i++) if (this.repetition[i] === k) count++;
    if (count >= 3) return 'repetition';
    return this.inCheck() ? 'check' : 'normal';
  };

  // ---- notation ----------------------------------------------------------
  function sqName(s) { return String.fromCharCode(97 + fileOf(s)) + (rankOf(s) + 1); }
  var PIECE_LETTER = { 1: '', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };

  Position.prototype.moveToSan = function (m) {
    var from = mFrom(m), to = mTo(m), flag = mFlag(m);
    var piece = this.board[from], ty = typeOf(piece);
    var captured = this.board[to] || flag === F_EP;
    var san;

    if (flag === F_CASTLE_K) san = 'O-O';
    else if (flag === F_CASTLE_Q) san = 'O-O-O';
    else {
      san = PIECE_LETTER[ty];
      if (ty !== PAWN && ty !== KING) {
        var others = this.legalMoves(false), sameFile = false, sameRank = false, need = false;
        for (var i = 0; i < others.length; i++) {
          var o = others[i];
          if (o === m || mTo(o) !== to) continue;
          if (typeOf(this.board[mFrom(o)]) !== ty) continue;
          need = true;
          if (fileOf(mFrom(o)) === fileOf(from)) sameFile = true;
          if (rankOf(mFrom(o)) === rankOf(from)) sameRank = true;
        }
        if (need) {
          if (!sameFile) san += String.fromCharCode(97 + fileOf(from));
          else if (!sameRank) san += (rankOf(from) + 1);
          else san += sqName(from);
        }
      }
      if (captured) {
        if (ty === PAWN) san += String.fromCharCode(97 + fileOf(from));
        san += 'x';
      }
      san += sqName(to);
      if (flag === F_PROMO) san += '=' + PIECE_LETTER[mPromo(m)];
    }

    this.makeMove(m);
    var st = this.legalMoves(false).length === 0
      ? (this.inCheck() ? '#' : '') : (this.inCheck() ? '+' : '');
    this.unmakeMove();
    return san + st;
  };

  // ---- evaluation --------------------------------------------------------
  var VALUE = [0, 100, 325, 340, 500, 975, 0];
  var PHASE_W = [0, 0, 1, 1, 2, 4, 0];
  var TOTAL_PHASE = 24;

  var PST_MG = {}, PST_EG = {};
  PST_MG[PAWN] = [
      0,  0,  0,  0,  0,  0,  0,  0,
      2, -2, -6,-14,-14, -6, -2,  2,
      2, -4, -8,  0,  0, -8, -4,  2,
      0,  0,  4, 18, 18,  4,  0,  0,
      4,  6, 12, 24, 24, 12,  6,  4,
     16, 20, 28, 34, 34, 28, 20, 16,
     60, 62, 64, 66, 66, 64, 62, 60,
      0,  0,  0,  0,  0,  0,  0,  0];
  PST_EG[PAWN] = [
      0,  0,  0,  0,  0,  0,  0,  0,
      2,  2,  2,  2,  2,  2,  2,  2,
      6,  6,  6,  6,  6,  6,  6,  6,
     14, 14, 14, 14, 14, 14, 14, 14,
     30, 30, 30, 30, 30, 30, 30, 30,
     60, 60, 60, 60, 60, 60, 60, 60,
    100,100,100,100,100,100,100,100,
      0,  0,  0,  0,  0,  0,  0,  0];
  PST_MG[KNIGHT] = [
    -60,-38,-28,-24,-24,-28,-38,-60,
    -34,-16,  0,  6,  6,  0,-16,-34,
    -20,  6, 16, 20, 20, 16,  6,-20,
    -16,  8, 20, 26, 26, 20,  8,-16,
    -16,  6, 20, 26, 26, 20,  6,-16,
    -20,  4, 16, 20, 20, 16,  4,-20,
    -34,-16,  0,  4,  4,  0,-16,-34,
    -60,-38,-28,-24,-24,-28,-38,-60];
  PST_EG[KNIGHT] = PST_MG[KNIGHT];
  PST_MG[BISHOP] = [
    -20,-12,-14,-12,-12,-14,-12,-20,
     -8,  8,  4,  2,  2,  4,  8, -8,
     -4,  6, 10, 10, 10, 10,  6, -4,
     -4,  2, 10, 14, 14, 10,  2, -4,
     -2,  6, 10, 14, 14, 10,  6, -2,
     -4,  8, 10, 10, 10, 10,  8, -4,
     -8,  4,  4,  2,  2,  4,  4, -8,
    -20,-10,-12,-12,-12,-12,-10,-20];
  PST_EG[BISHOP] = PST_MG[BISHOP];
  PST_MG[ROOK] = [
     -4,  0,  6, 12, 12,  6,  0, -4,
     -8,  0,  2,  4,  4,  2,  0, -8,
     -8,  0,  2,  4,  4,  2,  0, -8,
     -8,  0,  2,  4,  4,  2,  0, -8,
     -8,  0,  2,  4,  4,  2,  0, -8,
     -8,  0,  2,  4,  4,  2,  0, -8,
     14, 18, 20, 22, 22, 20, 18, 14,
      2,  4,  8, 12, 12,  8,  4,  2];
  PST_EG[ROOK] = PST_MG[ROOK];
  PST_MG[QUEEN] = [
    -16,-10, -8, -4, -4, -8,-10,-16,
     -8,  0,  2,  0,  0,  2,  0, -8,
     -8,  2,  4,  4,  4,  4,  2, -8,
     -4,  0,  4,  6,  6,  4,  0, -4,
     -4,  0,  4,  6,  6,  4,  0, -4,
     -8,  2,  4,  4,  4,  4,  2, -8,
     -8,  0,  2,  0,  0,  2,  0, -8,
    -16,-10, -8, -4, -4, -8,-10,-16];
  PST_EG[QUEEN] = PST_MG[QUEEN];
  PST_MG[KING] = [
     24, 32, 14, -2, -2, 10, 34, 26,
     14, 16, -4,-14,-14, -4, 16, 14,
    -14,-24,-28,-32,-32,-28,-24,-14,
    -28,-36,-40,-48,-48,-40,-36,-28,
    -38,-46,-50,-58,-58,-50,-46,-38,
    -44,-52,-56,-62,-62,-56,-52,-44,
    -48,-54,-58,-64,-64,-58,-54,-48,
    -52,-58,-62,-68,-68,-62,-58,-52];
  PST_EG[KING] = [
    -56,-36,-24,-18,-18,-24,-36,-56,
    -30,-14,  0,  8,  8,  0,-14,-30,
    -22,  2, 22, 32, 32, 22,  2,-22,
    -18,  8, 32, 42, 42, 32,  8,-18,
    -18,  8, 32, 42, 42, 32,  8,-18,
    -22,  2, 22, 32, 32, 22,  2,-22,
    -30,-16,  0,  6,  6,  0,-16,-30,
    -56,-38,-28,-22,-22,-28,-38,-56];

  var PASSED_BONUS = [0, 8, 14, 26, 46, 78, 122, 0];

  function pstIndex(s, colour) {
    var f = fileOf(s), r = rankOf(s);
    return colour === WHITE ? r * 8 + f : (7 - r) * 8 + f;
  }

  Position.prototype.evaluate = function () {
    var b = this.board;
    var mg = 0, eg = 0, phase = 0;
    var pawnFiles = [[0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0]];
    var pawnSq = [[], []];
    var bishops = [0, 0];
    var s, p, t, c, ci;

    for (s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      p = b[s]; if (!p) continue;
      t = typeOf(p); c = colourOf(p); ci = c ? 1 : 0;
      phase += PHASE_W[t];
      var idx = pstIndex(s, c);
      var vmg = VALUE[t] + PST_MG[t][idx];
      var veg = VALUE[t] + PST_EG[t][idx];
      if (c === WHITE) { mg += vmg; eg += veg; } else { mg -= vmg; eg -= veg; }
      if (t === PAWN) { pawnFiles[ci][fileOf(s)]++; pawnSq[ci].push(s); }
      else if (t === BISHOP) bishops[ci]++;
    }

    if (bishops[0] >= 2) { mg += 28; eg += 44; }
    if (bishops[1] >= 2) { mg -= 28; eg -= 44; }

    for (ci = 0; ci < 2; ci++) {
      var sign = ci === 0 ? 1 : -1, opp = 1 - ci;
      for (var f = 0; f < 8; f++) {
        var n = pawnFiles[ci][f];
        if (n > 1) { mg -= sign * 16 * (n - 1); eg -= sign * 24 * (n - 1); }
        if (n > 0) {
          var left = f > 0 ? pawnFiles[ci][f - 1] : 0;
          var right = f < 7 ? pawnFiles[ci][f + 1] : 0;
          if (!left && !right) { mg -= sign * 14; eg -= sign * 20; }
        }
      }
      for (var i = 0; i < pawnSq[ci].length; i++) {
        var ps = pawnSq[ci][i], pf = fileOf(ps), pr = rankOf(ps), blocked = false;
        for (var j = 0; j < pawnSq[opp].length; j++) {
          var os = pawnSq[opp][j], of = fileOf(os), orank = rankOf(os);
          if (of < pf - 1 || of > pf + 1) continue;
          if (ci === 0 ? orank > pr : orank < pr) { blocked = true; break; }
        }
        if (!blocked) {
          var adv = ci === 0 ? pr : 7 - pr;
          mg += sign * PASSED_BONUS[adv] * 0.5;
          eg += sign * PASSED_BONUS[adv];
        }
      }
    }

    for (s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      p = b[s]; if (!p || typeOf(p) !== ROOK) continue;
      ci = colourOf(p) ? 1 : 0;
      var rf = fileOf(s);
      if (!pawnFiles[ci][rf]) {
        var bonus = pawnFiles[1 - ci][rf] ? 12 : 26;
        if (ci === 0) { mg += bonus; eg += bonus / 2; } else { mg -= bonus; eg -= bonus / 2; }
      }
    }

    for (ci = 0; ci < 2; ci++) {
      var ks = this.kings[ci];
      if (ks < 0) continue;
      var kf = fileOf(ks), kr = rankOf(ks), shield = 0;
      for (var df = -1; df <= 1; df++) {
        var sf = kf + df;
        if (sf < 0 || sf > 7) continue;
        var want = ci === 0 ? kr + 1 : kr - 1;
        if (want >= 0 && want <= 7) {
          var q = b[sq(sf, want)];
          if (q && typeOf(q) === PAWN && (colourOf(q) ? 1 : 0) === ci) shield += 12;
        }
      }
      mg += (ci === 0 ? shield : -shield);
    }

    if (phase > TOTAL_PHASE) phase = TOTAL_PHASE;
    var score = (mg * phase + eg * (TOTAL_PHASE - phase)) / TOTAL_PHASE;
    if (this.halfmove > 80) score = score * (110 - this.halfmove) / 30;
    return this.turn === WHITE ? score : -score;
  };

  // ---- transposition table -----------------------------------------------
  var TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  var ttKey = new Int32Array(TT_SIZE);
  var ttMove = new Int32Array(TT_SIZE);
  var ttScore = new Int32Array(TT_SIZE);
  var ttDepth = new Int8Array(TT_SIZE);
  var ttFlag = new Int8Array(TT_SIZE);
  var ttGen = new Int8Array(TT_SIZE);
  var generation = 0;
  var TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;

  function ttClear() {
    ttKey.fill(0); ttMove.fill(0); ttScore.fill(0);
    ttDepth.fill(0); ttFlag.fill(0); ttGen.fill(0);
  }

  var MATE = 30000, INF = 1 << 24;

  // ---- search ------------------------------------------------------------
  function Search(pos) {
    this.pos = pos;
    this.nodes = 0;
    this.deadline = 0;
    this.aborted = false;
    this.killers = [];
    this.hist = new Int32Array(128 * 128);
    this.stopCheck = 0;
  }

  Search.prototype.timeUp = function () {
    if ((++this.stopCheck & 1023) !== 0) return false;
    if (Date.now() >= this.deadline) { this.aborted = true; return true; }
    return false;
  };

  Search.prototype.scoreMove = function (m, ply, ttm) {
    if (m === ttm) return 2000000;
    var b = this.pos.board;
    var victim = b[mTo(m)];
    if (victim) return 1000000 + VALUE[typeOf(victim)] * 16 - VALUE[typeOf(b[mFrom(m)])];
    if (mFlag(m) === F_PROMO) return 900000 + VALUE[mPromo(m)];
    if (mFlag(m) === F_EP) return 1000000;
    var k = this.killers[ply];
    if (k) { if (k[0] === m) return 800000; if (k[1] === m) return 790000; }
    return this.hist[mFrom(m) * 128 + mTo(m)];
  };

  Search.prototype.order = function (moves, ply, ttm) {
    var n = moves.length, scores = new Int32Array(n), i, j;
    for (i = 0; i < n; i++) scores[i] = this.scoreMove(moves[i], ply, ttm);
    for (i = 1; i < n; i++) {
      var mv = moves[i], sc = scores[i];
      for (j = i - 1; j >= 0 && scores[j] < sc; j--) { moves[j + 1] = moves[j]; scores[j + 1] = scores[j]; }
      moves[j + 1] = mv; scores[j + 1] = sc;
    }
    return moves;
  };

  Search.prototype.quiesce = function (alpha, beta, ply) {
    this.nodes++;
    if (this.timeUp()) return alpha;

    var pos = this.pos, us = pos.turn, them = us === WHITE ? BLACK : WHITE;
    var stand = pos.evaluate();
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 40) return alpha;

    var moves = this.order(pos.genMoves(true), ply, 0);
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var victim = pos.board[mTo(m)];
      if (victim && mFlag(m) !== F_PROMO && stand + VALUE[typeOf(victim)] + 200 < alpha) continue;
      pos.makeMove(m);
      if (pos.attacked(pos.kings[us ? 1 : 0], them)) { pos.unmakeMove(); continue; }
      var v = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmakeMove();
      if (this.aborted) return alpha;
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  };

  Search.prototype.isRepeat = function () {
    var pos = this.pos, k = pos.hashLo, seen = 0;
    for (var i = pos.history.length - 1; i >= 0; i--) {
      if (pos.history[i].hashLo === k) { if (++seen >= 1) return true; }
      if (pos.history[i].halfmove === 0) break;
    }
    for (var r = 0; r < pos.repetition.length; r++) if (pos.repetition[r] === k) { if (++seen >= 2) return true; }
    return false;
  };

  Search.prototype.search = function (depth, alpha, beta, ply, canNull) {
    var pos = this.pos;

    if (ply > 0) {
      if (pos.halfmove >= 100) return 0;
      if (this.isRepeat()) return 0;
      if (alpha < -MATE + ply) alpha = -MATE + ply;
      if (beta > MATE - ply - 1) beta = MATE - ply - 1;
      if (alpha >= beta) return alpha;
    }

    var us = pos.turn, them = us === WHITE ? BLACK : WHITE;
    var inCheck = pos.attacked(pos.kings[us ? 1 : 0], them);
    if (inCheck && depth < 40) depth++;             // check extension

    if (depth <= 0) return this.quiesce(alpha, beta, ply);

    this.nodes++;
    if (this.timeUp()) return alpha;

    var idx = pos.hashLo & TT_MASK, ttm = 0;
    if (ttKey[idx] === pos.hashHi && ttFlag[idx] !== 0) {
      ttm = ttMove[idx];
      if (ttDepth[idx] >= depth && ply > 0) {
        var ts = ttScore[idx], fl = ttFlag[idx];
        if (ts > MATE - 1000) ts -= ply; else if (ts < -MATE + 1000) ts += ply;
        if (fl === TT_EXACT) return ts;
        if (fl === TT_LOWER && ts >= beta) return ts;
        if (fl === TT_UPPER && ts <= alpha) return ts;
      }
    }

    var staticEval = inCheck ? 0 : pos.evaluate();

    if (!inCheck && depth <= 4 && ply > 0 && beta < MATE - 1000 && beta > -MATE + 1000 &&
        staticEval - 110 * depth >= beta) {
      return staticEval;
    }

    if (canNull && !inCheck && depth >= 3 && ply > 0 && beta < MATE - 1000 && beta > -MATE + 1000) {
      var big = 0;
      for (var s2 = 0; s2 < 128; s2++) {
        if (s2 & 0x88) { s2 += 7; continue; }
        var pp = pos.board[s2];
        if (pp && colourOf(pp) === us) { var tt2 = typeOf(pp); if (tt2 !== PAWN && tt2 !== KING) { big++; break; } }
      }
      if (big > 0) {
        var R = 2 + (depth > 6 ? 1 : 0);
        pos.makeNull();
        var nv = -this.search(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
        pos.unmakeNull();
        if (this.aborted) return alpha;
        if (nv >= beta) return beta;
      }
    }

    var moves = this.order(pos.genMoves(false), ply, ttm);
    var legal = 0, best = -INF, bestMove = 0, origAlpha = alpha;

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var isCapture = !!pos.board[mTo(m)] || mFlag(m) === F_EP;
      var isPromo = mFlag(m) === F_PROMO;

      pos.makeMove(m);
      if (pos.attacked(pos.kings[us ? 1 : 0], them)) { pos.unmakeMove(); continue; }
      legal++;

      var givesCheck = pos.attacked(pos.kings[them ? 1 : 0], us);
      var v;

      if (legal === 1) {
        v = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        var red = 0;
        if (depth >= 3 && legal > 3 && !isCapture && !isPromo && !givesCheck && !inCheck) {
          red = 1 + (legal > 8 ? 1 : 0) + (depth > 6 ? 1 : 0);
          if (red > depth - 2) red = depth - 2;
          if (red < 0) red = 0;
        }
        v = -this.search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && red > 0) v = -this.search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && v < beta) v = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmakeMove();

      if (this.aborted) return best > -INF ? best : alpha;

      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (!isCapture) {
          if (!this.killers[ply]) this.killers[ply] = [0, 0];
          if (this.killers[ply][0] !== m) {
            this.killers[ply][1] = this.killers[ply][0];
            this.killers[ply][0] = m;
          }
          var h2 = mFrom(m) * 128 + mTo(m);
          this.hist[h2] += depth * depth;
          if (this.hist[h2] > 400000) for (var q = 0; q < this.hist.length; q++) this.hist[q] >>= 1;
        }
        break;
      }
    }

    if (legal === 0) return inCheck ? -MATE + ply : 0;

    var store = best;
    if (store > MATE - 1000) store += ply; else if (store < -MATE + 1000) store -= ply;
    if (ttFlag[idx] === 0 || ttDepth[idx] <= depth || ttGen[idx] !== generation) {
      ttKey[idx] = pos.hashHi; ttMove[idx] = bestMove; ttScore[idx] = store;
      ttDepth[idx] = depth > 127 ? 127 : depth; ttGen[idx] = generation;
      ttFlag[idx] = best <= origAlpha ? TT_UPPER : (best >= beta ? TT_LOWER : TT_EXACT);
    }
    return best;
  };

  // ---- opening book ------------------------------------------------------
  var BOOK = {
    '': ['e4', 'e4', 'd4', 'd4', 'Nf3', 'c4'],
    'e4': ['e5', 'c5', 'c5', 'e6', 'c6'],
    'e4 e5': ['Nf3'],
    'e4 e5 Nf3': ['Nc6'],
    'e4 e5 Nf3 Nc6': ['Bb5', 'Bc4', 'd4'],
    'e4 e5 Nf3 Nc6 Bb5': ['a6'],
    'e4 e5 Nf3 Nc6 Bc4': ['Bc5', 'Nf6'],
    'e4 c5': ['Nf3'],
    'e4 c5 Nf3': ['d6', 'Nc6', 'e6'],
    'e4 c5 Nf3 d6': ['d4'],
    'e4 e6': ['d4'], 'e4 e6 d4': ['d5'],
    'e4 c6': ['d4'], 'e4 c6 d4': ['d5'],
    'd4': ['Nf6', 'd5', 'Nf6'],
    'd4 d5': ['c4'], 'd4 d5 c4': ['e6', 'c6', 'dxc4'],
    'd4 Nf6': ['c4'], 'd4 Nf6 c4': ['e6', 'g6'],
    'd4 Nf6 c4 g6': ['Nc3'], 'd4 Nf6 c4 e6': ['Nc3', 'Nf3'],
    'Nf3': ['d5', 'Nf6'],
    'c4': ['e5', 'Nf6', 'c5']
  };

  Position.prototype.bookMove = function (sanLine) {
    var entry = BOOK[(sanLine || []).join(' ')];
    if (!entry) return null;
    var want = entry[Math.floor(Math.random() * entry.length)];
    var moves = this.legalMoves(false);
    for (var i = 0; i < moves.length; i++) if (this.moveToSan(moves[i]) === want) return moves[i];
    return null;
  };

  // ---- difficulty --------------------------------------------------------
  /* Every level runs the full search — no crippling, no random blunders.
     Level 1 sits roughly where the old top level did; the ladder climbs
     from there through depth and time. */
  var LEVELS = [
    null,
    { depth: 9,  time: 1500,  book: true },
    { depth: 13, time: 3000,  book: true },
    { depth: 17, time: 6000,  book: true },
    { depth: 24, time: 11000, book: true },
    { depth: 40, time: 20000, book: true }
  ];

  Position.prototype.think = function (level, sanLine, onProgress) {
    var cfg = LEVELS[Math.max(1, Math.min(5, level || 3))];

    if (cfg.book && sanLine && sanLine.length <= 8) {
      var bm = this.bookMove(sanLine);
      if (bm !== null) return { move: bm, san: this.moveToSan(bm), score: 0, depth: 0, nodes: 0, book: true };
    }

    var root = this.legalMoves(false);
    if (root.length === 0) return null;
    if (root.length === 1) return { move: root[0], san: this.moveToSan(root[0]), score: 0, depth: 1, nodes: 0 };

    generation = (generation + 1) & 127;
    var s = new Search(this);
    var start = Date.now();
    s.deadline = start + cfg.time;

    var bestMove = root[0], bestScore = 0, reached = 0;

    for (var d = 1; d <= cfg.depth; d++) {
      var localBest = 0, localScore = -INF, first = true;
      var ordered = d === 1 ? root.slice()
                            : [bestMove].concat(root.filter(function (m) { return m !== bestMove; }));

      for (var i = 0; i < ordered.length; i++) {
        var m = ordered[i], v;
        this.makeMove(m);
        if (first) {
          v = -s.search(d - 1, -INF, INF, 1, true);
        } else {
          v = -s.search(d - 1, -localScore - 1, -localScore, 1, true);
          if (v > localScore && !s.aborted) v = -s.search(d - 1, -INF, -localScore, 1, true);
        }
        this.unmakeMove();
        if (s.aborted) break;
        first = false;
        if (v > localScore) { localScore = v; localBest = m; }
      }

      if (!s.aborted && localBest) {
        bestMove = localBest; bestScore = localScore; reached = d;
        if (onProgress) onProgress({ depth: d, score: bestScore, nodes: s.nodes });
      }
      if (s.aborted) break;
      if (Math.abs(bestScore) > MATE - 1000) break;
      if (Date.now() - start > cfg.time * 0.5) break;   // next iteration wouldn't finish
    }

    return {
      move: bestMove, san: this.moveToSan(bestMove),
      score: bestScore, depth: reached, nodes: s.nodes,
      ms: Date.now() - start
    };
  };

  Position.prototype.clearTT = ttClear;

  // ---- exports -----------------------------------------------------------
  root.Chess = {
    Position: Position, START_FEN: START_FEN, LEVELS: LEVELS,
    EMPTY: EMPTY, PAWN: PAWN, KNIGHT: KNIGHT, BISHOP: BISHOP, ROOK: ROOK, QUEEN: QUEEN, KING: KING,
    WHITE: WHITE, BLACK: BLACK,
    typeOf: typeOf, colourOf: colourOf,
    sq: sq, fileOf: fileOf, rankOf: rankOf, onBoard: onBoard, sqName: sqName,
    mFrom: mFrom, mTo: mTo, mFlag: mFlag, mPromo: mPromo, mkMove: mkMove,
    F_NORMAL: F_NORMAL, F_DOUBLE: F_DOUBLE, F_EP: F_EP,
    F_CASTLE_K: F_CASTLE_K, F_CASTLE_Q: F_CASTLE_Q, F_PROMO: F_PROMO,
    ttClear: ttClear
  };
  return root.Chess;
}

/* Instantiate for the current environment, and keep the module source so the
   UI can spin the same code up inside a Blob Worker. */
(function (g) {
  ChessEngineModule(g);
  g.ChessEngineSource = ChessEngineModule.toString();
  if (typeof module !== 'undefined' && module.exports) module.exports = g.Chess;
})(typeof window !== 'undefined' ? window : globalThis);
