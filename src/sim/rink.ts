import type { Rect, RoundedRect, Vec2 } from './geometry';
import type { Team } from './Skater';

export const RINK_BACKGROUND_KEY = 'rink-background';
export const RINK_BACKGROUND_PATH = 'assets/backgrounds/retro-hockey-rink-pokeball-balanced.png';

/** Pixel size of the background image; the world uses the same coordinates. */
export const RINK_WIDTH = 1672;
export const RINK_HEIGHT = 941;

/** Inside edge of the boards, measured from the background image. */
export const RINK_ICE: RoundedRect = {
  left: 46,
  top: 104,
  right: 1626,
  bottom: 828,
  cornerRadius: 205,
};

/** Net frames, from the back of the net to the goal line. Skaters treat these as solid. */
export const RINK_NETS: Rect[] = [
  { left: 186, top: 390, right: 246, bottom: 536 },
  { left: 1424, top: 390, right: 1486, bottom: 536 },
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
const END_ZONE_DOT_X = 440;
const NEUTRAL_ZONE_DOT_X = 648;
const UPPER_DOT_Y = 270;
const LOWER_DOT_Y = 669;
/** How far the goal crease reaches out from the goal line (px). */
export const CREASE_DEPTH = 74;

/** Mirrors a left-half point onto the right half of the rink. */
function mirror(point: Vec2): Vec2 {
  return { x: RINK_WIDTH - point.x, y: point.y };
}

const LEFT_FACEOFF_DOTS = {
  /** The two dots inside each end zone. */
  endZone: [
    { x: END_ZONE_DOT_X, y: UPPER_DOT_Y },
    { x: END_ZONE_DOT_X, y: LOWER_DOT_Y },
  ],
  /** The two dots just outside each blue line, in the neutral zone. */
  neutralZone: [
    { x: NEUTRAL_ZONE_DOT_X, y: UPPER_DOT_Y },
    { x: NEUTRAL_ZONE_DOT_X, y: LOWER_DOT_Y },
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
