// Linear closest-point-of-approach math in scene units and simulated days.
// This stays independent of Three.js so warning boundaries remain directly testable.
export function closestApproach(bodyState, targetState, horizonDays = 120) {
  const rx = bodyState.position.x - targetState.position.x;
  const ry = bodyState.position.y - targetState.position.y;
  const rz = bodyState.position.z - targetState.position.z;
  const vx = bodyState.velocity.x - targetState.velocity.x;
  const vy = bodyState.velocity.y - targetState.velocity.y;
  const vz = bodyState.velocity.z - targetState.velocity.z;
  const radialSpeed = rx * vx + ry * vy + rz * vz;
  const speedSquared = vx * vx + vy * vy + vz * vz;
  if (radialSpeed >= 0 || speedSquared < 1e-8) return null;

  const closestTime = Math.max(0, Math.min(horizonDays, -radialSpeed / speedSquared));
  const cx = rx + vx * closestTime;
  const cy = ry + vy * closestTime;
  const cz = rz + vz * closestTime;
  const distanceSquared = cx * cx + cy * cy + cz * cz;
  const collisionRadius = bodyState.radius + targetState.radius + 1.25;
  if (distanceSquared > collisionRadius * collisionRadius) return null;

  const initialDistanceSquared = rx * rx + ry * ry + rz * rz;
  const discriminant = radialSpeed * radialSpeed
    - speedSquared * (initialDistanceSquared - collisionRadius * collisionRadius);
  if (discriminant < 0) return null;
  const eta = Math.max(0, (-radialSpeed - Math.sqrt(discriminant)) / speedSquared);
  if (eta > horizonDays) return null;
  return { eta, distance: Math.sqrt(distanceSquared), closestTime };
}
