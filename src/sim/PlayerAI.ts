import type { SkaterControls } from './HockeyEngine';
import type { Puck } from './Puck';
import type { Skater } from './Skater';

/** Controls for a skater that does nothing: no movement, no stick actions. */
export function idleControls(skater: Skater): SkaterControls {
  return {
    move: { scheme: 'directional', direction: { x: 0, y: 0 } },
    aim: { x: skater.position.x + skater.facing.x, y: skater.position.y + skater.facing.y },
    shoot: false,
    pass: false,
  };
}

/**
 * Skates straight at the puck while facing it. Once it has the puck it stops, until it gets
 * behaviour for what to do with it.
 */
export function chasePuckControls(skater: Skater, puck: Puck): SkaterControls {
  if (puck.carrier === skater) {
    return idleControls(skater);
  }

  return {
    move: {
      scheme: 'mouseFacing',
      direction: { x: puck.position.x - skater.position.x, y: puck.position.y - skater.position.y },
    },
    aim: { ...puck.position },
    shoot: false,
    pass: false,
  };
}
