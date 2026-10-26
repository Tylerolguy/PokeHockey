import { clamp, clampDirectionToArcs, resolveCircleCollision, wrapAngle, type Vec2 } from './geometry';
import { chasePuckControls, idleControls } from './PlayerAI';
import { FACEOFF_TUNING, FaceoffDraw } from './faceoff';
import { Puck } from './Puck';
import {
  FACEOFF_LAYOUTS,
  getStartingSpot,
  OPENING_FACEOFF_TEAM,
  type FaceoffLayout,
  type StartingSpot,
} from './formation';
import { createRandom } from './random';
import { getScoringTeam } from './scoring';
import { getShotSpeed, isWhiff } from './shotCharge';
import { getShotContactChances, rollShotContact } from './shotContact';
import { Skater, type Team } from './Skater';
import { CENTER_DOT, FACEOFF_DOT_POSITIONS, getNearestFaceoffDot, type FaceoffDot } from './rink';
import {
  canTransition,
  CENTER_ICE_FACEOFF,
  DEFAULT_MATCH_RULES,
  MATCH_PHASE_RULES,
  type MatchPhase,
  type MatchRules,
  type StoppageReason,
} from './matchPhase';

export type { MatchPhase, StoppageReason } from './matchPhase';

/** Fixed simulation step, so physics behave the same at any frame rate. */
const STEP_SECONDS = 1 / 120;
/** Ignore huge frame gaps (tab switches) instead of fast-forwarding through them. */
const MAX_FRAME_SECONDS = 0.1;
/** Cursor distance (px) at which a pass reaches full speed. */
const PASS_FULL_SPEED_DISTANCE = 700;
/** How much of its speed (into the Pokémon) a shot keeps when it deflects off one. */
const SHOT_DEFLECT_RESTITUTION = 0.6;
/** How bouncy skater-on-skater hits are. */
const SKATER_RESTITUTION = 0.3;
/** After a goal, how close to their starting spot (px) and how slow (px/s) a skater must be to count as home. */
const HOME_RADIUS = 6;
const HOME_SPEED = 20;
/** After a goal, the shortest time before the line-up, so the goal (puck in the net, GOAL! banner) always registers (s). */
const GOAL_RETURN_MIN_SECONDS = 1.5;
/** After a stoppage, the shortest time before the line-up, so the whistle registers (s). */
const STOPPAGE_RETURN_MIN_SECONDS = 1;
/** After a goal or stoppage, skaters still not home after this long are placed on their spots (s). */
const RETURN_MAX_SECONDS = 5;
/** How hard skaters brake into their spots when returning to them: desired speed = distance x this. */
const RETURN_ARRIVE_GAIN = 2.5;
/** How long the period-end screen shows before the next period's faceoff, or game over (s). */
const PERIOD_END_SECONDS = 4;

/** Ways of steering a skater; the player can switch between them to compare feel. */
export type MovementControls =
  /** Move along a screen direction (each axis -1..1) and face the way you move. */
  | { scheme: 'directional'; direction: Vec2 }
  /** `throttle` 1 skates forward along facing, -1 backward (still facing forward); `turn` -1/1 rotates counter-/clockwise. */
  | { scheme: 'tank'; throttle: number; turn: number }
  /** Move along a screen direction at full speed in any direction while turning to face the aim point. */
  | { scheme: 'mouseFacing'; direction: Vec2 };

/** One frame of controls for a skater, from a player or (later) AI. */
export interface SkaterControls {
  move: MovementControls;
  /** World point being aimed at. */
  aim: Vec2;
  /** Shoot button held: charges while held, fires on release. */
  shoot: boolean;
  /** Pass button held: fires on press. */
  pass: boolean;
}

/** How Space picks the next skater to control: lineup order, or nearest the cursor. */
export type SwitchMode = 'nextInList' | 'closestToAim';

/** Runs one match's simulation. Knows nothing about Phaser. */
export class HockeyEngine {
  public readonly puck = new Puck(CENTER_DOT);
  /** Temporary testing switch: when on, opponents skate after the puck; when off, they stand still. */
  public opponentsChasePuck = false;
  /** Goals scored by each team. */
  public readonly score: Record<Team, number> = { player: 0, opponent: 0 };
  /** The team that just scored, from the goal until the next faceoff (and on through game over). */
  public goalScoredBy?: Team;
  /** The match's current state; see matchPhase.ts. Changed only through `setPhase`. */
  public phase: MatchPhase = 'faceoff';
  /** Why play is stopped, during the `stoppage` phase. */
  public stoppageReason?: StoppageReason;
  /** Who won, once the phase is `gameOver`; 'tie' if the score was level. */
  public winner?: Team | 'tie';
  public readonly rules: MatchRules = { ...DEFAULT_MATCH_RULES };
  /** The period being played, from 1 to `rules.periods`. */
  public period = 1;
  /** Game clock: seconds left in this period. Only runs while the puck is live. */
  public clockRemaining = this.rules.periodSeconds;
  /** Where the current or next faceoff happens: center ice, or the dot nearest a stoppage. */
  public faceoffDot: FaceoffDot = CENTER_ICE_FACEOFF;
  /** Counts up each time the puck respawns on the center dot, so the view can animate it in. */
  public puckRespawns = 0;
  private phaseSeconds = 0;
  private accumulatedSeconds = 0;
  private wasPassHeld = false;
  /** Shoot held last step, so the faceoff draw reacts to presses rather than holds. */
  private wasShootHeld = false;
  /** The current or last faceoff's draw: who won it and where the puck went (see faceoff.ts). */
  public faceoffDraw?: FaceoffDraw;
  /**
   * The team with the advantage at the next faceoff: the player's team at the start, then whoever
   * was just scored on. It no longer changes where anyone lines up; it's kept for deciding who
   * wins the draw.
   */
  public faceoffTeam: Team = OPENING_FACEOFF_TEAM;
  /** Testing option: how the non-centers line up at faceoffs (see `FaceoffLayout`). */
  public faceoffLayout: FaceoffLayout = FACEOFF_LAYOUTS[0];

  /** Seeded so a match with the same inputs plays out the same way (replays, multiplayer sync). */
  private readonly random: () => number;

  /**
   * `skaters` is everyone on the ice, placed for the opening faceoff; the first starts as the
   * player's. `seed` drives every random roll (e.g. what a shot does when it hits a Pokémon).
   */
  constructor(
    public readonly skaters: Skater[],
    seed = 1,
  ) {
    this.random = createRandom(seed);
    this.setControlledSkater(skaters[0]);
    // The match opens with a faceoff.
    this.lineUpForFaceoff();
  }

  /** How long (s) the match has been in its current phase. */
  get phaseElapsed(): number {
    return this.phaseSeconds;
  }

  /**
   * Testing jump: stops play and lines everyone straight up for a faceoff on `dot`, countdown and
   * all. From live play it goes through a stoppage first, so the phase rules still hold. Not once
   * the game is over. Returns whether it happened.
   */
  startFaceoffAt(dot: FaceoffDot): boolean {
    if (this.phase === 'gameOver') {
      return false;
    }

    if (this.phase === 'live') {
      this.callStoppage('whistle');
    }

    this.faceoffDot = dot;
    this.lineUpForFaceoff();

    return true;
  }

  /** Changes the faceoff layout; during a faceoff, everyone lines up again in the new one. */
  setFaceoffLayout(layout: FaceoffLayout): void {
    this.faceoffLayout = layout;

    if (this.phase === 'faceoff') {
      this.lineUpForFaceoff();
    }
  }

  /** Changes the period length and restarts this period's clock at it. */
  setPeriodLength(seconds: number): void {
    this.rules.periodSeconds = seconds;
    this.clockRemaining = seconds;
  }

  /**
   * Blows the whistle: play stops, the puck is dead, and everyone skates to their spots for a
   * faceoff at the dot nearest the puck. Only while the puck is live; returns whether play was stopped.
   */
  callStoppage(reason: StoppageReason): boolean {
    if (!canTransition(this.phase, 'stoppage')) {
      return false;
    }

    this.killPlay();
    this.faceoffDot = getNearestFaceoffDot(this.puck.position);
    this.setPhase('stoppage');
    this.stoppageReason = reason;

    return true;
  }

  /**
   * Ends the match on the current score. Called when the last period ends or the goal limit is
   * reached. Returns whether it ended (it can't from a faceoff or once over).
   */
  endGame(): boolean {
    if (!canTransition(this.phase, 'gameOver')) {
      return false;
    }

    const { player, opponent } = this.score;
    this.winner = player === opponent ? 'tie' : player > opponent ? 'player' : 'opponent';
    this.killPlay();
    this.setPhase('gameOver');

    return true;
  }

  /** The skater the player's input drives: whichever has `controlledByPlayer` set. */
  get controlledSkater(): Skater {
    return this.skaters.find((skater) => skater.controlledByPlayer) ?? this.skaters[0];
  }

  /** Hands the player's control to `skater` (on the player's team), taking it from everyone else. */
  setControlledSkater(skater: Skater): void {
    this.skaters.forEach((other) => {
      other.controlledByPlayer = other === skater;
    });
  }

  /**
   * Switches the player to another skater on their team, unless the one they control has the
   * puck or the phase doesn't give the player control. `aim` is the cursor, used by 'closestToAim'.
   * `pickPositions` optionally says where a skater counts as being for that (e.g. the on-screen
   * marker of a teammate who's off screen); others use their real position. Returns whether
   * control changed.
   */
  switchControlledSkater(mode: SwitchMode, aim: Vec2, pickPositions?: Map<Skater, Vec2>): boolean {
    const current = this.controlledSkater;

    if (!MATCH_PHASE_RULES[this.phase].playerControl || this.puck.carrier === current) {
      return false;
    }

    const team = this.skaters.filter((skater) => skater.team === current.team);
    const distanceToAim = (skater: Skater) => {
      const point = pickPositions?.get(skater) ?? skater.position;

      return Math.hypot(point.x - aim.x, point.y - aim.y);
    };
    const next =
      mode === 'nextInList'
        ? team[(team.indexOf(current) + 1) % team.length]
        : team.filter((skater) => skater !== current).sort((a, b) => distanceToAim(a) - distanceToAim(b))[0];

    if (!next || next === current) {
      return false;
    }

    current.shotCharge = undefined;
    this.setControlledSkater(next);

    return true;
  }

  update(controls: SkaterControls, deltaSeconds: number): void {
    this.accumulatedSeconds += Math.min(deltaSeconds, MAX_FRAME_SECONDS);

    while (this.accumulatedSeconds >= STEP_SECONDS) {
      this.step(controls, STEP_SECONDS);
      this.accumulatedSeconds -= STEP_SECONDS;
    }
  }

  /** Drops the puck, loose and still, on `spot` (the center dot by default). */
  resetPuck(spot: Vec2 = CENTER_DOT): void {
    if (this.puck.carrier) {
      this.puck.carrier.shotCharge = undefined;
    }

    this.puck.resetTo(spot);
  }

  /** Direction a shot would travel: the aim, limited to the skater's shooting arcs (if any) around their facing. */
  getShotDirection(skater: Skater, aim: Vec2): Vec2 {
    const direction = this.getAimDirection(skater, aim);
    const arcs = skater.tuning.shotArcs;

    return arcs ? clampDirectionToArcs(direction, skater.facing, arcs) : direction;
  }

  /**
   * Unit vector a pass would travel: from the puck's current spot toward `aim`, falling back to
   * the way the skater faces if the cursor is on the puck.
   */
  getAimDirection(skater: Skater, aim: Vec2): Vec2 {
    const dx = aim.x - this.puck.position.x;
    const dy = aim.y - this.puck.position.y;
    const length = Math.hypot(dx, dy);

    return length >= 1 ? { x: dx / length, y: dy / length } : { ...skater.facing };
  }

  /**
   * How far (0..1) real time has run past the latest simulation step. Draw bodies at
   * `lerpVec(previousPosition, position, interpolationAlpha)` for smooth motion at any refresh rate.
   */
  get interpolationAlpha(): number {
    return this.accumulatedSeconds / STEP_SECONDS;
  }

  private step(controls: SkaterControls, deltaSeconds: number): void {
    for (const body of [...this.skaters, this.puck]) {
      body.previousPosition.x = body.position.x;
      body.previousPosition.y = body.position.y;
    }

    this.phaseSeconds += deltaSeconds;
    this.phaseSteps[this.phase](controls, deltaSeconds);

    // After the phase's step, so a goal on the last step counts before time runs out.
    if (MATCH_PHASE_RULES[this.phase].clockRuns) {
      this.runClock(deltaSeconds);
    }
  }

  /** Counts the game clock down; at zero the period is over. */
  private runClock(deltaSeconds: number): void {
    this.clockRemaining = Math.max(0, this.clockRemaining - deltaSeconds);

    if (this.clockRemaining === 0) {
      this.killPlay();
      this.setPhase('periodEnd');
    }
  }

  /** What each phase does every simulation step. */
  private readonly phaseSteps: Record<MatchPhase, (controls: SkaterControls, deltaSeconds: number) => void> = {
    faceoff: (controls, deltaSeconds) => this.stepFaceoff(controls, deltaSeconds),
    live: (controls, deltaSeconds) => this.stepLive(controls, deltaSeconds),
    goalScored: (_, deltaSeconds) => this.stepReturnToSpots(deltaSeconds, GOAL_RETURN_MIN_SECONDS),
    stoppage: (_, deltaSeconds) => this.stepReturnToSpots(deltaSeconds, STOPPAGE_RETURN_MIN_SECONDS),
    periodEnd: (_, deltaSeconds) => this.stepPeriodEnd(deltaSeconds),
    gameOver: (_, deltaSeconds) => this.stepCoast(deltaSeconds),
  };

  /**
   * Moves to `phase`, restarting the phase timer. Throws on a move `MATCH_PHASE_TRANSITIONS`
   * doesn't allow; the opening faceoff (faceoff to faceoff) is the one exception.
   */
  private setPhase(phase: MatchPhase): void {
    const isOpeningFaceoff = this.phase === 'faceoff' && phase === 'faceoff';

    if (!canTransition(this.phase, phase) && !isOpeningFaceoff) {
      throw new Error(`Match can't go from ${this.phase} to ${phase}`);
    }

    this.stoppageReason = undefined;
    this.phase = phase;
    this.phaseSeconds = 0;
  }

  /**
   * Everyone frozen on their spot while the draw is played out with the shoot button (see
   * faceoff.ts); once it's decided, the puck shoots out past both centers and play is live.
   */
  private stepFaceoff(controls: SkaterControls, deltaSeconds: number): void {
    const draw = this.faceoffDraw;
    const pressed = controls.shoot && !this.wasShootHeld;
    this.wasShootHeld = controls.shoot;

    if (!draw) {
      return;
    }

    draw.step(deltaSeconds, pressed);

    if (draw.stage !== 'dropped' || !draw.direction) {
      return;
    }

    const { dropSpeed, centersUntouchableSeconds } = FACEOFF_TUNING;
    const centers = this.skaters.filter((skater) => skater.playingPosition === 'center');
    this.puck.dropFaceoff(
      { x: draw.direction.x * dropSpeed, y: draw.direction.y * dropSpeed },
      centers,
      centersUntouchableSeconds,
    );
    this.setPhase('live');
  }

  /**
   * Everyone coasts during the period-end screen. Then the next period starts with a faceoff at
   * center ice and a full clock, or after the last period the game is over.
   */
  private stepPeriodEnd(deltaSeconds: number): void {
    this.stepCoast(deltaSeconds);

    if (this.phaseSeconds < PERIOD_END_SECONDS) {
      return;
    }

    if (this.period >= this.rules.periods) {
      this.endGame();
      return;
    }

    this.period += 1;
    this.clockRemaining = this.rules.periodSeconds;
    this.faceoffDot = CENTER_ICE_FACEOFF;
    this.lineUpForFaceoff();
  }

  /** Nobody is steered (period over or match decided), so everyone coasts to a stop. */
  private stepCoast(deltaSeconds: number): void {
    this.skaters.forEach((skater) => skater.update({ x: 0, y: 0 }, deltaSeconds));
    this.resolveSkaterCollisions();
    this.puck.update(deltaSeconds);
  }

  /** Stops play: drops any wind-ups and knocks the puck off whoever has it, right where it is. */
  private killPlay(): void {
    this.skaters.forEach((skater) => {
      skater.shotCharge = undefined;
    });

    if (this.puck.carrier) {
      this.puck.release({ x: 0, y: 0 });
    }
  }

  private stepLive(controls: SkaterControls, deltaSeconds: number): void {
    this.handleStickControls(this.controlledSkater, controls, deltaSeconds);
    this.skaters.forEach((skater) => {
      const { move, aim } = this.getControls(skater, controls);
      const { direction, moveScale } = this.steer(skater, move, aim, deltaSeconds);
      skater.update(direction, deltaSeconds, moveScale);
    });
    this.resolveSkaterCollisions();
    this.updatePossession();
    this.puck.update(deltaSeconds);
    this.checkForGoal();
  }

  /**
   * After a goal or stoppage, everyone skates to their faceoff spot while the dead puck stays put.
   * Skaters pass through each other on the way so nobody gets held up; solid collisions return at
   * the faceoff. Lines up once everyone is home and at least `minSeconds` have passed, or after
   * `RETURN_MAX_SECONDS` regardless.
   */
  private stepReturnToSpots(deltaSeconds: number, minSeconds: number): void {
    this.skaters.forEach((skater) => {
      const spot = this.getFaceoffSpot(skater);
      const { move, aim } = this.returnToSpotControls(skater, spot.position, spot.facing);
      const { direction } = this.steer(skater, move, aim, deltaSeconds);
      skater.update(direction, deltaSeconds);
    });
    this.puck.update(deltaSeconds);

    const allHome = this.skaters.every((skater) => this.isHome(skater));

    if ((allHome && this.phaseSeconds >= minSeconds) || this.phaseSeconds >= RETURN_MAX_SECONDS) {
      this.lineUpForFaceoff();
    }
  }

  /**
   * Skate to `home` and stop there: steers by the gap between the velocity it wants and the one it
   * has, so it slows on arrival despite the ice. Faces where it's going, then its starting direction.
   */
  private returnToSpotControls(skater: Skater, home: Vec2, homeFacing: Vec2): SkaterControls {
    const dx = home.x - skater.position.x;
    const dy = home.y - skater.position.y;
    const distance = Math.hypot(dx, dy);
    const desiredSpeed = Math.min(skater.tuning.maxSpeed, distance * RETURN_ARRIVE_GAIN);
    const steer =
      distance > 0
        ? { x: (dx / distance) * desiredSpeed - skater.velocity.x, y: (dy / distance) * desiredSpeed - skater.velocity.y }
        : { x: -skater.velocity.x, y: -skater.velocity.y };
    const nearlyHome = distance < HOME_RADIUS * 4;
    const aim = nearlyHome
      ? { x: skater.position.x + homeFacing.x * 100, y: skater.position.y + homeFacing.y * 100 }
      : { ...home };
    const settled = Math.hypot(steer.x, steer.y) < HOME_SPEED / 2;

    return {
      move: { scheme: 'mouseFacing', direction: settled ? { x: 0, y: 0 } : steer },
      aim,
      shoot: false,
      pass: false,
    };
  }

  private getFaceoffSpot(skater: Skater): StartingSpot {
    return getStartingSpot(skater.team, skater.playingPosition, this.faceoffDot, this.faceoffLayout);
  }

  private isHome(skater: Skater): boolean {
    const home = this.getFaceoffSpot(skater).position;

    return Math.hypot(home.x - skater.position.x, home.y - skater.position.y) < HOME_RADIUS && skater.speed < HOME_SPEED;
  }

  /** Snaps everyone exactly onto their spots, respawns the puck on the faceoff dot, and starts the faceoff. */
  private lineUpForFaceoff(): void {
    this.skaters.forEach((skater) => {
      const spot = this.getFaceoffSpot(skater);
      skater.position.x = spot.position.x;
      skater.position.y = spot.position.y;
      skater.velocity.x = 0;
      skater.velocity.y = 0;
      skater.setFacing(spot.facing.x, spot.facing.y);
      skater.shotCharge = undefined;
    });
    // The player takes the faceoff with their center.
    const playerCenter = this.skaters.find((skater) => skater.team === 'player' && skater.playingPosition === 'center');
    this.setControlledSkater(playerCenter ?? this.skaters[0]);
    this.resetPuck(FACEOFF_DOT_POSITIONS[this.faceoffDot]);
    this.puckRespawns += 1;
    this.goalScoredBy = undefined;

    const opponentCenter = this.skaters.find((skater) => skater.team === 'opponent' && skater.playingPosition === 'center');
    // Opponents draw it back toward their own end: they defend the right.
    this.faceoffDraw = new FaceoffDraw(
      (opponentCenter ?? this.skaters[0]).tuning.faceoffSkill,
      { x: 1, y: 0 },
      this.random,
    );
    // A button already held doesn't count; the draw needs a fresh press.
    this.wasShootHeld = true;
    this.setPhase('faceoff');
  }

  /**
   * Counts a goal when the puck crosses into a net. Ends the match if that reaches the goal limit,
   * otherwise sends everyone back to their spots.
   */
  private checkForGoal(): void {
    const scorer = getScoringTeam(this.puck);

    if (!scorer) {
      return;
    }

    this.score[scorer] += 1;
    this.goalScoredBy = scorer;
    this.faceoffTeam = scorer === 'player' ? 'opponent' : 'player';
    this.faceoffDot = CENTER_ICE_FACEOFF;

    const { goalsToWin } = this.rules;

    if (goalsToWin !== undefined && this.score[scorer] >= goalsToWin) {
      this.endGame();
      return;
    }

    // Carried in: the puck stays in the net and the carrier skates off without it.
    this.killPlay();
    this.setPhase('goalScored');
  }

  /** The player's controls for the controlled skater; AI or idle controls for everyone else. */
  private getControls(skater: Skater, playerControls: SkaterControls): SkaterControls {
    if (skater === this.controlledSkater) {
      return playerControls;
    }

    return skater.team === 'opponent' && this.opponentsChasePuck
      ? chasePuckControls(skater, this.puck)
      : idleControls(skater);
  }

  /**
   * Applies a movement scheme's turning. Returns the direction to accelerate in and how much to
   * scale acceleration and top speed (backward and turning are slower).
   */
  private steer(
    skater: Skater,
    move: MovementControls,
    aim: Vec2,
    deltaSeconds: number,
  ): { direction: Vec2; moveScale: number } {
    if (move.scheme === 'mouseFacing') {
      this.turnToward(skater, aim, deltaSeconds);

      return { direction: move.direction, moveScale: 1 };
    }

    if (move.scheme === 'directional') {
      const length = Math.hypot(move.direction.x, move.direction.y);

      if (length > 0) {
        skater.setFacing(move.direction.x / length, move.direction.y / length);
      }

      return { direction: move.direction, moveScale: 1 };
    }

    let moveScale = 1;

    if (move.turn !== 0) {
      const angle = Math.atan2(skater.facing.y, skater.facing.x) + move.turn * skater.tuning.turnRate * deltaSeconds;
      skater.setFacing(Math.cos(angle), Math.sin(angle));
      moveScale *= skater.tuning.turningMoveScale;
    }

    if (move.throttle < 0) {
      moveScale *= skater.tuning.reverseMoveScale;
    }

    return { direction: { x: skater.facing.x * move.throttle, y: skater.facing.y * move.throttle }, moveScale };
  }

  /** Rotates the skater's facing toward `target`, no faster than their turn rate. */
  private turnToward(skater: Skater, target: Vec2, deltaSeconds: number): void {
    const dx = target.x - skater.position.x;
    const dy = target.y - skater.position.y;

    // Cursor on top of the skater: no meaningful direction, keep facing.
    if (Math.hypot(dx, dy) < skater.radius) {
      return;
    }

    const current = Math.atan2(skater.facing.y, skater.facing.x);
    const maxTurn = skater.tuning.turnRate * deltaSeconds;
    const angle = current + clamp(wrapAngle(Math.atan2(dy, dx) - current), -maxTurn, maxTurn);
    skater.setFacing(Math.cos(angle), Math.sin(angle));
  }

  private handleStickControls(skater: Skater, controls: SkaterControls, deltaSeconds: number): void {
    const passPressed = controls.pass && !this.wasPassHeld;
    this.wasPassHeld = controls.pass;

    if (this.puck.carrier !== skater) {
      skater.shotCharge = undefined;
      return;
    }

    const aimDirection = this.getAimDirection(skater, controls.aim);

    if (passPressed && skater.shotCharge === undefined) {
      this.pass(aimDirection, controls.aim, skater);
    } else if (controls.shoot) {
      skater.shotCharge = (skater.shotCharge ?? 0) + deltaSeconds;

      // Held too long: the shot is whiffed and goes off on its own.
      if (isWhiff(skater.tuning, skater.shotCharge)) {
        this.whiff(skater);
      }
    } else if (skater.shotCharge !== undefined) {
      this.shoot(skater, this.getShotDirection(skater, controls.aim));
    }
  }

  /** Releases a shot; its speed depends on how long it was charged (see shotCharge.ts). */
  private shoot(skater: Skater, direction: Vec2): void {
    const speed = getShotSpeed(skater.tuning, skater.shotCharge ?? 0);
    skater.shotCharge = undefined;
    this.puck.launch(direction, speed, 'shot');
  }

  /** A fumbled over-charged shot: the puck dribbles off slowly somewhere in front of the skater. */
  private whiff(skater: Skater): void {
    const facing = Math.atan2(skater.facing.y, skater.facing.x);
    const angle = facing + (this.random() - 0.5) * Math.PI;
    skater.shotCharge = undefined;
    this.puck.launch({ x: Math.cos(angle), y: Math.sin(angle) }, skater.tuning.whiffSpeed, 'whiff');
  }

  /** Short passes are soft, long ones firm, so they stay catchable. */
  private pass(direction: Vec2, target: Vec2, skater: Skater): void {
    const { passMinSpeed, passMaxSpeed } = skater.tuning;
    const distance = Math.hypot(target.x - this.puck.position.x, target.y - this.puck.position.y);
    const firmness = clamp(distance / PASS_FULL_SPEED_DISTANCE, 0, 1);
    this.puck.launch(direction, passMinSpeed + (passMaxSpeed - passMinSpeed) * firmness, 'pass');
  }

  private resolveSkaterCollisions(): void {
    for (let i = 0; i < this.skaters.length; i++) {
      for (let j = i + 1; j < this.skaters.length; j++) {
        const a = this.skaters[i];
        const b = this.skaters[j];

        if (resolveCircleCollision(a, b, a.tuning.mass, b.tuning.mass, SKATER_RESTITUTION)) {
          // Being shoved apart can push a skater into the boards or a net.
          a.collideWithRink();
          b.collideWithRink();
        }
      }
    }
  }

  /**
   * Any skater touching the puck takes it, whether it is loose or carried by someone else, except
   * that a live shot rolls what happens instead (see `resolveShotContacts`).
   */
  private updatePossession(): void {
    if (this.puck.isLiveShot) {
      this.resolveShotContacts();
      return;
    }

    const taker = this.skaters.find((skater) => this.canTouchPuck(skater));

    if (taker) {
      this.takePuck(taker);
    }
  }

  /**
   * A live shot hitting a Pokémon is stopped (they take it), deflects off them, or passes straight
   * through, rolled once per contact by `getShotContactChances`.
   */
  private resolveShotContacts(): void {
    for (const skater of this.skaters) {
      if (!this.canTouchPuck(skater)) {
        this.puck.endShotContact(skater);
        continue;
      }

      if (this.puck.hasShotContact(skater)) {
        continue;
      }

      this.puck.addShotContact(skater);

      switch (rollShotContact(getShotContactChances(skater, this.puck), this.random)) {
        case 'stop':
          this.takePuck(skater);
          return;
        case 'deflect':
          // The shot is dead now; anyone else it touches takes it as a loose puck.
          this.deflectPuckOff(skater);
          return;
        case 'passThrough':
          break;
      }
    }
  }

  private canTouchPuck(skater: Skater): boolean {
    return this.puck.canBeTakenBy(skater) && this.isTouchingPuck(skater) && this.puck.isReachableFrom(skater.position);
  }

  private takePuck(skater: Skater): void {
    this.puck.giveTo(skater);

    // For now the player always controls whichever of their skaters has the puck.
    if (skater.team === 'player') {
      this.setControlledSkater(skater);
    }
  }

  /** Bounces the puck off `skater`'s body, keeping some of its speed; it's no longer a live shot. */
  private deflectPuckOff(skater: Skater): void {
    const { puck } = this;
    const dx = puck.position.x - skater.position.x;
    const dy = puck.position.y - skater.position.y;
    const distance = Math.hypot(dx, dy);
    const normal = distance > 0 ? { x: dx / distance, y: dy / distance } : { x: -puck.velocity.x, y: -puck.velocity.y };
    const normalLength = Math.hypot(normal.x, normal.y) || 1;
    normal.x /= normalLength;
    normal.y /= normalLength;

    puck.position.x = skater.position.x + normal.x * (skater.radius + puck.radius);
    puck.position.y = skater.position.y + normal.y * (skater.radius + puck.radius);

    const closingSpeed =
      (puck.velocity.x - skater.velocity.x) * normal.x + (puck.velocity.y - skater.velocity.y) * normal.y;

    if (closingSpeed < 0) {
      puck.velocity.x -= (1 + SHOT_DEFLECT_RESTITUTION) * closingSpeed * normal.x;
      puck.velocity.y -= (1 + SHOT_DEFLECT_RESTITUTION) * closingSpeed * normal.y;
    }

    puck.limitSpeed();
    puck.collideWithRink();
    puck.deflectedOff(skater);
  }

  private isTouchingPuck(skater: Skater): boolean {
    const distance = Math.hypot(this.puck.position.x - skater.position.x, this.puck.position.y - skater.position.y);

    return distance <= skater.radius + this.puck.radius;
  }
}
