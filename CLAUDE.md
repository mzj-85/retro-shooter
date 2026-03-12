# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Open `index.html` directly in a browser — no server, build step, or dependencies required. Double-click the file or use:

```bash
open index.html          # macOS
# or drag index.html into a browser window
```

**Why no ES6 modules:** Chrome/Edge block `import`/`export` on `file://` URLs due to CORS. Everything stays in a single classic `<script src="game.js">` tag.

## Git & GitHub Workflow

**After every meaningful change, commit and push to GitHub.** This is non-negotiable — we never leave work uncommitted. The remote is the source of truth for reverting if something breaks.

```bash
git add index.html game.js          # stage specific files only (never git add -A)
git commit -m "short imperative summary of what and why"
git push
```

Remote: `https://github.com/mzj-85/retro-shooter`

### Commit message rules
- Start with an imperative verb: `Add`, `Fix`, `Improve`, `Remove`, `Refactor`
- First line ≤ 72 characters, describes *what* changed and *why* (not how)
- If multiple logical changes were made, use a short body paragraph after a blank line
- Always include the co-author trailer:
  ```
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```

### When to commit
- After implementing any new feature or mechanic
- After fixing a bug
- Before starting a risky refactor (checkpoint)
- After a refactor is complete and working
- Any time the game is in a clean, playable state worth preserving

## Architecture

All game logic lives in `game.js`, organized into 11 clearly marked sections. `index.html` is just a canvas mount point with CSS.

### The CONFIG object (Section 1)
The single source of truth for all tunable values. To add a new level, append to `CONFIG.LEVELS`. To add a new enemy type, add an entry to `CONFIG.ENEMIES` and create a subclass. No magic numbers elsewhere.

```js
CONFIG.LEVELS = [
  { spawnInterval: 60, speedMult: 1.0, waves: [{ basic: 5 }, ...] },
  ...
]
```

### Game loop & state machine (Section 11 — `Game` class)
`Game.loop()` → `Game.update()` → `Game.draw()` via `requestAnimationFrame`. State transitions:

```
MENU → PLAYING ↔ WAVE_COMPLETE → PLAYING → LEVEL_COMPLETE → PLAYING → WIN
                                                                     ↓
                                                                 GAME_OVER → MENU
```

`Game` owns the master arrays: `this.enemies`, `this.projectiles`, `this.effects`. Dead entities are filtered out at the end of each update via `.alive` flag — never splice mid-loop.

### Rendering (Section 4 — `Renderer` object)
All drawing is done with `ctx.fillRect` — no image files. Every draw function follows: `ctx.save()` → translate to entity center → rotate by `entity.angle` → draw pixel-grid rects relative to origin → `ctx.restore()`.

Draw order each frame: floor → projectiles → enemies (tank, basic, fast) → player → effects → HUD → state overlays → crosshair.

### Entity hierarchy
```
Entity (x, y, vx, vy, radius, animFrame, alive, angle)
  ├── Player      — WASD/arrow movement, mouse aim, shoot cooldown, invincibility frames
  ├── Enemy       — moves toward player each frame using angleTo()
  │     ├── BasicEnemy
  │     ├── FastEnemy   (motion trail rendered as ghost copies)
  │     └── TankEnemy
  ├── Projectile  — travels at fixed speed, dies on bounds exit or lifetime expiry
  └── Effect      — transient particle (type: 'explosion' | 'muzzle'), fades via life/maxLife alpha
```

### Collision detection
Circle-circle only (`circlesOverlap`). Checked in `Game.update()`: bullets vs enemies, then enemies vs player. O(n·m) — fine for < 30 enemies + 50 bullets.

### WaveManager (Section 10)
Builds a shuffled `spawnQueue` from the wave config, then emits one enemy per `spawnInterval` frames. Reports `isWaveComplete()` only when `allSpawned === true` AND `enemies.length === 0`.

### InputManager (Section 3)
Tracks keyboard state as a key→bool map (`isDown(key)`) and mouse position/button. `justClicked()` is a consume-once flag — call it once per frame per screen.
