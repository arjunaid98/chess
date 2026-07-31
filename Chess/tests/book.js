const Chess = require('../app/src/main/assets/engine.js');
for (let g = 0; g < 3; g++) {
  const pos = new Chess.Position().reset();
  const san = [];
  for (let ply = 0; ply < 30; ply++) {
    const st = pos.status();
    if (['checkmate','stalemate','fifty','material','repetition'].includes(st)) { console.log('  end:', st); break; }
    const r = pos.think(4, san);
    if (!r) break;
    if (!pos.legalMoves(false).includes(r.move)) { console.log('ILLEGAL!'); process.exit(1); }
    san.push(r.san);
    pos.makeMove(r.move);
    pos.repetition.push(pos.key());
  }
  let out = '';
  san.forEach((m,i) => { out += (i%2===0 ? ` ${i/2+1}.` : ' ') + m; });
  console.log('game', g+1 + ':' + out);
}
