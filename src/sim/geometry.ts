export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RoundedRect extends Rect {
  cornerRadius: number;
}

/** A circle-shaped body that can be pushed out of walls. */
export interface CircleBody {
  position: Vec2;
  velocity: Vec2;
  radius: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Keeps a circle inside a rounded rectangle (the boards). Returns true if it hit the wall. */
export function containInRoundedRect(body: CircleBody, area: RoundedRect, restitution: number): boolean {
  const { position, radius } = body;
  const r = area.cornerRadius;

  // Nearest point on the rectangle shrunk by the corner radius. Along straight boards this is
  // directly beside the body; in a corner it is the corner's center.
  const anchorX = clamp(position.x, area.left + r, area.right - r);
  const anchorY = clamp(position.y, area.top + r, area.bottom - r);
  const dx = position.x - anchorX;
  const dy = position.y - anchorY;
  const distance = Math.hypot(dx, dy);
  const maxDistance = r - radius;

  if (distance <= maxDistance || distance === 0) {
    return false;
  }

  const normal = { x: dx / distance, y: dy / distance };
  position.x = anchorX + normal.x * maxDistance;
  position.y = anchorY + normal.y * maxDistance;
  bounceOff(body, normal, restitution);
  return true;
}

/** Pushes a circle out of a solid rectangle (a net). Returns true if they overlapped. */
export function pushOutOfRect(body: CircleBody, rect: Rect, restitution: number): boolean {
  const { position, radius } = body;
  const closestX = clamp(position.x, rect.left, rect.right);
  const closestY = clamp(position.y, rect.top, rect.bottom);
  const dx = position.x - closestX;
  const dy = position.y - closestY;
  const distance = Math.hypot(dx, dy);

  if (distance >= radius) {
    return false;
  }

  let normal: Vec2;

  if (distance > 0) {
    normal = { x: dx / distance, y: dy / distance };
    position.x = closestX + normal.x * radius;
    position.y = closestY + normal.y * radius;
  } else {
    // Center is inside the rectangle: leave through the nearest side.
    const exits = [
      { depth: position.x - rect.left, normal: { x: -1, y: 0 } },
      { depth: rect.right - position.x, normal: { x: 1, y: 0 } },
      { depth: position.y - rect.top, normal: { x: 0, y: -1 } },
      { depth: rect.bottom - position.y, normal: { x: 0, y: 1 } },
    ];
    const exit = exits.reduce((best, candidate) => (candidate.depth < best.depth ? candidate : best));
    normal = exit.normal;
    position.x += normal.x * (exit.depth + radius);
    position.y += normal.y * (exit.depth + radius);
  }

  // The normal points away from the rect, so moving into it means a negative dot product.
  bounceOff(body, { x: -normal.x, y: -normal.y }, restitution);
  return true;
}

/** A range of directions: `offset` radians from some reference direction, plus or minus `halfAngle`. */
export interface Arc {
  offset: number;
  halfAngle: number;
}

/**
 * Rotates unit vector `direction` as little as possible so it lies inside one of `arcs`, each
 * measured from unit vector `reference`. Directions already inside an arc are unchanged.
 */
export function clampDirectionToArcs(direction: Vec2, reference: Vec2, arcs: Arc[]): Vec2 {
  const referenceAngle = Math.atan2(reference.y, reference.x);
  const angle = Math.atan2(direction.y, direction.x);
  let best = { angle, rotation: Infinity };

  for (const arc of arcs) {
    const arcCenter = referenceAngle + arc.offset;
    const fromCenter = wrapAngle(angle - arcCenter);
    const clamped = arcCenter + clamp(fromCenter, -arc.halfAngle, arc.halfAngle);
    const rotation = Math.abs(wrapAngle(angle - clamped));

    if (rotation < best.rotation) {
      best = { angle: clamped, rotation };
    }
  }

  return { x: Math.cos(best.angle), y: Math.sin(best.angle) };
}

/** Wraps an angle into -PI..PI. */
export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * How far (0..1) a circle of `radius` can travel from `from` to `to` before touching `rect`, or
 * undefined if the path is clear. Returns 0 if it already overlaps at the start.
 */
export function sweepCircleIntoRect(from: Vec2, to: Vec2, radius: number, rect: Rect): number | undefined {
  // Moving a circle against a rect is the same as moving a point against the rect grown by the radius.
  const slabs = [
    { start: from.x, delta: to.x - from.x, min: rect.left - radius, max: rect.right + radius },
    { start: from.y, delta: to.y - from.y, min: rect.top - radius, max: rect.bottom + radius },
  ];
  let entry = 0;
  let exit = 1;

  for (const { start, delta, min, max } of slabs) {
    if (delta === 0) {
      if (start < min || start > max) {
        return undefined;
      }

      continue;
    }

    const a = (min - start) / delta;
    const b = (max - start) / delta;
    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));

    if (entry > exit) {
      return undefined;
    }
  }

  return entry;
}

/** Reflects the part of the velocity heading along `wallNormal` (pointing into the wall). */
function bounceOff(body: CircleBody, wallNormal: Vec2, restitution: number): void {
  const intoWall = body.velocity.x * wallNormal.x + body.velocity.y * wallNormal.y;

  if (intoWall <= 0) {
    return;
  }

  body.velocity.x -= (1 + restitution) * intoWall * wallNormal.x;
  body.velocity.y -= (1 + restitution) * intoWall * wallNormal.y;
}
