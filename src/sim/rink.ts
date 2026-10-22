import type { Rect, RoundedRect } from './geometry';

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

/** Solid net frames, from the back of the net to the goal line. */
export const RINK_NETS: Rect[] = [
  { left: 186, top: 390, right: 246, bottom: 536 },
  { left: 1424, top: 390, right: 1486, bottom: 536 },
];

export const BOARD_RESTITUTION = 0.35;
export const NET_RESTITUTION = 0.2;
