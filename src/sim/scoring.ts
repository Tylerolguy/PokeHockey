import type { Puck } from './Puck';
import type { Team } from './Skater';
import { RINK_NETS, RINK_WIDTH } from './rink';

/** Which team each net (in `RINK_NETS` order) belongs to: the player's team defends the left one. */
const NET_DEFENDERS: Team[] = ['player', 'opponent'];

/**
 * The team that just scored, if the puck is entirely across a goal line and inside a net,
 * otherwise undefined.
 */
export function getScoringTeam(puck: Puck): Team | undefined {
  const { x, y } = puck.position;
  const index = RINK_NETS.findIndex((net) => {
    const opensRight = (net.left + net.right) / 2 < RINK_WIDTH / 2;
    const acrossLine = opensRight ? x + puck.radius < net.right : x - puck.radius > net.left;

    return acrossLine && x > net.left && x < net.right && y > net.top && y < net.bottom;
  });

  if (index === -1) {
    return undefined;
  }

  return NET_DEFENDERS[index] === 'player' ? 'opponent' : 'player';
}
