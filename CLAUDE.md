# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page Tetris implementation in vanilla JavaScript with HTML5 Canvas. No dependencies, no build tool, no package manager — just `index.html`, `style.css`, and `game.js`.

## Running the game

There is no build/test/lint tooling. To run it, serve the directory and open it in a browser:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Opening `index.html` directly (`open index.html`) also works since there are no ES modules or fetch calls requiring a server.

To verify a change, open the page in a browser and play — check piece movement, rotation/wall-kicks, line clears, scoring, level speed-up, ghost piece, pause, and game-over/restart.

## Architecture

Everything lives in `game.js` as top-level functions operating on module-level `let` state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`). There are no classes/modules — state is mutated directly by the functions below.

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: defined in `PIECES` as square matrices (index 0 unused, 1–7 are I/O/T/S/Z/J/L). Rotation (`rotateCW`) is a transpose + row-reverse; there's no separate rotation-state table, so each rotation is computed fresh from the current shape.
- **Collision** (`collide`): checks board bounds and overlap with locked cells for a shape at a given offset. Nearly every action (move, rotate, drop, spawn) is a `collide` check followed by a mutation.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until one doesn't collide, else the rotation is discarded.
- **Lock → clear → spawn pipeline** (`lockPiece`): `merge()` writes the current piece into `board`, `clearLines()` removes full rows (splicing them out and unshifting empty rows at the top, adjusting score/level/`dropInterval`), then `spawn()` promotes `next` to `current` and generates a new `next`. `spawn()` also detects a game-over collision at the top of the board.
- **Game loop** (`loop`, driven by `requestAnimationFrame`): accumulates elapsed time in `dropAccum` and advances the piece down one row (or locks it) once `dropAccum >= dropInterval`, then redraws every frame regardless. `dropInterval` shrinks as level increases (`max(100, 1000 - (level-1)*90)` ms).
- **Rendering** (`draw`/`drawNext`/`drawBlock`/`drawGrid`): plain Canvas 2D calls, redrawn from scratch every frame (grid, locked board cells, ghost piece at `globalAlpha 0.2` from `ghostY()`, then the current piece). No dirty-rect optimization.
- **Input**: a single `keydown` listener switches on `e.code` (arrows, `KeyX` for rotate, `Space` for hard drop, `KeyP` for pause), gated by `paused`/`gameOver` flags.
- **HUD**: `updateHUD()` pushes `score`/`lines`/`level` into DOM text content; the overlay div is toggled for both PAUSE and GAME OVER states (title text differs).

When adjusting board dimensions, `COLS`/`ROWS`/`BLOCK` in `game.js` must stay in sync with the `<canvas id="board">` `width`/`height` attributes in `index.html` (`COLS×BLOCK` by `ROWS×BLOCK`).
