import { resolveCircleHit, type Vec2 } from './geometry';
import { Puck } from './Puck';
import { Skater } from './Skater';
import { RINK_HEIGHT, RINK_WIDTH } from './rink';

/** How bouncy a skater-on-puck hit is; 0 = puck matches the skater's speed, 1 = fully elastic. */
const SKATER_PUCK_RESTITUTION = 0.4;
/** Fixed simulation step, so physics behave the same at any frame rate. */
const STEP_SECONDS = 1 / 120;
/** Ignore huge frame gaps (tab switches) instead of fast-forwarding through them. */
const MAX_FRAME_SECONDS = 0.1;

/** Runs one match's simulation. Knows nothing about Phaser. */
export class HockeyEngine {
  public readonly skater = new Skater({ x: RINK_WIDTH / 2 - 140, y: RINK_HEIGHT / 2 });
  public readonly puck = new Puck({ x: RINK_WIDTH / 2, y: RINK_HEIGHT / 2 });
  private accumulatedSeconds = 0;

  /** `input` is the controlled skater's held direction, each axis -1..1. */
  update(input: Vec2, deltaSeconds: number): void {
    this.accumulatedSeconds += Math.min(deltaSeconds, MAX_FRAME_SECONDS);

    while (this.accumulatedSeconds >= STEP_SECONDS) {
      this.step(input, STEP_SECONDS);
      this.accumulatedSeconds -= STEP_SECONDS;
    }
  }

  private step(input: Vec2, deltaSeconds: number): void {
    this.skater.update(input, deltaSeconds);
    this.puck.update(deltaSeconds);
    this.resolveSkaterPuckContact();
  }

  private resolveSkaterPuckContact(): void {
    const normal = resolveCircleHit(this.skater, this.puck, SKATER_PUCK_RESTITUTION);

    if (!normal) {
      return;
    }

    this.puck.limitSpeed();
    this.puck.collideWithRink();

    // If the boards or a net stopped the puck from moving clear, the puck is pinned:
    // hold the skater back instead of letting them skate through it.
    const dx = this.skater.position.x - this.puck.position.x;
    const dy = this.skater.position.y - this.puck.position.y;
    const overlap = this.skater.radius + this.puck.radius - Math.hypot(dx, dy);

    if (overlap > 0) {
      this.skater.position.x -= normal.x * overlap;
      this.skater.position.y -= normal.y * overlap;

      const intoPuck = this.skater.velocity.x * normal.x + this.skater.velocity.y * normal.y;

      if (intoPuck > 0) {
        this.skater.velocity.x -= intoPuck * normal.x;
        this.skater.velocity.y -= intoPuck * normal.y;
      }
    }
  }
}
