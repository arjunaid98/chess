/* engine.js — 0x88 chess engine: board state, legal move generation, search.
   Self-contained, no dependencies. */
(function (root) {
  'use strict';

  // ---- piece codes -------------------------------------------------------
  var EMPTY = 0, PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var WHITE = 0, BLACK = 8;              // colour lives in bit 3
  var TYPE = 7;                          // mask for piece type

  function colourOf(p) { return p & BLACK; }
  function typeOf(p) { return p & TYPE; }

  // ---- 0x88 helpers ------------------------------------------------------
  function sq(file, rank) { return rank * 16 + file; }        // a1 = 0
  function fileOf(s) { return s & 15; }
  function rankOf(s) { return s >> 4; }
  function onBoard(s) { return (s & 0x88) === 0; }

  var KNIGHT_DIRS = [33, 31, 18, 14, -14, -18, -31, -33];
  var BISHOP_DIRS = [17, 15, -15, -17];
  var ROOK_DIRS = [16, 1, -1, -16];
  var KING_DIRS = [17, 16, 15, 1, -1, -15, -16, -17];

  // castling rights bits
  var CR_WK = 1, CR_WQ = 2, CR_BK = 4, CR_BQ = 8;

  // move flags
  var F_NORMAL = 0, F_DOUBLE = 1, F_EP = 2, F_CASTLE_K = 3, F_CASTLE_Q = 4, F_PROMO = 5;

  function mkMove(from, to, flag, promo) {
    return from | (to << 8) | ((promo || 0) << 16) | (flag << 20);
  }
  function mFrom(m) { return m & 0xff; }
  function mTo(m) { return (m >> 8) & 0xff; }
  function mPromo(m) { return (m >> 16) & 0xf; }
  function mFlag(m) { return (m >> 20) & 0xf; }

  // ---- position ----------------------------------------------------------
  function Position() {
    this.board = new Int8Array(128);
    this.turn = WHITE;
    this.castling = 0;
    this.ep = -1;               // en-passant target square, -1 if none
    this.halfmove = 0;
    this.fullmove = 1;
    this.kings = [-1, -1];      // [white, black]
    this.history = [];
    this.repetition = [];       // simple position-key history for draw detection
  }

  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  var FEN_CHARS = {
    p: PAWN | BLACK, n: KNIGHT | BLACK, b: BISHOP | BLACK,
    r: ROOK | BLACK, q: QUEEN | BLACK, k: KING | BLACK,
    P: PAWN, N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING
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
        var piece = FEN_CHARS[c];
        var s = sq(file, rank);
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
    this.repetition = [this.key()];
    return this;
  };

  Position.prototype.reset = function () { return this.setFen(START_FEN); };

  Position.prototype.key = function () {
    // cheap string key; only used for repetition detection
    var s = '';
    for (var r = 7; r >= 0; r--)
      for (var f = 0; f < 8; f++) s += String.fromCharCode(65 + this.board[sq(f, r)]);
    return s + this.turn + this.castling + this.ep;
  };

  Position.prototype.clone = function () {
    var p = new Position();
    p.board = this.board.slice();
    p.turn = this.turn; p.castling = this.castling; p.ep = this.ep;
    p.halfmove = this.halfmove; p.fullmove = this.fullmove;
    p.kings = this.kings.slice();
    p.history = []; p.repetition = this.repetition.slice();
    return p;
  };

  // ---- attack detection --------------------------------------------------
  // Is square `s` attacked by side `by` (WHITE or BLACK)?
  Position.prototype.attacked = function (s, by) {
    var b = this.board, i, d, t, p;

    // pawns
    var pd = by === WHITE ? -16 : 16;   // step back from s towards attacker
    for (i = -1; i <= 1; i += 2) {
      t = s + pd + i;
      if (onBoard(t)) {
        p = b[t];
        if (p && colourOf(p) === by && typeOf(p) === PAWN) return true;
      }
    }
    // knights
    for (i = 0; i < 8; i++) {
      t = s + KNIGHT_DIRS[i];
      if (onBoard(t)) {
        p = b[t];
        if (p && colourOf(p) === by && typeOf(p) === KNIGHT) return true;
      }
    }
    // king
    for (i = 0; i < 8; i++) {
      t = s + KING_DIRS[i];
      if (onBoard(t)) {
        p = b[t];
        if (p && colourOf(p) === by && typeOf(p) === KING) return true;
      }
    }
    // bishops / queens
    for (i = 0; i < 4; i++) {
      d = BISHOP_DIRS[i]; t = s + d;
      while (onBoard(t)) {
        p = b[t];
        if (p) {
          if (colourOf(p) === by && (typeOf(p) === BISHOP || typeOf(p) === QUEEN)) return true;
          break;
        }
        t += d;
      }
    }
    // rooks / queens
    for (i = 0; i < 4; i++) {
      d = ROOK_DIRS[i]; t = s + d;
      while (onBoard(t)) {
        p = b[t];
        if (p) {
          if (colourOf(p) === by && (typeOf(p) === ROOK || typeOf(p) === QUEEN)) return true;
          break;
        }
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

  // ---- pseudo-legal move generation --------------------------------------
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
            if (tp) {
              if (colourOf(tp) === them) moves.push(mkMove(from, t, F_NORMAL, 0));
              break;
            }
            if (!capturesOnly) moves.push(mkMove(from, t, F_NORMAL, 0));
            t += d;
          }
        }
      }
    }

    // castling
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
    CASTLE_MASK[0] = 15 & ~CR_WQ;    // a1
    CASTLE_MASK[7] = 15 & ~CR_WK;    // h1
    CASTLE_MASK[4] = 15 & ~(CR_WK | CR_WQ);  // e1
    CASTLE_MASK[112] = 15 & ~CR_BQ;  // a8
    CASTLE_MASK[119] = 15 & ~CR_BK;  // h8
    CASTLE_MASK[116] = 15 & ~(CR_BK | CR_BQ); // e8
  })();

  Position.prototype.makeMove = function (m) {
    var b = this.board, from = mFrom(m), to = mTo(m), flag = mFlag(m);
    var piece = b[from], us = this.turn, them = us === WHITE ? BLACK : WHITE;
    var captured = b[to], capturedSq = to;

    if (flag === F_EP) {
      capturedSq = to + (us === WHITE ? -16 : 16);
      captured = b[capturedSq];
    }

    this.history.push({
      move: m, captured: captured, capturedSq: capturedSq,
      castling: this.castling, ep: this.ep, halfmove: this.halfmove,
      kings: this.kings.slice()
    });

    if (captured) b[capturedSq] = EMPTY;
    b[to] = piece;
    b[from] = EMPTY;

    if (flag === F_PROMO) b[to] = mPromo(m) | us;

    if (flag === F_CASTLE_K) {
      b[to - 1] = b[to + 1]; b[to + 1] = EMPTY;
    } else if (flag === F_CASTLE_Q) {
      b[to + 1] = b[to - 2]; b[to - 2] = EMPTY;
    }

    if (typeOf(piece) === KING) this.kings[us ? 1 : 0] = to;

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flag === F_DOUBLE ? (from + (us === WHITE ? 16 : -16)) : -1;
    this.halfmove = (typeOf(piece) === PAWN || captured) ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.turn = them;
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
    this.kings = h.kings;
    return true;
  };

  // ---- legal moves -------------------------------------------------------
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
  Position.prototype.status = function () {
    var moves = this.legalMoves(false);
    if (moves.length === 0) return this.inCheck() ? 'checkmate' : 'stalemate';
    if (this.halfmove >= 100) return 'fifty';
    if (this.insufficientMaterial()) return 'material';
    var k = this.key(), count = 0;
    for (var i = 0; i < this.repetition.length; i++) if (this.repetition[i] === k) count++;
    if (count >= 3) return 'repetition';
    return this.inCheck() ? 'check' : 'normal';
  };

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
        // disambiguation
        var others = this.legalMoves(false), sameFile = false, sameRank = false, need = false;
        for (var i = 0; i < others.length; i++) {
          var o = others[i];
          if (o === m) continue;
          if (mTo(o) !== to) continue;
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
  var VALUE = [0, 100, 320, 330, 500, 900, 20000];

  // piece-square tables, from white's point of view, index rank*8+file (a1 = 0)
  var PST = {};
  PST[PAWN] = [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10,-20,-20, 10, 10,  5,
      5, -5,-10,  0,  0,-10, -5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5,  5, 10, 25, 25, 10,  5,  5,
     10, 10, 20, 30, 30, 20, 10, 10,
     50, 50, 50, 50, 50, 50, 50, 50,
      0,  0,  0,  0,  0,  0,  0,  0];
  PST[KNIGHT] = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50];
  PST[BISHOP] = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -20,-10,-10,-10,-10,-10,-10,-20];
  PST[ROOK] = [
      0,  0,  5, 10, 10,  5,  0,  0,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      5, 10, 10, 10, 10, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0];
  PST[QUEEN] = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -10,  5,  5,  5,  5,  5,  0,-10,
      0,  0,  5,  5,  5,  5,  0, -5,
     -5,  0,  5,  5,  5,  5,  0, -5,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20];
  var KING_MID = [
     20, 30, 10,  0,  0, 10, 30, 20,
     20, 20,  0,  0,  0,  0, 20, 20,
    -10,-20,-20,-20,-20,-20,-20,-10,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30];
  var KING_END = [
    -50,-30,-30,-30,-30,-30,-30,-50,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -50,-40,-30,-20,-20,-30,-40,-50];

  function pstIndex(s, colour) {
    var f = fileOf(s), r = rankOf(s);
    return colour === WHITE ? r * 8 + f : (7 - r) * 8 + f;
  }

  Position.prototype.evaluate = function () {
    var score = 0, material = 0, s, p, t, c;
    for (s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      p = this.board[s]; if (!p) continue;
      t = typeOf(p);
      if (t !== KING && t !== PAWN) material += VALUE[t];
    }
    var endgame = material < 1400;
    for (s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      p = this.board[s]; if (!p) continue;
      t = typeOf(p); c = colourOf(p);
      var v = VALUE[t];
      var table = t === KING ? (endgame ? KING_END : KING_MID) : PST[t];
      v += table[pstIndex(s, c)];
      score += c === WHITE ? v : -v;
    }
    return this.turn === WHITE ? score : -score;
  };

  // ---- search ------------------------------------------------------------
  var MATE = 100000;

  function Search(pos) {
    this.pos = pos;
    this.nodes = 0;
    this.deadline = 0;
    this.aborted = false;
    this.killers = [];
  }

  Search.prototype.score = function (m, depth) {
    var b = this.pos.board;
    var victim = b[mTo(m)], attacker = b[mFrom(m)];
    if (victim) return 1000000 + VALUE[typeOf(victim)] * 10 - VALUE[typeOf(attacker)];
    if (mFlag(m) === F_PROMO) return 900000 + VALUE[mPromo(m)];
    var k = this.killers[depth];
    if (k && (k[0] === m || k[1] === m)) return 800000;
    return 0;
  };

  Search.prototype.order = function (moves, depth) {
    var self = this, scored = moves.map(function (m) { return [self.score(m, depth), m]; });
    scored.sort(function (a, b) { return b[0] - a[0]; });
    return scored.map(function (x) { return x[1]; });
  };

  Search.prototype.quiesce = function (alpha, beta) {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) { this.aborted = true; return alpha; }
    var stand = this.pos.evaluate();
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    var pos = this.pos, us = pos.turn;
    var moves = this.order(pos.genMoves(true), 0);
    for (var i = 0; i < moves.length; i++) {
      pos.makeMove(moves[i]);
      if (pos.attacked(pos.kings[us ? 1 : 0], us === WHITE ? BLACK : WHITE)) { pos.unmakeMove(); continue; }
      var v = -this.quiesce(-beta, -alpha);
      pos.unmakeMove();
      if (this.aborted) return alpha;
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  };

  Search.prototype.alphabeta = function (depth, alpha, beta, ply) {
    if (depth <= 0) return this.quiesce(alpha, beta);
    this.nodes++;
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) { this.aborted = true; return alpha; }

    var pos = this.pos, us = pos.turn, them = us === WHITE ? BLACK : WHITE;
    var moves = this.order(pos.genMoves(false), ply);
    var legal = 0, best = -Infinity;

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      pos.makeMove(m);
      if (pos.attacked(pos.kings[us ? 1 : 0], them)) { pos.unmakeMove(); continue; }
      legal++;
      var v = -this.alphabeta(depth - 1, -beta, -alpha, ply + 1);
      pos.unmakeMove();
      if (this.aborted) return best === -Infinity ? alpha : best;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (!pos.board[mTo(m)]) {
          if (!this.killers[ply]) this.killers[ply] = [0, 0];
          if (this.killers[ply][0] !== m) {
            this.killers[ply][1] = this.killers[ply][0];
            this.killers[ply][0] = m;
          }
        }
        return beta;
      }
    }

    if (legal === 0) return pos.inCheck() ? -MATE + ply : 0;
    if (pos.halfmove >= 100) return 0;
    return best;
  };

  // ---- opening book ------------------------------------------------------
  // Keyed by the SAN move list so far. Keeps early play recognisable.
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
    'e4 e6': ['d4'],
    'e4 e6 d4': ['d5'],
    'e4 c6': ['d4'],
    'e4 c6 d4': ['d5'],
    'd4': ['Nf6', 'd5', 'Nf6'],
    'd4 d5': ['c4'],
    'd4 d5 c4': ['e6', 'c6', 'dxc4'],
    'd4 Nf6': ['c4'],
    'd4 Nf6 c4': ['e6', 'g6'],
    'd4 Nf6 c4 g6': ['Nc3'],
    'd4 Nf6 c4 e6': ['Nc3', 'Nf3'],
    'Nf3': ['d5', 'Nf6'],
    'c4': ['e5', 'Nf6', 'c5']
  };

  Position.prototype.bookMove = function (sanLine) {
    var entry = BOOK[(sanLine || []).join(' ')];
    if (!entry) return null;
    var want = entry[Math.floor(Math.random() * entry.length)];
    var moves = this.legalMoves(false);
    for (var i = 0; i < moves.length; i++) {
      if (this.moveToSan(moves[i]) === want) return moves[i];
    }
    return null;
  };

  /* Pick a move. `level` 1..5 maps to depth + thinking time.
     `sanLine` is the game's move list so far, used for the opening book.
     Returns { move, san, score, depth, nodes, book } or null if no legal move. */
  Position.prototype.think = function (level, sanLine) {
    level = level || 3;
    var settings = [
      null,
      { depth: 1,  time: 150,  fuzz: 110, book: false },
      { depth: 3,  time: 500,  fuzz: 35,  book: false },
      { depth: 5,  time: 1600, fuzz: 5,   book: true },
      { depth: 7,  time: 3200, fuzz: 0,   book: true },
      { depth: 12, time: 6000, fuzz: 0,   book: true }
    ][Math.max(1, Math.min(5, level))];

    if (settings.book && sanLine && sanLine.length <= 8) {
      var bm = this.bookMove(sanLine);
      if (bm !== null) {
        return { move: bm, san: this.moveToSan(bm), score: 0, depth: 0, nodes: 0, book: true };
      }
    }

    var s = new Search(this);
    s.deadline = Date.now() + settings.time;

    var root = this.legalMoves(false);
    if (root.length === 0) return null;

    var bestMove = root[0], bestScore = -Infinity, reachedDepth = 0;
    var us = this.turn, them = us === WHITE ? BLACK : WHITE;

    for (var d = 1; d <= settings.depth; d++) {
      var localBest = null, localScore = -Infinity;
      var ordered = d === 1 ? s.order(root, 0)
                            : [bestMove].concat(root.filter(function (m) { return m !== bestMove; }));
      for (var i = 0; i < ordered.length; i++) {
        var m = ordered[i];
        this.makeMove(m);
        var v = -s.alphabeta(d - 1, -Infinity, -localScore, 1);
        this.unmakeMove();
        if (s.aborted) break;
        var fuzz = settings.fuzz ? (Math.random() * settings.fuzz * 2 - settings.fuzz) : 0;
        v += fuzz;
        if (v > localScore) { localScore = v; localBest = m; }
      }
      if (localBest !== null && !s.aborted) {
        bestMove = localBest; bestScore = localScore; reachedDepth = d;
      }
      if (s.aborted || Date.now() > s.deadline) break;
      if (bestScore > MATE - 100) break;
    }

    return {
      move: bestMove,
      san: this.moveToSan(bestMove),
      score: bestScore,
      depth: reachedDepth,
      nodes: s.nodes
    };
  };

  // ---- exports -----------------------------------------------------------
  var API = {
    Position: Position, START_FEN: START_FEN,
    EMPTY: EMPTY, PAWN: PAWN, KNIGHT: KNIGHT, BISHOP: BISHOP, ROOK: ROOK, QUEEN: QUEEN, KING: KING,
    WHITE: WHITE, BLACK: BLACK,
    typeOf: typeOf, colourOf: colourOf,
    sq: sq, fileOf: fileOf, rankOf: rankOf, onBoard: onBoard, sqName: sqName,
    mFrom: mFrom, mTo: mTo, mFlag: mFlag, mPromo: mPromo, mkMove: mkMove,
    F_NORMAL: F_NORMAL, F_DOUBLE: F_DOUBLE, F_EP: F_EP,
    F_CASTLE_K: F_CASTLE_K, F_CASTLE_Q: F_CASTLE_Q, F_PROMO: F_PROMO
  };

  root.Chess = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof window !== 'undefined' ? window : globalThis);
