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
import { assignStartingSpots, FACEOFF_LAYOUTS, type FaceoffLayout } from '../sim/formation';
import { MATCH_PHASE_RULES } from '../sim/matchPhase';
import type { FaceoffStage } from '../sim/faceoff';
import { Skater, type PlayingPosition, type Team } from '../sim/Skater';
import { clamp, lerpVec, type CircleBody, type Vec2 } from '../sim/geometry';
import { getShotPower } from '../sim/shotCharge';
import { CameraController, CAMERA_TUNING } from './CameraController';
import { PAUSE_KEYS, PAUSE_SCENE_KEY, type PauseMenuData, type PauseMenuOption } from './PauseScene';
import { PUCK_RADIUS } from '../sim/Puck';
import { CENTER_DOT, FACEOFF_DOT_POSITIONS, type FaceoffDot, RINK_BACKGROUND_KEY, RINK_BACKGROUND_PATH, RINK_HEIGHT, RINK_WIDTH } from '../sim/rink';

/**
 * Who plays, for which team, and at which playing position; the first is the one the player
 * controls. Each team needs exactly one center, left/right wing, left/right defense and goalie;
 * where they start comes from their position (see formation.ts). Team and position live here rather than on the species so any
 * species can play anywhere. Teammates don't move yet; opponents only move while "Opponents chase puck" is on (pause menu Options).
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
/** Period and clock box under the scores. */
const CLOCK_BOX_WIDTH = 150;
const CLOCK_BOX_HEIGHT = 30;
/** Period labels by period number (index 0 is the 1st); later ones fall back to the number. */
const PERIOD_NAMES = ['1ST', '2ND', '3RD'];
/** Panel behind the period-end and game-over screen (px). */
const SCREEN_PANEL_WIDTH = 760;
const SCREEN_PANEL_HEIGHT = 210;
/** Testing keys that jump to a faceoff at each of the five circles. */
const TEST_FACEOFF_KEYS: { key: string; dot: FaceoffDot }[] = [
  { key: 'ONE', dot: 'center' },
  { key: 'TWO', dot: 'leftEndUpper' },
  { key: 'THREE', dot: 'leftEndLower' },
  { key: 'FOUR', dot: 'rightEndUpper' },
  { key: 'FIVE', dot: 'rightEndLower' },
];
const FACEOFF_LAYOUT_LABELS: Record<FaceoffLayout, string> = {
  hashMarks: 'hash marks',
  box: 'box',
  diamond: 'diamond',
};
/** Choices for the "Period length" option (s). */
const PERIOD_LENGTH_CHOICES = [30, 60, 120, 180, 300];
/** Countdown numbers sit above the center dot so the respawned puck stays visible. */
const COUNTDOWN_Y = RINK_HEIGHT / 2 - 150;
/** Faceoff timing bar, drawn on the ice above the dot (px). */
const FACEOFF_BAR_WIDTH = 180;
const FACEOFF_BAR_HEIGHT = 14;
const FACEOFF_BAR_ABOVE_DOT = 62;
/** Length of the faceoff aiming arrow from the dot (px). */
const FACEOFF_ARROW_LENGTH = 115;
/** On-screen prompt for each stage of the faceoff draw; `winner` is set once the bar has stopped. */
const FACEOFF_PROMPTS: Record<FaceoffStage, (winner?: Team) => string> = {
  getSet: () => 'FACEOFF',
  timing: () => 'Click to stop in the green!',
  timingResult: (winner) => (winner === 'player' ? 'WON THE DRAW!' : 'LOST THE DRAW'),
  aiming: () => 'Click to send the puck!',
  aimingResult: () => '',
  dropped: () => '',
};
/** How long "GO!" shows once the puck is live after a faceoff (ms). */
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
 * The rink camera's center and zoom come from `CameraController` (all its numbers are in
 * `CAMERA_TUNING`). The HUD lives on a second, fixed camera so it doesn't zoom or scroll.
 */
/** Depth of the camera debug overlay's focus marker: above everything on the ice. */
const CAMERA_DEBUG_DEPTH = 1999;
/**
 * Off-screen puck marker: a badge with a puck icon and an arrowhead pointing at the puck. How far
 * in from the screen edge it sits, the badge radius, and how far the arrow sticks out (px).
 */
const PUCK_INDICATOR_INSET = 48;
const PUCK_INDICATOR_RADIUS = 22;
const PUCK_INDICATOR_ARROW_LENGTH = 16;
/** Off-screen teammate markers: a team-colored badge with the Pokemon's icon (icons are 40 px). */
const TEAMMATE_INDICATOR_RADIUS = 24;
/** All Pokemon icons packed in one atlas; frame names match species model names. */
const ICON_ATLAS_KEY = 'pokemon-icons';

type MovementScheme = MovementControls['scheme'];
const SWITCH_MODE_LABELS: Record<SwitchMode, string> = {
  nextInList: 'next in list',
  closestToAim: 'closest to mouse',
};
const MOVEMENT_SCHEMES: MovementScheme[] = ['mouseFacing', 'directional', 'tank'];
/** Choices for the "Goals to win" option; undefined plays on forever. */
const GOALS_TO_WIN_CHOICES: (number | undefined)[] = [undefined, 1, 3, 5, 10];
const MOVEMENT_SCHEME_LABELS: Record<MovementScheme, string> = {
  mouseFacing: 'mouse-facing',
  directional: 'directional',
  tank: 'tank',
};
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
  /** Under the scoreboard: "GOAL!" in the scorer's color after a goal, "WHISTLE" during a stoppage. */
  private phaseBanner!: Phaser.GameObjects.Text;
  /** Big "GO!" once a faceoff's puck is live. */
  private countdownText!: Phaser.GameObjects.Text;
  /** Faceoff draw on the ice at the dot: timing bar and aiming arrow. */
  private faceoffGraphics!: Phaser.GameObjects.Graphics;
  /** What to do during the faceoff draw, and how it went. */
  private faceoffText!: Phaser.GameObjects.Text;
  /** Period and game clock, in a box under the scores. */
  private clockText!: Phaser.GameObjects.Text;
  /** Screen over center ice at period end and game over: a panel, a big title and a subtitle. */
  private screenPanel!: Phaser.GameObjects.Graphics;
  private screenTitle!: Phaser.GameObjects.Text;
  private screenSubtitle!: Phaser.GameObjects.Text;
  private lastPhase: MatchPhase = 'faceoff';
  private lastPuckRespawns = 0;
  private goFlashUntil = 0;
  private movementScheme: MovementScheme = MOVEMENT_SCHEMES[0];
  /** Testing option (pause menu) between the two ways Space picks who to switch to. */
  private switchMode: SwitchMode = 'closestToAim';
  /** Objects drawn on the fixed HUD camera instead of the zoomed, following rink camera. */
  private readonly hudObjects = new Set<Phaser.GameObjects.GameObject>();
  /** Arrow at the screen edge pointing to the puck when it's off screen. */
  private puckIndicator!: Phaser.GameObjects.Graphics;
  /** Badges at the screen edge pointing to teammates who are off screen, each with their icon. */
  private teammateIndicators!: Phaser.GameObjects.Graphics;
  private teammateIcons = new Map<Skater, Phaser.GameObjects.Image>();
  /** Circles that clip each teammate icon (the icon art has a square background) inside its badge. */
  private teammateIconMasks = new Map<Skater, Phaser.GameObjects.Graphics>();
  /**
   * Where each off-screen teammate's marker sits on the rink this frame. Space's "closest to the
   * mouse" uses these, so pointing at a marker picks that teammate.
   */
  private teammateMarkerPoints = new Map<Skater, Vec2>();
  private cameraController!: CameraController;
  /** Testing overlay (pause menu option): the camera's focus point on the ice and its zoom numbers on the HUD. */
  private cameraDebugMarker!: Phaser.GameObjects.Graphics;
  private cameraDebugText!: Phaser.GameObjects.Text;
  /** Game-loop time (ms) the scene was paused at, to shift timers that run on real time. */
  private pausedAt = 0;
  /**
   * After unpausing mid wind-up, the shot carries on charging straight away as if shoot were still
   * held, even with the button up. Pressing shoot hands it back to the button, so releasing fires.
   */
  private keepChargingAfterResume = false;

  constructor() {
    super('HockeyScene');
  }

  preload(): void {
    this.load.image(RINK_BACKGROUND_KEY, RINK_BACKGROUND_PATH);
    this.load.atlas(ICON_ATLAS_KEY, 'assets/pokemon-icons.png', 'assets/pokemon-icons.json');
    new Set(LINEUP.map(({ species }) => species.model)).forEach((model) => loadPokemonModel(this, model));
  }

  create(): void {
    // Restart (from the pause menu) re-runs create on the same instance, so start from scratch.
    this.skaterSprites.clear();
    this.hudObjects.clear();
    this.teammateIcons.clear();
    this.teammateIconMasks.clear();
    this.teammateMarkerPoints.clear();
    this.lastPhase = 'faceoff';
    this.lastPuckRespawns = 0;
    this.goFlashUntil = 0;
    this.keepChargingAfterResume = false;

    this.add.image(0, 0, RINK_BACKGROUND_KEY).setOrigin(0, 0);

    const startingSpots = assignStartingSpots(LINEUP);
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
    this.cameraController = new CameraController(
      this.getDrawPosition(this.engine.controlledSkater),
      { width: RINK_WIDTH, height: RINK_HEIGHT },
      { width: this.scale.width, height: this.scale.height },
    );
    this.puckSprite = this.drawPuck();
    // Above the skaters: aiming back across them must still show the line.
    this.aimGraphics = this.add.graphics().setDepth(AIM_DEPTH);
    this.faceoffGraphics = this.add.graphics().setDepth(AIM_DEPTH);
    this.controlPointer = this.drawControlPointer(TEAM_COLORS.player).setDepth(RING_DEPTH);
    this.syncSprites();

    const keyboard = this.input.keyboard!;
    this.moveKeys = keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as typeof this.moveKeys;
    keyboard.on('keydown-R', () => this.engine.resetPuck());
    // Temporary testing key: blow the whistle for a stoppage until real causes (puck out of play, etc.) exist.
    keyboard.on('keydown-B', () => this.engine.callStoppage('whistle'));
    // Temporary testing keys: 1-5 jump straight to a faceoff at each circle.
    TEST_FACEOFF_KEYS.forEach(({ key, dot }) => keyboard.on(`keydown-${key}`, () => this.engine.startFaceoffAt(dot)));
    keyboard.addCapture('SPACE');
    keyboard.on('keydown-SPACE', () => {
      this.engine.switchControlledSkater(this.switchMode, this.getPointerWorldPosition(), this.teammateMarkerPoints);
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
    PAUSE_KEYS.forEach((key) => keyboard.on(`keydown-${key}`, () => this.pauseGame()));
    // Scene events outlive a restart, so drop the listener on shutdown or it'd be added twice.
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this));
    this.puckIndicator = this.addToHud(this.add.graphics().setDepth(HUD_DEPTH));
    this.teammateIndicators = this.addToHud(this.add.graphics().setDepth(HUD_DEPTH));
    this.skaterSprites.forEach(({ model }, skater) => {
      if (skater.team === 'player') {
        const icon = this.add.image(0, 0, ICON_ATLAS_KEY, model).setDepth(HUD_DEPTH).setVisible(false);
        const mask = this.make.graphics({}, false).fillStyle(0xffffff).fillCircle(0, 0, TEAMMATE_INDICATOR_RADIUS - 2);
        icon.setMask(mask.createGeometryMask());
        this.teammateIcons.set(skater, this.addToHud(icon));
        this.teammateIconMasks.set(skater, mask);
      }
    });
    this.setUpCameras();
  }

  /**
   * Freezes the match: pausing the scene stops its updates (so no simulation steps or player
   * input), sprite animations, tweens and input handlers, while it keeps drawing its last frame.
   * The pause menu goes on top and resumes it.
   */
  private pauseGame(): void {
    this.pausedAt = this.game.loop.time;
    this.scene.pause();
    const menuData: PauseMenuData = {
      gameSceneKey: this.scene.key,
      details: this.getPauseDetails(),
      options: this.getPauseOptions(),
    };
    this.scene.launch(PAUSE_SCENE_KEY, menuData);
  }

  /**
   * The settings in the pause menu's Options submenu. These are temporary testing toggles (they
   * used to be the M, C, T, Z, X and V keys) for comparing ways the game could work.
   */
  private getPauseOptions(): PauseMenuOption[] {
    const onOff = (on: boolean) => (on ? 'on' : 'off');

    return [
      {
        label: 'Movement controls',
        value: () => MOVEMENT_SCHEME_LABELS[this.movementScheme],
        change: () => {
          const next = (MOVEMENT_SCHEMES.indexOf(this.movementScheme) + 1) % MOVEMENT_SCHEMES.length;
          this.movementScheme = MOVEMENT_SCHEMES[next];
          this.updateHelpText();
        },
      },
      {
        label: 'Space switches to',
        value: () => SWITCH_MODE_LABELS[this.switchMode],
        change: () => {
          this.switchMode = this.switchMode === 'nextInList' ? 'closestToAim' : 'nextInList';
        },
      },
      {
        label: 'Opponents chase puck',
        value: () => onOff(this.engine.opponentsChasePuck),
        change: () => {
          this.engine.opponentsChasePuck = !this.engine.opponentsChasePuck;
        },
      },
      {
        label: 'Period length',
        value: () => formatClock(this.engine.rules.periodSeconds),
        change: () => {
          const current = PERIOD_LENGTH_CHOICES.indexOf(this.engine.rules.periodSeconds);
          // Restarts this period's clock at the new length.
          this.engine.setPeriodLength(PERIOD_LENGTH_CHOICES[(current + 1) % PERIOD_LENGTH_CHOICES.length]);
        },
      },
      {
        label: 'Faceoff layout',
        value: () => FACEOFF_LAYOUT_LABELS[this.engine.faceoffLayout],
        change: () => {
          const next = (FACEOFF_LAYOUTS.indexOf(this.engine.faceoffLayout) + 1) % FACEOFF_LAYOUTS.length;
          this.engine.setFaceoffLayout(FACEOFF_LAYOUTS[next]);
        },
      },
      {
        label: 'Goals to win',
        value: () => String(this.engine.rules.goalsToWin ?? 'off'),
        change: () => {
          const current = GOALS_TO_WIN_CHOICES.indexOf(this.engine.rules.goalsToWin);
          this.engine.rules.goalsToWin = GOALS_TO_WIN_CHOICES[(current + 1) % GOALS_TO_WIN_CHOICES.length];
        },
      },
      {
        label: 'Camera',
        value: () => this.cameraController.mode,
        change: () => this.cameraController.toggleMode(),
      },
      {
        label: 'Camera on player swap',
        value: () => this.cameraController.swapStyle,
        change: () => this.cameraController.toggleSwapStyle(),
      },
      {
        label: 'Camera debug overlay',
        value: () => onOff(this.cameraDebugText.visible),
        change: () => {
          const visible = !this.cameraDebugText.visible;
          this.cameraDebugText.setVisible(visible);
          this.cameraDebugMarker.setVisible(visible);
        },
      },
    ];
  }

  /** What the pause menu says about the frozen match: score, period and clock, and any shot being wound up. */
  private getPauseDetails(): string[] {
    const { score, controlledSkater, puck, period, clockRemaining } = this.engine;
    const lines = [
      `${TEAM_NAMES.player} ${score.player} - ${score.opponent} ${TEAM_NAMES.opponent}   ` +
        `${getPeriodName(period)} ${formatClock(clockRemaining)}`,
    ];
    const chargeSeconds = controlledSkater.shotCharge;

    if (chargeSeconds !== undefined) {
      const power = Math.round(getShotPower(controlledSkater.tuning, chargeSeconds) * 100);
      lines.push(`Shot wound up: ${power}% power`, `(held ${chargeSeconds.toFixed(2)} s, kept on resume)`);
    } else {
      const carrierTeam = puck.carrier?.team;
      lines.push(carrierTeam === undefined ? 'Loose puck' : carrierTeam === 'player' ? 'You have the puck' : 'They have the puck');
    }

    return lines;
  }

  private onResume(): void {
    // The GO! flash is timed in real time, which kept running during the pause.
    this.goFlashUntil += this.game.loop.time - this.pausedAt;
    this.keepChargingAfterResume = this.engine.controlledSkater.shotCharge !== undefined;
  }

  /** Marks `object` as part of the HUD: drawn by the fixed HUD camera, not the rink camera. */
  private addToHud<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.hudObjects.add(object);

    return object;
  }

  /**
   * The main camera shows part of the rink, placed by `CameraController`; a second camera with no
   * zoom or scroll draws only the HUD on top. Each camera ignores the other's objects.
   */
  private setUpCameras(): void {
    this.cameraDebugMarker = this.add.graphics().setDepth(CAMERA_DEBUG_DEPTH).setVisible(false);
    this.cameraDebugText = this.addToHud(
      this.add
        .text(RINK_WIDTH - 16, 16, '', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#ffffff',
          backgroundColor: '#000000aa',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(1, 0)
        .setDepth(HUD_DEPTH)
        .setVisible(false),
    );

    const rinkCamera = this.cameras.main.setBounds(0, 0, RINK_WIDTH, RINK_HEIGHT);
    const hudCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    rinkCamera.ignore([...this.hudObjects]);
    hudCamera.ignore(this.children.list.filter((object) => !this.hudObjects.has(object)));
    this.updateCamera(0);
  }

  /** Feeds the drawn (blended) positions to the camera controller and applies its center and zoom. */
  private updateCamera(deltaSeconds: number): void {
    const { controlledSkater, puck, phase } = this.engine;
    const { center, zoom } = this.cameraController.update({
      deltaSeconds,
      controlledId: controlledSkater,
      controlled: this.getDrawPosition(controlledSkater),
      puck: this.getDrawPosition(puck),
      puckSpeed: puck.speed,
      isChargingShot: controlledSkater.shotCharge !== undefined,
      isStoppage: !MATCH_PHASE_RULES[phase].puckInPlay,
      // Heading to or at a faceoff: frame its dot. Between periods and after the game: center ice.
      faceoff: phase === 'periodEnd' || phase === 'gameOver' ? CENTER_DOT : FACEOFF_DOT_POSITIONS[this.engine.faceoffDot],
    });

    this.cameras.main.setZoom(zoom).centerOn(center.x, center.y);
    this.updateCameraDebug();
  }

  private updateCameraDebug(): void {
    if (!this.cameraDebugText.visible) {
      return;
    }

    const info = this.cameraController.getDebugInfo();
    const notes = [info.swapping ? 'swap settling' : '', info.stoppage ? 'stoppage' : ''].filter(Boolean).join(', ');
    this.cameraDebugText.setText(
      `camera ${info.mode}, swaps ${info.swapStyle}${notes ? ` (${notes})` : ''}\n` +
        `zoom ${info.zoom.toFixed(2)} -> target ${info.targetZoom.toFixed(2)}\n` +
        `spread ${info.spreadZoom.toFixed(2)}  speed -${info.speedZoomOut.toFixed(2)}  ` +
        `range ${CAMERA_TUNING.minZoom}-${CAMERA_TUNING.maxZoom}`,
    );

    const marker = this.cameraDebugMarker;
    marker.clear();
    marker.lineStyle(3, 0xff00ff, 1);
    marker.strokeCircle(info.focus.x, info.focus.y, 10);
    marker.lineBetween(info.focus.x - 18, info.focus.y, info.focus.x + 18, info.focus.y);
    marker.lineBetween(info.focus.x, info.focus.y - 18, info.focus.x, info.focus.y + 18);
  }

  /** Where the mouse is on the rink, through the zoomed, scrolling camera (fresh every frame). */
  private getPointerWorldPosition(): Vec2 {
    const pointer = this.input.activePointer;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    return { x: point.x, y: point.y };
  }

  /** When the puck is off screen, a badge at the screen edge with a puck icon points to it. */
  private updatePuckIndicator(): void {
    const graphics = this.puckIndicator;
    graphics.clear();

    const marker = this.getEdgeMarker(this.getDrawPosition(this.engine.puck), PUCK_INDICATOR_INSET);

    if (!marker) {
      return;
    }

    this.drawEdgeBadge(graphics, marker, PUCK_INDICATOR_RADIUS, 0xffffff);
    graphics.fillStyle(0x15171c, 1);
    graphics.fillCircle(marker.x, marker.y, PUCK_RADIUS * 1.6);
    graphics.lineStyle(2, 0x5a6070, 1);
    graphics.strokeCircle(marker.x, marker.y, PUCK_RADIUS * 1.6 - 2);
  }

  /**
   * Teammates who are off screen (never the controlled one, who's always on screen) get a badge in
   * the team color with their icon, pointing at them. Their marker's spot is remembered so Space can
   * pick a teammate by pointing at it.
   */
  private updateTeammateIndicators(): void {
    const graphics = this.teammateIndicators;
    graphics.clear();
    this.teammateMarkerPoints.clear();

    const view = this.cameraController.getView();
    const zoom = this.scale.width / view.width;

    this.teammateIcons.forEach((icon, skater) => {
      const marker =
        skater === this.engine.controlledSkater
          ? undefined
          : this.getEdgeMarker(this.getDrawPosition(skater), PUCK_INDICATOR_INSET);

      if (!marker) {
        icon.setVisible(false);
        return;
      }

      this.drawEdgeBadge(graphics, marker, TEAMMATE_INDICATOR_RADIUS, TEAM_COLORS.player);
      icon.setPosition(marker.x, marker.y).setVisible(true);
      this.teammateIconMasks.get(skater)?.setPosition(marker.x, marker.y);
      this.teammateMarkerPoints.set(skater, { x: view.x + marker.x / zoom, y: view.y + marker.y / zoom });
    });
  }

  /**
   * Where to put a screen-edge marker for something at `world` that's off screen: on the line from
   * the screen center toward it, `inset` px in from the edge. Undefined when it's on screen.
   */
  private getEdgeMarker(world: Vec2, inset: number): { x: number; y: number; angle: number } | undefined {
    const view = this.cameraController.getView();

    if (world.x >= view.x && world.x <= view.x + view.width && world.y >= view.y && world.y <= view.y + view.height) {
      return undefined;
    }

    const { width, height } = this.scale;
    const zoom = width / view.width;
    const dx = (world.x - view.x) * zoom - width / 2;
    const dy = (world.y - view.y) * zoom - height / 2;
    // Slide along the line from screen center toward the target until it meets the inset border.
    const reach = Math.min(
      dx !== 0 ? (width / 2 - inset) / Math.abs(dx) : Infinity,
      dy !== 0 ? (height / 2 - inset) / Math.abs(dy) : Infinity,
    );

    return { x: width / 2 + dx * reach, y: height / 2 + dy * reach, angle: Math.atan2(dy, dx) };
  }

  /** A dark badge with a colored outline and an arrowhead pointing along `marker.angle`. */
  private drawEdgeBadge(
    graphics: Phaser.GameObjects.Graphics,
    marker: { x: number; y: number; angle: number },
    radius: number,
    color: number,
  ): void {
    const { x, y, angle } = marker;
    const along = (distance: number, sideways = 0) => ({
      x: x + Math.cos(angle) * distance - Math.sin(angle) * sideways,
      y: y + Math.sin(angle) * distance + Math.cos(angle) * sideways,
    });
    const tip = along(radius + PUCK_INDICATOR_ARROW_LENGTH);
    const baseLeft = along(radius - 4, -radius * 0.6);
    const baseRight = along(radius - 4, radius * 0.6);

    graphics.fillStyle(color, 0.95);
    graphics.fillTriangle(tip.x, tip.y, baseLeft.x, baseLeft.y, baseRight.x, baseRight.y);
    graphics.fillStyle(0x0b1220, 0.85);
    graphics.fillCircle(x, y, radius);
    graphics.lineStyle(3, color, 0.95);
    graphics.strokeCircle(x, y, radius);
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
    const clockTop = SCOREBOARD_Y + SCORE_BOX_HEIGHT + 6;
    boxes.fillStyle(0x0b1220, 0.85);
    boxes.fillRoundedRect(centerX - CLOCK_BOX_WIDTH / 2, clockTop, CLOCK_BOX_WIDTH, CLOCK_BOX_HEIGHT, 8);
    this.clockText = this.addToHud(
      this.add
        .text(centerX, clockTop + CLOCK_BOX_HEIGHT / 2, '', {
          fontFamily: 'monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setDepth(HUD_DEPTH),
    );
    this.phaseBanner = this.addToHud(
      this.add
        .text(centerX, clockTop + CLOCK_BOX_HEIGHT + 10, 'GOAL!', {
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
    this.faceoffText = this.addToHud(
      this.add
        .text(centerX, COUNTDOWN_Y, '', {
          fontFamily: 'monospace',
          fontSize: '40px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#0b1220',
          strokeThickness: 8,
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(HUD_DEPTH)
        .setVisible(false),
    );
    this.screenPanel = this.addToHud(this.add.graphics().setDepth(HUD_DEPTH).setVisible(false));
    this.screenPanel.fillStyle(0x0b1220, 0.8);
    this.screenPanel.fillRoundedRect(
      centerX - SCREEN_PANEL_WIDTH / 2,
      COUNTDOWN_Y - 75,
      SCREEN_PANEL_WIDTH,
      SCREEN_PANEL_HEIGHT,
      16,
    );
    this.screenTitle = this.addToHud(
      this.add
        .text(centerX, COUNTDOWN_Y, '', {
          fontFamily: 'monospace',
          fontSize: '64px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#0b1220',
          strokeThickness: 10,
        })
        .setOrigin(0.5)
        .setDepth(HUD_DEPTH)
        .setVisible(false),
    );
    this.screenSubtitle = this.addToHud(
      this.add
        .text(centerX, COUNTDOWN_Y + 75, '', {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#ffffff',
          align: 'center',
          lineSpacing: 6,
        })
        .setOrigin(0.5)
        .setDepth(HUD_DEPTH)
        .setVisible(false),
    );
    this.updateScoreboard();
  }

  private updateScoreboard(): void {
    const { score } = this.engine;
    this.scoreTexts.player.setText(`${TEAM_NAMES.player}  ${score.player}`);
    this.scoreTexts.opponent.setText(`${score.opponent}  ${TEAM_NAMES.opponent}`);

    this.clockText.setText(`${getPeriodName(this.engine.period)}   ${formatClock(this.engine.clockRemaining)}`);

    this.updatePhaseBanner();
    this.updateCountdown();
    this.updateScreen();
    this.animatePuckRespawn();
  }

  private updatePhaseBanner(): void {
    const { goalScoredBy, phase } = this.engine;

    if (goalScoredBy) {
      this.phaseBanner.setText('GOAL!').setColor(toCssColor(TEAM_COLORS[goalScoredBy])).setVisible(true);
    } else if (phase === 'stoppage') {
      this.phaseBanner.setText('WHISTLE').setColor('#ffffff').setVisible(true);
    } else {
      this.phaseBanner.setVisible(false);
    }
  }

  /** The screen over center ice: the period-end screen, or the result once the game is over. */
  private updateScreen(): void {
    const { phase, period, winner, score, rules } = this.engine;
    const scoreLine = `${TEAM_NAMES.player} ${score.player} - ${score.opponent} ${TEAM_NAMES.opponent}`;
    const shown = phase === 'periodEnd' || phase === 'gameOver';
    [this.screenPanel, this.screenTitle, this.screenSubtitle].forEach((object) => object.setVisible(shown));

    if (phase === 'periodEnd') {
      const next = period < rules.periods ? `Next: ${getPeriodName(period + 1)} PERIOD` : 'Game over next';
      this.screenTitle.setText(`END OF ${getPeriodName(period)} PERIOD`).setColor('#ffffff');
      this.screenSubtitle.setText(`${scoreLine}\n${next}`);
    } else if (phase === 'gameOver' && winner) {
      if (winner === 'tie') {
        this.screenTitle.setText('TIE GAME').setColor('#ffffff');
      } else {
        const result = winner === 'player' ? `${TEAM_NAMES.player} WIN!` : `${TEAM_NAMES.opponent} WINS`;
        this.screenTitle.setText(result).setColor(toCssColor(TEAM_COLORS[winner]));
      }

      this.screenSubtitle.setText(`Final: ${scoreLine}\nEsc: menu (Restart for a new match)`);
    }
  }

  /** Faceoff prompts and results while the draw is played, then a short "GO!" once the puck is live. */
  private updateCountdown(): void {
    const { phase, faceoffDraw } = this.engine;

    if (this.lastPhase === 'faceoff' && phase === 'live') {
      this.goFlashUntil = this.time.now + GO_FLASH_MS;
    }

    this.lastPhase = phase;
    this.drawFaceoff();

    if (phase === 'faceoff' && faceoffDraw) {
      this.countdownText.setVisible(false);
      this.faceoffText.setText(FACEOFF_PROMPTS[faceoffDraw.stage](faceoffDraw.winner)).setVisible(true);
      return;
    }

    this.faceoffText.setVisible(false);

    if (this.time.now < this.goFlashUntil) {
      this.countdownText.setText('GO!').setVisible(true);
    } else {
      this.countdownText.setVisible(false);
    }
  }

  /**
   * The faceoff draw on the ice at the dot: the timing bar above it (green zone, moving marker)
   * and, if the player won, the spinning arrow around it.
   */
  private drawFaceoff(): void {
    const graphics = this.faceoffGraphics;
    graphics.clear();

    const { phase, faceoffDraw: draw, faceoffDot } = this.engine;

    if (phase !== 'faceoff' || !draw) {
      return;
    }

    const dot = FACEOFF_DOT_POSITIONS[faceoffDot];

    if (draw.stage === 'timing' || draw.stage === 'timingResult') {
      const left = dot.x - FACEOFF_BAR_WIDTH / 2;
      const top = dot.y - FACEOFF_BAR_ABOVE_DOT - FACEOFF_BAR_HEIGHT / 2;
      const resultColor = draw.winner === 'player' ? 0x3ddc6e : 0xff3b2b;

      graphics.fillStyle(0x0b1220, 0.85);
      graphics.fillRoundedRect(left - 4, top - 4, FACEOFF_BAR_WIDTH + 8, FACEOFF_BAR_HEIGHT + 8, 6);
      graphics.fillStyle(0x5a6070, 1);
      graphics.fillRect(left, top, FACEOFF_BAR_WIDTH, FACEOFF_BAR_HEIGHT);
      graphics.fillStyle(0x3ddc6e, 1);
      graphics.fillRect(
        left + draw.greenStart * FACEOFF_BAR_WIDTH,
        top,
        (draw.greenEnd - draw.greenStart) * FACEOFF_BAR_WIDTH,
        FACEOFF_BAR_HEIGHT,
      );

      if (draw.stage === 'timingResult') {
        graphics.lineStyle(3, resultColor, 1);
        graphics.strokeRect(left - 4, top - 4, FACEOFF_BAR_WIDTH + 8, FACEOFF_BAR_HEIGHT + 8);
      }

      const markerX = left + draw.barPosition * FACEOFF_BAR_WIDTH;
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(markerX - 2, top - 6, 4, FACEOFF_BAR_HEIGHT + 12);
    }

    if (draw.winner === 'player' && (draw.stage === 'aiming' || draw.stage === 'aimingResult')) {
      const angle = draw.arrowAngle;
      const tip = { x: dot.x + Math.cos(angle) * FACEOFF_ARROW_LENGTH, y: dot.y + Math.sin(angle) * FACEOFF_ARROW_LENGTH };
      const headBase = (offset: number, extra = 0) => ({
        x: tip.x - Math.cos(angle) * (24 + extra) + Math.cos(angle + Math.PI / 2) * offset,
        y: tip.y - Math.sin(angle) * (24 + extra) + Math.sin(angle + Math.PI / 2) * offset,
      });
      // The shaft stops at the head so the outline doesn't poke through it.
      const shaftEnd = headBase(0);

      graphics.lineStyle(3, 0xffffff, 0.5);
      graphics.strokeCircle(dot.x, dot.y, FACEOFF_ARROW_LENGTH);
      // Dark outline first, then the yellow arrow on top, so it reads over the Pokémon.
      graphics.lineStyle(12, 0x0b1220, 0.9);
      graphics.lineBetween(dot.x, dot.y, shaftEnd.x, shaftEnd.y);
      graphics.fillStyle(0x0b1220, 0.9);
      const outlineTip = { x: tip.x + Math.cos(angle) * 4, y: tip.y + Math.sin(angle) * 4 };
      const outlineLeft = headBase(-17, 3);
      const outlineRight = headBase(17, 3);
      graphics.fillTriangle(outlineTip.x, outlineTip.y, outlineLeft.x, outlineLeft.y, outlineRight.x, outlineRight.y);
      graphics.lineStyle(7, 0xffe14d, 1);
      graphics.lineBetween(dot.x, dot.y, shaftEnd.x, shaftEnd.y);
      graphics.fillStyle(0xffe14d, 1);
      const left = headBase(-13);
      const right = headBase(13);
      graphics.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
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
      `${MOVEMENT_SCHEME_HELP[this.movementScheme]}   ` +
        'Mouse: aim   Left click: shoot (hold to charge)   Right click: pass\n' +
        'Space: switch player (without the puck)   Esc/P: pause (Options: controls, camera, faceoff layout)\n' +
        'Testing: R reset puck   B whistle   1-5 faceoff at center / upper-left / lower-left / upper-right / lower-right',
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
    const shootHeld = pointer.leftButtonDown();

    // Ends once the button takes over, or the shot has gone (fired, whiffed or puck lost).
    if (shootHeld || this.engine.controlledSkater.shotCharge === undefined) {
      this.keepChargingAfterResume = false;
    }

    const controls: SkaterControls = {
      move: this.readMovement(),
      aim: this.getPointerWorldPosition(),
      shoot: shootHeld || this.keepChargingAfterResume,
      pass: pointer.rightButtonDown(),
    };

    this.engine.update(controls, deltaMs / 1000);
    this.drawAim(controls.aim);
    this.syncSprites();
    this.updateCamera(deltaMs / 1000);
    this.updatePuckIndicator();
    this.updateTeammateIndicators();
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

/** "1ST", "2ND", "3RD", then plain numbers for any later period. */
function getPeriodName(period: number): string {
  return PERIOD_NAMES[period - 1] ?? String(period);
}

/** Game clock time as m:ss, rounded up so it reads 0:00 only once time is out. */
function formatClock(seconds: number): string {
  const whole = Math.ceil(seconds);

  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** A 0xRRGGBB color as a CSS "#rrggbb" string, for text. */
function toCssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
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
