import { containInRoundedRect, pushOutOfRect, type Vec2 } from './geometry';
import {
  BLUE_LINE_X,
  CENTER_CIRCLE_RADIUS,
  CENTER_DOT,
  CREASE_DEPTH,
  DEFENDED_GOAL,
  END_ZONE_CIRCLE_RADIUS,
  FACEOFF_DOT_POSITIONS,
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
 * Ways of lining up the non-centers for a faceoff, to compare (pause menu → Options). In all of
 * them both centers take the draw at the dot and goalies stay in their crease.
 * - `hashMarks`: wings on the edge of the circle, level with the dot. Defense: spread wide behind
 *   the circle in the middle of the rink. In their own end, one is level with the goalie mid-zone
 *   and the other just outside the circle behind their center. In the other team's end, both are
 *   at the blue line, each in line behind a wing.
 * - `box`: wings just inside the circle behind the centers, defense tucked in behind them, the
 *   same in every zone.
 * - `diamond`: in the end zones the inside wing goes to the net front (screening in the other
 *   team's end, guarding the crease in their own), the other wing stays on the circle edge. In
 *   their own end one defense takes the open circle edge and the other sits behind the center; in
 *   the other team's end defense are at the points. In the middle of the rink the wings are on the
 *   circle edge and the defense stand one behind the other.
 */
export type FaceoffLayout = 'hashMarks' | 'box' | 'diamond';
export const FACEOFF_LAYOUTS: FaceoffLayout[] = ['hashMarks', 'box', 'diamond'];

/**
 * Where a faceoff is from one team's point of view: center ice, a neutral-zone dot (no circle),
 * their own end zone, or the end zone they attack.
 */
type FaceoffZone = 'center' | 'neutral' | 'defending' | 'attacking';

/** Each center stands this far from the dot on their own side, so the two are just apart (px). */
const CENTER_GAP = 24;
/**
 * Layout distances (px) from the dot. "Back" is toward the team's own net; "side" is across the
 * rink. Circle-relative ones are fractions of that dot's circle radius.
 */
const HASH_MARK_WING_BACK = 24;
const HASH_MARKS_OPEN_ICE_DEFENSE_BACK = 90; // past the circle edge
const HASH_MARKS_OPEN_ICE_DEFENSE_SIDE = 0.8; // x radius
/** Own end: the boards-side defense stands this far outside the circle edge, straight behind their center. */
const HASH_MARKS_BEHIND_CIRCLE_DEFENSE_BACK = 30;
const BOX_WING_BACK = 60;
const BOX_WING_SIDE = 0.7; // x radius
const BOX_DEFENSE_BACK = 150;
const BOX_DEFENSE_SIDE = 0.45; // x radius
const DIAMOND_OWN_END_DEFENSE_BACK = 130;
const DIAMOND_OPEN_ICE_DEFENSE_BACKS = [160, 290];
/** Net-front spots in the diamond: out from the goal line, and across from the net's middle toward the dot's side. */
const NET_FRONT_ATTACKER = { out: CREASE_DEPTH + 45, side: 40 };
const NET_FRONT_DEFENDER = { out: CREASE_DEPTH + 20, side: -15 };
/** Points: how far inside the attacked zone from its blue line (px), and the boards-side point's offset from the dot's y. */
const POINT_INSIDE_BLUE_LINE = 30;
const POINT_BOARDS_SIDE = 30;
/** Formation spots are kept at least this far (px) inside the boards and off the nets: a skater's size plus a little. */
const SPOT_CLEARANCE = 26;

/** Where one Pokémon starts each faceoff, and which way it faces. */
export interface StartingSpot {
  position: Vec2;
  facing: Vec2;
}

function getFaceoffZone(team: Team, dot: FaceoffDot): FaceoffZone {
  if (dot === 'center') {
    return 'center';
  }

  if (dot.includes('Neutral')) {
    return 'neutral';
  }

  // The player's team defends the left end, the opponents the right.
  const inLeftEnd = dot.startsWith('left');

  return inLeftEnd === (team === 'player') ? 'defending' : 'attacking';
}

/**
 * Each position's spot for `team` at a faceoff on `dot` in `layout` (see `FaceoffLayout`). Spots
 * are kept inside the boards and off the nets.
 *
 * Left and right are from the team's point of view, facing the net it attacks: the player's team
 * attacks to the right, so its left is the top of the screen; the opponents' left is the bottom.
 */
function getFormationSpots(team: Team, dot: FaceoffDot, layout: FaceoffLayout): Record<OnIcePosition, Vec2> {
  const other: Team = team === 'player' ? 'opponent' : 'player';
  const ownGoal = DEFENDED_GOAL[team];
  const attackedGoal = DEFENDED_GOAL[other];
  const upIce = team === 'player' ? 1 : -1;
  // Screen y of the team's left: the player's left is up the screen, the opponents' is down.
  const leftY = team === 'player' ? -1 : 1;
  const puck = FACEOFF_DOT_POSITIONS[dot];
  const radius = dot === 'center' ? CENTER_CIRCLE_RADIUS : END_ZONE_CIRCLE_RADIUS;
  const zone = getFaceoffZone(team, dot);
  // Screen y toward the nearer boards (0 at center ice, which is in the middle).
  const boardsY = Math.sign(puck.y - CENTER_DOT.y);
  // Which wing and defense play the middle-of-the-rink side of an off-center dot.
  const leftIsInside = leftY === -boardsY;

  /** `back` toward the team's own net and `side` toward the team's left. */
  const fromDot = (back: number, side: number): Vec2 => ({ x: puck.x - upIce * back, y: puck.y + leftY * side });
  /** `back` toward the team's own net and `towardBoards` (negative: toward the middle). */
  const fromDotToBoards = (back: number, towardBoards: number): Vec2 => ({
    x: puck.x - upIce * back,
    y: puck.y + boardsY * towardBoards,
  });
  /** Left/right spots from an inside spot and a boards spot. */
  const bySide = (inside: Vec2, boards: Vec2): [left: Vec2, right: Vec2] => (leftIsInside ? [inside, boards] : [boards, inside]);
  const points = (): [left: Vec2, right: Vec2] => {
    const x = BLUE_LINE_X[other] + upIce * POINT_INSIDE_BLUE_LINE;

    return bySide({ x, y: CENTER_DOT.y }, { x, y: puck.y + boardsY * POINT_BOARDS_SIDE });
  };
  const hashWings = (): [left: Vec2, right: Vec2] => [
    fromDot(HASH_MARK_WING_BACK, radius),
    fromDot(HASH_MARK_WING_BACK, -radius),
  ];

  let wings: [Vec2, Vec2];
  let defense: [Vec2, Vec2];

  switch (layout) {
    case 'hashMarks':
      wings = hashWings();

      if (zone === 'defending') {
        // Inside defense level with the goalie, mid-zone; boards-side defense just outside the
        // circle, straight behind their center.
        defense = bySide(
          { x: (ownGoal.x + BLUE_LINE_X[team]) / 2, y: ownGoal.y },
          fromDot(radius + HASH_MARKS_BEHIND_CIRCLE_DEFENSE_BACK, 0),
        );
      } else if (zone === 'attacking') {
        // Both at the blue line, each in line behind a wing.
        const pointX = BLUE_LINE_X[other] + upIce * POINT_INSIDE_BLUE_LINE;
        defense = [
          { x: pointX, y: wings[0].y },
          { x: pointX, y: wings[1].y },
        ];
      } else {
        const back = radius + HASH_MARKS_OPEN_ICE_DEFENSE_BACK;
        const side = HASH_MARKS_OPEN_ICE_DEFENSE_SIDE * radius;
        defense = [fromDot(back, side), fromDot(back, -side)];
      }
      break;

    case 'box':
      wings = [fromDot(BOX_WING_BACK, BOX_WING_SIDE * radius), fromDot(BOX_WING_BACK, -BOX_WING_SIDE * radius)];
      defense = [
        fromDot(BOX_DEFENSE_BACK, BOX_DEFENSE_SIDE * radius),
        fromDot(BOX_DEFENSE_BACK, -BOX_DEFENSE_SIDE * radius),
      ];
      break;

    case 'diamond': {
      const boardsHash = fromDotToBoards(HASH_MARK_WING_BACK, radius);
      const insideHash = fromDotToBoards(HASH_MARK_WING_BACK, -radius);

      if (zone === 'defending') {
        const netFront = {
          x: ownGoal.x + upIce * NET_FRONT_DEFENDER.out,
          y: ownGoal.y + boardsY * NET_FRONT_DEFENDER.side,
        };
        wings = bySide(netFront, boardsHash);
        defense = bySide(insideHash, fromDot(DIAMOND_OWN_END_DEFENSE_BACK, 0));
      } else if (zone === 'attacking') {
        const netFront = {
          x: attackedGoal.x - upIce * NET_FRONT_ATTACKER.out,
          y: attackedGoal.y + boardsY * NET_FRONT_ATTACKER.side,
        };
        wings = bySide(netFront, boardsHash);
        defense = points();
      } else {
        const [nearBack, farBack] = DIAMOND_OPEN_ICE_DEFENSE_BACKS;
        wings = hashWings();
        // Stagger the far one a little so they don't hide each other.
        defense = [fromDot(nearBack, 0), fromDot(farBack, 20)];
      }
      break;
    }
  }

  return {
    goalie: { x: ownGoal.x + upIce * (CREASE_DEPTH / 2), y: ownGoal.y },
    center: keepOnIce(fromDot(CENTER_GAP, 0)),
    leftWing: keepOnIce(wings[0]),
    rightWing: keepOnIce(wings[1]),
    leftDefense: keepOnIce(defense[0]),
    rightDefense: keepOnIce(defense[1]),
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
 * default) in `layout`.
 */
export function getStartingSpot(
  team: Team,
  playingPosition: PlayingPosition,
  dot: FaceoffDot = 'center',
  layout: FaceoffLayout = 'hashMarks',
): StartingSpot {
  if (!isOnIcePosition(playingPosition)) {
    throw new Error(`Only on-ice positions have a starting spot, not ${playingPosition}`);
  }

  return {
    position: { ...getFormationSpots(team, dot, layout)[playingPosition] },
    facing: { x: team === 'player' ? 1 : -1, y: 0 },
  };
}

/**
 * Gives each lineup entry the starting spot for its position at the opening (center-ice)
 * faceoff. Throws unless each team has exactly one of every on-ice position.
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

  return lineup.map(({ team, playingPosition }) => getStartingSpot(team, playingPosition));
}
