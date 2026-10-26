/**
 * What checks do. Placeholder numbers until stats (checking, balance, puck control) come in;
 * the engine rolls these with the match's seeded random.
 *
 * - A dashing Pokémon touching an opponent checks them: the checked one drops the puck
 *   `dropChanceOnHit` of the time.
 * - If the checked one then hits the boards within `intoBoardsWindowSeconds`, they were checked
 *   into the wall: `intoBoardsChance` of the time they drop the puck and are flinched.
 * - A checker who hits the boards during their check without having hit anyone crashed: they're
 *   flinched.
 *
 * Flinched (`Skater.flinch`): stops and can't skate, shoot, pass or check for `flinchSeconds`.
 */
export const CHECK_TUNING = {
  /** Chance (0..1) the checked Pokémon drops the puck when hit. */
  dropChanceOnHit: 0.3,
  /** After being checked, hitting the boards within this long (s) counts as being checked into them. */
  intoBoardsWindowSeconds: 0.4,
  /** Chance (0..1) a Pokémon checked into the boards drops the puck and is flinched (one roll for both). */
  intoBoardsChance: 0.8,
  /** How long (s) flinched lasts. */
  flinchSeconds: 1,
  /** px/s² a flinched Pokémon stops at, so a bounce off the boards only slides it a little. */
  flinchStopDeceleration: 1800,
  /** Speed (px/s) a dropped puck squirts out at, in the direction of the check. */
  dropSpeed: 160,
};
