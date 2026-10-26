import type { FaceoffDot } from './rink';

/**
 * The match's state machine: which phase it's in, what each phase allows, and which phase can
 * follow which. `HockeyEngine` runs the phases; adding one means adding it to `MatchPhase`, giving
 * it rules and transitions here, and a step in the engine (the `Record` types make each required).
 *
 * - `faceoff`: everyone on their faceoff spot around the faceoff dot (`FaceoffDot`) with the puck
 *   on it. Nobody moves until the countdown ends and the puck is live. Each period opens with one
 *   at center ice, and every goal and stoppage ends in one.
 * - `live`: normal hockey, with the game clock running.
 * - `goalScored`: a goal just went in. The puck stays in the net while everyone skates back to
 *   their spots for the center-ice faceoff; the player has no control.
 * - `stoppage`: the whistle went for something other than a goal (`StoppageReason`). The puck is
 *   dead and everyone skates to their spots for a faceoff at the dot nearest where it stopped.
 * - `periodEnd`: the clock ran out. A period-end screen shows; then the next period starts with a
 *   faceoff at center ice, or after the last period the game is over.
 * - `gameOver`: the match is decided (the last period ended, or `MatchRules.goalsToWin` was
 *   reached). Skaters coast to a stop; nothing restarts.
 */
export type MatchPhase = 'faceoff' | 'live' | 'goalScored' | 'stoppage' | 'periodEnd' | 'gameOver';

/**
 * Why play was stopped. Only the testing whistle exists so far; puck out of play, goalie covers,
 * offsides, icing and penalties will add theirs.
 */
export type StoppageReason = 'whistle';

/** What a phase allows. */
export interface MatchPhaseRules {
  /** The player's input drives their skater (and Space can switch who that is). */
  playerControl: boolean;
  /** The puck can be carried, stolen, shot and scored. */
  puckInPlay: boolean;
  /** The game clock counts down. */
  clockRuns: boolean;
}

export const MATCH_PHASE_RULES: Record<MatchPhase, MatchPhaseRules> = {
  faceoff: { playerControl: false, puckInPlay: false, clockRuns: false },
  live: { playerControl: true, puckInPlay: true, clockRuns: true },
  goalScored: { playerControl: false, puckInPlay: false, clockRuns: false },
  stoppage: { playerControl: false, puckInPlay: false, clockRuns: false },
  periodEnd: { playerControl: false, puckInPlay: false, clockRuns: false },
  gameOver: { playerControl: false, puckInPlay: false, clockRuns: false },
};

/** Which phases each phase may move to. Anything else is a bug, and the engine refuses it. */
export const MATCH_PHASE_TRANSITIONS: Record<MatchPhase, readonly MatchPhase[]> = {
  faceoff: ['live'],
  live: ['goalScored', 'stoppage', 'periodEnd', 'gameOver'],
  goalScored: ['faceoff', 'gameOver'],
  stoppage: ['faceoff', 'gameOver'],
  periodEnd: ['faceoff', 'gameOver'],
  gameOver: [],
};

/** Settings for how a match is played and won. Changeable mid-match (from the pause menu's Options). */
export interface MatchRules {
  /** Periods in a match; the game is over when the last one ends. */
  periods: number;
  /** Length of each period on the game clock (s). The clock only runs while the puck is live. */
  periodSeconds: number;
  /** First team to this many goals wins, ending the match early. Undefined: no limit. */
  goalsToWin?: number;
}

/** Three 3-minute periods: arcade length, not the real 20. */
export const DEFAULT_MATCH_RULES: MatchRules = { periods: 3, periodSeconds: 180, goalsToWin: undefined };

/** Where faceoffs that don't follow a stoppage happen: period starts and after goals. */
export const CENTER_ICE_FACEOFF: FaceoffDot = 'center';

export function canTransition(from: MatchPhase, to: MatchPhase): boolean {
  return MATCH_PHASE_TRANSITIONS[from].includes(to);
}
