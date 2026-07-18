import styles from './big-bang.css?inline';
import { createBigBangRuntime } from './runtime.js';
import { bigBangTemplate } from './template.js';

export function mount({ root, navigate }) {
  root.innerHTML = `<style data-route-style="big-bang">${styles}</style>${bigBangTemplate()}`;
  let runtime;
  try {
    runtime = createBigBangRuntime({ root, navigate });
  } catch (error) {
    root.replaceChildren();
    throw error;
  }

  let destroyed = false;
  return {
    pause: runtime.pause,
    resume: runtime.resume,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      runtime.destroy();
      root.replaceChildren();
    },
  };
}
