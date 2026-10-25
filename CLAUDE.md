# Pokémon Hockey

2D top-down arcade hockey with Pokémon as players. TypeScript + Phaser 3 + Vite. Design goals and the current state of the game are in `GDD.md` (section 13, "Current Implementation", is the up-to-date snapshot of what's built and its numbers). Remaining work is in `tasks.txt`.

## Commands

- `npm run dev`: dev server on http://localhost:5174 (the browser preview's `poke-hockey` launch config).
- `npx tsc --noEmit`: type-check. Run it after every change; there's no test suite.
- `npm run build`: type-check and production build.

## Architecture

- `src/sim/`: the simulation, with **no Phaser imports**, so it runs headless (and later on a server for multiplayer). `HockeyEngine` runs a fixed 120 Hz step; `Skater`, `Puck`, `rink.ts` (geometry measured from the background art), `formation.ts` (positions and faceoff spots), `scoring.ts`, `shotCharge.ts`, `shotContact.ts`, `random.ts` (seeded RNG; keep the sim deterministic, never `Math.random`).
- `src/scenes/`: presentation. `HockeyScene` handles input, drawing and the HUD. `CameraController` places the rink camera. The HUD is on a second, fixed camera: anything that shouldn't zoom or scroll goes through `addToHud`.
- `src/data/pokemonSpecies.ts`: per-species data (sprite model + tuning overrides, e.g. Pokédex mass).
- Drawing uses positions blended between the last two sim steps (`getDrawPosition`); presentation code (camera, markers) should use those, not raw sim positions.
- Team and playing position belong to the lineup entry, not the species. `position` on a skater is its spot on the ice; the job is `playingPosition`.

## Conventions

- Match the surrounding style: doc comments on exported things and non-obvious logic, descriptive names, no abbreviations.
- Tunable numbers live in one place per system (`DEFAULT_SKATER_TUNING`, `CAMERA_TUNING`, constants at the top of each file) with a comment saying what they do and their units.
- Keyboard testing toggles are temporary and marked as such in code and in the on-screen help text: M (movement scheme), C (Space switching mode), R (reset puck), T (opponents chase puck), Z (camera mode), X (swap camera style), V (camera debug).
- Prefer making behaviour switchable (a mode or toggle) when the user wants to compare options.

## Workflow

- One feature branch per piece of work (the user names it; git names use hyphens). Commit on the branch, then fast-forward merge into `main` and delete the branch. Push only when asked.
- **Before every commit**, update `GDD.md` section 13 and `tasks.txt` so they match what's being committed. Commit the GDD change with the code. `tasks.txt` is git-ignored, so it's updated on disk only.
- Split unrelated changes into separate commits when asked; each commit should type-check on its own.
- End commit messages with the `Co-Authored-By` line from the session's attribution reminder.
- `enemy-ai` is an unmerged draft branch (role-based AI brains, `docs/AI.md`). It predates teammates, positions and the camera rework, so merging it will need conflict resolution.

## Assets

- `public/` (sprites, icons, rink art) is git-ignored and must be copied in by hand on a fresh clone. Git LFS is planned once the art is final.
- Sprites came from the DungeonClicker project; `docs/SPRITES.md` explains frame names and the 8 sprite directions. `public/assets/pokemon-icons.png/.json` is an icon atlas whose frame names match species model names (icons have opaque square backgrounds).
- Changing the rink image means re-measuring `rink.ts` (boards, nets, faceoff dots, crease, center dot, center circle). Measure from the image's pixels and draw the result back over the image to check it.

## Verifying changes

- Headless: write a small script in the session scratchpad that imports from `src/sim/` (or a pure presentation class like `CameraController`), bundle it with `npx esbuild <file> --bundle --platform=node --outfile=<out>.cjs`, and run it with node. Good for physics, rules and camera math.
- Browser: in dev, the game is on `window.game`; the scene is `window.game.scene.getScene('HockeyScene')`. The preview pane is often hidden, so animation frames don't run: step manually with `window.game.step(time, 16)`, and capture frames with `renderer.snapshotArea`. Synthetic keyboard events need `keyCode` patched in with `Object.defineProperty`. Console errors can be stale from hot reloads mid-edit; check their timestamps.

## Environment gotchas (Windows + OneDrive)

- In Bash heredocs, Python string escapes like `\n` can turn into real newlines. Use the Edit tool for lines containing `\n`.
- `npm install` is slow inside OneDrive; run it in the background.
- The C: drive has run completely full before. If a write fails with ENOSPC, stop and tell the user rather than deleting anything.
