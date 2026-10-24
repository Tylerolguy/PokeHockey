import type { Puck } from './Puck';
import type { Skater } from './Skater';

/** What happens when a shot hits a Pokémon. */
export type ShotContactOutcome = 'stop' | 'deflect' | 'passThrough';

/** Chance (0..1) of each outcome; they should add up to 1. */
export type ShotContactChances = Record<ShotContactOutcome, number>;

const GOALIE_CHANCES: ShotContactChances = { stop: 0.6, deflect: 0.3, passThrough: 0.1 };
const SKATER_CHANCES: ShotContactChances = { stop: 0.2, deflect: 0.3, passThrough: 0.5 };

/**
 * The odds when `puck`, a live shot, hits `skater`. Placeholder table by position for now; this is
 * where stats and shot speed (`puck.speed`) will come in.
 */
export function getShotContactChances(skater: Skater, _puck: Puck): ShotContactChances {
  return skater.playingPosition === 'goalie' ? GOALIE_CHANCES : SKATER_CHANCES;
}

/** Picks an outcome with the given odds, using `random` (numbers in [0, 1)). */
export function rollShotContact(chances: ShotContactChances, random: () => number): ShotContactOutcome {
  const roll = random();

  if (roll < chances.stop) {
    return 'stop';
  }

  return roll < chances.stop + chances.deflect ? 'deflect' : 'passThrough';
}
