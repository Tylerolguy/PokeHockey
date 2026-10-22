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

---

*Pokémon Hockey | Living design reference | v0.1*
