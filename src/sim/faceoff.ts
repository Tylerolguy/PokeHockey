import { clamp, type Vec2 } from './geometry';
import type { Team } from './Skater';

/**
 * Who wins a faceoff and where the puck goes, played as two timing presses of the shoot button:
 *
 * 1. `timing`: a marker slides back and forth along a bar. Stop it in the green to win the draw.
 *    The green is narrower the better the opposing center is at faceoffs (`faceoffSkill`), and
 *    sits somewhere different each time. Missing it, or not pressing in time, loses the draw.
 * 2. `aiming` (only if the player won): an arrow spins around the dot. Stop it to choose the
 *    direction the puck shoots out in.
 *
 * If the opponents win, they draw it back toward their own end. Either way the puck shoots out
 * from the dot straight through both centers, who can't touch it until it's past them.
 *
 * `getSet`, `timingResult` and `aimingResult` are short holds so each step registers before the next.
 */
export type FaceoffStage = 'getSet' | 'timing' | 'timingResult' | 'aiming' | 'aimingResult' | 'dropped';

export const FACEOFF_TUNING = {
  /** Hold after lining up before the bar starts (s). */
  getSetSeconds: 0.8,
  /** Time for the marker to cross the bar once, end to end (s). */
  barCrossSeconds: 0.9,
  /** Without a press by then, the draw is lost (s). */
  timingLimitSeconds: 4,
  /** Width of the green, as a fraction of the bar, against the weakest (skill 0) and best (skill 1) opposing centers. */
  greenWidthEasiest: 0.32,
  greenWidthHardest: 0.07,
  /** The green never starts closer than this to either end of the bar (fraction). */
  greenEdgeMargin: 0.08,
  /** How long the stopped bar, then the stopped arrow, stay on screen (s). */
  resultSeconds: 0.5,
  /** Time for one full turn of the arrow (s). */
  spinSeconds: 1.3,
  /** Without a press by then, the arrow stops where it is (s). */
  aimingLimitSeconds: 4,
  /** Opponents who win draw the puck back within this angle (rad) either side of straight back. */
  opponentDrawHalfAngle: Math.PI / 3,
  /** Speed the puck shoots out of the faceoff at (px/s). */
  dropSpeed: 420,
  /** How long neither center can touch the puck, so it shoots past them (s). */
  centersUntouchableSeconds: 0.35,
};

/** One faceoff's draw; the engine steps it during the `faceoff` phase. */
export class FaceoffDraw {
  public stage: FaceoffStage = 'getSet';
  /** The green zone on the bar, as fractions (0..1) of its length. */
  public readonly greenStart: number;
  public readonly greenEnd: number;
  /** Where the bar's marker stopped (0..1), once it has. */
  public stoppedAt?: number;
  public winner?: Team;
  /** Unit direction the puck shoots out in, once decided. */
  public direction?: Vec2;
  private stageSeconds = 0;

  /**
   * `opponentSkill` (0..1) is the opposing center's `faceoffSkill`. `opponentDrawBack` is the unit
   * direction back toward the opponents' own end. `random` is the match's seeded generator.
   */
  constructor(
    opponentSkill: number,
    private readonly opponentDrawBack: Vec2,
    private readonly random: () => number,
  ) {
    const { greenWidthEasiest, greenWidthHardest, greenEdgeMargin } = FACEOFF_TUNING;
    const width = greenWidthEasiest + (greenWidthHardest - greenWidthEasiest) * clamp(opponentSkill, 0, 1);
    this.greenStart = greenEdgeMargin + random() * (1 - 2 * greenEdgeMargin - width);
    this.greenEnd = this.greenStart + width;
  }

  /** Where the bar's marker is (0..1): bouncing end to end while running, or where it stopped. */
  get barPosition(): number {
    if (this.stoppedAt !== undefined) {
      return this.stoppedAt;
    }

    if (this.stage !== 'timing') {
      return 0;
    }

    const crossings = this.stageSeconds / FACEOFF_TUNING.barCrossSeconds;
    const phase = crossings % 2;

    return phase < 1 ? phase : 2 - phase;
  }

  /** The aiming arrow's angle (rad, screen coordinates): spinning while aiming, then fixed. */
  get arrowAngle(): number {
    if (this.direction && this.winner === 'player') {
      return Math.atan2(this.direction.y, this.direction.x);
    }

    return this.stage === 'aiming' ? (this.stageSeconds / FACEOFF_TUNING.spinSeconds) * Math.PI * 2 : 0;
  }

  /** Advances the draw; `pressed` is true on the step the shoot button went down. */
  step(deltaSeconds: number, pressed: boolean): void {
    const tuning = FACEOFF_TUNING;
    this.stageSeconds += deltaSeconds;

    switch (this.stage) {
      case 'getSet':
        if (this.stageSeconds >= tuning.getSetSeconds) {
          this.setStage('timing');
        }
        break;

      case 'timing':
        if (pressed || this.stageSeconds >= tuning.timingLimitSeconds) {
          const position = this.barPosition;
          this.stoppedAt = position;
          this.winner = pressed && position >= this.greenStart && position <= this.greenEnd ? 'player' : 'opponent';
          this.setStage('timingResult');
        }
        break;

      case 'timingResult':
        if (this.stageSeconds >= tuning.resultSeconds) {
          if (this.winner === 'player') {
            this.setStage('aiming');
          } else {
            const angle =
              Math.atan2(this.opponentDrawBack.y, this.opponentDrawBack.x) +
              (this.random() * 2 - 1) * tuning.opponentDrawHalfAngle;
            this.direction = { x: Math.cos(angle), y: Math.sin(angle) };
            this.setStage('dropped');
          }
        }
        break;

      case 'aiming':
        if (pressed || this.stageSeconds >= tuning.aimingLimitSeconds) {
          const angle = this.arrowAngle;
          this.direction = { x: Math.cos(angle), y: Math.sin(angle) };
          this.setStage('aimingResult');
        }
        break;

      case 'aimingResult':
        if (this.stageSeconds >= tuning.resultSeconds) {
          this.setStage('dropped');
        }
        break;

      case 'dropped':
        break;
    }
  }

  private setStage(stage: FaceoffStage): void {
    this.stage = stage;
    this.stageSeconds = 0;
  }
}
