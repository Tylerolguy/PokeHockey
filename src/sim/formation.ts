import type { Vec2 } from './geometry';
import { CREASE_DEPTH, DEFENDED_GOAL, FACEOFF_DOTS, RINK_HEIGHT, RINK_WIDTH } from './rink';
import type { PlayingPosition, Team } from './Skater';

/** Positions that take the ice; every team dresses exactly one of each. */
export const ON_ICE_POSITIONS = ['center', 'leftWing', 'rightWing', 'leftDefense', 'rightDefense', 'goalie'] as const;
export type OnIcePosition = (typeof ON_ICE_POSITIONS)[number];

/** The broad job a position belongs to, e.g. for AI roles. */
export type PositionGroup = 'offense' | 'defense' | 'goalie';

const POSITION_GROUPS: Record<OnIcePosition, PositionGroup> = {
  center: 'offense',
  leftWing: 'offense',
  rightWing: 'offense',
  leftDefense: 'defense',
  rightDefense: 'defense',
  goalie: 'goalie',
};

/** Offense, defense or goalie; undefined for Pokémon not on the ice (bench, reserve). */
export function getPositionGroup(position: PlayingPosition): PositionGroup | undefined {
  return isOnIcePosition(position) ? POSITION_GROUPS[position] : undefined;
}

function isOnIcePosition(position: PlayingPosition): position is OnIcePosition {
  return (ON_ICE_POSITIONS as readonly string[]).includes(position);
}

/** How far behind the center dot, on its own side, the center lines up for the faceoff (px). */
const CENTER_FACEOFF_GAP = 45;

/** Where one Pokémon starts each faceoff, and which way it faces. */
export interface StartingSpot {
  position: Vec2;
  facing: Vec2;
}

/**
 * Each position's starting spot for `team`:
 * - goalie: the middle of their crease
 * - center: just behind the center dot on their side
 * - wings: the faceoff dots just outside their own blue line
 * - defense: the faceoff dots in their own end zone
 *
 * Left and right are from the team's point of view, facing the net it attacks: the player's team
 * attacks to the right, so its left is the top of the screen; the opponents' left is the bottom.
 */
function getFormationSpots(team: Team): Record<OnIcePosition, Vec2> {
  const goal = DEFENDED_GOAL[team];
  const upIce = team === 'player' ? 1 : -1;
  // FACEOFF_DOTS list the upper dot first.
  const [leftSide, rightSide] = team === 'player' ? [0, 1] : [1, 0];
  const { endZone, neutralZone } = FACEOFF_DOTS[team];

  return {
    goalie: { x: goal.x + upIce * (CREASE_DEPTH / 2), y: goal.y },
    center: { x: RINK_WIDTH / 2 - upIce * CENTER_FACEOFF_GAP, y: RINK_HEIGHT / 2 },
    leftWing: neutralZone[leftSide],
    rightWing: neutralZone[rightSide],
    leftDefense: endZone[leftSide],
    rightDefense: endZone[rightSide],
  };
}

/**
 * Gives each lineup entry the starting spot for its position. Throws unless each team has exactly
 * one of every on-ice position.
 */
export function assignStartingSpots(lineup: { team: Team; playingPosition: PlayingPosition }[]): StartingSpot[] {
  for (const team of ['player', 'opponent'] as const) {
    for (const position of ON_ICE_POSITIONS) {
      const count = lineup.filter((entry) => entry.team === team && entry.playingPosition === position).length;

      if (count !== 1) {
        throw new Error(`Team ${team} needs exactly one ${position}, has ${count}`);
      }
    }
  }

  return lineup.map(({ team, playingPosition }) => {
    if (!isOnIcePosition(playingPosition)) {
      throw new Error(`Only on-ice positions can start a game, not ${playingPosition}`);
    }

    return {
      position: { ...getFormationSpots(team)[playingPosition] },
      facing: { x: team === 'player' ? 1 : -1, y: 0 },
    };
  });
}
