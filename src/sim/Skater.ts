import { containInRoundedRect, pushOutOfRect, wrapAngle, type Arc, type CircleBody, type Vec2 } from './geometry';
import { BOARD_RESTITUTION, NET_RESTITUTION, RINK_ICE, RINK_NETS } from './rink';

export interface SkaterTuning {
  /**
   * px/s² while a direction is held: strong from a standstill so a key press moves the skater
   * immediately, fading to `accelerationAtMaxSpeed` so top speed still takes time to reach
   */
  accelerationFromStop: number;
  accelerationAtMaxSpeed: number;
  /**
   * px/s² of sideways grip when changing direction: velocity swings toward the new direction
   * keeping its speed (momentum carries over), turning tighter when slow and wider when fast
   */
  carveGrip: number;
  /** px/s² at which skaters dig in to stop velocity heading against the way they're pushing */
  brakingDeceleration: number;
  /** px/s² of slowdown while gliding with no input */
  glideFriction: number;
  /** px/s */
  maxSpeed: number;
  /** collision radius in px */
  radius: number;
  /** kg; heavier skaters push lighter ones around more in collisions */
  mass: number;
  /** rad/s a skater's facing rotates (toward the mouse, or when turning with tank controls), at any speed */
  turnRate: number;
  /** acceleration and top speed multiplier while skating backward (tank controls) */
  reverseMoveScale: number;
  /** acceleration and top speed multiplier while turning (tank controls) */
  turningMoveScale: number;
  /** rad/s the carried puck swings around to the new facing; a future puck-control stat */
  puckHandlingTurnRate: number;
  /** px/s of a tapped wrist shot / a fully charged slapshot; a future shooting stat */
  shotMinSpeed: number;
  shotMaxSpeed: number;
  /**
   * Optional limit on where shots can go, as arcs relative to facing (offset 0 = straight ahead,
   * PI = behind). Unset means shots go wherever aimed. Kept for special moves, e.g.
   * `[{ offset: 0, halfAngle: Math.PI / 3 }]` for a 120° forward cone, plus
   * `{ offset: Math.PI, halfAngle: ... }` for a behind-the-back shot.
   */
  shotArcs?: Arc[];
  /** seconds of holding shoot to reach full power */
  shotChargeSeconds: number;
  /** acceleration and top speed multiplier while winding up a shot */
  chargingMoveScale: number;
  /** px/s of the softest (short) and firmest (long) pass; a future passing stat */
  passMinSpeed: number;
  passMaxSpeed: number;
}

export const DEFAULT_SKATER_TUNING: SkaterTuning = {
  accelerationFromStop: 1100,
  accelerationAtMaxSpeed: 110,
  carveGrip: 900,
  brakingDeceleration: 650,
  glideFriction: 160,
  maxSpeed: 340,
  radius: 22,
  mass: 80,
  turnRate: 7,
  reverseMoveScale: 0.55,
  turningMoveScale: 0.75,
  puckHandlingTurnRate: 14,
  shotMinSpeed: 650,
  shotMaxSpeed: 1100,
  shotChargeSeconds: 0.8,
  chargingMoveScale: 0.55,
  passMinSpeed: 500,
  passMaxSpeed: 800,
};

/** Which side a skater plays for. */
export type Team = 'player' | 'opponent';

/**
 * A Pokémon's job on its team. Wings and defense are left/right from the team's point of view,
 * facing the net it attacks (see formation.ts for offense/defense/goalie groups). `bench` is for
 * Pokémon dressed for the game but not on the ice, and `reserve` for Pokémon on the roster but not
 * in the lineup (neither used yet). Called `playingPosition` on skaters because `position` is
 * their spot on the ice.
 */
export type PlayingPosition =
  | 'center'
  | 'leftWing'
  | 'rightWing'
  | 'leftDefense'
  | 'rightDefense'
  | 'goalie'
  | 'bench'
  | 'reserve';

/** Plain simulation state for one skater: no Phaser types, so it can run headless. */
export class Skater implements CircleBody {
  public readonly position: Vec2;
  public readonly previousPosition: Vec2;
  public readonly velocity: Vec2 = { x: 0, y: 0 };
  public readonly radius: number;
  /**
   * Unit vector the skater faces, at any angle; a carried puck sits on this side and shots are
   * limited around it. Set by the movement scheme, separate from velocity (skating backward,
   * later mouse aim).
   */
  public readonly facing: Vec2 = { x: 1, y: 0 };
  /** Seconds the shot has been wound up, or undefined when not charging. */
  public shotCharge?: number;
  /**
   * True for the one skater on the player's team the player is driving. The engine keeps exactly
   * one set; use `HockeyEngine.controlledSkater` to find it.
   */
  public controlledByPlayer = false;

  constructor(
    start: Vec2,
    public readonly team: Team,
    public readonly playingPosition: PlayingPosition,
    public readonly tuning: SkaterTuning = DEFAULT_SKATER_TUNING,
  ) {
    this.position = { ...start };
    this.previousPosition = { ...start };
    this.radius = tuning.radius;
  }

  setFacing(x: number, y: number): void {
    this.facing.x = x;
    this.facing.y = y;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.y);
  }

  /**
   * `input` is the direction to accelerate in, each axis -1..1; facing is not changed.
   * `moveScale` lowers acceleration and top speed (skating backward, turning); winding up a shot
   * lowers them further.
   */
  update(input: Vec2, deltaSeconds: number, moveScale = 1): void {
    const inputLength = Math.hypot(input.x, input.y);
    const speedBefore = this.speed;
    if (this.shotCharge !== undefined) {
      moveScale *= this.tuning.chargingMoveScale;
    }

    if (inputLength > 0) {
      const direction = { x: input.x / inputLength, y: input.y / inputLength };
      this.carveToward(direction, deltaSeconds);
      this.brakeAgainst(direction, deltaSeconds);

      const acceleration = this.getAcceleration() * moveScale;
      this.velocity.x += direction.x * acceleration * deltaSeconds;
      this.velocity.y += direction.y * acceleration * deltaSeconds;
    } else {
      this.applyFriction(this.tuning.glideFriction * deltaSeconds);
    }

    // A lowered top speed bleeds speed off gradually instead of stopping dead.
    const reducedMaxSpeed = this.tuning.maxSpeed * moveScale;
    const bleedingSpeed = speedBefore - this.tuning.glideFriction * deltaSeconds;
    this.limitSpeed(Math.max(reducedMaxSpeed, Math.min(this.tuning.maxSpeed, bleedingSpeed)));

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.collideWithRink();
  }

  collideWithRink(): void {
    containInRoundedRect(this, RINK_ICE, BOARD_RESTITUTION);
    RINK_NETS.forEach((net) => pushOutOfRect(this, net, NET_RESTITUTION));
  }

  /** Acceleration fades linearly from `accelerationFromStop` to `accelerationAtMaxSpeed` as speed builds. */
  private getAcceleration(): number {
    const { accelerationFromStop, accelerationAtMaxSpeed, maxSpeed } = this.tuning;
    const speedFraction = Math.min(this.speed / maxSpeed, 1);

    return accelerationFromStop + (accelerationAtMaxSpeed - accelerationFromStop) * speedFraction;
  }

  /**
   * Swings the velocity toward unit vector `direction` without changing speed, as fast as grip
   * allows (turn rate = grip / speed), so momentum carries into the new direction.
   */
  private carveToward(direction: Vec2, deltaSeconds: number): void {
    const speed = this.speed;

    if (speed === 0) {
      return;
    }

    const current = Math.atan2(this.velocity.y, this.velocity.x);
    const maxTurn = (this.tuning.carveGrip / speed) * deltaSeconds;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(Math.atan2(direction.y, direction.x) - current)));
    this.velocity.x = Math.cos(current + turn) * speed;
    this.velocity.y = Math.sin(current + turn) * speed;
  }

  /** Brakes only the part of the velocity heading against unit vector `direction`; sideways motion keeps its speed. */
  private brakeAgainst(direction: Vec2, deltaSeconds: number): void {
    const along = this.velocity.x * direction.x + this.velocity.y * direction.y;

    if (along >= 0) {
      return;
    }

    const reduction = Math.min(-along, this.tuning.brakingDeceleration * deltaSeconds);
    this.velocity.x += direction.x * reduction;
    this.velocity.y += direction.y * reduction;
  }

  private applyFriction(amount: number): void {
    const speed = this.speed;

    if (speed <= amount) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      return;
    }

    const scale = (speed - amount) / speed;
    this.velocity.x *= scale;
    this.velocity.y *= scale;
  }

  private limitSpeed(maxSpeed: number): void {
    const speed = this.speed;

    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.velocity.x *= scale;
      this.velocity.y *= scale;
    }
  }
}
