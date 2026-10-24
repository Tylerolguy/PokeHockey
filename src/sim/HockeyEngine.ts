import { clamp, clampDirectionToArcs, resolveCircleCollision, wrapAngle, type Vec2 } from './geometry';
import { chasePuckControls, idleControls } from './PlayerAI';
import { Puck } from './Puck';
import { getScoringTeam } from './scoring';
import { Skater, type Team } from './Skater';
import { RINK_HEIGHT, RINK_WIDTH } from './rink';

/** Fixed simulation step, so physics behave the same at any frame rate. */
const STEP_SECONDS = 1 / 120;
/** Ignore huge frame gaps (tab switches) instead of fast-forwarding through them. */
const MAX_FRAME_SECONDS = 0.1;
/** Cursor distance (px) at which a pass reaches full speed. */
const PASS_FULL_SPEED_DISTANCE = 700;
/** How bouncy skater-on-skater hits are. */
const SKATER_RESTITUTION = 0.3;
/** How long the puck stays in the net after a goal before going back to center ice (s). */
const GOAL_RESET_SECONDS = 1;
/** The center faceoff dot. */
const CENTER_ICE: Vec2 = { x: RINK_WIDTH / 2, y: RINK_HEIGHT / 2 };

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
  public readonly puck = new Puck(CENTER_ICE);
  /** Temporary testing switch: when on, opponents skate after the puck; when off, they stand still. */
  public opponentsChasePuck = false;
  /** Goals scored by each team. */
  public readonly score: Record<Team, number> = { player: 0, opponent: 0 };
  /** The team that just scored, while the puck sits in the net before going back to center ice. */
  public goalScoredBy?: Team;
  private goalResetSeconds = 0;
  private accumulatedSeconds = 0;
  private wasPassHeld = false;

  /** `skaters` is everyone on the ice; the first starts as the player's. */
  constructor(public readonly skaters: Skater[]) {
    this.setControlledSkater(skaters[0]);
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
   * puck. `aim` is the cursor, used by 'closestToAim'. Returns whether control changed.
   */
  switchControlledSkater(mode: SwitchMode, aim: Vec2): boolean {
    const current = this.controlledSkater;

    if (this.puck.carrier === current) {
      return false;
    }

    const team = this.skaters.filter((skater) => skater.team === current.team);
    const next =
      mode === 'nextInList'
        ? team[(team.indexOf(current) + 1) % team.length]
        : team
            .filter((skater) => skater !== current)
            .sort(
              (a, b) =>
                Math.hypot(a.position.x - aim.x, a.position.y - aim.y) - Math.hypot(b.position.x - aim.x, b.position.y - aim.y),
            )[0];

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

  /** Drops the puck, loose and still, back on the center dot (ending any goal celebration). */
  resetPuck(): void {
    this.goalScoredBy = undefined;

    if (this.puck.carrier) {
      this.puck.carrier.shotCharge = undefined;
    }

    this.puck.resetTo(CENTER_ICE);
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

    this.handleStickControls(this.controlledSkater, controls, deltaSeconds);
    this.skaters.forEach((skater) => {
      const { move, aim } = this.getControls(skater, controls);
      const { direction, moveScale } = this.steer(skater, move, aim, deltaSeconds);
      skater.update(direction, deltaSeconds, moveScale);
    });
    this.resolveSkaterCollisions();

    // After a goal the puck is dead: nobody can touch it until it's back at center ice.
    if (!this.goalScoredBy) {
      this.updatePossession();
    }

    this.puck.update(deltaSeconds);
    this.updateScoring(deltaSeconds);
  }

  /** Counts a goal when the puck crosses into a net, then puts the puck back on the center dot. */
  private updateScoring(deltaSeconds: number): void {
    if (this.goalScoredBy) {
      this.goalResetSeconds -= deltaSeconds;

      if (this.goalResetSeconds <= 0) {
        this.goalScoredBy = undefined;
        this.resetPuck();
      }

      return;
    }

    const scorer = getScoringTeam(this.puck);

    if (!scorer) {
      return;
    }

    this.score[scorer] += 1;
    this.goalScoredBy = scorer;
    this.goalResetSeconds = GOAL_RESET_SECONDS;

    // Carried in: the puck stays in the net and the carrier skates on without it.
    if (this.puck.carrier) {
      this.puck.carrier.shotCharge = undefined;
      this.puck.release({ x: 0, y: 0 });
    }
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
    } else if (skater.shotCharge !== undefined) {
      this.shoot(skater, this.getShotDirection(skater, controls.aim));
    }
  }

  private shoot(skater: Skater, direction: Vec2): void {
    const { shotMinSpeed, shotMaxSpeed, shotChargeSeconds } = skater.tuning;
    const power = clamp((skater.shotCharge ?? 0) / shotChargeSeconds, 0, 1);
    skater.shotCharge = undefined;
    this.puck.shoot(direction, shotMinSpeed + (shotMaxSpeed - shotMinSpeed) * power);
  }

  /** Short passes are soft, long ones firm, so they stay catchable. */
  private pass(direction: Vec2, target: Vec2, skater: Skater): void {
    const { passMinSpeed, passMaxSpeed } = skater.tuning;
    const distance = Math.hypot(target.x - this.puck.position.x, target.y - this.puck.position.y);
    const firmness = clamp(distance / PASS_FULL_SPEED_DISTANCE, 0, 1);
    this.puck.shoot(direction, passMinSpeed + (passMaxSpeed - passMinSpeed) * firmness);
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

  /** Any skater touching the puck takes it, whether it is loose or carried by someone else. */
  private updatePossession(): void {
    const taker = this.skaters.find(
      (skater) =>
        this.puck.canBeTakenBy(skater) && this.isTouchingPuck(skater) && this.puck.isReachableFrom(skater.position),
    );

    if (taker) {
      this.puck.giveTo(taker);

      // For now the player always controls whichever of their skaters has the puck.
      if (taker.team === 'player') {
        this.setControlledSkater(taker);
      }
    }
  }

  private isTouchingPuck(skater: Skater): boolean {
    const distance = Math.hypot(this.puck.position.x - skater.position.x, this.puck.position.y - skater.position.y);

    return distance <= skater.radius + this.puck.radius;
  }
}
