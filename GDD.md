# Pokémon Hockey

**Game Design Document** • Concept v0.1 • October 2026

> Working reference — a living design document, not a finalized implementation specification.

---

## 1. Game Vision

A 2D, top-down, directly controlled arcade hockey game featuring Pokémon as players. Combine recognizable hockey skills—skating, passing, shooting, positioning and checking—with impactful Pokémon moves and team-building decisions.

**Core principle:** player execution and strategy should matter more than collection rarity or raw stats.

## 2. Confirmed Direction

- Player controls a Pokémon on the ice rather than only watching automated games.
- Hybrid style: traditional hockey fundamentals with special Pokémon moves that create opportunities, not guaranteed wins.
- Use TypeScript, Phaser 3 and Visual Studio Code.
- Include Pokémon-specific hockey stats, collecting/gacha mechanics, team building and eventual online multiplayer with a draft.

## 3. Hockey Match Mechanics — Proposed

- Prototype 3 skaters plus an AI goalie per side; investigate 5v5 later.
- One skater is directly controlled; AI operates teammates and opponents. Switching skaters is available.
- Movement includes acceleration, momentum, turning and stopping; physical size and weight affect collisions.
- Puck can be loose, passed, shot, intercepted, deflected or recovered. Possession is not permanently glued to the skater.
- Core actions: skate, aim, pass, shoot/charge, check or poke check, switch Pokémon and activate equipped moves.
- Potential controls: WASD movement, mouse aim, left-click shot, right-click pass, Space switch, E check, Q/R moves. All bindings provisional.

## 4. Pokémon Stats — Proposed

- **Skaters:** speed, acceleration, shooting, passing, puck control, checking, defense and stamina.
- **Physical properties:** size and weight; potential additional traits include agility and shot accuracy if needed.
- **Goalies:** reflexes, positioning, rebound control and recovery.
- Species determine a recognizable baseline; individual Pokémon may differ in growth potential or traits.
- Stats should be balanced to preserve meaningful player skill and viable different roles.

## 5. Moves, Abilities and Types — Proposed

- Equip a small number of moves per Pokémon (initial concept: two). Moves should be hockey-oriented interpretations of Pokémon moves.
- **Offense examples:** Thunderbolt empowers a shot; Quick Attack provides a dash.
- **Defense examples:** Protect blocks a check or shot; Iron Defense strengthens physical resistance.
- **Utility examples:** Agility boosts movement; Recover restores stamina.
- Cooldowns are the initial candidate for limiting moves; stamina costs and context-sensitive behavior remain open.
- Passive abilities provide playstyle differentiation. Types may shape move interactions, but avoid dominant rock-paper-scissors matchups.

## 6. Collection and Gacha — Proposed

- Earn in-game currency through play and use it to obtain randomized Pokémon.
- Individual pulls may have distinct traits, development potential or stat distributions, so duplicates can remain interesting.
- Decide later how rarity, evolution, training, move unlocks and duplicate handling work.
- Competitive fairness is a priority: avoid a system where spending or luck overwhelms skill.

## 7. Team Management and Progression — Proposed

- Create a roster, assign positions, choose active skaters, equip moves and set strategies.
- Develop Pokémon through matches, training, evolution and move acquisition (specific progression mechanics not finalized).
- Potential single-player structure: AI exhibition games, leagues, tournaments and championships.
- Potential match rewards: currency, progression materials and collection opportunities.

## 8. Multiplayer and Drafts — Future

- Long-term goal: online head-to-head matches using the same core hockey mechanics.
- Possible league features: snake drafts, shared draft pools, trades, standings, schedules and playoffs.
- Decide whether draft teams use personal collections or equal-access pools; equal-access pools may improve competitive fairness.
- Networking, authoritative match simulation, latency handling and anti-cheat are deferred until the local prototype works.

## 9. Technical Architecture

- **TypeScript:** hockey rules, entity state, movement and simulation. **Phaser 3:** rendering, input, animation and collisions. **Vite:** local development and builds.
- Keep gameplay simulation separate from Phaser presentation to enable testing, replays and eventual multiplayer.
- Suggested modules: `HockeyEngine`, `MatchManager`, `PokemonPlayer`, `Puck`, `PlayerAI`, `GoalieAI`, `MoveSystem`, `HockeyScene` and roster data.
- JSON or typed data modules can define Pokémon, moves, abilities and balancing values.
- Possible later backend: Java/Spring Boot and PostgreSQL for accounts, collections, leagues and persistence; WebSockets for real-time features. React is optional for menus.

## 10. Development Roadmap

1. **Prototype 1:** rink, one controlled skater, skating feel, puck movement and basic shooting.
2. **Prototype 2:** passing, goals, goalie behavior, opposing AI and switching teammates.
3. **Prototype 3:** 3v3 match loop, scoreboard, rules and tuning.
4. **Prototype 4:** species-specific stats, two sample moves, abilities and balance tests.
5. **Prototype 5:** roster management, collecting, progression and single-player competition.
6. **Later:** drafts, networking and competitive multiplayer.

## 11. Open Design Decisions

- Arcade realism: how strongly should momentum, checks and puck physics resemble actual hockey?
- Team size and match duration; substitutions and stamina model.
- Manual switching versus assisted switching; mouse versus controller support.
- How many moves can be equipped? Are all traditional moves eligible or only a curated subset?
- How do goalie controls work, if any? How are penalties, offsides and icing handled?
- How are Pokémon acquired, developed and evolved? Can duplicates have different potential?
- What is the first single-player mode, and what is the target audience for eventual multiplayer?

## 12. Success Criteria for First Playable

- A player can move a Pokémon around a rink, interact with a puck, shoot and score against a basic goalie.
- Movement and shooting feel enjoyable without Pokémon moves or collection systems.
- The architecture can add AI teammates, new Pokémon and moves without rewriting the simulation.

## 13. Current Implementation

Snapshot of what's built on `main` as of 2026-10-24. The numbers are current tuning, not final balance. Each item names where the value lives in the code.

### Structure

- **Stack:** TypeScript, Phaser 3 and Vite, as planned.
- **Simulation:** in `src/sim/`, with no Phaser. It runs on its own: `HockeyEngine`, `Skater`, `Puck`, the rink geometry, the formation and the scoring.
- **Presentation:** `HockeyScene` handles input, drawing and the HUD. `PauseScene` is the pause menu, launched over it.
- **Camera:** `CameraController` (presentation only) places the rink camera each frame from drawn positions, so only part of the 1728×910 rink is on screen. All its numbers are in `CAMERA_TUNING`.
  - **Auto mode (default):** follows the controlled Pokémon leaned 25% toward the puck, on a damped spring. Zoom fits the Pokémon and puck (1.7× close, down to 1.25×), zooms out up to 0.15 more for fast pucks, clamped to 1.15–1.7×, with a deadzone. It zooms out faster than in and nearly freezes while a shot is charging.
  - **Fixed mode:** 1.6× on the controlled Pokémon.
  - **Control swaps:** the camera glides over in about 0.45 s, keeping its speed, with the zoom held until it settles. An instant cut is available as an option.
  - **Stoppages (auto):** goal walk-backs and countdowns frame center ice at 1.25×.
  - **HUD:** on a separate fixed camera. When the puck is off screen, a marker at the screen edge points to it. Teammates who are off screen get a blue marker with their Pokémon icon.
- **Fixed step:** the simulation updates at 120 Hz. Drawing blends positions between the last two updates, so motion stays smooth at any refresh rate.
- **Deterministic:** random rolls use a seeded generator, so the same inputs replay the same match. This is groundwork for replays and multiplayer.
- **Species data:** `src/data/pokemonSpecies.ts`. Each species overrides the default tuning; only mass is set per species so far.

### Teams and Positions

- **6 per side:** center, left wing, right wing, left defense, right defense and goalie. Each team must have exactly one of each, or the game won't start.
- **Left and right** are from the team's own attacking point of view.
- **`bench` and `reserve`** positions exist but aren't used yet.
- **Lineup:**

| Position | Player team | Opponents |
| --- | --- | --- |
| Center | Garchomp (95 kg) | Flygon (82 kg) |
| Left wing | Druddigon (139 kg) | Phantump (7 kg) |
| Right wing | Gible (20.5 kg) | Tauros (88.4 kg) |
| Left defense | Gabite (56 kg) | Trapinch (15 kg) |
| Right defense | Golett (92 kg) | Vibrava (15.3 kg) |
| Goalie | Golurk (330 kg) | Trevenant (71 kg) |

- **Masses** are Pokédex weights and decide who gets pushed around in collisions.
- **Formation spots** (`formation.ts`; rink markings measured from the art and kept in `rink.ts`):
  - **Goalie:** the middle of their crease.
  - **Defense:** the faceoff dots in their own end zone.
  - **Wings:** the dots just outside their own blue line.
  - **Center:** depends on the faceoff advantage, below.
- **Faceoff advantage:** the team with the advantage puts its center 32 px from the puck. The other team's center waits outside the center circle, about 148 px back. The player's team has the advantage at the start of the game, then whoever was just scored on.

### Controls

The current default is the "mouse-facing" movement scheme.

| Input | Action |
| --- | --- |
| WASD | Skate in screen directions, at full speed in any direction |
| Mouse | Facing and aim; the skater turns toward the cursor at 7 rad/s |
| Left click | Shoot: hold to charge, release to fire |
| Right click | Pass toward the cursor (500–800 px/s, firmer for longer passes, full firmness at 700 px) |
| Space | Switch to the teammate closest to the mouse, only when not carrying the puck. An off-screen teammate counts as being at their edge marker, so point at the marker to pick them |
| Esc / P | Pause; Esc / P again or the menu's Resume button unpauses |

- **Pause menu (`PauseScene`):** pausing freezes the whole match where it is: no simulation steps, animations, tweens, or game input (including the testing keys). The frozen frame stays visible, dimmed, behind a menu showing the score and any shot being wound up (its power and hold time), with **Resume**, **Options** and **Restart** buttons. Options holds the testing settings listed above; Esc / P backs out of it to the main menu.
  - **Shot wind-up across a pause:** the charge is kept, and it carries on charging the moment play resumes, even with the shoot button up. Pressing shoot hands it back to the button, so releasing fires; left alone, it runs on to a whiff.
  - **Restart** starts a fresh match (score 0–0); testing-toggle choices like the movement scheme are kept.

- **Who you control:** the player always controls exactly one Pokémon (`controlledByPlayer`). Control moves automatically to whichever teammate gains the puck. You start each faceoff on your center.
- **Testing-only key** (to be removed): **R** resets the puck to center.
- **Testing options** (pause menu → Options; click one to step to its next choice; to be removed or turned into real settings):
  - **Movement controls:** mouse-facing, directional or tank.
  - **Space switches to:** the teammate closest to the mouse (default), or the next in the lineup.
  - **Opponents chase puck:** on or off.
  - **Camera:** auto or fixed.
  - **Camera on player swap:** smooth glide or instant cut.
  - **Camera debug overlay:** focus point and zoom numbers.

### Skating (`DEFAULT_SKATER_TUNING`)

- **Top speed:** 340 px/s.
- **Acceleration:** 1100 px/s² from a standstill, fading to 110 near top speed. About 0.8 s to reach top speed.
- **Ice feel:**
  - **Carving:** changing direction keeps speed, turning at up to 900 px/s² of grip (tighter when slow, wider when fast).
  - **Braking:** pushing against your motion brakes at 650 px/s².
  - **Coasting:** with no input you glide, slowing at 160 px/s². About 360 px from top speed.
- **While charging a shot:** acceleration and top speed drop to 55%.
- **Collisions:** skaters are 22 px circles. Skater-on-skater hits are weighted by mass with a bounce of 0.3. Bounce is 0.35 off the boards and 0.2 off the nets.
- **Visual markers:** each skater has a ring in its team colour (blue for you, red for opponents). The controlled skater's ring has a facing pointer.

### Puck and Possession

- **The puck:** a 7 px circle with ice friction of 60 px/s² and a top speed of 1400 px/s. It moves in sub-steps of at most 4 px, so fast shots can't tunnel through net walls.
- **Bounces:** it keeps 65% of its speed off the boards and 40% off the net frames.
- **Carrying:** touching a loose puck takes it, and a carried puck rides in front of the carrier on the facing side.
- **Stealing:** opponents steal by touching the puck. Teammates can't take it from each other.
- **Regrab cooldown:** a skater who just released or lost the puck can't take it back for 0.3 s.
- **Nets:** the puck can only enter a net through the front. A carried puck stops at the net mesh, and nobody can reach a puck through it.

### Shooting

- **Power curve:** shot power depends on how long shoot is held. 100% is 1350 px/s.

| Hold (s) | 0 | 0.55 | 0.8 | 0.88 | 1.1 | 1.18 | 1.4 | 1.45 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Power | 50% | 80% | 90% | **100%** | 90% | 60% | 20% | whiff |

- **Whiff:** the shot fires by itself at 1.45 s. The puck dribbles off at 120 px/s in a random direction within 90° of facing.
- **Shot meter:** shown above the carrier and coloured by the power each hold time would give, from red (weak) through yellow to green (100%).
- **Live shots:** a shot is "live" until it bounces off anything, is stopped, or slows below 300 px/s. Passes are never live.
- **When a live shot touches a Pokémon,** one outcome is rolled per contact (`shotContact.ts`, a placeholder for future stats and shot speed):

| | Stop (take it) | Deflect (keeps 60% of its speed) | Pass through |
| --- | --- | --- | --- |
| Goalie | 60% | 30% | 10% |
| Other Pokémon | 20% | 30% | 50% |

- **Shot arcs:** an optional limit on shot direction relative to facing. It exists in the code but is off by default, kept for special moves.

### Scoring and Restarts

- **Goals:** a goal counts once the whole puck is past the goal line inside a net. A scoreboard at the top shows YOU and OPP, and "GOAL!" appears in the scoring team's colour.
- **Walk-back:** after a goal, every Pokémon skates to its formation spot. Player input is ignored and skaters pass through each other. It lasts at least 1.5 s; anyone not home after 5 s is placed on their spot.
- **Restart:** the puck respawns on the center dot, everyone stays frozen through a 3 – 2 – 1 countdown, then "GO!" and play resumes.

### AI

- **On `main`:** only the "Opponents chase puck" testing option, which makes opponents skate at the puck. Teammates don't move on their own.
- **Draft brains:** role-based AI is on the unmerged `enemy-ai` branch, with designs in `docs/AI.md`:
  - **Offense:** Sniper, Playmaker, Selfish, Crasher.
  - **Defense:** Stay-at-home, Enforcer, Rover, Shadow.
  - **Goalie:** Positional, Challenger, Sweeper.

### Not Built Yet (vs. sections 3–10)

- **Gameplay:** body checks and poke checks, Pokémon moves and abilities, per-species stats beyond mass, and stamina.
- **Rules:** penalties, offsides, icing, periods and a game clock.
- **Meta:** collection, progression, menus (beyond the pause menu) and multiplayer.
- **AI:** teammate AI, and a goalie save mechanic beyond the shot-contact odds.

---

*Pokémon Hockey | Living design reference | v0.1*
