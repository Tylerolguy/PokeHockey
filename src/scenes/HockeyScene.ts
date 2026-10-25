import Phaser from 'phaser';
import {
  createPokemonAnimations,
  getDirectionFromVector,
  getPokemonAnimationKey,
  getPokemonTextureKey,
  loadPokemonModel,
} from '../pokemon/pokemonSprites';
import { POKEMON_SPECIES, type PokemonSpecies } from '../data/pokemonSpecies';
import {
  HockeyEngine,
  type MatchPhase,
  type MovementControls,
  type SkaterControls,
  type SwitchMode,
} from '../sim/HockeyEngine';
import { assignStartingSpots, OPENING_FACEOFF_TEAM } from '../sim/formation';
import { Skater, type PlayingPosition, type Team } from '../sim/Skater';
import { clamp, lerpVec, type CircleBody, type Vec2 } from '../sim/geometry';
import { getShotPower } from '../sim/shotCharge';
import { PUCK_RADIUS } from '../sim/Puck';
import { RINK_BACKGROUND_KEY, RINK_BACKGROUND_PATH, RINK_HEIGHT, RINK_WIDTH } from '../sim/rink';

/**
 * Who plays, for which team, and at which playing position; the first is the one the player
 * controls. Each team needs exactly one center, left/right wing, left/right defense and goalie;
 * where they start comes from their position (see formation.ts). Team and position live here rather than on the species so any
 * species can play anywhere. Teammates don't move yet; opponents only move while T is on.
 */
const LINEUP: {
  species: PokemonSpecies;
  team: Team;
  playingPosition: PlayingPosition;
}[] = [
  { species: POKEMON_SPECIES.garchomp, team: 'player', playingPosition: 'center' },
  { species: POKEMON_SPECIES.druddigon, team: 'player', playingPosition: 'leftWing' },
  { species: POKEMON_SPECIES.gible, team: 'player', playingPosition: 'rightWing' },
  { species: POKEMON_SPECIES.gabite, team: 'player', playingPosition: 'leftDefense' },
  { species: POKEMON_SPECIES.golett, team: 'player', playingPosition: 'rightDefense' },
  { species: POKEMON_SPECIES.golurk, team: 'player', playingPosition: 'goalie' },
  { species: POKEMON_SPECIES.flygon, team: 'opponent', playingPosition: 'center' },
  { species: POKEMON_SPECIES.phantump, team: 'opponent', playingPosition: 'leftWing' },
  { species: POKEMON_SPECIES.tauros, team: 'opponent', playingPosition: 'rightWing' },
  { species: POKEMON_SPECIES.trapinch, team: 'opponent', playingPosition: 'leftDefense' },
  { species: POKEMON_SPECIES.vibrava, team: 'opponent', playingPosition: 'rightDefense' },
  { species: POKEMON_SPECIES.trevenant, team: 'opponent', playingPosition: 'goalie' },
];
const SPRITE_SCALE = 1.7;
/** Draw order: ice markings, then skaters and puck sorted by screen y, then aim and HUD on top. */
const RING_DEPTH = 1;
const ON_ICE_BASE_DEPTH = 100;
const AIM_DEPTH = 2000;
const HUD_DEPTH = 2001;
/** Scoreboard at the top center: one colored box per team. */
const SCOREBOARD_Y = 14;
const SCORE_BOX_WIDTH = 150;
const SCORE_BOX_HEIGHT = 46;
const SCORE_BOX_GAP = 8;
const TEAM_NAMES: Record<Team, string> = { player: 'YOU', opponent: 'OPP' };
/** Countdown numbers sit above the center dot so the respawned puck stays visible. */
const COUNTDOWN_Y = RINK_HEIGHT / 2 - 150;
/** How long "GO!" shows after the countdown (ms). */
const GO_FLASH_MS = 700;
/** How long the puck takes to pop in when it respawns (ms). */
const PUCK_RESPAWN_POP_MS = 300;
/** Moving slower than this (px/s) plays the idle animation. */
const WALK_ANIMATION_MIN_SPEED = 25;
const AIM_LINE_LENGTH = 70;
const AIM_LINE_CHARGED_LENGTH = 150;
/** Shot meter above the carrier: spans the whole charge up to the whiff point. */
const CHARGE_BAR_WIDTH = 80;
const CHARGE_BAR_HEIGHT = 8;
/** The meter is drawn as this many colored slices, each showing the power you'd get there. */
const CHARGE_BAR_SLICES = 40;
/** How bright the part of the meter not charged through yet is (0..1). */
const CHARGE_BAR_AHEAD_ALPHA = 0.45;
/** Shot power (0..1) to color: red when weak, through orange and yellow, to green at full power. */
const POWER_COLOR_STOPS: { power: number; color: number }[] = [
  { power: 0.2, color: 0xff3b2b },
  { power: 0.5, color: 0xffa424 },
  { power: 0.8, color: 0xffe14d },
  { power: 0.9, color: 0xb6f04a },
  { power: 1, color: 0x3ddc6e },
];
const SHOT_ARC_EDGE_LENGTH = 110;
/**
 * Ring on the ice around each skater in their team color. The controlled skater's ring also gets
 * a pointer on its edge for the exact facing.
 */
const SKATER_RING_RADIUS = 28;
/** How far the pointer's tip reaches past the ring; its sides meet the ring tangentially. */
const SKATER_RING_POINTER_LENGTH = 18;
const SKATER_RING_THICKNESS = 5;
const SKATER_RING_ALPHA = 0.9;
const TEAM_COLORS: Record<Team, number> = {
  player: 0x3d8bff,
  opponent: 0xff3d4f,
};

/**
 * The camera is zoomed in so only part of the rink is on screen, and follows the controlled
 * skater. The HUD lives on a second, fixed camera so it doesn't zoom or scroll.
 */
const CAMERA_ZOOM = 1.6;
/** How quickly the camera catches up with the controlled skater (0..1 per frame). */
const CAMERA_FOLLOW_LERP = 0.12;
/**
 * Off-screen puck marker: a badge with a puck icon and an arrowhead pointing at the puck. How far
 * in from the screen edge it sits, the badge radius, and how far the arrow sticks out (px).
 */
const PUCK_INDICATOR_INSET = 48;
const PUCK_INDICATOR_RADIUS = 22;
const PUCK_INDICATOR_ARROW_LENGTH = 16;

type MovementScheme = MovementControls['scheme'];
const SWITCH_MODE_LABELS: Record<SwitchMode, string> = {
  nextInList: 'next in list',
  closestToAim: 'closest to mouse',
};
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
  /** Facing pointer that rides on the controlled skater's ring. */
  private controlPointer!: Phaser.GameObjects.Graphics;
  private moveKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private helpText!: Phaser.GameObjects.Text;
  private scoreTexts!: Record<Team, Phaser.GameObjects.Text>;
  private goalBanner!: Phaser.GameObjects.Text;
  /** Big 3-2-1 before play resumes after a goal, then "GO!". */
  private countdownText!: Phaser.GameObjects.Text;
  private lastPhase: MatchPhase = 'play';
  private lastPuckRespawns = 0;
  private goFlashUntil = 0;
  private movementScheme: MovementScheme = MOVEMENT_SCHEMES[0];
  /** Testing toggle (C) between the two ways Space picks who to switch to. */
  private switchMode: SwitchMode = 'closestToAim';
  /** Objects drawn on the fixed HUD camera instead of the zoomed, following rink camera. */
  private readonly hudObjects = new Set<Phaser.GameObjects.GameObject>();
  /** Arrow at the screen edge pointing to the puck when it's off screen. */
  private puckIndicator!: Phaser.GameObjects.Graphics;
  /** The sprite the rink camera is currently following. */
  private followedSprite?: Phaser.GameObjects.Sprite;

  constructor() {
    super('HockeyScene');
  }

  preload(): void {
    this.load.image(RINK_BACKGROUND_KEY, RINK_BACKGROUND_PATH);
    new Set(LINEUP.map(({ species }) => species.model)).forEach((model) => loadPokemonModel(this, model));
  }

  create(): void {
    this.add.image(0, 0, RINK_BACKGROUND_KEY).setOrigin(0, 0);

    const startingSpots = assignStartingSpots(LINEUP, OPENING_FACEOFF_TEAM);
    const skaters = LINEUP.map(({ species, team, playingPosition }, index) => {
      const { position, facing } = startingSpots[index];
      const skater = new Skater(position, team, playingPosition, species.tuning);
      skater.setFacing(facing.x, facing.y);
      createPokemonAnimations(this, species.model);
      const sprite = this.add.sprite(position.x, position.y, getPokemonTextureKey(species.model)).setScale(SPRITE_SCALE);
      const ring = this.drawSkaterRing(TEAM_COLORS[team]).setDepth(RING_DEPTH);
      this.skaterSprites.set(skater, { sprite, ring, model: species.model });

      return skater;
    });
    this.engine = new HockeyEngine(skaters);
    this.puckSprite = this.drawPuck();
    // Above the skaters: aiming back across them must still show the line.
    this.aimGraphics = this.add.graphics().setDepth(AIM_DEPTH);
    this.controlPointer = this.drawControlPointer(TEAM_COLORS.player).setDepth(RING_DEPTH);
    this.syncSprites();

    const keyboard = this.input.keyboard!;
    this.moveKeys = keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as typeof this.moveKeys;
    keyboard.on('keydown-R', () => this.engine.resetPuck());
    keyboard.addCapture('SPACE');
    keyboard.on('keydown-SPACE', () => {
      this.engine.switchControlledSkater(this.switchMode, this.getPointerWorldPosition());
    });
    keyboard.on('keydown-C', () => {
      this.switchMode = this.switchMode === 'nextInList' ? 'closestToAim' : 'nextInList';
      this.updateHelpText();
    });
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

    this.helpText = this.addToHud(
      this.add
        .text(16, RINK_HEIGHT - 16, '', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#ffffff',
          backgroundColor: '#00000088',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0, 1)
        .setDepth(HUD_DEPTH),
    );
    this.updateHelpText();
    this.createScoreboard();
    this.puckIndicator = this.addToHud(this.add.graphics().setDepth(HUD_DEPTH));
    this.setUpCameras();
  }

  /** Marks `object` as part of the HUD: drawn by the fixed HUD camera, not the rink camera. */
  private addToHud<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.hudObjects.add(object);

    return object;
  }

  /**
   * The main camera zooms into the rink and follows the controlled skater; a second camera with no
   * zoom or scroll draws only the HUD on top. Each camera ignores the other's objects.
   */
  private setUpCameras(): void {
    const rinkCamera = this.cameras.main.setBounds(0, 0, RINK_WIDTH, RINK_HEIGHT).setZoom(CAMERA_ZOOM);
    const hudCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);

    rinkCamera.ignore([...this.hudObjects]);
    hudCamera.ignore(this.children.list.filter((object) => !this.hudObjects.has(object)));
    this.followControlledSkater(true);
  }

  /** Points the rink camera at the controlled skater, re-targeting when control switches. */
  private followControlledSkater(snap = false): void {
    const sprite = this.skaterSprites.get(this.engine.controlledSkater)?.sprite;

    if (!sprite || sprite === this.followedSprite) {
      return;
    }

    this.followedSprite = sprite;
    this.cameras.main.startFollow(sprite, true, CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_LERP);

    if (snap) {
      this.cameras.main.centerOn(sprite.x, sprite.y);
    }
  }

  /** Where the mouse is on the rink, through the zoomed, scrolling camera (fresh every frame). */
  private getPointerWorldPosition(): Vec2 {
    const pointer = this.input.activePointer;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    return { x: point.x, y: point.y };
  }

  /**
   * When the puck is off screen, draws an arrow on the HUD at the screen edge pointing toward it,
   * with a puck icon so it reads as "puck this way".
   */
  private updatePuckIndicator(): void {
    const graphics = this.puckIndicator;
    graphics.clear();

    const camera = this.cameras.main;
    const puck = this.getDrawPosition(this.engine.puck);

    if (camera.worldView.contains(puck.x, puck.y)) {
      return;
    }

    const { width, height } = this.scale;
    const screenX = (puck.x - camera.worldView.x) * camera.zoom;
    const screenY = (puck.y - camera.worldView.y) * camera.zoom;
    const dx = screenX - width / 2;
    const dy = screenY - height / 2;
    // Slide along the line from screen center toward the puck until it meets the inset border.
    const reach = Math.min(
      dx !== 0 ? (width / 2 - PUCK_INDICATOR_INSET) / Math.abs(dx) : Infinity,
      dy !== 0 ? (height / 2 - PUCK_INDICATOR_INSET) / Math.abs(dy) : Infinity,
    );
    const x = width / 2 + dx * reach;
    const y = height / 2 + dy * reach;
    const angle = Math.atan2(dy, dx);
    const along = (distance: number, sideways = 0) => ({
      x: x + Math.cos(angle) * distance - Math.sin(angle) * sideways,
      y: y + Math.sin(angle) * distance + Math.cos(angle) * sideways,
    });
    const tip = along(PUCK_INDICATOR_RADIUS + PUCK_INDICATOR_ARROW_LENGTH);
    const baseLeft = along(PUCK_INDICATOR_RADIUS - 4, -PUCK_INDICATOR_RADIUS * 0.6);
    const baseRight = along(PUCK_INDICATOR_RADIUS - 4, PUCK_INDICATOR_RADIUS * 0.6);

    graphics.fillStyle(0xffffff, 0.95);
    graphics.fillTriangle(tip.x, tip.y, baseLeft.x, baseLeft.y, baseRight.x, baseRight.y);
    graphics.fillStyle(0x0b1220, 0.85);
    graphics.fillCircle(x, y, PUCK_INDICATOR_RADIUS);
    graphics.lineStyle(3, 0xffffff, 0.95);
    graphics.strokeCircle(x, y, PUCK_INDICATOR_RADIUS);
    graphics.fillStyle(0x15171c, 1);
    graphics.fillCircle(x, y, PUCK_RADIUS * 1.6);
    graphics.lineStyle(2, 0x5a6070, 1);
    graphics.strokeCircle(x, y, PUCK_RADIUS * 1.6 - 2);
  }

  private createScoreboard(): void {
    const centerX = RINK_WIDTH / 2;
    const boxes = this.addToHud(this.add.graphics().setDepth(HUD_DEPTH));
    const makeBox = (team: Team, left: number): Phaser.GameObjects.Text => {
      boxes.fillStyle(0x0b1220, 0.85);
      boxes.fillRoundedRect(left - 3, SCOREBOARD_Y - 3, SCORE_BOX_WIDTH + 6, SCORE_BOX_HEIGHT + 6, 10);
      boxes.fillStyle(TEAM_COLORS[team], 0.95);
      boxes.fillRoundedRect(left, SCOREBOARD_Y, SCORE_BOX_WIDTH, SCORE_BOX_HEIGHT, 8);

      return this.addToHud(
        this.add
          .text(left + SCORE_BOX_WIDTH / 2, SCOREBOARD_Y + SCORE_BOX_HEIGHT / 2, '', {
            fontFamily: 'monospace',
            fontSize: '26px',
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0.5)
          .setDepth(HUD_DEPTH),
      );
    };

    this.scoreTexts = {
      player: makeBox('player', centerX - SCORE_BOX_GAP / 2 - SCORE_BOX_WIDTH),
      opponent: makeBox('opponent', centerX + SCORE_BOX_GAP / 2),
    };
    this.goalBanner = this.addToHud(
      this.add
        .text(centerX, SCOREBOARD_Y + SCORE_BOX_HEIGHT + 14, 'GOAL!', {
          fontFamily: 'monospace',
          fontSize: '40px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#0b1220',
          strokeThickness: 6,
        })
        .setOrigin(0.5, 0)
        .setDepth(HUD_DEPTH)
        .setVisible(false),
    );
    this.countdownText = this.addToHud(
      this.add
        .text(centerX, COUNTDOWN_Y, '', {
          fontFamily: 'monospace',
          fontSize: '120px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#0b1220',
          strokeThickness: 10,
        })
        .setOrigin(0.5)
        .setDepth(HUD_DEPTH)
        .setVisible(false),
    );
    this.updateScoreboard();
  }

  private updateScoreboard(): void {
    const { score, goalScoredBy } = this.engine;
    this.scoreTexts.player.setText(`${TEAM_NAMES.player}  ${score.player}`);
    this.scoreTexts.opponent.setText(`${score.opponent}  ${TEAM_NAMES.opponent}`);
    this.goalBanner.setVisible(goalScoredBy !== undefined);

    if (goalScoredBy) {
      this.goalBanner.setColor(`#${TEAM_COLORS[goalScoredBy].toString(16).padStart(6, '0')}`);
    }

    this.updateCountdown();
    this.animatePuckRespawn();
  }

  /** 3-2-1 while play is frozen after a goal, then a short "GO!" once it resumes. */
  private updateCountdown(): void {
    const { phase } = this.engine;

    if (this.lastPhase === 'countdown' && phase === 'play') {
      this.goFlashUntil = this.time.now + GO_FLASH_MS;
    }

    this.lastPhase = phase;

    if (phase === 'countdown') {
      this.countdownText.setText(String(Math.ceil(this.engine.countdownRemaining))).setVisible(true);
    } else if (this.time.now < this.goFlashUntil) {
      this.countdownText.setText('GO!').setVisible(true);
    } else {
      this.countdownText.setVisible(false);
    }
  }

  /** Pops the puck in on the center dot when it respawns, so it reads as new rather than moved. */
  private animatePuckRespawn(): void {
    if (this.engine.puckRespawns === this.lastPuckRespawns) {
      return;
    }

    this.lastPuckRespawns = this.engine.puckRespawns;
    this.tweens.killTweensOf(this.puckSprite);
    this.puckSprite.setScale(0);
    this.tweens.add({ targets: this.puckSprite, scale: 1, duration: PUCK_RESPAWN_POP_MS, ease: 'Back.Out' });
  }

  private updateHelpText(): void {
    this.helpText.setText(
      `${MOVEMENT_SCHEME_HELP[this.movementScheme]}   M: switch controls (${this.movementScheme})   ` +
        'Mouse: aim   Left click: shoot (hold to charge)   Right click: pass\n' +
        `Space: switch player (without the puck)   C: switch mode (${SWITCH_MODE_LABELS[this.switchMode]})   ` +
        `R: reset puck   T: enemy chases puck (${this.engine.opponentsChasePuck ? 'on' : 'off'})`,
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
      aim: this.getPointerWorldPosition(),
      shoot: pointer.leftButtonDown(),
      pass: pointer.rightButtonDown(),
    };

    this.engine.update(controls, deltaMs / 1000);
    this.drawAim(controls.aim);
    this.syncSprites();
    this.followControlledSkater();
    this.updatePuckIndicator();
    this.updateScoreboard();
  }

  private syncSprites(): void {
    const { puck, controlledSkater } = this.engine;

    this.skaterSprites.forEach(({ sprite, ring, model }, skater) => {
      const position = this.getDrawPosition(skater);
      const facing = getDirectionFromVector(skater.facing.x, skater.facing.y);
      const state = skater.speed > WALK_ANIMATION_MIN_SPEED ? 'Walk' : 'Idle';
      sprite.play(getPokemonAnimationKey(model, state, facing), true);
      sprite.setPosition(position.x, position.y).setDepth(ON_ICE_BASE_DEPTH + position.y);
      ring.setPosition(position.x, position.y);

      if (skater === controlledSkater) {
        this.controlPointer.setPosition(position.x, position.y).setRotation(Math.atan2(skater.facing.y, skater.facing.x));
      }
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

  /** Team-colored ring marking a skater. */
  private drawSkaterRing(color: number): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 0.18);
    graphics.fillCircle(0, 0, SKATER_RING_RADIUS);
    graphics.lineStyle(SKATER_RING_THICKNESS, color, SKATER_RING_ALPHA);
    graphics.strokeCircle(0, 0, SKATER_RING_RADIUS);

    return graphics;
  }

  /**
   * Facing pointer for the controlled skater's ring, drawn pointing along +x and rotated to the
   * facing. Shows the exact facing, which the 8-direction sprite can only approximate. Following
   * `controlledSkater` means it moves to whoever the player switches to.
   */
  private drawControlPointer(color: number): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();

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
    const { tuning } = skater;
    const chargeSeconds = skater.shotCharge;
    const charge = chargeSeconds === undefined ? undefined : getShotPower(tuning, chargeSeconds);
    const chargeColor = charge === undefined ? 0xffffff : getPowerColor(charge);
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

    this.aimGraphics.lineStyle(3, chargeColor, charge === undefined ? 0.6 : 0.95);
    this.aimGraphics.lineBetween(start.x, start.y, start.x + direction.x * length, start.y + direction.y * length);

    if (chargeSeconds !== undefined) {
      this.drawChargeMeter(skater, chargeSeconds);
    }
  }

  /**
   * The meter covers the whole charge up to the whiff. Every part of it is colored by the shot
   * power you'd get releasing there; what's been charged through is bright, the rest dim, and a
   * white tick marks the current charge.
   */
  private drawChargeMeter(skater: Skater, chargeSeconds: number): void {
    const { tuning } = skater;
    const skaterPosition = this.getDrawPosition(skater);
    const barX = skaterPosition.x - CHARGE_BAR_WIDTH / 2;
    const barY = skaterPosition.y - 58;
    const sliceWidth = CHARGE_BAR_WIDTH / CHARGE_BAR_SLICES;
    const chargedWidth = (CHARGE_BAR_WIDTH * clamp(chargeSeconds, 0, tuning.shotWhiffSeconds)) / tuning.shotWhiffSeconds;
    const graphics = this.aimGraphics;

    graphics.fillStyle(0x000000, 0.6);
    graphics.fillRect(barX - 2, barY - 2, CHARGE_BAR_WIDTH + 4, CHARGE_BAR_HEIGHT + 4);

    for (let i = 0; i < CHARGE_BAR_SLICES; i++) {
      const sliceSeconds = ((i + 0.5) / CHARGE_BAR_SLICES) * tuning.shotWhiffSeconds;
      const charged = (i + 0.5) * sliceWidth <= chargedWidth;
      graphics.fillStyle(getPowerColor(getShotPower(tuning, sliceSeconds)), charged ? 1 : CHARGE_BAR_AHEAD_ALPHA);
      graphics.fillRect(barX + i * sliceWidth, barY, sliceWidth + 0.5, CHARGE_BAR_HEIGHT);
    }

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(barX + chargedWidth - 1, barY - 2, 2, CHARGE_BAR_HEIGHT + 4);
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
}

/** Blends between `POWER_COLOR_STOPS` for a shot power (0..1). */
function getPowerColor(power: number): number {
  const stops = POWER_COLOR_STOPS;

  if (power <= stops[0].power) {
    return stops[0].color;
  }

  for (let i = 1; i < stops.length; i++) {
    if (power <= stops[i].power) {
      const t = (power - stops[i - 1].power) / (stops[i].power - stops[i - 1].power);

      return blendColors(stops[i - 1].color, stops[i].color, t);
    }
  }

  return stops[stops.length - 1].color;
}

/** Mixes two 0xRRGGBB colors, `t` (0..1) of the way from `from` to `to`. */
function blendColors(from: number, to: number, t: number): number {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;

    return Math.round(a + (b - a) * t) << shift;
  };

  return channel(16) | channel(8) | channel(0);
}
