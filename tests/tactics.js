const NEW = require('../app/src/main/assets/engine.js');


// Well-known tactical test positions with their winning move
const SUITE = [
  ['2rr3k/pp3pp1/1nnqbN1p/3pN3/2pP4/2P3Q1/PPB4P/R4RK1 w - - 0 1', 'Qg6'],
  ['8/7p/5k2/5p2/p1p2P2/Pr1pPK2/1P1R3P/8 b - - 0 1',              'Rxb2'],
  ['5rk1/1ppb3p/p1pb4/6q1/3P1p1r/2P1R2P/PP1BQ1P1/5RKN w - - 0 1', 'Rg3'],
  ['r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PP3PPR/2KR4 w - - 0 1',  'Qxh7+'],
  ['5k2/6pp/p1qN4/1p1p4/3P4/2PKP2Q/PP3r2/3R4 b - - 0 1',          'Qc4+'],
  ['7k/p7/1R5K/6r1/6p1/6P1/8/8 w - - 0 1',                        'Rb7'],
  ['rnbqkb1r/pppp1ppp/8/4P3/6n1/7P/PPPNPiPP/R1BQKBNR b KQkq - 0 1','Ne3'],
];

function run(name, mod, level) {
  let hit = 0, total = 0, ms = 0;
  const lines = [];
  for (const [fen, want] of SUITE) {
    let pos;
    try { pos = new mod.Position().setFen(fen); } catch (e) { continue; }
    if (pos.legalMoves(false).length === 0) continue;
    total++;
    const t = Date.now();
    const r = pos.think(level, []);          // empty line = no book
    ms += Date.now() - t;
    const ok = r && r.san === want;
    if (ok) hit++;
    lines.push(`   ${ok ? 'FOUND ' : 'missed'} want ${want.padEnd(6)} got ${(r ? r.san : '-').padEnd(6)} d${r ? r.depth : 0}`);
  }
  console.log(`${name}: ${hit}/${total} solved in ${(ms/1000).toFixed(1)}s`);
  lines.forEach(l => console.log(l));
  return hit;
}

for (const lvl of [1, 2, 3]) {
  console.log(`=== level ${lvl} ===`);
  run('level ' + lvl, NEW, lvl);
  console.log();
}
