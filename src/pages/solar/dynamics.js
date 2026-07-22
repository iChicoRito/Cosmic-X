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

export function wormholeTransit(
  previous,
  current,
  velocity,
  throatRadius,
  exitDistance,
  velocityMultiplier,
) {
  const radius = Number(throatRadius);
  const exit = Number(exitDistance);
  const boost = Number(velocityMultiplier);
  if (!(radius > 0) || !(exit > radius) || !(boost > 0)) return null;

  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const dz = current.z - previous.z;
  const segmentLengthSquared = dx * dx + dy * dy + dz * dz;
  const closestT = segmentLengthSquared > 1e-12
    ? Math.max(0, Math.min(1, -(previous.x * dx + previous.y * dy + previous.z * dz) / segmentLengthSquared))
    : 0;
  const closestX = previous.x + dx * closestT;
  const closestY = previous.y + dy * closestT;
  const closestZ = previous.z + dz * closestT;
  if (closestX * closestX + closestY * closestY + closestZ * closestZ > radius * radius) return null;

  const previousLength = Math.hypot(previous.x, previous.y, previous.z);
  const velocityLength = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (previousLength <= 1e-8 && velocityLength <= 1e-8) return null;

  const direction = previousLength > 1e-8
    ? { x: -previous.x / previousLength, y: -previous.y / previousLength, z: -previous.z / previousLength }
    : { x: velocity.x / velocityLength, y: velocity.y / velocityLength, z: velocity.z / velocityLength };
  const clean = value => Object.is(value, -0) ? 0 : value;
  return {
    position: {
      x: clean(direction.x * exit),
      y: clean(direction.y * exit),
      z: clean(direction.z * exit),
    },
    velocity: {
      x: clean(velocity.x * boost),
      y: clean(velocity.y * boost),
      z: clean(velocity.z * boost),
    },
  };
}
