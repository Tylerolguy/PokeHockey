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
- **Simulation:** in `src/sim/`, with no Phaser. It runs on its own: `HockeyEngine`, `Skater`, `Puck`, the match state machine (`matchPhase.ts`), the rink geometry, the formation and the scoring.
- **Presentation:** `HockeyScene` handles input, drawing and the HUD. `PauseScene` is the pause menu, launched over it.
- **Camera:** `CameraController` (presentation only) places the rink camera each frame from drawn positions, so only part of the 1728×910 rink is on screen. All its numbers are in `CAMERA_TUNING`.
  - **Auto mode (default):** follows the controlled Pokémon leaned 25% toward the puck, on a damped spring. Zoom fits the Pokémon and puck (1.7× close, down to 1.25×), zooms out up to 0.15 more for fast pucks, clamped to 1.15–1.7×, with a deadzone. It zooms out faster than in and nearly freezes while a shot is charging.
  - **Fixed mode:** 1.6× on the controlled Pokémon.
  - **Control swaps:** the camera glides over in about 0.45 s, keeping its speed, with the zoom held until it settles. An instant cut is available as an option.
  - **Dead puck (auto):** whenever the puck isn't in play, the camera frames the next faceoff's dot at 1.25× (after goals and stoppages, and at faceoffs), or center ice (at period end and game over).
  - **HUD:** on a separate fixed camera. When the puck is off screen, a marker at the screen edge points to it. Teammates who are off screen get a blue marker with their Pokémon icon.
- **Fixed step:** the simulation updates at 120 Hz. Drawing blends positions between the last two updates, so motion stays smooth at any refresh rate.
- **Deterministic:** random rolls use a seeded generator, so the same inputs replay the same match. This is groundwork for replays and multiplayer.
- **Species data:** `src/data/pokemonSpecies.ts`. Each species overrides the default tuning; only mass is set per species so far. `faceoffSkill` (0..1, default 0.5) exists for every Pokémon but isn't set per species yet.

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
- **Faceoff formation** (`formation.ts`; rink markings measured from the art and kept in `rink.ts`: circles are 118 px at center, 105 px in the end zones; blue lines at x 644–654 and 1070–1081). Everything depends on the faceoff dot and on whether it's center ice, a neutral-zone dot, the team's own end or the end it attacks:
  - **Centers:** both take the draw at the dot, 24 px either side of it.
  - **Goalies:** the middle of their crease.
  - **Wings and defense:** one of three testing layouts (`FaceoffLayout`, pause menu → Options → Faceoff layout; changing it during a faceoff lines everyone up again):

| Layout | Wings | Defense |
| --- | --- | --- |
| Hash marks (default) | On the circle edge, level with the dot | Mid-rink: wide behind the circle. Own end: the inside one level with the goalie, mid-zone (halfway between goal line and blue line); the boards-side one 30 px outside the circle, straight behind their center. Attacking end: both at the blue line, each in line behind a wing |
| Box | Just inside the circle, behind the centers | Tucked in behind them, the same everywhere |
| Diamond | End zones: the inside wing at the net front (screening in the attacking end, guarding the crease in their own), the other on the circle edge. Mid-rink: on the circle edge | Own end: one on the open circle edge, one behind the center. Attacking end: the points. Mid-rink: one behind the other |

  - Spots are kept inside the boards and off the nets; no two Pokémon overlap in any layout at any dot.
- **Faceoff advantage:** `faceoffTeam` (the player's team at the start, then whoever was just scored on) no longer changes where anyone stands or who wins the draw; it's unused for now.
- **Winning the draw** (`faceoff.ts`, numbers in `FACEOFF_TUNING`), with left click (the shoot button):
  1. "FACEOFF" shows for 0.8 s while everyone is frozen on their spot.
  2. **Timing bar** above the dot: a white marker crosses it end to end every 0.9 s. Click to stop it in the green zone to win. The green is 32% of the bar against an opposing center with `faceoffSkill` 0, down to 7% at skill 1 (every species is 0.5 for now, so 20%), and sits somewhere different each faceoff. Missing it, or not clicking within 4 s, loses the draw.
  3. **Aiming arrow** (only if you won): a yellow arrow spins around the dot once every 1.3 s. Click to stop it; that's where the puck goes. It stops by itself after 4 s.
  4. If the opponents win, they draw the puck back toward their own end, within 60° of straight back.
  5. The puck shoots out of the dot at 420 px/s straight through both centers, who can't touch it for 0.35 s, so a wing or defender picks it up. Play is live and "GO!" flashes.

### Controls

The current default is the "mouse-facing" movement scheme.

| Input | Action |
| --- | --- |
| WASD | Skate in screen directions, at full speed in any direction |
| Mouse | Facing and aim; the skater turns toward the cursor at 7 rad/s |
| Left click | Shoot: hold to charge, release to fire. At faceoffs: stop the timing bar, then the aiming arrow |
| Right click | Pass toward the cursor (500–800 px/s, firmer for longer passes, full firmness at 700 px) |
| Space | Switch to the teammate closest to the mouse, only when not carrying the puck. An off-screen teammate counts as being at their edge marker, so point at the marker to pick them |
| Esc / P | Pause; Esc / P again or the menu's Resume button unpauses |

- **Pause menu (`PauseScene`):** pausing freezes the whole match where it is: no simulation steps, animations, tweens, or game input (including the testing keys). The frozen frame stays visible, dimmed, behind a menu showing the score, period and clock, and any shot being wound up (its power and hold time), with **Resume**, **Options** and **Restart** buttons. Options holds the testing settings listed above; Esc / P backs out of it to the main menu.
  - **Shot wind-up across a pause:** the charge is kept, and it carries on charging the moment play resumes, even with the shoot button up. Pressing shoot hands it back to the button, so releasing fires; left alone, it runs on to a whiff.
  - **Restart** starts a fresh match (score 0–0); testing-toggle choices like the movement scheme are kept.

- **Who you control:** the player always controls exactly one Pokémon (`controlledByPlayer`). Control moves automatically to whichever teammate gains the puck. You start each faceoff on your center.
- **Testing-only keys** (to be removed): **R** resets the puck to center. **B** blows the whistle for a stoppage (only while the puck is live). **1–5** jump straight to a faceoff at center ice, upper-left, lower-left, upper-right or lower-right circle (any time but game over; from live play it goes through a stoppage).
- **Testing options** (pause menu → Options; click one to step to its next choice; to be removed or turned into real settings):
  - **Movement controls:** mouse-facing, directional or tank.
  - **Space switches to:** the teammate closest to the mouse (default), or the next in the lineup.
  - **Opponents chase puck:** on or off.
  - **Faceoff layout:** hash marks (default), box or diamond (see Teams and Positions).
  - **Period length:** 0:30, 1:00, 2:00, 3:00 (default) or 5:00. Changing it restarts the current period's clock.
  - **Goals to win:** off (default), 1, 3, 5 or 10.
  - Restart sets the match options (period length, goals to win) back to their defaults.
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

### Match States (`matchPhase.ts`)

The match is a state machine. Each phase has rules (`MATCH_PHASE_RULES`: whether the player has control, whether the puck is in play, whether the clock runs), a list of phases it may move to (`MATCH_PHASE_TRANSITIONS`; the engine refuses any other move), and a step in `HockeyEngine`. More phases (pre-game, overtime, shootouts, penalties) slot in the same way.

| Phase | What happens | Goes to |
| --- | --- | --- |
| `faceoff` | Everyone frozen on their spot around the faceoff dot, with the puck on it, while the draw is played (timing bar, then aiming arrow if you won; see Teams and Positions). Then the puck shoots out and "GO!" shows. The match opens with one | `live` |
| `live` | Normal hockey; the only phase with player control, a live puck and a running clock | `goalScored`, `stoppage`, `periodEnd`, `gameOver` |
| `goalScored` | "GOAL!" in the scorer's colour. The puck stays in the net and everyone skates to their spot for a center-ice faceoff (at least 1.5 s) | `faceoff`, `gameOver` |
| `stoppage` | The whistle went (`StoppageReason`; only the testing whistle so far). "WHISTLE" shows, the puck is knocked loose and dead, and everyone skates to their spot for a faceoff at the dot nearest the puck (at least 1 s) | `faceoff`, `gameOver` |
| `periodEnd` | The clock hit 0:00. Everyone coasts while an "END OF 1ST PERIOD" screen shows the score and what's next, for 4 s. After the 1st or 2nd, the next period starts with a full clock and a center-ice faceoff; after the 3rd, the game is over | `faceoff`, `gameOver` |
| `gameOver` | The match is decided. "YOU WIN!", "OPP WINS" or "TIE GAME" with the final score over center ice; everyone coasts to a stop. Start again from the pause menu's Restart | (none) |

- **Goals:** a goal counts once the whole puck is past the goal line inside a net. A scoreboard at the top shows YOU and OPP.
- **Game clock (`MatchRules`):** 3 periods of 3:00 (arcade length). It only runs while the puck is live, so it stops for goals, stoppages and faceoffs. The period and clock show in a box under the scores (e.g. "1ST 2:34"), and in the pause menu.
- **Winning:** after the 3rd period, the team ahead wins; a level score is a tie (overtime/shootout not built). `MatchRules.goalsToWin` can also end it early as soon as a team reaches it (the deciding goal goes straight to `gameOver`); it's off by default.
- **Returning to spots:** after a goal or stoppage, skaters ignore input and pass through each other. Anyone not home after 5 s is placed on their spot.
- **Faceoff location (`FaceoffDot`, `FACEOFF_DOT_POSITIONS` in `rink.ts`):** each faceoff happens at one of the 9 dots. Period starts and goals use center ice; a stoppage uses the dot nearest where the puck was when the whistle went.

### AI

- **On `main`:** only the "Opponents chase puck" testing option, which makes opponents skate at the puck. Teammates don't move on their own.
- **Draft brains:** role-based AI is on the unmerged `enemy-ai` branch, with designs in `docs/AI.md`:
  - **Offense:** Sniper, Playmaker, Selfish, Crasher.
  - **Defense:** Stay-at-home, Enforcer, Rover, Shadow.
  - **Goalie:** Positional, Challenger, Sweeper.

### Not Built Yet (vs. sections 3–10)

- **Gameplay:** body checks and poke checks, Pokémon moves and abilities, per-species stats beyond mass, and stamina.
- **Rules:** penalties, offsides, icing, overtime and shootouts. Real causes of stoppages (puck out of play, goalie covering it). A pre-game phase and intermission extras beyond the period-end screen.
- **Meta:** collection, progression, menus (beyond the pause menu) and multiplayer.
- **AI:** teammate AI, and a goalie save mechanic beyond the shot-contact odds.

---

*Pokémon Hockey | Living design reference | v0.1*
