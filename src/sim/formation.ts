import type { Vec2 } from './geometry';
import { CREASE_DEPTH, DEFENDED_GOAL, FACEOFF_DOTS, RINK_HEIGHT, RINK_WIDTH } from './rink';
import type { PlayingPosition, Team } from './Skater';

/** Positions that take the ice. */
export type OnIcePosition = Extract<PlayingPosition, 'offense' | 'defense' | 'goalie'>;

/** Every team dresses exactly this many of each on-ice position. */
export const TEAM_FORMATION: Record<OnIcePosition, number> = {
  offense: 3,
  defense: 2,
  goalie: 1,
};

/** How far behind the center dot, on its own side, the third offense lines up for the faceoff (px). */
const CENTER_FACEOFF_GAP = 45;

/** Where one Pokémon starts each faceoff, and which way it faces. */
export interface StartingSpot {
  position: Vec2;
  facing: Vec2;
}

/**
 * Starting spots by position for `team`, one per slot in `TEAM_FORMATION`:
 * - goalie: in the middle of their crease
 * - defense: the two faceoff dots in their own end zone
 * - offense: the two faceoff dots just outside their own blue line, then the center faceoff just
 *   behind the center dot on their side
 */
function getFormationSpots(team: Team): Record<OnIcePosition, Vec2[]> {
  const goal = DEFENDED_GOAL[team];
  const upIce = team === 'player' ? 1 : -1;

  return {
    goalie: [{ x: goal.x + upIce * (CREASE_DEPTH / 2), y: goal.y }],
    defense: FACEOFF_DOTS[team].endZone,
    offense: [
      ...FACEOFF_DOTS[team].neutralZone,
      { x: RINK_WIDTH / 2 - upIce * CENTER_FACEOFF_GAP, y: RINK_HEIGHT / 2 },
    ],
  };
}

/**
 * Gives each lineup entry its starting spot: the nth offense on a team takes that team's nth
 * offense spot, and so on. Throws if a team doesn't have exactly the formation's numbers.
 */
export function assignStartingSpots(lineup: { team: Team; playingPosition: PlayingPosition }[]): StartingSpot[] {
  const used = new Map<string, number>();
  const spots = lineup.map(({ team, playingPosition }) => {
    if (!(playingPosition in TEAM_FORMATION)) {
      throw new Error(`Only offense, defense and goalie can start on the ice, not ${playingPosition}`);
    }

    const position = playingPosition as OnIcePosition;
    const key = `${team}/${position}`;
    const slot = used.get(key) ?? 0;
    const spot = getFormationSpots(team)[position][slot];
    used.set(key, slot + 1);

    if (!spot) {
      throw new Error(`Team ${team} has more than ${TEAM_FORMATION[position]} ${position}`);
    }

    return { position: { ...spot }, facing: { x: team === 'player' ? 1 : -1, y: 0 } };
  });

  for (const team of ['player', 'opponent'] as const) {
    for (const [position, count] of Object.entries(TEAM_FORMATION)) {
      if ((used.get(`${team}/${position}`) ?? 0) !== count) {
        throw new Error(`Team ${team} needs exactly ${count} ${position}`);
      }
    }
  }

  return spots;
}
