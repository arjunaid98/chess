# Chess for Android

A chess app for phones and tablets, rebuilt from the macOS Chess app bundle. The board runs
edge to edge — no border, no bezel — and uses the board and piece materials from the original.

- Full legal chess: castling, en passant, promotion, check, checkmate, stalemate, the fifty-move
  rule, threefold repetition and insufficient material.
- An AI opponent with five difficulty levels and a small opening book.
- Four material styles taken from the original bundle: Wood, Marble, Metal, Grass.
- Drag a piece or tap-then-tap. Undo, hint, flip, PGN copy, captured-piece tray, material score.
- Settings are remembered between sessions.

---

## Play it right now (no build)

The whole game is a self-contained web app, so you can try it before building anything:

1. Copy `app/src/main/assets/` onto your phone (or unzip it there).
2. Open `index.html` in Chrome.
3. Chrome menu → **Add to Home screen**.

It runs full screen and works offline. This is the same code the APK ships.

---

## Build the APK

### Option A — GitHub Actions (nothing to install)

The fastest route if you don't already have Android tooling.

1. Create a new repository on GitHub.
2. Push this folder to it:

   ```bash
   cd Chess
   git init
   git add .
   git commit -m "Chess"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

3. Open the **Actions** tab. The `Build APK` workflow starts on its own.
4. When it finishes (about three minutes), open the run and download the **chess-apk**
   artifact from the Artifacts section at the bottom.
5. Unzip it, move `chess.apk` to your phone, and tap it. Android will ask you to allow
   installing from that app — that's the normal prompt for anything not from the Play Store.

You can also re-run it any time from **Actions → Build APK → Run workflow**.

### Option B — Android Studio

1. **File → Open**, choose this folder.
2. Let it sync. It will offer to install the Android SDK and Gradle pieces it needs.
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. The APK lands in `app/build/outputs/apk/debug/app-debug.apk`.

Or plug in your phone with USB debugging on and press Run.

### Option C — Command line

Needs a JDK 17 and the Android SDK, with `ANDROID_HOME` set.

```bash
gradle wrapper --gradle-version 8.9
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## What's inside

```
app/src/main/
  assets/
    index.html      layout, styling, controls
    engine.js       board state, legal move generation, evaluation, search
    pieces.js       vector piece artwork and the texture-mapped sprite renderer
    ui.js           rendering, touch input, animation, game flow
    tex/            board and piece materials, 4 styles x 4 images
  java/com/junaid/chess/MainActivity.java   full-screen WebView shell
  res/                                      icons, theme, strings
tests/              node test harnesses (see below)
.github/workflows/build-apk.yml             CI build
```

The Android side is deliberately thin: one `Activity`, no third-party libraries, no AndroidX.
It sets up a WebView, points it at `file:///android_asset/index.html`, hides the system bars,
and keeps the screen awake. Everything else is the web app.

- Minimum Android version: 7.0 (API 24)
- Package name: `com.junaid.chess`

---

## Tests

The engine is verified with [perft](https://www.chessprogramming.org/Perft) against the standard
reference positions — this is the usual way to prove a move generator is exactly correct.

```bash
cd tests
node perft.js      # 30 checks across 7 reference positions, all must pass
node selfplay.js   # engine vs engine, plus make/unmake integrity
node book.js       # opening book sanity check
```

`perft.js` currently passes 30/30, including Kiwipete to depth 4 (4,085,603 nodes) and the
start position to depth 5 (4,865,609 nodes).

---

## Notes on the conversion

This is a rebuild, not a port. The original app is a Cocoa binary using SceneKit and Metal, with
the `sjeng` engine as a separate executable — none of which runs on Android. What carried over
and what didn't:

**Carried over.** The board and piece materials (`Contents/Resources/Styles/`) are the originals,
resampled to 256×256 and contrast-adjusted. The macOS app applies per-style diffuse and ambient
values from `Board.plist` through its 3D lighting; a flat 2D board has no such lighting, so the
Metal and Grass textures needed their light/dark separation restored by hand or the squares would
have been nearly indistinguishable.

**Rebuilt.** The pieces are new vector artwork. The originals are 3D meshes (`Meshes/*.usdc`)
rendered in SceneKit, which have no 2D equivalent — so these are drawn as Staunton profiles and
filled with the same material textures, with shading to suggest the turned forms.

**Rewritten.** The chess engine is new. `sjeng` is a compiled Mach-O binary; its source isn't in
the bundle, so the engine here is an independent implementation — 0x88 board, alpha-beta search
with iterative deepening, quiescence, piece-square tables and killer-move ordering.

**On filling the screen.** A chessboard is square and a phone screen is not, so "fills the screen"
has a limit. The board is sized to the shorter edge of the display and drawn with no border at
all, which is the largest a square board can be. In portrait that means it spans the full width,
edge to edge. The space left over goes to the captured pieces, status and controls rather than to
decorative margin. In landscape the board fills the full height and the controls move into the
side gutters.

---

## Licensing

The textures come from the Chess app bundle. The `COPYING` file shipped with it grants rights to
use, modify and redistribute, but this build was made from your own installed copy — keep it
personal rather than publishing it.

The engine, piece artwork, UI and Android shell in this project are new work.
