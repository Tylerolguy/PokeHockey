import type { SkaterTuning } from './Skater';

/**
 * Shot power (0..1) after holding shoot for `chargeSeconds`: read off the skater's power curve,
 * blending straight between its points and holding the end values beyond them.
 */
export function getShotPower(tuning: SkaterTuning, chargeSeconds: number): number {
  const curve = tuning.shotPowerCurve;

  if (chargeSeconds <= curve[0].seconds) {
    return curve[0].power;
  }

  for (let i = 1; i < curve.length; i++) {
    const from = curve[i - 1];
    const to = curve[i];

    if (chargeSeconds <= to.seconds) {
      const t = (chargeSeconds - from.seconds) / (to.seconds - from.seconds);

      return from.power + (to.power - from.power) * t;
    }
  }

  return curve[curve.length - 1].power;
}

/** Speed (px/s) of a shot released after charging for `chargeSeconds`. */
export function getShotSpeed(tuning: SkaterTuning, chargeSeconds: number): number {
  return tuning.shotPeakSpeed * getShotPower(tuning, chargeSeconds);
}

/** True once a charge has been held long enough to whiff. */
export function isWhiff(tuning: SkaterTuning, chargeSeconds: number): boolean {
  return chargeSeconds >= tuning.shotWhiffSeconds;
}
