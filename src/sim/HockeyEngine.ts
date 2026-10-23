import { clamp, clampDirectionToArcs, wrapAngle, type Vec2 } from './geometry';
import { Puck } from './Puck';
import { Skater } from './Skater';
import { RINK_HEIGHT, RINK_WIDTH } from './rink';

/** Fixed simulation step, so physics behave the same at any frame rate. */
const STEP_SECONDS = 1 / 120;
/** Ignore huge frame gaps (tab switches) instead of fast-forwarding through them. */
const MAX_FRAME_SECONDS = 0.1;
/** Cursor distance (px) at which a pass reaches full speed. */
const PASS_FULL_SPEED_DISTANCE = 700;
const NO_MOVE: MovementControls = { scheme: 'directional', direction: { x: 0, y: 0 } };

/** Ways of steering a skater; the player can switch between them to compare feel. */
export type MovementControls =
  /** Move along a screen direction (each axis -1..1) and face the way you move. */
  | { scheme: 'directional'; direction: Vec2 }
  /** `throttle` 1 skates forward along facing, -1 backward (still facing forward); `turn` -1/1 rotates counter-/clockwise. */
  | { scheme: 'tank'; throttle: number; turn: number }
  /**
   * Move along a screen direction while turning to face the aim point. Moving the way you face
   * is fastest; the further the move direction is from facing, the lower acceleration and top speed.
   */
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

/** Runs one match's simulation. Knows nothing about Phaser. */
export class HockeyEngine {
  /** Every skater on the ice; AI teammates and opponents will be added here. */
  public readonly skaters: Skater[] = [new Skater({ x: RINK_WIDTH / 2 - 140, y: RINK_HEIGHT / 2 })];
  public readonly puck = new Puck({ x: RINK_WIDTH / 2, y: RINK_HEIGHT / 2 });
  /** The skater the player's input drives; switching skaters will change this. */
  public controlledSkater = this.skaters[0];
  private accumulatedSeconds = 0;
  private wasPassHeld = false;

  update(controls: SkaterControls, deltaSeconds: number): void {
    this.accumulatedSeconds += Math.min(deltaSeconds, MAX_FRAME_SECONDS);

    while (this.accumulatedSeconds >= STEP_SECONDS) {
      this.step(controls, STEP_SECONDS);
      this.accumulatedSeconds -= STEP_SECONDS;
    }
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

  private step(controls: SkaterControls, deltaSeconds: number): void {
    this.handleStickControls(this.controlledSkater, controls, deltaSeconds);
    this.skaters.forEach((skater) => {
      const move = skater === this.controlledSkater ? controls.move : NO_MOVE;
      const { direction, moveScale } = this.steer(skater, move, controls.aim, deltaSeconds);
      skater.update(direction, deltaSeconds, moveScale);
    });
    this.updatePossession();
    this.puck.update(deltaSeconds);
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

      return { direction: move.direction, moveScale: this.getFacingMoveScale(skater, move.direction) };
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
      const angle = Math.atan2(skater.facing.y, skater.facing.x) + move.turn * skater.turnRate * deltaSeconds;
      skater.setFacing(Math.cos(angle), Math.sin(angle));
      moveScale *= skater.tuning.turningMoveScale;
    }

    if (move.throttle < 0) {
      moveScale *= skater.tuning.reverseMoveScale;
    }

    return { direction: { x: skater.facing.x * move.throttle, y: skater.facing.y * move.throttle }, moveScale };
  }

  /** Rotates the skater's facing toward `target`, no faster than their speed-dependent turn rate. */
  private turnToward(skater: Skater, target: Vec2, deltaSeconds: number): void {
    const dx = target.x - skater.position.x;
    const dy = target.y - skater.position.y;

    // Cursor on top of the skater: no meaningful direction, keep facing.
    if (Math.hypot(dx, dy) < skater.radius) {
      return;
    }

    const current = Math.atan2(skater.facing.y, skater.facing.x);
    const maxTurn = skater.turnRate * deltaSeconds;
    const angle = current + clamp(wrapAngle(Math.atan2(dy, dx) - current), -maxTurn, maxTurn);
    skater.setFacing(Math.cos(angle), Math.sin(angle));
  }

  /**
   * Speed multiplier for moving in `direction` given where the skater faces: `facingMoveScale`
   * straight ahead, `reverseMoveScale` straight back, easing between them (sideways is halfway).
   */
  private getFacingMoveScale(skater: Skater, direction: Vec2): number {
    const length = Math.hypot(direction.x, direction.y);

    if (length === 0) {
      return 1;
    }

    const alignment = (direction.x * skater.facing.x + direction.y * skater.facing.y) / length;
    const { facingMoveScale, reverseMoveScale } = skater.tuning;

    return reverseMoveScale + (facingMoveScale - reverseMoveScale) * ((alignment + 1) / 2);
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

  /** Any skater touching the puck takes it, whether it is loose or carried by someone else. */
  private updatePossession(): void {
    const taker = this.skaters.find(
      (skater) =>
        this.puck.canBeTakenBy(skater) && this.isTouchingPuck(skater) && this.puck.isReachableFrom(skater.position),
    );

    if (taker) {
      this.puck.giveTo(taker);
    }
  }

  private isTouchingPuck(skater: Skater): boolean {
    const distance = Math.hypot(this.puck.position.x - skater.position.x, this.puck.position.y - skater.position.y);

    return distance <= skater.radius + this.puck.radius;
  }
}
