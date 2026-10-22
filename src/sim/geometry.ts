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

/**
 * Separates two overlapping circles, treating `heavy` as immovable: `light` is pushed out and
 * bounces off `heavy`'s velocity. Returns the unit normal from heavy to light, or undefined if apart.
 */
export function resolveCircleHit(heavy: CircleBody, light: CircleBody, restitution: number): Vec2 | undefined {
  const dx = light.position.x - heavy.position.x;
  const dy = light.position.y - heavy.position.y;
  const minDistance = heavy.radius + light.radius;
  const distance = Math.hypot(dx, dy);

  if (distance >= minDistance) {
    return undefined;
  }

  // Exactly on top of each other: pick any direction.
  const normal = distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
  light.position.x = heavy.position.x + normal.x * minDistance;
  light.position.y = heavy.position.y + normal.y * minDistance;

  const closingSpeed =
    (light.velocity.x - heavy.velocity.x) * normal.x + (light.velocity.y - heavy.velocity.y) * normal.y;

  if (closingSpeed < 0) {
    light.velocity.x -= (1 + restitution) * closingSpeed * normal.x;
    light.velocity.y -= (1 + restitution) * closingSpeed * normal.y;
  }

  return normal;
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
