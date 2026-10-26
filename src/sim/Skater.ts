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
  /** px/s of a perfectly timed shot (100% power); a future shooting stat */
  shotPeakSpeed: number;
  /**
   * Shot power (0..1 of `shotPeakSpeed`) by how long shoot was held (s), as points joined by
   * straight lines: a quick tap is weak, it builds to a sweet spot, then falls off sharply before a
   * whiff. Points must be in order of `seconds`.
   */
  shotPowerCurve: ShotPowerPoint[];
  /**
   * Optional limit on where shots can go, as arcs relative to facing (offset 0 = straight ahead,
   * PI = behind). Unset means shots go wherever aimed. Kept for special moves, e.g.
   * `[{ offset: 0, halfAngle: Math.PI / 3 }]` for a 120° forward cone, plus
   * `{ offset: Math.PI, halfAngle: ... }` for a behind-the-back shot.
   */
  shotArcs?: Arc[];
  /** Holding a charge this long (s) whiffs: the puck dribbles off at `whiffSpeed` px/s in a random direction. */
  shotWhiffSeconds: number;
  whiffSpeed: number;
  /** acceleration and top speed multiplier while winding up a shot */
  chargingMoveScale: number;
  /** px/s of the softest (short) and firmest (long) pass; a future passing stat */
  passMinSpeed: number;
  passMaxSpeed: number;
  /**
   * 0..1: how hard this Pokémon is to beat in a faceoff. Against an opposing center, it narrows the
   * green zone the player has to stop the bar in (see faceoff.ts). A future stat.
   */
  faceoffSkill: number;
  /** px/s of a check's dash: a short burst well over `maxSpeed`. A future checking stat. */
  checkDashSpeed: number;
  /** How long (s) the dash itself lasts, at `checkDashSpeed`, before the speed bleeds back off. */
  checkDashSeconds: number;
  /** After the dash, how long (s) the extra speed takes to bleed back down to `maxSpeed`. */
  checkRecoverySeconds: number;
  /** Time (s) from the start of one check until the next can start. */
  checkCooldownSeconds: number;
  /** px/s² a "carve" style dash speeds up at along the facing (the "commit" style is instant). */
  checkCarveAcceleration: number;
}

/**
 * How a check's dash handles, to compare (pause menu → Options):
 * - `commit`: snaps to full dash speed toward where you clicked and holds that line until it ends.
 * - `carve`: builds to dash speed in a blink along the skater's facing, which keeps turning toward
 *   the mouse, so the dash can be steered.
 * Either way, movement keys are ignored during the dash itself.
 */
export type CheckStyle = 'commit' | 'carve';
export const CHECK_STYLES: CheckStyle[] = ['commit', 'carve'];

/** A check in progress: the dash, then the recovery while the extra speed bleeds off. */
interface CheckState {
  style: CheckStyle;
  /** Unit direction the dash was aimed at when it started. */
  direction: Vec2;
  elapsed: number;
  /** Whether this check has hit someone yet (each check hits at most once). */
  hit: boolean;
}

/** One point on a shot power curve: holding shoot for `seconds` gives `power` (0..1). */
export interface ShotPowerPoint {
  seconds: number;
  power: number;
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
  shotPeakSpeed: 1350,
  shotPowerCurve: [
    { seconds: 0, power: 0.5 },
    { seconds: 0.55, power: 0.8 },
    { seconds: 0.8, power: 0.9 },
    { seconds: 0.88, power: 1 },
    { seconds: 1.1, power: 0.9 },
    { seconds: 1.18, power: 0.6 },
    { seconds: 1.4, power: 0.2 },
  ],
  shotWhiffSeconds: 1.45,
  whiffSpeed: 120,
  chargingMoveScale: 0.55,
  passMinSpeed: 500,
  passMaxSpeed: 800,
  faceoffSkill: 0.5,
  checkDashSpeed: 720,
  checkDashSeconds: 0.11,
  checkRecoverySeconds: 0.3,
  checkCooldownSeconds: 0.9,
  checkCarveAcceleration: 9000,
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
  /** The check in progress, if any (see `startCheck`). */
  private check?: CheckState;
  /** Seconds until another check can start. */
  private checkCooldown = 0;
  /** Seconds left flinched: stopped and unable to skate, shoot, pass or check (see checking.ts). */
  private flinchSeconds = 0;
  private flinchStopDeceleration = 0;
  /** Seconds left in which hitting the boards counts as being checked into them. */
  private checkedSeconds = 0;
  /** True if the skater hit the boards during the current simulation step. */
  public hitBoards = false;

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

  /** True during a check's dash itself (not the recovery after it). */
  get isDashing(): boolean {
    return this.check !== undefined && this.check.elapsed < this.tuning.checkDashSeconds;
  }

  /** True from the start of a check until its extra speed has bled off. */
  get isChecking(): boolean {
    return this.check !== undefined;
  }

  /** The current check's direction while it's dashing and hasn't hit anyone yet, else undefined. */
  get unspentCheckDirection(): Vec2 | undefined {
    return this.isDashing && !this.check!.hit ? this.check!.direction : undefined;
  }

  /** True while a check is going that hasn't hit anyone: crashing into the boards now is a miss. */
  get isMissingCheck(): boolean {
    return this.check !== undefined && !this.check.hit;
  }

  /** Marks the current check as having hit someone, so it can't hit again. */
  markCheckHit(): void {
    if (this.check) {
      this.check.hit = true;
    }
  }

  get isFlinched(): boolean {
    return this.flinchSeconds > 0;
  }

  /**
   * Takes away the skater's control for `seconds`, stopping it at `stopDeceleration` px/s²; any
   * check in progress ends.
   */
  flinch(seconds: number, stopDeceleration: number): void {
    this.flinchSeconds = Math.max(this.flinchSeconds, seconds);
    this.flinchStopDeceleration = stopDeceleration;
    this.check = undefined;
    this.shotCharge = undefined;
  }

  /** Just checked: for the next `seconds`, hitting the boards counts as being checked into them. */
  markChecked(seconds: number): void {
    this.checkedSeconds = seconds;
  }

  /** True while hitting the boards would count as being checked into them. */
  get wasJustChecked(): boolean {
    return this.checkedSeconds > 0;
  }

  /** Ends the checked-into-the-boards window, once it's been rolled for. */
  clearChecked(): void {
    this.checkedSeconds = 0;
  }

  /**
   * Starts a check: a short dash along unit vector `direction`, handled per `style`. The skater
   * turns to face it. Refused (returns false) while one is going or cooling down.
   */
  startCheck(direction: Vec2, style: CheckStyle): boolean {
    if (this.check || this.checkCooldown > 0) {
      return false;
    }

    if (this.isFlinched) {
      return false;
    }

    this.check = { style, direction: { ...direction }, elapsed: 0, hit: false };
    this.checkCooldown = this.tuning.checkCooldownSeconds;
    this.setFacing(direction.x, direction.y);

    if (style === 'commit') {
      this.velocity.x = direction.x * this.tuning.checkDashSpeed;
      this.velocity.y = direction.y * this.tuning.checkDashSpeed;
    }

    return true;
  }

  /**
   * `input` is the direction to accelerate in, each axis -1..1; facing is not changed.
   * `moveScale` lowers acceleration and top speed (skating backward, turning); winding up a shot
   * lowers them further. During a check's dash, input is ignored and the dash drives the skater.
   */
  update(input: Vec2, deltaSeconds: number, moveScale = 1): void {
    this.hitBoards = false;
    this.checkCooldown = Math.max(0, this.checkCooldown - deltaSeconds);
    this.checkedSeconds = Math.max(0, this.checkedSeconds - deltaSeconds);
    this.advanceCheck(deltaSeconds);

    if (this.isFlinched) {
      this.stepFlinched(deltaSeconds);
      return;
    }

    if (this.isDashing) {
      this.stepDash(deltaSeconds);
      return;
    }

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
    this.limitSpeed(Math.max(reducedMaxSpeed, Math.min(this.getSpeedCap(deltaSeconds, speedBefore), bleedingSpeed)));

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.collideWithRink();
  }

  /**
   * Top speed this step: `maxSpeed`, except while recovering from a check, when the dash's extra
   * speed bleeds off evenly over `checkRecoverySeconds` instead of being cut at once.
   */
  private getSpeedCap(deltaSeconds: number, speedBefore: number): number {
    const { maxSpeed, checkDashSpeed, checkRecoverySeconds } = this.tuning;

    if (!this.check) {
      return maxSpeed;
    }

    const bleedRate = (checkDashSpeed - maxSpeed) / checkRecoverySeconds;

    return Math.max(maxSpeed, speedBefore - bleedRate * deltaSeconds);
  }

  /** Moves a check along; it's over once the dash and the recovery after it have both run. */
  private advanceCheck(deltaSeconds: number): void {
    if (!this.check) {
      return;
    }

    this.check.elapsed += deltaSeconds;

    if (this.check.elapsed >= this.tuning.checkDashSeconds + this.tuning.checkRecoverySeconds) {
      this.check = undefined;
    }
  }

  /**
   * One step of a check's dash. `commit` holds the line it started on at full dash speed; `carve`
   * swings toward the facing (still turning toward the mouse) and speeds up to dash speed.
   */
  private stepDash(deltaSeconds: number): void {
    const check = this.check!;
    const { checkDashSpeed, checkCarveAcceleration } = this.tuning;

    if (check.style === 'commit') {
      this.velocity.x = check.direction.x * checkDashSpeed;
      this.velocity.y = check.direction.y * checkDashSpeed;
    } else {
      this.carveToward(this.facing, deltaSeconds);
      this.velocity.x += this.facing.x * checkCarveAcceleration * deltaSeconds;
      this.velocity.y += this.facing.y * checkCarveAcceleration * deltaSeconds;
      this.limitSpeed(checkDashSpeed);
    }

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.collideWithRink();
  }

  /** Ends any check, its cooldown and any flinch at once, e.g. when lining up for a faceoff. */
  cancelCheck(): void {
    this.check = undefined;
    this.checkCooldown = 0;
    this.flinchSeconds = 0;
    this.checkedSeconds = 0;
  }

  /** Keeps the skater inside the boards and out of the nets; hitting the boards sets `hitBoards`. */
  collideWithRink(): void {
    if (containInRoundedRect(this, RINK_ICE, BOARD_RESTITUTION)) {
      this.hitBoards = true;
    }

    RINK_NETS.forEach((net) => pushOutOfRect(this, net, NET_RESTITUTION));
  }

  /** Flinched: no input; the skater stops hard, and can still be shoved around. */
  private stepFlinched(deltaSeconds: number): void {
    this.flinchSeconds = Math.max(0, this.flinchSeconds - deltaSeconds);
    this.applyFriction(this.flinchStopDeceleration * deltaSeconds);
    this.limitSpeed(this.tuning.maxSpeed);
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.collideWithRink();
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
