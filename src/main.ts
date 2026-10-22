import Phaser from 'phaser';
import { HockeyScene } from './scenes/HockeyScene';
import { RINK_HEIGHT, RINK_WIDTH } from './sim/rink';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: RINK_WIDTH,
  height: RINK_HEIGHT,
  backgroundColor: '#0b1220',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [HockeyScene],
});
