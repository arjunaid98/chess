const Chess = require('../app/src/main/assets/engine.js');
const pos = new Chess.Position().reset();
const line = [];
let t0 = Date.now();
for (let ply = 0; ply < 120; ply++) {
  const st = pos.status();
  if (st === 'checkmate' || st === 'stalemate' || st === 'fifty' || st === 'material' || st === 'repetition') {
    console.log('game over:', st, 'at ply', ply); break;
  }
  const r = pos.think(3);
  if (!r) { console.log('no move'); break; }
  const legal = pos.legalMoves(false);
  if (!legal.includes(r.move)) { console.log('!!! ILLEGAL MOVE RETURNED at ply', ply); process.exit(1); }
  line.push((pos.turn === Chess.WHITE ? pos.fullmove + '.' : '') + r.san);
  pos.makeMove(r.move);
  pos.repetition.push(pos.key());
}
console.log(line.join(' '));
console.log('elapsed', Date.now() - t0, 'ms');

// undo/redo integrity: unmake everything and compare to start
const p2 = new Chess.Position().reset();
const keys = [p2.key()];
for (let i = 0; i < 40; i++) {
  const ms = p2.legalMoves(false);
  if (!ms.length) break;
  p2.makeMove(ms[Math.floor(Math.random() * ms.length)]);
  keys.push(p2.key());
}
let ok = true;
for (let i = keys.length - 1; i > 0; i--) {
  if (p2.key() !== keys[i]) { ok = false; break; }
  p2.unmakeMove();
}
console.log('unmake integrity:', ok && p2.key() === keys[0] ? 'PASS' : 'FAIL');

// level timing on a mid-game position
const mid = new Chess.Position().setFen('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
for (const lvl of [1,2,3,4,5]) {
  const s = Date.now();
  const r = mid.think(lvl);
  console.log(`level ${lvl}: ${r.san.padEnd(6)} depth ${r.depth} nodes ${String(r.nodes).padStart(8)} ${Date.now()-s}ms`);
}
