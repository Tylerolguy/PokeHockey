import Phaser from 'phaser';
import {
  createPokemonAnimations,
  getDirectionFromVector,
  getPokemonAnimationKey,
  getPokemonTextureKey,
  loadPokemonModel,
} from '../pokemon/pokemonSprites';
import { POKEMON_SPECIES, type PokemonSpecies } from '../data/pokemonSpecies';
import { HockeyEngine, type MovementControls, type SkaterControls } from '../sim/HockeyEngine';
import { Skater, type Team } from '../sim/Skater';
import { clamp, lerpVec, type CircleBody, type Vec2 } from '../sim/geometry';
import { PUCK_RADIUS } from '../sim/Puck';
import {
  RINK_BACKGROUND_KEY,
  RINK_BACKGROUND_PATH,
  RINK_HEIGHT,
  RINK_ICE,
  RINK_NET_WALLS,
  RINK_NETS,
  RINK_WIDTH,
} from '../sim/rink';

/**
 * Who starts on the ice and for which team; the first is the one the player controls. Team lives
 * here rather than on the species so any species can play on either side. Opponents only move
 * while the T testing toggle is on.
 */
const LINEUP: { species: PokemonSpecies; team: Team; x: number; y: number; facingX: number }[] = [
  { species: POKEMON_SPECIES.garchomp, team: 'player', x: RINK_WIDTH / 2 - 140, y: RINK_HEIGHT / 2, facingX: 1 },
  { species: POKEMON_SPECIES.flygon, team: 'opponent', x: RINK_WIDTH / 2 + 140, y: RINK_HEIGHT / 2, facingX: -1 },
  { species: POKEMON_SPECIES.trapinch, team: 'opponent', x: RINK_WIDTH / 2 + 300, y: RINK_HEIGHT / 2 - 160, facingX: -1 },
  { species: POKEMON_SPECIES.vibrava, team: 'opponent', x: RINK_WIDTH / 2 + 300, y: RINK_HEIGHT / 2 + 160, facingX: -1 },
];
const SPRITE_SCALE = 1.7;
/** Draw order: ice markings, then skaters and puck sorted by screen y, then aim and HUD on top. */
const RING_DEPTH = 1;
const ON_ICE_BASE_DEPTH = 100;
const AIM_DEPTH = 2000;
const HUD_DEPTH = 2001;
/** Moving slower than this (px/s) plays the idle animation. */
const WALK_ANIMATION_MIN_SPEED = 25;
const AIM_LINE_LENGTH = 70;
const AIM_LINE_CHARGED_LENGTH = 150;
const CHARGE_BAR_WIDTH = 48;
const SHOT_ARC_EDGE_LENGTH = 110;
/** Ring on the ice around each skater in their team color, with a pointer on its edge for the exact facing. */
const SKATER_RING_RADIUS = 28;
/** How far the pointer's tip reaches past the ring; its sides meet the ring tangentially. */
const SKATER_RING_POINTER_LENGTH = 18;
const SKATER_RING_THICKNESS = 5;
const SKATER_RING_ALPHA = 0.9;
const TEAM_COLORS: Record<Team, number> = {
  player: 0x3d8bff,
  opponent: 0xff3d4f,
};

type MovementScheme = MovementControls['scheme'];
const MOVEMENT_SCHEMES: MovementScheme[] = ['mouseFacing', 'directional', 'tank'];
const MOVEMENT_SCHEME_HELP: Record<MovementScheme, string> = {
  mouseFacing: 'WASD: skate (facing the mouse)',
  directional: 'WASD: skate up/left/down/right',
  tank: 'W/S: skate forward/backward   A/D: turn',
};

export class HockeyScene extends Phaser.Scene {
  private engine!: HockeyEngine;
  /** Each skater's sprite and the sprite sheet it uses. */
  private skaterSprites = new Map<
    Skater,
    { sprite: Phaser.GameObjects.Sprite; ring: Phaser.GameObjects.Graphics; model: string }
  >();
  private puckSprite!: Phaser.GameObjects.Graphics;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private moveKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private boundsDebug!: Phaser.GameObjects.Graphics;
  private helpText!: Phaser.GameObjects.Text;
  private movementScheme: MovementScheme = MOVEMENT_SCHEMES[0];

  constructor() {
    super('HockeyScene');
  }

  preload(): void {
    this.load.image(RINK_BACKGROUND_KEY, RINK_BACKGROUND_PATH);
    new Set(LINEUP.map(({ species }) => species.model)).forEach((model) => loadPokemonModel(this, model));
  }

  create(): void {
    this.add.image(0, 0, RINK_BACKGROUND_KEY).setOrigin(0, 0);
    this.boundsDebug = this.drawBounds();

    const skaters = LINEUP.map(({ species, team, x, y, facingX }) => {
      const skater = new Skater({ x, y }, team, species.tuning);
      skater.setFacing(facingX, 0);
      createPokemonAnimations(this, species.model);
      const sprite = this.add.sprite(x, y, getPokemonTextureKey(species.model)).setScale(SPRITE_SCALE);
      const ring = this.drawSkaterRing(TEAM_COLORS[team], team === 'player').setDepth(RING_DEPTH);
      this.skaterSprites.set(skater, { sprite, ring, model: species.model });

      return skater;
    });
    this.engine = new HockeyEngine(skaters);
    this.puckSprite = this.drawPuck();
    // Above the skaters: aiming back across them must still show the line.
    this.aimGraphics = this.add.graphics().setDepth(AIM_DEPTH);
    this.syncSprites();

    const keyboard = this.input.keyboard!;
    this.moveKeys = keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as typeof this.moveKeys;
    keyboard.on('keydown-B', () => this.boundsDebug.setVisible(!this.boundsDebug.visible));
    keyboard.on('keydown-R', () => this.engine.resetPuck());
    // Temporary testing toggle.
    keyboard.on('keydown-T', () => {
      this.engine.opponentsChasePuck = !this.engine.opponentsChasePuck;
      this.updateHelpText();
    });
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
      .setOrigin(0, 1)
      .setDepth(HUD_DEPTH);
    this.updateHelpText();
  }

  private updateHelpText(): void {
    this.helpText.setText(
      `${MOVEMENT_SCHEME_HELP[this.movementScheme]}   M: switch controls (${this.movementScheme})   ` +
        'Mouse: aim   Left click: shoot (hold to charge)   Right click: pass   R: reset puck   ' +
        `T: enemy chases puck (${this.engine.opponentsChasePuck ? 'on' : 'off'})   B: boundaries`,
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
    this.syncSprites();
  }

  private syncSprites(): void {
    const { puck } = this.engine;

    this.skaterSprites.forEach(({ sprite, ring, model }, skater) => {
      const position = this.getDrawPosition(skater);
      const facing = getDirectionFromVector(skater.facing.x, skater.facing.y);
      const state = skater.speed > WALK_ANIMATION_MIN_SPEED ? 'Walk' : 'Idle';
      sprite.play(getPokemonAnimationKey(model, state, facing), true);
      sprite.setPosition(position.x, position.y).setDepth(ON_ICE_BASE_DEPTH + position.y);
      ring.setPosition(position.x, position.y).setRotation(Math.atan2(skater.facing.y, skater.facing.x));
    });

    const puckPosition = this.getDrawPosition(puck);
    this.puckSprite.setPosition(puckPosition.x, puckPosition.y).setDepth(ON_ICE_BASE_DEPTH + puckPosition.y);
  }

  /**
   * Where to draw a body this frame: between its last two simulation steps, so motion stays
   * smooth when the screen refreshes at a different rate than the 120 Hz simulation.
   */
  private getDrawPosition(body: CircleBody): Vec2 {
    return lerpVec(body.previousPosition, body.position, this.engine.interpolationAlpha);
  }

  /**
   * Team-colored ring marking a skater, drawn pointing along +x and rotated to the facing.
   * The optional pointer shows the exact facing, which the 8-direction sprite can only approximate.
   */
  private drawSkaterRing(color: number, withPointer: boolean): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 0.18);
    graphics.fillCircle(0, 0, SKATER_RING_RADIUS);
    graphics.lineStyle(SKATER_RING_THICKNESS, color, SKATER_RING_ALPHA);
    graphics.strokeCircle(0, 0, SKATER_RING_RADIUS);

    if (!withPointer) {
      return graphics;
    }

    // Pointer: from the tip, two lines tangent to the ring's outer edge, closed along that edge,
    // so it flows out of the ring like a teardrop instead of sitting on top of it.
    const outerRadius = SKATER_RING_RADIUS + SKATER_RING_THICKNESS / 2;
    const tipDistance = SKATER_RING_RADIUS + SKATER_RING_POINTER_LENGTH;
    const tangentAngle = Math.acos(outerRadius / tipDistance);
    const arcSteps = 12;
    const points = [new Phaser.Math.Vector2(tipDistance, 0)];

    for (let i = 0; i <= arcSteps; i++) {
      const angle = -tangentAngle + (2 * tangentAngle * i) / arcSteps;
      points.push(new Phaser.Math.Vector2(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius));
    }

    graphics.fillStyle(color, SKATER_RING_ALPHA);
    graphics.fillPoints(points, true);

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
