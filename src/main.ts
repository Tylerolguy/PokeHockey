import Phaser from 'phaser';
import { HockeyScene } from './scenes/HockeyScene';
import { PauseScene } from './scenes/PauseScene';
import { RINK_HEIGHT, RINK_WIDTH } from './sim/rink';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: RINK_WIDTH,
  height: RINK_HEIGHT,
  backgroundColor: '#0b1220',
  pixelArt: true,
  // Right-click is a game control (pass), so don't open the browser's context menu.
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Only the first scene starts on its own; the pause menu is launched over it.
  scene: [HockeyScene, PauseScene],
});

// Handle for poking at the running game from the browser console during development.
if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
