import type { Vec2 } from '../sim/geometry';

/**
 * Every number the rink camera uses. Zoom: 1 shows the whole rink width; higher is closer.
 * Rates are per second, used as `1 - exp(-rate * dt)` so smoothing is frame-rate independent.
 */
export const CAMERA_TUNING = {
  /** Fixed mode's zoom, and the zoom the camera starts at. */
  baseZoom: 1.6,
  /** Auto mode never zooms closer than this or further out than this. */
  maxZoom: 1.7,
  minZoom: 1.15,
  /** The furthest the skater-to-puck spread alone zooms out; puck speed can go a little further. */
  spreadZoomFloor: 1.25,
  /** World px kept around the skater and the puck when fitting both on screen. */
  spreadMargin: 140,
  /** How far (0..1) the focus point leans from the controlled skater toward the puck (auto mode). */
  puckBias: 0.25,
  /** Puck speeds (px/s) where zooming out for speed starts and maxes out, and how much it zooms out. */
  speedZoomStart: 300,
  speedZoomFull: 1100,
  speedZoomOut: 0.15,
  /** Auto zoom ignores target changes smaller than this, so small spread changes don't nudge it. */
  zoomDeadzone: 0.05,
  /** How fast the zoom eases toward its target: out a bit faster (to keep fast plays visible) than in. */
  zoomOutRate: 3,
  zoomInRate: 1.6,
  /** Zoom changes are slowed to this fraction while the player is charging a shot, so aim holds steady. */
  chargingZoomRateScale: 0.1,
  /**
   * The camera center chases the focus point like a damped spring: roughly how long (s) it takes to
   * catch up. Springs keep their speed through changes, so the camera never stops dead or snaps.
   */
  followSmoothTime: 0.15,
  /** How a control swap moves the camera: 'smooth' (spring glide) or 'instant' (cut straight to them). */
  swapStyle: 'smooth' as SwapStyle,
  /**
   * On a smooth swap, the point the spring chases slides from where the camera was to the new
   * skater over this long (s), on a curve that starts and ends gently, so the camera never kicks.
   */
  swapGlideSeconds: 0.45,
  /** The camera never moves faster than this (px/s), even on a long swap. */
  maxCameraSpeed: 3500,
  /** Whenever the puck is dead (after goals and stoppages, faceoffs, game over), auto mode frames center ice at this zoom. */
  stoppageZoom: 1.25,
  stoppageZoomRate: 2.5,
};

export type CameraMode = 'auto' | 'fixed';
export type SwapStyle = 'smooth' | 'instant';

/** Everything the camera looks at each frame, in drawn (blended) positions. */
export interface CameraInputs {
  deltaSeconds: number;
  /** Changes identity when the player switches who they control. */
  controlledId: unknown;
  controlled: Vec2;
  puck: Vec2;
  puckSpeed: number;
  isChargingShot: boolean;
  /** True whenever the puck is dead: after goals and stoppages, at faceoffs, and once the game is over. */
  isStoppage: boolean;
  /** Where to frame stoppages (the center faceoff dot). */
  faceoff: Vec2;
}

/** What the debug overlay shows. */
export interface CameraDebugInfo {
  mode: CameraMode;
  focus: Vec2;
  zoom: number;
  targetZoom: number;
  spreadZoom: number;
  speedZoomOut: number;
  swapping: boolean;
  swapStyle: SwapStyle;
  stoppage: boolean;
}

/**
 * Works out where the rink camera looks and how far it's zoomed. Presentation only: it reads
 * drawn positions and never touches the simulation.
 *
 * - Focus: the controlled skater, leaned toward the puck (auto), followed by a damped spring, and
 *   kept inside the rink.
 * - Control swaps: the spring loosens for a moment so the camera glides over (or it cuts instantly),
 *   and the zoom target is held until the swap settles.
 * - Zoom (auto): fit the skater and puck (`spreadZoom`), minus a little for fast pucks, with a
 *   deadzone, eased out faster than in, and nearly frozen while charging a shot.
 * - Stoppages (auto): frame center ice at a fixed zoom, then ease back when play resumes.
 */
export class CameraController {
  public mode: CameraMode = 'auto';
  public swapStyle: SwapStyle = CAMERA_TUNING.swapStyle;
  private center: Vec2;
  private velocity: Vec2 = { x: 0, y: 0 };
  private zoom: number = CAMERA_TUNING.baseZoom;
  private targetZoom: number = CAMERA_TUNING.baseZoom;
  private lastSpreadZoom: number = CAMERA_TUNING.baseZoom;
  private lastSpeedZoomOut = 0;
  private lastStoppage = false;
  private lastControlledId: unknown;
  /** Seconds since a smooth control swap started, while it's still settling. */
  private swapElapsed?: number;
  /** Where the camera was, and how fast it was moving, when the current smooth swap started. */
  private swapFrom: Vec2 = { x: 0, y: 0 };
  private swapFromVelocity: Vec2 = { x: 0, y: 0 };

  constructor(
    start: Vec2,
    private readonly rink: { width: number; height: number },
    private readonly screen: { width: number; height: number },
  ) {
    this.center = this.clampToRink(start, this.zoom);
  }

  toggleMode(): void {
    this.mode = this.mode === 'auto' ? 'fixed' : 'auto';
  }

  toggleSwapStyle(): void {
    this.swapStyle = this.swapStyle === 'smooth' ? 'instant' : 'smooth';
  }

  /** The camera center (world) and zoom to use this frame. */
  update(inputs: CameraInputs): { center: Vec2; zoom: number } {
    const { deltaSeconds } = inputs;
    const stoppage = inputs.isStoppage && this.mode === 'auto';

    const swapped = this.trackControlSwap(inputs, stoppage);
    this.lastStoppage = stoppage;

    // Zoom first, so the focus can be kept inside the rink at the zoom we'll actually draw with.
    if (stoppage) {
      this.targetZoom = CAMERA_TUNING.stoppageZoom;
      this.zoom = ease(this.zoom, this.targetZoom, CAMERA_TUNING.stoppageZoomRate, deltaSeconds);
    } else if (this.mode === 'fixed') {
      this.targetZoom = CAMERA_TUNING.baseZoom;
      this.zoom = ease(this.zoom, this.targetZoom, CAMERA_TUNING.zoomOutRate, deltaSeconds);
    } else {
      this.updateAutoZoom(inputs);
    }

    const focusTarget = this.clampToRink(stoppage ? inputs.faceoff : this.getFocusTarget(inputs), this.zoom);

    if (swapped && this.swapStyle === 'instant') {
      this.center = focusTarget;
      this.velocity = { x: 0, y: 0 };
    } else {
      const chase = this.getSwapTarget(focusTarget, deltaSeconds);
      const smoothTime = CAMERA_TUNING.followSmoothTime;
      this.center = {
        x: this.springAxis('x', this.center.x, chase.x, smoothTime, deltaSeconds),
        y: this.springAxis('y', this.center.y, chase.y, smoothTime, deltaSeconds),
      };
    }

    this.center = this.clampToRink(this.center, this.zoom);

    return { center: { ...this.center }, zoom: this.zoom };
  }

  /** The part of the rink on screen this frame (world rect), for the off-screen puck marker. */
  getView(): { x: number; y: number; width: number; height: number } {
    const width = this.screen.width / this.zoom;
    const height = this.screen.height / this.zoom;

    return { x: this.center.x - width / 2, y: this.center.y - height / 2, width, height };
  }

  getDebugInfo(): CameraDebugInfo {
    return {
      mode: this.mode,
      focus: { ...this.center },
      zoom: this.zoom,
      targetZoom: this.targetZoom,
      spreadZoom: this.lastSpreadZoom,
      speedZoomOut: this.lastSpeedZoomOut,
      swapping: this.swapElapsed !== undefined,
      swapStyle: this.swapStyle,
      stoppage: this.lastStoppage,
    };
  }

  /**
   * Notices when the controlled skater changes (ignored during stoppages, which frame center ice).
   * A smooth swap starts settling; returns true on the frame of any swap.
   */
  private trackControlSwap(inputs: CameraInputs, stoppage: boolean): boolean {
    const swapped = this.lastControlledId !== undefined && inputs.controlledId !== this.lastControlledId;
    this.lastControlledId = inputs.controlledId;

    if (!swapped || stoppage) {
      return false;
    }

    this.swapElapsed = this.swapStyle === 'smooth' ? 0 : undefined;
    this.swapFrom = { ...this.center };
    this.swapFromVelocity = { ...this.velocity };

    return true;
  }

  /**
   * What the spring chases this frame. Normally the focus target; during a smooth swap, a blend
   * from where the camera was heading (its position at the swap, carried on at the speed it had) to
   * the new target, along a smootherstep curve, so the camera neither brakes nor kicks.
   */
  private getSwapTarget(focusTarget: Vec2, deltaSeconds: number): Vec2 {
    if (this.swapElapsed === undefined) {
      return focusTarget;
    }

    this.swapElapsed += deltaSeconds;
    const t = Math.min(this.swapElapsed / CAMERA_TUNING.swapGlideSeconds, 1);
    const eased = t * t * t * (t * (t * 6 - 15) + 10);
    const from = {
      x: this.swapFrom.x + this.swapFromVelocity.x * this.swapElapsed,
      y: this.swapFrom.y + this.swapFromVelocity.y * this.swapElapsed,
    };

    if (t >= 1) {
      this.swapElapsed = undefined;
    }

    return { x: from.x + (focusTarget.x - from.x) * eased, y: from.y + (focusTarget.y - from.y) * eased };
  }

  /**
   * One axis of a critically damped spring toward `target` (Unity-style SmoothDamp): smooth,
   * frame-rate independent, keeps velocity across target changes, never overshoots.
   */
  private springAxis(axis: 'x' | 'y', current: number, target: number, smoothTime: number, deltaSeconds: number): number {
    if (deltaSeconds <= 0) {
      return current;
    }

    const omega = 2 / smoothTime;
    const x = omega * deltaSeconds;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const maxChange = CAMERA_TUNING.maxCameraSpeed * smoothTime;
    const change = clamp(current - target, -maxChange, maxChange);
    const clampedTarget = current - change;
    const temp = (this.velocity[axis] + omega * change) * deltaSeconds;
    this.velocity[axis] = (this.velocity[axis] - omega * temp) * decay;
    let next = clampedTarget + (change + temp) * decay;

    // Never overshoot the real target.
    if (target - current > 0 === next > target) {
      next = target;
      this.velocity[axis] = 0;
    }

    return next;
  }

  private getFocusTarget(inputs: CameraInputs): Vec2 {
    const bias = this.mode === 'auto' ? CAMERA_TUNING.puckBias : 0;

    return {
      x: inputs.controlled.x + (inputs.puck.x - inputs.controlled.x) * bias,
      y: inputs.controlled.y + (inputs.puck.y - inputs.controlled.y) * bias,
    };
  }

  private updateAutoZoom(inputs: CameraInputs): void {
    const { deltaSeconds } = inputs;
    const tuning = CAMERA_TUNING;

    // Hold the zoom target steady while a swap settles: the swap itself shouldn't zoom.
    if (this.swapElapsed === undefined) {
      const focus = this.getFocusTarget(inputs);
      this.lastSpreadZoom = this.getSpreadZoom(inputs.controlled, inputs.puck, focus);
      const speedFraction = clamp(
        (inputs.puckSpeed - tuning.speedZoomStart) / (tuning.speedZoomFull - tuning.speedZoomStart),
        0,
        1,
      );
      this.lastSpeedZoomOut = speedFraction * tuning.speedZoomOut;
      const wanted = clamp(this.lastSpreadZoom - this.lastSpeedZoomOut, tuning.minZoom, tuning.maxZoom);

      if (Math.abs(wanted - this.targetZoom) > tuning.zoomDeadzone) {
        this.targetZoom = wanted;
      }
    }

    let rate = this.targetZoom < this.zoom ? tuning.zoomOutRate : tuning.zoomInRate;

    if (inputs.isChargingShot) {
      rate *= tuning.chargingZoomRateScale;
    }

    this.zoom = ease(this.zoom, this.targetZoom, rate, deltaSeconds);
  }

  /**
   * The closest zoom (up to `maxZoom`) that shows both the skater and the puck, with a margin, when
   * the camera centers on `focus`; never below `spreadZoomFloor`.
   */
  private getSpreadZoom(skater: Vec2, puck: Vec2, focus: Vec2): number {
    const margin = CAMERA_TUNING.spreadMargin;
    const halfWidth = Math.max(Math.abs(skater.x - focus.x), Math.abs(puck.x - focus.x)) + margin;
    const halfHeight = Math.max(Math.abs(skater.y - focus.y), Math.abs(puck.y - focus.y)) + margin;
    const fit = Math.min(this.screen.width / (2 * halfWidth), this.screen.height / (2 * halfHeight));

    return clamp(fit, CAMERA_TUNING.spreadZoomFloor, CAMERA_TUNING.maxZoom);
  }

  /** Keeps the view inside the rink image at `zoom` (centers it if the view is bigger than the rink). */
  private clampToRink(point: Vec2, zoom: number): Vec2 {
    const halfWidth = this.screen.width / zoom / 2;
    const halfHeight = this.screen.height / zoom / 2;
    const clampAxis = (value: number, half: number, size: number) =>
      half * 2 >= size ? size / 2 : clamp(value, half, size - half);

    return {
      x: clampAxis(point.x, halfWidth, this.rink.width),
      y: clampAxis(point.y, halfHeight, this.rink.height),
    };
  }
}

/** Frame-rate independent exponential smoothing toward `target`. */
function ease(current: number, target: number, rate: number, deltaSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
