// Device-orientation look for supported mobile devices. Pure math + a tiny stateful
// tracker; no THREE, no DOM, so the node tests can import it directly.

const DEG = Math.PI / 180;

export function gyroSupported(win = globalThis) {
  if (!win || !('DeviceOrientationEvent' in win)) return false;
  // Desktop Chrome ships the constructor without a sensor, so require a coarse pointer too.
  return !!win.matchMedia?.('(pointer: coarse)')?.matches;
}

export function wrapAngle(angle) {
  let a = (angle + Math.PI) % (Math.PI * 2);
  if (a <= 0) a += Math.PI * 2;
  return a - Math.PI;
}

function quatFromYXZ(x, y, z) {
  const c1 = Math.cos(x / 2), s1 = Math.sin(x / 2);
  const c2 = Math.cos(y / 2), s2 = Math.sin(y / 2);
  const c3 = Math.cos(z / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}

function mul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

// Standard DeviceOrientation -> world quaternion, read back as a YXZ euler.
// ponytail: roll (euler.z) is discarded on purpose — handheld roll is what makes gyro
// views feel seasick, and the camera already treats yaw/pitch as authoritative. Dropping
// it also makes the usual screen-orientation term redundant: that correction is a pure
// rotation about the view axis, i.e. roll, so portrait and landscape holds of the same
// physical pose already resolve to the same yaw/pitch (see tests/solar-gyro.test.mjs).
export function orientationToYawPitch(reading) {
  // Sensor readings are null before the first fix and can be absent entirely.
  const num = (v) => (Number.isFinite(v) ? v * DEG : 0);
  const alpha = num(reading?.alpha);
  const beta = num(reading?.beta);
  const gamma = num(reading?.gamma);

  let q = quatFromYXZ(beta, alpha, -gamma);          // device orientation, YXZ per the spec
  q = mul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);   // device -> world (-90deg about X)

  const [x, y, z, w] = q;
  // YXZ euler extraction
  const m13 = 2 * (x * z + y * w);
  const m23 = 2 * (y * z - x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const m31 = 2 * (x * z - y * w);
  const m11 = 1 - 2 * (y * y + z * z);

  const pitch = Math.asin(Math.min(1, Math.max(-1, -m23)));
  const yaw = Math.abs(m23) < 0.9999999 ? Math.atan2(m13, m33) : Math.atan2(-m31, m11);
  return { yaw, pitch };
}

export function createGyroTracker() {
  const base = { yaw: 0, pitch: 0 };
  const offset = { yaw: 0, pitch: 0 };
  const target = { yaw: 0, pitch: 0 };
  let samples = 0;

  return {
    target,
    get samples() { return samples; },
    // First reading becomes the rest pose, so switching the feature on never snaps the view.
    feed(reading) {
      const { yaw, pitch } = orientationToYawPitch(reading);
      if (samples === 0) { base.yaw = yaw; base.pitch = pitch; }
      samples += 1;
      target.yaw = wrapAngle(yaw - base.yaw + offset.yaw);
      target.pitch = pitch - base.pitch + offset.pitch;
      return target;
    },
    // A finger drag re-aims the rest pose instead of fighting the sensor.
    nudge(dYaw, dPitch) {
      offset.yaw += dYaw;
      offset.pitch += dPitch;
      target.yaw = wrapAngle(target.yaw + dYaw);
      target.pitch += dPitch;
      return target;
    },
  };
}
