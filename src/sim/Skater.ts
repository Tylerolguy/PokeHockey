import { containInRoundedRect, pushOutOfRect, type CircleBody, type Vec2 } from './geometry';
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
}

export const DEFAULT_SKATER_TUNING: SkaterTuning = {
  acceleration: 1500,
  glideFriction: 420,
  maxSpeed: 360,
  radius: 22,
};

/** Plain simulation state for one skater: no Phaser types, so it can run headless. */
export class Skater implements CircleBody {
  public readonly position: Vec2;
  public readonly velocity: Vec2 = { x: 0, y: 0 };
  public readonly radius: number;

  constructor(
    start: Vec2,
    private readonly tuning: SkaterTuning = DEFAULT_SKATER_TUNING,
  ) {
    this.position = { ...start };
    this.radius = tuning.radius;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.y);
  }

  /** `input` is the held direction, each axis -1..1. */
  update(input: Vec2, deltaSeconds: number): void {
    const inputLength = Math.hypot(input.x, input.y);

    if (inputLength > 0) {
      this.velocity.x += (input.x / inputLength) * this.tuning.acceleration * deltaSeconds;
      this.velocity.y += (input.y / inputLength) * this.tuning.acceleration * deltaSeconds;
    } else {
      this.applyFriction(this.tuning.glideFriction * deltaSeconds);
    }

    this.limitSpeed();
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

  private limitSpeed(): void {
    const speed = this.speed;

    if (speed > this.tuning.maxSpeed) {
      const scale = this.tuning.maxSpeed / speed;
      this.velocity.x *= scale;
      this.velocity.y *= scale;
    }
  }
}
