import type { Vec2 } from './geometry';
import { CENTER_CIRCLE_RADIUS, CENTER_DOT, CREASE_DEPTH, DEFENDED_GOAL, FACEOFF_DOTS } from './rink';
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

/** The team with the faceoff advantage when the game starts. */
export const OPENING_FACEOFF_TEAM: Team = 'player';
/**
 * How far from the center dot each center lines up (px). The team with the faceoff advantage is
 * right in front of the puck, just short of touching it; the other waits outside the center circle.
 */
const CENTER_WITH_ADVANTAGE_GAP = 32;
const CENTER_WITHOUT_ADVANTAGE_GAP = CENTER_CIRCLE_RADIUS + 30;

/** Where one Pokémon starts each faceoff, and which way it faces. */
export interface StartingSpot {
  position: Vec2;
  facing: Vec2;
}

/**
 * Each position's starting spot for `team`:
 * - goalie: the middle of their crease
 * - center: right in front of the puck if `faceoffTeam` is this team, otherwise outside the center
 *   circle, on their own side either way
 * - wings: the faceoff dots just outside their own blue line
 * - defense: the faceoff dots in their own end zone
 *
 * Left and right are from the team's point of view, facing the net it attacks: the player's team
 * attacks to the right, so its left is the top of the screen; the opponents' left is the bottom.
 */
function getFormationSpots(team: Team, faceoffTeam: Team): Record<OnIcePosition, Vec2> {
  const goal = DEFENDED_GOAL[team];
  const upIce = team === 'player' ? 1 : -1;
  // FACEOFF_DOTS list the upper dot first.
  const [leftSide, rightSide] = team === 'player' ? [0, 1] : [1, 0];
  const { endZone, neutralZone } = FACEOFF_DOTS[team];

  return {
    goalie: { x: goal.x + upIce * (CREASE_DEPTH / 2), y: goal.y },
    center: {
      x: CENTER_DOT.x - upIce * (team === faceoffTeam ? CENTER_WITH_ADVANTAGE_GAP : CENTER_WITHOUT_ADVANTAGE_GAP),
      y: CENTER_DOT.y,
    },
    leftWing: neutralZone[leftSide],
    rightWing: neutralZone[rightSide],
    leftDefense: endZone[leftSide],
    rightDefense: endZone[rightSide],
  };
}

/**
 * Where a Pokémon at `playingPosition` on `team` lines up for a faceoff that `faceoffTeam` has the
 * advantage in.
 */
export function getStartingSpot(team: Team, playingPosition: PlayingPosition, faceoffTeam: Team): StartingSpot {
  if (!isOnIcePosition(playingPosition)) {
    throw new Error(`Only on-ice positions have a starting spot, not ${playingPosition}`);
  }

  return {
    position: { ...getFormationSpots(team, faceoffTeam)[playingPosition] },
    facing: { x: team === 'player' ? 1 : -1, y: 0 },
  };
}

/**
 * Gives each lineup entry the starting spot for its position. Throws unless each team has exactly
 * one of every on-ice position.
 */
export function assignStartingSpots(
  lineup: { team: Team; playingPosition: PlayingPosition }[],
  faceoffTeam: Team,
): StartingSpot[] {
  for (const team of ['player', 'opponent'] as const) {
    for (const position of ON_ICE_POSITIONS) {
      const count = lineup.filter((entry) => entry.team === team && entry.playingPosition === position).length;

      if (count !== 1) {
        throw new Error(`Team ${team} needs exactly one ${position}, has ${count}`);
      }
    }
  }

  return lineup.map(({ team, playingPosition }) => getStartingSpot(team, playingPosition, faceoffTeam));
}
