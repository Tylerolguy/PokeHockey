import { containInRoundedRect, pushOutOfRect, type Arc, type CircleBody, type Vec2 } from './geometry';
import { BOARD_RESTITUTION, NET_RESTITUTION, RINK_ICE, RINK_NETS } from './rink';

export interface SkaterTuning {
  /** px/s² while a direction is held */
  acceleration: number;
  /** px/s² of slowdown while gliding with no input */
  glideFriction: number;
  /** px/s */
  maxSpeed: number;
  /** collision radius in px */
  radius: number;
  /**
   * rad/s a skater rotates when steering by turning (tank controls): quick when standing still,
   * slowing linearly to `turnRateAtMaxSpeed` at full speed.
   */
  turnRateStanding: number;
  turnRateAtMaxSpeed: number;
  /**
   * acceleration and top speed multiplier while skating backward; with mouse facing, the
   * multiplier slides from `facingMoveScale` (moving where you face) to this (moving away)
   */
  reverseMoveScale: number;
  /** acceleration and top speed multiplier while moving the way the skater faces (mouse facing) */
  facingMoveScale: number;
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
  acceleration: 500,
  glideFriction: 420,
  maxSpeed: 360,
  radius: 22,
  turnRateStanding: 6,
  turnRateAtMaxSpeed: 2.6,
  reverseMoveScale: 0.55,
  facingMoveScale: 1,
  turningMoveScale: 0.75,
  puckHandlingTurnRate: 14,
  shotMinSpeed: 650,
  shotMaxSpeed: 1100,
  shotChargeSeconds: 0.8,
  chargingMoveScale: 0.55,
  passMinSpeed: 400,
  passMaxSpeed: 750,
};

/** Plain simulation state for one skater: no Phaser types, so it can run headless. */
export class Skater implements CircleBody {
  public readonly position: Vec2;
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

  constructor(
    start: Vec2,
    public readonly tuning: SkaterTuning = DEFAULT_SKATER_TUNING,
  ) {
    this.position = { ...start };
    this.radius = tuning.radius;
  }

  setFacing(x: number, y: number): void {
    this.facing.x = x;
    this.facing.y = y;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.y);
  }

  /** Current turning speed in rad/s: the faster the skater moves, the wider they turn. */
  get turnRate(): number {
    const { turnRateStanding, turnRateAtMaxSpeed, maxSpeed } = this.tuning;
    const speedFraction = Math.min(this.speed / maxSpeed, 1);

    return turnRateStanding + (turnRateAtMaxSpeed - turnRateStanding) * speedFraction;
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

    const acceleration = this.tuning.acceleration * moveScale;

    if (inputLength > 0) {
      this.velocity.x += (input.x / inputLength) * acceleration * deltaSeconds;
      this.velocity.y += (input.y / inputLength) * acceleration * deltaSeconds;
    } else {
      this.applyFriction(this.tuning.glideFriction * deltaSeconds);
    }

    // A lowered top speed bleeds speed off gradually instead of stopping dead.
    const reducedMaxSpeed = this.tuning.maxSpeed * moveScale;
    const bleedingSpeed = speedBefore - this.tuning.glideFriction * deltaSeconds;
    this.limitSpeed(Math.max(reducedMaxSpeed, Math.min(this.tuning.maxSpeed, bleedingSpeed)));

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;

    containInRoundedRect(this, RINK_ICE, BOARD_RESTITUTION);
    RINK_NETS.forEach((net) => pushOutOfRect(this, net, NET_RESTITUTION));
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
