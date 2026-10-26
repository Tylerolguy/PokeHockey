import { containInRoundedRect, pushOutOfRect, type Vec2 } from './geometry';
import {
  CENTER_CIRCLE_RADIUS,
  CREASE_DEPTH,
  DEFENDED_GOAL,
  FACEOFF_DOT_POSITIONS,
  FACEOFF_DOTS,
  RINK_ICE,
  RINK_NETS,
  type FaceoffDot,
} from './rink';
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
/**
 * Lining up at any dot but center ice (px from the dot): "back" is toward the team's own net,
 * "side" is across the rink, to the position's own side.
 */
const WING_BACK = 50;
const WING_SIDE = 95;
const DEFENSE_BACK = 150;
const DEFENSE_SIDE = 70;
/** Formation spots are kept at least this far (px) inside the boards and off the nets: a skater's size plus a little. */
const SPOT_CLEARANCE = 26;

/** Where one Pokémon starts each faceoff, and which way it faces. */
export interface StartingSpot {
  position: Vec2;
  facing: Vec2;
}

/**
 * Each position's spot for `team` at a faceoff on `dot`:
 * - goalie: the middle of their crease, wherever the faceoff is
 * - center: right in front of the puck if `faceoffTeam` is this team, otherwise outside the center
 *   circle's distance, on their own side of the dot either way
 * - at center ice, wings take the faceoff dots just outside their own blue line and defense the
 *   dots in their own end zone
 * - at any other dot, wings stand beside the dot and defense further back, both on the team's own
 *   side of it; spots are kept inside the boards and off the nets
 *
 * Left and right are from the team's point of view, facing the net it attacks: the player's team
 * attacks to the right, so its left is the top of the screen; the opponents' left is the bottom.
 */
function getFormationSpots(team: Team, faceoffTeam: Team, dot: FaceoffDot): Record<OnIcePosition, Vec2> {
  const goal = DEFENDED_GOAL[team];
  const upIce = team === 'player' ? 1 : -1;
  // Screen y of the team's left: the player's left is up the screen, the opponents' is down.
  const leftY = team === 'player' ? -1 : 1;
  const puck = FACEOFF_DOT_POSITIONS[dot];
  const centerGap = team === faceoffTeam ? CENTER_WITH_ADVANTAGE_GAP : CENTER_WITHOUT_ADVANTAGE_GAP;
  const goalie = { x: goal.x + upIce * (CREASE_DEPTH / 2), y: goal.y };
  const center = { x: puck.x - upIce * centerGap, y: puck.y };

  if (dot === 'center') {
    // FACEOFF_DOTS list the upper dot first.
    const [leftSide, rightSide] = team === 'player' ? [0, 1] : [1, 0];
    const { endZone, neutralZone } = FACEOFF_DOTS[team];

    return {
      goalie,
      center,
      leftWing: neutralZone[leftSide],
      rightWing: neutralZone[rightSide],
      leftDefense: endZone[leftSide],
      rightDefense: endZone[rightSide],
    };
  }

  const aroundDot = (back: number, side: number) =>
    keepOnIce({ x: puck.x - upIce * back, y: puck.y + leftY * side });

  return {
    goalie,
    center: keepOnIce(center),
    leftWing: aroundDot(WING_BACK, WING_SIDE),
    rightWing: aroundDot(WING_BACK, -WING_SIDE),
    leftDefense: aroundDot(DEFENSE_BACK, DEFENSE_SIDE),
    rightDefense: aroundDot(DEFENSE_BACK, -DEFENSE_SIDE),
  };
}

/** Moves a spot inside the boards (corners included) and out of the nets, with room for a skater. */
function keepOnIce(spot: Vec2): Vec2 {
  const body = { position: { ...spot }, previousPosition: { ...spot }, velocity: { x: 0, y: 0 }, radius: SPOT_CLEARANCE };
  containInRoundedRect(body, RINK_ICE, 0);
  RINK_NETS.forEach((net) => pushOutOfRect(body, net, 0));

  return body.position;
}

/**
 * Where a Pokémon at `playingPosition` on `team` lines up for a faceoff on `dot` (center ice by
 * default) that `faceoffTeam` has the advantage in.
 */
export function getStartingSpot(
  team: Team,
  playingPosition: PlayingPosition,
  faceoffTeam: Team,
  dot: FaceoffDot = 'center',
): StartingSpot {
  if (!isOnIcePosition(playingPosition)) {
    throw new Error(`Only on-ice positions have a starting spot, not ${playingPosition}`);
  }

  return {
    position: { ...getFormationSpots(team, faceoffTeam, dot)[playingPosition] },
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
