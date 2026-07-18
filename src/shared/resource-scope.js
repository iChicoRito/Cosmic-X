export function createResourceScope(host = globalThis) {
  const controller = new AbortController();
  const frames = new Set();
  const timeouts = new Set();
  const intervals = new Set();
  const observers = new Set();
  let generation = 0;
  let destroyed = false;

  const requestFrame = callback => {
    if (destroyed) return 0;
    let id;
    id = host.requestAnimationFrame(time => {
      frames.delete(id);
      if (!destroyed) callback(time);
    });
    frames.add(id);
    return id;
  };

  const cancelFrame = id => {
    frames.delete(id);
    host.cancelAnimationFrame(id);
  };

  const setTimer = (callback, delay, ...args) => {
    if (destroyed) return 0;
    let id;
    id = host.setTimeout(() => {
      timeouts.delete(id);
      if (!destroyed) callback(...args);
    }, delay);
    timeouts.add(id);
    return id;
  };

  const clearTimer = id => {
    timeouts.delete(id);
    host.clearTimeout(id);
  };

  const setRepeating = (callback, delay, ...args) => {
    if (destroyed) return 0;
    const id = host.setInterval(() => {
      if (!destroyed) callback(...args);
    }, delay);
    intervals.add(id);
    return id;
  };

  const clearRepeating = id => {
    intervals.delete(id);
    host.clearInterval(id);
  };

  return {
    signal: controller.signal,
    get destroyed() { return destroyed; },
    listen(target, type, listener, options = {}) {
      const normalized = typeof options === 'boolean'
        ? { capture: options, signal: controller.signal }
        : { ...options, signal: controller.signal };
      target.addEventListener(type, listener, normalized);
      return listener;
    },
    requestAnimationFrame: requestFrame,
    cancelAnimationFrame: cancelFrame,
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    setInterval: setRepeating,
    clearInterval: clearRepeating,
    observe(observer) {
      observers.add(observer);
      return observer;
    },
    guard(callback) {
      const token = generation;
      return (...args) => destroyed || token !== generation ? undefined : callback(...args);
    },
    invalidate() {
      generation++;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      controller.abort();
      for (const id of frames) host.cancelAnimationFrame(id);
      for (const id of timeouts) host.clearTimeout(id);
      for (const id of intervals) host.clearInterval(id);
      for (const observer of observers) observer.disconnect();
      frames.clear();
      timeouts.clear();
      intervals.clear();
      observers.clear();
    },
  };
}
