import Phaser from 'phaser';
import {
  createPokemonAnimations,
  getDirectionFromVector,
  getPokemonAnimationKey,
  getPokemonTextureKey,
  loadPokemonModel,
  type PokemonDirection,
} from '../pokemon/pokemonSprites';
import { Skater } from '../sim/Skater';
import { RINK_BACKGROUND_KEY, RINK_BACKGROUND_PATH, RINK_HEIGHT, RINK_ICE, RINK_NETS, RINK_WIDTH } from '../sim/rink';

const PLAYER_MODEL = 'Garchomp';
const SPRITE_SCALE = 1.7;
/** Moving slower than this (px/s) plays the idle animation. */
const WALK_ANIMATION_MIN_SPEED = 25;

export class HockeyScene extends Phaser.Scene {
  private skater!: Skater;
  private sprite!: Phaser.GameObjects.Sprite;
  private moveKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private boundsDebug!: Phaser.GameObjects.Graphics;
  private facing: PokemonDirection = 2;

  constructor() {
    super('HockeyScene');
  }

  preload(): void {
    this.load.image(RINK_BACKGROUND_KEY, RINK_BACKGROUND_PATH);
    loadPokemonModel(this, PLAYER_MODEL);
  }

  create(): void {
    this.add.image(0, 0, RINK_BACKGROUND_KEY).setOrigin(0, 0);
    this.boundsDebug = this.drawBounds();

    createPokemonAnimations(this, PLAYER_MODEL);
    this.skater = new Skater({ x: RINK_WIDTH / 2, y: RINK_HEIGHT / 2 });
    this.sprite = this.add.sprite(this.skater.position.x, this.skater.position.y, getPokemonTextureKey(PLAYER_MODEL));
    this.sprite.setScale(SPRITE_SCALE);

    const keyboard = this.input.keyboard!;
    this.moveKeys = keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as typeof this.moveKeys;
    keyboard.on('keydown-B', () => this.boundsDebug.setVisible(!this.boundsDebug.visible));

    this.add
      .text(16, RINK_HEIGHT - 16, 'WASD: skate   B: toggle boundaries', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0, 1);
  }

  update(_time: number, deltaMs: number): void {
    const input = {
      x: Number(this.moveKeys.right.isDown) - Number(this.moveKeys.left.isDown),
      y: Number(this.moveKeys.down.isDown) - Number(this.moveKeys.up.isDown),
    };

    // Clamp long frames (tab switches) so the skater can't tunnel through the boards.
    this.skater.update(input, Math.min(deltaMs, 50) / 1000);

    if (input.x !== 0 || input.y !== 0) {
      this.facing = getDirectionFromVector(input.x, input.y);
    }

    const state = this.skater.speed > WALK_ANIMATION_MIN_SPEED ? 'Walk' : 'Idle';
    this.sprite.play(getPokemonAnimationKey(PLAYER_MODEL, state, this.facing), true);
    this.sprite.setPosition(this.skater.position.x, this.skater.position.y);
  }

  private drawBounds(): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();
    graphics.lineStyle(3, 0xffd400, 0.9);
    graphics.strokeRoundedRect(
      RINK_ICE.left,
      RINK_ICE.top,
      RINK_ICE.right - RINK_ICE.left,
      RINK_ICE.bottom - RINK_ICE.top,
      RINK_ICE.cornerRadius,
    );

    graphics.lineStyle(3, 0xff00ff, 0.9);
    RINK_NETS.forEach((net) => graphics.strokeRect(net.left, net.top, net.right - net.left, net.bottom - net.top));

    return graphics;
  }
}
