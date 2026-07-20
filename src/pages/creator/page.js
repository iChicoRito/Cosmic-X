import styles from './creator.css?inline';
import { createCreatorRuntime } from './runtime.js';
import { creatorTemplate } from './template.js';

export function mount({ root, navigate }) {
  root.innerHTML = `<style data-route-style="creator">${styles}</style>${creatorTemplate()}`;
  let runtime;
  try {
    runtime = createCreatorRuntime({ root, navigate });
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
