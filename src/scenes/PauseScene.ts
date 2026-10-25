import Phaser from 'phaser';

export const PAUSE_SCENE_KEY = 'PauseScene';
/** Keys that open the pause menu from the game and close it again. */
export const PAUSE_KEYS = ['ESC', 'P'] as const;
/** How dark the frozen game gets behind the menu (0..1). It stays visible, shot meter and all. */
const DIM_ALPHA = 0.55;
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 360;
const BUTTON_WIDTH = 240;
const BUTTON_GAP = 70;
const BUTTON_COLOR = '#1d3a66';
const BUTTON_HOVER_COLOR = '#3d8bff';

/**
 * Pause menu drawn over the game. The game scene pauses itself (no simulation steps, animations,
 * tweens or input) and launches this; everything in the match stays exactly where it was, and the
 * buttons here resume or restart it.
 */
export class PauseScene extends Phaser.Scene {
  /** The scene that was paused, to resume or restart. */
  private gameSceneKey = '';
  /** Lines describing the frozen match (score, shot wind-up), shown under the title. */
  private details: string[] = [];

  constructor() {
    super(PAUSE_SCENE_KEY);
  }

  init(data: { gameSceneKey: string; details: string[] }): void {
    this.gameSceneKey = data.gameSceneKey;
    this.details = data.details;
  }

  create(): void {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    // Full-screen and interactive, so clicks outside the panel don't fall through to the game.
    this.add.rectangle(0, 0, width, height, 0x000000, DIM_ALPHA).setOrigin(0, 0).setInteractive();

    const panel = this.add.graphics();
    panel.fillStyle(0x0b1220, 0.92);
    panel.fillRoundedRect(centerX - PANEL_WIDTH / 2, centerY - PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 16);
    panel.lineStyle(3, 0x3d8bff, 0.9);
    panel.strokeRoundedRect(centerX - PANEL_WIDTH / 2, centerY - PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 16);

    this.add
      .text(centerX, centerY - 135, 'PAUSED', {
        fontFamily: 'monospace',
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(centerX, centerY - 70, this.details.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#d8e4f5',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5);
    this.addButton(centerX, centerY + 10, 'Resume', () => this.resumeGame());
    this.addButton(centerX, centerY + 10 + BUTTON_GAP, 'Restart', () => this.restartGame());
    this.add
      .text(centerX, centerY + 150, 'Esc / P: resume', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#9fb3d1',
      })
      .setOrigin(0.5);

    PAUSE_KEYS.forEach((key) => this.input.keyboard!.on(`keydown-${key}`, () => this.resumeGame()));
  }

  /**
   * A text button that fires on release, so the click that resumes doesn't also reach the game as
   * a held shoot button.
   */
  private addButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: BUTTON_COLOR,
        align: 'center',
        fixedWidth: BUTTON_WIDTH,
        padding: { x: 0, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setBackgroundColor(BUTTON_HOVER_COLOR));
    button.on('pointerout', () => button.setBackgroundColor(BUTTON_COLOR));
    button.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonReleased()) {
        onClick();
      }
    });

    return button;
  }

  private resumeGame(): void {
    this.scene.resume(this.gameSceneKey);
    this.scene.stop();
  }

  private restartGame(): void {
    this.scene.stop(this.gameSceneKey);
    this.scene.start(this.gameSceneKey);
  }
}
