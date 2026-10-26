import type { Rect, RoundedRect, Vec2 } from './geometry';
import type { Team } from './Skater';

export const RINK_BACKGROUND_KEY = 'rink-background';
export const RINK_BACKGROUND_PATH = 'assets/backgrounds/retro-hockey-rink-pokeball-final-spacing.png';

/** Pixel size of the background image; the world uses the same coordinates. */
export const RINK_WIDTH = 1728;
export const RINK_HEIGHT = 910;

/**
 * The center faceoff dot (middle of the Poke Ball). Not the image's center: the rink sits a little
 * above the middle of the art.
 */
export const CENTER_DOT: Vec2 = { x: RINK_WIDTH / 2, y: 443 };

/** Inside edge of the boards, measured from the background image. */
export const RINK_ICE: RoundedRect = {
  left: 44,
  top: 115,
  right: 1684,
  bottom: 768,
  cornerRadius: 180,
};

/** Net frames, from the back of the net to the goal line. Skaters treat these as solid. */
export const RINK_NETS: Rect[] = [
  { left: 160, top: 378, right: 218, bottom: 506 },
  { left: RINK_WIDTH - 218, top: 378, right: RINK_WIDTH - 160, bottom: 506 },
];

const NET_WALL_THICKNESS = 6;

/**
 * The back and side walls of each net, leaving the front (goal line side, facing center ice)
 * open so the puck can go in.
 */
export const RINK_NET_WALLS: Rect[] = RINK_NETS.flatMap((net) => {
  const opensRight = (net.left + net.right) / 2 < RINK_WIDTH / 2;
  const back = opensRight
    ? { left: net.left, right: net.left + NET_WALL_THICKNESS }
    : { left: net.right - NET_WALL_THICKNESS, right: net.right };

  return [
    { ...back, top: net.top, bottom: net.bottom },
    { left: net.left, right: net.right, top: net.top, bottom: net.top + NET_WALL_THICKNESS },
    { left: net.left, right: net.right, top: net.bottom - NET_WALL_THICKNESS, bottom: net.bottom },
  ];
});

/** Center of each net's open front (on the goal line), in `RINK_NETS` order: where shots aim and goalies guard. */
export const GOAL_MOUTHS: Vec2[] = RINK_NETS.map((net) => {
  const opensRight = (net.left + net.right) / 2 < RINK_WIDTH / 2;

  return { x: opensRight ? net.right : net.left, y: (net.top + net.bottom) / 2 };
});

/** Which goal each team defends: the player's team starts on the left, so defends the left net. */
export const DEFENDED_GOAL: Record<Team, Vec2> = {
  player: GOAL_MOUTHS[0],
  opponent: GOAL_MOUTHS[1],
};

export const BOARD_RESTITUTION = 0.35;
export const NET_RESTITUTION = 0.2;

/** Rink markings measured from the background image (left half; the right half mirrors it). */
const END_ZONE_DOT_X = 400;
const END_ZONE_UPPER_DOT_Y = 270;
const END_ZONE_LOWER_DOT_Y = 624;
const NEUTRAL_ZONE_DOT_X = 706;
const NEUTRAL_ZONE_UPPER_DOT_Y = 263;
const NEUTRAL_ZONE_LOWER_DOT_Y = 621;
/** How far the goal crease reaches out from the goal line (px). */
export const CREASE_DEPTH = 67;

/** Mirrors a left-half point onto the right half of the rink. */
function mirror(point: Vec2): Vec2 {
  return { x: RINK_WIDTH - point.x, y: point.y };
}

const LEFT_FACEOFF_DOTS = {
  /** The two dots inside each end zone. */
  endZone: [
    { x: END_ZONE_DOT_X, y: END_ZONE_UPPER_DOT_Y },
    { x: END_ZONE_DOT_X, y: END_ZONE_LOWER_DOT_Y },
  ],
  /** The two dots just outside each blue line, in the neutral zone. */
  neutralZone: [
    { x: NEUTRAL_ZONE_DOT_X, y: NEUTRAL_ZONE_UPPER_DOT_Y },
    { x: NEUTRAL_ZONE_DOT_X, y: NEUTRAL_ZONE_LOWER_DOT_Y },
  ],
};

/** Faceoff dots on each team's defending half, upper dot first. */
export const FACEOFF_DOTS: Record<Team, { endZone: Vec2[]; neutralZone: Vec2[] }> = {
  player: LEFT_FACEOFF_DOTS,
  opponent: {
    endZone: LEFT_FACEOFF_DOTS.endZone.map(mirror),
    neutralZone: LEFT_FACEOFF_DOTS.neutralZone.map(mirror),
  },
};

/**
 * Every faceoff dot by name. Left and right are screen halves (the player's team defends the
 * left), upper and lower are screen top and bottom.
 */
export type FaceoffDot =
  | 'center'
  | 'leftEndUpper'
  | 'leftEndLower'
  | 'leftNeutralUpper'
  | 'leftNeutralLower'
  | 'rightNeutralUpper'
  | 'rightNeutralLower'
  | 'rightEndUpper'
  | 'rightEndLower';

export const FACEOFF_DOT_POSITIONS: Record<FaceoffDot, Vec2> = {
  center: CENTER_DOT,
  leftEndUpper: FACEOFF_DOTS.player.endZone[0],
  leftEndLower: FACEOFF_DOTS.player.endZone[1],
  leftNeutralUpper: FACEOFF_DOTS.player.neutralZone[0],
  leftNeutralLower: FACEOFF_DOTS.player.neutralZone[1],
  rightNeutralUpper: FACEOFF_DOTS.opponent.neutralZone[0],
  rightNeutralLower: FACEOFF_DOTS.opponent.neutralZone[1],
  rightEndUpper: FACEOFF_DOTS.opponent.endZone[0],
  rightEndLower: FACEOFF_DOTS.opponent.endZone[1],
};

/** The faceoff dot closest to `point`, e.g. where the puck was when the whistle went. */
export function getNearestFaceoffDot(point: Vec2): FaceoffDot {
  const distanceTo = (dot: FaceoffDot) =>
    Math.hypot(FACEOFF_DOT_POSITIONS[dot].x - point.x, FACEOFF_DOT_POSITIONS[dot].y - point.y);

  return (Object.keys(FACEOFF_DOT_POSITIONS) as FaceoffDot[]).reduce((best, dot) =>
    distanceTo(dot) < distanceTo(best) ? dot : best,
  );
}

/** Radius of the center faceoff circle, to the outside of its line (px). */
export const CENTER_CIRCLE_RADIUS = 118;
