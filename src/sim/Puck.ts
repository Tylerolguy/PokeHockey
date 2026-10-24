import { containInRoundedRect, pushOutOfRect, sweepCircleIntoRect, wrapAngle, type CircleBody, type Vec2 } from './geometry';
import { RINK_ICE, RINK_NET_WALLS } from './rink';
import type { Skater } from './Skater';

export const PUCK_RADIUS = 7;
/** px/s² of ice friction; low so the puck keeps its momentum. */
const PUCK_FRICTION = 60;
const PUCK_MAX_SPEED = 1100;
/** Pucks are lively off the boards. */
const PUCK_BOARD_RESTITUTION = 0.65;
/**
 * Pucks bounce off the net frame too, just less than off the boards. Goals still count: a goal is
 * scored as soon as the puck crosses the goal line, before it reaches the back of the net.
 */
const PUCK_NET_RESTITUTION = 0.4;
/** Gap between a carrier's collision circle and the carried puck. */
const CARRY_GAP = 3;
/** After letting go, the same skater can't instantly re-grab the puck (so shots leave the stick). */
const REGRAB_COOLDOWN_SECONDS = 0.3;
/** A shot stops being live (and plays like any loose puck) once it slows below this (px/s). */
const LIVE_SHOT_MIN_SPEED = 300;

/** How a puck left the stick: shots can pass through or deflect off Pokémon, passes can't. */
export type LaunchKind = 'shot' | 'pass';

export class Puck implements CircleBody {
  public readonly position: Vec2;
  public readonly previousPosition: Vec2;
  public readonly velocity: Vec2 = { x: 0, y: 0 };
  public readonly radius = PUCK_RADIUS;
  /** The skater in possession, or undefined while the puck is loose. */
  private carrierSkater?: Skater;
  /** Angle of the puck around its carrier; swings toward the carrier's facing. */
  private carryAngle = 0;
  private lastCarrier?: Skater;
  private regrabCooldown = 0;
  /** True from a shot until it bounces off anything, someone takes the puck, or it slows down. */
  private liveShot = false;
  /** Skaters a live shot is touching that already had their outcome rolled for this contact. */
  private readonly shotContacts = new Set<Skater>();

  constructor(start: Vec2) {
    this.position = { ...start };
    this.previousPosition = { ...start };
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.y);
  }

  get carrier(): Skater | undefined {
    return this.carrierSkater;
  }

  /** A shot still flying fast enough to pass through or deflect off Pokémon. */
  get isLiveShot(): boolean {
    return this.liveShot;
  }

  /** Whether `skater`'s current contact with this live shot has already been decided. */
  hasShotContact(skater: Skater): boolean {
    return this.shotContacts.has(skater);
  }

  /** Records that `skater`'s current contact has been decided, so it's rolled only once. */
  addShotContact(skater: Skater): void {
    this.shotContacts.add(skater);
  }

  /** `skater` is no longer touching the puck; a later touch is a new contact. */
  endShotContact(skater: Skater): void {
    this.shotContacts.delete(skater);
  }

  /**
   * The puck just bounced off `skater`: it's no longer a live shot, and `skater` can't grab it
   * during the regrab cooldown, so the bounce isn't turned straight into a pickup.
   */
  deflectedOff(skater: Skater): void {
    this.endLiveShot();
    this.lastCarrier = skater;
    this.regrabCooldown = REGRAB_COOLDOWN_SECONDS;
  }

  /**
   * Whether `skater` may take the puck on touch: anyone can grab a loose puck, only opponents can
   * steal a carried one, and whoever just let go waits out the regrab cooldown.
   */
  canBeTakenBy(skater: Skater): boolean {
    const carrier = this.carrierSkater;

    if (carrier && carrier.team === skater.team) {
      return false;
    }

    return !(skater === this.lastCarrier && this.regrabCooldown > 0);
  }

  /** True if no net wall lies between `from` and the puck, e.g. so a skater can't grab it through the mesh. */
  isReachableFrom(from: Vec2): boolean {
    return RINK_NET_WALLS.every((wall) => sweepCircleIntoRect(from, this.position, this.radius, wall) === undefined);
  }

  /** Gives possession to `skater`, taking it from any current carrier. */
  giveTo(skater: Skater): void {
    if (this.carrierSkater) {
      // Stolen: the old carrier can't snatch it straight back, or two skaters would trade it every frame.
      this.lastCarrier = this.carrierSkater;
      this.regrabCooldown = REGRAB_COOLDOWN_SECONDS;
    }

    this.carrierSkater = skater;
    this.endLiveShot();
    // Start from where the puck touched, so it visibly swings around to the front.
    this.carryAngle = Math.atan2(this.position.y - skater.position.y, this.position.x - skater.position.x);
  }

  /** Puts the puck, loose and still, at `position`; anyone may pick it up straight away. */
  resetTo(position: Vec2): void {
    this.endLiveShot();
    this.carrierSkater = undefined;
    this.lastCarrier = undefined;
    this.regrabCooldown = 0;
    this.position.x = position.x;
    this.position.y = position.y;
    // Teleport: don't draw the puck sliding across the ice from where it was.
    this.previousPosition.x = position.x;
    this.previousPosition.y = position.y;
    this.velocity.x = 0;
    this.velocity.y = 0;
  }

  /** Makes the puck loose with the given velocity; the hook for shots, passes and poke checks. */
  release(velocity: Vec2): void {
    this.lastCarrier = this.carrierSkater;
    this.regrabCooldown = REGRAB_COOLDOWN_SECONDS;
    this.carrierSkater = undefined;
    this.velocity.x = velocity.x;
    this.velocity.y = velocity.y;
    this.limitSpeed();
  }

  /**
   * Releases the puck from where it sits on the stick toward `direction` (a unit vector) at
   * `speed`, as a shot or a pass.
   */
  launch(direction: Vec2, speed: number, kind: LaunchKind): void {
    if (this.carrierSkater) {
      this.release({ x: direction.x * speed, y: direction.y * speed });
      this.liveShot = kind === 'shot';
    }
  }

  update(deltaSeconds: number): void {
    this.regrabCooldown = Math.max(0, this.regrabCooldown - deltaSeconds);

    if (this.carrierSkater) {
      this.followCarrier(this.carrierSkater, deltaSeconds);
      return;
    }

    this.applyFriction(PUCK_FRICTION * deltaSeconds);
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    const bounced = this.collideWithRink();

    if (this.liveShot && (bounced || this.speed < LIVE_SHOT_MIN_SPEED)) {
      this.endLiveShot();
    }
  }

  private endLiveShot(): void {
    this.liveShot = false;
    this.shotContacts.clear();
  }

  /** Keeps the puck inside the boards and out of the net frames. Returns true if it hit any of them. */
  collideWithRink(): boolean {
    const hitBoards = containInRoundedRect(this, RINK_ICE, PUCK_BOARD_RESTITUTION);
    const hitNet = RINK_NET_WALLS.map((wall) => pushOutOfRect(this, wall, PUCK_NET_RESTITUTION)).some(Boolean);

    return hitBoards || hitNet;
  }

  limitSpeed(): void {
    const speed = this.speed;

    if (speed > PUCK_MAX_SPEED) {
      this.velocity.x *= PUCK_MAX_SPEED / speed;
      this.velocity.y *= PUCK_MAX_SPEED / speed;
    }
  }

  private followCarrier(carrier: Skater, deltaSeconds: number): void {
    const targetAngle = Math.atan2(carrier.facing.y, carrier.facing.x);
    const turn = wrapAngle(targetAngle - this.carryAngle);
    const maxTurn = carrier.tuning.puckHandlingTurnRate * deltaSeconds;
    this.carryAngle = wrapAngle(this.carryAngle + Math.max(-maxTurn, Math.min(maxTurn, turn)));
    this.placeOnStick(carrier);
    this.velocity.x = carrier.velocity.x;
    this.velocity.y = carrier.velocity.y;
  }

  /** Puts the puck at `carryAngle` beside the carrier, stopping at any net wall in between. */
  private placeOnStick(carrier: Skater): void {
    const distance = carrier.radius + this.radius + CARRY_GAP;
    const target = {
      x: carrier.position.x + Math.cos(this.carryAngle) * distance,
      y: carrier.position.y + Math.sin(this.carryAngle) * distance,
    };
    // Stop the puck at any net wall between the carrier and the stick, so it can't be carried
    // through the back or sides of the net. The front is open, so it can still be carried in.
    const reach = RINK_NET_WALLS.reduce(
      (nearest, wall) => Math.min(nearest, sweepCircleIntoRect(carrier.position, target, this.radius, wall) ?? 1),
      1,
    );
    this.position.x = carrier.position.x + (target.x - carrier.position.x) * reach;
    this.position.y = carrier.position.y + (target.y - carrier.position.y) * reach;
    this.collideWithRink();
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
