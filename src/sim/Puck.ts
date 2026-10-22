import { containInRoundedRect, pushOutOfRect, type CircleBody, type Vec2 } from './geometry';
import { RINK_ICE, RINK_NET_WALLS } from './rink';

export const PUCK_RADIUS = 7;
/** px/s² of ice friction; low so the puck keeps its momentum. */
const PUCK_FRICTION = 60;
const PUCK_MAX_SPEED = 1100;
/** Pucks are lively off the boards. */
const PUCK_BOARD_RESTITUTION = 0.75;
/** Net mesh soaks up the puck so goals stay in. */
const PUCK_NET_RESTITUTION = 0.05;

export class Puck implements CircleBody {
  public readonly position: Vec2;
  public readonly velocity: Vec2 = { x: 0, y: 0 };
  public readonly radius = PUCK_RADIUS;

  constructor(start: Vec2) {
    this.position = { ...start };
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.y);
  }

  update(deltaSeconds: number): void {
    this.applyFriction(PUCK_FRICTION * deltaSeconds);
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.collideWithRink();
  }

  collideWithRink(): void {
    containInRoundedRect(this, RINK_ICE, PUCK_BOARD_RESTITUTION);
    RINK_NET_WALLS.forEach((wall) => pushOutOfRect(this, wall, PUCK_NET_RESTITUTION));
  }

  limitSpeed(): void {
    const speed = this.speed;

    if (speed > PUCK_MAX_SPEED) {
      this.velocity.x *= PUCK_MAX_SPEED / speed;
      this.velocity.y *= PUCK_MAX_SPEED / speed;
    }
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
}
