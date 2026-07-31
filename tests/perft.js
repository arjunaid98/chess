const Chess = require('../app/src/main/assets/engine.js');

const cases = [
  ['startpos', Chess.START_FEN, [20, 400, 8902, 197281, 4865609]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['pos4b', 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', [6, 264, 9467, 422333]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  ['pos6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
];

let failures = 0;
for (const [name, fen, expected] of cases) {
  const pos = new Chess.Position().setFen(fen);
  for (let d = 1; d <= expected.length; d++) {
    const t0 = Date.now();
    const got = pos.perft(d);
    const ok = got === expected[d - 1];
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(9)} depth ${d}  got ${String(got).padStart(8)}` +
      `  want ${String(expected[d - 1]).padStart(8)}  (${Date.now() - t0}ms)`
    );
  }
}
console.log(failures === 0 ? '\nAll perft tests passed.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
