import Phaser from 'phaser';
import {
  createPokemonAnimations,
  getDirectionFromVector,
  getPokemonAnimationKey,
  getPokemonTextureKey,
  loadPokemonModel,
} from '../pokemon/pokemonSprites';
import { HockeyEngine, type MovementControls, type SkaterControls } from '../sim/HockeyEngine';
import { clamp, lerpVec, type CircleBody, type Vec2 } from '../sim/geometry';
import { PUCK_RADIUS } from '../sim/Puck';
import { RINK_BACKGROUND_KEY, RINK_BACKGROUND_PATH, RINK_HEIGHT, RINK_ICE, RINK_NET_WALLS, RINK_NETS } from '../sim/rink';

const PLAYER_MODEL = 'Garchomp';
const SPRITE_SCALE = 1.7;
/** Moving slower than this (px/s) plays the idle animation. */
const WALK_ANIMATION_MIN_SPEED = 25;
const AIM_LINE_LENGTH = 70;
const AIM_LINE_CHARGED_LENGTH = 150;
const CHARGE_BAR_WIDTH = 48;
const SHOT_ARC_EDGE_LENGTH = 110;
const FACING_MARKER_DISTANCE = 30;

type MovementScheme = MovementControls['scheme'];
const MOVEMENT_SCHEMES: MovementScheme[] = ['mouseFacing', 'directional', 'tank'];
const MOVEMENT_SCHEME_HELP: Record<MovementScheme, string> = {
  mouseFacing: 'WASD: skate (facing the mouse)',
  directional: 'WASD: skate up/left/down/right',
  tank: 'W/S: skate forward/backward   A/D: turn',
};

export class HockeyScene extends Phaser.Scene {
  private engine!: HockeyEngine;
  private sprite!: Phaser.GameObjects.Sprite;
  private puckSprite!: Phaser.GameObjects.Graphics;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private moveKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private boundsDebug!: Phaser.GameObjects.Graphics;
  private facingMarker!: Phaser.GameObjects.Graphics;
  private helpText!: Phaser.GameObjects.Text;
  private movementScheme: MovementScheme = MOVEMENT_SCHEMES[0];

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
    this.engine = new HockeyEngine();
    this.facingMarker = this.drawFacingMarker();
    this.puckSprite = this.drawPuck();
    this.sprite = this.add.sprite(0, 0, getPokemonTextureKey(PLAYER_MODEL));
    this.sprite.setScale(SPRITE_SCALE);
    // Above the skater: aiming back across them must still show the line.
    this.aimGraphics = this.add.graphics();
    this.syncSprites();

    const keyboard = this.input.keyboard!;
    this.moveKeys = keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as typeof this.moveKeys;
    keyboard.on('keydown-B', () => this.boundsDebug.setVisible(!this.boundsDebug.visible));
    keyboard.on('keydown-R', () => this.engine.resetPuck());
    keyboard.on('keydown-M', () => {
      const next = (MOVEMENT_SCHEMES.indexOf(this.movementScheme) + 1) % MOVEMENT_SCHEMES.length;
      this.movementScheme = MOVEMENT_SCHEMES[next];
      this.updateHelpText();
    });

    this.helpText = this.add
      .text(16, RINK_HEIGHT - 16, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0, 1);
    this.updateHelpText();
  }

  private updateHelpText(): void {
    this.helpText.setText(
      `${MOVEMENT_SCHEME_HELP[this.movementScheme]}   M: switch controls (${this.movementScheme})   ` +
        'Mouse: aim   Left click: shoot (hold to charge)   Right click: pass   R: reset puck   B: boundaries',
    );
  }

  private readMovement(): MovementControls {
    const keys = this.moveKeys;
    const horizontal = Number(keys.right.isDown) - Number(keys.left.isDown);
    const vertical = Number(keys.down.isDown) - Number(keys.up.isDown);

    switch (this.movementScheme) {
      case 'tank':
        return { scheme: 'tank', throttle: -vertical, turn: horizontal };
      case 'directional':
        return { scheme: 'directional', direction: { x: horizontal, y: vertical } };
      case 'mouseFacing':
        return { scheme: 'mouseFacing', direction: { x: horizontal, y: vertical } };
    }
  }

  update(_time: number, deltaMs: number): void {
    const pointer = this.input.activePointer;
    const controls: SkaterControls = {
      move: this.readMovement(),
      aim: { x: pointer.worldX, y: pointer.worldY },
      shoot: pointer.leftButtonDown(),
      pass: pointer.rightButtonDown(),
    };

    this.engine.update(controls, deltaMs / 1000);
    this.drawAim(controls.aim);

    const skater = this.engine.controlledSkater;
    const facing = getDirectionFromVector(skater.facing.x, skater.facing.y);
    const state = skater.speed > WALK_ANIMATION_MIN_SPEED ? 'Walk' : 'Idle';
    this.sprite.play(getPokemonAnimationKey(PLAYER_MODEL, state, facing), true);
    this.syncSprites();
  }

  private syncSprites(): void {
    const { controlledSkater: skater, puck } = this.engine;
    const skaterPosition = this.getDrawPosition(skater);
    const puckPosition = this.getDrawPosition(puck);
    this.sprite.setPosition(skaterPosition.x, skaterPosition.y);
    this.puckSprite.setPosition(puckPosition.x, puckPosition.y);
    this.facingMarker.setPosition(skaterPosition.x, skaterPosition.y);
    this.facingMarker.setRotation(Math.atan2(skater.facing.y, skater.facing.x));
  }

  /**
   * Where to draw a body this frame: between its last two simulation steps, so motion stays
   * smooth when the screen refreshes at a different rate than the 120 Hz simulation.
   */
  private getDrawPosition(body: CircleBody): Vec2 {
    return lerpVec(body.previousPosition, body.position, this.engine.interpolationAlpha);
  }

  /** Small arrow on the ice showing the exact facing, which the 8-direction sprite can only approximate. */
  private drawFacingMarker(): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff, 0.75);
    graphics.fillTriangle(
      FACING_MARKER_DISTANCE + 8,
      0,
      FACING_MARKER_DISTANCE,
      -5,
      FACING_MARKER_DISTANCE,
      5,
    );

    return graphics;
  }

  /**
   * Aim line from the puck along the shot's path (limited to the shooting arcs, if any) while
   * carrying, plus the arcs' edges and a charge meter while winding up.
   */
  private drawAim(aim: { x: number; y: number }): void {
    const { controlledSkater: skater, puck } = this.engine;
    this.aimGraphics.clear();

    if (puck.carrier !== skater) {
      return;
    }

    const direction = this.engine.getShotDirection(skater, aim);
    const charge = skater.shotCharge === undefined ? undefined : clamp(skater.shotCharge / skater.tuning.shotChargeSeconds, 0, 1);
    const length = AIM_LINE_LENGTH + (AIM_LINE_CHARGED_LENGTH - AIM_LINE_LENGTH) * (charge ?? 0);
    const start = this.getDrawPosition(puck);

    const shotArcs = skater.tuning.shotArcs;

    if (charge !== undefined && shotArcs) {
      const facingAngle = Math.atan2(skater.facing.y, skater.facing.x);
      this.aimGraphics.lineStyle(2, 0xffa424, 0.35);

      for (const arc of shotArcs) {
        for (const side of [-1, 1]) {
          const edgeAngle = facingAngle + arc.offset + side * arc.halfAngle;
          this.aimGraphics.lineBetween(
            start.x,
            start.y,
            start.x + Math.cos(edgeAngle) * SHOT_ARC_EDGE_LENGTH,
            start.y + Math.sin(edgeAngle) * SHOT_ARC_EDGE_LENGTH,
          );
        }
      }
    }

    this.aimGraphics.lineStyle(3, charge === undefined ? 0xffffff : 0xffa424, charge === undefined ? 0.6 : 0.95);
    this.aimGraphics.lineBetween(start.x, start.y, start.x + direction.x * length, start.y + direction.y * length);

    if (charge !== undefined) {
      const skaterPosition = this.getDrawPosition(skater);
      const barX = skaterPosition.x - CHARGE_BAR_WIDTH / 2;
      const barY = skaterPosition.y - 58;
      this.aimGraphics.fillStyle(0x000000, 0.6);
      this.aimGraphics.fillRect(barX - 2, barY - 2, CHARGE_BAR_WIDTH + 4, 10);
      this.aimGraphics.fillStyle(charge >= 1 ? 0xff4b2b : 0xffa424, 1);
      this.aimGraphics.fillRect(barX, barY, CHARGE_BAR_WIDTH * charge, 6);
    }
  }

  private drawPuck(): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x000000, 0.25);
    graphics.fillEllipse(2, 4, PUCK_RADIUS * 2.2, PUCK_RADIUS * 1.4);
    graphics.fillStyle(0x15171c, 1);
    graphics.fillCircle(0, 0, PUCK_RADIUS);
    graphics.lineStyle(2, 0x3a3f4a, 1);
    graphics.strokeCircle(0, 0, PUCK_RADIUS - 2);

    return graphics;
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

    // Outline: what stops skaters. Filled walls: what stops the puck (front left open).
    graphics.lineStyle(2, 0xff00ff, 0.6);
    RINK_NETS.forEach((net) => graphics.strokeRect(net.left, net.top, net.right - net.left, net.bottom - net.top));
    graphics.fillStyle(0xff00ff, 0.9);
    RINK_NET_WALLS.forEach((wall) => graphics.fillRect(wall.left, wall.top, wall.right - wall.left, wall.bottom - wall.top));

    return graphics;
  }
}
