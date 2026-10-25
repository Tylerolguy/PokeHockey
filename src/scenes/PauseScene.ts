import Phaser from 'phaser';

export const PAUSE_SCENE_KEY = 'PauseScene';
/** Keys that open the pause menu from the game and close it again. */
export const PAUSE_KEYS = ['ESC', 'P'] as const;

/**
 * One setting in the Options submenu. Clicking it calls `change` (usually stepping to the next
 * choice) and then shows the new `value`.
 */
export interface PauseMenuOption {
  label: string;
  value: () => string;
  change: () => void;
}

/** What the game scene hands the pause menu when it launches it. */
export interface PauseMenuData {
  /** The scene that was paused, to resume or restart. */
  gameSceneKey: string;
  /** Lines describing the frozen match (score, shot wind-up), shown under the title. */
  details: string[];
  options: PauseMenuOption[];
}

/** How dark the frozen game gets behind the menu (0..1). It stays visible, shot meter and all. */
const DIM_ALPHA = 0.55;
const MAIN_PANEL_WIDTH = 360;
const MAIN_PANEL_HEIGHT = 430;
const MAIN_BUTTON_WIDTH = 240;
const MAIN_BUTTON_GAP = 70;
const OPTIONS_PANEL_WIDTH = 520;
const OPTION_BUTTON_WIDTH = 460;
const OPTION_BUTTON_GAP = 54;
const BUTTON_COLOR = '#1d3a66';
const BUTTON_HOVER_COLOR = '#3d8bff';

/**
 * Pause menu drawn over the game. The game scene pauses itself (no simulation steps, animations,
 * tweens or input) and launches this; everything in the match stays exactly where it was. The main
 * view resumes or restarts the match or opens Options, where the small settings (controls, camera)
 * are changed.
 */
export class PauseScene extends Phaser.Scene {
  /** Named apart from `Scene.data`, Phaser's own data store. */
  private menuData!: PauseMenuData;
  private mainView!: Phaser.GameObjects.Container;
  private optionsView!: Phaser.GameObjects.Container;

  constructor() {
    super(PAUSE_SCENE_KEY);
  }

  init(data: PauseMenuData): void {
    this.menuData = data;
  }

  create(): void {
    const { width, height } = this.scale;

    // Full-screen and interactive, so clicks outside the panel don't fall through to the game.
    this.add.rectangle(0, 0, width, height, 0x000000, DIM_ALPHA).setOrigin(0, 0).setInteractive();

    this.mainView = this.createMainView();
    this.optionsView = this.createOptionsView().setVisible(false);

    // Esc / P backs out of Options first, then resumes.
    PAUSE_KEYS.forEach((key) =>
      this.input.keyboard!.on(`keydown-${key}`, () => {
        if (this.optionsView.visible) {
          this.showView(this.mainView);
        } else {
          this.resumeGame();
        }
      }),
    );
  }

  private createMainView(): Phaser.GameObjects.Container {
    const view = this.add.container(this.scale.width / 2, this.scale.height / 2);
    const top = -MAIN_PANEL_HEIGHT / 2;

    view.add(this.drawPanel(MAIN_PANEL_WIDTH, MAIN_PANEL_HEIGHT));
    view.add(this.makeTitle(top + 50, 'PAUSED'));
    view.add(
      this.add
        .text(0, top + 120, this.menuData.details.join('\n'), {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#d8e4f5',
          align: 'center',
          lineSpacing: 6,
        })
        .setOrigin(0.5),
    );

    const firstButtonY = top + 195;
    view.add(this.makeButton(0, firstButtonY, MAIN_BUTTON_WIDTH, 'Resume', () => this.resumeGame()));
    view.add(
      this.makeButton(0, firstButtonY + MAIN_BUTTON_GAP, MAIN_BUTTON_WIDTH, 'Options', () =>
        this.showView(this.optionsView),
      ),
    );
    view.add(
      this.makeButton(0, firstButtonY + MAIN_BUTTON_GAP * 2, MAIN_BUTTON_WIDTH, 'Restart', () => this.restartGame()),
    );
    view.add(this.makeHint(MAIN_PANEL_HEIGHT / 2 - 28, 'Esc / P: resume'));

    return view;
  }

  /** One button per option showing "label: value"; clicking changes it in place. Back returns to the main view. */
  private createOptionsView(): Phaser.GameObjects.Container {
    const { options } = this.menuData;
    const view = this.add.container(this.scale.width / 2, this.scale.height / 2);
    const panelHeight = 200 + (options.length + 1) * OPTION_BUTTON_GAP;
    const top = -panelHeight / 2;

    view.add(this.drawPanel(OPTIONS_PANEL_WIDTH, panelHeight));
    view.add(this.makeTitle(top + 50, 'OPTIONS'));

    const firstButtonY = top + 120;
    options.forEach((option, index) => {
      const describe = () => `${option.label}: ${option.value()}`;
      const button: Phaser.GameObjects.Text = this.makeButton(
        0,
        firstButtonY + index * OPTION_BUTTON_GAP,
        OPTION_BUTTON_WIDTH,
        describe(),
        () => {
          option.change();
          button.setText(describe());
        },
        '19px',
      );
      view.add(button);
    });
    view.add(
      this.makeButton(0, firstButtonY + (options.length + 0.4) * OPTION_BUTTON_GAP, MAIN_BUTTON_WIDTH, 'Back', () =>
        this.showView(this.mainView),
      ),
    );
    view.add(this.makeHint(panelHeight / 2 - 28, 'Click an option to change it   Esc / P: back'));

    return view;
  }

  private showView(view: Phaser.GameObjects.Container): void {
    this.mainView.setVisible(view === this.mainView);
    this.optionsView.setVisible(view === this.optionsView);
  }

  /** A rounded panel centered on its container's origin. */
  private drawPanel(width: number, height: number): Phaser.GameObjects.Graphics {
    const panel = this.add.graphics();
    panel.fillStyle(0x0b1220, 0.92);
    panel.fillRoundedRect(-width / 2, -height / 2, width, height, 16);
    panel.lineStyle(3, 0x3d8bff, 0.9);
    panel.strokeRoundedRect(-width / 2, -height / 2, width, height, 16);

    return panel;
  }

  private makeTitle(y: number, title: string): Phaser.GameObjects.Text {
    return this.add
      .text(0, y, title, { fontFamily: 'monospace', fontSize: '44px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
  }

  private makeHint(y: number, hint: string): Phaser.GameObjects.Text {
    return this.add.text(0, y, hint, { fontFamily: 'monospace', fontSize: '15px', color: '#9fb3d1' }).setOrigin(0.5);
  }

  /**
   * A text button that fires on release, so the click that resumes doesn't also reach the game as
   * a held shoot button.
   */
  private makeButton(
    x: number,
    y: number,
    width: number,
    label: string,
    onClick: () => void,
    fontSize = '26px',
  ): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize,
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: BUTTON_COLOR,
        align: 'center',
        fixedWidth: width,
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
    this.scene.resume(this.menuData.gameSceneKey);
    this.scene.stop();
  }

  private restartGame(): void {
    this.scene.stop(this.menuData.gameSceneKey);
    this.scene.start(this.menuData.gameSceneKey);
  }
}
